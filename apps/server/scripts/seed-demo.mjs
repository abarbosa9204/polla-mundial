/**
 * Carga DATA DE MUESTRA para simular la polla: usuarios demo (activos+pagados),
 * sus marcadores en varios partidos, y resultados simulados en los primeros
 * partidos para que la tabla de posiciones tenga puntos. Guarda el estado tocado
 * en `_demo_state.json` para poder limpiar luego con `clean:demo`.
 *
 * Uso:  pnpm --filter @polla/server seed:demo
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
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

const NOMBRES = ['Carlos Ruiz', 'María Gómez', 'Andrés Peña', 'Luisa Torres', 'Jorge Díaz', 'Sofía Mejía', 'Diego Rojas', 'Valentina Cruz'];
const PASS = 'Demo12345';
const RESULTADOS = [ { a: 2, b: 1 }, { a: 0, b: 0 }, { a: 3, b: 1 }, { a: 1, b: 2 } ]; // para los 4 partidos "finalizados"

async function main() {
  // 1) Usuarios demo (activos + pagados).
  const usuarios = [];
  for (let i = 0; i < NOMBRES.length; i++) {
    const email = `demo${i + 1}@polla.test`;
    const prev = (await db.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users.find((u) => u.email === email);
    if (prev) await db.auth.admin.deleteUser(prev.id);
    const { data, error } = await db.auth.admin.createUser({ email, password: PASS, email_confirm: true, user_metadata: { display_name: NOMBRES[i] } });
    if (error) throw error;
    await new Promise((r) => setTimeout(r, 200));
    await db.from('profiles').update({ estado: 'aprobado', pagado: true, display_name: NOMBRES[i] }).eq('id', data.user.id);
    usuarios.push({ id: data.user.id, nombre: NOMBRES[i] });
    console.log(`  usuario: ${NOMBRES[i]} (${email})`);
  }

  // 2) Partidos de grupos (los primeros por fecha).
  const { data: partidos } = await db.from('partidos')
    .select('id, kickoff_utc, estado, goles_a_90, goles_b_90, hubo_extra, goles_a_extra, goles_b_extra, ganador_final, sellado, correccion_manual')
    .eq('fase', 'GRUPOS').order('kickoff_utc', { ascending: true }).limit(12);
  const usados = (partidos ?? []).slice(0, 12);
  const finalizados = usados.slice(0, 4);

  // 3) Guardar estado original de los partidos que vamos a "finalizar".
  const estadoOriginal = finalizados.map((p) => ({
    id: p.id, estado: p.estado, goles_a_90: p.goles_a_90, goles_b_90: p.goles_b_90,
    hubo_extra: p.hubo_extra, goles_a_extra: p.goles_a_extra, goles_b_extra: p.goles_b_extra,
    ganador_final: p.ganador_final, sellado: p.sellado, correccion_manual: p.correccion_manual,
  }));
  writeFileSync(join(here, '_demo_state.json'), JSON.stringify({ usuarios, partidosFinalizados: estadoOriginal }, null, 2));

  // 4) Marcadores de cada usuario en los 12 partidos.
  const filas = [];
  usados.forEach((p, j) => {
    usuarios.forEach((u, i) => {
      let a, b;
      if (j < 4 && i % 3 === 0) { a = RESULTADOS[j].a; b = RESULTADOS[j].b; }          // aciertan exacto
      else if (j < 4 && i % 3 === 1) { a = RESULTADOS[j].a + 1; b = RESULTADOS[j].b; }  // mismo ganador aprox
      else { a = (i + j) % 4; b = (i * 2 + j) % 3; }                                    // variado
      filas.push({ user_id: u.id, partido_id: p.id, marcador_a_90: a, marcador_b_90: b });
    });
  });
  // Insertar por lotes (los triggers de versión/historial corren igual).
  for (let k = 0; k < filas.length; k += 200) {
    const { error } = await db.from('pronosticos').upsert(filas.slice(k, k + 200), { onConflict: 'user_id,partido_id' });
    if (error) throw error;
  }
  console.log(`  ${filas.length} marcadores cargados (${usuarios.length} usuarios × ${usados.length} partidos)`);

  // 5) "Finalizar" 4 partidos con resultado simulado (manual ⇒ el poller no lo pisa).
  for (let j = 0; j < finalizados.length; j++) {
    const p = finalizados[j];
    await db.from('partidos').update({
      estado: 'FINISHED', goles_a_90: RESULTADOS[j].a, goles_b_90: RESULTADOS[j].b,
      hubo_extra: false, correccion_manual: true, sellado: false,
    }).eq('id', p.id);
  }
  console.log(`  4 partidos finalizados (simulados)`);

  // 6) Recalcular (vía endpoint admin con el super admin).
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.signInWithPassword({ email: 'angel.barbosa0117@gmail.com', password: 'Eliza/01177' });
  const res = await fetch(`${SERVER}/api/admin/recompute`, { method: 'POST', headers: { Authorization: `Bearer ${s.session.access_token}` } });
  console.log('  recompute →', res.status, JSON.stringify(await res.json().catch(() => ({}))));

  console.log('\n✅ Data de muestra cargada. Limpia luego con: pnpm --filter @polla/server clean:demo');
  console.log('   (login demo: demo1@polla.test … demo8@polla.test / Demo12345)');
}
main().catch((e) => { console.error('💥', e.message ?? e); process.exit(1); });
