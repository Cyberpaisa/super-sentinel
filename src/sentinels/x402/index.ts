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
 * Score:
 *  - 402 status + valid X-402 headers + CAIP-10 recipient → 90
 *  - 402 status without valid headers → 60
 *  - Non-402 status → 0
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

    // Score: 402 + valid headers + CAIP-10 recipient = 90, 402 without headers = 60
    let score: number;
    if (hasHeaders && validRecipient) {
      score = 90;
    } else if (hasHeaders) {
      score = 70;
    } else {
      score = 60;
    }

    logger.info({ endpoint, score, headers, validRecipient }, 'x402 check completed — 402 detected');

    return {
      sentinel: 'x402',
      passed: true,
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
