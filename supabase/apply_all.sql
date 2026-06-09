-- Esquema COMPLETO Polla Mundialista 2026 - pegar en SQL Editor de Supabase y Run. Idempotente.


-- >>>>>>>>>> 0001_schema.sql >>>>>>>>>>
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


-- >>>>>>>>>> 0002_rls.sql >>>>>>>>>>
-- ============================================================================
-- Row Level Security (RLS) — el núcleo de seguridad de la app.
-- ----------------------------------------------------------------------------
-- Principios (secciones 2 y 8 del prompt):
--   1. Los CLIENTES (rol `authenticated`/`anon`) son SOLO LECTURA. Ninguna
--      política concede insert/update/delete a clientes en datos del torneo.
--   2. El SERVIDOR usa la `service_role` key, que BYPASEA RLS por diseño: es el
--      único que escribe (resultados, pronósticos validados, tabla, etc.).
--   3. Nadie puede leer pronósticos ajenos de partidos NO iniciados — ni
--      consultando la BD directamente. La política lo impone, no la UI.
--
-- Recordatorio: como no creamos políticas de escritura para clientes y RLS está
-- activo, toda escritura de cliente queda DENEGADA por defecto. Correcto.
-- ============================================================================

-- Helper: ¿el usuario actual es admin?  (SECURITY DEFINER evita recursión RLS)
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Helper: ¿un partido ya inició? (para publicar pronósticos, sección 8)
create or replace function public.partido_iniciado(p_partido_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.partidos p
    where p.id = p_partido_id
      and p.estado in ('IN_PLAY', 'PAUSED', 'FINISHED')
  );
$$;

-- Activar RLS en TODAS las tablas públicas.
alter table public.profiles              enable row level security;
alter table public.config_torneo         enable row level security;
alter table public.equipos               enable row level security;
alter table public.jugadores             enable row level security;
alter table public.partidos              enable row level security;
alter table public.pronosticos           enable row level security;
alter table public.pronosticos_historial enable row level security;
alter table public.bonos_usuario         enable row level security;
alter table public.desgloses             enable row level security;
alter table public.tabla_posiciones      enable row level security;
alter table public.audit_log             enable row level security;
alter table public.poller_estado         enable row level security;

-- ----------------------------------------------------------------------------
-- profiles: cualquier autenticado lee (display_name es público en la tabla).
-- Sin políticas de escritura ⇒ se crean/editan vía trigger y servidor.
-- ----------------------------------------------------------------------------
create policy "profiles_select_auth"
  on public.profiles for select
  to authenticated
  using (true);

-- ----------------------------------------------------------------------------
-- config_torneo, equipos, jugadores, partidos, tabla_posiciones:
-- lectura pública para todos los autenticados; escritura solo server.
-- ----------------------------------------------------------------------------
create policy "config_select_auth"   on public.config_torneo    for select to authenticated using (true);
create policy "equipos_select_auth"  on public.equipos          for select to authenticated using (true);
create policy "jugadores_select_auth" on public.jugadores       for select to authenticated using (true);
create policy "partidos_select_auth" on public.partidos         for select to authenticated using (true);
create policy "tabla_select_auth"    on public.tabla_posiciones for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- pronosticos: LA política crítica de visibilidad (sección 8).
--   El usuario ve los SUYOS siempre; los AJENOS solo si el partido ya inició.
-- ----------------------------------------------------------------------------
create policy "pronosticos_select_propio_o_partido_iniciado"
  on public.pronosticos for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.partido_iniciado(partido_id)
  );
-- (sin insert/update/delete para clientes ⇒ solo el server escribe)

-- pronosticos_historial: solo el dueño puede leer su historial.
create policy "historial_select_propio"
  on public.pronosticos_historial for select
  to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- ----------------------------------------------------------------------------
-- bonos_usuario: cada quien ve solo los suyos (privados hasta el cierre; la
-- transparencia pública requerida por la sección 8 es la de pronósticos por
-- partido, no la de bonos). El admin puede ver todos.
-- ----------------------------------------------------------------------------
create policy "bonos_select_propio"
  on public.bonos_usuario for select
  to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- ----------------------------------------------------------------------------
