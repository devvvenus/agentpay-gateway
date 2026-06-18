import type { AccessClass, AdapterType, Resource } from "@agentpay/shared";
import { clampScore } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../../../lib/runtime";
import {
  accessClasses,
  accessClassForAdapter,
  accessClassToAdapter,
  adapterTypes,
  validateAdapterConfig
} from "../../../../../lib/provider-onboarding";

export async function PATCH(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const { resourceId } = await context.params;
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
        enabled?: boolean;
        config?: Record<string, unknown>;
      }
    | null;

  const store = await getStore();
  const existing = store.getResource(resourceId);
  if (!existing) return jsonError("Resource not found", 404);

  if (body?.accessClass && !accessClasses.has(body.accessClass)) {
    return jsonError("Unsupported accessClass", 400);
  }
  if (body?.adapterType && !adapterTypes.has(body.adapterType)) {
    return jsonError("Unsupported adapterType", 400);
  }

  const accessClass = body?.accessClass ?? accessClassForAdapter(body?.adapterType) ?? existing.accessClass;
  const adapterType = body?.adapterType ?? accessClassToAdapter[accessClass] ?? existing.adapterType;
  const providerId = body?.providerId ?? existing.providerId;
  const provider = store.getProvider(providerId);
  if (!provider) return jsonError("Provider not found", 404);

  const priceUsdc = body?.priceUsdc ?? existing.priceUsdc;
  if (!Number.isFinite(priceUsdc) || priceUsdc <= 0 || priceUsdc > 0.05) {
    return jsonError("priceUsdc must be greater than 0 and at most 0.05 for testnet resources", 400);
  }

  const config = body?.config ?? store.getAdapterConfig(resourceId)?.config ?? {};
  const configError = validateAdapterConfig(adapterType, config);
  if (configError) return jsonError(configError, 400);

  const resource: Resource = {
    ...existing,
    providerId,
    name: body?.name?.trim() || existing.name,
    description: body?.description?.trim() || existing.description,
    accessClass,
    adapterType,
    priceUsdc,
    expectedValue: scoreOrDefault(body?.expectedValue, existing.expectedValue),
    freshnessScore: scoreOrDefault(body?.freshnessScore, existing.freshnessScore),
    confidenceScore: scoreOrDefault(body?.confidenceScore, existing.confidenceScore),
    enabled: typeof body?.enabled === "boolean" ? body.enabled : existing.enabled
  };

  store.upsertResource(resource, {
    resourceId: resource.id,
    config
  });

  return Response.json({ resource, provider });
}

function scoreOrDefault(value: number | undefined, defaultScore: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampScore(value) : defaultScore;
}
