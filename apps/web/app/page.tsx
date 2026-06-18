"use client";

import { useEffect, useMemo, useState } from "react";

type Metrics = {
  agentRuns: number;
  paidCalls: number;
  attemptedPaidCalls: number;
  settledPaidCalls: number;
  failedPaidCalls: number;
  pendingVerificationCalls: number;
  attemptedUsdcVolume: number;
  settledUsdcVolume: number;
  paidCitations: number;
  totalUsdcVolume: number;
  averagePaymentUsdc: number;
  providersPaid: number;
  resources: number;
};

type PaymentStatus = {
  paymentMode: string;
  network: string;
  buyerWallet: string;
  sellerWallet: string;
  gatewayBalanceHintUsdc: string | null;
  asset: {
    symbol: string;
    decimals: number;
    address: string;
  };
  latestPayment: null | {
    resourceId: string;
    adapterType: string;
    amountUsdc: number;
    network: string;
    buyerWallet: string;
    sellerWallet: string;
    paymentIdentifier: string;
    txOrSettlementRef?: string;
    status: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  latestReceipt: null | {
    resourceId: string;
    receipt: Record<string, unknown>;
    createdAt: string;
  };
  latestEarning: null | {
    providerId: string;
    resourceId: string;
    amountUsdc: number;
    settlementStatus: string;
    createdAt: string;
  };
  cliExample: string;
};

type WalletStatus = {
  address: string;
  chain: string;
  network: string;
  paymentMode: string;
  source: string;
  walletBalance:
    | { ok: true; checkedAt: string; amount: string; token: string; tokenAddress: string }
    | { ok: false; checkedAt: string; error: string };
  gatewayBalance:
    | { ok: true; checkedAt: string; amount: string; total: string; token: string; backingEOA: string | null }
    | { ok: false; checkedAt: string; error: string };
};

type Resource = {
  id: string;
  providerId: string;
  name: string;
  description: string;
  accessClass: string;
  adapterType: string;
  priceUsdc: number;
  expectedValue: number;
  freshnessScore: number;
  confidenceScore: number;
  enabled?: boolean;
};

type ResourceProof = {
  resourceId: string;
  accessClass?: string;
  adapterType: string;
  config?: Record<string, unknown>;
  manifestUrl?: string;
  upstream: string;
  paidCalls: number;
  revenueUsdc: number;
  receiptCount: number;
  lastStatus: string;
  fulfillmentStatus: string;
};

type Marketplace = {
  publishedResources: number;
  activeProviders: number;
  paidCalls: number;
  settledPayments: number;
  receiptCount: number;
};

type TrustSignal = {
  label: string;
  status: string;
  detail: string;
};

type ReceiptExplorerEntry = {
  paymentId: string;
  paymentIdentifier: string;
  resourceId: string;
  resourceName: string;
  accessClass?: string;
  adapterType: string;
  providerId: string | null;
  providerName: string;
  amountUsdc: number;
  network: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  settlementStatus: string;
  txOrSettlementRef: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  fulfilledAt: string | null;
  fulfillmentFailedAt: string | null;
  settlementEvidence: unknown;
  verificationError: string | null;
  receiptId: string | null;
  receiptPayload: Record<string, unknown> | null;
  citations: Array<{ title?: string; sourceUrl?: string; quote?: string; citationReceipt?: Record<string, unknown> }>;
  citationCount: number;
  adapterError: string | null;
  timeline: Array<{ label: string; status: string; at: string | null; detail: string }>;
  createdAt: string;
};

type ReceiptExplorer = {
  entries: ReceiptExplorerEntry[];
  totals: {
    payments: number;
    attempted: number;
    settled: number;
    pending: number;
    failedSettlement: number;
    delivered: number;
    failedFulfillment: number;
    citations: number;
    settledUsdc: number;
  };
};

type TaskMode = "full" | "agent" | "resource";
type PolicyPreset = "conservative" | "balanced" | "exploratory" | "custom";
type TaskType =
  | "research"
  | "api"
  | "tool"
  | "content"
  | "agent_service"
  | "usage_service";

type AgentRun = {
  id: string;
  prompt: string;
  budgetUsdc: number;
  status: string;
  totalSpendUsdc: number;
  output: {
    answer: string;
    policy: {
      maxSpendUsdc: number;
      maxPricePerCallUsdc?: number;
      allowedAccessClasses: string[];
      trustedProviderCount: number;
      requireCitations: boolean;
      cacheMode: "reuse" | "refresh" | "ignore";
      minScore: number;
    } | null;
    decisions: Array<{ resourceId: string; decision: string; score: number; reason: string }>;
    payments: Array<{ resourceId: string; amountUsdc: number; paymentIdentifier: string; status: string }>;
    paidCitations: Array<{ title: string; sourceUrl?: string }>;
    skippedSources: Array<{ resourceId: string; reason: string }>;
    budgetEfficiency: number;
    adapterResults: Array<{ resourceId: string; status: string; adapterType: string }>;
  };
};

type Provider = {
  id: string;
  name: string;
  walletAddress: string;
  resources?: number;
  paidCalls?: number;
  revenueUsdc?: number;
  settledUsdc?: number;
};

const defaultPrompt =
  "Research how AI agents can use nanopayments for internet resource access on Arc. You have a 0.05 USDC budget. Decide which premium APIs, MCP tools, publisher sources, agent services and usage-based services are worth buying. Produce an answer with paid citations, skipped sources, total spend, budget efficiency and provider earnings.";

const fullIntegrationPrompt =
  "Evaluate the full nanopayment access catalog on Arc: premium API call, MCP server/tool call, web content or publisher source, agent-to-agent service, and usage-based service access. Let the agent decide what is worth paying for, what should be skipped, and what can be reused from cache. Show total spend, fulfillment proof, citation receipts, and provider earnings.";

const taskTypeLabels: Record<TaskType, string> = {
  research: "Autonomous resource purchase",
  api: "Premium API call",
  tool: "MCP tool call",
  content: "Publisher content access",
  agent_service: "Agent-to-agent service",
  usage_service: "Usage-based service access"
};

const taskTypeAdapters: Partial<Record<TaskType, string[]>> = {
  api: ["api_proxy"],
  tool: ["mcp"],
  content: ["rss_paywall"],
  agent_service: ["agent_delegation"],
  usage_service: ["inference"]
};

const accessClassOptions = ["premium_api", "mcp_tool", "publisher_content", "agent_service", "usage_service"];

const accessClassToAdapter: Record<string, string> = {
  premium_api: "api_proxy",
  mcp_tool: "mcp",
  publisher_content: "rss_paywall",
  agent_service: "agent_delegation",
  usage_service: "inference"
};

const policyPresets: Record<
  Exclude<PolicyPreset, "custom">,
  {
    label: string;
    maxSpendUsdc: string;
    maxPricePerCallUsdc: string;
    requireCitations: boolean;
    cacheMode: "reuse" | "refresh" | "ignore";
  }
> = {
  conservative: {
    label: "Conservative",
    maxSpendUsdc: "0.025",
    maxPricePerCallUsdc: "0.001",
    requireCitations: true,
    cacheMode: "reuse"
  },
  balanced: {
    label: "Balanced",
    maxSpendUsdc: "0.05",
    maxPricePerCallUsdc: "0.003",
    requireCitations: false,
    cacheMode: "reuse"
  },
  exploratory: {
    label: "Exploratory",
    maxSpendUsdc: "0.08",
    maxPricePerCallUsdc: "0.008",
    requireCitations: false,
    cacheMode: "refresh"
  }
};

const defaultPublisherConfig = JSON.stringify(
  {
    targetUrl: "http://localhost:8000/premium-api/x402-summary?sourceUrl=https%3A%2F%2Fdocs.x402.org%2F",
    method: "GET"
  },
  null,
  2
);

const publishConfigTemplates: Record<string, string> = {
  premium_api: defaultPublisherConfig,
  mcp_tool: JSON.stringify({ serverUrl: "http://localhost:8000/mcp", sourceUrl: "https://docs.x402.org/" }, null, 2),
  publisher_content: JSON.stringify(
    {
      targetUrl: "http://localhost:8000/rss/paywall",
      feedUrl: "https://www.arc.network/blog/rss.xml",
      articleUrl: "https://www.arc.network/blog/introducing-the-arc-token-whitepaper"
    },
    null,
    2
  ),
  agent_service: JSON.stringify({ targetUrl: "http://localhost:8000/agent/delegate" }, null, 2),
  usage_service: JSON.stringify({ targetUrl: "http://localhost:8000/inference/complete", model: "qwen3:14b" }, null, 2)
};

const defaultSdkExample = [
  "import { protect } from '@agentpay/sdk';",
  "",
  "export const GET = protect(handler, {",
  "  price: '0.001 USDC',",
  "  network: 'eip155:5042002',",
  "  seller: process.env.SELLER_ADDRESS!,",
  "  accessClass: 'premium_api',",
  "  resourceId: 'premium-weather-api'",
  "});"
].join("\n");

export default function HomePage() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [budgetUsdc, setBudgetUsdc] = useState("0.05");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [resourceProofs, setResourceProofs] = useState<ResourceProof[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [marketplace, setMarketplace] = useState<Marketplace | null>(null);
  const [trustSignals, setTrustSignals] = useState<TrustSignal[]>([]);
  const [sdkExample, setSdkExample] = useState(defaultSdkExample);
  const [receiptExplorer, setReceiptExplorer] = useState<ReceiptExplorer | null>(null);
  const [selectedReceiptPaymentId, setSelectedReceiptPaymentId] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [taskMode, setTaskMode] = useState<TaskMode>("agent");
  const [taskType, setTaskType] = useState<TaskType>("research");
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [policyPreset, setPolicyPreset] = useState<PolicyPreset>("balanced");
  const [policyMaxSpendUsdc, setPolicyMaxSpendUsdc] = useState("0.05");
  const [policyMaxPricePerCallUsdc, setPolicyMaxPricePerCallUsdc] = useState("0.003");
  const [policyRequireCitations, setPolicyRequireCitations] = useState(false);
  const [policyCacheMode, setPolicyCacheMode] = useState<"reuse" | "refresh" | "ignore">("reuse");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "PS AgentPay> waiting for a task",
    "Use agent mode for autonomous access selection, or choose a single paid resource."
  ]);
  const [providerName, setProviderName] = useState("New Paid Resource Provider");
  const [providerWalletAddress, setProviderWalletAddress] = useState("0x1111111111111111111111111111111111111111");
  const [creatingProvider, setCreatingProvider] = useState(false);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [publishProviderId, setPublishProviderId] = useState("");
  const [editingResourceId, setEditingResourceId] = useState("");
  const [publishName, setPublishName] = useState("Premium API Call");
  const [publishDescription, setPublishDescription] = useState("A pay-per-request resource agents can buy with x402.");
  const [publishAccessClass, setPublishAccessClass] = useState("premium_api");
  const [publishPriceUsdc, setPublishPriceUsdc] = useState("0.0013");
  const [publishExpectedValue, setPublishExpectedValue] = useState("0.72");
  const [publishFreshnessScore, setPublishFreshnessScore] = useState("0.70");
  const [publishConfidenceScore, setPublishConfidenceScore] = useState("0.74");
  const [publishConfig, setPublishConfig] = useState(defaultPublisherConfig);
  const [publishing, setPublishing] = useState(false);
  const [updatingResource, setUpdatingResource] = useState(false);
  const [testingFulfillment, setTestingFulfillment] = useState(false);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [metricsResponse, resourcesResponse, paymentResponse, walletResponse, receiptsResponse] = await Promise.all([
      fetch("/api/metrics"),
      fetch("/api/resources"),
      fetch("/api/payments/latest"),
      fetch("/api/wallet/status"),
      fetch("/api/receipts")
    ]);
    const resourcesBody = await resourcesResponse.json();
    setMetrics(await metricsResponse.json());
    setResources(resourcesBody.resources);
    setResourceProofs(resourcesBody.resourceProofs ?? []);
    setProviders(resourcesBody.providers);
    setMarketplace(resourcesBody.marketplace ?? null);
    setTrustSignals(resourcesBody.trust ?? []);
    setSdkExample(resourcesBody.sdkExample ?? "");
    setPaymentStatus(await paymentResponse.json());
    setWalletStatus(await walletResponse.json());
    setReceiptExplorer(await receiptsResponse.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const firstResource = resources[0];
    if (!selectedResourceId && firstResource) {
      setSelectedResourceId(firstResource.id);
    }
  }, [resources, selectedResourceId]);

  useEffect(() => {
    if (editingResourceId) return;
    setPublishConfig(publishConfigTemplates[publishAccessClass] ?? defaultPublisherConfig);
  }, [editingResourceId, publishAccessClass]);

  useEffect(() => {
    const firstProvider = providers[0];
    if (!publishProviderId && firstProvider) {
      setPublishProviderId(firstProvider.id);
      setProviderName(firstProvider.name);
      setProviderWalletAddress(firstProvider.walletAddress);
    }
  }, [providers, publishProviderId]);

  function applyPolicyPreset(preset: Exclude<PolicyPreset, "custom">) {
    const next = policyPresets[preset];
    setPolicyPreset(preset);
    setPolicyMaxSpendUsdc(next.maxSpendUsdc);
    setPolicyMaxPricePerCallUsdc(next.maxPricePerCallUsdc);
    setPolicyRequireCitations(next.requireCitations);
    setPolicyCacheMode(next.cacheMode);
  }

  async function startRun() {
    setLoading(true);
    setError(null);
    const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
    const allowedAdapterTypes = taskMode === "agent" ? taskTypeAdapters[taskType] : undefined;
    const fullIntegrationResourceIds = resources.map((resource) => resource.id);
    const allowedResourceIds = taskMode === "resource" && selectedResource ? [selectedResource.id] : undefined;
    const runPrompt = taskMode === "full" ? fullIntegrationPrompt : prompt;
    const runBudgetUsdc = taskMode === "full" ? 0.05 : Number(budgetUsdc);
    const runPolicy = {
      maxSpendUsdc: Math.min(runBudgetUsdc, Number(policyMaxSpendUsdc) || runBudgetUsdc),
      maxPricePerCallUsdc: Number(policyMaxPricePerCallUsdc) || undefined,
      ...(taskMode === "agent" && allowedAdapterTypes
        ? { allowedAccessClasses: accessClassesForAdapters(allowedAdapterTypes) }
        : {}),
      requireCitations: policyRequireCitations,
      cacheMode: policyCacheMode
    };
    setTerminalLines([
      `PS AgentPay> task mode: ${taskModeLabel(taskMode)}`,
      `PS AgentPay> task type: ${taskMode === "full" ? "full integration run" : taskTypeLabels[taskType]}`,
      `PS AgentPay> budget: ${runBudgetUsdc.toFixed(6)} USDC`,
      `PS AgentPay> policy: max spend ${runPolicy.maxSpendUsdc.toFixed(6)} USDC; max price/call ${
        runPolicy.maxPricePerCallUsdc ? runPolicy.maxPricePerCallUsdc.toFixed(6) : "none"
      }; cache ${runPolicy.cacheMode}${runPolicy.requireCitations ? "; citations required" : ""}`,
      taskMode === "full"
        ? `PS AgentPay> eligible resources: ${fullIntegrationResourceIds.length} paid access classes`
        : allowedResourceIds
        ? `PS AgentPay> selected resource: ${selectedResource?.name ?? selectedResourceId}`
        : `PS AgentPay> eligible access classes: ${allowedAdapterTypes?.map(accessClassLabel).join(", ") ?? "all"}`,
      ...(taskMode === "full"
        ? ["PS AgentPay> live scoring enabled; normal cache and budget rules are active"]
        : []),
      "PS AgentPay> scoring resources by value, freshness, confidence and cost fit...",
      "PS AgentPay> buying paid access when score and budget allow..."
    ]);
    try {
      const response = await fetch("/api/agent/runs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: runPrompt,
          budgetUsdc: runBudgetUsdc,
          ...(allowedAdapterTypes ? { allowedAdapterTypes } : {}),
          ...(taskMode === "full" ? { allowedResourceIds: fullIntegrationResourceIds } : {}),
          ...(allowedResourceIds ? { allowedResourceIds } : {}),
          policy: runPolicy
        })
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Agent run failed");
      }
      await readAgentStream(response.body, {
        onLine: (line) => setTerminalLines((current) => [...current, line]),
        onRun: (nextRun) => setRun(nextRun)
      });
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent run failed";
      setError(message);
      setTerminalLines((current) => [...current, `PS AgentPay> ERROR: ${message}`]);
    } finally {
      setLoading(false);
    }
  }

  async function createProvider() {
    setCreatingProvider(true);
    setProviderMessage(null);
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: providerName,
          walletAddress: providerWalletAddress
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Provider creation failed");
      setProviderMessage(`Provider created: ${body.provider.name}`);
      setPublishProviderId(body.provider.id);
      setTerminalLines((current) => [
        ...current,
        `PS AgentPay> provider created: ${body.provider.name}`,
        `PS AgentPay> seller wallet: ${shortAddress(body.provider.walletAddress)}`
      ]);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provider creation failed";
      setProviderMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> PROVIDER ERROR: ${message}`]);
    } finally {
      setCreatingProvider(false);
    }
  }

  async function updateProvider() {
    if (!publishProviderId) return;
    setCreatingProvider(true);
    setProviderMessage(null);
    try {
      const response = await fetch(`/api/providers/${publishProviderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: providerName,
          walletAddress: providerWalletAddress
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Provider update failed");
      setProviderMessage(`Provider updated: ${body.provider.name}`);
      setTerminalLines((current) => [
        ...current,
        `PS AgentPay> provider updated: ${body.provider.name}`,
        `PS AgentPay> seller wallet: ${shortAddress(body.provider.walletAddress)}`
      ]);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provider update failed";
      setProviderMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> PROVIDER ERROR: ${message}`]);
    } finally {
      setCreatingProvider(false);
    }
  }

  async function testFulfillment() {
    setTestingFulfillment(true);
    setPublishMessage(null);
    try {
      const config = JSON.parse(publishConfig) as Record<string, unknown>;
      const selectedProvider = providers.find((provider) => provider.id === publishProviderId);
      const response = await fetch("/api/providers/resources/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: publishProviderId || undefined,
          providerName: selectedProvider?.name,
          sellerWallet: selectedProvider?.walletAddress,
          name: publishName,
          description: publishDescription,
          accessClass: publishAccessClass,
          adapterType: accessClassToAdapter[publishAccessClass],
          priceUsdc: Number(publishPriceUsdc),
          config
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Fulfillment test failed");
      setPublishMessage(`Fulfillment test ${body.ok ? "passed" : "returned non-ok"} in ${body.latencyMs}ms.`);
      setTerminalLines((current) => [
        ...current,
        `PS AgentPay> fulfillment test: ${publishName}`,
        `PS AgentPay> access class: ${accessClassLabel(body.accessClass)} | latency: ${body.latencyMs}ms`,
        `PS AgentPay> test result: ${body.result?.status ?? "unknown"}`
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Fulfillment test failed";
      setPublishMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> TEST ERROR: ${message}`]);
    } finally {
      setTestingFulfillment(false);
    }
  }

  async function testPublishedResource() {
    if (!editingResourceId) return;
    setTestingFulfillment(true);
    setPublishMessage(null);
    try {
      const response = await fetch(`/api/providers/resources/${editingResourceId}/test`, {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Resource test failed");
      setPublishMessage(`Published resource test ${body.ok ? "passed" : "returned non-ok"} in ${body.latencyMs}ms.`);
      setTerminalLines((current) => [
        ...current,
        `PS AgentPay> published resource test: ${editingResourceId}`,
        `PS AgentPay> access class: ${accessClassLabel(body.accessClass)} | latency: ${body.latencyMs}ms`,
        `PS AgentPay> test result: ${body.result?.status ?? "unknown"}`
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resource test failed";
      setPublishMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> TEST ERROR: ${message}`]);
    } finally {
      setTestingFulfillment(false);
    }
  }

  async function publishResource() {
    setPublishing(true);
    setPublishMessage(null);
    try {
      const config = JSON.parse(publishConfig) as Record<string, unknown>;
      const response = await fetch("/api/providers/resources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: publishProviderId || undefined,
          name: publishName,
          description: publishDescription,
          accessClass: publishAccessClass,
          adapterType: accessClassToAdapter[publishAccessClass],
          priceUsdc: Number(publishPriceUsdc),
          expectedValue: Number(publishExpectedValue),
          freshnessScore: Number(publishFreshnessScore),
          confidenceScore: Number(publishConfidenceScore),
          config
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Resource publish failed");
      setPublishMessage(`Published ${body.resource.name} at ${body.resource.priceUsdc.toFixed(6)} USDC.`);
      setTerminalLines((current) => [
        ...current,
        `PS AgentPay> provider published: ${body.resource.name}`,
        `PS AgentPay> resource id: ${body.resource.id}`
      ]);
      setSelectedResourceId(body.resource.id);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resource publish failed";
      setPublishMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> PUBLISH ERROR: ${message}`]);
    } finally {
      setPublishing(false);
    }
  }

  async function updateResource(enabled = true) {
    if (!editingResourceId) return;
    setUpdatingResource(true);
    setPublishMessage(null);
    try {
      const config = JSON.parse(publishConfig) as Record<string, unknown>;
      const response = await fetch(`/api/providers/resources/${editingResourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          providerId: publishProviderId || undefined,
          name: publishName,
          description: publishDescription,
          accessClass: publishAccessClass,
          adapterType: accessClassToAdapter[publishAccessClass],
          priceUsdc: Number(publishPriceUsdc),
          expectedValue: Number(publishExpectedValue),
          freshnessScore: Number(publishFreshnessScore),
          confidenceScore: Number(publishConfidenceScore),
          enabled,
          config
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Resource update failed");
      setPublishMessage(
        enabled ? `Updated ${body.resource.name}.` : `Disabled ${body.resource.name}; agents will no longer discover it.`
      );
      setTerminalLines((current) => [
        ...current,
        enabled
          ? `PS AgentPay> resource updated: ${body.resource.name}`
          : `PS AgentPay> resource disabled: ${body.resource.name}`
      ]);
      if (!enabled) {
        setEditingResourceId("");
        setSelectedResourceId("");
      }
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resource update failed";
      setPublishMessage(message);
      setTerminalLines((current) => [...current, `PS AgentPay> RESOURCE ERROR: ${message}`]);
    } finally {
      setUpdatingResource(false);
    }
  }

  function loadResourceForEditing(resourceId: string) {
    if (!resourceId) {
      resetResourceForm();
      return;
    }
    const resource = resources.find((candidate) => candidate.id === resourceId);
    if (!resource) return;
    const proof = resourceProofs.find((candidate) => candidate.resourceId === resourceId);
    setEditingResourceId(resource.id);
    setPublishProviderId(resource.providerId);
    setPublishName(resource.name);
    setPublishDescription(resource.description);
    setPublishAccessClass(resource.accessClass);
    setPublishPriceUsdc(resource.priceUsdc.toFixed(6));
    setPublishExpectedValue(resource.expectedValue.toFixed(2));
    setPublishFreshnessScore(resource.freshnessScore.toFixed(2));
    setPublishConfidenceScore(resource.confidenceScore.toFixed(2));
    setPublishConfig(JSON.stringify(proof?.config ?? {}, null, 2));
    setSelectedResourceId(resource.id);
    setPublishMessage(`Loaded ${resource.name} for editing.`);
  }

  function resetResourceForm() {
    setEditingResourceId("");
    setPublishName("Premium API Call");
    setPublishDescription("A pay-per-request resource agents can buy with x402.");
    setPublishAccessClass("premium_api");
    setPublishPriceUsdc("0.0013");
    setPublishExpectedValue("0.72");
    setPublishFreshnessScore("0.70");
    setPublishConfidenceScore("0.74");
    setPublishConfig(defaultPublisherConfig);
    setPublishMessage(null);
  }

  function selectProvider(providerId: string) {
    setPublishProviderId(providerId);
    const provider = providers.find((candidate) => candidate.id === providerId);
    if (!provider) return;
    setProviderName(provider.name);
    setProviderWalletAddress(provider.walletAddress);
  }

  const paymentSummary = useMemo(() => {
    if (!run) return "No run yet.";
    return `${run.output.payments.length} paid calls, ${run.totalSpendUsdc.toFixed(6)} USDC spent, ${run.output.paidCitations.length} citation receipts.`;
  }, [run]);
  const runSummary = useMemo(() => buildRunSummary(run, taskMode, taskType), [run, taskMode, taskType]);
  const adapterCoverage = useMemo(() => buildAdapterCoverage(run, resources), [run, resources]);
  const selectedReceiptEntry = useMemo(() => {
    const entries = receiptExplorer?.entries ?? [];
    return entries.find((entry) => entry.paymentId === selectedReceiptPaymentId) ?? entries[0] ?? null;
  }, [receiptExplorer, selectedReceiptPaymentId]);
  const liveProofs = useMemo(() => buildLiveProofs(resources, resourceProofs, run), [resources, resourceProofs, run]);
  const latestResource = paymentStatus?.latestPayment
    ? resources.find((resource) => resource.id === paymentStatus.latestPayment?.resourceId)
    : undefined;
  const latestProvider = latestResource ? providers.find((provider) => provider.id === latestResource.providerId) : undefined;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">AgentPay Gateway</div>
        <nav className="nav">
          <span>Agent Run</span>
          <span>Task Console</span>
          <span>Provider Console</span>
          <span>Payments</span>
          <span>Access Lab</span>
        </nav>
      </aside>

      <section className="main">
        <div className="topbar">
          <div>
            <span className="eyebrow">Autonomous nanopayment infrastructure</span>
            <h1>Agent-Paid Distribution Gateway</h1>
            <p>
              AI agents need a budget-aware purchasing layer for internet resources. We built that layer on Arc,
              Circle and x402.
            </p>
            <div className="hero-strip" aria-label="Product capabilities">
              <span>Budget-aware agent</span>
              <span>x402 payment proof</span>
              <span>5 access classes</span>
              <span>Provider marketplace</span>
              <span>Receipt monetization</span>
            </div>
          </div>
          <span className="badge">Lepton - x402 - Arc USDC</span>
        </div>

        <div className="grid">
          <section className="panel span-12 metrics-panel">
            <div className="metric-grid">
              <Metric label="Agent runs" value={metrics?.agentRuns ?? 0} />
              <Metric label="Attempted payments" value={metrics?.attemptedPaidCalls ?? metrics?.paidCalls ?? 0} />
              <Metric label="Settled payments" value={metrics?.settledPaidCalls ?? metrics?.paidCalls ?? 0} />
              <Metric label="Settled USDC" value={(metrics?.settledUsdcVolume ?? metrics?.totalUsdcVolume ?? 0).toFixed(6)} />
              <Metric label="Pending / failed" value={`${metrics?.pendingVerificationCalls ?? 0} / ${metrics?.failedPaidCalls ?? 0}`} />
            </div>
          </section>

          <section className="panel span-12">
            <h2>Distribution Bootstrap Loop</h2>
            <div className="bootstrap-grid">
              <BootstrapStep
                label="1. Publish"
                text="API owners, MCP developers, publishers and agent operators expose pay-per-request resources."
              />
              <BootstrapStep
                label="2. Discover"
                text="The agent reads the catalog, scores each source by value, freshness, confidence and price."
              />
              <BootstrapStep
                label="3. Pay"
                text="Only useful resources receive x402 nanopayments from the agent budget on Arc testnet USDC."
              />
              <BootstrapStep
                label="4. Prove"
                text="The dashboard records receipts, paid citations, skipped sources and provider earnings."
              />
            </div>
          </section>

          <section className="panel span-12 marketplace-panel">
            <div className="section-heading">
              <div>
                <h2>Provider Marketplace</h2>
                <p>Any API owner, MCP server, publisher or agent operator can list a paid resource for agents to buy per request.</p>
              </div>
              <span className="section-count">{marketplace?.publishedResources ?? resources.length} listed</span>
            </div>
            <div className="metric-grid marketplace-metrics">
              <Metric label="Active providers" value={marketplace?.activeProviders ?? providers.length} />
              <Metric label="Paid calls" value={marketplace?.paidCalls ?? metrics?.paidCalls ?? 0} />
              <Metric label="Settled payments" value={marketplace?.settledPayments ?? 0} />
              <Metric label="Receipts issued" value={marketplace?.receiptCount ?? 0} />
            </div>
            <div className="provider-grid">
              {providers.map((provider) => (
                <div className="provider-card" key={provider.id}>
                  <div>
                    <strong>{provider.name}</strong>
                    <span>{shortAddress(provider.walletAddress)}</span>
                  </div>
                  <div className="provider-card-stats">
                    <span>{provider.resources ?? 0} resources</span>
                    <span>{provider.paidCalls ?? 0} paid calls</span>
                    <b>{(provider.settledUsdc ?? 0).toFixed(6)} USDC settled</b>
                  </div>
                </div>
              ))}
            </div>
            <div className="publish-console">
              <div className="section-heading">
                <div>
                  <h3>Provider onboarding</h3>
                  <p>Create a seller profile, validate fulfillment, then publish a real pay-per-request resource agents can buy.</p>
                </div>
                <span className="section-count">self-serve</span>
              </div>
              <div className="publish-grid">
                <label>
                  <span>Provider name</span>
                  <input value={providerName} onChange={(event) => setProviderName(event.target.value)} />
                </label>
                <label>
                  <span>Seller wallet</span>
                  <input value={providerWalletAddress} onChange={(event) => setProviderWalletAddress(event.target.value)} />
                </label>
                <div className="publish-actions publish-wide">
                  <button className="button secondary-button" type="button" onClick={createProvider} disabled={creatingProvider}>
                    {creatingProvider ? "Creating provider..." : "Create provider"}
                  </button>
                  <button className="button ghost-button" type="button" onClick={updateProvider} disabled={creatingProvider || !publishProviderId}>
                    Save provider
                  </button>
                  {providerMessage ? <p>{providerMessage}</p> : null}
                </div>
              </div>
              <div className="section-heading publish-subheading">
                <div>
                  <h3>Publish paid access</h3>
                  <p>Register the resource class, price and fulfillment endpoint. Test fulfillment before listing it.</p>
                </div>
                <span className="section-count">resource action</span>
              </div>
              <div className="publish-grid">
                <label className="publish-wide">
                  <span>Manage existing resource</span>
                  <select value={editingResourceId} onChange={(event) => loadResourceForEditing(event.target.value)}>
                    <option value="">Create new resource</option>
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} - {accessClassLabel(resource.accessClass)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="publish-actions publish-wide">
                  <button className="button ghost-button" type="button" onClick={resetResourceForm}>
                    New resource
                  </button>
                  <button
                    className="button ghost-button"
                    type="button"
                    onClick={testPublishedResource}
                    disabled={!editingResourceId || testingFulfillment}
                  >
                    Test selected
                  </button>
                </div>
                <label>
                  <span>Provider</span>
                  <select value={publishProviderId} onChange={(event) => selectProvider(event.target.value)}>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Access class</span>
                  <select value={publishAccessClass} onChange={(event) => setPublishAccessClass(event.target.value)}>
                    {accessClassOptions.map((accessClass) => (
                      <option key={accessClass} value={accessClass}>
                        {accessClassLabel(accessClass)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Name</span>
                  <input value={publishName} onChange={(event) => setPublishName(event.target.value)} />
                </label>
                <label>
                  <span>Price USDC</span>
                  <input
                    value={publishPriceUsdc}
                    onChange={(event) => setPublishPriceUsdc(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="publish-wide">
                  <span>Description</span>
                  <input
                    value={publishDescription}
                    onChange={(event) => setPublishDescription(event.target.value)}
                  />
                </label>
                <label>
                  <span>Expected value</span>
                  <input
                    value={publishExpectedValue}
                    onChange={(event) => setPublishExpectedValue(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <span>Freshness</span>
                  <input
                    value={publishFreshnessScore}
                    onChange={(event) => setPublishFreshnessScore(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label>
                  <span>Confidence</span>
                  <input
                    value={publishConfidenceScore}
                    onChange={(event) => setPublishConfidenceScore(event.target.value)}
                    inputMode="decimal"
                  />
                </label>
                <label className="publish-wide">
                  <span>{primaryConfigLabel(publishAccessClass)}</span>
                  <input
                    value={primaryConfigValue(publishConfig, publishAccessClass)}
                    onChange={(event) =>
                      setPublishConfig(updatePrimaryConfigValue(publishConfig, publishAccessClass, event.target.value))
                    }
                  />
                </label>
                <label className="publish-config">
                  <span>Advanced fulfillment config JSON</span>
                  <textarea value={publishConfig} onChange={(event) => setPublishConfig(event.target.value)} />
                </label>
              </div>
              <div className="publish-actions">
                <button className="button ghost-button" type="button" onClick={testFulfillment} disabled={testingFulfillment}>
                  {testingFulfillment ? "Testing..." : "Test fulfillment"}
                </button>
                <button className="button secondary-button" type="button" onClick={publishResource} disabled={publishing}>
                  {publishing ? "Publishing..." : "Publish resource"}
                </button>
                <button
                  className="button secondary-button"
                  type="button"
                  onClick={() => updateResource(true)}
                  disabled={!editingResourceId || updatingResource}
                >
                  {updatingResource ? "Saving..." : "Save changes"}
                </button>
                <button
                  className="button danger-button"
                  type="button"
                  onClick={() => updateResource(false)}
                  disabled={!editingResourceId || updatingResource}
                >
                  Disable resource
                </button>
                {publishMessage ? <p>{publishMessage}</p> : null}
              </div>
            </div>
          </section>

          <section className="panel span-12">
            <h2>Creator Payment Rail</h2>
            <div className="metric-grid">
              <div className="metric">
                <b>Buyer wallet</b>
                <span>Agent budget wallet pays for useful internet resources</span>
              </div>
              <div className="metric">
                <b>Seller wallets</b>
                <span>{providers.length} provider wallets can earn</span>
              </div>
              <div className="metric">
                <b>{metrics?.providersPaid ?? 0}</b>
                <span>Providers paid</span>
              </div>
              <div className="metric">
                <b>{(metrics?.averagePaymentUsdc ?? 0).toFixed(6)}</b>
                <span>Average payment USDC</span>
              </div>
            </div>
          </section>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Paid Resource Catalog</h2>
                <p>Pay-per-request resources the agent can buy when score, budget and cache rules justify the spend.</p>
              </div>
              <div className="catalog-actions">
                <a href="/.well-known/agentpay/resources.json" target="_blank" rel="noreferrer">
                  Well-known catalog
                </a>
                <a href="/api/resources/manifests" target="_blank" rel="noreferrer">
                  Manifest API
                </a>
                <span className="section-count">{resources.length} resources</span>
              </div>
            </div>
            <div className="proof-grid">
              {liveProofs.map((proof) => (
                <div className="proof-card" key={proof.resourceId}>
                  <div className="proof-card-heading">
                    <strong>{proof.label}</strong>
                    <span className={proof.status === "ok" ? "proof-status proof-ok" : "proof-status"}>
                      {proof.statusLabel}
                    </span>
                  </div>
                  <p>{proof.resourceName}</p>
                  <div className="resource-stats">
                    <span>{proof.priceUsdc.toFixed(6)} USDC</span>
                    <span>EV {proof.expectedValue.toFixed(2)}</span>
                  </div>
                  <a className="manifest-link" href={proof.manifestUrl} target="_blank" rel="noreferrer">
                    Resource manifest
                  </a>
                  <code>{proof.upstream}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="panel span-12 payment-panel">
            <div className="section-heading">
              <div>
                <h2>Live x402 Payment Proof</h2>
                <p>Every paid resource leaves a buyer, seller, amount, status and receipt trail.</p>
              </div>
              <span className={paymentStatus?.latestPayment ? "proof-status proof-ok" : "proof-status"}>
                {paymentStatus?.latestPayment ? "payment recorded" : "awaiting run"}
              </span>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <b>{walletStatus?.paymentMode ?? paymentStatus?.paymentMode ?? "unknown"}</b>
                <span>Payment mode</span>
              </div>
              <div className="metric">
                <b>{walletStatus?.network ?? paymentStatus?.network ?? "unknown"}</b>
                <span>Arc Testnet chain</span>
              </div>
              <div className="metric">
                <b>{walletStatus?.walletBalance.ok ? walletStatus.walletBalance.amount : "error"}</b>
                <span>Wallet USDC live</span>
              </div>
              <div className="metric">
                <b>{walletStatus?.gatewayBalance.ok ? walletStatus.gatewayBalance.amount : "error"}</b>
                <span>Gateway USDC live</span>
              </div>
            </div>
            <div className="payment-flow" aria-label="Payment flow">
              <PaymentFlowStep
                eyebrow="Buyer"
                title="Agent budget wallet"
                value={shortAddress(paymentStatus?.buyerWallet)}
                detail={`${paymentStatus?.asset.symbol ?? "USDC"} on ${walletStatus?.network ?? paymentStatus?.network ?? "Arc testnet"}`}
              />
              <PaymentFlowStep
                eyebrow="Resource"
                title={latestResource?.name ?? "No resource purchased yet"}
                value={latestResource ? accessClassLabel(latestResource.accessClass) : "waiting"}
                detail={
                  paymentStatus?.latestPayment
                    ? `${paymentStatus.latestPayment.amountUsdc.toFixed(6)} USDC`
                    : "Run the agent to create the first paid receipt"
                }
              />
              <PaymentFlowStep
                eyebrow="Seller"
                title={latestProvider?.name ?? "Provider pending"}
                value={shortAddress(paymentStatus?.sellerWallet)}
                detail={paymentStatus?.latestEarning?.settlementStatus ?? "waiting for paid call"}
              />
              <PaymentFlowStep
                eyebrow="Receipt"
                title={paymentStatus?.latestPayment?.status ?? "No payment yet"}
                value={shortIdentifier(paymentStatus?.latestPayment?.paymentIdentifier)}
                detail={paymentStatus?.latestPayment?.createdAt ?? "Not checked yet"}
              />
            </div>
          </section>

          <section className="panel span-6 policy-panel">
            <div className="section-heading">
              <div>
                <h2>Agent Budget Policy</h2>
                <p>Payment decisions are governed by configurable spend discipline, not blind tool calling.</p>
              </div>
              <span className="section-count">active</span>
            </div>
            <div className="policy-grid">
              <PolicyItem label="Spend mode" value={taskMode === "full" ? "Full catalog" : "Balanced"} />
              <PolicyItem label="Min score" value="0.58" />
              <PolicyItem label="Max source cost" value={`${Number(budgetUsdc || 0).toFixed(2)} budget`} />
              <PolicyItem label="Cache rule" value="Reuse paid artifacts" />
            </div>
            <p className="policy-copy">
              The agent scores value, freshness, confidence and cost fit before paying. Skips and cache hits are recorded
              alongside paid calls so spend decisions can be audited.
            </p>
          </section>

          <section className="panel span-6 receipt-panel">
            <div className="section-heading">
              <div>
                <h2>Receipt Monetization</h2>
                <p>Paid citations turn source usage into a receipt trail for publishers and docs teams.</p>
              </div>
              <span className="section-count">{metrics?.paidCitations ?? 0} citations</span>
            </div>
            <div className="receipt-stack">
              <ReceiptRow label="Latest payment" value={shortIdentifier(paymentStatus?.latestPayment?.paymentIdentifier)} />
              <ReceiptRow label="Fulfillment" value={metadataText(paymentStatus?.latestPayment?.metadata, "fulfillmentStatus")} />
              <ReceiptRow label="Seller" value={shortAddress(paymentStatus?.latestPayment?.sellerWallet ?? paymentStatus?.sellerWallet)} />
              <ReceiptRow label="Settlement" value={paymentStatus?.latestEarning?.settlementStatus ?? "waiting"} />
            </div>
          </section>

          <section className="panel span-12">
            <div className="section-heading">
              <div>
                <h2>Receipt Explorer</h2>
                <p>Inspect payment, citation, settlement and fulfillment records from successful and failed paid calls.</p>
              </div>
              <span className="section-count">{receiptExplorer?.totals.payments ?? 0} records</span>
            </div>
            <div className="receipt-kpis">
              <Metric label="Attempted" value={receiptExplorer?.totals.attempted ?? 0} />
              <Metric label="Settled" value={receiptExplorer?.totals.settled ?? 0} />
              <Metric label="Pending" value={receiptExplorer?.totals.pending ?? 0} />
              <Metric label="Failed settlement" value={receiptExplorer?.totals.failedSettlement ?? 0} />
              <Metric label="Delivered" value={receiptExplorer?.totals.delivered ?? 0} />
              <Metric label="Failed fulfillment" value={receiptExplorer?.totals.failedFulfillment ?? 0} />
              <Metric label="Citations" value={receiptExplorer?.totals.citations ?? 0} />
              <Metric label="Settled volume" value={`${(receiptExplorer?.totals.settledUsdc ?? 0).toFixed(6)} USDC`} />
            </div>
            <div className="receipt-table" role="table" aria-label="Receipt explorer">
              <div className="receipt-table-row receipt-table-head" role="row">
                <span>Resource</span>
                <span>Provider</span>
                <span>Amount</span>
                <span>Status</span>
                <span>Receipt</span>
              </div>
              {(receiptExplorer?.entries ?? []).slice(0, 8).map((entry) => (
                <button
                  className={
                    selectedReceiptEntry?.paymentId === entry.paymentId
                      ? "receipt-table-row receipt-table-selected"
                      : "receipt-table-row"
                  }
                  onClick={() => setSelectedReceiptPaymentId(entry.paymentId)}
                  role="row"
                  key={entry.paymentId}
                  type="button"
                >
                  <span>
                    <b>{entry.resourceName}</b>
                    <small>{accessClassLabel(entry.accessClass ?? entry.adapterType)}</small>
                  </span>
                  <span>
                    <b>{entry.providerName}</b>
                    <small>{shortAddress(entry.sellerWallet)}</small>
                  </span>
                  <span>
                    <b>{entry.amountUsdc.toFixed(6)} USDC</b>
                    <small>{shortAddress(entry.buyerWallet)}</small>
                  </span>
                  <span>
                    <b>{entry.paymentStatus}</b>
                    <small>
                      {entry.fulfillmentStatus}/{entry.settlementStatus}
                    </small>
                  </span>
                  <span>
                    <b>{shortIdentifier(entry.paymentIdentifier)}</b>
                    <small>
                      {entry.adapterError ? entry.adapterError : `${entry.citationCount} citations`}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {selectedReceiptEntry ? (
              <div className="settlement-detail">
                <div className="section-heading compact-heading">
                  <div>
                    <h3>{selectedReceiptEntry.resourceName}</h3>
                    <p>
                      {shortIdentifier(selectedReceiptEntry.paymentIdentifier)} · {selectedReceiptEntry.amountUsdc.toFixed(6)} USDC ·{" "}
                      {selectedReceiptEntry.network}
                    </p>
                  </div>
                  <span className="section-count">{selectedReceiptEntry.paymentStatus}</span>
                </div>
                <div className="timeline-grid">
                  {selectedReceiptEntry.timeline.map((item) => (
                    <div className="timeline-card" key={`${selectedReceiptEntry.paymentId}-${item.label}`}>
                      <span>{item.label}</span>
                      <b>{item.status}</b>
                      <small>{item.at ? formatDateTime(item.at) : item.detail}</small>
                    </div>
                  ))}
                </div>
                <div className="settlement-grid">
                  <div className="settlement-card">
                    <strong>Payment Route</strong>
                    <ReceiptRow label="Buyer" value={shortAddress(selectedReceiptEntry.buyerWallet)} />
                    <ReceiptRow label="Seller" value={shortAddress(selectedReceiptEntry.sellerWallet)} />
                    <ReceiptRow label="Provider" value={selectedReceiptEntry.providerName} />
                    <ReceiptRow label="Resource id" value={selectedReceiptEntry.resourceId} />
                  </div>
                  <div className="settlement-card">
                    <strong>Settlement</strong>
                    <ReceiptRow label="Status" value={selectedReceiptEntry.settlementStatus} />
                    <ReceiptRow label="Verifier" value={selectedReceiptEntry.verifiedBy ?? "not verified"} />
                    <ReceiptRow label="Verified at" value={formatDateTime(selectedReceiptEntry.verifiedAt)} />
                    <ReceiptRow label="Settlement ref" value={selectedReceiptEntry.txOrSettlementRef ?? "not provided"} />
                  </div>
                  <div className="settlement-card">
                    <strong>Receipt Payload</strong>
                    <pre className="json-panel">{formatJson(selectedReceiptEntry.receiptPayload)}</pre>
                  </div>
                  <div className="settlement-card">
                    <strong>Settlement Evidence</strong>
                    <pre className="json-panel">{formatJson(selectedReceiptEntry.settlementEvidence)}</pre>
                  </div>
                </div>
                <div className="citation-detail">
                  <strong>Paid citations</strong>
                  {selectedReceiptEntry.citations.length ? (
                    selectedReceiptEntry.citations.map((citation, index) => (
                      <div className="citation-row" key={`${selectedReceiptEntry.paymentId}-citation-${index}`}>
                        <b>{citation.title ?? "Untitled citation"}</b>
                        <span>{citation.sourceUrl ?? "no source url"}</span>
                        {citation.quote ? <p>{citation.quote}</p> : null}
                      </div>
                    ))
                  ) : (
                    <p>No citation receipt attached to this payment.</p>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState text="Run a paid task to inspect settlement and receipt evidence." />
            )}
          </section>

          <section className="panel span-7">
            <div className="section-heading">
              <div>
                <h2>Public API / SDK</h2>
                <p>External builders should be able to make an API, tool, content source or agent service payable without forking their product.</p>
              </div>
              <span className="section-count">access gateway</span>
            </div>
            <pre className="sdk-snippet">
              <code>{sdkExample || "Loading SDK example..."}</code>
            </pre>
          </section>

          <section className="panel span-5">
            <div className="section-heading">
              <div>
                <h2>Trust Layer</h2>
                <p>Risk controls are visible because autonomous spending needs explicit guardrails.</p>
              </div>
              <span className="section-count">{trustSignals.length} controls</span>
            </div>
            <div className="trust-list">
              {trustSignals.map((signal) => (
                <div className="trust-row" key={signal.label}>
                  <span className="proof-status proof-ok">{signal.status}</span>
                  <div>
                    <strong>{signal.label}</strong>
                    <p>{signal.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel span-7 priority-panel task-panel">
            <h2>Agent Task</h2>
            <div className="form">
              <label className="field-label" htmlFor="task-type">
                Task type
              </label>
              <select id="task-type" value={taskType} onChange={(event) => setTaskType(event.target.value as TaskType)}>
                {(Object.keys(taskTypeLabels) as TaskType[]).map((value) => (
                  <option key={value} value={value}>
                    {taskTypeLabels[value]}
                  </option>
                ))}
              </select>

              <div className="segmented-control segmented-three" aria-label="Run mode">
                <button
                  className={taskMode === "full" ? "segment active" : "segment"}
                  type="button"
                  onClick={() => {
                    setTaskMode("full");
                    setPrompt(fullIntegrationPrompt);
                    setBudgetUsdc("0.05");
                  }}
                >
                  Full access flow
                </button>
                <button
                  className={taskMode === "agent" ? "segment active" : "segment"}
                  type="button"
                  onClick={() => setTaskMode("agent")}
                >
                  Agent chooses
                </button>
                <button
                  className={taskMode === "resource" ? "segment active" : "segment"}
                  type="button"
                  onClick={() => setTaskMode("resource")}
                >
                  Choose resource
                </button>
              </div>

              {taskMode === "full" ? (
                <div className="integration-note">
                  <strong>5-class nanopayment access flow</strong>
                  <p>
                    Evaluates premium APIs, MCP tools, publisher content, agent services and usage-based service access
                    in one live agent flow using normal scoring, cache and budget rules.
                  </p>
                </div>
              ) : taskMode === "resource" ? (
                <>
                  <label className="field-label" htmlFor="resource-select">
                    Paid resource
                  </label>
                  <select
                    id="resource-select"
                    value={selectedResourceId}
                    onChange={(event) => setSelectedResourceId(event.target.value)}
                  >
                    {resources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {resource.name} - {resource.priceUsdc.toFixed(6)} USDC
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <p className="helper-text">
                  Agent mode demonstrates autonomous spending: the agent chooses which API, MCP tool, publisher source,
                  agent service or usage-based service deserves payment.
                </p>
              )}

              <label className="field-label" htmlFor="task-prompt">
                Task
              </label>
              <textarea id="task-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <label className="field-label" htmlFor="budget-input">
                Budget USDC
              </label>
              <input
                id="budget-input"
                value={budgetUsdc}
                onChange={(event) => setBudgetUsdc(event.target.value)}
                inputMode="decimal"
              />
              <div className="policy-editor">
                <div>
                  <strong>Payment policy</strong>
                  <p>Controls how much the agent is allowed to spend before it buys paid access.</p>
                </div>
                <div className="policy-presets" aria-label="Payment policy presets">
                  {(Object.entries(policyPresets) as Array<[Exclude<PolicyPreset, "custom">, (typeof policyPresets)[Exclude<PolicyPreset, "custom">]]>).map(
                    ([preset, config]) => (
                      <button
                        className={policyPreset === preset ? "preset-button preset-active" : "preset-button"}
                        key={preset}
                        onClick={() => applyPolicyPreset(preset)}
                        type="button"
                      >
                        {config.label}
                      </button>
                    )
                  )}
                </div>
                <div className="policy-grid">
                  <label>
                    <span>Max spend</span>
                    <input
                      value={policyMaxSpendUsdc}
                      onChange={(event) => {
                        setPolicyPreset("custom");
                        setPolicyMaxSpendUsdc(event.target.value);
                      }}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span>Max price / call</span>
                    <input
                      value={policyMaxPricePerCallUsdc}
                      onChange={(event) => {
                        setPolicyPreset("custom");
                        setPolicyMaxPricePerCallUsdc(event.target.value);
                      }}
                      inputMode="decimal"
                    />
                  </label>
                  <label>
                    <span>Cache mode</span>
                    <select
                      value={policyCacheMode}
                      onChange={(event) => {
                        setPolicyPreset("custom");
                        setPolicyCacheMode(event.target.value as "reuse" | "refresh" | "ignore");
                      }}
                    >
                      <option value="reuse">Reuse paid cache</option>
                      <option value="refresh">Refresh paid access</option>
                      <option value="ignore">Ignore cache</option>
                    </select>
                  </label>
                  <label className="policy-check">
                    <input
                      type="checkbox"
                      checked={policyRequireCitations}
                      onChange={(event) => {
                        setPolicyPreset("custom");
                        setPolicyRequireCitations(event.target.checked);
                      }}
                    />
                    <span>Require citation receipts</span>
                  </label>
                </div>
              </div>
              <button className="button" onClick={startRun} disabled={loading}>
                {loading ? "Running agent..." : taskMode === "full" ? "Run full access flow" : "Run paid agent"}
              </button>
              {error ? <p className="status-error">{error}</p> : null}
              <p>{paymentSummary}</p>
            </div>
          </section>

          <section className="panel span-5 priority-panel terminal-panel">
            <h2>Task Terminal</h2>
            <div className="terminal compact-terminal" role="log" aria-live="polite">
              {terminalLines.map((line, index) => (
                <div className={line.includes("ERROR") ? "terminal-line terminal-error" : "terminal-line"} key={`${line}-${index}`}>
                  {line}
                </div>
              ))}
            </div>
          </section>

          <section className="panel span-12">
            <h2>Run Summary</h2>
            <div className="summary-grid">
              <SummaryItem label="Task type" value={runSummary.taskType} />
              <SummaryItem label="Mode" value={runSummary.mode} />
              <SummaryItem label="Budget" value={runSummary.budget} />
              <SummaryItem label="Spent" value={runSummary.spent} {...(run?.totalSpendUsdc ? { tone: "paid" as const } : {})} />
              <SummaryItem label="Saved" value={runSummary.saved} />
              <SummaryItem label="Paid resources" value={runSummary.paidResources} tone="paid" />
              <SummaryItem label="Access fulfilled" value={adapterCoverage.completed} tone="paid" />
              <SummaryItem label="Skipped" value={runSummary.skippedResources} tone="skipped" />
              <SummaryItem label="Cache used" value={runSummary.cacheHits} tone="cache" />
              <SummaryItem label="Policy max spend" value={runSummary.policyMaxSpend} />
              <SummaryItem label="Policy max price" value={runSummary.policyMaxPrice} />
              <SummaryItem label="Policy cache" value={runSummary.policyCache} tone="cache" />
              <SummaryItem label="Citation rule" value={runSummary.policyCitations} />
            </div>
            <div className="adapter-coverage">
              {adapterCoverage.items.map((item) => (
                <span className={item.ok ? "coverage-pill coverage-ok" : "coverage-pill"} key={item.resourceId}>
                  {item.label}
                </span>
              ))}
            </div>
            <div className="summary-answer">
              <strong>Final answer</strong>
              <p>{runSummary.answer}</p>
            </div>
            <div className="summary-lists">
              <div>
                <strong>Provider earnings</strong>
                {run?.output.payments.length ? (
                  <div className="mini-ledger">
                    {run.output.payments.map((payment) => (
                      <div className="ledger-line" key={payment.paymentIdentifier}>
                        <span>{resourceName(resources, payment.resourceId)}</span>
                        <b>{payment.amountUsdc.toFixed(6)} USDC</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Provider earnings appear here after the agent pays for a resource." />
                )}
              </div>
              <div>
                <strong>Paid citations</strong>
                {run?.output.paidCitations.length ? (
                  <div className="mini-ledger">
                    {run.output.paidCitations.map((citation, index) => (
                      <div className="ledger-line" key={`${citation.title}-${index}`}>
                        <span>{citation.title}</span>
                        <b>{citation.sourceUrl ? "source" : "receipt"}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState text="Citation receipts appear when the agent buys publisher content or MCP source tools." />
                )}
              </div>
            </div>
          </section>

          <section className="panel span-7">
            <h2>Agent Decisions</h2>
            <div className="decision-list">
              {run?.output.decisions.length ? (
                run.output.decisions.map((decision) => (
                  <div className={`decision-row decision-${decision.decision}`} key={`${decision.resourceId}-${decision.decision}`}>
                    <div className="decision-heading">
                      <span className={`decision-pill decision-pill-${decision.decision}`}>
                        {decisionLabel(decision.decision)}
                      </span>
                      <strong>{resourceName(resources, decision.resourceId)}</strong>
                    </div>
                    <p>{decisionPlainEnglish(decision.decision)}</p>
                    <div className="row-meta">
                      <span>score {decision.score.toFixed(2)}</span>
                      <span>{decision.reason}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState text="Agent decisions will show pay, skip and cache reasoning for each eligible resource." />
              )}
            </div>
          </section>

          <section className="panel span-5">
            <h2>Creator / Provider Earnings</h2>
            <div className="decision-list">
              {run?.output.payments.length ? (
                run.output.payments.map((payment) => (
                  <div className="decision-row" key={payment.paymentIdentifier}>
                    <strong>{resourceName(resources, payment.resourceId)}</strong>
                    <div className="row-meta">
                      <span>{payment.amountUsdc.toFixed(6)} USDC</span>
                      <span>{payment.status}</span>
                      <span>{shortIdentifier(payment.paymentIdentifier)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState text="No provider has earned yet. Start a paid run to populate this ledger." />
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function BootstrapStep({ label, text }: { label: string; text: string }) {
  return (
    <div className="bootstrap-step">
      <strong>{label}</strong>
      <p>{text}</p>
    </div>
  );
}

function PaymentFlowStep({
  eyebrow,
  title,
  value,
  detail
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="payment-step">
      <span>{eyebrow}</span>
      <strong>{title}</strong>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}

function PolicyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="policy-item">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <strong>Waiting for activity</strong>
      <p>{text}</p>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone
}: {
  label: string;
  value: string | number;
  tone?: "paid" | "skipped" | "cache";
}) {
  return (
    <div className={tone ? `summary-item summary-${tone}` : "summary-item"}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function buildRunSummary(run: AgentRun | null, taskMode: TaskMode, taskType: TaskType) {
  if (!run) {
    return {
      taskType: taskTypeLabels[taskType],
      mode: taskModeLabel(taskMode),
      budget: "0.000000 USDC",
      spent: "0.000000 USDC",
      saved: "0.000000 USDC",
      paidResources: 0,
      skippedResources: 0,
      cacheHits: 0,
      policyMaxSpend: "Not run",
      policyMaxPrice: "Not run",
      policyCache: "Not run",
      policyCitations: "Not run",
      answer: "Run a task to see what the agent paid for, skipped, and returned."
    };
  }

  const cacheHits = run.output.decisions.filter((decision) => decision.decision === "cache").length;
  const savedUsdc = Math.max(run.budgetUsdc - run.totalSpendUsdc, 0);
  const policy = run.output.policy;

  return {
    taskType: taskMode === "full" ? "Full integration run" : taskTypeLabels[taskType],
    mode: taskModeLabel(taskMode),
    budget: `${run.budgetUsdc.toFixed(6)} USDC`,
    spent: `${run.totalSpendUsdc.toFixed(6)} USDC`,
    saved: `${savedUsdc.toFixed(6)} USDC`,
    paidResources: run.output.payments.length,
    skippedResources: run.output.skippedSources.length,
    cacheHits,
    policyMaxSpend: policy ? `${policy.maxSpendUsdc.toFixed(6)} USDC` : "Not recorded",
    policyMaxPrice:
      policy?.maxPricePerCallUsdc !== undefined ? `${policy.maxPricePerCallUsdc.toFixed(6)} USDC` : "No cap",
    policyCache: policy ? policy.cacheMode : "Not recorded",
    policyCitations: policy ? (policy.requireCitations ? "Required" : "Optional") : "Not recorded",
    answer: run.output.answer || "The run completed without a final answer."
  };
}

function taskModeLabel(taskMode: TaskMode) {
  if (taskMode === "full") return "Full access flow";
  if (taskMode === "agent") return "Agent chooses";
  return "Choose resource";
}

function buildAdapterCoverage(run: AgentRun | null, resources: Resource[]) {
  const items = resources.map((resource) => {
    const result = run?.output.adapterResults.find((candidate) => candidate.resourceId === resource.id);
    return {
      resourceId: resource.id,
      label: accessClassLabel(resource.accessClass),
      ok: result?.status === "ok"
    };
  });
  return {
    completed: `${items.filter((item) => item.ok).length}/${resources.length || 5}`,
    items
  };
}

function buildLiveProofs(resources: Resource[], resourceProofs: ResourceProof[], run: AgentRun | null) {
  return resources.map((resource) => {
    const proof = resourceProofs.find((candidate) => candidate.resourceId === resource.id);
    const result = run?.output.adapterResults.find((candidate) => candidate.resourceId === resource.id);
    const decision = run?.output.decisions.find((candidate) => candidate.resourceId === resource.id);
    return {
      resourceId: resource.id,
      resourceName: resource.name,
      label: accessClassLabel(resource.accessClass),
      upstream: proof?.upstream ?? "not loaded",
      priceUsdc: resource.priceUsdc,
      expectedValue: resource.expectedValue,
      status: result?.status === "ok" ? "ok" : "pending",
      statusLabel: result?.status === "ok" ? "executed" : decision?.decision ?? "ready",
      manifestUrl: proof?.manifestUrl ?? `/api/resources/${resource.id}/manifest`
    };
  });
}

function adapterLabel(adapterType: string) {
  if (adapterType === "mcp") return "MCP";
  if (adapterType === "api_proxy") return "API";
  if (adapterType === "agent_delegation") return "Delegation";
  if (adapterType === "inference") return "Inference";
  if (adapterType === "rss_paywall") return "RSS";
  return adapterType;
}

function accessClassLabel(adapterType: string) {
  if (adapterType === "premium_api") return "Premium API call";
  if (adapterType === "mcp_tool") return "MCP tool call";
  if (adapterType === "publisher_content") return "Publisher content";
  if (adapterType === "agent_service") return "Agent service";
  if (adapterType === "usage_service") return "Usage-based service";
  if (adapterType === "api_proxy") return "Premium API call";
  if (adapterType === "mcp") return "MCP tool call";
  if (adapterType === "rss_paywall") return "Publisher content";
  if (adapterType === "agent_delegation") return "Agent service";
  if (adapterType === "inference") return "Usage-based service";
  return adapterLabel(adapterType);
}

function accessClassesForAdapters(adapterTypes: string[]) {
  return adapterTypes.map((adapterType) => {
    if (adapterType === "api_proxy") return "premium_api";
    if (adapterType === "mcp") return "mcp_tool";
    if (adapterType === "rss_paywall") return "publisher_content";
    if (adapterType === "agent_delegation") return "agent_service";
    if (adapterType === "inference") return "usage_service";
    return "premium_api";
  });
}

function primaryConfigLabel(accessClass: string) {
  if (accessClass === "mcp_tool") return "MCP server URL";
  if (accessClass === "publisher_content") return "Publisher paywall endpoint";
  if (accessClass === "agent_service") return "Agent service endpoint";
  if (accessClass === "usage_service") return "Usage service endpoint";
  return "Premium API endpoint";
}

function primaryConfigKey(accessClass: string) {
  return accessClass === "mcp_tool" ? "serverUrl" : "targetUrl";
}

function primaryConfigValue(configJson: string, accessClass: string) {
  try {
    const config = JSON.parse(configJson) as Record<string, unknown>;
    const value = config[primaryConfigKey(accessClass)];
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function updatePrimaryConfigValue(configJson: string, accessClass: string, value: string) {
  try {
    const config = JSON.parse(configJson) as Record<string, unknown>;
    config[primaryConfigKey(accessClass)] = value;
    return JSON.stringify(config, null, 2);
  } catch {
    return configJson;
  }
}

function resourceName(resources: Resource[], resourceId: string) {
  return resources.find((resource) => resource.id === resourceId)?.name ?? resourceId;
}

function decisionLabel(decision: string) {
  if (decision === "pay") return "Paid";
  if (decision === "skip") return "Skipped";
  if (decision === "cache") return "Cache";
  return decision;
}

function decisionPlainEnglish(decision: string) {
  if (decision === "pay") return "The agent decided this resource was worth paying for.";
  if (decision === "skip") return "The agent decided not to spend budget on this resource.";
  if (decision === "cache") return "The agent reused a previous paid artifact, so no new payment was needed.";
  return "The agent recorded a decision for this resource.";
}

async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onLine: (line: string) => void;
    onRun: (run: AgentRun) => void;
  }
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice(6)) as
        | { type: "terminal"; message: string }
        | { type: "error"; message: string }
        | { type: "run"; run: AgentRun };

      if (payload.type === "run") {
        handlers.onRun(payload.run);
      } else {
        handlers.onLine(payload.message);
      }
    }
  }
}

function shortAddress(value: string | undefined | null) {
  if (!value) return "not configured";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function shortIdentifier(value: string | undefined | null) {
  if (!value) return "no receipt";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

function metadataText(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : "waiting";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatJson(value: unknown) {
  if (value === null || value === undefined) return "not recorded";
  return JSON.stringify(value, null, 2);
}
