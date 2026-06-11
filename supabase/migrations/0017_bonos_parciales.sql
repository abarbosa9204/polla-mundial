-- Desglose de los bonos PARCIALES (provisionales) por categoría, para mostrar en
-- el detalle de la tabla "de qué son los parciales" (16avos, octavos, cuartos,
-- semis, final, goleador). Aditivo y OPCIONAL: si no se aplica, la tabla sigue
-- funcionando — el servidor escribe sin esta columna como respaldo.
alter table public.tabla_posiciones
  add column if not exists bonos_parciales jsonb;
