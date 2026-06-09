/**
 * Crea (o actualiza) la cuenta de SUPER ADMIN de la polla.
 *
 * Idempotente: si la cuenta ya existe, le re-aplica la contraseña, confirma el
 * correo y asegura rol 'super_admin' + estado 'aprobado'.
 *
 * Requisitos: `.env` en la raíz con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 * Uso:  pnpm --filter @polla/server seed:super-admin
 *
 * Puedes sobreescribir credenciales por variables de entorno:
 *   SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD, SUPERADMIN_NAME
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
function loadEnv() {
  try {
    const txt = readFileSync(join(root, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim().replace(/\r$/, ''));
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* usa process.env */
  }
}
loadEnv();

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el .env');
  process.exit(1);
}

const EMAIL = process.env.SUPERADMIN_EMAIL || 'angel.barbosa0117@gmail.com';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'Eliza/01177';
const NAME = process.env.SUPERADMIN_NAME || 'Angel Barbosa';

const db = createClient(URL, KEY, { auth: { persistSession: false } });

async function buscarPorEmail(email) {
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  let user = await buscarPorEmail(EMAIL);

  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: NAME },
    });
    if (error) throw error;
    user = data.user;
    console.log(`✅ Usuario auth creado: ${EMAIL}`);
  } else {
    const { error } = await db.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: NAME },
    });
    if (error) throw error;
    console.log(`♻️  Usuario auth existente actualizado: ${EMAIL}`);
  }

  // profiles: el trigger pudo crearlo como 'pendiente'/'user'; lo forzamos.
  const { error: e2 } = await db
    .from('profiles')
    .upsert(
      { id: user.id, display_name: NAME, role: 'super_admin', estado: 'aprobado' },
      { onConflict: 'id' },
    );
  if (e2) throw e2;

  console.log(`\n🎉 Super admin listo.\n   Correo: ${EMAIL}\n   Clave:  ${PASSWORD}\n   Rol:    super_admin (aprobado)`);
}

main().catch((e) => {
  console.error('Error:', e.message ?? e);
  process.exit(1);
});
