import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadPaymentConfig } from "@agentpay/payments";
import { canViewSensitiveRuntimeData } from "../../../../lib/runtime";
import { ARC_TESTNET_USDC_ADDRESS } from "@agentpay/shared";

const execFileAsync = promisify(execFile);

type CliResult<T> =
  | {
      ok: true;
      data: T;
      checkedAt: string;
    }
  | {
      ok: false;
      error: string;
      checkedAt: string;
    };

type WalletBalanceJson = {
  data?: {
    balances?: Array<{
      amount?: string;
      token?: {
        symbol?: string;
        blockchain?: string;
        decimals?: number;
        isNative?: boolean;
        tokenAddress?: string;
      };
    }>;
  };
};

type GatewayBalanceJson = {
  data?: {
    total?: string;
    token?: string;
    address?: string;
    backingEOA?: string;
    balances?: Array<{
      network?: string;
      domain?: number;
      balance?: string;
    }>;
  };
};

export async function GET(request: Request) {
  const config = loadPaymentConfig();
  const address = config.buyerAddress;
  const chain = "ARC-TESTNET";
  if (!canViewSensitiveRuntimeData(request)) {
    return Response.json({ network: config.network, paymentMode: config.mode, balanceVisibility: "restricted" });
  }
  const remote = await getRemoteWalletStatus(address, chain);
  if (remote) {
    return Response.json({
      address,
      chain,
      network: config.network,
      paymentMode: config.mode,
      asset: {
        symbol: "USDC",
        address: ARC_TESTNET_USDC_ADDRESS,
        decimals: 6
      },
      ...remote,
      source: "Circle CLI live check via VPS payer"
    });
  }

  const [walletBalance, gatewayBalance] = await Promise.all([
    runCircleJson<WalletBalanceJson>([
      "wallet",
      "balance",
      "--address",
      address,
      "--chain",
      chain,
      "--output",
      "json"
    ]),
    runCircleJson<GatewayBalanceJson>([
      "gateway",
      "balance",
      "--address",
      address,
      "--chain",
      chain,
      "--all",
      "--output",
      "json"
    ])
  ]);

  return Response.json({
    address,
    chain,
    network: config.network,
    paymentMode: config.mode,
    asset: {
      symbol: "USDC",
      address: ARC_TESTNET_USDC_ADDRESS,
      decimals: 6
    },
    walletBalance: normalizeWalletBalance(walletBalance),
    gatewayBalance: normalizeGatewayBalance(gatewayBalance),
    source: "Circle CLI live check"
  });
}

async function getRemoteWalletStatus(address: string, chain: string) {
  if (!process.env.AGENTPAY_PAYER_URL) return null;
  const url = new URL("/payer/wallet-status", process.env.AGENTPAY_PAYER_URL);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.AGENTPAY_PAYER_API_KEY ? { "x-agentpay-payer-key": process.env.AGENTPAY_PAYER_API_KEY } : {})
      },
      body: JSON.stringify({
        buyerAddress: address,
        chain
      })
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as {
      walletBalance?: unknown;
      gatewayBalance?: unknown;
    };
    if (!parsed.walletBalance || !parsed.gatewayBalance) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function runCircleJson<T>(args: string[]): Promise<CliResult<T>> {
  const checkedAt = new Date().toISOString();
  try {
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
    const { stdout } = await execFileAsync(command, commandArgs, {
      timeout: 25_000,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, data: JSON.parse(stdout) as T, checkedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Circle CLI failed";
    return { ok: false, error: message, checkedAt };
  }
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function normalizeWalletBalance(result: CliResult<WalletBalanceJson>) {
  if (!result.ok) return result;
  const balances = result.data.data?.balances ?? [];
  const usdc = balances.find((item) => item.token?.symbol === "USDC" && item.token.isNative === false) ?? balances[0];
  return {
    ok: true,
    checkedAt: result.checkedAt,
    amount: usdc?.amount ?? "0",
    token: usdc?.token?.symbol ?? "USDC",
    tokenAddress: usdc?.token?.tokenAddress ?? ARC_TESTNET_USDC_ADDRESS
  };
}

function normalizeGatewayBalance(result: CliResult<GatewayBalanceJson>) {
  if (!result.ok) return result;
  const arc = result.data.data?.balances?.find((item) => item.network === "Arc Testnet");
  return {
    ok: true,
    checkedAt: result.checkedAt,
    amount: arc?.balance ?? result.data.data?.total ?? "0",
    total: result.data.data?.total ?? "0",
    token: result.data.data?.token ?? "USDC",
    backingEOA: result.data.data?.backingEOA ?? null
  };
}
