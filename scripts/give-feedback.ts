#!/usr/bin/env npx tsx
/**
 * Give Feedback On-Chain — CLI Script
 *
 * Calls ReputationRegistry.giveFeedback() on Avalanche C-Chain to record
 * inter-agent feedback after x402 service interactions.
 *
 * Usage:
 *   npx tsx scripts/give-feedback.ts \
 *     --agent 1686 \
 *     --score 90 \
 *     --tag1 "x402-scan" \
 *     --tag2 "tracer" \
 *     --endpoint "/api/v1/sentinel/scan" \
 *     --comment "Fast TRACER scan, accurate results"
 *
 * Environment (.env.local):
 *   PAYER_PRIVATE_KEY — hex private key of the reviewer wallet
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { avalanche } from 'viem/chains';
import { REPUTATION_REGISTRY_ABI } from '../src/lib/blockchain/abis/reputation-registry';
import { ERC8004_CONTRACTS } from '../src/config/contracts';

// Load .env.local from project root
config({ path: resolve(import.meta.dirname ?? __dirname, '..', '.env.local') });

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

function die(msg: string): never {
  console.error(`${c.red}Error:${c.reset} ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    agent: { type: 'string', short: 'a' },
    score: { type: 'string', short: 's' },
    tag1: { type: 'string' },
    tag2: { type: 'string' },
    endpoint: { type: 'string', short: 'e' },
    comment: { type: 'string', short: 'c' },
    read: { type: 'boolean', short: 'r' },
  },
  strict: true,
});

const agentId = values.agent ? BigInt(values.agent) : null;
const score = values.score ? parseInt(values.score, 10) : null;
const tag1 = values.tag1 || '';
const tag2 = values.tag2 || '';
const endpoint = values.endpoint || '';
const comment = values.comment || '';
const readMode = values.read || false;

if (!agentId) die('--agent <id> is required');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log();
  console.log(`${c.cyan}${c.bold}ReputationRegistry — On-Chain Feedback${c.reset}`);
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log();

  const privateKey = process.env.PAYER_PRIVATE_KEY;
  if (!privateKey) die('PAYER_PRIVATE_KEY not set in .env.local');

  const account = privateKeyToAccount(privateKey as Hex);
  const registryAddress = ERC8004_CONTRACTS.reputation.mainnet;

  console.log(`${c.bold}Reviewer wallet:${c.reset} ${account.address}`);
  console.log(`${c.bold}Registry:${c.reset}        ${registryAddress}`);
  console.log(`${c.bold}Agent ID:${c.reset}        ${agentId}`);
  console.log();

  const publicClient = createPublicClient({
    chain: avalanche,
    transport: http(),
  });

  // --- Read mode: show existing feedback ---
  if (readMode) {
    console.log(`${c.dim}Reading feedback for agent #${agentId}...${c.reset}`);

    try {
      const clients = await publicClient.readContract({
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getClients',
        args: [agentId!],
      });

      console.log(`${c.bold}Reviewers (${clients.length}):${c.reset}`);
      for (const addr of clients) {
        console.log(`  ${addr}`);

        // Read first feedback entry from each reviewer
        const [fbScore, flags, fbTag1, fbTag2, exists] = await publicClient.readContract({
          address: registryAddress,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'readFeedback',
          args: [agentId!, addr, 0n],
        });

        if (exists) {
          console.log(`    Score: ${fbScore}, Flags: ${flags}, Tags: [${fbTag1}, ${fbTag2}]`);
        }
      }
    } catch (err) {
      console.log(`${c.yellow}Could not read feedback: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    }

    // Try getSummary
    try {
      const summary = await publicClient.readContract({
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'getSummary',
        args: [agentId!],
      });

      console.log();
      console.log(`${c.bold}Summary:${c.reset}`);
      console.log(`  Total reviews:    ${summary[0]}`);
      console.log(`  Average score:    ${summary[1]}`);
      console.log(`  Unique reviewers: ${summary[2]}`);
    } catch (err) {
      console.log(`${c.yellow}Could not read summary: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
    }

    console.log();
    return;
  }

  // --- Write mode: give feedback ---
  if (score === null) die('--score <0-100> is required for giving feedback');
  if (score < 0 || score > 100) die('Score must be between 0 and 100');

  console.log(`${c.bold}Score:${c.reset}    ${score}`);
  console.log(`${c.bold}Tags:${c.reset}     [${tag1}, ${tag2}]`);
  console.log(`${c.bold}Endpoint:${c.reset} ${endpoint || '(none)'}`);
  console.log(`${c.bold}Comment:${c.reset}  ${comment || '(none)'}`);
  console.log();

  // Generate random salt
  const salt = keccak256(
    encodePacked(['bytes'], [`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}` as Hex]),
  );

  const walletClient = createWalletClient({
    account,
    chain: avalanche,
    transport: http(),
  });

  console.log(`${c.dim}Sending giveFeedback transaction...${c.reset}`);

  const txHash = await walletClient.writeContract({
    address: registryAddress,
    abi: REPUTATION_REGISTRY_ABI,
    functionName: 'giveFeedback',
    args: [agentId!, BigInt(score), 0, tag1, tag2, endpoint, comment, salt],
  });

  console.log();
  console.log(`${c.green}${c.bold}Transaction sent!${c.reset}`);
  console.log(`${c.bold}TxHash:${c.reset} ${txHash}`);
  console.log(`${c.dim}https://snowtrace.io/tx/${txHash}${c.reset}`);
  console.log();

  // Wait for confirmation
  console.log(`${c.dim}Waiting for confirmation...${c.reset}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === 'success') {
    console.log(`${c.green}${c.bold}Confirmed in block ${receipt.blockNumber}${c.reset}`);
  } else {
    console.log(`${c.red}${c.bold}Transaction reverted!${c.reset}`);
  }

  console.log();

  // Verify by reading back
  console.log(`${c.dim}Verifying feedback on-chain...${c.reset}`);
  try {
    const [fbScore, flags, fbTag1, fbTag2, exists] = await publicClient.readContract({
      address: registryAddress,
      abi: REPUTATION_REGISTRY_ABI,
      functionName: 'readFeedback',
      args: [agentId!, account.address, 0n],
    });

    if (exists) {
      console.log(`${c.green}Verified: score=${fbScore}, flags=${flags}, tags=[${fbTag1}, ${fbTag2}]${c.reset}`);
    } else {
      console.log(`${c.yellow}Feedback not found at index 0 — may need different index${c.reset}`);
    }
  } catch (err) {
    console.log(`${c.yellow}Could not verify: ${err instanceof Error ? err.message : String(err)}${c.reset}`);
  }

  console.log();
}

main().catch((err) => {
  console.error(`${c.red}${c.bold}Fatal:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
