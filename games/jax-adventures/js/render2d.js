// Jax's Adventures - lightweight top-down 2D fallback renderer (?gl=0 or no WebGL)
import * as S from './sim.js';
import * as W from './world.js';
import { clamp, lerp } from './util.js';

export class Renderer2D {
  constructor(canvas, opt = {}) { this.c = canvas; this.g = canvas.getContext('2d'); this.q = 1; this.ok = false; this.view = { init: false, idle: 0, yaw: -Math.PI / 2 }; this.fps = { val: 60 }; this.noAdapt = true; this.zoom = 15; this.w = 1; this.h = 1; this.dpr = 1; this.fx = []; this.t = 0; }
  async init(progress = () => { }) {
    const E = this.E = 165, N = 330, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const im = g.createImageData(N, N), d = im.data;
    for (let j = 0; j < N; j++) { for (let i = 0; i < N; i++) { const x = -E + (i + 0.5) / N * 2 * E, z = -E + (j + 0.5) / N * 2 * E, h = W.H(x, z); let r, gg, b;
        if (h < -0.25 && W.waterRegion(x, z)) { const k = clamp(-h / 5, 0, 1); r = lerp(100, 30, k); gg = lerp(175, 95, k); b = lerp(200, 150, k); }
        else { const sh = clamp((W.H(x + 1, z - 1) - h) * 0.25, -0.3, 0.3); if (h > W.SNOW_Y) { r = 235; gg = 238; b = 242; } else if (h > 14) { const k = clamp((h - 14) / 20, 0, 1); r = lerp(105, 150, k); gg = lerp(118, 140, k); b = lerp(82, 125, k); } else if (h < 0.6) { r = 214; gg = 196; b = 150; } else { r = 96 + h * 2; gg = 142 + h; b = 70; }
          if (W.roadDist(x, z) < 2.6) { r = 190; gg = 170; b = 128; } else if (W.trailDist(x, z) < 1.3) { r = 165; gg = 135; b = 92; } r *= 1 - sh; gg *= 1 - sh; b *= 1 - sh; }
        if (W.deckAt(x, z)) { r = 150; gg = 106; b = 64; } const o = (j * N + i) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255; }
      if (j % 30 === 0) { progress(j / N * 0.9, 'Sketching the park…'); await new Promise(r => setTimeout(r, 0)); } }
    g.putImageData(im, 0, 0); this.map = c; progress(1); this.ok = true;
  }
  resize(w, h, dpr) { this.w = w; this.h = h; this.dpr = dpr; this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr); this.c.style.width = w + 'px'; this.c.style.height = h + 'px'; }
  setQuality(q) { this.q = clamp(q, 0, 3); }
  orbit(dyaw, dpitch, zoom) { this.zoom = clamp(this.zoom / (zoom || 1), 4, 20); }
  camYaw() { return -Math.PI / 2; }
  w2s(x, z) { const p = S.G.p; return [this.w / 2 + (x - p.x) * this.zoom, this.h / 2 + (z - p.z) * this.zoom]; }
  project(x, y, z) { const [sx, sy] = this.w2s(x, z); return { x: sx, y: sy - y * this.zoom * 0.35 - 6 }; }
  events(list) { for (const e of list) if (e.t === 'splash' || e.t === 'ripple') this.fx.push({ x: e.x, z: e.z, t: 0 }); }
  render(dt) {
    if (!this.ok) return; this.t += dt; const G = S.G, g = this.g, p = G.p, Z = this.zoom; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.fillStyle = '#5a7a4a'; g.fillRect(0, 0, this.w, this.h);
    const E = this.E; const [mx, my] = this.w2s(-E, -E); g.imageSmoothingEnabled = true; g.drawImage(this.map, mx, my, 2 * E * Z, 2 * E * Z);
    const vis = (x, z, r = 4) => { const [sx, sy] = this.w2s(x, z); return sx > -r * Z && sx < this.w + r * Z && sy > -r * Z && sy < this.h + r * Z; };
    const circ = (x, z, r, col, st) => { const [sx, sy] = this.w2s(x, z); g.beginPath(); g.arc(sx, sy, Math.max(1, r * Z), 0, 7); g.fillStyle = col; g.fill(); if (st) { g.strokeStyle = st; g.lineWidth = 1.5; g.stroke(); } };
    for (const b of W.BUSHES) if (vis(b.x, b.z)) circ(b.x, b.z, 0.9 * (b.s || 1), '#3f7a34');
    for (const r of W.ROCKS) if (vis(r.x, r.z)) circ(r.x, r.z, 0.7 * (r.s || 1), '#8a8a84');
    for (const pr of W.PROPS || []) if (pr.w && pr.d && vis(pr.x, pr.z, 8)) { const [sx, sy] = this.w2s(pr.x, pr.z); g.save(); g.translate(sx, sy); g.rotate(-(pr.rot || 0)); g.fillStyle = '#8a6a48'; g.fillRect(-pr.w / 2 * Z, -pr.d / 2 * Z, pr.w * Z, pr.d * Z); g.restore(); }
    for (const b of W.COLS) if (b.k === 'b' && b.h >= 1.5 && vis(b.x, b.z, 10)) { const [sx, sy] = this.w2s(b.x, b.z); g.save(); g.translate(sx, sy); g.transform(b.c, b.s, -b.s, b.c, 0, 0); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-b.hw * Z + 4, -b.hd * Z + 4, 2 * b.hw * Z, 2 * b.hd * Z); g.fillStyle = b.h > 2.6 ? '#7a4a32' : '#4a5a6a'; g.fillRect(-b.hw * Z, -b.hd * Z, 2 * b.hw * Z, 2 * b.hd * Z); g.strokeStyle = '#2a1a10'; g.lineWidth = 2; g.strokeRect(-b.hw * Z, -b.hd * Z, 2 * b.hw * Z, 2 * b.hd * Z); g.restore(); }
    for (const a of W.ACORNS) if (!G.acorns[a.id] && vis(a.x, a.z)) circ(a.x, a.z, 0.35 + 0.08 * Math.sin(this.t * 4), '#ffd23a', '#7a5a10');
    // vision cones
    for (const n of G.npcs) { if (n.visible === false || !(n.kind === 'ranger' || n.kind === 'camper') || !vis(n.x, n.z, 20)) continue; const range = n.kind === 'ranger' ? 14 : 8, half = n.kind === 'ranger' ? 0.6 : 0.75; const [sx, sy] = this.w2s(n.x, n.z);
      g.beginPath(); g.moveTo(sx, sy); g.arc(sx, sy, range * Z, n.rot - half, n.rot + half); g.closePath(); g.fillStyle = n.state === 'chase' || n.alert === '!' ? 'rgba(255,60,40,0.22)' : (n.aware > 0.05 ? 'rgba(255,200,40,0.2)' : 'rgba(255,255,220,0.13)'); g.fill(); }
    for (const t of W.TREES) if (vis(t.x, t.z, 6)) { circ(t.x + 0.4, t.z + 0.4, 1.8 * t.s, 'rgba(0,0,0,0.18)'); circ(t.x, t.z, 1.7 * t.s, t.pine ? '#2f5a34' : '#4a8a3a', 'rgba(0,0,0,0.25)'); }
    this.fx = this.fx.filter(f => (f.t += dt) < 1.2); for (const f of this.fx) { const [sx, sy] = this.w2s(f.x, f.z); g.beginPath(); g.arc(sx, sy, f.t * 2.2 * Z, 0, 7); g.strokeStyle = `rgba(255,255,255,${1 - f.t / 1.2})`; g.lineWidth = 2; g.stroke(); }
    const person = (x, z, rot, col, r, head) => { const [sx, sy] = this.w2s(x, z); g.beginPath(); g.arc(sx, sy, r * Z, 0, 7); g.fillStyle = col; g.fill(); g.strokeStyle = '#1a1208'; g.lineWidth = 2; g.stroke(); g.beginPath(); g.arc(sx + Math.cos(rot) * r * Z * 0.55, sy + Math.sin(rot) * r * Z * 0.55, r * Z * 0.45, 0, 7); g.fillStyle = head; g.fill(); };
    for (const n of G.npcs) if (n.visible !== false && vis(n.x, n.z)) person(n.x, n.z, n.rot, n.kind === 'ranger' ? '#7a8a4a' : '#' + ((n.def && n.def.shirt) || 0x888888).toString(16).padStart(6, '0'), n.kidc ? 0.35 : 0.45, '#e0b090');
    if (G.canoe && !p.canoe && G.owned.canoe) circ(G.canoe.x, G.canoe.z, 0.8, '#b8503a');
    if (G.fish && G.fish.st !== 'aim') { const [ax, ay] = this.w2s(p.x, p.z), [bx, by] = this.w2s(G.fish.bx, G.fish.bz); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.stroke(); circ(G.fish.bx, G.fish.bz, 0.18, G.fish.st === 'bite' ? '#ff3a2a' : '#fff'); }
    person(p.x, p.z, p.rot, p.hidden ? 'rgba(20,20,20,0.5)' : '#111', p.crouchNow ? 0.5 : 0.6, '#3a2414');
    const qt = S.questTarget(); if (qt) { const [qx, qy] = this.w2s(qt.x, qt.z); g.beginPath(); g.arc(qx, qy, 10 + Math.sin(this.t * 5) * 3, 0, 7); g.strokeStyle = '#ffd040'; g.lineWidth = 3; g.stroke(); }
    // day/night tint
    const sh = S.sunHeight(); if (sh < 0.15) { g.fillStyle = `rgba(10,16,48,${clamp((0.15 - sh) * 2.2, 0, 0.6)})`; g.fillRect(0, 0, this.w, this.h); }
    if (G.weather.rain > 0.05) { g.strokeStyle = `rgba(200,220,255,${0.35 * G.weather.rain})`; g.lineWidth = 1; g.beginPath(); for (let i = 0; i < 120; i++) { const x = (i * 97.3 + this.t * 300) % this.w, y = (i * 53.7 + this.t * 700) % this.h; g.moveTo(x, y); g.lineTo(x - 3, y + 10); } g.stroke(); }
  }
}
