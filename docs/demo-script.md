# AgentPay Gateway Demo Script

## 0:00 - 0:20: Positioning

AgentPay Gateway turns Arc nanopayments into a usable agent product. AI agents need a budget-aware purchasing layer for internet resources; this product builds that layer on Arc, Circle and x402.

## 0:20 - 0:55: Wallet and payment posture

Show the wallet/payment status panel. Explain that the product is testnet-only by default, mainnet is guarded, and every paid call records buyer wallet, seller wallet, amount, network, payment identifier and receipt data. Point out that adapters execute only after server-side settlement verification.

## 0:55 - 1:45: Run the agent

Open the Agent Task panel.

Use **Full integration** to evaluate all ten paid resource types in one run:

- Paid Agent Tool Call
- Paid Publisher API
- Paid Creator Dataset
- Paid Article Crawl
- Paid Agent-to-Agent Delegation
- Paid Memory / Vector Retrieval
- Paid Inference / Model Endpoint
- Publisher/RSS Paywall
- Paid Research Search
- Paid Arc Docs Citation

Explain that this is not a forced payment path: normal scoring, budget and cache rules are active.

## 1:45 - 2:25: Read the output

Show:

- Task Terminal event stream.
- Run Summary.
- Adapter coverage.
- Paid citations and skipped sources.
- Provider earnings.
- Attempted vs settled vs pending payment metrics.

Point out where the agent spent USDC and where it refused to pay because value, freshness, confidence or budget fit was not good enough.

## 2:25 - 3:00: Technical proof

Show the README verification commands:

```powershell
pnpm typecheck
pnpm test
pnpm smoke:upstreams
```

Show one persisted receipt/payment after refreshing the live dashboard. If webhook status mapping is part of the demo, show the payment identifier before and after the signed webhook event.

Close with the product sentence:

> AI agents need a budget-aware purchasing layer for internet resources. We built that layer on Arc + Circle + x402.
