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
