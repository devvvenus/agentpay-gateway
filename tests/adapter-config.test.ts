import { describe, expect, it } from "vitest";
import { createAdapterConfigs, seedData } from "@agentpay/adapters";

describe("adapter upstream config", () => {
  it("uses real local upstream defaults instead of in-app demo endpoints", () => {
    const configs = createAdapterConfigs({});

    expect(configFor(configs, "res_mcp_tools").serverUrl).toBe("http://localhost:8000/mcp");
    expect(configFor(configs, "res_mcp_tools").sourceUrl).toBe("https://docs.x402.org/");
    expect(configFor(configs, "res_agent_delegation").targetUrl).toBe("http://localhost:8000/agent/delegate");
    expect(configFor(configs, "res_inference_endpoint").targetUrl).toBe("http://localhost:8000/inference/complete");
    expect(configFor(configs, "res_rss_paywall").targetUrl).toBe("http://localhost:8000/rss/paywall");
    expect(configFor(configs, "res_api_proxy").targetUrl).toBe(
      "http://localhost:8000/premium-api/x402-summary?sourceUrl=https%3A%2F%2Fdocs.x402.org%2F"
    );
  });

  it("allows upstream URLs to be overridden from env", () => {
    const seed = seedData({
      AGENTPAY_WORKER_URL: "http://127.0.0.1:18000",
      AGENTPAY_MCP_SERVER_URL: "http://127.0.0.1:18000/mcp",
      AGENTPAY_DELEGATION_URL: "http://127.0.0.1:13000/agent",
      AGENTPAY_INFERENCE_URL: "http://127.0.0.1:13000/inference",
      AGENTPAY_RSS_PAYWALL_URL: "http://127.0.0.1:13000/rss",
      AGENTPAY_PUBLISHER_API_URL: "https://docs.x402.org/custom"
    });

    expect(configFor(seed.adapterConfigs, "res_mcp_tools").serverUrl).toBe("http://127.0.0.1:18000/mcp");
    expect(configFor(seed.adapterConfigs, "res_agent_delegation").targetUrl).toBe("http://127.0.0.1:13000/agent");
    expect(configFor(seed.adapterConfigs, "res_inference_endpoint").targetUrl).toBe("http://127.0.0.1:13000/inference");
    expect(configFor(seed.adapterConfigs, "res_rss_paywall").targetUrl).toBe("http://127.0.0.1:13000/rss");
    expect(configFor(seed.adapterConfigs, "res_api_proxy").targetUrl).toBe("https://docs.x402.org/custom");
  });
});

function configFor(configs: ReturnType<typeof createAdapterConfigs>, resourceId: string) {
  const config = configs.find((candidate) => candidate.resourceId === resourceId)?.config;
  if (!config) throw new Error(`Missing config for ${resourceId}`);
  return config as Record<string, string>;
}
