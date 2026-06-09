/**
 * Suite obligatoria (sección 9) — Regla del cierre (lock) y reprogramación.
 * El cierre se valida contra el reloj del SERVIDOR (UTC), no del cliente.
 */
import { describe, it, expect } from 'vitest';
import {
  pronosticoEditable,
  validarEscrituraPronostico,
  instanteCierre,
  MARGEN_CIERRE_MS,
} from '../src/index.js';

const KICKOFF = Date.parse('2026-06-11T16:00:00Z'); // ejemplo

describe('Lock — cierra 5 minutos ANTES del kickoff', () => {
  it('1 hora antes del kickoff: editable', () => {
    expect(pronosticoEditable(KICKOFF, KICKOFF - 3_600_000)).toBe(true);
    expect(validarEscrituraPronostico(KICKOFF, KICKOFF - 3_600_000).editable).toBe(true);
  });

  it('6 minutos antes: editable; 4 minutos antes: cerrado (margen de 5 min)', () => {
    expect(pronosticoEditable(KICKOFF, KICKOFF - 6 * 60_000)).toBe(true);
    expect(pronosticoEditable(KICKOFF, KICKOFF - 4 * 60_000)).toBe(false);
  });

  it('en el instante EXACTO del cierre (kickoff − 5 min): cerrado', () => {
    expect(pronosticoEditable(KICKOFF, instanteCierre(KICKOFF))).toBe(false);
    expect(MARGEN_CIERRE_MS).toBe(300_000);
  });

  it('escritura tras el cierre: rechazada con error explícito (inmutable)', () => {
    const r = validarEscrituraPronostico(KICKOFF, KICKOFF + 1000);
    expect(r.editable).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.error).toContain('inmutable');
  });
});

describe('Lock — reprogramación del partido', () => {
  it('si el kickoff se mueve hacia adelante, el cierre lo sigue', () => {
    const original = KICKOFF;
    const reprogramado = KICKOFF + 24 * 3_600_000; // +1 día
    const ahora = KICKOFF + 1000; // 1s tras el kickoff ORIGINAL

    // Con el kickoff original ya estaría cerrado...
    expect(pronosticoEditable(original, ahora)).toBe(false);
    // ...pero con el nuevo kickoff vuelve a estar abierto.
    expect(pronosticoEditable(reprogramado, ahora)).toBe(true);
  });

  it('si el kickoff se adelanta, el cierre también se adelanta', () => {
    const reprogramado = KICKOFF - 2 * 3_600_000; // -2 h
    const ahora = KICKOFF - 3_600_000; // 1h antes del original

    // Antes del original estaría abierto...
    expect(pronosticoEditable(KICKOFF, ahora)).toBe(true);
    // ...pero con el nuevo kickoff (más temprano) ya está cerrado.
    expect(pronosticoEditable(reprogramado, ahora)).toBe(false);
  });
});
