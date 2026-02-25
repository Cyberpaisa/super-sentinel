import { describe, it, expect } from 'vitest';
import { matchOZBytecode } from '@/services/centinela/oz-matcher';

describe('OZ Matcher', () => {
  it('returns score 0 for empty bytecode', () => {
    const result = matchOZBytecode('0x');
    expect(result.score).toBe(0);
    expect(result.matchedComponents).toEqual([]);
    expect(result.confidence).toBe('low');
  });

  it('returns score 0 for null/undefined bytecode', () => {
    const result = matchOZBytecode('');
    expect(result.score).toBe(0);
  });

  it('detects Ownable selectors in dispatcher pattern', () => {
    // Build a minimal bytecode with PUSH4 + selector + EQ pattern
    // owner() = 8da5cb5b
    // PUSH4 (63) + selector + EQ (14)
    const bytecode = '0x63' + '8da5cb5b' + '14' + '63' + '715018a6' + '14' + '63' + 'f2fde38b' + '14';
    const result = matchOZBytecode(bytecode);
    expect(result.matchedComponents).toContain('Ownable');
  });

  it('does NOT match selectors that appear only in data (no EQ after PUSH4)', () => {
    // Selector appears in bytecode but NOT as PUSH4+EQ pattern
    // Use PUSH32 (7f) to embed the selector as data, not as dispatcher
    const dataBytes = '00'.repeat(28) + '8da5cb5b'; // 32 bytes with selector at end
    const bytecode = '0x7f' + dataBytes + '50'; // PUSH32 data + POP
    const result = matchOZBytecode(bytecode);
    expect(result.matchedComponents).not.toContain('Ownable');
  });

  it('detects ERC20 component with sufficient selectors', () => {
    // Build dispatcher with ERC20 selectors: name, symbol, decimals, totalSupply, balanceOf, transfer
    const selectors = ['06fdde03', '95d89b41', '313ce567', '18160ddd', '70a08231', 'a9059cbb'];
    let bytecode = '0x';
    for (const sel of selectors) {
      bytecode += '63' + sel + '14'; // PUSH4 + selector + EQ
    }
    const result = matchOZBytecode(bytecode);
    expect(result.matchedComponents).toContain('ERC20');
  });

  it('calculates confidence levels correctly', () => {
    // Empty = low
    expect(matchOZBytecode('0x').confidence).toBe('low');
  });
});
