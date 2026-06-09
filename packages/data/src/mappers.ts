/**
 * Mapeadores entre filas Postgres y los tipos de dominio de @polla/core.
 * Aíslan al motor de puntos de la forma física de la tabla: si la BD cambia,
 * solo cambian estos mapeadores, no el motor (que sigue en verde con sus tests).
 */
import type {
  PronosticoPartido,
  ResultadoOficial,
  ConfigPuntos,
} from '@polla/core';
import { configPuntosSchema } from '@polla/core';
import type {
  PartidoRow,
  PronosticoRow,
  ConfigTorneoRow,
} from './database.types.js';

/**
 * Construye el `ResultadoOficial` que consume el motor a partir de una fila de
 * partido. Devuelve `null` si el partido aún no tiene marcador de 90'
 * (no se puede puntuar todavía).
 */
export function partidoARresultado(row: PartidoRow): ResultadoOficial | null {
  if (row.goles_a_90 == null || row.goles_b_90 == null) return null;
  return {
    marcador90: { golesA: row.goles_a_90, golesB: row.goles_b_90 },
    huboExtra: row.hubo_extra ?? false,
    marcadorExtra:
      row.goles_a_extra != null && row.goles_b_extra != null
        ? { golesA: row.goles_a_extra, golesB: row.goles_b_extra }
        : null,
    ganadorFinal: row.ganador_final,
  };
}

/**
 * Construye un `ResultadoOficial` PROVISIONAL desde el marcador en vivo, "como
 * si el marcador actual fuera el final de los 90'". Aún no se sabe si habrá
 * extra ⇒ `huboExtra=false`. El flag provisional lo maneja el llamador.
 */
export function partidoAResultadoProvisional(
  row: PartidoRow,
): ResultadoOficial | null {
  if (row.goles_a_90 == null || row.goles_b_90 == null) return null;
  return {
    marcador90: { golesA: row.goles_a_90, golesB: row.goles_b_90 },
    huboExtra: false,
    marcadorExtra: null,
    ganadorFinal: null,
  };
}

/** Mapea una fila de pronóstico al tipo de dominio que consume el motor. */
export function pronosticoRowADominio(row: PronosticoRow): PronosticoPartido {
  return {
    marcador90: { golesA: row.marcador_a_90, golesB: row.marcador_b_90 },
    habraExtra: row.habra_extra,
    marcadorExtra:
      row.extra_a != null && row.extra_b != null
        ? { golesA: row.extra_a, golesB: row.extra_b }
        : null,
    ganadorFinal: row.ganador_final,
  };
}

/** Extrae y valida la `ConfigPuntos` desde la fila singleton de config. */
export function configRowADominio(row: ConfigTorneoRow): ConfigPuntos {
  return configPuntosSchema.parse(row.config_puntos);
}

/** Convierte un kickoff ISO (UTC) a epoch ms para las validaciones de lock. */
export function kickoffMs(row: Pick<PartidoRow, 'kickoff_utc'>): number {
  return Date.parse(row.kickoff_utc);
}
