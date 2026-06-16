import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentChallenge, parseUsdcAmount, protect } from "@agentpay/sdk";

describe("agentpay sdk", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an x402 payment challenge for unpaid requests", async () => {
    const handler = protect(
      () => Response.json({ ok: true }),
      {
        price: "0.001 USDC",
        seller: "0xseller",
        resourceId: "premium_docs",
        description: "Premium docs"
      }
    );

    const response = await handler(new Request("http://localhost/premium-docs"));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.resourceId).toBe("premium_docs");
    expect(body.accepts[0].amount).toBe("1000");
    expect(body.accepts[0].payTo).toBe("0xseller");
  });

  it("passes payment context to protected handlers when x402 proof is present", async () => {
    const handler = protect(
      (_request, context) => Response.json({ paymentIdentifier: context.payment.paymentIdentifier }),
      {
        price: 0.002,
        seller: "0xseller",
        resourceId: "paid_api"
      }
    );

    const response = await handler(
      new Request("http://localhost/paid-api", {
        headers: {
          "payment-signature": "signed",
          "x-idempotency-key": "idem_123"
        }
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.paymentIdentifier).toBe("idem_123");
    expect(response.headers.get("x-agentpay-resource")).toBe("paid_api");
  });

  it("checks the verifier before running protected handlers when configured", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "rejected" })));
    const handler = protect(
      () => Response.json({ ok: true }),
      {
        price: 0.002,
        seller: "0xseller",
        resourceId: "paid_api",
        verifierUrl: "http://localhost:9999/verify"
      }
    );

    const response = await handler(
      new Request("http://localhost/paid-api", {
        headers: {
          "payment-signature": "signed"
        }
      })
    );
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.error).toContain("verifier");
  });


  it("parses USDC string amounts", () => {
    expect(parseUsdcAmount("0.0013 USDC")).toBe(0.0013);
    expect(createPaymentChallenge({
      amountUsdc: 0.0013,
      seller: "0xseller",
      resourceId: "r",
      description: "Resource",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000"
    }, "http://localhost/r").accepts[0].amount).toBe("1300");
  });
});
