import { describe, it, expect } from 'vitest';
import { necesitaActualizar, requiereRecalculo } from '../src/poller/diff.js';
import type { PartidoNormalizado } from '../src/poller/model.js';
import type { PartidoActual } from '../src/poller/diff.js';

const nuevo: PartidoNormalizado = {
  id: 'M1', fase: 'GRUPOS', grupo: 'A', rondaOrden: 0,
  equipoA: null, equipoB: null,
  kickoffUtc: '2026-06-11T16:00:00.000Z', estado: 'IN_PLAY',
  golesA90: 1, golesB90: 0, huboExtra: false,
  golesAExtra: null, golesBExtra: null, ganadorFinal: null,
};

const actual = (over: Partial<PartidoActual> = {}): PartidoActual => ({
  estado: 'IN_PLAY', goles_a_90: 1, goles_b_90: 0, hubo_extra: false,
  goles_a_extra: null, goles_b_extra: null, ganador_final: null,
  kickoff_utc: '2026-06-11T16:00:00.000Z', sellado: false, correccion_manual: false,
  ...over,
});

describe('necesitaActualizar (escritura mínima)', () => {
  it('partido nuevo (sin actual) ⇒ true', () => {
    expect(necesitaActualizar(nuevo, undefined)).toBe(true);
  });
  it('sin cambios ⇒ false (no reescribe)', () => {
    expect(necesitaActualizar(nuevo, actual())).toBe(false);
  });
  it('cambió el marcador ⇒ true', () => {
    expect(necesitaActualizar(nuevo, actual({ goles_a_90: 0 }))).toBe(true);
  });
  it('partido SELLADO ⇒ false aunque la API difiera', () => {
    expect(necesitaActualizar(nuevo, actual({ sellado: true, goles_a_90: 5 }))).toBe(false);
  });
  it('corrección manual + API SIN datos (SCHEDULED) ⇒ false (se respeta el manual)', () => {
    const apiSched = { ...nuevo, estado: 'SCHEDULED' as const };
    expect(necesitaActualizar(apiSched, actual({ correccion_manual: true, goles_a_90: 9 }))).toBe(false);
  });
  it('corrección manual + API EN CURSO/FINALIZADO ⇒ true (la API reclama el control)', () => {
    expect(necesitaActualizar(nuevo, actual({ correccion_manual: true, goles_a_90: 9 }))).toBe(true);
    const fin = { ...nuevo, estado: 'FINISHED' as const };
    expect(necesitaActualizar(fin, actual({ correccion_manual: true, sellado: false }))).toBe(true);
  });
  it('reprogramación (cambia kickoff) ⇒ true', () => {
    expect(necesitaActualizar(nuevo, actual({ kickoff_utc: '2026-06-12T16:00:00.000Z' }))).toBe(true);
  });
});

describe('requiereRecalculo', () => {
  it('IN_PLAY / FINISHED ⇒ true; SCHEDULED ⇒ false', () => {
    expect(requiereRecalculo(nuevo)).toBe(true);
    expect(requiereRecalculo({ ...nuevo, estado: 'FINISHED' })).toBe(true);
    expect(requiereRecalculo({ ...nuevo, estado: 'SCHEDULED' })).toBe(false);
  });
});
