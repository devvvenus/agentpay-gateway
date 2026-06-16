# AgentPay Gateway

AgentPay Gateway is a testnet-only budget-aware purchasing layer for AI agents. It lets an AI agent receive a small USDC budget, decide which internet resources are worth buying, pay through x402-style access on Arc testnet, and return an answer with paid citations, receipts and provider earnings.

Demo sentence:

> AI agents need a budget-aware purchasing layer for internet resources. We built that layer on Arc + Circle + x402.

## Lepton RFB positioning

- Primary: RFB 01, Autonomous Paying Agents.
- Secondary: RFB 06, Creator & Publisher Monetization.
- Supporting: RFB 05, Nanopayment Infrastructure & Tooling.

The product should not be presented as a generic SDK or starter kit. The jury-facing story is a working agent application: the agent buys useful creator/publisher sources, skips low-value costs, records every payment, and shows who earned money.

## What is implemented

- Next.js App Router dashboard and API surface.
- Payment boundary modeled after the Circle Arc Nanopayments starter: unpaid calls return `402 Payment Required`; paid calls execute adapters only after server-side x402 settlement verification.
- Ten adapter/proxy integrations exposed as paid resource types: MCP, API proxy, Datasette, Crawl4AI worker, agent-to-agent delegation, memory/vector retrieval, inference endpoint, publisher/RSS paywall, SearXNG, and docs/source gateway.
- Agent budget engine with value scoring, cache-vs-pay decisions, skipped resources, receipts, spend and citation output.
- Supabase schema migrations plus runtime snapshot persistence for live dashboard state.
- FastAPI crawl worker with Crawl4AI support and safe HTML fallback.
- OpenAPI descriptor for generic paid API/tool integrations.
- Docker Compose examples for Datasette, SearXNG and the worker.

## Current audit baseline

As of 2026-06-16, the following commands pass locally:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
pnpm build
pnpm smoke:upstreams
```

`pnpm smoke:upstreams` verifies all ten adapter paths against running local upstream services. Generated files such as `.next/`, `.agentpay/`, `*.log`, `*.tsbuildinfo` and `_tmp_*` are ignored and should not be used as audit evidence. See [Current audit state](docs/current-audit-state.md) for exact boundaries.

Live production status on 2026-06-16:

- App: https://agentpay-gateway.vercel.app
- Repository: https://github.com/kaos35/agentpay-gateway
- Worker: `http://49.13.60.236:8010`
- Datasette: `http://49.13.60.236:8011`
- SearXNG: `http://49.13.60.236:8012`
- Latest full integration run: `run_7729fefa-9dbc-45ed-843e-7909ff5187e4`
- Full integration result: 10 paid resources, 10 settled x402 payments, 10 adapter fulfillments, 0 adapter errors, 0.016500 USDC total spend, 2 paid citations.

## Local quickstart

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

Open `http://localhost:3000` and run the Full Integration panel. If port 3000 is already occupied, Next.js may start on `http://localhost:3001`; use the URL printed by `pnpm dev`.

Optional worker:

```powershell
python -m pip install -r apps/worker/requirements.txt
pnpm worker:dev
```

Local upstreams for the real adapter path:

```powershell
docker compose up datasette searxng worker
```

With the default `.env.local`, the dataset, search, crawl, delegation, memory, inference and RSS paywall adapters call those services directly:

- `AGENTPAY_MCP_SERVER_URL=http://localhost:8000/mcp`
- `DATASETTE_BASE_URL=http://localhost:8001`
- `SEARXNG_BASE_URL=http://localhost:8080`
- `AGENTPAY_WORKER_URL=http://localhost:8000`
- `AGENTPAY_DELEGATION_URL=http://localhost:8000/agent/delegate`
- `AGENTPAY_MEMORY_URL=http://localhost:8000/memory/retrieve`
- `AGENTPAY_INFERENCE_URL=http://localhost:8000/inference/complete`
- `AGENTPAY_RSS_PAYWALL_URL=http://localhost:8000/rss/paywall`

The seeded adapter registry points at these real upstream services. The full integration path calls those upstreams directly.

Verify that the adapters reach the real upstream services:

```powershell
pnpm smoke:upstreams
```

This command expects Datasette, SearXNG and the worker to already be running. It verifies all ten adapters: MCP, API proxy, Datasette, Crawl4AI worker, agent delegation, memory retrieval, inference, RSS paywall, SearXNG and docs/source. It intentionally fails if an upstream is unavailable, because the product should prove real adapter execution instead of silently falling back to synthetic responses.

## Testnet posture

`.env.example` defaults to `AGENTPAY_PAYMENT_MODE=x402`. Configure `BUYER_ADDRESS`, `SELLER_ADDRESS`, provider-specific `SELLER_ADDRESS_1..3` and Circle CLI credentials in `.env.local` before running paid resources. Mainnet is blocked unless `ALLOW_MAINNET=true`.

In x402 mode, provider wallets must be real Arc testnet address-shaped values. Local fallback provider addresses are rejected before resource fulfillment. Server-side verification uses Circle Gateway batching settlement verification; paid adapters execute only after verification succeeds.

For live deployments, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so runtime state persists to Supabase `runtime_snapshots`. Set `AGENTPAY_ADMIN_API_KEY` before exposing provider publishing and `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` before accepting payment webhooks.

For audits, inspect `.env.local` or the running dashboard for the active payment mode. Test-only payment helpers are restricted to test code and are not the product runtime path.

## Important endpoints

- `POST /api/agent/runs`
- `GET /api/agent/runs/:id`
- `GET|POST /api/pay/:resourceId`
- `POST /api/providers/resources`
- `GET /api/resources`
- `POST /api/payments/webhook`
- `GET /api/metrics`
- `POST /mcp`
- `GET /.well-known/agentpay/openapi.json`

## Full integration prompt

```text
Research Arc nanopayment opportunities for creators and publishers. You have a 0.05 USDC budget. Decide which paid tools, APIs, datasets, crawls, delegated agents, memory, inference, RSS paywalls, searches and docs are worth buying. Produce an answer with paid citations, skipped sources, total spend, budget efficiency and creator/provider earnings.
```

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm smoke
pnpm smoke:upstreams
pnpm build
```

## Audit and submission docs

- [Architecture](docs/architecture.md)
- [Demo script](docs/demo-script.md)
- [Submission checklist](docs/submission-checklist.md)
- [Current audit state](docs/current-audit-state.md)
- [Deployment evidence pack](docs/deployment-evidence.md)

## Repo candidates checked

- Used: `circlefin/arc-nanopayments` as the payment-flow reference, Crawl4AI as the worker target, Datasette/SearXNG/APISIX-style proxying, agent delegation, memory retrieval, inference endpoints and publisher/RSS paywall adapters.
- Considered but skipped: native APISIX/Datasette plugins and platform forks, because the product strategy is adapter/proxy integration.
- Still external to the repository: live secrets, traction evidence and recorded walkthrough.
