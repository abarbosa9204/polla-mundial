/**
 * Desempate en la tabla general (sección 6.5), en este orden:
 *   1. Más puntos totales.
 *   2. Más marcadores exactos.
 *   3. Más resultados 1X2.
 *   4. Registro del pronóstico de campeón más antiguo (timestamp menor gana).
 *
 * Función de comparación pura, apta para `Array.prototype.sort`.
 */

export interface FilaClasificacion {
  readonly userId: string;
  /** Puntos totales confirmados (+ provisionales si así se decide al construir). */
  readonly puntosTotales: number;
  /** Número de marcadores exactos acertados (desempate nivel 2). */
  readonly marcadoresExactos: number;
  /** Número de resultados 1X2 acertados (desempate nivel 3). */
  readonly resultados1X2: number;
  /**
   * Timestamp (epoch ms, asignado por el servidor) del registro del pronóstico
   * de campeón. `null` si el usuario nunca pronosticó campeón: pierde el
   * desempate de nivel 4 frente a quien sí lo hizo.
   */
  readonly timestampCampeon: number | null;
}

/**
 * Comparador para ordenar la tabla de mayor a menor mérito.
 * Devuelve < 0 si `a` va antes que `b` (mejor posición), > 0 si va después.
 */
export function compararClasificacion(
  a: FilaClasificacion,
  b: FilaClasificacion,
): number {
  // 1. Más puntos totales.
  if (a.puntosTotales !== b.puntosTotales) {
    return b.puntosTotales - a.puntosTotales;
  }
  // 2. Más marcadores exactos.
  if (a.marcadoresExactos !== b.marcadoresExactos) {
    return b.marcadoresExactos - a.marcadoresExactos;
  }
  // 3. Más resultados 1X2.
  if (a.resultados1X2 !== b.resultados1X2) {
    return b.resultados1X2 - a.resultados1X2;
  }
  // 4. Pronóstico de campeón más antiguo (timestamp menor gana). Sin pronóstico
  //    de campeón ⇒ Infinity ⇒ queda detrás de quien sí lo registró.
  const ta = a.timestampCampeon ?? Number.POSITIVE_INFINITY;
  const tb = b.timestampCampeon ?? Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;

  return 0;
}

/**
 * Ordena (sin mutar) una lista de filas según las reglas de desempate y asigna
 * la posición (1-based). Empates totales (mismas 4 claves) comparten posición.
 */
export function ordenarClasificacion(
  filas: readonly FilaClasificacion[],
): Array<FilaClasificacion & { posicion: number }> {
  const ordenadas = [...filas].sort(compararClasificacion);
  const resultado: Array<FilaClasificacion & { posicion: number }> = [];
  for (let i = 0; i < ordenadas.length; i++) {
    const actual = ordenadas[i]!;
    const previa = i > 0 ? ordenadas[i - 1]! : null;
    // Misma posición solo si empatan en TODAS las claves de desempate.
    const posicion =
      previa != null && compararClasificacion(previa, actual) === 0
        ? resultado[i - 1]!.posicion
        : i + 1;
    resultado.push({ ...actual, posicion });
  }
  return resultado;
}
