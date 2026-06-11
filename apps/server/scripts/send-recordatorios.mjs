/**
 * Recordatorios de marcadores faltantes (prueba local). Usa el código compilado
 * en dist/. Carga el .env de la raíz, saneando comentarios/espacios.
 *
 * Uso:
 *   pnpm --filter @polla/server build
 *   node apps/server/scripts/send-recordatorios.mjs           # DRY-RUN (no envía)
 *   node apps/server/scripts/send-recordatorios.mjs --send    # envía de verdad
 *
 * El dry-run lista a quién se le enviaría y cuántos marcadores le faltan, sin
 * tocar nada. Seguro de correr en producción.
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

const enviar = process.argv.includes('--send');
const { enviarRecordatorios } = await import('../dist/services/recordatoriosService.js');

console.log(enviar ? '✉️  Enviando recordatorios…' : '🔍 DRY-RUN (no se envía nada)…');
const r = await enviarRecordatorios({ dryRun: !enviar, siteUrl: process.env.SITE_URL || undefined });

console.log('\n— Resumen —');
console.log(`Partidos en ventana:   ${r.partidosEnVentana}`);
console.log(`Bonos en ventana:      ${r.bonosEnVentana}${r.categoriasBonos?.length ? ` (${r.categoriasBonos.join(', ')})` : ''}`);
console.log(`Usuarios considerados: ${r.usuariosConsiderados}`);
console.log(`Usuarios con faltantes:${r.usuariosFaltantes}`);
console.log(`SMTP configurado:      ${r.smtpConfigurado ? 'sí' : 'NO'}`);
console.log(`Correos enviados:      ${r.correosEnviados}${r.dryRun ? ' (dry-run)' : ''}`);
if (r.detalle.length) {
  console.log('\n— A quién se notificaría —');
  for (const d of r.detalle)
    console.log(`  • ${d.nombre} <${d.email}> — ${d.partidosFaltantes} marcador(es), ${d.bonosFaltantes} bono(s)`);
}
if (r.errores.length) {
  console.log('\n— Errores —');
  for (const e of r.errores) console.log(`  ✗ ${e}`);
}
console.log('\n✅ Listo.');
