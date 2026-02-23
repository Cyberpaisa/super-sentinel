import { describe, it, expect } from 'vitest';
import { checkMCP } from '../mcp';

describe('MCP Sentinel', () => {
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
