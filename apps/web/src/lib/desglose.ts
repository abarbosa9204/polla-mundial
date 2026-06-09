import type { DesglosePartido } from '@polla/core';

/**
 * Describe en lenguaje claro QUÉ acertó el usuario en un partido (para mostrar
 * junto a los puntos, sin jerga tipo "1X2").
 */
export function describirDesglose(d: DesglosePartido): string {
  if (d.sinPronostico) return 'No pronosticaste este partido';
  const c: string[] = [];
  if (d.marcadorExacto) c.push('el marcador exacto');
  else {
    if (d.resultado1X2) c.push('quién gana o si empatan');
    if (d.totalGoles) c.push('el total de goles');
  }
  if (d.acertoHuboExtra) c.push('si hubo tiempo extra');
  if (d.marcadorExtraExacto) c.push('el marcador del tiempo extra');
  if (d.ganadorFinalCorrecto) c.push('el ganador final');
  if (c.length === 0) return 'No acertaste nada en este partido';
  return 'Acertaste ' + c.join(' + ');
}
