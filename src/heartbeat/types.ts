/**
 * Heartbeat Module — Type definitions
 *
 * Defines the heartbeat snapshot structure and configuration
 * for the agent's public liveness signal.
 */

// ---------------------------------------------------------------------------
// Heartbeat snapshot
// ---------------------------------------------------------------------------

export interface Heartbeat {
  /** ISO-8601 timestamp of this heartbeat */
  timestamp: string;
  /** Agent uptime in seconds since process start */
  uptimeSeconds: number;
  /** Current survival tier (string to avoid circular import with SurvivalTier) */
  tier: string;
  /** USDC balance formatted (e.g. "$12.50") */
  balance: string;
  /** Earnings in last 24 h formatted (e.g. "$3.20") */
  earnings24h: string;
  /** Total scans performed since startup */
  scanCount: number;
  /** Number of unique agents scanned */
  uniqueAgentsScanned: number;
  /** Service status */
  status: 'alive' | 'degraded' | 'dying';
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface HeartbeatConfig {
  /** Interval between heartbeats in ms (default 300_000 = 5 min) */
  intervalMs: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 300_000,
};
