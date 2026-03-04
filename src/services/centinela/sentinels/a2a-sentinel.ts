import { createLogger } from '@/lib/utils/logger';
import { resolveAgentEndpoint } from './resolve-endpoint';

const logger = createLogger('a2a-sentinel');

const A2A_TIMEOUT_MS = 10_000;

const KNOWN_CAPABILITIES = ['delegation', 'tool-use', 'multi-step', 'streaming', 'push-notifications'];

export interface A2AResult {
  passed: boolean;
  score: number;
  cardFound: boolean;
  name: string | null;
  capabilities: string[];
  skills: string[];
  schemaValid: boolean;
}

/**
 * Validate an A2A agent card from /.well-known/agent-card.json.
 * Checks JSON schema validity and scores based on declared capabilities.
 */
export async function checkA2A(agentAddress: string): Promise<A2AResult> {
  const endpoint = await resolveAgentEndpoint(agentAddress);

  if (!endpoint) {
    return {
      passed: false,
      score: 0,
      cardFound: false,
      name: null,
      capabilities: [],
      skills: [],
      schemaValid: false,
    };
  }

  let cardUrl: string;
  try {
    const url = new URL(endpoint);
    cardUrl = `${url.origin}/.well-known/agent-card.json`;
  } catch {
    return {
      passed: false,
      score: 0,
      cardFound: false,
      name: null,
      capabilities: [],
      skills: [],
      schemaValid: false,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), A2A_TIMEOUT_MS);

  try {
    const response = await fetch(cardUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.info({ agentAddress, status: response.status }, 'Agent card not found');
      return {
        passed: false,
        score: 0,
        cardFound: false,
        name: null,
        capabilities: [],
        skills: [],
        schemaValid: false,
      };
    }

    let card: Record<string, unknown>;
    try {
      card = (await response.json()) as Record<string, unknown>;
    } catch {
      logger.warn({ agentAddress }, 'Agent card is not valid JSON');
      return {
        passed: false,
        score: 10,
        cardFound: true,
        name: null,
        capabilities: [],
        skills: [],
        schemaValid: false,
      };
    }

    // Validate required schema fields
    const name = typeof card.name === 'string' ? card.name : null;
    const hasCapabilities = 'capabilities' in card;
    const hasSkills = 'skills' in card;
    const hasEndpoint = 'endpoint' in card || 'url' in card;
    const schemaValid = name !== null && hasCapabilities && hasSkills && hasEndpoint;

    // Extract capabilities
    const capabilities: string[] = [];
    if (card.capabilities && typeof card.capabilities === 'object') {
      const caps = card.capabilities as Record<string, unknown>;
      for (const cap of KNOWN_CAPABILITIES) {
        if (caps[cap] === true || (Array.isArray(card.capabilities) && (card.capabilities as string[]).includes(cap))) {
          capabilities.push(cap);
        }
      }
    }
    if (Array.isArray(card.capabilities)) {
      for (const cap of card.capabilities) {
        if (typeof cap === 'string' && KNOWN_CAPABILITIES.includes(cap) && !capabilities.includes(cap)) {
          capabilities.push(cap);
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
    let score = 0;
    if (schemaValid) {
      score = 80 + Math.min(20, capabilities.length * 5);
    } else {
      score = 40; // Card found but schema incomplete
    }

    logger.info({ agentAddress, score, name, capabilities, skills, schemaValid }, 'A2A check completed');

    return {
      passed: score >= 40,
      score,
      cardFound: true,
      name,
      capabilities,
      skills,
      schemaValid,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    logger.error({ agentAddress, error: isTimeout ? 'timeout' : (error instanceof Error ? error.message : 'unknown') }, 'A2A check failed');

    return {
      passed: false,
      score: 0,
      cardFound: false,
      name: null,
      capabilities: [],
      skills: [],
      schemaValid: false,
    };
  }
}
