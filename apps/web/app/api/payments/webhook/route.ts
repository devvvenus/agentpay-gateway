import { getStore, verifyWebhookRequest } from "../../../../lib/runtime";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const authError = verifyWebhookRequest(rawBody, request);
  if (authError) return authError;

  const body = parseJson(rawBody);
  const store = await getStore();
  const paymentIdentifier = readString(body, ["paymentIdentifier"]) || readString(body, ["data", "paymentIdentifier"]);
  const eventStatus = normalizePaymentStatus(
    readString(body, ["status"]) ||
      readString(body, ["state"]) ||
      readString(body, ["type"]) ||
      readString(body, ["data", "status"]) ||
      readString(body, ["data", "state"])
  );
  const updated =
    paymentIdentifier && eventStatus
      ? store.updatePaymentEventStatus(paymentIdentifier, eventStatus, {
          webhookReceivedAt: new Date().toISOString(),
          webhookEvent: body
        })
      : undefined;

  return Response.json({
    accepted: true,
    paymentIdentifier: paymentIdentifier ?? null,
    mappedStatus: eventStatus ?? null,
    updatedPayment: updated ?? null,
    currentMetrics: store.metrics()
  });
}

function parseJson(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readString(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function normalizePaymentStatus(value: string | undefined) {
  const normalized = value?.toLowerCase();
  if (!normalized) return undefined;
  if (["settled", "payment.settled", "gateway.payment.settled", "verified", "success"].includes(normalized)) {
    return "settled" as const;
  }
  if (["failed", "payment.failed", "gateway.payment.failed", "rejected", "expired"].includes(normalized)) {
    return "failed" as const;
  }
  if (["pending", "pending_verification", "payment.pending"].includes(normalized)) {
    return "pending_verification" as const;
  }
  return undefined;
}
