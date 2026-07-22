# AgentPay Gateway

AgentPay Gateway is a testnet-only nanopayment access layer for AI agents. It lets an AI agent receive a small USDC budget, decide which pay-per-request internet resources are worth buying, pay through x402-style access on Arc testnet, and return an answer with citations, receipts and provider earnings.

Demo sentence:

> AI agents need a nanopayment access layer for internet resources. We built that layer on Arc + Circle + x402.

## Lepton RFB positioning

- Primary: RFB 01, Autonomous Paying Agents.
- Secondary: RFB 06, Creator & Publisher Monetization.
- Supporting: RFB 05, Nanopayment Infrastructure & Tooling.

The product should not be presented as a generic SDK, a shopping agent or an adapter demo. The jury-facing story is a working nanopayment gateway: the agent buys useful APIs, MCP tools, publisher content, agent services and usage-based services, skips low-value costs, records every payment, and shows who earned money.

## What is implemented

- Next.js App Router dashboard and API surface.
- Payment boundary modeled after the Circle Arc Nanopayments starter: unpaid calls return `402 Payment Required`; paid calls fulfill protected resources only after server-side x402 settlement verification.
- Five nanopayment access classes exposed as paid resources: premium API calls, MCP server/tool calls, web content or publisher sources, agent-to-agent services, and usage-based service access.
- Agent budget engine with value scoring, cache-vs-pay decisions, skipped resources, receipts, spend and citation output.
- Supabase schema migrations plus runtime snapshot persistence for live dashboard state.
- FastAPI access worker for paid MCP, agent delegation, inference and publisher content fulfillment.
- OpenAPI descriptor for generic paid API/tool integrations.
- Docker Compose example for the access worker.

## Current audit baseline

Run the verification suite on the exact commit you intend to share:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm audit --prod
python -m compileall -q apps/worker
```

Historical deployment identifiers and wallet activity are deliberately not treated as current audit evidence. Use the [jury deployment checklist](docs/jury-deployment-checklist.md) and the generated audit report for the release you share.
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

Local upstream for the real fulfillment path:

```powershell
docker compose up worker
```

When using Docker, pass `AGENTPAY_WORKER_GATEWAY_SECRET` and `AGENTPAY_PAYER_API_KEY` from your shell or a Compose `.env` file if you want the worker to enforce gateway-only access and expose the Circle payer endpoint. The same `AGENTPAY_WORKER_GATEWAY_SECRET` must also be set in the web/API runtime.

For a local Docker worker, set `AGENTPAY_ALLOW_LOCAL_UPSTREAMS=true` in that worker environment. Keep it `false` for deployed environments. The underlying fulfillment services call the worker and public allowlisted endpoints directly:

- `AGENTPAY_MCP_SERVER_URL=http://localhost:8000/mcp`
- `AGENTPAY_WORKER_URL=http://localhost:8000`
- `AGENTPAY_DELEGATION_URL=http://localhost:8000/agent/delegate`
- `AGENTPAY_INFERENCE_URL=http://localhost:8000/inference/complete`
- `AGENTPAY_INFERENCE_MODEL=qwen3:14b`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `AGENTPAY_RSS_PAYWALL_URL=http://localhost:8000/rss/paywall`

The seeded access registry points at these real upstream services. The full access flow calls those upstreams directly.

The usage-based service access path uses Ollama when the worker can reach `OLLAMA_BASE_URL`. With the recommended local setup, `qwen3:14b` acts as the paid model endpoint. If Ollama is unavailable, the worker returns a fulfillment error instead of pretending a model call happened.

Verify that the paid access paths reach the real upstream services:

```powershell
pnpm smoke:upstreams
```

This command expects the worker to already be running. It intentionally fails if an upstream is unavailable, because the product should prove real fulfillment instead of silently falling back to synthetic responses.

## Jury-safe deployment

This repository is a **testnet demonstration**, not a mainnet custody product. Before sharing a live x402 deployment with judges:

1. Set `AGENTPAY_RUNNER_API_KEY`, `AGENTPAY_MAX_RUN_BUDGET_USDC` (the default demo ceiling is `0.010000` USDC), `AGENTPAY_WORKER_GATEWAY_SECRET`, `AGENTPAY_PAYER_API_KEY`, and a webhook secret.
2. Give the runner key only to the presenter or an invited judge; send it as `x-agentpay-runner-key` when starting an agent run. Do not embed it in frontend code or a public URL.
3. Keep the worker on a private network where possible. Its paid endpoints reject unauthenticated gateway context, non-allowlisted upstreams, private-address targets, and redirect escapes by default.
4. Use a low-balance Arc testnet buyer wallet. Mainnet stays blocked unless `ALLOW_MAINNET=true`.

