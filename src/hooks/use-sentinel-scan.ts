import { useMutation } from '@tanstack/react-query';
import type { OrchestratorResult } from '@/sentinels/types';
import type { TRACERScore } from '@/sentinels/scoring/types';

/**
 * Shape of the sentinel scan API response payload.
 */
export interface SentinelScanResult {
  address: string;
  endpoint: string | null;
  orchestrator: OrchestratorResult;
  tracer: TRACERScore;
}

/**
 * API response wrapper (matches successResponse shape).
 */
interface ApiResponse {
  data?: SentinelScanResult;
  error?: {
    message: string;
    code: string;
  };
}

/**
 * POST to the sentinel scan endpoint and return the parsed result.
 */
async function scanAgent(address: string): Promise<SentinelScanResult> {
  const response = await fetch('/api/v1/sentinel/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Sentinel scan failed: ${response.status}`);
  }

  const json: ApiResponse = await response.json();

  if (json.error) {
    throw new Error(json.error.message);
  }

  if (!json.data) {
    throw new Error('No data returned from sentinel scan');
  }

  return json.data;
}

/**
 * Hook for running an on-demand sentinel scan against an agent.
 *
 * @returns scan result, loading state, error, and trigger function
 */
export function useSentinelScan() {
  const mutation = useMutation({
    mutationFn: scanAgent,
  });

  return {
    /** The scan result (orchestrator + TRACER score) */
    scan: mutation.data,
    /** Whether a scan is currently in progress */
    isScanning: mutation.isPending,
    /** Error from the last scan attempt */
    error: mutation.error,
    /** Trigger a scan for the given address */
    runScan: mutation.mutate,
  };
}
