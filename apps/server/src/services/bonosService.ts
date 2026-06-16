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

export interface GuardarBonosOpts {
  /** Salta el cierre (solo para el admin: corrige bonos de un usuario tras cerrar). */
  bypassLock?: boolean;
  /** Usa la HORA DEL CIERRE como timestamp de registro (en vez de "ahora"), para
   * no penalizar al usuario en el desempate del campeón. */
  tsCierre?: boolean;
}

export async function guardarBonos(
  repo: SupabaseRepo,
  userId: string,
  input: BonosInput,
  ahoraMs: number,
  opts: GuardarBonosOpts = {},
): Promise<BonosResultado> {
  const partidos = await repo.getPartidos();
  const kickoffs: PartidoKickoff[] = partidos.map((p) => ({
    fase: p.fase,
    kickoffUtcMs: Date.parse(p.kickoff_utc),
  }));
  const cierres = calcularCierresBonos(kickoffs);
  const existente = await repo.getBonosUsuario(userId);
  const nowIso = new Date(ahoraMs).toISOString();

  // Editable: normalmente respeta el cierre; en modo admin (bypassLock) siempre.
  const puedeEditar = (cierreMs: number | null) => opts.bypassLock || editableBono(cierreMs, ahoraMs);
  // Timestamp a sellar: "ahora", o la hora del cierre si se pidió (modo admin).
  const tsDe = (cierreMs: number | null) =>
    opts.tsCierre && cierreMs != null ? new Date(cierreMs).toISOString() : nowIso;

  const aplicados: string[] = [];
  const rechazados: string[] = [];
  const update: Record<string, unknown> = {};

  // Campeón.
  if (input.campeon !== undefined) {
    if (puedeEditar(cierres.primerKickoffMs)) {
      update.campeon_equipo = input.campeon;
      // Solo (re)sellar el timestamp si cambia el valor o es la primera vez.
      if (!existente || existente.campeon !== input.campeon || !existente.campeonRegistradoEn) {
        update.campeon_registrado_en = tsDe(cierres.primerKickoffMs);
      }
      aplicados.push('campeon');
    } else {
      rechazados.push('campeon');
    }
  }

  // Goleador.
  if (input.goleador !== undefined) {
    if (puedeEditar(cierres.primerKickoffMs)) {
      update.goleador_jugador = input.goleador;
      if (!existente || existente.goleador !== input.goleador || !existente.goleadorRegistradoEn) {
        update.goleador_registrado_en = tsDe(cierres.primerKickoffMs);
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
      if (puedeEditar(cierres.clasificados[ronda])) {
        clasif[ronda] = valor;
        clasifTs[ronda] = tsDe(cierres.clasificados[ronda]);
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
