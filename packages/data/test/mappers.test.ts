import { describe, it, expect } from 'vitest';
import {
  partidoARresultado,
  partidoAResultadoProvisional,
  pronosticoRowADominio,
  kickoffMs,
} from '../src/mappers.js';
import type { PartidoRow, PronosticoRow } from '../src/database.types.js';

const partido = (over: Partial<PartidoRow> = {}): PartidoRow => ({
  id: 'M1', fase: 'FINAL', grupo: null, ronda_orden: 6,
  equipo_a: 'ARG', equipo_b: 'FRA', kickoff_utc: '2026-07-19T18:00:00Z',
  estado: 'FINISHED', goles_a_90: 1, goles_b_90: 1, hubo_extra: true,
  goles_a_extra: 2, goles_b_extra: 1, ganador_final: 'A',
  sellado: true, correccion_manual: false, updated_at: '', ...over,
});

describe('partidoARresultado', () => {
  it('mapea marcador 90, extra acumulado y ganador', () => {
    const r = partidoARresultado(partido())!;
    expect(r.marcador90).toEqual({ golesA: 1, golesB: 1 });
    expect(r.huboExtra).toBe(true);
    expect(r.marcadorExtra).toEqual({ golesA: 2, golesB: 1 });
    expect(r.ganadorFinal).toBe('A');
  });
  it('devuelve null sin marcador de 90', () => {
    expect(partidoARresultado(partido({ goles_a_90: null }))).toBeNull();
  });
});

describe('partidoAResultadoProvisional', () => {
  it('usa el marcador actual como 90 y sin extra', () => {
    const r = partidoAResultadoProvisional(partido({ goles_a_90: 2, goles_b_90: 0 }))!;
    expect(r.marcador90).toEqual({ golesA: 2, golesB: 0 });
    expect(r.huboExtra).toBe(false);
    expect(r.marcadorExtra).toBeNull();
  });
});

describe('pronosticoRowADominio', () => {
  it('mapea marcador y extras', () => {
    const row: PronosticoRow = {
      id: 'p', user_id: 'u', partido_id: 'M1',
      marcador_a_90: 2, marcador_b_90: 1, habra_extra: true,
      extra_a: 3, extra_b: 1, ganador_final: 'A',
      created_at_server: '', updated_at_server: '', version: 1,
    };
    const d = pronosticoRowADominio(row);
    expect(d.marcador90).toEqual({ golesA: 2, golesB: 1 });
    expect(d.marcadorExtra).toEqual({ golesA: 3, golesB: 1 });
    expect(d.ganadorFinal).toBe('A');
  });
});

describe('kickoffMs', () => {
  it('convierte ISO a epoch ms', () => {
    expect(kickoffMs({ kickoff_utc: '2026-06-11T16:00:00Z' })).toBe(
      Date.parse('2026-06-11T16:00:00Z'),
    );
  });
});
