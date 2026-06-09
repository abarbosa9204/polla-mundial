/**
 * Normalizador de football-data.org v4 → modelo interno (`PartidoNormalizado`).
 *
 * Reglas de marcador (confirmadas con la doc oficial de football-data, página
 * "Dealing with scores"):
 *   - `score.fullTime` incluye TODOS los goles (90' + extra + penales). NO usar
 *     directamente como marcador de 90'.
 *   - `score.regularTime` es el marcador a los 90'. En partidos sin prórroga
 *     puede venir nulo; ahí `fullTime` ya es el marcador de 90'.
 *   - `score.extraTime` cuenta SOLO los goles del tiempo extra ⇒ el acumulado al
 *     final del extra = regularTime + extraTime.
 *   - `score.winner` ya refleja el ganador por penales.
 *
 * Función PURA: recibe el JSON del partido y devuelve el modelo interno.
 */
import type { LadoEquipo } from '@polla/core';
import type { PartidoNormalizado, EquipoNormalizado } from './model.js';
import { mapStage, mapStatus, mapGrupo } from './stages.js';
import { traducirPais } from './traducciones.js';

// --- Tipos laxos del payload de football-data (solo lo que leemos) ---
interface FDScorePair {
  home: number | null;
  away: number | null;
}
interface FDScore {
  winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  fullTime?: FDScorePair;
  halfTime?: FDScorePair;
  regularTime?: FDScorePair | null;
  extraTime?: FDScorePair | null;
  penalties?: FDScorePair | null;
}
interface FDTeam {
  id?: number | null;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
}
export interface FDMatch {
  id: number | string;
  utcDate: string;
  status: string;
  stage: string;
  group?: string | null;
  homeTeam?: FDTeam | null;
  awayTeam?: FDTeam | null;
  score?: FDScore | null;
}

function equipo(t: FDTeam | null | undefined): EquipoNormalizado | null {
  if (!t) return null;
  // Preferimos el TLA (código de 3 letras) como id estable; si falta, el id num.
  const id = (t.tla ?? (t.id != null ? String(t.id) : null))?.toUpperCase() ?? null;
  if (!id) return null;
  return {
    id,
    nombre: traducirPais(t.name ?? t.shortName ?? id),
    crestUrl: t.crest ?? null,
  };
}

function winnerALado(
  w: FDScore['winner'],
): LadoEquipo | null {
  if (w === 'HOME_TEAM') return 'A';
  if (w === 'AWAY_TEAM') return 'B';
  return null; // DRAW o null
}

/**
 * Normaliza un partido de football-data. Devuelve `null` si la fase no es
 * reconocida (p.ej. clasificatorias que no pertenecen al cuadro final).
 */
export function normalizarFootballData(m: FDMatch): PartidoNormalizado | null {
  const stage = mapStage(m.stage);
  if (!stage) return null;

  const score = m.score ?? {};
  const duration = score.duration ?? 'REGULAR';
  const huboExtra =
    duration === 'EXTRA_TIME' || duration === 'PENALTY_SHOOTOUT';

  const regular = score.regularTime ?? null;
  const full = score.fullTime ?? { home: null, away: null };

  // Marcador de 90': regularTime si existe; si no, fullTime (tiempo regular).
  const golesA90 = regular?.home ?? full.home ?? null;
  const golesB90 = regular?.away ?? full.away ?? null;

  // Acumulado al final del extra = regularTime + extraTime (si hubo extra).
  let golesAExtra: number | null = null;
  let golesBExtra: number | null = null;
  if (huboExtra && score.extraTime) {
    const baseA = regular?.home ?? full.home ?? 0;
    const baseB = regular?.away ?? full.away ?? 0;
    golesAExtra = baseA + (score.extraTime.home ?? 0);
    golesBExtra = baseB + (score.extraTime.away ?? 0);
  }

  return {
    id: String(m.id),
    fase: stage.fase,
    grupo: mapGrupo(m.group),
    rondaOrden: stage.rondaOrden,
    equipoA: equipo(m.homeTeam),
    equipoB: equipo(m.awayTeam),
    kickoffUtc: new Date(m.utcDate).toISOString(),
    estado: mapStatus(m.status),
    golesA90,
    golesB90,
    huboExtra: huboExtra ? true : duration === 'REGULAR' ? false : null,
    golesAExtra,
    golesBExtra,
    ganadorFinal: winnerALado(score.winner),
  };
}
