# Super Sentinel

**Autonomous verification engine for AI agents on Avalanche C-Chain (ERC-8004).**

Super Sentinel is a self-sustaining AI agent that scans, verifies, and scores the trustworthiness of other autonomous agents. It earns its existence by charging for scans via the x402 payment protocol. If it doesn't generate value, it reduces functionality. If its balance reaches zero, it stops.

> *"Earn your existence."* — Web4 philosophy

---

## Identity

| Field | Value |
|-------|-------|
| **Name** | Super Sentinel |
| **Chain** | Avalanche C-Chain (43114) |
| **Registry** | ERC-8004 (`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`) |
| **Sentinels** | 11 independent micro-sentinels |
| **Scoring** | TRACER 6-dimension model |
| **Tests** | 179 passing (Vitest) |
| **Identity** | [SOUL.md](./SOUL.md) |
| **Rules** | [constitution.md](./constitution.md) |

---

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │            Super Sentinel Agent             │
                         │                                             │
   Client Request ──────►│  x402 Payment Gate ($0.50 USDC full scan)  │
                         │            │                                │
                         │  ┌─────────▼──────────┐                    │
                         │  │    Orchestrator     │                    │
                         │  │ Promise.allSettled  │                    │
                         │  └────┬───┬───┬───┬───┘                    │
                         │       │   │   │   │                        │
            ┌────────────┼───────┘   │   │   └────────────────┐       │
            ▼            │           ▼   ▼                    ▼       │
     ┌──────────┐  ┌─────┼────┐  ┌──────────┐          ┌──────────┐  │
     │ Endpoint │  │ On-Chain │  │ Context  │          │ Cooldown │  │
     │ Sentinels│  │ Sentinels│  │ Sentinels│          │ Monitor  │  │
     ├──────────┤  ├──────────┤  ├──────────┤          ├──────────┤  │
     │ health   │  │ proxy    │  │ ratings  │          │ uri-     │  │
     │ tls      │  │ oz-match │  │          │          │ stability│  │
     │ latency  │  │ on-chain │  │          │          │          │  │
     │ a2a      │  │          │  │          │          │          │  │
     │ mcp      │  │          │  │          │          │          │  │
     │ x402     │  │          │  │          │          │          │  │
     └────┬─────┘  └────┬─────┘  └────┬─────┘          └────┬─────┘  │
          │             │             │                      │        │
          └─────────────┴──────┬──────┴──────────────────────┘        │
                               ▼                                      │
                     ┌──────────────────┐                             │
                     │  TRACER Scoring  │                             │
                     │  6 dimensions    │                             │
                     │  Tier: VERIFIED  │                             │
                     │   PASS/PARTIAL   │                             │
                     │      FAIL        │                             │
                     └──────────────────┘                             │
                                                                      │
          ┌─────────────────────────────────────────────────────┐     │
          │                 Survival Engine                      │     │
          │  credit-monitor ──► earnings-tracker ──► cost-tracker│     │
          │         │                                            │     │
          │         ▼                                            │     │
          │  survival-loop (tier: THRIVING → DEAD)               │     │
          └──────────────────────────┬──────────────────────────┘     │
                                     │                                │
                                     ▼                                │
                            ┌──────────────┐                          │
                            │  Heartbeat   │◄─── GET /heartbeat       │
                            │  (every 5m)  │                          │
                            └──────────────┘                          │
                         └─────────────────────────────────────────────┘
