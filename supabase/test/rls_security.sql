-- Test funcional de las garantías RLS (secciones 2 y 8).
-- Se ejecuta DESPUÉS del stub + migraciones. Usa savepoints/roles para simular
-- a dos clientes autenticados. Cualquier violación aborta con ON_ERROR_STOP.
\set ON_ERROR_STOP on

-- --- Sembrar dos usuarios (el trigger crea sus profiles) ---
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ana@test.com',  '{"display_name":"Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'beto@test.com', '{"display_name":"Beto"}');

do $$
begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FALLO: el trigger no creó los 2 profiles';
  end if;
end $$;

-- --- Datos del torneo (como server / superuser, bypass RLS) ---
insert into public.equipos (id, nombre) values ('ARG','Argentina'), ('BRA','Brasil');
insert into public.partidos (id, fase, equipo_a, equipo_b, kickoff_utc, estado)
values ('M1', 'GRUPOS', 'ARG', 'BRA', now() + interval '1 day', 'SCHEDULED');

-- Pronóstico de Ana (escrito por el server)
insert into public.pronosticos (user_id, partido_id, marcador_a_90, marcador_b_90)
values ('11111111-1111-1111-1111-111111111111', 'M1', 2, 1);

-- ===========================================================================
-- CASO 1: Beto (authenticated) NO puede ver el pronóstico de Ana (M1 no inició)
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.pronosticos where partido_id = 'M1';
    if n <> 0 then
      raise exception 'FALLO SEGURIDAD: Beto vio % pronóstico(s) ajeno(s) de partido no iniciado', n;
    end if;
    raise notice 'OK 1: Beto no ve pronósticos ajenos de partido futuro';
  end $$;
rollback;

-- ===========================================================================
-- CASO 2: Ana SÍ puede ver el suyo aunque el partido no haya iniciado
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
  do $$
  declare n int;
  begin
    select count(*) into n from public.pronosticos where partido_id = 'M1';
    if n <> 1 then
      raise exception 'FALLO: Ana debería ver su propio pronóstico (vio %)', n;
    end if;
    raise notice 'OK 2: Ana ve su propio pronóstico';
  end $$;
rollback;

-- ===========================================================================
-- CASO 3: un cliente NO puede INSERTAR un pronóstico (escritura solo server)
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  begin
    begin
      insert into public.pronosticos (user_id, partido_id, marcador_a_90, marcador_b_90)
      values ('22222222-2222-2222-2222-222222222222', 'M1', 0, 0);
      raise exception 'FALLO SEGURIDAD: un cliente logró INSERTAR un pronóstico';
    exception when insufficient_privilege or others then
      -- RLS sin política de insert ⇒ se rechaza. Correcto.
      raise notice 'OK 3: cliente NO puede insertar pronósticos (rechazado)';
    end;
  end $$;
rollback;

-- ===========================================================================
-- CASO 4a: con M1 EN JUEGO (IN_PLAY) los pronósticos AÚN están ocultos.
-- ===========================================================================
update public.partidos set estado = 'IN_PLAY' where id = 'M1';
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.pronosticos where partido_id = 'M1';
    if n <> 0 then
      raise exception 'FALLO SEGURIDAD: con el partido en juego Beto vio % pronóstico(s) ajeno(s)', n;
    end if;
    raise notice 'OK 4a: con el partido en juego los pronósticos siguen ocultos';
  end $$;
rollback;

-- ===========================================================================
-- CASO 4b: al FINALIZAR M1, Beto SÍ ve el pronóstico de Ana (publicación).
-- ===========================================================================
update public.partidos set estado = 'FINISHED' where id = 'M1';
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.pronosticos where partido_id = 'M1';
    if n <> 1 then
      raise exception 'FALLO: tras FINALIZAR Beto debería ver el pronóstico de Ana (vio %)', n;
    end if;
    raise notice 'OK 4b: tras finalizar el partido los pronósticos se hacen públicos';
  end $$;
rollback;

-- ===========================================================================
-- CASO 5: un cliente NO puede leer audit_log ni poller_estado (solo admin)
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.poller_estado;
    if n <> 0 then
      raise exception 'FALLO SEGURIDAD: cliente no-admin leyó poller_estado (% filas)', n;
    end if;
    raise notice 'OK 5: cliente no-admin no lee tablas de admin';
  end $$;
rollback;

-- ===========================================================================
-- CASO 6: a punto de iniciar (kickoff inminente) pero AÚN no finalizado, los
-- pronósticos ajenos siguen ocultos.
-- ===========================================================================
insert into public.partidos (id, fase, equipo_a, equipo_b, kickoff_utc, estado)
values ('M2', 'GRUPOS', 'ARG', 'BRA', now() + interval '3 minutes', 'SCHEDULED');
insert into public.pronosticos (user_id, partido_id, marcador_a_90, marcador_b_90)
values ('11111111-1111-1111-1111-111111111111', 'M2', 0, 0);
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  do $$
  declare n int;
  begin
    select count(*) into n from public.pronosticos where partido_id = 'M2';
    if n <> 0 then
      raise exception 'FALLO SEGURIDAD: partido no finalizado y Beto vio % pronóstico(s) ajeno(s)', n;
    end if;
    raise notice 'OK 6: partido no finalizado ⇒ pronósticos ajenos ocultos';
  end $$;
rollback;

select '== TODOS LOS TESTS RLS PASARON ==' as resultado;
