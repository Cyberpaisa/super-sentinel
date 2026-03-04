import { describe, it, expect } from 'vitest';
import { evaluateChange, evaluateAll } from '../alerts';
import type { URIChange, PreScanResult, AgentURIHistory } from '../types';

function makeChange(overrides: Partial<URIChange> = {}): URIChange {
  return {
    agentId: 1n,
    newURI: 'https://new.xyz/agent.json',
    previousURI: 'https://old.xyz/agent.json',
    changedAt: Math.floor(Date.now() / 1000),
    blockNumber: 100n,
    txHash: '0xabc',
    updatedBy: '0x1234567890abcdef1234567890abcdef12345678',
    ...overrides,
  };
}

function makePreScan(overrides: Partial<PreScanResult> = {}): PreScanResult {
  return {
    newURI: 'https://new.xyz/agent.json',
    reachable: true,
    validSchema: true,
    identityChanged: false,
    servicesChanged: false,
    x402Changed: false,
    changedFields: [],
    riskScore: 0,
    riskReasons: [],
    ...overrides,
  };
}

function makeHistory(changeCount: number, avgIntervalSec = 0): AgentURIHistory {
  return {
    agentId: 1n,
    changes: [],
    changeCount,
    avgIntervalSec,
  };
}

describe('Alert Generator', () => {
  it('should return null for benign changes (no risk)', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan(),
      makeHistory(1)
    );
    expect(alert).toBeNull();
  });

  it('should generate warning when risk exceeds warning threshold', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ riskScore: 45, riskReasons: ['test risk'] }),
      makeHistory(1)
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
  });

  it('should generate critical when risk exceeds critical threshold', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ riskScore: 75, riskReasons: ['very risky'] }),
      makeHistory(1)
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('critical');
  });

  it('should generate warning for too many changes in window', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ riskScore: 10 }),
      makeHistory(3)
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
  });

  it('should generate critical for rapid-fire changes (< 1 hour avg)', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ riskScore: 10 }),
      makeHistory(5, 600) // 10 minutes average
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('critical');
  });

  it('should generate warning when new URI is unreachable', () => {
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ reachable: false, riskScore: 10, riskReasons: ['unreachable'] }),
      makeHistory(1)
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
  });

  it('should include pre-scan result in alert', () => {
    const preScan = makePreScan({ riskScore: 50, riskReasons: ['test'] });
    const alert = evaluateChange(makeChange(), preScan, makeHistory(1));
    expect(alert!.preScanResult).toBe(preScan);
  });

  it('should include URI change in alert', () => {
    const change = makeChange();
    const alert = evaluateChange(
      change,
      makePreScan({ riskScore: 50 }),
      makeHistory(1)
    );
    expect(alert!.uriChange).toBe(change);
    expect(alert!.agentId).toBe(1n);
  });

  it('should respect custom thresholds', () => {
    // With low threshold, even small risk triggers warning
    const alert = evaluateChange(
      makeChange(),
      makePreScan({ riskScore: 15, riskReasons: ['minor'] }),
      makeHistory(1),
      { warningThreshold: 10 }
    );
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
  });
});

describe('evaluateAll', () => {
  it('should return alerts for all suspicious entries', () => {
    const entries = [
      {
        change: makeChange({ agentId: 1n }),
        preScan: makePreScan({ riskScore: 50, riskReasons: ['risky'] }),
        history: makeHistory(1),
      },
      {
        change: makeChange({ agentId: 2n }),
        preScan: makePreScan({ riskScore: 0 }),
        history: makeHistory(0),
      },
      {
        change: makeChange({ agentId: 3n }),
        preScan: makePreScan({ riskScore: 80, riskReasons: ['very risky'] }),
        history: makeHistory(5, 300),
      },
    ];

    const alerts = evaluateAll(entries);
    // Agent 2 is benign → no alert
    expect(alerts.length).toBe(2);
    expect(alerts[0].agentId).toBe(1n);
    expect(alerts[1].agentId).toBe(3n);
    expect(alerts[1].severity).toBe('critical');
  });

  it('should return empty array for all benign entries', () => {
    const entries = [
      {
        change: makeChange(),
        preScan: makePreScan(),
        history: makeHistory(1),
      },
    ];
    const alerts = evaluateAll(entries);
    expect(alerts).toEqual([]);
  });
});
