Super Sentinel

Security Audit Validation Report

SUPER SENTINEL
ERC-8004 Scan

REPORTE DE VALIDACION DE AUDITORIA DE SEGURIDAD

Fecha: 25 de Febrero de 2026
Repo: Cyberpaisa/super-sentinel (156 commits + 6 security commits)
Stack: Next.js 15 | TypeScript | Prisma | Supabase | Viem | Avalanche C-Chain
Agentes Indexados: 1,621

CRITICO
5/5 resueltos

ALTO
4/4 resueltos

MEDIO
6/6 resueltos

EXTRAS
4 tests + docs

1. Resumen Ejecutivo

Se realizo una auditoria de seguridad completa del repositorio Super Sentinel (ERC-8004 Scan). Se
identificaron 5 hallazgos criticos, 4 altos y 6 medios. Todos los hallazgos fueron resueltos en 6 commits
consecutivos, incluyendo la actualizacion de Next.js 14 a 15, React 19, sistema de autenticacion con nonce
anti-replay, y mejoras en los motores de verificacion Centinela.

El proyecto pasa de un estado de MVP funcional a un estado production-ready con hardening de seguridad
completo. Los cambios abarcan autenticacion, proteccion de endpoints, seguridad de headers HTTP,
prevencion de ataques SSRF/Sybil/replay, y mejoras en la precision del Trust Score.

2. Hallazgos Criticos (5/5 Resueltos)

Estos hallazgos bloqueaban el deploy a produccion. Todos fueron resueltos.

#

Hallazgo

Estado

Verificacion

C1

Endpoints indexer sin auth

FIXED

Los 3 endpoints (debug, refresh, sync) tienen guard
ADMIN_SECRET

C2

C3

C4

SQL injection en activity

FIXED

Validacion isNaN + rango 1-3650 antes del raw query

Next.js 14 vulnerable

Sin security headers

FIXED

Subido a Next.js 15.5.12 + React 19.2.4

FIXED

6 headers + CORS configurado en next.config.js

C5

Firma sin nonce (replay attack)

FIXED

Auth con nonce+timestamp+action, modelo AuthNonce
en Prisma, endpoint /api/v1/auth/nonce

Confidencial — Cyberpaisa / ERC-8004 Scan

Pagina 1

Super Sentinel

Security Audit Validation Report

Detalle de cambios criticos

C1 - Endpoints indexer: Se agrego guard ADMIN_SECRET al inicio de los handlers GET/POST en debug,
refresh y sync. Sin el header Authorization: Bearer <secret>, retorna 401.

C2 - Raw SQL activity: Se valida que days sea un entero entre 1 y 3650. Si es NaN o fuera de rango, retorna
400 antes de llegar al raw query de Prisma.

C3 - Next.js upgrade: Se actualizo de Next.js 14.2 a 15.5.12 con React 19.2.4. Se ajusto lucide-react y
componentes para compatibilidad con React 19 (useRef con valor inicial, Suspense con fallback).

C4 - Security headers: Se agregaron X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-
Policy, Permissions-Policy, Strict-Transport-Security en next.config.js. Tambien CORS headers para /api/*.

C5 - Auth con nonce: El sistema de autenticacion fue reescrito completamente. Ahora requiere nonce
(generado por /api/v1/auth/nonce), timestamp, y accion especifica. Los nonces se guardan en tabla
auth_nonces para prevenir reuso. Firmas expiran en 5 minutos.

3. Hallazgos Altos (4/4 Resueltos)

Estos hallazgos afectaban la precision del Trust Score y la resistencia a manipulacion.

#

Hallazgo

Estado

Verificacion

A1

Heartbeat solo getCode()

FIXED

executeHeartbeatChecks() con checks multi-nivel

A2

OZ matcher substring match

FIXED

A3

Proxy detector falsos positivos

FIXED

extractDispatcherSelectors() parsea opcodes EVM
reales

hasDelegatecallPattern() camina opcodes con PUSH
skip

A4

Sin proteccion Sybil en ratings

FIXED

Verifica getTransactionCount > 0 antes de permitir rating

Detalle de cambios altos

A1 - Heartbeat mejorado: executeHeartbeatPing ahora ejecuta checks multi-nivel en lugar de solo getCode().
Verifica existencia del contrato, intenta llamar funciones ERC-165/ERC-8004, y mide tiempo de respuesta real.

A2 - OZ Matcher con dispatcher: containsSelector fue reescrito con extractDispatcherSelectors() que parsea
el bytecode como instrucciones EVM reales, identificando el bloque dispatcher (PUSH4 + EQ + JUMPI) y
extrayendo solo selectors reales.

A3 - Proxy detector fix: hasDelegatecallPattern ahora camina el bytecode instruccion por instruccion,
saltando los bytes de datos de PUSH1-PUSH32, para encontrar solo el opcode 0xF4 real y no coincidencias
en datos.

A4 - Proteccion Sybil: Antes de permitir un rating, se verifica que la wallet tenga al menos 1 transaccion on-
chain (getTransactionCount > 0). Esto previene farm de reputacion con wallets recien creadas.

4. Hallazgos Medios (6/6 Resueltos)

#

M1

M2

Hallazgo

Estado

Verificacion

Rate limiter en memoria

FIXED

Upstash Redis con fallback a memoria

IPs sin hash

FIXED

SHA-256 con salt configurable

Confidencial — Cyberpaisa / ERC-8004 Scan

Pagina 2

Super Sentinel

M3

M4

M5

M6

SSRF en tokenURI

Single RPC

Cron auth bypass

Sin CORS

Security Audit Validation Report

FIXED

isUrlSafe() bloquea IPs internas/privadas

FIXED

Fallback a publicnode + ankr (solo mainnet)

FIXED

Fail-secure: requiere CRON_SECRET en produccion

FIXED

CORS headers en /api/* con origin configurable

5. Extras Implementados

Test Suite: Se agrego Vitest con 4 archivos de tests: auth.test.ts, oz-matcher.test.ts, proxy-detector.test.ts,
ssrf-validation.test.ts

Documentacion: Se creo SECURITY-AUDIT-CHANGELOG.md con documentacion completa de todos los
cambios, breaking changes, y guia de resolucion de conflictos para ramas activas.

.env.example: Actualizado con todas las variables nuevas: ADMIN_SECRET, CRON_SECRET,
IP_HASH_SALT, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.

6. Historial de Commits

Commit

0754062

efccacd

7167a1a

dd985df

0bea22b

69c44d0

Descripcion

fix(security): apply week-1 security audit fixes

fix(security): apply week-2 security audit fixes

fix(security): apply week 3-4 high-severity audit fixes

fix(deps): update lucide-react to support React 19

fix(security): apply backlog audit fixes + add test suite

docs: add security audit changelog for team reference

7. Pendientes para Deploy

Los siguientes pasos son necesarios para completar el deploy a produccion:

#

1

2

3

Tarea Pendiente

Detalle

Correr migracion de Prisma

Setear variables en Vercel/Railway

Actualizar frontend (ratings/reports)

npx prisma migrate dev --name add-auth-
nonces

ADMIN_SECRET, CRON_SECRET,
IP_HASH_SALT, UPSTASH_*

Pedir nonce de /api/v1/auth/nonce antes de
firmar

Auditoria validada sobre commit 69c44d0 del repo Cyberpaisa/super-sentinel

Confidencial — Cyberpaisa / ERC-8004 Scan

Pagina 3

