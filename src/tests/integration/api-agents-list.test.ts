import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAgent, mockAgentWithMetadata } from '../fixtures/agents';

const agentServiceMock = {
  getAgents: vi.fn(),
};

vi.mock('@/services/agent-service', () => agentServiceMock);

const { GET } = await import('@/app/api/v1/agents/route');

function makeGetRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/v1/agents');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

const defaultPaginatedResult = {
  agents: [mockAgent],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
};

describe('GET /api/v1/agents', () => {
  it('returns 200 with agents and pagination meta', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta.page).toBe(1);
    expect(body.meta.limit).toBe(20);
    expect(body.meta.total).toBe(1);
  });

  it('passes type filter to getAgents', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    await GET(makeGetRequest({ type: 'TRADING' }));

    expect(agentServiceMock.getAgents).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TRADING' }),
      expect.anything()
    );
  });

  it('passes trust score range filters to getAgents', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    await GET(makeGetRequest({ minTrustScore: '50', maxTrustScore: '90' }));

    expect(agentServiceMock.getAgents).toHaveBeenCalledWith(
      expect.objectContaining({ minTrustScore: 50, maxTrustScore: 90 }),
      expect.anything()
    );
  });

  it('passes service filter to getAgents', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    await GET(makeGetRequest({ service: 'MCP' }));

    expect(agentServiceMock.getAgents).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'MCP' }),
      expect.anything()
    );
  });

  it('passes search filter to getAgents', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    await GET(makeGetRequest({ search: 'arbitrage' }));

    expect(agentServiceMock.getAgents).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'arbitrage' }),
      expect.anything()
    );
  });

  it('passes pagination params to getAgents', async () => {
    agentServiceMock.getAgents.mockResolvedValue({
      ...defaultPaginatedResult,
      pagination: { page: 2, limit: 10, total: 30, totalPages: 3 },
    });

    await GET(makeGetRequest({ page: '2', limit: '10' }));

    expect(agentServiceMock.getAgents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 2, limit: 10 })
    );
  });

  it('returns 400 for invalid type', async () => {
    const res = await GET(makeGetRequest({ type: 'INVALID' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when limit exceeds 100', async () => {
    const res = await GET(makeGetRequest({ limit: '101' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('extracts services array from metadata', async () => {
    agentServiceMock.getAgents.mockResolvedValue({
      agents: [mockAgentWithMetadata],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(body.data[0].services).toEqual(['MCP', 'A2A']);
  });

  it('returns empty services array when metadata is null', async () => {
    agentServiceMock.getAgents.mockResolvedValue({
      agents: [{ ...mockAgent, metadata: null }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(body.data[0].services).toEqual([]);
  });

  it('returns 200 with empty array when no results', async () => {
    agentServiceMock.getAgents.mockResolvedValue({
      agents: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.meta.total).toBe(0);
  });

  it('formatted agent has ISO date strings', async () => {
    agentServiceMock.getAgents.mockResolvedValue(defaultPaginatedResult);

    const res = await GET(makeGetRequest());
    const body = await res.json();

    expect(body.data[0].created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.data[0].updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
