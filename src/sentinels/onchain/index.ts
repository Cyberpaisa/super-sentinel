import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:on-chain');

const DEFAULT_RPC_URL = 'https://api.avax.network/ext/bc/C/rpc';
const DEFAULT_TIMEOUT_MS = 10_000;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export interface OnChainData {
  isContract: boolean;
  codeSize: number;
  address: string;
}

/**
 * On-chain sentinel — checks whether an address is a contract on-chain.
 *
 * Uses raw JSON-RPC `eth_getCode` via fetch (no web3 dependency).
 *
 * Score:
 *  - Invalid address format          -> score = 0,  passed = false
 *  - EOA (no code, result = "0x")    -> score = 30, passed = false
 *  - Contract (code <= 1000 bytes)   -> score = 60, passed = true
 *  - Contract (code > 1000 bytes)    -> score = 80, passed = true
 */
export async function checkOnChain(
  address: string,
  rpcUrl: string = DEFAULT_RPC_URL
): Promise<SentinelResult> {
  // Validate address format
  if (!ADDRESS_REGEX.test(address)) {
    logger.warn({ address }, 'Invalid address format');
    return {
      sentinel: 'on-chain',
      passed: false,
      score: 0,
      data: { isContract: false, codeSize: 0, address },
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [address, 'latest'],
        id: 1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorMsg = `RPC responded with status ${response.status}`;
      logger.warn({ address, rpcUrl, status: response.status }, errorMsg);
      return {
        sentinel: 'on-chain',
        passed: false,
        score: 0,
        data: { isContract: false, codeSize: 0, address },
      };
    }

    const json = (await response.json()) as { result?: string; error?: { message: string } };

    if (json.error) {
      logger.warn({ address, rpcUrl, error: json.error.message }, 'RPC returned error');
      return {
        sentinel: 'on-chain',
        passed: false,
        score: 0,
        data: { isContract: false, codeSize: 0, address },
      };
    }

    const code = json.result ?? '0x';
    // Code is hex-encoded; each byte = 2 hex chars. Remove "0x" prefix.
    const codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
    const isContract = codeSize > 0;

    let score: number;
    let passed: boolean;

    if (!isContract) {
      score = 30;
      passed = false;
    } else if (codeSize > 1000) {
      score = 80;
      passed = true;
    } else {
      score = 60;
      passed = true;
    }

    logger.info({ address, isContract, codeSize, score, passed }, 'On-chain check completed');

    return {
      sentinel: 'on-chain',
      passed,
      score,
      data: { isContract, codeSize, address },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = isTimeout
      ? `Timed out after ${DEFAULT_TIMEOUT_MS}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.warn({ address, rpcUrl, error: errorMessage }, 'On-chain check failed');

    return {
      sentinel: 'on-chain',
      passed: false,
      score: 0,
      data: { isContract: false, codeSize: 0, address },
    };
  }
}
