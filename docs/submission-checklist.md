# AgentPay Gateway Submission Checklist

## Product story

AgentPay Gateway is a testnet-only paying agent application for Arc. AI agents need a nanopayment access layer for internet resources; this product builds that layer on Arc, Circle and x402. The agent receives a USDC budget, evaluates premium APIs, MCP tools, publisher content, agent services and usage-based services, pays only when the expected value justifies the cost, and returns receipts, citations, skipped sources, total spend and provider earnings.

## Local verification

Run the real local upstream path:

```powershell
docker compose up worker
pnpm typecheck
pnpm test
pnpm smoke
pnpm smoke:upstreams
pnpm build
```

Expected result:

- All paid access upstream checks pass.
- Unpaid paid-resource calls return `402 Payment Required`.
- Replayed payment identifiers do not create duplicate provider earnings.
- Mainnet is blocked unless `ALLOW_MAINNET=true`.

## Live deployment requirements

- Public GitHub repository: https://github.com/kaos35/agentpay-gateway
- Vercel production app: https://agentpay-gateway.vercel.app
- Worker host for `apps/worker`: `http://49.13.60.236:8010`
- Supabase project configured for `runtime_snapshots`.
- Arc Testnet buyer and seller wallets configured in Vercel and worker runtime.
- Circle Gateway/x402 batching settlement verification configured server-side.
- Environment variables copied from `.env.example` and set in Vercel/worker host.
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set on the web runtime so dashboard state persists across restarts.
- `AGENTPAY_ADMIN_API_KEY` set before exposing provider publishing routes.
- `AGENTPAY_WORKER_GATEWAY_SECRET` set to the same value in the web/API runtime and worker before exposing worker endpoints.
- `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` set before enabling webhook status updates.

## Live verification on 2026-06-16

- Direct paid access test: all paid resources returned `settled|ok`.
- Full integration run: `run_a4528580-b7c7-49e4-b67e-4bc07c2d36dd`.
- Full integration result: 5/5 access classes paid, 5/5 access fulfillments, 0 fulfillment errors, 0.008800 USDC spent, 1 paid citation.
- Worker payer hardening: `/payer/pay-resource` runs Circle CLI asynchronously so worker-backed MCP, delegation, inference and RSS/publisher endpoints can fulfill nested paid requests.

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
