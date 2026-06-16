import { describe, expect, it } from "vitest";
import { createAdapterConfigs, seedData } from "@agentpay/adapters";

describe("adapter upstream config", () => {
  it("uses real local upstream defaults instead of in-app demo endpoints", () => {
    const configs = createAdapterConfigs({});

    expect(configFor(configs, "res_datasette").baseUrl).toBe("http://localhost:8001");
    expect(configFor(configs, "res_searxng").baseUrl).toBe("http://localhost:8080");
    expect(configFor(configs, "res_crawl4ai").workerUrl).toBe("http://localhost:8000");
    expect(configFor(configs, "res_mcp_tools").serverUrl).toBe("http://localhost:8000/mcp");
    expect(configFor(configs, "res_agent_delegation").targetUrl).toBe("http://localhost:8000/agent/delegate");
    expect(configFor(configs, "res_memory_retrieval").targetUrl).toBe("http://localhost:8000/memory/retrieve");
    expect(configFor(configs, "res_inference_endpoint").targetUrl).toBe("http://localhost:8000/inference/complete");
    expect(configFor(configs, "res_rss_paywall").targetUrl).toBe("http://localhost:8000/rss/paywall");
  });

  it("allows upstream URLs to be overridden from env", () => {
    const seed = seedData({
      DATASETTE_BASE_URL: "http://127.0.0.1:18001",
      SEARXNG_BASE_URL: "http://127.0.0.1:18080",
      AGENTPAY_WORKER_URL: "http://127.0.0.1:18000",
      AGENTPAY_MCP_SERVER_URL: "http://127.0.0.1:18000/mcp",
      AGENTPAY_DELEGATION_URL: "http://127.0.0.1:13000/agent",
      AGENTPAY_MEMORY_URL: "http://127.0.0.1:13000/memory",
      AGENTPAY_INFERENCE_URL: "http://127.0.0.1:13000/inference",
      AGENTPAY_RSS_PAYWALL_URL: "http://127.0.0.1:13000/rss",
      AGENTPAY_PUBLISHER_API_URL: "https://docs.x402.org/custom",
      AGENTPAY_DOCS_SOURCE_URL: "https://docs.arc.io/custom"
    });

    expect(configFor(seed.adapterConfigs, "res_datasette").baseUrl).toBe("http://127.0.0.1:18001");
    expect(configFor(seed.adapterConfigs, "res_searxng").baseUrl).toBe("http://127.0.0.1:18080");
    expect(configFor(seed.adapterConfigs, "res_crawl4ai").workerUrl).toBe("http://127.0.0.1:18000");
    expect(configFor(seed.adapterConfigs, "res_mcp_tools").serverUrl).toBe("http://127.0.0.1:18000/mcp");
    expect(configFor(seed.adapterConfigs, "res_agent_delegation").targetUrl).toBe("http://127.0.0.1:13000/agent");
    expect(configFor(seed.adapterConfigs, "res_memory_retrieval").targetUrl).toBe("http://127.0.0.1:13000/memory");
    expect(configFor(seed.adapterConfigs, "res_inference_endpoint").targetUrl).toBe("http://127.0.0.1:13000/inference");
    expect(configFor(seed.adapterConfigs, "res_rss_paywall").targetUrl).toBe("http://127.0.0.1:13000/rss");
    expect(configFor(seed.adapterConfigs, "res_api_proxy").targetUrl).toBe("https://docs.x402.org/custom");
    expect(configFor(seed.adapterConfigs, "res_docs_source").sourceUrl).toBe("https://docs.arc.io/custom");
  });
});

function configFor(configs: ReturnType<typeof createAdapterConfigs>, resourceId: string) {
  const config = configs.find((candidate) => candidate.resourceId === resourceId)?.config;
  if (!config) throw new Error(`Missing config for ${resourceId}`);
  return config as Record<string, string>;
}