```

---

## Sentinels (11)

### Endpoint-Based (6)

| # | Sentinel | Check | Scoring |
|---|----------|-------|---------|
| 1 | **health** | HTTP HEAD request (5s timeout) | 2xx=100, 3xx=70, 4xx=30, 5xx=10, timeout=0 |
| 2 | **tls** | Certificate, protocol, cipher, CA trust | 100 base; penalties: invalid cert -30, weak proto -30, weak cipher -10, expiry <7d -20 |
| 3 | **latency** | 20 HEAD samples → p50/p95/p99 | p95 <500ms=100, <1s=80, <2s=60, <5s=40, else 20. Min 5 successes required. |
| 4 | **a2a** | Agent card at `/.well-known/agent-card.json` | Valid schema=80 + 5/capability (max 100). Validates types, not just keys. |
| 5 | **mcp** | JSON-RPC `tools/list` | 0 tools=0 (fail), 1+=50+tools*5 (max 100) |
| 6 | **x402** | HTTP 402 + X-402-* headers | CAIP-10 recipient=90, headers only=70, 402 no headers=20, none=0 |

### On-Chain (3)

| # | Sentinel | Check | Scoring |
|---|----------|-------|---------|
| 7 | **proxy** | EIP-1967 proxy pattern detection | No proxy=100, known type=80, undeclared=50, custom=0 |
| 8 | **oz-match** | OpenZeppelin bytecode matching | Confidence-based 0-100 |
| 9 | **on-chain** | `eth_getCode` contract validation | Contract >1KB=80, <=1KB=60, EOA=30, invalid=0 |

### Context & Monitoring (2)

| # | Sentinel | Check | Scoring |
|---|----------|-------|---------|
| 10 | **ratings** | Community ratings aggregation | Count-based: 1-2=30, 3-5=50, 6+=70 + avg normalized |
| 11 | **uri-stability** | URI change frequency monitoring | Stable=100, 1 change=80, 2=60, 3+=40, critical risk=20 |

**All sentinels**: pass threshold = score >= 50, uniform `SentinelResult` interface.

---

## TRACER Scoring

6-dimension weighted model. Weights sum to 1.0.

| Dimension | Weight | Sources | Measures |
|-----------|--------|---------|----------|
| **T**rust | 20% | tls, proxy, oz-match, uri-stability | Certificate, proxy transparency, code patterns, metadata stability |
| **R**eliability | 20% | health, latency | Uptime and response time |
| **A**utonomy | 15% | a2a, mcp | Agent interoperability and tool exposure |
| **C**apability | 20% | on-chain, oz-match | Contract sophistication |
| **E**conomics | 10% | x402 | Payment protocol support |
| **R**eputation | 15% | ratings | Community trust signals |

### Tiers

| Tier | Score | Meaning |
|------|-------|---------|
| **VERIFIED** | 80-100 | High confidence — passes all major checks |
| **PASS** | 70-79 | Acceptable — most checks pass |
| **PARTIAL** | 40-69 | Limited — significant gaps |
| **FAIL** | 0-39 | Unverified or unreachable |

---

## Pricing (x402 Protocol)

| Endpoint | Price | Payment |
|----------|-------|---------|
| `POST /api/v1/sentinel/scan` | **$0.01 USDC** | x402 required |
| `GET /api/v1/sentinel/quick-check` | **Free** | No payment |
| `GET /api/v1/heartbeat` | **Free** | No payment |

> Validated on-chain: first real x402 payment between ERC-8004 agents on Avalanche mainnet.
> TX: [`0x0a9d5fa6...`](https://snowtrace.io/tx/0x0a9d5fa65bbf7e8052fe2067f30d857ee3a41c4543ef2087c1a9399a67eca433)
> See [x402 docs](docs/x402/) for transaction report and best practices.

Payment flow:
1. Client sends request without payment → receives HTTP 402 with `X-402-*` headers
2. Client constructs USDC payment on Avalanche C-Chain
3. Client retries with `X-Payment-Signature` or `X-Payment-Token` header
4. Super Sentinel verifies payment and delivers scan results

USDC contract: `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` (Avalanche mainnet, 6 decimals)

---

## Survival Engine (Opt-in)

The survival engine is **fully optional**. Super Sentinel works as a free, open-source scanner without it. Enable it when you want the agent to operate autonomously with its own economy.

| Mode | What works | What's disabled | Config needed |
|------|-----------|----------------|---------------|
| **Scanner only** (default) | All 11 sentinels, TRACER scoring, quick-check, heartbeat | x402 payments, survival tiers, balance tracking | None — works out of the box |
| **Survival enabled** | Everything above + autonomous economy | Nothing | `AGENT_WALLET_ADDRESS`, `AVALANCHE_RPC_URL` |

To enable survival mode, set these environment variables:
```env
# Optional — enables survival engine
AGENT_WALLET_ADDRESS=0x...    # Agent's USDC wallet on Avalanche C-Chain
AVALANCHE_RPC_URL=https://...  # Avalanche RPC endpoint
```

When survival is NOT configured:
- Scans work normally (free or paid depending on x402 config)
- Heartbeat returns `tier: "UNCONFIGURED"`
- No balance checks, no conservation mode
- The agent runs indefinitely as a traditional service

When survival IS configured:
- The agent monitors its own USDC balance
- x402 payments are verified with EIP-712 signatures and recorded
- If earnings < costs for 24h, the agent enters CONSERVATION mode
- In CONSERVATION mode, paid scans return 503 to reduce compute costs
- Free endpoints (quick-check, heartbeat) always remain available

### Tiers

| Tier | Balance | Behavior |
|------|---------|----------|
| **THRIVING** | > $100 USDC | Full functionality |
| **SUSTAINABLE** | > $10 USDC | Full functionality |
| **CONSERVATION** | < $10 USDC | Reduced functionality after 24h of losses |
| **DEAD** | $0 USDC | Agent stops accepting paid requests |

### Components

| Module | Purpose |
|--------|---------|
| `credit-monitor` | Reads agent USDC balance via RPC (real, not mocked) |
| `earnings-tracker` | Records x402 payments received, calculates revenue per hour/day/week |
| `cost-tracker` | Estimates compute costs (RPC calls, API calls, hosting baseline) |
| `survival-loop` | Compares earnings vs costs, calculates hours until death |

### Break-Even Analysis

| Cost Component | Estimate |
|----------------|----------|
| RPC calls | ~$0.0001/call |
| Hosting baseline | ~$0.01/hour (~$7.20/month) |
| **Daily cost estimate** | ~$0.25-$0.50 |
| **Scans needed per day** | 1-2 (at $0.50/scan) |

---

## Heartbeat

Public endpoint: `GET /api/v1/heartbeat`

```json
{
  "data": {
    "timestamp": "2025-02-23T10:00:00.000Z",
    "uptimeSeconds": 86400,
    "tier": "SUSTAINABLE",
    "balance": "$42.50",
    "earnings24h": "$3.00",
    "scanCount": 156,
    "uniqueAgentsScanned": 23,
    "status": "alive"
  },
  "error": null
}
```

Status values: `alive` (THRIVING/SUSTAINABLE), `degraded` (CONSERVATION), `dying` (DEAD).

---

## API Endpoints

### Sentinel

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/sentinel/scan` | x402 ($0.50) | Full TRACER scan (11 sentinels) |
| `GET` | `/api/v1/sentinel/quick-check?address=0x...` | Free | Basic check (health + TLS) |

