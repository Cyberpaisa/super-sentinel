import { describe, it, expect } from 'vitest';
import { checkLatency } from '../latency';

describe('Latency Sentinel', () => {
  it('should measure latency with 20 samples against httpbin.org', async () => {
    const result = await checkLatency('https://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'latency');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // Should have collected samples
    expect(result.data.samples).toBeGreaterThan(0);
    expect(result.data.samples).toBeLessThanOrEqual(20);

    // Percentiles should be present and positive
    expect(result.data.p50).toBeGreaterThan(0);
    expect(result.data.p95).toBeGreaterThan(0);
    expect(result.data.p99).toBeGreaterThan(0);
    expect(result.data.avgMs).toBeGreaterThan(0);

    // p50 <= p95 <= p99
    expect(result.data.p95).toBeGreaterThanOrEqual(result.data.p50);
    expect(result.data.p99).toBeGreaterThanOrEqual(result.data.p95);

    // Min and max should be present
    expect(result.data.minMs).toBeGreaterThan(0);
    expect(result.data.maxMs).toBeGreaterThanOrEqual(result.data.minMs);
  });
});
