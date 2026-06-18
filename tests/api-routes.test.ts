import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStore } from "../apps/web/lib/runtime";
import { POST as createProvider } from "../apps/web/app/api/providers/route";
import { PATCH as updateProvider } from "../apps/web/app/api/providers/[providerId]/route";
import { POST as publishResource } from "../apps/web/app/api/providers/resources/route";
import { PATCH as updateResource } from "../apps/web/app/api/providers/resources/[resourceId]/route";
import { GET as payResource } from "../apps/web/app/api/pay/[resourceId]/route";
import { GET as listManifests } from "../apps/web/app/api/resources/manifests/route";
import { GET as getManifest } from "../apps/web/app/api/resources/[resourceId]/manifest/route";
import { POST as paymentWebhook } from "../apps/web/app/api/payments/webhook/route";
import { GET as latestPaymentRoute } from "../apps/web/app/api/payments/latest/route";
import { GET as metricsRoute } from "../apps/web/app/api/metrics/route";
import { GET as receiptsRoute } from "../apps/web/app/api/receipts/route";

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
          accessClass: "premium_api",
          priceUsdc: 0.001,
          config: { targetUrl: "https://docs.x402.org/" }
        })
      })
    );

    expect(response.status).toBe(401);
  });

  it("does not expose provider onboarding mutations in production without an admin key", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const response = await publishResource(
        new Request("http://localhost/api/providers/resources", {
          method: "POST",
          body: JSON.stringify({
            name: "Paid API",
            description: "Publisher endpoint",
            accessClass: "premium_api",
            priceUsdc: 0.001,
            config: { targetUrl: "https://docs.x402.org/" }
          })
        })
      );
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body.error).toContain("AGENTPAY_ADMIN_API_KEY");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("validates adapter config before publishing provider resources", async () => {
    process.env.AGENTPAY_ADMIN_API_KEY = "admin-secret";
    const response = await publishResource(
      new Request("http://localhost/api/providers/resources", {
        method: "POST",
        headers: { authorization: "Bearer admin-secret" },
        body: JSON.stringify({
          name: "Broken Premium API",
          description: "Missing target URL",
          accessClass: "premium_api",
          priceUsdc: 0.001,
          config: {}
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("config.targetUrl");
  });

  it("creates provider seller profiles with address validation", async () => {
    const response = await createProvider(
      new Request("http://localhost/api/providers", {
        method: "POST",
        body: JSON.stringify({
          name: "Premium Data Provider",
          walletAddress: "0x3333333333333333333333333333333333333333"
        })
      })
    );
    const body = await response.json();
    const store = await getStore();

    expect(response.status).toBe(201);
    expect(body.provider.name).toBe("Premium Data Provider");
    expect(store.getProvider(body.provider.id)?.walletAddress).toBe("0x3333333333333333333333333333333333333333");
  });

  it("updates providers and disables published resources", async () => {
    const store = await getStore();
    const provider = store.listProviders()[0]!;
    const providerResponse = await updateProvider(
      new Request(`http://localhost/api/providers/${provider.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated Provider",
          walletAddress: "0x4444444444444444444444444444444444444444"
        })
      }),
      { params: Promise.resolve({ providerId: provider.id }) }
    );
    const providerBody = await providerResponse.json();

    expect(providerResponse.status).toBe(200);
    expect(providerBody.provider.name).toBe("Updated Provider");
    expect(store.getProvider(provider.id)?.walletAddress).toBe("0x4444444444444444444444444444444444444444");

    const resource = store.getResource("res_api_proxy")!;
    const resourceResponse = await updateResource(
      new Request(`http://localhost/api/providers/resources/${resource.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: false,
          config: { targetUrl: "https://docs.x402.org/" }
        })
      }),
      { params: Promise.resolve({ resourceId: resource.id }) }
    );
    const resourceBody = await resourceResponse.json();

    expect(resourceResponse.status).toBe(200);
    expect(resourceBody.resource.enabled).toBe(false);
    expect(store.listResources().some((candidate) => candidate.id === resource.id)).toBe(false);
  });

  it("serves machine-readable resource manifests", async () => {
    const catalogResponse = await listManifests(new Request("http://localhost/api/resources/manifests"));
    const catalog = await catalogResponse.json();
    const manifestResponse = await getManifest(
      new Request("http://localhost/api/resources/res_api_proxy/manifest"),
      { params: Promise.resolve({ resourceId: "res_api_proxy" }) }
    );
    const manifest = await manifestResponse.json();

    expect(catalogResponse.status).toBe(200);
    expect(catalog.schemaVersion).toBe("agentpay.resourceCatalog.v1");
    expect(catalog.manifests.length).toBeGreaterThan(0);
    expect(manifest.schemaVersion).toBe("agentpay.resource.v1");
    expect(manifest.resourceId).toBe("res_api_proxy");
    expect(manifest.payment.protocol).toBe("x402");
    expect(manifest.payment.challengeStatus).toBe(402);
    expect(manifest.price.atomicAmount).toBe("1500");
    expect(manifest.provider.sellerWallet).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(manifest.fulfillment.inputSchema.type).toBe("object");
    expect(manifest.fulfillment.outputSchema.type).toBe("object");
    expect(manifest.capabilities.cacheable).toBe(true);
    expect(manifest.capabilities.testable).toBe(true);
    expect(manifest.trust).toEqual({
      testnetOnly: true,
      settlementRequired: true,
      replayProtected: true,
      allowedHostsEnforced: true
    });
    expect(manifest.links.pay).toBe("http://localhost/api/pay/res_api_proxy");

    const mcpManifestResponse = await getManifest(
      new Request("http://localhost/api/resources/res_mcp_tools/manifest"),
      { params: Promise.resolve({ resourceId: "res_mcp_tools" }) }
    );
    const mcpManifest = await mcpManifestResponse.json();
    expect(mcpManifest.capabilities.citations).toBe(true);
    expect(mcpManifest.fulfillment.inputSchema.properties.sourceUrl.format).toBe("uri");
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
      paymentEventId: payment.id,
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

  it("returns detailed receipt and settlement explorer records", async () => {
    const store = await getStore();
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const createdAt = new Date().toISOString();
    const payment = store.addPaymentEvent({
      id: "pevt_receipt_explorer",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "receipt_explorer_payment",
      status: "settled",
      metadata: {
        verifiedBy: "server-side-facilitator",
        verifiedAt: createdAt,
        settlementEvidence: { verifier: "test", ok: true },
        fulfillmentStatus: "delivered",
        fulfilledAt: createdAt
      },
      createdAt
    });
    store.addProviderEarning({
      id: "earn_receipt_explorer",
      paymentEventId: payment.id,
      providerId: provider.id,
      resourceId: resource.id,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      settlementStatus: "settled",
      createdAt
    });
    store.addReceipt({
      id: "rcpt_receipt_explorer",
      paymentEventId: payment.id,
      resourceId: resource.id,
      receipt: {
        paymentIdentifier: payment.paymentIdentifier,
        citations: [{ title: "Paid MCP Source", sourceUrl: "https://docs.x402.org/" }]
      },
      createdAt
    });

    const response = await receiptsRoute();
    const body = await response.json();
    const entry = body.entries.find((candidate: { paymentId: string }) => candidate.paymentId === payment.id);

    expect(response.status).toBe(200);
    expect(entry.paymentStatus).toBe("settled");
    expect(entry.settlementStatus).toBe("settled");
    expect(entry.fulfillmentStatus).toBe("delivered");
    expect(entry.settlementEvidence).toEqual({ verifier: "test", ok: true });
    expect(entry.receiptPayload.paymentIdentifier).toBe(payment.paymentIdentifier);
    expect(entry.timeline.map((item: { label: string }) => item.label)).toEqual([
      "Payment",
      "Settlement",
      "Fulfillment",
      "Receipt"
    ]);
    expect(body.totals.settledUsdc).toBeGreaterThan(0);
  });

  it("returns receipt and earning records that match the latest payment", async () => {
    const store = await getStore();
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const olderPayment = store.addPaymentEvent({
      id: "pevt_latest_old",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "latest_old",
      status: "settled",
      metadata: {},
      createdAt: "2026-06-18T00:00:00.000Z"
    });
    const latestPayment = store.addPaymentEvent({
      id: "pevt_latest_new",
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      buyerWallet: "0x2222222222222222222222222222222222222222",
      sellerWallet: provider.walletAddress,
      paymentIdentifier: "latest_new",
      status: "settled",
      metadata: {},
      createdAt: "2026-06-18T00:01:00.000Z"
    });
    store.addProviderEarning({
      id: "earn_latest_old",
      paymentEventId: olderPayment.id,
      providerId: provider.id,
      resourceId: resource.id,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      settlementStatus: "settled",
      createdAt: "2026-06-18T00:00:00.000Z"
    });
    store.addProviderEarning({
      id: "earn_latest_new",
      paymentEventId: latestPayment.id,
      providerId: provider.id,
      resourceId: resource.id,
      amountUsdc: resource.priceUsdc,
      network: "arc-testnet",
      settlementStatus: "settled",
      createdAt: "2026-06-18T00:01:00.000Z"
    });
    store.addReceipt({
      id: "rcpt_latest_new",
      paymentEventId: latestPayment.id,
      resourceId: resource.id,
      receipt: { paymentIdentifier: latestPayment.paymentIdentifier },
      createdAt: "2026-06-18T00:01:00.000Z"
    });

    const response = await latestPaymentRoute();
    const body = await response.json();

    expect(body.latestPayment.paymentIdentifier).toBe("latest_new");
    expect(body.latestEarning.paymentEventId).toBe(latestPayment.id);
    expect(body.latestReceipt.paymentEventId).toBe(latestPayment.id);
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
