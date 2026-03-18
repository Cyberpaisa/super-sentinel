import { describe, it, expect } from 'vitest';
import { calculateTRACER } from '../scoring/tracer';
import { type SentinelResult } from '../types';

function makeSentinel(sentinel: string, score: number, passed = true): SentinelResult {
  return { sentinel, passed, score, data: {} };
}

describe('TRACER Scoring Engine', () => {
  it('should return correct structure with all fields', () => {
    const results: SentinelResult[] = [
      makeSentinel('health', 100),
      makeSentinel('tls', 90),
    ];

    const tracer = calculateTRACER(results);

    expect(tracer).toHaveProperty('total');
    expect(tracer).toHaveProperty('dimensions');
    expect(tracer).toHaveProperty('tier');
    expect(tracer).toHaveProperty('timestamp');
    expect(tracer).toHaveProperty('sentinelCount');
    expect(tracer.dimensions).toHaveProperty('trust');
    expect(tracer.dimensions).toHaveProperty('reliability');
    expect(tracer.dimensions).toHaveProperty('autonomy');
    expect(tracer.dimensions).toHaveProperty('capability');
    expect(tracer.dimensions).toHaveProperty('economics');
    expect(tracer.dimensions).toHaveProperty('reputation');
  });

  it('should score 100 when all sentinels pass with max score', () => {
    const results: SentinelResult[] = [
      makeSentinel('tls', 100),
      makeSentinel('proxy', 100),
      makeSentinel('oz-match', 100),
      makeSentinel('health', 100),
      makeSentinel('latency', 100),
      makeSentinel('mcp', 100),
      makeSentinel('a2a', 100),
      makeSentinel('on-chain', 100),
      makeSentinel('x402', 100),
    ];

    const tracer = calculateTRACER(results, 100);

    expect(tracer.total).toBe(100);
    expect(tracer.tier).toBe('VERIFIED');
    expect(tracer.sentinelCount).toBe(10); // 9 sentinels + 1 reputation
    expect(tracer.dimensions.trust.score).toBe(100);
    expect(tracer.dimensions.reliability.score).toBe(100);
    expect(tracer.dimensions.autonomy.score).toBe(100);
    expect(tracer.dimensions.capability.score).toBe(100);
    expect(tracer.dimensions.economics.score).toBe(100);
    expect(tracer.dimensions.reputation.score).toBe(100);
  });

  it('should score 0 when no sentinels provided', () => {
    const tracer = calculateTRACER([]);

    expect(tracer.total).toBe(0);
    expect(tracer.tier).toBe('FAIL');
    expect(tracer.sentinelCount).toBe(0);
  });

  it('should correctly classify VERIFIED tier (80-100)', () => {
    const results: SentinelResult[] = [
      makeSentinel('tls', 85),
      makeSentinel('proxy', 90),
      makeSentinel('oz-match', 85),
      makeSentinel('health', 80),
      makeSentinel('latency', 80),
      makeSentinel('mcp', 80),
      makeSentinel('a2a', 80),
      makeSentinel('on-chain', 80),
      makeSentinel('x402', 80),
    ];

    const tracer = calculateTRACER(results, 80);
    expect(tracer.tier).toBe('VERIFIED');
    expect(tracer.total).toBeGreaterThanOrEqual(80);
    expect(tracer.total).toBeLessThanOrEqual(100);
  });

  it('should correctly classify PASS tier (70-79)', () => {
    const results: SentinelResult[] = [
      makeSentinel('tls', 75),
      makeSentinel('proxy', 75),
      makeSentinel('oz-match', 75),
      makeSentinel('health', 75),
      makeSentinel('latency', 75),
      makeSentinel('mcp', 70),
      makeSentinel('a2a', 70),
      makeSentinel('on-chain', 70),
      makeSentinel('x402', 70),
    ];

    const tracer = calculateTRACER(results, 75);
    expect(tracer.tier).toBe('PASS');
    expect(tracer.total).toBeGreaterThanOrEqual(70);
    expect(tracer.total).toBeLessThanOrEqual(79);
  });

  it('should correctly classify PARTIAL tier (40-69)', () => {
    const results: SentinelResult[] = [
      makeSentinel('tls', 50),
      makeSentinel('proxy', 50),
      makeSentinel('oz-match', 50),
      makeSentinel('health', 50),
      makeSentinel('latency', 50),
      makeSentinel('mcp', 50),
      makeSentinel('a2a', 50),
      makeSentinel('on-chain', 50),
      makeSentinel('x402', 50),
    ];

    const tracer = calculateTRACER(results, 50);
    expect(tracer.tier).toBe('PARTIAL');
    expect(tracer.total).toBeGreaterThanOrEqual(40);
    expect(tracer.total).toBeLessThanOrEqual(69);
  });

  it('should correctly classify FAIL tier (0-39)', () => {
    const results: SentinelResult[] = [
      makeSentinel('tls', 10, false),
      makeSentinel('proxy', 0, false),
      makeSentinel('health', 0, false),
      makeSentinel('latency', 0, false),
    ];

    const tracer = calculateTRACER(results, 20);
    expect(tracer.tier).toBe('FAIL');
    expect(tracer.total).toBeGreaterThanOrEqual(0);
    expect(tracer.total).toBeLessThanOrEqual(39);
  });

  it('should average scores within a dimension when multiple sentinels feed it', () => {
    // Trust: tls=100, proxy=50, oz-match=80 → avg = 77 (rounded)
    const results: SentinelResult[] = [
      makeSentinel('tls', 100),
      makeSentinel('proxy', 50),
      makeSentinel('oz-match', 80),
    ];

    const tracer = calculateTRACER(results);
    // Trust gets avg of tls(100), proxy(50), oz-match(80) = 77 (rounded)
    expect(tracer.dimensions.trust.score).toBe(77);
    expect(tracer.dimensions.trust.sources).toContain('tls');
    expect(tracer.dimensions.trust.sources).toContain('proxy');
    expect(tracer.dimensions.trust.sources).toContain('oz-match');
  });

  it('should handle oz-match feeding both trust AND capability', () => {
    const results: SentinelResult[] = [
      makeSentinel('oz-match', 80),
    ];

    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.trust.score).toBe(80);
    expect(tracer.dimensions.capability.score).toBe(80);
    expect(tracer.dimensions.trust.sources).toContain('oz-match');
    expect(tracer.dimensions.capability.sources).toContain('oz-match');
  });

  it('should accept optional reputationScore for the reputation dimension', () => {
    const results: SentinelResult[] = [
      makeSentinel('health', 100),
    ];

    const withRep = calculateTRACER(results, 80);
    expect(withRep.dimensions.reputation.score).toBe(80);
    expect(withRep.dimensions.reputation.sources).toContain('ratings');

    const withoutRep = calculateTRACER(results);
    expect(withoutRep.dimensions.reputation.score).toBe(0);
  });

  it('should have dimension weights summing to 1.0', () => {
    const results: SentinelResult[] = [makeSentinel('health', 100)];
    const tracer = calculateTRACER(results);

    const dims = tracer.dimensions;
    const totalWeight =
      dims.trust.weight +
      dims.reliability.weight +
      dims.autonomy.weight +
      dims.capability.weight +
      dims.economics.weight +
      dims.reputation.weight;

    expect(totalWeight).toBeCloseTo(1.0, 10);
  });

  it('should clamp total score between 0 and 100', () => {
    const low = calculateTRACER([]);
    expect(low.total).toBeGreaterThanOrEqual(0);

    const high = calculateTRACER([
      makeSentinel('tls', 100),
      makeSentinel('proxy', 100),
      makeSentinel('oz-match', 100),
      makeSentinel('health', 100),
      makeSentinel('latency', 100),
      makeSentinel('mcp', 100),
      makeSentinel('a2a', 100),
      makeSentinel('on-chain', 100),
      makeSentinel('x402', 100),
    ], 100);
    expect(high.total).toBeLessThanOrEqual(100);
  });
});

