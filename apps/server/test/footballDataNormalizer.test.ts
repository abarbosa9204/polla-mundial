/**
 * Tests del normalizador de football-data.org. Casos clave: el marcador de 90'
 * NUNCA debe contaminarse con goles de extra/penales (bug que rompería el motor).
 */
import { describe, it, expect } from 'vitest';
import {
  normalizarFootballData,
  type FDMatch,
} from '../src/poller/footballDataNormalizer.js';

describe('Normalizador football-data — marcador 90 vs extra/penales', () => {
  it('partido de grupos regular: fullTime es el marcador de 90', () => {
    const m: FDMatch = {
      id: 1,
      utcDate: '2026-06-11T16:00:00Z',
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      group: 'GROUP_A',
      homeTeam: { tla: 'ARG', name: 'Argentina', crest: 'http://x/arg.png' },
      awayTeam: { tla: 'BRA', name: 'Brasil', crest: 'http://x/bra.png' },
      score: {
        winner: 'HOME_TEAM',
        duration: 'REGULAR',
        fullTime: { home: 2, away: 1 },
        regularTime: null,
      },
    };
    const n = normalizarFootballData(m)!;
    expect(n.fase).toBe('GRUPOS');
    expect(n.grupo).toBe('A');
    expect(n.golesA90).toBe(2);
    expect(n.golesB90).toBe(1);
    expect(n.huboExtra).toBe(false);
    expect(n.golesAExtra).toBeNull();
    expect(n.ganadorFinal).toBe('A');
    expect(n.equipoA?.id).toBe('ARG');
  });

  it('eliminatoria decidida en penales: 90 = regularTime, NO fullTime (que trae penales)', () => {
    // Ejemplo oficial: 1-1 a los 90, 0-0 en extra, Alemania gana 6-5 en penales.
    // fullTime = 7-6 (incluye penales). El motor solo debe ver 1-1.
    const m: FDMatch = {
      id: 'Q1',
      utcDate: '2026-07-05T18:00:00Z',
      status: 'FINISHED',
      stage: 'QUARTER_FINALS',
      homeTeam: { tla: 'GER', name: 'Alemania' },
      awayTeam: { tla: 'ENG', name: 'Inglaterra' },
      score: {
        winner: 'HOME_TEAM',
        duration: 'PENALTY_SHOOTOUT',
        fullTime: { home: 7, away: 6 },
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 0, away: 0 },
        penalties: { home: 6, away: 5 },
      },
    };
    const n = normalizarFootballData(m)!;
    expect(n.fase).toBe('CUARTOS');
    expect(n.golesA90).toBe(1); // ¡no 7!
    expect(n.golesB90).toBe(1); // ¡no 6!
    expect(n.huboExtra).toBe(true);
    // Acumulado fin del extra = regularTime + extraTime = 1-1
    expect(n.golesAExtra).toBe(1);
    expect(n.golesBExtra).toBe(1);
    expect(n.ganadorFinal).toBe('A'); // Alemania, por penales
  });

  it('eliminatoria decidida en el tiempo extra: acumulado = regularTime + extraTime', () => {
    const m: FDMatch = {
      id: 'S1',
      utcDate: '2026-07-12T18:00:00Z',
      status: 'FINISHED',
      stage: 'SEMI_FINALS',
      homeTeam: { tla: 'FRA', name: 'Francia' },
      awayTeam: { tla: 'ESP', name: 'España' },
      score: {
        winner: 'HOME_TEAM',
        duration: 'EXTRA_TIME',
        fullTime: { home: 2, away: 1 }, // total tras extra
        regularTime: { home: 1, away: 1 },
        extraTime: { home: 1, away: 0 },
      },
    };
    const n = normalizarFootballData(m)!;
    expect(n.fase).toBe('SEMIS');
    expect(n.golesA90).toBe(1);
    expect(n.golesB90).toBe(1);
    expect(n.huboExtra).toBe(true);
    expect(n.golesAExtra).toBe(2); // 1 + 1
    expect(n.golesBExtra).toBe(1); // 1 + 0
    expect(n.ganadorFinal).toBe('A');
  });

  it('partido programado sin marcador: goles en null', () => {
    const m: FDMatch = {
      id: 2,
      utcDate: '2026-06-12T16:00:00Z',
      status: 'SCHEDULED',
      stage: 'GROUP_STAGE',
      group: 'GROUP_B',
      homeTeam: { tla: 'ESP' },
      awayTeam: { tla: 'GER' },
      score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null } },
    };
    const n = normalizarFootballData(m)!;
    expect(n.golesA90).toBeNull();
    expect(n.golesB90).toBeNull();
    expect(n.estado).toBe('SCHEDULED');
    expect(n.ganadorFinal).toBeNull();
  });

  it('empate en grupos: ganadorFinal null', () => {
    const m: FDMatch = {
      id: 3,
      utcDate: '2026-06-13T16:00:00Z',
      status: 'FINISHED',
      stage: 'GROUP_STAGE',
      group: 'GROUP_C',
      homeTeam: { tla: 'MEX' },
      awayTeam: { tla: 'USA' },
      score: { winner: 'DRAW', duration: 'REGULAR', fullTime: { home: 1, away: 1 } },
    };
    const n = normalizarFootballData(m)!;
    expect(n.ganadorFinal).toBeNull();
    expect(n.golesA90).toBe(1);
  });

  it('fase no reconocida (clasificatorias) → null', () => {
    const m: FDMatch = {
      id: 4,
      utcDate: '2025-06-13T16:00:00Z',
      status: 'FINISHED',
      stage: 'QUALIFICATION',
      homeTeam: { tla: 'COL' },
      awayTeam: { tla: 'PER' },
      score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 } },
    };
    expect(normalizarFootballData(m)).toBeNull();
  });
});
