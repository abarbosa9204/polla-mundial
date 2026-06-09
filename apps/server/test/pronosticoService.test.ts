/**
 * Tests del servicio de pronósticos: el lock se valida contra el reloj del
 * servidor. Caso clave de la sección 9: escritura 1s después del kickoff = rechazada.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  guardarPronostico,
  type PronosticoRepo,
  type PartidoParaLock,
} from '../src/services/pronosticoService.js';
import type { PronosticoPartidoInput } from '@polla/core';

const KICKOFF = Date.parse('2026-06-11T16:00:00Z');

function repoConPartido(partido: PartidoParaLock | null): PronosticoRepo {
  return {
    getPartido: vi.fn(async () => partido),
    upsertPronostico: vi.fn(async (d) => ({
      id: 'pid',
      version: 1,
      registradoEn: '2026-06-11T15:00:00Z',
    })),
  };
}

const payload: PronosticoPartidoInput = { marcador90: { golesA: 2, golesB: 1 } };

describe('guardarPronostico — lock del servidor', () => {
  it('acepta más de 5 min antes del kickoff', async () => {
    const repo = repoConPartido({ id: 'M1', kickoffUtcMs: KICKOFF, fase: 'GRUPOS' });
    const r = await guardarPronostico(repo, 'u1', 'M1', payload, KICKOFF - 600_000);
    expect(r.ok).toBe(true);
    expect(repo.upsertPronostico).toHaveBeenCalledOnce();
  });

  it('RECHAZA dentro de los 5 min previos al kickoff (no escribe)', async () => {
    const repo = repoConPartido({ id: 'M1', kickoffUtcMs: KICKOFF, fase: 'GRUPOS' });
    const r = await guardarPronostico(repo, 'u1', 'M1', payload, KICKOFF - 4 * 60_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
    expect(repo.upsertPronostico).not.toHaveBeenCalled();
  });

  it('RECHAZA si la API marca el partido iniciado (aunque falte para el kickoff)', async () => {
    const repo = repoConPartido({ id: 'M1', kickoffUtcMs: KICKOFF, fase: 'GRUPOS', estado: 'IN_PLAY' });
    const r = await guardarPronostico(repo, 'u1', 'M1', payload, KICKOFF - 3_600_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('LOCKED');
    expect(repo.upsertPronostico).not.toHaveBeenCalled();
  });

  it('rechaza partido inexistente', async () => {
    const repo = repoConPartido(null);
    const r = await guardarPronostico(repo, 'u1', 'M9', payload, KICKOFF - 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('NOT_FOUND');
  });

  it('descarta extras en fase de grupos', async () => {
    const repo = repoConPartido({ id: 'M1', kickoffUtcMs: KICKOFF, fase: 'GRUPOS' });
    await guardarPronostico(
      repo,
      'u1',
      'M1',
      { marcador90: { golesA: 1, golesB: 1 }, habraExtra: true, ganadorFinal: 'A' },
      KICKOFF - 600_000,
    );
    const arg = (repo.upsertPronostico as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.habraExtra).toBeNull();
    expect(arg.ganadorFinal).toBeNull();
  });

  it('conserva extras en eliminatorias', async () => {
    const repo = repoConPartido({ id: 'F1', kickoffUtcMs: KICKOFF, fase: 'FINAL' });
    await guardarPronostico(
      repo,
      'u1',
      'F1',
      {
        marcador90: { golesA: 1, golesB: 1 },
        habraExtra: true,
        marcadorExtra: { golesA: 2, golesB: 1 },
        ganadorFinal: 'A',
      },
      KICKOFF - 600_000,
    );
    const arg = (repo.upsertPronostico as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.habraExtra).toBe(true);
    expect(arg.extraA).toBe(2);
    expect(arg.ganadorFinal).toBe('A');
  });
});
