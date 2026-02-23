# Auditoría del Scoring TRACER — Super Sentinel

**Auditor:** Arquitecto Senior de Seguridad Criptográfica
**Fecha:** 2026-02-23
**Archivos auditados:**
- `src/sentinels/scoring/tracer.ts` (149 líneas)
- `src/sentinels/scoring/types.ts` (79 líneas)
- `src/sentinels/scoring/index.ts` (17 líneas)
- `src/sentinels/__tests__/tracer.test.ts` (211 líneas)
- `src/services/trust-score-service.ts` (705 líneas)

---

## 1. Tabla de Hallazgos por Severidad

| # | Severidad | Hallazgo | Archivo | Línea |
|---|-----------|----------|---------|-------|
| H1 | **CRÍTICO** | Dos mappings sentinel→dimensión contradictorios | tracer.ts:31-42 vs types.ts:67-78 | 31, 67 |
| H2 | **CRÍTICO** | Sin clamp de inputs — scores >100 o <0 inflan/deflactan TRACER | tracer.ts:109 | 109 |
| H3 | **ALTO** | Gaming: agente falso puede alcanzar ~65 sin funcionalidad real | tracer.ts (diseño) | — |
| H4 | **ALTO** | Legacy da 50 sin ratings vs TRACER da 0 — resultados contradictorios | trust-score-service.ts:378 vs tracer.ts:59 | 378, 59 |
| H5 | **MEDIO** | Doble redondeo pierde hasta ±1 punto en TRACER total | tracer.ts:58,65,133 | 58 |
| H6 | **MEDIO** | `oz-match` contribuye doble peso efectivo (trust + capability) | tracer.ts:34 | 34 |
| H7 | **MEDIO** | SENTINEL_TO_DIMENSION exportado pero nunca usado + incorrecto | types.ts:67-78, tracer.ts:24 | 67, 24 |
| H8 | **BAJO** | sentinelCount es ambiguo — mezcla sentinels reales + reputation inyectado | tracer.ts:139 | 139 |
| H9 | **BAJO** | Sin validación de sentinel names desconocidos — se ignoran silenciosamente | tracer.ts:106 | 106 |
| H10 | **BAJO** | Timestamp no es determinista — dificulta reproducibilidad de tests | tracer.ts:145 | 145 |

---

## 2. Análisis Detallado

### H1 — CRÍTICO: Dos mappings contradictorios

**Problema:** Existen DOS mappings sentinel→dimensión que no coinciden.

**tracer.ts:31-42** (el que realmente se usa):
```typescript
const SENTINEL_DIMENSIONS: Record<string, Array<keyof typeof TRACER_WEIGHTS>> = {
  tls: ['trust'],
  proxy: ['trust'],
  'oz-match': ['trust', 'capability'],  // ← Feeds DOS dimensiones
  health: ['reliability'],
  latency: ['reliability'],
  mcp: ['autonomy'],
  a2a: ['autonomy'],
  'on-chain': ['capability'],
  x402: ['economics'],
  ratings: ['reputation'],
};
```

**types.ts:67-78** (exportado públicamente pero NUNCA usado):
```typescript
export const SENTINEL_TO_DIMENSION: Record<string, keyof typeof TRACER_WEIGHTS> = {
  tls: 'trust',
  proxy: 'trust',
  'oz-match': 'trust',          // ← Solo feed UNA dimensión
  health: 'reliability',
  latency: 'reliability',
  mcp: 'autonomy',
  a2a: 'autonomy',
  'on-chain': 'capability',
  x402: 'economics',
  ratings: 'reputation',
};
```

**Diferencias:**
1. `types.ts` mapea `oz-match` solo a `trust`. `tracer.ts` lo mapea a `trust` Y `capability`.
2. `types.ts` usa `Record<string, string>` (1:1). `tracer.ts` usa `Record<string, string[]>` (1:N).
3. El build emite warning: `SENTINEL_TO_DIMENSION is defined but never used` (confirmado en output de `npm run build`).

