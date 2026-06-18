import { allowedHostsFromEnv, createAdapter } from "@agentpay/adapters";
import { type AdapterResult, createId, nowIso } from "@agentpay/shared";
import { getPaymentService, getStore, jsonError } from "../../../../lib/runtime";

export async function GET(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  return handlePaidResource(request, context);
}

export async function POST(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  return handlePaidResource(request, context);
}

async function handlePaidResource(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  const store = await getStore();
  const resource = store.getResource(resourceId);
  if (!resource) return jsonError("Resource not found", 404);

  const provider = store.getProvider(resource.providerId);
  if (!provider) return jsonError("Provider not found", 500);

  const paymentService = await getPaymentService();
  let paymentResult;
  try {
    paymentResult = paymentService.verifyIncoming({
      resource,
      provider,
      headers: request.headers,
      requestUrl: request.url
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Payment configuration error", 400);
  }

  if (!paymentResult.ok || !paymentResult.payment) {
    return Response.json(paymentResult.challenge, { status: 402 });
  }

  const verification = await paymentService.verifySettlement({
    payment: paymentResult.payment,
    resource,
    provider,
    headers: request.headers,
    requestUrl: request.url
  });

  if (!verification.ok) {
    const failed = store.updatePaymentEventStatus(paymentResult.payment.paymentIdentifier, "verification_failed", {
      verificationStatus: verification.status,
      verificationError: verification.error,
      verificationEvidence: verification.evidence,
      verifiedAt: nowIso()
    });
    return Response.json(
      {
        payment: failed ?? paymentResult.payment,
        error: verification.error || "Payment settlement verification failed"
      },
      { status: verification.status === "misconfigured" ? 503 : 402 }
    );
  }

  const verifiedPayment =
    store.updatePaymentEventStatus(paymentResult.payment.paymentIdentifier, "settled", {
      verifiedBy: "server-side-facilitator",
      verifiedAt: nowIso(),
      settlementEvidence: verification.evidence
    }) ?? paymentResult.payment;

  const config = store.getAdapterConfig(resource.id)?.config ?? {};
  const payload = request.method === "GET" ? Object.fromEntries(new URL(request.url).searchParams) : await request.json().catch(() => ({}));
  const adapter = createAdapter(resource.adapterType);
  const quote = await adapter.quote({ resource, config, payload });
  let result: AdapterResult;
  try {
    result = await adapter.execute(
      { resource, config, payload },
      {
        resource,
        quote,
        payment: verifiedPayment,
        provider,
        now: nowIso(),
        allowedHosts: allowedHostsFromEnv()
      }
    );
    const deliveredPayment = store.updatePaymentEventStatus(verifiedPayment.paymentIdentifier, "settled", {
      fulfillmentStatus: "delivered",
      fulfilledAt: nowIso()
    }) ?? verifiedPayment;
    Object.assign(verifiedPayment, deliveredPayment);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adapter execution failed";
    const failedPayment = store.updatePaymentEventStatus(verifiedPayment.paymentIdentifier, "settled", {
      fulfillmentStatus: "failed",
      fulfillmentFailedAt: nowIso(),
      adapterError: message
    }) ?? verifiedPayment;
    return Response.json(
      {
        payment: failedPayment,
        error: "Paid resource fulfillment failed",
        adapterError: message
      },
      { status: 502 }
    );
  }

  store.addReceipt({
    id: createId("rcpt"),
    paymentEventId: verifiedPayment.id,
    resourceId: resource.id,
    receipt: {
      paymentIdentifier: verifiedPayment.paymentIdentifier,
      amountUsdc: verifiedPayment.amountUsdc,
      adapterType: resource.adapterType,
      citations: result.citations
    },
    createdAt: nowIso()
  });

  return Response.json({
    payment: verifiedPayment,
    result
  });
}
