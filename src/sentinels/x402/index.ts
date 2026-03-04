import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:x402');

const DEFAULT_TIMEOUT_MS = 10_000;

// CAIP-10 pattern: eip155:<chainId>:<address>
const CAIP10_REGEX = /^eip155:\d+:0x[a-fA-F0-9]{40}$/;

export interface X402Data {
  supported: boolean;
  statusCode: number | null;
  headers: Record<string, string>;
  price: string | null;
  currency: string | null;
  network: string | null;
  recipient: string | null;
  validRecipient: boolean;
  errorMessage?: string;
}

/**
 * x402 sentinel — sends a HEAD request and checks for HTTP 402 payment headers.
 *
 * Pure function: receives an endpoint URL, returns SentinelResult.
 *
 * Score tiers:
 *  - Non-402 response                              → score = 0, fail
 *  - 402 but NO X-402 headers                      → score = 20, fail
 *  - 402 with some X-402 headers, no valid CAIP-10 → score = 70, pass
 *  - 402 with headers AND valid CAIP-10 recipient  → score = 100, pass
 *  - passed = score >= 50 (consistent with other sentinels)
 *  - Error or timeout → 0
 */
export async function checkX402(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const statusCode = response.status;

    if (statusCode !== 402) {
      logger.info({ endpoint, statusCode }, 'x402 check — no 402 support detected');
      return {
        sentinel: 'x402',
        passed: false,
        score: 0,
        data: {
          supported: false,
          statusCode,
          headers: {},
          price: null,
          currency: null,
          network: null,
          recipient: null,
          validRecipient: false,
        },
      };
    }

    // Extract X-402-* headers
    const headers: Record<string, string> = {};
    const price = response.headers.get('x-402-price');
    const currency = response.headers.get('x-402-currency');
    const network = response.headers.get('x-402-network');
    const recipient = response.headers.get('x-402-recipient');

    if (price) headers['X-402-Price'] = price;
    if (currency) headers['X-402-Currency'] = currency;
    if (network) headers['X-402-Network'] = network;
    if (recipient) headers['X-402-Recipient'] = recipient;

    const hasHeaders = Object.keys(headers).length > 0;
    const validRecipient = recipient ? CAIP10_REGEX.test(recipient) : false;

    // Score tiers: no headers = 20 (fail), headers w/o CAIP-10 = 70, headers + CAIP-10 = 100
    let score: number;
    if (hasHeaders && validRecipient) {
      score = 100;
    } else if (hasHeaders) {
      score = 70;
    } else {
      score = 20; // 402 without any X-402 headers — not a proper x402 implementation
    }

    logger.info({ endpoint, score, headers, validRecipient }, 'x402 check completed — 402 detected');

    return {
      sentinel: 'x402',
      passed: score >= 50,
      score,
      data: {
        supported: true,
        statusCode,
        headers,
        price,
        currency,
        network,
        recipient,
        validRecipient,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = isTimeout
      ? `Timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.warn({ endpoint, error: errorMessage }, 'x402 check failed');

    return {
      sentinel: 'x402',
      passed: false,
      score: 0,
      data: {
        supported: false,
        statusCode: null,
        headers: {},
        price: null,
        currency: null,
        network: null,
        recipient: null,
        validRecipient: false,
        errorMessage,
      },
    };
  }
}
