import { type Agent, type Prisma } from '@prisma/client';
import { prisma } from '@/lib/database/prisma';
import { createLogger } from '@/lib/utils/logger';
import { NotFoundError } from '@/lib/utils/errors';

const logger = createLogger('trust-score-service');

/**
 * Trust Score component weights
 */
export const TRUST_SCORE_WEIGHTS = {
  VOLUME: 0.25,    // 25% - Transaction volume activity
  PROXY: 0.20,     // 20% - No hidden proxy detected
  UPTIME: 0.25,    // 25% - Heartbeat response rate
  OZ_MATCH: 0.15,  // 15% - OpenZeppelin bytecode similarity
  RATINGS: 0.15,   // 15% - Community ratings average
} as const;

/**
 * Individual score component with details
 */
export interface ScoreComponent {
  score: number;       // 0-100
  weight: number;      // Component weight
  weighted: number;    // score * weight
  details: Record<string, unknown>;
}

/**
 * Complete trust score breakdown
 */
export interface TrustScoreBreakdown {
  score: number;       // Final composite score 0-100
  breakdown: {
    volume: ScoreComponent;
    proxy: ScoreComponent;
    uptime: ScoreComponent;
    ozMatch: ScoreComponent;
    ratings: ScoreComponent;
  };
  lastUpdated: Date;
}

/**
 * Volume thresholds for scoring (24h volume in AVAX)
 */
const VOLUME_THRESHOLDS = [
  { min: 1000, score: 100 },
  { min: 500, score: 80 },
  { min: 100, score: 60 },
  { min: 10, score: 40 },
  { min: 0, score: 20 },
];

/**
 * Uptime thresholds for scoring
 */
const UPTIME_THRESHOLDS = [
  { min: 99, score: 100 },
  { min: 95, score: 90 },
  { min: 90, score: 70 },
  { min: 80, score: 50 },
  { min: 0, score: 25 },
];

/**
 * OZ match thresholds for scoring
 */
const OZ_MATCH_THRESHOLDS = [
  { min: 80, score: 100 },
  { min: 50, score: 70 },
  { min: 20, score: 40 },
  { min: 0, score: 20 },
];

/**
 * Fetch recent transaction count for an address from Routescan API.
 * Returns the number of normal transactions in the last 24 hours and
 * a rough volume estimate in AVAX.
 */
async function fetchLiveVolume(
  agentAddress: string
): Promise<{ txCount: number; volumeAvax: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    // Routescan etherscan-compatible API – get last 100 normal txs
    const url =
      `https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api` +
      `?module=account&action=txlist&address=${agentAddress}` +
      `&startblock=0&endblock=99999999&sort=desc&offset=100&page=1`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) return { txCount: 0, volumeAvax: 0 };

    const json = (await res.json()) as {
      result: Array<{ timeStamp: string; value: string }>;
    };

    if (!Array.isArray(json.result)) return { txCount: 0, volumeAvax: 0 };

    const oneDayAgo = Math.floor(Date.now() / 1000) - 86_400;

    let txCount = 0;
    let volumeWei = 0n;

    for (const tx of json.result) {
      if (Number(tx.timeStamp) >= oneDayAgo) {
        txCount++;
        volumeWei += BigInt(tx.value || '0');
      }
    }

    // Convert wei → AVAX (18 decimals)
    const volumeAvax = Number(volumeWei) / 1e18;

    return { txCount, volumeAvax };
  } catch {
    clearTimeout(timeoutId);
    return { txCount: 0, volumeAvax: 0 };
  }
}

/**
 * Calculate volume score based on 24h transaction volume.
 * Queries Routescan live, then caches in the TransactionVolume table.
 */
