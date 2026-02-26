import { describe, it, expect, vi } from 'vitest';
import { publicClientMock } from '../__mocks__/blockchain-client';
import {
  MOCK_ADDRESS,
  MOCK_IMPL_ADDRESS,
  MOCK_BEACON_ADDRESS,
} from '../fixtures/agents';
import {
  MOCK_SLOT_WITH_ADDRESS,
  MOCK_SLOT_ZERO,
  MOCK_BYTECODE_DELEGATECALL,
  MOCK_BYTECODE_NO_DELEGATECALL,
  MOCK_BYTECODE_SIMPLE,
} from '../fixtures/bytecode';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';

vi.mock('@/lib/blockchain/client', () => ({
  publicClient: publicClientMock,
  getActiveChain: vi.fn(),
  getActiveChainId: vi.fn().mockReturnValue(43113),
  isMainnet: vi.fn().mockReturnValue(false),
  isTestnet: vi.fn().mockReturnValue(true),
}));

// Mock blockchain-service functions used by proxy-detector
const blockchainServiceMock = {
  verifyContractExists: vi.fn(),
  getContractCode: vi.fn(),
};

vi.mock('@/services/blockchain-service', () => blockchainServiceMock);

const { detectProxy, getImplementationAddress } = await import(
  '@/services/centinela/proxy-detector'
);

// Slot value encoding MOCK_IMPL_ADDRESS: last 40 hex chars of a 64-char slot
const IMPL_SLOT = `0x000000000000000000000000${MOCK_IMPL_ADDRESS.slice(2)}`;
const BEACON_SLOT = `0x000000000000000000000000${MOCK_BEACON_ADDRESS.slice(2)}`;
// A distinct admin address
const ADMIN_ADDRESS = '0xaaaa000000000000000000000000000000000001';
const ADMIN_SLOT = `0x000000000000000000000000${ADMIN_ADDRESS.slice(2)}`;

describe('detectProxy', () => {
  it('throws ContractNotFoundError when no contract exists', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(false);

    await expect(detectProxy(MOCK_ADDRESS as `0x${string}`)).rejects.toThrow(ContractNotFoundError);
  });

  it('detects BEACON proxy when beaconSlot is non-zero', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)    // implementation slot
      .mockResolvedValueOnce(BEACON_SLOT)  // beacon slot (non-zero → BEACON)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO); // admin slot

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.isProxy).toBe(true);
    expect(result.proxyType).toBe('BEACON');
    expect(result.beaconAddress).toBe(MOCK_BEACON_ADDRESS);
  });

  it('detects TRANSPARENT proxy when implementation + admin slots non-zero', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)    // implementation slot
      .mockResolvedValueOnce(MOCK_SLOT_ZERO) // beacon slot (zero)
      .mockResolvedValueOnce(ADMIN_SLOT);  // admin slot

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.isProxy).toBe(true);
    expect(result.proxyType).toBe('TRANSPARENT');
    expect(result.implementationAddress).toBe(MOCK_IMPL_ADDRESS);
    expect(result.adminAddress).toBe(ADMIN_ADDRESS);
  });

  it('detects UUPS proxy when only implementation slot is non-zero', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)     // implementation slot
      .mockResolvedValueOnce(MOCK_SLOT_ZERO) // beacon slot (zero)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO); // admin slot (zero)

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.isProxy).toBe(true);
    expect(result.proxyType).toBe('UUPS');
    expect(result.implementationAddress).toBe(MOCK_IMPL_ADDRESS);
    expect(result.adminAddress).toBeUndefined();
  });

  it('detects CUSTOM proxy via delegatecall bytecode when all slots are zero', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO);
    blockchainServiceMock.getContractCode.mockResolvedValue(MOCK_BYTECODE_DELEGATECALL);

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.isProxy).toBe(true);
    expect(result.proxyType).toBe('CUSTOM');
  });

  it('returns NONE when no proxy patterns detected', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO);
    blockchainServiceMock.getContractCode.mockResolvedValue(MOCK_BYTECODE_NO_DELEGATECALL);

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.isProxy).toBe(false);
    expect(result.proxyType).toBe('NONE');
  });

  it('BEACON takes priority when both beacon and implementation slots are non-zero', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)   // implementation slot
      .mockResolvedValueOnce(BEACON_SLOT) // beacon slot — both non-zero
      .mockResolvedValueOnce(ADMIN_SLOT); // admin slot

    const result = await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(result.proxyType).toBe('BEACON'); // BEACON has priority
  });

  it('reads all 3 storage slots (in parallel)', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt.mockResolvedValue(MOCK_SLOT_ZERO);
    blockchainServiceMock.getContractCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);

    await detectProxy(MOCK_ADDRESS as `0x${string}`);

    expect(publicClientMock.getStorageAt).toHaveBeenCalledTimes(3);
  });

  it('throws RPCError when getStorageAt fails', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt.mockRejectedValue(new Error('RPC failed'));

    await expect(detectProxy(MOCK_ADDRESS as `0x${string}`)).rejects.toThrow(RPCError);
  });
});

describe('getImplementationAddress', () => {
  it('returns null for non-proxy contracts', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt.mockResolvedValue(MOCK_SLOT_ZERO);
    blockchainServiceMock.getContractCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);

    const result = await getImplementationAddress(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBeNull();
  });

  it('returns implementationAddress directly for UUPS proxy', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO);

    const result = await getImplementationAddress(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBe(MOCK_IMPL_ADDRESS);
  });

  it('returns implementationAddress directly for TRANSPARENT proxy', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(IMPL_SLOT)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)
      .mockResolvedValueOnce(ADMIN_SLOT);

    const result = await getImplementationAddress(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBe(MOCK_IMPL_ADDRESS);
  });

  it('reads slot 0 of beacon contract to get implementation for BEACON proxy', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    // BEACON proxy: impl slot zero, beacon slot non-zero → no direct implementationAddress
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)  // impl slot (zero → no direct impl)
      .mockResolvedValueOnce(BEACON_SLOT)     // beacon slot (non-zero → BEACON type)
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)  // admin slot
      // 4th call: reading slot 0 of beacon contract to get impl
      .mockResolvedValueOnce(IMPL_SLOT);

    const result = await getImplementationAddress(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBe(MOCK_IMPL_ADDRESS);
    // Verify the 4th call read from the beacon address at slot 0
    expect(publicClientMock.getStorageAt).toHaveBeenCalledWith({
      address: MOCK_BEACON_ADDRESS,
      slot: '0x0000000000000000000000000000000000000000000000000000000000000000',
    });
  });

  it('returns null if reading beacon slot fails', async () => {
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    // BEACON proxy without direct implementationAddress
    publicClientMock.getStorageAt
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)  // impl slot (zero)
      .mockResolvedValueOnce(BEACON_SLOT)     // beacon slot
      .mockResolvedValueOnce(MOCK_SLOT_ZERO)  // admin slot
      .mockRejectedValueOnce(new Error('RPC error reading beacon')); // 4th call fails

    const result = await getImplementationAddress(MOCK_ADDRESS as `0x${string}`);
    expect(result).toBeNull();
  });
});
