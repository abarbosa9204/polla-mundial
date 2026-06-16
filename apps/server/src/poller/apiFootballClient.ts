/**
 * Fallback: API-Football (api-sports.io) normalizado al MISMO modelo interno.
 * Fuente SECUNDARIA: solo se usa si football-data.org falla. El mapeo de fases
 * por el texto de "round" es best-effort; football-data es la fuente canónica.
 */
import type { Env } from '../env.js';
import type { Fase } from '@polla/core';
import type { PartidoNormalizado } from './model.js';
import { mapStage } from './stages.js';
import { codigoEquipo } from './codigosEquipos.js';

const BASE = 'https://v3.football.api-sports.io';

interface AFScore {
  home: number | null;
  away: number | null;
}
interface AFFixture {
  fixture: { id: number; date: string; status: { short: string } };
  league: { round: string };
  teams: { home: { name: string }; away: { name: string } };
  goals: AFScore;
  score: {
    halftime: AFScore;
    fulltime: AFScore;
    extratime: AFScore;
    penalty: AFScore;
  };
}

/** Mapea el texto "round" de API-Football a nuestra fase. */
function roundAFase(round: string): { fase: Fase; rondaOrden: number } | null {
  const r = round.toLowerCase();
  if (r.includes('group')) return mapStage('GROUP_STAGE');
  if (r.includes('32')) return mapStage('LAST_32');
  if (r.includes('16')) return mapStage('LAST_16');
  if (r.includes('quarter')) return mapStage('QUARTER_FINALS');
  if (r.includes('semi')) return mapStage('SEMI_FINALS');
  if (r.includes('3rd') || r.includes('third')) return mapStage('THIRD_PLACE');
  if (r.includes('final')) return mapStage('FINAL');
  return null;
}

const STATUS_AF: Record<string, PartidoNormalizado['estado']> = {
  TBD: 'SCHEDULED',
  NS: 'SCHEDULED',
  '1H': 'IN_PLAY',
  '2H': 'IN_PLAY',
  ET: 'IN_PLAY',
  P: 'IN_PLAY',
  LIVE: 'IN_PLAY',
  HT: 'PAUSED',
  BT: 'PAUSED',
  FT: 'FINISHED',
  AET: 'FINISHED',
  PEN: 'FINISHED',
  PST: 'POSTPONED',
  CANC: 'CANCELLED',
  ABD: 'SUSPENDED',
  SUSP: 'SUSPENDED',
  AWD: 'FINISHED',
};

function normalizar(f: AFFixture): PartidoNormalizado | null {
  const fase = roundAFase(f.league.round);
  if (!fase) return null;

  const huboExtra =
    f.fixture.status.short === 'AET' ||
    f.fixture.status.short === 'PEN' ||
    (f.score.extratime.home != null && f.score.extratime.away != null);

  // Marcador 90': score.fulltime (en API-Football es el resultado tras 90').
  const golesA90 = f.score.fulltime.home ?? f.goals.home ?? null;
  const golesB90 = f.score.fulltime.away ?? f.goals.away ?? null;

  let golesAExtra: number | null = null;
  let golesBExtra: number | null = null;
  if (huboExtra && f.score.extratime.home != null) {
    // En API-Football, extratime suele ser el ACUMULADO al final del extra.
    golesAExtra = f.score.extratime.home;
    golesBExtra = f.score.extratime.away;
  }

  // Ganador final: por penales, mayor en penalty; si no, por el acumulado.
  let ganadorFinal: 'A' | 'B' | null = null;
  if (f.score.penalty.home != null && f.score.penalty.away != null) {
    ganadorFinal = f.score.penalty.home > f.score.penalty.away ? 'A' : 'B';
  } else if (golesA90 != null && golesB90 != null) {
    const a = golesAExtra ?? golesA90;
    const b = golesBExtra ?? golesB90;
    if (a > b) ganadorFinal = 'A';
    else if (b > a) ganadorFinal = 'B';
  }

  return {
    id: `af_${f.fixture.id}`,
    fase: fase.fase,
    grupo: null,
    rondaOrden: fase.rondaOrden,
    // Código CANÓNICO desde el nombre (API-Football no trae TLA). Evita generar
    // duplicados/basura por las 3 primeras letras del nombre (ver codigosEquipos.ts).
    equipoA: { id: codigoEquipo({ nombre: f.teams.home.name }) ?? f.teams.home.name.slice(0, 3).toUpperCase(), nombre: f.teams.home.name, crestUrl: null },
    equipoB: { id: codigoEquipo({ nombre: f.teams.away.name }) ?? f.teams.away.name.slice(0, 3).toUpperCase(), nombre: f.teams.away.name, crestUrl: null },
    kickoffUtc: new Date(f.fixture.date).toISOString(),
    estado: STATUS_AF[f.fixture.status.short] ?? 'SCHEDULED',
    golesA90,
    golesB90,
    huboExtra,
    golesAExtra,
    golesBExtra,
    ganadorFinal,
  };
}

export async function fetchPartidosApiFootball(env: Env): Promise<PartidoNormalizado[]> {
  // league=1 (World Cup), season del Mundial 2026.
  const res = await fetch(`${BASE}/fixtures?league=1&season=2026`, {
    headers: { 'x-apisports-key': env.API_FOOTBALL_TOKEN },
  });
  if (!res.ok) throw new Error(`api-football: HTTP ${res.status}`);
  const data = (await res.json()) as { response?: AFFixture[] };
  return (data.response ?? [])
    .map(normalizar)
    .filter((p): p is PartidoNormalizado => p !== null);
}

export { normalizar as normalizarApiFootball };
