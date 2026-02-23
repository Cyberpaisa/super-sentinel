# Auditoría de Seguridad y Viabilidad — Survival Engine, x402, Heartbeat, Identity

**Fecha**: 2026-02-23
**Commit auditado**: `9648c8d`
**Rama**: `feat/sentinel-integration`
**Auditor**: Claude Opus 4.6
**Archivos revisados**: 16 (12 nuevos, 4 modificados)

---

## Resumen Ejecutivo

| Severidad | Cantidad |
|-----------|----------|
| CRÍTICO | 2 |
| ALTO | 4 |
| MEDIO | 5 |
| BAJO | 4 |
| **Total** | **15** |

**Score de viabilidad**: **6/10** — El sistema es arquitectónicamente sólido pero tiene una vulnerabilidad crítica en el flujo de pagos (no verifica firmas) y el survival engine es parcialmente cosmético en su estado actual.

---

## Tabla de Hallazgos

### CRÍTICOS — NO PUSH hasta arreglar

| # | Hallazgo | Archivo | Línea | Impacto | Fix |
|---|----------|---------|-------|---------|-----|
| C1 | **Verificación de pago x402 es un TODO** — cualquier header falso bypasea el paywall | `src/lib/middleware/x402-payment.ts` | 114-124 | Cualquiera envía `X-Payment-Token: fake` y obtiene scans gratis. El middleware acepta cualquier valor. | Implementar verificación real: (a) validar JWT del facilitador, o (b) verificar firma EIP-712 y confirmar transferencia on-chain via `eth_getTransactionReceipt`. Sin esto, la monetización es ficción. | ~4h |
| C2 | **El survival loop NO reduce funcionalidad realmente** — `shouldReduceFunctionality` retorna un booleano pero nadie lo consume | `src/survival/survival-loop.ts` + `src/app/api/v1/sentinel/scan/route.ts` | — | El scan handler no consulta el survival status. Si `tier === 'DEAD'`, el agente sigue sirviendo scans. El "earn your existence" es marketing, no realidad. | El `scanHandler` debe llamar `getSurvivalStatus()` al inicio y retornar 503 si `shouldReduceFunctionality === true`. El heartbeat ya muestra el tier correcto, pero el enforcement no existe. | ~1h |

### ALTOS — Arreglar antes de producción

| # | Hallazgo | Archivo | Línea | Impacto | Fix |
|---|----------|---------|-------|---------|-----|
| A1 | **Heartbeat expone balance del wallet públicamente** sin rate limiting | `src/app/api/v1/heartbeat/route.ts` | 13 | Un atacante puede monitorear el balance exacto del agente en tiempo real. Cuando vea balance bajo, puede spamear el endpoint gratis para agotar RPC calls y acelerar la muerte. | Agregar rate limiting al heartbeat (ej. 10 req/min). Considerar redondear el balance ("~$40" en vez de "$42.50"). | ~30min |
| A2 | **Quick-check sin rate limiting** — endpoint gratis ilimitado | `src/app/api/v1/sentinel/quick-check/route.ts` | — | Endpoint gratuito ejecuta `checkHealth` + `checkTLS` que hacen requests HTTP reales al agente target. Un atacante puede hacer miles de quick-checks para: (a) agotar compute del Super Sentinel, (b) hacer DDoS indirecto al agente target. | Agregar rate limiting: 30 req/min por IP. Ya existe `rate-limiter-flexible` en dependencias pero no se aplica a esta ruta. | ~30min |
| A3 | **Earnings tracker no registra earnings realmente** — el scan handler no llama `recordEarning()` | `src/app/api/v1/sentinel/scan/route.ts` | — | Aunque `recordScan()` se llama, `EarningsTracker.getInstance().recordEarning()` nunca se invoca. El earnings tracker siempre reportará $0.00 de ingresos. El survival loop verá earnings=0 permanentemente. | Después de verificar el pago en el middleware, extraer txHash y amount, y llamar `EarningsTracker.getInstance().recordEarning(...)`. Esto requiere que C1 se arregle primero. | ~1h (depende de C1) |
| A4 | **Pérdida total de datos en cada restart** — earnings y costs son in-memory | `src/survival/earnings-tracker.ts`, `cost-tracker.ts` | — | Un restart del proceso (deploy en Vercel, crash, etc.) borra todo el historial de earnings y costs. El survival loop pierde contexto y `consecutiveLossHours` vuelve a 0. | Para MVP: aceptable. Para producción: persistir en Supabase o Redis. El `consecutiveLossHours` debería guardarse en la base de datos. | ~4h |

