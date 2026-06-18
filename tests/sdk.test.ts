import { afterEach, describe, expect, it, vi } from "vitest";
import { assertResourceManifest, createAgentPayClient, createPaymentChallenge, parseUsdcAmount, protect } from "@agentpay/sdk";

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
        accessClass: "publisher_content",
        resourceId: "premium_docs",
        description: "Premium docs"
      }
    );

    const response = await handler(new Request("http://localhost/premium-docs"));
    const body = await response.json();

    expect(response.status).toBe(402);
    expect(body.resourceId).toBe("premium_docs");
    expect(body.accessClass).toBe("publisher_content");
    expect(body.accepts[0].amount).toBe("1000");
    expect(body.accepts[0].payTo).toBe("0xseller");
    expect(body.accepts[0].extra.accessClass).toBe("publisher_content");
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

  it("does not fulfill protected handlers in production without a verifier", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    const handler = protect(
      () => Response.json({ ok: true }),
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

    expect(response.status).toBe(503);
    expect(body.error).toContain("verifierUrl");
    vi.stubEnv("NODE_ENV", previousNodeEnv);
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

  it("lists resources and requests protected resources as an external agent client", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const manifestFixture = {
      schemaVersion: "agentpay.resource.v1",
      resourceId: "res_api",
      name: "Premium API Call",
      description: "Paid API",
      accessClass: "premium_api",
      adapterType: "api_proxy",
      provider: { id: "provider_api", name: "Provider", sellerWallet: "0xseller" },
      price: {
        amountUsdc: 0.001,
        atomicAmount: "1000",
        asset: "USDC",
        decimals: 6,
        network: "eip155:5042002",
        tokenAddress: "0x3600000000000000000000000000000000000000"
      },
      payment: {
        protocol: "x402",
        endpoint: "https://agentpay.example/api/pay/res_api",
        methods: ["GET", "POST"],
        challengeStatus: 402,
        idempotencyHeader: "x-idempotency-key"
      },
      fulfillment: { upstream: "https://docs.x402.org/", inputSchema: {}, outputSchema: {} },
      capabilities: { citations: false, cacheable: true, streaming: false, testable: true },
      trust: {
        testnetOnly: true,
        settlementRequired: true,
        replayProtected: true,
        allowedHostsEnforced: true
      },
      policyHints: { expectedValue: 0.7, freshnessScore: 0.7, confidenceScore: 0.7 },
      links: {
        manifest: "https://agentpay.example/api/resources/res_api/manifest",
        pay: "https://agentpay.example/api/pay/res_api",
        test: "https://agentpay.example/api/providers/resources/res_api/test"
      }
    } as const;
    const client = createAgentPayClient({
      baseUrl: "https://agentpay.example/",
      fetch: (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith("/api/resources")) {
          return Response.json({
            resources: [
              {
                id: "res_api",
                name: "Premium API Call",
                accessClass: "premium_api",
                priceUsdc: 0.001,
                providerId: "provider_api"
              }
            ]
          });
        }
        if (String(url).endsWith("/api/resources/manifests")) {
          return Response.json({
            manifests: [manifestFixture]
          });
        }
        if (String(url).endsWith("/api/resources/res_api/manifest")) {
          return Response.json(manifestFixture);
        }
        if (String(url).endsWith("/api/pay/res_api") && !(init?.headers as Headers | undefined)?.get("payment-signature")) {
          return Response.json(
            {
              status: 402,
              x402Version: 2,
              resourceId: "res_api",
              adapterType: "api_proxy",
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:5042002",
                  asset: "0x3600000000000000000000000000000000000000",
                  amount: "1000",
                  maxAmountRequired: "1000",
                  payTo: "0xseller",
                  resource: "https://agentpay.example/api/pay/res_api",
                  description: "Paid API"
                }
              ]
            },
            { status: 402 }
          );
        }
        return Response.json({
          payment: {
            id: "pevt_sdk",
            resourceId: "res_api",
            adapterType: "api_proxy",
            amountUsdc: 0.001,
            network: "eip155:5042002",
            buyerWallet: "0xbuyer",
            sellerWallet: "0xseller",
            paymentIdentifier: (init?.headers as Headers | undefined)?.get("x-idempotency-key") ?? "idem",
            status: "settled",
            metadata: {},
            createdAt: "2026-06-18T00:00:00.000Z"
          },
          result: {
            adapterType: "api_proxy",
            resourceId: "res_api",
            status: "ok",
            data: { paid: true },
            citations: [],
            metadata: {}
          }
        });
      }) as typeof fetch
    });

    const resources = await client.listResources();
    const manifests = await client.listResourceManifests();
    const manifest = await client.getResourceManifest("res_api");
    const challenge = await client.getPaymentChallenge({ resourceId: "res_api" });
    const prepared = await client.prepareResourcePurchase({ resourceId: "res_api" });
    const result = await client.requestResource({
      resourceId: "res_api",
      paymentProof: "signed-proof",
      idempotencyKey: "idem_sdk"
    });
    const manifestResult = await client.requestManifestResource({
      manifest,
      paymentProof: "signed-proof-2",
      idempotencyKey: "idem_manifest"
    });

    expect(resources[0]?.accessClass).toBe("premium_api");
    expect(manifests[0]?.payment.protocol).toBe("x402");
    expect(manifest.resourceId).toBe("res_api");
    expect(challenge.accepts[0]?.amount).toBe("1000");
    expect(prepared.sellerWallet).toBe("0xseller");
    expect(prepared.paymentEndpoint).toBe("https://agentpay.example/api/pay/res_api");
    expect(result.ok).toBe(true);
    expect(result.ok ? result.result.data : null).toEqual({ paid: true });
    expect(manifestResult.ok).toBe(true);
    expect(manifestResult.ok ? manifestResult.payment.paymentIdentifier : null).toBe("idem_manifest");
    expect(calls[6]?.url).toBe("https://agentpay.example/api/pay/res_api");
    expect((calls[6]?.init?.headers as Headers).get("payment-signature")).toBe("signed-proof");
    expect((calls[6]?.init?.headers as Headers).get("x-idempotency-key")).toBe("idem_sdk");
    expect((calls[7]?.init?.headers as Headers).get("payment-signature")).toBe("signed-proof-2");
    expect((calls[7]?.init?.headers as Headers).get("x-idempotency-key")).toBe("idem_manifest");
  });

  it("rejects invalid resource manifests before purchase", () => {
    expect(() =>
      assertResourceManifest({
        schemaVersion: "agentpay.resource.v1",
        resourceId: "bad",
        payment: { protocol: "http" }
      } as never)
    ).toThrow(/payment protocol/i);
  });

  it("parses USDC string amounts", () => {
    expect(parseUsdcAmount("0.0013 USDC")).toBe(0.0013);
    expect(createPaymentChallenge({
      amountUsdc: 0.0013,
      seller: "0xseller",
      accessClass: "premium_api",
      resourceId: "r",
      description: "Resource",
      network: "eip155:5042002",
      asset: "0x3600000000000000000000000000000000000000"
    }, "http://localhost/r").accepts[0].amount).toBe("1300");
  });
});