**Impacto:** Cualquier consumidor externo que importe `SENTINEL_TO_DIMENSION` obtiene datos incorrectos. El scoring real usa el mapping local de `tracer.ts`.

**Prueba:**
```typescript
// Consumidor externo usa types.ts:
import { SENTINEL_TO_DIMENSION } from './scoring/types';
// SENTINEL_TO_DIMENSION['oz-match'] === 'trust'  ← INCOMPLETO

// Pero el motor real en tracer.ts usa:
// SENTINEL_DIMENSIONS['oz-match'] === ['trust', 'capability']  ← CORRECTO
```

**Fix recomendado:**
```typescript
// types.ts — Reemplazar SENTINEL_TO_DIMENSION con:
export const SENTINEL_TO_DIMENSIONS: Record<string, Array<keyof typeof TRACER_WEIGHTS>> = {
  tls: ['trust'],
  proxy: ['trust'],
  'oz-match': ['trust', 'capability'],
  health: ['reliability'],
  latency: ['reliability'],
  mcp: ['autonomy'],
  a2a: ['autonomy'],
  'on-chain': ['capability'],
  x402: ['economics'],
  ratings: ['reputation'],
};

// tracer.ts — Eliminar SENTINEL_DIMENSIONS local, importar desde types.ts
import { SENTINEL_TO_DIMENSIONS } from './types';
// Usar SENTINEL_TO_DIMENSIONS en lugar de SENTINEL_DIMENSIONS
```

---

### H2 — CRÍTICO: Sin clamp de inputs

**Problema:** `calculateTRACER` no valida que los scores de entrada estén en rango [0, 100]. Un sentinel con bug que devuelva score=200 o score=-50 corrompe el TRACER.

**tracer.ts:104-113:**
```typescript
for (const result of results) {
  const dimensions = SENTINEL_DIMENSIONS[result.sentinel];
  if (!dimensions) continue;
  for (const dim of dimensions) {
    dimensionScores[dim].push(result.score); // ← Sin clamp
  }
}
```

**tracer.ts:57-58 (buildDimension):**
```typescript
const score = scores.length > 0
  ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  : 0;
// ← score puede ser >100 o <0 si inputs son inválidos
```

**Prueba matemática — Score inflado:**
```
Input: [{ sentinel: 'tls', score: 200 }]
Trust dimension: score = Math.round(200/1) = 200
weighted = Math.round(200 * 0.20 * 100) / 100 = 40.00
Total = Math.round(40.00) = 40  ← PARTIAL con un solo sentinel!

Con score correcto de 100: Total = Math.round(20.00) = 20 ← FAIL
Diferencia: 40 vs 20 — el doble.
```

**Prueba matemática — Score negativo:**
```
Input: [{ sentinel: 'health', score: -100 }, { sentinel: 'latency', score: 100 }]
Reliability: avg = Math.round((-100 + 100) / 2) = 0
weighted = 0

Pero si inverted:
Input: [{ sentinel: 'health', score: -100 }, { sentinel: 'latency', score: -100 }]
Reliability: avg = -100
weighted = Math.round(-100 * 0.20 * 100) / 100 = -20.00
Total podría ser negativo.
```

**Fix recomendado:**
```typescript
// tracer.ts:109 — Agregar clamp al push:
dimensionScores[dim].push(Math.max(0, Math.min(100, result.score)));

// tracer.ts:117-118 — Clamp reputationScore también:
if (reputationScore !== undefined) {
  dimensionScores.reputation.push(Math.max(0, Math.min(100, reputationScore)));
}

// tracer.ts:133-136 — Clamp total por seguridad:
const total = Math.max(0, Math.min(100, Math.round(
  trust.weighted + reliability.weighted + autonomy.weighted +
  capability.weighted + economics.weighted + reputation.weighted
)));
```

---

### H3 — ALTO: Gaming del score por agentes falsos

**Problema:** Un servidor malicioso puede obtener score ~65 (PARTIAL) sin ninguna funcionalidad real de agente AI, simplemente respondiendo correctamente a las probes de los sentinels.

