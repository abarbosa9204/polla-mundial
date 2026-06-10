/**
 * Genera los iconos del PWA y la imagen de previsualización (Open Graph) con un
 * balón de fútbol sobre fondo festivo — algo alusivo al Mundial, sin usar marcas
 * ni mascotas oficiales (diseño original). Corre con: node scripts/gen-iconos.mjs
 *
 * Requiere `sharp` (devDependency). Salida en apps/web/public/.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const rad = (d) => (d * Math.PI) / 180;

/** Puntos de un pentágono regular centrado en (cx,cy), radio r, primer vértice arriba + rot. */
function pent(cx, cy, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < 5; i++) {
    const a = rad(-90 + rot + i * 72);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Balón de fútbol (blanco con pentágonos negros) centrado en (cx,cy) radio R. */
function balon(cx, cy, R, id) {
  const negro = '#17171c';
  let edges = '';
  let seams = '';
  for (let k = 0; k < 5; k++) {
    const ang = -54 + k * 72; // entre los vértices del pentágono central
    const ex = cx + R * 0.92 * Math.cos(rad(ang));
    const ey = cy + R * 0.92 * Math.sin(rad(ang));
    edges += `<polygon points="${pent(ex, ey, R * 0.3, ang + 270)}" fill="${negro}"/>`;
    // costura radial desde el borde del pentágono central hacia el pentágono del borde
    const r1 = R * 0.275, r2 = R * 0.62;
    seams += `<line x1="${(cx + r1 * Math.cos(rad(ang))).toFixed(1)}" y1="${(cy + r1 * Math.sin(rad(ang))).toFixed(1)}" x2="${(cx + r2 * Math.cos(rad(ang))).toFixed(1)}" y2="${(cy + r2 * Math.sin(rad(ang))).toFixed(1)}" stroke="${negro}" stroke-width="${(R * 0.05).toFixed(1)}" stroke-linecap="round"/>`;
  }
  return `
    <defs>
      <clipPath id="clip-${id}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
      <radialGradient id="sh-${id}" cx="38%" cy="32%" r="75%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="78%" stop-color="#f3f4f6"/>
        <stop offset="100%" stop-color="#d6d8dd"/>
      </radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R + R * 0.02}" fill="#0008" opacity="0.18"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#sh-${id})"/>
    <g clip-path="url(#clip-${id})">
      <polygon points="${pent(cx, cy, R * 0.34, 0)}" fill="${negro}"/>
      ${edges}
      ${seams}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#c2c5cc" stroke-width="${(R * 0.02).toFixed(1)}"/>`;
}

/** Confeti festivo (puntos de colores) repartido. */
function confeti(w, h, n, id) {
  const cols = ['#ef4444', '#f59e0b', '#3b82f6', '#ffffff', '#a855f7'];
  // posiciones deterministas (sin Math.random) para que el build sea reproducible
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = ((i * 97 + 13) % 100) / 100 * w;
    const y = ((i * 53 + 29) % 100) / 100 * h;
    const r = 3 + ((i * 7) % 5);
    const c = cols[i % cols.length];
    const op = 0.18 + ((i * 11) % 20) / 100;
    s += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r}" fill="${c}" opacity="${op.toFixed(2)}"/>`;
  }
  return s;
}

/** Icono cuadrado. ballScale: fracción del lado para el radio del balón. */
function iconoSVG(size, ballScale) {
  const R = size * ballScale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1bbf5a"/>
        <stop offset="55%" stop-color="#13a14a"/>
        <stop offset="100%" stop-color="#0c7536"/>
      </linearGradient>
      <radialGradient id="glow" cx="32%" cy="24%" r="80%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
        <stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg)"/>
    <rect width="${size}" height="${size}" fill="url(#glow)"/>
    ${confeti(size, size, 22, 'ic')}
    ${balon(size / 2, size / 2, R, 'ic')}
  </svg>`;
}

/** Imagen Open Graph (WhatsApp/redes) 1200x630. */
function ogSVG() {
  const W = 1200, H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1bbf5a"/>
        <stop offset="60%" stop-color="#119247"/>
        <stop offset="100%" stop-color="#0a6e33"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${confeti(W, H, 40, 'og')}
    ${balon(330, 315, 210, 'og')}
    <text x="600" y="250" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="bold" fill="#ffffff">Polla</text>
    <text x="600" y="335" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="bold" fill="#ffffff">Mundialista</text>
    <text x="600" y="430" font-family="Arial, Helvetica, sans-serif" font-size="96" font-weight="bold" fill="#fde047">2026</text>
    <text x="603" y="480" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#eafff1">Pronostica, compite, gana.</text>
  </svg>`;
}

const png = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).flatten({ background: '#0c7536' }).png().toBuffer();

// --- Iconos PWA ---
writeFileSync(join(PUB, 'pwa-192.png'), await png(iconoSVG(192, 0.33), 192));
writeFileSync(join(PUB, 'pwa-512.png'), await png(iconoSVG(512, 0.33), 512));
// Maskable: balón más pequeño para respetar la zona segura (recorte circular).
writeFileSync(join(PUB, 'pwa-512-maskable.png'), await png(iconoSVG(512, 0.28), 512));
writeFileSync(join(PUB, 'apple-touch-icon.png'), await png(iconoSVG(180, 0.33), 180));

// --- Favicon (vector, sin emoji) ---
writeFileSync(join(PUB, 'favicon.svg'), iconoSVG(64, 0.34));

// --- Open Graph (WhatsApp) ---
writeFileSync(
  join(PUB, 'og.png'),
  await sharp(Buffer.from(ogSVG())).resize(1200, 630).flatten({ background: '#0a6e33' }).png().toBuffer(),
);

console.log('Iconos y og.png generados en', PUB);
