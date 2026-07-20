import { describe, expect, it } from "vitest";
import { assertTestnetOnly, maskSecret } from "@agentpay/shared";
import { requireAgentRunRequest } from "../apps/web/lib/runtime";

describe("security guards", () => {
  it("blocks mainnet by default", () => {
    expect(() => assertTestnetOnly("ethereum-mainnet", false)).toThrow(/blocked/i);
    expect(() => assertTestnetOnly("arc-testnet", false)).not.toThrow();
  });

  it("masks secrets before display", () => {
    expect(maskSecret("0x1234567890abcdef")).toBe("0x1234...cdef");
    expect(maskSecret("short")).toBe("***");
  });

  it("requires an authenticated, budget-capped runner in production x402 mode", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.AGENTPAY_PAYMENT_MODE = "x402";
    process.env.AGENTPAY_RUNNER_API_KEY = "runner-secret";
    process.env.AGENTPAY_MAX_RUN_BUDGET_USDC = "0.01";
    try {
      expect(requireAgentRunRequest(new Request("http://localhost/api/agent/runs"), 0.01)?.status).toBe(401);
      expect(
        requireAgentRunRequest(
          new Request("http://localhost/api/agent/runs", { headers: { "x-agentpay-runner-key": "runner-secret" } }),
          0.02
        )?.status
      ).toBe(400);
      expect(
        requireAgentRunRequest(
          new Request("http://localhost/api/agent/runs", { headers: { "x-agentpay-runner-key": "runner-secret" } }),
          0.01
        )
      ).toBeUndefined();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      delete process.env.AGENTPAY_PAYMENT_MODE;
      delete process.env.AGENTPAY_RUNNER_API_KEY;
      delete process.env.AGENTPAY_MAX_RUN_BUDGET_USDC;
    }
  });
});
