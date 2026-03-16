import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkLatency } from '../latency';

// ── Unit tests with mocked fetch ──────────────────────────────────────────────

describe('Latency Sentinel (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should return sentinel name "latency"', async () => {
    // All 20 samples succeed instantly
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const result = await checkLatency('https://example.com');
    expect(result.sentinel).toBe('latency');
  });

  it('should score 0 and fail when all samples fail (0/20 successful)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));

    const result = await checkLatency('https://example.com');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.samples).toBe(0);
    expect(result.data.successRate).toBe(0);
    expect(result.data.p50).toBeNull();
    expect(result.data.p95).toBeNull();
    expect(result.data.p99).toBeNull();
  });

  it('should score 0 and fail with insufficient samples (< 5/20 successful)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('fail'));
    });

    const result = await checkLatency('https://example.com');

    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.data.samples).toBe(3);
    expect(result.data.samples).toBeLessThan(5);
    // Even though there are some results, score is 0 due to insufficient samples
    expect(result.data.p50).not.toBeNull();
    expect(result.data.successRate).toBeCloseTo(3 / 20, 2);
  });

  it('should include successRate field in data', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 10) {
        return Promise.resolve({ ok: true });
      }
      return Promise.reject(new Error('fail'));
    });

    const result = await checkLatency('https://example.com');

    expect(result.data).toHaveProperty('successRate');
    expect(result.data.successRate).toBeCloseTo(10 / 20, 2);
  });

  it('should score based on p95 when enough samples succeed', async () => {
    // All samples succeed (very fast, < 500ms since mocked)
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await checkLatency('https://example.com');

    expect(result.data.samples).toBe(20);
    expect(result.data.successRate).toBe(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.passed).toBe(result.score >= 50);
    // With mocked fetch (near-instant), p95 < 500ms => score = 100
    expect(result.score).toBe(100);
  });

  it('should have p50 <= p95 <= p99 ordering', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await checkLatency('https://example.com');

    expect(result.data.p95).toBeGreaterThanOrEqual(result.data.p50);
    expect(result.data.p99).toBeGreaterThanOrEqual(result.data.p95);
  });

  it('should have minMs <= avgMs <= maxMs', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await checkLatency('https://example.com');

    expect(result.data.minMs).toBeLessThanOrEqual(result.data.avgMs);
    expect(result.data.maxMs).toBeGreaterThanOrEqual(result.data.avgMs);
  });

  it('should pass when score >= 50', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });

    const result = await checkLatency('https://example.com');

    if (result.score >= 50) {
      expect(result.passed).toBe(true);
    } else {
      expect(result.passed).toBe(false);
    }
  });

  it('should include error message when insufficient samples', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('fail'));

    const result = await checkLatency('https://example.com');

    expect(result.data).toHaveProperty('error');
    expect(result.data.error).toContain('samples succeeded');
    expect(result.data.error).toContain('minimum');
  });
});

// ── Integration test ──────────────────────────────────────────────────────────

describe('Latency Sentinel (integration)', () => {
  it('should measure latency with 20 samples against httpbin.org', async () => {
    const result = await checkLatency('https://httpbin.org/get');

    expect(result).toHaveProperty('sentinel', 'latency');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('data');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    // In environments without external network access, all samples may fail.
    if (result.data.samples === 0) {
      expect(result.data.successRate).toBe(0);
      expect(result.data).toHaveProperty('error');
      return;
    }

    // Should have collected samples
    expect(result.data.samples).toBeGreaterThan(0);
    expect(result.data.samples).toBeLessThanOrEqual(20);

    // successRate should be present
    expect(result.data).toHaveProperty('successRate');
    expect(result.data.successRate).toBeGreaterThan(0);
    expect(result.data.successRate).toBeLessThanOrEqual(1);

    // If enough samples, percentiles should be present and positive
    if (result.data.samples >= 5) {
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
    }
  });
});
