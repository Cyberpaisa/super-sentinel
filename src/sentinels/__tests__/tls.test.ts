import { describe, it, expect } from 'vitest';
import { checkTLS } from '../tls';

describe('TLS Sentinel', () => {
  it('should validate TLS for google.com (valid cert)', async () => {
    const result = await checkTLS('https://google.com');

    expect(result).toHaveProperty('sentinel', 'tls');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.data.protocol).toBeTruthy();
    expect(result.data.cipher).toBeTruthy();
    expect(result.data.grade).toMatch(/^(A\+|A|B)$/);
    expect(result.data.daysRemaining).toBeGreaterThan(0);
  });

  it('should FAIL for HTTP endpoint (no TLS)', async () => {
    const result = await checkTLS('http://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'tls');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.vulnerabilities).toContain('NO_TLS');
  });
});
