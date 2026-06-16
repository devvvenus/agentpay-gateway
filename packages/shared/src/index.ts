import { createHash, randomUUID } from "node:crypto";

export const ARC_TESTNET = "arc-testnet";
export const ARC_TESTNET_CHAIN_ALIAS = "ARC-TESTNET";
export const ARC_TESTNET_EIP155 = "eip155:5042002";
export const ARC_TESTNET_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
export const USDC_DECIMALS = 6;

export type AdapterType =
  | "mcp"
  | "api_proxy"
  | "dataset"
  | "crawl"
  | "agent_delegation"
  | "memory_retrieval"
  | "inference"
  | "rss_paywall"
  | "search"
  | "docs_source";

export type PaymentStatus =
  | "challenge"
  | "authorized"
  | "settled"
  | "failed"
  | "replayed"
  | "pending_verification"
  | "verification_failed";

export type AgentRunStatus = "queued" | "running" | "completed" | "failed";
export type AgentDecisionKind = "pay" | "skip" | "cache";

export interface Provider {
  id: string;
  name: string;
  walletAddress: string;
  createdAt: string;
}

export interface Resource {
  id: string;
  providerId: string;
  name: string;
  description: string;
  adapterType: AdapterType;
  priceUsdc: number;
  expectedValue: number;
  freshnessScore: number;
  confidenceScore: number;
  enabled: boolean;
  createdAt: string;
}

export interface AdapterConfig<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  resourceId: string;
  config: TConfig;
}

export interface AdapterInput<TPayload = unknown> {
  resource: Resource;
  config: Record<string, unknown>;
  payload: TPayload;
  prompt?: string;
  cacheKey?: string;
}

export interface Quote {
  resourceId: string;
  adapterType: AdapterType;
  amountUsdc: number;
  atomicAmount: string;
  network: string;
  estimatedLatencyMs: number;
  rationale: string;
}

export interface PaymentEvent {
  id: string;
  resourceId: string;
  adapterType: AdapterType;
  amountUsdc: number;
  network: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentIdentifier: string;
  txOrSettlementRef?: string;
  status: PaymentStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PaymentChallenge {
  status: 402;
  resourceId: string;
  adapterType: AdapterType;
  accepts: Array<{
    scheme: "exact" | "x402";
    network: string;
    asset: "USDC" | string;
    amount?: string;
    maxAmountRequired: string;
    payTo: string;
    resource: string;
    description: string;
    maxTimeoutSeconds?: number;
    extra?: {
      name: string;
      version: string;
    };
  }>;
}

export interface Receipt {
  id: string;
  paymentEventId: string;
  resourceId: string;
  receipt: Record<string, unknown>;
  createdAt: string;
}

export interface ProviderEarning {
  id: string;
  providerId: string;
  resourceId: string;
  amountUsdc: number;
  network: string;
  settlementStatus: "pending" | "settled" | "failed";
  createdAt: string;
}

export interface CachedArtifact {
  id: string;
  resourceId: string;
  cacheKey: string;
  contentHash: string;
  artifact: AdapterResult;
  expiresAt?: string;
  createdAt: string;
}

export interface PaidExecutionContext {
  runId?: string;
  resource: Resource;
  quote: Quote;
  payment: PaymentEvent;
  provider: Provider;
  now: string;
  allowedHosts: string[];
}

export interface AdapterResult<TData = unknown> {
  adapterType: AdapterType;
  resourceId: string;
  status: "ok" | "error";
  data: TData;
  citations: Citation[];
  metadata: Record<string, unknown>;
}

export interface Citation {
  resourceId: string;
  title: string;
  sourceUrl?: string;
  quote?: string;
  citationReceipt?: Record<string, unknown>;
}

export interface AgentDecision {
  id: string;
  runId: string;
  resourceId: string;
  decision: AgentDecisionKind;
  score: number;
  reason: string;
  createdAt: string;
}

export interface AgentStep {
  id: string;
  runId: string;
  resourceId?: string;
  stepType: string;
  status: "ok" | "error" | "skipped";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  prompt: string;
  budgetUsdc: number;
  status: AgentRunStatus;
  totalSpendUsdc: number;
  output: AgentRunOutput;
  createdAt: string;
  completedAt?: string;
}

export interface AgentRunOutput {
  answer: string;
  paidCitations: Citation[];
  skippedSources: Array<{ resourceId: string; reason: string }>;
  payments: PaymentEvent[];
  decisions: AgentDecision[];
  budgetEfficiency: number;
  adapterResults: AdapterResult[];
}

export interface Metrics {
  users: number;
  providers: number;
  resources: number;
  agentRuns: number;
  paidCalls: number;
  attemptedPaidCalls: number;
  settledPaidCalls: number;
  failedPaidCalls: number;
  pendingVerificationCalls: number;
  attemptedUsdcVolume: number;
  settledUsdcVolume: number;
  paidCitations: number;
  totalUsdcVolume: number;
  averagePaymentUsdc: number;
  providersPaid: number;
  adapterBreakdown: Record<AdapterType, number>;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function usdcToAtomic(amountUsdc: number): string {
  if (!Number.isFinite(amountUsdc) || amountUsdc < 0) {
    throw new Error(`Invalid USDC amount: ${amountUsdc}`);
  }
  return BigInt(Math.round(amountUsdc * 10 ** USDC_DECIMALS)).toString();
}

export function atomicToUsdc(atomicAmount: string): number {
  return Number(BigInt(atomicAmount)) / 10 ** USDC_DECIMALS;
}

export function jsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function cacheKeyFor(resourceId: string, payload: unknown): string {
  return `${resourceId}:${jsonHash(payload)}`;
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 10) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function assertTestnetOnly(network: string, allowMainnet: boolean): void {
  const allowedTestnets = new Set([ARC_TESTNET, ARC_TESTNET_CHAIN_ALIAS, ARC_TESTNET_EIP155]);
  if (!allowMainnet && !allowedTestnets.has(network)) {
    throw new Error(`Mainnet or unsupported network blocked: ${network}`);
  }
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
