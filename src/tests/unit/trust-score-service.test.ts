import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prismaMock } from '../__mocks__/prisma';
import { mockAgent, mockAgentCustomProxy, mockAgentTransparentProxy, MOCK_ADDRESS } from '../fixtures/agents';
import { mockTrustScore, mockStaleScore } from '../fixtures/trust-scores';
import { NotFoundError } from '@/lib/utils/errors';

vi.mock('@/lib/database/prisma', () => ({ prisma: prismaMock }));

const {
  calculateTrustScore,
  updateAgentTrustScore,
  getTrustScoreBreakdown,
  recalculateAllScores,
  TRUST_SCORE_WEIGHTS,
} = await import('@/services/trust-score-service');

// Helpers to set up "all data present" scenario
function setupAllComponents(opts: {
  volumeAvax?: number;
  uptimePassCount?: number;
  uptimeTotalCount?: number;
  ozScore?: number;
  ratings?: number[];
  agent?: typeof mockAgent;
} = {}) {
  const {
    volumeAvax = 150,
    uptimePassCount = 9,
    uptimeTotalCount = 10,
    ozScore = 70,
    ratings = [4, 3, 5],
    agent = mockAgent,
  } = opts;

  prismaMock.agent.findUnique.mockResolvedValue(agent as any);

  prismaMock.transactionVolume.findUnique.mockResolvedValue({
    agentAddress: MOCK_ADDRESS,
    period: 'DAY',
    volumeAvax: volumeAvax.toString(),
    txCount: 10,
    id: 1,
    volumeUsd: null,
    updatedAt: new Date(),
  } as any);

  const passLogs = Array.from({ length: uptimePassCount }, () => ({
    result: 'PASS',
    responseTimeMs: 120,
  }));
  const failLogs = Array.from({ length: uptimeTotalCount - uptimePassCount }, () => ({
    result: 'FAIL',
    responseTimeMs: 500,
  }));
  prismaMock.heartbeatLog.findMany.mockResolvedValue([...passLogs, ...failLogs] as any);

  prismaMock.trustScore.findFirst.mockResolvedValue({
    ...mockTrustScore,
    snapshotData: { ozMatch: { score: ozScore, matchedComponents: ['Ownable'] } },
  } as any);

  prismaMock.rating.findMany.mockResolvedValue(
    ratings.map((r) => ({ rating: r })) as any
  );
}

describe('TRUST_SCORE_WEIGHTS', () => {
  it('weights sum to exactly 1.0', () => {
    const total =
      TRUST_SCORE_WEIGHTS.VOLUME +
      TRUST_SCORE_WEIGHTS.PROXY +
      TRUST_SCORE_WEIGHTS.UPTIME +
      TRUST_SCORE_WEIGHTS.OZ_MATCH +
      TRUST_SCORE_WEIGHTS.RATINGS;
    expect(Math.round(total * 100) / 100).toBe(1.0);
  });
});

