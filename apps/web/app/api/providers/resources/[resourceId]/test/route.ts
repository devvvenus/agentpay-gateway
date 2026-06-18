import { allowedHostsFromEnv, createAdapter } from "@agentpay/adapters";
import type { PaymentEvent } from "@agentpay/shared";
import { createId, nowIso } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../../../../lib/runtime";
import { samplePayloadForAdapter } from "../../../../../../lib/provider-onboarding";

export async function POST(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const { resourceId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { payload?: Record<string, unknown> };
  const store = await getStore();
  const resource = store.getResource(resourceId);
  if (!resource) return jsonError("Resource not found", 404);
  const provider = store.getProvider(resource.providerId);
  if (!provider) return jsonError("Provider not found", 500);
  const config = store.getAdapterConfig(resource.id)?.config ?? {};

  const adapter = createAdapter(resource.adapterType);
  const payload = body.payload ?? samplePayloadForAdapter(resource.adapterType, config);
  const quote = await adapter.quote({ resource, config, payload, prompt: "Provider resource fulfillment test" });
  const payment: PaymentEvent = {
    id: createId("pevt_preview"),
    resourceId: resource.id,
    adapterType: resource.adapterType,
    amountUsdc: resource.priceUsdc,
    network: quote.network,
    buyerWallet: "provider-resource-test",
    sellerWallet: provider.walletAddress,
    paymentIdentifier: createId("resource_test"),
    status: "settled",
    metadata: { onboardingTest: true },
    createdAt: nowIso()
  };

  const startedAt = Date.now();
  const result = await adapter.execute(
    { resource, config, payload, prompt: "Provider resource fulfillment test" },
    {
      resource,
      provider,
      quote,
      payment,
      now: nowIso(),
      allowedHosts: allowedHostsFromEnv()
    }
  );

  return Response.json({
    ok: result.status === "ok",
    resourceId: resource.id,
    accessClass: resource.accessClass,
    adapterType: resource.adapterType,
    latencyMs: Date.now() - startedAt,
    result: {
      status: result.status,
      citations: result.citations,
      metadata: result.metadata,
      dataPreview: preview(result.data)
    }
  });
}

function preview(value: unknown) {
  const serialized = JSON.stringify(value);
  if (!serialized) return null;
  return serialized.length > 1800 ? `${serialized.slice(0, 1800)}...` : serialized;
}