async function calculateVolumeScore(agentAddress: string): Promise<ScoreComponent> {
  try {
    const normalized = agentAddress.toLowerCase();

    // 1. Try the cache first (less than 1 hour old)
    const cached = await prisma.transactionVolume.findUnique({
      where: {
        agentAddress_period: { agentAddress: normalized, period: 'DAY' },
      },
    });

    let volumeAvax: number;
    let txCount: number;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const cacheValid = cached && cached.updatedAt > oneHourAgo;

    if (cacheValid) {
      volumeAvax = Number(cached.volumeAvax);
      txCount = cached.txCount;
    } else {
      // 2. Fetch live from Routescan
      const live = await fetchLiveVolume(normalized);
      volumeAvax = live.volumeAvax;
      txCount = live.txCount;

      // 3. Upsert cache
      await prisma.transactionVolume.upsert({
        where: {
          agentAddress_period: { agentAddress: normalized, period: 'DAY' },
        },
        update: {
          txCount,
          volumeAvax,
          volumeUsd: 0,
        },
        create: {
          agentAddress: normalized,
          period: 'DAY',
          txCount,
          volumeAvax,
          volumeUsd: 0,
        },
      });
    }

    // Find the appropriate score based on volume
    let score = 0;
    for (const threshold of VOLUME_THRESHOLDS) {
      if (volumeAvax >= threshold.min) {
        score = threshold.score;
        break;
      }
    }

    return {
      score,
      weight: TRUST_SCORE_WEIGHTS.VOLUME,
      weighted: score * TRUST_SCORE_WEIGHTS.VOLUME,
      details: {
        volume24h: `${volumeAvax.toFixed(2)} AVAX`,
        txCount,
        source: cacheValid ? 'cache' : 'routescan',
      },
    };
  } catch (error) {
    logger.error({ agentAddress, error }, 'Failed to calculate volume score');
    return {
      score: 0,
      weight: TRUST_SCORE_WEIGHTS.VOLUME,
      weighted: 0,
      details: { error: 'Failed to calculate' },
    };
  }
}

/**
 * Calculate proxy score based on proxy detection status
 */
async function calculateProxyScore(agent: Agent): Promise<ScoreComponent> {
  let score: number;
  let status: string;

  if (!agent.is_proxy) {
    // No proxy detected - best score
    score = 100;
    status = 'No proxy detected';
  } else if (agent.proxy_type !== 'NONE' && agent.proxy_type !== 'CUSTOM') {
    // Known proxy type (declared/transparent) - good score
    score = 80;
    status = `Declared proxy: ${agent.proxy_type}`;
  } else if (agent.proxy_type === 'CUSTOM') {
    // Custom/undeclared proxy - penalty
    score = 0;
    status = 'Undeclared proxy detected';
  } else {
    // Unknown state
    score = 50;
    status = 'Unknown proxy status';
  }

  return {
    score,
    weight: TRUST_SCORE_WEIGHTS.PROXY,
    weighted: score * TRUST_SCORE_WEIGHTS.PROXY,
    details: {
      detected: agent.is_proxy,
      type: agent.proxy_type,
      implementationAddress: agent.implementation_address,
      status,
    },
  };
}

/**
 * Calculate uptime score based on 24h heartbeat success rate
 */
async function calculateUptimeScore(agentAddress: string): Promise<ScoreComponent> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const heartbeats = await prisma.heartbeatLog.findMany({
      where: {
        agentAddress: agentAddress.toLowerCase(),
        timestamp: {
          gte: twentyFourHoursAgo,
        },
      },
      select: {
        result: true,
        responseTimeMs: true,
      },
    });

    if (heartbeats.length === 0) {
      return {
        score: 0,
        weight: TRUST_SCORE_WEIGHTS.UPTIME,
        weighted: 0,
        details: {
          successRate: 'N/A',
          checks24h: 0,
          passed: 0,
          message: 'No heartbeat data available',
        },
      };
    }

    const passed = heartbeats.filter((h) => h.result === 'PASS').length;
    const successRate = (passed / heartbeats.length) * 100;
    const logsWithResponseTime = heartbeats.filter((h) => h.responseTimeMs !== null);
    const avgResponseTime = logsWithResponseTime.length > 0
      ? logsWithResponseTime.reduce((sum, h) => sum + (h.responseTimeMs || 0), 0) / logsWithResponseTime.length
      : 0;

    // Find the appropriate score based on success rate
    let score = 0;
    for (const threshold of UPTIME_THRESHOLDS) {
      if (successRate >= threshold.min) {
        score = threshold.score;
        break;
      }
    }

    return {
      score,
      weight: TRUST_SCORE_WEIGHTS.UPTIME,
      weighted: score * TRUST_SCORE_WEIGHTS.UPTIME,
      details: {
        successRate: `${successRate.toFixed(1)}%`,
        checks24h: heartbeats.length,
        passed,
        avgResponseTimeMs: Math.round(avgResponseTime),
      },
    };
  } catch (error) {
    logger.error({ agentAddress, error }, 'Failed to calculate uptime score');
    return {
      score: 0,
      weight: TRUST_SCORE_WEIGHTS.UPTIME,
      weighted: 0,
      details: { error: 'Failed to calculate' },
    };
  }
}

