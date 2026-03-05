/**
 * Routescan-based indexer service
 * Uses Routescan API to fetch all historical Transfer events and index agents.
 * Only indexes agents with valid metadata (tokenURI that resolves to JSON).
 * Extracts agent type, endpoints, services from ERC-8004 metadata.
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

/**
 * SSRF protection: validate that a URL is safe to fetch
 */
function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.3') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      (url.protocol !== 'https:' && url.protocol !== 'http:')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
  noMetadata: number;
  failed: number;
  total: number;
}

/**
 * Determine AgentType from ERC-8004 metadata.
 */
function classifyAgentType(metadata: Record<string, unknown>): 'TRADING' | 'LENDING' | 'GOVERNANCE' | 'ORACLE' | 'CUSTOM' {
  const metaStr = JSON.stringify(metadata).toLowerCase();

  if (metaStr.includes('trading') || metaStr.includes('swap') || metaStr.includes('arbitrage') || metaStr.includes('dex')) {
    return 'TRADING';
  }
  if (metaStr.includes('lending') || metaStr.includes('borrow') || metaStr.includes('yield') || metaStr.includes('vault')) {
    return 'LENDING';
  }
  if (metaStr.includes('governance') || metaStr.includes('dao') || metaStr.includes('voting') || metaStr.includes('council')) {
    return 'GOVERNANCE';
  }
  if (metaStr.includes('oracle') || metaStr.includes('price feed') || metaStr.includes('data feed')) {
    return 'ORACLE';
  }

  return 'CUSTOM';
}

/**
 * Batch read tokenURIs for a list of tokenIds using parallel RPC calls.
 * Returns a map of tokenId → tokenURI (empty string if no URI).
 */
async function batchReadTokenURIs(tokenIds: bigint[]): Promise<Map<bigint, string>> {
  const results = new Map<bigint, string>();
  const BATCH_SIZE = 20;

  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    const batch = tokenIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (tokenId) => {
      try {
        const uri = await client.readContract({
          address: REGISTRY,
          abi: ABI,
          functionName: 'tokenURI',
          args: [tokenId],
        }) as string;
        return { tokenId, uri };
      } catch {
        return { tokenId, uri: '' };
      }
    });

    const batchResults = await Promise.all(promises);
    for (const { tokenId, uri } of batchResults) {
      results.set(tokenId, uri);
    }
  }

  return results;
}

/**
 * Sync agents from Routescan API.
 * Phase 1: Collect all mint tokenIds from Routescan (fast, API only).
 * Phase 2: Batch read tokenURIs from blockchain (parallel RPC).
 * Phase 3: Only index tokens with valid resolvable metadata.
 *
 * @param maxPages - Maximum number of pages to fetch (0 = all pages)
 */
