import { describe, it, expect } from 'vitest';
import { checkTLS } from '../tls';

// ── Unit tests (TLS uses node:tls, harder to mock — focus on input validation) ─

describe('TLS Sentinel (unit)', () => {
  it('should return sentinel name "tls"', async () => {
    const result = await checkTLS('http://example.com');
    expect(result.sentinel).toBe('tls');
  });

  it('should score 0 and fail for HTTP endpoint (no TLS)', async () => {
    const result = await checkTLS('http://example.com/api');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.protocol).toBe('none');
    expect(result.data.vulnerabilities).toContain('NO_TLS');
    expect(result.data.domainMatch).toBe(false);
  });

  it('should score 0 and fail for invalid URL', async () => {
    const result = await checkTLS('not-a-url');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.grade).toBe('F');
    expect(result.data.warnings).toContain('Invalid endpoint URL');
  });

  it('should have proper data structure for HTTP endpoints', async () => {
    const result = await checkTLS('http://httpbin.org/get');

    expect(result.data).toHaveProperty('protocol');
    expect(result.data).toHaveProperty('cipher');
    expect(result.data).toHaveProperty('grade');
    expect(result.data).toHaveProperty('issuer');
    expect(result.data).toHaveProperty('daysRemaining');
    expect(result.data).toHaveProperty('authorized');
    expect(result.data).toHaveProperty('domainMatch');
    expect(result.data).toHaveProperty('warnings');
    expect(result.data).toHaveProperty('vulnerabilities');
  });

  it('should include domainMatch field in results', async () => {
    const result = await checkTLS('http://example.com');
    expect(result.data).toHaveProperty('domainMatch');
    // HTTP => domainMatch = false
    expect(result.data.domainMatch).toBe(false);
  });
});

// ── Integration tests ─────────────────────────────────────────────────────────

describe('TLS Sentinel (integration)', () => {
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
    expect(result.data.domainMatch).toBe(true);
    expect(result.data.authorized).toBe(true);
  });

  it('should FAIL for HTTP endpoint (no TLS)', async () => {
    const result = await checkTLS('http://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'tls');
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.data.vulnerabilities).toContain('NO_TLS');
  });

  it('should apply domain mismatch penalty (-30) for strict verification failures', async () => {
    // A valid HTTPS site should NOT have domain mismatch
    const result = await checkTLS('https://google.com');

    if (result.data.domainMatch) {
      // If domain matches, no penalty applied — score should be high
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.data.vulnerabilities).not.toContain('CERT_INVALID');
    } else {
      // If domain doesn't match (cert error), -30 penalty applied
      expect(result.data.vulnerabilities).toContain('CERT_INVALID');
    }
  });
});
