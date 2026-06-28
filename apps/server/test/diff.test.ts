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
  equipo_a: null, equipo_b: null,
  ...over,
});

const conEquipos = (a: string | null, b: string | null): PartidoNormalizado => ({
  ...nuevo,
  equipoA: a ? { id: a, nombre: a, crestUrl: null } : null,
  equipoB: b ? { id: b, nombre: b, crestUrl: null } : null,
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
  it('cuadro: se resuelven los equipos de un cruce "por definir" ⇒ true', () => {
    // El partido existe (SCHEDULED, sin equipos); la API ya trae los clasificados.
    const apiConEquipos = { ...conEquipos('ARG', 'BRA'), estado: 'SCHEDULED' as const };
    const enBd = actual({ estado: 'SCHEDULED', goles_a_90: null, goles_b_90: null, equipo_a: null, equipo_b: null });
    expect(necesitaActualizar(apiConEquipos, enBd)).toBe(true);
  });
  it('cuadro: cambia uno de los equipos del cruce ⇒ true', () => {
    const apiConEquipos = { ...conEquipos('ARG', 'BRA'), estado: 'SCHEDULED' as const };
    const enBd = actual({ estado: 'SCHEDULED', goles_a_90: null, goles_b_90: null, equipo_a: 'ARG', equipo_b: 'URY' });
    expect(necesitaActualizar(apiConEquipos, enBd)).toBe(true);
  });
  it('cuadro: NO degrada equipos a null si la API responde incompleta ⇒ false', () => {
    // Mismo estado/marcador en API y BD; lo único distinto serían los equipos,
    // que la API trae nulos. No debe disparar reescritura (no se pierden equipos).
    const apiSinEquipos = {
      ...conEquipos(null, null),
      estado: 'SCHEDULED' as const,
      golesA90: null,
      golesB90: null,
    };
    const enBd = actual({ estado: 'SCHEDULED', goles_a_90: null, goles_b_90: null, equipo_a: 'ARG', equipo_b: 'BRA' });
    expect(necesitaActualizar(apiSinEquipos, enBd)).toBe(false);
  });
});

describe('requiereRecalculo', () => {
  it('IN_PLAY / FINISHED ⇒ true; SCHEDULED ⇒ false', () => {
    expect(requiereRecalculo(nuevo)).toBe(true);
    expect(requiereRecalculo({ ...nuevo, estado: 'FINISHED' })).toBe(true);
    expect(requiereRecalculo({ ...nuevo, estado: 'SCHEDULED' })).toBe(false);
  });
});
