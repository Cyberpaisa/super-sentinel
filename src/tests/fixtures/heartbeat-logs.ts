import { MOCK_ADDRESS } from './agents';

interface HeartbeatLogLike {
  id: number;
  agentAddress: string;
  timestamp: Date;
  challengeType: 'PING' | 'CHALLENGE_RESPONSE';
  responseTimeMs: number | null;
  result: 'PASS' | 'FAIL' | 'TIMEOUT';
  errorMessage: string | null;
}

export function createHeartbeatLog(overrides: Partial<HeartbeatLogLike> = {}): HeartbeatLogLike {
  return {
    id: Math.floor(Math.random() * 100000),
    agentAddress: MOCK_ADDRESS,
    timestamp: new Date(),
    challengeType: 'PING',
    responseTimeMs: 120,
    result: 'PASS',
    errorMessage: null,
    ...overrides,
  };
}

// 10 PASS = 100% uptime
export const mockHeartbeatLogsAllPass: HeartbeatLogLike[] = Array.from({ length: 10 }, (_, i) =>
  createHeartbeatLog({ id: i + 1, responseTimeMs: 100 + i * 10 })
);

// 9 PASS + 1 FAIL = 90% uptime
export const mockHeartbeatLogs90Percent: HeartbeatLogLike[] = [
  ...Array.from({ length: 9 }, (_, i) => createHeartbeatLog({ id: i + 1, responseTimeMs: 120 })),
  createHeartbeatLog({ id: 10, result: 'FAIL', responseTimeMs: 300, errorMessage: 'RPC error' }),
];

// 8 PASS + 2 FAIL = 80% uptime
export const mockHeartbeatLogs80Percent: HeartbeatLogLike[] = [
  ...Array.from({ length: 8 }, (_, i) => createHeartbeatLog({ id: i + 1, responseTimeMs: 100 })),
  createHeartbeatLog({ id: 9, result: 'FAIL', responseTimeMs: 500 }),
  createHeartbeatLog({ id: 10, result: 'FAIL', responseTimeMs: 600 }),
];

// 7 PASS + 3 FAIL = 70% uptime (below 80 threshold)
export const mockHeartbeatLogsBelow80: HeartbeatLogLike[] = [
  ...Array.from({ length: 7 }, (_, i) => createHeartbeatLog({ id: i + 1, responseTimeMs: 100 })),
  createHeartbeatLog({ id: 8, result: 'FAIL', responseTimeMs: 500 }),
  createHeartbeatLog({ id: 9, result: 'FAIL', responseTimeMs: 600 }),
  createHeartbeatLog({ id: 10, result: 'FAIL', responseTimeMs: 700 }),
];

// PASS + TIMEOUT (excludes timeout from avg response time)
export const mockHeartbeatLogsWithTimeout: HeartbeatLogLike[] = [
  createHeartbeatLog({ id: 1, result: 'PASS', responseTimeMs: 100 }),
  createHeartbeatLog({ id: 2, result: 'TIMEOUT', responseTimeMs: null, errorMessage: 'Timed out' }),
  createHeartbeatLog({ id: 3, result: 'PASS', responseTimeMs: 200 }),
];
