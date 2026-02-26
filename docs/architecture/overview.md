# System Architecture

## High-Level Diagram

```mermaid
graph TB
    subgraph Frontend["Frontend (Next.js 14 App Router)"]
        Landing[Landing Page]
        Scanner[Scanner / Directory]
        Profile[Agent Profile]
        Register[Register Agent]
        Docs[Documentation]
    end

    subgraph API["API Layer (Next.js API Routes)"]
        AgentsAPI["/agents<br/>(list, detail, register)"]
        TrustAPI["/trust-score<br/>/trust-history"]
        RatingsAPI["/ratings<br/>/reports"]
        IndexerAPI["/indexer<br/>(refresh, sync, debug)"]
        HealthAPI["/health<br/>/visitors"]
    end

    subgraph Services["Services Layer"]
        AgentSvc[Agent Service<br/>CRUD + Filtering]
        TrustSvc[Trust Score Service<br/>Weighted Formula]

        subgraph Centinela["Centinela Engine"]
            Heartbeat[Heartbeat Service<br/>Contract Pings]
            ProxyDet[Proxy Detector<br/>EIP-1967 Analysis]
            OZMatch[OZ Matcher<br/>Bytecode Comparison]
        end

        IndexerSvc[Indexer Service<br/>Agent Discovery]
        BlockchainSvc[Blockchain Service<br/>RPC Interactions]
    end

    subgraph Data["Data Layer"]
        Prisma[(PostgreSQL<br/>via Prisma ORM<br/>hosted on Supabase)]
    end

    subgraph Blockchain["Avalanche C-Chain"]
        Registry[ERC-8004<br/>Identity Registry]
        Agents[Agent Smart Contracts<br/>ERC-804 Compliant]
    end

    subgraph External["External Services"]
        Routescan[Routescan API<br/>Block Explorer]
        Sentry[Sentry<br/>Error Tracking]
        Vercel[Vercel<br/>Hosting + Cron]
    end

    Frontend -->|TanStack Query| API
    API --> Services
    Services --> Prisma
    Services -->|viem| Blockchain
    IndexerSvc -->|Paginated Fetch| Routescan
    Vercel -->|Cron every 3h| IndexerAPI
    API -.->|Errors| Sentry

    classDef frontend fill:#1e293b,stroke:#4ADE80,color:#e5e7eb
    classDef api fill:#1e293b,stroke:#22d3ee,color:#e5e7eb
    classDef service fill:#1e293b,stroke:#fcd34d,color:#e5e7eb
    classDef data fill:#1e293b,stroke:#a78bfa,color:#e5e7eb
    classDef blockchain fill:#1e293b,stroke:#fb7185,color:#e5e7eb
```

## Request Lifecycle

```mermaid
flowchart LR
    Client([Client Request]) --> MW[Middleware]
    MW --> RL{Rate Limit<br/>Check}
    RL -->|Exceeded| R429[429 Too Many Requests]
    RL -->|OK| SEC[Add Security Headers]
    SEC --> AUTH{Supabase Session<br/>Refresh}
    AUTH --> Route[API Route Handler]
    Route --> Val{Zod<br/>Validation}
    Val -->|Invalid| R400[400 ValidationError]
    Val -->|Valid| Svc[Service Layer]
    Svc --> DB[(Database)]
    DB --> Res[Format Response]
    Res --> Client
```

## System Components

### Frontend (Next.js App)

**Responsibilities**:
- Render UI (landing, scanner, agent profile, docs)
- Connect wallet (wagmi + viem)
- Consume REST API via TanStack Query
- Client-side validation (Zod)

**Does NOT**:
- Direct blockchain queries (delegates to API)
- Direct database queries (only via API)
- Business logic (trust score, proxy detection)

### Backend (Next.js API Routes)

**Responsibilities**:
- Expose REST endpoints (20 routes)
- Validate requests (Zod schemas)
- Authenticate wallets (verify signatures with viem)
- Database queries via Prisma ORM
- Avalanche RPC queries (via viem with fallback transport)
- Rate limiting (100/min default, 5/hour registration)
- Structured logging (Pino)

### Indexer (Background Job)

**Responsibilities**:
- Run every 3 hours via Vercel Cron
- Scan ERC-8004 Identity Registry for new agents via Routescan API
- Resolve agent metadata from tokenURI (data URIs, HTTP, base64)
- Generate deterministic pseudo-addresses from registry + tokenId
- Recalculate trust scores for all agents after indexing

### Centinela (Verification Engine)

**Responsibilities**:
- **Heartbeat**: Ping agent contracts to verify uptime (checks bytecode + name() call)
- **Proxy Detection**: Analyze EIP-1967 storage slots + delegatecall bytecode patterns
- **OZ Matcher**: Compare bytecode against OpenZeppelin function selectors and event topics

### Database (Supabase PostgreSQL + Prisma)

**Responsibilities**:
- Persist agents, trust scores, ratings, reports, heartbeat logs
- Transaction volume tracking by period
- User and watchlist management
- API key storage and validation
- Daily platform metrics
- Visitor tracking
