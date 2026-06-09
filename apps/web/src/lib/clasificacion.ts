/**
 * Cálculo de la tabla de posiciones de cada grupo a partir de los resultados ya
 * almacenados en `partidos` (fase GRUPOS, estado FINISHED). Desempate:
 * puntos → diferencia de gol → goles a favor → nombre. (No incluye el
 * head-to-head de FIFA; suficiente para la vista informativa de la polla.)
 */
import type { PartidoRow, PronosticoRow } from '@polla/data';
import type { EquipoView } from './queries.js';

export interface FilaGrupo {
  equipoId: string;
  pj: number;
  g: number;
  e: number;
  p: number;
  gf: number;
  gc: number;
  dg: number;
  pts: number;
}

export interface Grupo {
  grupo: string;
  filas: FilaGrupo[];
}

export function calcularGrupos(
  partidos: PartidoRow[],
  equipos: Map<string, EquipoView> | undefined,
): Grupo[] {
  const porGrupo = new Map<string, Map<string, FilaGrupo>>();

  // Sembrar todos los equipos que aparecen en partidos de grupos (aunque no hayan jugado).
  const fila = (g: string, id: string): FilaGrupo => {
    if (!porGrupo.has(g)) porGrupo.set(g, new Map());
    const m = porGrupo.get(g)!;
    if (!m.has(id)) m.set(id, { equipoId: id, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 });
    return m.get(id)!;
  };

  for (const p of partidos) {
    if (p.fase !== 'GRUPOS' || !p.grupo) continue;
    if (p.equipo_a) fila(p.grupo, p.equipo_a);
    if (p.equipo_b) fila(p.grupo, p.equipo_b);

    if (p.estado !== 'FINISHED' || p.goles_a_90 == null || p.goles_b_90 == null) continue;
    if (!p.equipo_a || !p.equipo_b) continue;

    const a = fila(p.grupo, p.equipo_a);
    const b = fila(p.grupo, p.equipo_b);
    const ga = p.goles_a_90;
    const gb = p.goles_b_90;
    a.pj++; b.pj++;
    a.gf += ga; a.gc += gb;
    b.gf += gb; b.gc += ga;
    if (ga > gb) { a.g++; a.pts += 3; b.p++; }
    else if (ga < gb) { b.g++; b.pts += 3; a.p++; }
    else { a.e++; b.e++; a.pts++; b.pts++; }
  }

  const nombre = (id: string) => equipos?.get(id)?.nombre ?? id;
  const grupos: Grupo[] = [];
  for (const [g, m] of [...porGrupo.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
    const filas = [...m.values()];
    for (const f of filas) f.dg = f.gf - f.gc;
    filas.sort((x, y) => y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || nombre(x.equipoId).localeCompare(nombre(y.equipoId)));
    grupos.push({ grupo: g, filas });
  }
  return grupos;
}

export interface Proyeccion {
  grupos: Grupo[];
  /** ids de los 8 mejores terceros (clasifican junto a los top-2 de cada grupo). */
  mejoresTerceros: Set<string>;
  /** ¿el usuario ya pronosticó algún partido de grupos? */
  hayPredicciones: boolean;
}

/**
 * Proyecta los clasificados a 16avos SEGÚN los marcadores que el usuario pronosticó
 * en la fase de grupos: top 2 de cada grupo + los 8 mejores terceros (formato 2026).
 */
export function proyectarClasificados(
  partidos: PartidoRow[],
  misPron: PronosticoRow[],
  equipos: Map<string, EquipoView> | undefined,
): Proyeccion {
  const pred = new Map(misPron.map((p) => [p.partido_id, p]));
  let hayPredicciones = false;
  const sinteticos = partidos
    .filter((p) => p.fase === 'GRUPOS')
    .map((p) => {
      const pr = pred.get(p.id);
      if (!pr) return { ...p, estado: 'SCHEDULED', goles_a_90: null, goles_b_90: null } as PartidoRow;
      hayPredicciones = true;
      return { ...p, estado: 'FINISHED', goles_a_90: pr.marcador_a_90, goles_b_90: pr.marcador_b_90 } as PartidoRow;
    });

  const grupos = calcularGrupos(sinteticos, equipos);
  // 8 mejores terceros entre todos los grupos.
  const terceros = grupos.map((g) => g.filas[2]).filter(Boolean) as FilaGrupo[];
  terceros.sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf);
  const mejoresTerceros = new Set(terceros.slice(0, 8).map((t) => t.equipoId));
  return { grupos, mejoresTerceros, hayPredicciones };
}
