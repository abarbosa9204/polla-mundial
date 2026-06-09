/**
 * Servicio de guardado de pronósticos con validación de cierre (lock) en el
 * SERVIDOR. Es la pieza "inatacable" de la sección 4: el reloj del cliente es
 * irrelevante; aquí se valida contra el reloj del servidor en UTC.
 *
 * Depende de una interfaz `PronosticoRepo` (inyección) para ser testeable sin
 * base de datos.
 */
import {
  validarEscrituraPronostico,
  esEliminatoria,
  type Fase,
} from '@polla/core';
import type { PronosticoPartidoInput } from '@polla/core';

export interface PartidoParaLock {
  id: string;
  kickoffUtcMs: number;
  fase: Fase;
  /** Estado del partido según la API (señal extra de cierre). Opcional. */
  estado?: string;
}

/** Estados que indican que el partido YA inició/terminó ⇒ cerrado. */
const PARTIDO_INICIADO = new Set(['IN_PLAY', 'PAUSED', 'FINISHED', 'SUSPENDED']);

export interface PronosticoUpsert {
  userId: string;
  partidoId: string;
  marcadorA90: number;
  marcadorB90: number;
  habraExtra: boolean | null;
  extraA: number | null;
  extraB: number | null;
  ganadorFinal: 'A' | 'B' | null;
}

export interface PronosticoRepo {
  getPartido(partidoId: string): Promise<PartidoParaLock | null>;
  upsertPronostico(
    data: PronosticoUpsert,
  ): Promise<{ id: string; version: number; registradoEn: string }>;
}

export type GuardarResultado =
  | { ok: true; id: string; version: number; registradoEn: string }
  | { ok: false; code: 'NOT_FOUND' | 'LOCKED' | 'INVALID'; error: string };

/**
 * Guarda (crea o edita) el pronóstico de un usuario para un partido.
 *
 * @param ahoraUtcMs Reloj del servidor (inyectado para testear; en producción
 *                   se pasa `Date.now()`).
 */
export async function guardarPronostico(
  repo: PronosticoRepo,
  userId: string,
  partidoId: string,
  payload: PronosticoPartidoInput,
  ahoraUtcMs: number,
): Promise<GuardarResultado> {
  const partido = await repo.getPartido(partidoId);
  if (!partido) {
    return { ok: false, code: 'NOT_FOUND', error: `Partido ${partidoId} no existe` };
  }

  // Señal del API (centralizada por el poller): si el partido ya inició o
  // terminó, está cerrado aunque el reloj aún no alcance el margen.
  if (partido.estado && PARTIDO_INICIADO.has(partido.estado)) {
    return {
      ok: false,
      code: 'LOCKED',
      error: 'El partido ya comenzó: el pronóstico está cerrado.',
    };
  }

  // Validación del cierre contra el reloj del servidor (cierra 5 min antes).
  const lock = validarEscrituraPronostico(partido.kickoffUtcMs, ahoraUtcMs);
  if (!lock.editable) {
    return { ok: false, code: 'LOCKED', error: lock.error ?? 'Pronóstico cerrado' };
  }

  // Los extras solo aplican en eliminatorias; en grupos se descartan para no
  // guardar datos sin sentido.
  const enEliminatoria = esEliminatoria(partido.fase);
  const data: PronosticoUpsert = {
    userId,
    partidoId,
    marcadorA90: payload.marcador90.golesA,
    marcadorB90: payload.marcador90.golesB,
    habraExtra: enEliminatoria ? payload.habraExtra ?? null : null,
    extraA: enEliminatoria ? payload.marcadorExtra?.golesA ?? null : null,
    extraB: enEliminatoria ? payload.marcadorExtra?.golesB ?? null : null,
    ganadorFinal: enEliminatoria ? payload.ganadorFinal ?? null : null,
  };

  const saved = await repo.upsertPronostico(data);
  return { ok: true, ...saved };
}
