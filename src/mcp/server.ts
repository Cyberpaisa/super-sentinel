/**
 * Super Sentinel MCP Server
 *
 * Exposes sentinel scanning tools via the Model Context Protocol.
 * Communicates over stdio (stdin/stdout) for use with Claude Desktop and other MCP clients.
 *
 * Tools:
 *   - validate_agent: Full 6-sentinel scan + TRACER scoring
 *   - quick_check:    Health-only fast check
 *   - compare_agents: Side-by-side comparison of two endpoints
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod/v3';

import { runEndpointSentinels } from '../sentinels/index.js';
import { checkHealth } from '../sentinels/health/index.js';
import { calculateTRACER } from '../sentinels/scoring/index.js';

const server = new McpServer({
  name: 'super-sentinel',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Tool 1: validate_agent
// ---------------------------------------------------------------------------
server.tool(
  'validate_agent',
  'Run all 6 endpoint sentinels (health, TLS, latency, A2A, MCP, x402) and compute the TRACER trust score with tier classification.',
  {
    endpoint: z.string().url().describe('The agent endpoint URL to validate'),
  },
  async ({ endpoint }) => {
    try {
      const orchestratorResult = await runEndpointSentinels(endpoint);
      const tracerScore = calculateTRACER(orchestratorResult.results);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                endpoint,
                scan: orchestratorResult,
                tracer: tracerScore,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              endpoint,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 2: quick_check
// ---------------------------------------------------------------------------
server.tool(
  'quick_check',
  'Fast health-only check for an agent endpoint. Returns reachability, status code, response time, and score.',
  {
    endpoint: z.string().url().describe('The agent endpoint URL to check'),
  },
  async ({ endpoint }) => {
    try {
      const result = await checkHealth(endpoint);
      const data = result.data as {
        reachable: boolean;
        statusCode: number | null;
        responseTimeMs: number | null;
        errorMessage?: string;
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                endpoint,
                reachable: data.reachable,
                statusCode: data.statusCode,
                responseTimeMs: data.responseTimeMs,
                score: result.score,
                passed: result.passed,
                ...(data.errorMessage ? { errorMessage: data.errorMessage } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              endpoint,
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool 3: compare_agents
// ---------------------------------------------------------------------------
server.tool(
  'compare_agents',
  'Run full sentinel scans on two agent endpoints in parallel and return a side-by-side TRACER score comparison.',
  {
    endpoint1: z.string().url().describe('First agent endpoint URL'),
    endpoint2: z.string().url().describe('Second agent endpoint URL'),
  },
  async ({ endpoint1, endpoint2 }) => {
    try {
      const [result1, result2] = await Promise.all([
        runEndpointSentinels(endpoint1),
        runEndpointSentinels(endpoint2),
      ]);

      const tracer1 = calculateTRACER(result1.results);
      const tracer2 = calculateTRACER(result2.results);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                comparison: {
                  agent1: {
                    endpoint: endpoint1,
                    scan: result1,
                    tracer: tracer1,
                  },
                  agent2: {
                    endpoint: endpoint2,
                    scan: result2,
                    tracer: tracer2,
                  },
                  winner:
                    tracer1.total === tracer2.total
                      ? 'tie'
                      : tracer1.total > tracer2.total
                        ? endpoint1
                        : endpoint2,
                  scoreDifference: Math.abs(tracer1.total - tracer2.total),
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              endpoints: [endpoint1, endpoint2],
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server failed to start:', error);
  process.exit(1);
});
