/**
 * Auto-Feedback Engine — Singleton
 *
 * After each successful interaction with a registered agent,
 * automatically calls giveFeedback() on the ReputationRegistry.
 * Fire-and-forget: never blocks the response.
 *
 * Pattern follows src/survival/earnings-tracker.ts.
 */

import {
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { publicClient, getActiveChain, isMainnet } from '@/lib/blockchain/client';
import { REPUTATION_REGISTRY_ABI } from '@/lib/blockchain/abis/reputation-registry';
import { IDENTITY_REGISTRY_ABI } from '@/lib/blockchain/abis/identity-registry';
import { ERC8004_CONTRACTS } from '@/config/contracts';
import { createLogger } from '@/lib/utils/logger';

import type { FeedbackParams, FeedbackResult, RateLimitEntry } from './types';

const log = createLogger('auto-feedback');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_BALANCE_WEI = 10_000_000_000_000_000n; // 0.01 AVAX

const COOLDOWN_MS = () =>
  (parseInt(process.env.AUTO_FEEDBACK_COOLDOWN_HOURS || '6', 10)) * 60 * 60 * 1000;

const MAX_DAILY = () =>
  parseInt(process.env.AUTO_FEEDBACK_MAX_DAILY || '10', 10);

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export class AutoFeedbackEngine {
  private static instance: AutoFeedbackEngine | null = null;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private walletClient: ReturnType<typeof createWalletClient> | null = null;
  private account: PrivateKeyAccount | null = null;

  private constructor() {
    // private — use getInstance()
  }

  static getInstance(): AutoFeedbackEngine {
    if (!AutoFeedbackEngine.instance) {
      AutoFeedbackEngine.instance = new AutoFeedbackEngine();
    }
    return AutoFeedbackEngine.instance;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async postServiceFeedback(params: FeedbackParams): Promise<FeedbackResult | null> {
    try {
      // 1. Check enabled
      if (!this.isEnabled()) {
        return { submitted: false, txHash: '', score: 0, skippedReason: 'disabled' };
      }

      // 2. Rate limit check
      const rlKey = `${params.callerWallet}:${params.endpoint}`;
      if (this.isRateLimited(rlKey)) {
        log.debug({ key: rlKey }, 'Rate limited — skipping feedback');
        return { submitted: false, txHash: '', score: 0, skippedReason: 'rate-limited' };
      }

      // 3. Balance check
      if (!(await this.hasMinBalance())) {
        log.warn('Insufficient AVAX balance for feedback tx');
        return { submitted: false, txHash: '', score: 0, skippedReason: 'low-balance' };
      }

      // 4. Resolve agent ID
      const agentId = await this.resolveAgentId(params.callerWallet);
      if (!agentId) {
        log.debug({ wallet: params.callerWallet }, 'Wallet not registered — skipping');
        return { submitted: false, txHash: '', score: 0, skippedReason: 'not-registered' };
      }

      // 5. Calculate score
      const score = this.calculateScore(params);

      // 6. Submit on-chain
      this.ensureWallet();
      const network = isMainnet() ? 'mainnet' : 'testnet';
      const registryAddress = ERC8004_CONTRACTS.reputation[network];

      const salt = keccak256(
        encodePacked(
          ['bytes'],
          [`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex')}` as Hex],
        ),
      );

      const serviceType = params.endpoint.includes('scan') ? 'full-scan' : 'quick-check';

      const txHash = await this.walletClient!.writeContract({
        chain: getActiveChain(),
        account: this.account!,
        address: registryAddress,
        abi: REPUTATION_REGISTRY_ABI,
        functionName: 'giveFeedback',
        args: [
          agentId,
          BigInt(score),
          0,
          'auto-feedback',
          serviceType,
          params.endpoint,
          '',
          salt,
        ],
      });

      // 7. Record rate limit
      this.recordRateLimit(rlKey);

      log.info(
        { txHash, agentId: agentId.toString(), score, wallet: params.callerWallet },
        'Auto-feedback submitted on-chain',
      );

      return { submitted: true, txHash, score };
    } catch (err) {
      log.error({ err, wallet: params.callerWallet }, 'Auto-feedback failed (non-blocking)');
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private isEnabled(): boolean {
    return process.env.AUTO_FEEDBACK_ENABLED === 'true';
  }

  private isRateLimited(key: string): boolean {
    const entry = this.rateLimits.get(key);
    if (!entry) return false;

    const now = Date.now();
    const cooldownMs = COOLDOWN_MS();

    // Check cooldown: last submission within cooldown window
    const lastTimestamp = entry.timestamps[entry.timestamps.length - 1];
    if (lastTimestamp && now - lastTimestamp < cooldownMs) {
      return true;
    }

    // Check daily limit: count submissions in last 24h
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const dailyCount = entry.timestamps.filter((t) => t > oneDayAgo).length;
    if (dailyCount >= MAX_DAILY()) {
      return true;
    }

    return false;
  }

  private recordRateLimit(key: string): void {
    const entry = this.rateLimits.get(key) || { timestamps: [] };
    entry.timestamps.push(Date.now());

    // Prune entries older than 24h
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    entry.timestamps = entry.timestamps.filter((t) => t > oneDayAgo);

    this.rateLimits.set(key, entry);
  }

  private async hasMinBalance(): Promise<boolean> {
    try {
      this.ensureWallet();
      const balance = await publicClient.getBalance({ address: this.account!.address });
      return balance >= MIN_BALANCE_WEI;
    } catch {
      return false;
    }
  }

  private async resolveAgentId(wallet: string): Promise<bigint | null> {
    try {
      const network = isMainnet() ? 'mainnet' : 'testnet';
      const identityAddress = ERC8004_CONTRACTS.identity[network];

      const agentId = await publicClient.readContract({
        address: identityAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getAgentWallet',
        args: [wallet as `0x${string}`],
      });

      if (agentId === 0n) return null;
      return agentId;
    } catch {
      return null;
    }
  }

  calculateScore(params: FeedbackParams): number {
    let score = 70;

    if (params.latencyMs < 500) score += 10;
    if (params.wasX402) score += 10;
    if (params.responseStatus === 200) score += 10;

    return Math.min(score, 100);
  }

  private ensureWallet(): void {
    if (this.account && this.walletClient) return;

    const privateKey = process.env.PAYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PAYER_PRIVATE_KEY not configured');
    }

    this.account = privateKeyToAccount(privateKey as Hex);
    this.walletClient = createWalletClient({
      account: this.account,
      chain: getActiveChain(),
      transport: http(),
    });
  }

  // -----------------------------------------------------------------------
  // Testing helper
  // -----------------------------------------------------------------------

  /** @internal — Reset state (useful for tests). */
  _reset(): void {
    this.rateLimits = new Map();
    this.walletClient = null;
    this.account = null;
  }
}
