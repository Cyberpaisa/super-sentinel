/**
 * Shared types for the Super Sentinel micro-sentinel system.
 *
 * Every sentinel is a pure function: receives an endpoint or address,
 * returns a uniform SentinelResult. No Prisma, no side-effects.
 */

/**
 * Uniform result returned by every sentinel check.
 * `data` is intentionally loose — each sentinel documents its own shape.
 */
export interface SentinelResult {
  /** Sentinel identifier (e.g. "health", "tls", "latency") */
  sentinel: string;
  /** Whether the check passed the minimum threshold */
  passed: boolean;
  /** Numeric score 0-100 */
  score: number;
  /** Sentinel-specific payload */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
}

/**
 * Runtime configuration for a sentinel.
 */
export interface SentinelConfig {
  /** Whether this sentinel is enabled in the current run */
  enabled: boolean;
  /** Timeout in milliseconds for network operations */
  timeoutMs: number;
  /** Minimum score to consider the check "passed" */
  passThreshold: number;
}

/**
 * A sentinel function signature.
 * Pure: receives a target, returns a result. No database access.
 */
export type SentinelFn = (endpoint: string) => Promise<SentinelResult>;

/**
 * Aggregated result from the orchestrator after running all sentinels.
 */
export interface OrchestratorResult {
  /** Agent address or endpoint that was scanned */
  target: string;
  /** ISO timestamp of when the scan started */
  timestamp: string;
  /** Individual sentinel results (only fulfilled ones) */
  results: SentinelResult[];
  /** Sentinel names that failed to execute (rejected promises) */
  errors: Array<{ sentinel: string; reason: string }>;
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    errored: number;
    averageScore: number;
  };
}
