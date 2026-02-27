import { NextRequest, NextResponse } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { runEndpointSentinels, runAllSentinels, type RatingInput } from '@/sentinels';
import { calculateTRACER } from '@/sentinels/scoring';
import { resolveAgentEndpoint } from '@/services/centinela/sentinels/resolve-endpoint';
import { withX402Payment } from '@/lib/middleware/x402-payment';
import { recordScan } from '@/heartbeat';
import { publicClient } from '@/lib/blockchain/client';
import { REPUTATION_REGISTRY_ABI } from '@/lib/blockchain/abis/reputation-registry';
import { ERC8004_CONTRACTS } from '@/config/contracts';
import { isMainnet } from '@/lib/blockchain/client';

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

    // 3. Read feedback from each reviewer (index 1-based)
    const ratings: RatingInput[] = [];
    for (const reviewer of clients) {
      try {
        const fb = await publicClient.readContract({
          address: reputationAddress,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'readFeedback',
          args: [BigInt(agentId), reviewer, 1n],
        }) as [bigint, number, string, string, boolean];

        const score = Number(fb[0]);
        if (score >= 50) {
          ratings.push({ reviewer, value: Math.min(score, 100), tag: fb[2] || undefined });
        }
      } catch {
        // Skip individual read errors
      }
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
 * Pricing: $0.50 USDC per scan via x402 payment protocol.
 * Free alternative: GET /api/v1/sentinel/quick-check (health + TLS only).
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

    // Resolve endpoint: use provided override or resolve from agent metadata
    let endpoint = typeof body.endpoint === 'string' ? body.endpoint : null;

    if (!endpoint) {
      endpoint = await resolveAgentEndpoint(normalizedAddress);
    }

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

    // Run ALL sentinels (endpoint + on-chain + ratings) in parallel for full TRACER coverage
    const orchestratorResult = await runAllSentinels(endpoint, normalizedAddress, { ratings });

    // Filter oz-match sentinel when scanning the shared Identity Registry contract
    // oz-match is designed for agent-specific contracts, not shared ERC-8004 infrastructure
    const knownRegistries = [
      ERC8004_CONTRACTS.identity.mainnet.toLowerCase(),
      ERC8004_CONTRACTS.identity.testnet.toLowerCase(),
    ];
    const filteredResults = knownRegistries.includes(normalizedAddress)
      ? orchestratorResult.results.filter((r) => r.sentinel !== 'oz-match')
      : orchestratorResult.results;

    // Calculate TRACER score from sentinel results
    const tracerScore = calculateTRACER(filteredResults);

    logger.info({
      address: normalizedAddress,
      endpoint,
      total: tracerScore.total,
      tier: tracerScore.tier,
      sentinels: orchestratorResult.summary,
    }, 'Sentinel scan completed');

    // Record scan for heartbeat tracking
    recordScan(normalizedAddress);

    return successResponse({
      address: normalizedAddress,
      endpoint,
      orchestrator: orchestratorResult,
      tracer: tracerScore,
    });
  } catch (error) {
    logger.error({ error }, 'Sentinel scan failed');
    return handleError(error);
  }
}

// Wrap with x402 payment — full scans cost $0.50 USDC
export const POST = withX402Payment(scanHandler);
