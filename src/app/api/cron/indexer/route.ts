import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { syncAgentsFromRoutescan } from '@/services/routescan-indexer-service';
import { recalculateAllScores } from '@/services/trust-score-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max
export const runtime = 'nodejs'; // Ensure Node.js runtime for viem compatibility

const logger = createLogger('cron-indexer');

/**
 * GET /api/cron/indexer
 *
 * Scheduled job that runs every 3 hours to:
 * 1. Index new agents + update metadata from the ERC-8004 registry via Routescan API
 * 2. Recalculate trust scores for ALL agents
 *
 * Protected by Vercel Cron Secret in production
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret — always required regardless of environment
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logger.error('CRON_SECRET is not configured');
      return new Response('Cron endpoint not configured', { status: 500 });
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn('Unauthorized cron job access attempt');
      return new Response('Unauthorized', { status: 401 });
    }

    logger.info('Starting scheduled indexer + score refresh job');

    const startTime = Date.now();

    // Sync agents + update metadata from Routescan API
    const result = await syncAgentsFromRoutescan();

    // Always recalculate trust scores for all agents
    const updatedScores = await recalculateAllScores();

    const duration = Date.now() - startTime;

    const stats = {
      indexed: result.indexed,
      skipped: result.skipped,
      failed: result.failed,
      total: result.total,
      trustScoresUpdated: updatedScores,
      duration: `${(duration / 1000).toFixed(2)}s`,
    };

    logger.info(stats, 'Scheduled job completed successfully');

    return successResponse(
      {
        message: 'Cron job completed',
        ...stats,
      },
      200
    );

  } catch (error) {
    logger.error({ error }, 'Error during scheduled job');
    return handleError(error);
  }
}
