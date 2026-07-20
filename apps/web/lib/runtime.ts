import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { seedData } from "@agentpay/adapters";
import { AgentPayStore, type StoreSnapshot } from "@agentpay/db";
import { PaymentService, loadPaymentConfig } from "@agentpay/payments";

const STATE_DIR = process.env.VERCEL ? join("/tmp", "agentpay") : ".agentpay";
const STATE_FILE = join(STATE_DIR, "state.json");

declare global {
  // eslint-disable-next-line no-var
  var __agentpayStore: AgentPayStore | undefined;
  // eslint-disable-next-line no-var
  var __agentpayStorePromise: Promise<AgentPayStore> | undefined;
}

export async function getStore(): Promise<AgentPayStore> {
  if (globalThis.__agentpayStore) return globalThis.__agentpayStore;
  if (!globalThis.__agentpayStorePromise) {
    globalThis.__agentpayStorePromise = createStore();
  }
  return globalThis.__agentpayStorePromise;
}

export async function getPaymentService(): Promise<PaymentService> {
  return new PaymentService(await getStore(), loadPaymentConfig());
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function requireAdminRequest(request: Request): Response | undefined {
  const key = process.env.AGENTPAY_ADMIN_API_KEY;
  if (!key) {
    return process.env.NODE_ENV === "production" ? jsonError("AGENTPAY_ADMIN_API_KEY is not configured", 503) : undefined;
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-agentpay-admin-key");
  if (!provided || !safeEqual(provided, key)) {
    return jsonError("Admin API key required", 401);
  }
  return undefined;
}

/**
 * The browser-facing agent runner can invoke the configured Circle payer. Keep
 * it behind a separate key in production x402 deployments; an admin key must
 * never be embedded in the public dashboard.
 */
export function requireAgentRunRequest(request: Request, budgetUsdc: number): Response | undefined {
  const isProductionX402 = process.env.NODE_ENV === "production" && loadPaymentConfig().mode === "x402";
  if (!isProductionX402) return undefined;

  const key = process.env.AGENTPAY_RUNNER_API_KEY;
  if (!key) return jsonError("AGENTPAY_RUNNER_API_KEY is required before enabling production x402 agent runs", 503);
  const provided = request.headers.get("x-agentpay-runner-key") || "";
  if (!safeEqual(provided, key)) return jsonError("Agent-run access key required", 401);

  const configuredMax = Number(process.env.AGENTPAY_MAX_RUN_BUDGET_USDC || "0.01");
  if (!Number.isFinite(configuredMax) || configuredMax <= 0) {
    return jsonError("AGENTPAY_MAX_RUN_BUDGET_USDC must be a positive number", 503);
  }
  if (budgetUsdc > configuredMax) {
    return jsonError(`Requested budget exceeds the configured ${configuredMax.toFixed(6)} USDC agent-run limit`, 400);
  }
  return undefined;
}

export function canViewSensitiveRuntimeData(request: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return [process.env.AGENTPAY_ADMIN_API_KEY, process.env.AGENTPAY_RUNNER_API_KEY]
    .filter((key): key is string => Boolean(key))
    .some((key) => safeEqual(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-agentpay-admin-key") || request.headers.get("x-agentpay-runner-key") || "", key));
}

export function verifyWebhookRequest(rawBody: string, request: Request): Response | undefined {
  const secret = process.env.AGENTPAY_WEBHOOK_SECRET || process.env.CIRCLE_WEBHOOK_SECRET;
  if (!secret) {
    return process.env.NODE_ENV === "production" ? jsonError("Webhook secret is not configured", 503) : undefined;
  }
  const directSecret = request.headers.get("x-agentpay-webhook-secret");
  if (directSecret && safeEqual(directSecret, secret)) return undefined;

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const provided = request.headers.get("x-agentpay-signature") || request.headers.get("circle-signature") || "";
  if (!safeEqual(provided, expected)) {
    return jsonError("Invalid webhook signature", 401);
  }
  return undefined;
}

async function createStore(): Promise<AgentPayStore> {
  const hasSupabaseRuntime = Boolean(supabaseRuntimeClient());
  const snapshot = hasSupabaseRuntime ? await readSupabaseSnapshot() : readStateSnapshot();
  const persistSnapshot = hasSupabaseRuntime
    ? (nextSnapshot: StoreSnapshot) => {
        void writeSupabaseSnapshot(nextSnapshot);
      }
    : writeStateSnapshot;
  const store = new AgentPayStore(seedData(), snapshot, persistSnapshot);
  globalThis.__agentpayStore = store;
  return store;
}

function readStateSnapshot(): StoreSnapshot | undefined {
  if (process.env.NODE_ENV === "test" && process.env.AGENTPAY_ENABLE_FILE_STATE !== "true") return undefined;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as StoreSnapshot;
  } catch {
    return undefined;
  }
}

function writeStateSnapshot(snapshot: StoreSnapshot) {
  if (process.env.NODE_ENV === "test" && process.env.AGENTPAY_ENABLE_FILE_STATE !== "true") return;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(snapshot, null, 2));
  } catch {
    // Serverless filesystems can be read-only outside /tmp. Supabase remains the durable sink.
  }
  void writeSupabaseSnapshot(snapshot);
}

async function readSupabaseSnapshot(): Promise<StoreSnapshot | undefined> {
  const client = supabaseRuntimeClient();
  if (!client) return undefined;
  const response = await fetch(`${client.url}/rest/v1/runtime_snapshots?select=snapshot&id=eq.default&limit=1`, {
    headers: client.headers,
    cache: "no-store"
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const rows = (await response.json().catch(() => [])) as Array<{ snapshot?: StoreSnapshot }>;
  return rows[0]?.snapshot;
}

async function writeSupabaseSnapshot(snapshot: StoreSnapshot): Promise<void> {
  const client = supabaseRuntimeClient();
  if (!client) return;
  await fetch(`${client.url}/rest/v1/runtime_snapshots?on_conflict=id`, {
    method: "POST",
    headers: { ...client.headers, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      id: "default",
      snapshot,
      updated_at: new Date().toISOString()
    })
  }).catch(() => undefined);
}

function supabaseRuntimeClient():
  | {
      url: string;
      headers: Record<string, string>;
    }
  | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  return {
    url: url.replace(/\/$/, ""),
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`
    }
  };
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
