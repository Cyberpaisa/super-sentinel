import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { UnauthorizedError } from '@/lib/utils/errors';
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
 * Triggers a manual refresh of the agent index using Routescan API.
 * Protected — requires `Authorization: Bearer <INDEXER_API_SECRET>`.
 */
export async function POST(_request: NextRequest) {
  try {
    const secret = process.env.INDEXER_API_SECRET;
    if (!secret) {
      logger.error('INDEXER_API_SECRET not configured');
      throw new UnauthorizedError('Endpoint not configured');
    }
    if (_request.headers.get('authorization') !== `Bearer ${secret}`) {
      logger.warn('Unauthorized indexer refresh attempt');
      throw new UnauthorizedError('Invalid or missing authorization');
    }

    logger.info('Starting manual indexer refresh via Routescan');

    const startTime = Date.now();

    // Sync agents from Routescan API (0 = no page limit, fetch all)
    const maxPages = parseInt(new URL(_request.url).searchParams.get('maxPages') || '0', 10);
    const result = await syncAgentsFromRoutescan(maxPages);

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
