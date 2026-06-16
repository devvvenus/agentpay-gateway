# Deployment Evidence Pack

Use this file as the final pre-submission evidence list. Do not mark an item complete without a real URL, command output or screenshot.

## Runtime URLs

- Web app URL: `https://agentpay-gateway.vercel.app`
- Worker URL: `http://49.13.60.236:8010`
- Datasette URL: `http://49.13.60.236:8011`
- SearXNG URL: `http://49.13.60.236:8012`
- Public repository URL: `https://github.com/kaos35/agentpay-gateway`
- Supabase project reference: `ppydekkmamrylhyngvys`

## Deployment Notes

- Vercel production deploy is live for the dashboard and Next.js API routes.
- VPS upstream adapters are live for worker-backed crawl, MCP, delegation, memory, inference, RSS paywall, Datasette and SearXNG calls.
- Server-side agent payments currently require a Circle CLI-authenticated runtime. Vercel serverless does not include the local Circle CLI session, so the final payer execution path must run on a Circle-authenticated backend or be replaced with a Circle API-backed payer before a judge-facing full paid run.
- The VPS payer endpoint is `/payer/pay-resource`. Vercel should set `AGENTPAY_PAYER_URL=http://49.13.60.236:8010/payer/pay-resource` and the same `AGENTPAY_PAYER_API_KEY` as the worker container. The worker container must be Circle CLI-authenticated with an Arc testnet agent wallet.

## Required Environment

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENTPAY_NETWORK`
- `AGENTPAY_PAYMENT_MODE=x402`
- `BUYER_ADDRESS`
- `SELLER_ADDRESS`
- `SELLER_ADDRESS_1`
- `SELLER_ADDRESS_2`
- `SELLER_ADDRESS_3`
- `X402_FACILITATOR_URL`
- `AGENTPAY_ADMIN_API_KEY`
- `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET`
- `AGENTPAY_WORKER_URL`
- `AGENTPAY_PAYER_URL`
- `AGENTPAY_PAYER_API_KEY`
- `DATASETTE_BASE_URL`
- `SEARXNG_BASE_URL`

## Proofs To Capture

- Fresh dashboard load showing wallet/payment status.
- Full integration run with terminal event stream.
- Payment record with server-side settlement evidence.
- Receipt entry with paid citations.
- Provider earnings entry tied to the same payment identifier.
- Metrics showing attempted, settled, pending and failed payment counts separately.
- Signed webhook request updating an existing payment identifier.
- Dashboard refresh/restart showing persisted state from Supabase.
- `pnpm typecheck`, `pnpm test`, `pnpm smoke`, `pnpm smoke:upstreams`, `pnpm build` output.
- `pnpm smoke:upstreams` against the VPS upstreams passed on 2026-06-16.

## Three-Minute Recording Structure

1. Show the product sentence and testnet posture.
2. Show wallet/provider/resource readiness.
3. Run one paid agent task.
4. Show terminal stream, receipts, citations and provider earnings.
5. Show metrics and persistence proof.
