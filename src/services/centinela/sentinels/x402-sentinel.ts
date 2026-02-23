import { createLogger } from '@/lib/utils/logger';
import { resolveAgentEndpoint } from './resolve-endpoint';
import { prisma } from '@/lib/database/prisma';

const logger = createLogger('x402-sentinel');

const X402_TIMEOUT_MS = 10_000;

// CAIP-10 pattern: eip155:<chainId>:<address>
const CAIP10_REGEX = /^eip155:\d+:0x[a-fA-F0-9]{40}$/;

export interface X402Result {
  passed: boolean;
  score: number;
  supported: boolean;
  headers: Record<string, string>;
  price: string | null;
  currency: string | null;
  network: string | null;
  recipient: string | null;
}

/**
 * Check x402 payment protocol support by probing for HTTP 402 responses.
 * Validates X-402-* headers and CAIP-10 recipient address format.
 */
export async function checkX402(agentAddress: string): Promise<X402Result> {
  const endpoint = await resolveAgentEndpoint(agentAddress);

  if (!endpoint) {
    return {
      passed: false,
      score: 0,
      supported: false,
      headers: {},
      price: null,
      currency: null,
      network: null,
      recipient: null,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), X402_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.status === 402) {
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

      let score: number;
      if (hasHeaders && validRecipient) {
        score = 90;
      } else if (hasHeaders) {
        score = 70;
      } else {
        score = 60;
      }

      logger.info({ agentAddress, score, headers, validRecipient }, 'x402 check completed — 402 detected');

      return {
        passed: true,
        score,
        supported: true,
        headers,
        price,
        currency,
        network,
        recipient,
      };
    }

    // No 402 response — check metadata for x402Support flag
    const agent = await prisma.agent.findUnique({
      where: { address: agentAddress },
      select: { metadata: true },
    });

    let metadataSupport = false;
    if (agent?.metadata && typeof agent.metadata === 'object') {
      const meta = agent.metadata as Record<string, unknown>;
      metadataSupport = meta.x402Support === true || meta['x402-support'] === true;
    }

    if (metadataSupport) {
      logger.info({ agentAddress }, 'x402 check — metadata claims support but no 402 response');
      return {
        passed: true,
        score: 40,
        supported: true,
        headers: {},
        price: null,
        currency: null,
        network: null,
        recipient: null,
      };
    }

    logger.info({ agentAddress, status: response.status }, 'x402 check — no 402 support detected');
    return {
      passed: false,
      score: 0,
      supported: false,
      headers: {},
      price: null,
      currency: null,
      network: null,
      recipient: null,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    logger.error({ agentAddress, error: isTimeout ? 'timeout' : (error instanceof Error ? error.message : 'unknown') }, 'x402 check failed');

    return {
      passed: false,
      score: 0,
      supported: false,
      headers: {},
      price: null,
      currency: null,
      network: null,
      recipient: null,
    };
  }
}
