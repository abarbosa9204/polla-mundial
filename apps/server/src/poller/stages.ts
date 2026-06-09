/**
 * Mapeo de fases/estados de football-data.org al modelo interno.
 */
import type { EstadoPartido, Fase } from '@polla/core';

/** stage de football-data → { fase interna, ronda_orden } */
const STAGE_MAP: Record<string, { fase: Fase; rondaOrden: number }> = {
  GROUP_STAGE: { fase: 'GRUPOS', rondaOrden: 0 },
  LAST_32: { fase: 'R32', rondaOrden: 1 },
  LAST_16: { fase: 'R16', rondaOrden: 2 },
  QUARTER_FINALS: { fase: 'CUARTOS', rondaOrden: 3 },
  SEMI_FINALS: { fase: 'SEMIS', rondaOrden: 4 },
  THIRD_PLACE: { fase: 'TERCER_PUESTO', rondaOrden: 5 },
  FINAL: { fase: 'FINAL', rondaOrden: 6 },
};

export function mapStage(
  stage: string,
): { fase: Fase; rondaOrden: number } | null {
  return STAGE_MAP[stage] ?? null;
}

/** status de football-data → estado interno. */
const STATUS_MAP: Record<string, EstadoPartido> = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'TIMED',
  IN_PLAY: 'IN_PLAY',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  SUSPENDED: 'SUSPENDED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  AWARDED: 'FINISHED', // partido adjudicado por mesa = finalizado a efectos de puntos
};

export function mapStatus(status: string): EstadoPartido {
  return STATUS_MAP[status] ?? 'SCHEDULED';
}

/** 'GROUP_A' → 'A'; null si no aplica. */
export function mapGrupo(group: string | null | undefined): string | null {
  if (!group) return null;
  const m = /^GROUP_([A-L])$/i.exec(group);
  return m ? m[1]!.toUpperCase() : group;
}
