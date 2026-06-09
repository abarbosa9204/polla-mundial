-- ============================================================================
-- Configuración SMTP administrable (para que el SUPER ADMIN cambie la cuenta /
-- contraseña de envío de correos desde la app, sin tocar el .env ni el panel).
-- ----------------------------------------------------------------------------
-- Singleton id=1. Solo la lee/escribe el SERVIDOR con service_role (no hay
-- políticas RLS para clientes ⇒ acceso denegado por defecto). La contraseña es
-- una "app password" de Gmail; nunca se expone al cliente (el endpoint la oculta).
-- ============================================================================
create table if not exists public.config_smtp (
  id           int  primary key default 1 check (id = 1),
  host         text not null default 'smtp.gmail.com',
  port         int  not null default 465,
  secure       boolean not null default true,   -- true=SSL(465), false=STARTTLS(587)
  username     text not null default '',
  password     text not null default '',        -- app password (solo server)
  sender_email text not null default '',
  sender_name  text not null default 'Polla Mundialista',
  habilitado   boolean not null default false,
  updated_at   timestamptz not null default now()
);
comment on table public.config_smtp is 'SMTP para el envío de correos por el servidor. Singleton id=1. Solo service_role.';

alter table public.config_smtp enable row level security;
-- (sin políticas ⇒ clientes sin acceso; el server usa service_role que bypasea RLS)

insert into public.config_smtp (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';
