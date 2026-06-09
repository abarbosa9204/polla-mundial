/**
 * Agregación de bonos de torneo por usuario (sección 6.4), usando @polla/core.
 */
import {
  calcularBonoClasificados,
  calcularBonoCampeon,
  calcularBonoGoleador,
  type BonosTorneoConfig,
  type ConfigPuntos,
  type DesgloseBono,
} from '@polla/core';

/** Rondas que otorgan bono de clasificación (no incluye 3er puesto). */
export type RondaClasificacion = 'R32' | 'R16' | 'CUARTOS' | 'SEMIS' | 'FINAL';

const RONDA_A_BONO: Record<RondaClasificacion, keyof BonosTorneoConfig> = {
  R32: 'clasificado16avos',
  R16: 'clasificadoOctavos',
  CUARTOS: 'clasificadoCuartos',
  SEMIS: 'clasificadoSemis',
  FINAL: 'clasificadoFinal',
};

const RONDAS: readonly RondaClasificacion[] = ['R32', 'R16', 'CUARTOS', 'SEMIS', 'FINAL'];

/** Resultados oficiales del torneo relevantes para bonos. */
export interface ResultadosTorneo {
  clasificados: Partial<Record<RondaClasificacion, ReadonlySet<string>>>;
  campeon: string | null;
  /** Goleadores reales (lista de empatados en el primer puesto). */
  goleadores: readonly string[];
}

/** Predicciones de bono del usuario. */
export interface PicksUsuario {
  clasificados: Partial<Record<RondaClasificacion, readonly string[]>>;
  campeon: string | null;
  goleador: string | null;
}

export interface BonosUsuarioResultado {
  total: number;
  detalle: DesgloseBono[];
}

export function computarBonosUsuario(
  picks: PicksUsuario,
  resultados: ResultadosTorneo,
  config: ConfigPuntos,
): BonosUsuarioResultado {
  const detalle: DesgloseBono[] = [];

  for (const ronda of RONDAS) {
    const reales = resultados.clasificados[ronda];
    if (!reales) continue; // esa ronda aún no se ha resuelto
    const tipo = RONDA_A_BONO[ronda];
    detalle.push(
      calcularBonoClasificados(
        tipo,
        picks.clasificados[ronda] ?? [],
        reales,
        config.bonos[tipo],
      ),
    );
  }

  if (resultados.campeon != null) {
    detalle.push(
      calcularBonoCampeon(picks.campeon, resultados.campeon, config.bonos.campeon),
    );
  }
  if (resultados.goleadores.length > 0) {
    detalle.push(
      calcularBonoGoleador(picks.goleador, resultados.goleadores, config.bonos.goleador),
    );
  }

  const total = detalle.reduce((s, d) => s + d.total, 0);
  return { total, detalle };
}