**Receta para agente falso:**

| Sentinel | Cómo engañar | Score obtenido |
|----------|-------------|----------------|
| health | `HEAD /health` → 200 | 100 |
| tls | Cert válido de Railway (gratis) | 80 |
| latency | Responder rápido (servidor vacío es rápido) | 100 |
| a2a | Servir JSON estático en `/.well-known/agent-card.json` | 80-95 |
| mcp | Servir respuesta fake a `tools/list` con tools inventados | 100 |
| x402 | `HEAD /` → 402 con headers copiados de un agente real | 90 |

**Cálculo del score falso:**
```
Trust (tls=80): 80 * 0.20 = 16.0
Reliability (health=100, latency=100): 100 * 0.20 = 20.0
Autonomy (mcp=100, a2a=95): 97.5 → 98 * 0.15 = 14.7
Capability: 0 * 0.20 = 0
Economics (x402=90): 90 * 0.10 = 9.0
Reputation: 0 * 0.15 = 0

Total = 16 + 20 + 14.7 + 0 + 9 + 0 = 59.7 ≈ 60 (PARTIAL)
```

**Con oz-match + on-chain fake (contrato vacío):**
```
Capability (on-chain=60): 60 * 0.20 = 12.0
Total = 60 + 12 = 72 (PASS!)
```

**Debilidad fundamental:** Los sentinels verifican FORMATO, no FUNCIONALIDAD.
- MCP: solo verifica que `tools/list` retorne JSON-RPC válido con tools, no que las tools funcionen
- A2A: solo verifica que el agent card tenga estructura válida, no que las capabilities sean reales
- x402: solo verifica headers, no que el pago realmente funcione

**Mitigaciones posibles (no implementar ahora, para roadmap):**
1. **MCP sentinel mejorado:** Hacer `tools/call` a un tool random y verificar respuesta no-error
2. **A2A sentinel mejorado:** Verificar que `endpoint` en el card responda
3. **x402 sentinel mejorado:** Intentar un micro-pago real ($0.001) y verificar ejecución
4. **Reputation:** Feedback negativo de otros agentes baja el score
5. **Temporal decay:** Scores bajan si no hay actividad reciente

---

### H4 — ALTO: Legacy y TRACER contradictorios

**Problema:** Los dos sistemas de scoring coexisten y pueden dar resultados opuestos para el mismo agente.

**Comparación de dimensiones:**

| Concepto | Legacy (trust-score-service) | TRACER |
|----------|------------------------------|--------|
| Actividad on-chain | Volume (25%) — txs reales | No medido directamente |
| Proxy | Proxy (20%) — detección | Trust (20%) — TLS + proxy + oz-match |
| Disponibilidad | Uptime (25%) — heartbeats | Reliability (20%) — health + latency |
| Código | OZ_Match (15%) — bytecode | Capability (20%) — on-chain + oz-match |
| Comunidad | Ratings (15%) — **50 default** | Reputation (15%) — **0 default** |
| Protocolos AI | **No existe** | Autonomy (15%) — MCP + A2A |
| Pagos | **No existe** | Economics (10%) — x402 |

**Contradicción en ratings sin datos:**

```
trust-score-service.ts:378:
// Sin ratings → score = 50 (neutral)
if (ratings.length === 0) {
  return { score: 50, ... };
}

tracer.ts:59 (via buildDimension):
// Sin ratings → score = 0
const score = scores.length > 0
  ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  : 0;
```

**Caso contradictorio concreto:**

Un agente con alta actividad on-chain pero sin MCP/A2A/x402:
- **Legacy score:** Volume(80) + Proxy(100) + Uptime(90) + OZ(70) + Ratings(50) = 0.25\*80 + 0.20\*100 + 0.25\*90 + 0.15\*70 + 0.15\*50 = 20 + 20 + 22.5 + 10.5 + 7.5 = **80.5 ≈ 81** ("Excelente")
- **TRACER score:** Trust(tls=80) + Reliability(health=100,lat=100) + Autonomy(0) + Capability(0) + Economics(0) + Reputation(0) = 16 + 20 + 0 + 0 + 0 + 0 = **36** (FAIL)

