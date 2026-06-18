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
        accessClass: "premium_api",
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

  it("counts paid providers and average payment from settled payments only", () => {
    const store = new AgentPayStore(seedData());
    store.addPaymentEvent({
      id: "pevt_pending",
      resourceId: "res_api_proxy",
      adapterType: "api_proxy",
      amountUsdc: 0.0015,
      network: "eip155:5042002",
      buyerWallet: "0x3700000000000000000000000000000000001e28",
      sellerWallet: "0x3700000000000000000000000000000000001e29",
      paymentIdentifier: "pending_metric",
      txOrSettlementRef: "eip155:5042002:pending_metric",
      status: "pending_verification",
      metadata: {},
      createdAt: nowIso()
    });
    store.addProviderEarning({
      id: "earn_pending",
      providerId: "provider_creator_research",
      resourceId: "res_api_proxy",
      amountUsdc: 0.0015,
      network: "eip155:5042002",
      settlementStatus: "pending",
      createdAt: nowIso()
    });

    expect(store.metrics().providersPaid).toBe(0);
    expect(store.metrics().averagePaymentUsdc).toBe(0);

    store.updatePaymentEventStatus("pending_metric", "settled");

    expect(store.metrics().providersPaid).toBe(1);
    expect(store.metrics().averagePaymentUsdc).toBe(0.0015);
  });

  it("updates provider earnings by payment event id when multiple same-priced payments exist", () => {
    const store = new AgentPayStore(seedData());
    const base = {
      resourceId: "res_api_proxy",
      adapterType: "api_proxy" as const,
      amountUsdc: 0.0015,
      network: "eip155:5042002",
      buyerWallet: "0x3700000000000000000000000000000000001e28",
      sellerWallet: "0x3700000000000000000000000000000000001e29",
      txOrSettlementRef: "eip155:5042002:same_price",
      status: "pending_verification" as const,
      metadata: {},
      createdAt: nowIso()
    };
    store.addPaymentEvent({ ...base, id: "pevt_same_price_1", paymentIdentifier: "same_price_1" });
    store.addPaymentEvent({ ...base, id: "pevt_same_price_2", paymentIdentifier: "same_price_2" });
    store.addProviderEarning({
      id: "earn_same_price_1",
      paymentEventId: "pevt_same_price_1",
      providerId: "provider_creator_research",
      resourceId: "res_api_proxy",
      amountUsdc: 0.0015,
      network: "eip155:5042002",
      settlementStatus: "pending",
      createdAt: "2026-06-18T00:00:01.000Z"
    });
    store.addProviderEarning({
      id: "earn_same_price_2",
      paymentEventId: "pevt_same_price_2",
      providerId: "provider_creator_research",
      resourceId: "res_api_proxy",
      amountUsdc: 0.0015,
      network: "eip155:5042002",
      settlementStatus: "pending",
      createdAt: "2026-06-18T00:00:02.000Z"
    });

    store.updatePaymentEventStatus("same_price_1", "settled");

    const earnings = store.listProviderEarnings();
    expect(earnings.find((earning) => earning.id === "earn_same_price_1")?.settlementStatus).toBe("settled");
    expect(earnings.find((earning) => earning.id === "earn_same_price_2")?.settlementStatus).toBe("pending");
  });
});
