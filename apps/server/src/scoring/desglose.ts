/**
 * Cálculo de desgloses por (usuario, partido) usando el motor puro @polla/core.
 *
 * Reglas:
 *   - Partido FINISHED ⇒ desglose CONFIRMADO con el resultado oficial.
 *   - Partido IN_PLAY/PAUSED ⇒ desglose PROVISIONAL con el marcador actual
 *     "como si fuera el final de los 90'".
 *   - Cualquier otro estado (SCHEDULED/TIMED/…) ⇒ no puntúa todavía (null).
 */
import { calcularPuntos, type ConfigPuntos } from '@polla/core';
import type {
  DesgloseCalculado,
  PartidoScoring,
  PronosticoUsuario,
} from './types.js';

function estadoPuntuable(p: PartidoScoring): 'final' | 'provisional' | null {
  if (p.estado === 'FINISHED') return 'final';
  if (p.estado === 'IN_PLAY' || p.estado === 'PAUSED') return 'provisional';
  return null;
}

/**
 * Calcula el desglose de UN usuario en UN partido. Devuelve `null` si el partido
 * aún no es puntuable o no tiene marcador disponible.
 */
export function computarDesgloseUsuario(
  partido: PartidoScoring,
  up: PronosticoUsuario,
  config: ConfigPuntos,
): DesgloseCalculado | null {
  const modo = estadoPuntuable(partido);
  if (modo === null) return null;

  const resultado =
    modo === 'final' ? partido.resultado : partido.resultadoProvisional;
  if (resultado == null) return null;

  const desglose = calcularPuntos(up.pronostico, resultado, partido.fase, config);
  return {
    userId: up.userId,
    partidoId: partido.id,
    desglose,
    provisional: modo === 'provisional',
    puntos: desglose.total,
  };
}

/**
 * Calcula los desgloses de TODOS los usuarios para un partido. Los usuarios sin
 * pronóstico deben venir igualmente en `pronosticos` con `pronostico: null`
 * (regla sección 4: aparecen con 0 puntos), si se desea persistir su 0.
 */
export function computarDesglosesPartido(
  partido: PartidoScoring,
  pronosticos: readonly PronosticoUsuario[],
  config: ConfigPuntos,
): DesgloseCalculado[] {
  const out: DesgloseCalculado[] = [];
  for (const up of pronosticos) {
    const d = computarDesgloseUsuario(partido, up, config);
    if (d) out.push(d);
  }
  return out;
}
