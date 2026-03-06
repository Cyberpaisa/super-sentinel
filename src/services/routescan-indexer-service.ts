/**
 * On-chain indexer service for ERC-8004 Identity Registry.
 * Iterates all tokenIds directly on the blockchain (no Routescan dependency).
 * Indexes ALL agents — with metadata when available, fallback names otherwise.
 */
import { type Prisma } from '@prisma/client';
import { createPublicClient, http, keccak256, encodePacked, type Address } from 'viem';
import { createLogger } from '@/lib/utils/logger';
import { avalanche } from 'viem/chains';
import { prisma } from '@/lib/database/prisma';
import { ERC8004_CONTRACTS } from '@/config/contracts';
import { gunzipSync } from 'zlib';

const logger = createLogger('onchain-indexer');

// ── Config ──────────────────────────────────────────────────────────────────

const REGISTRY = ERC8004_CONTRACTS.identity.mainnet as Address;

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

const IPFS_GATEWAYS = [
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
];

// ── Types ───────────────────────────────────────────────────────────────────

export interface IndexerResult {
  indexed: number;
  updated: number;
  skipped: number;
  noMetadata: number;
  failed: number;
  total: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * SSRF protection: validate that a URL is safe to fetch.
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

function deriveAgentAddress(registry: Address, tokenId: bigint): string {
  const hash = keccak256(encodePacked(['address', 'uint256'], [registry, tokenId]));
  return hash.slice(0, 42);
}

/**
 * Classify agent type from metadata keywords.
 */
function classifyAgentType(metadata: Record<string, unknown>): 'TRADING' | 'LENDING' | 'GOVERNANCE' | 'ORACLE' | 'CUSTOM' {
  const metaStr = JSON.stringify(metadata).toLowerCase();
  if (metaStr.includes('trading') || metaStr.includes('swap') || metaStr.includes('arbitrage') || metaStr.includes('dex'))
    return 'TRADING';
  if (metaStr.includes('lending') || metaStr.includes('borrow') || metaStr.includes('yield') || metaStr.includes('vault'))
    return 'LENDING';
  if (metaStr.includes('governance') || metaStr.includes('dao') || metaStr.includes('voting') || metaStr.includes('council'))
    return 'GOVERNANCE';
  if (metaStr.includes('oracle') || metaStr.includes('price feed') || metaStr.includes('data feed'))
    return 'ORACLE';
  return 'CUSTOM';
}


// ── Max tokenId discovery ───────────────────────────────────────────────────

async function tokenExists(id: number): Promise<boolean> {
  try {
    await client.readContract({
      address: REGISTRY,
      abi: ABI,
      functionName: 'ownerOf',
      args: [BigInt(id)],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Binary search for the highest existing tokenId.
 */
async function findMaxTokenId(): Promise<number> {
  // Quick check: does tokenId 1 exist?
  if (!(await tokenExists(1))) return 0;

  let low = 1;
  let high = 10000;

  // Find an upper bound
  while (await tokenExists(high)) {
    high *= 2;
  }

  // Binary search
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (await tokenExists(mid)) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

// ── Batch RPC reads ─────────────────────────────────────────────────────────

interface TokenData {
  tokenId: number;
  owner: string;
  tokenURI: string;
}

/**
 * Batch read ownerOf + tokenURI for a range of tokenIds.
 */
async function batchReadTokenData(tokenIds: number[]): Promise<TokenData[]> {
  const BATCH_SIZE = 25;
  const results: TokenData[] = [];

  for (let i = 0; i < tokenIds.length; i += BATCH_SIZE) {
    const batch = tokenIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (id): Promise<TokenData | null> => {
      try {
        const [owner, uri] = await Promise.all([
          client.readContract({ address: REGISTRY, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] }),
          client.readContract({ address: REGISTRY, abi: ABI, functionName: 'tokenURI', args: [BigInt(id)] }),
        ]);
        return {
          tokenId: id,
          owner: (owner as string).toLowerCase(),
          tokenURI: (uri as string) || '',
        };
      } catch {
        return null;
      }
    });

    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
    }

    // Small delay between batches to avoid RPC rate limits
    if (i + BATCH_SIZE < tokenIds.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

// ── Metadata resolution ─────────────────────────────────────────────────────

interface AgentInfo {
  name: string;
  description: string;
  metadata: Record<string, unknown> | null;
  image?: string;
}

/**
 * Resolve agent metadata from tokenURI.
 * Supports: data URIs (base64, gzip, URL-encoded), IPFS, HTTP.
 * Returns metadata=null if no valid JSON found (agent is still indexed with fallback).
 */
async function resolveAgentInfo(tokenURI: string, tokenId: number): Promise<AgentInfo> {
  const defaultName = `Agent #${tokenId}`;
  const defaultDesc = `Autonomous agent registered on Avalanche (Token #${tokenId})`;

  if (!tokenURI) return { name: defaultName, description: defaultDesc, metadata: null };

  // ── Data URIs (base64, possibly gzip) ──
  if (tokenURI.startsWith('data:application/json')) {
    try {
      let jsonStr: string | undefined;

      if (tokenURI.includes(';base64,')) {
        const b64 = tokenURI.split(';base64,')[1];
        const buf = Buffer.from(b64, 'base64');

        // Check if gzip-compressed (magic bytes 1f 8b)
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          jsonStr = gunzipSync(buf).toString('utf8');
        } else {
          jsonStr = buf.toString('utf8');
        }
      } else if (tokenURI.includes(',')) {
        // URL-encoded: data:application/json,%7B...
        const raw = tokenURI.split(',').slice(1).join(',');
        jsonStr = decodeURIComponent(raw);
      }

      if (jsonStr) {
        const json = JSON.parse(jsonStr);
        return {
          name: json.name || defaultName,
          description: json.description || defaultDesc,
          metadata: json,
          image: json.image,
        };
      }
    } catch {
      // Invalid data URI
    }
  }

  // ── IPFS URIs — try multiple gateways ──
  if (tokenURI.startsWith('ipfs://')) {
    const cid = tokenURI.replace('ipfs://', '');
    for (const gateway of IPFS_GATEWAYS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
        clearTimeout(timeout);

        if (response.ok) {
          const text = await response.text();
          const json = JSON.parse(text);
          if (json && typeof json === 'object') {
            return {
              name: json.name || defaultName,
              description: json.description || defaultDesc,
              metadata: json,
              image: json.image,
            };
          }
        }
      } catch {
        continue; // Try next gateway
      }
    }
  }

  // ── HTTP/HTTPS URIs ──
  if (tokenURI.startsWith('http') && isUrlSafe(tokenURI)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(tokenURI, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        // Try parsing as JSON
        try {
          const json = JSON.parse(text);
          if (json && typeof json === 'object') {
            return {
              name: json.name || defaultName,
              description: json.description || defaultDesc,
              metadata: json,
              image: json.image,
            };
          }
        } catch {
          // If content-type is HTML, extract title as name
          if (contentType.includes('html') && text.includes('<title>')) {
            const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              return {
                name: titleMatch[1].trim(),
                description: defaultDesc,
                metadata: { name: titleMatch[1].trim(), source: tokenURI },
              };
            }
          }
        }
      }
    } catch {
      // URI not accessible
    }
  }

  // No valid metadata — store URI reference but no parsed metadata
  return { name: defaultName, description: defaultDesc, metadata: null };
}

// ── Main sync function ──────────────────────────────────────────────────────

/**
 * Sync ALL agents from the ERC-8004 Identity Registry on Avalanche.
 * Iterates tokenIds 1→max directly on-chain.
 * Indexes all agents: with metadata if available, fallback name otherwise.
 */
export async function syncAgentsFromRoutescan(): Promise<IndexerResult> {
  logger.info({ registry: REGISTRY }, 'Starting on-chain indexer');

  // Phase 1: Find max tokenId
  const maxTokenId = await findMaxTokenId();
  logger.info({ maxTokenId }, 'Phase 1: found max tokenId');

  if (maxTokenId === 0) {
    return { indexed: 0, updated: 0, skipped: 0, noMetadata: 0, failed: 0, total: 0 };
  }

  // Phase 2: Find which agents already exist in DB (by token_id to be fast)
  const existingAgents = await prisma.agent.findMany({
    where: { registry_address: REGISTRY },
    select: { address: true, token_id: true, metadata: true },
  });
  const existingByTokenId = new Map(
    existingAgents
      .filter(a => a.token_id !== null)
      .map(a => [a.token_id!, { address: a.address, hasMetadata: a.metadata !== null && a.metadata !== undefined }])
  );

  logger.info({ existingCount: existingAgents.length, maxTokenId }, 'Phase 2: checked existing agents');

  // Phase 3: Determine which tokenIds need processing
  const allTokenIds = Array.from({ length: maxTokenId }, (_, i) => i + 1);
  const toIndex: number[] = []; // New agents
  const toUpdate: number[] = []; // Existing agents without metadata

  for (const id of allTokenIds) {
    const existing = existingByTokenId.get(id);
    if (!existing) {
      toIndex.push(id);
    } else if (!existing.hasMetadata) {
      toUpdate.push(id);
    }
  }

  logger.info({ toIndex: toIndex.length, toUpdate: toUpdate.length, alreadyComplete: maxTokenId - toIndex.length - toUpdate.length }, 'Phase 3: classified tokenIds');

  let indexed = 0;
  let updated = 0;
  let skipped = existingAgents.length - toUpdate.length;
  let noMetadata = 0;
  let failed = 0;

  // Phase 4: Batch read on-chain data for new agents
  const toProcess = [...toIndex, ...toUpdate];
  if (toProcess.length === 0) {
    return { indexed: 0, updated: 0, skipped, noMetadata: 0, failed: 0, total: maxTokenId };
  }

  logger.info({ toProcess: toProcess.length }, 'Phase 4: reading on-chain data');
  const tokenDataList = await batchReadTokenData(toProcess);
  logger.info({ read: tokenDataList.length }, 'Phase 4 complete: on-chain data read');

  // Phase 5: Resolve metadata and upsert
  const METADATA_BATCH = 10;
  for (let i = 0; i < tokenDataList.length; i += METADATA_BATCH) {
    const batch = tokenDataList.slice(i, i + METADATA_BATCH);
    const metadataPromises = batch.map(async (td) => {
      const info = await resolveAgentInfo(td.tokenURI, td.tokenId);
      return { ...td, info };
    });

    const resolved = await Promise.all(metadataPromises);

    for (const { tokenId, owner, tokenURI, info } of resolved) {
      const agentAddress = deriveAgentAddress(REGISTRY, BigInt(tokenId));
      const agentType = info.metadata ? classifyAgentType(info.metadata) : 'CUSTOM';
      const isNew = toIndex.includes(tokenId);

      if (!info.metadata) noMetadata++;

      try {
        if (isNew) {
          await prisma.agent.create({
            data: {
              address: agentAddress,
              name: info.name,
              type: agentType,
              description: info.description,
              owner_address: owner,
              registry_address: REGISTRY,
              token_id: tokenId,
              token_uri: tokenURI || null,
              metadata: (info.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
              status: 'PENDING',
              trust_score: 0,
            },
          });
          indexed++;
        } else {
          // Update existing agent (add metadata if now available)
          await prisma.agent.update({
            where: { address: agentAddress },
            data: {
              name: info.name,
              type: agentType,
              description: info.description,
              token_uri: tokenURI || null,
              metadata: (info.metadata ?? undefined) as Prisma.InputJsonValue | undefined,

            },
          });
          updated++;
        }
      } catch (error) {
        failed++;
        logger.error({ tokenId, error: (error as Error).message }, 'Failed to upsert agent');
      }
    }

    if (i % 100 === 0 && i > 0) {
      logger.info({ progress: `${i}/${tokenDataList.length}`, indexed, updated, failed }, 'Progress');
    }
  }

  const result: IndexerResult = { indexed, updated, skipped, noMetadata, failed, total: maxTokenId };
  logger.info(result, 'On-chain indexer completed');
  return result;
}

// Re-export for backwards compatibility
export type { IndexerResult as RoutesScanIndexerResult };
