import { createLogger } from '@/lib/utils/logger';
import { type SentinelResult } from '../types';

const logger = createLogger('sentinel:a2a');

const DEFAULT_TIMEOUT_MS = 10_000;

const KNOWN_CAPABILITIES = ['delegation', 'tool-use', 'multi-step', 'streaming', 'push-notifications'];

export interface A2AData {
  cardFound: boolean;
  name: string | null;
  capabilities: string[];
  skills: string[];
  schemaValid: boolean;
  errorMessage?: string;
}

/**
 * A2A sentinel — fetches /.well-known/agent-card.json and validates the schema.
 *
 * Pure function: receives a base URL endpoint, returns SentinelResult.
 *
 * Score tiers:
 *  - Card found + valid schema (name, capabilities, skills, endpoint) → 80 base
 *  - +5 per known capability found (max 100)
 *  - Card found but schema incomplete → 40 (fail, below threshold)
 *  - Card not found or error → 0
 *  - passed = score >= 50 (consistent with other sentinels)
 *
 * Validation rules:
 *  - name: non-empty string
 *  - capabilities: non-null object with >=1 key, or array with >=1 element
 *  - skills: array with >=1 element
 *  - endpoint/url: non-empty string
 */
export async function checkA2A(
  endpoint: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<SentinelResult> {
  let cardUrl: string;
  try {
    const url = new URL(endpoint);
    cardUrl = `${url.origin}/.well-known/agent-card.json`;
  } catch {
    return {
      sentinel: 'a2a',
      passed: false,
      score: 0,
      data: {
        cardFound: false,
        name: null,
        capabilities: [],
        skills: [],
        schemaValid: false,
        errorMessage: 'Invalid endpoint URL',
      },
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(cardUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.info({ endpoint, status: response.status }, 'Agent card not found');
      return {
        sentinel: 'a2a',
        passed: false,
        score: 0,
        data: {
          cardFound: false,
          name: null,
          capabilities: [],
          skills: [],
          schemaValid: false,
        },
      };
    }

    let card: Record<string, unknown>;
    try {
      card = (await response.json()) as Record<string, unknown>;
    } catch {
      logger.warn({ endpoint }, 'Agent card is not valid JSON');
      return {
        sentinel: 'a2a',
        passed: false,
        score: 0,
        data: {
          cardFound: true,
          name: null,
          capabilities: [],
          skills: [],
          schemaValid: false,
          errorMessage: 'Agent card is not valid JSON',
        },
      };
    }

    // Validate required schema fields with type checks, not just key existence
    const name = typeof card.name === 'string' && card.name.length > 0 ? card.name : null;

    // capabilities: must be a non-null object with >=1 key, or an array with >=1 element
    const capVal = card.capabilities;
    const hasCapabilities =
      capVal != null &&
      typeof capVal === 'object' &&
      (Array.isArray(capVal) ? capVal.length > 0 : Object.keys(capVal).length > 0);

    // skills: must be an array with at least one element
    const hasSkills = Array.isArray(card.skills) && card.skills.length > 0;

    // endpoint or url: must be a non-empty string
    const endpointVal = card.endpoint ?? card.url;
    const hasEndpoint = typeof endpointVal === 'string' && endpointVal.length > 0;

    const schemaValid = name !== null && hasCapabilities && hasSkills && hasEndpoint;

    // Extract known capabilities
    const capabilities: string[] = [];
    if (card.capabilities && typeof card.capabilities === 'object') {
      if (Array.isArray(card.capabilities)) {
        for (const cap of card.capabilities) {
          if (typeof cap === 'string' && KNOWN_CAPABILITIES.includes(cap) && !capabilities.includes(cap)) {
            capabilities.push(cap);
          }
        }
      } else {
        const caps = card.capabilities as Record<string, unknown>;
        for (const cap of KNOWN_CAPABILITIES) {
          if (caps[cap] === true) {
            capabilities.push(cap);
          }
        }
      }
    }

    // Extract skills
    const skills: string[] = [];
    if (Array.isArray(card.skills)) {
      for (const skill of card.skills) {
        if (skill && typeof skill === 'object' && 'name' in skill && typeof skill.name === 'string') {
          skills.push(skill.name);
        } else if (typeof skill === 'string') {
          skills.push(skill);
        }
      }
    }

    // Score: base 80 for valid card + schema, +5 per known capability (max 100)
    let score: number;
    if (schemaValid) {
      score = Math.min(100, 80 + capabilities.length * 5);
    } else {
      score = 40; // Card found but schema incomplete
    }

    logger.info({ endpoint, score, name, capabilities, skills, schemaValid }, 'A2A check completed');

    return {
      sentinel: 'a2a',
      passed: score >= 50,
      score,
      data: {
        cardFound: true,
        name,
        capabilities,
        skills,
        schemaValid,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    const errorMessage = isTimeout
      ? `Timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown error';

    logger.warn({ endpoint, error: errorMessage }, 'A2A check failed');

    return {
      sentinel: 'a2a',
      passed: false,
      score: 0,
      data: {
        cardFound: false,
        name: null,
        capabilities: [],
        skills: [],
        schemaValid: false,
        errorMessage,
      },
    };
  }
}
