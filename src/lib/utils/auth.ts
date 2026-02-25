import { verifyMessage } from 'viem';
import { randomBytes } from 'crypto';
import { UnauthorizedError } from './errors';
import { createLogger } from './logger';
import { prisma } from '@/lib/database/prisma';

const logger = createLogger('auth');

/** Maximum age of a signed message (5 minutes) */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000;

/**
 * Generate a nonce for wallet signature
 * The frontend should call this before requesting a signature
 */
export function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Build the message that the user must sign
 * Includes nonce, timestamp, and action to prevent replay attacks
 */
export function buildSignMessage(params: {
  action: string;
  nonce: string;
  timestamp: number;
}): string {
  const expiresAt = params.timestamp + MAX_MESSAGE_AGE_MS;
  return [
    `ERC8004Scan Action: ${params.action}`,
    `Nonce: ${params.nonce}`,
    `Timestamp: ${params.timestamp}`,
    `Expires: ${expiresAt}`,
  ].join('\n');
}

/**
 * Verify a wallet signature with nonce and timestamp validation
 *
 * @param address - The claimed wallet address
 * @param signature - The signature to verify
 * @param nonce - Unique nonce for this request
 * @param timestamp - When the message was created (ms since epoch)
 * @param action - The action being performed (e.g., 'rate', 'report')
 * @returns The verified wallet address (lowercase)
 * @throws {UnauthorizedError} If signature verification fails
 */
export async function verifyWalletSignature(
  address: string,
  signature: string,
  nonce: string,
  timestamp: number,
  action: string
): Promise<string> {
  try {
    // Validate timestamp is not too old
    const now = Date.now();
    if (now - timestamp > MAX_MESSAGE_AGE_MS) {
      throw new UnauthorizedError('Signature expired. Please sign again.');
    }

    // Validate timestamp is not in the future (with 30s tolerance)
    if (timestamp > now + 30_000) {
      throw new UnauthorizedError('Invalid timestamp');
    }

    // Check nonce has not been used before
    const existingNonce = await prisma.authNonce.findUnique({
      where: { nonce },
    });
    if (existingNonce) {
      throw new UnauthorizedError('Nonce already used. Please generate a new signature.');
    }

    // Build the expected message
    const message = buildSignMessage({ action, nonce, timestamp });

    // Verify signature
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      throw new UnauthorizedError('Invalid wallet signature');
    }

    // Mark nonce as used
    await prisma.authNonce.create({
      data: {
        nonce,
        address: address.toLowerCase(),
        action,
        expiresAt: new Date(timestamp + MAX_MESSAGE_AGE_MS),
      },
    });

    logger.debug({ address, action }, 'Wallet signature verified with nonce');
    return address.toLowerCase();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    logger.error({ address, error }, 'Signature verification failed');
    throw new UnauthorizedError('Invalid wallet signature');
  }
}