/**
 * Calculate OZ match score based on most recent trust score snapshot
 * (OZ matching is done during registration/scanning, we read the cached value)
 */
async function calculateOZScore(agentAddress: string): Promise<ScoreComponent> {
  try {
    const latestTrustScore = await prisma.trustScore.findFirst({
      where: { agentId: agentAddress.toLowerCase() },
      orderBy: { calculatedAt: 'desc' },
    });

    // Get OZ score from snapshot data if available
    const snapshotData = latestTrustScore?.snapshotData as Record<string, unknown> | null;
    const ozMatchData = snapshotData?.ozMatch as { score?: number; matchedComponents?: string[] } | undefined;

    const ozScore = ozMatchData?.score ?? (latestTrustScore?.ozMatchScore ?? 0) * 100;
    const matchedComponents = ozMatchData?.matchedComponents ?? [];

    // Convert 0-1 score to 0-100 if needed
    const normalizedScore = ozScore > 1 ? ozScore : ozScore * 100;

    // Map to tiered score
    let score = 20;
    for (const threshold of OZ_MATCH_THRESHOLDS) {
      if (normalizedScore >= threshold.min) {
        score = threshold.score;
        break;
      }
    }

    return {
      score,
      weight: TRUST_SCORE_WEIGHTS.OZ_MATCH,
      weighted: score * TRUST_SCORE_WEIGHTS.OZ_MATCH,
      details: {
        matchPercentage: normalizedScore,
        matchedComponents,
      },
    };
  } catch (error) {
    logger.error({ agentAddress, error }, 'Failed to calculate OZ score');
    return {
      score: 20,
      weight: TRUST_SCORE_WEIGHTS.OZ_MATCH,
      weighted: 20 * TRUST_SCORE_WEIGHTS.OZ_MATCH,
      details: { error: 'Failed to calculate' },
    };
  }
}

/**
 * Calculate ratings score based on community ratings
 */
async function calculateRatingsScore(agentAddress: string): Promise<ScoreComponent> {
  try {
    const ratings = await prisma.rating.findMany({
      where: { agentId: agentAddress.toLowerCase() },
      select: { rating: true },
    });

    if (ratings.length === 0) {
      return {
        score: 50, // Default neutral score when no ratings
        weight: TRUST_SCORE_WEIGHTS.RATINGS,
        weighted: 50 * TRUST_SCORE_WEIGHTS.RATINGS,
        details: {
          average: 0,
          count: 0,
          message: 'No ratings yet',
        },
      };
    }

    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const average = sum / ratings.length;

    // Convert 1-5 rating to 0-100 score
    const score = Math.round((average / 5) * 100);

    return {
      score,
      weight: TRUST_SCORE_WEIGHTS.RATINGS,
      weighted: score * TRUST_SCORE_WEIGHTS.RATINGS,
      details: {
        average: Number(average.toFixed(2)),
        count: ratings.length,
      },
    };
  } catch (error) {
    logger.error({ agentAddress, error }, 'Failed to calculate ratings score');
    return {
      score: 50,
      weight: TRUST_SCORE_WEIGHTS.RATINGS,
      weighted: 50 * TRUST_SCORE_WEIGHTS.RATINGS,
      details: { error: 'Failed to calculate' },
    };
  }
}

/**
 * Calculate the complete Trust Score for an agent
 *
 * @param agentAddress - Agent contract address
 * @returns Complete trust score breakdown
 * @throws {NotFoundError} If agent doesn't exist
 */
