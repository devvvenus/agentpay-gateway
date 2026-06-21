"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ReceiptEntry = {
  paymentId: string;
  paymentIdentifier: string;
  resourceName: string;
  adapterType: string;
  amountUsdc: number;
  paymentStatus: string;
  fulfillmentStatus: string;
  settlementStatus: string;
  providerName: string;
  citationCount: number;
  createdAt: string;
};

type ReceiptExplorer = {
  entries: ReceiptEntry[];
  totals: {
    payments: number;
    settled: number;
    delivered: number;
    citations: number;
    settledUsdc: number;
  };
};

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptExplorer | null>(null);

  useEffect(() => {
    void fetch("/api/receipts")
      .then((response) => response.json())
      .then(setReceipts);
  }, []);

  const totals = receipts?.totals;

  return (
    <main className="subpage">
      <header className="subpage-nav">
        <Link className="landing-brand" href="/">
          AgentPay
        </Link>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="subpage-hero">
        <p className="hero-kicker">Settlement proof</p>
        <h1>Receipts should be readable proof, not a wall of logs.</h1>
        <p>
          This page keeps detailed x402 settlement, fulfillment and citation records out of the first screen while still
          making them available for a judge or builder who wants proof.
        </p>
      </section>

      <section className="receipt-summary-band">
        <div>
          <b>{totals?.payments ?? "..."}</b>
          <span>Payments</span>
        </div>
        <div>
          <b>{totals?.settled ?? "..."}</b>
          <span>Settled</span>
        </div>
        <div>
          <b>{totals?.delivered ?? "..."}</b>
          <span>Delivered</span>
        </div>
        <div>
          <b>{totals ? totals.settledUsdc.toFixed(6) : "..."}</b>
          <span>USDC settled</span>
        </div>
      </section>

      <section className="receipt-ledger">
        {(receipts?.entries ?? []).slice(0, 12).map((entry) => (
          <article className="receipt-ledger-row" key={entry.paymentId}>
            <div>
              <span>{entry.adapterType}</span>
              <h2>{entry.resourceName}</h2>
              <p>{entry.paymentIdentifier}</p>
            </div>
            <div>
              <span>Provider</span>
              <b>{entry.providerName}</b>
            </div>
            <div>
              <span>Amount</span>
              <b>{entry.amountUsdc.toFixed(6)} USDC</b>
            </div>
            <div>
              <span>Status</span>
              <b>{entry.paymentStatus} / {entry.fulfillmentStatus}</b>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
