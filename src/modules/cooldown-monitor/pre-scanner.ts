/**
 * Cooldown Monitor — Pre-Scanner (CAPA 1)
 *
 * Fetches and compares old vs new agent registration JSON when a URI changes.
 * Calculates a risk score based on what fields changed and how suspicious
 * the change pattern is.
 */

import { createLogger } from '@/lib/utils/logger';
import type { URIChange, PreScanResult } from './types';

const logger = createLogger('cooldown:pre-scanner');

const FETCH_TIMEOUT_MS = 10_000;

/** Fields that affect agent identity — changes here are high-risk */
const IDENTITY_FIELDS = ['name', 'description', 'image'] as const;
/** Fields that affect service endpoints — changes here are medium-risk */
const SERVICE_FIELDS = ['services'] as const;
/** Fields that affect payment — changes here are high-risk */
const PAYMENT_FIELDS = ['x402Support'] as const;

/**
 * Fetch a registration JSON from a URI.
 * Returns null if unreachable or invalid JSON.
 */
async function fetchRegistration(uri: string): Promise<Record<string, any> | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(uri, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);

    if (!response.ok) return null;

    const text = await response.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Validate that a JSON object looks like an ERC-8004 registration.
 */
function isValidRegistration(data: Record<string, any>): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.type === 'string' &&
    data.type.includes('8004') &&
    typeof data.name === 'string'
  );
}

/**
 * Compare two registration objects and return changed fields.
 */
function diffRegistrations(
  oldReg: Record<string, any>,
  newReg: Record<string, any>
): string[] {
  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(oldReg), ...Object.keys(newReg)]);

  for (const key of allKeys) {
    const oldVal = JSON.stringify(oldReg[key] ?? null);
    const newVal = JSON.stringify(newReg[key] ?? null);
    if (oldVal !== newVal) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

/**
 * Calculate risk score based on what changed.
 *
 * Risk factors:
 *  - New URI unreachable:         +40
 *  - Invalid schema:              +30
 *  - Identity fields changed:     +15 each (name, description, image)
 *  - Services changed:            +20
 *  - x402 support changed:        +25
 *  - Active field set to false:   +30
 */
function calculateRisk(
  reachable: boolean,
  validSchema: boolean,
  oldReg: Record<string, any> | null,
  newReg: Record<string, any> | null,
  changedFields: string[]
): { riskScore: number; riskReasons: string[] } {
  let risk = 0;
  const reasons: string[] = [];

  if (!reachable) {
    risk += 40;
    reasons.push('New URI is unreachable');
  }

  if (reachable && !validSchema) {
    risk += 30;
    reasons.push('New URI does not return valid ERC-8004 registration JSON');
  }

  for (const field of IDENTITY_FIELDS) {
    if (changedFields.includes(field)) {
      risk += 15;
      reasons.push(`Identity field "${field}" changed`);
    }
  }

  if (changedFields.includes('services')) {
    risk += 20;
    reasons.push('Service endpoints changed');
  }

  if (changedFields.includes('x402Support')) {
    risk += 25;
    reasons.push('x402 payment support changed');
  }

  if (newReg && newReg.active === false) {
    risk += 30;
    reasons.push('Agent marked as inactive in new registration');
  }

  return { riskScore: Math.min(100, risk), riskReasons: reasons };
}

/**
 * Pre-scan a URI change by fetching old and new registration JSON,
 * comparing them, and calculating a risk score.
 */
export async function preScanURIChange(change: URIChange): Promise<PreScanResult> {
  logger.info(
    { agentId: change.agentId.toString(), newURI: change.newURI },
    'Pre-scanning URI change'
  );

  // Fetch new registration
  const newReg = await fetchRegistration(change.newURI);
  const reachable = newReg !== null;
  const validSchema = newReg ? isValidRegistration(newReg) : false;

  // Fetch old registration (if we have the previous URI)
  let oldReg: Record<string, any> | null = null;
  if (change.previousURI) {
    oldReg = await fetchRegistration(change.previousURI);
  }

  // Diff
  const changedFields = oldReg && newReg ? diffRegistrations(oldReg, newReg) : [];

  const identityChanged = IDENTITY_FIELDS.some((f) => changedFields.includes(f));
  const servicesChanged = changedFields.includes('services');
  const x402Changed = changedFields.includes('x402Support');

  const { riskScore, riskReasons } = calculateRisk(
    reachable,
    validSchema,
    oldReg,
    newReg,
    changedFields
  );

  // If no old URI to compare, note it
  if (!change.previousURI && reachable) {
    riskReasons.push('No previous URI available for comparison (first known change)');
  }

  const result: PreScanResult = {
    newURI: change.newURI,
    reachable,
    validSchema,
    identityChanged,
    servicesChanged,
    x402Changed,
    changedFields,
    riskScore,
    riskReasons,
  };

  logger.info(
    { agentId: change.agentId.toString(), riskScore, changedFields },
    'Pre-scan complete'
  );

  return result;
}
