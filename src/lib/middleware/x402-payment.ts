import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('x402-payment');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * x402 payment protocol configuration.
 *
 * The protocol uses HTTP 402 (Payment Required) to signal that an endpoint is
 * monetised.  When a client receives a 402 it reads the `X-402-*` response
 * headers, constructs a payment on the specified network, and retries the
 * request with a proof-of-payment header.
 *
 * Toggle the feature with the `X402_PAYMENT_ENABLED` env var.
 */
export const X402_CONFIG = {
  /** Price per request denominated in `currency` */
  price: '0.001',
  /** Native token / asset symbol */
  currency: 'AVAX',
  /** CAIP-2 chain identifier – Avalanche C-Chain mainnet */
  network: 'eip155:43114',
  /** Address that receives the payment */
  recipient:
    process.env.X402_RECIPIENT_ADDRESS ||
    '0x0000000000000000000000000000000000000000',
  /** Kill-switch: the middleware is a no-op when disabled */
  enabled: process.env.X402_PAYMENT_ENABLED === 'true',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the standard 402 Payment Required response with x402 discovery
 * headers so that compliant clients can automatically fulfil the payment.
 */
function paymentRequiredResponse(): NextResponse {
  return new NextResponse(
    JSON.stringify({
      data: null,
      error: {
        message: 'Payment required',
        code: 'PAYMENT_REQUIRED',
      },
    }),
    {
      status: 402,
      headers: {
        'Content-Type': 'application/json',
        'X-402-Price': X402_CONFIG.price,
        'X-402-Currency': X402_CONFIG.currency,
        'X-402-Network': X402_CONFIG.network,
        'X-402-Recipient': X402_CONFIG.recipient,
        'X-402-Version': '1',
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
 * @example
 * ```ts
 * // src/app/api/v1/scan/route.ts
 * import { withX402Payment } from '@/lib/middleware/x402-payment';
 *
 * async function handler(request: NextRequest) {
 *   // ... perform sentinel scan
 *   return NextResponse.json({ data: result, error: null });
 * }
 *
 * export const POST = withX402Payment(handler);
 * ```
 */
export function withX402Payment(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Fast path – when payments are disabled, skip all checks.
    if (!X402_CONFIG.enabled) {
      return handler(request);
    }

    const paymentSignature = request.headers.get('X-Payment-Signature');
    const paymentToken = request.headers.get('X-Payment-Token');

    // No proof-of-payment → tell the client how to pay.
    if (!paymentSignature && !paymentToken) {
      logger.debug('No payment proof provided – returning 402');
      return paymentRequiredResponse();
    }

    // TODO: Verify payment signature using Coinbase CDP SDK
    // -------------------------------------------------------
    // 1. If `paymentToken` is present, validate it against the CDP
    //    facilitator API (or a local JWT if self-issued).
    // 2. If `paymentSignature` is present, recover the signer via
    //    EIP-712 typed-data verification, then confirm the on-chain
    //    transfer to `X402_CONFIG.recipient` on the configured network.
    // 3. Reject with 402 (+ reason header) if verification fails.
    // 4. Optionally attach verified payment metadata to the request so
    //    downstream handlers can access payer address / tx hash.
    // -------------------------------------------------------

    logger.info(
      {
        hasSignature: !!paymentSignature,
        hasToken: !!paymentToken,
      },
      'Payment proof received'
    );

    return handler(request);
  };
}
