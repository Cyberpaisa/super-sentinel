#!/usr/bin/env npx tsx
/**
 * x402 Paid Scan — CLI Script
 *
 * Executes a full x402 payment flow against Super Sentinel using USDC:
 *   1. Resolves AvaRiskScan endpoint from ERC-8004 registry
 *   2. POST /api/v1/scan without payment → receives 402 + X-402-* headers
 *   3. Signs EIP-712 TransferWithAuthorization ($0.01 USDC via EIP-3009)
 *   4. Retries with X-Payment-Token header
 *   5. Displays TRACER results + on-chain txHash
 *
 * Usage:
 *   npx tsx scripts/x402-scan.ts [target-url]
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

const AVARISK_AGENT_ID = 1686n;
const ERC8004_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
const USDC_ADDRESS = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E' as const;
const CHAIN_ID = 43114;

/** EIP-712 domain — must match server-side x402-verify.ts (USDC EIP-3009) */
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log();
  console.log(`${c.cyan}${c.bold}x402 Paid Scan — Apex → AvaRiskScan ($0.01 USDC)${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();

  // --- 0. Setup wallet ---
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
    abi: [{ inputs: [{ name: 'account', type: 'address' }], name: 'balanceOf', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
    functionName: 'balanceOf',
    args: [account.address],
  });
  console.log(`${c.bold}USDC balance:${c.reset} ${Number(usdcBalance) / 1e6} USDC`);

  if (usdcBalance < 10000n) {
    die(`Insufficient USDC balance: need at least $0.01 USDC, have ${Number(usdcBalance) / 1e6}`);
  }

  // --- 1. Resolve AvaRiskScan endpoint from ERC-8004 registry ---
  console.log(`${c.dim}Resolving AvaRiskScan (#${AVARISK_AGENT_ID}) from ERC-8004 registry...${c.reset}`);

  let scanEndpoint: string;
  const targetArg = process.argv[2];

  if (targetArg) {
    scanEndpoint = targetArg;
    console.log(`${c.bold}Using provided endpoint:${c.reset} ${scanEndpoint}`);
  } else {
    try {
      const tokenURI = await client.readContract({
        address: ERC8004_REGISTRY,
        abi: [
          {
            inputs: [{ name: 'tokenId', type: 'uint256' }],
            name: 'tokenURI',
            outputs: [{ name: '', type: 'string' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'tokenURI',
        args: [AVARISK_AGENT_ID],
      });

      // tokenURI may be a data URI (data:application/json;base64,...) or HTTP URL
      let metadata: Record<string, unknown>;
      if (tokenURI.startsWith('data:')) {
        const base64 = tokenURI.split(',')[1];
        metadata = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
      } else {
        const res = await fetch(tokenURI);
        metadata = (await res.json()) as Record<string, unknown>;
      }

      const services = metadata.services as Array<{ endpoint?: string }> | undefined;
      const endpoint = services?.[0]?.endpoint;
      if (!endpoint) die('No service endpoint found in AvaRiskScan metadata');
      scanEndpoint = endpoint;
      console.log(`${c.bold}Resolved endpoint:${c.reset} ${scanEndpoint}`);
    } catch (err) {
      die(`Failed to resolve AvaRiskScan from registry: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- 2. POST without payment → expect 402 ---
  console.log();
  console.log(`${c.dim}Step 1: POST without payment → expecting 402...${c.reset}`);

  const scanUrl = scanEndpoint.endsWith('/api/v1/sentinel/scan')
    ? scanEndpoint
    : `${scanEndpoint.replace(/\/$/, '')}/api/v1/sentinel/scan`;

  const firstRes = await fetch(scanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address }),
  });

  if (firstRes.status !== 402) {
    if (firstRes.ok) {
      console.log(`${c.green}Endpoint returned 200 without payment — x402 may be disabled${c.reset}`);
      const body = await firstRes.json();
      console.log(JSON.stringify(body, null, 2));
      return;
    }
    die(`Expected 402, got ${firstRes.status}: ${await firstRes.text()}`);
  }

  // --- 3. Read X-402-* headers ---
  const price = firstRes.headers.get('X-402-Price') || '10000';
  const recipient = firstRes.headers.get('X-402-Recipient');
  const currency = firstRes.headers.get('X-402-Currency') || 'USDC';
  const network = firstRes.headers.get('X-402-Network') || `eip155:${CHAIN_ID}`;

  if (!recipient) die('Missing X-402-Recipient header in 402 response');

  console.log(`${c.green}Got 402 — payment required${c.reset}`);
  console.log(`  Price:     ${price} ($${parseInt(price) / 1e6} ${currency})`);
  console.log(`  Recipient: ${recipient}`);
  console.log(`  Currency:  ${currency}`);
  console.log(`  Network:   ${network}`);

  // --- 4. Sign EIP-712 TransferWithAuthorization ---
  console.log();
  console.log(`${c.dim}Step 2: Signing EIP-712 TransferWithAuthorization ($${parseInt(price) / 1e6} USDC)...${c.reset}`);

  const nonce = generateNonce();
  const validAfter = 0n;
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

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

  console.log(`${c.green}Signed ✓${c.reset}`);
  console.log(`  Nonce:       ${nonce.slice(0, 18)}...`);
  console.log(`  ValidBefore: ${validBefore} (${new Date(Number(validBefore) * 1000).toISOString()})`);

  // --- 5. Build x402 payment token (base64 JSON) ---
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

  // --- 6. Retry with payment ---
  console.log();
  console.log(`${c.dim}Step 3: POST with X-Payment-Token → scan...${c.reset}`);

  const paidRes = await fetch(scanUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Token': paymentToken,
    },
    body: JSON.stringify({ address: account.address, endpoint: scanEndpoint }),
  });

  if (!paidRes.ok) {
    const body = await paidRes.text();
    const reason = paidRes.headers.get('X-402-Reason');
    die(`Paid request failed (${paidRes.status}): ${reason ?? body}`);
  }

  // --- 7. Display results ---
  const txHash = paidRes.headers.get('X-402-TxHash');
  const payer = paidRes.headers.get('X-402-Payer');
  const paid = paidRes.headers.get('X-402-Paid');

  console.log();
  console.log(`${c.green}${c.bold}Payment accepted!${c.reset}`);
  if (payer) console.log(`  Payer:  ${payer}`);
  if (paid) console.log(`  Paid:   ${paid} ($${parseInt(paid) / 1e6} USDC)`);
  if (txHash) {
    console.log(`  TxHash: ${txHash}`);
    console.log(`  ${c.dim}https://snowtrace.io/tx/${txHash}${c.reset}`);
  }

  console.log();
  console.log(`${c.cyan}${c.bold}TRACER Results:${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━${c.reset}`);

  const body = await paidRes.json();
  console.log(JSON.stringify(body, null, 2));
  console.log();
}

main().catch((err) => {
  console.error(`${c.red}${c.bold}Fatal:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
