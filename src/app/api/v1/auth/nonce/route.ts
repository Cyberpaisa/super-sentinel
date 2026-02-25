import { NextResponse } from 'next/server';
import { generateNonce } from '@/lib/utils/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/auth/nonce
 *
 * Generate a nonce for wallet signature verification.
 * The frontend should call this before requesting a signature,
 * then include the nonce and timestamp in the signed message.
 */
export async function GET() {
  const nonce = generateNonce();
  const timestamp = Date.now();

  return NextResponse.json({
    data: { nonce, timestamp },
    error: null,
  });
}
