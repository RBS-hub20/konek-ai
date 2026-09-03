/* Generates KONEK AI brand assets (PNG + SVG) from vector geometry.
   Reproduces the official mark: minimal K (bar + chevron) with a dot-terminated
   connection stroke, plus the KONEK AI wordmark. No external dependencies. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG encoder ---------------- */
const CRC_T = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

/* ---------------- signed distance primitives ---------------- */
const capsule = (ax, ay, bx, by, r) => (x, y) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay || 1)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
};
const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ring = (cx, cy, r, hw) => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - hw;
const union = (...fs_) => (x, y) => { let d = Infinity; for (const f of fs_) d = Math.min(d, f(x, y)); return d; };

/* ---------------- the mark ----------------
   Local space: 105 x 98, stroke 7.4 (round caps). Derived from the source lockup. */
const SW = 7.4, HW = SW / 2;
const MARK_W = 105, MARK_H = 98;
const markSDF = union(
  capsule(5, 5.1, 5, 92.9, HW),            // vertical stem
  capsule(72.3, 5.1, 29.7, 49, HW),        // chevron upper
  capsule(29.7, 49, 72.3, 92.9, HW),       // chevron lower
  capsule(29.7, 49, 96.7, 49, HW),         // connection stroke
  disc(96.7, 49, 8.3)                      // terminal dot
);

/* ---------------- the wordmark ----------------
   Geometric caps, cap-height 100, stroke 18, wide tracking. */
const T = 8.5;            // stroke half-width
const glyphs = {
  K: { w: 62, sdf: union(capsule(9, 0, 9, 100, T), capsule(61, 0, 13, 52, T), capsule(25, 41, 61, 100, T)) },
  O: { w: 100, sdf: ring(50, 50, 41.5, T) },
  N: { w: 76, sdf: union(capsule(9, 0, 9, 100, T), capsule(67, 0, 67, 100, T), capsule(9, 0, 67, 100, T)) },
  E: { w: 60, sdf: union(capsule(9, 0, 9, 100, T), capsule(9, 8.5, 54, 8.5, T), capsule(9, 50, 48, 50, T), capsule(9, 91.5, 54, 91.5, T)) },
  A: { w: 72, sdf: union(capsule(9, 100, 36, 0, T), capsule(36, 0, 63, 100, T), capsule(21, 66, 51, 66, T)) },
  I: { w: 18, sdf: capsule(9, 0, 9, 100, T) },
  ' ': { w: 40, sdf: () => Infinity },
};
function wordmark(text, tracking = 36) {
  const parts = []; let x = 0;
  for (const ch of text) {
    const g = glyphs[ch]; if (!g) continue;
    const dx = x, s = g.sdf;
    parts.push((px, py) => s(px - dx, py));
    x += g.w + tracking;
  }
  return { w: x - tracking, h: 100, sdf: union(...parts) };
}
const WORD = wordmark('KONEK AI');

/* ---------------- renderer ---------------- */
function render(file, W, H, items, rgb) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5, py = y + 0.5;
      let cov = 0;
      for (const it of items) {
        const d = it.sdf((px - it.tx) / it.s, (py - it.ty) / it.s) * it.s;
        cov = Math.max(cov, Math.min(1, Math.max(0, 0.5 - d)));
      }
      const i = (y * W + x) * 4;
      buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2];
      buf[i + 3] = Math.round(cov * 255);
    }
  }
  writePNG(file, W, H, buf);
  console.log('  ✓', path.relative(process.cwd(), file), `${W}x${H}`);
}

const BLACK = [15, 15, 15], WHITE = [255, 255, 255];
const out = (p) => path.join(process.cwd(), p);

/* mark only — square, padded */
function markOnly(file, size, rgb) {
  const pad = size * 0.11, avail = size - pad * 2;
  const s = Math.min(avail / MARK_W, avail / MARK_H);
  render(file, size, size, [{ sdf: markSDF, s, tx: (size - MARK_W * s) / 2, ty: (size - MARK_H * s) / 2 }], rgb);
}

/* full lockup — mark stacked over wordmark, matching the source composition */
function lockup(file, W, rgb) {
  const ms = (W * 0.30) / MARK_W;                 // mark scale
  const ws = (W * 0.58) / WORD.w;                 // wordmark scale
  const mh = MARK_H * ms, wh = WORD.h * ws;
  const gap = W * 0.10, padY = W * 0.06;
  const H = Math.round(padY * 2 + mh + gap + wh);
  render(file, W, H, [
    { sdf: markSDF, s: ms, tx: (W - MARK_W * ms) / 2, ty: padY },
    { sdf: WORD.sdf, s: ws, tx: (W - WORD.w * ws) / 2, ty: padY + mh + gap },
  ], rgb);
}

fs.mkdirSync(out('public'), { recursive: true });
fs.mkdirSync(out('app'), { recursive: true });

console.log('KONEK AI — generating brand assets');
lockup(out('public/logo.png'), 1024, BLACK);
lockup(out('public/logo-white.png'), 1024, WHITE);
markOnly(out('public/logo-mark.png'), 512, BLACK);
markOnly(out('public/logo-mark-white.png'), 512, WHITE);
markOnly(out('app/icon.png'), 512, BLACK);
markOnly(out('public/apple-icon.png'), 180, BLACK);

/* ---------------- SVG (crisp, currentColor-aware) ---------------- */
const markSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105 98" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 5.1V92.9"/>
  <path d="M72.3 5.1 29.7 49l42.6 43.9"/>
  <path d="M29.7 49h67"/>
  <circle cx="96.7" cy="49" r="8.3" fill="currentColor" stroke="none"/>
</svg>
`;
fs.writeFileSync(out('public/logo-mark.svg'), markSVG);
console.log('  ✓ public/logo-mark.svg');
