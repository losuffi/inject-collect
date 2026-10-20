// 生成 PWA 图标 PNG（与 public/icon.svg 同一图形），不依赖第三方库。
// 用法：node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1c, 0x66, 0x70];
const WHITE = [255, 255, 255];
const DOT = [0xf0, 0xb2, 0x7a];

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** 在 512 坐标系中返回该点颜色 */
function colorAt(x, y) {
  for (const [cx, cy, r] of [[256, 372, 20], [218, 346, 12], [294, 346, 12]]) {
    if (Math.hypot(x - cx, y - cy) <= r) return DOT;
  }
  const lines = [[196, 228, 236, 228], [276, 228, 316, 228], [256, 244, 256, 306], [256, 306, 242, 314]];
  if (lines.some(([a, b, c, d]) => segDist(x, y, a, b, c, d) <= 9)) return WHITE;
  const outer = ((x - 256) / 139) ** 2 + ((y - 262) / 181) ** 2;
  const inner = ((x - 256) / 117) ** 2 + ((y - 262) / 159) ** 2;
  if (outer <= 1 && inner >= 1) return WHITE;
  return BG;
}

function render(size) {
  const ss = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = colorAt(((x + (sx + 0.5) / ss) / size) * 512, ((y + (sy + 0.5) / ss) / size) * 512);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = ss * ss;
      row[1 + x * 3] = Math.round(r / n);
      row[2 + x * 3] = Math.round(g / n);
      row[3 + x * 3] = Math.round(b / n);
    }
    rows.push(row);
  }
  return png(size, size, Buffer.concat(rows));
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), render(size));
  console.log('wrote public/' + name);
}
