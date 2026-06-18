import type { Provider } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../../lib/runtime";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export async function PATCH(request: Request, context: { params: Promise<{ providerId: string }> }) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const { providerId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        walletAddress?: string;
      }
    | null;

  const store = await getStore();
  const existing = store.getProvider(providerId);
  if (!existing) return jsonError("Provider not found", 404);

  const nextName = body?.name?.trim() || existing.name;
  const nextWallet = body?.walletAddress?.trim() || existing.walletAddress;
  if (nextName.length < 2) return jsonError("provider name is required", 400);
  if (!addressPattern.test(nextWallet)) {
    return jsonError("walletAddress must be an 0x-prefixed Arc testnet address", 400);
  }

  const provider: Provider = {
    ...existing,
    name: nextName,
    walletAddress: nextWallet
  };
  store.upsertProvider(provider);

  return Response.json({ provider });
}
