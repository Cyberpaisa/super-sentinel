import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { mockAgent, MOCK_ADDRESS } from '../fixtures/agents';
import { mockHeartbeatLogsAllPass } from '../fixtures/heartbeat-logs';

const agentServiceMock = { getAgent: vi.fn() };
const heartbeatServiceMock = {
  calculateUptime: vi.fn(),
  getHeartbeatLogs: vi.fn(),
};

vi.mock('@/services/agent-service', () => agentServiceMock);
vi.mock('@/services/centinela/heartbeat-service', () => heartbeatServiceMock);

const { GET } = await import('@/app/api/v1/agents/[address]/heartbeats/route');

function makeGetRequest(address: string, params: Record<string, string> = {}): NextRequest {
  const url = new URL(`http://localhost/api/v1/agents/${address}/heartbeats`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const mockUptimeResult = {
  uptimePercentage: 95,
  totalPings: 100,
  successfulPings: 95,
  failedPings: 3,
  timeoutPings: 2,
  averageResponseTimeMs: 120,
  period: '24h' as const,
};

function setupHappyPath() {
  agentServiceMock.getAgent.mockResolvedValue(mockAgent);
  heartbeatServiceMock.getHeartbeatLogs.mockResolvedValue(
    mockHeartbeatLogsAllPass.map((l) => ({ ...l, timestamp: new Date() }))
  );
  heartbeatServiceMock.calculateUptime.mockResolvedValue(mockUptimeResult);
}

describe('GET /api/v1/agents/:address/heartbeats', () => {
  it('returns 200 with uptime and logs', async () => {
    setupHappyPath();

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.uptime).toBe(95);
    expect(Array.isArray(body.data.logs)).toBe(true);
    expect(body.data.address).toBe(MOCK_ADDRESS.toLowerCase());
  });

  it('logs are formatted with ISO timestamp strings', async () => {
    setupHappyPath();

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('uses 24h as default period', async () => {
    setupHappyPath();

    await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });

    expect(heartbeatServiceMock.calculateUptime).toHaveBeenCalledWith(
      MOCK_ADDRESS.toLowerCase(),
      '24h'
    );
    expect(heartbeatServiceMock.getHeartbeatLogs).toHaveBeenCalledWith(
      MOCK_ADDRESS.toLowerCase(),
      100,
      '24h'
    );
  });

  it('applies period query param to both getHeartbeatLogs and calculateUptime', async () => {
    setupHappyPath();

    await GET(makeGetRequest(MOCK_ADDRESS, { period: '7d' }), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });

    expect(heartbeatServiceMock.calculateUptime).toHaveBeenCalledWith(
      MOCK_ADDRESS.toLowerCase(),
      '7d'
    );
    expect(heartbeatServiceMock.getHeartbeatLogs).toHaveBeenCalledWith(
      MOCK_ADDRESS.toLowerCase(),
      100,
      '7d'
    );
  });

  it('applies limit query param to getHeartbeatLogs', async () => {
    setupHappyPath();

    await GET(makeGetRequest(MOCK_ADDRESS, { limit: '50' }), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });

    expect(heartbeatServiceMock.getHeartbeatLogs).toHaveBeenCalledWith(
      expect.any(String),
      50,
      expect.any(String)
    );
  });

  it('returns 404 when agent not found', async () => {
    agentServiceMock.getAgent.mockResolvedValue(null);

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid period', async () => {
    const res = await GET(makeGetRequest(MOCK_ADDRESS, { period: '1y' }), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fields?.period).toBeDefined();
  });

  it('returns 400 when limit exceeds 500', async () => {
    const res = await GET(makeGetRequest(MOCK_ADDRESS, { limit: '501' }), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('response contains uptime stats fields', async () => {
    setupHappyPath();

    const res = await GET(makeGetRequest(MOCK_ADDRESS), {
      params: Promise.resolve({ address: MOCK_ADDRESS }),
    });
    const body = await res.json();

    expect(body.data.totalPings).toBe(100);
    expect(body.data.successfulPings).toBe(95);
    expect(body.data.failedPings).toBe(3);
    expect(body.data.timeoutPings).toBe(2);
    expect(body.data.averageResponseTimeMs).toBe(120);
  });
});
