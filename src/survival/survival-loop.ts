/**
 * Survival Engine — Survival Loop
 *
 * Aggregates credit status, earnings, and costs into a single
 * {@link SurvivalStatus} snapshot. Exposes pure functions — the caller
 * (heartbeat, API route, cron) is responsible for scheduling.
 */

import { createLogger } from '@/lib/utils/logger';

import { getBalance } from './credit-monitor';
import { CostTracker } from './cost-tracker';
import { EarningsTracker } from './earnings-tracker';
import { DEFAULT_SURVIVAL_CONFIG } from './types';
import type { SurvivalStatus, CostEstimate, EarningsSummary } from './types';

const log = createLogger('survival:loop');

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Tracks how many consecutive hours earnings < costs. */
let consecutiveLossHours = 0;
let lastCheckTimestamp = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate hours until balance reaches zero given hourly cost.
 * Returns `Infinity` when net is non-negative (agent is profitable).
 */
export function getHoursUntilDeath(
  balanceUSDC: bigint,
  costPerHour: bigint,
  earningsPerHour: bigint,
): number {
  const netLossPerHour = costPerHour - earningsPerHour;
  if (netLossPerHour <= 0n) return Infinity;
  if (balanceUSDC <= 0n) return 0;
  // Integer division — rounds down (conservative)
  return Number(balanceUSDC / netLossPerHour);
}

/**
 * Determine whether the agent should reduce functionality to conserve funds.
 *
 * Returns `true` when:
 * - The tier is CONSERVATION or DEAD, OR
 * - Consecutive loss hours exceed the configured threshold (default 24h)
 */
export function shouldReduceFunctionality(
  tier: string,
  lossHours: number,
  thresholdHours: number = DEFAULT_SURVIVAL_CONFIG.conservationThresholdHours,
): boolean {
  if (tier === 'CONSERVATION' || tier === 'DEAD') return true;
  return lossHours >= thresholdHours;
}

// ---------------------------------------------------------------------------
// Main aggregation
// ---------------------------------------------------------------------------

/**
 * Build a complete survival status snapshot by reading the blockchain,
 * querying in-memory earnings, and estimating costs.
 */
export async function getSurvivalStatus(): Promise<SurvivalStatus> {
  log.info('Computing survival status');

  // 1. Credit (on-chain balance)
  const credit = await getBalance();

  // 2. Earnings (in-memory)
  const earnings: EarningsSummary = EarningsTracker.getInstance().getSummary();

  // 3. Costs (in-memory counters)
  const costs: CostEstimate = CostTracker.getInstance().getCostEstimate();

  // 4. Net per day
  const earningsPerDay = earnings.last24h; // actual last-24h earnings
  const netPerDay = earningsPerDay - costs.estimatedCostPerDay;

  // 5. Consecutive loss tracking
  const now = Date.now();
  const hoursSinceLastCheck = (now - lastCheckTimestamp) / (60 * 60 * 1000);

  if (lastCheckTimestamp > 0 && hoursSinceLastCheck >= 1) {
    // Check if last hour was a loss
    if (earnings.lastHour < costs.estimatedCostPerHour) {
      consecutiveLossHours += Math.floor(hoursSinceLastCheck);
    } else {
      consecutiveLossHours = 0;
    }
  }
  lastCheckTimestamp = now;

  // 6. Hours until death
  const hoursLeft = getHoursUntilDeath(
    credit.balanceUSDC,
    costs.estimatedCostPerHour,
    earnings.lastHour,
  );

  // 7. Should reduce functionality?
  const reduce = shouldReduceFunctionality(credit.tier, consecutiveLossHours);

  const status: SurvivalStatus = {
    tier: credit.tier,
    credit,
    earnings,
    costs,
    netPerDay,
    hoursUntilDeath: hoursLeft,
    consecutiveLossHours,
    shouldReduceFunctionality: reduce,
    timestamp: new Date().toISOString(),
  };

  log.info(
    {
      tier: status.tier,
      balance: credit.balanceFormatted,
      netPerDay: netPerDay.toString(),
      hoursUntilDeath: hoursLeft,
      shouldReduceFunctionality: reduce,
    },
    'Survival status computed',
  );

  return status;
}