export async function syncAgentsFromRoutescan(maxPages = 0): Promise<RoutesScanIndexerResult> {
  logger.info({ registry: REGISTRY, maxPages: maxPages || 'unlimited' }, 'Starting Routescan indexer');

  let indexed = 0;
  let skipped = 0;
  let noMetadata = 0;
  let failed = 0;

  // ── Phase 1: Collect all mint tokenIds from Routescan ──
  const allMintTokenIds: bigint[] = [];
  const seenTokenIds = new Set<string>();
  let nextToken: string | undefined;
  let page = 1;

  do {
    const url = nextToken
      ? `${ROUTESCAN_API}?tokenAddress=${REGISTRY}&limit=50&nextToken=${nextToken}`
      : `${ROUTESCAN_API}?tokenAddress=${REGISTRY}&limit=50&count=true`;

    const response = await fetch(url);
    if (!response.ok) {
      logger.error({ status: response.status }, 'Routescan API error');
      break;
    }

    const data = await response.json();
    const items = data.items || [];

    if (items.length === 0) break;

    const mints = items.filter((t: Transfer) =>
      t.from === '0x0000000000000000000000000000000000000000'
    );

    for (const mint of mints) {
      if (!seenTokenIds.has(mint.tokenId)) {
        seenTokenIds.add(mint.tokenId);
        allMintTokenIds.push(BigInt(mint.tokenId));
      }
    }

    nextToken = data.link?.nextToken;
    page++;

    if (maxPages > 0 && page > maxPages) break;

    if (nextToken) await new Promise(resolve => setTimeout(resolve, 200));
  } while (nextToken);

  logger.info({ totalMints: allMintTokenIds.length, pages: page - 1 }, 'Phase 1 complete: collected all mint tokenIds');

  // ── Phase 2: Filter out already-indexed agents ──
  const toProcess: bigint[] = [];
  for (const tokenId of allMintTokenIds) {
    const agentAddress = deriveAgentAddress(REGISTRY, tokenId);
    const existing = await prisma.agent.findUnique({
      where: { address: agentAddress },
      select: { metadata: true, token_id: true },
    });
    if (existing && existing.metadata && existing.token_id) {
      skipped++;
    } else {
      toProcess.push(tokenId);
    }
  }

  logger.info({ toProcess: toProcess.length, skipped }, 'Phase 2: filtered existing agents');

  // ── Phase 3: Batch read tokenURIs ──
  const tokenURIs = await batchReadTokenURIs(toProcess);
  logger.info({ urisRead: tokenURIs.size }, 'Phase 3: batch read tokenURIs');

  // ── Phase 4: Resolve metadata and index ──
  for (const tokenId of toProcess) {
    const tokenURI = tokenURIs.get(tokenId) || '';

    if (!tokenURI) {
      noMetadata++;
      continue;
    }

    const agentInfo = await resolveAgentInfo(tokenURI, Number(tokenId));

    if (!agentInfo.metadata) {
      noMetadata++;
      continue;
    }

    const agentAddress = deriveAgentAddress(REGISTRY, tokenId);
    const agentType = classifyAgentType(agentInfo.metadata);

    const existing = await prisma.agent.findUnique({
      where: { address: agentAddress },
      select: { address: true },
    });

    if (existing) {
      try {
        await prisma.agent.update({
          where: { address: agentAddress },
          data: {
            name: agentInfo.name,
            type: agentType,
            description: agentInfo.description,
            registry_address: REGISTRY,
            token_id: Number(tokenId),
            token_uri: tokenURI,
            metadata: agentInfo.metadata as Prisma.InputJsonValue,
          },
        });
        indexed++;
        logger.info({ tokenId: Number(tokenId), name: agentInfo.name, type: agentType }, 'Agent updated');
      } catch (error) {
        failed++;
        logger.error({ tokenId: Number(tokenId), error }, 'Failed to update agent');
      }
    } else {
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
        failed++;
        continue;
      }

      try {
        const agentData: CreateAgentInput = {
          address: agentAddress,
          name: agentInfo.name,
          type: agentType,
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
        logger.info({ tokenId: Number(tokenId), name: agentInfo.name, type: agentType }, 'Agent indexed');
      } catch (error) {
        failed++;
        logger.error({ tokenId: Number(tokenId), error }, 'Failed to index agent');
      }
    }
  }

  const result = { indexed, skipped, noMetadata, failed, total: allMintTokenIds.length };
  logger.info(result, 'Routescan indexer completed');
  return result;
}

function deriveAgentAddress(registry: Address, tokenId: bigint): string {
  const hash = keccak256(encodePacked(['address', 'uint256'], [registry, tokenId]));
  return hash.slice(0, 42);
}

/**
 * Resolve agent metadata from tokenURI.
 * Supports data URIs (base64, plain JSON), IPFS, and HTTP URIs.
 * Returns metadata only if valid JSON is found — undefined means skip this agent.
 */
async function resolveAgentInfo(
  tokenURI: string,
  tokenId: number
): Promise<{ name: string; description: string; metadata?: Record<string, unknown> }> {
  const defaultName = `Agent #${tokenId}`;
  const defaultDesc = `Autonomous agent (Token #${tokenId})`;

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

  // Data URIs (plain URL-encoded JSON)
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

  // IPFS URIs — resolve via public gateway
  if (tokenURI.startsWith('ipfs://')) {
    try {
      const cid = tokenURI.replace('ipfs://', '');
      const gatewayUrl = `https://ipfs.io/ipfs/${cid}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const response = await fetch(gatewayUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          if (json && typeof json === 'object') {
            return {
              name: json.name || defaultName,
              description: json.description || defaultDesc,
              metadata: json,
            };
          }
        } catch {
          // Not JSON
        }
      }
    } catch {
      // IPFS gateway unreachable
    }
  }

  // HTTP URIs (with SSRF protection)
  if (tokenURI.startsWith('http') && isUrlSafe(tokenURI)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(tokenURI, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          if (json && typeof json === 'object') {
            return {
              name: json.name || defaultName,
              description: json.description || defaultDesc,
              metadata: json,
            };
          }
        } catch {
          // Response wasn't JSON — skip (not valid agent metadata)
        }
      }
    } catch {
      // URI not accessible
    }
  }

  // No valid metadata resolved
  return { name: defaultName, description: defaultDesc };
}
