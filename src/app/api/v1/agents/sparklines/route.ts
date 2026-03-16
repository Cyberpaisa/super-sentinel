import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/agents/sparklines?addresses=addr1,addr2,...
 *
 * Returns the last 10 trust score snapshots per agent for sparkline rendering.
 * Response shape:
 *   { data: { [address]: Array<{ v: number }> } }
 *
 * Where `v` is the trust score 0-100 ordered oldest → newest.
 * Agents with no snapshot history are omitted from the response.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('addresses') ?? '';

    // Parse, deduplicate, normalise, cap at 50 agents per call
    const addresses = [...new Set(
      raw.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean),
    )].slice(0, 50);

    if (addresses.length === 0) {
      return successResponse({});
    }

    // Fetch both legacy trust_score snapshots and new TRACER records
    const [legacyScores, tracerScores] = await Promise.all([
      prisma.trustScore.findMany({
        where: { agentId: { in: addresses } },
        select: { agentId: true, overallScore: true, calculatedAt: true },
        orderBy: { calculatedAt: 'asc' },
      }),
      prisma.tRACERScoreRecord.findMany({
        where: { agentAddress: { in: addresses } },
        select: { agentAddress: true, totalScore: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Merge and group by address
    const data: Record<string, { v: number; t: number }[]> = {};

    // Process legacy scores (converting 0-1 float to 0-100)
    for (const row of legacyScores) {
      if (!data[row.agentId]) data[row.agentId] = [];
      data[row.agentId].push({
        v: Math.round(row.overallScore * 100),
        t: row.calculatedAt.getTime()
      });
    }

    // Process new TRACER scores
    for (const row of tracerScores) {
      if (!data[row.agentAddress]) data[row.agentAddress] = [];
      data[row.agentAddress].push({
        v: row.totalScore,
        t: row.createdAt.getTime()
      });
    }

    // Sort by timestamp and keep last 10, then remove timestamp for final response
    const finalData: Record<string, { v: number }[]> = {};
    for (const addr of Object.keys(data)) {
      const sorted = data[addr]
        .sort((a, b) => a.t - b.t)
        .slice(-10)
        .map(item => ({ v: item.v }));

      if (sorted.length > 0) {
        finalData[addr] = sorted;
      }
    }

    return successResponse(finalData);
  } catch (error) {
    return handleError(error);
  }
}
