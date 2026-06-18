import { allowedHostsFromEnv, createAdapter } from "@agentpay/adapters";
import type { AccessClass, AdapterType, PaymentEvent, Provider, Resource } from "@agentpay/shared";
import { createId, nowIso } from "@agentpay/shared";
import { jsonError, requireAdminRequest } from "../../../../../lib/runtime";
import {
  accessClasses,
  accessClassForAdapter,
  accessClassToAdapter,
  adapterTypes,
  samplePayloadForAdapter,
  validateAdapterConfig
} from "../../../../../lib/provider-onboarding";

export async function POST(request: Request) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string;
        accessClass?: AccessClass;
        adapterType?: AdapterType;
        priceUsdc?: number;
        providerId?: string;
        providerName?: string;
        sellerWallet?: string;
        config?: Record<string, unknown>;
        payload?: Record<string, unknown>;
      }
    | null;

  if (!body?.name || !body.description || typeof body.priceUsdc !== "number") {
    return jsonError("name, description, accessClass and priceUsdc are required");
  }
  if (body.accessClass && !accessClasses.has(body.accessClass)) {
    return jsonError("Unsupported accessClass", 400);
  }
  if (body.adapterType && !adapterTypes.has(body.adapterType)) {
    return jsonError("Unsupported adapterType", 400);
  }
  const accessClass = body.accessClass ?? accessClassForAdapter(body.adapterType);
  if (!accessClass) return jsonError("accessClass is required", 400);
  const adapterType = body.adapterType ?? accessClassToAdapter[accessClass];
  const config = body.config ?? {};
  const configError = validateAdapterConfig(adapterType, config);
  if (configError) return jsonError(configError, 400);

  const resource: Resource = {
    id: "onboarding_preview_resource",
    providerId: body.providerId || "onboarding_preview_provider",
    name: body.name,
    description: body.description,
    accessClass,
    adapterType,
    priceUsdc: body.priceUsdc,
    expectedValue: 0.7,
    freshnessScore: 0.7,
    confidenceScore: 0.7,
    enabled: true,
    createdAt: nowIso()
  };
  const provider: Provider = {
    id: resource.providerId,
    name: body.providerName || "Provider onboarding preview",
    walletAddress: body.sellerWallet || "0x1111111111111111111111111111111111111111",
    createdAt: nowIso()
  };
  const adapter = createAdapter(adapterType);
  const payload = body.payload ?? samplePayloadForAdapter(adapterType, config);
  const quote = await adapter.quote({ resource, config, payload, prompt: "Provider onboarding fulfillment test" });
  const payment: PaymentEvent = {
    id: createId("pevt_preview"),
    resourceId: resource.id,
    adapterType,
    amountUsdc: resource.priceUsdc,
    network: quote.network,
    buyerWallet: "provider-onboarding-preview",
    sellerWallet: provider.walletAddress,
    paymentIdentifier: createId("onboarding_test"),
    status: "settled",
    metadata: {
      onboardingTest: true
    },
    createdAt: nowIso()
  };

  const startedAt = Date.now();
  const result = await adapter.execute(
    { resource, config, payload, prompt: "Provider onboarding fulfillment test" },
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
    accessClass,
    adapterType,
    latencyMs: Date.now() - startedAt,
    quote,
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
