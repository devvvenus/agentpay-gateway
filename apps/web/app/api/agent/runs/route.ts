import type { AdapterType } from "@agentpay/shared";
import { runAgent } from "@agentpay/agent";
import { loadPaymentConfig } from "@agentpay/payments";
import { executePaidResourceWithCircle } from "../../../../lib/circle-paid-resource";
import { getStore, jsonError } from "../../../../lib/runtime";

export async function GET() {
  return Response.json({ runs: (await getStore()).listRuns() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        prompt?: string;
        budgetUsdc?: number;
        allowedResourceIds?: string[];
        allowedAdapterTypes?: AdapterType[];
      }
    | null;

  if (!body?.prompt || typeof body.budgetUsdc !== "number" || body.budgetUsdc <= 0) {
    return jsonError("prompt and positive budgetUsdc are required");
  }

  try {
    const run = await runAgent({
      prompt: body.prompt,
      budgetUsdc: body.budgetUsdc,
      store: await getStore(),
      ...(body.allowedResourceIds ? { allowedResourceIds: body.allowedResourceIds } : {}),
      ...(body.allowedAdapterTypes ? { allowedAdapterTypes: body.allowedAdapterTypes } : {}),
      ...(loadPaymentConfig().mode === "x402" ? { executePaidResource: executePaidResourceWithCircle } : {})
    });

    return Response.json({ run }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    return jsonError(message, 502);
  }
}
