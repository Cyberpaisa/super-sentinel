#!/usr/bin/env npx tsx
/**
 * Super Sentinel CLI Scanner
 *
 * Runs all endpoint-based sentinels against a URL and displays
 * the TRACER score breakdown in the terminal.
 *
 * Usage:
 *   npx tsx scripts/sentinel-scan.ts https://example.com
 *
 * No Prisma or database dependencies — uses the pure sentinel layer only.
 */

import { checkHealth } from '@/sentinels/health';
import { checkTLS } from '@/sentinels/tls';
import { checkLatency } from '@/sentinels/latency';
import { checkA2A } from '@/sentinels/a2a';
import { checkMCP } from '@/sentinels/mcp';
import { checkX402 } from '@/sentinels/x402';
import { calculateTRACER } from '@/sentinels/scoring';
import type { SentinelResult } from '@/sentinels/types';
import type { TRACERTier, TRACERDimension } from '@/sentinels/scoring/types';

// Silence pino logger to prevent JSON noise in CLI output.
// Child loggers don't inherit level changes, so we replace the underlying
// write stream with a no-op using pino's internal streamSym symbol.
import pino from 'pino';
import { logger } from '@/lib/utils/logger';
import { Writable } from 'node:stream';
const noop = new Writable({ write(_chunk, _enc, cb) { cb(); } });
(logger as unknown as Record<symbol, unknown>)[pino.symbols.streamSym] = noop;

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tierColor(tier: TRACERTier): string {
  switch (tier) {
    case 'VERIFIED':
    case 'PASS':
      return c.green;
    case 'PARTIAL':
      return c.yellow;
    case 'FAIL':
      return c.red;
  }
}

function progressBar(score: number, width = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return `${c.green}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset}`;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function validateUrl(input: string): URL {
  try {
    const url = new URL(input);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http:// and https:// URLs are supported.');
    }
    return url;
  } catch (err) {
    if (err instanceof TypeError) {
      console.error(`${c.red}Error:${c.reset} Invalid URL: "${input}"`);
      console.error(`  Please provide a valid URL (e.g. https://example.com)`);
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Sentinel definitions
// ---------------------------------------------------------------------------

const SENTINELS = [
  { name: 'health', fn: checkHealth },
  { name: 'tls', fn: checkTLS },
  { name: 'latency', fn: checkLatency },
  { name: 'a2a', fn: checkA2A },
  { name: 'mcp', fn: checkMCP },
  { name: 'x402', fn: checkX402 },
] as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = process.argv[2];

  if (!url || url === '--help' || url === '-h') {
    console.log(`
${c.cyan}${c.bold}Super Sentinel Scanner v1.0${c.reset}

${c.bold}Usage:${c.reset}
  npx tsx scripts/sentinel-scan.ts <url>

${c.bold}Example:${c.reset}
  npx tsx scripts/sentinel-scan.ts https://example.com
`);
    process.exit(url ? 0 : 1);
  }

  const parsedUrl = validateUrl(url);
  const target = parsedUrl.href;

  // Header
  console.log();
  console.log(`${c.cyan}${c.bold}Super Sentinel Scanner v1.0${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();
  console.log(`${c.bold}Target:${c.reset} ${target}`);
  console.log(`Scanning ${SENTINELS.length} sentinels...`);
  console.log();

  const startTime = performance.now();

  // Run sentinels sequentially for progress display
  const results: SentinelResult[] = [];
  const errors: Array<{ sentinel: string; reason: string }> = [];

  for (const sentinel of SENTINELS) {
    process.stdout.write(`  ${c.dim}⟳ ${sentinel.name}...${c.reset}`);

    try {
      const result = await sentinel.fn(target);
      results.push(result);
      // Clear line and print result
      process.stdout.write(`\x1b[2K\r  ${result.passed ? `${c.green}✓` : `${c.red}✗`} ${padRight(sentinel.name, 10)} ${padLeft(String(result.score), 3)}  ${result.passed ? `${c.green}PASS` : `${c.red}FAIL`}${c.reset}\n`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push({ sentinel: sentinel.name, reason });
      process.stdout.write(`\x1b[2K\r  ${c.red}✗ ${padRight(sentinel.name, 10)} ${padLeft('—', 3)}  ERROR${c.reset}\n`);
    }
  }

  // Errors section
  if (errors.length > 0) {
    console.log();
    console.log(`${c.red}${c.bold}Errors:${c.reset}`);
    for (const e of errors) {
      console.log(`  ${c.red}${e.sentinel}:${c.reset} ${e.reason}`);
    }
  }

  // TRACER Score
  const tracer = calculateTRACER(results);
  const tc = tierColor(tracer.tier);

  console.log();
  console.log(`${c.bold}TRACER Score:${c.reset} ${tc}${c.bold}${tracer.total}${c.reset} / 100`);
  console.log(`${c.bold}Tier:${c.reset} ${tc}${c.bold}${tracer.tier}${c.reset}`);

  // Dimensions
  console.log();
  console.log(`${c.bold}Dimensions:${c.reset}`);

  const dimensionOrder: Array<{ key: keyof typeof tracer.dimensions; label: string }> = [
    { key: 'trust', label: 'Trust' },
    { key: 'reliability', label: 'Reliability' },
    { key: 'autonomy', label: 'Autonomy' },
    { key: 'capability', label: 'Capability' },
    { key: 'economics', label: 'Economics' },
    { key: 'reputation', label: 'Reputation' },
  ];

  for (const { key, label } of dimensionOrder) {
    const dim: TRACERDimension = tracer.dimensions[key];
    const weightPct = `${Math.round(dim.weight * 100)}%`;
    console.log(
      `  ${padRight(label, 13)}${padLeft(String(dim.score), 3)}  ${progressBar(dim.score)}  ${c.dim}(${weightPct})${c.reset}`
    );
  }

  // Elapsed time
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log(`${c.dim}Completed in ${elapsed}s${c.reset}`);
  console.log();
}

main().catch((err) => {
  console.error(`${c.red}${c.bold}Fatal error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