### MEDIOS — Aceptable para beta

| # | Hallazgo | Archivo | Línea | Impacto | Fix |
|---|----------|---------|-------|---------|-----|
| M1 | **AGENT_WALLET_ADDRESS fallback a zero address** — si no se configura, `getBalance()` lee el balance de `0x000...000` que es ~$0 | `src/survival/types.ts` | 97 | Sin la env var, el agente siempre será tier DEAD. No crashea, pero el heartbeat mostrará datos incorrectos. | Agregar validación: si `AGENT_WALLET_ADDRESS` es zero address, log warning y retornar tier UNKNOWN en vez de DEAD. | ~30min |
| M2 | **Credit monitor bloquea el heartbeat** si RPC no responde | `src/heartbeat/index.ts` → `src/survival/survival-loop.ts` → `src/survival/credit-monitor.ts` | — | `getBalance()` hace `readContract()` que puede timeout (10s). Si Avalanche RPC está caído, cada heartbeat tarda 10s+ antes de fallar. No hay cache. | Agregar cache de 60s al resultado de `getBalance()`. Si el RPC falla, usar el último valor conocido. | ~1h |
| M3 | **Cost estimates son estáticos y posiblemente incorrectos** | `src/survival/cost-tracker.ts` | 17-22 | `COST_PER_RPC_CALL = $0.0001` es una estimación. Los RPCs públicos de Avalanche son gratis. Si se usa un proveedor pagado, el costo varía enormemente. Los costos de Vercel no están incluidos. | Hacer los costos configurables via env vars. Agregar costo de Vercel Function invocations (~$0.40/100K). Documentar que los valores default son para RPC público. | ~1h |
| M4 | **Quick-check no valida el parámetro `endpoint`** — acepta cualquier URL | `src/app/api/v1/sentinel/quick-check/route.ts` | 27 | Si alguien pasa `endpoint=http://169.254.169.254/latest/meta-data/` podría hacer SSRF (Server-Side Request Forgery) contra la infraestructura interna. | Validar que `endpoint` empieza con `https://` y no resuelve a IP privada. Rechazar IPs RFC1918/loopback. | ~1h |
| M5 | **Comparación de timestamps como strings en earnings tracker** | `src/survival/earnings-tracker.ts` | 34 | `r.timestamp >= cutoff` compara ISO strings lexicográficamente. Funciona para ISO-8601 (orden lexicográfico = cronológico), pero es frágil. Un timezone offset diferente rompería la comparación. | Usar `new Date(r.timestamp).getTime() >= Date.now() - windowMs` para comparación numérica. | ~15min |

### BAJOS — Mejora recomendada

| # | Hallazgo | Archivo | Línea | Impacto | Fix |
|---|----------|---------|-------|---------|-----|
| B1 | **`withX402ScanPayment` es dead code** — se exporta pero no se usa en ningún lado | `src/lib/middleware/x402-payment.ts` | 142-151 | Confusión: hay dos wrappers (`withX402Payment` y `withX402ScanPayment`). Solo se usa el primero. | Eliminar `withX402ScanPayment` o usarlo en el scan route. | ~5min |
| B2 | **SOUL.md dice "If my balance reaches zero, I stop"** pero el código no lo hace (ver C2) | `SOUL.md` | 28 | El documento de identidad hace una promesa que el código no cumple. Violación de Article 3 de constitution.md (transparencia). | Arreglar C2 primero, o editar SOUL.md para reflejar la realidad actual. | ~5min |
| B3 | **README dice "165 tests"** pero este número cambiará con cada feature | `README.md` | 10 | Se volverá stale. | Cambiar a "165+" o quitar el número exacto. | ~1min |
| B4 | **Constitution.md Article 5 dice "scores are mine, no external entity can override"** pero un admin de Supabase sí puede | `constitution.md` | Art. 5 | Discrepancia entre el principio y la arquitectura (PostgreSQL centralizado). | Aspiracional, aceptable para fase actual. Documentar como limitación conocida. | — |

---

## Análisis de Viabilidad Económica

### Pregunta 1: ¿$0.50 por scan es razonable?

**Sí, es competitivo.** Comparación:

