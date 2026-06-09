/**
 * Decisión de cuándo consultar la API (sección 1):
 *   - Cada 60 s durante VENTANAS de partido (partido en juego, o que arranca en
 *     ≤ 15 min, o recién finalizado hace ≤ 15 min).
 *   - Cada 30 min fuera de ventanas.
 * Función pura y testeable; el cron la llama cada minuto.
 */
export interface PartidoTiempo {
  kickoffUtcMs: number;
  estado: string;
}

const VENTANA_MS = 15 * 60 * 1000;
const FUERA_VENTANA_MS = 30 * 60 * 1000;

export function hayVentanaActiva(
  partidos: readonly PartidoTiempo[],
  ahoraMs: number,
): boolean {
  return partidos.some((p) => {
    if (p.estado === 'IN_PLAY' || p.estado === 'PAUSED') return true;
    const dt = p.kickoffUtcMs - ahoraMs;
    // arranca pronto (≤15min) o empezó hace poco (hasta ~3h, por si sigue vivo)
    if (dt <= VENTANA_MS && dt >= -3 * 60 * 60 * 1000) return true;
    return false;
  });
}

export function debePollearAhora(
  partidos: readonly PartidoTiempo[],
  ahoraMs: number,
  ultimoPollMs: number | null,
): boolean {
  if (ultimoPollMs == null) return true; // primer ciclo
  const desde = ahoraMs - ultimoPollMs;
  if (hayVentanaActiva(partidos, ahoraMs)) {
    return desde >= 55 * 1000; // ~60s en ventana
  }
  return desde >= FUERA_VENTANA_MS; // 30 min fuera de ventana
}
