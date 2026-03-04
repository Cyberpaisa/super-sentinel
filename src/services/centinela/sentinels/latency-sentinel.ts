import { createLogger } from '@/lib/utils/logger';
import { resolveAgentEndpoint } from './resolve-endpoint';

const logger = createLogger('latency-sentinel');

const LATENCY_TIMEOUT_MS = 10_000;
const SAMPLE_COUNT = 20;

export interface LatencyResult {
  passed: boolean;
  score: number;
  samples: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avgMs: number | null;
}

function percentile(sorted: number[], p: number): number {
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function scoreFromP95(p95: number): number {
  if (p95 < 500) return 100;
  if (p95 < 1000) return 80;
  if (p95 < 2000) return 60;
  if (p95 < 5000) return 40;
  return 20;
}

/**
 * Measure latency to an agent endpoint with 20 HEAD request samples.
 * Calculates p50, p95, p99 and scores based on p95 latency.
 */
export async function checkLatency(agentAddress: string): Promise<LatencyResult> {
  const endpoint = await resolveAgentEndpoint(agentAddress);

  if (!endpoint) {
    return {
      passed: false,
      score: 0,
      samples: 0,
      p50: null,
      p95: null,
      p99: null,
      avgMs: null,
    };
  }

  const times: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LATENCY_TIMEOUT_MS);
    const start = Date.now();

    try {
      await fetch(endpoint, { method: 'HEAD', signal: controller.signal });
      times.push(Date.now() - start);
    } catch {
      // Skip failed samples
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (times.length === 0) {
    logger.warn({ agentAddress }, 'All latency samples failed');
    return {
      passed: false,
      score: 0,
      samples: 0,
      p50: null,
      p95: null,
      p99: null,
      avgMs: null,
    };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const score = scoreFromP95(p95);

  logger.info({ agentAddress, samples: times.length, p50, p95, p99, avgMs, score }, 'Latency check completed');

  return {
    passed: score >= 40,
    score,
    samples: times.length,
    p50,
    p95,
    p99,
    avgMs,
  };
}
