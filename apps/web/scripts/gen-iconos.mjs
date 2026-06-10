/**
 * Genera los iconos del PWA y la imagen de previsualización (Open Graph) con el
 * emblema del Mundial 2026: "26" blanco + el trofeo dorado, sobre fondo verde
 * festivo. El trofeo está en apps/web/assets/trofeo.png (recortado, con alfa).
 * Corre con: node scripts/gen-iconos.mjs   (requiere sharp solo para regenerar).
 * Salida en apps/web/public/.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = dirname(fileURLToPath(import.meta.url));
const PUB = join(DIR, '..', 'public');
const TROFEO = join(DIR, '..', 'assets', 'trofeo.png');
const tMeta = await sharp(TROFEO).metadata();
const aspecto = tMeta.width / tMeta.height;

/** Confeti festivo determinista (sin Math.random ⇒ build reproducible). */
function confeti(w, h, n) {
  const cols = ['#ef4444', '#f59e0b', '#3b82f6', '#ffffff', '#a855f7'];
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = (((i * 97 + 13) % 100) / 100) * w;
    const y = (((i * 53 + 29) % 100) / 100) * h;
    const r = 3 + ((i * 7) % 5);
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="${cols[i % cols.length]}" opacity="${(0.16 + ((i * 11) % 18) / 100).toFixed(2)}"/>`;
  }
  return s;
}

function fondo(w, h, n) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1bbf5a"/><stop offset="55%" stop-color="#13a14a"/><stop offset="100%" stop-color="#0c7536"/>
      </linearGradient>
      <radialGradient id="glow" cx="32%" cy="22%" r="80%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/><stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#glow)"/>
    ${confeti(w, h, n)}</svg>`;
}

const texto26 = (S) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
    <text x="${S / 2}" y="${S * 0.685}" font-family="Arial, sans-serif" font-size="${S * 0.586}" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="${S * 0.02}">26</text>
  </svg>`;

/** Icono cuadrado: fondo + "26" + trofeo centrado. trofeoH = fracción del lado. */
async function icono(S, trofeoH) {
  const th = Math.round(S * trofeoH);
  const tw = Math.round(th * aspecto);
  const trofeo = await sharp(TROFEO).resize(tw, th).png().toBuffer();
  return sharp(Buffer.from(fondo(S, S, Math.round(S / 23))))
    .composite([
      { input: Buffer.from(texto26(S)) },
      { input: trofeo, left: Math.round(S / 2 - tw / 2), top: Math.round(S / 2 - th / 2 + S * 0.02) },
    ])
    .flatten({ background: '#0c7536' })
    .png()
    .toBuffer();
}

async function og() {
  const W = 1200, H = 630;
  const th = 470, tw = Math.round(th * aspecto);
  const trofeo = await sharp(TROFEO).resize(tw, th).png().toBuffer();
  const txt = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <text x="560" y="250" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="bold" fill="#ffffff">Polla</text>
    <text x="560" y="345" font-family="Arial, Helvetica, sans-serif" font-size="82" font-weight="bold" fill="#ffffff">Mundialista</text>
    <text x="560" y="445" font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="bold" fill="#fde047">2026</text>
    <text x="563" y="495" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#eafff1">Pronostica, compite, gana.</text>
  </svg>`;
  return sharp(Buffer.from(fondo(W, H, 42)))
    .composite([
      { input: trofeo, left: Math.round(300 - tw / 2), top: Math.round((H - th) / 2) },
      { input: Buffer.from(txt) },
    ])
    .flatten({ background: '#0a6e33' })
    .png()
    .toBuffer();
}

const { writeFileSync } = await import('node:fs');
writeFileSync(join(PUB, 'pwa-192.png'), await icono(192, 0.66));
writeFileSync(join(PUB, 'pwa-512.png'), await icono(512, 0.66));
writeFileSync(join(PUB, 'pwa-512-maskable.png'), await icono(512, 0.56)); // zona segura
writeFileSync(join(PUB, 'apple-touch-icon.png'), await icono(180, 0.66));
writeFileSync(join(PUB, 'favicon.png'), await icono(64, 0.66));
writeFileSync(join(PUB, 'og.png'), await og());
console.log('Iconos (emblema 2026) y og.png generados en', PUB);
