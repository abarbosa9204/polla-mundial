-- ============================================================================
-- Polla Mundialista 2026 — Esquema de base de datos (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Modelo "central → réplica":
--   * Solo el SERVIDOR (Edge Function con service_role) escribe datos del torneo
--     y publica pronósticos. Los clientes son SOLO LECTURA (ver 0002_rls.sql).
--   * El realtime por websocket lo da Supabase sobre las tablas calientes
--     (partidos, tabla_posiciones) — ver 0003_realtime.sql.
-- ============================================================================

-- Extensiones necesarias
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- profiles: 1:1 con auth.users (Supabase Auth). Rol de la app.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role        text not null default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de usuario de la polla (1:1 con auth.users).';

-- ----------------------------------------------------------------------------
-- config_torneo: fila única (singleton). Config de puntos editable solo hasta
-- el primer partido; luego `bloqueada=true`. `primer_kickoff_utc` define el
-- cierre de la config y de los bonos de torneo (campeón, goleador).
-- ----------------------------------------------------------------------------
create table if not exists public.config_torneo (
  id                 int  primary key default 1 check (id = 1),
  config_puntos      jsonb not null,
  bloqueada          boolean not null default false,
  primer_kickoff_utc timestamptz,
  updated_at         timestamptz not null default now()
);
comment on table public.config_torneo is 'Configuración global (puntos + cierre del torneo). Singleton id=1.';

-- ----------------------------------------------------------------------------
-- equipos / jugadores: catálogos. Imágenes son URLs ya alojadas en tu hosting
-- (no hotlinking). El cliente las cachea con el Service Worker.
-- ----------------------------------------------------------------------------
create table if not exists public.equipos (
  id        text primary key,          -- código corto, p.ej. 'ARG'
  nombre    text not null,
  crest_url text                       -- escudo (football-data.org -> tu hosting)
);

create table if not exists public.jugadores (
  id        text primary key,
  nombre    text not null,
  foto_url  text,                      -- TheSportsDB -> tu hosting
  equipo_id text references public.equipos (id)
);

-- ----------------------------------------------------------------------------
-- partidos: nodo del torneo. `sellado=true` cuando está FINISHED y con puntos
-- calculados (nunca se reescribe salvo corrección manual del admin).
-- ----------------------------------------------------------------------------
create table if not exists public.partidos (
  id                text primary key,  -- id normalizado del partido (API)
  fase              text not null check (fase in
                      ('GRUPOS','R32','R16','CUARTOS','SEMIS','TERCER_PUESTO','FINAL')),
  grupo             text,              -- 'A'..'L' en fase de grupos
  ronda_orden       int not null default 0, -- para ordenar fases/rondas
  equipo_a          text references public.equipos (id),
  equipo_b          text references public.equipos (id),
  kickoff_utc       timestamptz not null,
  estado            text not null default 'SCHEDULED' check (estado in
                      ('SCHEDULED','TIMED','IN_PLAY','PAUSED','FINISHED',
                       'POSTPONED','SUSPENDED','CANCELLED')),
  -- Resultado oficial
  goles_a_90        int,
  goles_b_90        int,
  hubo_extra        boolean,
  goles_a_extra     int,               -- marcador ACUMULADO al final del extra
  goles_b_extra     int,
  ganador_final     text check (ganador_final in ('A','B')), -- incluye penales
  -- Sellado / origen del dato
  sellado           boolean not null default false,
  correccion_manual boolean not null default false,
  updated_at        timestamptz not null default now()
);
comment on table public.partidos is 'Partidos del torneo (resultado oficial). Caliente para realtime cuando IN_PLAY.';
create index if not exists partidos_estado_idx  on public.partidos (estado);
create index if not exists partidos_kickoff_idx on public.partidos (kickoff_utc);
create index if not exists partidos_fase_idx    on public.partidos (fase, ronda_orden);

-- ----------------------------------------------------------------------------
-- pronosticos: UNA fila por (usuario, partido). El timestamp lo pone el SERVER.
-- Visibilidad (sección 8): la política RLS impide leer pronósticos ajenos de
-- partidos NO iniciados (ver 0002_rls.sql) — un solo nodo, seguridad garantizada
-- a nivel de base de datos.
-- ----------------------------------------------------------------------------
create table if not exists public.pronosticos (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  partido_id        text not null references public.partidos (id) on delete cascade,
  -- Marcador 90'
  marcador_a_90     int not null check (marcador_a_90 between 0 and 99),
  marcador_b_90     int not null check (marcador_b_90 between 0 and 99),
  -- Extras (solo eliminatorias; null = no pronosticado)
  habra_extra       boolean,
  extra_a           int check (extra_a between 0 and 99),
  extra_b           int check (extra_b between 0 and 99),
  ganador_final     text check (ganador_final in ('A','B')),
  -- Timestamps del SERVIDOR (transparencia + auditoría)
  created_at_server timestamptz not null default now(),
  updated_at_server timestamptz not null default now(),
  version           int not null default 1,
  unique (user_id, partido_id)
);
comment on table public.pronosticos is 'Pronóstico por usuario y partido. Escritura solo server (lock validado).';
create index if not exists pronosticos_partido_idx on public.pronosticos (partido_id);

-- Historial de versiones de cada pronóstico (auditoría, sección 4).
create table if not exists public.pronosticos_historial (
  id            uuid primary key default gen_random_uuid(),
  pronostico_id uuid not null references public.pronosticos (id) on delete cascade,
  user_id       uuid not null,
  partido_id    text not null,
  snapshot      jsonb not null,         -- estado del pronóstico en esa versión
  version       int not null,
  registrado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bonos_usuario: predicciones de torneo (campeón, goleador, clasificados por
-- ronda). Cada categoría guarda su timestamp de registro (server) para el
-- desempate de la sección 6.5 (campeón) y la transparencia.
-- ----------------------------------------------------------------------------
create table if not exists public.bonos_usuario (
  user_id                   uuid primary key references public.profiles (id) on delete cascade,
  campeon_equipo            text references public.equipos (id),
  campeon_registrado_en     timestamptz,
  goleador_jugador          text references public.jugadores (id),
  goleador_registrado_en    timestamptz,
  -- { "R32": ["ARG","BRA",...], "R16":[...], "CUARTOS":[...], "SEMIS":[...], "FINAL":[...] }
  clasificados              jsonb not null default '{}'::jsonb,
  clasificados_registrado_en jsonb not null default '{}'::jsonb,
  updated_at                timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- desgloses: resultado del motor por (usuario, partido). Persistido e
-- idempotente. `provisional=true` mientras el partido está en juego.
-- ----------------------------------------------------------------------------
create table if not exists public.desgloses (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  partido_id  text not null references public.partidos (id) on delete cascade,
  desglose    jsonb not null,           -- DesglosePartido serializado
  puntos      int not null default 0,
  provisional boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, partido_id)
);

-- ----------------------------------------------------------------------------
-- tabla_posiciones: nodo CALIENTE para realtime. El server la recalcula y
-- todos los clientes la ven moverse. Distingue confirmados vs provisionales.
-- ----------------------------------------------------------------------------
create table if not exists public.tabla_posiciones (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  display_name         text not null,
  puntos_confirmados   int not null default 0,
  puntos_provisionales int not null default 0,
  puntos_totales       int not null default 0, -- confirmados + provisionales (vista en vivo)
  marcadores_exactos   int not null default 0,
  resultados_1x2       int not null default 0,
  timestamp_campeon    timestamptz,
  posicion             int,
  posicion_confirmada  int,                     -- última posición confirmada (▲▼)
  movimiento           int not null default 0,  -- +n sube, -n baja, 0 igual
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- audit_log: acciones del admin (correcciones, recálculos).
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id        bigint generated always as identity primary key,
  admin_id  uuid references public.profiles (id),
  accion    text not null,
  detalle   jsonb,
  creado_en timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- poller_estado: salud del poller (alerta si falla > 5 min, sección 1).
-- ----------------------------------------------------------------------------
create table if not exists public.poller_estado (
  id                  int primary key default 1 check (id = 1),
  ultimo_exito_en     timestamptz,
  ultimo_intento_en   timestamptz,
  fallos_consecutivos int not null default 0,
  fuente_activa       text,            -- 'football-data' | 'api-football'
  mensaje             text
);
