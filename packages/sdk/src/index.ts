import {
  ARC_TESTNET_EIP155,
  ARC_TESTNET_USDC_ADDRESS,
  type AccessClass,
  assertTestnetOnly,
  createId,
  nowIso,
  usdcToAtomic
} from "@agentpay/shared";

export interface AgentPayProtectOptions {
  price: `${number} USDC` | number;
  seller: string;
  accessClass?: AccessClass;
  resourceId?: string;
  description?: string;
  network?: string;
  asset?: string;
  allowMainnet?: boolean;
  verifierUrl?: string;
  allowUnverifiedProofs?: boolean;
}

export interface AgentPayRequestContext {
  payment: {
    id: string;
    resourceId: string;
    amountUsdc: number;
    network: string;
    sellerWallet: string;
    paymentIdentifier: string;
    headerName: string;
    receivedAt: string;
  };
}

export type ProtectedHandler = (request: Request, context: AgentPayRequestContext) => Response | Promise<Response>;

export interface AgentPayClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface AgentPayResourceSummary {
  id: string;
  name: string;
  description?: string;
  accessClass: AccessClass;
  priceUsdc: number;
  providerId: string;
}

export interface AgentPayResourceManifest {
  schemaVersion: "agentpay.resource.v1";
  resourceId: string;
  name: string;
  description: string;
  accessClass: AccessClass;
  adapterType: string;
  provider: {
    id: string;
    name: string;
    sellerWallet: string;
  };
  price: {
    amountUsdc: number;
    atomicAmount: string;
    asset: "USDC";
    decimals: 6;
    network: string;
    tokenAddress: string;
  };
  payment: {
    protocol: "x402";
    endpoint: string;
    methods: Array<"GET" | "POST">;
    challengeStatus: 402;
    idempotencyHeader: string;
  };
  fulfillment: {
    upstream: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  };
  capabilities: {
    citations: boolean;
    cacheable: boolean;
    streaming: boolean;
    testable: boolean;
  };
  trust: {
    testnetOnly: true;
    settlementRequired: true;
    replayProtected: true;
    allowedHostsEnforced: true;
  };
  policyHints: {
    expectedValue: number;
    freshnessScore: number;
    confidenceScore: number;
  };
  links: {
    manifest: string;
    pay: string;
    test: string;
  };
}

export interface AgentPayPaymentChallenge {
  status: 402;
  x402Version?: number;
  resourceId: string;
  accessClass?: AccessClass;
  adapterType?: string;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    maxAmountRequired?: string;
    payTo: string;
    resource: string;
    description?: string;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  }>;
}

export interface AgentPayResourceRequest {
  resourceId: string;
  method?: "GET" | "POST";
  paymentProof?: string;
  paymentHeaderName?: string;
  idempotencyKey?: string;
  payload?: unknown;
}

