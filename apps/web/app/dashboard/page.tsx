"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Metrics = {
  agentRuns: number;
  settledPaidCalls: number;
  failedPaidCalls: number;
  pendingVerificationCalls: number;
  settledUsdcVolume: number;
  providersPaid: number;
};

type WalletStatus = {
  network: string;
  paymentMode: string;
  address?: string;
  walletBalance?:
    | { ok: true; amount: string; token: string }
    | { ok: false; error: string };
  gatewayBalance?:
    | { ok: true; amount: string; token: string }
    | { ok: false; error: string };
};

type Resource = {
  id: string;
  name: string;
  accessClass: string;
  priceUsdc: number;
  expectedValue: number;
};

type ReceiptEntry = {
  paymentId: string;
  paymentIdentifier: string;
  resourceName: string;
  amountUsdc: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  providerName: string;
  createdAt: string;
};

type AgentDecision = {
  resourceId: string;
  decision: "pay" | "skip" | "cache";
  score: number;
  reason: string;
};

type AgentRun = {
  id: string;
  status: string;
  budgetUsdc: number;
  totalSpendUsdc: number;
  output?: {
    answer?: string;
    payments?: Array<{
      resourceId: string;
      amountUsdc: number;
      status: string;
      paymentIdentifier?: string;
    }>;
    decisions?: AgentDecision[];
    adapterResults?: Array<{
      resourceId: string;
      adapterType: string;
      status: string;
    }>;
    paidCitations?: Array<{ title: string; sourceUrl?: string }>;
    skippedSources?: Array<{ resourceId: string; reason: string }>;
  };
};

const accessClasses = [
  { id: "premium_api", label: "Premium API" },
  { id: "mcp_tool", label: "MCP tool" },
  { id: "publisher_content", label: "Publisher" },
  { id: "agent_service", label: "Agent service" },
  { id: "usage_service", label: "Inference" }
];

