'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { type AgentType, type AgentStatus } from '@prisma/client';

/**
 * Agent data from API
 */
export interface AgentMetadata {
  image?: string;
  x402Support?: boolean;
  active?: boolean;
  supportedTrust?: string[];
  services?: Array<{ name: string; endpoint: string; version?: string }>;
  registrations?: Array<{ agentId: number; agentRegistry: string }>;
  [key: string]: unknown;
}

export interface Agent {
  address: string;
  name: string;
  type: AgentType;
  description: string | null;
  status: AgentStatus;
  trust_score: number;
  tracer_score: number | null;
  tracer_tier: string | null;
  is_proxy: boolean;
  proxy_type: string;
  owner_address: string;
  services: string[];
  metadata: AgentMetadata | null;
  created_at: string;
  updated_at: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * API response structure for agents list
 */
interface AgentsResponse {
  data: Agent[] | null;
  error: {
    message: string;
    code: string;
  } | null;
  meta?: PaginationMeta;
}

/**
 * Filter parameters for agents query
 */
export interface AgentFilters {
  type?: AgentType;
  status?: AgentStatus;
  minTrustScore?: number;
  maxTrustScore?: number;
  service?: string;
  search?: string;
  sortBy?: 'trust_score' | 'created_at' | 'name';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

/**
 * Build query string from filters
 */
function buildQueryString(filters: AgentFilters): string {
  const params = new URLSearchParams();

  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.minTrustScore !== undefined) params.set('minTrustScore', String(filters.minTrustScore));
  if (filters.maxTrustScore !== undefined) params.set('maxTrustScore', String(filters.maxTrustScore));
  if (filters.service) params.set('service', filters.service);
  if (filters.search) params.set('search', filters.search);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  return params.toString();
}

/**
 * Fetch agents from API
 */
async function fetchAgents(filters: AgentFilters): Promise<{ agents: Agent[]; pagination: PaginationMeta }> {
  const queryString = buildQueryString(filters);
  const url = `/api/v1/agents${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  const result: AgentsResponse = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error?.message || 'Failed to fetch agents');
  }

  return {
    agents: result.data || [],
    pagination: result.meta || {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  };
}

/**
 * Hook for fetching agents list with filtering and pagination
 *
 * Features:
 * - Dynamic query key based on filters
 * - 5 minute stale time (from QueryClient defaults)
 * - Auto-refetch every 60 seconds
 * - Keeps previous data during pagination for smooth UX
 *
 * @param filters - Filter and pagination parameters
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useAgents({
 *   type: 'TRADING',
 *   minTrustScore: 50,
 *   page: 1,
 *   limit: 20,
 * });
 *
 * if (isLoading) return <Skeleton />;
 * if (error) return <Error message={error.message} />;
 *
 * return <AgentTable agents={data.agents} pagination={data.pagination} />;
 * ```
 */
export function useAgents(filters: AgentFilters = {}) {
  return useQuery({
    queryKey: ['agents', filters],
    queryFn: () => fetchAgents(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}

/**
 * Type for the query result
 */
export type UseAgentsResult = ReturnType<typeof useAgents>;
