import {
  ARC_TESTNET,
  ARC_TESTNET_USDC_ADDRESS,
  type AdapterType,
  type PaymentChallenge,
  type PaymentEvent,
  type Provider,
  type Quote,
  type Resource,
  assertTestnetOnly,
  createId,
  nowIso,
  usdcToAtomic
} from "@agentpay/shared";
import type { AgentPayStore } from "@agentpay/db";

export type PaymentMode = "x402" | "test";

const ARC_TESTNET_GATEWAY_WALLET = "0x0077777d7EBA4688BDeF3E311b846F25870A19B9";

interface CirclePaymentPayload {
  x402Version: number;
  resource?: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepted?: Record<string, unknown>;
  payload: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface PaymentRuntimeConfig {
  network: string;
  mode: PaymentMode;
  sellerAddress: string;
  buyerAddress: string;
  allowMainnet: boolean;
  appUrl: string;
  facilitatorUrl?: string | undefined;
  circleGatewayBaseUrl?: string | undefined;
}

export interface IncomingPaymentResult {
  ok: boolean;
  payment?: PaymentEvent;
  challenge?: PaymentChallenge;
}

export interface SettlementVerificationResult {
  ok: boolean;
  status: "settled" | "failed" | "misconfigured";
  evidence?: Record<string, unknown>;
  error?: string;
}

export function loadPaymentConfig(env: NodeJS.ProcessEnv = process.env): PaymentRuntimeConfig {
  const network = env.AGENTPAY_NETWORK || ARC_TESTNET;
  const allowMainnet = env.ALLOW_MAINNET === "true";
  assertTestnetOnly(network, allowMainnet);

  return {
    network,
    mode: env.AGENTPAY_PAYMENT_MODE === "test" && env.NODE_ENV === "test" ? "test" : "x402",
    sellerAddress: env.SELLER_ADDRESS || "0x0000000000000000000000000000000000000000",
    buyerAddress: env.BUYER_ADDRESS || "0x0000000000000000000000000000000000000000",
    allowMainnet,
    appUrl: env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    facilitatorUrl: env.X402_FACILITATOR_URL || undefined,
    circleGatewayBaseUrl: env.CIRCLE_GATEWAY_BASE_URL || undefined
  };
}

export class PaymentService {
  constructor(
    private readonly store: AgentPayStore,
    private readonly config: PaymentRuntimeConfig = loadPaymentConfig()
  ) {}

  quote(resource: Resource): Quote {
    return {
      resourceId: resource.id,
      adapterType: resource.adapterType,
      amountUsdc: resource.priceUsdc,
      atomicAmount: usdcToAtomic(resource.priceUsdc),
      network: this.config.network,
      estimatedLatencyMs: 550,
      rationale: `Pay ${resource.priceUsdc.toFixed(6)} USDC to access ${resource.name}.`
    };
  }

  requiresServerSettlement(): boolean {
    return this.config.mode === "x402";
  }

  challenge(resource: Resource, requestUrl: string, provider?: Provider): PaymentChallenge {
    this.assertConfiguredX402Wallets(provider);
    const payTo = provider?.walletAddress ?? this.config.sellerAddress;
    return {
      status: 402,
      resourceId: resource.id,
      adapterType: resource.adapterType,
      accepts: [
        {
          scheme: "exact",
          network: this.config.network,
          asset: ARC_TESTNET_USDC_ADDRESS,
          amount: usdcToAtomic(resource.priceUsdc),
          maxAmountRequired: usdcToAtomic(resource.priceUsdc),
          payTo,
          resource: requestUrl,
          description: resource.description,
          maxTimeoutSeconds: 60,
          extra: {
            name: "GatewayWalletBatched",
            version: "1",
            verifyingContract: ARC_TESTNET_GATEWAY_WALLET
          }
        }
      ]
    };
  }

