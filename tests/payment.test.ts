import { afterEach, describe, expect, it, vi } from "vitest";
import { seedData } from "@agentpay/adapters";
import { AgentPayStore } from "@agentpay/db";
import { PaymentService } from "@agentpay/payments";

describe("payment boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a 402 challenge for unpaid resource access", () => {
    const store = new AgentPayStore(seedData({
      SELLER_ADDRESS: "0x1111111111111111111111111111111111111111",
      BUYER_ADDRESS: "0x2222222222222222222222222222222222222222"
    }));
    const resource = store.getResource("res_mcp_tools");
    const provider = store.getProvider(resource!.providerId);
    expect(resource).toBeDefined();
    expect(provider).toBeDefined();

    const payment = new PaymentService(store, x402Config(provider!.walletAddress));
    const result = payment.verifyIncoming({
      resource: resource!,
      provider: provider!,
      headers: new Headers(),
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    expect(result.ok).toBe(false);
    expect(result.challenge?.status).toBe(402);
    expect(result.challenge?.accepts[0]?.scheme).toBe("exact");
    expect(result.challenge?.accepts[0]?.extra?.name).toBe("GatewayWalletBatched");
    expect(result.challenge?.accepts[0]?.extra?.verifyingContract).toBeDefined();
    expect(result.challenge?.accepts[0]?.payTo).toBe(provider!.walletAddress);
  });

  it("accepts test-only paid headers and records provider earnings in test mode", () => {
    const store = new AgentPayStore(seedData());
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, {
      network: "eip155:5042002",
      mode: "test",
      sellerAddress: provider.walletAddress,
      buyerAddress: "0xbuyer",
      allowMainnet: false,
      appUrl: "http://localhost:3000"
    });
    const token = payment.createTestPaymentToken(resource);
    const result = payment.verifyIncoming({
      resource,
      provider,
      headers: new Headers({ "x-agentpay-test-payment": token }),
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    expect(result.ok).toBe(true);
    expect(store.listPaymentEvents()).toHaveLength(1);
    expect(store.listProviderEarnings()).toHaveLength(1);
  });

  it("marks repeated payment identifiers as replayed without duplicating provider earnings", () => {
    const store = new AgentPayStore(seedData());
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, {
      network: "eip155:5042002",
      mode: "test",
      sellerAddress: provider.walletAddress,
      buyerAddress: "0xbuyer",
      allowMainnet: false,
      appUrl: "http://localhost:3000"
    });
    const token = payment.createTestPaymentToken(resource);
    const headers = new Headers({ "x-agentpay-test-payment": token });

    const first = payment.verifyIncoming({
      resource,
      provider,
      headers,
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });
    const replay = payment.verifyIncoming({
      resource,
      provider,
      headers,
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    expect(first.ok).toBe(true);
    expect(replay.ok).toBe(true);
    expect(replay.payment?.status).toBe("replayed");
    expect(store.listPaymentEvents()).toHaveLength(1);
    expect(store.listProviderEarnings()).toHaveLength(1);
  });

  it("settles a verified x402 payment and its provider earning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ valid: true, status: "settled", tx: "0xtest" }))
    );
    const store = new AgentPayStore(seedData({
      SELLER_ADDRESS: "0x1111111111111111111111111111111111111111",
      BUYER_ADDRESS: "0x2222222222222222222222222222222222222222"
    }));
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, x402Config(provider.walletAddress));

    const result = payment.verifyIncoming({
      resource,
      provider,
      headers: new Headers({ "payment-signature": "test-signature" }),
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    expect(result.payment?.status).toBe("pending_verification");
    const verification = await payment.verifySettlement({
      payment: result.payment!,
      resource,
      provider,
      headers: new Headers({ "payment-signature": "test-signature" }),
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });
    expect(verification.ok).toBe(true);
    const settled = store.updatePaymentEventStatus(result.payment!.paymentIdentifier, "settled", {
      verifiedBy: "server-side-facilitator",
      settlementEvidence: verification.evidence
    });
    expect(settled?.status).toBe("settled");
    expect(store.listProviderEarnings()[0]?.settlementStatus).toBe("settled");
  });

  it("records fulfillment failure metadata without pretending payment settled", () => {
    const store = new AgentPayStore(seedData({
      SELLER_ADDRESS: "0x1111111111111111111111111111111111111111",
      BUYER_ADDRESS: "0x2222222222222222222222222222222222222222"
    }));
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, x402Config(provider.walletAddress));

    const result = payment.verifyIncoming({
      resource,
      provider,
      headers: new Headers({ "payment-signature": "test-signature" }),
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });
    const updated = store.updatePaymentEventStatus(result.payment!.paymentIdentifier, "pending_verification", {
      fulfillmentStatus: "failed",
      adapterError: "upstream unavailable"
    });

    expect(updated?.status).toBe("pending_verification");
    expect(updated?.metadata["fulfillmentStatus"]).toBe("failed");
    expect(store.listProviderEarnings()[0]?.settlementStatus).toBe("pending");
  });

  it("falls back to Circle Gateway settlement when no custom verifier URL is configured", async () => {
    const store = new AgentPayStore(seedData({
      SELLER_ADDRESS: "0x1111111111111111111111111111111111111111",
      BUYER_ADDRESS: "0x2222222222222222222222222222222222222222"
    }));
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, {
      ...x402Config(provider.walletAddress),
      facilitatorUrl: undefined
    });
    const headers = new Headers({
      "payment-signature": Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64")
    });
    const result = payment.verifyIncoming({
      resource,
      provider,
      headers,
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    const verification = await payment.verifySettlement({
      payment: result.payment!,
      resource,
      provider,
      headers,
      requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
    });

    expect(verification.ok).toBe(false);
    expect(verification.status).toBe("failed");
    expect(verification.error).not.toContain("X402_FACILITATOR_URL");
  });

  it("rejects local-only provider wallets in x402 mode", () => {
    const store = new AgentPayStore(seedData());
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = new PaymentService(store, x402Config("0x1111111111111111111111111111111111111111"));

    expect(() =>
      payment.verifyIncoming({
        resource,
        provider,
        headers: new Headers({ "payment-signature": "test-signature" }),
        requestUrl: "http://localhost:3000/api/pay/res_mcp_tools"
      })
    ).toThrow(/provider wallet/i);
  });
});

function x402Config(sellerAddress: string) {
  return {
    network: "eip155:5042002",
    mode: "x402" as const,
    sellerAddress,
    buyerAddress: "0x2222222222222222222222222222222222222222",
    allowMainnet: false,
    appUrl: "http://localhost:3000",
    facilitatorUrl: "http://localhost:9999/verify"
  };
}
