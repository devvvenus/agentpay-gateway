import { describe, expect, it } from "vitest";
import { seedData } from "@agentpay/adapters";
import { runAgent } from "@agentpay/agent";
import { AgentPayStore } from "@agentpay/db";
import { nowIso } from "@agentpay/shared";

describe("agent run", () => {
  it("skips resources that do not fit the budget", async () => {
    const store = new AgentPayStore(seedData());
    const run = await runAgent({
      prompt: "Use only very cheap paid resources",
      budgetUsdc: 0.0001,
      store,
      allowedAdapterTypes: ["mcp", "rss_paywall"],
      allowedHosts: ["localhost", "127.0.0.1", "www.arc.network"]
    });

    expect(run.status).toBe("completed");
    expect(run.totalSpendUsdc).toBe(0);
    expect(run.output.decisions.length).toBeGreaterThan(0);
    expect(run.output.skippedSources.length).toBeGreaterThan(0);
  });

  it("applies payment policy limits before buying resources", async () => {
    const store = new AgentPayStore(seedData());
    const run = await runAgent({
      prompt: "Use paid resources for Arc publisher citations",
      budgetUsdc: 0.05,
      store,
      allowedHosts: ["localhost", "127.0.0.1", "www.arc.network"],
      policy: {
        maxSpendUsdc: 0.01,
        maxPricePerCallUsdc: 0.001,
        requireCitations: true,
        cacheMode: "refresh"
      }
    });

    expect(run.status).toBe("completed");
    expect(run.output.policy).toMatchObject({
      maxSpendUsdc: 0.01,
      maxPricePerCallUsdc: 0.001,
      requireCitations: true,
      cacheMode: "refresh"
    });
    expect(run.totalSpendUsdc).toBeLessThanOrEqual(0.01);
    expect(run.output.payments.every((payment) => payment.amountUsdc <= 0.0015)).toBe(true);
    expect(run.output.decisions.some((decision) => decision.reason.includes("citations are required"))).toBe(true);
    expect(run.output.decisions.some((decision) => decision.reason.includes("max price per call"))).toBe(true);
  });

  it("treats paid MCP source tools as citation-capable resources", async () => {
    const store = new AgentPayStore(seedData());
    const resource = store.getResource("res_mcp_tools")!;
    const provider = store.getProvider(resource.providerId)!;
    const run = await runAgent({
      prompt: "Use a paid MCP source citation for Arc resource access",
      budgetUsdc: 0.01,
      store,
      allowedResourceIds: [resource.id],
      allowedHosts: ["localhost", "127.0.0.1", "docs.x402.org"],
      policy: {
        requireCitations: true,
        cacheMode: "refresh",
        minScore: 0
      },
      executePaidResource: async () => ({
        payment: {
          id: "pevt_mcp_citation",
          resourceId: resource.id,
          adapterType: resource.adapterType,
          amountUsdc: resource.priceUsdc,
          network: "eip155:5042002",
          buyerWallet: "0x3700000000000000000000000000000000001e28",
          sellerWallet: provider.walletAddress,
          paymentIdentifier: "mcp_citation_payment",
          txOrSettlementRef: "eip155:5042002:mcp_citation_payment",
          status: "settled",
          metadata: {},
          createdAt: nowIso()
        },
        result: {
          adapterType: resource.adapterType,
          resourceId: resource.id,
          status: "ok",
          data: { source: "mcp" },
          citations: [
            {
              resourceId: resource.id,
              title: "Paid MCP source",
              sourceUrl: "https://docs.x402.org/",
              citationReceipt: {
                paymentIdentifier: "mcp_citation_payment",
                amountUsdc: resource.priceUsdc
              }
            }
          ],
          metadata: {}
        }
      })
    });

    expect(run.output.payments).toHaveLength(1);
    expect(run.output.paidCitations).toHaveLength(1);
    expect(run.output.decisions.some((decision) => decision.reason.includes("citations are required"))).toBe(false);
  });
});
