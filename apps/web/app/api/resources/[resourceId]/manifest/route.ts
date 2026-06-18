import { getStore, jsonError } from "../../../../../lib/runtime";
import { baseUrlFromRequest, buildResourceManifest } from "../../../../../lib/resource-manifest";

export async function GET(request: Request, context: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await context.params;
  const store = await getStore();
  const resource = store.getResource(resourceId);
  if (!resource) return jsonError("Resource not found", 404);
  const provider = store.getProvider(resource.providerId);
  if (!provider) return jsonError("Provider not found", 500);

  return Response.json(
    buildResourceManifest({
      resource,
      provider,
      config: store.getAdapterConfig(resource.id)?.config,
      baseUrl: baseUrlFromRequest(request)
    })
  );
}
