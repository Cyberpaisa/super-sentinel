#!/usr/bin/env npx tsx
/**
 * x402 Multi-Agent Scan Test
 *
 * Executes 3 sequential x402 paid scans against Super Sentinel:
 *   1. Scan AvaRiskScan endpoint  ($0.01 USDC)
 *   2. Scan Apex Arbitrage endpoint ($0.01 USDC)
 *   3. Scan Super Sentinel (self-scan) ($0.01 USDC)
 *
 * Total cost: ~$0.03 USDC
 *
 * Usage:
 *   npx tsx scripts/x402-multi-test.ts
 *
 * Environment (.env.local):
 *   PAYER_PRIVATE_KEY  — hex private key of the paying agent wallet
 *   FACILITATOR_URL    — (optional) x402 facilitator override
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  createPublicClient,
  http,
  encodePacked,
  keccak256,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalanche } from 'viem/chains';

// Load .env.local from project root
config({ path: resolve(import.meta.dirname ?? __dirname, '..', '.env.local') });

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USDC_ADDRESS = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as const;
const CHAIN_ID = 43114;

const SUPER_SENTINEL_URL = process.env.SENTINEL_URL || 'http://localhost:3000';

/** Targets to scan in order */
const TARGETS = [
  {
    name: 'AvaRiskScan',
    agentId: 1686,
    endpoint: 'https://avariskscan-defi-production.up.railway.app',
  },
  {
    name: 'Apex Arbitrage',
    agentId: 1687,
    endpoint: 'https://apex-arbitrage-agent-production.up.railway.app',
  },
  {
    name: 'Super Sentinel (self-scan)',
    agentId: null,
    endpoint: SUPER_SENTINEL_URL,
  },
];

/** EIP-712 domain — USDC EIP-3009 on Avalanche */
const USDC_EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: CHAIN_ID,
  verifyingContract: USDC_ADDRESS,
} as const;

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// ANSI
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`${c.red}Error:${c.reset} ${msg}`);
  process.exit(1);
}

function generateNonce(): Hex {
  const random = crypto.getRandomValues(new Uint8Array(32));
  return keccak256(encodePacked(['bytes'], [`0x${Buffer.from(random).toString('hex')}` as Hex]));
}

interface ScanResult {
  name: string;
  txHash: string | null;
  paid: string | null;
  status: number;
  body: unknown;
}

// ---------------------------------------------------------------------------
// Single scan (reuses x402-scan.ts logic)
// ---------------------------------------------------------------------------

