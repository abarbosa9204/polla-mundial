/**
 * Tests del TOPE de clasificados por ronda (regla 6.4) en el guardado de bonos.
 * Aunque la UI lo impide, el servidor debe blindar: dedupe + capar al máximo,
 * para que un cliente manipulado no asegure aciertos marcando de más.
 */
import { describe, it, expect, vi } from 'vitest';
import { guardarBonos } from '../src/services/bonosService.js';
import type { SupabaseRepo } from '../src/repo.js';

/** Repo falso: un partido de grupos en el futuro ⇒ todo editable. */
function fakeRepo(captura: { update?: Record<string, any> }): SupabaseRepo {
  const futuro = new Date('2030-06-11T16:00:00Z').toISOString();
  return {
    getPartidos: vi.fn(async () => [{ fase: 'GRUPOS', kickoff_utc: futuro }]),
    getBonosUsuario: vi.fn(async () => null),
    upsertBonosUsuario: vi.fn(async (_uid: string, update: Record<string, any>) => {
      captura.update = update;
    }),
  } as unknown as SupabaseRepo;
}

describe('guardarBonos — tope de clasificados por ronda (6.4)', () => {
  it('capa R32 a 32 (descarta el exceso)', async () => {
    const cap: { update?: any } = {};
    const repo = fakeRepo(cap);
    const treintaYcinco = Array.from({ length: 35 }, (_, i) => `T${i}`);
    const r = await guardarBonos(repo, 'u1', { clasificados: { R32: treintaYcinco } }, Date.now());
    expect(r.aplicados).toContain('clasificados.R32');
    expect(cap.update!.clasificados.R32).toHaveLength(32);
  });

  it('FINAL admite solo 2', async () => {
    const cap: { update?: any } = {};
    const repo = fakeRepo(cap);
    await guardarBonos(repo, 'u1', { clasificados: { FINAL: ['ARG', 'BRA', 'ESP', 'FRA'] } }, Date.now());
    expect(cap.update!.clasificados.FINAL).toEqual(['ARG', 'BRA']);
  });

  it('elimina duplicados antes de capar', async () => {
    const cap: { update?: any } = {};
    const repo = fakeRepo(cap);
    await guardarBonos(repo, 'u1', { clasificados: { R16: ['ARG', 'BRA', 'ARG', 'BRA', 'URY'] } }, Date.now());
    expect(cap.update!.clasificados.R16).toEqual(['ARG', 'BRA', 'URY']);
  });

  it('respeta selecciones dentro del tope sin tocarlas', async () => {
    const cap: { update?: any } = {};
    const repo = fakeRepo(cap);
    await guardarBonos(repo, 'u1', { clasificados: { SEMIS: ['ARG', 'BRA'] } }, Date.now());
    expect(cap.update!.clasificados.SEMIS).toEqual(['ARG', 'BRA']);
  });
});
