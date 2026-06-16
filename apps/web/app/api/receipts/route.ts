import { getStore } from "../../../lib/runtime";

export async function GET() {
  const store = await getStore();
  const resources = store.listResources();
  const providers = store.listProviders();
  const receipts = store.listReceipts();
  const earnings = store.listProviderEarnings();

  const entries = store.listPaymentEvents().map((payment) => {
    const resource = resources.find((candidate) => candidate.id === payment.resourceId);
    const provider = resource ? providers.find((candidate) => candidate.id === resource.providerId) : undefined;
    const receipt = receipts.find((candidate) => candidate.paymentEventId === payment.id);
    const earning = earnings
      .filter((candidate) => candidate.resourceId === payment.resourceId && candidate.amountUsdc === payment.amountUsdc)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    return {
      paymentId: payment.id,
      paymentIdentifier: payment.paymentIdentifier,
      resourceId: payment.resourceId,
      resourceName: resource?.name ?? payment.resourceId,
      adapterType: payment.adapterType,
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? "Unknown provider",
      amountUsdc: payment.amountUsdc,
      buyerWallet: payment.buyerWallet,
      sellerWallet: payment.sellerWallet,
      paymentStatus: payment.status,
      fulfillmentStatus:
        typeof payment.metadata["fulfillmentStatus"] === "string" ? payment.metadata["fulfillmentStatus"] : "waiting",
      settlementStatus: earning?.settlementStatus ?? "unknown",
      receiptId: receipt?.id ?? null,
      citationCount: Array.isArray(receipt?.receipt["citations"]) ? receipt.receipt["citations"].length : 0,
      adapterError: typeof payment.metadata["adapterError"] === "string" ? payment.metadata["adapterError"] : null,
      createdAt: payment.createdAt
    };
  });

  return Response.json({
    entries: entries.slice(0, 50),
    totals: {
      payments: entries.length,
      settled: entries.filter((entry) => entry.paymentStatus === "settled").length,
      delivered: entries.filter((entry) => entry.fulfillmentStatus === "delivered").length,
      failedFulfillment: entries.filter((entry) => entry.fulfillmentStatus === "failed").length,
      citations: entries.reduce((sum, entry) => sum + entry.citationCount, 0)
    }
  });
}
