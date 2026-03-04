# Deployment Guide — Super Sentinel

Production deployment guide for the Enigma / Super Sentinel platform — a Next.js 14 application with Prisma ORM, Supabase PostgreSQL, and Vercel hosting.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ (LTS recommended) |
| npm or pnpm | Latest stable |
| Vercel CLI | `npm i -g vercel` |
| Prisma CLI | Included in devDependencies |
| Supabase project | PostgreSQL database provisioned |
| Git | For CI/CD auto-deploy |

Ensure you have access to:
- A **Vercel** account linked to the repository.
- A **Supabase** project with connection pooling (PgBouncer) enabled.
- An **Avalanche RPC** endpoint (public or private).

---

## 1. Database Migration

### 1.1 Apply all pending migrations (including TRACER scores)

The TRACER scoring migration (`20260222_add_tracer_scores`) creates:

- The `TRACERTier` enum (`VERIFIED`, `PASS`, `PARTIAL`, `FAIL`).
- The `tracer_scores` table with 6-dimension scoring columns (`trust`, `reliability`, `autonomy`, `capability`, `economics`, `reputation`).
- Indexes on `agent_address`, `total_score DESC`, `tier`, and `created_at`.
- A foreign key referencing the `agents` table with `ON DELETE CASCADE`.

**To apply migrations against Supabase:**

```bash
# Set the connection strings (use the direct URL, not the pooled one, for migrations)
export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# Apply all pending migrations
npx prisma migrate deploy

# Regenerate the Prisma Client
npx prisma generate
```

> **Important:** `prisma migrate deploy` uses `DIRECT_URL` (bypassing PgBouncer) for DDL operations. The pooled `DATABASE_URL` is used at runtime for queries.

### 1.2 Verify migration

```bash
npx prisma studio
```

Open Prisma Studio and confirm the `TRACERScoreRecord` model appears with the correct columns.

Alternatively, connect to Supabase SQL Editor and run:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'tracer_scores' ORDER BY ordinal_position;
```

---

## 2. Environment Variables

Configure these in Vercel Dashboard > Project Settings > Environment Variables (or via `vercel env`).

### Required

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | Supabase pooled connection string (PgBouncer) | `postgresql://postgres:***@db.xxx.supabase.co:5432/postgres?pgbouncer=true` |
| `DIRECT_URL` | Supabase direct connection (for migrations) | `postgresql://postgres:***@db.xxx.supabase.co:5432/postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | `eyJ...` |

### Blockchain

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_CHAIN_ENV` | Network target: `mainnet` or `testnet` | `testnet` |
| `NEXT_PUBLIC_AVALANCHE_RPC_URL` | Primary Avalanche C-Chain RPC | `https://api.avax-test.network/ext/bc/C/rpc` |
| `AVALANCHE_RPC_FALLBACK_URL` | Fallback RPC endpoint | `https://rpc.ankr.com/avalanche_fuji` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID | `abc123...` |

### Application

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public base URL of the app | `https://enigma.app` |
| `NEXT_PUBLIC_APP_URL` | Used for sitemap/robots generation | `https://enigma.app` |
| `CRON_SECRET` | Bearer token to authenticate Vercel Cron jobs | A random secret string |

### Observability (Optional)

| Variable | Description |
|---|---|
| `SENTRY_DSN` | Server-side Sentry DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry DSN |
| `SENTRY_ORG` | Sentry organization slug |
| `SENTRY_PROJECT` | Sentry project slug |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source map uploads |

---

## 3. Build & Deploy

### Option A: Vercel CLI (manual)

```bash
# Install dependencies
npm install

# Build locally to verify (runs prisma generate + next build)
npm run build

# Deploy to production
vercel deploy --prod
```

### Option B: Git push (CI/CD auto-deploy)

The recommended workflow:

```bash
# Merge to main triggers automatic Vercel production deployment
git checkout main
git merge feat/sentinel-integration
git push origin main
```

Vercel will automatically:
1. Install dependencies.
2. Run `prisma generate && next build` (configured in `package.json` and `vercel.json`).
3. Deploy serverless functions and static assets.
4. Activate the cron job at `/api/cron/indexer` (every 3 hours).

### Vercel Configuration

The `vercel.json` configures:

