"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const HeroScene = dynamic(() => import("./components/HeroScene"), { ssr: false });

type Metrics = {
  agentRuns: number;
  settledPaidCalls: number;
  totalUsdcVolume: number;
  paidCitations: number;
  providersPaid: number;
};

type Resource = {
  id: string;
  name: string;
  accessClass: string;
  adapterType: string;
  priceUsdc: number;
};

type WalletStatus = {
  paymentMode: string;
  network: string;
  walletBalance:
    | { ok: true; amount: string; token: string }
    | { ok: false; error: string };
  gatewayBalance:
    | { ok: true; amount: string; token: string }
    | { ok: false; error: string };
};

type PaymentStatus = {
  latestPayment: null | {
    resourceId: string;
    amountUsdc: number;
    status: string;
    paymentIdentifier: string;
    metadata: Record<string, unknown>;
  };
  latestReceipt: null | {
    resourceId: string;
    createdAt: string;
  };
  latestEarning: null | {
    providerId: string;
    amountUsdc: number;
    settlementStatus: string;
  };
};

type AgentRun = {
  id: string;
  status: string;
  totalSpendUsdc: number;
  output?: {
    answer?: string;
    payments?: Array<{ resourceId: string; amountUsdc: number; status: string }>;
    paidCitations?: Array<{ title: string; sourceUrl?: string }>;
    skippedSources?: Array<{ resourceId: string; reason: string }>;
    adapterResults?: Array<{ resourceId: string; status: string; adapterType: string }>;
  };
};

const prompt =
  "Evaluate which paid internet resources are worth buying for an Arc x402 nanopayment research task. Use premium API access, MCP tools, publisher content, agent services, and usage-based inference when value justifies the cost. Return spend, receipts, citations, skipped resources, and provider earnings.";

const accessClasses = [
  {
    title: "Premium API",
    text: "Agents unlock paid API calls without sharing one static provider key."
  },
  {
    title: "MCP Tools",
    text: "Specialist tools can require x402 payment before execution."
  },
  {
    title: "Publisher Content",
    text: "Articles and source citations can earn per access or citation."
  },
  {
    title: "Agent Service",
    text: "One agent can pay another agent for a bounded specialist task."
  },
  {
    title: "Usage Service",
    text: "Inference and metered services become budget-aware purchases."
  }
];

const flow = ["Budget", "402 Quote", "x402 Pay", "Access", "Receipt"];

const highlights = [
  {
    title: "Price before purchase",
    text: "Every protected service exposes its cost before the agent commits budget."
  },
  {
    title: "Pay only for value",
    text: "The agent compares quality, freshness and price before authorizing x402 payment."
  },
  {
    title: "Prove every outcome",
    text: "Settlement, fulfillment and provider earnings remain attached to one receipt."
  }
];

