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

Latest local verification on 2026-06-21 passed:

- `pnpm typecheck`
- `pnpm test`
- `pnpm smoke`
- `pnpm build`
- `pnpm smoke:upstreams` against the live VPS worker.

## Live deployment requirements

- Public GitHub repository: https://github.com/devvvenus/agentpay-gateway
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

## Live verification on 2026-06-21

- Production app returned HTTP `200`.
- Unpaid requests to all five protected resource endpoints returned `402 Payment Required`.
- Production deployment: `dpl_6ZYGYiELaFCjwS7ccYzDY5kcAaFJ`.
- Latest budgeted agent run: `run_575219e0-c34f-4866-b000-05408ff7b593`.
- Latest run result: 2 settled x402 payments, 2 fulfilled access requests, 0 fulfillment errors, 0.002300 USDC spent, 2 paid citations and 3 resources skipped by dynamic scoring.
- Targeted agent-to-agent run: `run_1f2754fc-e22c-4bc6-9b0b-54faba33f89f`.
- Targeted agent-to-agent result: 1 settled x402 payment, 1 fulfilled access request, 0 fulfillment errors, 0.002200 USDC spent.
- `pnpm smoke:upstreams` passed against the live VPS worker with direct unpaid guards and upstream fulfillment for all five access classes.
- Worker payer hardening: `/payer/pay-resource` runs Circle CLI on the VPS and uses a configurable paid request timeout so worker-backed MCP, delegation, inference and RSS/publisher endpoints can fulfill nested paid requests.

## Acceptance proof

Before submission, capture:

- Live app URL.
- Public repository URL: https://github.com/devvvenus/agentpay-gateway
- A full integration run showing agent decisions, paid resources, receipts and provider earnings.
- A settled payment record where `attemptedPaidCalls`, `settledPaidCalls`, pending and failed metrics are visibly separated.
- A webhook event that updates a known payment identifier to `settled` or `failed`.
- A dashboard refresh after restart proving Supabase runtime persistence.
- `pnpm smoke:upstreams` output from a fresh clone or clean local setup.
- A short screen recording under three minutes.
