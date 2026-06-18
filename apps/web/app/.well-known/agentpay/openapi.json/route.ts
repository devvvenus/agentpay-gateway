export async function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: {
      title: "AgentPay Gateway",
      version: "0.1.0",
      description:
        "Budget-aware nanopayment access layer for AI agents across premium APIs, MCP tools, publisher content, agent services and usage-based services."
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
                        enum: ["mcp", "api_proxy", "agent_delegation", "inference", "rss_paywall"]
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
      "/api/resources/manifests": {
        get: {
          operationId: "listResourceManifests",
          summary: "List machine-readable AgentPay resource manifests.",
          responses: {
            "200": { description: "Resource manifest catalog" }
          }
        }
      },
      "/api/resources/{resourceId}/manifest": {
        get: {
          operationId: "getResourceManifest",
          summary: "Get a machine-readable manifest for one paid resource.",
          parameters: [{ name: "resourceId", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Resource manifest" },
            "404": { description: "Resource not found" }
          }
        }
      },
      "/.well-known/agentpay/resources.json": {
        get: {
          operationId: "wellKnownResourceCatalog",
          summary: "Well-known AgentPay paid resource catalog.",
          responses: {
            "200": { description: "Resource manifest catalog" }
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