describe('calculateTrustScore', () => {
  it('returns breakdown with all 5 components', async () => {
    setupAllComponents();
    prismaMock.trustScore.create.mockResolvedValue(mockTrustScore as any);

    const result = await calculateTrustScore(MOCK_ADDRESS);

    expect(result.breakdown.volume).toBeDefined();
    expect(result.breakdown.proxy).toBeDefined();
    expect(result.breakdown.uptime).toBeDefined();
    expect(result.breakdown.ozMatch).toBeDefined();
    expect(result.breakdown.ratings).toBeDefined();
  });

  it('each component has score, weight, and weighted fields', async () => {
    setupAllComponents();

    const result = await calculateTrustScore(MOCK_ADDRESS);

    for (const component of Object.values(result.breakdown)) {
      expect(typeof component.score).toBe('number');
      expect(typeof component.weight).toBe('number');
      expect(typeof component.weighted).toBe('number');
    }
  });

  it('throws NotFoundError when agent not found', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    await expect(calculateTrustScore(MOCK_ADDRESS)).rejects.toThrow(NotFoundError);
  });

  it('final score is weighted sum of components (rounded)', async () => {
    // All scores = 100 → final = 100
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue({
      volumeAvax: '1000', txCount: 50, agentAddress: MOCK_ADDRESS, period: 'DAY', id: 1, volumeUsd: null, updatedAt: new Date(),
    } as any);
    prismaMock.heartbeatLog.findMany.mockResolvedValue(
      Array.from({ length: 100 }, () => ({ result: 'PASS', responseTimeMs: 100 })) as any
    );
    prismaMock.trustScore.findFirst.mockResolvedValue({
      ...mockTrustScore,
      snapshotData: { ozMatch: { score: 100, matchedComponents: ['Ownable'] } },
    } as any);
    prismaMock.rating.findMany.mockResolvedValue(
      Array.from({ length: 5 }, () => ({ rating: 5 })) as any
    );

    const result = await calculateTrustScore(MOCK_ADDRESS);
    expect(result.score).toBe(100);
  });

  describe('volume score thresholds', () => {
    async function getVolumeScore(avax: number) {
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue({
        volumeAvax: avax.toString(), txCount: 1, agentAddress: MOCK_ADDRESS, period: 'DAY', id: 1, volumeUsd: null, updatedAt: new Date(),
      } as any);
      prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
      prismaMock.trustScore.findFirst.mockResolvedValue(null);
      prismaMock.rating.findMany.mockResolvedValue([]);

      const result = await calculateTrustScore(MOCK_ADDRESS);
      return result.breakdown.volume.score;
    }

    it('1000 AVAX → score 100', async () => expect(await getVolumeScore(1000)).toBe(100));
    it('500 AVAX → score 80', async () => expect(await getVolumeScore(500)).toBe(80));
    it('100 AVAX → score 60', async () => expect(await getVolumeScore(100)).toBe(60));
    it('10 AVAX → score 40', async () => expect(await getVolumeScore(10)).toBe(40));
    it('5 AVAX (< 10) → score 20', async () => expect(await getVolumeScore(5)).toBe(20));
    it('0 AVAX → score 20 (not 0)', async () => expect(await getVolumeScore(0)).toBe(20));
  });

  it('no transactionVolume record → volume score 20 (lowest tier)', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockResolvedValue([]);

    const result = await calculateTrustScore(MOCK_ADDRESS);
    expect(result.breakdown.volume.score).toBe(20);
  });

  describe('uptime score thresholds', () => {
    async function getUptimeScore(passCount: number, totalCount: number) {
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
      const logs = [
        ...Array.from({ length: passCount }, () => ({ result: 'PASS', responseTimeMs: 100 })),
        ...Array.from({ length: totalCount - passCount }, () => ({ result: 'FAIL', responseTimeMs: 300 })),
      ];
      prismaMock.heartbeatLog.findMany.mockResolvedValue(logs as any);
      prismaMock.trustScore.findFirst.mockResolvedValue(null);
      prismaMock.rating.findMany.mockResolvedValue([]);

      const result = await calculateTrustScore(MOCK_ADDRESS);
      return result.breakdown.uptime.score;
    }

    it('100% uptime → score 100', async () => expect(await getUptimeScore(100, 100)).toBe(100));
    it('95% uptime → score 90', async () => expect(await getUptimeScore(95, 100)).toBe(90));
    it('90% uptime → score 70', async () => expect(await getUptimeScore(90, 100)).toBe(70));
    it('80% uptime → score 50', async () => expect(await getUptimeScore(80, 100)).toBe(50));
    it('70% uptime (< 80%) → score 25', async () => expect(await getUptimeScore(70, 100)).toBe(25));
  });

  it('no heartbeat logs → uptime score 0', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockResolvedValue([]);

    const result = await calculateTrustScore(MOCK_ADDRESS);
    expect(result.breakdown.uptime.score).toBe(0);
    expect(result.breakdown.uptime.details).toMatchObject({
      message: 'No heartbeat data available',
    });
  });

  describe('proxy score', () => {
    async function getProxyScore(agentOverride: typeof mockAgent) {
      prismaMock.agent.findUnique.mockResolvedValue(agentOverride as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
      prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
      prismaMock.trustScore.findFirst.mockResolvedValue(null);
      prismaMock.rating.findMany.mockResolvedValue([]);

      const result = await calculateTrustScore(MOCK_ADDRESS);
      return result.breakdown.proxy.score;
    }

    it('is_proxy=false → score 100', async () => {
      expect(await getProxyScore(mockAgent)).toBe(100);
    });
    it('TRANSPARENT proxy → score 80', async () => {
      expect(await getProxyScore(mockAgentTransparentProxy)).toBe(80);
    });
    it('CUSTOM (undeclared) proxy → score 0', async () => {
      expect(await getProxyScore(mockAgentCustomProxy)).toBe(0);
    });
    it('is_proxy=true proxy_type=NONE → score 50 (unknown state)', async () => {
      const agentUnknown = { ...mockAgent, is_proxy: true, proxy_type: 'NONE' };
      expect(await getProxyScore(agentUnknown as any)).toBe(50);
    });
  });

  describe('ratings score', () => {
    async function getRatingsScore(ratings: number[]) {
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
      prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
      prismaMock.trustScore.findFirst.mockResolvedValue(null);
      prismaMock.rating.findMany.mockResolvedValue(
        ratings.map((r) => ({ rating: r })) as any
      );

      const result = await calculateTrustScore(MOCK_ADDRESS);
      return result.breakdown.ratings.score;
    }

    it('no ratings → score 50 (neutral default)', async () => {
      expect(await getRatingsScore([])).toBe(50);
    });
    it('all 5-star → score 100', async () => {
      expect(await getRatingsScore([5, 5, 5])).toBe(100);
    });
    it('all 1-star → score 20', async () => {
      expect(await getRatingsScore([1, 1, 1])).toBe(20);
    });
    it('average 3.5 → score 70', async () => {
      expect(await getRatingsScore([3, 4])).toBe(70); // avg=3.5 → round(3.5/5*100)=70
    });
  });

  describe('OZ score thresholds', () => {
    async function getOZScore(score: number, isFraction = false) {
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
      prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
      prismaMock.trustScore.findFirst.mockResolvedValue({
        ...mockTrustScore,
        snapshotData: { ozMatch: { score, matchedComponents: [] } },
        ozMatchScore: isFraction ? score : score / 100,
      } as any);
      prismaMock.rating.findMany.mockResolvedValue([]);

      const result = await calculateTrustScore(MOCK_ADDRESS);
      return result.breakdown.ozMatch.score;
    }

    it('score >= 80 → tiered score 100', async () => expect(await getOZScore(80)).toBe(100));
    it('score >= 50 and < 80 → tiered score 70', async () => expect(await getOZScore(50)).toBe(70));
    it('score >= 20 and < 50 → tiered score 40', async () => expect(await getOZScore(20)).toBe(40));
    it('score >= 0 and < 20 → tiered score 20', async () => expect(await getOZScore(10)).toBe(20));
    it('no prior trust score → defaults to OZ score 20', async () => {
      prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
      prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
      prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
      prismaMock.trustScore.findFirst.mockResolvedValue(null);
      prismaMock.rating.findMany.mockResolvedValue([]);

      const result = await calculateTrustScore(MOCK_ADDRESS);
      expect(result.breakdown.ozMatch.score).toBe(20);
    });
    it('handles OZ score stored as 0-1 fraction in snapshot', async () => {
      // score=0.75 in snapshot → normalizedScore=75 → tier 70
      expect(await getOZScore(0.75)).toBe(70);
    });
  });

  it('DB error in volume component still returns result (error swallowed)', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockRejectedValue(new Error('DB down'));
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockResolvedValue([]);

    const result = await calculateTrustScore(MOCK_ADDRESS);
    expect(result.breakdown.volume.score).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(0); // other components still calculated
  });

  it('DB error in ratings returns score 50 (neutral fallback)', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockRejectedValue(new Error('DB error'));

    const result = await calculateTrustScore(MOCK_ADDRESS);
    expect(result.breakdown.ratings.score).toBe(50);
  });
});

