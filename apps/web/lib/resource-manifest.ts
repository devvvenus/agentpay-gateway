import {
  ARC_TESTNET_EIP155,
  ARC_TESTNET_USDC_ADDRESS,
  type AdapterConfig,
  type Provider,
  type Resource,
  usdcToAtomic
} from "@agentpay/shared";

export interface ResourceManifest {
  schemaVersion: "agentpay.resource.v1";
  resourceId: string;
  name: string;
  description: string;
  accessClass: Resource["accessClass"];
  adapterType: Resource["adapterType"];
  provider: {
    id: string;
    name: string;
    sellerWallet: string;
  };
  price: {
    amountUsdc: number;
    atomicAmount: string;
    asset: "USDC";
    decimals: 6;
    network: string;
    tokenAddress: string;
  };
  payment: {
    protocol: "x402";
    endpoint: string;
    methods: Array<"GET" | "POST">;
    challengeStatus: 402;
    idempotencyHeader: "x-idempotency-key";
  };
  fulfillment: {
    upstream: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  };
  capabilities: {
    citations: boolean;
    cacheable: boolean;
    streaming: boolean;
    testable: boolean;
  };
  trust: {
    testnetOnly: true;
    settlementRequired: true;
    replayProtected: true;
    allowedHostsEnforced: true;
  };
  policyHints: {
    expectedValue: number;
    freshnessScore: number;
    confidenceScore: number;
  };
  links: {
    manifest: string;
    pay: string;
    test: string;
  };
}

export function buildResourceManifest(input: {
  resource: Resource;
  provider: Provider;
  config?: AdapterConfig["config"] | undefined;
  baseUrl: string;
}): ResourceManifest {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const pay = `${baseUrl}/api/pay/${encodeURIComponent(input.resource.id)}`;
  const manifest = `${baseUrl}/api/resources/${encodeURIComponent(input.resource.id)}/manifest`;
  const test = `${baseUrl}/api/providers/resources/${encodeURIComponent(input.resource.id)}/test`;
  return {
    schemaVersion: "agentpay.resource.v1",
    resourceId: input.resource.id,
    name: input.resource.name,
    description: input.resource.description,
    accessClass: input.resource.accessClass,
    adapterType: input.resource.adapterType,
    provider: {
      id: input.provider.id,
      name: input.provider.name,
      sellerWallet: input.provider.walletAddress
    },
    price: {
      amountUsdc: input.resource.priceUsdc,
      atomicAmount: usdcToAtomic(input.resource.priceUsdc),
      asset: "USDC",
      decimals: 6,
      network: ARC_TESTNET_EIP155,
      tokenAddress: ARC_TESTNET_USDC_ADDRESS
    },
    payment: {
      protocol: "x402",
      endpoint: pay,
      methods: ["GET", "POST"],
      challengeStatus: 402,
      idempotencyHeader: "x-idempotency-key"
    },
    fulfillment: {
      upstream: upstreamForConfig(input.config ?? {}),
      inputSchema: inputSchemaFor(input.resource.accessClass),
      outputSchema: outputSchemaFor(input.resource.accessClass)
    },
    capabilities: {
      citations: input.resource.accessClass === "publisher_content" || input.resource.accessClass === "mcp_tool",
      cacheable: input.resource.accessClass !== "agent_service",
      streaming: false,
      testable: true
    },
    trust: {
      testnetOnly: true,
      settlementRequired: true,
      replayProtected: true,
      allowedHostsEnforced: true
    },
    policyHints: {
      expectedValue: input.resource.expectedValue,
      freshnessScore: input.resource.freshnessScore,
      confidenceScore: input.resource.confidenceScore
    },
    links: {
      manifest,
      pay,
      test
    }
  };
}

export function baseUrlFromRequest(request: Request) {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

export function upstreamForConfig(config: Record<string, unknown>) {
  const value = config.serverUrl || config.targetUrl || config.baseUrl || config.workerUrl || config.sourceUrl;
  return typeof value === "string" ? value : "configured in provider resource";
}

function inputSchemaFor(accessClass: Resource["accessClass"]) {
  if (accessClass === "mcp_tool") {
    return objectSchema({
      toolName: { type: "string", description: "MCP method or tool name. Use tools/list for discovery." },
      sourceUrl: { type: "string", format: "uri", description: "Allowed source URL for paid_source_fetch." },
      arguments: { type: "object", additionalProperties: true }
    });
  }
  if (accessClass === "publisher_content") {
    return objectSchema({
      feedUrl: { type: "string", format: "uri" },
      articleUrl: { type: "string", format: "uri" }
    });
  }
  if (accessClass === "agent_service") {
    return objectSchema({
      task: { type: "string" },
      payload: { type: "object", additionalProperties: true }
    });
  }
  if (accessClass === "usage_service") {
    return objectSchema({
      prompt: { type: "string" },
      context: { type: "object", additionalProperties: true }
    });
  }
  return objectSchema({
    prompt: { type: "string" }
  });
}

function outputSchemaFor(accessClass: Resource["accessClass"]) {
  const base = {
    status: { type: "string", enum: ["ok", "error"] },
    data: { type: "object", additionalProperties: true },
    metadata: { type: "object", additionalProperties: true }
  };
  if (accessClass === "publisher_content" || accessClass === "mcp_tool") {
    return objectSchema({
      ...base,
      citations: { type: "array", items: { type: "object", additionalProperties: true } }
    });
  }
  return objectSchema(base);
}

function objectSchema(properties: Record<string, unknown>) {
  return {
    type: "object",
    additionalProperties: false,
    properties
  };
}
