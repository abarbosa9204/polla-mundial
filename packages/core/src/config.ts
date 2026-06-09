/**
 * Configuración por defecto del sistema de puntos.
 * Los valores reproducen EXACTAMENTE la sección 6 del prompt.
 *
 * Esta config es editable desde el panel admin solo hasta el primer partido;
 * el motor de puntos la recibe siempre como parámetro (función pura), de modo
 * que recalcular el torneo entero con la misma config da siempre lo mismo.
 */
import type { ConfigPuntos, Fase, MultiplicadoresFase } from './types.js';

/** Multiplicadores por fase (sección 6.3). */
export const MULTIPLICADORES_DEFAULT: MultiplicadoresFase = {
  GRUPOS: 1,
  R32: 2, // 16avos
  R16: 2, // octavos
  CUARTOS: 3,
  SEMIS: 4,
  TERCER_PUESTO: 4,
  FINAL: 5,
} satisfies Record<Fase, number>;

/** Configuración de puntos por defecto (secciones 6.1, 6.2, 6.3, 6.4). */
export const CONFIG_PUNTOS_DEFAULT: ConfigPuntos = {
  base: {
    marcadorExacto: 5,
    resultado1X2: 3,
    totalGoles: 1,
  },
  extras: {
    acertarHuboExtra: 2,
    marcadorExtraExacto: 3,
    ganadorFinal: 2,
  },
  multiplicadores: MULTIPLICADORES_DEFAULT,
  bonos: {
    clasificado16avos: 1,
    clasificadoOctavos: 2,
    clasificadoCuartos: 3,
    clasificadoSemis: 5,
    clasificadoFinal: 8,
    campeon: 20,
    goleador: 15,
  },
};
