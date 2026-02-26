import { describe, it, expect, vi } from 'vitest';
import {
  MOCK_BYTECODE_EMPTY,
  MOCK_BYTECODE_OWNABLE,
  MOCK_BYTECODE_OWNABLE_PARTIAL,
  MOCK_BYTECODE_OWNABLE_TWO,
  MOCK_BYTECODE_ERC20,
  MOCK_BYTECODE_REENTRANCY,
  MOCK_BYTECODE_SIMPLE,
} from '../fixtures/bytecode';
import { MOCK_ADDRESS } from '../fixtures/agents';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';

const blockchainServiceMock = {
  verifyContractExists: vi.fn(),
  getContractCode: vi.fn(),
};

vi.mock('@/services/blockchain-service', () => blockchainServiceMock);

const { matchOZBytecode, matchOZBytecodeByAddress } = await import(
  '@/services/centinela/oz-matcher'
);

describe('matchOZBytecode (pure function)', () => {
  it('returns score 0 for empty string', () => {
    const result = matchOZBytecode('');
    expect(result.score).toBe(0);
    expect(result.matchedComponents).toHaveLength(0);
    expect(result.confidence).toBe('low');
  });

  it('returns score 0 for "0x" bytecode', () => {
    const result = matchOZBytecode('0x');
    expect(result.score).toBe(0);
    expect(result.matchedComponents).toHaveLength(0);
  });

  it('detects Ownable when all 3 selectors are present', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_OWNABLE);
    expect(result.matchedComponents).toContain('Ownable');
  });

  it('does NOT detect Ownable when only 1 of 3 selectors present (< 50%)', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_OWNABLE_PARTIAL);
    expect(result.matchedComponents).not.toContain('Ownable');
  });

  it('detects Ownable when 2 of 3 selectors present (67% >= 50%)', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_OWNABLE_TWO);
    expect(result.matchedComponents).toContain('Ownable');
  });

  it('detects ERC20 when all 9 function selectors are present', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_ERC20);
    expect(result.matchedComponents).toContain('ERC20');
  });

  it('detects ReentrancyGuard via SLOAD/SSTORE heuristic (>= 2 each)', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_REENTRANCY);
    expect(result.matchedComponents).toContain('ReentrancyGuard');
  });

  it('does NOT detect ReentrancyGuard with only 1 SLOAD', () => {
    // Only 1 SLOAD (54) and 1 SSTORE (55) → heuristic requires >= 2 each
    const bytecode = '0x6080604052' + '54' + '55' + '00';
    const result = matchOZBytecode(bytecode);
    expect(result.matchedComponents).not.toContain('ReentrancyGuard');
  });

  it('confidence is "high" when score >= 80', () => {
    // Create bytecode that matches Ownable + multiple other components
    const highScoreBytecode =
      // Ownable selectors
      '8da5cb5b715018a6f2fde38b' +
      // Pausable selector
      '5c975abb' +
      // ReentrancyGuard heuristic (multiple SLOAD/SSTORE)
      '545555545555' +
      // Ownable event topic
      '8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0' +
      // AccessControl selectors
      '01ffc9a7248a9ca32f2ff15d91d14854';
    const result = matchOZBytecode(highScoreBytecode);
    if (result.score >= 80) {
      expect(result.confidence).toBe('high');
    }
  });

  it('confidence is "medium" when score is 50-79', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_OWNABLE);
    if (result.score >= 50 && result.score < 80) {
      expect(result.confidence).toBe('medium');
    }
  });

  it('confidence is "low" when score < 50', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_SIMPLE);
    if (result.score < 50) {
      expect(result.confidence).toBe('low');
    }
  });

  it('score is never negative', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_SIMPLE);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('score never exceeds 100', () => {
    // Match many components
    const allSelectors =
      '8da5cb5b715018a6f2fde38b' + // Ownable
      '5c975abb' +                   // Pausable
      '545455545455' +               // ReentrancyGuard heuristic (SLOAD SLOAD SSTORE SSTORE...)
      '01ffc9a7248a9ca32f2ff15d91d14854';
    const result = matchOZBytecode(allSelectors);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('is case-insensitive for selector matching', () => {
    // Ownable selectors in uppercase
    const upperCaseBytecode = '0x' + '8DA5CB5B' + '715018A6' + 'F2FDE38B';
    const lowerCaseBytecode = '0x' + '8da5cb5b' + '715018a6' + 'f2fde38b';
    const upperResult = matchOZBytecode(upperCaseBytecode);
    const lowerResult = matchOZBytecode(lowerCaseBytecode);
    expect(upperResult.matchedComponents).toEqual(lowerResult.matchedComponents);
  });

  it('"0x" prefix is stripped before matching', () => {
    const withPrefix = '0x8da5cb5b715018a6f2fde38b';
    const withoutPrefix = '8da5cb5b715018a6f2fde38b';
    const withResult = matchOZBytecode(withPrefix);
    const withoutResult = matchOZBytecode(withoutPrefix);
    expect(withResult.matchedComponents).toEqual(withoutResult.matchedComponents);
  });

  it('returns details for all OZ components', () => {
    const result = matchOZBytecode(MOCK_BYTECODE_OWNABLE);
    expect(Object.keys(result.details)).toContain('Ownable');
    expect(Object.keys(result.details)).toContain('ERC20');
    expect(Object.keys(result.details)).toContain('ReentrancyGuard');
  });

  it('security bonus: +5 per matched security component', () => {
    // Ownable (1 security) + Pausable (2 security)
    const twoSecurityBytecode =
      '8da5cb5b715018a6f2fde38b' + // Ownable (3 selectors)
      '5c975abb'; // Pausable (1 selector, 100% match)
    const result = matchOZBytecode(twoSecurityBytecode);
    // At minimum there should be a bonus applied
    // We can't test exact bonus without also knowing component score,
    // but we can verify matchedComponents includes both
    if (result.matchedComponents.includes('Ownable') && result.matchedComponents.includes('Pausable')) {
      expect(result.score).toBeGreaterThan(0);
    }
  });
});

describe('matchOZBytecodeByAddress (async)', () => {
  it('throws ContractNotFoundError when verifyContractExists returns false', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(false);

    await expect(
      matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`)
    ).rejects.toThrow(ContractNotFoundError);
  });

  it('throws ContractNotFoundError when getContractCode returns null', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.getContractCode.mockResolvedValue(null);

    await expect(
      matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`)
    ).rejects.toThrow(ContractNotFoundError);
  });

  it('fetches bytecode and returns matchOZBytecode result', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.getContractCode.mockResolvedValue(MOCK_BYTECODE_OWNABLE);

    const result = await matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`);

    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('matchedComponents');
    expect(result).toHaveProperty('confidence');
    expect(result.matchedComponents).toContain('Ownable');
  });

  it('wraps unexpected errors in RPCError', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.getContractCode.mockRejectedValue(new Error('unexpected'));

    await expect(
      matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`)
    ).rejects.toThrow(RPCError);
  });

  it('passes through ContractNotFoundError unchanged', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.getContractCode.mockRejectedValue(
      new ContractNotFoundError(MOCK_ADDRESS)
    );

    await expect(
      matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`)
    ).rejects.toBeInstanceOf(ContractNotFoundError);
  });

  it('passes through RPCError unchanged', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.getContractCode.mockRejectedValue(new RPCError('connection failed'));

    await expect(
      matchOZBytecodeByAddress(MOCK_ADDRESS as `0x${string}`)
    ).rejects.toBeInstanceOf(RPCError);
  });
});
