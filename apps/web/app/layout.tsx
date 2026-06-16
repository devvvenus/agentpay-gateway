import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AgentPay Gateway",
  description: "Arc testnet nanopayment orchestration for AI agents"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
