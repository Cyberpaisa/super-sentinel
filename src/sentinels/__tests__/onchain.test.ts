import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkOnChain } from '../onchain';

describe('On-Chain Sentinel', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return sentinel name "on-chain"', async () => {
    const result = await checkOnChain('invalid-address');
    expect(result.sentinel).toBe('on-chain');
  });

  it('should score 0 and fail for invalid address format', async () => {
    const result = await checkOnChain('not-an-address');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.isContract).toBe(false);
    expect(result.data.codeSize).toBe(0);
    expect(result.data.address).toBe('not-an-address');
  });

  it('should score 0 and fail for address without 0x prefix', async () => {
    const result = await checkOnChain('1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should score 0 and fail for address with wrong length', async () => {
    const result = await checkOnChain('0x1234');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should score 30 and fail for EOA (eth_getCode returns "0x")', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: '0x',
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(30);
    expect(result.passed).toBe(false);
    expect(result.data.isContract).toBe(false);
    expect(result.data.codeSize).toBe(0);
  });

  it('should score 80 and pass for contract with code > 1000 bytes', async () => {
    // > 1000 bytes = > 2000 hex chars + "0x" prefix
    const code = '0x' + 'aa'.repeat(1500); // 1500 bytes
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: code,
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
    expect(result.data.isContract).toBe(true);
    expect(result.data.codeSize).toBe(1500);
  });

  it('should score 60 and pass for contract with small code (<= 1000 bytes)', async () => {
    const code = '0x' + 'bb'.repeat(500); // 500 bytes
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: code,
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(60);
    expect(result.passed).toBe(true);
    expect(result.data.isContract).toBe(true);
    expect(result.data.codeSize).toBe(500);
  });

  it('should score 60 and pass for contract with exactly 1000 bytes', async () => {
    const code = '0x' + 'cc'.repeat(1000); // exactly 1000 bytes
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: code,
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(60);
    expect(result.passed).toBe(true);
    expect(result.data.isContract).toBe(true);
    expect(result.data.codeSize).toBe(1000);
  });

  it('should score 80 for contract with exactly 1001 bytes', async () => {
    const code = '0x' + 'dd'.repeat(1001); // 1001 bytes > 1000
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: code,
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
    expect(result.data.codeSize).toBe(1001);
  });

  it('should score 0 and fail on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.isContract).toBe(false);
    expect(result.data.codeSize).toBe(0);
  });

  it('should score 0 and fail on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should score 0 and fail when RPC returns non-OK status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should score 0 and fail when RPC returns an error field', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        error: { message: 'invalid params' },
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('should default to "0x" when result is missing from RPC response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 1,
        // no result field
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    // Missing result defaults to "0x" => EOA => score 30
    expect(result.score).toBe(30);
    expect(result.passed).toBe(false);
    expect(result.data.isContract).toBe(false);
  });

  it('should accept custom RPC URL', async () => {
    const customRpcUrl = 'https://custom-rpc.example.com';
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: '0x' + 'aa'.repeat(2000),
        id: 1,
      }),
    });

    await checkOnChain('0x1234567890abcdef1234567890abcdef12345678', customRpcUrl);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      customRpcUrl,
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('eth_getCode'),
      })
    );
  });

  it('should have proper SentinelResult structure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: '0x' + 'aa'.repeat(100),
        id: 1,
      }),
    });

    const result = await checkOnChain('0x1234567890abcdef1234567890abcdef12345678');

    expect(result).toHaveProperty('sentinel');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.data).toHaveProperty('isContract');
    expect(result.data).toHaveProperty('codeSize');
    expect(result.data).toHaveProperty('address');
  });

  it('should include the address in data for all cases', async () => {
    const address = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

    // Invalid address
    const r1 = await checkOnChain('invalid');
    expect(r1.data.address).toBe('invalid');

    // Valid address
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: '0x', id: 1 }),
    });
    const r2 = await checkOnChain(address);
    expect(r2.data.address).toBe(address);
  });
});
