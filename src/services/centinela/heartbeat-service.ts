import { type Address } from 'viem';
import { prisma } from '@/lib/database/prisma';
import { publicClient } from '@/lib/blockchain/client';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { type ChallengeType, type HeartbeatResult } from '@prisma/client';

const logger = createLogger('heartbeat-service');

/**
 * Heartbeat timeout in milliseconds
 */
const HEARTBEAT_TIMEOUT_MS = 5000;

/**
 * Time periods for uptime calculation
 */
export type UptimePeriod = '24h' | '7d' | '30d';

/**
 * Period durations in milliseconds
 */
const PERIOD_DURATIONS: Record<UptimePeriod, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Result of a heartbeat ping
 */
export interface HeartbeatPingResult {
  success: boolean;
  responseTimeMs: number | null;
  result: HeartbeatResult;
  errorMessage?: string;
}

/**
 * Uptime calculation result
 */
export interface UptimeResult {
  uptimePercentage: number;
  totalPings: number;
  successfulPings: number;
  failedPings: number;
  timeoutPings: number;
  averageResponseTimeMs: number | null;
  period: UptimePeriod;
}

/** ERC-165 supportsInterface selector */
const SUPPORTS_INTERFACE_SELECTOR = '0x01ffc9a7';

/** ERC-8004 interface ID */
const ERC8004_INTERFACE_ID = '0x80040000';

/** Common heartbeat/ping function selectors */
const HEARTBEAT_SELECTORS = [
  '0x3defb962', // heartbeat()
  '0x5c36b186', // ping()
  '0x54fd4d50', // getVersion()
] as const;

/**
 * Execute a heartbeat ping to an agent with multi-level verification:
 * 1. Verify contract code exists
 * 2. Call supportsInterface(ERC-8004) if available
 * 3. Try calling heartbeat/ping/getVersion functions
 * All within the HEARTBEAT_TIMEOUT_MS window
 *
 * @param address - Agent contract address
 * @returns Heartbeat ping result
 */
