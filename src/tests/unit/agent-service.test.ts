import { describe, it, expect, vi } from 'vitest';
import { prismaMock } from '../__mocks__/prisma';
import { mockAgent, mockAgentPending, MOCK_ADDRESS, MOCK_OWNER } from '../fixtures/agents';
import { NotFoundError } from '@/lib/utils/errors';

vi.mock('@/lib/database/prisma', () => ({ prisma: prismaMock }));

// Import after mock is set up
const {
  createAgent,
  getAgent,
  getAgents,
  updateAgent,
  agentExists,
} = await import('@/services/agent-service');

describe('createAgent', () => {
  it('creates agent with normalized lowercase address', async () => {
    prismaMock.agent.create.mockResolvedValue(mockAgent);

    await createAgent({
      address: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
      name: 'Test Agent',
      type: 'TRADING',
      owner_address: '0x1234567890ABCDEF1234567890ABCDEF12345678',
    });

    expect(prismaMock.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
          owner_address: '0x1234567890abcdef1234567890abcdef12345678',
        }),
      })
    );
  });

  it('uses PENDING as default status', async () => {
    prismaMock.agent.create.mockResolvedValue(mockAgentPending);

    await createAgent({
      address: MOCK_ADDRESS,
      name: 'Test Agent',
      type: 'TRADING',
      owner_address: MOCK_OWNER,
    });

    expect(prismaMock.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      })
    );
  });

  it('respects explicit status when provided', async () => {
    prismaMock.agent.create.mockResolvedValue(mockAgent);

    await createAgent({
      address: MOCK_ADDRESS,
      name: 'Test',
      type: 'TRADING',
      owner_address: MOCK_OWNER,
      status: 'VERIFIED',
    });

    expect(prismaMock.agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'VERIFIED' }),
      })
    );
  });

  it('returns the created agent', async () => {
    prismaMock.agent.create.mockResolvedValue(mockAgent);

    const result = await createAgent({
      address: MOCK_ADDRESS,
      name: 'Test Agent',
      type: 'TRADING',
      owner_address: MOCK_OWNER,
    });

    expect(result).toEqual(mockAgent);
  });

  it('propagates Prisma errors', async () => {
    prismaMock.agent.create.mockRejectedValue(new Error('Unique constraint violation'));

    await expect(
      createAgent({ address: MOCK_ADDRESS, name: 'Test', type: 'TRADING', owner_address: MOCK_OWNER })
    ).rejects.toThrow('Unique constraint violation');
  });
});

describe('getAgent', () => {
  it('fetches agent with trustScores and ratings included', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);

    await getAgent(MOCK_ADDRESS);

    expect(prismaMock.agent.findUnique).toHaveBeenCalledWith({
      where: { address: MOCK_ADDRESS.toLowerCase() },
      include: {
        trustScores: {
          orderBy: { calculatedAt: 'desc' },
          take: 1,
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });
  });

  it('normalizes address to lowercase', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    await getAgent('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');

    expect(prismaMock.agent.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: '0xabcdef1234567890abcdef1234567890abcdef12' },
      })
    );
  });

  it('returns null when agent not found', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    const result = await getAgent('0x0000000000000000000000000000000000000000');
    expect(result).toBeNull();
  });
});

describe('getAgents', () => {
  const defaultPagination = {
    agents: [mockAgent],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };

  beforeEach(() => {
    prismaMock.agent.findMany.mockResolvedValue([mockAgent] as any);
    prismaMock.agent.count.mockResolvedValue(1);
  });

  it('returns paginated agents', async () => {
    const result = await getAgents();
    expect(result.agents).toHaveLength(1);
    expect(result.pagination.page).toBe(1);
    expect(result.pagination.limit).toBe(20);
  });

  it('applies type filter', async () => {
    await getAgents({ type: 'TRADING' });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'TRADING' }),
      })
    );
  });

  it('applies status filter', async () => {
    await getAgents({ status: 'VERIFIED' });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'VERIFIED' }),
      })
    );
  });

  it('applies minTrustScore and maxTrustScore as gte/lte', async () => {
    await getAgents({ minTrustScore: 50, maxTrustScore: 90 });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trust_score: { gte: 50, lte: 90 },
        }),
      })
    );
  });

  it('applies only minTrustScore without lte when maxTrustScore not provided', async () => {
    await getAgents({ minTrustScore: 50 });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trust_score: { gte: 50 },
        }),
      })
    );
  });

  it('applies service filter via metadata path', async () => {
    await getAgents({ service: 'MCP' });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          metadata: {
            path: ['services'],
            array_contains: [{ name: 'MCP' }],
          },
        }),
      })
    );
  });

  it('applies search filter with OR on name and address', async () => {
    await getAgents({ search: 'arbitrage' });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'arbitrage', mode: 'insensitive' } },
            { address: { contains: 'arbitrage', mode: 'insensitive' } },
          ],
        }),
      })
    );
  });

  it('uses default pagination: page=1, limit=20', async () => {
    await getAgents();

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it('applies custom pagination: page=3, limit=10 → skip=20', async () => {
    await getAgents({}, { page: 3, limit: 10 });

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 })
    );
  });

  it('calculates totalPages correctly', async () => {
    prismaMock.agent.count.mockResolvedValue(45);

    const result = await getAgents({}, { page: 1, limit: 20 });
    expect(result.pagination.totalPages).toBe(3);
  });

  it('runs findMany and count in parallel (both called)', async () => {
    await getAgents();

    expect(prismaMock.agent.findMany).toHaveBeenCalledOnce();
    expect(prismaMock.agent.count).toHaveBeenCalledOnce();
  });

  it('returns empty array when no results', async () => {
    prismaMock.agent.findMany.mockResolvedValue([]);
    prismaMock.agent.count.mockResolvedValue(0);

    const result = await getAgents();
    expect(result.agents).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });
});

describe('updateAgent', () => {
  it('updates agent when it exists', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.agent.update.mockResolvedValue({ ...mockAgent, name: 'Updated' } as any);

    const result = await updateAgent(MOCK_ADDRESS, { name: 'Updated' });
    expect(result.name).toBe('Updated');
    expect(prismaMock.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: MOCK_ADDRESS.toLowerCase() },
        data: { name: 'Updated' },
      })
    );
  });

  it('throws NotFoundError when agent does not exist', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    await expect(updateAgent(MOCK_ADDRESS, { name: 'Updated' })).rejects.toThrow(NotFoundError);
  });
});

describe('agentExists', () => {
  it('returns true when agent count > 0', async () => {
    prismaMock.agent.count.mockResolvedValue(1);
    expect(await agentExists(MOCK_ADDRESS)).toBe(true);
  });

  it('returns false when agent count = 0', async () => {
    prismaMock.agent.count.mockResolvedValue(0);
    expect(await agentExists(MOCK_ADDRESS)).toBe(false);
  });

  it('normalizes address to lowercase', async () => {
    prismaMock.agent.count.mockResolvedValue(0);

    await agentExists('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');

    expect(prismaMock.agent.count).toHaveBeenCalledWith({
      where: { address: '0xabcdef1234567890abcdef1234567890abcdef12' },
    });
  });
});