-- desgloses: cada usuario ve su propio desglose de puntos.
-- ----------------------------------------------------------------------------
create policy "desgloses_select_propio"
  on public.desgloses for select
  to authenticated
  using (user_id = auth.uid() or public.es_admin());

-- ----------------------------------------------------------------------------
-- audit_log, poller_estado: solo admin lee. Escritura solo server.
-- ----------------------------------------------------------------------------
create policy "audit_select_admin"
  on public.audit_log for select
  to authenticated
  using (public.es_admin());

create policy "poller_select_admin"
  on public.poller_estado for select
  to authenticated
  using (public.es_admin());


-- >>>>>>>>>> 0003_triggers.sql >>>>>>>>>>
-- ============================================================================
-- Triggers y automatismos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Crear profile automáticamente al registrarse un usuario (Supabase Auth).
--    Toma el display_name de los metadatos o del email.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 2) Evitar que un usuario se auto-promueva a admin. El rol solo lo cambia el
--    server (service_role bypasea esto). Doble cinturón además de RLS.
-- ----------------------------------------------------------------------------
create or replace function public.proteger_rol()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'No autorizado: el rol solo lo modifica el servidor';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_rol on public.profiles;
create trigger profiles_proteger_rol
  before update on public.profiles
  for each row execute function public.proteger_rol();

-- ----------------------------------------------------------------------------
-- 3) updated_at automático genérico.
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists partidos_touch on public.partidos;
create trigger partidos_touch before update on public.partidos
  for each row execute function public.touch_updated_at();

drop trigger if exists tabla_touch on public.tabla_posiciones;
create trigger tabla_touch before update on public.tabla_posiciones
  for each row execute function public.touch_updated_at();

drop trigger if exists desgloses_touch on public.desgloses;
create trigger desgloses_touch before update on public.desgloses
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Historial de versiones de pronósticos.
--    a) BEFORE UPDATE: incrementa `version` y refresca `updated_at_server`
--       (modifica NEW, por eso va BEFORE).
--    b) AFTER INSERT/UPDATE: guarda el snapshot en el historial (va AFTER para
--       que la fila ya exista y no viole la FK de pronosticos_historial).
-- ----------------------------------------------------------------------------
create or replace function public.pronostico_before_update()
returns trigger
language plpgsql
as $$
begin
  new.version := old.version + 1;
  new.updated_at_server := now();
  return new;
end;
$$;

drop trigger if exists pronosticos_before_update on public.pronosticos;
create trigger pronosticos_before_update
  before update on public.pronosticos
  for each row execute function public.pronostico_before_update();

create or replace function public.registrar_historial_pronostico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pronosticos_historial
    (pronostico_id, user_id, partido_id, snapshot, version)
  values (
    new.id, new.user_id, new.partido_id,
    jsonb_build_object(
      'marcador_a_90', new.marcador_a_90,
      'marcador_b_90', new.marcador_b_90,
      'habra_extra',   new.habra_extra,
      'extra_a',       new.extra_a,
      'extra_b',       new.extra_b,
      'ganador_final', new.ganador_final,
      'registrado_en', coalesce(new.updated_at_server, new.created_at_server)
    ),
    new.version
  );
  return new;
end;
$$;

drop trigger if exists pronosticos_historial_trg on public.pronosticos;
create trigger pronosticos_historial_trg
  after insert or update on public.pronosticos
  for each row execute function public.registrar_historial_pronostico();


-- >>>>>>>>>> 0004_realtime.sql >>>>>>>>>>
-- ============================================================================
-- Realtime por websocket (lo que reemplaza el rol replicador de Firebase).
-- ----------------------------------------------------------------------------
-- Los clientes se suscriben a estas tablas con supabase-js:
--   supabase.channel('...').on('postgres_changes', { table: 'partidos' ... })
-- Supabase empuja los cambios por websocket. Realtime RESPETA las políticas RLS,
-- así que un cliente solo recibe filas que tendría permiso de leer.
--
-- Solo publicamos las tablas CALIENTES (optimización tipo Spark): partidos en
-- vivo y tabla de posiciones. El histórico (`partidos` FINISHED) se lee una vez
-- y se cachea en el cliente con el Service Worker; igualmente está en la misma
-- tabla `partidos`, pero el cliente solo mantiene listeners de los partidos del
-- día (filtrando por estado en la suscripción).
-- ============================================================================

