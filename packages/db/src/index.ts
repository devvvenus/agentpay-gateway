import {
  type AdapterConfig,
  type AgentDecision,
  type AgentRun,
  type AgentRunOutput,
  type AgentStep,
  type CachedArtifact,
  type Metrics,
  type PaymentEvent,
  type Provider,
  type ProviderEarning,
  type Receipt,
  type Resource,
  createId,
  nowIso,
  roundUsdc
} from "@agentpay/shared";

export interface StoreSeed {
  providers: Provider[];
  resources: Resource[];
  adapterConfigs: AdapterConfig[];
}

export interface StoreSnapshot {
  providers?: Provider[];
  resources?: Resource[];
  adapterConfigs?: AdapterConfig[];
  runs?: AgentRun[];
  paymentEvents?: PaymentEvent[];
  receipts?: Receipt[];
  earnings?: ProviderEarning[];
}

export interface CreateRunInput {
  prompt: string;
  budgetUsdc: number;
}

export class AgentPayStore {
  private providers = new Map<string, Provider>();
  private resources = new Map<string, Resource>();
  private adapterConfigs = new Map<string, AdapterConfig>();
  private runs = new Map<string, AgentRun>();
  private decisions = new Map<string, AgentDecision[]>();
  private steps = new Map<string, AgentStep[]>();
  private paymentEvents = new Map<string, PaymentEvent>();
  private receipts = new Map<string, Receipt>();
  private earnings = new Map<string, ProviderEarning>();
  private cachedArtifacts = new Map<string, CachedArtifact>();
  private onChange: ((snapshot: StoreSnapshot) => void) | undefined;

  constructor(seed?: StoreSeed, snapshot?: StoreSnapshot, onChange?: (snapshot: StoreSnapshot) => void) {
    this.onChange = onChange;
    if (seed) {
      for (const provider of seed.providers) this.providers.set(provider.id, provider);
      for (const resource of seed.resources) this.resources.set(resource.id, resource);
      for (const config of seed.adapterConfigs) this.adapterConfigs.set(config.resourceId, config);
    }
    this.hydrate(snapshot);
  }

  listProviders(): Provider[] {
    return [...this.providers.values()];
  }

  getProvider(id: string): Provider | undefined {
    return this.providers.get(id);
  }

  upsertProvider(provider: Provider): Provider {
    this.providers.set(provider.id, provider);
    return provider;
  }

  listResources(): Resource[] {
    return [...this.resources.values()].filter((resource) => resource.enabled);
  }

  getResource(id: string): Resource | undefined {
    return this.resources.get(id);
  }

  upsertResource(resource: Resource, config: AdapterConfig): Resource {
    this.resources.set(resource.id, resource);
    this.adapterConfigs.set(resource.id, config);
    return resource;
  }

  getAdapterConfig(resourceId: string): AdapterConfig | undefined {
    return this.adapterConfigs.get(resourceId);
  }

  createRun(input: CreateRunInput): AgentRun {
    const run: AgentRun = {
      id: createId("run"),
      prompt: input.prompt,
      budgetUsdc: input.budgetUsdc,
      status: "queued",
      totalSpendUsdc: 0,
      output: emptyRunOutput(),
      createdAt: nowIso()
    };
    this.runs.set(run.id, run);
    this.decisions.set(run.id, []);
    this.steps.set(run.id, []);
    this.persist();
    return run;
  }

  updateRun(run: AgentRun): AgentRun {
    this.runs.set(run.id, run);
    this.persist();
    return run;
  }

  getRun(id: string): AgentRun | undefined {
    return this.runs.get(id);
  }

