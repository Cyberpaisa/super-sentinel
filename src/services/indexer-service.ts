import { createPublicClient, http, keccak256, encodePacked, type Address, type PublicClient } from 'viem';
import { createLogger } from '@/lib/utils/logger';
import { avalanche, avalancheFuji } from '@/lib/blockchain/config';
import { IDENTITY_REGISTRY_ABI } from '@/lib/blockchain/abis/identity-registry';
import { createAgent } from './agent-service';
import type { CreateAgentInput } from './agent-service';
import { prisma } from '@/lib/database/prisma';

const logger = createLogger('indexer-service');

// ── Registry addresses per network ─────────────────────────────────
const REGISTRY_ADDRESSES = {
  mainnet: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
  testnet: '0x8004A818BFB912233c491871b3d84c89A494BD9e' as Address,
};

const REPUTATION_REGISTRY = {
  mainnet: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Address,
  testnet: '0x8004B663056A597Dffe9eCcC1965A193B7388713' as Address, // Uses mainnet address as fallback — update when testnet contract is deployed
};

// ── Dedicated RPC clients (independent of app's CHAIN_ENV) ─────────
const mainnetClient = createPublicClient({
  chain: avalanche,
  transport: http('https://api.avax.network/ext/bc/C/rpc', {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 15_000,
  }),
});

const testnetClient = createPublicClient({
  chain: avalancheFuji,
  transport: http('https://api.avax-test.network/ext/bc/C/rpc', {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 15_000,
  }),
});

export type Network = 'mainnet' | 'testnet';

function getClient(network: Network): PublicClient {
  return network === 'mainnet' ? mainnetClient : testnetClient;
}

// ── Types ──────────────────────────────────────────────────────────

export interface IndexerResult {
  network: Network;
  indexed: number;
  skipped: number;
  failed: number;
  total: number;
  details: {
    tokenId: number;
    owner: Address;
    name: string;
    status: 'indexed' | 'skipped' | 'failed';
    reason?: string;
  }[];
}

interface AgentInfo {
  tokenId: bigint;
  owner: Address;
  name: string;
  description: string;
  tokenURI: string;
  metadata?: Record<string, unknown>;
}

// ── Main sync function ─────────────────────────────────────────────

/**
 * Sync agents from both mainnet and testnet Identity Registries.
 * Scans Transfer events to discover all minted agent NFTs.
 *
 * @param limit - Max number of agents to index per network (0 = all)
 */
export async function syncAgents(limit = 0): Promise<{
  mainnet: IndexerResult;
  testnet: IndexerResult;
}> {
  const [mainnetResult, testnetResult] = await Promise.all([
    syncNetwork('mainnet', limit),
    syncNetwork('testnet', limit),
  ]);

  return { mainnet: mainnetResult, testnet: testnetResult };
}

/**
 * Sync agents from a specific network using Transfer events.
 * Scans for all Transfer events from the registry contract to discover agents.
 *
 * @param network - 'mainnet' or 'testnet'
 * @param limit - Max number of agents to index (0 = all)
 */