Public catalog, manifests, and aggregate metrics remain available for jury review. In production, detailed prompts, receipts, settlement evidence, and wallet balances require the runner or admin key.
## Testnet posture

`.env.example` defaults to `AGENTPAY_PAYMENT_MODE=x402`. Configure `BUYER_ADDRESS`, `SELLER_ADDRESS`, provider-specific `SELLER_ADDRESS_1..3` and Circle CLI credentials in `.env.local` before running paid resources. Mainnet is blocked unless `ALLOW_MAINNET=true`.

In x402 mode, provider wallets must be real Arc testnet address-shaped values. Local development provider addresses are rejected before resource fulfillment. Server-side verification uses Circle Gateway batching settlement verification; paid access is fulfilled only after verification succeeds.

For live deployments, set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` so runtime state persists to Supabase `runtime_snapshots`. Set `AGENTPAY_ADMIN_API_KEY` before exposing provider publishing, `AGENTPAY_WORKER_GATEWAY_SECRET` on both the web/API runtime and worker, and `AGENTPAY_WEBHOOK_SECRET` or `CIRCLE_WEBHOOK_SECRET` before accepting payment webhooks.

For audits, inspect `.env.local` or the running dashboard for the active payment mode. Test-only payment helpers are restricted to test code and are not the product runtime path.

## Important endpoints

- `POST /api/agent/runs`
- `GET /api/agent/runs/:id`
- `GET|POST /api/pay/:resourceId`
- `POST /api/providers`
- `POST /api/providers/resources`
- `POST /api/providers/resources/test`
- `GET /api/resources`
- `GET /api/resources/manifests`
- `GET /api/resources/:resourceId/manifest`
- `POST /api/payments/webhook`
- `GET /api/metrics`
- `POST /mcp`
- `GET /.well-known/agentpay/openapi.json`
- `GET /.well-known/agentpay/resources.json`

## External agent SDK usage

External agents can treat AgentPay as a nanopayment access gateway. The SDK does not mint or sign payment proofs. It reads the live catalog, prepares the x402 challenge, and sends the proof produced by an external wallet, Circle CLI flow or x402 payment client.

```ts
import { createAgentPayClient } from "@agentpay/sdk";

const agentpay = createAgentPayClient({
  baseUrl: "https://agentpay-gateway.vercel.app"
});

const resources = await agentpay.listResources();
const api = resources.find((resource) => resource.accessClass === "premium_api");
const purchase = await agentpay.prepareResourcePurchase({
  resourceId: api!.id
});

// The SDK does not create this proof. Produce it with an external x402 wallet,
// Circle CLI flow, or payment client using purchase.challenge.
const paymentProof = process.env.X402_PAYMENT_PROOF!;

const result = await agentpay.requestManifestResource({
  manifest: purchase.manifest,
  paymentProof,
  idempotencyKey: "agent-run-123"
});
```

Agents can also discover paid resources without the SDK through:

```text
GET /.well-known/agentpay/resources.json
GET /api/resources/:resourceId/manifest
```

Providers can protect their own endpoint with the same access-class language:

```ts
import { protect } from "@agentpay/sdk";

export const GET = protect(handler, {
  accessClass: "premium_api",
  price: "0.001 USDC",
  network: "eip155:5042002",
  seller: process.env.SELLER_ADDRESS!,
  resourceId: "premium-weather-api",
  verifierUrl: process.env.AGENTPAY_VERIFIER_URL!
});
```

In production, `protect()` refuses to execute the protected handler unless `verifierUrl` is configured. This prevents a resource server from treating a merely present payment header as proof of settlement.

## Full integration prompt

```text
Evaluate the full nanopayment access catalog on Arc: premium API call, MCP server/tool call, web content or publisher source, agent-to-agent service, and usage-based service access. Let the agent decide what is worth paying for, what should be skipped, and what can be reused from cache. Show total spend, fulfillment proof, citation receipts, and provider earnings.
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

- Used: `circlefin/arc-nanopayments` as the payment-flow reference, API proxying, MCP tools, agent delegation, inference endpoints and publisher/RSS paywall fulfillment paths.
- Considered but skipped: native platform plugins and platform forks, because the product strategy is a pay-per-request access gateway that external services can adopt without changing their core product.
- Still external to the repository: live secrets, traction evidence and recorded walkthrough.
