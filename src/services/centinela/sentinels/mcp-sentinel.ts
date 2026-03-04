import { createLogger } from '@/lib/utils/logger';
import { resolveServiceEndpoint, resolveAgentEndpoint } from './resolve-endpoint';

const logger = createLogger('mcp-sentinel');

const MCP_TIMEOUT_MS = 10_000;

export interface MCPResult {
  passed: boolean;
  score: number;
  endpoint: string | null;
  toolCount: number;
  tools: string[];
  jsonRpcValid: boolean;
}

/**
 * Check MCP (Model Context Protocol) support by sending a JSON-RPC tools/list request.
 * Looks for MCP service endpoint in agent metadata, then validates the JSON-RPC response.
 */
export async function checkMCP(agentAddress: string): Promise<MCPResult> {
  // Try to resolve MCP-specific endpoint from metadata.services
  let endpoint = await resolveServiceEndpoint(agentAddress, 'MCP');

  // Fallback: try the main agent endpoint with /mcp path
  if (!endpoint) {
    const baseEndpoint = await resolveAgentEndpoint(agentAddress);
    if (baseEndpoint) {
      try {
        const url = new URL(baseEndpoint);
        url.pathname = url.pathname.replace(/\/$/, '') + '/mcp';
        endpoint = url.toString();
      } catch {
        // Invalid URL
      }
    }
  }

  if (!endpoint) {
    return {
      passed: false,
      score: 0,
      endpoint: null,
      toolCount: 0,
      tools: [],
      jsonRpcValid: false,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.info({ agentAddress, status: response.status }, 'MCP endpoint returned non-OK status');
      return {
        passed: false,
        score: 0,
        endpoint,
        toolCount: 0,
        tools: [],
        jsonRpcValid: false,
      };
    }

    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      logger.warn({ agentAddress }, 'MCP response is not valid JSON');
      return {
        passed: false,
        score: 10,
        endpoint,
        toolCount: 0,
        tools: [],
        jsonRpcValid: false,
      };
    }

    // Validate JSON-RPC response structure
    const jsonRpcValid = body.jsonrpc === '2.0' && 'result' in body;

    if (!jsonRpcValid) {
      logger.info({ agentAddress }, 'MCP response is not valid JSON-RPC');
      return {
        passed: false,
        score: 20,
        endpoint,
        toolCount: 0,
        tools: [],
        jsonRpcValid: false,
      };
    }

    // Extract tools from result
    const result = body.result as Record<string, unknown> | unknown[];
    let toolsList: Array<Record<string, unknown>> = [];

    if (Array.isArray(result)) {
      toolsList = result.filter((t): t is Record<string, unknown> => t !== null && typeof t === 'object');
    } else if (result && typeof result === 'object' && Array.isArray(result.tools)) {
      toolsList = (result.tools as unknown[]).filter(
        (t): t is Record<string, unknown> => t !== null && typeof t === 'object'
      );
    }

    const tools = toolsList
      .map((t) => (typeof t.name === 'string' ? t.name : null))
      .filter((n): n is string => n !== null);

    // Score: 80 base for valid JSON-RPC + 2 per tool (max 100)
    const score = Math.min(100, 80 + tools.length * 2);

    logger.info({ agentAddress, score, toolCount: tools.length, tools, endpoint }, 'MCP check completed');

    return {
      passed: true,
      score,
      endpoint,
      toolCount: tools.length,
      tools,
      jsonRpcValid: true,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    logger.error({ agentAddress, error: isTimeout ? 'timeout' : (error instanceof Error ? error.message : 'unknown') }, 'MCP check failed');

    return {
      passed: false,
      score: 0,
      endpoint,
      toolCount: 0,
      tools: [],
      jsonRpcValid: false,
    };
  }
}
