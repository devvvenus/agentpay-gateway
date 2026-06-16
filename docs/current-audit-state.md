# AgentPay Gateway Current Audit State

Last local verification: 2026-06-16.

This file exists so future audits do not rely on stale generated files or infer runtime state from `.env.example` alone.

## What is currently implemented

- Next.js dashboard and API routes for agent runs, paid resources, metrics, wallet status, receipts and provider publishing.
- Ten paid adapter paths: MCP, API proxy, Datasette dataset, crawl worker, agent delegation, memory retrieval, inference endpoint, RSS paywall, SearXNG search and docs/source citation.
- Budget-aware agent scoring, cache-vs-pay decisions, skipped resources, receipts, citations and provider earnings.
- Dynamic resource scoring that combines seeded resource quality with prompt/resource/provider/config term fit, source type and cache state.
- Server-side settlement verification for x402 resource fulfillment. A paid adapter is not executed unless the configured facilitator/verifier confirms settlement.
- Local `@agentpay/sdk` package with a `protect()` helper.
- `@agentpay/sdk` verifier support for protected handlers that need server-side settlement confirmation before executing.
- Circle CLI x402 client path for paid resource execution when `AGENTPAY_PAYMENT_MODE=x402` is configured.
- Supabase runtime snapshot persistence through `runtime_snapshots` when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- Signed webhook status mapping for known payment identifiers when `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` is configured.
- Docker Compose upstreams for Datasette, SearXNG and the FastAPI worker.
- Worker-backed delegation, memory and inference endpoints now compute request-dependent outputs:
  - delegation classifies the task, extracts evidence terms and returns procurement recommendations;
  - memory retrieval uses local term-frequency vectors with cosine similarity and matched-term evidence;
  - inference ranks evidence sentences and generates a completion from the prompt/context.

## Verified commands

These commands passed locally on 2026-06-16:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
pnpm smoke:upstreams
```

`pnpm smoke:upstreams` verified all ten adapter upstreams against running local services.

Live verification on 2026-06-16:

- Production URL: https://agentpay-gateway.vercel.app
- Repository: https://github.com/kaos35/agentpay-gateway
- VPS worker: `http://49.13.60.236:8010`
- Direct live adapter payment smoke: all ten paid resources returned `settled|ok`.
- Full integration stream run `run_7729fefa-9dbc-45ed-843e-7909ff5187e4`: 10 paid resources, 10 settled payments, 10 fulfilled adapters, 0 adapter errors, 0.016500 USDC spent, 2 paid citations.

## Audit boundaries

- `.env.example` defaults to `x402`. Test-only payment helpers are restricted to test code and are not the product runtime path.
- x402 mode requires real Arc testnet address-shaped buyer/provider wallets. Missing verifier configuration returns an error before adapter execution.
- Circle Gateway batching settlement verification is the active server-side verifier path for live paid resources.
- `.env.local` is intentionally ignored and may contain active x402 wallet/Circle CLI configuration.
- Seed provider wallet fallback values are local-only defaults. x402 mode rejects those values; real local/testnet runs must set `SELLER_ADDRESS` or provider-specific `SELLER_ADDRESS_1`, `SELLER_ADDRESS_2` and `SELLER_ADDRESS_3`.
- The SDK is a real local monorepo package, not a published npm package.
- Runtime persistence uses the local file store for fresh-clone development and Supabase `runtime_snapshots` for live deployments when Supabase service credentials are configured.
- Direct `runAgent()` library calls in x402 mode require the paid-resource executor. The product API provides that executor through Circle CLI and `/api/pay/:resourceId`.

## Still not complete

- Traction evidence: real users, real paid runs, provider/creator payout screenshots or receipts.
- Recorded walkthrough under three minutes.

## Files intentionally ignored

Generated local artifacts should not be used as audit evidence:

- `.next/`
- `.agentpay/`
- `*.log`
- `*.tsbuildinfo`
- `_tmp_*`
