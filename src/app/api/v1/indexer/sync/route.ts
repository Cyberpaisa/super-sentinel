import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { syncAgents, syncNetwork, type Network } from '@/services/indexer-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Up to 5 min for full scan of both networks

const logger = createLogger('api-indexer-sync');

/**
 * POST /api/v1/indexer/sync
 *
 * Trigger agent synchronization from Identity Registry on-chain.
 * Query params:
 *   - network: 'mainnet' | 'testnet' (default: both)
 *   - limit: number of agents to index per network (default: 0 = all)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { searchParams } = new URL(request.url);
    const network = searchParams.get('network') as Network | null;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 0;

    if (network && network !== 'mainnet' && network !== 'testnet') {
      return successResponse({ error: 'Invalid network. Use mainnet or testnet.' }, 400);
    }

    logger.info({ network: network || 'both', limit }, 'Agent sync triggered');

    if (network) {
      const result = await syncNetwork(network, limit);

      return successResponse({
        message: `Agent sync completed for ${network}`,
        [network]: {
          indexed: result.indexed,
          skipped: result.skipped,
          failed: result.failed,
          total: result.total,
        },
      });
    }

    const { mainnet, testnet } = await syncAgents(limit);

    return successResponse({
      message: 'Agent sync completed for both networks',
      mainnet: {
        indexed: mainnet.indexed,
        skipped: mainnet.skipped,
        failed: mainnet.failed,
        total: mainnet.total,
      },
      testnet: {
        indexed: testnet.indexed,
        skipped: testnet.skipped,
        failed: testnet.failed,
        total: testnet.total,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error during agent sync');
    return handleError(error);
  }
}

/**
 * GET /api/v1/indexer/sync
 * Same as POST - supports cron jobs that only use GET.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}
