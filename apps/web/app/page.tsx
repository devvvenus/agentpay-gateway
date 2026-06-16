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
  adapterType: string;
  priceUsdc: number;
  expectedValue: number;
  freshnessScore: number;
  confidenceScore: number;
};

type ResourceProof = {
  resourceId: string;
  adapterType: string;
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
  resourceName: string;
  adapterType: string;
  providerName: string;
  amountUsdc: number;
  buyerWallet: string;
  sellerWallet: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  settlementStatus: string;
  receiptId: string | null;
  citationCount: number;
  adapterError: string | null;
  createdAt: string;
};

type ReceiptExplorer = {
  entries: ReceiptExplorerEntry[];
  totals: {
    payments: number;
    settled: number;
    delivered: number;
    failedFulfillment: number;
    citations: number;
  };
};

type TaskMode = "full" | "agent" | "resource";
type TaskType =
  | "research"
  | "dataset"
  | "crawl"
  | "delegation"
  | "memory"
  | "inference"
  | "rss"
  | "search"
  | "docs"
  | "api"
  | "tool";

type AgentRun = {
  id: string;
  prompt: string;
  budgetUsdc: number;
  status: string;
  totalSpendUsdc: number;
  output: {
    answer: string;
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
  "Research creator and publisher distribution opportunities on Arc. You have a 0.05 USDC budget. Decide which paid tools, APIs, datasets, crawls, specialist agents, memories, inference endpoints, searches, RSS paywalls and docs are worth buying. Produce an answer with paid citations, skipped sources, total spend, budget efficiency and creator/provider earnings.";

const fullIntegrationPrompt =
  "Evaluate the full paid resource catalog on Arc: MCP tool, publisher API, creator dataset, article crawl, agent-to-agent delegation, paid memory retrieval, paid inference, publisher RSS paywall, research search, and docs/source citation. Let the agent decide what is worth paying for, what should be skipped, and what can be reused from cache. Show total spend, upstream adapter execution, citation receipts, and provider earnings.";

const taskTypeLabels: Record<TaskType, string> = {
  research: "Research task",
  dataset: "Dataset query",
  crawl: "Article crawl",
  delegation: "Agent-to-agent delegation",
  memory: "Memory retrieval",
  inference: "Inference endpoint",
  rss: "Publisher/RSS paywall",
  search: "Research search",
  docs: "Docs/source citation",
  api: "Publisher API call",
  tool: "Agent tool call"
};

const taskTypeAdapters: Partial<Record<TaskType, string[]>> = {
  dataset: ["dataset"],
  crawl: ["crawl"],
  delegation: ["agent_delegation"],
  memory: ["memory_retrieval"],
  inference: ["inference"],
  rss: ["rss_paywall"],
  search: ["search"],
  docs: ["docs_source"],
  api: ["api_proxy"],
  tool: ["mcp"]
};

const adapterTypeOptions = [
  "mcp",
  "api_proxy",
  "dataset",
  "crawl",
  "agent_delegation",
  "memory_retrieval",
  "inference",
  "rss_paywall",
  "search",
  "docs_source"
];

const defaultPublisherConfig = JSON.stringify(
  {
    targetUrl: "https://docs.x402.org/",
    method: "GET"
  },
  null,
  2
);

const defaultSdkExample = [
  "import { protect } from '@agentpay/sdk';",
  "",
  "export const GET = protect(handler, {",
  "  price: '0.001 USDC',",
  "  network: 'eip155:5042002',",
  "  seller: process.env.SELLER_ADDRESS!,",
  "  resourceId: 'premium_api'",
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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [taskMode, setTaskMode] = useState<TaskMode>("agent");
  const [taskType, setTaskType] = useState<TaskType>("research");
  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [terminalLines, setTerminalLines] = useState<string[]>([
    "PS AgentPay> waiting for a task",
    "Use agent mode for autonomous source selection, or choose a single paid resource."
  ]);
  const [publishProviderId, setPublishProviderId] = useState("");
  const [publishName, setPublishName] = useState("Paid Partner API");
  const [publishDescription, setPublishDescription] = useState("A partner endpoint agents can buy per request.");
  const [publishAdapterType, setPublishAdapterType] = useState("api_proxy");
  const [publishPriceUsdc, setPublishPriceUsdc] = useState("0.0013");
  const [publishExpectedValue, setPublishExpectedValue] = useState("0.72");
  const [publishFreshnessScore, setPublishFreshnessScore] = useState("0.70");
  const [publishConfidenceScore, setPublishConfidenceScore] = useState("0.74");
  const [publishConfig, setPublishConfig] = useState(defaultPublisherConfig);
  const [publishing, setPublishing] = useState(false);
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
    const firstProvider = providers[0];
    if (!publishProviderId && firstProvider) {
      setPublishProviderId(firstProvider.id);
    }
  }, [providers, publishProviderId]);

  async function startRun() {
    setLoading(true);
    setError(null);
    const selectedResource = resources.find((resource) => resource.id === selectedResourceId);
    const allowedAdapterTypes = taskMode === "agent" ? taskTypeAdapters[taskType] : undefined;
    const fullIntegrationResourceIds = resources.map((resource) => resource.id);
    const allowedResourceIds = taskMode === "resource" && selectedResource ? [selectedResource.id] : undefined;
    const runPrompt = taskMode === "full" ? fullIntegrationPrompt : prompt;
    const runBudgetUsdc = taskMode === "full" ? 0.05 : Number(budgetUsdc);
    setTerminalLines([
      `PS AgentPay> task mode: ${taskModeLabel(taskMode)}`,
      `PS AgentPay> task type: ${taskMode === "full" ? "full integration run" : taskTypeLabels[taskType]}`,
      `PS AgentPay> budget: ${runBudgetUsdc.toFixed(6)} USDC`,
      taskMode === "full"
        ? `PS AgentPay> eligible resources: ${fullIntegrationResourceIds.length} paid adapters`
        : allowedResourceIds
        ? `PS AgentPay> selected resource: ${selectedResource?.name ?? selectedResourceId}`
        : `PS AgentPay> eligible adapters: ${allowedAdapterTypes?.join(", ") ?? "all"}`,
      ...(taskMode === "full"
        ? ["PS AgentPay> live scoring enabled; normal cache and budget rules are active"]
        : []),
      "PS AgentPay> scoring resources by value, freshness, confidence and cost fit...",
      "PS AgentPay> executing paid adapter calls when score and budget allow..."
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
          ...(allowedResourceIds ? { allowedResourceIds } : {})
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
          adapterType: publishAdapterType,
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

  const paymentSummary = useMemo(() => {
    if (!run) return "No run yet.";
    return `${run.output.payments.length} paid calls, ${run.totalSpendUsdc.toFixed(6)} USDC spent, ${run.output.paidCitations.length} citation receipts.`;
  }, [run]);
  const runSummary = useMemo(() => buildRunSummary(run, taskMode, taskType), [run, taskMode, taskType]);
  const adapterCoverage = useMemo(() => buildAdapterCoverage(run, resources), [run, resources]);
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
          <span>Adapter Lab</span>
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
              <span>10 live adapters</span>
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
                text="Creators, docs teams, API owners and data providers expose paid resources through adapters."
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
                <p>Any creator, publisher, API owner or data provider can list a paid resource for agents to buy per task.</p>
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
                  <h3>Publish a paid resource</h3>
                  <p>Register a real adapter/proxy resource that agents can immediately discover, score and buy.</p>
                </div>
                <span className="section-count">provider action</span>
              </div>
              <div className="publish-grid">
                <label>
                  <span>Provider</span>
                  <select value={publishProviderId} onChange={(event) => setPublishProviderId(event.target.value)}>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Adapter</span>
                  <select value={publishAdapterType} onChange={(event) => setPublishAdapterType(event.target.value)}>
                    {adapterTypeOptions.map((adapterType) => (
                      <option key={adapterType} value={adapterType}>
                        {adapterLabel(adapterType)}
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
                <label className="publish-config">
                  <span>Adapter config JSON</span>
                  <textarea value={publishConfig} onChange={(event) => setPublishConfig(event.target.value)} />
                </label>
              </div>
              <div className="publish-actions">
                <button className="button secondary-button" type="button" onClick={publishResource} disabled={publishing}>
                  {publishing ? "Publishing..." : "Publish resource"}
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
                <span>Agent budget wallet pays for useful creator resources</span>
              </div>
              <div className="metric">
                <b>Seller wallets</b>
                <span>{providers.length} creator/provider wallets can earn</span>
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
                <p>Resources the agent can buy when score, budget and cache rules justify the spend.</p>
              </div>
              <span className="section-count">{resources.length} resources</span>
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
                value={latestResource ? adapterLabel(latestResource.adapterType) : "waiting"}
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
              <Metric label="Settled" value={receiptExplorer?.totals.settled ?? 0} />
              <Metric label="Delivered" value={receiptExplorer?.totals.delivered ?? 0} />
              <Metric label="Failed fulfillment" value={receiptExplorer?.totals.failedFulfillment ?? 0} />
              <Metric label="Citations" value={receiptExplorer?.totals.citations ?? 0} />
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
                <div className="receipt-table-row" role="row" key={entry.paymentId}>
                  <span>
                    <b>{entry.resourceName}</b>
                    <small>{adapterLabel(entry.adapterType)}</small>
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
                </div>
              ))}
            </div>
          </section>

          <section className="panel span-7">
            <div className="section-heading">
              <div>
                <h2>Public API / SDK</h2>
                <p>External builders should be able to make an endpoint agent-payable without forking their product.</p>
              </div>
              <span className="section-count">adapter/proxy</span>
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
                  Full integration
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
                  <strong>10 adapter integration</strong>
                  <p>
                    Evaluates tools, APIs, datasets, crawls, delegated agents, paid memory, inference, RSS paywalls,
                    search and docs/source citations in one live agent flow using normal scoring, cache and budget rules.
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
                  Agent mode demonstrates autonomous distribution: the agent chooses which creator, publisher, API,
                  dataset, crawl, memory, inference, search or docs source deserves payment.
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
              <button className="button" onClick={startRun} disabled={loading}>
                {loading ? "Running agent..." : taskMode === "full" ? "Run full integration" : "Run paid agent"}
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
              <SummaryItem label="Adapters completed" value={adapterCoverage.completed} tone="paid" />
              <SummaryItem label="Skipped" value={runSummary.skippedResources} tone="skipped" />
              <SummaryItem label="Cache used" value={runSummary.cacheHits} tone="cache" />
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
                  <EmptyState text="Citation receipts appear when the agent buys publisher or docs sources." />
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
      answer: "Run a task to see what the agent paid for, skipped, and returned."
    };
  }

  const cacheHits = run.output.decisions.filter((decision) => decision.decision === "cache").length;
  const savedUsdc = Math.max(run.budgetUsdc - run.totalSpendUsdc, 0);

  return {
    taskType: taskMode === "full" ? "Full integration run" : taskTypeLabels[taskType],
    mode: taskModeLabel(taskMode),
    budget: `${run.budgetUsdc.toFixed(6)} USDC`,
    spent: `${run.totalSpendUsdc.toFixed(6)} USDC`,
    saved: `${savedUsdc.toFixed(6)} USDC`,
    paidResources: run.output.payments.length,
    skippedResources: run.output.skippedSources.length,
    cacheHits,
    answer: run.output.answer || "The run completed without a final answer."
  };
}

function taskModeLabel(taskMode: TaskMode) {
  if (taskMode === "full") return "Full integration";
  if (taskMode === "agent") return "Agent chooses";
  return "Choose resource";
}

function buildAdapterCoverage(run: AgentRun | null, resources: Resource[]) {
  const items = resources.map((resource) => {
    const result = run?.output.adapterResults.find((candidate) => candidate.resourceId === resource.id);
    return {
      resourceId: resource.id,
      label: adapterLabel(resource.adapterType),
      ok: result?.status === "ok"
    };
  });
  return {
    completed: `${items.filter((item) => item.ok).length}/${resources.length || 10}`,
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
      label: adapterLabel(resource.adapterType),
      upstream: proof?.upstream ?? "not loaded",
      priceUsdc: resource.priceUsdc,
      expectedValue: resource.expectedValue,
      status: result?.status === "ok" ? "ok" : "pending",
      statusLabel: result?.status === "ok" ? "executed" : decision?.decision ?? "ready"
    };
  });
}

function adapterLabel(adapterType: string) {
  if (adapterType === "mcp") return "MCP";
  if (adapterType === "api_proxy") return "API";
  if (adapterType === "dataset") return "Dataset";
  if (adapterType === "crawl") return "Crawl";
  if (adapterType === "agent_delegation") return "Delegation";
  if (adapterType === "memory_retrieval") return "Memory";
  if (adapterType === "inference") return "Inference";
  if (adapterType === "rss_paywall") return "RSS";
  if (adapterType === "search") return "Search";
  if (adapterType === "docs_source") return "Docs";
  return adapterType;
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
