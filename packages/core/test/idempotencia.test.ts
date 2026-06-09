/**
 * Suite obligatoria (sección 9) — Idempotencia, recálculo y provisional vs confirmado.
 *
 * El motor es puro: reejecutar el torneo entero con los mismos resultados da
 * SIEMPRE lo mismo. El concepto "provisional" vive FUERA del motor (lo decide
 * el llamador según el estado del partido); el motor solo calcula números.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularPuntos,
  CONFIG_PUNTOS_DEFAULT as CFG,
  type Fase,
  type PronosticoPartido,
  type ResultadoOficial,
} from '../src/index.js';

const pron = (a: number, b: number): PronosticoPartido => ({
  marcador90: { golesA: a, golesB: b },
});
const res = (a: number, b: number): ResultadoOficial => ({
  marcador90: { golesA: a, golesB: b },
});

describe('Idempotencia / recálculo', () => {
  it('reejecutar 1000 veces da exactamente el mismo desglose', () => {
    const p = pron(2, 1);
    const r = res(2, 1);
    const primero = calcularPuntos(p, r, 'CUARTOS', CFG);
    for (let i = 0; i < 1000; i++) {
      expect(calcularPuntos(p, r, 'CUARTOS', CFG)).toStrictEqual(primero);
    }
  });

  it('no muta las entradas (función pura)', () => {
    const p = pron(2, 1);
    const r = res(1, 1);
    const pCopia = structuredClone(p);
    const rCopia = structuredClone(r);
    calcularPuntos(p, r, 'GRUPOS', CFG);
    expect(p).toStrictEqual(pCopia);
    expect(r).toStrictEqual(rCopia);
  });

  it('recalcular un torneo entero por dos vías da el mismo total', () => {
    const partidos: Array<{
      p: PronosticoPartido | null;
      r: ResultadoOficial;
      fase: Fase;
    }> = [
      { p: pron(2, 1), r: res(2, 1), fase: 'GRUPOS' },
      { p: pron(0, 0), r: res(1, 1), fase: 'GRUPOS' },
      { p: null, r: res(3, 0), fase: 'GRUPOS' },
      { p: pron(1, 0), r: res(1, 0), fase: 'FINAL' },
    ];
    const sumar = () =>
      partidos.reduce((acc, m) => acc + calcularPuntos(m.p, m.r, m.fase, CFG).total, 0);
    expect(sumar()).toBe(sumar());
    // 5 + 3 + 0 + 5*5(=25) = 33
    expect(sumar()).toBe(5 + 3 + 0 + 25);
  });
});

describe('Provisional vs confirmado', () => {
  it('el provisional usa el marcador ACTUAL como si fuera final; el motor da el mismo número que daría al confirmar', () => {
    const p = pron(2, 0);
    // En vivo va 1-0 → provisional (como si terminara 1-0)
    const provisional = calcularPuntos(p, res(1, 0), 'GRUPOS', CFG);
    expect(provisional.resultado1X2).toBe(true); // gana A en ambos
    expect(provisional.marcadorExacto).toBe(false);
    expect(provisional.total).toBe(3);

    // El partido termina 2-0 → confirmado
    const confirmado = calcularPuntos(p, res(2, 0), 'GRUPOS', CFG);
    expect(confirmado.marcadorExacto).toBe(true);
    expect(confirmado.total).toBe(5);

    // Son cálculos independientes y deterministas: el provisional NO contamina
    // el confirmado (el motor no guarda estado).
    expect(provisional.total).not.toBe(confirmado.total);
  });

  it('el desglose no incluye ninguna marca de "persistido"; el flag provisional es responsabilidad del llamador', () => {
    const d = calcularPuntos(pron(1, 0), res(1, 0), 'GRUPOS', CFG);
    expect(d).not.toHaveProperty('provisional');
    expect(d).not.toHaveProperty('persistido');
  });
});
