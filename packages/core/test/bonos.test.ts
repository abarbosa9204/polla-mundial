/**
 * Suite obligatoria (sección 9) — Bonos de torneo (6.4), incl. empate de goleadores.
 */
import { describe, it, expect } from 'vitest';
import {
  calcularBonoClasificados,
  calcularBonoCampeon,
  calcularBonoGoleador,
  CONFIG_PUNTOS_DEFAULT as CFG,
} from '../src/index.js';

describe('6.4 — Equipos clasificados por ronda', () => {
  it('cuenta 1 punto por equipo correcto a 16avos', () => {
    const reales = new Set(['ARG', 'BRA', 'FRA', 'ESP']);
    const d = calcularBonoClasificados(
      'clasificado16avos',
      ['ARG', 'BRA', 'GER'],
      reales,
      CFG.bonos.clasificado16avos,
    );
    expect(d.aciertos).toBe(2);
    expect(d.total).toBe(2);
  });

  it('predicciones duplicadas se cuentan una sola vez', () => {
    const reales = new Set(['ARG']);
    const d = calcularBonoClasificados(
      'clasificado16avos',
      ['ARG', 'ARG', 'ARG'],
      reales,
      CFG.bonos.clasificado16avos,
    );
    expect(d.aciertos).toBe(1);
    expect(d.total).toBe(1);
  });

  it('puntos por ronda con sus pesos (semis = 5 c/u)', () => {
    const reales = new Set(['ARG', 'FRA']);
    const d = calcularBonoClasificados(
      'clasificadoSemis',
      ['ARG', 'FRA', 'BRA'],
      reales,
      CFG.bonos.clasificadoSemis,
    );
    expect(d.aciertos).toBe(2);
    expect(d.total).toBe(10);
  });
});

describe('6.4 — Campeón', () => {
  it('acierta campeón = 20', () => {
    const d = calcularBonoCampeon('ARG', 'ARG', CFG.bonos.campeon);
    expect(d.total).toBe(20);
  });
  it('falla campeón = 0', () => {
    const d = calcularBonoCampeon('BRA', 'ARG', CFG.bonos.campeon);
    expect(d.total).toBe(0);
  });
  it('sin predicción de campeón = 0', () => {
    const d = calcularBonoCampeon(null, 'ARG', CFG.bonos.campeon);
    expect(d.total).toBe(0);
  });
});

describe('6.4 — Goleador, incl. EMPATE de goleadores', () => {
  it('acierta goleador único = 15', () => {
    const d = calcularBonoGoleador('Mbappe', ['Mbappe'], CFG.bonos.goleador);
    expect(d.total).toBe(15);
  });

  it('empate de goleadores: cualquiera de los empatados otorga puntos', () => {
    const goleadores = ['Mbappe', 'Messi', 'Haaland']; // empatados en el primer puesto
    expect(calcularBonoGoleador('Messi', goleadores, CFG.bonos.goleador).total).toBe(15);
    expect(calcularBonoGoleador('Haaland', goleadores, CFG.bonos.goleador).total).toBe(15);
    expect(calcularBonoGoleador('Mbappe', goleadores, CFG.bonos.goleador).total).toBe(15);
  });

  it('predijo un jugador que no es goleador = 0', () => {
    const d = calcularBonoGoleador('Vinicius', ['Mbappe', 'Messi'], CFG.bonos.goleador);
    expect(d.total).toBe(0);
  });
});
