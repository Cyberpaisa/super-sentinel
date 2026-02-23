/**
 * Cooldown Monitor — Alert Generator (CAPA 1)
 *
 * Evaluates URI changes + pre-scan results and produces CooldownAlert objects.
 * Uses configurable thresholds for warning vs critical severity.
 */

import { createLogger } from '@/lib/utils/logger';
import type {
  URIChange,
  PreScanResult,
  AgentURIHistory,
  CooldownAlert,
  CooldownMonitorConfig,
} from './types';
import { DEFAULT_CONFIG } from './types';

const logger = createLogger('cooldown:alerts');

/**
 * Generate an alert from a URI change and its pre-scan result.
 * Returns null if the change is benign (risk below warning threshold).
 */
export function evaluateChange(
  change: URIChange,
  preScan: PreScanResult,
  history: AgentURIHistory,
  config: Partial<CooldownMonitorConfig> = {}
): CooldownAlert | null {
  const { criticalThreshold, warningThreshold, maxChangesInWindow } = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  let severity: CooldownAlert['severity'] = 'info';
  const reasons: string[] = [];

  // --- Risk score from pre-scan ---
  if (preScan.riskScore >= criticalThreshold) {
    severity = 'critical';
    reasons.push(`Pre-scan risk score ${preScan.riskScore}/100 exceeds critical threshold`);
  } else if (preScan.riskScore >= warningThreshold) {
    severity = 'warning';
    reasons.push(`Pre-scan risk score ${preScan.riskScore}/100 exceeds warning threshold`);
  }

  // --- Frequency analysis ---
  if (history.changeCount >= maxChangesInWindow) {
    // Frequency alone bumps to at least warning
    if (severity === 'info') severity = 'warning';
    reasons.push(
      `${history.changeCount} URI changes in observation window (max: ${maxChangesInWindow})`
    );
  }

  // Rapid-fire changes (avg interval < 1 hour) → critical
  if (history.avgIntervalSec > 0 && history.avgIntervalSec < 3600) {
    severity = 'critical';
    reasons.push(
      `Average interval between changes is ${history.avgIntervalSec}s (< 1 hour)`
    );
  }

  // --- Unreachable new URI is always at least warning ---
  if (!preScan.reachable && severity === 'info') {
    severity = 'warning';
    reasons.push('New URI is unreachable');
  }

  // No alert if everything is fine
  if (severity === 'info' && reasons.length === 0) {
    return null;
  }

  const title = severity === 'critical'
    ? `CRITICAL: Suspicious URI change for agent ${change.agentId}`
    : severity === 'warning'
      ? `WARNING: URI instability detected for agent ${change.agentId}`
      : `INFO: URI changed for agent ${change.agentId}`;

  const description = [
    `Agent ${change.agentId} changed URI from "${change.previousURI || '(unknown)'}" to "${change.newURI}".`,
    ...reasons,
    ...preScan.riskReasons.map((r) => `  - ${r}`),
  ].join('\n');

  const alert: CooldownAlert = {
    severity,
    agentId: change.agentId,
    title,
    description,
    uriChange: change,
    preScanResult: preScan,
    timestamp: new Date().toISOString(),
  };

  logger.info(
    { agentId: change.agentId.toString(), severity, riskScore: preScan.riskScore },
    'Alert generated'
  );

  return alert;
}

/**
 * Batch evaluate: given a list of recent changes with their pre-scans,
 * generate all applicable alerts.
 */
export function evaluateAll(
  entries: Array<{
    change: URIChange;
    preScan: PreScanResult;
    history: AgentURIHistory;
  }>,
  config?: Partial<CooldownMonitorConfig>
): CooldownAlert[] {
  const alerts: CooldownAlert[] = [];
  for (const entry of entries) {
    const alert = evaluateChange(entry.change, entry.preScan, entry.history, config);
    if (alert) alerts.push(alert);
  }
  return alerts;
}
