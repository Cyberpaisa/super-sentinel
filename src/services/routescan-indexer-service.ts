/**
 * Routescan-based indexer service
 * Uses Routescan API to fetch all historical Transfer events and index agents
 * This is more efficient and comprehensive than scanning blockchain events directly
 */
import { type Prisma } from '@prisma/client';
import { createPublicClient, http, keccak256, encodePacked, type Address } from 'viem';
import { createLogger } from '@/lib/utils/logger';
import { avalanche } from 'viem/chains';
import { createAgent } from './agent-service';
import type { CreateAgentInput } from './agent-service';
import { prisma } from '@/lib/database/prisma';
import { ERC8004_CONTRACTS } from '@/config/contracts';

const logger = createLogger('routescan-indexer');

// Registry address on mainnet (from single source of truth)
const REGISTRY = ERC8004_CONTRACTS.identity.mainnet;
const ROUTESCAN_API = 'https://api.routescan.io/v2/network/mainnet/evm/43114/erc721-transfers';

const ABI = [
  {
    inputs: [{ type: 'uint256', name: 'tokenId' }],
    name: 'tokenURI',
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ type: 'uint256', name: 'tokenId' }],
    name: 'ownerOf',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const client = createPublicClient({
  chain: avalanche,
  transport: http('https://api.avax.network/ext/bc/C/rpc', {
    retryCount: 3,
    timeout: 15_000,
  }),
});

interface Transfer {
  tokenId: string;
  from: string;
  to: string;
  blockNumber: string;
}

export interface RoutesScanIndexerResult {
  indexed: number;
  skipped: number;
  failed: number;
  total: number;
}

/**
 * Sync agents from Routescan API
 * Fetches all Transfer events, identifies unique tokens, and indexes new agents
 *
 * @param maxPages - Maximum number of pages to fetch (0 = all pages, default: 20 for quick sync)
 */
export async function syncAgentsFromRoutescan(maxPages = 20): Promise<RoutesScanIndexerResult> {
  logger.info({ registry: REGISTRY, maxPages }, 'Starting Routescan indexer');

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let nextToken: string | undefined;
  let page = 1;

  // Track which tokens we've seen to avoid duplicates across pages
  const processedTokens = new Set<string>();

  do {
    const url = nextToken
      ? `${ROUTESCAN_API}?tokenAddress=${REGISTRY}&limit=50&nextToken=${nextToken}`
      : `${ROUTESCAN_API}?tokenAddress=${REGISTRY}&limit=50&count=true`;

    logger.info({ page, maxPages }, 'Fetching transfers from Routescan');

    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ status: response.status }, 'Routescan API error');
      break;
    }

    const data = await response.json();
    logger.info({ page, transfers: data.items.length }, 'Fetched transfers');

    // Find minted tokens in this page (from = 0x0)
    const mints = data.items.filter((t: Transfer) =>
      t.from === '0x0000000000000000000000000000000000000000'
    );

    logger.info({ page, mints: mints.length }, 'Found mints in page');

    // Process each minted token
    for (const mint of mints) {
      const tokenIdStr = mint.tokenId;

      // Skip if already processed
      if (processedTokens.has(tokenIdStr)) {
        continue;
      }
      processedTokens.add(tokenIdStr);

      const tokenId = BigInt(tokenIdStr);
      const agentAddress = deriveAgentAddress(REGISTRY, tokenId);

      // Check if exists in DB
      const existing = await prisma.agent.findUnique({
        where: { address: agentAddress },
        select: { metadata: true, token_uri: true, token_id: true },
      });

      // Read tokenURI from blockchain
      let tokenURI = '';
      try {
        tokenURI = await client.readContract({
          address: REGISTRY,
          abi: ABI,
          functionName: 'tokenURI',
          args: [tokenId],
        }) as string;
      } catch {
        // tokenURI may not exist
      }

      // If agent exists and already has metadata + token_id, skip
      if (existing && existing.metadata && existing.token_id) {
        skipped++;
        continue;
      }

      // Resolve agent info from tokenURI
      const agentInfo = await resolveAgentInfo(tokenURI, Number(tokenId));

      if (existing) {
        // Update existing agent with metadata + registry info
        try {
          await prisma.agent.update({
            where: { address: agentAddress },
            data: {
              name: agentInfo.name,
              description: agentInfo.description,
              registry_address: REGISTRY,
              token_id: Number(tokenId),
              token_uri: tokenURI || undefined,
              metadata: agentInfo.metadata as Prisma.InputJsonValue,
            },
          });
          indexed++;
          logger.info({ tokenId: Number(tokenId), name: agentInfo.name }, 'Agent metadata updated');
        } catch (error) {
          failed++;
          logger.error({ tokenId: Number(tokenId), error }, 'Failed to update agent metadata');
        }
      } else {
        // Read current owner from blockchain
        let owner: string;
        try {
          owner = await client.readContract({
            address: REGISTRY,
            abi: ABI,
            functionName: 'ownerOf',
            args: [tokenId],
          }) as Address;
          owner = owner.toLowerCase();
        } catch {
          logger.warn({ tokenId: Number(tokenId) }, 'Token has no current owner (burned?)');
          failed++;
          continue;
        }

        // Insert new agent
        try {
          const agentData: CreateAgentInput = {
            address: agentAddress,
            name: agentInfo.name,
            type: 'CUSTOM',
            description: agentInfo.description,
            owner_address: owner,
            registry_address: REGISTRY,
            token_id: Number(tokenId),
            token_uri: tokenURI,
            metadata: agentInfo.metadata,
            status: 'VERIFIED',
          };

          await createAgent(agentData);
          indexed++;
          logger.info({ tokenId: Number(tokenId), name: agentInfo.name }, 'Agent indexed');
        } catch (error) {
          failed++;
          logger.error({ tokenId: Number(tokenId), error }, 'Failed to index agent');
        }
      }
    }

    logger.info({ page, indexed, skipped, failed }, 'Page processed');

    // Pagination
    nextToken = data.link?.nextToken;
    page++;

    // Check if we've reached maxPages (0 means no limit)
    if (maxPages > 0 && page > maxPages) {
      logger.info({ maxPages }, 'Reached max pages limit');
      break;
    }

    // Rate limiting
    if (nextToken) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } while (nextToken);

  const result = {
    indexed,
    skipped,
    failed,
    total: processedTokens.size,
  };

  logger.info(result, 'Routescan indexer completed');

  return result;
}

