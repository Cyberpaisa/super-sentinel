import { prisma } from '@/lib/database/prisma';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { type ChallengeType, type HeartbeatResult } from '@prisma/client';
import { resolveAgentEndpoint } from './sentinels/resolve-endpoint';

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

/**
 * Execute a heartbeat ping to an agent via HTTP fetch.
 * Uses AbortController with a 5000ms timeout for a real health check.
 *
 * @param agentAddress - Agent address (used to resolve endpoint)
 * @returns Heartbeat ping result
 */
async function executeHeartbeatPing(agentAddress: string): Promise<HeartbeatPingResult> {
  const endpoint = await resolveAgentEndpoint(agentAddress);

  if (!endpoint) {
    return {
      success: false,
      responseTimeMs: null,
      result: 'FAIL',
      errorMessage: 'No HTTP endpoint found in agent metadata',
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const responseTimeMs = Date.now() - startTime;

    if (response.ok) {
      return { success: true, responseTimeMs, result: 'PASS' };
    }

    return {
      success: false,
      responseTimeMs,
      result: 'FAIL',
      errorMessage: `HTTP ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;

    if (error instanceof DOMException && error.name === 'AbortError') {
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

    // Execute the heartbeat ping via HTTP
    const pingResult = await executeHeartbeatPing(normalizedAddress);

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
