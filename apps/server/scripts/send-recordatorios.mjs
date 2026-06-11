/**
 * Recordatorios de marcadores/bonos faltantes. Usa el código compilado en dist/.
 * Carga el .env de la raíz, saneando comentarios/espacios.
 *
 * Uso:
 *   pnpm --filter @polla/server build
 *   node apps/server/scripts/send-recordatorios.mjs                 # DRY-RUN (no envía)
 *   node apps/server/scripts/send-recordatorios.mjs --preview       # genera correo-ejemplo.html (no envía)
 *   node apps/server/scripts/send-recordatorios.mjs --solo=tu@correo # envía SOLO a ese correo (prueba)
 *   node apps/server/scripts/send-recordatorios.mjs --send          # envía de verdad a todos
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/\r$/, '').trim();
  }
}

const args = process.argv.slice(2);
const solo = (args.find((a) => a.startsWith('--solo=')) || '').slice('--solo='.length);
const enviar = args.includes('--send') || !!solo;
const { enviarRecordatorios, previewHtml } = await import('../dist/services/recordatoriosService.js');

// --preview: genera un HTML con DATOS REALES para abrir en el navegador (sin enviar).
if (args.includes('--preview')) {
  const html = await previewHtml();
  const out = join(root, 'correo-ejemplo.html');
  writeFileSync(out, html, 'utf8');
  console.log(`🖼️  Previsualización escrita en: ${out}\n   Ábrela en tu navegador para ver la plantilla.`);
  process.exit(0);
}

console.log(enviar ? (solo ? `✉️  Enviando SOLO a ${solo}…` : '✉️  Enviando a todos…') : '🔍 DRY-RUN (no se envía nada)…');
const r = await enviarRecordatorios({
  dryRun: !enviar,
  soloEmail: solo || undefined,
  siteUrl: process.env.SITE_URL || undefined,
});

console.log('\n— Resumen —');
console.log(`Partidos en ventana:   ${r.partidosEnVentana}`);
console.log(`Bonos en ventana:      ${r.bonosEnVentana}${r.categoriasBonos?.length ? ` (${r.categoriasBonos.join(', ')})` : ''}`);
console.log(`Usuarios considerados: ${r.usuariosConsiderados}`);
console.log(`Usuarios con faltantes:${r.usuariosFaltantes}`);
console.log(`SMTP configurado:      ${r.smtpConfigurado ? 'sí' : 'NO'}`);
console.log(`Correos enviados:      ${r.correosEnviados}${r.dryRun ? ' (dry-run)' : ''}`);
if (r.detalle.length) {
  console.log('\n— A quién aplica —');
  for (const d of r.detalle)
    console.log(`  • ${d.nombre} <${d.email}> — ${d.partidosFaltantes} marcador(es), ${d.bonosFaltantes} bono(s)`);
}
if (r.errores.length) {
  console.log('\n— Errores —');
  for (const e of r.errores) console.log(`  ✗ ${e}`);
}
console.log('\n✅ Listo.');
