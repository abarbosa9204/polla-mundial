-- ============================================================================
-- Valor de la polla por persona + configuración de premios (bolsa y reparto).
-- ----------------------------------------------------------------------------
-- * profiles.valor_polla: cuánto aporta cada participante a la bolsa.
-- * config_premios (singleton): moneda, porcentajes sugeridos y montos que el
--   admin DEFINE (si un monto es null, se usa el % sobre la bolsa).
-- La bolsa y los premios se calculan en el SERVIDOR (no expone aportes ajenos).
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
comment on table public.config_premios is 'Config de premios (singleton id=1). Solo server (service_role).';

alter table public.config_premios enable row level security;
-- (sin políticas ⇒ clientes sin acceso directo; la bolsa se sirve por endpoint)

insert into public.config_premios (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';
