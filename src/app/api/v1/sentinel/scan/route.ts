import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { runEndpointSentinels } from '@/sentinels';
import { calculateTRACER } from '@/sentinels/scoring';
import { resolveAgentEndpoint } from '@/services/centinela/sentinels/resolve-endpoint';
import { withX402Payment } from '@/lib/middleware/x402-payment';
import { recordScan } from '@/heartbeat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const logger = createLogger('api-sentinel-scan');

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

    // Run endpoint sentinels (health, TLS, latency) in parallel
    const orchestratorResult = await runEndpointSentinels(endpoint);

    // Calculate TRACER score from sentinel results
    const tracerScore = calculateTRACER(orchestratorResult.results);

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
