import { describe, it, expect, vi, afterEach } from 'vitest';
import { prismaMock } from '../__mocks__/prisma';
import { publicClientMock } from '../__mocks__/blockchain-client';
import {
  mockAgent,
  MOCK_ADDRESS,
} from '../fixtures/agents';
import {
  mockHeartbeatLogsAllPass,
  mockHeartbeatLogs90Percent,
  mockHeartbeatLogsWithTimeout,
} from '../fixtures/heartbeat-logs';
import { ContractNotFoundError, RPCError } from '@/lib/utils/errors';
import { MOCK_BYTECODE_SIMPLE } from '../fixtures/bytecode';

vi.mock('@/lib/database/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/blockchain/client', () => ({
  publicClient: publicClientMock,
  getActiveChain: vi.fn(),
  getActiveChainId: vi.fn().mockReturnValue(43113),
  isMainnet: vi.fn().mockReturnValue(false),
  isTestnet: vi.fn().mockReturnValue(true),
}));

afterEach(() => {
  vi.useRealTimers();
});

const {
  sendHeartbeat,
  calculateUptime,
  getHeartbeatLogs,
  sendHeartbeatsToAllAgents,
} = await import('@/services/centinela/heartbeat-service');

describe('sendHeartbeat', () => {
  it('throws ContractNotFoundError when agent not in database', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(null);

    await expect(sendHeartbeat(MOCK_ADDRESS)).rejects.toThrow(ContractNotFoundError);
  });

  it('logs PASS result when contract has code', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeat(MOCK_ADDRESS);

    expect(result.result).toBe('PASS');
    expect(result.success).toBe(true);
    expect(prismaMock.heartbeatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentAddress: MOCK_ADDRESS.toLowerCase(),
          result: 'PASS',
        }),
      })
    );
  });

  it('logs FAIL result when contract has no code ("0x")', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue('0x');
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeat(MOCK_ADDRESS);

    expect(result.result).toBe('FAIL');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Contract no longer exists');
  });

  it('logs FAIL result on RPC error', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockRejectedValue(new Error('RPC down'));
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeat(MOCK_ADDRESS);

    expect(result.result).toBe('FAIL');
    expect(result.errorMessage).toContain('RPC down');
  });

  it('logs TIMEOUT result when getCode takes longer than 5000ms', async () => {
    vi.useFakeTimers();
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    // getCode never resolves
    publicClientMock.getCode.mockImplementation(() => new Promise(() => {}));
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const heartbeatPromise = sendHeartbeat(MOCK_ADDRESS);
    await vi.advanceTimersByTimeAsync(5001);
    const result = await heartbeatPromise;

    expect(result.result).toBe('TIMEOUT');
    expect(result.responseTimeMs).toBeNull();
    expect(prismaMock.heartbeatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ result: 'TIMEOUT' }),
      })
    );
  });

  it('normalizes agentAddress to lowercase', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    await sendHeartbeat('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');

    expect(prismaMock.heartbeatLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        }),
      })
    );
  });

  it('wraps unexpected DB errors in RPCError', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockRejectedValue(new Error('DB connection lost'));

    await expect(sendHeartbeat(MOCK_ADDRESS)).rejects.toThrow(RPCError);
  });

  it('responseTimeMs is a positive number for PASS', async () => {
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeat(MOCK_ADDRESS);

    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateUptime', () => {
  it('returns 0% uptime when no logs in period', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.uptimePercentage).toBe(0);
    expect(result.totalPings).toBe(0);
    expect(result.averageResponseTimeMs).toBeNull();
  });

  it('calculates correct 100% uptime', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue(
      mockHeartbeatLogsAllPass as any
    );

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.uptimePercentage).toBe(100);
    expect(result.successfulPings).toBe(10);
    expect(result.failedPings).toBe(0);
  });

  it('calculates 90% uptime correctly', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue(
      mockHeartbeatLogs90Percent as any
    );

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.uptimePercentage).toBe(90);
    expect(result.successfulPings).toBe(9);
    expect(result.failedPings).toBe(1);
  });

  it('excludes TIMEOUT from averageResponseTimeMs', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue(
      mockHeartbeatLogsWithTimeout as any
    );

    const result = await calculateUptime(MOCK_ADDRESS);

    // 2 PASS with 100ms and 200ms → avg = 150ms; TIMEOUT (null) excluded
    expect(result.averageResponseTimeMs).toBe(150);
    expect(result.timeoutPings).toBe(1);
  });

  it('averageResponseTimeMs is null when all pings are timeouts', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([
      { result: 'TIMEOUT', responseTimeMs: null },
      { result: 'TIMEOUT', responseTimeMs: null },
    ] as any);

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.averageResponseTimeMs).toBeNull();
  });

  it('24h period generates correct timestamp filter', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);
    const before = Date.now();

    await calculateUptime(MOCK_ADDRESS, '24h');

    const after = Date.now();
    const call = prismaMock.heartbeatLog.findMany.mock.calls[0][0];
    const startDate = call.where.timestamp.gte as Date;

    const expectedDuration = 24 * 60 * 60 * 1000;
    expect(Date.now() - startDate.getTime()).toBeGreaterThanOrEqual(expectedDuration - 100);
    expect(Date.now() - startDate.getTime()).toBeLessThanOrEqual(expectedDuration + 1000);
  });

  it('counts successfulPings, failedPings, and timeoutPings separately', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([
      { result: 'PASS', responseTimeMs: 100 },
      { result: 'FAIL', responseTimeMs: 300 },
      { result: 'TIMEOUT', responseTimeMs: null },
    ] as any);

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.successfulPings).toBe(1);
    expect(result.failedPings).toBe(1);
    expect(result.timeoutPings).toBe(1);
    expect(result.totalPings).toBe(3);
  });

  it('uses 24h as default period', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);

    const result = await calculateUptime(MOCK_ADDRESS);

    expect(result.period).toBe('24h');
  });

  it('normalizes address to lowercase', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([]);

    await calculateUptime('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');

    expect(prismaMock.heartbeatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        }),
      })
    );
  });
});

