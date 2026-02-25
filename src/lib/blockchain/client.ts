import { createPublicClient, http, fallback } from 'viem';
import { avalanche, avalancheFuji } from './config';

/**
 * Public client configuration for reading from Avalanche blockchain
 * @see docs/blockchain/overview.md
 * @see docs/architecture/tech-stack.md
 */

/**
 * Determine active chain based on environment
 */
const CHAIN_ENV = process.env.NEXT_PUBLIC_CHAIN_ENV || 'testnet';
const ACTIVE_CHAIN = CHAIN_ENV === 'mainnet' ? avalanche : avalancheFuji;

/**
 * Get RPC URL based on environment
 */
const getRpcUrl = () => {
  if (CHAIN_ENV === 'mainnet') {
    return (
      process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ||
      'https://api.avax.network/ext/bc/C/rpc'
    );
  }
  return 'https://api.avax-test.network/ext/bc/C/rpc';
};

/**
 * Public client for reading contract data from Avalanche
 * Configured with:
 * - Batch requests for efficiency
 * - Automatic retry with exponential backoff
 * - Support for both mainnet and Fuji testnet
 */
export const publicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: CHAIN_ENV === 'mainnet'
    ? fallback([
        http(getRpcUrl(), {
          batch: true,
          retryCount: 3,
          retryDelay: 1000,
          timeout: 10_000,
        }),
        http('https://avalanche-c-chain-rpc.publicnode.com', {
          batch: true,
          retryCount: 2,
          timeout: 10_000,
        }),
        http('https://rpc.ankr.com/avalanche', {
          batch: true,
          retryCount: 2,
          timeout: 10_000,
        }),
      ])
    : http(getRpcUrl(), {
        batch: true,
        retryCount: 3,
        retryDelay: 1000,
        timeout: 10_000,
      }),
});

/**
 * Chain configuration helpers
 */
export const getActiveChain = () => ACTIVE_CHAIN;
export const getActiveChainId = () => ACTIVE_CHAIN.id;
export const isMainnet = () => CHAIN_ENV === 'mainnet';
export const isTestnet = () => CHAIN_ENV === 'testnet';