  verifyIncoming(input: {
    resource: Resource;
    provider: Provider;
    headers: Headers;
    requestUrl: string;
  }): IncomingPaymentResult {
    const quote = this.quote(input.resource);
    const token = input.headers.get("x-agentpay-test-payment");
    const x402Header =
      input.headers.get("x-payment") ||
      input.headers.get("payment-signature") ||
      input.headers.get("x-payment-signature");

    if (this.config.mode === "x402") {
      this.assertConfiguredX402Wallets(input.provider);
      if (!x402Header) {
        return { ok: false, challenge: this.challenge(input.resource, input.requestUrl, input.provider) };
      }
      const payment = this.recordPayment({
        resource: input.resource,
        provider: input.provider,
        buyerWallet: this.config.buyerAddress,
        paymentIdentifier:
          input.headers.get("x-idempotency-key") || `x402_${quote.resourceId}_${Date.now().toString(36)}`,
        status: "pending_verification",
        metadata: {
          mode: "x402",
          facilitatorUrl: this.config.facilitatorUrl,
          circleGatewayBaseUrl: this.config.circleGatewayBaseUrl,
          x402HeaderPresent: true,
          paymentHeader: input.headers.get("x-payment")
            ? "x-payment"
            : input.headers.get("payment-signature")
              ? "payment-signature"
              : "x-payment-signature"
        }
      });
      return { ok: true, payment };
    }

    if (this.config.mode !== "test") {
      return { ok: false, challenge: this.challenge(input.resource, input.requestUrl, input.provider) };
    }

    if (!token) {
      return { ok: false, challenge: this.challenge(input.resource, input.requestUrl, input.provider) };
    }

    const parsed = token ? parsePaymentToken(token) : undefined;
    if (parsed && parsed.resourceId !== input.resource.id) {
      return { ok: false, challenge: this.challenge(input.resource, input.requestUrl, input.provider) };
    }

    const payment = this.recordPayment({
      resource: input.resource,
      provider: input.provider,
      buyerWallet: parsed?.buyerWallet || this.config.buyerAddress,
      paymentIdentifier:
        parsed?.paymentIdentifier || input.headers.get("x-idempotency-key") || `test_${input.resource.id}_${Date.now()}`,
      status: "authorized",
      metadata: { mode: "test", tokenPresent: Boolean(token) }
    });
    return { ok: true, payment };
  }

  payForResource(input: {
    resource: Resource;
    provider: Provider;
    buyerWallet?: string;
    metadata?: Record<string, unknown>;
  }): PaymentEvent {
    if (this.config.mode === "x402") {
      this.assertConfiguredX402Wallets(input.provider);
    }
    return this.recordPayment({
      resource: input.resource,
      provider: input.provider,
      buyerWallet: input.buyerWallet || this.config.buyerAddress,
      paymentIdentifier: `${this.config.mode}_${input.resource.id}_${createId("payment")}`,
      status: this.config.mode === "x402" ? "pending_verification" : "authorized",
      metadata: {
        mode: this.config.mode,
        ...input.metadata
      }
    });
  }

  createTestPaymentToken(resource: Resource, buyerWallet?: string): string {
    return Buffer.from(
      JSON.stringify({
        resourceId: resource.id,
        amountUsdc: resource.priceUsdc,
        buyerWallet: buyerWallet || this.config.buyerAddress,
        paymentIdentifier: `test_${resource.id}_${createId("token")}`,
        issuedAt: nowIso()
      })
    ).toString("base64url");
  }

  async verifySettlement(input: {
    payment: PaymentEvent;
    resource: Resource;
    provider: Provider;
    headers: Headers;
    requestUrl: string;
  }): Promise<SettlementVerificationResult> {
    if (this.config.mode !== "x402") {
      return { ok: true, status: "settled", evidence: { mode: this.config.mode } };
    }
    const paymentHeader = getPaymentHeader(input.headers);
    if (!paymentHeader) {
      return { ok: false, status: "failed", error: "Missing x402 payment header" };
    }
    if (!this.config.facilitatorUrl) {
      return verifyCircleGatewaySettlement({
        paymentHeader: paymentHeader.value,
        resource: input.resource,
        provider: input.provider,
        network: this.config.network
      });
    }
    try {
      const response = await fetch(this.config.facilitatorUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paymentIdentifier: input.payment.paymentIdentifier,
          resourceId: input.resource.id,
          amountUsdc: input.resource.priceUsdc,
          network: this.config.network,
          buyerWallet: input.payment.buyerWallet,
          sellerWallet: input.provider.walletAddress,
          requestUrl: input.requestUrl,
          paymentHeader: paymentHeader.name,
          paymentProof: paymentHeader.value,
          challenge: this.challenge(input.resource, input.requestUrl, input.provider).accepts[0]
        })
      });
      const evidence = (await response.json().catch(() => ({ statusText: response.statusText }))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          ok: false,
          status: "failed",
          error: `Facilitator verification failed with HTTP ${response.status}`,
          evidence
        };
      }
      const status = String(evidence["status"] ?? evidence["state"] ?? "").toLowerCase();
      const valid =
        evidence["valid"] === true ||
        evidence["isValid"] === true ||
        evidence["success"] === true ||
        ["settled", "valid", "verified", "success", "ok"].includes(status);
      if (!valid) {
        return {
          ok: false,
          status: "failed",
          error: "Facilitator response did not confirm settlement",
          evidence
        };
      }
      return { ok: true, status: "settled", evidence };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Settlement verification failed"
      };
    }
  }

  private recordPayment(input: {
    resource: Resource;
    provider: Provider;
    buyerWallet: string;
    paymentIdentifier: string;
    status: PaymentEvent["status"];
    metadata: Record<string, unknown>;
  }): PaymentEvent {
    const event: PaymentEvent = {
      id: createId("pevt"),
      resourceId: input.resource.id,
      adapterType: input.resource.adapterType as AdapterType,
      amountUsdc: input.resource.priceUsdc,
      network: this.config.network,
      buyerWallet: input.buyerWallet,
      sellerWallet: input.provider.walletAddress,
      paymentIdentifier: input.paymentIdentifier,
      txOrSettlementRef: `${this.config.network}:${input.paymentIdentifier}`,
      status: input.status,
      metadata: input.metadata,
      createdAt: nowIso()
    };
    const stored = this.store.addPaymentEvent(event);
    if (stored.status !== "replayed") {
      this.store.addProviderEarning({
        id: createId("earn"),
        providerId: input.provider.id,
        resourceId: input.resource.id,
        amountUsdc: input.resource.priceUsdc,
        network: this.config.network,
        settlementStatus: input.status === "failed" ? "failed" : "pending",
        createdAt: nowIso()
      });
    }
    return stored;
  }

  private assertConfiguredX402Wallets(provider?: Provider): void {
    if (this.config.mode !== "x402") return;
    assertConfiguredWallet(this.config.sellerAddress, "SELLER_ADDRESS");
    assertConfiguredWallet(this.config.buyerAddress, "BUYER_ADDRESS");
    if (provider) assertConfiguredWallet(provider.walletAddress, `provider wallet for ${provider.name}`);
  }
}

