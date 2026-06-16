import { describe, expect, it } from "vitest";
import { seedData } from "@agentpay/adapters";
import { runAgent } from "@agentpay/agent";
import { AgentPayStore } from "@agentpay/db";

describe("agent run", () => {
  it("skips resources that do not fit the budget", async () => {
    const store = new AgentPayStore(seedData());
    const run = await runAgent({
      prompt: "Use only very cheap paid resources",
      budgetUsdc: 0.0001,
      store,
      allowedAdapterTypes: ["mcp", "docs_source"],
      allowedHosts: ["localhost", "127.0.0.1", "docs.arc.io"]
    });

    expect(run.status).toBe("completed");
    expect(run.totalSpendUsdc).toBe(0);
    expect(run.output.decisions.length).toBeGreaterThan(0);
    expect(run.output.skippedSources.length).toBeGreaterThan(0);
  });
});
