/**
 * Diagnóstico (y aplicación opcional) de la consolidación de clasificados firmes
 * desde el cuadro real, contra la BD configurada en el .env de la raíz.
 *
 *   pnpm --filter @polla/server exec tsx scripts/diag-consolidacion.mts          # SECO (no escribe)
 *   pnpm --filter @polla/server exec tsx scripts/diag-consolidacion.mts --apply  # corre recomputarTodo
 *
 * El modo SECO solo lee: imprime qué rondas consolidaría clasificadosDesdeCuadro
 * y el estado actual de resultados_torneo. --apply ejecuta el recálculo idempotente.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim().replace(/\r$/, ''));
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2];
}

const { getServiceClient } = await import('../src/supabase.js');
const { loadEnv } = await import('../src/env.js');
const { SupabaseRepo } = await import('../src/repo.js');
const { clasificadosDesdeCuadro } = await import('../src/scoring/index.js');
const { recomputarTodo } = await import('../src/services/recompute.js');

const env = loadEnv();
const repo = new SupabaseRepo(getServiceClient());

const partidos = await repo.getPartidos();
const resultados = await repo.getResultadosTorneo();

console.log('partidos en BD:', partidos.length);
const cuadro = clasificadosDesdeCuadro(partidos);
console.log('clasificadosDesdeCuadro (rondas completas) =>');
for (const [ronda, eq] of Object.entries(cuadro)) {
  console.log(`  ${ronda}: ${eq.length} equipos -> ${eq.join(', ')}`);
}
console.log('resultados_torneo.clasificados ACTUAL =>',
  JSON.stringify(resultados.clasificados));

if (process.argv.includes('--apply')) {
  console.log('\n--apply: ejecutando recomputarTodo...');
  const r = await recomputarTodo(repo, env);
  console.log('recompute OK:', JSON.stringify(r));
  const despues = await repo.getResultadosTorneo();
  console.log('resultados_torneo.clasificados DESPUÉS =>',
    JSON.stringify(despues.clasificados));
} else {
  console.log('\n(modo SECO: no se escribió nada; usa --apply para aplicar)');
}
process.exit(0);
