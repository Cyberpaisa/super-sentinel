/**
 * Survival Engine Module
 *
 * Monitors the agent's USDC balance, tracks x402 payment earnings,
 * estimates operational costs, and determines the survival tier.
 *
 * Usage:
 *   import { getSurvivalStatus, EarningsTracker, CostTracker } from '@/survival';
 *
 *   const status = await getSurvivalStatus();
 *   // status.tier => 'THRIVING' | 'SUSTAINABLE' | 'CONSERVATION' | 'DEAD'
 */

// Credit monitor
export { getBalance, classifyTier, formatUSDC } from './credit-monitor';

// Earnings tracker (singleton class)
export { EarningsTracker } from './earnings-tracker';

// Cost tracker (singleton class)
export { CostTracker } from './cost-tracker';

// Survival loop
export {
  getSurvivalStatus,
  getHoursUntilDeath,
  shouldReduceFunctionality,
} from './survival-loop';

// Types
export type {
  SurvivalTier,
  CreditStatus,
  EarningsRecord,
  EarningsSummary,
  CostEstimate,
  SurvivalStatus,
  SurvivalConfig,
} from './types';

export { TIER_THRESHOLDS, DEFAULT_SURVIVAL_CONFIG } from './types';