export async function syncNetwork(network: Network, limit = 0): Promise<IndexerResult> {
  const client = getClient(network);
  const registry = REGISTRY_ADDRESSES[network];

  const result: IndexerResult = {
    network,
    indexed: 0,
    skipped: 0,
    failed: 0,
    total: 0,
    details: [],
  };

  logger.info({ network, registry, limit }, 'Starting agent sync via Transfer events');

  // Get the current block number
  const currentBlock = await client.getBlockNumber();

  // Scan Transfer events from deployment block to current
  // For testnet: scan ALL blocks from genesis (block 0)
  // For mainnet: limit to recent 100k blocks for performance
  const startBlock = network === 'mainnet' ? currentBlock - 100000n : 0n;

  const totalBlocks = currentBlock - startBlock;
  logger.info({ network, startBlock, currentBlock, totalBlocks }, 'Starting Transfer events scan');

  // Fetch ALL Transfer events to discover minted tokens
  // RPC nodes have a limit on block range (typically 2048 blocks)
  // So we need to fetch in chunks
  const BLOCK_CHUNK_SIZE = 2000n;
  const transferLogs = [];

  const totalChunks = Number((totalBlocks + BLOCK_CHUNK_SIZE - 1n) / BLOCK_CHUNK_SIZE);
  let currentChunk = 0;

  for (let fromBlock = startBlock; fromBlock <= currentBlock; fromBlock += BLOCK_CHUNK_SIZE) {
    const toBlock = fromBlock + BLOCK_CHUNK_SIZE - 1n > currentBlock
      ? currentBlock
      : fromBlock + BLOCK_CHUNK_SIZE - 1n;

    currentChunk++;
    const progress = ((currentChunk / totalChunks) * 100).toFixed(1);

    logger.info({
      network,
      fromBlock,
      toBlock,
      chunk: `${currentChunk}/${totalChunks}`,
      progress: `${progress}%`
    }, 'Fetching Transfer events chunk');

    const logs = await client.getLogs({
      address: registry,
      event: {
        type: 'event',
        name: 'Transfer',
        inputs: [
          { type: 'address', indexed: true, name: 'from' },
          { type: 'address', indexed: true, name: 'to' },
          { type: 'uint256', indexed: true, name: 'tokenId' },
        ],
      },
      fromBlock,
      toBlock,
    });

    transferLogs.push(...logs);
    logger.info({
      network,
      chunkLogs: logs.length,
      totalSoFar: transferLogs.length,
      progress: `${progress}%`
    }, 'Chunk fetched');
  }

  logger.info({ network, totalEvents: transferLogs.length }, 'Completed Transfer events scan');

  // Extract all unique minted token IDs (from = 0x0 means mint)
  const mintEvents = transferLogs.filter(
    (log) => log.args.from === '0x0000000000000000000000000000000000000000'
  );

  // Group by tokenId to get the original owner (first mint event)
  const tokenMap = new Map<bigint, Address>();
  for (const event of mintEvents) {
    const tokenId = event.args.tokenId as bigint;
    const owner = event.args.to as Address;
    if (!tokenMap.has(tokenId)) {
      tokenMap.set(tokenId, owner);
    }
  }

  logger.info({ network, uniqueTokens: tokenMap.size }, 'Found unique minted tokens');

  // Get existing agents from DB to skip duplicates
  const existingAgents = await prisma.agent.findMany({
    where: { registry_address: registry },
    select: { token_id: true },
  });

  const existingTokenIds = new Set(existingAgents.map((a) => a.token_id));

  // Filter tokens to process (only new ones)
  let tokensToProcess = Array.from(tokenMap.entries()).filter(
    ([tokenId]) => !existingTokenIds.has(Number(tokenId))
  );

  // Apply limit if specified
  if (limit > 0) {
    tokensToProcess = tokensToProcess.slice(0, limit);
  }

  result.total = tokensToProcess.length;

  logger.info({ network, tokensToProcess: tokensToProcess.length }, 'Processing new tokens');

  // Process each token
  for (const [tokenId, owner] of tokensToProcess) {
    const agentAddress = deriveAgentAddress(registry, tokenId);

    try {
      // Read tokenURI
      let tokenURI = '';
      try {
        tokenURI = await client.readContract({
          address: registry,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI',
          args: [tokenId],
        }) as string;
      } catch {
        // tokenURI may not exist for some tokens
      }

      // Resolve agent info from URI
      const agentInfo = await resolveAgentInfo(tokenId, owner, tokenURI);

      // Save to database
      const agentData: CreateAgentInput = {
        address: agentAddress,
        name: agentInfo.name,
        type: 'CUSTOM',
        description: agentInfo.description,
        owner_address: owner,
        registry_address: registry,
        token_id: Number(tokenId),
        token_uri: tokenURI,
        metadata: agentInfo.metadata,
        status: 'VERIFIED',
      };

      await createAgent(agentData);

      result.indexed++;
      result.details.push({
        tokenId: Number(tokenId),
        owner,
        name: agentInfo.name,
        status: 'indexed',
      });

      logger.info({ tokenId: Number(tokenId), agentAddress, name: agentInfo.name }, 'Agent indexed');
    } catch (error) {
      result.failed++;
      result.details.push({
        tokenId: Number(tokenId),
        owner,
        name: '',
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
      logger.warn({ tokenId: Number(tokenId), error }, 'Failed to index agent');
    }
  }

  logger.info(
    { network, indexed: result.indexed, skipped: result.skipped, failed: result.failed },
    'Agent sync completed'
  );

  return result;
}

// ── Agent info resolution ──────────────────────────────────────────

/**
 * Resolve agent info from tokenURI.
 * Tries to fetch JSON from URI; falls back to extracting name from URL path.
 */
async function resolveAgentInfo(
  tokenId: bigint,
  owner: Address,
  tokenURI: string
): Promise<AgentInfo> {
  const id = Number(tokenId);
  const defaultInfo: AgentInfo = {
    tokenId,
    owner,
    name: `Agent #${id}`,
    description: `Autonomous agent registered in Identity Registry (Token #${id})`,
    tokenURI,
  };

  if (!tokenURI) return defaultInfo;

  // Data URIs (base64)
  if (tokenURI.startsWith('data:application/json;base64,')) {
    try {
      const b64 = tokenURI.replace('data:application/json;base64,', '');
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return parseAgentJson(json, tokenId, owner, tokenURI);
    } catch {
      return defaultInfo;
    }
  }

  // Data URIs (plain)
  if (tokenURI.startsWith('data:application/json,')) {
    try {
      const raw = tokenURI.replace('data:application/json,', '');
      const json = JSON.parse(decodeURIComponent(raw));
      return parseAgentJson(json, tokenId, owner, tokenURI);
    } catch {
      return defaultInfo;
    }
  }

  // HTTP URIs - try fetch
  if (tokenURI.startsWith('http')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(tokenURI, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const json = await response.json();
        return parseAgentJson(json, tokenId, owner, tokenURI);
      }
    } catch {
      // URI not accessible, extract name from URL path
    }

    const pathName = extractNameFromURI(tokenURI);
    if (pathName) {
      return {
        ...defaultInfo,
        name: pathName,
        description: `Autonomous agent "${pathName}" (Token #${id})`,
      };
    }
  }

  return defaultInfo;
}

/**
 * Parse agent JSON metadata (follows NFT metadata standard)
 */
function parseAgentJson(
  json: Record<string, unknown>,
  tokenId: bigint,
  owner: Address,
  tokenURI: string
): AgentInfo {
  const id = Number(tokenId);
  return {
    tokenId,
    owner,
    name: (json.name as string) || `Agent #${id}`,
    description:
      (json.description as string) ||
      `Autonomous agent registered in Identity Registry (Token #${id})`,
    tokenURI,
    metadata: json, // Store full metadata
  };
}

/**
 * Extract a human-readable name from a tokenURI path.
 * e.g. "https://agents.ultravioleta.xyz/faro/agent.json" -> "Faro"
 */
function extractNameFromURI(uri: string): string | null {
  try {
    const url = new URL(uri);
    const parts = url.pathname.split('/').filter(Boolean);
    const name = parts.find((p) => p !== 'agent.json' && !p.endsWith('.json'));
    if (name) {
      return name
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

/**
 * Derive a deterministic address for an agent from its registry + tokenId.
 * Since multiple NFTs can belong to the same owner, we need a unique address
 * per token. This creates a pseudo-address from keccak256(registry, tokenId),
 * taking the first 20 bytes.
 */
function deriveAgentAddress(registry: Address, tokenId: bigint): string {
  const hash = keccak256(
    encodePacked(['address', 'uint256'], [registry, tokenId])
  );
  return hash.slice(0, 42);
}
