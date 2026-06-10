-- ============================================================================
-- Al CONFIRMAR el correo, el usuario queda ACTIVO y con PAGO marcado de una vez.
-- El admin luego decide si lo inactiva/suspende (p. ej. por no pago).
-- ----------------------------------------------------------------------------
-- Se dispara cuando Supabase marca el correo como confirmado
-- (auth.users.email_confirmed_at pasa de NULL a una fecha).
-- ============================================================================
create or replace function public.activar_al_confirmar()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles
      set estado = 'aprobado', pagado = true
      where id = new.id;
  end if;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.activar_al_confirmar();

notify pgrst, 'reload schema';
