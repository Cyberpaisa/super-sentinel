import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkURIStability } from '../sentinel';
import { CooldownEventListener } from '../event-listener';
import type { URIChange, AgentURIHistory } from '../types';

// Mock the pre-scanner and alerts modules
vi.mock('../pre-scanner', () => ({
  preScanURIChange: vi.fn().mockResolvedValue({
    newURI: 'https://new.xyz/agent.json',
    reachable: true,
    validSchema: true,
    identityChanged: false,
    servicesChanged: false,
    x402Changed: false,
    changedFields: [],
    riskScore: 0,
    riskReasons: [],
  }),
}));

vi.mock('../alerts', () => ({
  evaluateChange: vi.fn().mockReturnValue(null),
}));

function makeChange(agentId: bigint, changedAt: number): URIChange {
  return {
    agentId,
    newURI: `https://agent-${agentId}.xyz/agent.json`,
    previousURI: '',
    changedAt,
    blockNumber: 100n,
    txHash: '0xabc',
    updatedBy: '0x1234567890abcdef1234567890abcdef12345678',
  };
}

// Create a mock listener with controlled history
function createMockListener(
  changeCount: number,
  avgIntervalSec: number,
  latestChange?: URIChange
): CooldownEventListener {
  const listener = {
    getAgentHistory: vi.fn().mockReturnValue({
      agentId: 1n,
      changes: [],
      changeCount,
      avgIntervalSec,
    } satisfies AgentURIHistory),
    getLatestChange: vi.fn().mockReturnValue(latestChange ?? null),
  } as unknown as CooldownEventListener;
  return listener;
}

describe('URI Stability Sentinel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return score 100 when no URI changes detected', async () => {
    const listener = createMockListener(0, 0);
    const result = await checkURIStability(1n, listener);

    expect(result.sentinel).toBe('uri-stability');
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.data.changeCount).toBe(0);
  });

  it('should return score 80 for 1 change with low risk', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(1, 0, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
  });

  it('should return score 60 for 2 changes', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(2, 7200, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(60);
    expect(result.passed).toBe(true);
  });

  it('should return score 40 for 3+ changes', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(3, 3600, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
  });

  it('should return score 20 for critical risk (>70)', async () => {
    const { preScanURIChange } = await import('../pre-scanner');
    (preScanURIChange as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      newURI: 'https://evil.xyz/agent.json',
      reachable: false,
      validSchema: false,
      identityChanged: true,
      servicesChanged: true,
      x402Changed: true,
      changedFields: ['name', 'services', 'x402Support'],
      riskScore: 85,
      riskReasons: ['Unreachable', 'Identity changed'],
    });

    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(1, 0, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(20);
    expect(result.passed).toBe(false);
  });

  it('should pass when score >= 50', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(2, 7200, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(60);
    expect(result.passed).toBe(true);
  });

  it('should fail when score < 50', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(4, 1800, change);

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(40);
    expect(result.passed).toBe(false);
  });

  it('should return score 0 on error', async () => {
    const listener = {
      getAgentHistory: vi.fn().mockImplementation(() => {
        throw new Error('listener failed');
      }),
      getLatestChange: vi.fn(),
    } as unknown as CooldownEventListener;

    const result = await checkURIStability(1n, listener);

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.error).toBeDefined();
  });

  it('should include changeCount and avgIntervalSec in data', async () => {
    const change = makeChange(1n, Math.floor(Date.now() / 1000));
    const listener = createMockListener(2, 4500, change);

    const result = await checkURIStability(1n, listener);

    expect(result.data.changeCount).toBe(2);
    expect(result.data.avgIntervalSec).toBe(4500);
  });
});
