import { allowedHostsFromEnv, createAdapter } from "@agentpay/adapters";
import type { AgentPayStore } from "@agentpay/db";
import { PaymentService } from "@agentpay/payments";
import {
  type AdapterInput,
  type AdapterResult,
  type AdapterType,
  type AgentDecision,
  type AgentRun,
  type Citation,
  type PaymentEvent,
  type PaymentPolicySummary,
  type Provider,
  type Resource,
  cacheKeyFor,
  clampScore,
  createId,
  jsonHash,
  nowIso,
  roundUsdc
} from "@agentpay/shared";

export interface RunAgentInput {
  prompt: string;
  budgetUsdc: number;
  store: AgentPayStore;
  allowedResourceIds?: string[];
  allowedAdapterTypes?: AdapterType[];
  allowedHosts?: string[];
  minScore?: number;
  policy?: PaymentPolicyInput;
  executePaidResource?: (input: PaidResourceExecutionInput) => Promise<PaidResourceExecutionResult>;
  onEvent?: (event: AgentRunEvent) => void | Promise<void>;
}

export type CacheMode = "reuse" | "refresh" | "ignore";

export interface PaymentPolicyInput {
  maxSpendUsdc?: number;
  maxPricePerCallUsdc?: number;
  allowedAccessClasses?: Resource["accessClass"][];
  trustedProviderIds?: string[];
  requireCitations?: boolean;
  cacheMode?: CacheMode;
  minScore?: number;
}

export interface NormalizedPaymentPolicy {
  maxSpendUsdc: number;
  maxPricePerCallUsdc?: number;
  allowedAccessClasses?: Set<Resource["accessClass"]>;
  trustedProviderIds?: Set<string>;
  requireCitations: boolean;
  cacheMode: CacheMode;
  minScore: number;
}

export interface AgentRunEvent {
  type:
    | "run_started"
    | "resources_loaded"
    | "policy_loaded"
    | "resource_scored"
    | "cache_hit"
    | "resource_skipped"
    | "payment_started"
    | "payment_recorded"
    | "adapter_completed"
    | "adapter_failed"
    | "run_completed";
  message: string;
  resourceId?: string;
  adapterType?: AdapterType;
  paymentIdentifier?: string;
  amountUsdc?: number;
}

export interface PaidResourceExecutionInput {
  runId: string;
  resource: Resource;
  provider: Provider;
  config: Record<string, unknown>;
  payload: Record<string, unknown>;
  prompt: string;
  cacheKey: string;
  score: number;
}

export interface PaidResourceExecutionResult {
  payment: PaymentEvent;
  result: AdapterResult;
  verification?: Record<string, unknown>;
}

export interface ResourceScore {
  resourceId: string;
  score: number;
  costFit: number;
  expectedValue: number;
  freshnessScore: number;
  confidenceScore: number;
  cacheBoost: number;
  semanticFit: number;
  reason: string;
}

export function scoreResource(input: {
  priceUsdc: number;
  budgetRemainingUsdc: number;
  expectedValue: number;
  freshnessScore: number;
  confidenceScore: number;
  cacheHit: boolean;
}): ResourceScore {
  const costFit =
    input.priceUsdc <= 0
      ? 1
      : clampScore(1 - input.priceUsdc / Math.max(input.budgetRemainingUsdc, input.priceUsdc));
  const cacheBoost = input.cacheHit ? 0.18 : 0;
  const score = clampScore(
    input.expectedValue * 0.36 + input.freshnessScore * 0.24 + input.confidenceScore * 0.24 + costFit * 0.16 + cacheBoost
  );
  return {
    resourceId: "",
    score,
    costFit,
    expectedValue: input.expectedValue,
    freshnessScore: input.freshnessScore,
    confidenceScore: input.confidenceScore,
    cacheBoost,
    semanticFit: 0,
    reason: input.cacheHit
      ? "Cache hit: reuse paid artifact without another payment."
      : `Value ${input.expectedValue.toFixed(2)}, freshness ${input.freshnessScore.toFixed(2)}, confidence ${input.confidenceScore.toFixed(2)}, cost fit ${costFit.toFixed(2)}.`
  };
}

