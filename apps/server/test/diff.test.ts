import { describe, it, expect } from 'vitest';
import { necesitaActualizar, requiereRecalculo, huboAsignacionEquipos } from '../src/poller/diff.js';
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
  it('sellado + API NO finalizada (IN_PLAY) ⇒ false (no se toca)', () => {
    expect(necesitaActualizar(nuevo, actual({ sellado: true, goles_a_90: 5 }))).toBe(false);
  });
  it('sellado + football-data CORRIGE el marcador final (gol anulado) ⇒ true', () => {
    const finApi = { ...nuevo, estado: 'FINISHED' as const, golesA90: 2, golesB90: 1 };
    const enBd = actual({ sellado: true, estado: 'FINISHED', goles_a_90: 2, goles_b_90: 2 });
    expect(necesitaActualizar(finApi, enBd)).toBe(true);
  });
  it('sellado + mismo resultado final ⇒ false (no reescribe, sin churn)', () => {
    const finApi = { ...nuevo, estado: 'FINISHED' as const, golesA90: 2, golesB90: 1 };
    const enBd = actual({ sellado: true, estado: 'FINISHED', goles_a_90: 2, goles_b_90: 1 });
    expect(necesitaActualizar(finApi, enBd)).toBe(false);
  });
  it('sellado + football-data corrige el GANADOR final ⇒ true', () => {
    const finApi = { ...nuevo, estado: 'FINISHED' as const, golesA90: 1, golesB90: 1, ganadorFinal: 'A' as const };
    const enBd = actual({ sellado: true, estado: 'FINISHED', goles_a_90: 1, goles_b_90: 1, ganador_final: 'B' });
    expect(necesitaActualizar(finApi, enBd)).toBe(true);
  });
  it('sellado + corrección MANUAL del admin ⇒ false (la API no la pisa)', () => {
    const finApi = { ...nuevo, estado: 'FINISHED' as const, golesA90: 2, golesB90: 1 };
    const enBd = actual({ sellado: true, correccion_manual: true, estado: 'FINISHED', goles_a_90: 2, goles_b_90: 2 });
    expect(necesitaActualizar(finApi, enBd)).toBe(false);
  });
  it('sellado + API lo regresa a IN_PLAY ⇒ false (no des-finaliza)', () => {
    const enBd = actual({ sellado: true, estado: 'FINISHED', goles_a_90: 2, goles_b_90: 1 });
    expect(necesitaActualizar(nuevo, enBd)).toBe(false); // nuevo va IN_PLAY
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

describe('huboAsignacionEquipos (disparo de recálculo al cargar llave)', () => {
  it('se rellenan los equipos de un cruce "por definir" ⇒ true', () => {
    const enBd = actual({ estado: 'SCHEDULED', equipo_a: null, equipo_b: null });
    expect(huboAsignacionEquipos(conEquipos('ARG', 'BRA'), enBd)).toBe(true);
  });
  it('cambia uno de los equipos del cruce ⇒ true', () => {
    const enBd = actual({ estado: 'SCHEDULED', equipo_a: 'ARG', equipo_b: 'URY' });
    expect(huboAsignacionEquipos(conEquipos('ARG', 'BRA'), enBd)).toBe(true);
  });
  it('mismos equipos ya asignados ⇒ false', () => {
    const enBd = actual({ estado: 'SCHEDULED', equipo_a: 'ARG', equipo_b: 'BRA' });
    expect(huboAsignacionEquipos(conEquipos('ARG', 'BRA'), enBd)).toBe(false);
  });
  it('API responde con equipos null ⇒ false (no degrada)', () => {
    const enBd = actual({ estado: 'SCHEDULED', equipo_a: 'ARG', equipo_b: 'BRA' });
    expect(huboAsignacionEquipos(conEquipos(null, null), enBd)).toBe(false);
  });
  it('partido nuevo (sin actual) con equipos ⇒ true', () => {
    expect(huboAsignacionEquipos(conEquipos('ARG', 'BRA'), undefined)).toBe(true);
  });
});