**El mismo agente es "Excelente" en Legacy y "FAIL" en TRACER.**

**¿Se puede eliminar Legacy?**

Sí, con estas condiciones:
1. El campo `Agent.trust_score` en Prisma se migra a usar TRACER
2. Las APIs que retornan `trust_score` devuelven TRACER total
3. El cron job `recalculateAllScores()` se reemplaza por scans sentinel
4. La UI del dashboard se actualiza para mostrar dimensiones TRACER

**Riesgo de eliminar:** Las consultas a `trust-score-service.ts:422-478` (`calculateTrustScore`) y `486-524` (`updateAgentTrustScore`) son usadas por el indexer y las APIs. Requiere migración coordinada.

---

### H5 — MEDIO: Doble redondeo pierde precisión

**Problema:** El scoring redondea 3 veces: (1) promedio de dimensión, (2) peso ponderado, (3) total. Esto puede causar diferencias de ±1 punto.

**tracer.ts:57-58 (Redondeo 1 — promedio):**
```typescript
const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
```

**tracer.ts:65 (Redondeo 2 — weighted):**
```typescript
weighted: Math.round(score * weight * 100) / 100,
```

**tracer.ts:133 (Redondeo 3 — total):**
```typescript
const total = Math.round(trust.weighted + reliability.weighted + ...);
```

**Prueba matemática — Caso de pérdida:**

```
Inputs: tls=77, proxy=78, oz-match=79

Paso 1 (avg trust): Math.round((77+78+79)/3) = Math.round(78) = 78
Paso 2 (weighted): Math.round(78 * 0.20 * 100)/100 = Math.round(1560)/100 = 15.60

Sin redondeo intermedio: (77+78+79)/3 * 0.20 = 78.0 * 0.20 = 15.60
→ Igual en este caso.

Peor caso:
Inputs: tls=33, proxy=33, oz-match=34

Paso 1: Math.round(100/3) = Math.round(33.33) = 33
Paso 2: Math.round(33 * 0.20 * 100)/100 = 6.60

Sin redondeo: (33+33+34)/3 * 0.20 = 33.33... * 0.20 = 6.667
Diferencia: 6.60 vs 6.667 = 0.067 por dimensión.

Si 6 dimensiones tienen error similar: 0.067 * 6 ≈ 0.4
Después de Math.round del total: podría cambiar ±1 punto.
```

**Impacto real:** En la práctica, la diferencia máxima es ±1 punto TRACER. Esto solo importa en los bordes de tier (39→40 = FAIL→PARTIAL, 69→70 = PARTIAL→PASS, 79→80 = PASS→VERIFIED).

**Fix recomendado (opcional, baja prioridad):**
```typescript
// Calcular total con precisión completa, redondear solo al final:
function buildDimension(name: string, weight: number, scores: number[], sources: string[]): TRACERDimension {
  const rawAvg = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;
  const score = Math.round(rawAvg);
  return {
    name, score, weight,
    weighted: rawAvg * weight,  // ← Sin redondear aquí
    sources,
  };
}

// Total: redondear una sola vez
const total = Math.round(
  trust.weighted + reliability.weighted + autonomy.weighted +
  capability.weighted + economics.weighted + reputation.weighted
);
```

---

### H6 — MEDIO: oz-match tiene doble peso efectivo

**Problema:** El sentinel `oz-match` contribuye a DOS dimensiones (trust y capability), lo que le da más influencia que cualquier otro sentinel.

**tracer.ts:34:**
```typescript
'oz-match': ['trust', 'capability'],
```

**Cálculo de influencia:**

Un cambio de Δ=10 en oz-match afecta:
- Si es el único en trust: trust Δ = 10 * 0.20 = 2.0 puntos TRACER
- Si es el único en capability: capability Δ = 10 * 0.20 = 2.0 puntos TRACER
- **Total: Δ = 4.0 puntos TRACER por cada 10 puntos de oz-match**

