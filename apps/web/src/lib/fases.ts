import type { Fase } from '@polla/core';

export const NOMBRE_FASE: Record<Fase, string> = {
  GRUPOS: 'Fase de grupos',
  R32: '16avos',
  R16: 'Octavos',
  CUARTOS: 'Cuartos',
  SEMIS: 'Semifinales',
  TERCER_PUESTO: 'Tercer puesto',
  FINAL: 'Final',
};

export const MULTIPLICADOR_FASE: Record<Fase, number> = {
  GRUPOS: 1,
  R32: 2,
  R16: 2,
  CUARTOS: 3,
  SEMIS: 4,
  TERCER_PUESTO: 4,
  FINAL: 5,
};

/** Zona horaria de referencia de la polla (Colombia). */
export const TZ_POLLA = 'America/Bogota';

/** Fecha y hora corta de un partido, SIEMPRE en hora de Colombia. */
export function fmtFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_POLLA,
  });
}

/** Fecha y hora larga (con año), en hora de Colombia. Para sellos de tiempo. */
export function fmtFechaHoraLarga(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_POLLA,
  });
}