function deriveAgentAddress(registry: Address, tokenId: bigint): string {
  const hash = keccak256(encodePacked(['address', 'uint256'], [registry, tokenId]));
  return hash.slice(0, 42);
}

async function resolveAgentInfo(
  tokenURI: string,
  tokenId: number
): Promise<{ name: string; description: string; metadata?: Record<string, unknown> }> {
  const defaultName = `Agent #${tokenId}`;
  const defaultDesc = `Autonomous agent registered in ERC-8004 Identity Registry (Token #${tokenId})`;

  if (!tokenURI) return { name: defaultName, description: defaultDesc };

  // Data URIs (base64)
  if (tokenURI.startsWith('data:application/json;base64,')) {
    try {
      const b64 = tokenURI.replace('data:application/json;base64,', '');
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return {
        name: json.name || defaultName,
        description: json.description || defaultDesc,
        metadata: json,
      };
    } catch {
      // Invalid base64 or JSON
    }
  }

  // Data URIs (plain)
  if (tokenURI.startsWith('data:application/json,')) {
    try {
      const raw = tokenURI.replace('data:application/json,', '');
      const json = JSON.parse(decodeURIComponent(raw));
      return {
        name: json.name || defaultName,
        description: json.description || defaultDesc,
        metadata: json,
      };
    } catch {
      // Invalid JSON
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
        return {
          name: json.name || defaultName,
          description: json.description || defaultDesc,
          metadata: json,
        };
      }
    } catch {
      // URI not accessible, extract name from URL path
    }

    // Fallback: extract name from URL path
    try {
      const url = new URL(tokenURI);
      const parts = url.pathname.split('/').filter(Boolean);
      const pathName = parts.find((p) => p !== 'agent.json' && !p.endsWith('.json'));
      if (pathName) {
        const name = pathName
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        return { name, description: `Autonomous agent "${name}" (Token #${tokenId})` };
      }
    } catch {
      // Invalid URL
    }
  }

  return { name: defaultName, description: defaultDesc };
}
