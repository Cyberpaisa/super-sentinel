import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock x402-verify
vi.mock('../x402-verify', () => ({
  verifyX402Payment: vi.fn().mockResolvedValue({
    ok: true,
    payment: {
      payer: '0xApexWallet1234567890abcdef1234567890abcdef',
      recipient: '0x0000000000000000000000000000000000000000',
      amount: 10000n,
      nonce: '0xtest-nonce-abc123',
      signature: '0xtest-sig-abc123',
      validBefore: 9999999999,
    },
  }),
}));

// Mock survival earnings tracker
const mockRecordEarning = vi.fn();
vi.mock('@/survival/earnings-tracker', () => ({
  EarningsTracker: {
    getInstance: vi.fn().mockReturnValue({
      recordEarning: mockRecordEarning,
    }),
  },
}));

describe('x402 facilitator settlement', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockRecordEarning.mockClear();
    process.env.X402_PAYMENT_ENABLED = 'true';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function makeRequest() {
    return new NextRequest('http://localhost/api/scan', {
      method: 'POST',
      headers: { 'X-Payment-Token': 'valid-token' },
    });
  }

  function makeHandler() {
    const { NextResponse } = require('next/server');
    return vi.fn().mockResolvedValue(
      NextResponse.json({ data: 'scan-results', error: null })
    );
  }

  it('should settle successfully and record real txHash in earnings', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isValid: true }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, txHash: '0xRealTxHash123' }),
        text: async () => '',
      });

    const { withX402Payment } = await import('../x402-payment');
    const handler = makeHandler();
    const response = await withX402Payment(handler)(makeRequest());

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
    expect(response.headers.get('X-402-TxHash')).toBe('0xRealTxHash123');
    expect(mockRecordEarning).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: '0xRealTxHash123' }),
    );
  });

  it('should return 402 when facilitator settle explicitly fails', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isValid: true }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'insufficient funds' }),
        text: async () => 'insufficient funds',
      });

    const { withX402Payment } = await import('../x402-payment');
    const handler = makeHandler();
    const response = await withX402Payment(handler)(makeRequest());

    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();

    const reason = response.headers.get('X-402-Reason');
    expect(reason).toContain('Settlement failed');
  });

  it('should fall back gracefully when facilitator is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const { withX402Payment } = await import('../x402-payment');
    const handler = makeHandler();
    const response = await withX402Payment(handler)(makeRequest());

    // Should still proceed with local-only verification
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();

    // txHash falls back to nonce
    expect(mockRecordEarning).toHaveBeenCalledWith(
      expect.objectContaining({ txHash: '0xtest-nonce-abc123' }),
    );

    // No TxHash header when facilitator was unreachable
    expect(response.headers.get('X-402-TxHash')).toBeNull();
  });

  it('should return 402 when facilitator /verify rejects the signature', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ isValid: false }),
      text: async () => '',
    });

    const { withX402Payment } = await import('../x402-payment');
    const handler = makeHandler();
    const response = await withX402Payment(handler)(makeRequest());

    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
  });
});
