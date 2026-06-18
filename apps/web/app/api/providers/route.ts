import type { Provider } from "@agentpay/shared";
import { createId, nowIso } from "@agentpay/shared";
import { getStore, jsonError, requireAdminRequest } from "../../../lib/runtime";

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

export async function POST(request: Request) {
  const authError = requireAdminRequest(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        walletAddress?: string;
      }
    | null;

  const name = body?.name?.trim();
  const walletAddress = body?.walletAddress?.trim();
  if (!name || name.length < 2) return jsonError("provider name is required", 400);
  if (!walletAddress || !addressPattern.test(walletAddress)) {
    return jsonError("walletAddress must be an 0x-prefixed Arc testnet address", 400);
  }

  const store = await getStore();
  const provider: Provider = {
    id: createId("provider"),
    name,
    walletAddress,
    createdAt: nowIso()
  };
  store.upsertProvider(provider);

  return Response.json({ provider }, { status: 201 });
}
