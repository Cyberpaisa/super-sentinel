/**
 * Survival Engine — Credit Monitor
 *
 * Reads the agent's USDC balance on Avalanche C-Chain via RPC
 * and classifies the current survival tier.
 */

import { publicClient } from '@/lib/blockchain/client';
import { createLogger } from '@/lib/utils/logger';

import {
  TIER_THRESHOLDS,
  DEFAULT_SURVIVAL_CONFIG,
} from './types';
import type { CreditStatus, SurvivalTier } from './types';

const log = createLogger('survival:credit-monitor');

// ---------------------------------------------------------------------------
// ERC-20 balanceOf ABI fragment
// ---------------------------------------------------------------------------

const BALANCE_OF_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a raw USDC balance (6 decimals) into a survival tier.
 */
export function classifyTier(balance: bigint): SurvivalTier {
  if (balance >= TIER_THRESHOLDS.THRIVING) return 'THRIVING';
  if (balance >= TIER_THRESHOLDS.SUSTAINABLE) return 'SUSTAINABLE';
  if (balance >= TIER_THRESHOLDS.CONSERVATION) return 'CONSERVATION';
  return 'DEAD';
}

/**
 * Format a raw 6-decimal USDC bigint into a human-readable string.
 *
 * @example formatUSDC(12_345678n) => "$12.34"
 */
export function formatUSDC(raw: bigint): string {
  const whole = raw / 1_000000n;
  const fractional = raw % 1_000000n;
  // Pad to 6 digits then take first 2 for cents
  const cents = fractional.toString().padStart(6, '0').slice(0, 2);
  return `$${whole}.${cents}`;
}

/**
 * Read the agent's USDC balance from the blockchain and return a
 * full {@link CreditStatus} snapshot.
 */
export async function getBalance(): Promise<CreditStatus> {
  const { usdcAddress, agentWalletAddress } = DEFAULT_SURVIVAL_CONFIG;

  log.info(
    { wallet: agentWalletAddress, usdc: usdcAddress },
    'Reading USDC balance',
  );

  const balanceUSDC = await publicClient.readContract({
    address: usdcAddress,
    abi: BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [agentWalletAddress],
  });

  const tier = classifyTier(balanceUSDC);
  const balanceFormatted = formatUSDC(balanceUSDC);
  const timestamp = new Date().toISOString();

  log.info(
    { tier, balanceFormatted, balanceUSDC: balanceUSDC.toString() },
    'Credit status resolved',
  );

  return {
    tier,
    balanceUSDC,
    balanceFormatted,
    walletAddress: agentWalletAddress,
    timestamp,
  };
}
