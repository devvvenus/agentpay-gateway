import type { AccessClass, AdapterType, Resource } from "@agentpay/shared";
import { clampScore, createId, nowIso } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../../lib/runtime";
import {
  accessClasses,
  accessClassForAdapter,
  accessClassToAdapter,
  adapterTypes,
  validateAdapterConfig
} from "../../../../lib/provider-onboarding";

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
        expectedValue?: number;
        freshnessScore?: number;
        confidenceScore?: number;
        providerId?: string;
        config?: Record<string, unknown>;
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
  if (!Number.isFinite(body.priceUsdc) || body.priceUsdc <= 0 || body.priceUsdc > 0.05) {
    return jsonError("priceUsdc must be greater than 0 and at most 0.05 for testnet resources", 400);
  }

  const store = await getStore();
  const provider = body.providerId ? store.getProvider(body.providerId) : store.listProviders()[0];
  if (!provider) return jsonError("No provider configured", 500);

  const resource: Resource = {
    id: createId("res"),
    providerId: provider.id,
    name: body.name,
    description: body.description,
    accessClass,
    adapterType,
    priceUsdc: body.priceUsdc,
    expectedValue: scoreOrDefault(body.expectedValue, 0.68),
    freshnessScore: scoreOrDefault(body.freshnessScore, 0.68),
    confidenceScore: scoreOrDefault(body.confidenceScore, 0.68),
    enabled: true,
    createdAt: nowIso()
  };

  const configError = validateAdapterConfig(adapterType, body.config ?? {});
  if (configError) return jsonError(configError, 400);

  store.upsertResource(resource, {
    resourceId: resource.id,
    config: body.config ?? {}
  });

  return Response.json({ resource, provider }, { status: 201 });
}

function scoreOrDefault(value: number | undefined, defaultScore: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampScore(value) : defaultScore;
}
