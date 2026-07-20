import type { AdapterType } from "@agentpay/shared";
import { runAgent, type PaymentPolicyInput } from "@agentpay/agent";
import { loadPaymentConfig } from "@agentpay/payments";
import { executePaidResourceWithCircle } from "../../../../lib/circle-paid-resource";
import { canViewSensitiveRuntimeData, getStore, jsonError, requireAgentRunRequest } from "../../../../lib/runtime";

export async function GET(request: Request) {
  const runs = (await getStore()).listRuns();
  if (canViewSensitiveRuntimeData(request)) return Response.json({ runs });
  return Response.json({
    runs: runs.map(({ id, status, budgetUsdc, totalSpendUsdc, createdAt, completedAt }) => ({
      id,
      status,
      budgetUsdc,
      totalSpendUsdc,
      createdAt,
      completedAt
    }))
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        prompt?: string;
        budgetUsdc?: number;
        allowedResourceIds?: string[];
        allowedAdapterTypes?: AdapterType[];
        policy?: PaymentPolicyInput;
      }
    | null;

  if (!body?.prompt || typeof body.budgetUsdc !== "number" || body.budgetUsdc <= 0) {
    return jsonError("prompt and positive budgetUsdc are required");
  }
  const authError = requireAgentRunRequest(request, body.budgetUsdc);
  if (authError) return authError;

  try {
    const run = await runAgent({
      prompt: body.prompt,
      budgetUsdc: body.budgetUsdc,
      store: await getStore(),
      ...(body.allowedResourceIds ? { allowedResourceIds: body.allowedResourceIds } : {}),
      ...(body.allowedAdapterTypes ? { allowedAdapterTypes: body.allowedAdapterTypes } : {}),
      ...(body.policy ? { policy: body.policy } : {}),
      ...(loadPaymentConfig().mode === "x402" ? { executePaidResource: executePaidResourceWithCircle } : {})
    });

    return Response.json({ run }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    return jsonError(message, 502);
  }
}
