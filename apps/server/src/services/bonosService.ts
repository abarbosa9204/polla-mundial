/**
 * Guardado de bonos de torneo con validación de cierres por categoría
 * (sección 5). Cada categoría editable se aplica; las cerradas se rechazan
 * sin tocar el dato ya registrado. El timestamp de registro lo pone el servidor
 * (el de campeón sirve para el desempate de la sección 6.5).
 */
import { SupabaseRepo } from '../repo.js';
import {
  calcularCierresBonos,
  editableBono,
  type PartidoKickoff,
  type RondaClasificacion,
} from './bonosLock.js';

export interface BonosInput {
  campeon?: string | null;
  goleador?: string | null;
  clasificados?: Partial<Record<RondaClasificacion, string[]>>;
}

export interface BonosResultado {
  ok: true;
  aplicados: string[];
  rechazados: string[];
}

const RONDAS: RondaClasificacion[] = ['R32', 'R16', 'CUARTOS', 'SEMIS', 'FINAL'];

export async function guardarBonos(
  repo: SupabaseRepo,
  userId: string,
  input: BonosInput,
  ahoraMs: number,
): Promise<BonosResultado> {
  const partidos = await repo.getPartidos();
  const kickoffs: PartidoKickoff[] = partidos.map((p) => ({
    fase: p.fase,
    kickoffUtcMs: Date.parse(p.kickoff_utc),
  }));
  const cierres = calcularCierresBonos(kickoffs);
  const existente = await repo.getBonosUsuario(userId);
  const nowIso = new Date(ahoraMs).toISOString();

  const aplicados: string[] = [];
  const rechazados: string[] = [];
  const update: Record<string, unknown> = {};

  // Campeón.
  if (input.campeon !== undefined) {
    if (editableBono(cierres.primerKickoffMs, ahoraMs)) {
      update.campeon_equipo = input.campeon;
      // Solo (re)sellar el timestamp si cambia el valor o es la primera vez.
      if (!existente || existente.campeon !== input.campeon || !existente.campeonRegistradoEn) {
        update.campeon_registrado_en = nowIso;
      }
      aplicados.push('campeon');
    } else {
      rechazados.push('campeon');
    }
  }

  // Goleador.
  if (input.goleador !== undefined) {
    if (editableBono(cierres.primerKickoffMs, ahoraMs)) {
      update.goleador_jugador = input.goleador;
      if (!existente || existente.goleador !== input.goleador || !existente.goleadorRegistradoEn) {
        update.goleador_registrado_en = nowIso;
      }
      aplicados.push('goleador');
    } else {
      rechazados.push('goleador');
    }
  }

  // Clasificados por ronda.
  if (input.clasificados) {
    const clasif = { ...(existente?.clasificados ?? {}) };
    const clasifTs = { ...(existente?.clasificadosRegistradoEn ?? {}) };
    for (const ronda of RONDAS) {
      const valor = input.clasificados[ronda];
      if (valor === undefined) continue;
      if (editableBono(cierres.clasificados[ronda], ahoraMs)) {
        clasif[ronda] = valor;
        clasifTs[ronda] = nowIso;
        aplicados.push(`clasificados.${ronda}`);
      } else {
        rechazados.push(`clasificados.${ronda}`);
      }
    }
    update.clasificados = clasif;
    update.clasificados_registrado_en = clasifTs;
  }

  if (Object.keys(update).length > 0) {
    await repo.upsertBonosUsuario(userId, update);
  }
  return { ok: true, aplicados, rechazados };
}
