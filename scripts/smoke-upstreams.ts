import { createAdapter, seedData } from "@agentpay/adapters";
import { nowIso, type AdapterResult, type PaymentEvent, type Resource } from "@agentpay/shared";

const seed = seedData();
const allowedHosts = (
  process.env.AGENTPAY_ALLOWED_HOSTS ||
  "localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,www.arc.network,arc.network"
)
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

const checks = [
  {
    resourceId: "res_mcp_tools",
    payload: {
      toolName: "paid_source_fetch",
      sourceUrl: "https://docs.x402.org/"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { result?: { structuredContent?: { sourceUrl?: string; title?: string } } } };
      if (
        data.data?.result?.structuredContent?.sourceUrl !== "https://docs.x402.org/" ||
        typeof data.data.result.structuredContent.title !== "string"
      ) {
        throw new Error("MCP smoke did not return paid source evidence");
      }
    }
  },
  {
    resourceId: "res_api_proxy",
    payload: {},
    assert: (result: AdapterResult) => {
      const data = result.data as { status?: number; data?: { provider?: string; source?: { title?: string } } };
      if (typeof data.status !== "number" || data.status < 200 || data.status >= 300) {
        throw new Error("API proxy smoke did not return a successful upstream status");
      }
      if (data.data?.provider !== "x402-docs-premium-api" || typeof data.data.source?.title !== "string") {
        throw new Error("API proxy smoke did not return premium provider JSON evidence");
      }
    }
  },
  {
    resourceId: "res_agent_delegation",
    payload: {
      task: "compare paid publisher resources"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { delegatedTask?: string; status?: string } };
      if (data.data?.status !== "completed") {
        throw new Error("Agent delegation smoke did not complete");
      }
    }
  },
  {
    resourceId: "res_inference_endpoint",
    payload: {},
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { completion?: string; status?: string; provider?: string } };
      if (data.data?.status !== "completed" || data.data.provider !== "ollama" || typeof data.data.completion !== "string") {
        throw new Error("Inference smoke did not complete with the real Ollama provider");
      }
    }
  },
  {
    resourceId: "res_rss_paywall",
    payload: {
      feedUrl: "https://www.arc.network/blog/rss.xml"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { receipt?: unknown; article?: { title?: string } } };
      if (!data.data?.receipt || typeof data.data.article?.title !== "string") {
        throw new Error("RSS paywall smoke did not return article receipt");
      }
    }
  }
];

const directPremiumResponse = await fetch("http://localhost:8000/premium-api/x402-summary?sourceUrl=https%3A%2F%2Fdocs.x402.org%2F");
if (directPremiumResponse.status !== 402) {
  throw new Error(`Premium API direct access should require payment context; got ${directPremiumResponse.status}`);
}
console.log("x402 Docs Premium API direct access guard passed");

const directInferenceResponse = await fetch("http://localhost:8000/inference/complete", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "direct unpaid inference request",
    model: "qwen3:14b",
    paymentIdentifier: "direct-unpaid"
  })
});
if (directInferenceResponse.status !== 402) {
  throw new Error(`Inference direct access should require payment context; got ${directInferenceResponse.status}`);
}
console.log("Ollama Usage-Based Inference direct access guard passed");

const directDelegationResponse = await fetch("http://localhost:8000/agent/delegate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    prompt: "direct unpaid delegation request",
    payload: { task: "unpaid" },
    paymentIdentifier: "direct-unpaid"
  })
});
if (directDelegationResponse.status !== 402) {
  throw new Error(`Agent delegation direct access should require payment context; got ${directDelegationResponse.status}`);
}
console.log("Specialist Research Agent direct access guard passed");

const directRssResponse = await fetch("http://localhost:8000/rss/paywall", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    feedUrl: "https://www.arc.network/blog/rss.xml",
    articleUrl: "https://www.arc.network/blog/introducing-the-arc-token-whitepaper",
    paymentIdentifier: "direct-unpaid"
  })
});
if (directRssResponse.status !== 402) {
  throw new Error(`Publisher paywall direct access should require payment context; got ${directRssResponse.status}`);
}
console.log("Arc Publisher Article Unlock direct access guard passed");

const directMcpResponse = await fetch("http://localhost:8000/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "direct-unpaid",
    method: "tools/call",
    params: {
      name: "paid_source_fetch",
      arguments: { sourceUrl: "https://docs.x402.org/" }
    }
  })
});
if (directMcpResponse.status !== 402) {
  throw new Error(`MCP paid tool direct access should require payment context; got ${directMcpResponse.status}`);
}
console.log("Paid MCP Source Tool direct access guard passed");

for (const check of checks) {
  try {
    const resource = resourceFor(check.resourceId);
    const config = configFor(check.resourceId);
    const provider = seed.providers.find((candidate) => candidate.id === resource.providerId);
    if (!provider) throw new Error(`Missing provider for ${resource.id}`);

    const adapter = createAdapter(resource.adapterType);
    const quote = await adapter.quote({ resource, config, payload: check.payload });
    const payment = paymentFor(resource);
    const result = await adapter.execute(
      {
        resource,
        config,
        payload: check.payload,
        prompt: "AgentPay upstream smoke"
      },
      {
        resource,
        provider,
        quote,
        payment,
        now: nowIso(),
        allowedHosts
      }
    );

    if (result.status !== "ok") {
      throw new Error(`${resource.name} returned ${result.status}`);
    }
    check.assert(result);
    console.log(`${resource.name} upstream smoke passed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${check.resourceId} upstream smoke failed: ${message}\n` +
        "Start the local upstreams with: docker compose up worker"
    );
  }
}

console.log("AgentPay upstream smoke passed");

function resourceFor(resourceId: string): Resource {
  const resource = seed.resources.find((candidate) => candidate.id === resourceId);
  if (!resource) throw new Error(`Missing resource ${resourceId}`);
  return resource;
}

function configFor(resourceId: string): Record<string, unknown> {
  const config = seed.adapterConfigs.find((candidate) => candidate.resourceId === resourceId)?.config;
  if (!config) throw new Error(`Missing adapter config ${resourceId}`);
  return config;
}

function paymentFor(resource: Resource): PaymentEvent {
  return {
    id: `smoke_${resource.id}`,
    resourceId: resource.id,
    adapterType: resource.adapterType,
    amountUsdc: resource.priceUsdc,
    network: "arc-testnet",
    buyerWallet: "0x0000000000000000000000000000000000000000",
    sellerWallet: "0x0000000000000000000000000000000000000000",
    paymentIdentifier: `smoke_${resource.id}_${Date.now()}`,
    status: "settled",
    metadata: { smoke: true },
    createdAt: nowIso()
  };
}
