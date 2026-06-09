/**
 * Suite obligatoria (sección 9) — Desempates en los 4 niveles (6.5).
 */
import { describe, it, expect } from 'vitest';
import {
  compararClasificacion,
  ordenarClasificacion,
  type FilaClasificacion,
} from '../src/index.js';

const fila = (
  userId: string,
  puntosTotales: number,
  marcadoresExactos: number,
  resultados1X2: number,
  timestampCampeon: number | null,
): FilaClasificacion => ({
  userId,
  puntosTotales,
  marcadoresExactos,
  resultados1X2,
  timestampCampeon,
});

describe('6.5 — Desempate nivel 1: más puntos totales', () => {
  it('gana quien tiene más puntos', () => {
    const orden = ordenarClasificacion([
      fila('a', 10, 0, 0, 1),
      fila('b', 20, 0, 0, 1),
    ]);
    expect(orden[0]!.userId).toBe('b');
    expect(orden[0]!.posicion).toBe(1);
    expect(orden[1]!.posicion).toBe(2);
  });
});

describe('6.5 — Desempate nivel 2: más marcadores exactos', () => {
  it('mismos puntos, gana quien tiene más exactos', () => {
    const orden = ordenarClasificacion([
      fila('a', 30, 2, 5, 1),
      fila('b', 30, 5, 5, 1),
    ]);
    expect(orden[0]!.userId).toBe('b');
  });
});

describe('6.5 — Desempate nivel 3: más resultados 1X2', () => {
  it('empatan puntos y exactos, gana quien tiene más 1X2', () => {
    const orden = ordenarClasificacion([
      fila('a', 30, 3, 4, 1),
      fila('b', 30, 3, 9, 1),
    ]);
    expect(orden[0]!.userId).toBe('b');
  });
});

describe('6.5 — Desempate nivel 4: pronóstico de campeón más antiguo', () => {
  it('empatan los 3 primeros, gana el timestamp de campeón menor (más antiguo)', () => {
    const orden = ordenarClasificacion([
      fila('a', 30, 3, 9, 5_000),
      fila('b', 30, 3, 9, 1_000), // registró su campeón antes
    ]);
    expect(orden[0]!.userId).toBe('b');
  });

  it('quien no pronosticó campeón (null) pierde frente a quien sí lo hizo', () => {
    const orden = ordenarClasificacion([
      fila('a', 30, 3, 9, null),
      fila('b', 30, 3, 9, 9_999),
    ]);
    expect(orden[0]!.userId).toBe('b');
  });
});

describe('6.5 — Empate total comparte posición', () => {
  it('dos filas idénticas en las 4 claves comparten posición', () => {
    const orden = ordenarClasificacion([
      fila('a', 30, 3, 9, 1_000),
      fila('b', 30, 3, 9, 1_000),
      fila('c', 10, 0, 0, 2_000),
    ]);
    expect(orden[0]!.posicion).toBe(1);
    expect(orden[1]!.posicion).toBe(1); // empate exacto
    expect(orden[2]!.posicion).toBe(3); // salta la 2
  });

  it('compararClasificacion es 0 para filas equivalentes', () => {
    expect(
      compararClasificacion(fila('a', 1, 1, 1, 1), fila('b', 1, 1, 1, 1)),
    ).toBe(0);
  });
});
