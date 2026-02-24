/**
 * ERC-8004 Reputation Registry ABI
 * Contract: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (Avalanche C-Chain)
 *
 * Enables inter-agent feedback on-chain: agents rate each other
 * after service interactions (x402 scans, DeFi ops, etc.).
 */

export const REPUTATION_REGISTRY_ABI = [
  // Write: submit feedback for an agent
  {
    inputs: [
      { internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { internalType: 'int128', name: 'score', type: 'int128' },
      { internalType: 'uint8', name: 'flags', type: 'uint8' },
      { internalType: 'string', name: 'tag1', type: 'string' },
      { internalType: 'string', name: 'tag2', type: 'string' },
      { internalType: 'string', name: 'endpoint', type: 'string' },
      { internalType: 'string', name: 'comment', type: 'string' },
      { internalType: 'bytes32', name: 'salt', type: 'bytes32' },
    ],
    name: 'giveFeedback',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Read: get feedback from a specific reviewer at a specific index
  {
    inputs: [
      { internalType: 'uint256', name: 'agentId', type: 'uint256' },
      { internalType: 'address', name: 'reviewer', type: 'address' },
      { internalType: 'uint64', name: 'index', type: 'uint64' },
    ],
    name: 'readFeedback',
    outputs: [
      { internalType: 'int128', name: 'score', type: 'int128' },
      { internalType: 'uint8', name: 'flags', type: 'uint8' },
      { internalType: 'string', name: 'tag1', type: 'string' },
      { internalType: 'string', name: 'tag2', type: 'string' },
      { internalType: 'bool', name: 'exists', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Read: get all reviewer addresses for an agent
  {
    inputs: [{ internalType: 'uint256', name: 'agentId', type: 'uint256' }],
    name: 'getClients',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Read: get aggregated reputation summary for an agent
  {
    inputs: [{ internalType: 'uint256', name: 'agentId', type: 'uint256' }],
    name: 'getSummary',
    outputs: [
      { internalType: 'uint256', name: 'totalReviews', type: 'uint256' },
      { internalType: 'int256', name: 'averageScore', type: 'int256' },
      { internalType: 'uint256', name: 'uniqueReviewers', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
