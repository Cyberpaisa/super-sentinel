/**
 * TRACER Scoring Engine
 *
 * Calculates a 6-dimension composite score from an array of SentinelResult.
 * Pure function — no database access, no side-effects.
 *
 * Dimensions and weights:
 *   Trust       20% ← tls, proxy, oz-match
 *   Reliability 20% ← health, latency
 *   Autonomy    15% ← mcp, a2a
 *   Capability  20% ← on-chain, oz-match
 *   Economics   10% ← x402
 *   Reputation  15% ← ratings
 *
 * Tiers: VERIFIED 80-100, PASS 70-79, PARTIAL 40-69, FAIL 0-39
 */

import { type SentinelResult } from '../types';
import {
  type TRACERScore,
  type TRACERDimension,
  type TRACERTier,
  TRACER_WEIGHTS,
  SENTINEL_TO_DIMENSIONS,
} from './types';

/** Clamp a value to [0, 100] range. NaN becomes 0. */
function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function classifyTier(score: number): TRACERTier {
  if (score >= 80) return 'VERIFIED';
  if (score >= 70) return 'PASS';
  if (score >= 40) return 'PARTIAL';
  return 'FAIL';
}

function buildDimension(
  name: string,
  weight: number,
  scores: number[],
  sources: string[]
): TRACERDimension {
  const score = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    name,
    score,
    weight,
    weighted: Math.round(score * weight * 100) / 100,
    sources,
  };
}

/**
 * Calculate the TRACER score from an array of SentinelResult.
 *
 * Accepts the output of the orchestrator (results array).
 * Each sentinel's score is routed to its corresponding dimension(s).
 * Dimensions with no sentinel data score 0.
 *
 * @param results - Array of SentinelResult from the orchestrator
 * @param reputationScore - Optional community rating score 0-100 (from Prisma ratings)
 * @returns Complete TRACERScore with dimensions, total, and tier
 */
export function calculateTRACER(
  results: SentinelResult[],
  reputationScore?: number
): TRACERScore {
  // Collect scores per dimension
  const dimensionScores: Record<keyof typeof TRACER_WEIGHTS, number[]> = {
    trust: [],
    reliability: [],
    autonomy: [],
    capability: [],
    economics: [],
    reputation: [],
  };
  const dimensionSources: Record<keyof typeof TRACER_WEIGHTS, string[]> = {
    trust: [],
    reliability: [],
    autonomy: [],
    capability: [],
    economics: [],
    reputation: [],
  };

  // Route each sentinel result to its dimension(s)
  for (const result of results) {
    const dimensions = SENTINEL_TO_DIMENSIONS[result.sentinel];
    if (!dimensions) continue;

    for (const dim of dimensions) {
      dimensionScores[dim].push(clamp(result.score));
      if (!dimensionSources[dim].includes(result.sentinel)) {
        dimensionSources[dim].push(result.sentinel);
      }
    }
  }

  // Inject reputation score if provided (from Prisma ratings, external to sentinels)
  if (reputationScore !== undefined) {
    dimensionScores.reputation.push(clamp(reputationScore));
    if (!dimensionSources.reputation.includes('ratings')) {
      dimensionSources.reputation.push('ratings');
    }
  }

  // Build each dimension with its fixed weight (tests assume static weights).
  const trust = buildDimension(
    'trust',
    TRACER_WEIGHTS.trust,
    dimensionScores.trust,
    dimensionSources.trust
  );
  const reliability = buildDimension(
    'reliability',
    TRACER_WEIGHTS.reliability,
    dimensionScores.reliability,
    dimensionSources.reliability
  );
  const autonomy = buildDimension(
    'autonomy',
    TRACER_WEIGHTS.autonomy,
    dimensionScores.autonomy,
    dimensionSources.autonomy
  );
  const capability = buildDimension(
    'capability',
    TRACER_WEIGHTS.capability,
    dimensionScores.capability,
    dimensionSources.capability
  );
  const economics = buildDimension(
    'economics',
    TRACER_WEIGHTS.economics,
    dimensionScores.economics,
    dimensionSources.economics
  );
  const reputation = buildDimension(
    'reputation',
    TRACER_WEIGHTS.reputation,
    dimensionScores.reputation,
    dimensionSources.reputation
  );

  // Composite total — fixed-weight sum across all dimensions (empty ones contribute 0).
  const rawTotal =
    trust.weighted +
    reliability.weighted +
    autonomy.weighted +
    capability.weighted +
    economics.weighted +
    reputation.weighted;
  const total = Math.max(0, Math.min(100, Math.round(rawTotal)));

  const tier = classifyTier(total);
  const sentinelCount = results.length + (reputationScore !== undefined ? 1 : 0);

  return {
    total,
    dimensions: { trust, reliability, autonomy, capability, economics, reputation },
    tier,
    timestamp: new Date().toISOString(),
    sentinelCount,
  };
}
