/**
 * Modelo de dominio de la Polla Mundialista (Mundial 2026).
 *
 * Este archivo es la ÚNICA fuente de verdad de los tipos del negocio.
 * Lo comparten servidor (cálculo definitivo) y cliente (visualización),
 * de modo que la lógica de puntos se escribe y se prueba una sola vez.
 */

// ---------------------------------------------------------------------------
// Fases del torneo
// ---------------------------------------------------------------------------

/**
 * Fases del torneo. El multiplicador (sección 6.3) depende de la fase.
 * Solo las fases distintas de GRUPOS admiten extras de eliminatoria (6.2).
 */
export const FASES = [
  'GRUPOS',
  'R32', // 16avos
  'R16', // octavos
  'CUARTOS',
  'SEMIS',
  'TERCER_PUESTO',
  'FINAL',
] as const;

export type Fase = (typeof FASES)[number];

/** Fases en las que el partido es a eliminación directa (admiten extras 6.2). */
export const FASES_ELIMINATORIA: ReadonlySet<Fase> = new Set<Fase>([
  'R32',
  'R16',
  'CUARTOS',
  'SEMIS',
  'TERCER_PUESTO',
  'FINAL',
]);

export function esEliminatoria(fase: Fase): boolean {
  return FASES_ELIMINATORIA.has(fase);
}

// ---------------------------------------------------------------------------
// Pronóstico del usuario (sección 5)
// ---------------------------------------------------------------------------

/** Identificador del equipo dentro de un partido: local (A) o visitante (B). */
export type LadoEquipo = 'A' | 'B';

/** Marcador genérico de dos equipos. Goles enteros >= 0. */
export interface Marcador {
  readonly golesA: number;
  readonly golesB: number;
}

/**
 * Pronóstico de un usuario para UN partido.
 *
 * - `marcador90` es obligatorio en todas las fases.
 * - Los campos de eliminatoria son OPCIONALES y solo puntúan en eliminatorias.
 *   `null`/`undefined` significa "no lo pronosticó" (no puntúa ese extra, pero
 *   el marcador de 90' sigue puntuando con normalidad).
 *
 * La AUSENCIA TOTAL de pronóstico para un partido se representa con `null`
 * en las funciones del motor (NO con un objeto vacío): partido iniciado sin
 * pronóstico = 0 puntos en TODAS las categorías (sección 4).
 */
export interface PronosticoPartido {
  /** Marcador pronosticado de los 90 minutos. */
  readonly marcador90: Marcador;

  // --- Solo eliminatorias (opcional) ---

  /**
   * ¿El usuario predijo que habría tiempo extra?
   * `true` = sí, `false` = no, `null/undefined` = no lo pronosticó.
   * Acertar el "no" también puntúa (6.2).
   */
  readonly habraExtra?: boolean | null;

  /**
   * Marcador acumulado pronosticado al final del tiempo extra.
   * Solo se evalúa si `habraExtra === true`. (6.2)
   */
  readonly marcadorExtra?: Marcador | null;

  /**
   * Ganador final del partido (clasificado). Cubre el caso de penales.
   * El marcador de penales NO se pronostica ni puntúa (sección 5/6.2).
   */
  readonly ganadorFinal?: LadoEquipo | null;
}

// ---------------------------------------------------------------------------
// Resultado oficial de un partido (lo que el servidor confirma)
// ---------------------------------------------------------------------------

/**
 * Estados de partido normalizados (modelo interno único; las APIs externas
 * se mapean a estos valores).
 */
