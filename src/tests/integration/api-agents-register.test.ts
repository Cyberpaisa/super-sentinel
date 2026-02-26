import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAgent, MOCK_ADDRESS, MOCK_OWNER, MOCK_BILLING } from '../fixtures/agents';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';

// Mock all dependencies before importing the route
const agentServiceMock = {
  agentExists: vi.fn(),
  createAgent: vi.fn(),
};
const blockchainServiceMock = {
  verifyContractExists: vi.fn(),
  readAgentMetadata: vi.fn(),
};

vi.mock('@/services/agent-service', () => agentServiceMock);
vi.mock('@/services/blockchain-service', () => blockchainServiceMock);

const { POST } = await import(
  '@/app/api/v1/agents/register/route'
);

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/v1/agents/register'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  address: MOCK_ADDRESS,
  name: 'Test Agent',
  type: 'TRADING',
};

describe('POST /api/v1/agents/register', () => {
  function setupHappyPath() {
    agentServiceMock.agentExists.mockResolvedValue(false);
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.readAgentMetadata.mockResolvedValue({
      name: 'Test Agent',
      agentType: 'TRADING',
      billingAddress: MOCK_BILLING,
      owner: MOCK_OWNER,
    });
    agentServiceMock.createAgent.mockResolvedValue(mockAgent);
  }

  it('returns 201 on successful registration', async () => {
    setupHappyPath();
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
  });

  it('response contains agent data and message', async () => {
    setupHappyPath();
    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(body.data.agent.address).toBe(mockAgent.address);
    expect(body.data.agent.name).toBe(mockAgent.name);
    expect(body.data.agent.type).toBe(mockAgent.type);
    expect(body.data.agent.status).toBe(mockAgent.status);
    expect(body.data.message).toBe('Agent registered successfully');
  });

  it('returns 400 when agent already registered', async () => {
    agentServiceMock.agentExists.mockResolvedValue(true);
    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields?.address).toContain('already exists');
  });

  it('returns 502 when contract not found on blockchain', async () => {
    agentServiceMock.agentExists.mockResolvedValue(false);
    blockchainServiceMock.verifyContractExists.mockResolvedValue(false);

    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('CONTRACT_NOT_FOUND');
  });

  it('returns 400 for invalid address format', async () => {
    const res = await POST(makePostRequest({ ...validBody, address: 'not-an-address' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields?.address).toBeDefined();
  });

  it('returns 400 when name is too short', async () => {
    const res = await POST(makePostRequest({ ...validBody, name: 'AB' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fields?.name).toContain('3');
  });

  it('returns 400 for invalid agent type', async () => {
    const res = await POST(makePostRequest({ ...validBody, type: 'ROBOT' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when type is missing', async () => {
    const { type: _, ...withoutType } = validBody;
    const res = await POST(makePostRequest(withoutType));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.fields?.type).toBeDefined();
  });

  it('returns 502 when readAgentMetadata throws RPCError', async () => {
    agentServiceMock.agentExists.mockResolvedValue(false);
    blockchainServiceMock.verifyContractExists.mockResolvedValue(true);
    blockchainServiceMock.readAgentMetadata.mockRejectedValue(
      new RPCError('RPC connection failed')
    );

    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('RPC_ERROR');
  });

  it('agent address in response is lowercase', async () => {
    setupHappyPath();
    // Use mixed case (valid hex) — Zod transforms to lowercase before reaching service
    const mixedCaseAddress = '0xAbCdEf1234567890aBcDeF1234567890AbCdEf12';
    const res = await POST(
      makePostRequest({ ...validBody, address: mixedCaseAddress })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.agent.address).toBe(mockAgent.address.toLowerCase());
  });

  it('owner_address and billing_address are included in response', async () => {
    setupHappyPath();
    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(body.data.agent.owner_address).toBeDefined();
    expect(body.data.agent.billing_address).toBeDefined();
  });

  it('created_at is an ISO date string', async () => {
    setupHappyPath();
    const res = await POST(makePostRequest(validBody));
    const body = await res.json();

    expect(body.data.agent.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