export async function runAgent(input: RunAgentInput): Promise<AgentRun> {
  const paymentService = new PaymentService(input.store);
  const allowedHosts = input.allowedHosts ?? allowedHostsFromEnv();
  const policy = normalizePaymentPolicy(input);
  const minScore = policy.minScore;
  const run = input.store.createRun({
    prompt: input.prompt,
    budgetUsdc: policy.maxSpendUsdc
  });
  run.status = "running";
  input.store.updateRun(run);
  await emit(input, {
    type: "run_started",
    message: `run ${run.id} started with ${policy.maxSpendUsdc.toFixed(6)} USDC policy budget`
  });
  await emit(input, {
    type: "policy_loaded",
    message: policySummary(policy)
  });

  const resources = input.store
    .listResources()
    .filter((resource) => !input.allowedResourceIds || input.allowedResourceIds.includes(resource.id))
    .filter((resource) => !input.allowedAdapterTypes || input.allowedAdapterTypes.includes(resource.adapterType))
    .filter((resource) => !policy.allowedAccessClasses || policy.allowedAccessClasses.has(resource.accessClass))
    .filter((resource) => !policy.trustedProviderIds || policy.trustedProviderIds.has(resource.providerId));
  await emit(input, {
    type: "resources_loaded",
    message: `${resources.length} eligible paid resources loaded`
  });

  let budgetRemaining = policy.maxSpendUsdc;
  const payments: PaymentEvent[] = [];
  const adapterResults: AdapterResult[] = [];
  const paidCitations: Citation[] = [];
  const skippedSources: Array<{ resourceId: string; reason: string }> = [];
  const decisions: AgentDecision[] = [];

  for (const resource of resources) {
    const provider = input.store.getProvider(resource.providerId);
    if (!provider) {
      skippedSources.push({ resourceId: resource.id, reason: "Skipped: provider wallet is not configured." });
      continue;
    }

    const adapter = createAdapter(resource.adapterType);
    const config = input.store.getAdapterConfig(resource.id)?.config ?? {};
    const payload = payloadForAdapter(resource.adapterType, input.prompt, config);
    const cacheKey = cacheKeyFor(resource.id, payload);
    const cached = policy.cacheMode === "reuse" ? input.store.getCachedArtifact(resource.id, cacheKey) : undefined;
    const dynamicSignals = deriveResourceSignals({
      prompt: input.prompt,
      resource,
      provider,
      config,
      cacheHit: Boolean(cached)
    });
    const score = {
      ...scoreResource({
        priceUsdc: resource.priceUsdc,
        budgetRemainingUsdc: budgetRemaining,
        expectedValue: dynamicSignals.expectedValue,
        freshnessScore: dynamicSignals.freshnessScore,
        confidenceScore: dynamicSignals.confidenceScore,
        cacheHit: Boolean(cached)
      }),
      resourceId: resource.id,
      semanticFit: dynamicSignals.semanticFit,
      reason: dynamicSignals.reason
    };
    await emit(input, {
      type: "resource_scored",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      message: `${resource.name} scored ${score.score.toFixed(2)}`
    });

    if (cached) {
      const decision = recordDecision(input.store, run.id, resource.id, "cache", score.score, score.reason);
      decisions.push(decision);
      adapterResults.push(cached.artifact);
      paidCitations.push(...cached.artifact.citations);
      await emit(input, {
        type: "cache_hit",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: `cache hit for ${resource.name}; no new payment needed`
      });
      continue;
    }

    if (policy.requireCitations && !resourceSupportsCitations(resource)) {
      const reason = `Skipped by policy: citations are required and ${resource.name} does not advertise citation receipts.`;
      const decision = recordDecision(input.store, run.id, resource.id, "skip", score.score, reason);
      decisions.push(decision);
      skippedSources.push({ resourceId: resource.id, reason });
      await emit(input, {
        type: "resource_skipped",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: reason
      });
      continue;
    }

    if (policy.maxPricePerCallUsdc !== undefined && resource.priceUsdc > policy.maxPricePerCallUsdc) {
      const reason = `Skipped by policy: price ${resource.priceUsdc.toFixed(6)} exceeds max price per call ${policy.maxPricePerCallUsdc.toFixed(6)}.`;
      const decision = recordDecision(input.store, run.id, resource.id, "skip", score.score, reason);
      decisions.push(decision);
      skippedSources.push({ resourceId: resource.id, reason });
      await emit(input, {
        type: "resource_skipped",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: reason
      });
      continue;
    }

    if (resource.priceUsdc > budgetRemaining) {
      const reason = `Skipped: price ${resource.priceUsdc.toFixed(6)} exceeds remaining budget ${budgetRemaining.toFixed(6)}.`;
      const decision = recordDecision(input.store, run.id, resource.id, "skip", score.score, reason);
      decisions.push(decision);
      skippedSources.push({ resourceId: resource.id, reason });
      await emit(input, {
        type: "resource_skipped",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: reason
      });
      continue;
    }

    if (score.score < minScore) {
      const reason = `Skipped: score ${score.score.toFixed(2)} is below threshold ${minScore.toFixed(2)}.`;
      const decision = recordDecision(input.store, run.id, resource.id, "skip", score.score, reason);
      decisions.push(decision);
      skippedSources.push({ resourceId: resource.id, reason });
      await emit(input, {
        type: "resource_skipped",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: reason
      });
      continue;
    }

    const decision = recordDecision(input.store, run.id, resource.id, "pay", score.score, score.reason);
    decisions.push(decision);
    await emit(input, {
      type: "payment_started",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      message: `paying ${resource.priceUsdc.toFixed(6)} USDC for ${resource.name}`
    });
    if (!input.executePaidResource && paymentService.requiresServerSettlement()) {
      throw new Error("x402 agent runs require the paid-resource executor so settlement is verified before paid access fulfillment.");
    }
    const paidExecution = input.executePaidResource
      ? await input.executePaidResource({
          runId: run.id,
          resource,
          provider,
          config,
          payload,
          prompt: input.prompt,
          cacheKey,
          score: score.score
        })
      : undefined;
    const recordedPayment =
      paidExecution?.payment ??
      paymentService.payForResource({
        resource,
        provider,
        metadata: {
          runId: run.id,
          score: score.score,
          cacheKey,
          promptHash: jsonHash(input.prompt)
        }
      });
    const payment = recordedPayment;
    payments.push(payment);
    await emit(input, {
      type: "payment_recorded",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: payment.amountUsdc,
      paymentIdentifier: payment.paymentIdentifier,
      message: `payment recorded: ${payment.paymentIdentifier}`
    });
    budgetRemaining = roundUsdc(budgetRemaining - resource.priceUsdc);

    const quote = await adapter.quote({
      resource,
      config,
      payload,
      prompt: input.prompt,
      cacheKey
    });
    try {
      const result =
        paidExecution?.result ??
        (await adapter.execute(
          {
            resource,
            config,
            payload,
            prompt: input.prompt,
            cacheKey
          } satisfies AdapterInput,
          {
            runId: run.id,
            resource,
            quote,
            payment,
            provider,
            now: nowIso(),
            allowedHosts
          }
        ));
      adapterResults.push(result);
      paidCitations.push(...result.citations);
      input.store.setCachedArtifact({
        id: createId("cache"),
        resourceId: resource.id,
        cacheKey,
        contentHash: jsonHash(result.data),
        artifact: result,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        createdAt: nowIso()
      });
      if (!paidExecution) {
        input.store.addReceipt({
          id: createId("rcpt"),
          paymentEventId: payment.id,
          resourceId: resource.id,
          receipt: {
            resourceId: resource.id,
            adapterType: resource.adapterType,
            paymentIdentifier: payment.paymentIdentifier,
            amountUsdc: payment.amountUsdc,
            status: payment.status,
            citations: result.citations
          },
          createdAt: nowIso()
        });
      }
      input.store.addStep({
        id: createId("step"),
        runId: run.id,
        resourceId: resource.id,
        stepType: "adapter_execute",
        status: "ok",
        input: { adapterType: resource.adapterType, cacheKey },
        output: { status: result.status, citationCount: result.citations.length },
        createdAt: nowIso()
      });
      await emit(input, {
        type: "adapter_completed",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message: `${resource.name} access fulfilled with ${result.status}`
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown adapter error";
      adapterResults.push({
        adapterType: resource.adapterType,
        resourceId: resource.id,
        status: "error",
        data: { error: message },
        citations: [],
        metadata: { cacheKey, failedAt: nowIso() }
      });
      input.store.addStep({
        id: createId("step"),
        runId: run.id,
        resourceId: resource.id,
        stepType: "adapter_execute",
        status: "error",
        input: { adapterType: resource.adapterType, cacheKey },
        output: { error: message },
        createdAt: nowIso()
      });
      await emit(input, {
        type: "adapter_failed",
        resourceId: resource.id,
        adapterType: resource.adapterType,
        message
      });
    }
  }

  const totalSpendUsdc = roundUsdc(payments.reduce((sum, payment) => sum + payment.amountUsdc, 0));
  run.status = "completed";
  run.totalSpendUsdc = totalSpendUsdc;
  run.completedAt = nowIso();
  run.output = {
    answer: buildAnswer({
      prompt: input.prompt,
      adapterResults,
      payments,
      skippedSources,
      decisions,
      resources,
      budgetUsdc: input.budgetUsdc,
      totalSpendUsdc,
      policy
    }),
    policy: policyOutput(policy),
    paidCitations,
    skippedSources,
    payments,
    decisions,
    budgetEfficiency: policy.maxSpendUsdc > 0 ? roundUsdc((policy.maxSpendUsdc - totalSpendUsdc) / policy.maxSpendUsdc) : 0,
    adapterResults
  };
  input.store.updateRun(run);
  await emit(input, {
    type: "run_completed",
    message: `run ${run.id} completed; spent ${totalSpendUsdc.toFixed(6)} USDC`
  });
  return run;
}

async function emit(input: RunAgentInput, event: AgentRunEvent) {
  await input.onEvent?.(event);
}

function normalizePaymentPolicy(input: RunAgentInput): NormalizedPaymentPolicy {
  const requestedMaxSpend = input.policy?.maxSpendUsdc;
  const maxSpendUsdc =
    typeof requestedMaxSpend === "number" && Number.isFinite(requestedMaxSpend) && requestedMaxSpend > 0
      ? Math.min(input.budgetUsdc, requestedMaxSpend)
      : input.budgetUsdc;
  const maxPricePerCallUsdc = input.policy?.maxPricePerCallUsdc;
  return {
    maxSpendUsdc,
    ...(typeof maxPricePerCallUsdc === "number" && Number.isFinite(maxPricePerCallUsdc) && maxPricePerCallUsdc > 0
      ? { maxPricePerCallUsdc }
      : {}),
    ...(input.policy?.allowedAccessClasses?.length
      ? { allowedAccessClasses: new Set(input.policy.allowedAccessClasses) }
      : {}),
    ...(input.policy?.trustedProviderIds?.length ? { trustedProviderIds: new Set(input.policy.trustedProviderIds) } : {}),
    requireCitations: input.policy?.requireCitations === true,
    cacheMode: input.policy?.cacheMode ?? "reuse",
    minScore: input.policy?.minScore ?? input.minScore ?? 0.58
  };
}

function policySummary(policy: NormalizedPaymentPolicy) {
  const parts = [
    `policy max spend ${policy.maxSpendUsdc.toFixed(6)} USDC`,
    `min score ${policy.minScore.toFixed(2)}`,
    `cache ${policy.cacheMode}`
  ];
  if (policy.maxPricePerCallUsdc !== undefined) {
    parts.push(`max price/call ${policy.maxPricePerCallUsdc.toFixed(6)} USDC`);
  }
  if (policy.allowedAccessClasses) parts.push(`classes ${[...policy.allowedAccessClasses].join(",")}`);
  if (policy.trustedProviderIds) parts.push(`trusted providers ${policy.trustedProviderIds.size}`);
  if (policy.requireCitations) parts.push("citations required");
  return parts.join("; ");
}

function policyOutput(policy: NormalizedPaymentPolicy): PaymentPolicySummary {
  return {
    maxSpendUsdc: policy.maxSpendUsdc,
    ...(policy.maxPricePerCallUsdc !== undefined ? { maxPricePerCallUsdc: policy.maxPricePerCallUsdc } : {}),
    allowedAccessClasses: policy.allowedAccessClasses ? [...policy.allowedAccessClasses] : [],
    trustedProviderCount: policy.trustedProviderIds?.size ?? 0,
    requireCitations: policy.requireCitations,
    cacheMode: policy.cacheMode,
    minScore: policy.minScore
  };
}

function resourceSupportsCitations(resource: Resource) {
  return resource.accessClass === "publisher_content" || resource.accessClass === "mcp_tool";
}

function recordDecision(
  store: AgentPayStore,
  runId: string,
  resourceId: string,
  decision: AgentDecision["decision"],
  score: number,
  reason: string
): AgentDecision {
  return store.addDecision({
    id: createId("decision"),
    runId,
    resourceId,
    decision,
    score: roundUsdc(score),
    reason,
    createdAt: nowIso()
  });
}

function payloadForAdapter(adapterType: AdapterType, prompt: string, config: Record<string, unknown>): Record<string, unknown> {
  switch (adapterType) {
    case "mcp":
      return {
        toolName: prompt.toLowerCase().includes("status") ? "paid_access_status" : "paid_source_fetch",
        sourceUrl: typeof config.sourceUrl === "string" ? config.sourceUrl : "https://docs.x402.org/"
      };
    case "agent_delegation":
      return { prompt, task: "delegate_specialist_research" };
    case "inference":
      return { prompt };
    case "rss_paywall":
      return { feedUrl: "https://www.arc.network/blog/rss.xml" };
    case "api_proxy":
      return { prompt };
    default:
      return { prompt };
  }
}

function deriveResourceSignals(input: {
  prompt: string;
  resource: Resource;
  provider: Provider;
  config: Record<string, unknown>;
  cacheHit: boolean;
}) {
  const promptTerms = tokenize(input.prompt);
  const resourceText = [
    input.resource.name,
    input.resource.description,
    input.resource.adapterType,
    input.provider.name,
    JSON.stringify(input.config)
  ].join(" ");
  const resourceTerms = tokenize(resourceText);
  const overlap = promptTerms.filter((term) => resourceTerms.includes(term));
  const semanticFit = promptTerms.length ? clampScore(overlap.length / Math.min(promptTerms.length, 10)) : 0.25;
  const citationBoost = input.resource.adapterType === "rss_paywall" || input.resource.adapterType === "mcp" ? 0.08 : 0;
  const liveSourceBoost =
    typeof input.config["sourceUrl"] === "string" ||
    typeof input.config["targetUrl"] === "string" ||
    typeof input.config["baseUrl"] === "string" ||
    typeof input.config["feedUrl"] === "string"
      ? 0.06
      : 0;
  const expectedValue = clampScore(input.resource.expectedValue * 0.55 + semanticFit * 0.35 + citationBoost);
  const freshnessScore = clampScore(input.resource.freshnessScore * 0.55 + semanticFit * 0.25 + liveSourceBoost);
  const confidenceScore = clampScore(input.resource.confidenceScore * 0.5 + semanticFit * 0.3 + citationBoost + (input.cacheHit ? 0.08 : 0));
  return {
    expectedValue,
    freshnessScore,
    confidenceScore,
    semanticFit,
    reason: [
      `Dynamic score: expected value ${expectedValue.toFixed(2)}`,
      `freshness ${freshnessScore.toFixed(2)}`,
      `confidence ${confidenceScore.toFixed(2)}`,
      `semantic fit ${semanticFit.toFixed(2)}`,
      overlap.length ? `matched terms: ${[...new Set(overlap)].slice(0, 6).join(", ")}` : "no direct term match"
    ].join("; ")
  };
}

function tokenize(value: string): string[] {
  const stopwords = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "when", "what", "which", "should"]);
  return value
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9-]{1,}/g)?.filter((term) => !stopwords.has(term)) ?? [];
}

