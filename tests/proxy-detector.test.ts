import { describe, it, expect } from 'vitest';

/**
 * Test the hasDelegatecallPattern logic directly
 * (We replicate the function here since it's not exported)
 */
function hasDelegatecallPattern(bytecode: string): boolean {
  if (!bytecode || bytecode === '0x') {
    return false;
  }
  const hex = bytecode.toLowerCase().replace('0x', '');
  const bytes = hex.length / 2;
  let i = 0;
  while (i < bytes) {
    const opcode = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    if (opcode === 0xf4) {
      return true;
    }
    if (opcode >= 0x60 && opcode <= 0x7f) {
      const pushSize = opcode - 0x5f;
      i += 1 + pushSize;
    } else {
      i += 1;
    }
  }
  return false;
}

describe('Proxy Detector - hasDelegatecallPattern', () => {
  it('returns false for empty bytecode', () => {
    expect(hasDelegatecallPattern('0x')).toBe(false);
    expect(hasDelegatecallPattern('')).toBe(false);
  });

  it('detects DELEGATECALL opcode (0xF4) in instruction position', () => {
    // Simple bytecode: PUSH1 0x00 + DELEGATECALL
    const bytecode = '0x6000f4';
    expect(hasDelegatecallPattern(bytecode)).toBe(true);
  });

  it('does NOT false-positive on "f4" appearing inside PUSH data', () => {
    // PUSH2 (61) followed by 2 data bytes containing f4
    // 61 f4 00 = PUSH2 0xf400 — the f4 is data, not an opcode
    const bytecode = '0x61f40000';
    expect(hasDelegatecallPattern(bytecode)).toBe(false);
  });

  it('does NOT false-positive on "f4" inside PUSH20 (address data)', () => {
    // PUSH20 (73) followed by 20 bytes of address data containing f4
    const addressData = '3f4a' + '00'.repeat(18);
    const bytecode = '0x73' + addressData + '00';
    expect(hasDelegatecallPattern(bytecode)).toBe(false);
  });

  it('detects DELEGATECALL after multiple PUSH instructions', () => {
    // PUSH1 0x00 + PUSH1 0x00 + PUSH1 0x00 + PUSH1 0x00 + PUSH1 0x00 + PUSH1 0x00 + DELEGATECALL
    const bytecode = '0x' + '6000'.repeat(6) + 'f4';
    expect(hasDelegatecallPattern(bytecode)).toBe(true);
  });

  it('handles PUSH32 with f4 in data correctly (no false positive)', () => {
    // PUSH32 (7f) + 32 bytes of data containing f4
    const data = 'f4' + '00'.repeat(31);
    const bytecode = '0x7f' + data + '00'; // PUSH32 + data + STOP
    expect(hasDelegatecallPattern(bytecode)).toBe(false);
  });
});
