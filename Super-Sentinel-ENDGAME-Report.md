ENDGAME REPORT

Super Sentinel — Lo que falta

SUPER SENTINEL
ERC-8004 Scan

ENDGAME REPORT — Lo que falta para produccion

Fecha: 25 de Febrero de 2026  |  Commit: 69c44d0
Tiempo estimado para completar: ~5 horas
Tiempo para desbloquear (Pasos 1-2): ~2 horas

2 BLOQUEADORES
La app esta rota sin esto

2 FUNCIONALIDAD
Roto o inconsistente

4 DEUDA TECNICA
No bloquea, ensucia

1. Bloqueadores — La app esta rota sin esto

Estos issues impiden el uso normal de la plataforma. Los ratings y reports no funcionan porque el backend fue
actualizado con auth de nonce pero el frontend no se sincronizo.

#

Bloqueador

Impacto

B1

Frontend ratings/reports no envia
nonce ni timestamp

Usuarios NO pueden dar ratings ni reportar agentes. El backend
rechaza con 400 Validation Error porque Zod exige nonce y
timestamp que el frontend no envia.

B2  Migracion Prisma pendiente para

auth_nonces

La tabla auth_nonces no existe en la DB. El auth con nonce
crashea con 'table does not exist' en cualquier rating o report.

B1: Detalle del problema en frontend

El backend (validation.ts) ahora requiere nonce y timestamp en createRatingSchema y createReportSchema.
Sin embargo:

rating-form.tsx:16 → Usa SIGN_MESSAGE estatico: 'Sign this message to verify your wallet ownership on
Enigma'

rating-form.tsx:64 → Firma con mensaje viejo, no envia nonce ni timestamp en el body

report-modal.tsx:31 → Mismo SIGN_MESSAGE estatico

report-modal.tsx:91 → Misma firma sin nonce

El flujo correcto que debe implementarse:

1. const { nonce, timestamp } = await fetch('/api/v1/auth/nonce')
2. const message = buildSignMessage({ action: 'rate', nonce, timestamp })
3. const signature = await signMessageAsync({ message })
4. submitMutation.mutate({ score, comment, signature, userAddress, nonce, timestamp })

Cyberpaisa / ERC-8004 Scan

Pagina 1

ENDGAME REPORT

Super Sentinel — Lo que falta

B2: Migracion Prisma

El modelo AuthNonce esta definido en schema.prisma pero no tiene migracion SQL. La tabla auth_nonces no
existe en la base de datos.

npx prisma migrate dev --name add-auth-nonces

2. Funcionalidad Rota

Issues que causan comportamiento inconsistente o datos incorrectos.

#

Issue

Detalle

F1  Edge function centinela usa

heartbeat viejo

supabase/functions/centinela/ sigue usando solo getCode()
mientras el servicio Next.js ya tiene checks multi-nivel. Resultados
inconsistentes entre ambos.

F2  No hay limpieza de nonces

expirados

La tabla auth_nonces crece infinitamente. Cada rating/report crea
un registro. No hay cron ni proceso de cleanup.

F1: Edge function desincronizada

El archivo supabase/functions/centinela/index.ts usa solo getCode() (linea 78, 153) como heartbeat. El servicio
Next.js (src/services/centinela/heartbeat-service.ts) ya fue mejorado con checks multi-nivel. Si ambos corren,
los resultados en heartbeat_logs seran inconsistentes.

F2: Nonces sin limpieza

Cada rating o report crea un registro en auth_nonces. Sin cleanup, la tabla crece indefinidamente. Se debe
agregar al cron existente:

await prisma.authNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } })

3. Deuda Tecnica

Issues que no bloquean pero ensucian el codebase y pueden causar confusion.

#

Issue

Archivo

Fix

D1  mockSparkData() genera graficos

falsos en scanner

agent-card.tsx:27 agent-
table.tsx:78

Mostrar indicador 'Sin datos' en
vez de datos simulados

D2

D3

D4

database.ts es placeholder
desactualizado

src/types/database.ts:6

Regenerar con supabase gen
types o eliminar

avgResponseTime divide por passed
en vez de por conteo real

TODO en indexer-service.ts para
testnet address

trust-score-service.ts:196

Dividir por validHeartbeats.length

indexer-service.ts:19

Verificar address o limpiar
comentario

Cyberpaisa / ERC-8004 Scan

Pagina 2

ENDGAME REPORT

Super Sentinel — Lo que falta

4. Variables de Entorno Pendientes

Estas variables deben configurarse en Vercel o Railway antes del deploy:

Variable

ADMIN_SECRET

CRON_SECRET

NEXT_PUBLIC_SITE_URL

IP_HASH_SALT

UPSTASH_REDIS_REST_URL

UPSTASH_REDIS_REST_TOKEN

Requerida

Para que

SI

SI

SI

Rec.

Rec.

Rec.

Auth de endpoints indexer (debug, refresh, sync)

Auth de cron jobs en produccion

CORS origin para API endpoints

Salt para hash de IPs (tiene fallback)

Rate limiting persistente entre deploys

Rate limiting persistente entre deploys

5. Orden de Ejecucion

Plan paso a paso para llegar a produccion. Los pasos 1 y 2 son bloqueadores; el resto se puede hacer
incrementalmente.

Paso

Tiempo

Tarea

Ref

1

2

3

4

5

6

7

8

9

5 min

1-2 hrs

5 min

15 min

30 min

15 min

2-3 hrs

5 min

5 min

Correr migracion Prisma para auth_nonces

Actualizar rating-form.tsx y report-modal.tsx
con flujo nonce

Fix avgResponseTime division

Agregar limpieza de nonces en cron job

Reemplazar mockSparkData con indicador Sin
datos

Regenerar o eliminar database.ts placeholder

Sincronizar edge function centinela con heartbeat
mejorado

Setear variables de entorno en Vercel/Railway

Deploy a produccion

B2

B1

D3

F2

D1

D2

F1

ENV

GO

Validado sobre commit 69c44d0 del repo Cyberpaisa/super-sentinel

Cyberpaisa / ERC-8004 Scan

Pagina 3

