import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { publicClient, isMainnet } from '@/lib/blockchain/client';
import { type Address } from 'viem';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-indexer-debug');

const REGISTRY_ADDRESSES = {
  mainnet: {
    identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address,
  },
  testnet: {
    identity: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
  },
};

/**
 * GET /api/v1/indexer/debug
 * Debug endpoint to check event reading
 */
export async function GET(_request: NextRequest) {
  try {
    const authHeader = _request.headers.get('authorization');
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
      return new Response(JSON.stringify({ data: null, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const registryAddress = isMainnet()
      ? REGISTRY_ADDRESSES.mainnet.identity
      : REGISTRY_ADDRESSES.testnet.identity;
    const network = isMainnet() ? 'mainnet' : 'testnet';

    logger.info({ registryAddress, network }, 'Debug: checking events');

    const currentBlock = await publicClient.getBlockNumber();
    const BLOCKS_TO_READ = 302_400n;
    const startBlock =
      currentBlock > BLOCKS_TO_READ ? currentBlock - BLOCKS_TO_READ : 0n;

    // Try reading just first chunk
    const logs = await publicClient.getLogs({
      address: registryAddress,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { indexed: true, type: 'address', name: 'from' },
          { indexed: true, type: 'address', name: 'to' },
          { indexed: true, type: 'uint256', name: 'tokenId' },
        ],
      },
      fromBlock: startBlock,
      toBlock: startBlock + 2048n,
    });

    const mints = logs.filter(
      (log) => log.args.from === '0x0000000000000000000000000000000000000000'
    );

    return successResponse({
      network,
      registryAddress,
      currentBlock: currentBlock.toString(),
      startBlock: startBlock.toString(),
      firstChunkEnd: (startBlock + 2048n).toString(),
      transfersFound: logs.length,
      mintsFound: mints.length,
      mints: mints.map((log) => ({
        tokenId: log.args.tokenId?.toString(),
        owner: log.args.to,
        blockNumber: log.blockNumber?.toString(),
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Error in debug endpoint');
    return handleError(error);
  }
}
