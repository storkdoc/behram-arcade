/* NEURO ARENA fallback renderer (Canvas 2D): used when WebGL is unavailable or draws nothing.
   Same interface as Render3D: the two brains as glowing neuron maps with labeled regions, and the neon court. */
import { layout, S } from './render3d.js';
import { L, N, AREA_DEF } from './brain.js';
import { COURT } from './pong.js';

const CW = COURT.W * S, CH = COURT.H * S;
const AREA_RGB = { TH_E: [255, 174, 64], TH_I: [255, 90, 190], S_E: [51, 242, 209], S_I: [255, 82, 204], A_E: [153, 122, 255], A_I: [255, 77, 217], M_UP: [92, 255, 153], M_DN: [255, 140, 56], M_I: [255, 77, 204] };
const RIM = [[38, 191, 255], [230, 51, 191]];

export class Render2D {
  constructor(canvas) {
    this.canvas = canvas; this.x = canvas.getContext('2d');
    if (!this.x) throw new Error('Canvas 2D unavailable');
    this.is2D = true; this.failed = false;
    this.pr = Math.min(window.devicePixelRatio || 1, 2);
    this.L = layout(); this.area = new Uint8Array(N);
    AREA_DEF.forEach(([k], ai) => { for (let i = L[k].s; i < L[k].e; i++) this.area[i] = ai; });
    this.brains = [0, 1].map(side => ({ side, act: new Float32Array(N), sx: new Float32Array(N), sy: new Float32Array(N) }));
    this.dopa = [0, 0]; this.daS = [0, 0]; this.flash = [0, 0]; this.rings = []; this.f = null;
    this.trail = []; this.mode = 'wide'; this.ppu = 100; this.W = 1; this.H = 1; this.time = 0;
  }
  resize(W, H, rect) {
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.pr); this.canvas.height = Math.round(H * this.pr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.setLayout(rect, W, H);
  }
  setLayout(rect, W, H) {
    this.rect = rect; const asp = rect.w / Math.max(1, rect.h);
    const tall = asp < 1.15 || (W < H && W < 700); this.mode = tall ? 'tall' : 'wide';
    let bw, bh;
    if (!tall) {
      const s = 1.2, X = CW / 2 + 0.25 + 1.0 * s;
      this.court = [0, 0]; this.bp = [[-X, 0.05, s], [X, 0.05, -s]]; this.bs = s;
      bw = 2 * (X + 1.05 * s); bh = Math.max(CH + 0.2, 2.0 * s); this.center = [0, -0.02];
    } else {
      const s = 1.02, gap = 0.25;
      this.court = [0, CH / 2 + gap]; this.bp = [[-1.08, -0.95 * s - 0.05, s], [1.08, -0.95 * s - 0.05, -s]]; this.bs = s;
      bw = Math.max(CW + 0.2, 2 * (1.08 + 1.08 * s)); bh = CH + gap + 2.0 * s + 0.2; this.center = [0, (CH + gap - 1.95 * s) / 2 - 0.02];
    }
    this.ppu = Math.min(rect.w / (bw * 1.1), rect.h / (bh * 1.06));
    this.cx = rect.x + rect.w / 2; this.cy = rect.y + rect.h / 2;
    const P = this.L.pos;
    for (const b of this.brains) for (let i = 0; i < N; i++) { const p = this.anchor(b.side, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); b.sx[i] = p.x; b.sy[i] = p.y; }
  }
  w2s(wx, wy) { return { x: this.cx + (wx - this.center[0]) * this.ppu, y: this.cy - (wy - this.center[1]) * this.ppu, ok: true }; }
  anchor(k, x, y, z = 0.1) { const [bx, by, sx] = this.bp[k]; return this.w2s(bx + sx * (x - z * 0.12), by + this.bs * (y + z * 0.1)); }
  courtAnchor(x, y) { return this.w2s(this.court[0] + x * S - CW / 2, this.court[1] + y * S - CH / 2); }
  toCourt(sx, sy) {
    const wx = (sx - this.cx) / this.ppu + this.center[0], wy = -(sy - this.cy) / this.ppu + this.center[1];
    return { x: (wx - this.court[0] + CW / 2) / S, y: (wy - this.court[1] + CH / 2) / S };
  }
  spikes(k, spk, off) { const act = this.brains[k].act; for (let i = 0; i < N; i++) if (spk[off + i]) act[i] = 1; }
  setDopamine(k, v) { this.dopa[k] = v; }
  setFrame(f) { this.f = f; }
  ringAt(x, y, c) { this.rings.push({ x, y, t: 0, c: c.map(v => Math.min(255, v * 85) | 0) }); }
  goal(p) { this.flash[p] = 1; }
  render(dt, live) {
    this.time += dt;
    const x = this.x, pr = this.pr, u = this.ppu, f = this.f;
    x.setTransform(pr, 0, 0, pr, 0, 0); x.globalCompositeOperation = 'source-over';
    const g = x.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(this.W, this.H) * 0.7);
    g.addColorStop(0, '#0b0f26'); g.addColorStop(1, '#020309'); x.fillStyle = g; x.fillRect(0, 0, this.W, this.H);
    // court (choice contests are drawn on the 2D stage overlay instead)
    const choice = !!(f && f.kind === 'choice');
    if (!choice) {
    const c0 = this.courtAnchor(0, 1), c1 = this.courtAnchor(COURT.W, 0), cw = c1.x - c0.x, ch = c1.y - c0.y;
    x.fillStyle = 'rgba(4,8,22,.92)'; x.fillRect(c0.x, c0.y, cw, ch);
    x.strokeStyle = 'rgba(40,70,170,.35)'; x.lineWidth = 1; x.beginPath();
    const gs = 0.2 * u; for (let gx = c0.x + gs; gx < c1.x; gx += gs) { x.moveTo(gx, c0.y); x.lineTo(gx, c1.y); } for (let gy = c0.y + gs; gy < c1.y; gy += gs) { x.moveTo(c0.x, gy); x.lineTo(c1.x, gy); } x.stroke();
    for (let p = 0; p < 2; p++) { this.flash[p] *= Math.exp(-dt / 0.25); if (this.flash[p] > 0.02) { const gg = x.createLinearGradient(p ? c1.x : c0.x, 0, p ? c1.x - cw * 0.35 : c0.x + cw * 0.35, 0); const col = p ? '200,0,170' : '0,170,200'; gg.addColorStop(0, `rgba(${col},${0.7 * this.flash[p]})`); gg.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gg; x.fillRect(c0.x, c0.y, cw, ch); } }
    x.strokeStyle = 'rgba(110,160,255,.85)'; x.lineWidth = 1.5; x.strokeRect(c0.x, c0.y, cw, ch);
    x.setLineDash([0.06 * u, 0.06 * u]); x.strokeStyle = 'rgba(90,110,240,.6)'; x.beginPath(); x.moveTo(c0.x + cw / 2, c0.y); x.lineTo(c0.x + cw / 2, c1.y); x.stroke(); x.setLineDash([]);
    }
    // brains: shells, then dim neurons, then spiking neurons (additive)
    for (const b of this.brains) {
      const k = b.side, o = this.anchor(k, -0.02, 0, 0), rx = 1.05 * this.bs * u, ry = 0.95 * this.bs * u;
      this.daS[k] += (Math.max(-1, Math.min(1, this.dopa[k])) - this.daS[k]) * Math.min(1, dt * 8);
      const d = this.daS[k], rim = RIM[k].map((v, j) => Math.round(d > 0 ? v + ([255, 200, 64][j] - v) * d : v + ([77, 102, 255][j] - v) * -d));
      const sg = x.createRadialGradient(o.x, o.y, rx * 0.6, o.x, o.y, rx); sg.addColorStop(0, `rgba(${rim},0)`); sg.addColorStop(1, `rgba(${rim},.18)`);
      x.fillStyle = sg; x.beginPath(); x.ellipse(o.x, o.y, rx, ry, 0, 0, 7); x.fill();
      x.strokeStyle = `rgba(${rim},.55)`; x.lineWidth = 1.2; x.stroke();
    }
    const dot = Math.max(1, u * 0.011), decay = Math.exp(-dt / 0.11);
    let cur = -1;
    for (const b of this.brains) for (let i = 0; i < N; i++) { const a = this.area[i]; if (a !== cur) { cur = a; const c = AREA_RGB[AREA_DEF[a][0]]; x.fillStyle = `rgba(${c},.28)`; } x.fillRect(b.sx[i] - dot / 2, b.sy[i] - dot / 2, dot, dot); }
    x.globalCompositeOperation = 'lighter'; cur = -1;
    for (const b of this.brains) {
      const act = b.act;
      for (let i = 0; i < N; i++) {
        if (live) act[i] *= decay; else { act[i] *= decay; if (Math.random() < 0.0025) act[i] = 0.5; }
        const a = act[i]; if (a < 0.08) continue;
        const ar = this.area[i]; if (ar !== cur) { cur = ar; const c = AREA_RGB[AREA_DEF[ar][0]]; x.fillStyle = `rgb(${c.map(v => (v + 255) >> 1)})`; }
        const s = dot * (1.2 + 2.2 * a); x.globalAlpha = Math.min(1, a); x.fillRect(b.sx[i] - s / 2, b.sy[i] - s / 2, s, s);
      }
    }
    x.globalAlpha = 1;
    // paddles, ball + trail, hit rings
    if (f && !choice) {
      const ph = COURT.padH * S * u, pw = Math.max(3, 0.035 * u);
      ['rgba(60,230,255,1)', 'rgba(255,70,220,1)'].forEach((col, p) => { const q = this.courtAnchor(COURT.padX[p] + (p ? 0.01 : -0.01), f.pad[p]); x.fillStyle = col; x.fillRect(q.x - pw / 2, q.y - ph / 2, pw, ph); x.fillStyle = col.replace(',1)', ',.18)'); x.fillRect(q.x - pw * 2, q.y - ph / 2 - pw, pw * 4, ph + pw * 2); });
      const bq = this.courtAnchor(f.bx, f.by);
      this.trail.unshift(bq); if (this.trail.length > 20) this.trail.length = 20;
      if (live) this.trail.forEach((t, i) => { x.fillStyle = `rgba(170,160,255,${0.5 * (1 - i / 20)})`; x.beginPath(); x.arc(t.x, t.y, Math.max(1, COURT.r * S * u * (1 - i / 24)), 0, 7); x.fill(); });
      const br = COURT.r * S * u * 1.25, bg = x.createRadialGradient(bq.x, bq.y, 0, bq.x, bq.y, br * 4); bg.addColorStop(0, 'rgba(255,255,240,.9)'); bg.addColorStop(1, 'rgba(255,255,240,0)');
      x.fillStyle = bg; x.beginPath(); x.arc(bq.x, bq.y, br * 4, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(bq.x, bq.y, br, 0, 7); x.fill();
    }
    this.rings = this.rings.filter(r => (r.t += dt) < 0.5);
    for (const r of this.rings) { const q = this.courtAnchor(r.x, r.y), v = r.t / 0.5; x.strokeStyle = `rgba(${r.c},${(1 - v) * (1 - v)})`; x.lineWidth = 2; x.beginPath(); x.arc(q.x, q.y, (0.03 + 0.22 * v) * S * u * 0.5, 0, 7); x.stroke(); }
    x.globalCompositeOperation = 'source-over';
  }
}
