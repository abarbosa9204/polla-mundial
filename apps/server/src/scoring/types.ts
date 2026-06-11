/**
 * DTOs de scoring: estructuras planas que el orquestador consume. La capa de
 * persistencia (Supabase) mapea filas de la BD a estos DTOs, manteniendo el
 * orquestador puro y testeable sin base de datos.
 */
import type {
  DesglosePartido,
  EstadoPartido,
  Fase,
  PronosticoPartido,
  ResultadoOficial,
} from '@polla/core';

/** Un partido listo para puntuar (resultado final y provisional ya construidos). */
export interface PartidoScoring {
  id: string;
  fase: Fase;
  estado: EstadoPartido;
  /** Resultado oficial (90' + extra + ganador). `null` si aún sin marcador. */
  resultado: ResultadoOficial | null;
  /** Resultado provisional (marcador actual como si fuera el final de 90'). */
  resultadoProvisional: ResultadoOficial | null;
}

/** Pronóstico de un usuario para un partido (o ausencia = pronostico null). */
export interface PronosticoUsuario {
  userId: string;
  pronostico: PronosticoPartido | null;
}

/** Resultado del cálculo para un (usuario, partido). */
export interface DesgloseCalculado {
  userId: string;
  partidoId: string;
  desglose: DesglosePartido;
  provisional: boolean;
  puntos: number;
}

/** Datos del usuario para construir su fila de la tabla. */
export interface UsuarioTabla {
  userId: string;
  displayName: string;
  /** Epoch ms del registro del pronóstico de campeón (desempate 6.5). null si no. */
  timestampCampeon: number | null;
  /** Puntos de bonos de torneo ya confirmados (clasificados, campeón, goleador). */
  puntosBonos: number;
  /** Bonos PARCIALES (en curso, p. ej. goleador si el pick va de líder). Suman a provisionales. */
  puntosBonosParciales?: number;
  /** Desglose de los bonos parciales por categoría ({ '16avos': 2, Goleador: 0 }). */
  bonosParcialesDetalle?: Record<string, number>;
}
