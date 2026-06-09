/**
 * Suite obligatoria (sección 9) — Puntos BASE de 90' y multiplicadores.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularPuntos,
  CONFIG_PUNTOS_DEFAULT as CFG,
  type Fase,
  type PronosticoPartido,
  type ResultadoOficial,
} from '../src/index.js';

const pron = (golesA: number, golesB: number): PronosticoPartido => ({
  marcador90: { golesA, golesB },
});
const res = (golesA: number, golesB: number): ResultadoOficial => ({
  marcador90: { golesA, golesB },
});

describe('6.1 — Marcador exacto en cada fase (×multiplicador)', () => {
  const casos: Array<[Fase, number]> = [
    ['GRUPOS', 5 * 1],
    ['R32', 5 * 2],
    ['R16', 5 * 2],
    ['CUARTOS', 5 * 3],
    ['SEMIS', 5 * 4],
    ['TERCER_PUESTO', 5 * 4],
    ['FINAL', 5 * 5],
  ];

  it.each(casos)('marcador exacto en %s = %i pts', (fase, esperado) => {
    const d = calcularPuntos(pron(2, 1), res(2, 1), fase, CFG);
    expect(d.marcadorExacto).toBe(true);
    expect(d.puntosBase).toBe(5);
    expect(d.total).toBe(esperado);
    // El exacto NO acumula: total base sigue siendo 5 aunque implique 1X2+total.
    expect(d.resultado1X2).toBe(true);
    expect(d.totalGoles).toBe(true);
  });
});

describe('6.1 — 1X2 + total de goles ACUMULAN', () => {
  it('acierta ganador y total de goles, sin marcador exacto = 3 + 1 = 4', () => {
    // Real 2-1 (gana A, total 3). Pronóstico 3-0 (gana A, total 3). No exacto.
    const d = calcularPuntos(pron(3, 0), res(2, 1), 'GRUPOS', CFG);
    expect(d.marcadorExacto).toBe(false);
    expect(d.resultado1X2).toBe(true);
    expect(d.totalGoles).toBe(true);
    expect(d.puntosBase).toBe(4);
    expect(d.total).toBe(4);
  });

  it('acierta solo 1X2 (no total) = 3', () => {
    // Real 2-1 (gana A, total 3). Pronóstico 1-0 (gana A, total 1).
    const d = calcularPuntos(pron(1, 0), res(2, 1), 'GRUPOS', CFG);
    expect(d.resultado1X2).toBe(true);
    expect(d.totalGoles).toBe(false);
    expect(d.puntosBase).toBe(3);
  });

  it('acierta solo total de goles (no 1X2) = 1', () => {
    // Real 2-1 (gana A, total 3). Pronóstico 0-3 (gana B, total 3).
    const d = calcularPuntos(pron(0, 3), res(2, 1), 'GRUPOS', CFG);
    expect(d.resultado1X2).toBe(false);
    expect(d.totalGoles).toBe(true);
    expect(d.puntosBase).toBe(1);
  });

  it('1X2 + total con multiplicador de cuartos = (3+1)×3 = 12', () => {
    const d = calcularPuntos(pron(3, 0), res(2, 1), 'CUARTOS', CFG);
    expect(d.total).toBe(12);
  });
});

describe('6.1 — Empate acertado solo en resultado', () => {
  it('predice empate 1-1, real 0-0: acierta 1X2 (empate) pero no total = 3', () => {
    const d = calcularPuntos(pron(1, 1), res(0, 0), 'GRUPOS', CFG);
    expect(d.resultado1X2).toBe(true); // ambos empate
    expect(d.totalGoles).toBe(false); // total 2 vs 0
    expect(d.marcadorExacto).toBe(false);
    expect(d.puntosBase).toBe(3);
  });

  it('predice empate 0-0, real 0-0: exacto = 5 (no 3+1)', () => {
    const d = calcularPuntos(pron(0, 0), res(0, 0), 'GRUPOS', CFG);
    expect(d.marcadorExacto).toBe(true);
    expect(d.puntosBase).toBe(5);
  });

  it('predice victoria pero fue empate: 0 en 1X2', () => {
    const d = calcularPuntos(pron(2, 1), res(1, 1), 'GRUPOS', CFG);
    expect(d.resultado1X2).toBe(false);
    expect(d.totalGoles).toBe(false); // 3 vs 2
    expect(d.puntosBase).toBe(0);
    expect(d.total).toBe(0);
  });
});

describe('Sin pronóstico = 0 en todo (sección 4)', () => {
  it.each(['GRUPOS', 'FINAL'] as Fase[])('null en %s = 0', (fase) => {
    const d = calcularPuntos(null, res(2, 1), fase, CFG);
    expect(d.sinPronostico).toBe(true);
    expect(d.total).toBe(0);
    expect(d.puntosBase).toBe(0);
    expect(d.puntosExtras).toBe(0);
    expect(d.marcadorExacto).toBe(false);
  });

  it('undefined también = 0', () => {
    const d = calcularPuntos(undefined, res(0, 0), 'GRUPOS', CFG);
    expect(d.total).toBe(0);
    expect(d.sinPronostico).toBe(true);
  });
});
