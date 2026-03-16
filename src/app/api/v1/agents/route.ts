import { NextRequest } from 'next/server';
import { z } from 'zod';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { getAgents, type AgentFilters, type PaginationInput } from '@/services/agent-service';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-agents-list');

/**
 * Query parameters schema for listing agents
 */
const querySchema = z.object({
  type: z.enum(['TRADING', 'LENDING', 'GOVERNANCE', 'ORACLE', 'CUSTOM']).optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'FLAGGED', 'SUSPENDED']).optional(),
  minTrustScore: z.coerce.number().int().min(0).max(100).optional(),
  maxTrustScore: z.coerce.number().int().min(0).max(100).optional(),
  service: z.enum(['MCP', 'A2A', 'web', 'OASF']).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['trust_score', 'created_at', 'name']).optional().default('trust_score'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/**
 * GET /api/v1/agents
 *
 * List all agents with filtering, sorting, and pagination
 *
 * Query Parameters:
 * - type: Filter by AgentType
 * - status: Filter by AgentStatus
 * - minTrustScore: Minimum trust score (0-100)
 * - search: Search by name or address
 * - sortBy: Field to sort (trust_score, created_at, name)
 * - sortOrder: asc or desc
 * - page: Page number (default 1)
 * - limit: Items per page (default 20, max 100)
 *
 * @see docs/api/endpoints.md
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const queryParams: Record<string, string | undefined> = {};
    for (const [key, value] of searchParams.entries()) {
      queryParams[key] = value;
    }

    logger.debug({ queryParams }, 'Received agents list request');

    // Validate query parameters
    const validationResult = querySchema.safeParse(queryParams);
    if (!validationResult.success) {
      const fields: Record<string, string> = {};
      validationResult.error.errors.forEach((err) => {
        const field = err.path.join('.');
        fields[field] = err.message;
      });

      throw new ValidationError('Invalid query parameters', fields);
    }

    const { type, status, minTrustScore, maxTrustScore, service, search, sortBy, sortOrder, page, limit } = validationResult.data;

    // Build filters
    const filters: AgentFilters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;
    if (minTrustScore !== undefined) filters.minTrustScore = minTrustScore;
    if (maxTrustScore !== undefined) filters.maxTrustScore = maxTrustScore;
    if (service) filters.service = service;
    if (search) filters.search = search;
    if (sortBy) filters.sortBy = sortBy;
    if (sortOrder) filters.sortOrder = sortOrder;

    // Build pagination
    const pagination: PaginationInput = { page, limit };

    // Fetch agents
    const result = await getAgents(filters, pagination);

    // Format response
    const formattedAgents = result.agents.map((agent) => {
      // Extract service names from metadata
      const meta = agent.metadata as Record<string, unknown> | null;
      const services = Array.isArray(meta?.services)
        ? (meta.services as Array<{ name: string }>).map((s) => s.name)
        : [];

      // Get latest TRACER score if available
      const agentWithTracer = agent as typeof agent & {
        tracerScores?: Array<{
          totalScore: number;
          tier: string;
          trust: number;
          reliability: number;
          autonomy: number;
          capability: number;
          economics: number;
          reputation: number;
          createdAt: Date;
        }>;
      };
      const latestTracer = agentWithTracer.tracerScores?.[0];

      return {
        address: agent.address,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        status: agent.status,
        trust_score: agent.trust_score,
        tracer_score: latestTracer?.totalScore ?? null,
        tracer_tier: latestTracer?.tier ?? null,
        is_proxy: agent.is_proxy,
        proxy_type: agent.proxy_type,
        owner_address: agent.owner_address,
        services,
        metadata: meta,
        created_at: agent.created_at.toISOString(),
        updated_at: agent.updated_at.toISOString(),
      };
    });

    logger.info({
      total: result.pagination.total,
      page: result.pagination.page,
      filters,
    }, 'Agents list fetched successfully');

    return successResponse(formattedAgents, 200, {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        fields[field] = err.message;
      });

      logger.warn({ fields }, 'Validation error in agents list request');
      return handleError(new ValidationError('Invalid query parameters', fields));
    }

    logger.error({ error }, 'Error fetching agents list');
    return handleError(error);
  }
}