export const ESTADOS_PARTIDO = [
  'SCHEDULED',
  'TIMED',
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type EstadoPartido = (typeof ESTADOS_PARTIDO)[number];

/**
 * Resultado oficial de un partido usado por el motor de puntos.
 *
 * Para puntos PROVISIONALES en vivo, se construye este mismo objeto con el
 * marcador actual "como si fuera el final" y `huboExtra=false` (aún no se sabe);
 * el flag provisional vive FUERA del motor (en el llamador), no aquí.
 */
export interface ResultadoOficial {
  /** Marcador oficial de los 90 minutos. */
  readonly marcador90: Marcador;

  // --- Solo eliminatorias ---

  /** ¿Hubo tiempo extra realmente? (solo relevante en eliminatorias) */
  readonly huboExtra?: boolean;

  /**
   * Marcador acumulado oficial al final del tiempo extra.
   * Solo presente si `huboExtra === true`.
   */
  readonly marcadorExtra?: Marcador | null;

  /**
   * Ganador final oficial del partido (equipo clasificado).
   * Cubre la definición por penales. Obligatorio en eliminatorias.
   */
  readonly ganadorFinal?: LadoEquipo | null;
}

// ---------------------------------------------------------------------------
// Configuración de puntos (sección 6) — editable desde el panel admin
// ---------------------------------------------------------------------------

export interface PuntosBaseConfig {
  /** Marcador exacto de 90' (6.1). No acumula con los de abajo. */
  readonly marcadorExacto: number;
  /** Resultado 1X2 correcto sin marcador exacto (6.1). */
  readonly resultado1X2: number;
  /** Total de goles A+B correcto sin marcador exacto (6.1). */
  readonly totalGoles: number;
}

export interface ExtrasEliminatoriaConfig {
  /** Acertar si hubo o no tiempo extra (6.2). */
  readonly acertarHuboExtra: number;
  /** Marcador exacto al final del extra (solo si predijo que sí y hubo) (6.2). */
  readonly marcadorExtraExacto: number;
  /** Ganador final correcto, incluye penales (6.2). */
  readonly ganadorFinal: number;
}

export type MultiplicadoresFase = Readonly<Record<Fase, number>>;

export interface BonosTorneoConfig {
  /** Por cada equipo correcto clasificado a 16avos (6.4). */
  readonly clasificado16avos: number;
  /** Por cada equipo correcto clasificado a octavos (6.4). */
  readonly clasificadoOctavos: number;
  /** Por cada equipo correcto clasificado a cuartos (6.4). */
  readonly clasificadoCuartos: number;
  /** Por cada equipo correcto clasificado a semis (6.4). */
  readonly clasificadoSemis: number;
  /** Por cada equipo correcto clasificado a la final (6.4). */
  readonly clasificadoFinal: number;
  /** Campeón del Mundial (6.4). */
  readonly campeon: number;
  /** Goleador del Mundial (6.4). */
  readonly goleador: number;
}

/**
 * Configuración COMPLETA del sistema de puntos. Editable desde el panel admin
 * solo HASTA el primer partido del torneo; después queda bloqueada (sección 6).
 */
export interface ConfigPuntos {
  readonly base: PuntosBaseConfig;
  readonly extras: ExtrasEliminatoriaConfig;
  readonly multiplicadores: MultiplicadoresFase;
  readonly bonos: BonosTorneoConfig;
}

// ---------------------------------------------------------------------------
// Desglose de puntos (resultado del motor) — se persiste y se muestra
// ---------------------------------------------------------------------------

/**
 * Desglose detallado del cálculo de un partido. Determinista y auditable.
 * `total = (base + extras) * multiplicador`.
 */
export interface DesglosePartido {
  // Aciertos booleanos (para mostrar y para desempates)
  readonly marcadorExacto: boolean;
  readonly resultado1X2: boolean;
  readonly totalGoles: boolean;
  readonly acertoHuboExtra: boolean;
  readonly marcadorExtraExacto: boolean;
  readonly ganadorFinalCorrecto: boolean;

  // Puntos desagregados (antes de multiplicar)
  readonly puntosBase: number;
  readonly puntosExtras: number;

  // Multiplicador aplicado y total final del partido
  readonly multiplicador: number;
  readonly total: number;

  /** `true` si no había pronóstico (todo en cero por la regla de la sección 4). */
  readonly sinPronostico: boolean;
}

/** Desglose de un bono individual de torneo (6.4). */
export interface DesgloseBono {
  readonly tipo: keyof BonosTorneoConfig;
  readonly aciertos: number;
  readonly puntosPorAcierto: number;
  readonly total: number;
}