Comparación con otros sentinels:
| Sentinel | Dimensiones | Peso efectivo |
|----------|-------------|---------------|
| oz-match | trust (0.20) + capability (0.20) | **0.40** (si es único en ambas) |
| tls | trust (0.20) | 0.20 (compartido con proxy y oz-match) |
| health | reliability (0.20) | 0.10 (compartido con latency) |
| x402 | economics (0.10) | 0.10 (único) |
| ratings | reputation (0.15) | 0.15 (único) |

**Cuando oz-match comparte trust con tls y proxy:**
- Peso en trust: oz-match es 1/3 del promedio = 0.20/3 = 0.067
- Peso en capability: si está solo = 0.20
- **Total: 0.067 + 0.20 = 0.267** — sigue siendo el sentinel más influyente

**¿Es intencional?**
Probablemente sí — OZ bytecode matching es evidencia fuerte de calidad de código (Trust) Y de capacidad del contrato (Capability). Pero debería documentarse explícitamente.

**Fix recomendado:** Documentar en el JSDoc, no cambiar la lógica. Si se quiere normalizar, separar oz-match en dos scores diferentes para trust y capability.

---

### H7 — MEDIO: SENTINEL_TO_DIMENSION exportado pero nunca usado

**types.ts:67-78:**
```typescript
export const SENTINEL_TO_DIMENSION: Record<string, keyof typeof TRACER_WEIGHTS> = {
  // ... mapping 1:1
};
```

**tracer.ts:24:**
```typescript
import { SENTINEL_TO_DIMENSION } from './types';
// NEVER USED — build warning confirms this
```

**tracer.ts:31-42:**
```typescript
const SENTINEL_DIMENSIONS: Record<string, Array<...>> = {
  // ... mapping 1:N (used instead)
};
```

**Impacto:**
1. Código muerto exportado públicamente
2. Import no usado genera warning en build
3. Los dos mappings se contradicen (H1)
4. Confunde a desarrolladores que importan el tipo exportado

**Fix recomendado:** Eliminar `SENTINEL_TO_DIMENSION` de types.ts. Mover `SENTINEL_DIMENSIONS` de tracer.ts a types.ts como export.

---

### H8 — BAJO: sentinelCount ambiguo

**tracer.ts:139:**
```typescript
const sentinelCount = results.length + (reputationScore !== undefined ? 1 : 0);
```

**Problema:** `sentinelCount` mezcla sentinels reales ejecutados (`results.length`) con un parámetro inyectado externamente (`reputationScore`). No es posible distinguir cuántos sentinels reales se ejecutaron.

**Fix recomendado:**
```typescript
return {
  total,
  dimensions: { ... },
  tier,
  timestamp: new Date().toISOString(),
  sentinelCount: results.length,
  hasReputationData: reputationScore !== undefined,
};
```

---

### H9 — BAJO: Sentinels desconocidos se ignoran silenciosamente

**tracer.ts:105-106:**
```typescript
const dimensions = SENTINEL_DIMENSIONS[result.sentinel];
if (!dimensions) continue; // ← Silenciosamente ignora
```

**Problema:** Si un sentinel nuevo se agrega al orquestador pero no al mapping, su score se pierde sin aviso. Esto puede causar que un agente con buen score en el nuevo sentinel no reciba crédito.

**Fix recomendado:**
```typescript
if (!dimensions) {
  logger.warn({ sentinel: result.sentinel }, 'Unknown sentinel — not mapped to any TRACER dimension');
  continue;
}
```

---

### H10 — BAJO: Timestamp no determinista

**tracer.ts:145:**
```typescript
timestamp: new Date().toISOString(),
```

**Problema:** El timestamp se genera en runtime, lo que hace que dos llamadas con los mismos inputs produzcan resultados diferentes. Dificulta testing y reproducibilidad.

**Fix recomendado para tests:** El timestamp es correcto para producción. En tests, verificar con regex `expect(tracer.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)`.

---

## 3. Verificación Matemática

