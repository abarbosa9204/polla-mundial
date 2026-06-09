/**
 * Limpia la data de muestra cargada por `seed:demo`: elimina los usuarios demo
 * (sus marcadores/puntos caen en cascada) y restaura los partidos "finalizados"
 * a su estado original. Recalcula al final.
 *
 * Uso:  pnpm --filter @polla/server clean:demo
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
for (const l of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim().replace(/\r$/, ''));
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVER = process.env.VITE_SERVER_URL || 'http://localhost:8787';
const db = createClient(URL, SERVICE, { auth: { persistSession: false } });
const stateFile = join(here, '_demo_state.json');

async function main() {
  let state = { usuarios: [], partidosFinalizados: [] };
  if (existsSync(stateFile)) state = JSON.parse(readFileSync(stateFile, 'utf8'));

  // 1) Eliminar usuarios demo (por estado guardado y por patrón de correo, por si acaso).
  const ids = new Set(state.usuarios.map((u) => u.id));
  const all = (await db.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users;
  for (const u of all) {
    if (ids.has(u.id) || /^demo\d+@polla\.test$/.test(u.email ?? '')) {
      await db.auth.admin.deleteUser(u.id);
      console.log(`  eliminado: ${u.email}`);
    }
  }

  // 2) Restaurar partidos finalizados a su estado original.
  for (const p of state.partidosFinalizados) {
    await db.from('partidos').update({
      estado: p.estado, goles_a_90: p.goles_a_90, goles_b_90: p.goles_b_90,
      hubo_extra: p.hubo_extra, goles_a_extra: p.goles_a_extra, goles_b_extra: p.goles_b_extra,
      ganador_final: p.ganador_final, sellado: p.sellado, correccion_manual: p.correccion_manual,
    }).eq('id', p.id);
    console.log(`  partido restaurado: ${p.id} → ${p.estado}`);
  }

  // 3) Recalcular.
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email: 'angel.barbosa0117@gmail.com', password: 'Eliza/01177' });
  const res = await fetch(`${SERVER}/api/admin/recompute`, { method: 'POST', headers: { Authorization: `Bearer ${s.session.access_token}` } });
  console.log('  recompute →', res.status);

  if (existsSync(stateFile)) unlinkSync(stateFile);
  console.log('\n✅ Data de muestra eliminada y partidos restaurados.');
}
main().catch((e) => { console.error('💥', e.message ?? e); process.exit(1); });
