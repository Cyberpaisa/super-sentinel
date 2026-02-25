import { type Address } from 'viem';
import { getContractCode, verifyContractExists } from '@/services/blockchain-service';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';

const logger = createLogger('oz-matcher');

/**
 * Confidence level for bytecode matching
 */
export type MatchConfidence = 'high' | 'medium' | 'low';

/**
 * Result of OpenZeppelin bytecode matching
 */
export interface OZMatchResult {
  score: number; // 0-100
  matchedComponents: string[];
  confidence: MatchConfidence;
  details: Record<string, OZComponentMatch>;
}

/**
 * Individual component match result
 */
export interface OZComponentMatch {
  matched: boolean;
  matchedSignatures: string[];
  totalSignatures: number;
  matchPercentage: number;
}

/**
 * OpenZeppelin component signature definition
 */
interface OZComponent {
  name: string;
  // Function selectors (first 4 bytes of keccak256 hash of function signature)
  functionSelectors: string[];
  // Event topic signatures (keccak256 hash of event signature)
  eventTopics?: string[];
  // Weight for scoring (importance of this component)
  weight: number;
}

/**
 * Known OpenZeppelin component signatures
 * Function selectors are the first 4 bytes of keccak256(functionSignature)
 *
 * @see https://github.com/OpenZeppelin/openzeppelin-contracts
 */
const OZ_COMPONENTS: OZComponent[] = [
  {
    name: 'Ownable',
    functionSelectors: [
      '8da5cb5b', // owner()
      '715018a6', // renounceOwnership()
      'f2fde38b', // transferOwnership(address)
    ],
    eventTopics: [
      '8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0', // OwnershipTransferred
    ],
    weight: 1.0,
  },
  {
    name: 'Ownable2Step',
    functionSelectors: [
      '8da5cb5b', // owner()
      '79ba5097', // acceptOwnership()
      'e30c3978', // pendingOwner()
      'f2fde38b', // transferOwnership(address)
    ],
    weight: 1.2,
  },
  {
    name: 'AccessControl',
    functionSelectors: [
      '01ffc9a7', // supportsInterface(bytes4)
      '248a9ca3', // getRoleAdmin(bytes32)
      '2f2ff15d', // grantRole(bytes32,address)
      '91d14854', // hasRole(bytes32,address)
      '36568abe', // renounceRole(bytes32,address)
      'd547741f', // revokeRole(bytes32,address)
    ],
    eventTopics: [
      '2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d', // RoleGranted
      'f6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b', // RoleRevoked
    ],
    weight: 1.5,
  },
  {
    name: 'Pausable',
    functionSelectors: [
      '5c975abb', // paused()
    ],
    eventTopics: [
      '62e78cea01bee320cd4e420270b5ea74000d11b0c9f74754ebdbfc544b05a258', // Paused
      '5db9ee0a495bf2e6ff9c91a7834c1ba4fdd244a5e8aa4e537bd38aeae4b073aa', // Unpaused
    ],
    weight: 1.0,
  },
  {
    name: 'ReentrancyGuard',
    // ReentrancyGuard uses internal modifiers, so we look for the storage pattern
    // and the status check pattern in bytecode
    functionSelectors: [], // No external functions
    weight: 1.3,
  },
  {
    name: 'ERC20',
    functionSelectors: [
      '06fdde03', // name()
      '95d89b41', // symbol()
      '313ce567', // decimals()
      '18160ddd', // totalSupply()
      '70a08231', // balanceOf(address)
      'a9059cbb', // transfer(address,uint256)
      'dd62ed3e', // allowance(address,address)
      '095ea7b3', // approve(address,uint256)
      '23b872dd', // transferFrom(address,address,uint256)
    ],
    eventTopics: [
      'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer
      '8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925', // Approval
    ],
    weight: 1.0,
  },
  {
    name: 'ERC721',
    functionSelectors: [
      '01ffc9a7', // supportsInterface(bytes4)
      '70a08231', // balanceOf(address)
      '6352211e', // ownerOf(uint256)
      '42842e0e', // safeTransferFrom(address,address,uint256)
      'b88d4fde', // safeTransferFrom(address,address,uint256,bytes)
      '23b872dd', // transferFrom(address,address,uint256)
      '095ea7b3', // approve(address,uint256)
      'a22cb465', // setApprovalForAll(address,bool)
      '081812fc', // getApproved(uint256)
      'e985e9c5', // isApprovedForAll(address,address)
    ],
    weight: 1.0,
  },
  {
    name: 'ERC1155',
    functionSelectors: [
      '01ffc9a7', // supportsInterface(bytes4)
      '00fdd58e', // balanceOf(address,uint256)
      '4e1273f4', // balanceOfBatch(address[],uint256[])
      'a22cb465', // setApprovalForAll(address,bool)
      'e985e9c5', // isApprovedForAll(address,address)
      'f242432a', // safeTransferFrom(address,address,uint256,uint256,bytes)
      '2eb2c2d6', // safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)
    ],
    weight: 1.0,
  },
];