describe('updateAgentTrustScore', () => {
  beforeEach(() => {
    setupAllComponents();
    prismaMock.agent.update.mockResolvedValue(mockAgent as any);
    prismaMock.trustScore.create.mockResolvedValue(mockTrustScore as any);
  });

  it('calls agent.update with the composite score', async () => {
    await updateAgentTrustScore(MOCK_ADDRESS);

    expect(prismaMock.agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { address: MOCK_ADDRESS },
        data: expect.objectContaining({ trust_score: expect.any(Number) }),
      })
    );
  });

  it('stores scores as 0-1 fractions in trustScore.create', async () => {
    await updateAgentTrustScore(MOCK_ADDRESS);

    expect(prismaMock.trustScore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          overallScore: expect.any(Number), // should be <= 1
          volumeScore: expect.any(Number),
        }),
      })
    );

    const createCall = prismaMock.trustScore.create.mock.calls[0][0];
    expect(createCall.data.overallScore).toBeLessThanOrEqual(1);
    expect(createCall.data.overallScore).toBeGreaterThanOrEqual(0);
    expect(createCall.data.volumeScore).toBeLessThanOrEqual(1);
  });

  it('includes snapshot data in trustScore.create', async () => {
    await updateAgentTrustScore(MOCK_ADDRESS);

    const createCall = prismaMock.trustScore.create.mock.calls[0][0];
    expect(createCall.data.snapshotData).toBeDefined();
    expect(createCall.data.snapshotData).toHaveProperty('volume');
    expect(createCall.data.snapshotData).toHaveProperty('proxy');
    expect(createCall.data.snapshotData).toHaveProperty('uptime');
    expect(createCall.data.snapshotData).toHaveProperty('ozMatch');
    expect(createCall.data.snapshotData).toHaveProperty('ratings');
  });
});

