-- ============================================================================
-- Visibilidad de pronósticos ajenos: se ven entre usuarios CUANDO EL PARTIDO
-- INICIA (no solo al finalizar). En ese momento el registro ya está cerrado para
-- todos (cierra 5 min antes del kickoff), así que no hay riesgo de copiar.
--
-- "Inició" = el estado ya es de partido en curso/terminado, O ya pasó la hora
-- oficial de kickoff (cubre el caso de que el poller aún no haya marcado IN_PLAY).
-- La política `pronosticos_select_propio_o_partido_iniciado` sigue usando esta
-- función; basta redefinirla.
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
        or now() >= p.kickoff_utc
      )
  )
$fn$;

notify pgrst, 'reload schema';
