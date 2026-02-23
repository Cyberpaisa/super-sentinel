import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyX402Payment } from '../x402-verify';

// Mock viem's verifyTypedData
vi.mock('viem', () => ({
  verifyTypedData: vi.fn().mockResolvedValue(true),
}));

const VALID_AUTHORIZATION = {
  from: '0x1234567890abcdef1234567890abcdef12345678',
  to: process.env.X402_RECIPIENT_ADDRESS || '0x0000000000000000000000000000000000000000',
  value: '500000', // $0.50 USDC
  validAfter: 0,
  validBefore: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  nonce: '0x0000000000000000000000000000000000000000000000000000000000000001',
};

function makeProof(overrides: Record<string, unknown> = {}): string {
  const proof = {
    x402Version: 1,
    scheme: 'exact',
    network: 'eip155:43114',
    payload: {
      signature: '0xdeadbeef',
      authorization: { ...VALID_AUTHORIZATION },
    },
    ...overrides,
  };
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

describe('x402 Payment Verification', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    // Re-mock after restore
    const viem = vi.mocked(await import('viem'));
    viem.verifyTypedData.mockResolvedValue(true);
  });

  it('should reject non-base64 input', async () => {
    const result = await verifyX402Payment('not-valid-json!!!');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Invalid payment proof format');
    }
  });

  it('should reject invalid JSON structure', async () => {
    const encoded = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
    const result = await verifyX402Payment(encoded);
    expect(result.ok).toBe(false);
  });

  it('should reject unsupported x402 version', async () => {
    const result = await verifyX402Payment(makeProof({ x402Version: 99 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Unsupported x402 version');
    }
  });

  it('should reject wrong network', async () => {
    const result = await verifyX402Payment(makeProof({ network: 'eip155:1' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Network mismatch');
    }
  });

  it('should reject wrong recipient', async () => {
    const proof = {
      x402Version: 1,
      network: 'eip155:43114',
      payload: {
        signature: '0xdeadbeef',
        authorization: {
          ...VALID_AUTHORIZATION,
          to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const result = await verifyX402Payment(encoded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Recipient mismatch');
    }
  });

  it('should reject insufficient payment amount', async () => {
    const proof = {
      x402Version: 1,
      network: 'eip155:43114',
      payload: {
        signature: '0xdeadbeef',
        authorization: {
          ...VALID_AUTHORIZATION,
          value: '100', // way below $0.50
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const result = await verifyX402Payment(encoded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Insufficient payment');
    }
  });

  it('should reject expired authorization', async () => {
    const proof = {
      x402Version: 1,
      network: 'eip155:43114',
      payload: {
        signature: '0xdeadbeef',
        authorization: {
          ...VALID_AUTHORIZATION,
          validBefore: 1000, // long expired
        },
      },
    };
    const encoded = Buffer.from(JSON.stringify(proof)).toString('base64');
    const result = await verifyX402Payment(encoded);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('expired');
    }
  });

  it('should reject invalid EIP-712 signature', async () => {
    const viem = vi.mocked(await import('viem'));
    viem.verifyTypedData.mockResolvedValue(false);

    const result = await verifyX402Payment(makeProof());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Invalid payment signature');
    }
  });

  it('should accept valid payment proof', async () => {
    const result = await verifyX402Payment(makeProof());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payment.payer).toBe(VALID_AUTHORIZATION.from);
      expect(result.payment.amountUSDC).toBe(BigInt(VALID_AUTHORIZATION.value));
      expect(result.payment.recipient).toBe(VALID_AUTHORIZATION.to);
    }
  });

  it('should reject replay (same nonce used twice)', async () => {
    const replayNonce = '0x00000000000000000000000000000000000000000000000000000000000000ff';
    const proofWithUniqueNonce = (() => {
      const proof = {
        x402Version: 1,
        scheme: 'exact',
        network: 'eip155:43114',
        payload: {
          signature: '0xdeadbeef',
          authorization: { ...VALID_AUTHORIZATION, nonce: replayNonce },
        },
      };
      return Buffer.from(JSON.stringify(proof)).toString('base64');
    })();

    // First call should succeed
    const result1 = await verifyX402Payment(proofWithUniqueNonce);
    expect(result1.ok).toBe(true);

    // Second call with same nonce should fail
    const result2 = await verifyX402Payment(proofWithUniqueNonce);
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.reason).toContain('replay');
    }
  });
});