export async function calculateTrustScore(agentAddress: string): Promise<TrustScoreBreakdown> {
  const normalizedAddress = agentAddress.toLowerCase();

  logger.info({ address: normalizedAddress }, 'Calculating trust score');

  // Fetch agent data
  const agent = await prisma.agent.findUnique({
    where: { address: normalizedAddress },
  });

  if (!agent) {
    throw new NotFoundError(`Agent not found: ${agentAddress}`);
  }

  // Calculate all component scores in parallel
  const [volume, proxy, uptime, ozMatch, ratings] = await Promise.all([
    calculateVolumeScore(normalizedAddress),
    calculateProxyScore(agent),
    calculateUptimeScore(normalizedAddress),
    calculateOZScore(normalizedAddress),
    calculateRatingsScore(normalizedAddress),
  ]);

  // Calculate final composite score
  const finalScore = Math.round(
    volume.weighted + proxy.weighted + uptime.weighted + ozMatch.weighted + ratings.weighted
  );

  const breakdown: TrustScoreBreakdown = {
    score: finalScore,
    breakdown: {
      volume,
      proxy,
      uptime,
      ozMatch,
      ratings,
    },
    lastUpdated: new Date(),
  };

  logger.info(
    {
      address: normalizedAddress,
      finalScore,
      components: {
        volume: volume.score,
        proxy: proxy.score,
        uptime: uptime.score,
        ozMatch: ozMatch.score,
        ratings: ratings.score,
      },
    },
    'Trust score calculated'
  );

  return breakdown;
}

/**
 * Calculate and persist the Trust Score for an agent
 *
 * @param agentAddress - Agent contract address
 * @returns Updated trust score breakdown
 */
export async function updateAgentTrustScore(agentAddress: string): Promise<TrustScoreBreakdown> {
  const breakdown = await calculateTrustScore(agentAddress);
  const normalizedAddress = agentAddress.toLowerCase();

  // Update agent's trust_score field
  await prisma.agent.update({
    where: { address: normalizedAddress },
    data: { trust_score: breakdown.score },
  });

  // Create a new trust score snapshot
  const snapshotData: Prisma.InputJsonValue = {
    volume: breakdown.breakdown.volume.details as Prisma.InputJsonValue,
    proxy: breakdown.breakdown.proxy.details as Prisma.InputJsonValue,
    uptime: breakdown.breakdown.uptime.details as Prisma.InputJsonValue,
    ozMatch: breakdown.breakdown.ozMatch.details as Prisma.InputJsonValue,
    ratings: breakdown.breakdown.ratings.details as Prisma.InputJsonValue,
  };

  await prisma.trustScore.create({
    data: {
      agentId: normalizedAddress,
      overallScore: breakdown.score / 100,
      volumeScore: breakdown.breakdown.volume.score / 100,
      proxyScore: breakdown.breakdown.proxy.score / 100,
      uptimeScore: breakdown.breakdown.uptime.score / 100,
      ozMatchScore: breakdown.breakdown.ozMatch.score / 100,
      communityScore: breakdown.breakdown.ratings.score / 100,
      snapshotData,
    },
  });

  logger.info(
    { address: normalizedAddress, score: breakdown.score },
    'Trust score updated and persisted'
  );

  return breakdown;
}

/**
 * Recalculate trust scores for all agents
 * Useful for batch updates or scheduled jobs
 *
 * @param batchSize - Number of agents to process at a time
 * @returns Number of agents updated
 */
export async function recalculateAllScores(batchSize = 50): Promise<number> {
  logger.info({ batchSize }, 'Starting batch trust score recalculation');

  let updatedCount = 0;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const agents = await prisma.agent.findMany({
      select: { address: true },
      skip,
      take: batchSize,
      orderBy: { created_at: 'asc' },
    });

    if (agents.length === 0) {
      hasMore = false;
      break;
    }

    // Process batch in parallel (limited concurrency)
    await Promise.all(
      agents.map(async (agent) => {
        try {
          await updateAgentTrustScore(agent.address);
          updatedCount++;
        } catch (error) {
          logger.error(
            { address: agent.address, error },
            'Failed to update trust score for agent'
          );
        }
      })
    );

    skip += batchSize;
    logger.debug({ processed: skip }, 'Batch processed');
  }

  logger.info({ updatedCount }, 'Batch trust score recalculation completed');

  return updatedCount;
}

/**
 * Get the latest trust score breakdown for an agent
 * Returns cached data if available, otherwise calculates fresh
 *
 * @param agentAddress - Agent contract address
 * @param maxAgeMs - Maximum age of cached data in milliseconds (default: 1 hour)
 * @returns Trust score breakdown
 */
