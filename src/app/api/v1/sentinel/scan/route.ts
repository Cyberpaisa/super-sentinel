import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { runAllSentinels, type RatingInput } from '@/sentinels';
import { calculateTRACER } from '@/sentinels/scoring';
import { resolveAllEndpoints } from '@/services/centinela/sentinels/resolve-endpoint';
import { recordScan } from '@/heartbeat';
import { publicClient } from '@/lib/blockchain/client';
import { REPUTATION_REGISTRY_ABI } from '@/lib/blockchain/abis/reputation-registry';
import { ERC8004_CONTRACTS } from '@/config/contracts';
import { isMainnet } from '@/lib/blockchain/client';
import { recordTracerScore } from '@/services/agent-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const logger = createLogger('api-sentinel-scan');

/**
 * Fetch on-chain reputation ratings from the ReputationRegistry.
 *
 * 1. Fetches the agent card from the endpoint to extract agentId
 * 2. Calls getClients(agentId) to get all reviewers
 * 3. Calls readFeedback(agentId, reviewer, 1) for each reviewer
 * 4. Returns RatingInput[] for the ratings sentinel
 */
async function fetchOnChainRatings(
  endpoint: string,
  log: ReturnType<typeof createLogger>,
): Promise<RatingInput[]> {
  try {
    // 1. Get agentId from agent card
    const cardUrl = `${endpoint.replace(/\/$/, '')}/.well-known/agent-card.json`;
    const cardResp = await fetch(cardUrl, { signal: AbortSignal.timeout(5000) });
    if (!cardResp.ok) return [];

    const card = await cardResp.json() as Record<string, unknown>;
    const registrations = card.registrations as Array<{ agentId?: number }> | undefined;
    const agentId = registrations?.[0]?.agentId;
    if (!agentId || typeof agentId !== 'number') return [];

    // 2. Get all reviewer addresses
    const network = isMainnet() ? 'mainnet' : 'testnet';
    const reputationAddress = ERC8004_CONTRACTS.reputation[network];

    const clients = await publicClient.readContract({
      address: reputationAddress,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'getClients',
      args: [BigInt(agentId)],
    }) as `0x${string}`[];

    if (!clients || clients.length === 0) return [];

    // 3. Read feedback from each reviewer in parallel
    const ratingPromises = clients.map(async (reviewer) => {
      try {
        const fb = await publicClient.readContract({
          address: reputationAddress,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'readFeedback',
          args: [BigInt(agentId), reviewer, 1n],
        }) as [bigint, number, string, string, boolean];

        const score = Number(fb[0]);
        if (score >= 50) {
          return { reviewer, value: Math.min(score, 100), tag: fb[2] || undefined };
        }
      } catch {
        return null;
      }
      return null;
    });

    const results = await Promise.all(ratingPromises);
    const ratings: RatingInput[] = [];
    for (const r of results) {
      if (r) ratings.push(r);
    }

    log.info(
      { agentId, reviewerCount: clients.length, ratingCount: ratings.length },
      'On-chain reputation ratings fetched',
    );

    return ratings;
  } catch (err) {
    log.debug({ err }, 'Failed to fetch on-chain ratings (non-blocking)');
    return [];
  }
}

/**
 * POST /api/v1/sentinel/scan
 *
 * Execute a full sentinel scan for an agent and return TRACER scores.
 *
 * Request body:
 * - address: string (required) — agent address
 * - endpoint: string (optional) — override endpoint URL
 *
 * Response:
 * - orchestrator: Full sentinel results with individual scores
 * - tracer: TRACER 6-dimension score with tier classification
 *
 * Rate limited by middleware (100 req/min default).
 *
 * Currently free (x402 payment disabled).
 */
async function scanHandler(request: NextRequest) {
  try {
    // Survival check disabled for local testing — re-enable in production
    // The survival engine requires a funded wallet and database connection
    logger.debug('Survival check skipped (local mode)');

    const body = await request.json() as Record<string, unknown>;

    const address = body.address;
    if (!address || typeof address !== 'string') {
      throw new ValidationError('address is required and must be a string');
    }

    const normalizedAddress = address.toLowerCase();

    // Validate address format (0x + 40 hex chars)
    if (!/^0x[a-f0-9]{40}$/.test(normalizedAddress)) {
      throw new ValidationError('address must be a valid Ethereum address (0x + 40 hex chars)');
    }

    logger.info({ address: normalizedAddress }, 'Starting sentinel scan');

    // Resolve all endpoints: primary, MCP, A2A, x402, registry address
    const resolved = await resolveAllEndpoints(normalizedAddress);

    // Allow caller to override the primary endpoint
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : resolved.primary;

    if (!endpoint) {
      return successResponse({
        address: normalizedAddress,
        endpoint: null,
        orchestrator: {
          target: normalizedAddress,
          timestamp: new Date().toISOString(),
          results: [],
          errors: [{ sentinel: 'resolve', reason: 'No endpoint found in agent metadata' }],
          summary: { total: 0, passed: 0, failed: 0, errored: 1, averageScore: 0 },
        },
        tracer: {
          total: 0,
          dimensions: {},
          tier: 'FAIL',
          timestamp: new Date().toISOString(),
          sentinelCount: 0,
        },
      });
    }

    // Fetch on-chain reputation ratings from ReputationRegistry
    const ratings = await fetchOnChainRatings(endpoint, logger);

    // Run ALL sentinels with per-service endpoints and registry address
    const orchestratorResult = await runAllSentinels(endpoint, normalizedAddress, {
      endpointOverrides: {
        mcp: resolved.mcp,
        a2a: resolved.a2a,
        x402: resolved.x402,
      },
      onChainAddress: resolved.registryAddress,
      ratings,
    });

    // Calculate TRACER score from sentinel results
    const tracerScore = calculateTRACER(orchestratorResult.results);

    logger.info({
      address: normalizedAddress,
      endpoint,
      resolvedEndpoints: resolved,
      total: tracerScore.total,
      tier: tracerScore.tier,
      sentinels: orchestratorResult.summary,
    }, 'Sentinel scan completed');

    // Record score in database for history and trust score visibility
    await recordTracerScore(normalizedAddress, tracerScore, orchestratorResult.results);

    // Record scan for heartbeat tracking
    recordScan(normalizedAddress);

    return successResponse({
      address: normalizedAddress,
      endpoint,
      resolvedEndpoints: {
        mcp: resolved.mcp,
        a2a: resolved.a2a,
        x402: resolved.x402,
        registry: resolved.registryAddress,
      },
      orchestrator: orchestratorResult,
      tracer: tracerScore,
    });
  } catch (error) {
    logger.error({ error }, 'Sentinel scan failed');
    return handleError(error);
  }
}

// Scans are currently free (x402 payment disabled)
export const POST = scanHandler;
