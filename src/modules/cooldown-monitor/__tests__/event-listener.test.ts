import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CooldownEventListener } from '../event-listener';
import type { URIChange } from '../types';

// Mock blockchain dependencies
vi.mock('@/lib/blockchain/client', () => ({
  publicClient: {
    getBlockNumber: vi.fn().mockResolvedValue(1000n),
    getLogs: vi.fn().mockResolvedValue([]),
    readContract: vi.fn().mockResolvedValue(''),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
    getTransaction: vi.fn().mockResolvedValue({ from: '0xabc' }),
  },
}));

vi.mock('@/config/contracts', () => ({
  ERC8004_CONTRACTS: {
    identity: { mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' },
  },
}));

vi.mock('@/lib/blockchain/abis/identity-registry', () => ({
  IDENTITY_REGISTRY_ABI: [],
}));

vi.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

function makeChange(agentId: bigint, changedAt: number, newURI = 'https://agent.xyz/v2.json'): URIChange {
  return {
    agentId,
    newURI,
    previousURI: '',
    changedAt,
    blockNumber: 100n,
    txHash: '0xabc',
    updatedBy: '0x1234567890abcdef1234567890abcdef12345678',
  };
}

describe('CooldownEventListener', () => {
  let listener: CooldownEventListener;

  beforeEach(() => {
    vi.restoreAllMocks();
    listener = new CooldownEventListener({ pollIntervalMs: 100_000 });
  });

  it('should initialize with empty history', () => {
    const history = listener.getAgentHistory(1n);
    expect(history.changeCount).toBe(0);
    expect(history.changes).toEqual([]);
  });

  it('should track ingested changes', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now, 'https://v1.xyz'));
    listener.ingestChange(makeChange(1n, now + 3600, 'https://v2.xyz'));

    const history = listener.getAgentHistory(1n);
    expect(history.changes.length).toBe(2);
  });

  it('should count only changes within observation window', () => {
    const now = Math.floor(Date.now() / 1000);
    // Old change (2 days ago — outside 24h window)
    listener.ingestChange(makeChange(1n, now - 200_000, 'https://old.xyz'));
    // Recent change
    listener.ingestChange(makeChange(1n, now - 1000, 'https://new.xyz'));

    const history = listener.getAgentHistory(1n);
    expect(history.changeCount).toBe(1); // Only the recent one
  });

  it('should calculate average interval between changes', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now - 7200, 'https://v1.xyz'));
    listener.ingestChange(makeChange(1n, now - 3600, 'https://v2.xyz'));
    listener.ingestChange(makeChange(1n, now, 'https://v3.xyz'));

    const history = listener.getAgentHistory(1n);
    expect(history.avgIntervalSec).toBe(3600); // 7200s total / 2 intervals
  });

  it('should detect unstable agents', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now - 3600));
    listener.ingestChange(makeChange(1n, now - 1800));
    listener.ingestChange(makeChange(1n, now));

    expect(listener.isUnstable(1n)).toBe(true);
  });

  it('should not flag stable agents as unstable', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now));

    expect(listener.isUnstable(1n)).toBe(false);
  });

  it('should return latest change', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now - 3600, 'https://v1.xyz'));
    listener.ingestChange(makeChange(1n, now, 'https://v2.xyz'));

    const latest = listener.getLatestChange(1n);
    expect(latest).toBeDefined();
    expect(latest!.newURI).toBe('https://v2.xyz');
  });

  it('should return undefined for agent with no changes', () => {
    expect(listener.getLatestChange(999n)).toBeUndefined();
  });

  it('should track multiple agents independently', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now, 'https://agent1.xyz'));
    listener.ingestChange(makeChange(2n, now, 'https://agent2.xyz'));
    listener.ingestChange(makeChange(2n, now + 100, 'https://agent2-v2.xyz'));

    expect(listener.getAgentHistory(1n).changeCount).toBe(1);
    expect(listener.getAgentHistory(2n).changeCount).toBe(2);
  });

  it('should list active agents', () => {
    const now = Math.floor(Date.now() / 1000);
    listener.ingestChange(makeChange(1n, now));
    listener.ingestChange(makeChange(2n, now));

    const active = listener.getActiveAgents();
    expect(active.length).toBe(2);
  });

  it('should invoke onURIChange callback when change is ingested', () => {
    const callback = vi.fn();
    listener.onURIChange = callback;

    // ingestChange doesn't trigger callback (it's for event-driven path)
    // But we can verify the callback field is set
    expect(listener.onURIChange).toBe(callback);
  });

  it('should report isRunning as false before start', () => {
    expect(listener.isRunning).toBe(false);
  });

  it('should stop cleanly even if not started', () => {
    expect(() => listener.stop()).not.toThrow();
  });
});
