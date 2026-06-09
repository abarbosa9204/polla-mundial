/**
 * Construcción de la tabla de posiciones a partir de los desgloses calculados.
 *
 * - `puntos_confirmados`  = partidos FINISHED + bonos de torneo.
 * - `puntos_provisionales`= partidos en juego (IN_PLAY/PAUSED).
 * - `puntos_totales`      = confirmados + provisionales (vista en vivo).
 * - Los contadores de desempate (exactos, 1X2) se cuentan SOLO sobre partidos
 *   CONFIRMADOS, para que el orden no oscile con marcadores en juego.
 * - El orden aplica los 4 niveles de desempate de la sección 6.5 (vía @polla/core).
 */
import { ordenarClasificacion, type FilaClasificacion } from '@polla/core';
import type { DesgloseCalculado, UsuarioTabla } from './types.js';

export interface FilaTablaResultado {
  userId: string;
  displayName: string;
  puntosConfirmados: number;
  puntosProvisionales: number;
  puntosTotales: number;
  marcadoresExactos: number;
  resultados1x2: number;
  timestampCampeon: number | null;
  posicion: number;
  /** +n sube, -n baja respecto a `posicionesAnteriores`; 0 si igual o sin dato. */
  movimiento: number;
}

interface Acumulado {
  conf: number;
  prov: number;
  exactos: number;
  x1x2: number;
}

export function construirTablaPosiciones(
  usuarios: readonly UsuarioTabla[],
  desgloses: readonly DesgloseCalculado[],
  posicionesAnteriores?: ReadonlyMap<string, number>,
): FilaTablaResultado[] {
  const acc = new Map<string, Acumulado>();
  for (const u of usuarios) acc.set(u.userId, { conf: 0, prov: 0, exactos: 0, x1x2: 0 });

  for (const d of desgloses) {
    const a = acc.get(d.userId);
    if (!a) continue; // desglose de un usuario no listado: se ignora
    if (d.provisional) {
      a.prov += d.puntos;
    } else {
      a.conf += d.puntos;
      if (d.desglose.marcadorExacto) a.exactos++;
      if (d.desglose.resultado1X2) a.x1x2++;
    }
  }

  // Fila por usuario (incluye bonos en los confirmados).
  const filas = usuarios.map((u) => {
    const a = acc.get(u.userId)!;
    const confirmados = a.conf + u.puntosBonos;
    return {
      userId: u.userId,
      displayName: u.displayName,
      puntosConfirmados: confirmados,
      puntosProvisionales: a.prov,
      puntosTotales: confirmados + a.prov,
      marcadoresExactos: a.exactos,
      resultados1x2: a.x1x2,
      timestampCampeon: u.timestampCampeon,
    };
  });

  // Ordenar con los desempates de la sección 6.5.
  const paraOrdenar: FilaClasificacion[] = filas.map((f) => ({
    userId: f.userId,
    puntosTotales: f.puntosTotales,
    marcadoresExactos: f.marcadoresExactos,
    resultados1X2: f.resultados1x2,
    timestampCampeon: f.timestampCampeon,
  }));
  const ordenadas = ordenarClasificacion(paraOrdenar);

  const datos = new Map(filas.map((f) => [f.userId, f]));
  return ordenadas.map((o) => {
    const f = datos.get(o.userId)!;
    const prev = posicionesAnteriores?.get(o.userId);
    return {
      ...f,
      posicion: o.posicion,
      movimiento: prev != null ? prev - o.posicion : 0,
    };
  });
}
