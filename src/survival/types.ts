/**
 * Survival Engine — Type definitions
 *
 * Defines the tier system, credit status, earnings, costs,
 * and overall survival status for the autonomous agent.
 */

// ---------------------------------------------------------------------------
// Survival tiers
// ---------------------------------------------------------------------------

export type SurvivalTier = 'THRIVING' | 'SUSTAINABLE' | 'CONSERVATION' | 'DEAD';

/** Tier thresholds in USDC (6 decimals) */
export const TIER_THRESHOLDS = {
  THRIVING: 100_000000n, // > $100 USDC
  SUSTAINABLE: 10_000000n, // > $10 USDC
  CONSERVATION: 1n, // > $0 USDC
  DEAD: 0n, // $0
} as const;

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

export interface CreditStatus {
  tier: SurvivalTier;
  balanceUSDC: bigint; // raw 6-decimal value
  balanceFormatted: string; // human readable "$XX.XX"
  walletAddress: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

export interface EarningsRecord {
  txHash: string;
  payer: string;
  amountUSDC: bigint;
  service: string; // e.g. "full-scan", "quick-check"
  timestamp: string;
}

export interface EarningsSummary {
  totalUSDC: bigint;
  lastHour: bigint;
  last24h: bigint;
  last7d: bigint;
  transactionCount: number;
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

export interface CostEstimate {
  rpcCallsPerHour: number;
  estimatedCostPerHour: bigint; // in USDC (6 decimals)
  estimatedCostPerDay: bigint;
  estimatedCostPerMonth: bigint;
}

// ---------------------------------------------------------------------------
// Survival status (aggregated)
// ---------------------------------------------------------------------------

export interface SurvivalStatus {
  tier: SurvivalTier;
  credit: CreditStatus;
  earnings: EarningsSummary;
  costs: CostEstimate;
  netPerDay: bigint; // earnings - costs (can be negative)
  hoursUntilDeath: number; // balance / costPerHour (Infinity if profitable)
  consecutiveLossHours: number; // hours where earnings < costs
  shouldReduceFunctionality: boolean;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface SurvivalConfig {
  pollIntervalMs: number; // default 60_000
  conservationThresholdHours: number; // default 24 — degrade after 24h loss
  usdcAddress: `0x${string}`;
  agentWalletAddress: `0x${string}`;
}

export const DEFAULT_SURVIVAL_CONFIG: SurvivalConfig = {
  pollIntervalMs: 60_000,
  conservationThresholdHours: 24,
  usdcAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  agentWalletAddress: (process.env.AGENT_WALLET_ADDRESS ||
    '0x0000000000000000000000000000000000000000') as `0x${string}`,
};
