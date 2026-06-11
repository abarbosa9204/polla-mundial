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

export interface InfoPagoPublico {
  valorInscripcion: number;
  moneda: string;
}

/**
 * Valor de inscripción + moneda, legible SIN sesión (pantalla de login). Va por
 * una función pública (security definer), no por el endpoint del servidor, para
 * no depender de que Render esté despierto. Nunca lanza: si falla, el login sigue.
 */
export async function fetchInfoPagoPublico(): Promise<InfoPagoPublico | null> {
  const { data, error } = await supabase.rpc('info_pago_publico');
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    valorInscripcion: Number((row as { valor_inscripcion: number }).valor_inscripcion ?? 0),
    moneda: (row as { moneda: string }).moneda ?? 'COP',
  };
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

/** ID del usuario en sesión (de la sesión local, sin pedir a la red). */
async function miUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchMisPronosticos(): Promise<PronosticoRow[]> {
  // FILTRO EXPLÍCITO por user_id: para admin/super_admin la RLS deja leer TODOS
  // los pronósticos, así que sin este filtro "mis" devolvería los de todos
  // (y el card mostraría el de otro usuario). Siempre solo los míos.
  const uid = await miUserId();
  if (!uid) return [];
  const { data, error } = await supabase.from('pronosticos').select('*').eq('user_id', uid);
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
  const uid = await miUserId();
  if (!uid) return [];
  const { data, error } = await supabase.from('desgloses').select('*').eq('user_id', uid);
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
  const uid = await miUserId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('bonos_usuario')
    .select('campeon_equipo, goleador_jugador, clasificados')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    campeon_equipo: (data.campeon_equipo as string | null) ?? null,
    goleador_jugador: (data.goleador_jugador as string | null) ?? null,
    clasificados: (data.clasificados as Record<string, string[]> | null) ?? {},
  };
}
