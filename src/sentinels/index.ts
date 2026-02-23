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

  // No proxy = best score, declared proxy = good, undeclared = zero
  let score: number;
  if (!result.isProxy) {
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
 * Run all endpoint-based sentinels for a given URL.
 *
 * Executes health, TLS, and latency checks in parallel using Promise.allSettled.
 * Each sentinel failure is isolated — one failing does not block the rest.
 */
export async function runEndpointSentinels(endpoint: string): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  logger.info({ endpoint }, 'Starting endpoint sentinel scan');

  const namedChecks = [
    { name: 'health', fn: () => checkHealth(endpoint) },
    { name: 'tls', fn: () => checkTLS(endpoint) },
    { name: 'latency', fn: () => checkLatency(endpoint) },
    { name: 'a2a', fn: () => checkA2A(endpoint) },
    { name: 'mcp', fn: () => checkMCP(endpoint) },
    { name: 'x402', fn: () => checkX402(endpoint) },
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
 * Run ALL sentinels (endpoint + on-chain + context) for a full agent scan.
 *
 * This is the main entry point for a complete agent verification.
 * Runs endpoint-based, on-chain, and context sentinels in parallel, then merges results.
 *
 * Optional `ratings` and `rpcUrl` allow feeding the ratings and on-chain sentinels.
 */
export async function runAllSentinels(
  endpoint: string,
  address: string,
  options?: { ratings?: RatingInput[]; rpcUrl?: string }
): Promise<OrchestratorResult> {
  const timestamp = new Date().toISOString();
  logger.info({ endpoint, address }, 'Starting full sentinel scan');

  const tasks: Promise<OrchestratorResult>[] = [
    runEndpointSentinels(endpoint),
    runOnChainSentinels(address),
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

  logger.info({ endpoint, address, summary }, 'Full sentinel scan completed');

  return { target: `${address}|${endpoint}`, timestamp, results, errors, summary };
}
