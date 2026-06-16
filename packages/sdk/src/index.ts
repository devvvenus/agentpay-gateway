import {
  ARC_TESTNET_EIP155,
  ARC_TESTNET_USDC_ADDRESS,
  assertTestnetOnly,
  createId,
  nowIso,
  usdcToAtomic
} from "@agentpay/shared";

export interface AgentPayProtectOptions {
  price: `${number} USDC` | number;
  seller: string;
  resourceId?: string;
  description?: string;
  network?: string;
  asset?: string;
  allowMainnet?: boolean;
  verifierUrl?: string;
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

export function protect(handler: ProtectedHandler, options: AgentPayProtectOptions) {
  return async function protectedHandler(request: Request): Promise<Response> {
    const normalized = normalizeOptions(options, request.url);
    const paymentHeader = getPaymentHeader(request.headers);
    if (!paymentHeader) {
      return Response.json(createPaymentChallenge(normalized, request.url), { status: 402 });
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
          version: "2"
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
  resourceId: string;
  description: string;
  network: string;
  asset: string;
  verifierUrl?: string;
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
    resourceId: options.resourceId || new URL(requestUrl).pathname.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "resource",
    description: options.description || "AgentPay protected resource",
    network,
    asset: options.asset || ARC_TESTNET_USDC_ADDRESS,
    ...(options.verifierUrl ? { verifierUrl: options.verifierUrl } : {})
  };
}

async function verifyPayment(
  options: NormalizedProtectOptions,
  requestUrl: string,
  paymentHeader: { name: string; value: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!options.verifierUrl) return { ok: true };
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
