import {
  ARC_TESTNET,
  type AdapterInput,
  type AdapterResult,
  type AdapterType,
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

const LOCAL_FALLBACK_PROVIDER_WALLETS = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003"
] as const;

export const defaultProviders: Provider[] = [
  {
    id: "provider_arc_docs",
    name: "Arc Docs Publisher",
    walletAddress: LOCAL_FALLBACK_PROVIDER_WALLETS[0],
    createdAt: nowIso()
  },
  {
    id: "provider_creator_research",
    name: "Creator Research Desk",
    walletAddress: LOCAL_FALLBACK_PROVIDER_WALLETS[1],
    createdAt: nowIso()
  },
  {
    id: "provider_data_tools",
    name: "Paid Data and Tool Provider",
    walletAddress: LOCAL_FALLBACK_PROVIDER_WALLETS[2],
    createdAt: nowIso()
  }
];

export const defaultResources: Resource[] = [
  resource("res_mcp_tools", "mcp", "Paid Agent Tool Call", "A paid MCP tool call the research agent can buy when it needs specialized work.", 0.0012, 0.72, 0.7, 0.75, "provider_data_tools"),
  resource("res_api_proxy", "api_proxy", "Paid Publisher API", "A pay-per-request publisher/API endpoint unlocked through x402-style access.", 0.0015, 0.66, 0.65, 0.7, "provider_creator_research"),
  resource("res_datasette", "dataset", "Paid Creator Dataset", "A creator or publisher dataset queried per task instead of sold as a subscription.", 0.002, 0.78, 0.6, 0.72, "provider_data_tools"),
  resource("res_crawl4ai", "crawl", "Paid Article Crawl", "A paid article/source crawl converted to clean Markdown for agent research.", 0.0025, 0.82, 0.82, 0.76, "provider_creator_research"),
  resource("res_agent_delegation", "agent_delegation", "Paid Agent-to-Agent Delegation", "A specialist agent paid to complete a small delegated research or analysis task.", 0.0022, 0.8, 0.72, 0.77, "provider_data_tools"),
  resource("res_memory_retrieval", "memory_retrieval", "Paid Memory / Vector Retrieval", "A higher-quality memory or vector retrieval source purchased only when it improves answer confidence.", 0.0014, 0.79, 0.84, 0.76, "provider_data_tools"),
  resource("res_inference_endpoint", "inference", "Paid Inference / Model Endpoint", "A paid model endpoint used when the task needs stronger reasoning or classification.", 0.0028, 0.81, 0.7, 0.78, "provider_data_tools"),
  resource("res_rss_paywall", "rss_paywall", "Publisher/RSS Paywall", "A paid publisher feed or article unlock that creates a citation receipt for creator monetization.", 0.0011, 0.83, 0.86, 0.8, "provider_creator_research"),
  resource("res_searxng", "search", "Paid Research Search", "A paid search query used only when expected value beats the query cost.", 0.001, 0.74, 0.88, 0.67, "provider_creator_research"),
  resource("res_docs_source", "docs_source", "Paid Arc Docs Citation", "A paid source fetch that returns a citation receipt and pays the source provider.", 0.0008, 0.86, 0.8, 0.82, "provider_arc_docs")
];

export const defaultAdapterConfigs = createAdapterConfigs();

