/**
 * TRACER Scoring System Types
 *
 * 6-dimensional scoring model replacing the legacy 5-component trust score.
 * T - Trust, R - Reliability, A - Autonomy, C - Capability, E - Economics, R - Reputation
 */

/**
 * TRACER tier classification based on total score.
 */
export type TRACERTier = 'VERIFIED' | 'PASS' | 'PARTIAL' | 'FAIL';

/**
 * Individual TRACER dimension result.
 */
export interface TRACERDimension {
  /** Dimension name */
  name: string;
  /** Raw score 0-100 for this dimension */
  score: number;
  /** Weight of this dimension in the total (0.0-1.0) */
  weight: number;
  /** Weighted contribution to total score (score * weight) */
  weighted: number;
  /** Which sentinels fed into this dimension */
  sources: string[];
}

/**
 * Complete TRACER score result.
 */
export interface TRACERScore {
  /** Final composite score 0-100 */
  total: number;
  /** Breakdown by dimension */
  dimensions: {
    trust: TRACERDimension;
    reliability: TRACERDimension;
    autonomy: TRACERDimension;
    capability: TRACERDimension;
    economics: TRACERDimension;
    reputation: TRACERDimension;
  };
  /** Tier classification */
  tier: TRACERTier;
  /** ISO timestamp */
  timestamp: string;
  /** Number of sentinels that contributed data */
  sentinelCount: number;
}

/**
 * TRACER dimension weights — must sum to 1.0
 */
export const TRACER_WEIGHTS = {
  trust: 0.20,
  reliability: 0.20,
  autonomy: 0.15,
  capability: 0.20,
  economics: 0.10,
  reputation: 0.15,
} as const;

/**
 * Mapping of sentinel names to TRACER dimensions.
 */
export const SENTINEL_TO_DIMENSION: Record<string, keyof typeof TRACER_WEIGHTS> = {
  tls: 'trust',
  proxy: 'trust',
  'oz-match': 'trust',
  health: 'reliability',
  latency: 'reliability',
  mcp: 'autonomy',
  a2a: 'autonomy',
  'on-chain': 'capability',
  x402: 'economics',
  ratings: 'reputation',
};
