# Data Flows

## Flow 1: Agent Registration

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant API as API /register
    participant RPC as Avalanche RPC
    participant DB as PostgreSQL (Prisma)

    User->>Frontend: Connect wallet
    Frontend->>Frontend: Capture wallet address
    User->>Frontend: Fill form (address, name, type)
    Frontend->>API: POST /api/v1/agents/register
    API->>API: Validate with Zod schema
    API->>RPC: verifyContractExists(address)
    alt Contract not found
        RPC-->>API: No bytecode
        API-->>Frontend: 502 ContractNotFoundError
    end
    RPC-->>API: Contract exists
    API->>RPC: readAgentMetadata() (name, type, billing)
    RPC-->>API: ERC-804 metadata
    API->>DB: prisma.agent.create(status: PENDING)
    DB-->>API: Agent created
    API-->>Frontend: 201 { agent }
    Frontend->>Frontend: Redirect to /agents/{address}
```

## Flow 2: Indexer Discovery (Cron)

```mermaid
sequenceDiagram
    participant Cron as Vercel Cron (every 3h)
    participant API as /api/cron/indexer
    participant Routescan as Routescan API
    participant DB as PostgreSQL (Prisma)
    participant Trust as Trust Score Service

    Cron->>API: GET /api/cron/indexer
    API->>API: Verify CRON_SECRET
    API->>Routescan: Fetch Transfer events (paginated, 50/page)
    loop Each page (max 20)
        Routescan-->>API: Transfer events
        API->>API: Filter mint events (from = 0x0)
        API->>API: deriveAgentAddress(registry + tokenId)
        loop Each new agent
            API->>Routescan: Fetch tokenURI metadata
            Routescan-->>API: Agent metadata (JSON)
            API->>DB: Upsert agent (status: VERIFIED)
        end
    end
    API->>Trust: recalculateAllScores()
    loop Each agent
        Trust->>DB: Read volume, heartbeats, ratings, proxy
        Trust->>Trust: Apply weighted formula
        Trust->>DB: Upsert TrustScore snapshot
        Trust->>DB: Update agent.trust_score
    end
    API-->>Cron: { indexed, skipped, failed, duration }
```

## Flow 3: Trust Score Calculation

```mermaid
flowchart TD
    Start([Calculate Trust Score]) --> Parallel

    subgraph Parallel["Parallel Data Collection"]
        V[Query TransactionVolume<br/>24h period]
        P[Read agent.is_proxy<br/>agent.proxy_type]
        U[Query HeartbeatLogs<br/>last 24h]
        O[Read TrustScore snapshot<br/>ozMatch data]
        R[Query Ratings<br/>avg score]
    end

    Parallel --> VCalc["Volume Score<br/>1000+ AVAX → 100<br/>500+ → 80, 100+ → 60<br/>10+ → 40, else → 20"]
    Parallel --> PCalc["Proxy Score<br/>No proxy → 100<br/>Declared → 80<br/>Hidden → 0"]
    Parallel --> UCalc["Uptime Score<br/>99%+ → 100, 95%+ → 90<br/>90%+ → 70, 80%+ → 50<br/>else → 25"]
    Parallel --> OCalc["OZ Match Score<br/>80%+ → 100, 50%+ → 70<br/>20%+ → 40, else → 20"]
    Parallel --> RCalc["Ratings Score<br/>avg_rating / 5 × 100<br/>No ratings → 50"]

    VCalc --> Formula["Trust Score =<br/>(Volume × 0.25) +<br/>(Proxy × 0.20) +<br/>(Uptime × 0.25) +<br/>(OZ Match × 0.15) +<br/>(Ratings × 0.15)"]

    PCalc --> Formula
    UCalc --> Formula
    OCalc --> Formula
    RCalc --> Formula

    Formula --> Save[Save TrustScore snapshot<br/>+ Update agent.trust_score]
```

## Flow 4: Agent Query (API)

```mermaid
sequenceDiagram
    actor Client as External Client
    participant MW as Middleware
    participant API as /api/v1/agents/:address
    participant DB as PostgreSQL (Prisma)

    Client->>MW: GET /api/v1/agents/{address}/trust-score
    MW->>MW: Check rate limit (100/min per IP)
    alt Rate limited
        MW-->>Client: 429 + Retry-After header
    end
    MW->>MW: Add security headers
    MW->>API: Forward request
    API->>API: Validate address (Zod)
    API->>DB: Find agent by address
    alt Agent not found
        DB-->>API: null
        API-->>Client: 404 NotFoundError
    end
    DB-->>API: Agent record
    API->>DB: Get latest TrustScore (< 1h old?)
    alt Cached score available
        DB-->>API: TrustScore snapshot
    else No cache
        API->>API: calculateTrustScore() (fresh)
    end
    API-->>Client: 200 { score, breakdown, lastUpdated }
```

## Flow 5: Rating Submission

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant Wallet as Wallet (MetaMask)
    participant API as /api/v1/agents/:address/ratings
    participant Auth as Auth Utils (viem)
    participant DB as PostgreSQL

    User->>Frontend: Select stars (1-5) + comment
    Frontend->>Wallet: signMessage(nonce + timestamp)
    Wallet-->>Frontend: signature (0x...)
    Frontend->>API: POST { score, comment, signature, userAddress }
    API->>API: Validate with Zod
    API->>Auth: verifyWalletSignature(signature)
    Auth->>Auth: Check timestamp (< 5 min)
    Auth->>Auth: Recover address from signature
    alt Invalid signature or expired
        Auth-->>API: Error
        API-->>Frontend: 401 UnauthorizedError
    end
    API->>DB: Check daily limit (20/day per wallet)
    API->>DB: Check cooldown (1h between updates)
    API->>DB: Upsert rating (agent + user unique)
    DB-->>API: Rating created/updated
    API-->>Frontend: 201 { rating }
    Frontend->>Frontend: Invalidate queries, show toast
```

## Trust Score Ranges

| Range | Label | Color | Description |
|-------|-------|-------|-------------|
| 80-100 | Excellent | Green | Highly trusted, all signals positive |
| 60-79 | Good | Blue | Generally trusted, minor concerns |
| 40-59 | Medium | Yellow | Use with caution, some flags |
| 0-39 | Low | Red | Not recommended, significant issues |
