/**
 * Centinela Verification Services
 *
 * This module provides verification and monitoring services for autonomous agents:
 * - Proxy detection: Identifies proxy patterns in smart contracts
 * - Heartbeat monitoring: Tracks agent uptime and responsiveness
 * - OZ bytecode matching: Assesses code quality by comparing against OpenZeppelin patterns
 * - TLS sentinel: Validates TLS configuration and certificate health
 * - Latency sentinel: Measures endpoint latency with percentile analysis
 * - A2A sentinel: Validates agent-card.json for A2A protocol compliance
 * - MCP sentinel: Checks MCP JSON-RPC tools/list support
 * - x402 sentinel: Probes HTTP 402 payment protocol support
 *
 * @see docs/features/trust-score.md
 */

export {
  detectProxy,
  getImplementationAddress,
  type ProxyDetectionResult,
} from './proxy-detector';

export {
  sendHeartbeat,
  calculateUptime,
  getHeartbeatLogs,
  sendHeartbeatsToAllAgents,
  type HeartbeatPingResult,
  type UptimeResult,
  type UptimePeriod,
} from './heartbeat-service';

export {
  matchOZBytecode,
  matchOZBytecodeByAddress,
  type OZMatchResult,
  type OZComponentMatch,
  type MatchConfidence,
} from './oz-matcher';

export {
  checkTLS,
  type TLSResult,
  type TLSGrade,
} from './sentinels/tls-sentinel';

export {
  checkLatency,
  type LatencyResult,
} from './sentinels/latency-sentinel';

export {
  checkA2A,
  type A2AResult,
} from './sentinels/a2a-sentinel';

export {
  checkMCP,
  type MCPResult,
} from './sentinels/mcp-sentinel';

export {
  checkX402,
  type X402Result,
} from './sentinels/x402-sentinel';

export {
  resolveAgentEndpoint,
  resolveServiceEndpoint,
} from './sentinels/resolve-endpoint';
