/**
 * MOTOR DE CÁLCULO DE PUNTOS — CERO MARGEN DE ERROR (sección 9).
 *
 * `calcularPuntos` es una función PURA, DETERMINISTA y AISLADA:
 *   - sin acceso a base de datos,
 *   - sin efectos secundarios,
 *   - sin lectura de reloj ni de red.
 *
 * Toda la app (incluidos los puntos provisionales en vivo) puntúa SOLO a
 * través de esta función. Reejecutarla con las mismas entradas da siempre el
 * mismo resultado (idempotente y recalculable).
 */
import type {
  ConfigPuntos,
  DesglosePartido,
  Fase,
  Marcador,
  PronosticoPartido,
  ResultadoOficial,
} from './types.js';
import { esEliminatoria } from './types.js';

/** Resultado 1X2 de un marcador: 'A' gana, 'B' gana, o 'X' empate. */
export function resultado1X2(m: Marcador): 'A' | 'B' | 'X' {
  if (m.golesA > m.golesB) return 'A';
  if (m.golesA < m.golesB) return 'B';
  return 'X';
}

function mismoMarcador(a: Marcador, b: Marcador): boolean {
  return a.golesA === b.golesA && a.golesB === b.golesB;
}

function totalGoles(m: Marcador): number {
  return m.golesA + m.golesB;
}

/** Desglose en cero usado cuando no hay pronóstico (sección 4). */
function desgloseVacio(multiplicador: number): DesglosePartido {
  return {
    marcadorExacto: false,
    resultado1X2: false,
    totalGoles: false,
    acertoHuboExtra: false,
    marcadorExtraExacto: false,
    ganadorFinalCorrecto: false,
    puntosBase: 0,
    puntosExtras: 0,
    multiplicador,
    total: 0,
    sinPronostico: true,
  };
}

/**
 * Calcula el desglose de puntos de UN partido.
 *
 * @param pronostico  Pronóstico del usuario, o `null` si no registró ninguno.
 *                    `null` ⇒ 0 puntos en todas las categorías (sección 4).
 * @param resultado   Resultado oficial (o el marcador actual "como si fuera
 *                    final" para el cálculo provisional en vivo).
 * @param fase        Fase del partido (determina multiplicador y si hay extras).
 * @param config      Configuración de puntos vigente.
 */
export function calcularPuntos(
  pronostico: PronosticoPartido | null | undefined,
  resultado: ResultadoOficial,
  fase: Fase,
  config: ConfigPuntos,
): DesglosePartido {
  const multiplicador = config.multiplicadores[fase];

  // Regla de oro (sección 4): partido sin pronóstico = 0 en todo.
  if (pronostico == null) {
    return desgloseVacio(multiplicador);
  }

  const pred = pronostico.marcador90;
  const real = resultado.marcador90;

  // --- 6.1 Puntos base sobre el marcador de los 90' ---
  const marcadorExacto = mismoMarcador(pred, real);
  // Un marcador exacto implica acertar 1X2 y total de goles; lo reflejamos en
  // los booleanos (importan para los desempates de la sección 6.5), aunque los
  // puntos NO se acumulen (solo se otorgan los 5).
  const acierto1X2 = resultado1X2(pred) === resultado1X2(real);
  const aciertoTotal = totalGoles(pred) === totalGoles(real);

  let puntosBase: number;
  if (marcadorExacto) {
    puntosBase = config.base.marcadorExacto; // 5, no acumula con los de abajo
  } else {
    puntosBase =
      (acierto1X2 ? config.base.resultado1X2 : 0) +
      (aciertoTotal ? config.base.totalGoles : 0);
  }

  // --- 6.2 Extras (solo eliminatorias) ---
  let acertoHuboExtra = false;
  let marcadorExtraExacto = false;
  let ganadorFinalCorrecto = false;
  let puntosExtras = 0;

  if (esEliminatoria(fase)) {
    const huboExtraReal = resultado.huboExtra === true;

    // Acertar si hubo o no extra (acertar el "no" también puntúa).
    // Requiere que el usuario lo haya pronosticado explícitamente (boolean).
    if (typeof pronostico.habraExtra === 'boolean') {
      if (pronostico.habraExtra === huboExtraReal) {
        acertoHuboExtra = true;
        puntosExtras += config.extras.acertarHuboExtra;
      }
    }

    // Marcador exacto al final del extra: solo si predijo que SÍ habría y hubo.
    if (
      pronostico.habraExtra === true &&
      huboExtraReal &&
      pronostico.marcadorExtra != null &&
      resultado.marcadorExtra != null &&
      mismoMarcador(pronostico.marcadorExtra, resultado.marcadorExtra)
    ) {
      marcadorExtraExacto = true;
      puntosExtras += config.extras.marcadorExtraExacto;
    }

    // Ganador final (incluye definición por penales).
    if (
      pronostico.ganadorFinal != null &&
      resultado.ganadorFinal != null &&
      pronostico.ganadorFinal === resultado.ganadorFinal
    ) {
      ganadorFinalCorrecto = true;
      puntosExtras += config.extras.ganadorFinal;
    }
  }

  // --- 6.3 Multiplicador por fase ---
  const total = (puntosBase + puntosExtras) * multiplicador;

  return {
    marcadorExacto,
    resultado1X2: acierto1X2,
    totalGoles: aciertoTotal,
    acertoHuboExtra,
    marcadorExtraExacto,
    ganadorFinalCorrecto,
    puntosBase,
    puntosExtras,
    multiplicador,
    total,
    sinPronostico: false,
  };
}
