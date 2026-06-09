-- ============================================================================
-- Visibilidad de pronósticos ajenos: ahora se publican cuando el REGISTRO CIERRA
-- (5 minutos antes del kickoff) o cuando el partido ya inició según la API.
-- ----------------------------------------------------------------------------
-- Antes solo se publicaban al pasar a IN_PLAY. Con esto, los jugadores pueden ver
-- los marcadores de los demás en cuanto nadie puede ya modificarlos (transparencia
-- sin riesgo de copiar). La política `pronosticos_select_propio_o_partido_iniciado`
-- sigue usando esta función, así que basta redefinirla.
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
    where p.id = p_partido_id
      and (
        p.estado in ('IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED')
        or now() >= p.kickoff_utc - interval '5 minutes'
      )
  )
$fn$;

notify pgrst, 'reload schema';
