import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { verifyX402Payment } from './x402-verify';
import { X402_CONFIG } from './x402-config';

// Re-export config so existing imports keep working
export { X402_CONFIG } from './x402-config';

const logger = createLogger('x402-payment');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the standard 402 Payment Required response with x402 discovery
 * headers so that compliant clients can automatically fulfil the payment.
 */
function paymentRequiredResponse(reason?: string): NextResponse {
  return new NextResponse(
    JSON.stringify({
      data: null,
      error: {
        message: reason ?? 'Payment required',
        code: 'PAYMENT_REQUIRED',
      },
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Price': X402_CONFIG.price,
        'X-402-Currency': X402_CONFIG.currency,
        'X-402-Asset': X402_CONFIG.asset,
        'X-402-Network': X402_CONFIG.network,
        'X-402-Recipient': X402_CONFIG.recipient,
        'X-402-Version': '1',
        ...(reason && { 'X-402-Reason': reason }),
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Middleware wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap a Next.js route handler with x402 payment gating.
 *
 * When `X402_CONFIG.enabled` is `false` the handler executes normally with
 * zero overhead.  When enabled, every request must include a valid
 * proof-of-payment via either:
 *
 *  - `X-Payment-Signature` – an EIP-712 / EIP-191 signed receipt, or
 *  - `X-Payment-Token`     – a bearer token issued by a payment facilitator.
 *
 * If neither header is present the middleware responds with HTTP 402 and the
 * `X-402-*` headers that describe how to pay.
 *
 * On successful verification, the payment is recorded in the EarningsTracker
 * and payer metadata is attached as response headers.
 */
export function withX402Payment(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Fast path – when payments are disabled, skip all checks.
    if (!X402_CONFIG.enabled) {
      return handler(request);
    }

    const paymentProof =
      request.headers.get('X-Payment-Signature') ||
      request.headers.get('X-Payment-Token');

    // No proof-of-payment -> tell the client how to pay.
    if (!paymentProof) {
      logger.debug('No payment proof provided - returning 402');
      return paymentRequiredResponse();
    }

    // Verify the payment proof (EIP-712 signature + business rules)
    const result = await verifyX402Payment(paymentProof);

    if (!result.ok) {
      logger.warn({ reason: result.reason }, 'Payment verification failed');
      return paymentRequiredResponse(result.reason);
    }

    const { payment } = result;

    logger.info(
      {
        payer: payment.payer,
        amount: payment.amountUSDC.toString(),
        nonce: payment.nonce,
      },
      'Payment verified — executing handler',
    );

    // Record the earning for survival tracking (A3 fix)
    // Lazy import to avoid circular dependency at module load time
    try {
      const { EarningsTracker } = await import('@/survival/earnings-tracker');
      EarningsTracker.getInstance().recordEarning({
        txHash: payment.nonce,
        payer: payment.payer,
        amountUSDC: payment.amountUSDC,
        service: 'full-scan',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Survival module may not be available — that's ok
      logger.debug('Could not record earning (survival module unavailable)');
    }

    // Execute the protected handler
    const response = await handler(request);

    // Attach payer metadata to the response for transparency
    response.headers.set('X-402-Payer', payment.payer);
    response.headers.set('X-402-Paid', payment.amountUSDC.toString());

    return response;
  };
}