describe('getTrustScoreBreakdown', () => {
  it('returns cached score when within maxAgeMs (default 1 hour)', async () => {
    // mockTrustScore is 10 minutes old → should be cached
    prismaMock.trustScore.findFirst.mockResolvedValue(mockTrustScore as any);

    const result = await getTrustScoreBreakdown(MOCK_ADDRESS);

    // Should NOT have called agent.findUnique (would happen on fresh calc)
    expect(prismaMock.agent.findUnique).not.toHaveBeenCalled();
    expect(result.score).toBe(Math.round(mockTrustScore.overallScore * 100));
  });

  it('recalculates when cache is stale (> maxAgeMs)', async () => {
    // mockStaleScore is 2 hours old → stale for default 1h maxAgeMs
    prismaMock.trustScore.findFirst.mockResolvedValue(mockStaleScore as any);
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.rating.findMany.mockResolvedValue([]);

    await getTrustScoreBreakdown(MOCK_ADDRESS);

    // Fresh calculation should have been triggered
    expect(prismaMock.agent.findUnique).toHaveBeenCalled();
  });

  it('calculates fresh when no cached score exists', async () => {
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.rating.findMany.mockResolvedValue([]);

    await getTrustScoreBreakdown(MOCK_ADDRESS);

    expect(prismaMock.agent.findUnique).toHaveBeenCalled();
  });

  it('respects custom maxAgeMs — fresh if within window', async () => {
    // Score is 10 minutes old, maxAgeMs = 1 minute → should recalculate
    prismaMock.trustScore.findFirst.mockResolvedValue(mockTrustScore as any); // 10 min old
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.rating.findMany.mockResolvedValue([]);

    await getTrustScoreBreakdown(MOCK_ADDRESS, 60 * 1000); // 1 minute maxAgeMs

    expect(prismaMock.agent.findUnique).toHaveBeenCalled();
  });

  it('reconstructs breakdown from snapshotData correctly', async () => {
    prismaMock.trustScore.findFirst.mockResolvedValue(mockTrustScore as any);

    const result = await getTrustScoreBreakdown(MOCK_ADDRESS);

    expect(result.breakdown.volume.details).toEqual(
      (mockTrustScore.snapshotData as any).volume
    );
    expect(result.breakdown.proxy.details).toEqual(
      (mockTrustScore.snapshotData as any).proxy
    );
  });

  it('lastUpdated equals calculatedAt of the cached score', async () => {
    prismaMock.trustScore.findFirst.mockResolvedValue(mockTrustScore as any);

    const result = await getTrustScoreBreakdown(MOCK_ADDRESS);
    expect(result.lastUpdated).toEqual(mockTrustScore.calculatedAt);
  });
});

describe('recalculateAllScores', () => {
  it('returns count of successfully updated agents', async () => {
    const agents = [{ address: MOCK_ADDRESS }, { address: '0x1234567890abcdef1234567890abcdef12345678' }];
    prismaMock.agent.findMany
      .mockResolvedValueOnce(agents as any)
      .mockResolvedValueOnce([]); // second batch = empty → stops

    // For each agent's trust score calculation
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockResolvedValue([]);
    prismaMock.agent.update.mockResolvedValue(mockAgent as any);
    prismaMock.trustScore.create.mockResolvedValue(mockTrustScore as any);

    const count = await recalculateAllScores(2);
    expect(count).toBe(2);
  });

  it('skips agents that throw and continues', async () => {
    const agents = [{ address: MOCK_ADDRESS }, { address: '0x1111111111111111111111111111111111111111' }];
    prismaMock.agent.findMany
      .mockResolvedValueOnce(agents as any)
      .mockResolvedValueOnce([]);

    // First agent: not found → throws
    // Second agent: found → succeeds
    prismaMock.agent.findUnique
      .mockResolvedValueOnce(null) // first fails
      .mockResolvedValueOnce(mockAgent as any); // second succeeds

    prismaMock.transactionVolume.findUnique.mockResolvedValue(null);
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    prismaMock.trustScore.findFirst.mockResolvedValue(null);
    prismaMock.rating.findMany.mockResolvedValue([]);
    prismaMock.agent.update.mockResolvedValue(mockAgent as any);
    prismaMock.trustScore.create.mockResolvedValue(mockTrustScore as any);

    const count = await recalculateAllScores(2);
    expect(count).toBe(1);
  });

  it('returns 0 for empty agent list', async () => {
    prismaMock.agent.findMany.mockResolvedValue([]);

    const count = await recalculateAllScores();
    expect(count).toBe(0);
  });
});
