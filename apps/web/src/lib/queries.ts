/** Consultas de lectura a Supabase (sujetas a RLS). */
import { supabase } from './supabase.js';
import type { ConfigPuntos } from '@polla/core';
import { CONFIG_PUNTOS_DEFAULT } from '@polla/core';
import type {
  PartidoRow,
  TablaPosicionRow,
  PronosticoRow,
  DesgloseRow,
} from '@polla/data';

export interface EquipoView {
  id: string;
  nombre: string;
  crest_url: string | null;
}

export async function fetchPartidos(): Promise<PartidoRow[]> {
  const { data, error } = await supabase
    .from('partidos')
    .select('*')
    .order('kickoff_utc', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PartidoRow[];
}

export async function fetchEquipos(): Promise<Map<string, EquipoView>> {
  const { data, error } = await supabase.from('equipos').select('id, nombre, crest_url');
  if (error) throw error;
  const m = new Map<string, EquipoView>();
  for (const e of (data ?? []) as EquipoView[]) m.set(e.id, e);
  return m;
}

export async function fetchMisPronosticos(): Promise<PronosticoRow[]> {
  const { data, error } = await supabase.from('pronosticos').select('*');
  if (error) throw error;
  return (data ?? []) as PronosticoRow[];
}

export async function fetchTabla(): Promise<TablaPosicionRow[]> {
  const { data, error } = await supabase
    .from('tabla_posiciones')
    .select('*')
    .order('posicion', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TablaPosicionRow[];
}

/** Pronósticos públicos de un partido (RLS solo deja si el partido ya inició). */
export async function fetchPronosticosDePartido(partidoId: string): Promise<PronosticoRow[]> {
  const { data, error } = await supabase
    .from('pronosticos')
    .select('*')
    .eq('partido_id', partidoId);
  if (error) throw error;
  return (data ?? []) as PronosticoRow[];
}

/**
 * Pronósticos de un usuario concreto. RLS devuelve solo los visibles para quien
 * consulta: los propios siempre, y los ajenos solo de partidos que YA INICIARON
 * (kickoff alcanzado o en juego/terminado). El registro cierra 5 min antes, así
 * que al iniciar nadie puede copiar.
 */
export async function fetchPronosticosDeUsuario(userId: string): Promise<PronosticoRow[]> {
  const { data, error } = await supabase
    .from('pronosticos')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []) as PronosticoRow[];
}

export async function fetchPerfiles(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('profiles').select('id, display_name');
  if (error) throw error;
  const m = new Map<string, string>();
  for (const r of (data ?? []) as { id: string; display_name: string }[]) {
    m.set(r.id, r.display_name);
  }
  return m;
}

export async function fetchMisDesgloses(): Promise<DesgloseRow[]> {
  const { data, error } = await supabase.from('desgloses').select('*');
  if (error) throw error;
  return (data ?? []) as DesgloseRow[];
}

export interface JugadorView {
  id: string;
  nombre: string;
  foto_url: string | null;
  equipo_id: string | null;
}

export async function fetchJugadores(): Promise<JugadorView[]> {
  const { data, error } = await supabase
    .from('jugadores')
    .select('id, nombre, foto_url, equipo_id')
    .order('nombre');
  if (error) throw error;
  return (data ?? []) as JugadorView[];
}

export interface PollerEstado {
  ultimo_exito_en: string | null;
  ultimo_intento_en: string | null;
  fallos_consecutivos: number;
  fuente_activa: string | null;
  mensaje: string | null;
}

/** Estado de salud del poller (solo admin por RLS). */
export async function fetchPollerEstado(): Promise<PollerEstado | null> {
  const { data, error } = await supabase
    .from('poller_estado')
    .select('ultimo_exito_en, ultimo_intento_en, fallos_consecutivos, fuente_activa, mensaje')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return (data as PollerEstado | null) ?? null;
}

/** Configuración de puntos vigente (para la vista de reglas). Cae al default. */
export async function fetchConfigPuntos(): Promise<ConfigPuntos> {
  const { data, error } = await supabase
    .from('config_torneo')
    .select('config_puntos')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return ((data?.config_puntos as ConfigPuntos | null) ?? CONFIG_PUNTOS_DEFAULT);
}

export async function fetchMisBonos(): Promise<{
  campeon_equipo: string | null;
  goleador_jugador: string | null;
  clasificados: Record<string, string[]>;
} | null> {
  const { data, error } = await supabase
    .from('bonos_usuario')
    .select('campeon_equipo, goleador_jugador, clasificados')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    campeon_equipo: (data.campeon_equipo as string | null) ?? null,
    goleador_jugador: (data.goleador_jugador as string | null) ?? null,
    clasificados: (data.clasificados as Record<string, string[]> | null) ?? {},
  };
}
