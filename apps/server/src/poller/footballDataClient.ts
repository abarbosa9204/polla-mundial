/**
 * Cliente HTTP de football-data.org (plan gratuito). Respeta el límite de
 * 10 req/min usando una sola llamada por ciclo (lista completa de partidos del
 * torneo) — muy por debajo del límite.
 */
import type { Env } from '../env.js';
import type { FDMatch } from './footballDataNormalizer.js';
import { traducirPais } from './traducciones.js';

const BASE = 'https://api.football-data.org/v4';

export async function fetchPartidosFootballData(env: Env): Promise<FDMatch[]> {
  const res = await fetch(`${BASE}/competitions/${env.FD_COMPETITION}/matches`, {
    headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN },
  });
  if (res.status === 429) {
    throw new Error('football-data: límite de peticiones (429)');
  }
  if (!res.ok) {
    throw new Error(`football-data: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { matches?: FDMatch[] };
  return data.matches ?? [];
}

export interface GoleadorFD {
  nombre: string;
  equipo: string | null;
  equipoCrest: string | null;
  goles: number;
  penales: number | null;
  asistencias: number | null;
}

/** Tabla de goleadores del torneo (football-data /scorers). */
export async function fetchGoleadoresFootballData(env: Env, limit = 30): Promise<GoleadorFD[]> {
  const res = await fetch(
    `${BASE}/competitions/${env.FD_COMPETITION}/scorers?limit=${limit}`,
    { headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN } },
  );
  if (res.status === 429) throw new Error('football-data: límite de peticiones (429)');
  if (!res.ok) throw new Error(`football-data: HTTP ${res.status}`);
  const data = (await res.json()) as {
    scorers?: Array<{
      player?: { name?: string };
      team?: { name?: string; crest?: string };
      goals?: number | null;
      penalties?: number | null;
      assists?: number | null;
    }>;
  };
  return (data.scorers ?? []).map((s) => ({
    nombre: s.player?.name ?? '—',
    equipo: s.team?.name ? traducirPais(s.team.name) : null,
    equipoCrest: s.team?.crest ?? null,
    goles: s.goals ?? 0,
    penales: s.penalties ?? null,
    asistencias: s.assists ?? null,
  }));
}

// Caché simple del goleador líder en vivo (evita pegarle a /scorers en cada
// recálculo). `jugadores.id` coincide con `player.id` de football-data ⇒ se
// emparejan por ID, sin fragilidad de nombres.
let goleadoresVivosCache: { ts: number; ids: string[] } | null = null;

/**
 * IDs (string) del/los goleador(es) LÍDER(es) ahora mismo (máximo de goles).
 * Para el bono de goleador PARCIAL. Devuelve [] si la API falla o no hay goles.
 */
export async function fetchGoleadoresVivosIds(env: Env, ahoraMs: number): Promise<string[]> {
  if (goleadoresVivosCache && ahoraMs - goleadoresVivosCache.ts < 2 * 60_000) {
    return goleadoresVivosCache.ids;
  }
  try {
    const res = await fetch(
      `${BASE}/competitions/${env.FD_COMPETITION}/scorers?limit=20`,
      { headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN } },
    );
    if (!res.ok) return goleadoresVivosCache?.ids ?? [];
    const data = (await res.json()) as {
      scorers?: Array<{ player?: { id?: number }; goals?: number | null }>;
    };
    const scorers = (data.scorers ?? []).filter((s) => (s.goals ?? 0) > 0 && s.player?.id != null);
    const max = scorers.reduce((m, s) => Math.max(m, s.goals ?? 0), 0);
    const ids = max > 0 ? scorers.filter((s) => (s.goals ?? 0) === max).map((s) => String(s.player!.id)) : [];
    goleadoresVivosCache = { ts: ahoraMs, ids };
    return ids;
  } catch {
    return goleadoresVivosCache?.ids ?? [];
  }
}
