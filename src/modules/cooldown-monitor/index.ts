/**
 * Cooldown Monitor Module
 *
 * CAPA 1 (activa): URI Stability sentinel using URIUpdated events from ERC-8004.
 * CAPA 2 (futura): ERC-8172 Delayed Metadata Update Extension support.
 *
 * Usage:
 *   import { CooldownEventListener, checkURIStability } from '@/modules/cooldown-monitor';
 *
 *   const listener = new CooldownEventListener();
 *   await listener.start();
 *
 *   // At scan time:
 *   const result = await checkURIStability(agentId, listener);
 *   // result is a SentinelResult that feeds TRACER Trust dimension
 */

// Core listener
export { CooldownEventListener } from './event-listener';

// Pre-scanner
export { preScanURIChange } from './pre-scanner';

// Alert generator
export { evaluateChange, evaluateAll } from './alerts';

// TRACER sentinel integration
export { checkURIStability, type URIStabilityData } from './sentinel';

// Types
export type {
  // Capa 1 (active)
  URIChange,
  AgentURIHistory,
  PreScanResult,
  CooldownAlert,
  CooldownMonitorConfig,
  // Capa 2 (future ERC-8172)
  PendingChange,
} from './types';

export {
  DEFAULT_CONFIG,
  URI_UPDATED_EVENT,
  // ERC-8172 ABIs (reserved for future)
  ERC8172_EVENTS,
  ERC8172_FUNCTIONS,
} from './types';