| Servicio | Precio | Qué ofrece |
|----------|--------|------------|
| Super Sentinel | $0.50 | 11 sentinels + TRACER 6-dimension score |
| SSL Labs API | Gratis (rate limited) | Solo TLS/SSL análisis |
| VirusTotal API | $0.001-$0.01/query | Malware scanning (diferente dominio) |
| Chainalysis API | $0.50-$5/query | Risk scoring para addresses |
| Certik Audit | $50K-$500K | Auditoría manual completa |

**Veredicto**: $0.50 es un sweet spot — suficientemente barato para uso frecuente, suficientemente alto para cubrir costos.

### Pregunta 2: ¿Los costos estimados son realistas?

| Componente | Costo real | Lo que dice el código | Discrepancia |
|------------|-----------|----------------------|-------------|
| RPC Avalanche (público) | **$0** | $0.0001/call | El RPC público es gratis. Infogain/Ankr cobran ~$0.001 en tier pagado. |
| Vercel Hosting (Hobby) | **$0/mes** | $0.01/hora ($7.20/mes) | Vercel Hobby es gratis. Pro es $20/mes. Serverless functions: $0.40/100K invocaciones. |
| Vercel Hosting (Pro) | **$20/mes** | — | No incluido |
| Vercel Functions | **~$0.002/scan** | No incluido | Cada scan invoca ~6 HTTP calls + computación |
| Supabase | **$0 (free tier) / $25/mes (Pro)** | No incluido | Base de datos para persistencia |

**Costo real estimado**:
- Free tier: ~$0.05/día (solo function invocations)
- Pro tier: ~$1.50/día ($20 Vercel + $25 Supabase ÷ 30)

**Break-even real**:
- Free tier: **1 scan cada 10 días** (casi nada)
- Pro tier: **3 scans/día** (~$1.50)

### Pregunta 3: ¿1-2 scans/día es alcanzable?

Con 1,621 agentes en ERC-8004:
- Si 1% escanean mensualmente = 16 scans/mes ≈ 0.5/día → **insuficiente para Pro**
- Si 5% escanean mensualmente = 81 scans/mes ≈ 2.7/día → **viable para Pro**
- Scans automatizados entre agentes mejorarían significativamente

**Veredicto**: Viable en free tier desde día 1. Para Pro, necesita adopción del 5% de agentes registrados o scans automatizados.

### Pregunta 4: ¿El survival loop funciona de verdad?

**Parcialmente.** El monitoreo es real (balance on-chain, earnings, costs). Pero el enforcement es cosmético:

| Componente | ¿Funciona? | Detalle |
|------------|-----------|---------|
| `getBalance()` | SI | Lee balance real via RPC |
| `classifyTier()` | SI | Clasificación correcta |
| `EarningsTracker` | NO (ver A3) | Nunca se registran earnings |
| `CostTracker` | PARCIAL | Nadie llama `recordRPCCall()` en el código de producción |
| `shouldReduceFunctionality` | SI (lógica) | Pero nadie lo consume (ver C2) |
| `survival-loop` | PARCIAL | Agrega datos pero earnings=0 siempre |

### Pregunta 5: ¿Qué pasa si nadie paga?

Con `X402_PAYMENT_ENABLED=false` (default): El agente funciona normalmente, scans gratis, survival engine reporta lo que haya en el wallet. No muere.

Con `X402_PAYMENT_ENABLED=true` y nadie paga: El agente retorna 402 en scans pero quick-check y heartbeat siguen funcionando. El survival tier baja pero (por C2) no se aplica restricción real.

---

## Análisis x402 Payment Flow

| Pregunta | Respuesta | Severidad |
|----------|-----------|-----------|
| ¿Verificación de firma implementada? | **NO — es un TODO (líneas 114-124)**. El middleware acepta cualquier header como válido. | CRÍTICO (C1) |
| ¿Alguien puede obtener scan gratis? | **SÍ** — enviando `X-Payment-Token: anything` bypasea el paywall completamente. | CRÍTICO (C1) |
| ¿Qué pasa si el RPC está caído al recibir pago? | No aplica — el middleware no verifica on-chain actualmente. Cuando se implemente, necesitará retry con backoff. | FUTURO |
| ¿Race conditions con pagos simultáneos? | No aplica — no hay estado compartido en la verificación actual. Cuando se implemente, usar nonce o txHash como idempotency key. | FUTURO |
| ¿Precio hardcodeado o configurable? | **Hardcodeado** (`500000` en X402_CONFIG). No hay env var para el precio. | MEDIO |
| ¿Se valida que el pago es en USDC? | **NO** — el middleware no verifica el token usado. Solo verifica que existe un header. | CRÍTICO (parte de C1) |

