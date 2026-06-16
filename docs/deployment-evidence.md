# Deployment Evidence Pack

Use this file as the final pre-submission evidence list. Do not mark an item complete without a real URL, command output or screenshot.

## Runtime URLs

- Web app URL:
- Worker URL:
- Public repository URL:
- Supabase project reference:

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

## Three-Minute Recording Structure

1. Show the product sentence and testnet posture.
2. Show wallet/provider/resource readiness.
3. Run one paid agent task.
4. Show terminal stream, receipts, citations and provider earnings.
5. Show metrics and persistence proof.
