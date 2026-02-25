import { type Address, type Hex } from 'viem';
import { publicClient } from '@/lib/blockchain/client';
import { getContractCode, verifyContractExists } from '@/services/blockchain-service';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';
import { createLogger } from '@/lib/utils/logger';
import { type ProxyType } from '@prisma/client';

const logger = createLogger('proxy-detector');

/**
 * EIP-1967 standardized storage slots for proxy patterns
 * @see https://eips.ethereum.org/EIPS/eip-1967
 */
const EIP1967_SLOTS = {
  // bytes32(uint256(keccak256('eip1967.proxy.implementation')) - 1)
  IMPLEMENTATION: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex,
  // bytes32(uint256(keccak256('eip1967.proxy.beacon')) - 1)
  BEACON: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50' as Hex,
  // bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
  ADMIN: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103' as Hex,
};

/**
 * Result of proxy detection
 */
export interface ProxyDetectionResult {
  isProxy: boolean;
  proxyType: ProxyType;
  implementationAddress?: Address;
  beaconAddress?: Address;
  adminAddress?: Address;
}

/**
 * Read a storage slot from a contract
 *
 * @param address - Contract address
 * @param slot - Storage slot to read
 * @returns Value stored at the slot as Hex
 */
async function readStorageSlot(address: Address, slot: Hex): Promise<Hex> {
  try {
    const value = await publicClient.getStorageAt({
      address,
      slot,
    });
    return value ?? '0x0000000000000000000000000000000000000000000000000000000000000000';
  } catch (error) {
    logger.error({ address, slot, error }, 'Failed to read storage slot');
    throw new RPCError(`Failed to read storage slot: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract address from storage slot value (last 20 bytes)
 *
 * @param slotValue - 32-byte storage slot value
 * @returns Extracted address or null if zero address
 */
function extractAddressFromSlot(slotValue: Hex): Address | null {
  // Storage slots are 32 bytes, address is in the last 20 bytes
  // Check if the slot contains a valid non-zero address
  const addressHex = `0x${slotValue.slice(-40)}` as Address;

  // Check if it's the zero address
  if (addressHex === '0x0000000000000000000000000000000000000000') {
    return null;
  }

  return addressHex;
}

/**
 * Check for delegatecall patterns in bytecode by parsing EVM opcodes.
 * Instead of naive substring matching (which gives false positives),
 * we walk the bytecode instruction-by-instruction and look for the
 * actual DELEGATECALL opcode (0xF4) in an opcode position.
 *
 * @param bytecode - Contract bytecode as hex string
 * @returns true if a real DELEGATECALL opcode is found
 */
function hasDelegatecallPattern(bytecode: string): boolean {
  if (!bytecode || bytecode === '0x') {
    return false;
  }

  const hex = bytecode.toLowerCase().replace('0x', '');
  const bytes = hex.length / 2;

  // Walk bytecode as EVM instructions
  let i = 0;
  while (i < bytes) {
    const opcode = parseInt(hex.substring(i * 2, i * 2 + 2), 16);

    // 0xF4 = DELEGATECALL opcode
    if (opcode === 0xf4) {
      return true;
    }

    // PUSH1 (0x60) through PUSH32 (0x7f) — skip the immediate data bytes
    if (opcode >= 0x60 && opcode <= 0x7f) {
      const pushSize = opcode - 0x5f; // PUSH1=1 byte, PUSH2=2 bytes, ...
      i += 1 + pushSize;
    } else {
      i += 1;
    }
  }

  return false;
}

/**
 * Detect if a contract uses a proxy pattern and identify the type
 *
 * @param address - Contract address to check
 * @returns Proxy detection result with type and implementation address
 * @throws {ContractNotFoundError} If no contract exists at address
 * @throws {RPCError} If RPC communication fails
 */
export async function detectProxy(address: Address): Promise<ProxyDetectionResult> {
  try {
    logger.info({ address }, 'Starting proxy detection');

    // Verify contract exists
    const hasCode = await verifyContractExists(address);
    if (!hasCode) {
      throw new ContractNotFoundError(address);
    }

    // Read all EIP-1967 slots in parallel
    const [implementationSlot, beaconSlot, adminSlot] = await Promise.all([
      readStorageSlot(address, EIP1967_SLOTS.IMPLEMENTATION),
      readStorageSlot(address, EIP1967_SLOTS.BEACON),
      readStorageSlot(address, EIP1967_SLOTS.ADMIN),
    ]);

    // Extract addresses from slots
    const implementationAddress = extractAddressFromSlot(implementationSlot);
    const beaconAddress = extractAddressFromSlot(beaconSlot);
    const adminAddress = extractAddressFromSlot(adminSlot);

    logger.debug({
      address,
      implementationAddress,
      beaconAddress,
      adminAddress,
    }, 'Read EIP-1967 storage slots');

    // Determine proxy type based on slots
    let proxyType: ProxyType = 'NONE';
    let isProxy = false;

    if (beaconAddress) {
      // Beacon proxy - implementation is fetched from the beacon contract
      proxyType = 'BEACON';
      isProxy = true;
      logger.info({ address, beaconAddress }, 'Detected Beacon proxy');
    } else if (implementationAddress && adminAddress) {
      // Transparent proxy - has both implementation and admin slots
      proxyType = 'TRANSPARENT';
      isProxy = true;
      logger.info({ address, implementationAddress, adminAddress }, 'Detected Transparent proxy');
    } else if (implementationAddress) {
      // UUPS proxy - only implementation slot (admin is on implementation)
      proxyType = 'UUPS';
      isProxy = true;
      logger.info({ address, implementationAddress }, 'Detected UUPS proxy');
    } else {
      // Check bytecode for delegatecall patterns as fallback
      const bytecode = await getContractCode(address);
      if (bytecode && hasDelegatecallPattern(bytecode)) {
        // Potential custom proxy with delegatecall
        proxyType = 'CUSTOM';
        isProxy = true;
        logger.info({ address }, 'Detected potential custom proxy (delegatecall pattern)');
      } else {
        logger.info({ address }, 'No proxy pattern detected');
      }
    }

    const result: ProxyDetectionResult = {
      isProxy,
      proxyType,
      ...(implementationAddress && { implementationAddress }),
      ...(beaconAddress && { beaconAddress }),
      ...(adminAddress && { adminAddress }),
    };

    logger.info({ address, result }, 'Proxy detection completed');
    return result;
  } catch (error) {
    if (error instanceof ContractNotFoundError || error instanceof RPCError) {
      throw error;
    }

    logger.error({ address, error }, 'Proxy detection failed');
    throw new RPCError(`Proxy detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get the actual implementation address for a proxy contract
 * For beacon proxies, this fetches the implementation from the beacon
 *
 * @param address - Proxy contract address
 * @returns Implementation address or null if not a proxy
 */
export async function getImplementationAddress(address: Address): Promise<Address | null> {
  const result = await detectProxy(address);

  if (!result.isProxy) {
    return null;
  }

  if (result.implementationAddress) {
    return result.implementationAddress;
  }

  // For beacon proxies, we need to read the implementation from the beacon
  if (result.beaconAddress) {
    try {
      // Beacon contracts typically store implementation at slot 0
      // or have an implementation() function
      const beaconImplSlot = await readStorageSlot(
        result.beaconAddress,
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
      return extractAddressFromSlot(beaconImplSlot);
    } catch (error) {
      logger.warn({ address, beaconAddress: result.beaconAddress, error },
        'Failed to read implementation from beacon');
      return null;
    }
  }

  return null;
}