### ¿Los pesos suman 100%?

```
trust:       0.20
reliability: 0.20
autonomy:    0.15
capability:  0.20
economics:   0.10
reputation:  0.15
─────────────────
TOTAL:       1.00 ✅
```

Verificado en test existente (tracer.test.ts:177-191):
```typescript
expect(totalWeight).toBeCloseTo(1.0, 10); // ✅ PASS
```

### ¿Un agente perfecto llega a 100?

```
Todos los sentinels score=100, reputationScore=100:

trust:       avg(100,100,100) = 100, weighted = 100 * 0.20 = 20.00
reliability: avg(100,100)     = 100, weighted = 100 * 0.20 = 20.00
autonomy:    avg(100,100)     = 100, weighted = 100 * 0.15 = 15.00
capability:  avg(100,100)     = 100, weighted = 100 * 0.20 = 20.00
economics:   avg(100)         = 100, weighted = 100 * 0.10 = 10.00
reputation:  avg(100)         = 100, weighted = 100 * 0.15 = 15.00

total = Math.round(20+20+15+20+10+15) = 100 ✅
```

Verificado en test existente (tracer.test.ts:31-55): `expect(tracer.total).toBe(100)` ✅

### ¿Un agente vacío llega a 0?

```
0 sentinels, sin reputationScore:

Todas las dimensiones: scores = [], score = 0, weighted = 0
total = Math.round(0) = 0 ✅
```

Verificado en test existente (tracer.test.ts:57-63): `expect(tracer.total).toBe(0)` ✅

### ¿Todos fallando llega a 0?

```
Todos score=0:

trust:       avg(0,0,0) = 0, weighted = 0
reliability: avg(0,0)   = 0, weighted = 0
...
total = 0 ✅
```

**No hay test para este caso.** → Ver sección 5.

### ¿Los tiers tienen gaps u overlaps?

```
classifyTier(score):
  score >= 80  → VERIFIED  (80-100)
  score >= 70  → PASS      (70-79)
  score >= 40  → PARTIAL   (40-69)
  else         → FAIL      (0-39)

Boundary analysis:
  100 → VERIFIED ✅
   80 → VERIFIED ✅
   79 → PASS ✅
   70 → PASS ✅
   69 → PARTIAL ✅
   40 → PARTIAL ✅
   39 → FAIL ✅
    0 → FAIL ✅

Sin gaps, sin overlaps. ✅
```

### ¿Qué score máximo tiene un agente sin Capability ni Reputation?

Este es el caso real actual (ambos agentes a 60/100):

```
trust=80, reliability=100, autonomy=98, capability=0, economics=90, reputation=0

Max teórico sin capability ni reputation:
trust:       100 * 0.20 = 20
reliability: 100 * 0.20 = 20
autonomy:    100 * 0.15 = 15
capability:    0 * 0.20 =  0  ← Techo
economics:   100 * 0.10 = 10
reputation:    0 * 0.15 =  0  ← Techo

Máximo = 20 + 20 + 15 + 0 + 10 + 0 = 65

Techo real: 65/100 — nunca puede pasar de PARTIAL sin Capability y Reputation.
```

---

## 4. Comparación Legacy vs TRACER

### Tabla comparativa

| Aspecto | Legacy (trust-score-service) | TRACER |
|---------|------------------------------|--------|
| **Dimensiones** | 5 (Volume, Proxy, Uptime, OZ, Ratings) | 6 (Trust, Reliability, Autonomy, Capability, Economics, Reputation) |
| **Fuente de datos** | Prisma DB + Routescan API | Sentinels en tiempo real |
| **Latencia** | 0-10s (cache 1h) | 5-15s (scan live) |
| **Sin ratings** | Score = 50 (neutral) | Score = 0 (penaliza) |
| **Sin actividad on-chain** | Volume = 20, Uptime = 0 | No afecta directamente |
| **MCP/A2A** | **No mide** | Autonomy (15%) |
| **x402** | **No mide** | Economics (10%) |
| **Pesos totales** | 1.00 ✅ | 1.00 ✅ |
| **Almacenamiento** | Prisma (TrustScore table) | En memoria (no persiste) |
| **Usado por** | APIs, indexer, dashboard | Scanner CLI, API /sentinel/scan |

