/** Variables públicas expuestas por Vite (prefijo VITE_). */
// Quitar TODO espacio en blanco (incluso saltos de línea internos): al pegar una
// variable larga en el panel (Vercel/Render) puede quedar partida en varias
// líneas. Una URL o JWT con un salto de línea hace que `fetch` lance
// "Invalid value". Como ni la URL ni el JWT tienen espacios válidos, esto es seguro.
const limpio = (v: string | undefined) => (v ?? '').replace(/\s+/g, '');
const url = limpio(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anon = limpio(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
// URL del servidor central (endpoint de pronósticos). Si no se define, se asume
// el mismo origen tras un proxy /api.
const serverUrl = limpio(import.meta.env.VITE_SERVER_URL as string | undefined);

if (!url || !anon) {
  // Falla visible en desarrollo: ayuda a no olvidar el .env
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en el .env');
}

export const ENV = {
  SUPABASE_URL: url ?? '',
  SUPABASE_ANON_KEY: anon ?? '',
  SERVER_URL: serverUrl,
};
