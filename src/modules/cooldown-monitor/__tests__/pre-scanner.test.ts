import { describe, it, expect, vi, beforeEach } from 'vitest';
import { preScanURIChange } from '../pre-scanner';
import type { URIChange } from '../types';

function makeChange(overrides: Partial<URIChange> = {}): URIChange {
  return {
    agentId: 1n,
    newURI: 'https://new-agent.xyz/agent.json',
    previousURI: 'https://old-agent.xyz/agent.json',
    changedAt: Math.floor(Date.now() / 1000),
    blockNumber: 100n,
    txHash: '0xabc',
    updatedBy: '0x1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  };
}

const validRegistration = {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  name: 'Test Agent',
  description: 'A test agent',
  services: [{ name: 'web', endpoint: 'https://agent.xyz/' }],
  x402Support: false,
  active: true,
};

describe('Pre-Scanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return reachable=false when new URI fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await preScanURIChange(makeChange());

    expect(result.reachable).toBe(false);
    expect(result.riskScore).toBeGreaterThanOrEqual(40);
    expect(result.riskReasons).toContain('New URI is unreachable');
  });

  it('should return validSchema=false for non-JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<html>not json</html>'),
    }));

    const result = await preScanURIChange(makeChange());

    expect(result.reachable).toBe(false);
    expect(result.validSchema).toBe(false);
  });

  it('should return validSchema=true for valid ERC-8004 registration', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validRegistration)),
    }));

    const result = await preScanURIChange(makeChange({ previousURI: '' }));

    expect(result.reachable).toBe(true);
    expect(result.validSchema).toBe(true);
  });

  it('should detect identity field changes', async () => {
    const oldReg = { ...validRegistration, name: 'Old Name' };
    const newReg = { ...validRegistration, name: 'New Name' };

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? newReg : oldReg;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }));

    const result = await preScanURIChange(makeChange());

    expect(result.identityChanged).toBe(true);
    expect(result.changedFields).toContain('name');
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it('should detect service endpoint changes', async () => {
    const oldReg = { ...validRegistration };
    const newReg = {
      ...validRegistration,
      services: [{ name: 'web', endpoint: 'https://evil.xyz/' }],
    };

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? newReg : oldReg;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }));

    const result = await preScanURIChange(makeChange());

    expect(result.servicesChanged).toBe(true);
    expect(result.changedFields).toContain('services');
  });

  it('should detect x402 support changes', async () => {
    const oldReg = { ...validRegistration, x402Support: false };
    const newReg = { ...validRegistration, x402Support: true };

    let callCount = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      callCount++;
      const data = callCount === 1 ? newReg : oldReg;
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    }));

    const result = await preScanURIChange(makeChange());

    expect(result.x402Changed).toBe(true);
    expect(result.riskReasons.some((r) => r.includes('x402'))).toBe(true);
  });

  it('should flag inactive agent as high risk', async () => {
    const newReg = { ...validRegistration, active: false };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(newReg)),
    }));

    const result = await preScanURIChange(makeChange({ previousURI: '' }));

    expect(result.riskScore).toBeGreaterThanOrEqual(30);
    expect(result.riskReasons.some((r) => r.includes('inactive'))).toBe(true);
  });

  it('should return riskScore=0 when no changes between registrations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validRegistration)),
    }));

    const result = await preScanURIChange(makeChange());

    expect(result.riskScore).toBe(0);
    expect(result.changedFields).toEqual([]);
  });

  it('should cap riskScore at 100', async () => {
    // Unreachable(40) + ... multiple penalties won't exceed 100
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));

    const result = await preScanURIChange(makeChange());

    expect(result.riskScore).toBeLessThanOrEqual(100);
  });
});
