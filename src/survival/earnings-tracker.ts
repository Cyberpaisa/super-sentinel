/**
 * Survival Engine — Earnings Tracker
 *
 * Tracks x402 payments received by the agent.
 * Singleton class so state persists across callers within the same process.
 *
 * Persistence (A4 fix):
 * - On recordEarning(): saves to Prisma/Supabase asynchronously
 * - On first getSummary(): loads historical records from DB
 * - Falls back to in-memory gracefully if DB is unavailable
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
  const cutoffMs = Date.now() - windowMs;
  let total = 0n;
  for (const r of records) {
    if (new Date(r.timestamp).getTime() >= cutoffMs) {
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
  private loadedFromDB = false;
  private loadPromise: Promise<void> | null = null;

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
   * Saves to DB asynchronously (fire-and-forget with error logging).
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

    // Persist to DB asynchronously — do not block the caller
    this.persistToDB(record).catch((err) => {
      log.warn({ err, txHash: record.txHash }, 'Failed to persist earning to DB (in-memory only)');
    });
  }

  /**
   * Calculate earnings summary for various time windows.
   * On first call, loads historical records from DB.
   */
  async getSummary(): Promise<EarningsSummary> {
    await this.ensureLoadedFromDB();
    return this.buildSummary();
  }

  /**
   * Synchronous summary — uses only records already in memory.
   * Prefer async getSummary() when possible.
   */
  getSummarySync(): EarningsSummary {
    return this.buildSummary();
  }

  /**
   * Return the most recent earning records, newest first.
   */
  getRecords(limit?: number): EarningsRecord[] {
    const sorted = [...this.records].sort(
      (a, b) => b.timestamp.localeCompare(a.timestamp),
    );
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }

  // -----------------------------------------------------------------------
  // Persistence (A4 fix)
  // -----------------------------------------------------------------------

  private async persistToDB(record: EarningsRecord): Promise<void> {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        await prisma.survivalEarning.upsert({
          where: { txHash: record.txHash },
          update: {}, // idempotent — if nonce already exists, skip
          create: {
            txHash: record.txHash,
            payer: record.payer,
            amountRaw: record.amountUSDC.toString(),
            service: record.service,
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    } catch {
      // DB unavailable — acceptable, in-memory is the fallback
    }
  }

  private async ensureLoadedFromDB(): Promise<void> {
    if (this.loadedFromDB) return;

    // Prevent concurrent load attempts
    if (this.loadPromise) {
      await this.loadPromise;
      return;
    }

    this.loadPromise = this.loadFromDB();
    await this.loadPromise;
  }

  private async loadFromDB(): Promise<void> {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        // Load last 7 days of earnings (sufficient for summary windows)
        const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
        const rows = await prisma.survivalEarning.findMany({
          where: { createdAt: { gte: cutoff } },
          orderBy: { createdAt: 'asc' },
        });

        // Merge DB records with in-memory (avoid duplicates by txHash)
        const existingTxHashes = new Set(this.records.map((r) => r.txHash));
        for (const row of rows) {
          if (!existingTxHashes.has(row.txHash)) {
            this.records.push({
              txHash: row.txHash,
              payer: row.payer,
              amountUSDC: BigInt(row.amountRaw),
              service: row.service,
              timestamp: row.createdAt.toISOString(),
            });
          }
        }

        log.info({ loadedCount: rows.length }, 'Loaded earnings from DB');
      } finally {
        await prisma.$disconnect();
      }
    } catch (err) {
      log.warn({ err }, 'Could not load earnings from DB (using in-memory only)');
    }

    this.loadedFromDB = true;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private buildSummary(): EarningsSummary {
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

  // -----------------------------------------------------------------------
  // Testing helper
  // -----------------------------------------------------------------------

  /** @internal — Reset state (useful for tests). */
  _reset(): void {
    this.records = [];
    this.loadedFromDB = false;
    this.loadPromise = null;
  }
}
