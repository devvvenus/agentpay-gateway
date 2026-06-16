import { getStore } from "../../../lib/runtime";

export async function GET() {
  const store = await getStore();
  const resources = store.listResources();
  const payments = store.listPaymentEvents();
  const receipts = store.listReceipts();
  const earnings = store.listProviderEarnings();
  return Response.json({
    resources,
    providers: store.listProviders().map((provider) => {
      const providerResources = resources.filter((resource) => resource.providerId === provider.id);
      const providerResourceIds = new Set(providerResources.map((resource) => resource.id));
      const providerPayments = payments.filter((payment) => providerResourceIds.has(payment.resourceId));
      const providerEarnings = earnings.filter((earning) => providerResourceIds.has(earning.resourceId));
      const settledProviderEarnings = providerEarnings.filter((earning) => earning.settlementStatus === "settled");
      return {
        ...provider,
        resources: providerResources.length,
        paidCalls: providerPayments.length,
        revenueUsdc: round6(settledProviderEarnings.reduce((sum, earning) => sum + earning.amountUsdc, 0)),
        settledUsdc: round6(settledProviderEarnings.reduce((sum, earning) => sum + earning.amountUsdc, 0))
      };
    }),
    resourceProofs: resources.map((resource) => {
      const config = store.getAdapterConfig(resource.id)?.config ?? {};
      const resourcePayments = payments.filter((payment) => payment.resourceId === resource.id);
      const resourceReceipts = receipts.filter((receipt) => receipt.resourceId === resource.id);
      return {
        resourceId: resource.id,
        adapterType: resource.adapterType,
        upstream: upstreamForConfig(config),
        paidCalls: resourcePayments.length,
        revenueUsdc: round6(
          resourcePayments
            .filter((payment) => payment.status === "settled")
            .reduce((sum, payment) => sum + payment.amountUsdc, 0)
        ),
        receiptCount: resourceReceipts.length,
        lastStatus: resourcePayments[0]?.status ?? "ready",
        fulfillmentStatus:
          typeof resourcePayments[0]?.metadata["fulfillmentStatus"] === "string"
            ? resourcePayments[0].metadata["fulfillmentStatus"]
            : "waiting"
      };
    }),
    marketplace: {
      publishedResources: resources.length,
      activeProviders: store.listProviders().length,
      paidCalls: payments.length,
      settledPayments: payments.filter((payment) => payment.status === "settled").length,
      receiptCount: receipts.length
    },
    trust: [
      { label: "Testnet-only guard", status: "active", detail: "Mainnet stays blocked unless ALLOW_MAINNET=true." },
      { label: "SSRF allowlist", status: "active", detail: "Adapters can only call approved upstream hosts." },
      { label: "Replay protection", status: "active", detail: "Repeated payment identifiers do not duplicate earnings." },
      { label: "Fulfillment status", status: "active", detail: "Delivered and failed adapter execution are recorded separately." }
    ],
    sdkExample: [
      "import { protect } from '@agentpay/sdk';",
      "",
      "export const GET = protect(handler, {",
      "  price: '0.001 USDC',",
      "  network: 'eip155:5042002',",
      "  seller: process.env.SELLER_ADDRESS!,",
      "  resourceId: 'premium_api'",
      "});"
    ].join("\n")
  });
}

function upstreamForConfig(config: Record<string, unknown>) {
  const value = config.serverUrl || config.targetUrl || config.baseUrl || config.workerUrl || config.sourceUrl;
  return typeof value === "string" ? value : "configured in provider resource";
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
