import type { AdapterType } from "@agentpay/shared";
import { runAgent, type AgentRunEvent } from "@agentpay/agent";
import { loadPaymentConfig } from "@agentpay/payments";
import { executePaidResourceWithCircle } from "../../../../../lib/circle-paid-resource";
import { getStore, jsonError } from "../../../../../lib/runtime";

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
  const prompt = body.prompt;
  const budgetUsdc = body.budgetUsdc;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: "terminal", message: "PS AgentPay> stream opened" });
        const run = await runAgent({
          prompt,
          budgetUsdc,
          store: await getStore(),
          ...(body.allowedResourceIds ? { allowedResourceIds: body.allowedResourceIds } : {}),
          ...(body.allowedAdapterTypes ? { allowedAdapterTypes: body.allowedAdapterTypes } : {}),
          ...(loadPaymentConfig().mode === "x402" ? { executePaidResource: executePaidResourceWithCircle } : {}),
          onEvent: (event: AgentRunEvent) => {
            send({ type: "terminal", message: formatAgentEvent(event), event });
          }
        });
        send({ type: "run", run });
        send({ type: "terminal", message: "PS AgentPay> success" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent run failed";
        send({ type: "error", message: `PS AgentPay> ERROR: ${message}` });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function formatAgentEvent(event: AgentRunEvent) {
  const prefix = event.resourceId ? `${event.resourceId}: ` : "";
  return `PS AgentPay> ${prefix}${event.message}`;
}
