import { seedData } from "@agentpay/adapters";
import { runAgent } from "@agentpay/agent";
import { AgentPayStore } from "@agentpay/db";

const store = new AgentPayStore(seedData());
const prompt =
  process.argv.slice(2).join(" ") ||
  "Use paid Arc, x402 and Circle sources to explain why agent nanopayments matter. Stay under 0.05 USDC.";

const run = await runAgent({
  prompt,
  budgetUsdc: 0.05,
  store
});

console.log(JSON.stringify(run, null, 2));