function buildAnswer(input: {
  prompt: string;
  adapterResults: AdapterResult[];
  payments: PaymentEvent[];
  skippedSources: Array<{ resourceId: string; reason: string }>;
  decisions: AgentDecision[];
  resources: Resource[];
  budgetUsdc: number;
  totalSpendUsdc: number;
  policy: NormalizedPaymentPolicy;
}): string {
  const resourceById = new Map(input.resources.map((resource) => [resource.id, resource]));
  const decisionByResource = new Map(input.decisions.map((decision) => [decision.resourceId, decision]));
  const successful = input.adapterResults.filter((result) => result.status === "ok");
  const failed = input.adapterResults.filter((result) => result.status === "error");
  const citations = input.adapterResults.flatMap((result) => result.citations);
  const saved = roundUsdc(input.budgetUsdc - input.totalSpendUsdc);
  const efficiency = input.budgetUsdc > 0 ? roundUsdc(saved / input.budgetUsdc) : 0;
  const paidLines = input.payments.length
    ? input.payments
        .map((payment) => {
          const resource = resourceById.get(payment.resourceId);
          const decision = decisionByResource.get(payment.resourceId);
          return `- ${resource?.name ?? payment.resourceId} (${accessClassLabel(resource?.accessClass)}) paid ${payment.amountUsdc.toFixed(6)} USDC; status ${payment.status}; reason: ${decision?.reason ?? "paid after scoring"}.`;
        })
        .join("\n")
    : "- No paid resources were purchased.";
  const skippedLines = input.skippedSources.length
    ? input.skippedSources
        .map((skipped) => `- ${resourceById.get(skipped.resourceId)?.name ?? skipped.resourceId}: ${skipped.reason}`)
        .join("\n")
    : "- No resources were skipped.";
  const citationLines = citations.length
    ? citations
        .slice(0, 5)
        .map((citation) => `- ${citation.title}${citation.sourceUrl ? ` (${citation.sourceUrl})` : ""}`)
        .join("\n")
    : "- No paid citations were produced.";
  const errorLine = failed.length
    ? `Fulfillment errors: ${failed.map((result) => `${resourceById.get(result.resourceId)?.name ?? result.resourceId}: ${String((result.data as { error?: unknown }).error ?? "error")}`).join("; ")}`
    : "Fulfillment errors: none.";

  return [
    `Task: ${input.prompt}`,
    `Budget: ${input.budgetUsdc.toFixed(6)} USDC; spent ${input.totalSpendUsdc.toFixed(6)} USDC; saved ${saved.toFixed(6)} USDC; budget efficiency ${(efficiency * 100).toFixed(1)}%.`,
    `Payment policy: max spend ${input.policy.maxSpendUsdc.toFixed(6)} USDC; max price/call ${input.policy.maxPricePerCallUsdc !== undefined ? `${input.policy.maxPricePerCallUsdc.toFixed(6)} USDC` : "none"}; cache ${input.policy.cacheMode}; min score ${input.policy.minScore.toFixed(2)}; citations ${input.policy.requireCitations ? "required" : "optional"}.`,
    `Paid resources (${input.payments.length}):`,
    paidLines,
    `Skipped resources (${input.skippedSources.length}):`,
    skippedLines,
    `Paid citations (${citations.length}):`,
    citationLines,
    `Access fulfilled: ${successful.length}/${input.adapterResults.length}. ${errorLine}`,
    "Final recommendation: keep paying only for resources that improve confidence, freshness, citation quality or provider-specific evidence; skip resources that do not clear the dynamic value threshold."
  ].join("\n");
}

function accessClassLabel(accessClass?: string) {
  if (accessClass === "premium_api") return "Premium API call";
  if (accessClass === "mcp_tool") return "MCP tool call";
  if (accessClass === "publisher_content") return "Publisher content";
  if (accessClass === "agent_service") return "Agent service";
  if (accessClass === "usage_service") return "Usage-based service";
  return "Paid access";
}
