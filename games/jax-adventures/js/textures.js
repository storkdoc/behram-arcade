// Jax's Adventures - procedural textures (all generated at runtime; no image assets)
import * as THREE from '../vendor/three/three.module.min.js';
import { tfbm, tnoise, mulberry32, clamp } from './util.js';

let maxAniso = 4;
export function setAniso(a) { maxAniso = a; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
}
// fill a canvas per-pixel with fn(u,v) -> [r,g,b,a]
function pix(w, h, fn) {
  const c = canvas(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; const r = fn(x, y); d[o] = r[0]; d[o + 1] = r[1]; d[o + 2] = r[2]; d[o + 3] = r[3] === undefined ? 255 : r[3]; }
  g.putImageData(im, 0, 0); return c;
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

export const grassTex = () => once('grass', () => tex(pix(512, 512, (x, y) => {
  const u = x / 512, v = y / 512; const n = tfbm(u * 8, v * 8, 8, 5), m = tfbm(u * 3 + 5, v * 3, 3, 3), s = tnoise(u * 160, v * 40, 160);
  let c = mix([62, 92, 34], [104, 132, 52], clamp(0.5 + n * 0.9, 0, 1)); c = mix(c, [128, 122, 64], clamp(m * 1.4 - 0.25, 0, 0.45));
  const k = 0.88 + s * 0.12; return [c[0] * k, c[1] * k, c[2] * k];
})));
export const dirtTex = () => once('dirt', () => {
  const r = mulberry32(5); const c = pix(512, 512, (x, y) => { const u = x / 512, v = y / 512; const n = tfbm(u * 10, v * 10, 10, 5), m = tfbm(u * 40, v * 40, 40, 2); const c = mix([92, 70, 48], [136, 108, 76], clamp(0.5 + n, 0, 1)); const k = 0.9 + m * 0.12; return [c[0] * k, c[1] * k, c[2] * k]; });
  const g = c.getContext('2d'); for (let i = 0; i < 900; i++) { const x = r() * 512, y = r() * 512, s = 1 + r() * 3.5, l = 90 + r() * 80; g.fillStyle = `rgba(${l},${l * 0.9},${l * 0.78},0.85)`; g.beginPath(); g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(30,22,14,0.35)'; g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.4, s, s * 0.5, 0, 0, 7); g.fill(); }
  return tex(c);
});
export const sandTex = () => once('sand', () => tex(pix(512, 512, (x, y) => {
  const u = x / 512, v = y / 512; const n = tfbm(u * 6, v * 6, 6, 4), g = tnoise(u * 256, v * 256, 256), rip = Math.sin((v * 22 + tfbm(u * 4, v * 4, 4, 2) * 2.5) * Math.PI * 2) * 0.5 + 0.5;
  const c = mix([196, 176, 136], [226, 208, 166], clamp(0.5 + n * 0.8, 0, 1)); const k = 0.92 + g * 0.08 + rip * 0.05; return [c[0] * k, c[1] * k, c[2] * k];
})));
export const rockTex = () => once('rock', () => tex(pix(512, 512, (x, y) => {
  const u = x / 512, v = y / 512; const n = tfbm(u * 6, v * 6, 6, 6); const rd = 1 - Math.abs(tfbm(u * 5 + 3, v * 5, 5, 4)); const cr = Math.pow(rd, 10);
  const lic = clamp(tfbm(u * 4 + 9, v * 4 + 2, 4, 3) * 2, 0, 1);
  let c = mix([96, 94, 90], [150, 146, 138], clamp(0.5 + n, 0, 1)); c = mix(c, [104, 112, 78], lic * 0.35); const k = 1 - cr * 0.55; return [c[0] * k, c[1] * k, c[2] * k];
})));
export const snowTex = () => once('snow', () => tex(pix(256, 256, (x, y) => { const u = x / 256, v = y / 256; const n = tfbm(u * 6, v * 6, 6, 4); const s = 236 + n * 14; return [s - 6, s, s + 8]; })));
export const barkTex = (pine) => once('bark' + pine, () => tex(pix(256, 512, (x, y) => {
  const u = x / 256, v = y / 512; const n = tfbm(u * 12, v * 3, 12, 4), f = Math.abs(tnoise(u * 24, v * 4, 24));
  const base = pine ? [88, 58, 40] : [96, 84, 70]; const k = 0.62 + 0.38 * (1 - Math.pow(f, 0.5)) + n * 0.1; return [base[0] * k, base[1] * k, base[2] * k];
})));
export const plankTex = (tint = [150, 112, 74], boards = 8) => once('plank' + tint + boards, () => {
  const c = pix(512, 512, (x, y) => {
    const u = x / 512, v = y / 512; const b = Math.floor(v * boards), bv = v * boards - b; const off = (b * 0.37) % 1;
    const grain = tfbm(u * 2 + off * 7, v * boards * 6, 2, 4); const seam = bv < 0.04 || bv > 0.96 ? 0.45 : 1; const endc = ((u + off) % 0.5) < 0.006 ? 0.6 : 1;
    const t = 0.82 + grain * 0.22 + ((b * 7919) % 11) / 60; return [tint[0] * t * seam * endc, tint[1] * t * seam * endc, tint[2] * t * seam * endc];
  }); return tex(c);
});
export const logTex = () => once('log', () => tex(pix(512, 512, (x, y) => {
  const u = x / 512, v = y / 512; const L = 10, b = v * L % 1; const shade = 0.55 + 0.45 * Math.sin(b * Math.PI); const g = tfbm(u * 3, v * L * 4, 3, 4);
  const k = shade * (0.85 + g * 0.2); return [132 * k, 92 * k, 58 * k];
})));
export const shingleTex = (col = [92, 60, 48]) => once('shingle' + col, () => tex(pix(256, 256, (x, y) => {
  const u = x / 256, v = y / 256; const row = Math.floor(v * 8), rv = v * 8 % 1; const off = row % 2 ? 0.0625 : 0; const cu = (u + off) * 8 % 1;
  const edge = (rv > 0.9 ? 0.6 : 1) * (cu < 0.05 ? 0.7 : 1); const n = tfbm(u * 8, v * 8, 8, 3); const k = edge * (0.85 + n * 0.2 + ((Math.floor((u + off) * 8) * 13 + row * 7) % 5) / 30);
  return [col[0] * k, col[1] * k, col[2] * k];
})));
export const sidingTex = (col) => once('siding' + col, () => tex(pix(256, 256, (x, y) => { const v = y / 256, u = x / 256; const b = v * 10 % 1; const k = (b > 0.88 ? 0.72 : 1) * (0.93 + tfbm(u * 2, v * 20, 2, 3) * 0.1); return [col[0] * k, col[1] * k, col[2] * k]; })));
export const fabricTex = () => once('fabric', () => tex(pix(128, 128, (x, y) => { const k = 0.9 + ((x + y) % 4 < 2 ? 0.06 : 0) + tnoise(x / 4, y / 4, 32) * 0.04; return [255 * k, 255 * k, 255 * k]; })));

// leaf cards (alpha): pine needle sprays / broadleaf clusters
export const pineCard = () => once('pinecard', () => {
  const c = canvas(256, 256), g = c.getContext('2d'); const r = mulberry32(11);
  for (let k = 0; k < 5; k++) {
    const bx = 40 + r() * 176, by = 30 + r() * 40, ang = Math.PI / 2 + (r() - 0.5) * 0.7, len = 150 + r() * 60;
    g.strokeStyle = 'rgb(70,50,34)'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len); g.stroke();
    for (let i = 0; i < 70; i++) { const t = i / 70, px = bx + Math.cos(ang) * len * t, py = by + Math.sin(ang) * len * t; const L = 30 * (1 - t * 0.5);
      for (const s of [-1, 1]) { const a = ang + s * (0.9 + r() * 0.3); const l = 30 + r() * 30, gg = 70 + r() * 50; g.strokeStyle = `rgb(${24 + r() * 20},${gg},${34 + r() * 20})`; g.lineWidth = 1.8; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); g.stroke(); } }
  }
  const t = tex(c, true, false); t.premultiplyAlpha = false; return t;
});
export const leafCard = () => once('leafcard', () => {
  const c = canvas(256, 256), g = c.getContext('2d'); const r = mulberry32(17);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 96; const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d; const s = 14 + r() * 10, ro = r() * 6.28;
    const l = 0.7 + r() * 0.5; g.fillStyle = `rgb(${(56 + r() * 30) * l | 0},${(104 + r() * 40) * l | 0},${(34 + r() * 16) * l | 0})`;
    g.save(); g.translate(x, y); g.rotate(ro); g.beginPath(); g.moveTo(0, -s); g.quadraticCurveTo(s * 0.7, 0, 0, s); g.quadraticCurveTo(-s * 0.7, 0, 0, -s); g.fill();
    g.strokeStyle = 'rgba(30,50,20,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke(); g.restore();
  }
  return tex(c, true, false);
});
// tileable water normal map
export const waterNormal = () => once('wn', () => {
  const N = 256, h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = tfbm(x / N * 8, y / N * 8, 8, 5) + 0.5 * tfbm(x / N * 16 + 3, y / N * 16, 16, 3);
  const c = pix(N, N, (x, y) => { const L = h[y * N + ((x - 1 + N) % N)], R = h[y * N + ((x + 1) % N)], D = h[((y - 1 + N) % N) * N + x], U = h[((y + 1) % N) * N + x];
    let nx = (L - R) * 6, ny = (D - U) * 6, nz = 1; const l = Math.hypot(nx, ny, nz); return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255]; });
  return tex(c, false);
});
// text sign texture
export function signTex(lines, o = {}) {
  const w = o.w || 1024, h = o.h || 256; const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = o.bg || '#5a3a22'; g.fillRect(0, 0, w, h);
  if (o.wood !== false) { for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3); } }
  g.strokeStyle = o.border || '#e8d8a8'; g.lineWidth = h * 0.04; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
  g.fillStyle = o.fg || '#f4e8c4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length; const fs = Math.min(h * 0.62 / n, (o.fs || 1) * h * 0.5);
  g.font = `900 ${fs}px Georgia, 'Times New Roman', serif`;
  lines.forEach((l, i) => { let f = fs; g.font = `900 ${f}px Georgia, serif`; while (g.measureText(l).width > w * 0.9 && f > 8) { f -= 2; g.font = `900 ${f}px Georgia, serif`; } g.fillText(l, w / 2, h * (i + 0.5) / n + h * 0.02); });
  const t = tex(c, true, false); return t;
}
export function radialTex(stops = [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']], n = 128) { const c = canvas(n, n), g = c.getContext('2d'); const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); for (const [o, s] of stops) gr.addColorStop(o, s); g.fillStyle = gr; g.fillRect(0, 0, n, n); return tex(c, true, false); }
export const flameTex = () => once('flame', () => { const c = canvas(128, 256), g = c.getContext('2d'); const gr = g.createRadialGradient(64, 190, 4, 64, 160, 110); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,80,0.95)'); gr.addColorStop(0.55, 'rgba(255,110,20,0.6)'); gr.addColorStop(1, 'rgba(200,40,0,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(64, 10); g.bezierCurveTo(120, 120, 124, 200, 64, 250); g.bezierCurveTo(4, 200, 8, 120, 64, 10); g.fill(); return tex(c, true, false); });
export const footTex = () => once('foot', () => { const c = canvas(64, 128), g = c.getContext('2d'); g.fillStyle = 'rgba(40,28,18,0.9)'; g.beginPath(); g.ellipse(32, 44, 18, 30, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(32, 100, 14, 18, 0, 0, 7); g.fill(); return tex(c, true, false); });
