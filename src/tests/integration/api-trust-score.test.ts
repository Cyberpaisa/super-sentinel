import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAgent, MOCK_ADDRESS } from '../fixtures/agents';
import { NotFoundError } from '@/lib/utils/errors';

const agentServiceMock = {
  getAgent: vi.fn(),
};
const trustScoreServiceMock = {
  getTrustScoreBreakdown: vi.fn(),
  TRUST_SCORE_WEIGHTS: {
    VOLUME: 0.25, PROXY: 0.20, UPTIME: 0.25, OZ_MATCH: 0.15, RATINGS: 0.15,
  },
};

vi.mock('@/services/agent-service', () => agentServiceMock);
vi.mock('@/services/trust-score-service', () => trustScoreServiceMock);

const { GET } = await import('@/app/api/v1/agents/[address]/trust-score/route');

function makeGetRequest(address: string): NextRequest {
  return new NextRequest(new URL(`http://localhost/api/v1/agents/${address}/trust-score`));
}

const mockBreakdown = {
  score: 75,
  breakdown: {
    volume: { score: 80, weight: 0.25, weighted: 20, details: { volume24h: '100 AVAX', txCount: 10 } },
    proxy: { score: 100, weight: 0.20, weighted: 20, details: { detected: false } },
    uptime: { score: 90, weight: 0.25, weighted: 22.5, details: { successRate: '90%' } },
    ozMatch: { score: 70, weight: 0.15, weighted: 10.5, details: { matchPercentage: 70 } },
    ratings: { score: 60, weight: 0.15, weighted: 9, details: { average: 3, count: 5 } },
  },
  lastUpdated: new Date('2024-01-01T12:00:00Z'),
};

describe('GET /api/v1/agents/:address/trust-score', () => {
  it('returns 200 with full trust score breakdown', async () => {
    agentServiceMock.getAgent.mockResolvedValue(mockAgent);
    trustScoreServiceMock.getTrustScoreBreakdown.mockResolvedValue(mockBreakdown);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.address).toBe(MOCK_ADDRESS.toLowerCase());
    expect(body.data.score).toBe(75);
  });

  it('breakdown contains all 5 components', async () => {
    agentServiceMock.getAgent.mockResolvedValue(mockAgent);
    trustScoreServiceMock.getTrustScoreBreakdown.mockResolvedValue(mockBreakdown);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    const breakdown = body.data.breakdown;
    expect(breakdown.volume).toBeDefined();
    expect(breakdown.proxy).toBeDefined();
    expect(breakdown.uptime).toBeDefined();
    expect(breakdown.ozMatch).toBeDefined();
    expect(breakdown.ratings).toBeDefined();
  });

  it('each component has score, weight, weighted, details', async () => {
    agentServiceMock.getAgent.mockResolvedValue(mockAgent);
    trustScoreServiceMock.getTrustScoreBreakdown.mockResolvedValue(mockBreakdown);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    for (const component of Object.values(body.data.breakdown) as any[]) {
      expect(typeof component.score).toBe('number');
      expect(typeof component.weight).toBe('number');
      expect(typeof component.weighted).toBe('number');
      expect(component.details).toBeDefined();
    }
  });

  it('lastUpdated is ISO string', async () => {
    agentServiceMock.getAgent.mockResolvedValue(mockAgent);
    trustScoreServiceMock.getTrustScoreBreakdown.mockResolvedValue(mockBreakdown);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('returns 404 when agent not found', async () => {
    agentServiceMock.getAgent.mockResolvedValue(null);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('propagates service errors', async () => {
    agentServiceMock.getAgent.mockResolvedValue(mockAgent);
    trustScoreServiceMock.getTrustScoreBreakdown.mockRejectedValue(
      new NotFoundError('Agent gone')
    );

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });

    expect(res.status).toBe(404);
  });
});
