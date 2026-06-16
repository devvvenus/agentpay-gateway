import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore } from "../apps/web/lib/runtime";
import { POST as publishResource } from "../apps/web/app/api/providers/resources/route";
import { GET as payResource } from "../apps/web/app/api/pay/[resourceId]/route";
import { POST as paymentWebhook } from "../apps/web/app/api/payments/webhook/route";
import { GET as metricsRoute } from "../apps/web/app/api/metrics/route";

describe("api routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AGENTPAY_ADMIN_API_KEY;
    delete process.env.AGENTPAY_WEBHOOK_SECRET;
    delete process.env.AGENTPAY_PAYMENT_MODE;
    delete process.env.SELLER_ADDRESS;
    delete process.env.BUYER_ADDRESS;
    delete process.env.X402_FACILITATOR_URL;
    globalThis.__agentpayStore = undefined;
    globalThis.__agentpayStorePromise = undefined;
  });

  it("requires an admin key before publishing provider resources when configured", async () => {
    process.env.AGENTPAY_ADMIN_API_KEY = "admin-secret";
    const response = await publishResource(
      new Request("http://localhost/api/providers/resources", {
        method: "POST",
        body: JSON.stringify({
          name: "Paid API",
          description: "Publisher endpoint",
          adapterType: "api_proxy",
          priceUsdc: 0.001,
          config: { targetUrl: "https://docs.x402.org/" }
        })
      })
    );

    expect(response.status).toBe(401);
  });

  it("validates adapter config before publishing provider resources", async () => {
    process.env.AGENTPAY_ADMIN_API_KEY = "admin-secret";
    const response = await publishResource(
      new Request("http://localhost/api/providers/resources", {
        method: "POST",
        headers: { authorization: "Bearer admin-secret" },
        body: JSON.stringify({
          name: "Broken Dataset",
          description: "Missing SQL",
          adapterType: "dataset",
          priceUsdc: 0.001,
          config: { baseUrl: "http://localhost:8001" }
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("config.sql");
  });

  it("does not execute a paid resource when Circle Gateway settlement verification fails", async () => {
    process.env.SELLER_ADDRESS = "0x1111111111111111111111111111111111111111";
    process.env.BUYER_ADDRESS = "0x2222222222222222222222222222222222222222";
    const response = await payResource(
      new Request("http://localhost/api/pay/res_mcp_tools", {
        headers: {
          "payment-signature": Buffer.from(JSON.stringify({ x402Version: 2, payload: {} })).toString("base64")
        }
      }),
      { params: Promise.resolve({ resourceId: "res_mcp_tools" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toBeTruthy();
  });

  it("maps signed webhook events into payment status updates", async () => {
    process.env.AGENTPAY_PAYMENT_MODE = "test";
    process.env.AGENTPAY_WEBHOOK_SECRET = "webhook-secret";
    const store = await getStore();
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const payment = store.addPaymentEvent({
      id: "pevt_route_test",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "route_payment_1",
      status: "pending_verification",
      metadata: {},
      createdAt: new Date().toISOString()
    });
    store.addProviderEarning({
      id: "earn_route_test",
      providerId: provider.id,
      resourceId: resource.id,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      settlementStatus: "pending",
      createdAt: new Date().toISOString()
    });

    const rawBody = JSON.stringify({ paymentIdentifier: payment.paymentIdentifier, status: "settled" });
    const signature = `sha256=${createHmac("sha256", "webhook-secret").update(rawBody).digest("hex")}`;
    const response = await paymentWebhook(
      new Request("http://localhost/api/payments/webhook", {
        method: "POST",
        headers: { "x-agentpay-signature": signature },
        body: rawBody
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.updatedPayment.status).toBe("settled");
    expect(store.listProviderEarnings()[0]?.settlementStatus).toBe("settled");
  });

  it("separates attempted and settled payment metrics", async () => {
    const store = await getStore();
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    store.addPaymentEvent({
      id: "pevt_pending_metric",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "metric_pending",
      status: "pending_verification",
      metadata: {},
      createdAt: new Date().toISOString()
    });
    store.addPaymentEvent({
      id: "pevt_settled_metric",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "metric_settled",
      status: "settled",
      metadata: {},
      createdAt: new Date().toISOString()
    });

    const response = await metricsRoute();
    const body = await response.json();

    expect(body.attemptedPaidCalls).toBe(2);
    expect(body.settledPaidCalls).toBe(1);
    expect(body.pendingVerificationCalls).toBe(1);
    expect(body.totalUsdcVolume).toBe(resource.priceUsdc);
  });
});
