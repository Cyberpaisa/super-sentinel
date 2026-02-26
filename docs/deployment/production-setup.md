# Production Setup & Configuration Guide

## Infrastructure Overview

```mermaid
graph TB
    subgraph Users["Users"]
        Browser([Browser])
        ExtAPI([External API Clients])
    end

    subgraph Vercel["Vercel (Hosting)"]
        CDN[CDN / Edge Network]
        NextJS[Next.js Runtime<br/>SSR + API Routes]
        Cron[Vercel Cron<br/>Every 3 hours]
    end

    subgraph Supabase["Supabase (Database)"]
        PgBouncer[PgBouncer<br/>Connection Pooling]
        PostgreSQL[(PostgreSQL<br/>Database)]
        DirectConn[Direct Connection<br/>for Migrations]
    end

    subgraph Avalanche["Avalanche C-Chain"]
        RPC1[Primary RPC<br/>api.avax.network]
        RPC2[Fallback RPC<br/>Ankr]
        Registry[ERC-8004<br/>Identity Registry]
        Contracts[Agent Smart Contracts]
    end

    subgraph Monitoring["Monitoring"]
        Sentry[Sentry<br/>Error Tracking]
        VercelAnalytics[Vercel Analytics<br/>Performance]
        SpeedInsights[Speed Insights<br/>Web Vitals]
    end

    subgraph BlockExplorer["Block Explorer"]
        Routescan[Routescan API<br/>Event Indexing]
    end

    Browser --> CDN
    ExtAPI --> CDN
    CDN --> NextJS
    Cron -->|GET /api/cron/indexer| NextJS
    NextJS -->|DATABASE_URL| PgBouncer
    PgBouncer --> PostgreSQL
    NextJS -->|DIRECT_URL| DirectConn
    DirectConn --> PostgreSQL
    NextJS -->|viem| RPC1
    RPC1 -.->|fallback| RPC2
    RPC1 --> Registry
    RPC1 --> Contracts
    NextJS -->|Routescan API| Routescan
    Routescan --> Registry
    NextJS -.-> Sentry
    NextJS -.-> VercelAnalytics
    NextJS -.-> SpeedInsights
```

## Deployment Pipeline

```mermaid
flowchart LR
    Dev[Developer] -->|git push| GH[GitHub<br/>main branch]

    subgraph CI["GitHub Actions CI"]
        Lint[Lint + Type Check]
        Test[Vitest<br/>80% coverage]
        Build[Next.js Build<br/>+ Prisma Generate]
        Lint --> Test --> Build
    end

    GH --> CI
    CI -->|All pass| Deploy

    subgraph Deploy["Vercel Deploy"]
        Preview[Preview Deploy<br/>on PR]
        Prod[Production Deploy<br/>on main merge]
    end

    Deploy --> Live([Live at<br/>your-domain.com])
```

## Step-by-Step Production Setup

### 1. Supabase Project

```mermaid
flowchart TD
    A[Create Supabase Project] --> B[Get connection strings]
    B --> C[DATABASE_URL<br/>pooled via PgBouncer :6543]
    B --> D[DIRECT_URL<br/>direct connection :5432]
    B --> E[SUPABASE_URL + Keys]
    C --> F[Used by: App runtime queries]
    D --> G[Used by: Prisma migrations only]
    E --> H[Used by: Auth + client SDK]
```

