/**
 * Survival Engine — Cost Tracker
 *
 * Estimates the agent's running costs based on RPC and API call counters.
 * Singleton class so counters persist across callers within the same process.
 */

import { createLogger } from '@/lib/utils/logger';

import type { CostEstimate } from './types';

const log = createLogger('survival:cost-tracker');

// ---------------------------------------------------------------------------
// Cost constants (in USDC 6-decimal bigint)
// ---------------------------------------------------------------------------

/** ~$0.0001 per RPC call on Avalanche */
const COST_PER_RPC_CALL = 100n; // 0.000100 USDC (6 decimals)

/** ~$0.0005 per external API call */
const COST_PER_API_CALL = 500n; // 0.000500 USDC (6 decimals)

/** ~$0.01/hour baseline hosting cost */
const BASELINE_COST_PER_HOUR = 10_000n; // 0.010000 USDC (6 decimals)

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export class CostTracker {
  private static instance: CostTracker | null = null;

  private rpcCalls = 0;
  private apiCalls = 0;
  private windowStartMs = Date.now();

  private constructor() {
    // private — use getInstance()
  }

  static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker();
    }
    return CostTracker.instance;
  }

  // -----------------------------------------------------------------------
  // Recording
  // -----------------------------------------------------------------------

  /** Increment the RPC call counter. */
  recordRPCCall(): void {
    this.rpcCalls++;
  }

  /** Increment the external API call counter. */
  recordAPICall(): void {
    this.apiCalls++;
  }

  // -----------------------------------------------------------------------
  // Estimation
  // -----------------------------------------------------------------------

  /**
   * Estimate costs based on current counters extrapolated to hourly / daily / monthly.
   */
  getCostEstimate(): CostEstimate {
    const elapsedMs = Date.now() - this.windowStartMs;
    const elapsedHours = elapsedMs / (60 * 60 * 1000);

    // Avoid division by zero in the first second of operation
    const safeElapsedHours = elapsedHours > 0 ? elapsedHours : 1;

    const rpcCallsPerHour = Math.round(this.rpcCalls / safeElapsedHours);
    const apiCallsPerHour = Math.round(this.apiCalls / safeElapsedHours);

    const rpcCostPerHour = BigInt(rpcCallsPerHour) * COST_PER_RPC_CALL;
    const apiCostPerHour = BigInt(apiCallsPerHour) * COST_PER_API_CALL;

    const estimatedCostPerHour =
      rpcCostPerHour + apiCostPerHour + BASELINE_COST_PER_HOUR;
    const estimatedCostPerDay = estimatedCostPerHour * 24n;
    const estimatedCostPerMonth = estimatedCostPerDay * 30n;

    log.debug(
      {
        rpcCallsPerHour,
        apiCallsPerHour,
        costPerHour: estimatedCostPerHour.toString(),
      },
      'Cost estimate calculated',
    );

    return {
      rpcCallsPerHour,
      estimatedCostPerHour,
      estimatedCostPerDay,
      estimatedCostPerMonth,
    };
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /** Reset all counters and the measurement window. */
  resetCounters(): void {
    log.info(
      { rpcCalls: this.rpcCalls, apiCalls: this.apiCalls },
      'Resetting cost counters',
    );
    this.rpcCalls = 0;
    this.apiCalls = 0;
    this.windowStartMs = Date.now();
  }

  // -----------------------------------------------------------------------
  // Testing helper
  // -----------------------------------------------------------------------

  /** @internal — Reset singleton state (useful for tests). */
  _reset(): void {
    this.rpcCalls = 0;
    this.apiCalls = 0;
    this.windowStartMs = Date.now();
  }
}
