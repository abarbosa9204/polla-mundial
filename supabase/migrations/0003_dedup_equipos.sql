-- ============================================================================
-- 0003 — Consolidación de selecciones DUPLICADAS (datos)
-- ----------------------------------------------------------------------------
-- Problema: football-data.org emitió dos TLA distintos para el mismo país a lo
-- largo del tiempo, y el upsert por `id` creó filas duplicadas en `equipos`:
--     Curazao : CUW (ISO/oficial actual)  +  CUR (variante)
--     Uruguay : URY (ISO, partidos+plantilla) + URU (variante de /teams)
-- Resultado visible: 2 banderas repetidas en la pantalla de Bonos; y, de fondo,
-- la tabla de grupos y los bonos de "clasificados" se parten entre los 2 códigos.
--
-- Canónicos elegidos (ISO-3166 alfa-3):  CUR→CUW,  URU→URY.
-- Esta migración REPUNTA todas las referencias al canónico (sin perder datos de
-- usuarios) y borra las filas sobrantes. El código (codigosEquipos.ts) ya evita
-- que se vuelvan a crear.
--
-- Idempotente: si ya no quedan CUR/URU, no hace nada. Transaccional: si algo
-- falla, no deja el estado a medias.
-- ============================================================================

begin;

-- 0) Salvaguarda: los canónicos DEBEN existir antes de repuntar nada.
do $$
begin
  if not exists (select 1 from public.equipos where id = 'CUW') then
    raise exception 'Falta el equipo canónico CUW (Curazao); abortando.';
  end if;
  if not exists (select 1 from public.equipos where id = 'URY') then
    raise exception 'Falta el equipo canónico URY (Uruguay); abortando.';
  end if;
end $$;

-- 1) Referencias por FK ------------------------------------------------------
-- partidos (incluye el partido sellado: aquí el sellado es lógica de app, no de
-- BD; lo reescribimos a propósito para consolidar el código).
update public.partidos set equipo_a = 'CUW' where equipo_a = 'CUR';
update public.partidos set equipo_b = 'CUW' where equipo_b = 'CUR';
update public.partidos set equipo_a = 'URY' where equipo_a = 'URU';
update public.partidos set equipo_b = 'URY' where equipo_b = 'URU';

-- jugadores
update public.jugadores set equipo_id = 'CUW' where equipo_id = 'CUR';
update public.jugadores set equipo_id = 'URY' where equipo_id = 'URU';

-- bonos_usuario.campeon_equipo
update public.bonos_usuario set campeon_equipo = 'CUW' where campeon_equipo = 'CUR';
update public.bonos_usuario set campeon_equipo = 'URY' where campeon_equipo = 'URU';

-- resultados_torneo.campeon
update public.resultados_torneo set campeon = 'CUW' where campeon = 'CUR';
update public.resultados_torneo set campeon = 'URY' where campeon = 'URU';

-- 2) Referencias dentro de JSONB de "clasificados" ---------------------------
-- Estructura: { "R32": ["GER","URU",...], "R16": [...], ... }. Reescribimos cada
-- elemento al canónico y DEDUPLICAMOS por ronda preservando el primer orden
-- (un usuario pudo tener URU y URY a la vez ⇒ no debe quedar URY repetido).
create or replace function pg_temp.canon_clasif(j jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, arr), '{}'::jsonb)
  from jsonb_each(j) e
  cross join lateral (
    select jsonb_agg(elem order by ord) as arr
    from (
      select case el when 'CUR' then 'CUW' when 'URU' then 'URY' else el end as elem,
             min(rn) as ord
      from jsonb_array_elements_text(e.value) with ordinality as t(el, rn)
      group by 1
    ) d
  ) agg;
$$;

update public.bonos_usuario
set clasificados = pg_temp.canon_clasif(clasificados)
where clasificados::text ~ '"(CUR|URU)"';

update public.resultados_torneo
set clasificados = pg_temp.canon_clasif(clasificados)
where clasificados::text ~ '"(CUR|URU)"';

-- 3) Borrar las filas duplicadas (ya sin referencias) ------------------------
delete from public.equipos where id in ('CUR', 'URU');

-- 4) Verificación final: NO deben quedar referencias colgando ----------------
do $$
declare n int;
begin
  select count(*) into n from public.partidos where equipo_a in ('CUR','URU') or equipo_b in ('CUR','URU');
  if n > 0 then raise exception 'Quedan % partidos con CUR/URU', n; end if;

  select count(*) into n from public.jugadores where equipo_id in ('CUR','URU');
  if n > 0 then raise exception 'Quedan % jugadores con CUR/URU', n; end if;

  select count(*) into n from public.bonos_usuario where campeon_equipo in ('CUR','URU') or clasificados::text ~ '"(CUR|URU)"';
  if n > 0 then raise exception 'Quedan % bonos con CUR/URU', n; end if;

  select count(*) into n from public.equipos where id in ('CUR','URU');
  if n > 0 then raise exception 'Quedan % equipos CUR/URU sin borrar', n; end if;
end $$;

commit;

-- Tras COMMIT: ejecutar un recálculo idempotente para refrescar tabla/desgloses:
--   POST /api/admin/recompute   (o  node apps/server/scripts/run-poller-once.mjs)