export async function getTrustScoreBreakdown(
  agentAddress: string,
  maxAgeMs = 60 * 60 * 1000
): Promise<TrustScoreBreakdown> {
  const normalizedAddress = agentAddress.toLowerCase();

  // Check for recent cached score
  const latestScore = await prisma.trustScore.findFirst({
    where: { agentId: normalizedAddress },
    orderBy: { calculatedAt: 'desc' },
  });

  // If we have a recent score, use it
  if (latestScore && Date.now() - latestScore.calculatedAt.getTime() < maxAgeMs) {
    const snapshotData = latestScore.snapshotData as Record<string, Record<string, unknown>> | null;

    return {
      score: Math.round(latestScore.overallScore * 100),
      breakdown: {
        volume: {
          score: Math.round(latestScore.volumeScore * 100),
          weight: TRUST_SCORE_WEIGHTS.VOLUME,
          weighted: latestScore.volumeScore * 100 * TRUST_SCORE_WEIGHTS.VOLUME,
          details: snapshotData?.volume ?? {},
        },
        proxy: {
          score: Math.round(latestScore.proxyScore * 100),
          weight: TRUST_SCORE_WEIGHTS.PROXY,
          weighted: latestScore.proxyScore * 100 * TRUST_SCORE_WEIGHTS.PROXY,
          details: snapshotData?.proxy ?? {},
        },
        uptime: {
          score: Math.round(latestScore.uptimeScore * 100),
          weight: TRUST_SCORE_WEIGHTS.UPTIME,
          weighted: latestScore.uptimeScore * 100 * TRUST_SCORE_WEIGHTS.UPTIME,
          details: snapshotData?.uptime ?? {},
        },
        ozMatch: {
          score: Math.round(latestScore.ozMatchScore * 100),
          weight: TRUST_SCORE_WEIGHTS.OZ_MATCH,
          weighted: latestScore.ozMatchScore * 100 * TRUST_SCORE_WEIGHTS.OZ_MATCH,
          details: snapshotData?.ozMatch ?? {},
        },
        ratings: {
          score: Math.round(latestScore.communityScore * 100),
          weight: TRUST_SCORE_WEIGHTS.RATINGS,
          weighted: latestScore.communityScore * 100 * TRUST_SCORE_WEIGHTS.RATINGS,
          details: snapshotData?.ratings ?? {},
        },
      },
      lastUpdated: latestScore.calculatedAt,
    };
  }

  // Calculate fresh score
  return calculateTrustScore(agentAddress);
}

// ---------------------------------------------------------------------------
// TRACER Scoring (v2) — coexists with legacy scoring above
// ---------------------------------------------------------------------------

import { calculateTRACER, type TRACERScore } from '@/sentinels/scoring';
import { type SentinelResult } from '@/sentinels/types';

export type { TRACERScore };

/**
 * Calculate the TRACER score for an agent using sentinel results.
 *
 * This is the v2 scoring engine that replaces the 5-component trust score
 * with 6 TRACER dimensions fed by real sentinel checks.
 *
 * Both scoring systems coexist during the migration period.
 * The legacy calculateTrustScore() reads from Prisma cache.
 * This function takes fresh sentinel results and community ratings.
 *
 * @param results - Array of SentinelResult from the orchestrator
 * @param agentAddress - Agent address for fetching community ratings from Prisma
 * @returns TRACERScore with dimensions, total, and tier
 */
export async function calculateTRACERScore(
  results: SentinelResult[],
  agentAddress: string
): Promise<TRACERScore> {
  const normalizedAddress = agentAddress.toLowerCase();

  logger.info({ address: normalizedAddress }, 'Calculating TRACER score');

  // Fetch community ratings for the reputation dimension
  let reputationScore: number | undefined;
  try {
    const ratings = await prisma.rating.findMany({
      where: { agentId: normalizedAddress },
      select: { rating: true },
    });

    if (ratings.length > 0) {
      const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
      const average = sum / ratings.length;
      reputationScore = Math.round((average / 5) * 100);
    }
  } catch (error) {
    logger.warn({ address: normalizedAddress, error }, 'Failed to fetch ratings for TRACER');
  }

  const tracerScore = calculateTRACER(results, reputationScore);

  logger.info(
    {
      address: normalizedAddress,
      total: tracerScore.total,
      tier: tracerScore.tier,
      sentinelCount: tracerScore.sentinelCount,
    },
    'TRACER score calculated'
  );

  return tracerScore;
}
