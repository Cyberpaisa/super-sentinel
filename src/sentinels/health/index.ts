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
 * Try a HEAD request to the given URL and return status + timing.
 */
async function headCheck(
  url: string,
  timeoutMs: number
): Promise<{ statusCode: number; responseTimeMs: number } | { error: string; responseTimeMs: number | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeoutId);
    return { statusCode: response.status, responseTimeMs: Date.now() - start };
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - start;
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    return {
      error: isTimeout ? `Timed out after ${timeoutMs}ms` : error instanceof Error ? error.message : 'Unknown error',
      responseTimeMs: isTimeout ? null : responseTimeMs,
    };
  }
}

/**
 * Health sentinel — probes /health, /api/health, and / to find a 2xx endpoint.
 *
 * Agents may return 402 at the root for x402 support while keeping a dedicated
 * health endpoint. This sentinel tries common health paths first.
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
  const base = endpoint.replace(/\/+$/, '');
  const candidates = [`${base}/health`, `${base}/api/health`, endpoint];

  let bestScore = 0;
  let bestStatus: number | null = null;
  let bestTime: number | null = null;
  let lastError: string | undefined;

  for (const url of candidates) {
    const result = await headCheck(url, timeoutMs);

    if ('error' in result) {
      lastError = result.error;
      continue;
    }

    const { statusCode, responseTimeMs } = result;
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

    if (score > bestScore) {
      bestScore = score;
      bestStatus = statusCode;
      bestTime = responseTimeMs;
    }

    // 2xx is perfect — no need to try more paths
    if (score === 100) break;
  }

  if (bestStatus !== null) {
    logger.info({ endpoint, statusCode: bestStatus, responseTimeMs: bestTime, score: bestScore }, 'Health check completed');
    return {
      sentinel: 'health',
      passed: bestScore >= 50,
      score: bestScore,
      data: { reachable: true, statusCode: bestStatus, responseTimeMs: bestTime },
    };
  }

  logger.warn({ endpoint, error: lastError }, 'Health check failed');
  return {
    sentinel: 'health',
    passed: false,
    score: 0,
    data: { reachable: false, statusCode: null, responseTimeMs: null, errorMessage: lastError },
  };
}
