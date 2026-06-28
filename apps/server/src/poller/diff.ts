/**
 * Regla de escritura mínima (sección 1): el poller solo escribe si un dato
 * CAMBIÓ respecto al estado actual, y NUNCA reescribe partidos sellados.
 * Función pura y testeable.
 */
import type { PartidoRow } from '@polla/data';
import type { PartidoNormalizado } from './model.js';

export type PartidoActual = Pick<
  PartidoRow,
  | 'estado'
  | 'goles_a_90'
  | 'goles_b_90'
  | 'hubo_extra'
  | 'goles_a_extra'
  | 'goles_b_extra'
  | 'ganador_final'
  | 'kickoff_utc'
  | 'sellado'
  | 'correccion_manual'
  | 'equipo_a'
  | 'equipo_b'
>;

export function necesitaActualizar(
  nuevo: PartidoNormalizado,
  actual: PartidoActual | undefined,
): boolean {
  if (!actual) return true; // partido nuevo: insertar
  if (actual.sellado) return false; // sellado: jamás reescribir desde la API

  // El dato manual es solo un RESPALDO mientras la API está caída. En cuanto la
  // API vuelve a reportar el partido en curso o finalizado, RECLAMA el control y
  // sobrescribe el dato manual (el poller limpia `correccion_manual` al hacerlo).
  // Si la API aún no lo ha iniciado, se respeta el dato manual.
  if (actual.correccion_manual) {
    return (
      nuevo.estado === 'IN_PLAY' ||
      nuevo.estado === 'PAUSED' ||
      nuevo.estado === 'FINISHED'
    );
  }

  // NO DEGRADAR: si el partido ya está en juego/finalizado (lo puso football-data
  // o la fuente alterna en vivo), no dejar que una respuesta ATRASADA de la
  // primaria lo regrese a "programado" o le borre el marcador.
  const yaAvanzado =
    actual.estado === 'IN_PLAY' || actual.estado === 'PAUSED' || actual.estado === 'FINISHED';
  const nuevoMenos = nuevo.estado === 'SCHEDULED' || nuevo.estado === 'TIMED';
  if (yaAvanzado && nuevoMenos) return false;

  // ASIGNACIÓN DEL CUADRO: cuando football-data resuelve los cruces de
  // eliminatoria, RELLENA equipo_a/equipo_b en un partido que ya existía como
  // "por definir". El estado/marcador/kickoff no cambian, así que sin esto el
  // poller nunca traería los equipos clasificados (16avos, octavos, etc.).
  // Solo cuenta como cambio si el equipo NUEVO viene definido y difiere: no
  // degradamos a null si la API responde incompleta (mismo criterio NO-DEGRADAR).
  const equipoACambia = nuevo.equipoA != null && nuevo.equipoA.id !== actual.equipo_a;
  const equipoBCambia = nuevo.equipoB != null && nuevo.equipoB.id !== actual.equipo_b;

  return (
    equipoACambia ||
    equipoBCambia ||
    actual.estado !== nuevo.estado ||
    actual.goles_a_90 !== nuevo.golesA90 ||
    actual.goles_b_90 !== nuevo.golesB90 ||
    actual.hubo_extra !== nuevo.huboExtra ||
    actual.goles_a_extra !== nuevo.golesAExtra ||
    actual.goles_b_extra !== nuevo.golesBExtra ||
    actual.ganador_final !== nuevo.ganadorFinal ||
    Date.parse(actual.kickoff_utc) !== Date.parse(nuevo.kickoffUtc) // reprogramación
  );
}

/** ¿El partido requiere (re)cálculo de puntos tras actualizarse? */
export function requiereRecalculo(nuevo: PartidoNormalizado): boolean {
  return (
    nuevo.estado === 'IN_PLAY' ||
    nuevo.estado === 'PAUSED' ||
    nuevo.estado === 'FINISHED'
  );
}
