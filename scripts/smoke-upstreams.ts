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
      sourceUrl: "https://docs.arc.io/"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { result?: unknown } };
      if (!data.data || typeof data.data !== "object" || !("result" in data.data)) {
        throw new Error("MCP smoke did not return a JSON-RPC result");
      }
    }
  },
  {
    resourceId: "res_api_proxy",
    payload: {},
    assert: (result: AdapterResult) => {
      const data = result.data as { status?: number; data?: unknown };
      if (typeof data.status !== "number" || data.status < 200 || data.status >= 300) {
        throw new Error("API proxy smoke did not return a successful upstream status");
      }
    }
  },
  {
    resourceId: "res_datasette",
    payload: {
      sql: "select metric, value from demo_metrics order by metric"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { rows?: unknown[] };
      if (!Array.isArray(data.rows) || data.rows.length === 0) {
        throw new Error("Datasette smoke returned no rows");
      }
    }
  },
  {
    resourceId: "res_searxng",
    payload: {
      query: "Arc x402 nanopayments"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { resultCount?: number };
      if (typeof data.resultCount !== "number") {
        throw new Error("SearXNG smoke did not return a result count");
      }
    }
  },
  {
    resourceId: "res_crawl4ai",
    payload: {
      url: process.env.AGENTPAY_SMOKE_CRAWL_URL || "https://developers.circle.com/gateway/nanopayments"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { markdown?: string };
      if (typeof data.markdown !== "string" || data.markdown.length === 0) {
        throw new Error("Crawl worker smoke returned empty markdown");
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
    resourceId: "res_memory_retrieval",
    payload: {
      query: "Arc x402 budget-aware purchasing layer"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { matches?: unknown[] } };
      if (!Array.isArray(data.data?.matches) || data.data.matches.length === 0) {
        throw new Error("Memory retrieval smoke returned no matches");
      }
    }
  },
  {
    resourceId: "res_inference_endpoint",
    payload: {},
    assert: (result: AdapterResult) => {
      const data = result.data as { data?: { completion?: string; status?: string } };
      if (data.data?.status !== "completed" || typeof data.data.completion !== "string") {
        throw new Error("Inference smoke did not complete");
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
  },
  {
    resourceId: "res_docs_source",
    payload: {
      sourceUrl: "https://docs.arc.io/"
    },
    assert: (result: AdapterResult) => {
      const data = result.data as { citationReceipt?: unknown; excerpt?: string };
      if (!data.citationReceipt || typeof data.excerpt !== "string" || data.excerpt.length === 0) {
        throw new Error("Docs/source smoke did not return a citation receipt");
      }
    }
  }
];

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
        "Start the local upstreams with: docker compose up datasette searxng worker"
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
