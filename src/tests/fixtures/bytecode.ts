// Minimal EVM init bytecode (non-empty, non-EOA)
export const MOCK_BYTECODE_SIMPLE = '0x6080604052';

// Empty / no-code
export const MOCK_BYTECODE_EMPTY = '0x';

// Bytecode containing Ownable selectors: owner() + renounceOwnership() + transferOwnership()
// 8da5cb5b = owner()
// 715018a6 = renounceOwnership()
// f2fde38b = transferOwnership(address)
export const MOCK_BYTECODE_OWNABLE =
  '0x608060405260006040526380' +
  '8da5cb5b' +
  '14610020576000' +
  '715018a6' +
  '14610040576000' +
  'f2fde38b' +
  '00';

// Bytecode with only 1 of 3 Ownable selectors (below 50% threshold — won't match)
export const MOCK_BYTECODE_OWNABLE_PARTIAL = '0x60806040528da5cb5b00';

// Bytecode with 2 of 3 Ownable selectors (67% >= 50% — matches)
export const MOCK_BYTECODE_OWNABLE_TWO = '0x60806040528da5cb5b715018a600';

// Bytecode with ERC20 selectors
// 06fdde03=name, 95d89b41=symbol, 313ce567=decimals, 18160ddd=totalSupply,
// 70a08231=balanceOf, a9059cbb=transfer, dd62ed3e=allowance, 095ea7b3=approve, 23b872dd=transferFrom
export const MOCK_BYTECODE_ERC20 =
  '0x6080604052' +
  '06fdde03' +
  '95d89b41' +
  '313ce567' +
  '18160ddd' +
  '70a08231' +
  'a9059cbb' +
  'dd62ed3e' +
  '095ea7b3' +
  '23b872dd';

// Bytecode with DELEGATECALL opcode (0xf4) — indicates custom proxy
export const MOCK_BYTECODE_DELEGATECALL = '0x60806040f4600080fd';

// Bytecode without DELEGATECALL — plain contract
export const MOCK_BYTECODE_NO_DELEGATECALL = '0x608060405200';

// Bytecode with multiple SLOAD(54) and SSTORE(55) — matches ReentrancyGuard heuristic
export const MOCK_BYTECODE_REENTRANCY =
  '0x6080604052' +
  '54' + // SLOAD 1
  '55' + // SSTORE 1
  '54' + // SLOAD 2
  '55' + // SSTORE 2
  '00';

// EIP-1967 slot value encoding a real address (last 40 hex = address)
// Encodes: 0xabcdef1234567890abcdef1234567890abcdef12
export const MOCK_SLOT_WITH_ADDRESS =
  '0x000000000000000000000000abcdef1234567890abcdef1234567890abcdef12';

// Zero address slot value (no proxy)
export const MOCK_SLOT_ZERO =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

// Expected extracted address from MOCK_SLOT_WITH_ADDRESS
export const MOCK_EXTRACTED_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
