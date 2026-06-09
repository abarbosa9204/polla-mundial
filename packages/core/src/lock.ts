/**
 * Regla de oro del cierre / lock (sección 4).
 *
 * Funciones PURAS de validación temporal. El servidor las invoca pasando SU
 * reloj en UTC (`ahoraUtcMs`); el reloj del cliente es irrelevante. El frontend
 * puede usarlas también solo como UX (deshabilitar el formulario), pero la
 * validación inatacable ocurre en el servidor.
 */

export interface ResultadoLock {
  readonly editable: boolean;
  /** Mensaje de error explícito cuando NO es editable (cierre superado). */
  readonly error?: string;
}

/**
 * Margen de cierre ANTES del kickoff. El registro del marcador se bloquea este
 * tiempo antes del inicio oficial del partido (sección 4 — mejora de seguridad).
 */
export const MARGEN_CIERRE_MS = 5 * 60 * 1000; // 5 minutos

/** Instante (epoch ms, UTC) en que cierra el pronóstico = kickoff − margen. */
export function instanteCierre(
  kickoffUtcMs: number,
  margenMs: number = MARGEN_CIERRE_MS,
): number {
  return kickoffUtcMs - margenMs;
}

/**
 * ¿Se puede crear/editar el pronóstico de un partido?
 *
 * Editable estrictamente ANTES del cierre (kickoff − margen). En el instante del
 * cierre (y después) queda inmutable. Si el partido se reprograma, basta con
 * pasar el nuevo `kickoffUtcMs`: el cierre sigue automáticamente al nuevo horario.
 *
 * @param kickoffUtcMs Kickoff oficial del partido (epoch ms, UTC) según la API.
 * @param ahoraUtcMs   Reloj del servidor (epoch ms, UTC) al momento de validar.
 * @param margenMs     Margen de cierre antes del kickoff (por defecto 5 min).
 */
export function pronosticoEditable(
  kickoffUtcMs: number,
  ahoraUtcMs: number,
  margenMs: number = MARGEN_CIERRE_MS,
): boolean {
  return ahoraUtcMs < instanteCierre(kickoffUtcMs, margenMs);
}

/**
 * Valida una escritura de pronóstico contra el cierre. Devuelve un resultado
 * explícito (nunca lanza) para que el servidor responda con un error claro.
 */
export function validarEscrituraPronostico(
  kickoffUtcMs: number,
  ahoraUtcMs: number,
  margenMs: number = MARGEN_CIERRE_MS,
): ResultadoLock {
  if (pronosticoEditable(kickoffUtcMs, ahoraUtcMs, margenMs)) {
    return { editable: true };
  }
  const cierreMs = instanteCierre(kickoffUtcMs, margenMs);
  const min = Math.round(margenMs / 60000);
  return {
    editable: false,
    error:
      `Pronóstico cerrado: el registro cierra ${min} min antes del kickoff ` +
      `(cierre ${new Date(cierreMs).toISOString()}, kickoff ${new Date(kickoffUtcMs).toISOString()}). ` +
      'Desde el cierre el pronóstico es inmutable.',
  };
}
