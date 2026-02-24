import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/utils/logger';
import { verifyX402Payment, type VerifiedPayment } from './x402-verify';
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
// Facilitator integration (verify + settle on-chain)
// ---------------------------------------------------------------------------

interface FacilitatorSettleResult {
  settled: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Attempt to verify and settle the payment on-chain via the x402 facilitator.
 *
 * If the facilitator is unreachable the function returns `{ settled: false }`
 * without throwing — the caller can decide whether to proceed with local-only
 * verification.
 */
async function settleViaFacilitator(
  payment: VerifiedPayment,
  _paymentProof: string,
): Promise<FacilitatorSettleResult> {
  const baseUrl = X402_CONFIG.facilitatorUrl;

  // Build payloads in x402 V2 format expected by the facilitator
  // See: https://github.com/coinbase/x402 (schemas/index.ts)
  const paymentRequirements = {
    scheme: 'exact',
    network: X402_CONFIG.network,
    amount: X402_CONFIG.price,
    asset: X402_CONFIG.asset,
    payTo: X402_CONFIG.recipient,
    maxTimeoutSeconds: 60,
  };

  const paymentPayload = {
    x402Version: 2 as const,
    accepted: paymentRequirements,
    payload: {
      signature: payment.signature,
      authorization: {
        from: payment.payer,
        to: payment.recipient,
        value: payment.amount.toString(),
        validAfter: '0',
        validBefore: String(payment.validBefore),
        nonce: payment.nonce,
      },
    },
  };

  try {
    // Step 1 — verify with the facilitator
    const verifyBody = JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements });
    logger.info({ verifyBody: verifyBody.substring(0, 500) }, 'Facilitator /verify request body');
    const verifyRes = await fetch(`${baseUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: verifyBody,
      signal: AbortSignal.timeout(10_000),
    });

    if (!verifyRes.ok) {
      const body = await verifyRes.text().catch(() => '');
      logger.warn({ status: verifyRes.status, body }, 'Facilitator /verify rejected');
      return { settled: false, error: `Facilitator verify failed: ${verifyRes.status}` };
    }

    const verifyData = (await verifyRes.json()) as { isValid?: boolean };
    if (!verifyData.isValid) {
      return { settled: false, error: 'Facilitator reported signature invalid' };
    }

    // Step 2 — settle on-chain
    const settleRes = await fetch(`${baseUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!settleRes.ok) {
      const body = await settleRes.text().catch(() => '');
      logger.warn({ status: settleRes.status, body }, 'Facilitator /settle failed');
      return { settled: false, error: `Facilitator settle failed: ${settleRes.status}` };
    }

    const settleData = (await settleRes.json()) as {
      success?: boolean;
      transaction?: string;
      txHash?: string;
      network?: string;
    };
    const txHash = settleData.transaction || settleData.txHash;
    if (settleData.success && txHash) {
      logger.info({ txHash }, 'Payment settled on-chain');
      return { settled: true, txHash };
    }

    return { settled: false, error: 'Facilitator settle returned no txHash' };
  } catch (err) {
    // Network error / timeout — facilitator unavailable
    logger.warn({ err }, 'Facilitator unreachable — falling back to local verification only');
    return { settled: false, error: 'Facilitator unreachable' };
  }
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
        amount: payment.amount.toString(),
        nonce: payment.nonce,
      },
      'Payment verified locally — attempting on-chain settlement',
    );

    // Attempt on-chain settlement via x402 facilitator
    const settle = await settleViaFacilitator(payment, paymentProof);

    if (!settle.settled && settle.error && !settle.error.includes('unreachable')) {
      // Facilitator explicitly rejected — return 402 with reason
      logger.warn({ error: settle.error }, 'Settlement rejected by facilitator');
      return paymentRequiredResponse(`Settlement failed: ${settle.error}`);
    }

    const txHash = settle.txHash ?? payment.nonce;

    // Record the earning for survival tracking
    // Lazy import to avoid circular dependency at module load time
    try {
      const { EarningsTracker } = await import('@/survival/earnings-tracker');
      EarningsTracker.getInstance().recordEarning({
        txHash,
        payer: payment.payer,
        amountUSDC: payment.amount,
        service: 'full-scan',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Survival module may not be available — that's ok
      logger.debug('Could not record earning (survival module unavailable)');
    }

    // Execute the protected handler
    const handlerStart = Date.now();
    const response = await handler(request);

    // Fire-and-forget auto-feedback
    try {
      const { AutoFeedbackEngine } = await import('@/feedback/auto-feedback');
      AutoFeedbackEngine.getInstance()
        .postServiceFeedback({
          callerWallet: payment.payer,
          endpoint: request.nextUrl.pathname,
          latencyMs: Date.now() - handlerStart,
          wasX402: true,
          responseStatus: response.status,
        })
        .catch(() => {});
    } catch {
      // feedback module unavailable — ok
    }

    // Attach payer metadata to the response for transparency
    response.headers.set('X-402-Payer', payment.payer);
    response.headers.set('X-402-Paid', payment.amount.toString());
    if (settle.txHash) {
      response.headers.set('X-402-TxHash', settle.txHash);
    }

    return response;
  };
}
