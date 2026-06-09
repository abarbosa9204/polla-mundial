-- ============================================================================
-- Semilla mínima: config de puntos por defecto (sección 6) y fila del poller.
-- Los valores coinciden con CONFIG_PUNTOS_DEFAULT de @polla/core.
-- Editable desde el panel admin solo hasta el primer partido (bloqueada=false).
-- ============================================================================

insert into public.config_torneo (id, config_puntos, bloqueada)
values (
  1,
  '{
    "base":   { "marcadorExacto": 5, "resultado1X2": 3, "totalGoles": 1 },
    "extras": { "acertarHuboExtra": 2, "marcadorExtraExacto": 3, "ganadorFinal": 2 },
    "multiplicadores": {
      "GRUPOS": 1, "R32": 2, "R16": 2, "CUARTOS": 3,
      "SEMIS": 4, "TERCER_PUESTO": 4, "FINAL": 5
    },
    "bonos": {
      "clasificado16avos": 1, "clasificadoOctavos": 2, "clasificadoCuartos": 3,
      "clasificadoSemis": 5, "clasificadoFinal": 8, "campeon": 20, "goleador": 15
    }
  }'::jsonb,
  false
)
on conflict (id) do nothing;

insert into public.poller_estado (id, fallos_consecutivos)
values (1, 0)
on conflict (id) do nothing;
