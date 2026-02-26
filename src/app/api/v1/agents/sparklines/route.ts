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

    // Fetch all trust_score snapshots for these agents (ordered ASC = left→right on chart)
    const rows = await prisma.trustScore.findMany({
      where:   { agentId: { in: addresses } },
      select:  { agentId: true, overallScore: true, calculatedAt: true },
      orderBy: { calculatedAt: 'asc' },
    });

    // Group by address, keep only last 10 snapshots, convert 0–1 float → 0–100 integer
    const data: Record<string, { v: number }[]> = {};
    for (const row of rows) {
      if (!data[row.agentId]) data[row.agentId] = [];
      data[row.agentId].push({ v: Math.round(row.overallScore * 100) });
    }
    for (const addr of Object.keys(data)) {
      if (data[addr].length > 10) data[addr] = data[addr].slice(-10);
    }

    return successResponse(data);
  } catch (error) {
    return handleError(error);
  }
}
