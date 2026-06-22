import {
  ARC_TESTNET,
  type AdapterInput,
  type AdapterResult,
  type AdapterType,
  type AccessClass,
  type Citation,
  type PaidExecutionContext,
  type Provider,
  type Quote,
  type Resource,
  cacheKeyFor,
  nowIso,
  usdcToAtomic
} from "@agentpay/shared";

export interface PaidResourceAdapter {
  type: AdapterType;
  quote(input: AdapterInput): Promise<Quote>;
  execute(input: AdapterInput, context: PaidExecutionContext): Promise<AdapterResult>;
}

const LOCAL_DEV_PROVIDER_WALLETS = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003"
] as const;

export const defaultProviders: Provider[] = [
  {
    id: "provider_publisher_content",
    name: "Arc Publisher Content Desk",
    walletAddress: LOCAL_DEV_PROVIDER_WALLETS[0],
    createdAt: nowIso()
  },
  {
    id: "provider_api_services",
    name: "x402 Premium API Provider",
    walletAddress: LOCAL_DEV_PROVIDER_WALLETS[1],
    createdAt: nowIso()
  },
  {
    id: "provider_agent_services",
    name: "AgentPay Specialist Services",
    walletAddress: LOCAL_DEV_PROVIDER_WALLETS[2],
    createdAt: nowIso()
  }
];

export const defaultResources: Resource[] = [
  resource("res_api_proxy", "premium_api", "api_proxy", "x402 Docs Premium API", "A pay-per-request API-style fetch of x402 documentation that agents can unlock through x402 instead of a shared API key.", 0.0015, 0.76, 0.7, 0.78, "provider_api_services"),
  resource("res_mcp_tools", "mcp_tool", "mcp", "Paid MCP Source Tool", "A paid MCP server tool that fetches an allowed source URL and returns source evidence after payment.", 0.0012, 0.74, 0.72, 0.76, "provider_agent_services"),
  resource("res_rss_paywall", "publisher_content", "rss_paywall", "Arc Publisher Article Unlock", "A paid publisher feed or article unlock that returns source evidence and a citation receipt.", 0.0011, 0.86, 0.88, 0.82, "provider_publisher_content"),
  resource("res_agent_delegation", "agent_service", "agent_delegation", "Specialist Research Agent", "A specialist agent paid to complete a bounded procurement or research task for another agent.", 0.0022, 0.8, 0.72, 0.77, "provider_agent_services"),
  resource("res_inference_endpoint", "usage_service", "inference", "Ollama Usage-Based Inference", "A metered local model endpoint purchased only when the task needs stronger reasoning, classification or enrichment.", 0.0028, 0.81, 0.7, 0.78, "provider_agent_services")
];

export const defaultAdapterConfigs = createAdapterConfigs();

export function createAdapterConfigs(env: NodeJS.ProcessEnv = process.env) {
  const workerUrl = env.AGENTPAY_WORKER_URL || "http://localhost:8000";
  const mcpServerUrl = env.AGENTPAY_MCP_SERVER_URL || `${workerUrl.replace(/\/$/, "")}/mcp`;
  const delegationUrl = env.AGENTPAY_DELEGATION_URL || `${workerUrl.replace(/\/$/, "")}/agent/delegate`;
  const inferenceUrl = env.AGENTPAY_INFERENCE_URL || `${workerUrl.replace(/\/$/, "")}/inference/complete`;
  const rssPaywallUrl = env.AGENTPAY_RSS_PAYWALL_URL || `${workerUrl.replace(/\/$/, "")}/rss/paywall`;
  const publisherApiUrl =
    env.AGENTPAY_PUBLISHER_API_URL ||
    `${workerUrl.replace(/\/$/, "")}/premium-api/x402-summary?sourceUrl=${encodeURIComponent("https://docs.x402.org/")}`;

  return [
  {
    resourceId: "res_mcp_tools",
    config: {
      serverUrl: mcpServerUrl,
      sourceUrl: "https://docs.x402.org/",
      tools: [
        {
          name: "paid_source_fetch",
          description: "Fetch a paid source and return a citation receipt."
        },
        {
          name: "paid_access_status",
          description: "Return paid access status and receipt metadata."
        }
      ]
    }
  },
  {
    resourceId: "res_api_proxy",
    config: {
      targetUrl: publisherApiUrl,
      method: "GET"
    }
  },
  {
    resourceId: "res_agent_delegation",
    config: {
      targetUrl: delegationUrl
    }
  },
  {
    resourceId: "res_inference_endpoint",
    config: {
      targetUrl: inferenceUrl,
      model: env.AGENTPAY_INFERENCE_MODEL || "qwen3:14b"
    }
  },
  {
    resourceId: "res_rss_paywall",
    config: {
      targetUrl: rssPaywallUrl,
      feedUrl: "https://www.arc.network/blog/rss.xml",
      articleUrl: "https://www.arc.network/blog/introducing-the-arc-token-whitepaper"
    }
  }
  ];
}

