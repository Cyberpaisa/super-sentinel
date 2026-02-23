/**
 * Survival Engine — Earnings Tracker
 *
 * In-memory tracker for x402 payments received by the agent.
 * Singleton class so state persists across callers within the same process.
 */

import { createLogger } from '@/lib/utils/logger';

import type { EarningsRecord, EarningsSummary } from './types';

const log = createLogger('survival:earnings-tracker');

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

function sumInWindow(records: EarningsRecord[], windowMs: number): bigint {
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  let total = 0n;
  for (const r of records) {
    if (r.timestamp >= cutoff) {
      total += r.amountUSDC;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export class EarningsTracker {
  private static instance: EarningsTracker | null = null;
  private records: EarningsRecord[] = [];

  private constructor() {
    // private — use getInstance()
  }

  static getInstance(): EarningsTracker {
    if (!EarningsTracker.instance) {
      EarningsTracker.instance = new EarningsTracker();
    }
    return EarningsTracker.instance;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Record a new x402 payment received by the agent.
   */
  recordEarning(record: EarningsRecord): void {
    this.records.push(record);
    log.info(
      {
        txHash: record.txHash,
        payer: record.payer,
        amount: record.amountUSDC.toString(),
        service: record.service,
      },
      'Earning recorded',
    );
  }

  /**
   * Calculate earnings summary for various time windows.
   */
  getSummary(): EarningsSummary {
    let totalUSDC = 0n;
    for (const r of this.records) {
      totalUSDC += r.amountUSDC;
    }

    return {
      totalUSDC,
      lastHour: sumInWindow(this.records, ONE_HOUR_MS),
      last24h: sumInWindow(this.records, ONE_DAY_MS),
      last7d: sumInWindow(this.records, SEVEN_DAYS_MS),
      transactionCount: this.records.length,
    };
  }

  /**
   * Return the most recent earning records, newest first.
   *
   * @param limit - Maximum number of records to return (default: all)
   */
  getRecords(limit?: number): EarningsRecord[] {
    const sorted = [...this.records].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp),
    );
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  // -----------------------------------------------------------------------
  // Testing helper
  // -----------------------------------------------------------------------

  /** @internal — Reset state (useful for tests). */
  _reset(): void {
    this.records = [];
  }
}
