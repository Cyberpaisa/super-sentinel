import { mockDeep, mockReset } from 'vitest-mock-extended';
import { type PrismaClient } from '@prisma/client';
import { beforeEach } from 'vitest';

export const prismaMock = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(prismaMock);
});
