import { describe, it, expect, vi, afterEach } from 'vitest';
import { publicClientMock } from '../__mocks__/blockchain-client';
import { MOCK_ADDRESS, MOCK_OWNER, MOCK_BILLING } from '../fixtures/agents';
import { MOCK_BYTECODE_SIMPLE, MOCK_BYTECODE_EMPTY } from '../fixtures/bytecode';
import { RPCError, ContractNotFoundError, BlockchainError } from '@/lib/utils/errors';

vi.mock('@/lib/blockchain/client', () => ({
  publicClient: publicClientMock,
  getActiveChain: vi.fn(),
  getActiveChainId: vi.fn().mockReturnValue(43113),
  isMainnet: vi.fn().mockReturnValue(false),
  isTestnet: vi.fn().mockReturnValue(true),
}));

const mockContractRead = {
  name: vi.fn(),
  agentType: vi.fn(),
  billingAddress: vi.fn(),
  owner: vi.fn(),
};

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    getContract: vi.fn().mockReturnValue({ read: mockContractRead }),
  };
});

const {
  getContractCode,
  verifyContractExists,
  readAgentMetadata,
} = await import('@/services/blockchain-service');

afterEach(() => {
  vi.clearAllMocks();
  mockContractRead.name.mockReset();
  mockContractRead.agentType.mockReset();
  mockContractRead.billingAddress.mockReset();
  mockContractRead.owner.mockReset();
});

describe('verifyContractExists', () => {
  it('returns true when bytecode is non-empty', async () => {
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    expect(await verifyContractExists(MOCK_ADDRESS as `0x${string}`)).toBe(true);
  });

  it('returns false when bytecode is exactly "0x"', async () => {
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_EMPTY);
    expect(await verifyContractExists(MOCK_ADDRESS as `0x${string}`)).toBe(false);
  });

  it('returns false when getCode returns undefined (EOA)', async () => {
    publicClientMock.getCode.mockResolvedValue(undefined);
    expect(await verifyContractExists(MOCK_ADDRESS as `0x${string}`)).toBe(false);
  });
});

describe('getContractCode', () => {
  it('returns bytecode hex string on success', async () => {
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    const result = await getContractCode(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBe(MOCK_BYTECODE_SIMPLE);
  });

  it('returns null when getCode returns undefined (EOA)', async () => {
    publicClientMock.getCode.mockResolvedValue(undefined);
    const result = await getContractCode(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBeNull();
  });

  it('throws RPCError when all retries fail', async () => {
    publicClientMock.getCode.mockRejectedValue(new Error('Network error'));

    // retryOperation catches internally; the outer getContractCode wraps in RPCError
    await expect(getContractCode(MOCK_ADDRESS as `0x${string}`)).rejects.toThrow(RPCError);
    expect(publicClientMock.getCode).toHaveBeenCalledTimes(3);
  }, 15000);

  it('retries on failure and succeeds on 3rd attempt', async () => {
    publicClientMock.getCode
      .mockRejectedValueOnce(new Error('RPC error 1'))
      .mockRejectedValueOnce(new Error('RPC error 2'))
      .mockResolvedValueOnce(MOCK_BYTECODE_SIMPLE);

    const result = await getContractCode(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBe(MOCK_BYTECODE_SIMPLE);
    expect(publicClientMock.getCode).toHaveBeenCalledTimes(3);
  }, 15000);
});

describe('readAgentMetadata', () => {
  function setupSuccessfulRead() {
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    mockContractRead.name.mockResolvedValue('Test Agent');
    mockContractRead.agentType.mockResolvedValue('TRADING');
    mockContractRead.billingAddress.mockResolvedValue(MOCK_BILLING as `0x${string}`);
    mockContractRead.owner.mockResolvedValue(MOCK_OWNER as `0x${string}`);
  }

  it('throws ContractNotFoundError when no contract exists', async () => {
    publicClientMock.getCode.mockResolvedValue('0x');

    await expect(readAgentMetadata(MOCK_ADDRESS as `0x${string}`)).rejects.toThrow(
      ContractNotFoundError
    );
  });

  it('returns all 4 metadata fields on success', async () => {
    setupSuccessfulRead();

    const result = await readAgentMetadata(MOCK_ADDRESS as `0x${string}`);

    expect(result).toEqual({
      name: 'Test Agent',
      agentType: 'TRADING',
      billingAddress: MOCK_BILLING,
      owner: MOCK_OWNER,
    });
  });

  it('wraps generic errors in BlockchainError', async () => {
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    mockContractRead.name.mockRejectedValue(new Error('call revert'));
    mockContractRead.agentType.mockResolvedValue('TRADING');
    mockContractRead.billingAddress.mockResolvedValue(MOCK_BILLING as `0x${string}`);
    mockContractRead.owner.mockResolvedValue(MOCK_OWNER as `0x${string}`);

    await expect(readAgentMetadata(MOCK_ADDRESS as `0x${string}`)).rejects.toThrow(BlockchainError);
  }, 15000);

  it('passes through existing BlockchainError without re-wrapping', async () => {
    // verifyContractExists returns false → throws ContractNotFoundError before retrying
    publicClientMock.getCode.mockResolvedValue('0x');

    await expect(readAgentMetadata(MOCK_ADDRESS as `0x${string}`)).rejects.toBeInstanceOf(
      ContractNotFoundError
    );
  });
});
