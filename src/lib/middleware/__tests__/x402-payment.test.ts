import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock x402-verify before importing the module
vi.mock('../x402-verify', () => ({
  verifyX402Payment: vi.fn().mockResolvedValue({
    ok: true,
    payment: {
      payer: '0x1234567890abcdef1234567890abcdef12345678',
      recipient: '0x0000000000000000000000000000000000000000',
      amount: 10000n,
      nonce: '0xtest-nonce',
      signature: '0xtest-sig',
      validBefore: 9999999999,
    },
  }),
}));

// Mock survival earnings tracker
vi.mock('@/survival/earnings-tracker', () => ({
  EarningsTracker: {
    getInstance: vi.fn().mockReturnValue({
      recordEarning: vi.fn(),
    }),
  },
}));

describe('withX402Payment middleware', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset the env to enable payments
    process.env.X402_PAYMENT_ENABLED = 'true';

    // Mock fetch for facilitator verify + settle calls
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isValid: true }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, txHash: '0xMockTxHash' }),
        text: async () => '',
      });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should return 402 when no payment header is provided', async () => {
    // Re-import to get fresh config
    const { withX402Payment } = await import('../x402-payment');

    const handler = vi.fn();
    const wrappedHandler = withX402Payment(handler);

    const request = new NextRequest('http://localhost/api/scan', {
      method: 'POST',
    });

    const response = await wrappedHandler(request);
    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();

    const body = await response.json();
    expect(body.error.code).toBe('PAYMENT_REQUIRED');
  });

  it('should call handler when valid payment is provided', async () => {
    const { withX402Payment } = await import('../x402-payment');
    const { NextResponse } = await import('next/server');

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ data: 'ok', error: null })
    );
    const wrappedHandler = withX402Payment(handler);

    const request = new NextRequest('http://localhost/api/scan', {
      method: 'POST',
      headers: {
        'X-Payment-Token': 'valid-token',
      },
    });

    const response = await wrappedHandler(request);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it('should return 402 with reason when payment verification fails', async () => {
    const { verifyX402Payment } = await import('../x402-verify');
    (verifyX402Payment as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      reason: 'Insufficient payment',
    });

    const { withX402Payment } = await import('../x402-payment');

    const handler = vi.fn();
    const wrappedHandler = withX402Payment(handler);

    const request = new NextRequest('http://localhost/api/scan', {
      method: 'POST',
      headers: {
        'X-Payment-Token': 'bad-token',
      },
    });

    const response = await wrappedHandler(request);
    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get('X-402-Reason')).toBe('Insufficient payment');
  });

  it('should record earning on successful payment', async () => {
    // Re-mock fetch for this test (beforeEach mocks are consumed by prior calls)
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isValid: true }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, txHash: '0xMockTxHash' }),
        text: async () => '',
      });

    const { EarningsTracker } = await import('@/survival/earnings-tracker');
    const mockRecordEarning = vi.fn();
    (EarningsTracker.getInstance as ReturnType<typeof vi.fn>).mockReturnValue({
      recordEarning: mockRecordEarning,
    });

    const { withX402Payment } = await import('../x402-payment');
    const { NextResponse } = await import('next/server');

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ data: 'ok', error: null })
    );
    const wrappedHandler = withX402Payment(handler);

    const request = new NextRequest('http://localhost/api/scan', {
      method: 'POST',
      headers: {
        'X-Payment-Token': 'valid-token',
      },
    });

    await wrappedHandler(request);
    expect(mockRecordEarning).toHaveBeenCalledWith(
      expect.objectContaining({
        payer: '0x1234567890abcdef1234567890abcdef12345678',
        amountUSDC: 10000n,
        service: 'full-scan',
      }),
    );
  });
});
