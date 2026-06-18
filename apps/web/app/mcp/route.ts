import { allowedHostsFromEnv, createAdapter } from "@agentpay/adapters";
import { type AdapterResult, createId, nowIso } from "@agentpay/shared";
import { getPaymentService, getStore, jsonError } from "../../lib/runtime";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as JsonRpcRequest | null;
  if (!body?.method) return jsonError("Invalid MCP JSON-RPC request");

  const store = await getStore();

  if (body.method === "tools/list") {
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        tools: store.listResources().map((resource) => ({
          name: resource.id,
          description: `${resource.name}: ${resource.priceUsdc.toFixed(6)} USDC via ${resource.accessClass}`,
          inputSchema: {
            type: "object",
            properties: {
              payload: { type: "object" }
            }
          }
        }))
      }
    });
  }

  if (body.method !== "tools/call") {
    return jsonError(`Unsupported MCP method: ${body.method}`, 404);
  }

  const resourceId = typeof body.params?.name === "string" ? body.params.name : "res_mcp_tools";
  const resource = store.getResource(resourceId);
  if (!resource) return jsonError("Resource not found", 404);
  const provider = store.getProvider(resource.providerId);
  if (!provider) return jsonError("Provider not found", 500);

  const paymentService = await getPaymentService();
  const paymentResult = paymentService.verifyIncoming({
    resource,
    provider,
    headers: request.headers,
    requestUrl: request.url
  });
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
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: verification.status === "misconfigured" ? -32001 : -32002,
          message: verification.error || "Payment settlement verification failed",
          data: failed ?? paymentResult.payment
        }
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
  const adapter = createAdapter(resource.adapterType);
  const payload = (body.params?.arguments as Record<string, unknown> | undefined) ?? {};
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adapter execution failed";
    const failed = store.updatePaymentEventStatus(verifiedPayment.paymentIdentifier, "settled", {
      fulfillmentStatus: "failed",
      fulfillmentFailedAt: nowIso(),
      adapterError: message
    });
    return Response.json(
      {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32003,
          message: "Paid MCP fulfillment failed",
          data: failed ?? verifiedPayment
        }
      },
      { status: 502 }
    );
  }
  const deliveredPayment =
    store.updatePaymentEventStatus(verifiedPayment.paymentIdentifier, "settled", {
      fulfillmentStatus: "delivered",
      fulfilledAt: nowIso()
    }) ?? verifiedPayment;
  store.addReceipt({
    id: createId("rcpt"),
    paymentEventId: deliveredPayment.id,
    resourceId: resource.id,
    receipt: {
      paymentIdentifier: deliveredPayment.paymentIdentifier,
      amountUsdc: deliveredPayment.amountUsdc,
      adapterType: resource.adapterType,
      citations: result.citations
    },
    createdAt: nowIso()
  });

  return Response.json({
    jsonrpc: "2.0",
    id: body.id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    }
  });
}
