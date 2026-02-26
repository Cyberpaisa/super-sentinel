import { type TrustScore } from '@prisma/client';
import { MOCK_ADDRESS } from './agents';

export const mockTrustScore: TrustScore = {
  id: 'ts-uuid-fresh',
  agentId: MOCK_ADDRESS,
  overallScore: 0.75,
  volumeScore: 0.80,
  proxyScore: 1.0,
  uptimeScore: 0.90,
  ozMatchScore: 0.70,
  communityScore: 0.60,
  calculatedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago (fresh)
  snapshotData: {
    volume: { volume24h: '150.00 AVAX', txCount: 42 },
    proxy: { detected: false, type: 'NONE', status: 'No proxy detected' },
    uptime: { successRate: '90.0%', checks24h: 100, passed: 90 },
    ozMatch: { matchPercentage: 70, matchedComponents: ['Ownable', 'Pausable'] },
    ratings: { average: 3.0, count: 5 },
  },
};

export const mockStaleScore: TrustScore = {
  ...mockTrustScore,
  id: 'ts-uuid-stale',
  calculatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago (stale)
};

export const mockTrustScoreWithFractionOZ: TrustScore = {
  ...mockTrustScore,
  id: 'ts-uuid-fraction-oz',
  ozMatchScore: 0.75, // stored as 0-1 fraction
  snapshotData: {
    ozMatch: { score: 0.75, matchedComponents: ['Ownable'] }, // also fraction in snapshot
  },
};

export const mockTrustScoreHighOZ: TrustScore = {
  ...mockTrustScore,
  id: 'ts-uuid-high-oz',
  ozMatchScore: 0.85,
  snapshotData: {
    ozMatch: { score: 85, matchedComponents: ['Ownable', 'AccessControl', 'Pausable'] },
  },
};
