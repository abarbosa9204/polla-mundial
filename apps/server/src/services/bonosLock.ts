/**
 * Cierres de los bonos de torneo (sección 5):
 *   - Campeón y goleador: cierran al kickoff del PRIMER partido del Mundial.
 *   - Clasificados a 16avos (R32): cierra con el primer partido de grupos.
 *   - Clasificados a octavos/cuartos/semis/final: cierran al kickoff del primer
 *     partido de la RONDA PREVIA correspondiente.
 * Función pura y testeable.
 */
import type { Fase } from '@polla/core';

export type RondaClasificacion = 'R32' | 'R16' | 'CUARTOS' | 'SEMIS' | 'FINAL';

/** Ronda cuyo primer partido cierra cada lista de clasificados. */
const RONDA_PREVIA: Record<RondaClasificacion, Fase> = {
  R32: 'GRUPOS',
  R16: 'R32',
  CUARTOS: 'R16',
  SEMIS: 'CUARTOS',
  FINAL: 'SEMIS',
};

export interface PartidoKickoff {
  fase: Fase;
  kickoffUtcMs: number;
}

export interface CierresBonos {
  /** Cierre de campeón y goleador (primer partido del torneo). null si no hay. */
  primerKickoffMs: number | null;
  /** Cierre por ronda de clasificados (null si la ronda previa aún no tiene fecha). */
  clasificados: Record<RondaClasificacion, number | null>;
}

function minKickoff(partidos: readonly PartidoKickoff[], fase: Fase): number | null {
  let min: number | null = null;
  for (const p of partidos) {
    if (p.fase === fase && (min === null || p.kickoffUtcMs < min)) min = p.kickoffUtcMs;
  }
  return min;
}

export function calcularCierresBonos(partidos: readonly PartidoKickoff[]): CierresBonos {
  const primerKickoffMs =
    partidos.length === 0
      ? null
      : partidos.reduce((m, p) => Math.min(m, p.kickoffUtcMs), Infinity);

  const clasificados = {} as Record<RondaClasificacion, number | null>;
  (Object.keys(RONDA_PREVIA) as RondaClasificacion[]).forEach((r) => {
    clasificados[r] = minKickoff(partidos, RONDA_PREVIA[r]);
  });

  return {
    primerKickoffMs: Number.isFinite(primerKickoffMs) ? primerKickoffMs : null,
    clasificados,
  };
}

/** ¿Está editable una categoría dado su cierre (null = aún sin fecha ⇒ abierta)? */
export function editableBono(cierreMs: number | null, ahoraMs: number): boolean {
  if (cierreMs === null) return true;
  return ahoraMs < cierreMs;
}
