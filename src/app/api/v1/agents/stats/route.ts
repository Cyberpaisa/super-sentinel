import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-agents-stats');

/**
 * GET /api/v1/agents/stats
 *
 * Get aggregate statistics about agents (only agents with metadata)
 *
 * Returns:
 * - total: Total number of agents
 * - verified: Number of verified agents
 * - active24h: Number of agents updated in last 24h
 * - byStatus: Breakdown by status
 * - byType: Breakdown by type
 */
export async function GET(_request: NextRequest) {
  try {
    logger.debug('Fetching agent statistics');

    // Calculate 24h ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Base filter: only agents that have metadata AND scannable signals
    const scannableFilter: Prisma.AgentWhereInput = {
      AND: [
        { metadata: { not: Prisma.JsonNull } },
        {
          OR: [
            { metadata: { path: ['services', '0'], not: Prisma.JsonNull } },
            { metadata: { path: ['url'], not: Prisma.JsonNull } },
            { metadata: { path: ['endpoint'], not: Prisma.JsonNull } },
            { metadata: { path: ['external_url'], not: Prisma.JsonNull } },
            { token_uri: { startsWith: 'http' } }
          ]
        }
      ]
    };

    // Run all queries in parallel
    const [total, verified, active24h, byStatus, byType] = await Promise.all([
      // Total agents with metadata
      prisma.agent.count({ where: scannableFilter }),

      // Verified agents with metadata
      prisma.agent.count({
        where: { ...scannableFilter, status: 'VERIFIED' },
      }),

      // Active in last 24h (updated_at) with metadata
      prisma.agent.count({
        where: {
          ...scannableFilter,
          updated_at: {
            gte: twentyFourHoursAgo,
          },
        },
      }),

      // Breakdown by status (only agents with metadata)
      prisma.agent.groupBy({
        by: ['status'],
        where: scannableFilter,
        _count: true,
      }),

      // Breakdown by type (only agents with metadata)
      prisma.agent.groupBy({
        by: ['type'],
        where: scannableFilter,
        _count: true,
      }),
    ]);

    // Format breakdowns
    const statusBreakdown = byStatus.reduce((acc, item) => {
      acc[item.status] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const typeBreakdown = byType.reduce((acc, item) => {
      acc[item.type] = item._count;
      return acc;
    }, {} as Record<string, number>);

    const stats = {
      total,
      verified,
      active24h,
      byStatus: statusBreakdown,
      byType: typeBreakdown,
    };

    logger.info({ stats }, 'Agent statistics fetched successfully');

    return successResponse(stats, 200);
  } catch (error) {
    logger.error({ error }, 'Error fetching agent statistics');
    return handleError(error);
  }
}
