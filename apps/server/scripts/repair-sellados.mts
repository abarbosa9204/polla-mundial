/**
 * Escanea los partidos SELLADOS cuyo resultado final en la BD difiere del que
 * reporta football-data (p. ej. un gol anulado por VAR que quedó congelado por
 * el sello). En seco solo reporta; con --apply corre el poller una vez (usa el
 * diff nuevo, que corrige finales sellados) y vuelve a verificar.
 *
 *   pnpm --filter @polla/server exec tsx scripts/repair-sellados.mts           # SECO
 *   pnpm --filter @polla/server exec tsx scripts/repair-sellados.mts --apply   # corrige
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
const { runPoller } = await import('../src/poller/runPoller.js');
const { fetchPartidosFootballData } = await import('../src/poller/footballDataClient.js');
const { normalizarFootballData } = await import('../src/poller/footballDataNormalizer.js');

const env = loadEnv();
const repo = new SupabaseRepo(getServiceClient());

async function discrepancias() {
  const [partidos, matches] = await Promise.all([
    repo.getPartidos(),
    fetchPartidosFootballData(env),
  ]);
  const apiById = new Map<string, ReturnType<typeof normalizarFootballData>>();
  for (const m of matches) {
    const n = normalizarFootballData(m);
    if (n) apiById.set(n.id, n);
  }
  const out: string[] = [];
  for (const p of partidos) {
    if (!p.sellado || p.estado !== 'FINISHED') continue;
    const n = apiById.get(p.id);
    if (!n || n.estado !== 'FINISHED') continue;
    const dif =
      p.goles_a_90 !== n.golesA90 ||
      p.goles_b_90 !== n.golesB90 ||
      p.hubo_extra !== n.huboExtra ||
      p.goles_a_extra !== n.golesAExtra ||
      p.goles_b_extra !== n.golesBExtra ||
      p.ganador_final !== n.ganadorFinal;
    if (dif) {
      out.push(
        `  ${p.id} ${p.equipo_a}-${p.equipo_b} [${p.fase}]  BD=${p.goles_a_90}-${p.goles_b_90} gf=${p.ganador_final}` +
          `  ->  API=${n.golesA90}-${n.golesB90} gf=${n.ganadorFinal}` +
          (p.correccion_manual ? '  (correccion_manual: NO se toca)' : ''),
      );
    }
  }
  return out;
}

console.log('=== Sellados con resultado final distinto a football-data ===');
const antes = await discrepancias();
console.log(antes.length ? antes.join('\n') : '  (ninguno)');

if (process.argv.includes('--apply') && antes.length) {
  console.log('\n--apply: corriendo el poller una vez (diff nuevo corrige finales sellados)...');
  const r = await runPoller(repo, env);
  console.log('poller:', JSON.stringify(r));
  console.log('\n=== Verificación posterior ===');
  const despues = await discrepancias();
  console.log(despues.length ? despues.join('\n') : '  (ninguno — todo corregido)');
}
process.exit(0);
