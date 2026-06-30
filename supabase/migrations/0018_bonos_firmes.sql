-- Desglose de los bonos FIRMES (confirmados) por categoría, para mostrar en el
-- detalle de la tabla "de qué son los puntos firmes" (16avos, octavos, cuartos,
-- semis, final, campeón, goleador) — espejo de `bonos_parciales`. Aditivo y
-- OPCIONAL: si no se aplica, la tabla sigue funcionando (el servidor escribe sin
-- esta columna como respaldo y la UI cae a una nota genérica).
alter table public.tabla_posiciones
  add column if not exists bonos_firmes jsonb;
