/**
 * Fuente ALTERNA de marcador en vivo: sportdb.dev (datos de Flashscore).
 *
 * Solo se usa para RELLENAR el marcador EN VIVO cuando football-data (primaria)
 * va atrasada. Consulta el endpoint CONCISO del Mundial (no el live global), que
 * devuelve únicamente los partidos del torneo en curso.
 *
 *   GET /api/flashscore/football/world:8/world-championship:lvUBR5F8/live
 *
 * Gateada por `SPORTDB_API_KEY`: sin clave, no consulta nada.
 */
import type { Env } from '../env.js';

// Competición "World Championship" (= Copa Mundial masculina) en Flashscore.
const WC_LIVE_URL =
  'https://api.sportdb.dev/api/flashscore/football/world:8/world-championship:lvUBR5F8/live';

export interface PartidoEnVivoSportdb {
  kickoffUtc: string; // ISO 8601
  home3: string; // sigla local (3 letras)
  away3: string;
  homeNombre: string; // nombre en inglés (sin traducir)
  awayNombre: string;
  golesA: number | null;
  golesB: number | null;
  estado: 'SCHEDULED' | 'IN_PLAY' | 'PAUSED' | 'FINISHED';
}

// eventStageTypeId: 1=programado, 2=en juego, 3=finalizado.
const TIPO_ESTADO: Record<string, PartidoEnVivoSportdb['estado']> = {
  '1': 'SCHEDULED',
  '2': 'IN_PLAY',
  '3': 'FINISHED',
};

function num(v: unknown): number | null {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isNaN(n) ? null : n;
}

/** Trae los partidos EN VIVO del Mundial desde la fuente alterna. [] si no hay clave. */
export async function fetchMundialEnVivo(env: Env): Promise<PartidoEnVivoSportdb[]> {
  if (!env.SPORTDB_API_KEY) return [];
  const res = await fetch(WC_LIVE_URL, { headers: { 'X-API-Key': env.SPORTDB_API_KEY } });
  if (!res.ok) throw new Error(`sportdb: HTTP ${res.status}`);
  const data = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(data)) return [];

  return data.map((m) => {
    let estado = TIPO_ESTADO[String(m.eventStageTypeId)] ?? 'IN_PLAY';
    // Medio tiempo → PAUSED (eventStage trae el texto del momento del juego).
    const stage = String(m.eventStage ?? '').toLowerCase();
    if (estado === 'IN_PLAY' && /half\s*time|halftime|descanso|\bht\b/.test(stage)) {
      estado = 'PAUSED';
    }
    return {
      kickoffUtc: new Date(String(m.startDateTimeUtc)).toISOString(),
      home3: String(m.home3CharName ?? '').toUpperCase(),
      away3: String(m.away3CharName ?? '').toUpperCase(),
      homeNombre: String(m.homeName ?? ''),
      awayNombre: String(m.awayName ?? ''),
      golesA: num(m.homeScore),
      golesB: num(m.awayScore),
      estado,
    };
  });
}