export interface AgentPayPaymentRecord {
  id?: string;
  resourceId: string;
  adapterType?: string;
  amountUsdc: number;
  network: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentIdentifier: string;
  txOrSettlementRef?: string;
  status: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface AgentPayAdapterResult {
  adapterType: string;
  resourceId: string;
  status: "ok" | "error";
  data: unknown;
  citations?: unknown[];
  metadata?: Record<string, unknown>;
}

export type AgentPayResourceResponse =
  | {
      ok: true;
      payment: AgentPayPaymentRecord;
      result: AgentPayAdapterResult;
    }
  | {
      ok: false;
      payment?: AgentPayPaymentRecord;
      error: string;
      adapterError?: string;
      challenge?: AgentPayPaymentChallenge;
      raw?: unknown;
    };

export interface AgentPayManifestResourceRequest {
  manifest: AgentPayResourceManifest;
  method?: "GET" | "POST";
  paymentProof: string;
  paymentHeaderName?: string;
  idempotencyKey?: string;
  payload?: unknown;
}

export interface AgentPayPaymentChallengeRequest {
  resourceId: string;
  method?: "GET" | "POST";
  payload?: unknown;
}

export interface AgentPayPreparedPurchase {
  manifest: AgentPayResourceManifest;
  challenge: AgentPayPaymentChallenge;
  paymentEndpoint: string;
  suggestedMethod: "GET" | "POST";
  amountUsdc: number;
  atomicAmount: string;
  sellerWallet: string;
  network: string;
}

export function createAgentPayClient(options: AgentPayClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const request = options.fetch ?? fetch;
  return {
    async listResources(): Promise<AgentPayResourceSummary[]> {
      const response = await request(`${baseUrl}/api/resources`);
      if (!response.ok) throw new Error(`Failed to list AgentPay resources: ${response.status}`);
      const body = (await response.json()) as { resources?: AgentPayResourceSummary[] };
      return body.resources ?? [];
    },

    async listResourceManifests(): Promise<AgentPayResourceManifest[]> {
      const response = await request(`${baseUrl}/api/resources/manifests`);
      if (!response.ok) throw new Error(`Failed to list AgentPay resource manifests: ${response.status}`);
      const body = (await response.json()) as { manifests?: AgentPayResourceManifest[] };
      return body.manifests ?? [];
    },

    async getResourceManifest(resourceId: string): Promise<AgentPayResourceManifest> {
      const response = await request(`${baseUrl}/api/resources/${encodeURIComponent(resourceId)}/manifest`);
      if (!response.ok) throw new Error(`Failed to get AgentPay resource manifest: ${response.status}`);
      const manifest = (await response.json()) as AgentPayResourceManifest;
      assertResourceManifest(manifest);
      return manifest;
    },

    async getPaymentChallenge(input: AgentPayPaymentChallengeRequest): Promise<AgentPayPaymentChallenge> {
      const response = await request(`${baseUrl}/api/pay/${encodeURIComponent(input.resourceId)}`, requestInitForUnpaid(input));
      const body = (await response.json().catch(() => ({}))) as Partial<AgentPayPaymentChallenge> & Record<string, unknown>;
      if (response.status !== 402) {
        throw new Error(`Expected x402 payment challenge for ${input.resourceId}, received HTTP ${response.status}`);
      }
      assertPaymentChallenge(body);
      return body;
    },

    async prepareResourcePurchase(input: AgentPayPaymentChallengeRequest): Promise<AgentPayPreparedPurchase> {
      const [manifest, challenge] = await Promise.all([
        this.getResourceManifest(input.resourceId),
        this.getPaymentChallenge(input)
      ]);
      const accepted = challenge.accepts[0];
      if (!accepted) throw new Error(`No x402 accepts entry returned for ${input.resourceId}`);
      return {
        manifest,
        challenge,
        paymentEndpoint: manifest.payment.endpoint,
        suggestedMethod: input.method ?? (input.payload === undefined ? "GET" : "POST"),
        amountUsdc: manifest.price.amountUsdc,
        atomicAmount: accepted.amount,
        sellerWallet: accepted.payTo,
        network: accepted.network
      };
    },

    async requestResource(input: AgentPayResourceRequest): Promise<AgentPayResourceResponse> {
      const headers = new Headers({ accept: "application/json" });
      if (input.paymentProof) {
        headers.set(input.paymentHeaderName ?? "payment-signature", input.paymentProof);
      }
      if (input.idempotencyKey) headers.set("x-idempotency-key", input.idempotencyKey);
      if (input.payload !== undefined) headers.set("content-type", "application/json");
      const response = await request(`${baseUrl}/api/pay/${encodeURIComponent(input.resourceId)}`, {
        method: input.method ?? (input.payload === undefined ? "GET" : "POST"),
        headers,
        ...(input.payload === undefined ? {} : { body: JSON.stringify(input.payload) })
      });
      return normalizeResourceResponse(response, await response.json().catch(() => ({})));
    },

    async requestManifestResource(input: AgentPayManifestResourceRequest): Promise<AgentPayResourceResponse> {
      assertResourceManifest(input.manifest);
      const headers = new Headers({ accept: "application/json" });
      headers.set(input.paymentHeaderName ?? "payment-signature", input.paymentProof);
      if (input.idempotencyKey) headers.set(input.manifest.payment.idempotencyHeader, input.idempotencyKey);
      if (input.payload !== undefined) headers.set("content-type", "application/json");
      const response = await request(input.manifest.payment.endpoint, {
        method: input.method ?? (input.payload === undefined ? "GET" : "POST"),
        headers,
        ...(input.payload === undefined ? {} : { body: JSON.stringify(input.payload) })
      });
      return normalizeResourceResponse(response, await response.json().catch(() => ({})));
    }
  };
}

function normalizeResourceResponse(response: Response, body: unknown): AgentPayResourceResponse {
  if (response.status === 402 && isPaymentChallenge(body)) {
    return {
      ok: false,
      error: "Payment required",
      challenge: body,
      raw: body
    };
  }
  if (isObject(body) && isPaymentRecord(body["payment"]) && isAdapterResult(body["result"])) {
    return {
      ok: true,
      payment: body["payment"],
      result: body["result"]
    };
  }
  if (isObject(body)) {
    return {
      ok: false,
      ...(isPaymentRecord(body["payment"]) ? { payment: body["payment"] } : {}),
      error: typeof body["error"] === "string" ? body["error"] : `AgentPay resource request failed with HTTP ${response.status}`,
      ...(typeof body["adapterError"] === "string" ? { adapterError: body["adapterError"] } : {}),
      raw: body
    };
  }
  return {
    ok: false,
    error: `AgentPay resource request failed with HTTP ${response.status}`,
    raw: body
  };
}

export function assertResourceManifest(manifest: AgentPayResourceManifest): asserts manifest is AgentPayResourceManifest {
  if (manifest.schemaVersion !== "agentpay.resource.v1") throw new Error("Invalid AgentPay manifest schemaVersion");
  if (!manifest.resourceId) throw new Error("Invalid AgentPay manifest resourceId");
  if (manifest.payment?.protocol !== "x402") throw new Error("Invalid AgentPay manifest payment protocol");
  if (!manifest.payment.endpoint) throw new Error("Invalid AgentPay manifest payment endpoint");
  if (!manifest.provider?.sellerWallet) throw new Error("Invalid AgentPay manifest seller wallet");
  if (!manifest.price?.atomicAmount) throw new Error("Invalid AgentPay manifest atomic amount");
  if (!manifest.fulfillment?.inputSchema || !manifest.fulfillment.outputSchema) {
    throw new Error("Invalid AgentPay manifest fulfillment schemas");
  }
  if (!manifest.trust?.testnetOnly || !manifest.trust.settlementRequired || !manifest.trust.replayProtected) {
    throw new Error("Invalid AgentPay manifest trust guarantees");
  }
}

function assertPaymentChallenge(value: Partial<AgentPayPaymentChallenge>): asserts value is AgentPayPaymentChallenge {
  if (value.status !== 402) throw new Error("Invalid AgentPay payment challenge status");
  if (!value.resourceId) throw new Error("Invalid AgentPay payment challenge resourceId");
  if (!Array.isArray(value.accepts) || !value.accepts[0]) throw new Error("Invalid AgentPay payment challenge accepts");
  const accepted = value.accepts[0];
  if (!accepted.amount || !accepted.payTo || !accepted.network || !accepted.asset || !accepted.resource) {
    throw new Error("Invalid AgentPay payment challenge accepts entry");
  }
}

function isPaymentChallenge(value: unknown): value is AgentPayPaymentChallenge {
  if (!isObject(value)) return false;
  try {
    assertPaymentChallenge(value as Partial<AgentPayPaymentChallenge>);
    return true;
  } catch {
    return false;
  }
}

function isPaymentRecord(value: unknown): value is AgentPayPaymentRecord {
  return (
    isObject(value) &&
    typeof value["resourceId"] === "string" &&
    typeof value["amountUsdc"] === "number" &&
    typeof value["network"] === "string" &&
    typeof value["buyerWallet"] === "string" &&
    typeof value["sellerWallet"] === "string" &&
    typeof value["paymentIdentifier"] === "string" &&
    typeof value["status"] === "string"
  );
}

function isAdapterResult(value: unknown): value is AgentPayAdapterResult {
  return (
    isObject(value) &&
    typeof value["adapterType"] === "string" &&
    typeof value["resourceId"] === "string" &&
    (value["status"] === "ok" || value["status"] === "error") &&
    "data" in value
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requestInitForUnpaid(input: AgentPayPaymentChallengeRequest): RequestInit {
  const method = input.method ?? (input.payload === undefined ? "GET" : "POST");
  const headers = new Headers({ accept: "application/json" });
  if (input.payload !== undefined) headers.set("content-type", "application/json");
  return {
    method,
    headers,
    ...(input.payload === undefined ? {} : { body: JSON.stringify(input.payload) })
  };
}

export function protect(handler: ProtectedHandler, options: AgentPayProtectOptions) {
  return async function protectedHandler(request: Request): Promise<Response> {
    const normalized = normalizeOptions(options, request.url);
    const paymentHeader = getPaymentHeader(request.headers);
    if (!paymentHeader) {
      return Response.json(createPaymentChallenge(normalized, request.url), { status: 402 });
    }
    if (!normalized.verifierUrl && !normalized.allowUnverifiedProofs && process.env.NODE_ENV === "production") {
      return Response.json(
        {
          error: "AgentPay protect requires verifierUrl in production before fulfilling paid access.",
          resourceId: normalized.resourceId
        },
        { status: 503 }
      );
    }
    if (normalized.verifierUrl) {
      const verification = await verifyPayment(normalized, request.url, paymentHeader);
      if (!verification.ok) {
        return Response.json(
          {
            error: verification.error,
            resourceId: normalized.resourceId
          },
          { status: 402 }
        );
      }
    }

    const context: AgentPayRequestContext = {
      payment: {
        id: createId("sdkpay"),
        resourceId: normalized.resourceId,
        amountUsdc: normalized.amountUsdc,
        network: normalized.network,
        sellerWallet: normalized.seller,
        paymentIdentifier: request.headers.get("x-idempotency-key") || `sdk_${normalized.resourceId}_${Date.now().toString(36)}`,
        headerName: paymentHeader.name,
        receivedAt: nowIso()
      }
    };

    const response = await handler(request, context);
    response.headers.set("x-agentpay-resource", normalized.resourceId);
    response.headers.set("x-agentpay-payment", context.payment.paymentIdentifier);
    return response;
  };
}

export function createPaymentChallenge(options: NormalizedProtectOptions, requestUrl: string) {
  return {
    status: 402,
    resourceId: options.resourceId,
    accessClass: options.accessClass,
    accepts: [
      {
        scheme: "exact",
        network: options.network,
        asset: options.asset,
        amount: usdcToAtomic(options.amountUsdc),
        maxAmountRequired: usdcToAtomic(options.amountUsdc),
        payTo: options.seller,
        resource: requestUrl,
        description: options.description,
        maxTimeoutSeconds: 60,
        extra: {
          name: "USDC",
          version: "2",
          accessClass: options.accessClass
        }
      }
    ]
  };
}

export function parseUsdcAmount(value: AgentPayProtectOptions["price"]): number {
  if (typeof value === "number") return value;
  const parsed = Number(value.replace(/USDC$/i, "").trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid USDC amount: ${value}`);
  }
  return parsed;
}

interface NormalizedProtectOptions {
  amountUsdc: number;
  seller: string;
  accessClass: AccessClass;
  resourceId: string;
  description: string;
  network: string;
  asset: string;
  verifierUrl?: string;
  allowUnverifiedProofs: boolean;
}

function normalizeOptions(options: AgentPayProtectOptions, requestUrl: string): NormalizedProtectOptions {
  const network = options.network || ARC_TESTNET_EIP155;
  assertTestnetOnly(network, options.allowMainnet === true);
  const amountUsdc = parseUsdcAmount(options.price);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) {
    throw new Error("price must be greater than 0 USDC");
  }
  if (!options.seller) {
    throw new Error("seller wallet is required");
  }
  return {
    amountUsdc,
    seller: options.seller,
    accessClass: options.accessClass || "premium_api",
    resourceId: options.resourceId || new URL(requestUrl).pathname.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "resource",
    description: options.description || "AgentPay protected resource",
    network,
    asset: options.asset || ARC_TESTNET_USDC_ADDRESS,
    ...(options.verifierUrl ? { verifierUrl: options.verifierUrl } : {}),
    allowUnverifiedProofs: options.allowUnverifiedProofs === true
  };
}

async function verifyPayment(
  options: NormalizedProtectOptions,
  requestUrl: string,
  paymentHeader: { name: string; value: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!options.verifierUrl) return { ok: false, error: "Payment verifier URL is required" };
  try {
    const response = await fetch(options.verifierUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: options.resourceId,
        amountUsdc: options.amountUsdc,
        network: options.network,
        sellerWallet: options.seller,
        requestUrl,
        paymentHeader: paymentHeader.name,
        paymentProof: paymentHeader.value,
        challenge: createPaymentChallenge(options, requestUrl).accepts[0]
      })
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const status = String(data["status"] ?? data["state"] ?? "").toLowerCase();
    const valid =
      response.ok &&
      (data["valid"] === true ||
        data["isValid"] === true ||
        data["success"] === true ||
        ["settled", "valid", "verified", "success", "ok"].includes(status));
    return valid ? { ok: true } : { ok: false, error: "Payment verifier did not confirm settlement" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Payment verifier failed" };
  }
}

function getPaymentHeader(headers: Headers): { name: string; value: string } | undefined {
  const candidates = ["x-payment", "payment-signature", "x-payment-signature"];
  for (const name of candidates) {
    const value = headers.get(name);
    if (value) return { name, value };
  }
  return undefined;
}