async function executeHeartbeatPing(address: Address): Promise<HeartbeatPingResult> {
  const startTime = Date.now();

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Heartbeat timeout')), HEARTBEAT_TIMEOUT_MS);
    });

    const result = await Promise.race([
      executeHeartbeatChecks(address, startTime),
      timeoutPromise,
    ]);

    return result;
  } catch (error) {
    const responseTimeMs = Date.now() - startTime;

    if (error instanceof Error && error.message === 'Heartbeat timeout') {
      return {
        success: false,
        responseTimeMs: null,
        result: 'TIMEOUT',
        errorMessage: `Heartbeat timed out after ${HEARTBEAT_TIMEOUT_MS}ms`,
      };
    }

    return {
      success: false,
      responseTimeMs,
      result: 'FAIL',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run multi-level heartbeat checks
 */
async function executeHeartbeatChecks(
  address: Address,
  startTime: number
): Promise<HeartbeatPingResult> {
  // Level 1: Verify contract code exists
  const code = await publicClient.getCode({ address });
  if (!code || code === '0x') {
    return {
      success: false,
      responseTimeMs: Date.now() - startTime,
      result: 'FAIL',
      errorMessage: 'Contract no longer exists at address',
    };
  }

  // Level 2: Try supportsInterface(ERC-8004)
  let supportsErc8004 = false;
  try {
    const result = await publicClient.call({
      to: address,
      data: encodeFunctionCall(SUPPORTS_INTERFACE_SELECTOR, ERC8004_INTERFACE_ID),
    });
    // If call succeeds and returns true (non-zero last byte)
    if (result.data && result.data.length >= 66) {
      supportsErc8004 = result.data.endsWith('1'.padStart(64, '0'));
    }
  } catch {
    // Contract may not implement ERC-165, that's OK
    logger.debug({ address }, 'supportsInterface call failed (may not implement ERC-165)');
  }

  // Level 3: Try calling heartbeat/ping/getVersion functions
  let respondedToCall = false;
  for (const selector of HEARTBEAT_SELECTORS) {
    try {
      const result = await publicClient.call({
        to: address,
        data: selector as `0x${string}`,
      });
      if (result.data && result.data !== '0x') {
        respondedToCall = true;
        break;
      }
    } catch {
      // Function may not exist, try next
    }
  }

  const responseTimeMs = Date.now() - startTime;

  // A contract passes if:
  // - It has code (always required) AND
  // - It either supports ERC-8004 OR responds to a known function call
  // - If neither, it still passes but with a note (backward compatibility)
  const hasAdvancedVerification = supportsErc8004 || respondedToCall;

  return {
    success: true,
    responseTimeMs,
    result: 'PASS',
    errorMessage: hasAdvancedVerification
      ? undefined
      : 'Contract exists but does not implement ERC-8004 or respond to known functions',
  };
}

/**
 * Encode a supportsInterface call
 */
function encodeFunctionCall(selector: string, interfaceId: string): `0x${string}` {
  // supportsInterface(bytes4) — pad interfaceId to 32 bytes
  const paddedId = interfaceId.replace('0x', '').padEnd(64, '0');
  return `${selector}${paddedId}` as `0x${string}`;
}

/**
 * Send a heartbeat to an agent and log the result
 *
 * @param agentAddress - Agent contract address
 * @param challengeType - Type of challenge (PING or CHALLENGE_RESPONSE)
 * @returns Heartbeat ping result
 * @throws {ContractNotFoundError} If agent doesn't exist in database
 */
export async function sendHeartbeat(
  agentAddress: string,
  challengeType: ChallengeType = 'PING'
): Promise<HeartbeatPingResult> {
  const normalizedAddress = agentAddress.toLowerCase();

  try {
    logger.info({ agentAddress: normalizedAddress, challengeType }, 'Sending heartbeat');

    // Verify agent exists in database
    const agent = await prisma.agent.findUnique({
      where: { address: normalizedAddress },
    });

    if (!agent) {
      logger.warn({ agentAddress: normalizedAddress }, 'Agent not found in database, skipping heartbeat');
      throw new ContractNotFoundError(agentAddress);
    }

    // Execute the heartbeat ping
    const pingResult = await executeHeartbeatPing(normalizedAddress as Address);

    // Log the result to database
    await prisma.heartbeatLog.create({
      data: {
        agentAddress: normalizedAddress,
        challengeType,
        responseTimeMs: pingResult.responseTimeMs,
        result: pingResult.result,
        errorMessage: pingResult.errorMessage,
      },
    });

    logger.info({
      agentAddress: normalizedAddress,
      result: pingResult.result,
      responseTimeMs: pingResult.responseTimeMs,
    }, 'Heartbeat completed');

    return pingResult;
  } catch (error) {
    if (error instanceof ContractNotFoundError) {
      throw error;
    }

    logger.error({ agentAddress: normalizedAddress, error }, 'Heartbeat failed');
    throw new RPCError(`Heartbeat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate uptime percentage for an agent over a specified period
 *
 * @param agentAddress - Agent contract address
 * @param period - Time period for calculation (24h, 7d, 30d)
 * @returns Uptime calculation result
 */
export async function calculateUptime(
  agentAddress: string,
  period: UptimePeriod = '24h'
): Promise<UptimeResult> {
  const normalizedAddress = agentAddress.toLowerCase();

  try {
    logger.debug({ agentAddress: normalizedAddress, period }, 'Calculating uptime');

    // Calculate time range
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - PERIOD_DURATIONS[period]);

    // Query heartbeat logs for the period
    const logs = await prisma.heartbeatLog.findMany({
      where: {
        agentAddress: normalizedAddress,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        result: true,
        responseTimeMs: true,
      },
    });

    // Calculate statistics
    const totalPings = logs.length;
    const successfulPings = logs.filter(log => log.result === 'PASS').length;
    const failedPings = logs.filter(log => log.result === 'FAIL').length;
    const timeoutPings = logs.filter(log => log.result === 'TIMEOUT').length;

    // Calculate uptime percentage
    const uptimePercentage = totalPings > 0
      ? (successfulPings / totalPings) * 100
      : 0;

    // Calculate average response time (excluding timeouts)
    const validResponseTimes = logs
      .filter(log => log.responseTimeMs !== null)
      .map(log => log.responseTimeMs as number);

    const averageResponseTimeMs = validResponseTimes.length > 0
      ? validResponseTimes.reduce((a, b) => a + b, 0) / validResponseTimes.length
      : null;

    const result: UptimeResult = {
      uptimePercentage: Math.round(uptimePercentage * 100) / 100, // Round to 2 decimal places
      totalPings,
      successfulPings,
      failedPings,
      timeoutPings,
      averageResponseTimeMs: averageResponseTimeMs
        ? Math.round(averageResponseTimeMs)
        : null,
      period,
    };

    logger.info({
      agentAddress: normalizedAddress,
      period,
      uptimePercentage: result.uptimePercentage,
      totalPings,
    }, 'Uptime calculation completed');

    return result;
  } catch (error) {
    logger.error({ agentAddress: normalizedAddress, period, error }, 'Uptime calculation failed');
    throw error;
  }
}

/**
 * Get recent heartbeat logs for an agent
 *
 * @param agentAddress - Agent contract address
 * @param limit - Maximum number of logs to return
 * @param period - Optional time period filter
 * @returns Array of heartbeat logs
 */
export async function getHeartbeatLogs(
  agentAddress: string,
  limit: number = 100,
  period?: UptimePeriod
) {
  const normalizedAddress = agentAddress.toLowerCase();

  const whereClause: {
    agentAddress: string;
    timestamp?: { gte: Date };
  } = {
    agentAddress: normalizedAddress,
  };

  if (period) {
    const startDate = new Date(Date.now() - PERIOD_DURATIONS[period]);
    whereClause.timestamp = { gte: startDate };
  }

  return prisma.heartbeatLog.findMany({
    where: whereClause,
    orderBy: { timestamp: 'desc' },
    take: limit,
    select: {
      id: true,
      timestamp: true,
      challengeType: true,
      responseTimeMs: true,
      result: true,
      errorMessage: true,
    },
  });
}

/**
 * Send heartbeats to all verified agents
 * Used by the Centinela cron job
 *
 * @returns Summary of heartbeat results
 */
export async function sendHeartbeatsToAllAgents(): Promise<{
  total: number;
  successful: number;
  failed: number;
  skipped: number;
}> {
  try {
    logger.info('Starting batch heartbeat for all verified agents');

    // Get all verified agents
    const agents = await prisma.agent.findMany({
      where: { status: 'VERIFIED' },
      select: { address: true },
    });

    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // Send heartbeats sequentially to avoid rate limiting
    for (const agent of agents) {
      try {
        const result = await sendHeartbeat(agent.address);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        if (error instanceof ContractNotFoundError) {
          skipped++;
        } else {
          failed++;
        }
        logger.warn({ agentAddress: agent.address, error }, 'Individual heartbeat failed');
      }
    }

    const summary = {
      total: agents.length,
      successful,
      failed,
      skipped,
    };

    logger.info(summary, 'Batch heartbeat completed');

    return summary;
  } catch (error) {
    logger.error({ error }, 'Batch heartbeat failed');
    throw error;
  }
}
