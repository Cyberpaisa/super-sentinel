import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkMCP } from '../mcp';

// ── Unit tests with mocked fetch ──────────────────────────────────────────────

describe('MCP Sentinel (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return sentinel name "mcp"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const result = await checkMCP('https://example.com/mcp');
    expect(result.sentinel).toBe('mcp');
  });

  it('should score 0 and fail when response is not OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.jsonRpcValid).toBe(false);
  });

  it('should score 0 and fail when response is not valid JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.jsonRpcValid).toBe(false);
    expect(result.data.errorMessage).toBe('Response is not valid JSON');
  });

  it('should score 0 and fail when JSON-RPC structure is invalid (missing jsonrpc or result)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }), // no jsonrpc, no result
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.jsonRpcValid).toBe(false);
  });

  it('should score 0 and fail when valid JSON-RPC but 0 tools', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: { tools: [] },
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.jsonRpcValid).toBe(true);
    expect(result.data.toolCount).toBe(0);
  });

  it('should score 55 (50 + 1*5) and pass with 1 tool', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: { tools: [{ name: 'search' }] },
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(55);
    expect(result.passed).toBe(true);
    expect(result.data.jsonRpcValid).toBe(true);
    expect(result.data.toolCount).toBe(1);
    expect(result.data.tools).toEqual(['search']);
  });

  it('should score 70 (50 + 4*5) and pass with 4 tools', async () => {
    const tools = [
      { name: 'search' },
      { name: 'calculate' },
      { name: 'translate' },
      { name: 'summarize' },
    ];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: { tools },
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.data.toolCount).toBe(4);
  });

  it('should cap score at 100 with 10+ tools', async () => {
    const tools = Array.from({ length: 15 }, (_, i) => ({ name: `tool-${i}` }));
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: { tools },
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');

    // 50 + 15*5 = 125, capped at 100
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.data.toolCount).toBe(15);
  });

  it('should pass when score >= 50 (threshold check)', async () => {
    // 1 tool = 55, passed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: { tools: [{ name: 'a' }] },
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('should score 0 and fail on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkMCP('https://example.com/mcp');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.errorMessage).toBe('Network error');
  });

  it('should score 0 and fail on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await checkMCP('https://example.com/mcp', 100);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.errorMessage).toContain('Timed out');
  });

  it('should handle tools as a direct array in result (not nested under .tools)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jsonrpc: '2.0',
        result: [{ name: 'tool-a' }, { name: 'tool-b' }],
        id: 1,
      }),
    });

    const result = await checkMCP('https://example.com/mcp');

    expect(result.data.toolCount).toBe(2);
    expect(result.data.tools).toEqual(['tool-a', 'tool-b']);
    expect(result.score).toBe(60); // 50 + 2*5
    expect(result.passed).toBe(true);
  });
});

// ── Integration test ──────────────────────────────────────────────────────────

describe('MCP Sentinel (integration)', () => {
  it('should FAIL for a non-MCP endpoint (httpbin)', async () => {
    const result = await checkMCP('https://httpbin.org/post');

    expect(result).toHaveProperty('sentinel', 'mcp');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.jsonRpcValid).toBe(false);
  });
});
