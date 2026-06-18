import { ARC_TESTNET_USDC_ADDRESS } from "@agentpay/shared";
import { loadPaymentConfig } from "@agentpay/payments";
import { getStore } from "../../../../lib/runtime";

export async function GET() {
  const store = await getStore();
  const config = loadPaymentConfig();
  const latestPayment = store.listPaymentEvents()[0] ?? null;
  const receipts = store.listReceipts();
  const earnings = store.listProviderEarnings();
  const latestReceipt =
    (latestPayment ? receipts.find((receipt) => receipt.paymentEventId === latestPayment.id) : undefined) ??
    receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null;
  const latestEarning =
    (latestPayment ? earnings.find((earning) => earning.paymentEventId === latestPayment.id) : undefined) ??
    earnings.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null;

  return Response.json({
    paymentMode: config.mode,
    network: config.network,
    asset: {
      symbol: "USDC",
      decimals: 6,
      address: ARC_TESTNET_USDC_ADDRESS
    },
    buyerWallet: config.buyerAddress,
    sellerWallet: config.sellerAddress,
    gatewayBalanceHintUsdc: process.env.CIRCLE_GATEWAY_BALANCE_HINT_USDC || null,
    latestPayment,
    latestReceipt,
    latestEarning,
    cliExample:
      "circle services pay http://localhost:3000/api/pay/res_mcp_tools --address 0xc37ecf9a0353b93ac2fa1b4776403eaa5b391e28 --chain ARC-TESTNET --max-amount 0.01 --output json"
  });
}