  listRuns(): AgentRun[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addDecision(decision: AgentDecision): AgentDecision {
    const current = this.decisions.get(decision.runId) ?? [];
    current.push(decision);
    this.decisions.set(decision.runId, current);
    return decision;
  }

  listDecisions(runId: string): AgentDecision[] {
    return this.decisions.get(runId) ?? [];
  }

  addStep(step: AgentStep): AgentStep {
    const current = this.steps.get(step.runId) ?? [];
    current.push(step);
    this.steps.set(step.runId, current);
    return step;
  }

  listSteps(runId: string): AgentStep[] {
    return this.steps.get(runId) ?? [];
  }

  addPaymentEvent(event: PaymentEvent): PaymentEvent {
    const existing = [...this.paymentEvents.values()].find(
      (payment) => payment.paymentIdentifier === event.paymentIdentifier
    );
    if (existing) {
      return { ...existing, status: "replayed" };
    }
    this.paymentEvents.set(event.id, event);
    this.persist();
    return event;
  }

  updatePaymentEventStatus(
    paymentIdentifier: string,
    status: PaymentEvent["status"],
    metadata: Record<string, unknown> = {}
  ): PaymentEvent | undefined {
    const existing = [...this.paymentEvents.values()].find(
      (payment) => payment.paymentIdentifier === paymentIdentifier
    );
    if (!existing) return undefined;
    const updated: PaymentEvent = {
      ...existing,
      status,
      metadata: {
        ...existing.metadata,
        ...metadata
      }
    };
    this.paymentEvents.set(existing.id, updated);
    const earning = [...this.earnings.values()]
      .filter(
        (candidate) =>
          candidate.resourceId === updated.resourceId &&
          candidate.amountUsdc === updated.amountUsdc &&
          candidate.settlementStatus === "pending"
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (earning) {
      this.earnings.set(earning.id, {
        ...earning,
        settlementStatus:
          status === "settled"
            ? "settled"
            : status === "failed" || status === "verification_failed"
              ? "failed"
              : earning.settlementStatus
      });
    }
    this.persist();
    return updated;
  }

  listPaymentEvents(): PaymentEvent[] {
    return [...this.paymentEvents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  addReceipt(receipt: Receipt): Receipt {
    this.receipts.set(receipt.id, receipt);
    this.persist();
    return receipt;
  }

  listReceipts(): Receipt[] {
    return [...this.receipts.values()];
  }

  addProviderEarning(earning: ProviderEarning): ProviderEarning {
    this.earnings.set(earning.id, earning);
    this.persist();
    return earning;
  }

  listProviderEarnings(): ProviderEarning[] {
    return [...this.earnings.values()];
  }

  getCachedArtifact(resourceId: string, cacheKey: string): CachedArtifact | undefined {
    const cached = this.cachedArtifacts.get(`${resourceId}:${cacheKey}`);
    if (!cached) return undefined;
    if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
      this.cachedArtifacts.delete(`${resourceId}:${cacheKey}`);
      return undefined;
    }
    return cached;
  }

  setCachedArtifact(artifact: CachedArtifact): CachedArtifact {
    this.cachedArtifacts.set(`${artifact.resourceId}:${artifact.cacheKey}`, artifact);
    return artifact;
  }

  snapshot(): StoreSnapshot {
    return {
      providers: this.listProviders(),
      resources: this.listResources(),
      adapterConfigs: [...this.adapterConfigs.values()],
      runs: this.listRuns(),
      paymentEvents: this.listPaymentEvents(),
      receipts: this.listReceipts(),
      earnings: this.listProviderEarnings()
    };
  }

  private hydrate(snapshot?: StoreSnapshot) {
    for (const provider of snapshot?.providers ?? []) this.providers.set(provider.id, provider);
    for (const resource of snapshot?.resources ?? []) this.resources.set(resource.id, resource);
    for (const config of snapshot?.adapterConfigs ?? []) this.adapterConfigs.set(config.resourceId, config);
    for (const run of snapshot?.runs ?? []) this.runs.set(run.id, run);
    for (const event of snapshot?.paymentEvents ?? []) this.paymentEvents.set(event.id, event);
    for (const receipt of snapshot?.receipts ?? []) this.receipts.set(receipt.id, receipt);
    for (const earning of snapshot?.earnings ?? []) this.earnings.set(earning.id, earning);
  }

  private persist() {
    this.onChange?.(this.snapshot());
  }

  metrics(): Metrics {
    const allPaymentEvents = this.listPaymentEvents().filter((event) => event.status !== "replayed");
    const paymentEvents = allPaymentEvents.filter((event) => ["authorized", "settled"].includes(event.status));
    const settledEvents = allPaymentEvents.filter((event) => event.status === "settled");
    const failedEvents = allPaymentEvents.filter((event) => event.status === "failed" || event.status === "verification_failed");
    const pendingEvents = allPaymentEvents.filter((event) => event.status === "pending_verification");
    const attemptedUsdcVolume = roundUsdc(allPaymentEvents.reduce((sum, event) => sum + event.amountUsdc, 0));
    const settledUsdcVolume = roundUsdc(settledEvents.reduce((sum, event) => sum + event.amountUsdc, 0));
    const totalUsdcVolume = settledUsdcVolume;
    const adapterBreakdown = this.listResources().reduce(
      (acc, resource) => {
        acc[resource.adapterType] = paymentEvents.filter((event) => event.adapterType === resource.adapterType).length;
        return acc;
      },
      {
        mcp: 0,
        api_proxy: 0,
        dataset: 0,
        crawl: 0,
        agent_delegation: 0,
        memory_retrieval: 0,
        inference: 0,
        rss_paywall: 0,
        search: 0,
        docs_source: 0
      } as Metrics["adapterBreakdown"]
    );

    return {
      users: 1,
      providers: this.providers.size,
      resources: this.resources.size,
      agentRuns: this.runs.size,
      paidCalls: paymentEvents.length,
      attemptedPaidCalls: allPaymentEvents.length,
      settledPaidCalls: settledEvents.length,
      failedPaidCalls: failedEvents.length,
      pendingVerificationCalls: pendingEvents.length,
      attemptedUsdcVolume,
      settledUsdcVolume,
      paidCitations: this.listReceipts().reduce((sum, receipt) => {
        const citations = receipt.receipt["citations"];
        return sum + (Array.isArray(citations) ? citations.length : 0);
      }, 0),
      totalUsdcVolume,
      averagePaymentUsdc: paymentEvents.length ? roundUsdc(totalUsdcVolume / paymentEvents.length) : 0,
      providersPaid: new Set([...this.earnings.values()].map((earning) => earning.providerId)).size,
      adapterBreakdown
    };
  }
}

export function emptyRunOutput(): AgentRunOutput {
  return {
    answer: "",
    paidCitations: [],
    skippedSources: [],
    payments: [],
    decisions: [],
    budgetEfficiency: 0,
    adapterResults: []
  };
}
