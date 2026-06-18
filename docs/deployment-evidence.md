# Deployment Evidence Pack

Use this file as the final pre-submission evidence list. Do not mark an item complete without a real URL, command output or screenshot.

## Runtime URLs

- Web app URL: `https://agentpay-gateway.vercel.app`
- Worker URL: `http://49.13.60.236:8010`
- Public repository URL: `https://github.com/kaos35/agentpay-gateway`
- Supabase project reference: `ppydekkmamrylhyngvys`

## Deployment Notes

- Vercel production deploy is live for the dashboard and Next.js API routes.
- VPS upstream fulfillment services are live for worker-backed MCP, delegation, inference and publisher content calls.
- Server-side agent payments use the Circle CLI-authenticated VPS payer endpoint at `/payer/pay-resource`.
- Vercel production is configured to call `AGENTPAY_PAYER_URL=http://49.13.60.236:8010/payer/pay-resource` with the same `AGENTPAY_PAYER_API_KEY` as the worker container.
- The worker container is Circle CLI-authenticated with an Arc testnet agent wallet and runs real Ollama-backed inference using `qwen3:4b`.
- Long-running paid inference is supported by `AGENTPAY_PAYER_REQUEST_TIMEOUT_SECONDS` on the VPS payer and `AGENTPAY_INFERENCE_PROVIDER_TIMEOUT_SECONDS` in the web adapter runtime.
- The VPS runner mounts `$ROOT_DIR/circle-home` to `/root` so the Circle CLI testnet wallet login persists across container restarts.

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
- `AGENTPAY_INFERENCE_MODEL`
- `AGENTPAY_INFERENCE_PROVIDER_TIMEOUT_SECONDS`
- `AGENTPAY_PAYER_REQUEST_TIMEOUT_SECONDS`

## Verified Live Evidence

Captured on 2026-06-18 against `https://agentpay-gateway.vercel.app`:

- Production app returned HTTP `200`.
- Resource catalog returned 5 paid resources.
- Wallet status returned `paymentMode=x402`, `network=eip155:5042002`, wallet balance `19` USDC and gateway balance `0.889900` USDC.
- VPS worker health returned `ok`.
- Unpaid requests to all five protected resource endpoints returned `402 Payment Required`.
- Full integration agent run `run_0dd4624b-39d2-4895-8701-dc481d359839` completed with 4 settled x402 payments, 4 fulfilled access requests, 0 fulfillment errors, 0.006600 USDC spent and 2 paid citations.
- The full integration run skipped `res_agent_delegation` because its score was below the dynamic threshold; this is expected agent budget behavior, not a disabled adapter.
- Targeted agent-to-agent run `run_1f2754fc-e22c-4bc6-9b0b-54faba33f89f` completed with 1 settled x402 payment, 1 fulfilled agent-service request, 0 fulfillment errors and 0.002200 USDC spent.
- Latest payment record after verification showed `settled` status, `fulfillmentStatus=delivered`, server-side settlement evidence and a matching receipt/provider earning.
- Metrics after verification: 12 agent runs, 58 settled paid calls, 2 failed paid calls from pre-fix timeout attempts, 0.094700 USDC settled volume and 6 providers paid.

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
- `pnpm smoke:upstreams` against the live VPS worker passed on 2026-06-18 with `AGENTPAY_WORKER_URL=http://49.13.60.236:8010` and `AGENTPAY_INFERENCE_MODEL=qwen3:4b`.

## Three-Minute Recording Structure

1. Show the product sentence and testnet posture.
2. Show wallet/provider/resource readiness.
3. Run one paid agent task.
4. Show terminal stream, receipts, citations and provider earnings.
5. Show metrics and persistence proof.
