import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkX402 } from '../x402';

// ── Unit tests with mocked fetch ──────────────────────────────────────────────

describe('x402 Sentinel (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return sentinel name "x402"', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
    });
    const result = await checkX402('https://example.com/pay');
    expect(result.sentinel).toBe('x402');
  });

  it('should score 0 and fail for non-402 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.supported).toBe(false);
    expect(result.data.statusCode).toBe(200);
  });

  it('should score 20 and fail for 402 without X-402 headers', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers: new Headers(),
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(20);
    expect(result.passed).toBe(false);
    expect(result.data.supported).toBe(true);
    expect(result.data.statusCode).toBe(402);
  });

  it('should score 70 and pass for 402 with X-402 headers but no CAIP-10', async () => {
    const headers = new Headers({
      'x-402-price': '100',
      'x-402-currency': 'USDC',
      'x-402-network': 'ethereum',
      'x-402-recipient': '0x1234567890abcdef1234567890abcdef12345678', // not CAIP-10
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers,
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.data.supported).toBe(true);
    expect(result.data.validRecipient).toBe(false);
  });

  it('should score 90 and pass for 402 with X-402 headers and valid CAIP-10 recipient', async () => {
    const caip10Address = 'eip155:1:0x1234567890abcdef1234567890abcdef12345678';
    const headers = new Headers({
      'x-402-price': '100',
      'x-402-currency': 'USDC',
      'x-402-network': 'ethereum',
      'x-402-recipient': caip10Address,
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers,
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(90);
    expect(result.passed).toBe(true);
    expect(result.data.supported).toBe(true);
    expect(result.data.validRecipient).toBe(true);
    expect(result.data.recipient).toBe(caip10Address);
  });

  it('should pass when score >= 50 (threshold check)', async () => {
    // 402 with headers = 70, which is >= 50 => passed
    const headers = new Headers({
      'x-402-price': '10',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers,
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('should score 0 and fail on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.supported).toBe(false);
    expect(result.data.errorMessage).toBe('Network error');
  });

  it('should score 0 and fail on timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    globalThis.fetch = vi.fn().mockRejectedValue(abortError);

    const result = await checkX402('https://example.com/pay', 100);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.errorMessage).toContain('Timed out');
  });

  it('should extract price, currency, network, and recipient from headers', async () => {
    const headers = new Headers({
      'x-402-price': '250',
      'x-402-currency': 'AVAX',
      'x-402-network': 'avalanche',
      'x-402-recipient': 'eip155:43114:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers,
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.data.price).toBe('250');
    expect(result.data.currency).toBe('AVAX');
    expect(result.data.network).toBe('avalanche');
    expect(result.data.recipient).toBe('eip155:43114:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    expect(result.data.validRecipient).toBe(true);
    expect(result.score).toBe(90);
  });

  it('should handle 402 with only some X-402 headers (price only)', async () => {
    const headers = new Headers({
      'x-402-price': '50',
    });
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 402,
      headers,
    });

    const result = await checkX402('https://example.com/pay');

    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.data.price).toBe('50');
    expect(result.data.currency).toBeNull();
  });
});

// ── Integration test ──────────────────────────────────────────────────────────

describe('x402 Sentinel (integration)', () => {
  it('should FAIL for an endpoint that does not return 402 (httpbin)', async () => {
    const result = await checkX402('https://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'x402');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.supported).toBe(false);
  });
});
