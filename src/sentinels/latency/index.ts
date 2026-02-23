import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:latency');

const DEFAULT_TIMEOUT_MS = 10_000;
const SAMPLE_COUNT = 20;
const MIN_SUCCESS_SAMPLES = 5;

export interface LatencyData {
  samples: number;
  successRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * Latency sentinel — 20 HEAD samples, calculates p50/p95/p99.
 *
 * Pure function: receives an endpoint URL, returns SentinelResult.
 *
 * Score based on p95:
 *  - p95 < 500ms  → 100
 *  - p95 < 1000ms →  80
 *  - p95 < 2000ms →  60
 *  - p95 < 5000ms →  40
 *  - p95 >= 5000ms →  20
 */
export async function checkLatency(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  const times: number[] = [];

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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

  const successRate = times.length / SAMPLE_COUNT;

  if (times.length === 0) {
    logger.warn({ endpoint }, 'All latency samples failed');
    return {
      sentinel: 'latency',
      passed: false,
      score: 0,
      data: {
        samples: 0, successRate, p50: null, p95: null, p99: null, avgMs: null, minMs: null, maxMs: null,
        error: `Only 0/${SAMPLE_COUNT} samples succeeded (minimum ${MIN_SUCCESS_SAMPLES} required)`,
      },
    };
  }

  const sorted = [...times].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);
  const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  const minMs = sorted[0];
  const maxMs = sorted[sorted.length - 1];

  if (times.length < MIN_SUCCESS_SAMPLES) {
    logger.warn(
      { endpoint, samples: times.length, successRate },
      'Insufficient successful latency samples',
    );
    return {
      sentinel: 'latency',
      passed: false,
      score: 0,
      data: {
        samples: times.length, successRate, p50, p95, p99, avgMs, minMs, maxMs,
        error: `Only ${times.length}/${SAMPLE_COUNT} samples succeeded (minimum ${MIN_SUCCESS_SAMPLES} required)`,
      },
    };
  }

  let score: number;
  if (p95 < 500) score = 100;
  else if (p95 < 1000) score = 80;
  else if (p95 < 2000) score = 60;
  else if (p95 < 5000) score = 40;
  else score = 20;

  logger.info({ endpoint, samples: times.length, successRate, p50, p95, p99, avgMs, score }, 'Latency check completed');

  return {
    sentinel: 'latency',
    passed: score >= 50,
    score,
    data: { samples: times.length, successRate, p50, p95, p99, avgMs, minMs, maxMs },
  };
}
