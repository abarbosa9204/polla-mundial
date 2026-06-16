/**
 * Tests del resolutor de código canónico de selección. Lo crítico: el MISMO país
 * debe resolver al MISMO id venga de donde venga (football-data TLA, nombre de
 * API-Football, sigla de sportdb), para no volver a crear equipos duplicados.
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalTla,
  codigoPorNombre,
  codigoEquipo,
} from '../src/poller/codigosEquipos.js';

describe('canonicalTla — alias de TLA', () => {
  it('consolida las variantes conocidas (el bug reportado)', () => {
    expect(canonicalTla('CUR')).toBe('CUW'); // Curazao
    expect(canonicalTla('URU')).toBe('URY'); // Uruguay
  });
  it('es idempotente sobre el canónico y normaliza mayúsculas/espacios', () => {
    expect(canonicalTla('CUW')).toBe('CUW');
    expect(canonicalTla('URY')).toBe('URY');
    expect(canonicalTla(' cur ')).toBe('CUW');
    expect(canonicalTla('arg')).toBe('ARG');
  });
});

describe('codigoPorNombre — nombre → código', () => {
  it('reconoce nombres con acentos y variantes de otras fuentes', () => {
    expect(codigoPorNombre('Curaçao')).toBe('CUW');
    expect(codigoPorNombre('Curacao')).toBe('CUW');
    expect(codigoPorNombre('Uruguay')).toBe('URY');
    expect(codigoPorNombre('Cape Verde')).toBe('CPV');
    expect(codigoPorNombre('Cape Verde Islands')).toBe('CPV');
    expect(codigoPorNombre('Korea Republic')).toBe('KOR');
    expect(codigoPorNombre('South Korea')).toBe('KOR');
    expect(codigoPorNombre('USA')).toBe('USA');
    expect(codigoPorNombre('United States')).toBe('USA');
  });
  it('devuelve null para países no participantes', () => {
    expect(codigoPorNombre('Narnia')).toBeNull();
  });
});

describe('codigoEquipo — todas las fuentes convergen al mismo id', () => {
  it('football-data (TLA) y API-Football (nombre) dan el MISMO código', () => {
    // Curazao
    expect(codigoEquipo({ tla: 'CUW', nombre: 'Curaçao' })).toBe('CUW'); // football-data
    expect(codigoEquipo({ tla: 'CUR' })).toBe('CUW'); // football-data variante
    expect(codigoEquipo({ nombre: 'Curacao' })).toBe('CUW'); // API-Football
    // Uruguay
    expect(codigoEquipo({ tla: 'URU', nombre: 'Uruguay' })).toBe('URY'); // football-data /teams
    expect(codigoEquipo({ tla: 'URY' })).toBe('URY'); // football-data /matches
    expect(codigoEquipo({ nombre: 'Uruguay' })).toBe('URY'); // API-Football
  });
  it('cae al fallback (slice/id) solo para nombres desconocidos', () => {
    expect(codigoEquipo({ nombre: 'Narnia' })).toBe('NAR');
    expect(codigoEquipo({ fallbackId: '12345' })).toBe('12345');
    expect(codigoEquipo({})).toBeNull();
  });
});
