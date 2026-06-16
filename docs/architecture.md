# AgentPay Gateway Architecture

```mermaid
flowchart LR
  User["User task + USDC budget"] --> Web["Next.js dashboard/API"]
  Web --> Agent["Agent budget engine"]
  Agent --> Registry["Paid resource registry"]
  Registry --> Pay["x402/Circle-style payment boundary"]
  Pay --> Adapters["Adapter layer"]
  Adapters --> MCP["MCP tools"]
  Adapters --> API["Publisher API"]
  Adapters --> Dataset["Datasette dataset"]
  Adapters --> Crawl["Crawl worker"]
  Adapters --> Delegation["Agent delegation"]
  Adapters --> Memory["Memory/vector retrieval"]
  Adapters --> Inference["Inference endpoint"]
  Adapters --> RSS["Publisher/RSS paywall"]
  Adapters --> Search["SearXNG search"]
  Adapters --> Docs["Docs/source gateway"]
  Pay --> Verify["Server-side settlement verifier"]
  Verify --> Adapters["Adapter layer"]
  Pay --> Store["Store/Supabase runtime snapshot + schema"]
  Store --> Metrics["Metrics, receipts, provider earnings"]
  Metrics --> Web
```

## Core flow

1. The user submits a task, budget and run mode.
2. The agent scores eligible resources by expected value, freshness, confidence, cost and cache availability.
3. If a resource is worth buying, the payment boundary records the payment attempt.
4. Server-side settlement verification must confirm the x402 payment before the adapter executes.
5. Adapter output is returned with citations, receipts and provider earning records.
6. The dashboard shows the event stream, spend, skipped sources, adapter coverage and earnings.

## Non-goals

- No mainnet execution by default.
- No upstream platform forks.
- No hidden forced payment path for presentations.
- No silent fallback when a real upstream is unavailable.
- No adapter execution after an unverified x402 payment.