1. Go to [supabase.com](https://supabase.com) and create a new project
2. From **Settings > Database**, copy:
   - **Connection string (pooled)** → `DATABASE_URL`
   - **Connection string (direct)** → `DIRECT_URL`
3. From **Settings > API**, copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

4. Run migrations:
```bash
npx prisma migrate deploy
npx prisma generate
```

### 2. Vercel Project

1. Import project from GitHub at [vercel.com](https://vercel.com)
2. Set Framework Preset: **Next.js**
3. Set Build Command: `npm run build` (runs `prisma generate && next build`)
4. Add all environment variables (see section below)
5. Deploy

### 3. Avalanche RPC

```mermaid
flowchart LR
    App[Next.js App] --> Transport[Viem Fallback Transport]
    Transport --> Primary[Primary RPC<br/>NEXT_PUBLIC_AVALANCHE_RPC_URL]
    Transport --> Fallback[Fallback RPC<br/>AVALANCHE_RPC_FALLBACK_URL]
    Primary --> Chain{Chain?}
    Fallback --> Chain
    Chain -->|mainnet| M[Avalanche C-Chain<br/>ChainID: 43114]
    Chain -->|testnet| T[Avalanche Fuji<br/>ChainID: 43113]
```

**Options for RPC providers:**
- Public: `https://api.avax.network/ext/bc/C/rpc` (rate limited)
- Ankr: `https://rpc.ankr.com/avalanche` (free tier available)
- Infura, Alchemy, QuickNode (paid, higher limits)

### 4. WalletConnect

1. Go to [cloud.walletconnect.com](https://cloud.walletconnect.com)
2. Create a new project
3. Copy the **Project ID** → `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

### 5. Sentry

1. Create project at [sentry.io](https://sentry.io) (select Next.js)
2. Copy **DSN** → `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`
3. Create auth token → `SENTRY_AUTH_TOKEN`
4. Note org/project names → `SENTRY_ORG`, `SENTRY_PROJECT`

## Environment Variables

### Required

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anon key (safe for client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Supabase admin key (never expose) |
| `DATABASE_URL` | Server | PostgreSQL via PgBouncer (pooled) |
| `DIRECT_URL` | Server | PostgreSQL direct (for migrations) |
| `NEXT_PUBLIC_CHAIN_ENV` | Public | `mainnet` or `testnet` |
| `NEXT_PUBLIC_AVALANCHE_RPC_URL` | Public | Primary Avalanche RPC URL |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Public | WalletConnect v2 project ID |
| `CRON_SECRET` | Server | Secret for Vercel Cron auth |
| `INDEXER_API_SECRET` | Server | Secret for manual indexer triggers |

### Optional

| Variable | Where | Description |
|----------|-------|-------------|
| `AVALANCHE_RPC_FALLBACK_URL` | Server | Fallback RPC (e.g., Ankr) |
| `NEXT_PUBLIC_SITE_URL` | Public | App URL for SEO/links |
| `SENTRY_DSN` | Server | Sentry DSN (server-side) |
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Sentry DSN (client-side) |
| `SENTRY_ORG` | Build | Sentry organization |
| `SENTRY_PROJECT` | Build | Sentry project name |
| `SENTRY_AUTH_TOKEN` | Build | Sentry deploy auth token |

### Security Rules

```mermaid
flowchart TD
    Var{Variable prefix?}
    Var -->|NEXT_PUBLIC_| Client[Exposed to browser<br/>Safe: URLs, anon keys, chain config]
    Var -->|No prefix| Server[Server-only<br/>Secrets: DB, service keys, tokens]

    Client --> Safe[OK to commit to .env.example<br/>with placeholder values]
    Server --> Danger[NEVER commit real values<br/>Set in Vercel dashboard only]
```

- **NEVER** commit `.env.local` or `.env` with real values
- `NEXT_PUBLIC_*` variables are bundled into client JS — only put safe values
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep it server-side only
- Generate `CRON_SECRET` and `INDEXER_API_SECRET` with: `openssl rand -hex 32`

## Cron Jobs

```mermaid
flowchart LR
    Cron["Vercel Cron<br/>0 */3 * * *<br/>(every 3 hours)"] -->|GET + Bearer CRON_SECRET| Endpoint["/api/cron/indexer"]

    Endpoint --> Index[Index new agents<br/>from Routescan API]
    Index --> Score[Recalculate trust scores<br/>for ALL agents]
    Score --> Done[Return stats<br/>indexed/skipped/failed/duration]
```

**Configuration** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/indexer",
      "schedule": "0 */3 * * *"
    }
  ]
}
```

**Timeout**: 5 minutes max (Vercel Pro plan may be needed for long-running crons).

## Health Monitoring

### Health Check Endpoint

```
GET /api/v1/health
```

Returns:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2026-02-25T14:00:00Z",
  "version": "0.1.0",
  "checks": {
    "database": { "status": "up", "latency_ms": 5 },
    "blockchain": { "status": "up", "latency_ms": 120 }
  }
}
```

| Status | Condition | HTTP |
|--------|-----------|------|
| `healthy` | Both DB and RPC up | 200 |
| `degraded` | One service down | 200 |
| `unhealthy` | Both services down | 503 |

### Monitoring Stack

```mermaid
flowchart TD
    subgraph Errors["Error Tracking"]
        Sentry[Sentry]
        SentryClient[Client errors<br/>10% replay sample]
        SentryServer[Server errors<br/>10% trace sample]
        SentryReplay[100% replay on error]
    end

    subgraph Performance["Performance"]
        VA[Vercel Analytics<br/>Page views, visitors]
        SI[Speed Insights<br/>Core Web Vitals]
    end

    subgraph Logs["Logging"]
        Pino[Pino Logger]
        PinoDev[Development:<br/>debug level, pretty-print]
        PinoProd[Production:<br/>info level, JSON format]
    end

    subgraph Custom["Custom Metrics"]
        Health[/api/v1/health<br/>DB + RPC latency]
        Visitor[/api/v1/visitors/stats<br/>Unique + total visits]
        DailyMetric[DailyMetric table<br/>Agents, scans, ratings]
    end
```

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| General API | 100 requests | 1 minute per IP |
| Registration | 5 requests | 1 hour per IP |
| Ratings | 20 submissions | 24 hours per wallet |
| Rating updates | 1 update | 1 hour cooldown per agent+wallet |
| Reports | 1 report | Per user per agent (permanent) |

Skipped endpoints: `/api/v1/health`, `/api/health`

## Rollback Procedure

```mermaid
flowchart TD
    Problem[Production Issue] --> Type{Type?}

    Type -->|App bug| VercelRollback["Vercel Dashboard<br/>→ Deployments<br/>→ Select previous<br/>→ Promote to Production"]

    Type -->|DB migration| PrismaRollback["npx prisma migrate resolve<br/>--rolled-back migration_name<br/>Then fix and re-migrate"]

    Type -->|Config| EnvFix["Vercel Dashboard<br/>→ Settings<br/>→ Environment Variables<br/>→ Fix value<br/>→ Redeploy"]
```

## Security Checklist

- [ ] All `NEXT_PUBLIC_*` variables contain only safe/public values
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set only in Vercel (never in client code)
- [ ] `CRON_SECRET` and `INDEXER_API_SECRET` generated with `openssl rand -hex 32`
- [ ] Rate limiting middleware active on all API routes
- [ ] Security headers configured (nosniff, DENY framing, XSS protection)
- [ ] Sentry configured and receiving errors
- [ ] Health endpoint responding correctly
- [ ] Vercel Cron running on schedule
- [ ] Database migrations applied cleanly
- [ ] No secrets in git history
