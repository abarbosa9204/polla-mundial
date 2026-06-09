/**
 * Suite obligatoria (sección 9) — Extras de ELIMINATORIA (6.2):
 * tiempo extra, marcador del extra, ganador final / penales.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularPuntos,
  CONFIG_PUNTOS_DEFAULT as CFG,
  type PronosticoPartido,
  type ResultadoOficial,
} from '../src/index.js';

describe('6.2 — Eliminatoria resuelta en los 90 minutos', () => {
  it('acierta marcador 90 y ganador final, sin extra, en R16 (×2)', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 2, golesB: 0 },
      habraExtra: false,
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 2, golesB: 0 },
      huboExtra: false,
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'R16', CFG);
    // base 5 (exacto) + extras (acertarNoExtra 2 + ganador 2 = 4) = 9, ×2 = 18
    expect(d.puntosBase).toBe(5);
    expect(d.acertoHuboExtra).toBe(true);
    expect(d.marcadorExtraExacto).toBe(false);
    expect(d.ganadorFinalCorrecto).toBe(true);
    expect(d.puntosExtras).toBe(4);
    expect(d.total).toBe((5 + 4) * 2);
  });
});

describe('6.2 — Tiempo extra predicho y acertado en marcador', () => {
  it('predijo que SÍ habría extra y acertó marcador acumulado del extra', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 1, golesB: 1 },
      habraExtra: true,
      marcadorExtra: { golesA: 2, golesB: 1 },
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 1, golesB: 1 },
      huboExtra: true,
      marcadorExtra: { golesA: 2, golesB: 1 },
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'SEMIS', CFG);
    // base 5 (exacto 90') + extras (huboExtra 2 + marcadorExtra 3 + ganador 2 = 7) = 12, ×4 = 48
    expect(d.acertoHuboExtra).toBe(true);
    expect(d.marcadorExtraExacto).toBe(true);
    expect(d.ganadorFinalCorrecto).toBe(true);
    expect(d.puntosExtras).toBe(7);
    expect(d.total).toBe((5 + 7) * 4);
  });

  it('predijo extra y acertó que hubo, pero falló el marcador del extra: no suma +3', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 1, golesB: 1 },
      habraExtra: true,
      marcadorExtra: { golesA: 3, golesB: 1 },
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 1, golesB: 1 },
      huboExtra: true,
      marcadorExtra: { golesA: 2, golesB: 1 },
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'CUARTOS', CFG);
    expect(d.marcadorExtraExacto).toBe(false);
    expect(d.acertoHuboExtra).toBe(true);
    expect(d.puntosExtras).toBe(2 + 2); // huboExtra + ganador, sin el +3
  });
});

describe('6.2 — Tiempo extra predicho que NO ocurrió', () => {
  it('predijo que habría extra pero se resolvió en 90: no acierta huboExtra ni marcadorExtra', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 1, golesB: 0 },
      habraExtra: true,
      marcadorExtra: { golesA: 2, golesB: 0 },
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 1, golesB: 0 },
      huboExtra: false,
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'R16', CFG);
    expect(d.acertoHuboExtra).toBe(false); // predijo true, fue false
    expect(d.marcadorExtraExacto).toBe(false); // no hubo extra
    expect(d.ganadorFinalCorrecto).toBe(true);
    expect(d.puntosExtras).toBe(2); // solo ganador
  });
});

describe('6.2 — "No habrá tiempo extra" acertado', () => {
  it('predijo que NO y no hubo: +2 por acertar el "no"', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 3, golesB: 1 },
      habraExtra: false,
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 3, golesB: 1 },
      huboExtra: false,
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'FINAL', CFG);
    expect(d.acertoHuboExtra).toBe(true);
    expect(d.puntosExtras).toBe(2 + 2); // acertar "no" + ganador
  });

  it('no pronosticó habraExtra (null): no puntúa ese extra pero el marcador 90 sí', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 1, golesB: 0 },
      ganadorFinal: 'A',
      // habraExtra ausente
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 1, golesB: 0 },
      huboExtra: false,
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'R16', CFG);
    expect(d.acertoHuboExtra).toBe(false); // no lo pronosticó
    expect(d.ganadorFinalCorrecto).toBe(true);
    expect(d.puntosBase).toBe(5);
    expect(d.puntosExtras).toBe(2); // solo ganador
  });
});

describe('6.2 — Penales: ganador acertado y fallado', () => {
  it('penales con ganador ACERTADO: +2 (marcador de penales no cuenta)', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 0, golesB: 0 },
      habraExtra: true,
      marcadorExtra: { golesA: 0, golesB: 0 }, // siguió 0-0 tras el extra → penales
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 0, golesB: 0 },
      huboExtra: true,
      marcadorExtra: { golesA: 0, golesB: 0 },
      ganadorFinal: 'A', // A ganó en penales
    };
    const d = calcularPuntos(p, r, 'FINAL', CFG);
    expect(d.ganadorFinalCorrecto).toBe(true);
    // base 5 + (huboExtra 2 + marcadorExtra 3 + ganador 2 = 7) = 12, ×5
    expect(d.total).toBe((5 + 7) * 5);
  });

  it('penales con ganador FALLADO: no suma +2 de ganador', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 0, golesB: 0 },
      habraExtra: true,
      marcadorExtra: { golesA: 0, golesB: 0 },
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 0, golesB: 0 },
      huboExtra: true,
      marcadorExtra: { golesA: 0, golesB: 0 },
      ganadorFinal: 'B', // B ganó en penales
    };
    const d = calcularPuntos(p, r, 'FINAL', CFG);
    expect(d.ganadorFinalCorrecto).toBe(false);
    expect(d.puntosExtras).toBe(2 + 3); // huboExtra + marcadorExtra, sin ganador
  });
});

describe('Extras NO aplican en fase de grupos', () => {
  it('en GRUPOS se ignoran habraExtra/ganadorFinal', () => {
    const p: PronosticoPartido = {
      marcador90: { golesA: 1, golesB: 0 },
      habraExtra: true,
      ganadorFinal: 'A',
    };
    const r: ResultadoOficial = {
      marcador90: { golesA: 1, golesB: 0 },
      huboExtra: true,
      ganadorFinal: 'A',
    };
    const d = calcularPuntos(p, r, 'GRUPOS', CFG);
    expect(d.puntosExtras).toBe(0);
    expect(d.acertoHuboExtra).toBe(false);
    expect(d.total).toBe(5); // solo base ×1
  });
});
