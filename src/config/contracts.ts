import type { Address } from 'viem';

/**
 * Official ERC-8004 contract addresses on Avalanche C-Chain.
 * Single source of truth — import from here instead of hardcoding addresses.
 */

export const ERC8004_CONTRACTS = {
  identity: {
    mainnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
    testnet: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
  },
  reputation: {
    mainnet: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address,
    testnet: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address,
  },
} as const;

export type Network = 'mainnet' | 'testnet';