### Agent

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/agents` | List agents |
| `GET` | `/api/v1/agents/:address` | Agent details |
| `POST` | `/api/v1/agents/register` | Register agent |
| `GET` | `/api/v1/agents/:address/trust-score` | TRACER breakdown |
| `GET` | `/api/v1/agents/:address/heartbeats` | Heartbeat history |
| `POST` | `/api/v1/agents/:address/ratings` | Submit rating |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/health` | Service health |
| `GET` | `/api/v1/heartbeat` | Agent heartbeat (survival status) |

---

## Modules

| Module | Path | Status | Tests |
|--------|------|--------|-------|
| Sentinels (11) | `src/sentinels/` | Production | 85 |
| TRACER Scoring | `src/sentinels/scoring/` | Production | 25 |
| Cooldown Monitor | `src/modules/cooldown-monitor/` | Production | 42 |
| Survival Engine | `src/survival/` | Opt-in | 14 |
| x402 Verification | `src/lib/middleware/` | Production | 14 |
| Heartbeat | `src/heartbeat/` | Production | — |

---

## Local Setup

```bash
npm install
cp .env.example .env.local
# Edit .env.local: Supabase, RPC, WalletConnect, AGENT_WALLET_ADDRESS

npx prisma generate
npm run dev
```

Available at [http://localhost:3000](http://localhost:3000).

### CLI Scanner

```bash
npx tsx scripts/sentinel-scan.ts <endpoint-url>
```

---

## Testing

```bash
npx vitest run
```

179 tests across 17 test files. Covers all sentinels, TRACER scoring, cooldown monitor, x402 verification, and orchestrator.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5.x (strict) |
| ORM | Prisma |
| Database | Supabase (PostgreSQL) |
| Blockchain | Viem 2.x + Wagmi 2.x (Avalanche C-Chain) |
| Styling | Tailwind CSS + shadcn/ui |
| Testing | Vitest |
| Logging | Pino |
| CI/CD | GitHub Actions |

---

## Security Audit

The survival engine passed a 15-finding security audit ([docs/SURVIVAL-AUDIT.md](./docs/SURVIVAL-AUDIT.md)):

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 2 | 2 | 0 |
| HIGH | 4 | 4 | 0 |
| MEDIUM | 5 | 0 | 5 (acceptable for beta) |
| LOW | 4 | 0 | 4 (backlog) |

Key security measures:
- x402 payments verified with EIP-712 typed data signatures (not just header presence)
- Anti-replay protection with nonce tracking
- Rate limiting on all free endpoints (heartbeat: 10/min, quick-check: 30/min)
- Survival enforcement: conservation mode reduces functionality to cut costs
- Earnings persist to database with graceful fallback to in-memory

---

## Documents

| Document | Description |
|----------|-------------|
| [SOUL.md](./SOUL.md) | Agent identity — who Super Sentinel is |
| [constitution.md](./constitution.md) | Immutable rules — what Super Sentinel will never do |
| [docs/TRACER-AUDIT.md](./docs/TRACER-AUDIT.md) | TRACER scoring system security audit |
| [docs/SURVIVAL-AUDIT.md](./docs/SURVIVAL-AUDIT.md) | Survival engine security & viability audit |
| [docs/FULL-AGENT-AUDIT.md](./docs/FULL-AGENT-AUDIT.md) | Comprehensive audit of Apex + AvaRiskScan agents |

---

## License

MIT
