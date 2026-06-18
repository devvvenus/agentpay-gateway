# AgentPay Gateway Current Audit State

Last local verification: 2026-06-18.

This file exists so future audits do not rely on stale generated files or infer runtime state from `.env.example` alone.

## What is currently implemented

- Next.js dashboard and API routes for agent runs, paid resources, metrics, wallet status, receipts and provider publishing.
- Five visible nanopayment access classes: premium API calls, MCP server/tool calls, web content or publisher sources, agent-to-agent services and usage-based service access.
- Fulfillment paths are aligned to the five access classes: API proxying, MCP tools, publisher/RSS content, agent delegation and usage-based inference/service access.
- Budget-aware agent scoring, cache-vs-pay decisions, skipped resources, receipts, citations and provider earnings.
- Dynamic resource scoring that combines seeded resource quality with prompt/resource/provider/config term fit, source type and cache state.
- Server-side settlement verification for x402 resource fulfillment. Paid access is not fulfilled unless the configured facilitator/verifier confirms settlement.
- Local `@agentpay/sdk` package with a `protect()` helper.
- `@agentpay/sdk` verifier support for protected handlers that need server-side settlement confirmation before executing.
- `@agentpay/sdk` refuses production protected-handler fulfillment without `verifierUrl`, unless a developer explicitly opts into unverified local behavior.
- Circle CLI x402 client path for paid resource execution when `AGENTPAY_PAYMENT_MODE=x402` is configured.
- Supabase runtime snapshot persistence through `runtime_snapshots` when `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set.
- Signed webhook status mapping for known payment identifiers when `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` is configured.
- Docker Compose upstream for the FastAPI access worker.
- Worker-backed delegation and inference endpoints compute request-dependent outputs:
  - delegation classifies the task, extracts evidence terms and returns procurement recommendations;
  - inference ranks evidence sentences and generates a completion from the prompt/context.
- Worker-backed provider endpoints require AgentPay gateway payment context, expected resource IDs and optional shared worker gateway secret validation.
- Payment metrics count settled provider earnings separately from pending or failed payment attempts.
- Provider earnings are linked to `paymentEventId`, so settlement updates cannot accidentally settle the wrong same-priced pending earning.
- Latest payment status responses align the latest payment with its matching receipt and provider earning when those records exist.
- Publisher content configuration uses `articleUrl` for the unlock target; stale alternate URL naming has been removed from the active contract.

## Verified commands

These commands passed locally on 2026-06-18:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
pnpm smoke:upstreams
```

`pnpm test` and `pnpm smoke` required sandbox-external reruns on Windows because Vitest/Vite/esbuild hit `spawn EPERM` inside the managed sandbox. `pnpm build` also required a sandbox-external rerun after a Windows/OneDrive `.next` file lock. All passed after rerun.

`pnpm smoke:upstreams` passed against the live VPS worker on 2026-06-18 with:

```powershell
$env:AGENTPAY_WORKER_URL='http://49.13.60.236:8010'
$env:AGENTPAY_INFERENCE_MODEL='qwen3:4b'
$env:AGENTPAY_ALLOWED_HOSTS='localhost,127.0.0.1,49.13.60.236,docs.arc.io,developers.circle.com,docs.x402.org,www.arc.network,arc.network'
pnpm smoke:upstreams
```

It verified direct unpaid guards for all five worker endpoints and upstream fulfillment for MCP, premium API, agent delegation, inference and publisher content.

Live verification on 2026-06-18:

- Production URL: https://agentpay-gateway.vercel.app
- Repository: https://github.com/kaos35/agentpay-gateway
- VPS worker: `http://49.13.60.236:8010`
- Production app returned HTTP `200`.
- Live resource catalog returned 5 paid resources.
- Wallet status returned `paymentMode=x402`, `network=eip155:5042002`, wallet balance `19` USDC and gateway balance `0.889900` USDC.
- VPS worker health returned `ok`.
- Unpaid live calls to all 5 protected resources returned `402 Payment Required`.
- Full integration run `run_0dd4624b-39d2-4895-8701-dc481d359839`: 4 settled payments, 4 fulfilled access requests, 0 fulfillment errors, 0.006600 USDC spent, 2 paid citations, 1 resource skipped by dynamic scoring.
- Targeted agent-to-agent run `run_1f2754fc-e22c-4bc6-9b0b-54faba33f89f`: 1 settled payment, 1 fulfilled access request, 0 fulfillment errors, 0.002200 USDC spent.
- Live metrics after verification: 12 agent runs, 58 settled paid calls, 2 failed paid calls from pre-fix timeout attempts, 0.094700 USDC settled volume, 6 providers paid.
- VPS worker runs real Ollama-backed paid inference with `qwen3:4b`.

## Audit boundaries

- `.env.example` defaults to `x402`. Test-only payment helpers are restricted to test code and are not the product runtime path.
- x402 mode requires real Arc testnet address-shaped buyer/provider wallets. Missing verifier configuration returns an error before paid access fulfillment.
- Circle Gateway batching settlement verification is the active server-side verifier path for live paid resources.
- `.env.local` is intentionally ignored and may contain active x402 wallet/Circle CLI configuration.
- Seed provider wallet values are local-development defaults. x402 mode rejects those values; real local/testnet runs must set `SELLER_ADDRESS` or provider-specific `SELLER_ADDRESS_1`, `SELLER_ADDRESS_2` and `SELLER_ADDRESS_3`.
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
