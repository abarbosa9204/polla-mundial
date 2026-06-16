/**
 * Bonos de torneo (sección 6.4) — SIN multiplicador de fase.
 *
 * Funciones puras: reciben la predicción y los datos oficiales y devuelven el
 * desglose. No tocan base de datos.
 */
import type { BonosTorneoConfig, DesgloseBono } from './types.js';

/**
 * Cupo máximo de selecciones que se pueden marcar en cada ronda de clasificación
 * (sección 6.4): los equipos que avanzan a esa ronda. Fuente ÚNICA de verdad —
 * la usan tanto la UI (para bloquear) como el servidor (para validar al guardar).
 */
export const CLASIFICADOS_POR_RONDA = {
  R32: 32, // 16avos
  R16: 16, // octavos
  CUARTOS: 8,
  SEMIS: 4,
  FINAL: 2,
} as const;

/** Rondas que otorgan bono de clasificación (claves de CLASIFICADOS_POR_RONDA). */
export type RondaClasificacion = keyof typeof CLASIFICADOS_POR_RONDA;

/**
 * Bono por equipos clasificados a una ronda (16avos, octavos, cuartos, semis,
 * final). Suma `puntosPorAcierto` por cada equipo de la predicción que
 * realmente clasificó. Las predicciones duplicadas se cuentan una sola vez.
 */
export function calcularBonoClasificados(
  tipo: keyof BonosTorneoConfig,
  prediccion: readonly string[],
  clasificadosReales: ReadonlySet<string>,
  puntosPorAcierto: number,
): DesgloseBono {
  const unicos = new Set(prediccion);
  let aciertos = 0;
  for (const equipo of unicos) {
    if (clasificadosReales.has(equipo)) aciertos++;
  }
  return {
    tipo,
    aciertos,
    puntosPorAcierto,
    total: aciertos * puntosPorAcierto,
  };
}

/** Bono de campeón del Mundial (6.4). Acierto único. */
export function calcularBonoCampeon(
  prediccion: string | null | undefined,
  campeonReal: string | null | undefined,
  puntos: number,
): DesgloseBono {
  const acierto =
    prediccion != null && campeonReal != null && prediccion === campeonReal
      ? 1
      : 0;
  return {
    tipo: 'campeon',
    aciertos: acierto,
    puntosPorAcierto: puntos,
    total: acierto * puntos,
  };
}

/**
 * Bono de goleador del Mundial (6.4).
 *
 * Si hay EMPATE de goleadores, todos los empatados otorgan puntos: basta con
 * que la predicción esté entre los goleadores reales (la lista contiene a todos
 * los empatados en el primer puesto de goleo).
 */
export function calcularBonoGoleador(
  prediccion: string | null | undefined,
  goleadoresReales: readonly string[],
  puntos: number,
): DesgloseBono {
  const acierto =
    prediccion != null && goleadoresReales.includes(prediccion) ? 1 : 0;
  return {
    tipo: 'goleador',
    aciertos: acierto,
    puntosPorAcierto: puntos,
    total: acierto * puntos,
  };
}
