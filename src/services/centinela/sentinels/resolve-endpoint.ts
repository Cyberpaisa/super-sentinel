import { prisma } from '@/lib/database/prisma';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('resolve-endpoint');

// Domains that are social/docs/non-API — not useful as sentinel scan targets
const NON_API_DOMAINS = ['x.com', 'twitter.com', 'github.com', 'arena.social', 't.me', 'telegram.me', 'reddit.com', 'discord.com', 'discord.gg'];
// Service names that are not scannable HTTP endpoints
const SKIP_SERVICE_NAMES = new Set(['twitter', 'email', 'bot', 'arena', 'agentwallet', 'heartbeat', 'oasf', 'worker']);

function isScannableUrl(url: string): boolean {
  if (!url.startsWith('http')) return false;
  try {
    const host = new URL(url).hostname;
    return !NON_API_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Resolve the HTTP endpoint URL for an agent from its metadata.
 * Searches services[] array (ERC-8004), flat metadata fields, and token_uri.
 * Filters out social media links and non-API domains.
 */
export async function resolveAgentEndpoint(agentAddress: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { address: agentAddress },
    select: { metadata: true, token_uri: true },
  });

  if (!agent) return null;

  if (agent.metadata && typeof agent.metadata === 'object') {
    const meta = agent.metadata as Record<string, unknown>;

    // 1. Check services[] array (ERC-8004 standard)
    const services = meta.services;
    if (Array.isArray(services)) {
      // Priority order: web, A2A, api, MCP — pick first scannable match
      const priorityNames = ['web', 'a2a', 'api', 'mcp'];
      for (const targetName of priorityNames) {
        for (const svc of services) {
          if (
            svc && typeof svc === 'object' &&
            typeof svc.endpoint === 'string' &&
            typeof svc.name === 'string' &&
            svc.name.toLowerCase() === targetName &&
            isScannableUrl(svc.endpoint)
          ) {
            return svc.endpoint;
          }
        }
      }
      // Fallback: any service with a scannable HTTP endpoint
      for (const svc of services) {
        if (
          svc && typeof svc === 'object' &&
          typeof svc.endpoint === 'string' &&
          isScannableUrl(svc.endpoint) &&
          (!svc.name || !SKIP_SERVICE_NAMES.has(String(svc.name).toLowerCase()))
        ) {
          return svc.endpoint;
        }
      }
    }

    // 2. Check flat metadata fields
    for (const key of ['endpoint', 'url', 'service_url', 'external_url']) {
      const value = meta[key];
      if (typeof value === 'string' && isScannableUrl(value)) {
        return value;
      }
    }
  }

  // Fall back to token_uri if it's an HTTP URL (and not a social link)
  if (agent.token_uri && isScannableUrl(agent.token_uri)) {
    return agent.token_uri;
  }

  return null;
}

/**
 * Resolve a specific service endpoint from agent metadata.services array.
 * Looks for { name: serviceName, endpoint: "..." } in the services array.
 */
export async function resolveServiceEndpoint(
  agentAddress: string,
  serviceName: string
): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { address: agentAddress },
    select: { metadata: true },
  });

  if (!agent?.metadata || typeof agent.metadata !== 'object') return null;

  const meta = agent.metadata as Record<string, unknown>;
  const services = meta.services;

  if (!Array.isArray(services)) return null;

  for (const service of services) {
    if (
      service &&
      typeof service === 'object' &&
      'name' in service &&
      'endpoint' in service &&
      typeof service.name === 'string' &&
      typeof service.endpoint === 'string' &&
      service.name.toLowerCase() === serviceName.toLowerCase() &&
      service.endpoint.startsWith('http')
    ) {
      logger.debug({ agentAddress, serviceName, endpoint: service.endpoint }, 'Resolved service endpoint');
      return service.endpoint;
    }
  }

  return null;
}
