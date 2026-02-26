import { createPublicClient, http, fallback } from 'viem';
import { avalanche, avalancheFuji } from './config';

/**
 * Public client configuration for reading from Avalanche blockchain
 * Uses fallback transport — if the primary RPC endpoint fails, subsequent
 * transports are tried automatically.
 *
 * @see docs/blockchain/overview.md
 */

/**
 * Determine active chain based on environment
 */
const CHAIN_ENV = process.env.NEXT_PUBLIC_CHAIN_ENV || 'testnet';
const ACTIVE_CHAIN = CHAIN_ENV === 'mainnet' ? avalanche : avalancheFuji;

/**
 * Build transport array with fallback support.
 * Primary: env-provided or default public RPC
 * Fallback: AVALANCHE_RPC_FALLBACK_URL if set (server-side only)
 */
function buildTransports() {
  const httpOptions = { batch: true, retryCount: 3, retryDelay: 1000, timeout: 10_000 };

  if (CHAIN_ENV === 'mainnet') {
    const primary = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';
    const fallbackUrl = process.env.AVALANCHE_RPC_FALLBACK_URL;

    const transports = [http(primary, httpOptions)];
    if (fallbackUrl) {
      transports.push(http(fallbackUrl, httpOptions));
    }
    // Always add public endpoint as last resort if primary is custom
    if (primary !== 'https://api.avax.network/ext/bc/C/rpc') {
      transports.push(http('https://api.avax.network/ext/bc/C/rpc', httpOptions));
    }
    return transports;
  }

  // Testnet
  const primary = 'https://api.avax-test.network/ext/bc/C/rpc';
  const fallbackUrl = process.env.AVALANCHE_RPC_FALLBACK_URL;

  const transports = [http(primary, httpOptions)];
  if (fallbackUrl) {
    transports.push(http(fallbackUrl, httpOptions));
  }
  return transports;
}

/**
 * Public client for reading contract data from Avalanche.
 * Configured with:
 * - Fallback transport (automatic failover between RPC providers)
 * - Batch requests for efficiency
 * - Automatic retry with exponential backoff per transport
 */
export const publicClient = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: fallback(buildTransports(), {
    rank: true,
    retryCount: 2,
  }),
});

/**
 * Chain configuration helpers
 */
export const getActiveChain = () => ACTIVE_CHAIN;
export const getActiveChainId = () => ACTIVE_CHAIN.id;
export const isMainnet = () => CHAIN_ENV === 'mainnet';
export const isTestnet = () => CHAIN_ENV === 'testnet';
