const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });
const prisma = new PrismaClient();

const NON_API_DOMAINS = ['x.com', 'twitter.com', 'github.com', 'arena.social', 't.me', 'telegram.me', 'reddit.com', 'discord.com', 'discord.gg'];
const SKIP_SERVICE_NAMES = new Set(['twitter', 'email', 'bot', 'arena', 'agentwallet', 'heartbeat', 'oasf', 'worker']);

function isScannableUrl(url) {
  if (!url.startsWith('http')) return false;
  try {
    const host = new URL(url).hostname;
    return !NON_API_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

function resolveEndpoint(agent) {
  if (agent.metadata && typeof agent.metadata === 'object') {
    const meta = agent.metadata;
    const services = meta.services;
    if (Array.isArray(services)) {
      const priorityNames = ['web', 'a2a', 'api', 'mcp'];
      for (const targetName of priorityNames) {
        for (const svc of services) {
          if (svc && typeof svc === 'object' && typeof svc.endpoint === 'string' &&
              typeof svc.name === 'string' && svc.name.toLowerCase() === targetName &&
              isScannableUrl(svc.endpoint)) {
            return svc.endpoint;
          }
        }
      }
      for (const svc of services) {
        if (svc && typeof svc === 'object' && typeof svc.endpoint === 'string' &&
            isScannableUrl(svc.endpoint) &&
            (!svc.name || !SKIP_SERVICE_NAMES.has(String(svc.name).toLowerCase()))) {
          return svc.endpoint;
        }
      }
    }
    for (const key of ['endpoint', 'url', 'service_url', 'external_url']) {
      const value = meta[key];
      if (typeof value === 'string' && isScannableUrl(value)) return value;
    }
  }
  if (agent.token_uri && isScannableUrl(agent.token_uri)) return agent.token_uri;
  return null;
}

async function check() {
  const agents = await prisma.agent.findMany({
    where: { metadata: { not: null } },
    select: { name: true, token_id: true, metadata: true, token_uri: true },
    take: 30,
    orderBy: { token_id: 'desc' },
  });

  let resolved = 0;
  for (const a of agents) {
    const ep = resolveEndpoint(a);
    const marker = ep ? 'OK' : 'MISS';
    console.log(`[${marker}] #${a.token_id} ${a.name} -> ${ep || '(none)'}`);
    if (ep) resolved++;
  }
  console.log(`\nResolved: ${resolved}/${agents.length}`);
}
check().finally(() => prisma.$disconnect());