/**
 * Extract function selectors from bytecode by parsing the EVM dispatcher.
 * The dispatcher uses PUSH4 (0x63) + 4-byte selector + EQ (0x14) + PUSH/JUMPI patterns.
 * This is far more accurate than substring matching.
 *
 * @param bytecode - Contract bytecode hex string
 * @returns Set of 4-byte selectors found in the dispatcher
 */
function extractDispatcherSelectors(bytecode: string): Set<string> {
  const hex = bytecode.toLowerCase().replace('0x', '');
  const selectors = new Set<string>();
  const bytes = hex.length / 2;

  let i = 0;
  while (i < bytes) {
    const opcode = parseInt(hex.substring(i * 2, i * 2 + 2), 16);

    // Look for PUSH4 (0x63) — this pushes a 4-byte function selector
    if (opcode === 0x63 && i + 5 < bytes) {
      const selector = hex.substring((i + 1) * 2, (i + 5) * 2);

      // Verify this is part of a dispatcher: next instruction after the 4 bytes
      // should be EQ (0x14) within a few instructions (allowing for DUP, PUSH, etc.)
      const lookAhead = Math.min(i + 10, bytes);
      let foundEq = false;
      let j = i + 5;
      while (j < lookAhead) {
        const nextOp = parseInt(hex.substring(j * 2, j * 2 + 2), 16);
        if (nextOp === 0x14) { // EQ
          foundEq = true;
          break;
        }
        // Skip PUSH data
        if (nextOp >= 0x60 && nextOp <= 0x7f) {
          j += 1 + (nextOp - 0x5f);
        } else {
          j += 1;
        }
      }

      if (foundEq) {
        selectors.add(selector);
      }

      i += 5; // Skip past the 4 selector bytes
    } else if (opcode >= 0x60 && opcode <= 0x7f) {
      // Skip PUSH data bytes
      i += 1 + (opcode - 0x5f);
    } else {
      i += 1;
    }
  }

  return selectors;
}

/** Cache for parsed dispatcher selectors per bytecode */
let cachedBytecodeHash = '';
let cachedSelectors = new Set<string>();

/**
 * Check if bytecode contains a specific function selector in its dispatcher.
 * Uses EVM opcode parsing instead of naive substring matching.
 *
 * @param bytecode - Contract bytecode
 * @param selector - 4-byte function selector (without 0x)
 * @returns true if selector found in bytecode dispatcher
 */
function containsSelector(bytecode: string, selector: string): boolean {
  // Cache the parsed selectors for the same bytecode (avoids re-parsing for each check)
  const bytecodeKey = bytecode.slice(0, 64); // Use prefix as cache key
  if (bytecodeKey !== cachedBytecodeHash) {
    cachedBytecodeHash = bytecodeKey;
    cachedSelectors = extractDispatcherSelectors(bytecode);
  }

  return cachedSelectors.has(selector.toLowerCase());
}

/**
 * Check if bytecode contains a specific event topic.
 * Event topics are pushed as 32-byte values using PUSH32 (0x7f).
 *
 * @param bytecode - Contract bytecode
 * @param topic - 32-byte event topic (without 0x)
 * @returns true if topic found as PUSH32 operand in bytecode
 */
function containsEventTopic(bytecode: string, topic: string): boolean {
  const hex = bytecode.toLowerCase().replace('0x', '');
  const normalizedTopic = topic.toLowerCase();
  const bytes = hex.length / 2;

  let i = 0;
  while (i < bytes) {
    const opcode = parseInt(hex.substring(i * 2, i * 2 + 2), 16);

    // PUSH32 (0x7f) — next 32 bytes are the operand
    if (opcode === 0x7f && i + 33 <= bytes) {
      const operand = hex.substring((i + 1) * 2, (i + 33) * 2);
      if (operand === normalizedTopic) {
        return true;
      }
      i += 33;
    } else if (opcode >= 0x60 && opcode <= 0x7f) {
      i += 1 + (opcode - 0x5f);
    } else {
      i += 1;
    }
  }

  return false;
}

/**
 * Check for ReentrancyGuard patterns in bytecode by parsing EVM opcodes.
 * Looks for actual SLOAD (0x54) and SSTORE (0x55) opcodes in instruction positions,
 * not as arbitrary byte values in data.
 *
 * @param bytecode - Contract bytecode
 * @returns true if reentrancy guard pattern detected
 */
