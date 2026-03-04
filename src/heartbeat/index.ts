/**
 * Heartbeat Module
 *
 * Tracks scan activity and exposes a snapshot of the agent's
 * liveness, survival tier, balance, and earnings.
 *
 * Usage:
 *   import { recordScan, getHeartbeat } from '@/heartbeat';
 *   recordScan(agentAddress);          // after each scan
 *   const hb = await getHeartbeat();   // build snapshot
 */

import { createLogger } from '@/lib/utils/logger';
import type { Heartbeat } from './types';

const logger = createLogger('heartbeat');

// ---------------------------------------------------------------------------
// In-memory counters (reset on process restart — that's intentional)
// ---------------------------------------------------------------------------

let scanCount = 0;
const scannedAgents = new Set<string>();
const startTime = Date.now();

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Call this from the scan route after each scan completes. */
export function recordScan(agentAddress: string): void {
  scanCount++;
  scannedAgents.add(agentAddress.toLowerCase());
  logger.debug({ agentAddress, scanCount }, 'Scan recorded');
}

/** Generate a heartbeat snapshot. */
export async function getHeartbeat(): Promise<Heartbeat> {
  // Lazy import to avoid circular dependency at module load time.
  // The survival module may not exist yet — the try/catch handles that.
  let tier = 'UNKNOWN';
  let balance = '$0.00';
  let earnings24h = '$0.00';
  let status: Heartbeat['status'] = 'alive';

  try {
    const { getSurvivalStatus } = await import('@/survival/survival-loop');
    const survival = await getSurvivalStatus();
    tier = survival.tier;
    balance = survival.credit.balanceFormatted;

    // survival.earnings.last24h is bigint USDC with 6 decimals
    const e24 = Number(survival.earnings.last24h) / 1_000_000;
    earnings24h = `$${e24.toFixed(2)}`;

    // Derive status from tier
    if (survival.tier === 'DEAD') status = 'dying';
    else if (survival.tier === 'CONSERVATION') status = 'degraded';
  } catch (err: unknown) {
    // Survival module may not be configured or available — that's ok
    logger.warn({ err }, 'Could not fetch survival status for heartbeat');
    status = 'degraded';
  }

  return {
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    tier,
    balance,
    earnings24h,
    scanCount,
    uniqueAgentsScanned: scannedAgents.size,
    status,
  };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { Heartbeat, HeartbeatConfig } from './types';
export { DEFAULT_HEARTBEAT_CONFIG } from './types';
