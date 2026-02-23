import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:health');

const DEFAULT_TIMEOUT_MS = 5_000;

export interface HealthData {
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorMessage?: string;
}

/**
 * Health sentinel — real HTTP HEAD fetch with AbortController timeout.
 *
 * Pure function: receives an endpoint URL, returns SentinelResult.
 * Replaces the heartbeat-service single-ping logic with a standalone check.
 *
 * Score:
 *  - 200-299 response  → 100
 *  - 3xx redirect       →  70
 *  - 4xx client error   →  30
 *  - 5xx server error   →  10
 *  - timeout / error    →   0
 */
export async function checkHealth(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseTimeMs = Date.now() - start;
    const statusCode = response.status;

    let score: number;
    if (statusCode >= 200 && statusCode < 300) {
      score = 100;
    } else if (statusCode >= 300 && statusCode < 400) {
      score = 70;
    } else if (statusCode >= 400 && statusCode < 500) {
      score = 30;
    } else {
      score = 10;
    }

    logger.info({ endpoint, statusCode, responseTimeMs, score }, 'Health check completed');

    return {
      sentinel: 'health',
      passed: score >= 50,
      score,
      data: {
        reachable: true,
        statusCode,
        responseTimeMs,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - start;
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = isTimeout
      ? `Timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.warn({ endpoint, error: errorMessage }, 'Health check failed');

    return {
      sentinel: 'health',
      passed: false,
      score: 0,
      data: {
        reachable: false,
        statusCode: null,
        responseTimeMs: isTimeout ? null : responseTimeMs,
        errorMessage,
      },
    };
  }
}
