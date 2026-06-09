/**
 * Siembra la tabla `config_smtp` con los valores SMTP del .env y la deja
 * habilitada. Idempotente. Requiere que la migración 0009 ya esté aplicada.
 *
 * Uso:  pnpm --filter @polla/server seed:smtp
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
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el .env');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const fila = {
  id: 1,
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  username: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASS || '',
  sender_email: process.env.SMTP_SENDER_EMAIL || process.env.SMTP_USER || '',
  sender_name: process.env.SMTP_SENDER_NAME || 'Polla Mundialista',
  habilitado: true,
  updated_at: new Date().toISOString(),
};

const { error } = await db.from('config_smtp').upsert(fila, { onConflict: 'id' });
if (error) {
  console.error('❌', error.message);
  if (/relation .*config_smtp.* does not exist|PGRST205/i.test(error.message)) {
    console.error('   → Falta aplicar la migración 0009_config_smtp.sql en el SQL Editor de Supabase.');
  }
  process.exit(1);
}
console.log(`✅ config_smtp sembrada y habilitada (host=${fila.host}, user=${fila.username}, remitente=${fila.sender_email}).`);
