import { describe, it, expect } from 'vitest';
import { runEndpointSentinels } from '../index';
import { calculateTRACER } from '../scoring';
import { type TRACERScore } from '../scoring/types';

/**
 * Integration test: simulates what the POST /api/v1/sentinel/scan route does.
 * Tests the full pipeline: runEndpointSentinels → calculateTRACER → TRACERScore.
 */
describe('Sentinel Scan Pipeline (API simulation)', () => {
  it('should produce a valid TRACER score from real endpoint sentinels', async () => {
    // Step 1: Run endpoint sentinels against a real endpoint
    const orchestratorResult = await runEndpointSentinels('https://httpbin.org/get');

    expect(orchestratorResult.results.length).toBeGreaterThan(0);
    expect(orchestratorResult.summary.total).toBe(3);

    // Step 2: Calculate TRACER from sentinel results
    const tracer: TRACERScore = calculateTRACER(orchestratorResult.results);

    // Step 3: Validate TRACER structure
    expect(tracer).toHaveProperty('total');
    expect(tracer).toHaveProperty('dimensions');
    expect(tracer).toHaveProperty('tier');
    expect(tracer).toHaveProperty('timestamp');
    expect(tracer).toHaveProperty('sentinelCount');

    // Score in valid range
    expect(tracer.total).toBeGreaterThanOrEqual(0);
    expect(tracer.total).toBeLessThanOrEqual(100);

    // All 6 dimensions present
    const dims = tracer.dimensions;
    expect(dims).toHaveProperty('trust');
    expect(dims).toHaveProperty('reliability');
    expect(dims).toHaveProperty('autonomy');
    expect(dims).toHaveProperty('capability');
    expect(dims).toHaveProperty('economics');
    expect(dims).toHaveProperty('reputation');

    // Each dimension has proper structure
    for (const dim of Object.values(dims)) {
      expect(dim).toHaveProperty('name');
      expect(dim).toHaveProperty('score');
      expect(dim).toHaveProperty('weight');
      expect(dim).toHaveProperty('weighted');
      expect(dim).toHaveProperty('sources');
      expect(dim.score).toBeGreaterThanOrEqual(0);
      expect(dim.score).toBeLessThanOrEqual(100);
    }

    // Tier is valid
    expect(['VERIFIED', 'PASS', 'PARTIAL', 'FAIL']).toContain(tracer.tier);

    // Reliability should have data from health + latency
    expect(dims.reliability.sources.length).toBeGreaterThan(0);
    expect(dims.reliability.score).toBeGreaterThan(0);

    // Trust should have data from TLS
    expect(dims.trust.sources).toContain('tls');
    expect(dims.trust.score).toBeGreaterThan(0);
  });

  it('should produce FAIL tier when no sentinels return data', () => {
    const tracer = calculateTRACER([]);

    expect(tracer.total).toBe(0);
    expect(tracer.tier).toBe('FAIL');
    expect(tracer.sentinelCount).toBe(0);
  });

  it('should simulate API response shape', async () => {
    const orchestratorResult = await runEndpointSentinels('https://httpbin.org/get');
    const tracerScore = calculateTRACER(orchestratorResult.results);

    // Simulate the API response shape
    const apiResponse = {
      data: {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        endpoint: 'https://httpbin.org/get',
        orchestrator: orchestratorResult,
        tracer: tracerScore,
      },
      error: null,
    };

    expect(apiResponse.data).toHaveProperty('address');
    expect(apiResponse.data).toHaveProperty('endpoint');
    expect(apiResponse.data).toHaveProperty('orchestrator');
    expect(apiResponse.data).toHaveProperty('tracer');
    expect(apiResponse.error).toBeNull();
    expect(apiResponse.data.tracer.tier).toBeDefined();
    expect(apiResponse.data.orchestrator.summary.total).toBe(3);
  });
});