-- La publicación `supabase_realtime` existe por defecto en proyectos Supabase.
-- Añadimos solo las tablas necesarias.
alter publication supabase_realtime add table public.partidos;
alter publication supabase_realtime add table public.tabla_posiciones;
-- Pronósticos: para que la vista pública "pronósticos por partido en curso"
-- se actualice en vivo al publicarlos. RLS filtra: cada cliente solo recibe
-- los que puede leer (propios o de partidos iniciados).
alter publication supabase_realtime add table public.pronosticos;

-- Para que el cliente reciba el estado ANTERIOR en updates/deletes (útil para
-- animar ▲▼ en la tabla) podemos subir REPLICA IDENTITY a FULL en la tabla
-- caliente de posiciones. (Cuesta algo de WAL; aceptable a esta escala.)
alter table public.tabla_posiciones replica identity full;


-- >>>>>>>>>> 0005_seed_config.sql >>>>>>>>>>
-- ============================================================================
-- Semilla mínima: config de puntos por defecto (sección 6) y fila del poller.
-- Los valores coinciden con CONFIG_PUNTOS_DEFAULT de @polla/core.
-- Editable desde el panel admin solo hasta el primer partido (bloqueada=false).
-- ============================================================================

insert into public.config_torneo (id, config_puntos, bloqueada)
values (
  1,
  '{
    "base":   { "marcadorExacto": 5, "resultado1X2": 3, "totalGoles": 1 },
    "extras": { "acertarHuboExtra": 2, "marcadorExtraExacto": 3, "ganadorFinal": 2 },
    "multiplicadores": {
      "GRUPOS": 1, "R32": 2, "R16": 2, "CUARTOS": 3,
      "SEMIS": 4, "TERCER_PUESTO": 4, "FINAL": 5
    },
    "bonos": {
      "clasificado16avos": 1, "clasificadoOctavos": 2, "clasificadoCuartos": 3,
      "clasificadoSemis": 5, "clasificadoFinal": 8, "campeon": 20, "goleador": 15
    }
  }'::jsonb,
  false
)
on conflict (id) do nothing;

insert into public.poller_estado (id, fallos_consecutivos)
values (1, 0)
on conflict (id) do nothing;


-- >>>>>>>>>> 0006_resultados_torneo.sql >>>>>>>>>>
-- ============================================================================
-- resultados_torneo: datos oficiales para los bonos (sección 6.4). Singleton.
-- Los mantiene el admin / el recálculo. Lectura pública; escritura solo server.
-- ============================================================================
create table if not exists public.resultados_torneo (
  id           int primary key default 1 check (id = 1),
  campeon      text references public.equipos (id),
  -- lista de goleadores empatados en el primer puesto (ids de jugadores)
  goleadores   jsonb not null default '[]'::jsonb,
  -- { "R32": ["ARG",...], "R16":[...], "CUARTOS":[...], "SEMIS":[...], "FINAL":[...] }
  clasificados jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.resultados_torneo enable row level security;

create policy "resultados_select_auth"
  on public.resultados_torneo for select
  to authenticated
  using (true);

insert into public.resultados_torneo (id) values (1)
on conflict (id) do nothing;


-- >>>>>>>>>> 0007_grants.sql >>>>>>>>>>
-- ============================================================================
-- GRANTs para los roles de la API de Supabase (anon, authenticated, service_role).
-- ----------------------------------------------------------------------------
-- PostgREST solo expone (y cachea) las tablas a las que estos roles tienen
-- privilegios. Sin estos GRANT, la API REST devuelve 404 PGRST205 aunque las
-- tablas existan. La SEGURIDAD la sigue dando la RLS (las políticas filtran las
-- filas; los clientes no tienen políticas de escritura ⇒ sus escrituras se
-- deniegan igual). `service_role` además bypasea RLS por diseño.
--
-- Normalmente Supabase aplica esto vía default privileges; lo hacemos explícito
-- para que el esquema sea autosuficiente en cualquier proyecto.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Para objetos futuros creados por el rol actual.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;

-- Pedir a PostgREST que recargue su caché de esquema.
notify pgrst, 'reload schema';


-- >>>>>>>>>> 0008_super_admin_aprobacion.sql >>>>>>>>>>
-- ============================================================================
-- Super admin + flujo de aprobación de usuarios.
-- ----------------------------------------------------------------------------
-- * Nuevo rol `super_admin`: control total (gestión de usuarios + lo de admin).
-- * `profiles.estado`: un usuario recién registrado queda 'pendiente' y NO puede
--   participar (pronosticar / bonos) hasta que el super admin lo 'aprobado'.
-- * La gestión de usuarios (crear, editar correo/nombre/clave, eliminar, aprobar)
--   la hace el SERVIDOR con service_role (Admin API), nunca el cliente.
-- ============================================================================

-- 1) Ampliar los roles válidos para incluir super_admin.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin', 'super_admin'));

