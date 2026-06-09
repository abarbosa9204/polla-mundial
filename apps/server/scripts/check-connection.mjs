/**
 * Comprobación de conexión (solo lectura): verifica credenciales Supabase,
 * que el esquema esté aplicado y que el token de football-data funcione.
 * NO escribe nada.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      // Quita comentarios en línea (" #...") y espacios/retorno de carro.
      process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/\r$/, '').trim();
    }
  }
} catch {}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FD = process.env.FOOTBALL_DATA_TOKEN;

const db = createClient(URL, KEY, { auth: { persistSession: false } });
let ok = true;

async function check(nombre, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${nombre}: ${r}`);
  } catch (e) {
    ok = false;
    console.log(`❌ ${nombre}: ${e.message ?? e}`);
  }
}

await check('Supabase config_torneo', async () => {
  const { data, error } = await db.from('config_torneo').select('bloqueada').eq('id', 1).single();
  if (error) throw error;
  return `config presente (bloqueada=${data.bloqueada})`;
});

await check('Tabla partidos', async () => {
  const { count, error } = await db.from('partidos').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count ?? 0} partidos`;
});

await check('Tabla profiles', async () => {
  const { count, error } = await db.from('profiles').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return `${count ?? 0} usuarios`;
});

await check('Tabla resultados_torneo', async () => {
  const { error } = await db.from('resultados_torneo').select('id').eq('id', 1).single();
  if (error) throw error;
  return 'presente';
});

await check('football-data.org', async () => {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${process.env.FD_COMPETITION || 'WC'}/matches`,
    { headers: { 'X-Auth-Token': FD } },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return `${j.matches?.length ?? 0} partidos disponibles en la API`;
});

console.log(ok ? '\n🎉 Conexión correcta.' : '\n⚠️ Hay problemas que revisar arriba.');
process.exit(ok ? 0 : 1);
