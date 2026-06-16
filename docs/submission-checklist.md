# AgentPay Gateway Submission Checklist

## Product story

AgentPay Gateway is a testnet-only paying agent application for Arc. AI agents need a budget-aware purchasing layer for internet resources; this product builds that layer on Arc, Circle and x402. The agent receives a USDC budget, evaluates paid creator/publisher/tool/data/memory/inference/search/source resources, pays only when the expected value justifies the cost, and returns receipts, citations, skipped sources, total spend and provider earnings.

## Local verification

Run the real local upstream path:

```powershell
docker compose up datasette searxng worker
pnpm typecheck
pnpm test
pnpm smoke:upstreams
pnpm build
```

Expected result:

- All ten adapter upstream checks pass.
- Unpaid paid-resource calls return `402 Payment Required`.
- Replayed payment identifiers do not create duplicate provider earnings.
- Mainnet is blocked unless `ALLOW_MAINNET=true`.

## Live deployment requirements

- Public GitHub repository: https://github.com/kaos35/agentpay-gateway
- Vercel production app: https://agentpay-gateway.vercel.app
- Worker host for `apps/worker`: `http://49.13.60.236:8010`
- Datasette upstream: `http://49.13.60.236:8011`
- SearXNG upstream: `http://49.13.60.236:8012`
- Supabase project configured for `runtime_snapshots`.
- Arc Testnet buyer and seller wallets configured in Vercel and worker runtime.
- Circle Gateway/x402 batching settlement verification configured server-side.
- Environment variables copied from `.env.example` and set in Vercel/worker host.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set on the web runtime so dashboard state persists across restarts.
- `AGENTPAY_ADMIN_API_KEY` set before exposing provider publishing routes.
- `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` set before enabling webhook status updates.

## Live verification on 2026-06-16

- Direct adapter payment test: all 10 paid resources returned `settled|ok`.
- Full integration run: `run_7729fefa-9dbc-45ed-843e-7909ff5187e4`.
- Full integration result: 10/10 resources paid, 10/10 adapters fulfilled, 0 adapter errors, 0.016500 USDC spent, 2 paid citations.
- Worker payer hardening: `/payer/pay-resource` runs Circle CLI asynchronously so worker-backed MCP/crawl/delegation/memory/inference/RSS endpoints can fulfill nested paid requests.

## Acceptance proof

Before submission, capture:

- Live app URL.
- Public repository URL.
- A full integration run showing agent decisions, paid resources, receipts and provider earnings.
- A settled payment record where `attemptedPaidCalls`, `settledPaidCalls`, pending and failed metrics are visibly separated.
- A webhook event that updates a known payment identifier to `settled` or `failed`.
- A dashboard refresh after restart proving Supabase runtime persistence.
- `pnpm smoke:upstreams` output from a fresh clone or clean local setup.
- A short screen recording under three minutes.
