import { describe, expect, it } from "vitest";
import { scoreResource } from "@agentpay/agent";
import { atomicToUsdc, usdcToAtomic } from "@agentpay/shared";

describe("budget engine", () => {
  it("keeps USDC conversions at 6 decimals", () => {
    expect(usdcToAtomic(0.000001)).toBe("1");
    expect(usdcToAtomic(0.05)).toBe("50000");
    expect(atomicToUsdc("50000")).toBe(0.05);
  });

  it("scores high-value fresh resources above low-value resources", () => {
    const high = scoreResource({
      priceUsdc: 0.001,
      budgetRemainingUsdc: 0.05,
      expectedValue: 0.9,
      freshnessScore: 0.9,
      confidenceScore: 0.9,
      cacheHit: false
    });
    const low = scoreResource({
      priceUsdc: 0.04,
      budgetRemainingUsdc: 0.05,
      expectedValue: 0.2,
      freshnessScore: 0.2,
      confidenceScore: 0.2,
      cacheHit: false
    });
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("boosts cached artifacts because they avoid a new payment", () => {
    const uncached = scoreResource({
      priceUsdc: 0.002,
      budgetRemainingUsdc: 0.01,
      expectedValue: 0.5,
      freshnessScore: 0.5,
      confidenceScore: 0.5,
      cacheHit: false
    });
    const cached = scoreResource({
      priceUsdc: 0.002,
      budgetRemainingUsdc: 0.01,
      expectedValue: 0.5,
      freshnessScore: 0.5,
      confidenceScore: 0.5,
      cacheHit: true
    });
    expect(cached.score).toBeGreaterThan(uncached.score);
  });
});
