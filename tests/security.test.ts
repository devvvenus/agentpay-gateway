import { describe, expect, it } from "vitest";
import { assertTestnetOnly, maskSecret } from "@agentpay/shared";

describe("security guards", () => {
  it("blocks mainnet by default", () => {
    expect(() => assertTestnetOnly("ethereum-mainnet", false)).toThrow(/blocked/i);
    expect(() => assertTestnetOnly("arc-testnet", false)).not.toThrow();
  });

  it("masks secrets before display", () => {
    expect(maskSecret("0x1234567890abcdef")).toBe("0x1234...cdef");
    expect(maskSecret("short")).toBe("***");
  });
});
