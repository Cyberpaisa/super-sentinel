import { successResponse } from '@/lib/utils/api-helpers';
import { getHeartbeat } from '@/heartbeat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/heartbeat
 *
 * Public endpoint. Returns the agent's current heartbeat:
 * survival tier, balance, earnings, uptime, scan count.
 * No authentication required — this is how the world knows we're alive.
 */
export async function GET() {
  const heartbeat = await getHeartbeat();
  return successResponse(heartbeat);
}
