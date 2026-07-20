# Jury deployment checklist

AgentPay Gateway is intended to be presented as a **testnet-only** demonstration of budgeted AI-agent nanopayments. Do not present it as a mainnet custody, escrow, or production payment product.

## Before the demo

1. Install dependencies with `pnpm install` and copy `.env.example` to `.env.local`.
2. Use an Arc testnet wallet with only the small amount of USDC needed for the demonstration.
3. Set unique values for `AGENTPAY_RUNNER_API_KEY`, `AGENTPAY_WORKER_GATEWAY_SECRET`, `AGENTPAY_PAYER_API_KEY`, and `AGENTPAY_WEBHOOK_SECRET`.
4. Set `AGENTPAY_MAX_RUN_BUDGET_USDC` to the funded demo limit. `0.010000` USDC is the intended default ceiling.
5. For a Docker-local worker, set `AGENTPAY_ALLOW_LOCAL_UPSTREAMS=true` only in that worker environment. Keep it `false` in deployed environments.
6. Apply the Supabase migrations, including `003_harden_data_api.sql`, before exposing a project that has Supabase Data API enabled.

## During the demo

1. Open `/dashboard` and enter the runner access code in the **Jury run access code** field.
2. Give one concise research objective and a budget at or below the configured cap.
3. Show the decision trail, paid citations, receipts, and provider earnings after the run.
4. Keep the runner/admin code private. It is an authorization credential, not a URL parameter or public demo token.

## Verify before sharing

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
python -m compileall -q apps/worker
```

A public reviewer may inspect the catalog, aggregate metrics, and manifests. Production-sensitive prompts, receipt payment identifiers, settlement evidence, and wallet balances are intentionally restricted unless a runner or admin credential is supplied.