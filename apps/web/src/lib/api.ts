/**
 * Llamadas al servidor central (escrituras validadas con lock). Adjunta el JWT
 * de Supabase. Las escrituras REQUIEREN conexión: si falla, se informa claro y
 * NUNCA se encola offline (sección 3/4).
 */
import { supabase } from './supabase.js';
import { ENV } from './env.js';
import type { PronosticoPartidoInput } from '@polla/core';

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  if (!navigator.onLine) {
    throw new ApiError('Sin conexión: no se puede guardar. Conéctate e intenta de nuevo.', 'OFFLINE', 0);
  }
  let res: Response;
  try {
    // Solo declaramos content-type cuando hay cuerpo: Fastify rechaza un body
    // vacío con content-type JSON (típico en DELETE) con 400.
    const headers: Record<string, string> = { ...(await authHeader()), ...extraHeaders };
    if (body !== undefined) headers['content-type'] = 'application/json';
    res = await fetch(`${ENV.SERVER_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No se pudo contactar el servidor.', 'NETWORK', 0);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      (json.error as string) ?? 'Error del servidor',
      json.code as string | undefined,
      res.status,
    );
  }
  return json as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

// --- Goleadores del torneo (servidor → football-data) ---
export interface GoleadorView {
  nombre: string;
  equipo: string | null;
  equipoCrest: string | null;
  goles: number;
  penales: number | null;
  asistencias: number | null;
}
export function fetchGoleadores(): Promise<{ ok: true; goleadores: GoleadorView[]; error?: string }> {
  return request('GET', '/api/goleadores');
}

// --- Auth pública (registro y reset envían correo desde el servidor) ---
export function registroPublico(input: {
  email: string;
  password: string;
  display_name: string;
}): Promise<{ ok: true }> {
  return post('/api/auth/registro', input);
}
export function resetPublico(email: string): Promise<{ ok: true }> {
  return post('/api/auth/reset', { email });
}

export interface GuardarPronosticoResp {
  ok: true;
  id: string;
  version: number;
  registradoEn: string;
}

export function guardarPronostico(
  partidoId: string,
  pronostico: PronosticoPartidoInput,
  clienteTs?: string,
): Promise<GuardarPronosticoResp> {
  // `clienteTs` viaja en cabecera (no en el body, que es de esquema estricto):
  // es la hora del dispositivo al registrar offline, para auditoría/logs.
  return request('POST', `/api/pronostico/${partidoId}`, pronostico, clienteTs ? { 'x-cliente-ts': clienteTs } : undefined);
}

export interface BonosResp {
  ok: true;
  aplicados: string[];
  rechazados: string[];
}

export function guardarBonos(input: {
  campeon?: string | null;
  goleador?: string | null;
  clasificados?: Record<string, string[]>;
}): Promise<BonosResp> {
  return post('/api/bonos', input);
}

// --- Admin ---
export function adminPoll(): Promise<{ ok: true; cambios: number; recalculado: boolean }> {
  return post('/api/admin/poll', {});
}
export function adminRecompute(): Promise<{ ok: true; partidosPuntuados: number }> {
  return post('/api/admin/recompute', {});
}
export function adminCorregirPartido(
  id: string,
  cambios: Record<string, unknown>,
): Promise<{ ok: true }> {
  return post(`/api/admin/partido/${id}`, cambios);
}
export function adminResultados(input: {
  campeon?: string | null;
  goleadores?: string[];
  clasificados?: Record<string, string[]>;
}): Promise<{ ok: true }> {
  return post('/api/admin/resultados', input);
}

// --- Gestión de usuarios (solo super_admin) ---
export interface UsuarioAdmin {
  id: string;
  email: string | null;
  display_name: string;
  role: 'user' | 'admin' | 'super_admin';
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  pagado: boolean;
  email_confirmado: boolean;
  created_at: string;
}

export function adminListarUsuarios(): Promise<{ ok: true; usuarios: UsuarioAdmin[] }> {
  return request('GET', '/api/admin/usuarios');
}
export function adminCrearUsuario(input: { email: string; display_name: string }): Promise<{ ok: true; id: string }> {
  return post('/api/admin/usuarios', input);
}
export function adminEstadoUsuario(
  id: string,
  estado: 'pendiente' | 'aprobado' | 'rechazado',
): Promise<{ ok: true }> {
  return post(`/api/admin/usuarios/${id}/estado`, { estado });
}
export function adminEditarUsuario(
  id: string,
  cambios: { email?: string; display_name?: string; password?: string; pagado?: boolean },
): Promise<{ ok: true }> {
  return request('PATCH', `/api/admin/usuarios/${id}`, cambios);
}

// --- Bolsa y premios ---
export interface PremioPuesto {
  puesto: number;
  pct: number;
  monto: number;
  definidoManual: boolean;
}
export interface BolsaResp {
  ok: true;
  moneda: string;
  valorInscripcion: number;
  bolsa: number;
  aportantes: number;
  premios: PremioPuesto[];
}
export function fetchBolsa(): Promise<BolsaResp> {
  return request('GET', '/api/bolsa');
}

export interface PremiosConfigDTO {
  moneda: string;
  valor_inscripcion: number;
  pct_primero: number;
  pct_segundo: number;
  pct_tercero: number;
  monto_primero: number | null;
  monto_segundo: number | null;
  monto_tercero: number | null;
}
export function adminGetPremios(): Promise<{ ok: true; config: PremiosConfigDTO; bolsa: Omit<BolsaResp, 'ok'> }> {
  return request('GET', '/api/admin/premios');
}
export function adminSetPremios(cfg: Partial<PremiosConfigDTO>): Promise<{ ok: true }> {
  return request('PUT', '/api/admin/premios', cfg);
}
export function adminEliminarUsuario(id: string): Promise<{ ok: true }> {
  return request('DELETE', `/api/admin/usuarios/${id}`);
}

// --- Configuración SMTP (solo super_admin) ---
export interface SmtpConfigDTO {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  sender_email: string;
  sender_name: string;
  habilitado: boolean;
  password_set: boolean;
}
export function adminGetSmtp(): Promise<{ ok: true; config: SmtpConfigDTO | null }> {
  return request('GET', '/api/admin/smtp');
}
export function adminSetSmtp(cfg: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password?: string;
  sender_email: string;
  sender_name: string;
  habilitado: boolean;
}): Promise<{ ok: true }> {
  return request('PUT', '/api/admin/smtp', cfg);
}
export function adminTestSmtp(to: string): Promise<{ ok: true }> {
  return post('/api/admin/smtp/test', { to });
}
