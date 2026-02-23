import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { publicClient, isMainnet } from '@/lib/blockchain/client';
import { ERC8004_CONTRACTS } from '@/config/contracts';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-indexer-debug');

/**
 * GET /api/v1/indexer/debug
 * Debug endpoint to check event reading
 */
export async function GET(_request: NextRequest) {
  try {
    const registryAddress = isMainnet()
      ? ERC8004_CONTRACTS.identity.mainnet
      : ERC8004_CONTRACTS.identity.testnet;
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
