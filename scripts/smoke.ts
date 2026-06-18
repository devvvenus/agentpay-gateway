import { seedData } from "@agentpay/adapters";
import { AgentPayStore } from "@agentpay/db";
import { PaymentService } from "@agentpay/payments";

const smokeEnv: NodeJS.ProcessEnv = {
  SELLER_ADDRESS: "0x1111111111111111111111111111111111111111",
  BUYER_ADDRESS: "0x2222222222222222222222222222222222222222"
};
const store = new AgentPayStore(seedData(smokeEnv));
const resources = store.listResources();
if (resources.length !== 5) {
  throw new Error(`Expected 5 visible access-class resources, got ${resources.length}`);
}

const resource = resources[0];
const provider = store.getProvider(resource.providerId);
if (!provider) {
  throw new Error("Provider seed missing");
}

const paymentService = new PaymentService(store, {
  network: "eip155:5042002",
  mode: "x402",
  sellerAddress: smokeEnv.SELLER_ADDRESS,
  buyerAddress: smokeEnv.BUYER_ADDRESS,
  allowMainnet: false,
  appUrl: "http://localhost:3000",
  facilitatorUrl: "http://localhost:9999/verify"
});
const challenge = paymentService.challenge(resource, `http://localhost:3000/api/pay/${resource.id}`, provider);
if (challenge.status !== 402) {
  throw new Error("Expected 402 challenge");
}
if (challenge.accepts[0]?.payTo !== provider.walletAddress) {
  throw new Error("Expected provider wallet in x402 challenge");
}

console.log("AgentPay smoke passed");