-- 2) Estado de aprobación. Por defecto 'pendiente' (lo aprueba el super admin).
alter table public.profiles
  add column if not exists estado text not null default 'pendiente';
alter table public.profiles drop constraint if exists profiles_estado_check;
alter table public.profiles
  add constraint profiles_estado_check check (estado in ('pendiente', 'aprobado', 'rechazado'));

-- 3) es_admin() ahora reconoce también a super_admin.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'super_admin')
  )
$fn$;

-- 4) Helper específico de super admin.
create or replace function public.es_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'super_admin'
  )
$fn$;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0009_config_smtp.sql >>>>>>>>>>
-- ============================================================================
-- Configuración SMTP administrable (singleton id=1, solo service_role).
-- ============================================================================
create table if not exists public.config_smtp (
  id           int  primary key default 1 check (id = 1),
  host         text not null default 'smtp.gmail.com',
  port         int  not null default 465,
  secure       boolean not null default true,
  username     text not null default '',
  password     text not null default '',
  sender_email text not null default '',
  sender_name  text not null default 'Polla Mundialista',
  habilitado   boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.config_smtp enable row level security;

insert into public.config_smtp (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0010_valor_polla_premios.sql >>>>>>>>>>
-- ============================================================================
-- Valor de la polla por persona + configuración de premios (bolsa y reparto).
-- ============================================================================
alter table public.profiles
  add column if not exists valor_polla numeric not null default 0;

create table if not exists public.config_premios (
  id            int  primary key default 1 check (id = 1),
  moneda        text not null default 'COP',
  pct_primero   numeric not null default 50,
  pct_segundo   numeric not null default 30,
  pct_tercero   numeric not null default 20,
  monto_primero numeric,
  monto_segundo numeric,
  monto_tercero numeric,
  updated_at    timestamptz not null default now()
);

alter table public.config_premios enable row level security;

insert into public.config_premios (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0011_inscripcion_pago.sql >>>>>>>>>>
-- ============================================================================
-- Inscripción fija por persona + marca de pago.
-- ============================================================================
alter table public.profiles
  add column if not exists pagado boolean not null default false;

alter table public.config_premios
  add column if not exists valor_inscripcion numeric not null default 0;

notify pgrst, 'reload schema';


-- >>>>>>>>>> 0012_visibilidad_al_cierre.sql >>>>>>>>>>
-- ============================================================================
-- Pronósticos ajenos visibles al CERRAR el registro (5 min antes del kickoff).
-- ============================================================================
create or replace function public.partido_iniciado(p_partido_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.partidos p
    where p.id = p_partido_id and p.estado = 'FINISHED'
  )
$fn$;

notify pgrst, 'reload schema';

