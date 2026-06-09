-- ============================================================================
-- Modelo de inscripción: valor FIJO por persona + marca de pago por usuario.
-- ----------------------------------------------------------------------------
-- * config_premios.valor_inscripcion: cuánto paga cada participante (ej. 50000).
-- * profiles.pagado: el admin marca quién ya pagó.
-- La BOLSA = valor_inscripcion × (usuarios aprobados Y pagados). Para participar
-- (pronosticar / bonos) se requiere estar APROBADO y PAGADO. El cálculo lo hace
-- el SERVIDOR (no expone datos ajenos).
-- ============================================================================
alter table public.profiles
  add column if not exists pagado boolean not null default false;

alter table public.config_premios
  add column if not exists valor_inscripcion numeric not null default 0;

notify pgrst, 'reload schema';
