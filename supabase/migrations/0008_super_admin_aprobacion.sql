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

-- 3) es_admin() ahora reconoce también a super_admin (las políticas de lectura de
--    audit_log / poller_estado y la UI de admin siguen funcionando para él).
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

-- 4) Helper específico de super admin (por si alguna política lo necesita).
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

-- Pedir a PostgREST que recargue su caché de esquema (nueva columna `estado`).
notify pgrst, 'reload schema';
