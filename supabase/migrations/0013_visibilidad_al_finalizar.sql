-- ============================================================================
-- Ajuste de visibilidad: los pronósticos ajenos se ven entre usuarios SOLO
-- cuando el partido ha FINALIZADO (antes era al cerrar el registro). Hasta que
-- termine, cada quien solo ve los suyos.
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
    where p.id = p_partido_id and p.estado = 'FINISHED'
  )
$fn$;

notify pgrst, 'reload schema';
