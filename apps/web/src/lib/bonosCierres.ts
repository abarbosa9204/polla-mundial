/**
 * Cierres de los bonos POR RONDA, para mostrarlos y bloquearlos en la UI.
 *
 * ESPEJO EXACTO de la lógica canónica del backend en
 * `apps/server/src/services/bonosLock.ts` (que es quien realmente valida):
 *   - Campeón y goleador: cierran al kickoff del PRIMER partido del torneo.
 *   - Clasificados a una ronda: cierran al kickoff del primer partido de la
 *     RONDA PREVIA (R32 con grupos, R16 con R32, …).
 * Si una fecha aún no existe (null) ⇒ la categoría sigue abierta.
 */
import type { PartidoRow } from '@polla/data';

export type RondaClasif = 'R32' | 'R16' | 'CUARTOS' | 'SEMIS' | 'FINAL';

const RONDA_PREVIA: Record<RondaClasif, string> = {
  R32: 'GRUPOS',
  R16: 'R32',
  CUARTOS: 'R16',
  SEMIS: 'CUARTOS',
  FINAL: 'SEMIS',
};

export interface CierresBonos {
  primerKickoffMs: number | null;
  clasificados: Record<RondaClasif, number | null>;
}

function minKickoff(partidos: readonly PartidoRow[], fase: string): number | null {
  let min: number | null = null;
  for (const p of partidos) {
    if (p.fase !== fase) continue;
    const ms = Date.parse(p.kickoff_utc);
    if (Number.isNaN(ms)) continue;
    if (min === null || ms < min) min = ms;
  }
  return min;
}

export function calcularCierresBonos(partidos: readonly PartidoRow[]): CierresBonos {
  let primer: number | null = null;
  for (const p of partidos) {
    const ms = Date.parse(p.kickoff_utc);
    if (Number.isNaN(ms)) continue;
    if (primer === null || ms < primer) primer = ms;
  }
  const clasificados = {} as Record<RondaClasif, number | null>;
  (Object.keys(RONDA_PREVIA) as RondaClasif[]).forEach((r) => {
    clasificados[r] = minKickoff(partidos, RONDA_PREVIA[r]);
  });
  return { primerKickoffMs: primer, clasificados };
}

/** ¿Editable? (null = aún sin fecha ⇒ abierta). */
export function bonoEditable(cierreMs: number | null, ahoraMs: number): boolean {
  return cierreMs === null || ahoraMs < cierreMs;
}
