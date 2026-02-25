import { describe, it, expect } from 'vitest';
import { generateNonce, buildSignMessage } from '@/lib/utils/auth';

describe('Auth - Nonce Generation', () => {
  it('generates a 64-character hex nonce', () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique nonces', () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).not.toBe(nonce2);
  });
});

describe('Auth - Sign Message Building', () => {
  it('builds a message with all required fields', () => {
    const message = buildSignMessage({
      action: 'rate',
      nonce: 'abc123',
      timestamp: 1700000000000,
    });

    expect(message).toContain('ERC8004Scan Action: rate');
    expect(message).toContain('Nonce: abc123');
    expect(message).toContain('Timestamp: 1700000000000');
    expect(message).toContain('Expires:');
  });

  it('includes correct expiration (5 minutes)', () => {
    const timestamp = 1700000000000;
    const message = buildSignMessage({
      action: 'report',
      nonce: 'def456',
      timestamp,
    });

    const expiresLine = message.split('\n').find(l => l.startsWith('Expires:'));
    const expiresAt = parseInt(expiresLine!.replace('Expires: ', ''), 10);
    expect(expiresAt).toBe(timestamp + 5 * 60 * 1000);
  });

  it('produces different messages for different actions', () => {
    const params = { nonce: 'same-nonce', timestamp: 1700000000000 };
    const msg1 = buildSignMessage({ ...params, action: 'rate' });
    const msg2 = buildSignMessage({ ...params, action: 'report' });
    expect(msg1).not.toBe(msg2);
  });

  it('produces different messages for different nonces', () => {
    const params = { action: 'rate', timestamp: 1700000000000 };
    const msg1 = buildSignMessage({ ...params, nonce: 'nonce1' });
    const msg2 = buildSignMessage({ ...params, nonce: 'nonce2' });
    expect(msg1).not.toBe(msg2);
  });
});