async function verifyCircleGatewaySettlement(input: {
  paymentHeader: string;
  resource: Resource;
  provider: Provider;
  network: string;
}): Promise<SettlementVerificationResult> {
  try {
    const { BatchFacilitatorClient } = await import("@circle-fin/x402-batching/server");
    const paymentPayload = JSON.parse(Buffer.from(input.paymentHeader, "base64").toString("utf8")) as CirclePaymentPayload;
    const requirements = buildCircleGatewayRequirements(input.resource, input.provider, input.network);
    const facilitator = new BatchFacilitatorClient();
    const verifyResult = await facilitator.verify(paymentPayload, requirements);
    if (!verifyResult.isValid) {
      return {
        ok: false,
        status: "failed",
        error: String(verifyResult.invalidReason || "Circle Gateway payment verification failed"),
        evidence: { verifyResult }
      };
    }
    const settleResult = await facilitator.settle(paymentPayload, requirements);
    if (!settleResult.success) {
      return {
        ok: false,
        status: "failed",
        error: String(settleResult.errorReason || "Circle Gateway settlement failed"),
        evidence: { verifyResult, settleResult }
      };
    }
    return {
      ok: true,
      status: "settled",
      evidence: {
        verifier: "circle-gateway-batching",
        payer: settleResult.payer ?? verifyResult.payer,
        transaction: settleResult.transaction,
        verifyResult,
        settleResult
      }
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed",
      error: error instanceof Error ? error.message : "Circle Gateway settlement verification failed"
    };
  }
}

function buildCircleGatewayRequirements(resource: Resource, provider: Provider, network: string) {
  return {
    scheme: "exact" as const,
    network,
    asset: ARC_TESTNET_USDC_ADDRESS,
    amount: usdcToAtomic(resource.priceUsdc),
    payTo: provider.walletAddress,
    maxTimeoutSeconds: 345600,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: ARC_TESTNET_GATEWAY_WALLET
    }
  };
}

function getPaymentHeader(headers: Headers): { name: string; value: string } | undefined {
  const candidates = ["x-payment", "payment-signature", "x-payment-signature"];
  for (const name of candidates) {
    const value = headers.get(name);
    if (value) return { name, value };
  }
  return undefined;
}

function assertConfiguredWallet(value: string, label: string): void {
  const normalized = value.toLowerCase();
  const localOnly = new Set([
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003"
  ]);
  if (!/^0x[a-f0-9]{40}$/i.test(value) || localOnly.has(normalized)) {
    throw new Error(`${label} must be a configured Arc testnet wallet address for x402 mode`);
  }
}

function parsePaymentToken(token: string):
  | {
      resourceId: string;
      buyerWallet: string;
      paymentIdentifier: string;
    }
  | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
      resourceId?: unknown;
      buyerWallet?: unknown;
      paymentIdentifier?: unknown;
    };
    if (
      typeof decoded.resourceId !== "string" ||
      typeof decoded.buyerWallet !== "string" ||
      typeof decoded.paymentIdentifier !== "string"
    ) {
      return undefined;
    }
    return {
      resourceId: decoded.resourceId,
      buyerWallet: decoded.buyerWallet,
      paymentIdentifier: decoded.paymentIdentifier
    };
  } catch {
    return undefined;
  }
}
