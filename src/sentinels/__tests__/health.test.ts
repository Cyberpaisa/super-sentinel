import { describe, it, expect } from 'vitest';
import { checkHealth } from '../health';

describe('Health Sentinel', () => {
  it('should PASS for a reachable endpoint (httpbin.org)', async () => {
    const result = await checkHealth('https://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'health');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(true);
    expect(result.data.reachable).toBe(true);
    expect(result.data.statusCode).toBe(200);
    expect(result.data.responseTimeMs).toBeGreaterThan(0);
  });

  it('should FAIL for an unreachable endpoint (fake.invalid)', async () => {
    const result = await checkHealth('https://fake.invalid');

    expect(result).toHaveProperty('sentinel', 'health');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.reachable).toBe(false);
    expect(result.data.errorMessage).toBeDefined();
  });
});
