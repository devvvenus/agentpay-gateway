import { canViewSensitiveRuntimeData, getStore } from "../../../lib/runtime";

export async function GET(request: Request) {
  const store = await getStore();
  const resources = store.listResources();
  const providers = store.listProviders();
  const receipts = store.listReceipts();
  const earnings = store.listProviderEarnings();

  const entries = store.listPaymentEvents().map((payment) => {
    const resource = resources.find((candidate) => candidate.id === payment.resourceId);
    const provider = resource ? providers.find((candidate) => candidate.id === resource.providerId) : undefined;
    const receipt = receipts.find((candidate) => candidate.paymentEventId === payment.id);
    const earning =
      earnings.find((candidate) => candidate.paymentEventId === payment.id) ??
      earnings
        .filter(
          (candidate) =>
            !candidate.paymentEventId &&
            candidate.resourceId === payment.resourceId &&
            candidate.amountUsdc === payment.amountUsdc
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    return {
      paymentId: payment.id,
      paymentIdentifier: payment.paymentIdentifier,
      resourceId: payment.resourceId,
      resourceName: resource?.name ?? payment.resourceId,
      accessClass: resource?.accessClass ?? null,
      adapterType: payment.adapterType,
      providerId: provider?.id ?? null,
      providerName: provider?.name ?? "Unknown provider",
      amountUsdc: payment.amountUsdc,
      network: payment.network,
      buyerWallet: payment.buyerWallet,
      sellerWallet: payment.sellerWallet,
      paymentStatus: payment.status,
      fulfillmentStatus:
        typeof payment.metadata["fulfillmentStatus"] === "string" ? payment.metadata["fulfillmentStatus"] : "waiting",
      settlementStatus: earning?.settlementStatus ?? "unknown",
      txOrSettlementRef: payment.txOrSettlementRef ?? null,
      verifiedBy: typeof payment.metadata["verifiedBy"] === "string" ? payment.metadata["verifiedBy"] : null,
      verifiedAt: typeof payment.metadata["verifiedAt"] === "string" ? payment.metadata["verifiedAt"] : null,
      fulfilledAt: typeof payment.metadata["fulfilledAt"] === "string" ? payment.metadata["fulfilledAt"] : null,
      fulfillmentFailedAt:
        typeof payment.metadata["fulfillmentFailedAt"] === "string" ? payment.metadata["fulfillmentFailedAt"] : null,
      settlementEvidence: payment.metadata["settlementEvidence"] ?? payment.metadata["verificationEvidence"] ?? null,
      verificationError: typeof payment.metadata["verificationError"] === "string" ? payment.metadata["verificationError"] : null,
      receiptId: receipt?.id ?? null,
      receiptPayload: receipt?.receipt ?? null,
      citations: Array.isArray(receipt?.receipt["citations"]) ? receipt.receipt["citations"] : [],
      citationCount: Array.isArray(receipt?.receipt["citations"]) ? receipt.receipt["citations"].length : 0,
      adapterError: typeof payment.metadata["adapterError"] === "string" ? payment.metadata["adapterError"] : null,
      timeline: [
        {
          label: "Payment",
          status: payment.status,
          at: payment.createdAt,
          detail: payment.txOrSettlementRef ?? payment.paymentIdentifier
        },
        {
          label: "Settlement",
          status: earning?.settlementStatus ?? payment.status,
          at: typeof payment.metadata["verifiedAt"] === "string" ? payment.metadata["verifiedAt"] : earning?.createdAt ?? null,
          detail:
            typeof payment.metadata["verificationError"] === "string"
              ? payment.metadata["verificationError"]
              : typeof payment.metadata["verifiedBy"] === "string"
                ? payment.metadata["verifiedBy"]
                : "waiting"
        },
        {
          label: "Fulfillment",
          status: typeof payment.metadata["fulfillmentStatus"] === "string" ? payment.metadata["fulfillmentStatus"] : "waiting",
          at:
            typeof payment.metadata["fulfilledAt"] === "string"
              ? payment.metadata["fulfilledAt"]
              : typeof payment.metadata["fulfillmentFailedAt"] === "string"
                ? payment.metadata["fulfillmentFailedAt"]
                : null,
          detail: typeof payment.metadata["adapterError"] === "string" ? payment.metadata["adapterError"] : resource?.adapterType ?? "adapter"
        },
        {
          label: "Receipt",
          status: receipt ? "issued" : "waiting",
          at: receipt?.createdAt ?? null,
          detail: receipt?.id ?? "no receipt"
        }
      ],
      createdAt: payment.createdAt
    };
  });

  const visibleEntries = canViewSensitiveRuntimeData(request)
    ? entries
    : entries.map(({ buyerWallet, sellerWallet, paymentIdentifier, settlementEvidence, verificationError, receiptPayload, ...entry }) => entry);

  return Response.json({
    entries: visibleEntries.slice(0, 50),
    totals: {
      payments: entries.length,
      attempted: entries.length,
      settled: entries.filter((entry) => entry.paymentStatus === "settled").length,
      pending: entries.filter((entry) => ["authorized", "pending_verification"].includes(entry.paymentStatus)).length,
      failedSettlement: entries.filter((entry) => ["failed", "verification_failed"].includes(entry.paymentStatus)).length,
      delivered: entries.filter((entry) => entry.fulfillmentStatus === "delivered").length,
      failedFulfillment: entries.filter((entry) => entry.fulfillmentStatus === "failed").length,
      citations: entries.reduce((sum, entry) => sum + entry.citationCount, 0),
      settledUsdc: entries
        .filter((entry) => entry.paymentStatus === "settled")
        .reduce((sum, entry) => sum + entry.amountUsdc, 0)
    }
  });
}
