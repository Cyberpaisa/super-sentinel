/**
 * Cooldown Monitor — Types
 *
 * CAPA 1 (activa): URI Stability — escucha URIUpdated del contrato ERC-8004 real.
 *   Detecta cambios frecuentes, compara URIs, pre-escanea, genera alertas.
 *
 * CAPA 2 (futura): ERC-8172 Delayed Metadata Update Extension.
 *   Interfaces y ABI listos para cuando el contrato adopte el estándar.
 *   PR: https://github.com/ethereum/ERCs/pull/1561
 */

import type { Address } from 'viem';

// ===========================================================================
// CAPA 1: URI Stability (funciona hoy con ERC-8004)
// ===========================================================================

/**
 * A URI change detected from a URIUpdated event on the ERC-8004 registry.
 */
export interface URIChange {
  /** ERC-8004 agent token ID */
  agentId: bigint;
  /** The new URI set by the agent owner */
  newURI: string;
  /** The previous URI (from history or empty if first known change) */
  previousURI: string;
  /** Block timestamp when the change was detected */
  changedAt: number;
  /** Block number of the event */
  blockNumber: bigint;
  /** Transaction hash */
  txHash: string;
  /** Address that submitted the update */
  updatedBy: Address;
}

/**
 * URI change history for a single agent — used to detect instability.
 */
export interface AgentURIHistory {
  /** ERC-8004 agent ID */
  agentId: bigint;
  /** Chronological list of URI changes (most recent last) */
  changes: URIChange[];
  /** Number of changes in the observation window */
  changeCount: number;
  /** Average interval between changes in seconds (0 if < 2 changes) */
  avgIntervalSec: number;
}

/**
 * Result of pre-scanning a new URI after a change is detected.
 */
export interface PreScanResult {
  /** The new URI that was scanned */
  newURI: string;
  /** Whether the new URI is reachable (HTTP 200) */
  reachable: boolean;
  /** Whether the new URI returns valid ERC-8004 agent registration JSON */
  validSchema: boolean;
  /** Whether key identity fields changed (name, description, image) */
  identityChanged: boolean;
  /** Whether service endpoints changed */
  servicesChanged: boolean;
  /** Whether x402 payment support changed */
  x402Changed: boolean;
  /** Specific fields that differ between old and new registration */
  changedFields: string[];
  /** Risk score 0-100 (higher = more suspicious) */
  riskScore: number;
  /** Human-readable risk reasons */
  riskReasons: string[];
}

/**
 * Alert generated when suspicious URI activity is detected.
 */
export interface CooldownAlert {
  /** Alert severity */
  severity: 'info' | 'warning' | 'critical';
  /** ERC-8004 agent ID */
  agentId: bigint;
  /** Short alert title */
  title: string;
  /** Detailed description */
  description: string;
  /** The URI change that triggered this alert */
  uriChange: URIChange;
  /** Pre-scan result if available */
  preScanResult?: PreScanResult;
  /** ISO timestamp when the alert was generated */
  timestamp: string;
}

// ===========================================================================
// CAPA 2: ERC-8172 Delayed Metadata Update Extension (preparado para futuro)
// PR: https://github.com/ethereum/ERCs/pull/1561
// ===========================================================================

/**
 * On-chain PendingChange struct from ERC-8172.
 * Cooldown is BLOCK-BASED (activationBlock), not time-based.
 */
export interface PendingChange {
  agentId: bigint;
  /** New URI proposed */
  newURI: string;
  /** Old URI at time of proposal */
  oldURI: string;
  /** Block number at which the change becomes applicable */
  activationBlock: bigint;
  /** Whether the change was cancelled by the owner */
  cancelled: boolean;
  /** Whether the change has been applied via applyPendingChange() */
  applied: boolean;
  /** Transaction hash of the proposal */
  txHash: string;
}

// ===========================================================================
// ABI fragments — CAPA 1 (active)
// ===========================================================================

/**
 * URIUpdated event from the current ERC-8004 contract.
 */
export const URI_UPDATED_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
    { indexed: false, internalType: 'string', name: 'newURI', type: 'string' },
    { indexed: true, internalType: 'address', name: 'updatedBy', type: 'address' },
  ],
  name: 'URIUpdated',
  type: 'event',
} as const;

// ===========================================================================
// ABI fragments — CAPA 2 (ERC-8172, reserved for future)
// ===========================================================================

/**
 * ERC-8172 events — exact signatures from the proposal.
 * NOT active until the contract adopts ERC-8172.
 */
export const ERC8172_EVENTS = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'oldURI', type: 'string' },
      { indexed: false, internalType: 'string', name: 'newURI', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'activationBlock', type: 'uint256' },
    ],
    name: 'PendingURIChange',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
    ],
    name: 'PendingURICancelled',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { indexed: false, internalType: 'string', name: 'newURI', type: 'string' },
    ],
    name: 'URIChangedWithoutCooldown',
    type: 'event',
  },
] as const;

/**
 * ERC-8172 functions — exact signatures from the proposal.
 */
export const ERC8172_FUNCTIONS = [
  {
    inputs: [
      { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { internalType: 'string', name: 'newURI', type: 'string' },
    ],
    name: 'setAgentURIWithCooldown',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'applyPendingChange',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'cancelPendingChange',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'pendingChanges',
    outputs: [
      { internalType: 'string', name: 'newURI', type: 'string' },
      { internalType: 'uint256', name: 'activationBlock', type: 'uint256' },
      { internalType: 'bool', name: 'cancelled', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'uriCooldownBlocks',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ===========================================================================
// Configuration
// ===========================================================================

export interface CooldownMonitorConfig {
  /** Polling interval in milliseconds (default: 60_000 = 1min) */
  pollIntervalMs: number;
  /** How many blocks back to look on first run (default: 10000) */
  lookbackBlocks: bigint;
  /** Observation window in seconds for change frequency (default: 86400 = 24h) */
  observationWindowSec: number;
  /** Max URI changes within the window before flagging instability (default: 3) */
  maxChangesInWindow: number;
  /** Risk score threshold for critical alert (default: 70) */
  criticalThreshold: number;
  /** Risk score threshold for warning alert (default: 40) */
  warningThreshold: number;
}

export const DEFAULT_CONFIG: CooldownMonitorConfig = {
  pollIntervalMs: 60_000,
  lookbackBlocks: 10_000n,
  observationWindowSec: 86_400,
  maxChangesInWindow: 3,
  criticalThreshold: 70,
  warningThreshold: 40,
};