async function runScan(
  account: ReturnType<typeof privateKeyToAccount>,
  target: (typeof TARGETS)[number],
): Promise<ScanResult> {
  const scanUrl = `${SUPER_SENTINEL_URL}/api/v1/sentinel/scan`;

  // Step 1: POST without payment → expect 402
  console.log(`${c.dim}  → POST without payment...${c.reset}`);
  const firstRes = await fetch(scanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address, endpoint: target.endpoint }),
  });

  if (firstRes.status !== 402) {
    if (firstRes.ok) {
      console.log(`${c.yellow}  → Got 200 without payment (x402 may be disabled)${c.reset}`);
      const body = await firstRes.json();
      return { name: target.name, txHash: null, paid: null, status: 200, body };
    }
    die(`Expected 402, got ${firstRes.status}: ${await firstRes.text()}`);
  }

  // Step 2: Read X-402-* headers
  const price = firstRes.headers.get('X-402-Price') || '10000';
  const recipient = firstRes.headers.get('X-402-Recipient');
  if (!recipient) die('Missing X-402-Recipient header');

  console.log(`${c.dim}  → 402 received: $${parseInt(price) / 1e6} USDC → ${recipient.slice(0, 10)}...${c.reset}`);

  // Step 3: Sign EIP-712 TransferWithAuthorization
  const nonce = generateNonce();
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const signature = await account.signTypedData({
    domain: USDC_EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: recipient as `0x${string}`,
      value: BigInt(price),
      validAfter,
      validBefore,
      nonce,
    },
  });

  // Step 4: Build payment token
  const paymentToken = Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: 'exact',
      network: `eip155:${CHAIN_ID}`,
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: recipient,
          value: price,
          validAfter: Number(validAfter),
          validBefore: Number(validBefore),
          nonce,
        },
      },
    }),
  ).toString('base64');

  // Step 5: Retry with payment
  console.log(`${c.dim}  → POST with payment...${c.reset}`);
  const paidRes = await fetch(scanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Token': paymentToken,
    },
    body: JSON.stringify({ address: account.address, endpoint: target.endpoint }),
  });

  if (!paidRes.ok) {
    const body = await paidRes.text();
    const reason = paidRes.headers.get('X-402-Reason');
    die(`Paid request failed (${paidRes.status}): ${reason ?? body}`);
  }

  const txHash = paidRes.headers.get('X-402-TxHash');
  const paid = paidRes.headers.get('X-402-Paid');
  const body = await paidRes.json();

  return { name: target.name, txHash, paid, status: paidRes.status, body };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log();
  console.log(`${c.cyan}${c.bold}x402 Multi-Agent Scan Test${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`${c.dim}3 targets × $0.01 USDC = ~$0.03 total${c.reset}`);
  console.log();

  // --- Setup wallet ---
  const privateKey = process.env.PAYER_PRIVATE_KEY;
  if (!privateKey) die('PAYER_PRIVATE_KEY not set in .env.local');

  const account = privateKeyToAccount(privateKey as Hex);
  console.log(`${c.bold}Payer wallet:${c.reset} ${account.address}`);

  const client = createPublicClient({
    chain: avalanche,
    transport: http(),
  });

  // Check USDC balance
  const usdcBalance = await client.readContract({
    address: USDC_ADDRESS,
    abi: [{
      inputs: [{ name: 'account', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    }],
    functionName: 'balanceOf',
    args: [account.address],
  });

  const balanceUsd = Number(usdcBalance) / 1e6;
  console.log(`${c.bold}USDC balance:${c.reset} ${balanceUsd} USDC`);

  if (usdcBalance < 30000n) {
    die(`Insufficient USDC: need at least $0.03 for 3 scans, have $${balanceUsd}`);
  }

  console.log();

  // --- Run scans sequentially ---
  const results: ScanResult[] = [];

  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    const num = i + 1;

    console.log(`${c.magenta}${c.bold}[${num}/3] Scanning: ${target.name}${c.reset}`);
    console.log(`${c.dim}  Endpoint: ${target.endpoint}${c.reset}`);

    const result = await runScan(account, target);
    results.push(result);

    if (result.txHash) {
      console.log(`${c.green}  ✓ Payment: $${parseInt(result.paid || '0') / 1e6} USDC${c.reset}`);
      console.log(`${c.green}  ✓ TxHash: ${result.txHash}${c.reset}`);
      console.log(`${c.dim}    https://snowtrace.io/tx/${result.txHash}${c.reset}`);
    } else {
      console.log(`${c.yellow}  ⚠ No payment (status ${result.status})${c.reset}`);
    }

    console.log();

    // Small delay between scans to avoid rate-limiting
    if (i < TARGETS.length - 1) {
      console.log(`${c.dim}  Waiting 2s before next scan...${c.reset}`);
      await new Promise((r) => setTimeout(r, 2000));
      console.log();
    }
  }

  // --- Summary ---
  console.log(`${c.cyan}${c.bold}Summary${c.reset}`);
  console.log(`${c.cyan}━━━━━━━${c.reset}`);

  let totalPaid = 0;
  for (const r of results) {
    const paidAmt = r.paid ? parseInt(r.paid) / 1e6 : 0;
    totalPaid += paidAmt;
    const status = r.txHash ? `${c.green}✓${c.reset}` : `${c.yellow}⚠${c.reset}`;
    console.log(`  ${status} ${r.name}: $${paidAmt} USDC ${r.txHash ? `(${r.txHash.slice(0, 14)}...)` : '(no tx)'}`);
  }

  console.log();
  console.log(`${c.bold}Total paid:${c.reset} $${totalPaid.toFixed(4)} USDC`);
  console.log();

  // --- TRACER results ---
  console.log(`${c.cyan}${c.bold}TRACER Results${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━${c.reset}`);

  for (const r of results) {
    console.log();
    console.log(`${c.bold}${r.name}:${c.reset}`);
    console.log(JSON.stringify(r.body, null, 2));
  }

  console.log();
}

main().catch((err) => {
  console.error(`${c.red}${c.bold}Fatal:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
