# Scan Results — Super Sentinel v1.0

Real-world scan results from 3 endpoints using `npx tsx scripts/sentinel-scan.ts`.

Date: 2026-02-22

---

## 1. Google (`https://google.com`)

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 100   | PASS   |
| tls      | 90    | PASS   |
| latency  | 60    | PASS   |
| a2a      | 0     | FAIL   |
| mcp      | 0     | FAIL   |
| x402     | 0     | FAIL   |

**TRACER: 34 / 100 — FAIL**

| Dimension   | Score | Weight |
|-------------|-------|--------|
| Trust       | 90    | 20%    |
| Reliability | 80    | 20%    |
| Autonomy    | 0     | 15%    |
| Capability  | 0     | 20%    |
| Economics   | 0     | 10%    |
| Reputation  | 0     | 15%    |

**Findings:** Google is not an autonomous agent. Strong infrastructure scores (health 100, TLS 90) but zero on all agent-specific protocols. This is the expected baseline for a traditional web service.

---

## 2. Apex Arbitrage Agent (`https://apex-arbitrage-agent-production.up.railway.app/`)

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 30    | FAIL   |
| tls      | 80    | PASS   |
| latency  | 80    | PASS   |
| a2a      | 80    | PASS   |
| mcp      | 0     | FAIL   |
| x402     | 0     | FAIL   |

**TRACER: 33 / 100 — FAIL**

| Dimension   | Score | Weight |
|-------------|-------|--------|
| Trust       | 80    | 20%    |
| Reliability | 55    | 20%    |
| Autonomy    | 40    | 15%    |
| Capability  | 0     | 20%    |
| Economics   | 0     | 10%    |
| Reputation  | 0     | 15%    |

**Findings:** This is a real AI agent with a valid A2A agent card (`/.well-known/agent-card.json`, score 80). However, health fails because the root endpoint returns a 4xx status. The agent card confirms it follows the Agent-to-Agent protocol, pushing Autonomy to 40. No MCP or x402 support detected.

---

## 3. AvaRiskScan DeFi (`https://avariskscan-defi-production.up.railway.app/`)

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 100   | PASS   |
| tls      | 80    | PASS   |
| latency  | 100   | PASS   |
| a2a      | 40    | PASS   |
| mcp      | 0     | FAIL   |
| x402     | 0     | FAIL   |

**TRACER: 39 / 100 — FAIL**

| Dimension   | Score | Weight |
|-------------|-------|--------|
| Trust       | 80    | 20%    |
| Reliability | 100   | 20%    |
| Autonomy    | 20    | 15%    |
| Capability  | 0     | 20%    |
| Economics   | 0     | 10%    |
| Reputation  | 0     | 15%    |

**Findings:** Best infrastructure profile of the three. Perfect Reliability (health 100, latency 100 with p95 < 500ms). Has an agent card but with incomplete schema (score 40 vs Apex's 80). No MCP or x402 support.

---

## Comparative Summary

| Dimension   | Google | Apex Arbitrage | AvaRiskScan |
|-------------|--------|----------------|-------------|
| Trust       | 90     | 80             | 80          |
| Reliability | 80     | 55             | **100**     |
| Autonomy    | 0      | **40**         | 20          |
| Capability  | 0      | 0              | 0           |
| Economics   | 0      | 0              | 0           |
| Reputation  | 0      | 0              | 0           |
| **TRACER**  | **34** | **33**         | **39**      |
| **Tier**    | FAIL   | FAIL           | FAIL        |

### Key Takeaways

1. **Infrastructure alone is not enough.** Google scores highest on Trust (90) but still lands in FAIL tier because it lacks agent-specific protocols.

2. **A2A agent cards matter.** Apex Arbitrage has the best Autonomy score (40) thanks to a well-formed agent card. AvaRiskScan has a card but with incomplete schema (20).

3. **Reliability differentiates agents.** AvaRiskScan achieves perfect Reliability (100) with sub-500ms p95 latency and clean 200 responses, while Apex suffers from a 4xx root endpoint.

4. **No agent implements MCP, x402, or on-chain verification yet.** These protocols would push scores from FAIL toward PASS or VERIFIED. An agent implementing all three could gain up to 45 additional weighted points.

5. **Path to VERIFIED tier (>= 80):** An agent would need to implement A2A + MCP (Autonomy), x402 payments (Economics), register on ERC-8004 (Capability), and accumulate community ratings (Reputation) alongside solid infrastructure.
