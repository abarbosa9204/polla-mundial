/**
 * Tipos de las filas de Postgres (subconjunto que usa la app).
 *
 * Reflejan el esquema de `supabase/migrations`. En un proyecto con la BD ya
 * creada se pueden regenerar con `supabase gen types typescript`, pero los
 * mantenemos a mano y tipados para no depender de ese paso en CI.
 */
import type { EstadoPartido, Fase, LadoEquipo } from '@polla/core';

export interface ProfileRow {
  id: string;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string;
}

export interface PartidoRow {
  id: string;
  fase: Fase;
  grupo: string | null;
  ronda_orden: number;
  equipo_a: string | null;
  equipo_b: string | null;
  kickoff_utc: string; // ISO 8601 UTC
  estado: EstadoPartido;
  goles_a_90: number | null;
  goles_b_90: number | null;
  hubo_extra: boolean | null;
  goles_a_extra: number | null;
  goles_b_extra: number | null;
  ganador_final: LadoEquipo | null;
  sellado: boolean;
  correccion_manual: boolean;
  updated_at: string;
}

export interface PronosticoRow {
  id: string;
  user_id: string;
  partido_id: string;
  marcador_a_90: number;
  marcador_b_90: number;
  habra_extra: boolean | null;
  extra_a: number | null;
  extra_b: number | null;
  ganador_final: LadoEquipo | null;
  created_at_server: string;
  updated_at_server: string;
  version: number;
}

export interface BonosUsuarioRow {
  user_id: string;
  campeon_equipo: string | null;
  campeon_registrado_en: string | null;
  goleador_jugador: string | null;
  goleador_registrado_en: string | null;
  clasificados: Partial<Record<Exclude<Fase, 'GRUPOS' | 'TERCER_PUESTO'>, string[]>>;
  clasificados_registrado_en: Partial<Record<string, string>>;
  updated_at: string;
}

export interface TablaPosicionRow {
  user_id: string;
  display_name: string;
  puntos_confirmados: number;
  puntos_provisionales: number;
  puntos_totales: number;
  marcadores_exactos: number;
  resultados_1x2: number;
  timestamp_campeon: string | null;
  posicion: number | null;
  posicion_confirmada: number | null;
  movimiento: number;
  /** Desglose de bonos parciales por categoría: { '16avos': 2, Goleador: 0 }. */
  bonos_parciales: Record<string, number> | null;
  updated_at: string;
}

export interface DesgloseRow {
  user_id: string;
  partido_id: string;
  desglose: unknown; // DesglosePartido serializado
  puntos: number;
  provisional: boolean;
  updated_at: string;
}

export interface ConfigTorneoRow {
  id: 1;
  config_puntos: unknown; // ConfigPuntos
  bloqueada: boolean;
  primer_kickoff_utc: string | null;
  updated_at: string;
}
