import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { avalanche, avalancheFuji } from './config';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

/**
 * Wagmi configuration for Enigma
 * Supports Avalanche mainnet and Fuji testnet
 */
export const wagmiConfig = createConfig({
  chains: [avalanche, avalancheFuji],
  connectors: [
    injected(),
    ...(projectId ? [
      walletConnect({
        projectId,
        metadata: {
          name: 'SuperSentinel',
          description: 'Advanced monitoring and security platform for autonomous agents',
          url: 'https://supersentinel.io',
          icons: ['https://supersentinel.io/logo.png'],
        },
      })
    ] : []),
  ],
  transports: {
    [avalanche.id]: http(),
    [avalancheFuji.id]: http(),
  },
  ssr: true,
});

/**
 * Export chain configurations for convenience
 */
export { avalanche, avalancheFuji };

/**
 * Default chain (Fuji for development)
 */
export const defaultChain =
  process.env.NEXT_PUBLIC_CHAIN_ENV === 'mainnet' ? avalanche : avalancheFuji;
