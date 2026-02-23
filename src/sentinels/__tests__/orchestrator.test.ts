import { describe, it, expect } from 'vitest';
import { runEndpointSentinels } from '../index';

describe('Sentinel Orchestrator', () => {
  it('should run all endpoint sentinels in parallel against httpbin.org', async () => {
    const result = await runEndpointSentinels('https://httpbin.org/get');

    // Structure checks
    expect(result).toHaveProperty('target', 'https://httpbin.org/get');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('summary');

    // Should have run 3 sentinels: health, tls, latency
    expect(result.summary.total).toBe(3);
    expect(result.results.length + result.errors.length).toBe(3);

    // Each result has the uniform SentinelResult shape
    for (const r of result.results) {
      expect(r).toHaveProperty('sentinel');
      expect(r).toHaveProperty('passed');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('data');
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(typeof r.sentinel).toBe('string');
      expect(typeof r.passed).toBe('boolean');
    }

    // Verify sentinel names
    const names = result.results.map((r) => r.sentinel);
    expect(names).toContain('health');

    // Summary stats should be consistent
    expect(result.summary.passed).toBeGreaterThanOrEqual(0);
    expect(result.summary.failed).toBeGreaterThanOrEqual(0);
    expect(result.summary.errored).toBeGreaterThanOrEqual(0);
    expect(result.summary.passed + result.summary.failed + result.summary.errored).toBe(3);
    expect(result.summary.averageScore).toBeGreaterThanOrEqual(0);
    expect(result.summary.averageScore).toBeLessThanOrEqual(100);
  });
});
