import { describe, it, expect } from 'vitest';
import {
  calcularCierresBonos,
  editableBono,
  type PartidoKickoff,
} from '../src/services/bonosLock.js';

const t = (s: string) => Date.parse(s);

const partidos: PartidoKickoff[] = [
  { fase: 'GRUPOS', kickoffUtcMs: t('2026-06-11T16:00:00Z') },
  { fase: 'GRUPOS', kickoffUtcMs: t('2026-06-12T16:00:00Z') },
  { fase: 'R32', kickoffUtcMs: t('2026-06-28T16:00:00Z') },
  { fase: 'R16', kickoffUtcMs: t('2026-07-04T16:00:00Z') },
  { fase: 'CUARTOS', kickoffUtcMs: t('2026-07-09T16:00:00Z') },
  { fase: 'SEMIS', kickoffUtcMs: t('2026-07-14T16:00:00Z') },
];

describe('calcularCierresBonos', () => {
  const c = calcularCierresBonos(partidos);

  it('campeón/goleador cierran con el primer partido del torneo', () => {
    expect(c.primerKickoffMs).toBe(t('2026-06-11T16:00:00Z'));
  });
  it('R32 cierra con el primer partido de grupos', () => {
    expect(c.clasificados.R32).toBe(t('2026-06-11T16:00:00Z'));
  });
  it('R16 cierra con el primer partido de R32', () => {
    expect(c.clasificados.R16).toBe(t('2026-06-28T16:00:00Z'));
  });
  it('FINAL cierra con el primer partido de semis', () => {
    expect(c.clasificados.FINAL).toBe(t('2026-07-14T16:00:00Z'));
  });
});

describe('editableBono', () => {
  it('editable antes del cierre, cerrado en/después', () => {
    const cierre = t('2026-06-11T16:00:00Z');
    expect(editableBono(cierre, cierre - 1000)).toBe(true);
    expect(editableBono(cierre, cierre)).toBe(false);
    expect(editableBono(cierre, cierre + 1000)).toBe(false);
  });
  it('sin fecha de cierre (null) ⇒ editable', () => {
    expect(editableBono(null, Date.now())).toBe(true);
  });
});
