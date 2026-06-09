import { describe, it, expect } from 'vitest';
import { hayVentanaActiva, debePollearAhora } from '../src/scheduler.js';

const AHORA = Date.parse('2026-06-11T16:00:00Z');

describe('hayVentanaActiva', () => {
  it('partido IN_PLAY ⇒ ventana activa', () => {
    expect(hayVentanaActiva([{ kickoffUtcMs: 0, estado: 'IN_PLAY' }], AHORA)).toBe(true);
  });
  it('partido que arranca en 10 min ⇒ ventana activa', () => {
    expect(
      hayVentanaActiva([{ kickoffUtcMs: AHORA + 10 * 60000, estado: 'TIMED' }], AHORA),
    ).toBe(true);
  });
  it('partido dentro de 2 días ⇒ sin ventana', () => {
    expect(
      hayVentanaActiva([{ kickoffUtcMs: AHORA + 48 * 3600_000, estado: 'SCHEDULED' }], AHORA),
    ).toBe(false);
  });
});

describe('debePollearAhora', () => {
  it('primer ciclo ⇒ siempre', () => {
    expect(debePollearAhora([], AHORA, null)).toBe(true);
  });
  it('en ventana, cada ~60s', () => {
    const partidos = [{ kickoffUtcMs: AHORA, estado: 'IN_PLAY' }];
    expect(debePollearAhora(partidos, AHORA, AHORA - 56_000)).toBe(true);
    expect(debePollearAhora(partidos, AHORA, AHORA - 30_000)).toBe(false);
  });
  it('fuera de ventana, cada 30 min', () => {
    const partidos = [{ kickoffUtcMs: AHORA + 48 * 3600_000, estado: 'SCHEDULED' }];
    expect(debePollearAhora(partidos, AHORA, AHORA - 31 * 60000)).toBe(true);
    expect(debePollearAhora(partidos, AHORA, AHORA - 10 * 60000)).toBe(false);
  });
});
