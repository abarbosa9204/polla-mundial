# Polla Mundialista 2026 ⚽🏆

PWA de polla para el **Mundial 2026** con arquitectura **central → réplica** sobre
**Supabase** (Postgres + Realtime por websocket + Auth JWT + RLS). El motor de
puntos es una librería pura compartida entre servidor y cliente, con suite de
tests obligatoria en verde.

> **Estado:** motor de puntos, esquema/seguridad de BD, servidor (poller +
> scoring + endpoints) y PWA completos y testeados. **98 tests en verde.**

## Arquitectura

```
football-data.org ──┐
                    ▼
            ┌──────────────┐   service_role    ┌─────────────────────────┐
            │  SERVIDOR     │ ───(Admin SDK)──► │  Supabase (Postgres)    │
            │  Node/Fastify │                   │  + Realtime (websocket) │
            │  poller+cron  │ ◄── realtime ───  │  + Auth (JWT) + RLS     │
            └──────────────┘                    └───────────┬─────────────┘
                    ▲                                        │ on() websocket (solo lectura, RLS)
                    │ POST /api/pronostico (JWT)             ▼
                    └──────────────────────────────  PWA React (Vercel)
```

- **Solo el servidor** consume la API de fútbol y **escribe** en la BD (clave
  `service_role`, que bypasea RLS). Los clientes son **solo lectura** vía RLS.
- **Realtime de Supabase** replica los cambios a todos los clientes por websocket
  (reemplaza el rol que tendría Firebase). No hay WebSockets propios.
- Los **pronósticos** viajan al servidor, que valida el **cierre (lock)** contra
  su reloj UTC antes de escribir. Nadie puede leer pronósticos ajenos de partidos
  no iniciados (garantizado por RLS, verificado con tests SQL).

## Estructura del repo (monorepo pnpm)

```
packages/
  core/   @polla/core  Motor de puntos PURO + tipos + lock + desempates (52 tests)
  data/   @polla/data  Tipos de tablas, mapeadores a dominio, clientes Supabase (5 tests)
apps/
  server/ @polla/server Poller+normalizador+fallback, scoring, endpoints, cron (41 tests)
  web/    @polla/web    PWA React+Vite+Tailwind, realtime, offline (SW)
supabase/
  migrations/  Esquema + RLS + triggers + realtime + seeds
  apply_all.sql  Todo el esquema en un archivo (pegar en SQL Editor)
  test/        Validación en Docker + tests de seguridad RLS
```

## Puesta en marcha

### 1) Requisitos
- Node ≥ 20, **pnpm** ≥ 9. (`npm i -g pnpm`)
- Cuenta gratuita en [Supabase](https://supabase.com) y token de
  [football-data.org](https://www.football-data.org/client/register).

### 2) Dependencias
```bash
pnpm install
```

### 3) Crear el proyecto Supabase y aplicar el esquema
1. Crea un proyecto (plan **Free**). Habilita **Authentication** → Email + Google.
2. Abre **SQL Editor → New query**, pega el contenido de
   `supabase/apply_all.sql` y pulsa **Run**. Crea tablas, RLS, triggers, realtime
   y semillas.
3. En **Project Settings → API** copia: `Project URL`, clave `anon` y clave
   `service_role`.

### 4) Variables de entorno
```bash
cp .env.example .env   # y rellena los valores (ver tabla en .env.example)
```
- Públicas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- 🔒 Secretas (solo `.env`, nunca a git ni al cliente): `SUPABASE_SERVICE_ROLE_KEY`,
  `FOOTBALL_DATA_TOKEN`.

### 5) Desarrollo
```bash
pnpm --filter @polla/server dev   # servidor central (http://localhost:8787)
pnpm --filter @polla/web dev      # PWA (http://localhost:5173)
```
Para que la PWA llame al servidor en local, añade `VITE_SERVER_URL=http://localhost:8787` al `.env`.

### 6) Tests (obligatorios, sección 9)
```bash
pnpm -r test                       # 98 tests
pwsh supabase/test/validate.ps1    # valida migraciones + seguridad RLS en Docker
```

## Despliegue gratuito (~50 días — Mundial 11 jun–19 jul 2026)

| Pieza | Servicio gratis | Notas |
|-------|-----------------|-------|
| BD + Realtime + Auth | **Supabase Free** | 500 MB, realtime y auth incluidos |
| Servidor (poller+API) | **Fly.io / Render Free** | Proceso Node siempre activo |
| PWA | **Vercel / Cloudflare Pages** | HTTPS y dominio gratis (obligatorio para PWA) |

### Servidor (Fly.io ejemplo)
```bash
pnpm --filter @polla/server build
# fly launch  (define las variables de entorno como secrets de Fly)
```
> En Render Free el servicio se suspende tras inactividad; un cron externo
> (cron-job.org) puede hacer `GET /api/health` cada 10 min para mantenerlo vivo,
> o usa Fly.io (VM pequeña siempre activa en el free allowance).

### PWA (Vercel)
Conecta el repo, raíz del proyecto `apps/web`, build `pnpm build`, output `dist`.
Define `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_SERVER_URL`
(URL pública del servidor).

### Catálogo de jugadores (buscador de goleador)
Tras el primer poll (que carga los equipos), pobla los jugadores desde TheSportsDB:
```bash
pnpm --filter @polla/server seed:jugadores
```

### Panel de administración
Inicia sesión y, en Supabase, pon `role='admin'` en tu fila de `profiles`. Verás
el acceso **⚙️ Administración** en el menú de cuenta: ejecutar poller, recálculo
total, corrección manual de resultados y carga de resultados de torneo (campeón,
goleador, clasificados) para los bonos.

### Poller programado
El servidor ya ejecuta el poller con cron interno (cada minuto decide si consulta
la API: ~60 s en ventanas de partido, 30 min fuera). Alternativamente, dispara
`POST /api/admin/poll` con la cabecera `x-task-token: $ADMIN_TASK_TOKEN` desde un
cron externo.

## ⚠️ Límites del plan gratuito y escalado

El plan **Supabase Free** admite del orden de **~200 conexiones realtime
concurrentes** y 500 MB de BD. Para una polla de empresa con decenas de usuarios
es de sobra. **Si esperas más usuarios conectados a la vez**, sube al plan **Pro**
(pago por uso, bajo a esta escala): mayor límite de conexiones, BD y ancho de banda.
Además, el proyecto Free se **pausa tras 7 días sin actividad** — durante el
torneo hay tráfico diario, así que no se pausa; en los días previos, basta una
visita diaria o el cron del poller para mantenerlo activo.

## Seguridad

- **RLS** en todas las tablas: clientes solo lectura; escritura solo `service_role`.
- Pronósticos privados hasta el kickoff; se publican al `IN_PLAY` (política RLS).
- JWT de Supabase verificado en el servidor antes de aceptar escrituras.
- Validación del **lock** contra el reloj del servidor (el del cliente es irrelevante).
- Secretos fuera de git (`.gitignore`) y nunca expuestos al cliente.

## Sistema de puntos

Implementado **exactamente** según la especificación (marcador exacto / 1X2 /
total de goles, extras de eliminatoria, multiplicadores por fase, bonos de torneo,
desempates en 4 niveles). Ver `packages/core/src/engine.ts` y la suite
`packages/core/test/`.
