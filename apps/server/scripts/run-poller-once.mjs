/**
 * Ejecuta UN ciclo del poller contra el Supabase real (carga/actualiza partidos
 * y equipos, y recalcula si hay partidos en juego/finalizados). Usa el código
 * compilado en dist/. Carga el .env de la raíz, saneando comentarios/espacios.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/\r$/, '').trim();
  }
}

const { loadEnv } = await import('../dist/env.js');
const { getServiceClient } = await import('../dist/supabase.js');
const { SupabaseRepo } = await import('../dist/repo.js');
const { runPoller } = await import('../dist/poller/runPoller.js');

const env = loadEnv();
const repo = new SupabaseRepo(getServiceClient());
console.log('Ejecutando poller…');
const r = await runPoller(repo, env);
console.log('Resultado:', JSON.stringify(r));
console.log('✅ Listo.');
