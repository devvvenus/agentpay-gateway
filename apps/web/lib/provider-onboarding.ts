import type { AccessClass, AdapterType } from "@agentpay/shared";

export const accessClassToAdapter: Record<AccessClass, AdapterType> = {
  premium_api: "api_proxy",
  mcp_tool: "mcp",
  publisher_content: "rss_paywall",
  agent_service: "agent_delegation",
  usage_service: "inference"
};

export const adapterTypes = new Set<AdapterType>([
  "mcp",
  "api_proxy",
  "agent_delegation",
  "inference",
  "rss_paywall"
]);

export const accessClasses = new Set<AccessClass>(Object.keys(accessClassToAdapter) as AccessClass[]);

export function accessClassForAdapter(adapterType?: AdapterType): AccessClass | undefined {
  if (!adapterType) return undefined;
  const entry = Object.entries(accessClassToAdapter).find(([, candidate]) => candidate === adapterType);
  if (entry) return entry[0] as AccessClass;
  return undefined;
}

export function validateAdapterConfig(adapterType: AdapterType, config: Record<string, unknown>): string | undefined {
  const urlKeysByAdapter: Partial<Record<AdapterType, string[]>> = {
    mcp: ["serverUrl"],
    api_proxy: ["targetUrl"],
    agent_delegation: ["targetUrl"],
    inference: ["targetUrl"],
    rss_paywall: ["targetUrl", "feedUrl", "articleUrl"]
  };
  for (const key of urlKeysByAdapter[adapterType] ?? []) {
    const value = config[key];
    if (typeof value !== "string" || !value) return `config.${key} is required for ${adapterType}`;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return `config.${key} must be http or https`;
    } catch {
      return `config.${key} must be a valid URL`;
    }
  }
  return undefined;
}

export function samplePayloadForAdapter(adapterType: AdapterType, config: Record<string, unknown>) {
  if (adapterType === "mcp") {
    return {
      toolName: "paid_source_fetch",
      sourceUrl: typeof config.sourceUrl === "string" ? config.sourceUrl : "https://docs.x402.org/"
    };
  }
  if (adapterType === "agent_delegation") return { task: "validate paid agent service onboarding" };
  if (adapterType === "inference") return { prompt: "Validate this paid usage-based endpoint for AgentPay." };
  if (adapterType === "rss_paywall") {
    return {
      feedUrl: typeof config.feedUrl === "string" ? config.feedUrl : undefined
    };
  }
  return {};
}