### Caso contradictorio documentado

**Agente on-chain activo sin protocolos AI:**

| Componente | Legacy | TRACER |
|-----------|--------|--------|
| Volume/Trust | 80 (alto volumen) | 80 (buen TLS) |
| Proxy/Reliability | 100 (sin proxy) | 100 (healthy) |
| Uptime/Autonomy | 90 (99% uptime) | 0 (sin MCP/A2A) |
| OZ/Capability | 70 (match parcial) | 0 (sin on-chain sentinel) |
| Ratings/Economics | 50 (sin ratings) | 0 (sin x402) |
| Reputation | — | 0 (sin ratings) |
| **TOTAL** | **81** ("Excelente") | **36** (FAIL) |

### ¿Cuál es más preciso?

**TRACER es más preciso** para evaluar agentes AI porque:
1. Mide protocolos que Legacy ignora (MCP, A2A, x402)
2. No da crédito "gratis" por no tener ratings (50 vs 0)
3. Usa datos en tiempo real (sentinels) vs cache stale (Prisma)
4. Tiene 6 dimensiones más granulares vs 5

**Legacy es más útil** para evaluar contratos on-chain porque:
1. Mide volumen de transacciones (actividad real)
2. Mide uptime con heartbeats históricos
3. Persiste scores para consulta rápida

### ¿Se puede eliminar Legacy?

**Sí**, con plan de migración:

1. **Fase 1:** TRACER persiste en DB (crear tabla TRACERScore en Prisma)
2. **Fase 2:** APIs retornan ambos scores durante transición
3. **Fase 3:** Dashboard muestra TRACER como primario
4. **Fase 4:** Eliminar `calculateTrustScore()` y tablas legacy
5. **Fase 5:** Renombrar `Agent.trust_score` a `Agent.tracer_score`

**Archivos a modificar:**
- `src/services/trust-score-service.ts` — Eliminar líneas 1-641
- `src/app/api/v1/agents/[address]/trust-score/route.ts` — Retornar TRACER
- `prisma/schema.prisma` — Agregar TRACERScore model, marcar TrustScore como deprecated

---

## 5. Tests Faltantes

Los tests existentes cubren estructura, tiers, y el caso perfecto/vacío. Faltan estos edge cases críticos:

