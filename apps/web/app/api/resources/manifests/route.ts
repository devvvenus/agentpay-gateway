import { getStore, jsonError } from "../../../../lib/runtime";
import { baseUrlFromRequest, buildResourceManifest } from "../../../../lib/resource-manifest";

export async function GET(request: Request) {
  const store = await getStore();
  const baseUrl = baseUrlFromRequest(request);
  const manifests = store
    .listResources()
    .map((resource) => {
      const provider = store.getProvider(resource.providerId);
      if (!provider) return null;
      return buildResourceManifest({
        resource,
        provider,
        config: store.getAdapterConfig(resource.id)?.config,
        baseUrl
      });
    })
    .filter(Boolean);

  if (!manifests.length) return jsonError("No resource manifests available", 404);
  return Response.json({
    schemaVersion: "agentpay.resourceCatalog.v1",
    count: manifests.length,
    manifests
  });
}