export default function LandingPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [payment, setPayment] = useState<PaymentStatus | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [terminal, setTerminal] = useState<string[]>([
    "AgentPay network ready",
    "Waiting for a budgeted resource purchase"
  ]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [metricsResponse, resourcesResponse, walletResponse, paymentResponse] = await Promise.all([
      fetch("/api/metrics"),
      fetch("/api/resources"),
      fetch("/api/wallet/status"),
      fetch("/api/payments/latest")
    ]);
    const resourcesBody = await resourcesResponse.json();
    setMetrics(await metricsResponse.json());
    setResources(resourcesBody.resources ?? []);
    setWallet(await walletResponse.json());
    setPayment(await paymentResponse.json());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runPaidAgent() {
    setRunning(true);
    setError(null);
    setTerminal([
      "AgentPay run started",
      "Budget: 0.050000 USDC",
      "Scoring access classes by value, freshness, confidence and price"
    ]);
    try {
      const response = await fetch("/api/agent/runs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          budgetUsdc: 0.05,
          policy: {
            maxSpendUsdc: 0.05,
            maxPricePerCallUsdc: 0.01,
            allowedAccessClasses: ["premium_api", "mcp_tool", "publisher_content", "agent_service", "usage_service"],
            cacheMode: "refresh"
          }
        })
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Agent run failed");
      }
      await readAgentStream(response.body, {
        onLine: (line) => setTerminal((current) => [...current, line]),
        onRun: (nextRun) => setRun(nextRun)
      });
      await refresh();
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Agent run failed";
      setError(message);
      setTerminal((current) => [...current, `ERROR: ${message}`]);
    } finally {
      setRunning(false);
    }
  }

  const latestPaymentStatus = payment?.latestPayment?.metadata?.fulfillmentStatus;
  const paidResources = run?.output?.payments?.length ?? 0;
  const fulfilledResources = run?.output?.adapterResults?.filter((result) => result.status === "ok").length ?? 0;
  const liveStats = useMemo(
    () => [
      { label: "Agent runs", value: metrics?.agentRuns ?? "..." },
      { label: "Settled calls", value: metrics?.settledPaidCalls ?? "..." },
      { label: "USDC volume", value: metrics ? metrics.totalUsdcVolume.toFixed(6) : "..." },
      { label: "Providers paid", value: metrics?.providersPaid ?? "..." }
    ],
    [metrics]
  );

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <Link className="landing-brand" href="/">
          AgentPay
        </Link>
        <nav aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#access">Access classes</a>
          <Link href="/dashboard">Control room</Link>
          <Link href="/receipts">Receipts</Link>
        </nav>
        <Link className="nav-pill" href="/dashboard">
          Open App
        </Link>
      </header>

      <section className="agentpay-hero">
        <HeroScene />
        <div className="hero-copy">
          <p className="hero-kicker">Arc testnet + Circle Gateway + x402</p>
          <h1>Give every agent a budget. Let it buy what matters.</h1>
          <p>
            AI agents need a budget-aware purchasing layer for internet resources. AgentPay lets them price access,
            decide what is worth buying and settle through x402 with verifiable receipts.
          </p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={runPaidAgent} disabled={running}>
              {running ? "Running paid agent" : "Run paid agent"}
            </button>
            <Link className="secondary-action" href="/dashboard">
              Open control room
            </Link>
          </div>
        </div>

        <section className="command-panel" aria-label="AgentPay live command panel">
          <div className="panel-topline">
            <span>Live command</span>
            <b>{wallet?.paymentMode ?? "x402"}</b>
          </div>
          <div className="command-grid">
            <CommandMetric label="Network" value={wallet?.network ?? "eip155:5042002"} />
            <CommandMetric
              label="Wallet"
              value={wallet?.walletBalance.ok ? `${wallet.walletBalance.amount} ${wallet.walletBalance.token}` : "checking"}
            />
            <CommandMetric
              label="Gateway"
              value={wallet?.gatewayBalance.ok ? `${wallet.gatewayBalance.amount} ${wallet.gatewayBalance.token}` : "checking"}
            />
            <CommandMetric label="Latest" value={latestPaymentStatus ? String(latestPaymentStatus) : "ready"} />
          </div>
          <div className="flow-strip" aria-label="Payment flow">
            {flow.map((item, index) => (
              <span key={item}>
                <small>{String(index + 1).padStart(2, "0")}</small>
                {item}
              </span>
            ))}
          </div>
          <div className="terminal-window" role="log" aria-live="polite">
            {terminal.slice(-8).map((line, index) => (
              <p className={line.includes("ERROR") ? "terminal-danger" : ""} key={`${line}-${index}`}>
                <span>PS</span> {line}
              </p>
            ))}
          </div>
        </section>
      </section>

      <section className="live-proof-band" aria-label="Live proof">
        {liveStats.map((item) => (
          <div key={item.label}>
            <b>{item.value}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </section>

      <section className="section-light" id="how">
        <div className="section-intro">
          <h2>One budget. Every paid resource.</h2>
          <p>
            AgentPay turns priced internet services into one purchasing layer that an AI agent can understand.
          </p>
        </div>
        <div className="process-grid">
          {highlights.map((item, index) => (
            <article className="process-card" key={item.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-dark">
        <div className="dark-feature dark-feature-solo">
          <div>
            <h2>The agent sees prices before it spends.</h2>
            <p>
              AgentPay scores expected value, freshness, confidence, price and cache state. Low-value resources can be
              skipped instead of blindly purchased.
            </p>
            <Link className="dark-link" href="/dashboard">
              Inspect decisions
            </Link>
          </div>
        </div>
        <div className="dark-feature reverse">
          <div className="receipt-card">
            <span>Latest verified run</span>
            <b>{run?.id ? shortId(run.id) : payment?.latestPayment?.paymentIdentifier ? shortId(payment.latestPayment.paymentIdentifier) : "ready"}</b>
            <p>
              {run
                ? `${paidResources} paid resources, ${fulfilledResources} fulfilled, ${run.totalSpendUsdc.toFixed(6)} USDC spent.`
                : "Run a paid agent task to create fresh receipts and provider earnings."}
            </p>
          </div>
          <div>
            <h2>Receipts are the product surface, not raw logs.</h2>
            <p>
              Settlement, fulfillment, citation receipts and provider earnings are available as proof, but the first
              screen stays focused on the purchase flow.
            </p>
            <Link className="dark-link" href="/receipts">
              Open receipt explorer
            </Link>
          </div>
        </div>
      </section>

      <section className="section-light" id="access">
        <div className="section-intro narrow">
          <h2>Built for what agents already need.</h2>
          <p>Five service classes settle through one budget policy, one payment rail and one receipt model.</p>
        </div>
        <div className="access-grid">
          {accessClasses.map((item) => (
            <article className="access-card" key={item.title}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="final-cta">
        <h2>Make the smallest unit sellable.</h2>
        <div>
          <button className="primary-action" type="button" onClick={runPaidAgent} disabled={running}>
            {running ? "Running" : "Run live flow"}
          </button>
          <Link className="secondary-action light" href="/dashboard">
            View dashboard
          </Link>
        </div>
      </section>
      {error ? <div className="floating-error">{error}</div> : null}
    </main>
  );
}

function CommandMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="command-metric">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function shortId(value: string) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
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
      const dataLine = event.split("\n").find((line) => line.startsWith("data: "));
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