```typescript
// TESTS PROPUESTOS

describe('TRACER Edge Cases', () => {
  // H2: Input fuera de rango
  it('should clamp sentinel scores > 100 to 100', () => {
    const results = [makeSentinel('tls', 200)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.trust.score).toBeLessThanOrEqual(100);
    expect(tracer.total).toBeLessThanOrEqual(100);
  });

  it('should clamp sentinel scores < 0 to 0', () => {
    const results = [makeSentinel('health', -50)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.reliability.score).toBeGreaterThanOrEqual(0);
    expect(tracer.total).toBeGreaterThanOrEqual(0);
  });

  it('should clamp reputationScore > 100 to 100', () => {
    const tracer = calculateTRACER([], 200);
    expect(tracer.dimensions.reputation.score).toBeLessThanOrEqual(100);
  });

  it('should clamp reputationScore < 0 to 0', () => {
    const tracer = calculateTRACER([], -50);
    expect(tracer.dimensions.reputation.score).toBeGreaterThanOrEqual(0);
  });

  // H3: Gaming detection baseline
  it('should not exceed 65 without capability and reputation sentinels', () => {
    const results = [
      makeSentinel('tls', 100),
      makeSentinel('health', 100),
      makeSentinel('latency', 100),
      makeSentinel('mcp', 100),
      makeSentinel('a2a', 100),
      makeSentinel('x402', 100),
    ];
    const tracer = calculateTRACER(results);
    // Sin capability ni reputation, max = 65
    expect(tracer.total).toBeLessThanOrEqual(65);
    expect(tracer.tier).not.toBe('VERIFIED');
  });

  // H5: Rounding at tier boundaries
  it('should handle rounding at PARTIAL/PASS boundary (69.5 rounds to 70)', () => {
    // Construct scores that produce weighted sum of ~69.5
    const results = [
      makeSentinel('tls', 70),
      makeSentinel('proxy', 70),
      makeSentinel('oz-match', 70),
      makeSentinel('health', 70),
      makeSentinel('latency', 70),
      makeSentinel('mcp', 70),
      makeSentinel('a2a', 70),
      makeSentinel('on-chain', 70),
      makeSentinel('x402', 70),
    ];
    const tracer = calculateTRACER(results, 70);
    // All 70 → total should be exactly 70 → PASS
    expect(tracer.total).toBe(70);
    expect(tracer.tier).toBe('PASS');
  });

  // H6: oz-match double weight
  it('should route oz-match to both trust AND capability', () => {
    const results = [makeSentinel('oz-match', 60)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.trust.score).toBe(60);
    expect(tracer.dimensions.capability.score).toBe(60);
    // Total: 60*0.20 + 60*0.20 = 24
    expect(tracer.total).toBe(24);
  });

  // H9: Unknown sentinel name
  it('should silently ignore unknown sentinel names', () => {
    const results = [
      makeSentinel('health', 100),
      makeSentinel('unknown-sentinel', 100),
    ];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.reliability.score).toBe(100);
    // unknown-sentinel no debe afectar ninguna dimensión
    expect(tracer.total).toBe(20); // solo reliability: 100*0.20
  });

  // All sentinels at 0
  it('should return 0 when all sentinels score 0', () => {
    const results = [
      makeSentinel('tls', 0, false),
      makeSentinel('health', 0, false),
      makeSentinel('latency', 0, false),
      makeSentinel('mcp', 0, false),
      makeSentinel('a2a', 0, false),
      makeSentinel('on-chain', 0, false),
      makeSentinel('x402', 0, false),
    ];
    const tracer = calculateTRACER(results, 0);
    expect(tracer.total).toBe(0);
    expect(tracer.tier).toBe('FAIL');
  });

  // Single sentinel only
  it('should score only the affected dimension with 1 sentinel', () => {
    const results = [makeSentinel('x402', 90)];
    const tracer = calculateTRACER(results);
    expect(tracer.dimensions.economics.score).toBe(90);
    expect(tracer.total).toBe(9); // 90 * 0.10 = 9
    expect(tracer.tier).toBe('FAIL');
  });

  // Duplicate sentinel names
  it('should average duplicate sentinel entries for same name', () => {
    const results = [
      makeSentinel('tls', 80),
      makeSentinel('tls', 60), // duplicate
    ];
    const tracer = calculateTRACER(results);
    // Both go into trust: avg(80,60) = 70
    expect(tracer.dimensions.trust.score).toBe(70);
  });
});
```

---

## 6. Resumen de Prioridades

| Prioridad | Hallazgo | Esfuerzo | Impacto |
|-----------|----------|----------|---------|
| **P0** | H2: Clamp inputs [0,100] | 15 min | Previene corrupción de scores |
| **P0** | H1: Unificar mappings | 30 min | Elimina contradicción + código muerto |
| **P1** | H3: Documentar gaming risk | 1h | Transparencia del modelo |
| **P1** | H4: Plan migración Legacy→TRACER | 4h | Elimina sistema contradictorio |
| **P2** | H5: Single-round en total | 30 min | ±1 punto de precisión |
| **P2** | H9: Log sentinel desconocido | 5 min | Debugging |
| **P3** | H6: Documentar doble peso oz-match | 10 min | Claridad |
| **P3** | H8: Separar sentinelCount | 10 min | Claridad API |

**Tiempo total estimado para P0+P1:** ~5.5 horas.
**Tiempo para tests faltantes:** ~2 horas.

---

*Auditoría TRACER v1.0 — Super Sentinel — 2026-02-23*
