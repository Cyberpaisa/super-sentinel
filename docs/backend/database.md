# Database Schema (Supabase + Prisma)

## Entity Relationship Diagram

```mermaid
erDiagram
    Agent ||--o{ TrustScore : "has many"
    Agent ||--o{ Rating : "has many"
    Agent ||--o{ Report : "has many"
    Agent ||--o{ HeartbeatLog : "has many"
    Agent ||--o{ TransactionVolume : "has many"
    Agent ||--o{ ScannerResult : "has many"
    User ||--o{ Watchlist : "has many"
    User ||--o{ ApiKey : "has many"
    Watchlist ||--o{ WatchlistItem : "has many"
    WatchlistItem }o--|| Agent : "references"

    Agent {
        string address PK "Contract address (0x...)"
        string name
        enum type "TRADING|LENDING|GOVERNANCE|ORACLE|CUSTOM"
        string description
        string owner_address
        string billing_address
        enum status "PENDING|VERIFIED|FLAGGED|SUSPENDED"
        int trust_score "0-100"
        boolean is_proxy
        enum proxy_type "NONE|EIP1967|BEACON|TRANSPARENT|UUPS|CUSTOM"
        string implementation_address
        json metadata
        datetime created_at
        datetime updated_at
    }

    TrustScore {
        string id PK
        string agent_id FK
        float volume_score "0-1"
        float proxy_score "0-1"
        float uptime_score "0-1"
        float oz_match_score "0-1"
        float community_score "0-1"
        float overall_score "0-100"
        json snapshot_data
        datetime calculated_at
    }

    Rating {
        string id PK
        string agent_id FK
        string user_address
        int rating "1-5"
        string review "max 280 chars"
        string tx_hash
        datetime created_at
        datetime updated_at
    }

    Report {
        string id PK
        string agent_id FK
        string reporter_address
        enum reason "PROXY_HIDDEN|INCONSISTENT_BEHAVIOR|SCAM|OTHER"
        string description
        enum status "OPEN|REVIEWING|RESOLVED|DISMISSED"
        datetime created_at
        datetime resolved_at
    }

    HeartbeatLog {
        string id PK
        string agent_address FK
        datetime timestamp
        enum challenge_type "PING|CHALLENGE_RESPONSE"
        enum result "PASS|FAIL|TIMEOUT"
        int response_time_ms
        string error_message
    }

    TransactionVolume {
        string id PK
        string agent_address FK
        enum period "DAY|WEEK|MONTH|ALL_TIME"
        int tx_count
        decimal volume_avax
        decimal volume_usd
        datetime updated_at
    }

    User {
        string id PK
        string wallet_address UK
        string display_name
        string avatar_url
        boolean is_admin
        datetime created_at
    }

    Watchlist {
        string id PK
        string user_id FK
        string name
        datetime created_at
    }

    WatchlistItem {
        string id PK
        string watchlist_id FK
        string agent_id FK
        datetime added_at
    }

    ScannerResult {
        string id PK
        string agent_id FK
        enum scan_type "bytecode|transaction|pattern|full"
        enum status "pending|running|completed|failed"
        json findings
        datetime created_at
    }

    ApiKey {
        string id PK
        string user_id FK
        string name
        string key_hash UK
        string[] permissions
        int rate_limit
        boolean is_active
        datetime expires_at
    }

    DailyMetric {
        string id PK
        date date UK
        int total_agents
        int new_agents
        int verified_agents
        int total_scans
        int total_ratings
        int active_users
        float avg_trust_score
    }

    Visitor {
        string id PK
        string ip_address UK
        int visit_count
        datetime first_visit_at
        datetime last_visit_at
    }
```

## Key Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `agents` | `type` | Filter by agent type |
| `agents` | `status` | Filter by status |
| `agents` | `trust_score DESC` | Sort by trust score |
| `trust_scores` | `agent_id, calculated_at DESC` | Latest score per agent |
| `ratings` | `agent_id, user_address` (unique) | One rating per user per agent |
| `reports` | `agent_id, reporter_address` (unique) | One report per user per agent |
| `heartbeat_logs` | `agent_address, timestamp DESC` | Recent heartbeats per agent |
| `transaction_volumes` | `agent_address, period` (unique) | One record per agent per period |

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

> Full schema: [`prisma/schema.prisma`](../../prisma/schema.prisma) (418 lines)

## Migrations

```bash
# Create new migration
npx prisma migrate dev --name add_feature

# Apply migrations in production
npx prisma migrate deploy

# Reset DB (development only)
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate

# Open visual DB browser
npx prisma studio
```

## Common Queries

```typescript
// services/agent-service.ts
import { prisma } from '@/lib/database/prisma';

// List agents with filters
const agents = await prisma.agent.findMany({
  where: {
    type,
    status,
    trust_score: { gte: minTrustScore, lte: maxTrustScore },
  },
  include: {
    trustScores: { orderBy: { calculatedAt: 'desc' }, take: 1 },
    ratings: true,
  },
  orderBy: { trust_score: 'desc' },
  skip: (page - 1) * limit,
  take: limit,
});

// Upsert rating (one per user per agent)
await prisma.rating.upsert({
  where: { agentId_userAddress: { agentId, userAddress } },
  update: { rating: score, review: comment },
  create: { agentId, userAddress, rating: score, review: comment },
});
```
