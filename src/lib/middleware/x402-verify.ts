/**
 * x402 Payment Verification
 *
 * Verifies EIP-712 signed payment proofs for the x402 protocol.
 * Supports EIP-3009 TransferWithAuthorization (USDC standard).
 *
 * The payment proof is a base64-encoded JSON containing:
 * - x402Version: protocol version
 * - network: CAIP-2 chain identifier
 * - payload.signature: EIP-712 signature hex string
 * - payload.authorization: TransferWithAuthorization fields
 */

import { verifyTypedData, type Hex } from 'viem';
import { createLogger } from '@/lib/utils/logger';
import { X402_CONFIG } from './x402-config';

const logger = createLogger('x402-verify');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed and verified payment proof returned to callers. */
export interface VerifiedPayment {
  payer: string;
  recipient: string;
  amountUSDC: bigint;
  nonce: string;
  signature: string;
  validBefore: number;
}

/** Raw authorization fields in the payment proof. */
interface TransferAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: number;
  validBefore: number;
  nonce: string;
}

/** Structure of the decoded x402 payment token. */
interface X402PaymentProof {
  x402Version: number;
  scheme?: string;
  network: string;
  payload: {
    signature: string;
    authorization: TransferAuthorization;
  };
}

// ---------------------------------------------------------------------------
// EIP-712 domain & types for USDC EIP-3009 TransferWithAuthorization
// ---------------------------------------------------------------------------

const USDC_EIP712_DOMAIN = {
  name: 'USD Coin',
  version: '2',
  chainId: 43114,
  verifyingContract: X402_CONFIG.asset as `0x${string}`,
} as const;

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

// Track used nonces to prevent replay attacks (in-memory, per process)
const usedNonces = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decodePaymentProof(headerValue: string): X402PaymentProof | null {
  try {
    const decoded = Buffer.from(headerValue, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;

    // Validate required structure
    if (typeof parsed.x402Version !== 'number') return null;
    if (typeof parsed.network !== 'string') return null;

    const payload = parsed.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.signature !== 'string') return null;

    const auth = payload.authorization as Record<string, unknown> | undefined;
    if (!auth || typeof auth !== 'object') return null;
    if (typeof auth.from !== 'string') return null;
    if (typeof auth.to !== 'string') return null;
    if (typeof auth.value !== 'string') return null;
    if (typeof auth.nonce !== 'string') return null;

    return parsed as unknown as X402PaymentProof;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify an x402 payment proof header value.
 *
 * Returns a {@link VerifiedPayment} on success, or a string error reason
 * on failure (suitable for returning in a 402 response).
 */
export async function verifyX402Payment(
  headerValue: string,
): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; reason: string }> {
  // 1. Decode the proof
  const proof = decodePaymentProof(headerValue);
  if (!proof) {
    logger.warn('Invalid payment proof: failed to decode base64 JSON');
    return { ok: false, reason: 'Invalid payment proof format — expected base64-encoded JSON' };
  }

  // 2. Validate protocol version
  if (proof.x402Version !== 1) {
    return { ok: false, reason: `Unsupported x402 version: ${proof.x402Version}` };
  }

  // 3. Validate network matches
  if (proof.network !== X402_CONFIG.network) {
    return {
      ok: false,
      reason: `Network mismatch: expected ${X402_CONFIG.network}, got ${proof.network}`,
    };
  }

  const { authorization, signature } = proof.payload;

  // 4. Validate recipient matches our wallet
  if (authorization.to.toLowerCase() !== X402_CONFIG.recipient.toLowerCase()) {
    return {
      ok: false,
      reason: `Recipient mismatch: expected ${X402_CONFIG.recipient}, got ${authorization.to}`,
    };
  }

  // 5. Validate amount >= price
  const paymentAmount = BigInt(authorization.value);
  const requiredAmount = BigInt(X402_CONFIG.price);
  if (paymentAmount < requiredAmount) {
    return {
      ok: false,
      reason: `Insufficient payment: required ${X402_CONFIG.price}, got ${authorization.value}`,
    };
  }

  // 6. Check deadline hasn't passed
  const nowSec = Math.floor(Date.now() / 1000);
  if (authorization.validBefore > 0 && authorization.validBefore < nowSec) {
    return { ok: false, reason: 'Payment authorization has expired' };
  }

  // 7. Check nonce not already used (replay protection)
  if (usedNonces.has(authorization.nonce)) {
    return { ok: false, reason: 'Payment nonce already used (replay detected)' };
  }

  // 8. Verify EIP-712 signature
  try {
    const isValid = await verifyTypedData({
      address: authorization.from as `0x${string}`,
      domain: USDC_EIP712_DOMAIN,
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: {
        from: authorization.from as `0x${string}`,
        to: authorization.to as `0x${string}`,
        value: paymentAmount,
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce: authorization.nonce as Hex,
      },
      signature: signature as Hex,
    });

    if (!isValid) {
      logger.warn({ from: authorization.from }, 'EIP-712 signature verification failed');
      return { ok: false, reason: 'Invalid payment signature' };
    }
  } catch (err) {
    logger.error({ err }, 'EIP-712 verification error');
    return { ok: false, reason: 'Payment signature verification failed' };
  }

  // 9. Mark nonce as used
  usedNonces.add(authorization.nonce);

  // Cap nonce set size to prevent memory leak (keep last 10K)
  if (usedNonces.size > 10_000) {
    const entries = [...usedNonces];
    for (let i = 0; i < 5_000; i++) {
      usedNonces.delete(entries[i]);
    }
  }

  const verified: VerifiedPayment = {
    payer: authorization.from,
    recipient: authorization.to,
    amountUSDC: paymentAmount,
    nonce: authorization.nonce,
    signature,
    validBefore: authorization.validBefore,
  };

  logger.info(
    {
      payer: verified.payer,
      amount: verified.amountUSDC.toString(),
      nonce: verified.nonce,
    },
    'Payment verified successfully',
  );

  return { ok: true, payment: verified };
}
