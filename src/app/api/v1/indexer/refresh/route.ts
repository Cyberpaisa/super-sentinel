import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { syncAgentsFromRoutescan } from '@/services/routescan-indexer-service';
import { recalculateAllScores } from '@/services/trust-score-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max
export const runtime = 'nodejs'; // Ensure Node.js runtime for viem compatibility

const logger = createLogger('api-indexer-refresh');

/**
 * POST /api/v1/indexer/refresh
 *
 * Triggers a manual refresh of the agent index using Routescan API
 * - Syncs agents from mainnet Identity Registry via Routescan
 * - Automatically calculates trust scores for new agents
 * - Fetches up to 20 pages (1000 transfers) for quick sync
 *
 * This can be called manually from the Scanner page
 */
export async function POST(_request: NextRequest) {
  try {
    const authHeader = _request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    logger.info('Starting manual indexer refresh via Routescan');

    const startTime = Date.now();

    // Sync agents from Routescan API (max 20 pages for quick refresh)
    const result = await syncAgentsFromRoutescan(20);

    // Recalculate trust scores if new agents were indexed
    let updatedScores = 0;
    if (result.indexed > 0) {
      updatedScores = await recalculateAllScores();
    }

    const duration = Date.now() - startTime;

    const stats = {
      indexed: result.indexed,
      skipped: result.skipped,
      failed: result.failed,
      total: result.total,
      trustScoresUpdated: updatedScores,
      duration: `${(duration / 1000).toFixed(2)}s`,
    };

    logger.info(stats, 'Indexer refresh completed successfully');

    return successResponse(
      {
        message: 'Indexer refresh completed',
        ...stats,
      },
      200
    );

  } catch (error) {
    logger.error({ error }, 'Error during indexer refresh');
    return handleError(error);
  }
}
