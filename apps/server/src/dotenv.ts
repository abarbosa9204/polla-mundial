/**
 * Cargador mínimo de `.env` (sin dependencias) para desarrollo local.
 * - Busca `.env` en la raíz del monorepo y en el cwd.
 * - Sanea comentarios en línea (" #...") y espacios/retorno de carro.
 * - NO sobreescribe variables ya presentes en el entorno (en producción —
 *   Fly/Render/Vercel— las variables vienen de la plataforma, no de `.env`).
 *
 * Importar este módulo ANTES de leer `process.env` (ver index.ts).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function cargar(path: string): void {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r$/, ''); // tolera finales CRLF
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const clave = m[1]!;
    if (process.env[clave] !== undefined) continue; // no sobreescribir
    const valor = m[2]!.replace(/\s+#.*$/, '').trim();
    process.env[clave] = valor;
  }
}

const here = dirname(fileURLToPath(import.meta.url));
// dist/dotenv.js -> apps/server -> apps -> raíz
cargar(join(here, '..', '..', '..', '.env'));
cargar(join(process.cwd(), '.env'));