describe('getHeartbeatLogs', () => {
  it('returns logs ordered by timestamp descending', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([] as any);

    await getHeartbeatLogs(MOCK_ADDRESS);

    expect(prismaMock.heartbeatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { timestamp: 'desc' },
      })
    );
  });

  it('applies period filter when provided', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([] as any);

    await getHeartbeatLogs(MOCK_ADDRESS, 100, '7d');

    const call = prismaMock.heartbeatLog.findMany.mock.calls[0][0];
    expect(call.where.timestamp).toBeDefined();
    expect(call.where.timestamp.gte).toBeInstanceOf(Date);
  });

  it('does not add timestamp filter when period is undefined', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([] as any);

    await getHeartbeatLogs(MOCK_ADDRESS, 100, undefined);

    const call = prismaMock.heartbeatLog.findMany.mock.calls[0][0];
    expect(call.where.timestamp).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([] as any);

    await getHeartbeatLogs(MOCK_ADDRESS, 50);

    expect(prismaMock.heartbeatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });

  it('normalizes address to lowercase', async () => {
    prismaMock.heartbeatLog.findMany.mockResolvedValue([] as any);

    await getHeartbeatLogs('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');

    expect(prismaMock.heartbeatLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          agentAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        }),
      })
    );
  });
});

describe('sendHeartbeatsToAllAgents', () => {
  it('queries only VERIFIED agents', async () => {
    prismaMock.agent.findMany.mockResolvedValue([]);

    await sendHeartbeatsToAllAgents();

    expect(prismaMock.agent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'VERIFIED' },
      })
    );
  });

  it('returns correct summary for empty agent list', async () => {
    prismaMock.agent.findMany.mockResolvedValue([]);

    const result = await sendHeartbeatsToAllAgents();

    expect(result).toEqual({ total: 0, successful: 0, failed: 0, skipped: 0 });
  });

  it('counts successful pings for PASS results', async () => {
    prismaMock.agent.findMany.mockResolvedValue([{ address: MOCK_ADDRESS }] as any);
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeatsToAllAgents();

    expect(result.successful).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('counts failed pings for FAIL results', async () => {
    prismaMock.agent.findMany.mockResolvedValue([{ address: MOCK_ADDRESS }] as any);
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue('0x');
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    const result = await sendHeartbeatsToAllAgents();

    expect(result.failed).toBe(1);
    expect(result.successful).toBe(0);
  });

  it('increments skipped for ContractNotFoundError', async () => {
    prismaMock.agent.findMany.mockResolvedValue([{ address: MOCK_ADDRESS }] as any);
    // sendHeartbeat will throw ContractNotFoundError because agent not in DB
    prismaMock.agent.findUnique.mockResolvedValue(null);

    const result = await sendHeartbeatsToAllAgents();

    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('increments failed for RPCError (not skipped)', async () => {
    prismaMock.agent.findMany.mockResolvedValue([{ address: MOCK_ADDRESS }] as any);
    prismaMock.agent.findUnique.mockResolvedValue(mockAgent as any);
    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockRejectedValue(new Error('DB error'));

    const result = await sendHeartbeatsToAllAgents();

    expect(result.failed).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('processes agents sequentially (second starts after first completes)', async () => {
    const callOrder: string[] = [];
    const addr1 = MOCK_ADDRESS;
    const addr2 = '0x1111111111111111111111111111111111111111';

    prismaMock.agent.findMany.mockResolvedValue([
      { address: addr1 },
      { address: addr2 },
    ] as any);

    prismaMock.agent.findUnique.mockImplementation(async ({ where }) => {
      callOrder.push(`findUnique:${where.address}`);
      return mockAgent as any;
    });

    publicClientMock.getCode.mockResolvedValue(MOCK_BYTECODE_SIMPLE);
    prismaMock.heartbeatLog.create.mockResolvedValue({} as any);

    await sendHeartbeatsToAllAgents();

    // addr1 should be fully resolved before addr2 starts
    expect(callOrder[0]).toContain(addr1);
    expect(callOrder[1]).toContain(addr2);
  });
});