export function seedData(env: NodeJS.ProcessEnv = process.env) {
  const sellerAddress = env.SELLER_ADDRESS || env.BUYER_ADDRESS;
  return {
    providers: defaultProviders.map((provider, index) => ({
      ...provider,
      walletAddress: env[`SELLER_ADDRESS_${index + 1}`] || sellerAddress || provider.walletAddress
    })),
    resources: defaultResources,
    adapterConfigs: createAdapterConfigs(env)
  };
}

export function createAdapter(type: AdapterType): PaidResourceAdapter {
  switch (type) {
    case "mcp":
      return mcpAdapter;
    case "api_proxy":
      return apiProxyAdapter;
    case "agent_delegation":
      return agentDelegationAdapter;
    case "inference":
      return inferenceAdapter;
    case "rss_paywall":
      return rssPaywallAdapter;
    default:
      throw new Error(`Unsupported adapter type: ${type satisfies never}`);
  }
}

export function allowedHostsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const defaults =
    "localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network";
  const runtimeHosts = [
    env.NEXT_PUBLIC_APP_URL,
    env.AGENTPAY_WORKER_URL,
    env.AGENTPAY_PAYER_URL,
    env.AGENTPAY_MCP_SERVER_URL,
    env.AGENTPAY_MEMORY_URL,
    env.AGENTPAY_RSS_PAYWALL_URL,
    env.AGENTPAY_INFERENCE_URL
  ]
    .map(hostFromUrl)
    .filter(Boolean)
    .join(",");
  const raw = [defaults, runtimeHosts, env.AGENTPAY_ALLOWED_HOSTS].filter(Boolean).join(",");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function hostFromUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

const baseQuote = async (input: AdapterInput): Promise<Quote> => ({
  resourceId: input.resource.id,
  adapterType: input.resource.adapterType,
  amountUsdc: input.resource.priceUsdc,
  atomicAmount: usdcToAtomic(input.resource.priceUsdc),
  network: ARC_TESTNET,
  estimatedLatencyMs: 700,
  rationale: `${input.resource.adapterType} adapter quote for ${input.resource.name}`
});

const mcpAdapter: PaidResourceAdapter = {
  type: "mcp",
  quote: baseQuote,
  async execute(input, context) {
    const tools = Array.isArray(input.config.tools) ? input.config.tools : [];
    const toolName = readString(input.payload, "toolName") || "tools/list";
    const serverUrl = readOptionalConfigString(input.config, "serverUrl");
    if (serverUrl) {
      assertAllowedUrl(serverUrl, context.allowedHosts);
      const method = toolName === "tools/list" ? "tools/list" : "tools/call";
      const response = await fetchWithTimeout(serverUrl, {
        method: "POST",
        headers: gatewayHeaders(input.resource.id, context.payment.paymentIdentifier),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: context.payment.paymentIdentifier,
          method,
          params:
            method === "tools/call"
              ? {
                  name: toolName,
                  arguments: input.payload
                }
              : {}
        })
      });
      const data = await response.json();
      const citation = citationFromMcpResult(input.resource.id, data, context.payment.paymentIdentifier, context.payment.amountUsdc);
      return ok(input, {
        serverUrl,
        method,
        data
      }, citation ? [citation] : []);
    }
    return ok(input, {
      method: toolName,
      tools,
      result:
        toolName === "tools/list"
          ? tools
          : {
              message: `MCP tool ${toolName} executed after paid access.`,
              prompt: input.prompt,
              paidBy: context.payment.paymentIdentifier
            }
    });
  }
};

const apiProxyAdapter: PaidResourceAdapter = {
  type: "api_proxy",
  quote: baseQuote,
  async execute(input, context) {
    const targetUrl = readConfigString(input.config, "targetUrl");
    const method = readOptionalConfigString(input.config, "method") || "GET";
    assertAllowedUrl(targetUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method,
      headers: gatewayHeaders(input.resource.id, context.payment.paymentIdentifier)
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.text();
    return ok(input, {
      targetUrl,
      status: response.status,
      contentType,
      data: clip(data)
    });
  }
};

const agentDelegationAdapter: PaidResourceAdapter = {
  type: "agent_delegation",
  quote: baseQuote,
  async execute(input, context) {
    const targetUrl = readConfigString(input.config, "targetUrl");
    const prompt = input.prompt || readString(input.payload, "prompt") || "Arc x402 nanopayment research task";
    assertAllowedUrl(targetUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: gatewayHeaders(input.resource.id, context.payment.paymentIdentifier),
      body: JSON.stringify({
        prompt,
        payload: input.payload,
        paymentIdentifier: context.payment.paymentIdentifier
      })
    });
    const data = await response.json().catch(async () => ({ text: await response.text() }));
    return ok(input, { status: response.status, data });
  }
};

