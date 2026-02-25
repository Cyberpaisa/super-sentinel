# Security Audit Changelog — Super Sentinel

**Fecha:** 25 Feb 2026
**Commits:** `0754062` → `0bea22b` (5 commits en main)
**Auditor:** @Cyberpaisa

---

## TL;DR

Se aplicaron 18 fixes de seguridad de la auditoría completa. **Next.js subió a 15 con React 19**, se agregó Vitest, y el middleware de rate limiting ahora usa Upstash Redis. Si tienes una rama activa, haz `git rebase main` y resuelve conflictos.

---

## Breaking Changes (para tu rama)

### 1. React 19 + Next.js 15
- `package.json`: `next@15`, `react@19`, `react-dom@19`, `lucide-react@latest`
- `useRef()` ahora requiere valor inicial: `useRef<T>(undefined)` en vez de `useRef<T>()`
- `<Suspense>` requiere `fallback` prop: `<Suspense fallback={null}>`
- Si usas `useSearchParams()` o `params` en rutas, ya están OK

### 2. Auth con Nonce (anti-replay)
- `src/lib/utils/auth.ts` — **REESCRITO COMPLETO**
  - `verifyWalletSignature()` ahora requiere 5 params: `(address, signature, nonce, timestamp, action)`
  - Antes: `verifyWalletSignature(address, signature)`
  - Nuevo endpoint: `GET /api/v1/auth/nonce` genera nonce + timestamp
- `src/lib/utils/validation.ts` — `createRatingSchema` y `createReportSchema` ahora requieren `nonce` y `timestamp`
- `prisma/schema.prisma` — Nuevo model `AuthNonce` (tabla `auth_nonces`)

### 3. Middleware reescrito
- `src/middleware.ts` — Ahora usa `@upstash/ratelimit` + `@upstash/redis`
  - Fallback a `RateLimiterMemory` si no hay `UPSTASH_REDIS_REST_URL`
  - La lógica de Supabase auth se mantiene igual

---

## Archivos Modificados (por riesgo de conflicto)

### Alto riesgo — Reescritos o con cambios grandes
| Archivo | Qué cambió |
|---|---|
| `package.json` | Next 15, React 19, +upstash, +vitest, +lucide-react update |
| `package-lock.json` | Regenerado completo |
| `src/middleware.ts` | Reescrito con Upstash rate limiter |
| `src/lib/utils/auth.ts` | Reescrito con nonce+timestamp |
| `src/lib/utils/validation.ts` | +nonce, +timestamp en rating/report schemas |
| `prisma/schema.prisma` | +AuthNonce model |
| `src/services/centinela/oz-matcher.ts` | containsSelector reescrito (EVM dispatcher parsing) |
| `src/services/centinela/heartbeat-service.ts` | executeHeartbeatPing reescrito (multi-level checks) |

### Medio riesgo — Cambios quirúrgicos pero en zonas activas
| Archivo | Qué cambió |
|---|---|
| `next.config.js` | +security headers, +CORS headers |
| `ratings/route.ts` | +nonce params, +Sybil protection (txCount check) |
| `reports/route.ts` | +nonce params |
| `src/services/centinela/proxy-detector.ts` | hasDelegatecallPattern reescrito (opcode walker) |

### Bajo riesgo — Pocas líneas cambiadas
| Archivo | Qué cambió |
|---|---|
| `src/app/api/v1/indexer/debug/route.ts` | +auth guard (7 líneas al inicio) |
| `src/app/api/v1/indexer/refresh/route.ts` | +auth guard (7 líneas al inicio) |
| `src/app/api/v1/indexer/sync/route.ts` | +auth guard (7 líneas al inicio) |
| `src/app/api/v1/agents/activity/route.ts` | +days param validation (5 líneas) |
| `src/app/api/cron/indexer/route.ts` | Fix auth bypass (2 líneas) |
| `src/services/routescan-indexer-service.ts` | +isUrlSafe() SSRF function |
| `src/lib/blockchain/client.ts` | +fallback RPC providers (mainnet only) |
| `src/lib/utils/api-helpers.ts` | Suppress console.error in prod (3 líneas) |
| `src/app/api/v1/agents/register/route.ts` | Sanitize log (1 línea) |
| `src/app/api/v1/visitors/track/route.ts` | Hash IPs con SHA-256 |
| `src/components/shared/navigation-progress.tsx` | React 19 compat (2 líneas) |
| `.env.example` | +ADMIN_SECRET, +CRON_SECRET, +IP_HASH_SALT, +UPSTASH vars |

### Sin conflicto — Archivos nuevos
- `src/app/api/v1/auth/nonce/route.ts`
- `tests/auth.test.ts`
- `tests/oz-matcher.test.ts`
- `tests/proxy-detector.test.ts`
- `tests/ssrf-validation.test.ts`
- `vitest.config.ts`

---

## Nuevas Variables de Entorno

```bash
ADMIN_SECRET=           # Auth para endpoints de indexer (requerido en prod)
CRON_SECRET=            # Auth para cron jobs (requerido en prod)
IP_HASH_SALT=           # Salt para hash de IPs (opcional, tiene fallback)
UPSTASH_REDIS_REST_URL= # Rate limiting persistente (opcional, fallback a memoria)
UPSTASH_REDIS_REST_TOKEN=
```

---

## Cómo resolver si tienes una rama activa

```bash
git checkout tu-rama
git fetch origin
git rebase origin/main

# Resolver conflictos archivo por archivo
# Los más probables: package.json, middleware.ts, auth.ts, validation.ts

# Después de resolver:
npm install
npx prisma generate
npx tsc --noEmit
npm test
```

---

## Tests

```bash
npm test        # Corre 29 tests
npm run test:watch  # Watch mode
```
