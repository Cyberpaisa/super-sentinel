import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { createLogger } from '@/lib/utils/logger';
import { prisma } from '@/lib/database/prisma';

export const dynamic = 'force-dynamic';

const logger = createLogger('api-visitor-track');

/** Salt for IP hashing — use env var or fallback */
const IP_HASH_SALT = process.env.IP_HASH_SALT || 'super-sentinel-visitor-salt';

/**
 * Get client IP from request headers and hash it for privacy (GDPR compliance)
 */
function getHashedClientIP(request: NextRequest): string {
  let rawIp = 'unknown';

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    rawIp = forwardedFor.split(',')[0].trim();
  } else {
    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      rawIp = realIP;
    }
  }

  // Hash the IP with salt for anonymous analytics
  return createHash('sha256').update(`${rawIp}${IP_HASH_SALT}`).digest('hex');
}

/**
 * POST /api/v1/visitors/track
 *
 * Track a visitor by hashed IP address. Creates a new visitor record if it's their first visit,
 * or increments the visit count if they've visited before.
 * IPs are hashed with SHA-256 for GDPR compliance.
 */
export async function POST(request: NextRequest) {
  try {
    const ipAddress = getHashedClientIP(request);

    logger.info({ ipHashPrefix: ipAddress.slice(0, 8) }, 'Tracking visitor');

    // Upsert visitor record
    const visitor = await prisma.visitor.upsert({
      where: { ipAddress },
      update: {
        visitCount: { increment: 1 },
      },
      create: {
        ipAddress,
        visitCount: 1,
      },
    });

    logger.info({
      ipHashPrefix: ipAddress.slice(0, 8),
      visitCount: visitor.visitCount,
      isNewVisitor: visitor.visitCount === 1,
    }, 'Visitor tracked successfully');

    return successResponse({
      tracked: true,
      visitCount: visitor.visitCount,
      isNewVisitor: visitor.visitCount === 1,
    });
  } catch (error) {
    logger.error({ error }, 'Error tracking visitor');
    return handleError(error);
  }
}
