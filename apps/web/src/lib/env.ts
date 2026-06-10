/** Variables públicas expuestas por Vite (prefijo VITE_). */
// `.trim()` defensivo: si al pegar la variable en el panel (Vercel/Render) quedó
// con un espacio o salto de línea, una URL/cabecera malformada hace que `fetch`
// lance "Invalid value". Recortar evita ese error.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
// URL del servidor central (endpoint de pronósticos). Si no se define, se asume
// el mismo origen tras un proxy /api.
const serverUrl = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').trim();

if (!url || !anon) {
  // Falla visible en desarrollo: ayuda a no olvidar el .env
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env');
}

export const ENV = {
  SUPABASE_URL: url ?? '',
  SUPABASE_ANON_KEY: anon ?? '',
  SERVER_URL: serverUrl,
};
