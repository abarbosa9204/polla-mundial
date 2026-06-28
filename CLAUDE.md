# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> El proyecto y sus comentarios están en **español**. Mantén ese idioma en código,
> commits y comunicación.

## Qué es

PWA de polla (quiniela) para el **Mundial 2026**. Arquitectura **central → réplica**
sobre **Supabase** (Postgres + Realtime por websocket + Auth JWT + RLS). Monorepo
pnpm con un motor de puntos puro compartido entre servidor y cliente.

## Comandos

```bash
pnpm install                          # instalar (Node ≥20, pnpm ≥9)

# Desarrollo
pnpm --filter @polla/server dev       # servidor central (http://localhost:8787, tsx watch)
pnpm --filter @polla/web dev          # PWA (http://localhost:5173, vite)

# Tests (Vitest) — toda la suite debe quedar en verde
pnpm -r test                          # todos los paquetes
pnpm --filter @polla/core test        # un paquete (= pnpm test:core en la raíz)
pnpm --filter @polla/core test -- engine.base    # un archivo de test por nombre
pnpm --filter @polla/server test:watch           # modo watch

# Validación SQL (migraciones + seguridad RLS en Postgres efímero por Docker)
pwsh supabase/test/validate.ps1

# Build / typecheck (no hay linter configurado pese al script `lint`)
pnpm -r build
pnpm -r typecheck
```

Scripts operativos del servidor (en `apps/server`, requieren `.env`):
`seed:jugadores` (fotos goleadores desde TheSportsDB tras el primer poll),
`seed:super-admin`, `seed:smtp`, `seed:demo` / `clean:demo`, `recordatorios`.

## Arquitectura

Regla central de seguridad: **solo el servidor escribe** en la BD (clave
`service_role`, bypasea RLS). Los clientes son **solo lectura** vía RLS y
Realtime; cualquier escritura del usuario (pronósticos, bonos) pasa por un
endpoint del servidor que valida el JWT y el **cierre (lock)** contra su propio
reloj UTC. El reloj del cliente nunca decide nada.

Flujo de datos: `football-data.org` → poller del servidor → Postgres → Realtime
(websocket) → PWA. Fallback de poller a API-Football; fuente alterna en vivo
(TheSportsDB) solo durante la ventana de partido.

### Paquetes (`packages/`)

- **`@polla/core`** — Motor de puntos **PURO** (sin I/O) + tipos + schemas Zod +
  lock + desempates. Es la fuente de verdad de las reglas. `engine.ts` calcula
  puntos de un partido; `bonos.ts` los bonos de torneo; `tiebreak.ts` los 4
  niveles de desempate; `config.ts` tiene `CONFIG_PUNTOS_DEFAULT` (sección 6 del
  prompt: marcador exacto/1X2/total, extras de eliminatoria, multiplicadores por
  fase, bonos). El motor **recibe la config como parámetro** ⇒ recalcular el
  torneo entero es idempotente.
- **`@polla/data`** — Capa de acceso a Supabase: `database.types.ts` (tipos de
  tablas), `mappers.ts` (fila ↔ dominio de `@polla/core`), factorías de cliente.

### Apps (`apps/`)

- **`@polla/server`** (Fastify) — `index.ts` arranca HTTP + cron interno
  (poller cada minuto decide si consultar la API según `scheduler.ts`;
  recordatorios diarios). `routes.ts` define todos los endpoints. Carpetas:
  - `poller/` — clientes de APIs, normalizadores, `diff.ts` (escribe solo lo que
    cambió, respeta partidos sellados/manuales), `codigosEquipos.ts` (siglas
    canónicas), `runPoller.ts` (orquesta el ciclo).
  - `scoring/` — recálculo: desglose por usuario/partido, tabla, bonos,
    proyección en vivo.
  - `services/` — lógica de cada endpoint: `pronosticoService`, `bonosService`,
    `recompute` (recálculo total idempotente), `usuariosService`, `premiosService`,
    `recordatoriosService`, `mailer`, locks.
  - `repo.ts` (`SupabaseRepo`) es el único acceso a la BD; `auth.ts` verifica JWT
    y roles (`admin`, `super_admin`).
- **`@polla/web`** (React 19 + Vite + Tailwind + PWA) — TanStack Query con
  persistencia offline. `lib/api.ts` (llamadas al servidor), `lib/queries.ts` y
  `lib/supabase.ts` (lecturas + realtime), `lib/colaPronosticos.ts` (cola offline
  que se sincroniza al reconectar). Pantallas en `src/screens/`, rutas en `App.tsx`.

### Base de datos (`supabase/`)

- `migrations/NNNN_*.sql` — esquema, RLS, triggers, realtime, seeds. Se aplican
  **en orden por nombre**. `apply_all.sql` es el bundle para pegar en el SQL
  Editor de Supabase.
- `test/` — `validate.ps1` levanta Postgres en Docker, aplica el stub de Supabase
  + todas las migraciones + grants, y corre `rls_security.sql` (verifica que un
  usuario no lee pronósticos ajenos de partidos no iniciados).

## Reglas del dominio que importan al editar

- **Privacidad de pronósticos**: privados hasta el kickoff; se publican al pasar a
  `IN_PLAY` por política RLS. No la rompas en lecturas del cliente.
- **Lock / cierre**: la validación de si un partido/bono está cerrado es del
  servidor. `super_admin` puede editar bonos saltándose el lock (`bypassLock`),
  pero el sello temporal del bono se fija a la hora del cierre y la edición real
  queda en `audit_log`.
- **Partidos manuales/sellados**: una corrección de admin marca `correccion_manual`;
  el poller no la pisa hasta que el admin "devuelve el control a la API". Respeta
  estos flags en cualquier cambio al poller.
- **Recálculo**: cualquier cambio de resultado, config o participación dispara
  `recomputarTodo` (idempotente). Mantén esa propiedad.
- **Cupo de clasificados por ronda** (regla 6.4): tope por ronda (R32=32…FINAL=2),
  con fuente única en `@polla/core`, aplicado en UI **y** servidor.
- **Códigos canónicos de equipos**: usa `canonicalTla` para evitar selecciones
  duplicadas (las APIs difieren: CUR→CUW, URU→URY).

## Variables de entorno

Copia `.env.example` a `.env`. Secretas (solo servidor, nunca al cliente ni a
git): `SUPABASE_SERVICE_ROLE_KEY`, `FOOTBALL_DATA_TOKEN`, `ADMIN_TASK_TOKEN`,
SMTP. Públicas (con prefijo `VITE_` van al frontend): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SERVER_URL`.
