export async function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "AgentPay Gateway",
      version: "0.1.0",
      description:
        "Budget-aware purchasing layer for AI agents across paid tools, APIs, datasets, crawls, delegated agents, memory, inference, RSS paywalls, search and source citations."
    },
    servers: [{ url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000" }],
    paths: {
      "/api/agent/runs": {
        post: {
          operationId: "startAgentRun",
          summary: "Start a paid agent run",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["prompt", "budgetUsdc"],
                  properties: {
                    prompt: { type: "string" },
                    budgetUsdc: { type: "number" },
                    allowedAdapterTypes: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: [
                          "mcp",
                          "api_proxy",
                          "dataset",
                          "crawl",
                          "agent_delegation",
                          "memory_retrieval",
                          "inference",
                          "rss_paywall",
                          "search",
                          "docs_source"
                        ]
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            "201": { description: "Agent run completed" }
          }
        }
      },
      "/api/pay/{resourceId}": {
        get: {
          operationId: "getPaidResource",
          summary: "Access a paid resource. Returns 402 until paid.",
          parameters: [{ name: "resourceId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Paid resource result" },
            "402": { description: "x402 payment challenge" }
          }
        },
        post: {
          operationId: "postPaidResource",
          summary: "Execute a paid resource. Returns 402 until paid.",
          parameters: [{ name: "resourceId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Paid resource result" },
            "402": { description: "x402 payment challenge" }
          }
        }
      },
      "/mcp": {
        post: {
          operationId: "paidMcpGateway",
          summary: "MCP JSON-RPC endpoint for tools/list and paid tools/call.",
          responses: {
            "200": { description: "MCP response" },
            "402": { description: "x402 payment challenge" }
          }
        }
      }
    }
  });
}
