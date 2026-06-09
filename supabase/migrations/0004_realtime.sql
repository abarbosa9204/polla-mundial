-- ============================================================================
-- Realtime por websocket (lo que reemplaza el rol replicador de Firebase).
-- ----------------------------------------------------------------------------
-- Los clientes se suscriben a estas tablas con supabase-js:
--   supabase.channel('...').on('postgres_changes', { table: 'partidos' ... })
-- Supabase empuja los cambios por websocket. Realtime RESPETA las políticas RLS,
-- así que un cliente solo recibe filas que tendría permiso de leer.
--
-- Solo publicamos las tablas CALIENTES (optimización tipo Spark): partidos en
-- vivo y tabla de posiciones. El histórico (`partidos` FINISHED) se lee una vez
-- y se cachea en el cliente con el Service Worker; igualmente está en la misma
-- tabla `partidos`, pero el cliente solo mantiene listeners de los partidos del
-- día (filtrando por estado en la suscripción).
-- ============================================================================

-- La publicación `supabase_realtime` existe por defecto en proyectos Supabase.
-- Añadimos solo las tablas necesarias.
alter publication supabase_realtime add table public.partidos;
alter publication supabase_realtime add table public.tabla_posiciones;
-- Pronósticos: para que la vista pública "pronósticos por partido en curso"
-- se actualice en vivo al publicarlos. RLS filtra: cada cliente solo recibe
-- los que puede leer (propios o de partidos iniciados).
alter publication supabase_realtime add table public.pronosticos;

-- Para que el cliente reciba el estado ANTERIOR en updates/deletes (útil para
-- animar ▲▼ en la tabla) podemos subir REPLICA IDENTITY a FULL en la tabla
-- caliente de posiciones. (Cuesta algo de WAL; aceptable a esta escala.)
alter table public.tabla_posiciones replica identity full;
