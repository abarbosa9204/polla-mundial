// Genera iconos PNG de marca (sin dependencias) para la PWA.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', 'public');
mkdirSync(pub, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png(size, [r, g, b], circle) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2, cy = size / 2, rad = size * 0.32;
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const inCircle = circle && (x - cx) ** 2 + (y - cy) ** 2 < rad ** 2;
      if (inCircle) {
        raw[o++] = 255; raw[o++] = 255; raw[o++] = 255; raw[o++] = 255;
      } else {
        raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = 255;
      }
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const brand = [22, 163, 74];
writeFileSync(join(pub, 'pwa-192.png'), png(192, brand, true));
writeFileSync(join(pub, 'pwa-512.png'), png(512, brand, true));
writeFileSync(join(pub, 'apple-touch-icon.png'), png(180, brand, true));

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#16a34a"/><text x="16" y="22" font-size="18" text-anchor="middle">🏆</text></svg>`;
writeFileSync(join(pub, 'favicon.svg'), favicon);

console.log('Iconos generados en', pub);