const initialPrompt =
  "Research the strongest real-world use cases for x402 nanopayments on Arc. Buy only the resources that materially improve the answer, stay within budget, and return verified receipts.";

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [receipts, setReceipts] = useState<ReceiptEntry[]>([]);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState("0.05");
  const [runnerAccessCode, setRunnerAccessCode] = useState("");
  const [selectedClasses, setSelectedClasses] = useState(accessClasses.map((item) => item.id));
  const [terminal, setTerminal] = useState<string[]>([
    "Control room ready",
    "Waiting for a budgeted task"
  ]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const [metricsResponse, walletResponse, resourcesResponse, receiptsResponse] = await Promise.all([
      fetch("/api/metrics"),
      fetch("/api/wallet/status"),
      fetch("/api/resources"),
      fetch("/api/receipts")
    ]);
    const resourcesBody = await resourcesResponse.json();
    const receiptsBody = await receiptsResponse.json();
    setMetrics(await metricsResponse.json());
    setWallet(await walletResponse.json());
    setResources(resourcesBody.resources ?? []);
    setReceipts(receiptsBody.entries ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function toggleAccessClass(accessClass: string) {
    setSelectedClasses((current) =>
      current.includes(accessClass)
        ? current.filter((item) => item !== accessClass)
        : [...current, accessClass]
    );
  }

  async function startRun() {
    const parsedBudget = Number(budget);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      setError("Enter a valid USDC budget.");
      return;
    }
    if (selectedClasses.length === 0) {
      setError("Select at least one access class.");
      return;
    }

    setRunning(true);
    setError(null);
    setRun(null);
    setTerminal([
      `Task accepted with ${parsedBudget.toFixed(6)} USDC`,
      `Eligible access: ${selectedClasses.map(accessClassLabel).join(", ")}`,
      "Discovering priced resources",
      "Scoring expected value against cost"
    ]);

    try {
      const response = await fetch("/api/agent/runs/stream", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(runnerAccessCode ? { "x-agentpay-runner-key": runnerAccessCode } : {})
        },
        body: JSON.stringify({
          prompt,
          budgetUsdc: parsedBudget,
          policy: {
            maxSpendUsdc: parsedBudget,
            maxPricePerCallUsdc: Math.min(parsedBudget, 0.01),
            allowedAccessClasses: selectedClasses,
            cacheMode: "reuse"
          }
        })
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Agent run failed");
      }

      await readAgentStream(response.body, {
        onLine: (line) => setTerminal((current) => [...current, line]),
        onRun: setRun
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

  const spendPercent = useMemo(() => {
    const limit = Number(budget) || 0;
    if (!run || limit <= 0) return 0;
    return Math.min((run.totalSpendUsdc / limit) * 100, 100);
  }, [budget, run]);

  const paidCount = run?.output?.payments?.length ?? 0;
  const completedCount = run?.output?.adapterResults?.filter((item) => item.status === "ok").length ?? 0;
  const decisions = run?.output?.decisions ?? [];

  return (
    <main className="ops-shell">
      <section className="ops-workspace">
        <header className="ops-header">
          <div>
            <p>Agent purchasing</p>
            <h1>Control room</h1>
          </div>
          <div className="ops-header-actions">
            <Link href="/">AgentPay</Link>
            <Link href="/receipts">View proof</Link>
            <button type="button" onClick={startRun} disabled={running}>
              {running ? "Agent running" : "New run"}
            </button>
          </div>
        </header>

        <div className="ops-control-grid">
          <section className="ops-run-panel">
            <div className="ops-section-heading">
              <div>
                <span>01 / Budgeted task</span>
                <h2>Give the agent one objective.</h2>
              </div>
              <b>{running ? "Running" : run ? "Completed" : "Ready"}</b>
            </div>

            <label className="ops-field">
              <span>Objective</span>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>

            <div className="ops-form-row">
              <label className="ops-field">
                <span>Budget</span>
                <div className="ops-budget-input">
                  <input
                    type="number"
                    min="0.000001"
                    step="0.001"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                  />
                  <b>USDC</b>
                </div>
              </label>
              <div className="ops-field">
                <span>Purchase policy</span>
                <div className="ops-policy-value">
                  <b>Balanced</b>
                  <small>Value, freshness, confidence and price</small>
                </div>
              </div>
            </div>

            <label className="ops-field">
              <span>Jury run access code</span>
              <input
                type="password"
                autoComplete="off"
                value={runnerAccessCode}
                onChange={(event) => setRunnerAccessCode(event.target.value)}
                placeholder="Required only for production x402 demos"
              />
              <small>Never commit or publish this code.</small>
            </label>

            <div className="ops-field">
              <span>Allowed access</span>
              <div className="ops-access-selector">
                {accessClasses.map((item) => (
                  <button
                    className={selectedClasses.includes(item.id) ? "selected" : ""}
                    type="button"
                    onClick={() => toggleAccessClass(item.id)}
                    key={item.id}
                  >
                    <i />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <button className="ops-run-button" type="button" onClick={startRun} disabled={running}>
              <span>{running ? "Executing paid access flow" : "Run budgeted agent"}</span>
              <b>{Number(budget || 0).toFixed(3)} USDC max</b>
            </button>
            {error ? <p className="ops-error">{error}</p> : null}
          </section>

          <aside className="ops-proof-panel">
            <div className="ops-section-heading compact">
              <div>
                <span>02 / Proof</span>
                <h2>Live payment state</h2>
              </div>
            </div>

            <div className="ops-proof-metrics" aria-label="Live proof metrics">
              <Metric label="Runs" value={metrics?.agentRuns ?? "..."} />
              <Metric label="Settled" value={metrics?.settledPaidCalls ?? "..."} />
              <Metric label="Volume" value={metrics ? `${metrics.settledUsdcVolume.toFixed(6)}` : "..."} />
              <Metric label="Providers" value={metrics?.providersPaid ?? "..."} />
            </div>

            <div className="ops-spend-row">
              <div
                className="ops-spend-ring"
                style={{ "--spend": `${spendPercent * 3.6}deg` } as CSSProperties}
              >
                <div>
                  <b>{run ? run.totalSpendUsdc.toFixed(6) : "0.000000"}</b>
                  <span>USDC spent</span>
                </div>
              </div>
            </div>

            <div className="ops-balance-list">
              <BalanceRow
                label="Agent wallet"
                value={wallet?.walletBalance?.ok ? `${wallet.walletBalance.amount} ${wallet.walletBalance.token}` : "Restricted"}
              />
              <BalanceRow
                label="Gateway"
                value={wallet?.gatewayBalance?.ok ? `${wallet.gatewayBalance.amount} ${wallet.gatewayBalance.token}` : "Restricted"}
              />
              <BalanceRow label="Paid resources" value={String(paidCount)} />
              <BalanceRow label="Fulfilled" value={String(completedCount)} />
            </div>
          </aside>
        </div>

        <section className="ops-execution-panel">
          <div className="ops-section-heading">
            <div>
              <span>03 / Execution stream</span>
              <h2>What the agent is doing now.</h2>
            </div>
            <small>{terminal.length} events</small>
          </div>

          <div className="ops-terminal" role="log" aria-live="polite">
            <div className="ops-terminal-bar">
              <span />
              <span />
              <span />
              <b>agentpay / live-run</b>
            </div>
            <div className="ops-terminal-body">
              {terminal.slice(-14).map((line, index) => (
                <p className={line.includes("ERROR") ? "error" : ""} key={`${line}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{line}</b>
                </p>
              ))}
              {running ? <div className="ops-terminal-cursor" /> : null}
            </div>
          </div>
        </section>

        <div className="ops-secondary-grid">
          <section className="ops-result-panel">
            <div className="ops-section-heading">
              <div>
                <span>04 / Result</span>
                <h2>Agent response</h2>
              </div>
              {run ? <b>{run.status}</b> : null}
            </div>
            {run?.output?.answer ? (
              <>
                <p className="ops-answer">{run.output.answer}</p>
                <div className="ops-result-stats">
                  <span><b>{paidCount}</b> paid</span>
                  <span><b>{completedCount}</b> fulfilled</span>
                  <span><b>{run.output.paidCitations?.length ?? 0}</b> citations</span>
                  <span><b>{run.output.skippedSources?.length ?? 0}</b> skipped</span>
                </div>
              </>
            ) : (
              <EmptyState
                title="No result yet"
                text="Start a run to see the agent's purchased access, reasoning and final response."
              />
            )}
          </section>

          <section className="ops-decision-panel">
            <div className="ops-section-heading">
              <div>
                <span>05 / Decisions</span>
                <h2>Purchase reasoning</h2>
              </div>
            </div>
            <div className="ops-decision-list">
              {decisions.length ? (
                decisions.slice(0, 6).map((decision) => (
                  <article key={`${decision.resourceId}-${decision.decision}`}>
                    <span className={`ops-decision-status ${decision.decision}`}>{decision.decision}</span>
                    <div>
                      <b>{resourceName(resources, decision.resourceId)}</b>
                      <p>{decision.reason}</p>
                    </div>
                    <strong>{decision.score.toFixed(2)}</strong>
                  </article>
                ))
              ) : (
                <EmptyState title="Waiting for decisions" text="Pay, skip and cache choices will appear here." />
              )}
            </div>
          </section>
        </div>

        <section className="ops-ledger-panel">
          <div className="ops-section-heading">
            <div>
              <span>06 / Settlement</span>
              <h2>Recent payment activity</h2>
            </div>
            <Link href="/receipts">Open receipt explorer</Link>
          </div>

          <div className="ops-ledger">
            <div className="ops-ledger-head">
              <span>Resource</span>
              <span>Provider</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Time</span>
            </div>
            {receipts.slice(0, 5).map((receipt) => (
              <article key={receipt.paymentId}>
                <div>
                  <b>{receipt.resourceName}</b>
                  <small>{shortId(receipt.paymentIdentifier)}</small>
                </div>
                <span>{receipt.providerName}</span>
                <span>{receipt.amountUsdc.toFixed(6)} USDC</span>
                <span className="ops-settled">{receipt.paymentStatus} / {receipt.fulfillmentStatus}</span>
                <span>{formatTime(receipt.createdAt)}</span>
              </article>
            ))}
            {!receipts.length ? (
              <EmptyState title="No settlement activity" text="Completed paid runs will populate this ledger." />
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="ops-empty">
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}

function resourceName(resources: Resource[], resourceId: string) {
  return resources.find((resource) => resource.id === resourceId)?.name ?? resourceId;
}

function accessClassLabel(value: string) {
  return accessClasses.find((item) => item.id === value)?.label ?? value;
}

function shortId(value: string) {
  if (!value) return "No identifier";
  if (value.length <= 20) return value;
  return `${value.slice(0, 11)}...${value.slice(-6)}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
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

      if (payload.type === "run") handlers.onRun(payload.run);
      else handlers.onLine(payload.message);
    }
  }
}
