/**
 * Script to re-index all agents from the ERC-8004 Identity Registry.
 * Usage: npx tsx -r dotenv/config scripts/reindex-all.ts -- dotenv_config_path=.env.local
 */
import { PrismaClient } from '@prisma/client';
import { createPublicClient, http, keccak256, encodePacked, type Address } from 'viem';
import { avalanche } from 'viem/chains';
import { gunzipSync } from 'zlib';

const prisma = new PrismaClient();

const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address;

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

function isUrlSafe(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    return !(
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
      hostname === '::1' || hostname === '[::1]' ||
      hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
      hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') || hostname.startsWith('172.3') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      (url.protocol !== 'https:' && url.protocol !== 'http:')
    );
  } catch { return false; }
}

function deriveAgentAddress(registry: Address, tokenId: bigint): string {
  const hash = keccak256(encodePacked(['address', 'uint256'], [registry, tokenId]));
  return hash.slice(0, 42);
}

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

interface TokenData {
  tokenId: number;
  owner: string;
  tokenURI: string;
}

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
        return { tokenId: id, owner: (owner as string).toLowerCase(), tokenURI: (uri as string) || '' };
      } catch { return null; }
    });

    const batchResults = await Promise.all(promises);
    for (const r of batchResults) { if (r) results.push(r); }

    if (i % 250 === 0) console.log(`  RPC read: ${i}/${tokenIds.length}`);
    if (i + BATCH_SIZE < tokenIds.length) await new Promise(r => setTimeout(r, 100));
  }

  return results;
}

interface AgentInfo {
  name: string;
  description: string;
  metadata: Record<string, unknown> | null;
}

async function resolveAgentInfo(tokenURI: string, tokenId: number): Promise<AgentInfo> {
  const defaultName = `Agent #${tokenId}`;
  const defaultDesc = `Autonomous agent registered on Avalanche (Token #${tokenId})`;

  if (!tokenURI) return { name: defaultName, description: defaultDesc, metadata: null };

  // Data URIs
  if (tokenURI.startsWith('data:application/json')) {
    try {
      let jsonStr: string | undefined;
      if (tokenURI.includes(';base64,')) {
        const b64 = tokenURI.split(';base64,')[1];
        const buf = Buffer.from(b64, 'base64');
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          jsonStr = gunzipSync(buf).toString('utf8');
        } else {
          jsonStr = buf.toString('utf8');
        }
      } else if (tokenURI.includes(',')) {
        const raw = tokenURI.split(',').slice(1).join(',');
        jsonStr = decodeURIComponent(raw);
      }
      if (jsonStr) {
        const json = JSON.parse(jsonStr);
        return { name: json.name || defaultName, description: json.description || defaultDesc, metadata: json };
      }
    } catch { /* invalid */ }
  }

  // IPFS
  if (tokenURI.startsWith('ipfs://')) {
    const cid = tokenURI.replace('ipfs://', '');
    for (const gateway of IPFS_GATEWAYS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const response = await fetch(`${gateway}${cid}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          const json = JSON.parse(await response.text());
          if (json && typeof json === 'object')
            return { name: json.name || defaultName, description: json.description || defaultDesc, metadata: json };
        }
      } catch { continue; }
    }
  }

  // HTTP
  if (tokenURI.startsWith('http') && isUrlSafe(tokenURI)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(tokenURI, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const text = await response.text();
        try {
          const json = JSON.parse(text);
          if (json && typeof json === 'object')
            return { name: json.name || defaultName, description: json.description || defaultDesc, metadata: json };
        } catch { /* not JSON */ }
      }
    } catch { /* unreachable */ }
  }

  return { name: defaultName, description: defaultDesc, metadata: null };
}

// ── Find max tokenId via binary search ──
async function findMaxTokenId(): Promise<number> {
  const exists = async (id: number) => {
    try {
      await client.readContract({ address: REGISTRY, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] });
      return true;
    } catch { return false; }
  };

  if (!(await exists(1))) return 0;
  let low = 1, high = 10000;
  while (await exists(high)) high *= 2;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (await exists(mid)) low = mid; else high = mid - 1;
  }
  return low;
}

// ── Main ──
async function main() {
  console.log('=== On-Chain Re-Index ===');
  console.log('Registry:', REGISTRY);

  // Step 1: Find max tokenId
  const maxTokenId = await findMaxTokenId();
  console.log(`Max tokenId: ${maxTokenId}`);

  if (maxTokenId === 0) { console.log('No tokens found.'); return; }

  // Step 2: Read all on-chain data
  const allIds = Array.from({ length: maxTokenId }, (_, i) => i + 1);
  console.log(`Reading ${allIds.length} tokens from chain...`);
  const tokenDataList = await batchReadTokenData(allIds);
  console.log(`Read ${tokenDataList.length} tokens successfully.`);

  // Step 3: Resolve metadata and insert
  let indexed = 0, noMetadata = 0, failed = 0;
  const BATCH = 10;

  // Deduplicate metadata URLs — cache resolved results
  const metadataCache = new Map<string, AgentInfo>();

  for (let i = 0; i < tokenDataList.length; i += BATCH) {
    const batch = tokenDataList.slice(i, i + BATCH);

    const resolved = await Promise.all(batch.map(async (td) => {
      // Use cache for identical URIs (many tokens share the same URL)
      const cacheKey = td.tokenURI || '';
      let info: AgentInfo;
      if (cacheKey && metadataCache.has(cacheKey)) {
        const cached = metadataCache.get(cacheKey)!;
        // Clone but keep per-token default name if metadata has no name
        info = { ...cached };
        if (!cached.metadata?.name) {
          info.name = `Agent #${td.tokenId}`;
          info.description = `Autonomous agent registered on Avalanche (Token #${td.tokenId})`;
        }
      } else {
        info = await resolveAgentInfo(td.tokenURI, td.tokenId);
        if (cacheKey) metadataCache.set(cacheKey, info);
      }
      return { ...td, info };
    }));

    for (const { tokenId, owner, tokenURI, info } of resolved) {
      const agentAddress = deriveAgentAddress(REGISTRY, BigInt(tokenId));
      const agentType = info.metadata ? classifyAgentType(info.metadata) : 'CUSTOM';

      if (!info.metadata) noMetadata++;

      try {
        await prisma.agent.upsert({
          where: { address: agentAddress },
          create: {
            address: agentAddress,
            name: info.name,
            type: agentType,
            description: info.description,
            owner_address: owner,
            registry_address: REGISTRY,
            token_id: tokenId,
            token_uri: tokenURI || null,
            metadata: info.metadata as any ?? undefined,
            status: 'PENDING',
            trust_score: 0,
          },
          update: {
            name: info.name,
            type: agentType,
            description: info.description,
            owner_address: owner,
            token_uri: tokenURI || null,
            metadata: info.metadata as any ?? undefined,
          },
        });
        indexed++;
      } catch (error) {
        failed++;
        console.error(`  Failed tokenId ${tokenId}:`, (error as Error).message.slice(0, 100));
      }
    }

    if (i % 100 === 0) {
      console.log(`  Progress: ${i}/${tokenDataList.length} | indexed=${indexed} noMeta=${noMetadata} failed=${failed}`);
    }
  }

  console.log('\n=== Results ===');
  console.log(`Total tokens: ${maxTokenId}`);
  console.log(`Successfully indexed: ${indexed}`);
  console.log(`No metadata: ${noMetadata}`);
  console.log(`Failed: ${failed}`);
  console.log(`Metadata cache entries: ${metadataCache.size}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
