/**
 * Cola local de pronósticos hechos SIN conexión. Se guarda en localStorage con la
 * fecha/hora del dispositivo (cliente) y se sincroniza cuando vuelve internet.
 *
 * IMPORTANTE (precisión): el reloj que vale para el CIERRE es el del SERVIDOR. El
 * `clienteTs` es solo informativo/auditoría. Al sincronizar, el servidor valida el
 * lock con SU reloj; si el partido ya cerró, el ítem se marca con error y se avisa.
 * Hay a lo sumo UN ítem por partido (el último reemplaza al anterior) ⇒ idempotente.
 */
import type { PronosticoPartidoInput } from '@polla/core';
import { guardarPronostico, ApiError } from './api.js';

const KEY = 'polla:cola-pronosticos:v1';

export interface ItemCola {
  partidoId: string;
  payload: PronosticoPartidoInput;
  clienteTs: string; // ISO, hora del dispositivo al registrar
  estado: 'pendiente' | 'error';
  error?: string;
}

function leer(): ItemCola[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ItemCola[]) : [];
  } catch {
    return [];
  }
}

function escribir(items: ItemCola[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento no disponible (modo privado / navegador in-app): se ignora */
  }
  // Avisar a la UI (banner / contadores).
  window.dispatchEvent(new CustomEvent('cola-pronosticos'));
}

/** Encola (o reemplaza) el pronóstico de un partido. */
export function encolar(partidoId: string, payload: PronosticoPartidoInput): void {
  const items = leer().filter((i) => i.partidoId !== partidoId);
  items.push({ partidoId, payload, clienteTs: new Date().toISOString(), estado: 'pendiente' });
  escribir(items);
}

export function listaCola(): ItemCola[] {
  return leer();
}

export function pendientes(): number {
  return leer().filter((i) => i.estado === 'pendiente').length;
}

export function quitar(partidoId: string): void {
  escribir(leer().filter((i) => i.partidoId !== partidoId));
}

export function marcarError(partidoId: string, error: string): void {
  const items = leer().map((i) => (i.partidoId === partidoId ? { ...i, estado: 'error' as const, error } : i));
  escribir(items);
}

/**
 * Sincroniza los pendientes contra el servidor (que valida el lock con SU reloj).
 * No reintenta los que fallan por offline/red (se quedan para el próximo intento);
 * marca con error los rechazados (p. ej. el partido ya cerró).
 */
export async function sincronizarCola(): Promise<{ ok: number; error: number }> {
  if (!navigator.onLine) return { ok: 0, error: 0 };
  let ok = 0;
  let error = 0;
  for (const item of leer()) {
    if (item.estado !== 'pendiente') continue;
    try {
      await guardarPronostico(item.partidoId, item.payload, item.clienteTs);
      quitar(item.partidoId);
      ok++;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'OFFLINE' || code === 'NETWORK') break; // sigue sin conexión: reintentar luego
      // El partido ya cerró ⇒ nunca se va a poder guardar: se descarta (no se
      // deja colgado ni como "error" eterno; el cache se reconcilia con la BD).
      if (code === 'LOCKED' || code === 'NOT_FOUND') {
        quitar(item.partidoId);
      } else {
        marcarError(item.partidoId, err instanceof Error ? err.message : 'Error al sincronizar');
      }
      error++;
    }
  }
  return { ok, error };
}
