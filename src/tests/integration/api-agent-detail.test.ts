import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prismaMock } from '../__mocks__/prisma';
import { mockAgent, MOCK_ADDRESS } from '../fixtures/agents';
import { mockTrustScore } from '../fixtures/trust-scores';
import { NotFoundError } from '@/lib/utils/errors';

vi.mock('@/lib/database/prisma', () => ({ prisma: prismaMock }));

const trustScoreServiceMock = {
  getTrustScoreBreakdown: vi.fn(),
};
const heartbeatServiceMock = {
  calculateUptime: vi.fn(),
};

vi.mock('@/services/trust-score-service', () => ({
  ...trustScoreServiceMock,
  TRUST_SCORE_WEIGHTS: {
    VOLUME: 0.25, PROXY: 0.20, UPTIME: 0.25, OZ_MATCH: 0.15, RATINGS: 0.15,
  },
}));
vi.mock('@/services/centinela/heartbeat-service', () => heartbeatServiceMock);

const { GET } = await import('@/app/api/v1/agents/[address]/route');

function makeGetRequest(address: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/v1/agents/${address}`));
}

const mockUptimeResult = {
  uptimePercentage: 95,
  totalPings: 100,
  successfulPings: 95,
  failedPings: 3,
  timeoutPings: 2,
  averageResponseTimeMs: 120,
  period: '7d' as const,
};

const mockTrustBreakdown = {
  score: 75,
  breakdown: {
    volume: { score: 80, weight: 0.25, weighted: 20, details: {} },
    proxy: { score: 100, weight: 0.20, weighted: 20, details: {} },
    uptime: { score: 90, weight: 0.25, weighted: 22.5, details: {} },
    ozMatch: { score: 70, weight: 0.15, weighted: 10.5, details: {} },
    ratings: { score: 60, weight: 0.15, weighted: 9, details: {} },
  },
  lastUpdated: new Date('2024-01-01T12:00:00Z'),
};

function setupHappyPath(agentOverride = {}) {
  prismaMock.agent.findUnique.mockResolvedValue({
    ...mockAgent,
    transactionVolumes: [
      { period: 'DAY', txCount: 10, volumeAvax: '100', volumeUsd: '2000', id: 1, agentAddress: MOCK_ADDRESS, updatedAt: new Date() },
    ],
    ratings: [
      { id: 1, agentId: MOCK_ADDRESS, userAddress: '0x1234', rating: 4, review: 'Good', createdAt: new Date(), txHash: null },
      { id: 2, agentId: MOCK_ADDRESS, userAddress: '0x5678', rating: 5, review: null, createdAt: new Date(), txHash: null },
    ],
    ...agentOverride,
  } as any);
  trustScoreServiceMock.getTrustScoreBreakdown.mockResolvedValue(mockTrustBreakdown);
  heartbeatServiceMock.calculateUptime.mockResolvedValue(mockUptimeResult);
}

describe('GET /api/v1/agents/:address', () => {
  it('returns 200 with full agent details', async () => {
    setupHappyPath();
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.address).toBe(mockAgent.address);
    expect(body.data.name).toBe(mockAgent.name);
    expect(body.data.trustScore).toBeDefined();
    expect(body.data.uptime).toBeDefined();
    expect(body.data.ratings).toBeDefined();
    expect(body.data.volumes).toBeDefined();
  });

  it('formats volumes keyed by lowercase period', async () => {
    setupHappyPath();
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.volumes.day).toBeDefined();
    expect(body.data.volumes.day.txCount).toBe(10);
    expect(body.data.volumes.day.volumeAvax).toBe('100');
  });

  it('calculates ratings average correctly', async () => {
    setupHappyPath();
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.ratings.average).toBe(4.5); // (4+5)/2
    expect(body.data.ratings.count).toBe(2);
  });

  it('ratings average is 0 when no ratings', async () => {
    setupHappyPath({ ratings: [] });
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.ratings.average).toBe(0);
    expect(body.data.ratings.count).toBe(0);
  });

  it('returns 404 when agent not found', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid address format', async () => {
    const res = await GET(makeGetRequest('not-an-address'), {
      params: Promise.resolve({ address: 'not-an-address' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('uptime is fetched for 7d period', async () => {
    setupHappyPath();
    await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });

    expect(heartbeatServiceMock.calculateUptime).toHaveBeenCalledWith(
      MOCK_ADDRESS.toLowerCase(),
      '7d'
    );
  });

  it('trustScore lastUpdated is ISO string in response', async () => {
    setupHappyPath();
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.trustScore.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('createdAt and updatedAt are ISO strings', async () => {
    setupHappyPath();
    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
