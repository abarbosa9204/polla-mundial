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
