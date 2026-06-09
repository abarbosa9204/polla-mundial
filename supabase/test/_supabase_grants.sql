-- Reproduce los GRANT que Supabase concede por defecto a anon/authenticated/
-- service_role sobre el schema public. En Supabase real estos grants existen y
-- es la RLS quien decide el acceso real a las filas. (Solo para el test local.)
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;
