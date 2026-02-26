import { type Agent } from '@prisma/client';

export const MOCK_ADDRESS = '0xabcdef1234567890abcdef1234567890abcdef12';
export const MOCK_OWNER = '0x1234567890abcdef1234567890abcdef12345678';
export const MOCK_BILLING = '0x9876543210fedcba9876543210fedcba98765432';
export const MOCK_IMPL_ADDRESS = '0xbeefdead1234567890abcdef1234567890abcdef';
export const MOCK_BEACON_ADDRESS = '0xcafebabe1234567890abcdef1234567890abcdef';

export const mockAgent: Agent = {
  address: MOCK_ADDRESS,
  name: 'Test Agent',
  type: 'TRADING',
  description: 'A test trading agent',
  owner_address: MOCK_OWNER,
  billing_address: MOCK_BILLING,
  registry_address: null,
  token_id: null,
  token_uri: null,
  metadata: null,
  status: 'VERIFIED',
  trust_score: 75,
  is_proxy: false,
  proxy_type: 'NONE',
  implementation_address: null,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
};

export const mockAgentTransparentProxy: Agent = {
  ...mockAgent,
  address: '0xdeadbeef1234567890abcdef1234567890abcdef',
  is_proxy: true,
  proxy_type: 'TRANSPARENT',
  implementation_address: MOCK_IMPL_ADDRESS,
};

export const mockAgentUUPSProxy: Agent = {
  ...mockAgent,
  address: '0xfeedface1234567890abcdef1234567890abcdef',
  is_proxy: true,
  proxy_type: 'UUPS',
  implementation_address: MOCK_IMPL_ADDRESS,
};

export const mockAgentCustomProxy: Agent = {
  ...mockAgent,
  address: '0xcafebabe1234567890abcdef1234567890abcdef',
  is_proxy: true,
  proxy_type: 'CUSTOM',
  implementation_address: null,
};

export const mockAgentNoProxyIsProxyTrue: Agent = {
  ...mockAgent,
  is_proxy: true,
  proxy_type: 'NONE',
};

export const mockAgentPending: Agent = {
  ...mockAgent,
  status: 'PENDING',
  trust_score: 0,
};

export const mockAgentWithMetadata: Agent = {
  ...mockAgent,
  metadata: {
    services: [{ name: 'MCP' }, { name: 'A2A' }],
  },
};
