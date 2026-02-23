# Super Sentinel

**Micro-sentinel verification engine for autonomous AI agents on the ERC-8004 standard.**

---

## Overview

Super Sentinel is the verification backbone of the Enigma project -- the "CoinMarketCap for Autonomous Agents." It provides a system of 8 independent micro-sentinels that scan, verify, and score the trustworthiness of AI agents registered on Avalanche C-Chain under the ERC-8004 standard.

Each sentinel is a pure function: it receives an endpoint or contract address, performs a single focused check, and returns a uniform `SentinelResult` with a score from 0 to 100. The orchestrator runs all sentinels in parallel via `Promise.allSettled`, ensuring that one failure never blocks the rest. Results feed into the TRACER scoring model, which produces a 6-dimension composite score and a tier classification.

---

## Architecture

```
   Endpoint URL ──► Orchestrator ──► Promise.allSettled
                        │
            ┌───────────┼───────────────────────┐
            ▼           ▼           ▼           ▼
         Health       TLS       Latency       A2A
            │           │           │           │
            ▼           ▼           ▼           ▼
          MCP         x402      Proxy      OZ-Match
            │           │           │           │
            └───────────┼───────────────────────┘
                        ▼
                 TRACER Scoring
              (6 dimensions → Tier)
```

The 6 endpoint-based sentinels (Health, TLS, Latency, A2A, MCP, x402) run against the agent's HTTP endpoint. The 2 on-chain sentinels (Proxy, OZ-Match) run against the agent's contract address on Avalanche C-Chain. Both groups execute in parallel and merge into a single `OrchestratorResult`.

---

## Sentinels

| # | Sentinel   | What it checks                                             | Scoring logic                                                        |
|---|------------|------------------------------------------------------------|----------------------------------------------------------------------|
| 1 | **health** | HTTP reachability via HEAD request (5s timeout)            | 2xx = 100, 3xx = 70, 4xx = 30, 5xx = 10, unreachable = 0            |
| 2 | **tls**    | TLS certificate, protocol version, cipher strength         | Starts at 100; penalizes weak protocol, cipher, expiry, untrusted CA |
| 3 | **latency**| Response time via 20 HEAD samples (p50/p95/p99)            | p95 < 500ms = 100, < 1s = 80, < 2s = 60, < 5s = 40, else 20        |
| 4 | **a2a**    | Agent-to-Agent card at `/.well-known/agent-card.json`      | Valid schema = 80 base + 5 per capability (max 100); incomplete = 40 |
| 5 | **mcp**    | MCP support via JSON-RPC `tools/list` request              | Valid JSON-RPC response = 80 base + 2 per tool (max 100)             |
| 6 | **x402**   | HTTP 402 payment protocol with X-402-* headers             | 402 + valid headers + CAIP-10 recipient = 90; headers only = 70      |
| 7 | **proxy**  | On-chain proxy pattern detection (EIP-1967 storage slots)  | No proxy = 100, known proxy type = 80, custom/undeclared = 0         |
| 8 | **oz-match** | OpenZeppelin bytecode signature matching on deployed code | Score 0-100 based on matched OZ component signatures                 |

---

## TRACER Scoring

TRACER is a 6-dimension weighted scoring model. Each dimension aggregates scores from one or more sentinels, producing a final composite score between 0 and 100.

| Dimension       | Weight | Source sentinels        | What it measures                                |
|-----------------|--------|-------------------------|-------------------------------------------------|
| **T**rust       | 20%    | TLS, Proxy, OZ-Match    | Certificate validity, proxy transparency, known code patterns |
| **R**eliability | 20%    | Health, Latency         | Uptime reachability and response time consistency |
| **A**utonomy    | 15%    | A2A, MCP                | Agent-to-agent interoperability and tool exposure |
| **C**apability  | 20%    | OZ-Match (on-chain)     | Smart contract sophistication and standard compliance |
| **E**conomics   | 10%    | x402                    | Payment protocol support for agent-to-agent commerce |
| **R**eputation  | 15%    | Community ratings       | User-submitted ratings and reports               |

### Tier Classification

| Tier         | Score range | Meaning                                      |
|--------------|-------------|----------------------------------------------|
| **VERIFIED** | >= 80       | High confidence -- agent passes all major checks |
| **PASS**     | >= 60       | Acceptable -- most checks pass with minor issues |
| **PARTIAL**  | >= 40       | Limited -- significant gaps in verification   |
| **FAIL**     | < 40        | Unverified or unreachable agent               |

---

## Local Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase, RPC, and WalletConnect credentials

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

---

## CLI Scanner

Run a standalone sentinel scan from the command line without requiring a database connection:

```bash
npx tsx scripts/sentinel-scan.ts <endpoint-url>
```

This executes all 6 endpoint-based sentinels against the given URL, prints individual results, and outputs the TRACER score. Useful for quick diagnostics and CI pipelines.

---

## API Endpoints

### Sentinel

| Method | Endpoint                    | Description                              |
|--------|-----------------------------|------------------------------------------|
| `POST` | `/api/v1/sentinel/scan`     | Run sentinel scan and return TRACER score |

**Request body:**

```json
{
  "address": "0x1234...abcd",
  "endpoint": "https://agent.example.com"
}
```

The `address` field is required. The `endpoint` field is optional -- if omitted, the system resolves it from the agent's on-chain metadata.

### Agents

| Method | Endpoint                              | Description                          |
|--------|---------------------------------------|--------------------------------------|
| `GET`  | `/api/v1/agents`                      | List agents with filters and sorting |
| `GET`  | `/api/v1/agents/:address`             | Get agent details                    |
| `POST` | `/api/v1/agents/register`             | Register a new agent                 |
| `GET`  | `/api/v1/agents/:address/trust-score` | Get TRACER score breakdown           |
| `GET`  | `/api/v1/agents/:address/heartbeats`  | Get heartbeat history                |
| `POST` | `/api/v1/agents/:address/ratings`     | Submit a community rating            |
| `GET`  | `/api/v1/health`                      | Health check                         |

---

## Tech Stack

| Layer          | Technology                               |
|----------------|------------------------------------------|
| Framework      | Next.js 14 (App Router)                  |
| Language       | TypeScript 5.x                           |
| ORM            | Prisma                                   |
| Database       | Supabase (PostgreSQL)                    |
| Blockchain     | Viem 2.x + Wagmi 2.x (Avalanche C-Chain)|
| Styling        | Tailwind CSS + shadcn/ui                 |
| Charts         | Recharts                                 |
| State          | TanStack Query                           |
| Testing        | Vitest                                   |
| Hosting        | Vercel                                   |

---

## Testing

```bash
npx vitest run
```

The test suite covers 24 tests across 9 test files, including unit tests for each sentinel, the TRACER scoring engine, and the orchestrator.

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full production deployment guide, including database migrations, environment variables, Vercel configuration, and post-deploy verification steps.

---

## License

MIT
