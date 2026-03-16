import { Prisma, type Agent, type AgentType, type AgentStatus, type ProxyType } from '@prisma/client';
import { prisma } from '@/lib/database/prisma';
import { NotFoundError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { type TRACERScore } from '@/sentinels/scoring/types';
import { type SentinelResult } from '@/sentinels/types';

const logger = createLogger('agent-service');

/**
 * Input for creating a new agent
 */
export interface CreateAgentInput {
  address: string;
  name: string;
  type: AgentType;
  description?: string;
  owner_address: string;
  billing_address?: string;
  registry_address?: string;
  token_id?: number;
  token_uri?: string;
  metadata?: Record<string, unknown>;
  status?: AgentStatus;
}

/**
 * Input for updating an agent
 */
export interface UpdateAgentInput {
  name?: string;
  description?: string;
  status?: AgentStatus;
  trust_score?: number;
  is_proxy?: boolean;
  proxy_type?: ProxyType;
  implementation_address?: string;
}

/**
 * Filters for listing agents
 */
export interface AgentFilters {
  type?: AgentType;
  status?: AgentStatus;
  minTrustScore?: number;
  maxTrustScore?: number;
  service?: string;
  search?: string;
}

/**
 * Pagination parameters
 */
export interface PaginationInput {
  page?: number;
  limit?: number;
}

/**
 * Paginated agent list response
 */
export interface PaginatedAgents {
  agents: Agent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Create a new agent in the database
 *
 * @param data - Agent creation data
 * @returns Created agent
 */
export async function createAgent(data: CreateAgentInput): Promise<Agent> {
  try {
    logger.info({ address: data.address, name: data.name }, 'Creating new agent');

    const agent = await prisma.agent.create({
      data: {
        address: data.address.toLowerCase(),
        name: data.name,
        type: data.type,
        description: data.description,
        owner_address: data.owner_address.toLowerCase(),
        billing_address: data.billing_address?.toLowerCase(),
        registry_address: data.registry_address?.toLowerCase(),
        token_id: data.token_id,
        token_uri: data.token_uri,
        metadata: data.metadata as Prisma.InputJsonValue,
        status: data.status || 'PENDING',
      },
    });

    logger.info({ address: agent.address }, 'Agent created successfully');

    return agent;
  } catch (error) {
    logger.error({ address: data.address, error }, 'Failed to create agent');
    throw error;
  }
}

/**
 * Get a single agent by address
 *
 * @param address - Agent contract address
 * @returns Agent or null if not found
 */
export async function getAgent(address: string): Promise<Agent | null> {
  try {
    logger.debug({ address }, 'Fetching agent');

    const agent = await prisma.agent.findUnique({
      where: { address: address.toLowerCase() },
      include: {
        tracerScores: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        trustScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return agent;
  } catch (error) {
    logger.error({ address, error }, 'Failed to fetch agent');
    throw error;
  }
}

/**
 * Get agents with filters and pagination
 *
 * @param filters - Filter criteria
 * @param pagination - Pagination options
 * @returns Paginated list of agents
 */
export async function getAgents(
  filters: AgentFilters = {},
  pagination: PaginationInput = {}
): Promise<PaginatedAgents> {
  try {
    const { type, status, minTrustScore, maxTrustScore, service, search } = filters;
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    logger.debug({ filters, page, limit }, 'Fetching agents list');

    // Build where clause — only return agents that have metadata populated
    const where: Prisma.AgentWhereInput = {
      metadata: { not: Prisma.JsonNull },
    };

    if (type) {
      where.type = type;
    }

    if (status) {
      where.status = status;
    }

    if (minTrustScore !== undefined || maxTrustScore !== undefined) {
      where.trust_score = {
        ...(minTrustScore !== undefined && { gte: minTrustScore }),
        ...(maxTrustScore !== undefined && { lte: maxTrustScore }),
      };
    }

    if (service) {
      where.metadata = {
        path: ['services'],
        array_contains: [{ name: service }],
      };
    }

    if (search) {
      where.OR = [
        {
          name: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          address: {
            contains: search.toLowerCase(),
            mode: 'insensitive',
          },
        },
      ];
    }

    // Execute queries in parallel
    const [agents, total] = await Promise.all([
      prisma.agent.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          created_at: 'desc',
        },
        include: {
          trustScores: {
            orderBy: { calculatedAt: 'desc' },
            take: 1,
          },
          tracerScores: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.agent.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info(
      { total, page, limit, filters },
      'Successfully fetched agents list'
    );

    return {
      agents,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    logger.error({ filters, pagination, error }, 'Failed to fetch agents');
    throw error;
  }
}

/**
 * Update an agent
 *
 * @param address - Agent contract address
 * @param data - Fields to update
 * @returns Updated agent
 * @throws {NotFoundError} If agent doesn't exist
 */
export async function updateAgent(
  address: string,
  data: UpdateAgentInput
): Promise<Agent> {
  try {
    logger.info({ address, data }, 'Updating agent');

    // Check if agent exists
    const existing = await getAgent(address);
    if (!existing) {
      throw new NotFoundError(`Agent not found: ${address}`);
    }

    const agent = await prisma.agent.update({
      where: { address: address.toLowerCase() },
      data,
    });

    logger.info({ address }, 'Agent updated successfully');

    return agent;
  } catch (error) {
    logger.error({ address, data, error }, 'Failed to update agent');
    throw error;
  }
}

/**
 * Check if an agent exists by address
 *
 * @param address - Agent contract address
 * @returns true if agent exists, false otherwise
 */
export async function agentExists(address: string): Promise<boolean> {
  try {
    const count = await prisma.agent.count({
      where: { address: address.toLowerCase() },
    });

    return count > 0;
  } catch (error) {
    logger.error({ address, error }, 'Failed to check agent existence');
    throw error;
  }
}

/**
 * Record a TRACER score snapshot and update the agent's overall trust score.
 *
 * @param address - Agent contract address
 * @param score - Calculated TRACER score
 * @param results - Raw sentinel results for auditability
 */
export async function recordTracerScore(
  address: string,
  score: TRACERScore,
  results: SentinelResult[]
): Promise<void> {
  try {
    const normalizedAddress = address.toLowerCase();

    logger.info({ address: normalizedAddress, score: score.total }, 'Recording TRACER score');

    await prisma.$transaction([
      // 1. Save the historical record
      prisma.tRACERScoreRecord.create({
        data: {
          agentAddress: normalizedAddress,
          totalScore: score.total,
          tier: score.tier,
          trust: score.dimensions.trust.score,
          reliability: score.dimensions.reliability.score,
          autonomy: score.dimensions.autonomy.score,
          capability: score.dimensions.capability.score,
          economics: score.dimensions.economics.score,
          reputation: score.dimensions.reputation.score,
          sentinelResults: results as unknown as Prisma.InputJsonValue,
        },
      }),

      // 2. Update the agent's main trust_score for quick access and ranking
      prisma.agent.update({
        where: { address: normalizedAddress },
        data: {
          trust_score: score.total,
          // If the score is high enough, we can also auto-verify or update status
          ...(score.tier === 'VERIFIED' && { status: 'VERIFIED' as AgentStatus }),
        },
      }),
    ]);

    logger.debug({ address: normalizedAddress }, 'TRACER score recorded successfully');
  } catch (error) {
    logger.error({ address, error }, 'Failed to record TRACER score');
    throw error;
  }
}
