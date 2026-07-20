import { createHash } from "node:crypto";
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
  const eventId =
    request.headers.get("x-webhook-id") ||
    readString(body, ["eventId"]) ||
    readString(body, ["id"]) ||
    createHash("sha256").update(rawBody).digest("hex");
  const eventAt = readString(body, ["createdAt"]) || readString(body, ["timestamp"]) || new Date().toISOString();
  const existing = paymentIdentifier
    ? store.listPaymentEvents().find((payment) => payment.paymentIdentifier === paymentIdentifier)
    : undefined;
  const previousEventId = typeof existing?.metadata["webhookEventId"] === "string" ? existing.metadata["webhookEventId"] : undefined;
  const previousEventAt = typeof existing?.metadata["webhookEventAt"] === "string" ? existing.metadata["webhookEventAt"] : undefined;
  const terminal = existing?.status === "settled" || existing?.status === "failed" || existing?.status === "verification_failed";
  const stale = previousEventAt && Date.parse(eventAt) <= Date.parse(previousEventAt);
  const ignored = Boolean(existing && eventStatus && (previousEventId === eventId || stale || (terminal && existing.status !== eventStatus)));
  const updated =
    paymentIdentifier && eventStatus && !ignored
      ? store.updatePaymentEventStatus(paymentIdentifier, eventStatus, {
          webhookReceivedAt: new Date().toISOString(),
          webhookEventAt: eventAt,
          webhookEventId: eventId,
          webhookEvent: body
        })
      : undefined;

  return Response.json({
    accepted: true,
    ignored,
    paymentIdentifier: paymentIdentifier ?? null,
    mappedStatus: eventStatus ?? null,
    updatedPayment: updated ?? existing ?? null,
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
