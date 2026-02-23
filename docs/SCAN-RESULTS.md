# Scan Results — Super Sentinel v1.0

Real-world scan results using `npx tsx scripts/sentinel-scan.ts`.

---

## Round 2: x402 Mainnet + MCP Integration (2026-02-22)

After implementing x402 real payments (Avalanche Mainnet 43114), MCP JSON-RPC at root, and upgrading the health sentinel to probe `/health` and `/api/health` before the root URL.

### Changes Made

**Problem:** Sentinels probe the base URL (`HEAD /` for x402 and health, `POST /` for MCP). Agents had their MCP at `/mcp` and x402 at `/api/signals`, which the scanner couldn't find. Additionally, `HEAD /` returning 402 for x402 broke the health check (expects 2xx).

**Solutions applied across 3 repos:**

1. **AvaRiskScan (avariskscan-defi):**
   - Migrated x402 from Fuji testnet (43113) to Mainnet (43114): USDC, chainId, RPC, registry
   - Added `HEAD /` middleware returning 402 + X-402-* headers (Hono auto-derives HEAD from GET, so middleware was needed)
   - Added `POST /` forwarding JSON-RPC to `/mcp` handler
   - Fixed `x402-hono` network type: `"avalanche-fuji"` → `"avalanche"` (the library doesn't accept `"avalanche-mainnet"`)

2. **Apex Arbitrage (apex-arbitrage-agent):**
   - Created `utils/x402_client.py`: EIP-712 payment proofs, facilitator validation, ERC-8004 agent discovery
   - Replaced shared secret paywall with real facilitator-based x402 validation
   - Added `HEAD /` → 402 with X-402-* headers including CAIP-10 recipient
   - Added `POST /` routing JSON-RPC to MCP handler
   - Added `HEAD /health` (FastAPI doesn't auto-handle HEAD for GET routes)
   - Added `GET /agents/discover` reading ERC-8004 registry on mainnet

3. **Super-Sentinel (scanner):**
   - Health sentinel now probes `/health`, `/api/health`, then `/` — picks the best score
   - This prevents false negatives when x402 (402 at root) and health share the same base URL

**Key discovery:** The x402 sentinel expects `X-402-Recipient` in CAIP-10 format (`eip155:43114:0xABC...`), not plain address. Without it, max score is 70 instead of 90.

### Apex Arbitrage Agent (`https://apex-arbitrage-agent-production.up.railway.app/`)

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 100   | PASS   |
| tls      | 80    | PASS   |
| latency  | 100   | PASS   |
| a2a      | 95    | PASS   |
| mcp      | 100   | PASS   |
| x402     | 90    | PASS   |

**TRACER: 60 / 100 — PARTIAL**

| Dimension   | Score | Weight |
|-------------|-------|--------|
| Trust       | 80    | 20%    |
| Reliability | 100   | 20%    |
| Autonomy    | 98    | 15%    |
| Capability  | 0     | 20%    |
| Economics   | 90    | 10%    |
| Reputation  | 0     | 15%    |

**Improvement:** 33 → 60 (+27 points). All 6 sentinels now PASS. MCP went from 0→100 (18 tools detected), x402 from 0→90 (CAIP-10 recipient validated), health from 30→100 (dedicated /health endpoint).

---

### AvaRiskScan DeFi (`https://avariskscan-defi-production.up.railway.app/`)

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 100   | PASS   |
| tls      | 80    | PASS   |
| latency  | 100   | PASS   |
| a2a      | 95    | PASS   |
| mcp      | 100   | PASS   |
| x402     | 90    | PASS   |

**TRACER: 60 / 100 — PARTIAL**

| Dimension   | Score | Weight |
|-------------|-------|--------|
| Trust       | 80    | 20%    |
| Reliability | 100   | 20%    |
| Autonomy    | 98    | 15%    |
| Capability  | 0     | 20%    |
| Economics   | 90    | 10%    |
| Reputation  | 0     | 15%    |

**Improvement:** 39 → 60 (+21 points). MCP 0→100 (21 tools), x402 0→90. A2A improved from 40→95 after previous agent card fixes.

---

### Google (`https://google.com`) — Baseline

| Sentinel | Score | Status |
|----------|-------|--------|
| health   | 100   | PASS   |
| tls      | 90    | PASS   |
| latency  | 60    | PASS   |
| a2a      | 0     | FAIL   |
| mcp      | 0     | FAIL   |
| x402     | 0     | FAIL   |

**TRACER: 34 / 100 — FAIL**

Traditional web service. No agent protocols.

---

## Comparative Summary

| Dimension   | Google | Apex Arbitrage | AvaRiskScan |
|-------------|--------|----------------|-------------|
| Trust       | 90     | 80             | 80          |
| Reliability | 80     | **100**        | **100**     |
| Autonomy    | 0      | **98**         | **98**      |
| Capability  | 0      | 0              | 0           |
| Economics   | 0      | **90**         | **90**      |
| Reputation  | 0      | 0              | 0           |
| **TRACER**  | **34** | **60**         | **60**      |
| **Tier**    | FAIL   | PARTIAL        | PARTIAL     |

### Key Takeaways

1. **6/6 sentinels PASS** on both agents after implementing x402 mainnet payments and MCP at root.

2. **Health + x402 conflict resolved.** When agents return 402 at root for x402, health sentinel now probes `/health` first, finding the 200 endpoint.

3. **CAIP-10 format matters.** The x402 sentinel validates `X-402-Recipient` as `eip155:<chainId>:<address>`. Plain addresses score 70; CAIP-10 scores 90.

4. **Framework quirks:**
   - Hono auto-derives HEAD from GET, overriding explicit HEAD handlers → use middleware
   - FastAPI doesn't auto-handle HEAD for GET routes → add explicit `@app.head()` decorator
   - `x402-hono` library expects `"avalanche"` not `"avalanche-mainnet"` for network type

5. **Path to VERIFIED (>= 80):** Remaining dimensions need Capability (on-chain verification, ERC-8004 read) and Reputation (community ratings). Both agents are registered on ERC-8004 mainnet (agentIds 1686/1687) — implementing those sentinels would add up to 35 weighted points.

---

## Round 1: Initial Baseline (2026-02-22, pre-integration)

### Results (before changes)

| Agent           | health | tls | latency | a2a | mcp | x402 | TRACER |
|-----------------|--------|-----|---------|-----|-----|------|--------|
| Google          | 100    | 90  | 60      | 0   | 0   | 0    | 34     |
| Apex Arbitrage  | 30     | 80  | 80      | 80  | 0   | 0    | 33     |
| AvaRiskScan     | 100    | 80  | 100     | 40  | 0   | 0    | 39     |

All agents in FAIL tier. No MCP or x402 support detected.
