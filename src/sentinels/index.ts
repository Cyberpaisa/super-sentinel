/**
 * Sentinel Orchestrator
 *
 * Ejecuta todos los micro-sentinels en paralelo con Promise.allSettled.
 * Cada sentinel es una función pura que recibe un endpoint y retorna SentinelResult.
 *
 * Los sentinels on-chain (proxy-detector, oz-matcher) se importan desde
 * src/services/centinela/ y se adaptan al formato SentinelResult uniforme.
 */

import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult, type OrchestratorResult } from './types';

// Micro-sentinels puros (endpoint-based)
import { checkHealth } from './health';
import { checkTLS } from './tls';
import { checkLatency } from './latency';
import { checkA2A } from './a2a';
import { checkMCP } from './mcp';
import { checkX402 } from './x402';

// New pure sentinels (non-endpoint-based)
import { checkOnChain } from './onchain';
import { checkRatings, type RatingInput } from './ratings';

// On-chain sentinels existentes (address-based) — NO se modifican
import { detectProxy, type ProxyDetectionResult } from '@/services/centinela/proxy-detector';
import { matchOZBytecodeByAddress, type OZMatchResult } from '@/services/centinela/oz-matcher';
import { ERC8004_CONTRACTS } from '@/config/contracts';

const logger = createLogger('sentinel:orchestrator');

// Re-export tipos y sentinels individuales para consumo externo
export { type SentinelResult, type OrchestratorResult, type SentinelConfig, type SentinelFn } from './types';
export { checkHealth, type HealthData } from './health';
export { checkTLS, type TLSData, type TLSGrade } from './tls';
export { checkLatency, type LatencyData } from './latency';
export { checkA2A, type A2AData } from './a2a';
export { checkMCP, type MCPData } from './mcp';
export { checkX402, type X402Data } from './x402';
export { checkOnChain, type OnChainData } from './onchain';
export { checkRatings, type RatingInput, type RatingsData } from './ratings';

/**
 * Adapter: wraps proxy-detector result into uniform SentinelResult.
 */
async function runProxySentinel(address: string): Promise<SentinelResult> {
  const result: ProxyDetectionResult = await detectProxy(address as `0x${string}`);

  // Known ERC-8004 contracts get full score — trusted infrastructure
  const knownERC8004 = [
    ERC8004_CONTRACTS.identity.mainnet.toLowerCase(),
    ERC8004_CONTRACTS.identity.testnet.toLowerCase(),
    ERC8004_CONTRACTS.reputation.mainnet.toLowerCase(),
    ERC8004_CONTRACTS.reputation.testnet.toLowerCase(),
  ];
  const isKnownERC8004 = knownERC8004.includes(address.toLowerCase());

  // No proxy = best score, declared proxy = good, undeclared = zero
  let score: number;
  if (isKnownERC8004) {
    score = 100;
  } else if (!result.isProxy) {
    score = 100;
  } else if (result.proxyType !== 'NONE' && result.proxyType !== 'CUSTOM') {
    score = 80;
  } else if (result.proxyType === 'CUSTOM') {
    score = 0;
  } else {
    score = 50;
  }

  return {
    sentinel: 'proxy',
    passed: score >= 50,
    score,
    data: {
      isProxy: result.isProxy,
      proxyType: result.proxyType,
      implementationAddress: result.implementationAddress ?? null,
      beaconAddress: result.beaconAddress ?? null,
      adminAddress: result.adminAddress ?? null,
    },
  };
}

/**
 * Adapter: wraps oz-matcher result into uniform SentinelResult.
 */
async function runOZSentinel(address: string): Promise<SentinelResult> {
  const result: OZMatchResult = await matchOZBytecodeByAddress(address as `0x${string}`);

  return {
    sentinel: 'oz-match',
    passed: result.score >= 50,
    score: result.score,
    data: {
      matchedComponents: result.matchedComponents,
      confidence: result.confidence,
    },
  };
}

/**
 * Per-service endpoint overrides for sentinels that need specific URLs.
 */
export interface EndpointOverrides {
  mcp?: string | null;
  a2a?: string | null;
  x402?: string | null;
}

/**
 * Run all endpoint-based sentinels.
 *
 * Each sentinel can use a per-service endpoint override from metadata.services[].
 * health/tls/latency use the primary endpoint; a2a/mcp/x402 use their own if available.
 */
