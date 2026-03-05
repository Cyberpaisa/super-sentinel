'use client';

import { useQuery } from '@tanstack/react-query';
import type { AgentType, AgentStatus, ProxyType } from '@prisma/client';

/**
 * Agent metadata structure (ERC-8004 + EIP standard)
 */
export interface AgentMetadata {
  type?: string;
  name?: string;
  description?: string;
  image?: string;
  services?: Array<{
    name: string;
    endpoint: string;
    version?: string;
  }>;
  x402Support?: boolean;
  active?: boolean;
  registrations?: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
  supportedTrust?: string[];
  [key: string]: unknown;
}

/**
 * Trust score component data from API
 */
export interface ScoreComponent {
  score: number;
  weight: number;
  weighted: number;
  details: Record<string, unknown>;
}

/**
 * Agent detail response from API
 */
export interface AgentDetail {
  address: string;
  name: string;
  type: AgentType;
  description: string | null;
  ownerAddress: string;
  billingAddress: string | null;
  registryAddress: string | null;
  tokenId: number | null;
  tokenUri: string | null;
  metadata: AgentMetadata | null;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;

  trustScore: {
    score: number;
    breakdown: {
      volume: ScoreComponent;
      proxy: ScoreComponent;
      uptime: ScoreComponent;
      ozMatch: ScoreComponent;
      ratings: ScoreComponent;
    };
    lastUpdated: string;
  };

  proxy: {
    detected: boolean;
    type: ProxyType;
    implementationAddress: string | null;
  };

  volumes: Record<string, {
    txCount: number;
    volumeAvax: string;
    volumeUsd: string;
  }>;

  uptime: {
    percentage: number;
    totalPings: number;
    successfulPings: number;
    failedPings: number;
    timeoutPings: number;
    averageResponseTimeMs: number;
  };

  ratings: {
    average: number;
    count: number;
    recent: Array<{
      id: string;
      rating: number;
      review: string | null;
      userAddress: string;
      createdAt: string;
    }>;
  };

  tracerScore: {
    total: number;
    tier: string;
    dimensions: {
      trust: number;
      reliability: number;
      autonomy: number;
      capability: number;
      economics: number;
      reputation: number;
    };
    updatedAt: string;
  } | null;
}

/**
 * API response wrapper
 */
interface ApiResponse {
  data?: AgentDetail;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * Fetch agent detail from API
 */
async function fetchAgent(address: string): Promise<AgentDetail> {
  const response = await fetch(`/api/v1/agents/${address}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Failed to fetch agent: ${response.status}`);
  }

  const json: ApiResponse = await response.json();

  if (json.error) {
    throw new Error(json.error.message);
  }

  if (!json.data) {
    throw new Error('No data returned from API');
  }

  return json.data;
}

/**
 * Hook for fetching agent details
 *
 * @param address - Agent contract address
 * @param options - Query options
 * @returns Query result with agent data
 */
export function useAgent(address: string | undefined, options?: {
  enabled?: boolean;
  refetchInterval?: number;
}) {
  return useQuery({
    queryKey: ['agent', address],
    queryFn: () => fetchAgent(address!),
    enabled: !!address && (options?.enabled !== false),
    refetchInterval: options?.refetchInterval,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook for fetching agent trust score only
 *
 * @param address - Agent contract address
 * @returns Query result with trust score data
 */
export function useAgentTrustScore(address: string | undefined) {
  return useQuery({
    queryKey: ['agent-trust-score', address],
    queryFn: async () => {
      const response = await fetch(`/api/v1/agents/${address}/trust-score`);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `Failed to fetch trust score: ${response.status}`);
      }

      const json = await response.json();
      return json.data;
    },
    enabled: !!address,
    staleTime: 60 * 1000, // 1 minute
  });
}