function hasReentrancyGuardPattern(bytecode: string): boolean {
  const hex = bytecode.toLowerCase().replace('0x', '');
  const bytes = hex.length / 2;

  let sloadCount = 0;
  let sstoreCount = 0;

  let i = 0;
  while (i < bytes) {
    const opcode = parseInt(hex.substring(i * 2, i * 2 + 2), 16);

    if (opcode === 0x54) sloadCount++;  // SLOAD
    if (opcode === 0x55) sstoreCount++; // SSTORE

    // Skip PUSH data
    if (opcode >= 0x60 && opcode <= 0x7f) {
      i += 1 + (opcode - 0x5f);
    } else {
      i += 1;
    }
  }

  return sloadCount >= 2 && sstoreCount >= 2;
}

/**
 * Match bytecode against a specific OZ component
 *
 * @param bytecode - Contract bytecode
 * @param component - OZ component to match against
 * @returns Component match result
 */
function matchComponent(bytecode: string, component: OZComponent): OZComponentMatch {
  const matchedSignatures: string[] = [];
  let totalSignatures = component.functionSelectors.length;

  // Check function selectors
  for (const selector of component.functionSelectors) {
    if (containsSelector(bytecode, selector)) {
      matchedSignatures.push(`fn:${selector}`);
    }
  }

  // Check event topics if present
  if (component.eventTopics) {
    totalSignatures += component.eventTopics.length;
    for (const topic of component.eventTopics) {
      if (containsEventTopic(bytecode, topic)) {
        matchedSignatures.push(`event:${topic.slice(0, 8)}`);
      }
    }
  }

  // Special case for ReentrancyGuard (no external functions)
  if (component.name === 'ReentrancyGuard') {
    totalSignatures = 1; // We just check for the pattern
    if (hasReentrancyGuardPattern(bytecode)) {
      matchedSignatures.push('pattern:reentrancy');
    }
  }

  const matchPercentage = totalSignatures > 0
    ? (matchedSignatures.length / totalSignatures) * 100
    : 0;

  return {
    matched: matchPercentage >= 50, // Consider matched if 50%+ signatures found
    matchedSignatures,
    totalSignatures,
    matchPercentage,
  };
}

/**
 * Calculate confidence level based on score
 *
 * @param score - Match score (0-100)
 * @returns Confidence level
 */
function calculateConfidence(score: number): MatchConfidence {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

/**
 * Match contract bytecode against known OpenZeppelin patterns
 *
 * @param bytecode - Contract bytecode as hex string
 * @returns Match result with score, matched components, and confidence
 */
export function matchOZBytecode(bytecode: string): OZMatchResult {
  if (!bytecode || bytecode === '0x') {
    return {
      score: 0,
      matchedComponents: [],
      confidence: 'low',
      details: {},
    };
  }

  const details: Record<string, OZComponentMatch> = {};
  const matchedComponents: string[] = [];
  let totalWeight = 0;
  let weightedScore = 0;

  for (const component of OZ_COMPONENTS) {
    const match = matchComponent(bytecode, component);
    details[component.name] = match;

    if (match.matched) {
      matchedComponents.push(component.name);
      weightedScore += match.matchPercentage * component.weight;
      totalWeight += component.weight;
    }
  }

  // Calculate final score
  // Score is based on: how many components matched and how well they matched
  let score = 0;

  if (matchedComponents.length > 0) {
    // Base score from weighted component matches
    const componentScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Bonus for having multiple security components
    const securityBonus = matchedComponents.filter(c =>
      ['Ownable', 'Ownable2Step', 'AccessControl', 'Pausable', 'ReentrancyGuard'].includes(c)
    ).length * 5;

    score = Math.min(100, Math.round(componentScore + securityBonus));
  }

  const confidence = calculateConfidence(score);

  logger.debug({
    bytecodeLength: bytecode.length,
    matchedComponents,
    score,
    confidence,
  }, 'OZ bytecode matching completed');

  return {
    score,
    matchedComponents,
    confidence,
    details,
  };
}

/**
 * Match bytecode for a contract at a given address
 *
 * @param address - Contract address
 * @returns Match result with score, matched components, and confidence
 * @throws {ContractNotFoundError} If no contract exists at address
 * @throws {RPCError} If RPC communication fails
 */
export async function matchOZBytecodeByAddress(address: Address): Promise<OZMatchResult> {
  try {
    logger.info({ address }, 'Starting OZ bytecode matching');

    // Verify contract exists
    const hasCode = await verifyContractExists(address);
    if (!hasCode) {
      throw new ContractNotFoundError(address);
    }

    // Get contract bytecode
    const bytecode = await getContractCode(address);
    if (!bytecode) {
      throw new ContractNotFoundError(address);
    }

    const result = matchOZBytecode(bytecode);

    logger.info({
      address,
      score: result.score,
      matchedComponents: result.matchedComponents,
      confidence: result.confidence,
    }, 'OZ bytecode matching completed');

    return result;
  } catch (error) {
    if (error instanceof ContractNotFoundError || error instanceof RPCError) {
      throw error;
    }

    logger.error({ address, error }, 'OZ bytecode matching failed');
    throw new RPCError(`OZ bytecode matching failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