---

## Análisis de Resiliencia

| Escenario | ¿Qué pasa? | Severidad |
|-----------|------------|-----------|
| `AGENT_WALLET_ADDRESS` no configurado | Lee balance de zero address → tier DEAD → heartbeat muestra "dying" | MEDIO (M1) |
| RPC de Avalanche caído | `getBalance()` falla → heartbeat degrades a "degraded" por el try/catch | MEDIO (M2) |
| Restart del proceso | Pierde earnings, costs, consecutiveLossHours, scanCount | ALTO (A4) |
| Heartbeat con survival fallido | Muestra tier="UNKNOWN", balance="$0.00", status="degraded" | OK (graceful) |
| Quick-check con bug en checkHealth | `Promise.allSettled` aísla el fallo — retorna `null` para ese check | OK (resiliente) |

---

## Red Flags Legales/Éticas

| Pregunta | Respuesta | Riesgo |
|----------|-----------|--------|
| ¿Cobrar por scans es legal? | Sí — es un servicio de análisis. No hay regulación específica contra cobrar por verificación de agentes. | BAJO |
| ¿Mostrar balance públicamente? | Riesgo operacional, no legal. Un competidor puede ver cuándo el agente está débil. | MEDIO (A1) |
| ¿SOUL.md promete cosas que el código no cumple? | SÍ — "If my balance reaches zero, I stop" no está implementado (C2, B2). | MEDIO |
| ¿README hace claims no verificables? | Los claims de pricing y arquitectura son verificables en código. El claim de "165 tests" es verificable con `vitest run`. | BAJO (B3) |
| ¿Constitution.md Article 5 es enforceable? | No en arquitectura centralizada (Supabase). Un admin puede alterar scores en la DB. | BAJO (aspiracional) |

---

## Priorización: Plan de Acción

### BLOQUEAN DEPLOY (arreglar primero)

| # | Acción | Tiempo | Depende de |
|---|--------|--------|-----------|
| C1 | Implementar verificación real de firma x402 o deshabilitar el paywall hasta que esté listo | 4h | — |
| C2 | Agregar enforcement: scanHandler consulta survival status y retorna 503 si `shouldReduceFunctionality` | 1h | — |

### ANTES DE PRODUCCIÓN

| # | Acción | Tiempo | Depende de |
|---|--------|--------|-----------|
| A1 | Rate limit en heartbeat | 30min | — |
| A2 | Rate limit en quick-check | 30min | — |
| A3 | Conectar EarningsTracker al flujo de pago real | 1h | C1 |
| M4 | Validar SSRF en endpoint parameter de quick-check | 1h | — |

### ACEPTABLE PARA BETA

| # | Acción | Tiempo | Depende de |
|---|--------|--------|-----------|
| A4 | Persistir earnings/costs en DB | 4h | — |
| M1 | Validar zero address en AGENT_WALLET_ADDRESS | 30min | — |
| M2 | Cache de 60s en getBalance() | 1h | — |
| M3 | Costos configurables via env vars | 1h | — |
| M5 | Comparación numérica de timestamps | 15min | — |
| B1 | Eliminar withX402ScanPayment dead code | 5min | — |
| B2 | Alinear SOUL.md con realidad del código | 5min | C2 |
| B3 | Quitar número exacto de tests del README | 1min | — |

---

## Score de Viabilidad: 6/10

**Justificación**:

| Criterio | Score | Razón |
|----------|-------|-------|
| Arquitectura | 8/10 | Módulos bien separados, tipos fuertes, patrones consistentes |
| Seguridad del pago | 2/10 | Verificación es TODO — cualquiera obtiene scans gratis |
| Survival enforcement | 3/10 | Monitoreo real, enforcement cero |
| Resiliencia | 6/10 | Graceful degradation existe pero sin persistencia |
| Viabilidad económica | 7/10 | Pricing competitivo, break-even alcanzable en free tier |
| Documentación | 9/10 | README, SOUL, Constitution, auditorías completas |
| **Promedio** | **6/10** | |

Para llegar a **8/10**: arreglar C1 (verificación de pagos) y C2 (enforcement de survival). Para **9/10**: agregar persistencia (A4) y rate limiting (A1, A2).

---

*Generado por Claude Opus 4.6 — Auditoría de seguridad y viabilidad económica*