describe('TRACER Edge Cases', () => {
  it('should clamp sentinel score > 100 to 100', () => {
    const results = [makeSentinel('tls', 200)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.trust.score).toBeLessThanOrEqual(100);
    expect(tracer.total).toBeLessThanOrEqual(100);
  });

  it('should clamp sentinel score < 0 to 0', () => {
    const results = [makeSentinel('health', -50)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.reliability.score).toBeGreaterThanOrEqual(0);
    expect(tracer.total).toBeGreaterThanOrEqual(0);
  });

  it('should treat NaN sentinel score as 0', () => {
    const results = [makeSentinel('tls', NaN)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.trust.score).toBe(0);
    expect(tracer.total).toBe(0);
  });

  it('should clamp reputationScore > 100 to 100', () => {
    const tracer = calculateTRACER([], 200);
    expect(tracer.dimensions.reputation.score).toBeLessThanOrEqual(100);
  });

  it('should clamp reputationScore < 0 to 0', () => {
    const tracer = calculateTRACER([], -50);
    expect(tracer.dimensions.reputation.score).toBeGreaterThanOrEqual(0);
  });

  it('should return 0 with empty results array', () => {
    const tracer = calculateTRACER([]);
    expect(tracer.total).toBe(0);
    expect(tracer.tier).toBe('FAIL');
    expect(tracer.sentinelCount).toBe(0);
  });

  it('should average duplicate sentinel entries for same name', () => {
    const results = [
      makeSentinel('health', 80),
      makeSentinel('health', 60),
    ];
    const tracer = calculateTRACER(results);
    // Both go into reliability: avg(80,60) = 70
    expect(tracer.dimensions.reliability.score).toBe(70);
    expect(tracer.sentinelCount).toBe(2);
  });

  it('should calculate dynamic score without capability and reputation', () => {
    // Tests the normalization logic when an agent lacks Capability and Reputation
    const results = [
      makeSentinel('tls', 100),
      makeSentinel('proxy', 100),
      makeSentinel('health', 100),
      makeSentinel('latency', 100),
      makeSentinel('mcp', 100),
      makeSentinel('a2a', 100),
      makeSentinel('x402', 100),
    ];
    const tracer = calculateTRACER(results);
    // Active weight = 0.65. Raw total = 65. Normalized = 65 / 0.65 = 100.
    expect(tracer.total).toBe(100);
    expect(tracer.tier).toBe('VERIFIED');
  });

  it('should produce exactly 60 when all sentinels score 60 (gaming test)', () => {
    const results = [
      makeSentinel('tls', 60),
      makeSentinel('proxy', 60),
      makeSentinel('oz-match', 60),
      makeSentinel('health', 60),
      makeSentinel('latency', 60),
      makeSentinel('mcp', 60),
      makeSentinel('a2a', 60),
      makeSentinel('on-chain', 60),
      makeSentinel('x402', 60),
    ];
    const tracer = calculateTRACER(results, 60);
    expect(tracer.total).toBe(60);
    expect(tracer.tier).toBe('PARTIAL');
  });

  it('should never produce total > 100 even with extreme inputs', () => {
    const results = [
      makeSentinel('tls', 999),
      makeSentinel('proxy', 999),
      makeSentinel('oz-match', 999),
      makeSentinel('health', 999),
      makeSentinel('latency', 999),
      makeSentinel('mcp', 999),
      makeSentinel('a2a', 999),
      makeSentinel('on-chain', 999),
      makeSentinel('x402', 999),
    ];
    const tracer = calculateTRACER(results, 999);
    expect(tracer.total).toBeLessThanOrEqual(100);
  });

  it('should never produce total < 0 even with negative inputs', () => {
    const results = [
      makeSentinel('tls', -999),
      makeSentinel('health', -999),
      makeSentinel('mcp', -999),
      makeSentinel('x402', -999),
    ];
    const tracer = calculateTRACER(results, -999);
    expect(tracer.total).toBeGreaterThanOrEqual(0);
  });

  it('should silently ignore unknown sentinel names', () => {
    const results = [
      makeSentinel('health', 100),
      makeSentinel('totally-unknown', 100),
    ];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.reliability.score).toBe(100);
    // Only reliability contributes. Active weight = 0.20. Normalized = 20 / 0.20 = 100
    expect(tracer.total).toBe(100);
  });

  it('should handle single sentinel correctly', () => {
    const results = [makeSentinel('x402', 90)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.economics.score).toBe(90);
    // Active active weight = 0.10. Raw total = 9. Normalized = 9 / 0.10 = 90
    expect(tracer.total).toBe(90);
    expect(tracer.tier).toBe('VERIFIED');
  });
});
