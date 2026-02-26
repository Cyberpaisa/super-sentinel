import { describe, it, expect, vi } from 'vitest';
import { prismaMock } from '../__mocks__/prisma';
import { publicClientMock } from '../__mocks__/blockchain-client';

vi.mock('@/lib/database/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/blockchain/client', () => ({
  publicClient: publicClientMock,
  getActiveChain: vi.fn(),
  getActiveChainId: vi.fn().mockReturnValue(43113),
  isMainnet: vi.fn().mockReturnValue(false),
  isTestnet: vi.fn().mockReturnValue(true),
}));

const { GET } = await import('@/app/api/v1/health/route');

describe('GET /api/v1/health', () => {
  it('returns 200 "healthy" when both checks pass', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publicClientMock.getBlockNumber.mockResolvedValue(12345n);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('healthy');
    expect(body.data.checks.database.status).toBe('up');
    expect(body.data.checks.blockchain.status).toBe('up');
  });

  it('returns timestamp as ISO string', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publicClientMock.getBlockNumber.mockResolvedValue(12345n);

    const res = await GET();
    const body = await res.json();

    expect(body.data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('reports latency_ms for successful checks', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publicClientMock.getBlockNumber.mockResolvedValue(12345n);

    const res = await GET();
    const body = await res.json();

    expect(typeof body.data.checks.database.latency_ms).toBe('number');
    expect(body.data.checks.database.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof body.data.checks.blockchain.latency_ms).toBe('number');
  });

  it('returns 200 "degraded" when only database is down', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));
    publicClientMock.getBlockNumber.mockResolvedValue(12345n);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('degraded');
    expect(body.data.checks.database.status).toBe('down');
    expect(body.data.checks.database.details).toBe('Database connection failed');
    expect(body.data.checks.blockchain.status).toBe('up');
  });

  it('returns 200 "degraded" when only blockchain is down', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publicClientMock.getBlockNumber.mockRejectedValue(new Error('RPC unreachable'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('degraded');
    expect(body.data.checks.database.status).toBe('up');
    expect(body.data.checks.blockchain.status).toBe('down');
    expect(body.data.checks.blockchain.details).toBe('Blockchain RPC unreachable');
  });

  it('returns 503 "unhealthy" when both are down', async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error('connection refused'));
    publicClientMock.getBlockNumber.mockRejectedValue(new Error('RPC unreachable'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.data.status).toBe('unhealthy');
    expect(body.data.checks.database.status).toBe('down');
    expect(body.data.checks.blockchain.status).toBe('down');
  });

  it('version falls back to 0.1.0 when env var not set', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    publicClientMock.getBlockNumber.mockResolvedValue(12345n);

    const res = await GET();
    const body = await res.json();

    expect(body.data.version).toBeDefined();
    expect(typeof body.data.version).toBe('string');
  });
});