export async function runEndpointSentinels(endpoint: string, overrides?: EndpointOverrides): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  const mcpUrl = overrides?.mcp || endpoint;
  const a2aUrl = overrides?.a2a || endpoint;
  const x402Url = overrides?.x402 || endpoint;

  logger.info({ endpoint, mcp: mcpUrl, a2a: a2aUrl, x402: x402Url }, 'Starting endpoint sentinel scan');

  const namedChecks = [
    { name: 'health', fn: () => checkHealth(endpoint) },
    { name: 'tls', fn: () => checkTLS(endpoint) },
    { name: 'latency', fn: () => checkLatency(endpoint) },
    { name: 'a2a', fn: () => checkA2A(a2aUrl) },
    { name: 'mcp', fn: () => checkMCP(mcpUrl) },
    { name: 'x402', fn: () => checkX402(x402Url) },
  ];

  const settled = await Promise.allSettled(namedChecks.map((c) => c.fn()));

  const results: SentinelResult[] = [];
  const errors: Array<{ sentinel: string; reason: string }> = [];

  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      errors.push({
        sentinel: namedChecks[i].name,
        reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const scores = results.map((r) => r.score);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const summary = {
    total: namedChecks.length,
    passed,
    failed: results.filter((r) => !r.passed).length,
    errored: errors.length,
    averageScore,
  };

  logger.info({ endpoint, summary }, 'Endpoint sentinel scan completed');

  return { target: endpoint, timestamp, results, errors, summary };
}

/**
 * Run all on-chain sentinels for a given contract address.
 *
 * Executes proxy-detector and oz-matcher in parallel.
 * These require a valid 0x address on Avalanche C-Chain.
 */
export async function runOnChainSentinels(address: string): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  logger.info({ address }, 'Starting on-chain sentinel scan');

  const namedChecks = [
    { name: 'proxy', fn: () => runProxySentinel(address) },
    { name: 'oz-match', fn: () => runOZSentinel(address) },
    { name: 'on-chain', fn: () => checkOnChain(address) },
  ];

  const settled = await Promise.allSettled(namedChecks.map((c) => c.fn()));

  const results: SentinelResult[] = [];
  const errors: Array<{ sentinel: string; reason: string }> = [];

  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      errors.push({
        sentinel: namedChecks[i].name,
        reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const scores = results.map((r) => r.score);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const summary = {
    total: namedChecks.length,
    passed,
    failed: results.filter((r) => !r.passed).length,
    errored: errors.length,
    averageScore,
  };

  logger.info({ address, summary }, 'On-chain sentinel scan completed');

  return { target: address, timestamp, results, errors, summary };
}

/**
 * Run context sentinels that don't depend on an endpoint or address.
 *
 * Currently includes the ratings sentinel. Accepts optional inputs;
 * only runs sentinels for which data is provided.
 */
export async function runContextSentinels(options: {
  ratings?: RatingInput[];
}): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  logger.info('Starting context sentinel scan');

  const namedChecks: Array<{ name: string; fn: () => Promise<SentinelResult> }> = [];

  if (options.ratings && options.ratings.length > 0) {
    namedChecks.push({ name: 'ratings', fn: () => checkRatings(options.ratings!) });
  }

  const settled = await Promise.allSettled(namedChecks.map((c) => c.fn()));

  const results: SentinelResult[] = [];
  const errors: Array<{ sentinel: string; reason: string }> = [];

  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      errors.push({
        sentinel: namedChecks[i].name,
        reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const scores = results.map((r) => r.score);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const summary = {
    total: namedChecks.length,
    passed,
    failed: results.filter((r) => !r.passed).length,
    errored: errors.length,
    averageScore,
  };

  logger.info({ summary }, 'Context sentinel scan completed');

  return { target: 'context', timestamp, results, errors, summary };
}

/**
 * Options for a full sentinel scan.
 */
export interface FullScanOptions {
  /** Per-service endpoint overrides (MCP, A2A, x402) */
  endpointOverrides?: EndpointOverrides;
  /** Contract address for on-chain sentinels (registry, not derived) */
  onChainAddress?: string | null;
  /** On-chain reputation ratings */
  ratings?: RatingInput[];
}

/**
 * Run ALL sentinels (endpoint + on-chain + context) for a full agent scan.
 *
 * This is the main entry point for a complete agent verification.
 * Runs endpoint-based, on-chain, and context sentinels in parallel, then merges results.
 *
 * @param endpoint - Primary endpoint for health/tls/latency
 * @param agentAddress - Derived agent address (for identification only)
 * @param options - Per-service overrides, on-chain address, ratings
 */
export async function runAllSentinels(
  endpoint: string,
  agentAddress: string,
  options?: FullScanOptions
): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  // Use registry address for on-chain checks if available, otherwise fall back to agent address
  const onChainAddr = options?.onChainAddress || agentAddress;

  logger.info({ endpoint, agentAddress, onChainAddr }, 'Starting full sentinel scan');

  const tasks: Promise<OrchestratorResult>[] = [
    runEndpointSentinels(endpoint, options?.endpointOverrides),
    runOnChainSentinels(onChainAddr),
  ];

  if (options?.ratings && options.ratings.length > 0) {
    tasks.push(runContextSentinels({ ratings: options.ratings }));
  }

  const orchestratorResults = await Promise.all(tasks);

  const results = orchestratorResults.flatMap((r) => r.results);
  const errors = orchestratorResults.flatMap((r) => r.errors);

  const passed = results.filter((r) => r.passed).length;
  const scores = results.map((r) => r.score);
  const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const summary = {
    total: results.length + errors.length,
    passed,
    failed: results.filter((r) => !r.passed).length,
    errored: errors.length,
    averageScore,
  };

  logger.info({ endpoint, agentAddress, summary }, 'Full sentinel scan completed');

  return { target: `${agentAddress}|${endpoint}`, timestamp, results, errors, summary };
}
