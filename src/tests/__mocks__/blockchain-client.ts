import { vi } from 'vitest';

export const publicClientMock = {
  getCode: vi.fn(),
  getStorageAt: vi.fn(),
  getBytecode: vi.fn(),
  getBlockNumber: vi.fn(),
  readContract: vi.fn(),
};
