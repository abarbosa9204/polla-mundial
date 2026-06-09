-- ============================================================================
-- GRANTs para los roles de la API de Supabase (anon, authenticated, service_role).
-- ----------------------------------------------------------------------------
-- PostgREST solo expone (y cachea) las tablas a las que estos roles tienen
-- privilegios. Sin estos GRANT, la API REST devuelve 404 PGRST205 aunque las
-- tablas existan. La SEGURIDAD la sigue dando la RLS (las políticas filtran las
-- filas; los clientes no tienen políticas de escritura ⇒ sus escrituras se
-- deniegan igual). `service_role` además bypasea RLS por diseño.
--
-- Normalmente Supabase aplica esto vía default privileges; lo hacemos explícito
-- para que el esquema sea autosuficiente en cualquier proyecto.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Para objetos futuros creados por el rol actual.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;

-- Pedir a PostgREST que recargue su caché de esquema.
notify pgrst, 'reload schema';
