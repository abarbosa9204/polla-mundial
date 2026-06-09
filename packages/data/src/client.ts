/**
 * Factorías de cliente Supabase.
 *   - `createBrowserClient`: clave ANON, para la PWA. Persiste la sesión y
 *     refresca el JWT. Sujeto a RLS ⇒ solo lectura de lo permitido.
 *   - `createServiceClient`: clave SERVICE_ROLE, SOLO para el servidor/Edge
 *     Function. Bypasea RLS ⇒ es quien escribe. NUNCA exponer en el cliente.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente para el navegador (PWA). Usa la clave pública `anon`. */
export function createBrowserClient(
  url: string,
  anonKey: string,
): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Cliente con privilegios de servidor (service_role). Bypasea RLS.
 * Úsalo SOLO en el servidor/Edge Function. Si esta clave llega al navegador,
 * cualquiera podría escribir: trátala como un secreto absoluto.
 */
export function createServiceClient(
  url: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
