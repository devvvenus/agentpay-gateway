import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterResult, PaymentEvent } from "@agentpay/shared";
import { loadPaymentConfig } from "@agentpay/payments";

const execFileAsync = promisify(execFile);

export async function executePaidResourceWithCircle(input: {
  resource: { id: string };
  payload: Record<string, unknown>;
  prompt: string;
}) {
  const config = loadPaymentConfig();
  const url = new URL(`/api/pay/${input.resource.id}`, config.appUrl);

  for (const [key, value] of Object.entries(input.payload)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("prompt", input.prompt);

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

  return execFileAsync(command, commandArgs, {
    timeout: 120_000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
