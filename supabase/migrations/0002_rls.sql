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
