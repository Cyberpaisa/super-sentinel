import { NextRequest } from 'next/server';
import { successResponse, handleError } from '@/lib/utils/api-helpers';
import { ValidationError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { checkHealth, checkTLS } from '@/sentinels';
import { resolveAgentEndpoint } from '@/services/centinela/sentinels/resolve-endpoint';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const logger = createLogger('api-quick-check');

/**
 * GET /api/v1/sentinel/quick-check?address=0x...
 *
 * Free basic check: health + TLS only.
 * No payment required. Use POST /api/v1/sentinel/scan for full TRACER scan ($0.50).
 */
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get('address');
    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
      throw new ValidationError('address query param must be a valid Ethereum address');
    }

    const normalizedAddress = address.toLowerCase();
    let endpoint = request.nextUrl.searchParams.get('endpoint');

    if (!endpoint) {
      endpoint = await resolveAgentEndpoint(normalizedAddress);
    }

    if (!endpoint) {
      return successResponse({
        address: normalizedAddress,
        endpoint: null,
        checks: { health: null, tls: null },
        free: true,
      });
    }

    logger.info({ address: normalizedAddress, endpoint }, 'Quick check started');

    const [health, tls] = await Promise.allSettled([
      checkHealth(endpoint),
      checkTLS(endpoint),
    ]);

    const results = {
      address: normalizedAddress,
      endpoint,
      checks: {
        health: health.status === 'fulfilled' ? health.value : null,
        tls: tls.status === 'fulfilled' ? tls.value : null,
      },
      free: true,
      upgradeMessage: 'For full TRACER scan with 11 sentinels, use POST /api/v1/sentinel/scan ($0.50 USDC via x402)',
    };

    logger.info({ address: normalizedAddress }, 'Quick check completed');
    return successResponse(results);
  } catch (error) {
    return handleError(error);
  }
}
