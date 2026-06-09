/**
 * Modelo interno único al que se normalizan TODAS las fuentes (football-data.org
 * y el fallback API-Football). El poller escribe exactamente estos campos en la
 * tabla `partidos`.
 */
import type { EstadoPartido, Fase, LadoEquipo } from '@polla/core';

/** Equipo tal como lo descubre el poller (para poblar el catálogo `equipos`). */
export interface EquipoNormalizado {
  id: string; // código corto (TLA), p.ej. 'ARG'
  nombre: string;
  crestUrl: string | null;
}

/** Partido normalizado, listo para upsert en `partidos` (+ catálogo de equipos). */
export interface PartidoNormalizado {
  id: string;
  fase: Fase;
  grupo: string | null;
  rondaOrden: number;
  equipoA: EquipoNormalizado | null;
  equipoB: EquipoNormalizado | null;
  kickoffUtc: string; // ISO 8601 UTC
  estado: EstadoPartido;

  // Resultado (null mientras no haya datos)
  golesA90: number | null; // marcador de los 90' (regularTime)
  golesB90: number | null;
  huboExtra: boolean | null;
  golesAExtra: number | null; // marcador ACUMULADO al final del tiempo extra
  golesBExtra: number | null;
  ganadorFinal: LadoEquipo | null; // incluye definición por penales
}
