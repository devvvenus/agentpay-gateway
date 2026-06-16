import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterResult, PaymentEvent } from "@agentpay/shared";
import { loadPaymentConfig } from "@agentpay/payments";

const execFileAsync = promisify(execFile);

type PaidExecutionResponse = {
  payment: PaymentEvent;
  result: AdapterResult;
  verification?: Record<string, unknown>;
};

export async function executePaidResourceWithCircle(input: {
  resource: { id: string };
  payload: Record<string, unknown>;
  prompt: string;
}): Promise<PaidExecutionResponse> {
  const config = loadPaymentConfig();
  const url = new URL(`/api/pay/${input.resource.id}`, config.appUrl);

  for (const [key, value] of Object.entries(input.payload)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("prompt", input.prompt);

  if (process.env.AGENTPAY_PAYER_URL) {
    return executeViaRemotePayer({
      payerUrl: process.env.AGENTPAY_PAYER_URL,
      targetUrl: url.toString(),
      buyerAddress: config.buyerAddress
    });
  }

  const { stdout } = await execCircle([
    "services",
    "pay",
    url.toString(),
    "--address",
    config.buyerAddress,
    "--chain",
    "ARC-TESTNET",
    "--max-amount",
    "0.01",
    "--output",
    "json"
  ]);
  const parsed = JSON.parse(stdout) as {
    data?: {
      response?: {
        payment?: PaymentEvent;
        result?: AdapterResult;
      };
      payment?: Record<string, unknown>;
    };
  };
  const payment = parsed.data?.response?.payment;
  const result = parsed.data?.response?.result;
  if (!payment || !result) {
    throw new Error("Circle x402 payment completed without AgentPay payment/result payload");
  }
  return parsed.data?.payment ? { payment, result, verification: parsed.data.payment } : { payment, result };
}

async function executeViaRemotePayer(input: {
  payerUrl: string;
  targetUrl: string;
  buyerAddress: string;
}): Promise<PaidExecutionResponse> {
  const response = await fetch(input.payerUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.AGENTPAY_PAYER_API_KEY ? { "x-agentpay-payer-key": process.env.AGENTPAY_PAYER_API_KEY } : {})
    },
    body: JSON.stringify({
      targetUrl: input.targetUrl,
      buyerAddress: input.buyerAddress,
      chain: "ARC-TESTNET",
      maxAmount: "0.01"
    })
  });
  const parsed = (await response.json().catch(() => ({}))) as {
    payment?: PaymentEvent;
    result?: AdapterResult;
    verification?: Record<string, unknown>;
    error?: string;
    detail?: string;
  };
  if (!response.ok) {
    throw new Error(parsed.error || parsed.detail || `Remote Circle payer failed with HTTP ${response.status}`);
  }
  if (!parsed.payment || !parsed.result) {
    throw new Error("Remote Circle payer completed without AgentPay payment/result payload");
  }
  return parsed.verification
    ? { payment: parsed.payment, result: parsed.result, verification: parsed.verification }
    : { payment: parsed.payment, result: parsed.result };
}

async function execCircle(args: string[]) {
  const command = process.platform === "win32" ? "powershell.exe" : "circle";
  const commandArgs =
    process.platform === "win32"
      ? [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `& ${["circle", ...args].map(quotePowerShellArg).join(" ")}`
        ]
      : args;

  try {
    return await execFileAsync(command, commandArgs, {
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4
    });
  } catch (error) {
    if (isMissingCircleCli(error)) {
      throw new Error(
        "Circle CLI is required for server-side agent payments in x402 mode. Run this path on a Circle-authenticated runtime or replace it with a Circle API-backed payer."
      );
    }
    throw error;
  }
}

function isMissingCircleCli(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
