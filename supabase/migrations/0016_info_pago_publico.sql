-- ============================================================================
-- Info de pago PÚBLICA para la pantalla de login (sin sesión): expone SOLO el
-- valor de inscripción y la moneda desde config_premios. No revela el resto de
-- la configuración (porcentajes, montos por puesto). Es security definer, así
-- que pasa por encima del RLS de config_premios sin abrir la tabla entera.
-- ============================================================================
create or replace function public.info_pago_publico()
returns table(valor_inscripcion numeric, moneda text)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.valor_inscripcion, c.moneda
  from public.config_premios c
  where c.id = 1
$fn$;

grant execute on function public.info_pago_publico() to anon, authenticated;

notify pgrst, 'reload schema';
