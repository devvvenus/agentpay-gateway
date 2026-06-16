import type { AdapterType, Resource } from "@agentpay/shared";
import { clampScore, createId, nowIso } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../../lib/runtime";

const adapterTypes = new Set<AdapterType>([
  "mcp",
  "api_proxy",
  "dataset",
  "crawl",
  "agent_delegation",
  "memory_retrieval",
  "inference",
  "rss_paywall",
  "search",
  "docs_source"
]);

export async function POST(request: Request) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        description?: string;
        adapterType?: AdapterType;
        priceUsdc?: number;
        expectedValue?: number;
        freshnessScore?: number;
        confidenceScore?: number;
        providerId?: string;
        config?: Record<string, unknown>;
      }
    | null;

  if (!body?.name || !body.description || !body.adapterType || typeof body.priceUsdc !== "number") {
    return jsonError("name, description, adapterType and priceUsdc are required");
  }
  if (!adapterTypes.has(body.adapterType)) {
    return jsonError("Unsupported adapterType", 400);
  }
  if (!Number.isFinite(body.priceUsdc) || body.priceUsdc <= 0 || body.priceUsdc > 0.05) {
    return jsonError("priceUsdc must be greater than 0 and at most 0.05 for testnet demo resources", 400);
  }

  const store = await getStore();
  const provider = body.providerId ? store.getProvider(body.providerId) : store.listProviders()[0];
  if (!provider) return jsonError("No provider configured", 500);

  const resource: Resource = {
    id: createId("res"),
    providerId: provider.id,
    name: body.name,
    description: body.description,
    adapterType: body.adapterType,
    priceUsdc: body.priceUsdc,
    expectedValue: scoreOrDefault(body.expectedValue, 0.68),
    freshnessScore: scoreOrDefault(body.freshnessScore, 0.68),
    confidenceScore: scoreOrDefault(body.confidenceScore, 0.68),
    enabled: true,
    createdAt: nowIso()
  };

  const configError = validateAdapterConfig(body.adapterType, body.config ?? {});
  if (configError) return jsonError(configError, 400);

  store.upsertResource(resource, {
    resourceId: resource.id,
    config: body.config ?? {}
  });

  return Response.json({ resource, provider }, { status: 201 });
}

function scoreOrDefault(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampScore(value) : fallback;
}

function validateAdapterConfig(adapterType: AdapterType, config: Record<string, unknown>): string | undefined {
  const urlKeysByAdapter: Partial<Record<AdapterType, string[]>> = {
    mcp: ["serverUrl"],
    api_proxy: ["targetUrl"],
    dataset: ["baseUrl"],
    crawl: ["workerUrl", "url"],
    agent_delegation: ["targetUrl"],
    memory_retrieval: ["targetUrl"],
    inference: ["targetUrl"],
    rss_paywall: ["targetUrl", "feedUrl", "fallbackUrl"],
    search: ["baseUrl"],
    docs_source: ["sourceUrl"]
  };
  for (const key of urlKeysByAdapter[adapterType] ?? []) {
    const value = config[key];
    if (typeof value !== "string" || !value) return `config.${key} is required for ${adapterType}`;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return `config.${key} must be http or https`;
    } catch {
      return `config.${key} must be a valid URL`;
    }
  }
  if (adapterType === "dataset" && typeof config["sql"] !== "string") {
    return "config.sql is required for dataset";
  }
  return undefined;
}
