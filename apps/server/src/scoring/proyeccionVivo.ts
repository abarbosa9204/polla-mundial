/**
 * Proyección EN VIVO de los clasificados por ronda, a partir de los resultados
 * REALES actuales (partidos FINISHED o en juego). Sirve para el bono de
 * clasificados PARCIAL (provisional): qué selecciones van clasificando ahora.
 *
 *  - R32 (16avos): top 2 de cada grupo + 8 mejores terceros (formato 2026),
 *    desde las tablas de grupo con los partidos ya jugados/en juego.
 *  - R16/CUARTOS/SEMIS/FINAL: ganadores de los partidos de la ronda PREVIA
 *    (por `ganador_final` si está definido, o por el marcador actual).
 *
 * Espejo de `apps/web/src/lib/clasificacion.ts` (misma idea), pero sobre los
 * resultados reales (no las predicciones del usuario) y contando los en juego.
 * Desempate de grupo: pts → diferencia de gol → goles a favor → id. (Sin
 * head-to-head; suficiente para una proyección provisional.)
 */
import type { RondaClasificacion } from './bonos.js';

export interface PartidoProyeccion {
  fase: string;
  grupo: string | null;
  estado: string;
  equipo_a: string | null;
  equipo_b: string | null;
  goles_a_90: number | null;
  goles_b_90: number | null;
  ganador_final: 'A' | 'B' | null;
}

const RONDA_PREVIA: Record<Exclude<RondaClasificacion, 'R32'>, string> = {
  R16: 'R32',
  CUARTOS: 'R16',
  SEMIS: 'CUARTOS',
  FINAL: 'SEMIS',
};

const contable = (estado: string): boolean =>
  estado === 'FINISHED' || estado === 'IN_PLAY' || estado === 'PAUSED';

interface FilaGrupo {
  id: string;
  pj: number;
  pts: number;
  dg: number;
  gf: number;
}

const ordenGrupo = (x: FilaGrupo, y: FilaGrupo): number =>
  y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || x.id.localeCompare(y.id);

function clasificadosR32(partidos: readonly PartidoProyeccion[]): string[] {
  const grupos = new Map<string, Map<string, FilaGrupo>>();
  const fila = (g: string, id: string): FilaGrupo => {
    if (!grupos.has(g)) grupos.set(g, new Map());
    const m = grupos.get(g)!;
    if (!m.has(id)) m.set(id, { id, pj: 0, pts: 0, dg: 0, gf: 0 });
    return m.get(id)!;
  };

  for (const p of partidos) {
    if (p.fase !== 'GRUPOS' || !p.grupo) continue;
    if (p.equipo_a) fila(p.grupo, p.equipo_a);
    if (p.equipo_b) fila(p.grupo, p.equipo_b);
    if (!contable(p.estado) || p.goles_a_90 == null || p.goles_b_90 == null) continue;
    if (!p.equipo_a || !p.equipo_b) continue;
    const a = fila(p.grupo, p.equipo_a);
    const b = fila(p.grupo, p.equipo_b);
    const ga = p.goles_a_90;
    const gb = p.goles_b_90;
    a.pj += 1;
    b.pj += 1;
    a.gf += ga;
    b.gf += gb;
    a.dg += ga - gb;
    b.dg += gb - ga;
    if (ga > gb) a.pts += 3;
    else if (gb > ga) b.pts += 3;
    else {
      a.pts += 1;
      b.pts += 1;
    }
  }

  const clasificados: string[] = [];
  const terceros: FilaGrupo[] = [];
  for (const m of grupos.values()) {
    // Solo equipos que YA jugaron: no proyectar grupos/equipos sin partidos
    // (si no, el desempate por id "clasificaría" a equipos que aún no juegan).
    const fs = [...m.values()].filter((f) => f.pj > 0).sort(ordenGrupo);
    if (fs[0]) clasificados.push(fs[0].id);
    if (fs[1]) clasificados.push(fs[1].id);
    if (fs[2]) terceros.push(fs[2]);
  }
  terceros.sort(ordenGrupo);
  for (const t of terceros.slice(0, 8)) clasificados.push(t.id);
  return clasificados;
}

function ganadorDe(p: PartidoProyeccion): string | null {
  if (p.ganador_final === 'A') return p.equipo_a;
  if (p.ganador_final === 'B') return p.equipo_b;
  if (p.goles_a_90 != null && p.goles_b_90 != null && p.equipo_a && p.equipo_b) {
    if (p.goles_a_90 > p.goles_b_90) return p.equipo_a;
    if (p.goles_b_90 > p.goles_a_90) return p.equipo_b;
  }
  return null; // empate en juego sin definición ⇒ aún sin ganador
}

/** Clasificados proyectados por ronda (ids de selección). Solo rondas con datos. */
export function proyectarClasificadosVivo(
  partidos: readonly PartidoProyeccion[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  const r32 = clasificadosR32(partidos);
  if (r32.length) out.R32 = r32;

  for (const [ronda, prevFase] of Object.entries(RONDA_PREVIA)) {
    const ganadores: string[] = [];
    for (const p of partidos) {
      if (p.fase !== prevFase || !contable(p.estado)) continue;
      const w = ganadorDe(p);
      if (w) ganadores.push(w);
    }
    if (ganadores.length) out[ronda] = ganadores;
  }
  return out;
}