const inferenceAdapter: PaidResourceAdapter = {
  type: "inference",
  quote: baseQuote,
  async execute(input, context) {
    const targetUrl = readConfigString(input.config, "targetUrl");
    const model = readConfigString(input.config, "model") || "qwen3:14b";
    const prompt = input.prompt || readString(input.payload, "prompt") || "Arc x402 nanopayment reasoning task";
    assertAllowedUrl(targetUrl, context.allowedHosts);
    const response = await fetchWithTimeout(
      targetUrl,
      {
        method: "POST",
        headers: gatewayHeaders(input.resource.id, context.payment.paymentIdentifier),
        body: JSON.stringify({
          prompt,
          model,
          paymentIdentifier: context.payment.paymentIdentifier
        })
      },
      envNumber("AGENTPAY_INFERENCE_PROVIDER_TIMEOUT_SECONDS", 90) * 1000
    );
    const data = await response.json().catch(async () => ({ text: await response.text() }));
    return ok(input, { status: response.status, data });
  }
};

const rssPaywallAdapter: PaidResourceAdapter = {
  type: "rss_paywall",
  quote: baseQuote,
  async execute(input, context) {
    const targetUrl = readConfigString(input.config, "targetUrl");
    const feedUrl = readString(input.payload, "feedUrl") || readConfigString(input.config, "feedUrl");
    const articleUrl = readConfigString(input.config, "articleUrl");
    assertAllowedUrl(targetUrl, context.allowedHosts);
    assertAllowedUrl(feedUrl, context.allowedHosts);
    assertAllowedUrl(articleUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: gatewayHeaders(input.resource.id, context.payment.paymentIdentifier),
      body: JSON.stringify({
        feedUrl,
        articleUrl,
        paymentIdentifier: context.payment.paymentIdentifier
      })
    });
    const data = await response.json().catch(async () => ({ text: await response.text() }));
    const citation: Citation = {
        resourceId: input.resource.id,
        title: readNestedString(data, ["article", "title"]) || "Paid publisher article",
        sourceUrl: readNestedString(data, ["article", "url"]) || articleUrl,
        citationReceipt: {
          paymentIdentifier: context.payment.paymentIdentifier,
          amountUsdc: context.payment.amountUsdc
        }
    };
    const quote = readNestedString(data, ["article", "excerpt"]);
    if (quote) citation.quote = quote.slice(0, 240);
    return ok(input, { status: response.status, data }, [citation]);
  }
};

function resource(
  id: string,
  accessClass: AccessClass,
  adapterType: AdapterType,
  name: string,
  description: string,
  priceUsdc: number,
  expectedValue: number,
  freshnessScore: number,
  confidenceScore: number,
  providerId: string
): Resource {
  return {
    id,
    providerId,
    name,
    description,
    accessClass,
    adapterType,
    priceUsdc,
    expectedValue,
    freshnessScore,
    confidenceScore,
    enabled: true,
    createdAt: nowIso()
  };
}

function ok(input: AdapterInput, data: unknown, citations: Citation[] = []) {
  return {
    adapterType: input.resource.adapterType,
    resourceId: input.resource.id,
    status: "ok",
    data,
    citations,
    metadata: {
      cacheKey: input.cacheKey || cacheKeyFor(input.resource.id, input.payload),
      executedAt: nowIso()
    }
  } satisfies AdapterResult;
}

function gatewayHeaders(resourceId: string, paymentIdentifier: string): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-agentpay-payment-id": paymentIdentifier,
    "x-agentpay-resource-id": resourceId
  };
  if (process.env.AGENTPAY_WORKER_GATEWAY_SECRET) {
    headers["x-agentpay-worker-key"] = process.env.AGENTPAY_WORKER_GATEWAY_SECRET;
  }
  return headers;
}

function readConfigString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing adapter config: ${key}`);
  }
  return value;
}

function readOptionalConfigString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readString(payload: unknown, key: string): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNestedString(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function citationFromMcpResult(
  resourceId: string,
  data: unknown,
  paymentIdentifier: string,
  amountUsdc: number
): Citation | undefined {
  const title = readNestedString(data, ["result", "structuredContent", "title"]);
  const sourceUrl = readNestedString(data, ["result", "structuredContent", "sourceUrl"]);
  if (!title && !sourceUrl) return undefined;
  const citation: Citation = {
    resourceId,
    title: title || "Paid MCP source",
    ...(sourceUrl ? { sourceUrl } : {}),
    citationReceipt: {
      paymentIdentifier,
      amountUsdc
    }
  };
  const quote = readNestedString(data, ["result", "structuredContent", "excerpt"]);
  if (quote) citation.quote = quote.slice(0, 240);
  return citation;
}

function assertAllowedUrl(rawUrl: string, allowedHosts: string[]): void {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Blocked unsupported URL protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error("Blocked URL with credentials");
  }
  const host = url.hostname.toLowerCase();
  const allowed = allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
  if (!allowed) {
    throw new Error(`Blocked upstream host: ${host}`);
  }
}

function envNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Upstream ${url} returned ${response.status}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function clip(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}
