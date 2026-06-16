import { describe, expect, it } from "vitest";
import { seedData } from "@agentpay/adapters";
import { AgentPayStore } from "@agentpay/db";
import { nowIso } from "@agentpay/shared";

describe("agentpay store", () => {
  it("persists provider-published resources and adapter configs in snapshots", () => {
    const store = new AgentPayStore(seedData());
    store.upsertResource(
      {
        id: "res_partner_api",
        providerId: "provider_creator_research",
        name: "Partner API",
        description: "Partner-published API",
        adapterType: "api_proxy",
        priceUsdc: 0.001,
        expectedValue: 0.7,
        freshnessScore: 0.7,
        confidenceScore: 0.7,
        enabled: true,
        createdAt: nowIso()
      },
      {
        resourceId: "res_partner_api",
        config: { targetUrl: "https://docs.x402.org/" }
      }
    );

    const restored = new AgentPayStore(seedData(), store.snapshot());

    expect(restored.getResource("res_partner_api")?.name).toBe("Partner API");
    expect(restored.getAdapterConfig("res_partner_api")?.config["targetUrl"]).toBe("https://docs.x402.org/");
  });
});
