/**
 * Carga el catálogo de jugadores (para el buscador de goleador) desde
 * football-data.org — el MISMO origen y token del poller, con las plantillas
 * oficiales de la competición. Una sola petición a /competitions/{id}/teams
 * (cada equipo trae su `squad`). El equipo_id se deriva del TLA (3 letras),
 * igual que el normalizador de partidos.
 *
 * Requisitos: `.env` en la raíz con SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y
 * FOOTBALL_DATA_TOKEN.
 *
 * Uso:  pnpm --filter @polla/server seed:jugadores
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const l of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim().replace(/\r$/, ''));
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
const COMP = process.env.FD_COMPETITION || 'WC';
if (!URL || !KEY || !TOKEN) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / FOOTBALL_DATA_TOKEN en el .env');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

// Alias de TLA → código canónico (espejo de src/poller/codigosEquipos.ts:ALIAS_TLA).
// football-data cambia el TLA de algunas selecciones; lo consolidamos aquí también
// para que los jugadores queden enlazados al MISMO id de equipo que usa el poller.
const ALIAS_TLA = { CUR: 'CUW', URU: 'URY' };
function canonicalTla(raw) {
  const up = String(raw).trim().toUpperCase();
  return ALIAS_TLA[up] ?? up;
}

function equipoId(t) {
  const id = t.tla ?? (t.id != null ? String(t.id) : null);
  return id ? canonicalTla(id) : null;
}

async function main() {
  // 1) Plantillas oficiales (un solo request).
  const res = await fetch(`https://api.football-data.org/v4/competitions/${COMP}/teams`, {
    headers: { 'X-Auth-Token': TOKEN },
  });
  if (!res.ok) {
    console.error(`football-data /teams → HTTP ${res.status}`);
    process.exit(1);
  }
  const { teams = [] } = await res.json();

  // 2) Equipos existentes en la BD (para enlazar por FK sin fallar).
  const { data: eq, error: eqErr } = await db.from('equipos').select('id');
  if (eqErr) throw eqErr;
  const existentes = new Set((eq ?? []).map((e) => e.id));

  // 3) Construir filas de jugadores.
  const filas = [];
  let sinEquipo = 0;
  for (const t of teams) {
    const eid = equipoId(t);
    if (!eid || !existentes.has(eid)) {
      sinEquipo += (t.squad ?? []).length;
      continue;
    }
    for (const p of t.squad ?? []) {
      if (p?.id == null || !p?.name) continue;
      filas.push({ id: String(p.id), nombre: p.name, foto_url: null, equipo_id: eid });
    }
  }

  if (!filas.length) {
    console.error('No se construyó ningún jugador. ¿Equipos cargados por el poller?');
    process.exit(1);
  }

  // 4) Reemplazar el catálogo (nadie tiene bonos aún). Si falla el borrado por FK,
  //    seguimos con upsert (idempotente).
  await db.from('jugadores').delete().neq('id', '').then((r) => {
    if (r.error) console.warn(`  (no se pudo limpiar antes: ${r.error.message}; se hará upsert)`);
  });

  let total = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error } = await db.from('jugadores').upsert(lote, { onConflict: 'id' });
    if (error) {
      console.warn(`  ⚠️ lote ${i}-${i + lote.length}: ${error.message}`);
    } else {
      total += lote.length;
    }
  }

  console.log(`✅ ${total} jugadores cargados (${teams.length} equipos).`);
  if (sinEquipo) console.log(`   (${sinEquipo} jugadores omitidos: su selección aún no está en la BD)`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
