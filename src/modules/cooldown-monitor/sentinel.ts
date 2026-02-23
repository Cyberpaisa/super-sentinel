/**
 * Cooldown Monitor — TRACER Sentinel Integration (CAPA 1)
 *
 * Exposes the cooldown monitor as a SentinelResult that feeds the Trust
 * dimension of TRACER. Can be called at scan-time by the orchestrator.
 *
 * Scoring:
 *   100 — No URI changes detected (stable)
 *    80 — 1 change, low risk (≤20)
 *    60 — 2 changes or medium risk (21-40)
 *    40 — 3+ changes or high risk (41-70)
 *    20 — Critical risk (>70) or unreachable new URI
 *     0 — Agent not found or error
 *
 * Pass threshold: score >= 50 (consistent with all other sentinels)
 */

import { type SentinelResult } from '@/sentinels/types';
import { createLogger } from '@/lib/utils/logger';
import { CooldownEventListener } from './event-listener';
import { preScanURIChange } from './pre-scanner';
import { evaluateChange } from './alerts';
import type { CooldownAlert } from './types';

const logger = createLogger('cooldown:sentinel');

export interface URIStabilityData {
  /** Number of URI changes in the observation window */
  changeCount: number;
  /** Average interval between changes in seconds */
  avgIntervalSec: number;
  /** Most recent URI (or empty) */
  latestURI: string;
  /** Risk score from pre-scan of latest change (0 if no changes) */
  latestRiskScore: number;
  /** Alert generated (null if no alert) */
  alert: CooldownAlert | null;
}

/**
 * Run the URI stability sentinel for a given agent.
 *
 * Requires a running CooldownEventListener instance that has been collecting
 * URIUpdated events. If no listener is provided, creates a lightweight check
 * using the agent's current URI only.
 */
export async function checkURIStability(
  agentId: bigint,
  listener: CooldownEventListener
): Promise<SentinelResult> {
  try {
    const history = listener.getAgentHistory(agentId);
    const latestChange = listener.getLatestChange(agentId);

    // No changes detected — fully stable
    if (history.changeCount === 0) {
      return {
        sentinel: 'uri-stability',
        passed: true,
        score: 100,
        data: {
          changeCount: 0,
          avgIntervalSec: 0,
          latestURI: '',
          latestRiskScore: 0,
          alert: null,
        } satisfies URIStabilityData,
      };
    }

    // Pre-scan the latest change
    let riskScore = 0;
    let alert: CooldownAlert | null = null;

    if (latestChange) {
      const preScan = await preScanURIChange(latestChange);
      riskScore = preScan.riskScore;
      alert = evaluateChange(latestChange, preScan, history);
    }

    // Calculate score based on change count + risk
    const score = calculateScore(history.changeCount, riskScore);

    const data: URIStabilityData = {
      changeCount: history.changeCount,
      avgIntervalSec: history.avgIntervalSec,
      latestURI: latestChange?.newURI ?? '',
      latestRiskScore: riskScore,
      alert,
    };

    logger.info(
      { agentId: agentId.toString(), score, changeCount: history.changeCount, riskScore },
      'URI stability sentinel complete'
    );

    return {
      sentinel: 'uri-stability',
      passed: score >= 50,
      score,
      data,
    };
  } catch (error) {
    logger.error({ error, agentId: agentId.toString() }, 'URI stability sentinel failed');
    return {
      sentinel: 'uri-stability',
      passed: false,
      score: 0,
      data: {
        changeCount: 0,
        avgIntervalSec: 0,
        latestURI: '',
        latestRiskScore: 0,
        alert: null,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function calculateScore(changeCount: number, riskScore: number): number {
  // Critical risk → 20
  if (riskScore > 70) return 20;

  // High risk or 3+ changes → 40
  if (riskScore > 40 || changeCount >= 3) return 40;

  // Medium: 2 changes or moderate risk → 60
  if (changeCount === 2 || riskScore > 20) return 60;

  // Low: 1 change, low risk → 80
  if (changeCount === 1) return 80;

  // No changes → 100 (shouldn't reach here, handled above)
  return 100;
}