export function createAdapterConfigs(env: NodeJS.ProcessEnv = process.env) {
  const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const datasetteBaseUrl = env.DATASETTE_BASE_URL || env.DATASSETTE_BASE_URL || "http://localhost:8001";
  const searxngBaseUrl = env.SEARXNG_BASE_URL || "http://localhost:8080";
  const workerUrl = env.AGENTPAY_WORKER_URL || "http://localhost:8000";
  const mcpServerUrl = env.AGENTPAY_MCP_SERVER_URL || `${workerUrl.replace(/\/$/, "")}/mcp`;
  const delegationUrl = env.AGENTPAY_DELEGATION_URL || `${workerUrl.replace(/\/$/, "")}/agent/delegate`;
  const memoryUrl = env.AGENTPAY_MEMORY_URL || `${workerUrl.replace(/\/$/, "")}/memory/retrieve`;
  const inferenceUrl = env.AGENTPAY_INFERENCE_URL || `${workerUrl.replace(/\/$/, "")}/inference/complete`;
  const rssPaywallUrl = env.AGENTPAY_RSS_PAYWALL_URL || `${workerUrl.replace(/\/$/, "")}/rss/paywall`;
  const publisherApiUrl = env.AGENTPAY_PUBLISHER_API_URL || "https://docs.x402.org/";
  const docsSourceUrl = env.AGENTPAY_DOCS_SOURCE_URL || "https://docs.arc.io/";

  return [
  {
    resourceId: "res_mcp_tools",
    config: {
      serverUrl: mcpServerUrl,
      tools: [
        {
          name: "paid_source_fetch",
          description: "Fetch a paid source and return a citation receipt."
        },
        {
          name: "paid_dataset_query",
          description: "Run a paid dataset query through AgentPay."
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
    resourceId: "res_datasette",
    config: {
      baseUrl: datasetteBaseUrl,
      database: "demo",
      sql: "select 'Arc nanopayment dataset' as topic, 10 as adapters, 0.05 as demo_budget"
    }
  },
  {
    resourceId: "res_crawl4ai",
    config: {
      workerUrl,
      url: "https://developers.circle.com/gateway/nanopayments"
    }
  },
  {
    resourceId: "res_agent_delegation",
    config: {
      targetUrl: delegationUrl
    }
  },
  {
    resourceId: "res_memory_retrieval",
    config: {
      targetUrl: memoryUrl,
      namespace: "arc-nanopayments"
    }
  },
  {
    resourceId: "res_inference_endpoint",
    config: {
      targetUrl: inferenceUrl,
      model: env.AGENTPAY_INFERENCE_MODEL || "agentpay-reasoner"
    }
  },
  {
    resourceId: "res_rss_paywall",
    config: {
      targetUrl: rssPaywallUrl,
      feedUrl: "https://www.arc.network/blog/rss.xml",
      fallbackUrl: "https://www.arc.network/blog/introducing-the-arc-token-whitepaper"
    }
  },
  {
    resourceId: "res_searxng",
    config: {
      baseUrl: searxngBaseUrl,
      defaultQuery: "Arc Circle x402 nanopayments AI agents"
    }
  },
  {
    resourceId: "res_docs_source",
    config: {
      sourceUrl: docsSourceUrl,
      title: "Arc Docs"
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
    case "dataset":
      return datasetAdapter;
    case "crawl":
      return crawlAdapter;
    case "agent_delegation":
      return agentDelegationAdapter;
    case "memory_retrieval":
      return memoryRetrievalAdapter;
    case "inference":
      return inferenceAdapter;
    case "rss_paywall":
      return rssPaywallAdapter;
    case "search":
      return searchAdapter;
    case "docs_source":
      return docsSourceAdapter;
    default:
      throw new Error(`Unsupported adapter type: ${type satisfies never}`);
  }
}

export function allowedHostsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const defaults =
    "localhost,127.0.0.1,docs.arc.io,developers.circle.com,docs.x402.org,lepton.thecanteenapp.com,www.arc.network,arc.network";
  const raw = [defaults, env.AGENTPAY_ALLOWED_HOSTS].filter(Boolean).join(",");
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean)
    )
  );
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
        headers: { "content-type": "application/json" },
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
      return ok(input, {
        serverUrl,
        method,
        data
      });
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
    const response = await fetchWithTimeout(targetUrl, { method });
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

const datasetAdapter: PaidResourceAdapter = {
  type: "dataset",
  quote: baseQuote,
  async execute(input, context) {
    const baseUrl = readConfigString(input.config, "baseUrl");
    const database = readConfigString(input.config, "database") || "demo";
    const sql = readString(input.payload, "sql") || readConfigString(input.config, "sql");
    const url = `${baseUrl.replace(/\/$/, "")}/${encodeURIComponent(database)}.json?sql=${encodeURIComponent(sql)}&_shape=array`;
    assertAllowedUrl(url, context.allowedHosts);
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return ok(input, { url, rows: data });
  }
};

const crawlAdapter: PaidResourceAdapter = {
  type: "crawl",
  quote: baseQuote,
  async execute(input, context) {
    const workerUrl = readConfigString(input.config, "workerUrl");
    const url = readString(input.payload, "url") || readConfigString(input.config, "url");
    assertAllowedUrl(workerUrl, context.allowedHosts);
    assertAllowedUrl(url, context.allowedHosts);
    const response = await fetchWithTimeout(`${workerUrl.replace(/\/$/, "")}/crawl`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
    return ok(input, await response.json());
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
      headers: { "content-type": "application/json" },
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

const memoryRetrievalAdapter: PaidResourceAdapter = {
  type: "memory_retrieval",
  quote: baseQuote,
  async execute(input, context) {
    const targetUrl = readConfigString(input.config, "targetUrl");
    const namespace = readConfigString(input.config, "namespace") || "agentpay";
    assertAllowedUrl(targetUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: readString(input.payload, "query") || input.prompt || "Arc nanopayments",
        namespace,
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
    const model = readConfigString(input.config, "model") || "agentpay-reasoner";
    const prompt = input.prompt || readString(input.payload, "prompt") || "Arc x402 nanopayment reasoning task";
    assertAllowedUrl(targetUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        model,
        paymentIdentifier: context.payment.paymentIdentifier
      })
    });
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
    const fallbackUrl = readConfigString(input.config, "fallbackUrl");
    assertAllowedUrl(targetUrl, context.allowedHosts);
    assertAllowedUrl(feedUrl, context.allowedHosts);
    assertAllowedUrl(fallbackUrl, context.allowedHosts);
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feedUrl,
        fallbackUrl,
        paymentIdentifier: context.payment.paymentIdentifier
      })
    });
    const data = await response.json().catch(async () => ({ text: await response.text() }));
    const citation: Citation = {
        resourceId: input.resource.id,
        title: readNestedString(data, ["article", "title"]) || "Paid publisher article",
        sourceUrl: readNestedString(data, ["article", "url"]) || fallbackUrl,
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

const searchAdapter: PaidResourceAdapter = {
  type: "search",
  quote: baseQuote,
  async execute(input, context) {
    const baseUrl = readConfigString(input.config, "baseUrl");
    const query = readString(input.payload, "query") || input.prompt || readConfigString(input.config, "defaultQuery");
    const url = `${baseUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(query)}&format=json`;
    assertAllowedUrl(url, context.allowedHosts);
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const resultCount = Array.isArray(data.results) ? data.results.length : 0;
    return ok(input, {
      query,
      resultCount,
      qualityScore: Math.min(1, resultCount / 10),
      results: Array.isArray(data.results) ? data.results.slice(0, 5) : data
    });
  }
};

const docsSourceAdapter: PaidResourceAdapter = {
  type: "docs_source",
  quote: baseQuote,
  async execute(input, context) {
    const sourceUrl = readString(input.payload, "sourceUrl") || readConfigString(input.config, "sourceUrl");
    assertAllowedUrl(sourceUrl, context.allowedHosts);
    const response = await fetchWithTimeout(sourceUrl);
    const html = await response.text();
    const title = readConfigString(input.config, "title") || sourceUrl;
    const text = htmlToText(html);
    return ok(input, {
      title,
      sourceUrl,
      excerpt: text.slice(0, 1600),
      citationReceipt: {
        resourceId: input.resource.id,
        paidAt: context.now,
        paymentIdentifier: context.payment.paymentIdentifier,
        sourceUrl
      }
    }, [
      {
        resourceId: input.resource.id,
        title,
        sourceUrl,
        quote: text.slice(0, 240),
        citationReceipt: {
          paymentIdentifier: context.payment.paymentIdentifier,
          amountUsdc: context.payment.amountUsdc
        }
      }
    ]);
  }
};

function resource(
  id: string,
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

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}
