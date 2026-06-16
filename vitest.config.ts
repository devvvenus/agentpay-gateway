import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@agentpay/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@agentpay/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@agentpay/payments": new URL("./packages/payments/src/index.ts", import.meta.url).pathname,
      "@agentpay/adapters": new URL("./packages/adapters/src/index.ts", import.meta.url).pathname,
      "@agentpay/agent": new URL("./packages/agent/src/index.ts", import.meta.url).pathname,
      "@agentpay/sdk": new URL("./packages/sdk/src/index.ts", import.meta.url).pathname
    }
  }
});
