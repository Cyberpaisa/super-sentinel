import { prisma } from '@/lib/database/prisma';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('resolve-endpoint');

/**
 * Resolve the HTTP endpoint URL for an agent from its metadata.
 * Looks for common fields: endpoint, url, service_url, external_url.
 * Falls back to token_uri if it's an HTTP URL.
 */
export async function resolveAgentEndpoint(agentAddress: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { address: agentAddress },
    select: { metadata: true, token_uri: true },
  });

  if (!agent) return null;

  // Try metadata fields first
  if (agent.metadata && typeof agent.metadata === 'object') {
    const meta = agent.metadata as Record<string, unknown>;
    for (const key of ['endpoint', 'url', 'service_url', 'external_url']) {
      const value = meta[key];
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }
    }
  }

  // Fall back to token_uri if it's an HTTP URL
  if (agent.token_uri && agent.token_uri.startsWith('http')) {
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
