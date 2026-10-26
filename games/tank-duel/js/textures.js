/* TANK DUEL — procedural textures (generated once on the device, no downloads) */
import * as THREE from '../vendor/three/three.module.min.js';

function hash(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
/** tileable fBm value noise, values ~0..1 */
export function fbm(size, period, oct, seed, gain = 0.5) {
  const out = new Float32Array(size * size), R = hash(seed);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const f = period << o, lat = new Float32Array(f * f); for (let i = 0; i < lat.length; i++) lat[i] = R();
    for (let y = 0; y < size; y++) {
      const fy = y / size * f, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), r0 = (y0 % f) * f, r1 = ((y0 + 1) % f) * f;
      for (let x = 0; x < size; x++) {
        const fx = x / size * f, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), c0 = x0 % f, c1 = (x0 + 1) % f;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * sx, b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 8; t.needsUpdate = true; return t;
}
function normalFrom(h, size, strength) {
  const cv = canvas(size, size), x = cv.getContext('2d'), d = x.createImageData(size, size), a = d.data;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const l = h[j * size + (i + size - 1) % size], r = h[j * size + (i + 1) % size], u = h[((j + size - 1) % size) * size + i], dn = h[((j + 1) % size) * size + i];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
    const k = (j * size + i) * 4; a[k] = (nx * 0.5 + 0.5) * 255; a[k + 1] = (ny * 0.5 + 0.5) * 255; a[k + 2] = (nz * 0.5 + 0.5) * 255; a[k + 3] = 255;
  }
  x.putImageData(d, 0, 0); return tex(cv, false);
}
const THEMES = {
  desert: { a: [186, 156, 112], b: [146, 116, 82], c: [208, 184, 140], pebble: [110, 92, 70], rough: 0.95, bump: 5 },
  grass: { a: [112, 116, 70], b: [128, 106, 72], c: [92, 104, 58], pebble: [90, 84, 70], rough: 0.95, bump: 5 },
  urban: { a: [104, 104, 106], b: [84, 84, 88], c: [126, 124, 120], pebble: [70, 70, 72], rough: 0.85, bump: 3, slabs: true },
  snow: { a: [228, 234, 242], b: [196, 206, 222], c: [246, 248, 252], pebble: [150, 160, 176], rough: 0.7, bump: 3 },
  mud: { a: [92, 76, 58], b: [64, 52, 40], c: [112, 94, 72], pebble: [58, 50, 42], rough: 0.5, bump: 6 },
};
const groundCache = {};
export function ground(theme) {
  if (groundCache[theme]) return groundCache[theme];
  const T = THEMES[theme] || THEMES.desert, S = 512;
  const n1 = fbm(S, 4, 6, 11), n2 = fbm(S, 16, 3, 23), n3 = fbm(S, 64, 2, 37);
  const h = new Float32Array(S * S);
  const cv = canvas(S, S), x = cv.getContext('2d'), d = x.createImageData(S, S), a = d.data;
  for (let i = 0; i < S * S; i++) {
    const m = Math.min(1, Math.max(0, (n1[i] - 0.35) * 2.2)), g = n2[i], p = n3[i] > 0.72 ? (n3[i] - 0.72) * 3.5 : 0;
    let r = T.a[0] + (T.b[0] - T.a[0]) * m, gg = T.a[1] + (T.b[1] - T.a[1]) * m, b = T.a[2] + (T.b[2] - T.a[2]) * m;
    const hl = (g - 0.5) * 0.5; r += (T.c[0] - r) * Math.max(0, hl) * 1.5 - r * Math.max(0, -hl) * 0.35; gg += (T.c[1] - gg) * Math.max(0, hl) * 1.5 - gg * Math.max(0, -hl) * 0.35; b += (T.c[2] - b) * Math.max(0, hl) * 1.5 - b * Math.max(0, -hl) * 0.35;
    if (p > 0) { const k = Math.min(1, p); r += (T.pebble[0] - r) * k; gg += (T.pebble[1] - gg) * k; b += (T.pebble[2] - b) * k; }
    const gr = (Math.random() - 0.5) * 10; a[i * 4] = r + gr; a[i * 4 + 1] = gg + gr; a[i * 4 + 2] = b + gr; a[i * 4 + 3] = 255;
    h[i] = n1[i] * 0.4 + g * 0.35 + p * 0.8 + n3[i] * 0.15;
  }
  x.putImageData(d, 0, 0);
  if (T.slabs) { // concrete slabs with seams and cracks
    x.strokeStyle = 'rgba(30,30,32,0.55)'; x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * S / 4, 0); x.lineTo(k * S / 4, S); x.stroke(); x.beginPath(); x.moveTo(0, k * S / 4); x.lineTo(S, k * S / 4); x.stroke(); }
    const R = hash(5); x.strokeStyle = 'rgba(40,40,42,0.5)'; x.lineWidth = 1.2;
    for (let c = 0; c < 18; c++) { let px = R() * S, py = R() * S; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 8; s++) { px += (R() - 0.5) * 40; py += (R() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
    for (let k = 0; k <= 4; k++) for (let j = 0; j < S; j++) { h[j * S + Math.min(S - 1, k * S / 4)] -= 0.4; h[Math.min(S - 1, k * S / 4) * S + j] -= 0.4; }
  }
  const map = tex(cv), normal = normalFrom(h, S, T.bump);
  return (groundCache[theme] = { map, normal, rough: T.rough });
}
export function concrete() {
  const S = 256, n = fbm(S, 8, 5, 3), n2 = fbm(S, 32, 2, 9), cv = canvas(S, S), x = cv.getContext('2d'), d = x.createImageData(S, S), a = d.data, h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) { const v = 150 + (n[i] - 0.5) * 70 + (n2[i] - 0.5) * 30 + (Math.random() - 0.5) * 14; const stain = n[i] < 0.38 ? (0.38 - n[i]) * 160 : 0; a[i * 4] = v - stain; a[i * 4 + 1] = v - stain * 0.95; a[i * 4 + 2] = v * 0.97 - stain * 0.9; a[i * 4 + 3] = 255; h[i] = n[i] * 0.5 + n2[i] * 0.5 + (Math.random() < 0.02 ? -0.6 : 0); }
  x.putImageData(d, 0, 0);
  // panel seam + hazard-yellow paint wear along the top edge
  x.fillStyle = 'rgba(40,38,36,0.6)'; x.fillRect(0, 0, S, 3); x.fillRect(0, S - 3, S, 3); x.fillRect(0, 0, 3, S); x.fillRect(S - 3, 0, 3, S);
  return { map: tex(cv), normal: normalFrom(h, S, 4) };
}
export function brick() {
  const S = 256, cv = canvas(S, S), x = cv.getContext('2d'), n = fbm(S, 16, 4, 77), h = new Float32Array(S * S);
  x.fillStyle = '#7d7468'; x.fillRect(0, 0, S, S);
  const rows = 8, bh = S / rows, bw = S / 4, R = hash(9);
  for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
    const ox = (r % 2) * bw / 2, X = c * bw + ox + 2, Y = r * bh + 2, W = bw - 4, H = bh - 4;
    const t = R(); x.fillStyle = `rgb(${150 + t * 50 | 0},${62 + t * 25 | 0},${44 + t * 15 | 0})`; x.fillRect(X, Y, W, H);
    for (let yy = Math.max(0, Y | 0); yy < Math.min(S, Y + H); yy++) for (let xx = Math.max(0, X | 0); xx < Math.min(S, X + W); xx++) h[yy * S + xx] = 0.6 + n[yy * S + xx] * 0.4;
  }
  const d = x.getImageData(0, 0, S, S), a = d.data; for (let i = 0; i < S * S; i++) { const k = (n[i] - 0.5) * 50; a[i * 4] += k; a[i * 4 + 1] += k * 0.8; a[i * 4 + 2] += k * 0.7; }
  x.putImageData(d, 0, 0);
  return { map: tex(cv), normal: normalFrom(h, S, 6) };
}
export function steel() {
  const S = 256, cv = canvas(S, S), x = cv.getContext('2d'), n = fbm(S, 8, 4, 41), h = new Float32Array(S * S);
  const d = x.createImageData(S, S), a = d.data;
  for (let i = 0; i < S * S; i++) { const v = 92 + (n[i] - 0.5) * 50; a[i * 4] = v; a[i * 4 + 1] = v * 1.02; a[i * 4 + 2] = v * 1.08; a[i * 4 + 3] = 255; h[i] = n[i] * 0.3; }
  x.putImageData(d, 0, 0);
  // hazard stripes band
  x.save(); x.beginPath(); x.rect(0, S * 0.38, S, S * 0.24); x.clip();
  for (let k = -S; k < S * 2; k += 40) { x.fillStyle = '#e8b622'; x.beginPath(); x.moveTo(k, S * 0.38); x.lineTo(k + 20, S * 0.38); x.lineTo(k + 20 - S * 0.24, S * 0.62); x.lineTo(k - S * 0.24, S * 0.62); x.fill(); }
  x.restore(); x.fillStyle = '#1a1a1a'; x.globalAlpha = 0.5;
  for (let k = 0; k < 8; k++) for (const yy of [16, S - 16]) { x.beginPath(); x.arc(16 + k * (S - 32) / 7, yy, 5, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  return { map: tex(cv), normal: normalFrom(h, S, 2) };
}
export function camo(team) {
  const S = 256, cv = canvas(S, S), x = cv.getContext('2d');
  const P = team === 0 ? ['#56663a', '#3c4a29', '#7b7a4c', '#2b3420'] : ['#b8894f', '#8d5f34', '#d4b07a', '#5e3f24'];
  x.fillStyle = P[0]; x.fillRect(0, 0, S, S);
  const R = hash(team ? 77 : 31);
  for (let k = 1; k < 4; k++) for (let i = 0; i < 9; i++) {
    x.fillStyle = P[k]; const cx = R() * S, cy = R() * S, r = 18 + R() * 30;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.beginPath(); for (let t = 0; t < 10; t++) { const ang = t / 10 * 6.283, rr = r * (0.6 + R() * 0.6); x.lineTo(cx + ox + Math.cos(ang) * rr, cy + oy + Math.sin(ang) * rr * 0.7); } x.fill(); }
  }
  const n = fbm(S, 16, 3, 5 + team), d = x.getImageData(0, 0, S, S), a = d.data; for (let i = 0; i < S * S; i++) { const k = (n[i] - 0.5) * 36; a[i * 4] += k; a[i * 4 + 1] += k; a[i * 4 + 2] += k; }
  x.putImageData(d, 0, 0);
  return tex(cv);
}
export function panelNormal() {
  const S = 128, h = fbm(S, 8, 3, 99); for (let i = 0; i < S * S; i++) h[i] *= 0.3;
  for (let i = 0; i < S; i++) { h[i * S + 64] -= 0.5; h[64 * S + i] -= 0.5; }
  return normalFrom(h, S, 3);
}
export function tread() {
  const W = 256, H = 64, cv = canvas(W, H), x = cv.getContext('2d');
  x.fillStyle = '#26241f'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) { const X = i * W / 16; const g = x.createLinearGradient(X, 0, X + W / 16, 0); g.addColorStop(0, '#15140f'); g.addColorStop(0.25, '#4a463c'); g.addColorStop(0.55, '#3a372f'); g.addColorStop(1, '#15140f'); x.fillStyle = g; x.fillRect(X + 1, 4, W / 16 - 2, H - 8); x.fillStyle = '#5a564b'; x.fillRect(X + 4, H / 2 - 3, W / 16 - 8, 6); }
  const t = tex(cv); t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
export function smoke() {
  const S = 128, cv = canvas(S, S), x = cv.getContext('2d'); const R = hash(7);
  for (let i = 0; i < 46; i++) { const r = 10 + R() * 24, an = R() * 6.283, dd = R() * (S * 0.3 - r * 0.4); const cx = S / 2 + Math.cos(an) * dd, cy = S / 2 + Math.sin(an) * dd;
    const g = x.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy, r); const v = 150 + R() * 105; g.addColorStop(0, `rgba(${v},${v},${v},0.32)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  const d = x.getImageData(0, 0, S, S), a = d.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = (j * S + i) * 4, dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2), fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)); const v = a[k] / 255;
    a[k + 3] = Math.min(255, 255 * Math.min(1, v * 2.2) * Math.pow(fall, 0.6)); a[k] = Math.min(255, 90 + v * 190 * (1 - dy * 0.3)); a[k + 1] = a[k + 2] = a[k]; }
  x.putImageData(d, 0, 0); return tex(cv, false, false);
}
export function glow() {
  const S = 64, cv = canvas(S, S), x = cv.getContext('2d'); const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.8)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S); return tex(cv, false, false);
}
export function ring() {
  const S = 128, cv = canvas(S, S), x = cv.getContext('2d'); const g = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S); return tex(cv, false, false);
}
export function chevron(color) {
  const S = 64, cv = canvas(S, S), x = cv.getContext('2d'); x.fillStyle = color; x.beginPath(); x.moveTo(54, 32); x.lineTo(18, 10); x.lineTo(26, 32); x.lineTo(18, 54); x.closePath(); x.fill(); return tex(cv, true, false);
}
export function puIcon(type) {
  const S = 128, cv = canvas(S, S), x = cv.getContext('2d');
  const col = { shield: '#5ad8ff', triple: '#ff6a5a', mines: '#ffd23a', speed: '#7dff6a', mega: '#d07bff' }[type] || '#fff';
  x.fillStyle = 'rgba(0,0,0,0.55)'; x.beginPath(); x.arc(64, 64, 58, 0, 7); x.fill();
  x.strokeStyle = col; x.lineWidth = 7; x.beginPath(); x.arc(64, 64, 54, 0, 7); x.stroke();
  x.fillStyle = col; x.strokeStyle = col; x.lineWidth = 8; x.lineJoin = 'round'; x.lineCap = 'round';
  if (type === 'shield') { x.beginPath(); x.moveTo(64, 28); x.lineTo(94, 40); x.quadraticCurveTo(92, 82, 64, 100); x.quadraticCurveTo(36, 82, 34, 40); x.closePath(); x.fill(); }
  if (type === 'triple') for (const an of [-0.35, 0, 0.35]) { x.save(); x.translate(64, 96); x.rotate(an); x.fillRect(-5, -62, 10, 40); x.beginPath(); x.moveTo(-9, -62); x.lineTo(0, -74); x.lineTo(9, -62); x.fill(); x.restore(); }
  if (type === 'mines') { x.beginPath(); x.arc(64, 66, 22, 0, 7); x.fill(); for (let k = 0; k < 8; k++) { const an = k * Math.PI / 4; x.beginPath(); x.moveTo(64 + Math.cos(an) * 20, 66 + Math.sin(an) * 20); x.lineTo(64 + Math.cos(an) * 34, 66 + Math.sin(an) * 34); x.stroke(); } }
  if (type === 'speed') { for (const o of [-18, 8]) { x.beginPath(); x.moveTo(44 + o, 36); x.lineTo(74 + o, 64); x.lineTo(44 + o, 92); x.stroke(); } }
  if (type === 'mega') { x.beginPath(); x.arc(64, 64, 26, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(56, 56, 8, 0, 7); x.fill(); }
  return tex(cv, true, false);
}
export function hillTex() {
  const S = 256, cv = canvas(S, S), x = cv.getContext('2d'); x.strokeStyle = '#fff'; x.lineWidth = 6; x.setLineDash([18, 12]); x.beginPath(); x.arc(128, 128, 120, 0, 7); x.stroke(); x.setLineDash([]);
  x.lineWidth = 2; x.globalAlpha = 0.5; x.beginPath(); x.arc(128, 128, 100, 0, 7); x.stroke(); x.font = 'bold 40px Helvetica, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.globalAlpha = 0.35; x.fillStyle = '#fff'; x.fillText('HILL', 128, 128);
  return tex(cv, true, false);
}
