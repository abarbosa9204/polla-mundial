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