- **Framework:** `nextjs`
- **Build command:** `prisma generate && next build`
- **Function timeout:** 60s for the `/api/v1/sentinel/scan` route (sentinel scans run multiple checks in parallel).
- **Cron:** Indexer runs every 3 hours (`0 */3 * * *`).
- **Headers:** API routes return `Cache-Control: no-store` to prevent stale responses.

---

## 4. Post-Deploy Verification

### 4.1 Health check

```bash
curl https://YOUR_DOMAIN/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### 4.2 Sentinel scan (TRACER scoring)

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/sentinel/scan \
  -H "Content-Type: application/json" \
  -d '{"address": "0x1234567890abcdef1234567890abcdef12345678"}'
```

Expected response shape:

```json
{
  "success": true,
  "data": {
    "address": "0x1234567890abcdef1234567890abcdef12345678",
    "endpoint": "https://agent-endpoint.example.com",
    "orchestrator": {
      "target": "0x...",
      "timestamp": "2026-02-22T...",
      "results": [
        { "sentinel": "health", "score": 100, "passed": true, "details": {} },
        { "sentinel": "tls", "score": 100, "passed": true, "details": {} },
        { "sentinel": "latency", "score": 85, "passed": true, "details": {} },
        { "sentinel": "x402", "score": 0, "passed": false, "details": {} }
      ],
      "errors": [],
      "summary": { "total": 4, "passed": 3, "failed": 1, "errored": 0, "averageScore": 71 }
    },
    "tracer": {
      "total": 65,
      "dimensions": {
        "trust": 80,
        "reliability": 85,
        "autonomy": 70,
        "capability": 60,
        "economics": 0,
        "reputation": 50
      },
      "tier": "PARTIAL",
      "timestamp": "2026-02-22T...",
      "sentinelCount": 4
    }
  }
}
```

**Key fields to verify:**
- `orchestrator.results` contains individual sentinel outcomes (health, TLS, latency, x402).
- `tracer.dimensions` has all 6 TRACER dimensions populated.
- `tracer.tier` is one of `VERIFIED`, `PASS`, `PARTIAL`, or `FAIL`.

If the agent has no resolvable endpoint, the response will include an error in `orchestrator.errors` with `"sentinel": "resolve"` and `tracer.tier` will be `FAIL`.

### 4.3 Verify the TRACER table in Supabase

```sql
SELECT id, agent_address, total_score, tier, trust, reliability,
       autonomy, capability, economics, reputation, created_at
FROM tracer_scores
ORDER BY created_at DESC
LIMIT 5;
```

---

## 5. Monitoring

### Vercel

- **Function Logs:** Vercel Dashboard > Project > Logs. Filter by `/api/v1/sentinel/scan` to monitor scan latency and errors.
- **Cron Logs:** Vercel Dashboard > Project > Cron Jobs. Verify the indexer cron (`/api/cron/indexer`) runs successfully every 3 hours.
- **Analytics:** `@vercel/analytics` and `@vercel/speed-insights` are included in the build for client-side performance tracking.

### Supabase

- **Database Health:** Supabase Dashboard > Database > Health. Monitor connection pool usage and query performance.
- **Table Inspector:** Supabase Dashboard > Table Editor. Check `tracer_scores` and `agents` tables for data integrity.
- **Logs:** Supabase Dashboard > Logs > Postgres. Watch for slow queries or connection pool exhaustion.

### Sentry (if configured)

- Error tracking and performance monitoring for both server and client.
- Source maps are uploaded during the Vercel build if `SENTRY_AUTH_TOKEN` is set.

### Key alerts to configure

| Check | Action |
|---|---|
| Sentinel scan p95 > 30s | Investigate slow sentinel checks or external endpoint timeouts |
| Cron job failures | Check `CRON_SECRET` and indexer service health |
| Database connection errors | Verify `DATABASE_URL` and PgBouncer pool limits in Supabase |
| TRACER scores not persisting | Check Prisma Client generation and `tracer_scores` FK constraints |

---

## Quick Reference: npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start local development server |
| `npm run build` | Production build (`prisma generate && next build`) |
| `npm run start` | Start production server locally |
| `npm run db:generate` | Regenerate Prisma Client |
| `npm run db:migrate` | Run Prisma migrations (dev) |
| `npm run db:push` | Push schema changes without migration |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run supabase:deploy` | Deploy Supabase Edge Function (centinela) |
