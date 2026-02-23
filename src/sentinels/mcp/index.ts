import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:mcp');

const DEFAULT_TIMEOUT_MS = 10_000;

export interface MCPData {
  endpoint: string | null;
  toolCount: number;
  tools: string[];
  jsonRpcValid: boolean;
  errorMessage?: string;
}

/**
 * MCP sentinel — sends a JSON-RPC tools/list request to validate MCP support.
 *
 * Pure function: receives a base URL endpoint, returns SentinelResult.
 *
 * Score tiers:
 *  - No valid JSON-RPC response → score = 0, fail
 *  - Valid JSON-RPC but 0 tools  → score = 0, fail
 *  - Valid JSON-RPC with tools   → 50 + tools.length * 5 (capped at 100)
 *  - passed = score >= 50 (consistent with other sentinels)
 *  - Error or timeout → 0
 */
export async function checkMCP(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
      logger.info({ endpoint, status: response.status }, 'MCP endpoint returned non-OK status');
      return {
        sentinel: 'mcp',
        passed: false,
        score: 0,
        data: {
          endpoint,
          toolCount: 0,
          tools: [],
          jsonRpcValid: false,
        },
      };
    }

    let body: Record<string, unknown>;
    try {
      body = (await response.json()) as Record<string, unknown>;
    } catch {
      logger.warn({ endpoint }, 'MCP response is not valid JSON');
      return {
        sentinel: 'mcp',
        passed: false,
        score: 0,
        data: {
          endpoint,
          toolCount: 0,
          tools: [],
          jsonRpcValid: false,
          errorMessage: 'Response is not valid JSON',
        },
      };
    }

    // Validate JSON-RPC response structure
    const jsonRpcValid = body.jsonrpc === '2.0' && 'result' in body;

    if (!jsonRpcValid) {
      logger.info({ endpoint }, 'MCP response is not valid JSON-RPC');
      return {
        sentinel: 'mcp',
        passed: false,
        score: 0,
        data: {
          endpoint,
          toolCount: 0,
          tools: [],
          jsonRpcValid: false,
        },
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

    // Score: 0 tools = 0 (fail), 1+ tools = 50 + tools * 5 (capped at 100)
    const score = tools.length === 0 ? 0 : Math.min(100, 50 + tools.length * 5);

    logger.info({ endpoint, score, toolCount: tools.length, tools }, 'MCP check completed');

    return {
      sentinel: 'mcp',
      passed: score >= 50,
      score,
      data: {
        endpoint,
        toolCount: tools.length,
        tools,
        jsonRpcValid: true,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = isTimeout
      ? `Timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.warn({ endpoint, error: errorMessage }, 'MCP check failed');

    return {
      sentinel: 'mcp',
      passed: false,
      score: 0,
      data: {
        endpoint,
        toolCount: 0,
        tools: [],
        jsonRpcValid: false,
        errorMessage,
      },
    };
  }
}
