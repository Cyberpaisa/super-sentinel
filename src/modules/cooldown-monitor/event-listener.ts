/**
 * Cooldown Monitor — Event Listener (CAPA 1)
 *
 * Listens for URIUpdated events on the ERC-8004 Identity Registry.
 * Tracks URI change history per agent to detect instability patterns.
 *
 * Uses viem's publicClient from the existing blockchain module.
 */

import { type PublicClient, type Log, parseAbiItem } from 'viem';
import { publicClient } from '@/lib/blockchain/client';
import { ERC8004_CONTRACTS } from '@/config/contracts';
import { IDENTITY_REGISTRY_ABI } from '@/lib/blockchain/abis/identity-registry';
import { createLogger } from '@/lib/utils/logger';
import {
  type URIChange,
  type AgentURIHistory,
  type CooldownMonitorConfig,
  DEFAULT_CONFIG,
} from './types';

const logger = createLogger('cooldown:event-listener');

export class CooldownEventListener {
  private client: PublicClient;
  private registryAddress: `0x${string}`;
  private config: CooldownMonitorConfig;

  /** URI change history indexed by agentId.toString() */
  private history: Map<string, URIChange[]> = new Map();
  private lastProcessedBlock: bigint = 0n;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Callback invoked when a new URIUpdated event is detected */
  onURIChange: ((change: URIChange) => void) | null = null;

  constructor(
    config: Partial<CooldownMonitorConfig> = {},
    client?: PublicClient,
    registryAddress?: `0x${string}`
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = (client ?? publicClient) as PublicClient;
    this.registryAddress = registryAddress ?? ERC8004_CONTRACTS.identity.mainnet;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Start listening for URIUpdated events.
   * Scans past blocks first, then polls at the configured interval.
   */
  async start(): Promise<void> {
    logger.info(
      { registry: this.registryAddress, pollMs: this.config.pollIntervalMs },
      'Starting URI stability event listener'
    );

    await this.scanPastBlocks();
    this.pollTimer = setInterval(() => this.pollNewBlocks(), this.config.pollIntervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.info('URI stability event listener stopped');
  }

  /** Whether the listener is actively polling. */
  get isRunning(): boolean {
    return this.pollTimer !== null;
  }

  /**
   * Get full URI change history for a specific agent.
   */
  getAgentHistory(agentId: bigint): AgentURIHistory {
    const changes = this.history.get(agentId.toString()) ?? [];
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - this.config.observationWindowSec;

    const recentChanges = changes.filter((c) => c.changedAt >= windowStart);
    const avgIntervalSec = this.calculateAvgInterval(recentChanges);

    return {
      agentId,
      changes: [...changes],
      changeCount: recentChanges.length,
      avgIntervalSec,
    };
  }

  /**
   * Get all agents that have URI changes in the observation window.
   */
  getActiveAgents(): AgentURIHistory[] {
    const result: AgentURIHistory[] = [];
    for (const [idStr] of this.history) {
      const history = this.getAgentHistory(BigInt(idStr));
      if (history.changeCount > 0) {
        result.push(history);
      }
    }
    return result;
  }

  /**
   * Check if an agent's URI has been unstable (too many changes in the window).
   */
  isUnstable(agentId: bigint): boolean {
    const history = this.getAgentHistory(agentId);
    return history.changeCount >= this.config.maxChangesInWindow;
  }

  /**
   * Get the most recent URI change for an agent (or undefined).
   */
  getLatestChange(agentId: bigint): URIChange | undefined {
    const changes = this.history.get(agentId.toString());
    if (!changes || changes.length === 0) return undefined;
    return changes[changes.length - 1];
  }

  /**
   * Get the current URI for an agent from the contract.
   */
  async getCurrentURI(agentId: bigint): Promise<string> {
    try {
      const result = await this.client.readContract({
        address: this.registryAddress,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [agentId],
      });
      return result as string;
    } catch {
      return '';
    }
  }

  /**
   * Manually ingest a URIChange (useful for testing or seeding history).
   */
  ingestChange(change: URIChange): void {
    this.addToHistory(change);
  }

  // -----------------------------------------------------------------------
  // Private: block scanning
  // -----------------------------------------------------------------------

  private async scanPastBlocks(): Promise<void> {
    try {
      const currentBlock = await this.client.getBlockNumber();
      const fromBlock = currentBlock > this.config.lookbackBlocks
        ? currentBlock - this.config.lookbackBlocks
        : 0n;

      logger.info({ fromBlock, toBlock: currentBlock }, 'Scanning past blocks for URIUpdated events');
      await this.fetchAndProcessLogs(fromBlock, currentBlock);
      this.lastProcessedBlock = currentBlock;
    } catch (error) {
      logger.error({ error }, 'Failed to scan past blocks');
    }
  }

  private async pollNewBlocks(): Promise<void> {
    try {
      const currentBlock = await this.client.getBlockNumber();
      if (currentBlock <= this.lastProcessedBlock) return;

      await this.fetchAndProcessLogs(this.lastProcessedBlock + 1n, currentBlock);
      this.lastProcessedBlock = currentBlock;
    } catch (error) {
      logger.error({ error }, 'Failed to poll new blocks');
    }
  }

  private async fetchAndProcessLogs(fromBlock: bigint, toBlock: bigint): Promise<void> {
    const logs = await this.client.getLogs({
      address: this.registryAddress,
      event: parseAbiItem(
        'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)'
      ),
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      await this.handleURIUpdated(log);
    }

    if (logs.length > 0) {
      logger.info({ count: logs.length, fromBlock, toBlock }, 'Processed URIUpdated events');
    }
  }

  // -----------------------------------------------------------------------
  // Private: event handling
  // -----------------------------------------------------------------------

  private async handleURIUpdated(log: Log): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args = (log as Record<string, any>).args as
      | { agentId?: bigint; newURI?: string; updatedBy?: `0x${string}` }
      | undefined;
    if (!args?.agentId || !args?.newURI) return;

    const agentId = args.agentId;
    const newURI = args.newURI;
    const updatedBy = args.updatedBy ?? '0x0000000000000000000000000000000000000000';

    // Determine previous URI from history or contract
    const existingChanges = this.history.get(agentId.toString());
    let previousURI = '';
    if (existingChanges && existingChanges.length > 0) {
      previousURI = existingChanges[existingChanges.length - 1].newURI;
    }

    // Resolve block timestamp
    let changedAt = Math.floor(Date.now() / 1000);
    try {
      if (log.blockNumber) {
        const block = await this.client.getBlock({ blockNumber: log.blockNumber });
        changedAt = Number(block.timestamp);
      }
    } catch {
      // Fallback to current time
    }

    const change: URIChange = {
      agentId,
      newURI,
      previousURI,
      changedAt,
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash ?? '',
      updatedBy,
    };

    this.addToHistory(change);

    logger.info(
      { agentId: agentId.toString(), newURI, updatedBy },
      'URIUpdated event detected'
    );

    // Notify callback
    if (this.onURIChange) {
      this.onURIChange(change);
    }
  }

  private addToHistory(change: URIChange): void {
    const key = change.agentId.toString();
    const existing = this.history.get(key) ?? [];
    existing.push(change);
    this.history.set(key, existing);
  }

  private calculateAvgInterval(changes: URIChange[]): number {
    if (changes.length < 2) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < changes.length; i++) {
      intervals.push(changes[i].changedAt - changes[i - 1].changedAt);
    }
    return Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  }
}
