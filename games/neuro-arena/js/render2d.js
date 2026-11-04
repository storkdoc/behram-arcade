/* NEURO ARENA fallback renderer (Canvas 2D): used when WebGL is unavailable or draws nothing.
   Same interface as Render3D: the two brains as glowing neuron maps with labeled regions, and the neon court. */
import { layout, S, stageLayout } from './render3d.js';
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
    this.trail = []; this.mode = 'wide'; this.view = { pong: true, flip: false }; this.orient = 0; this.ppu = 100; this.W = 1; this.H = 1; this.time = 0;
  }
  resize(W, H, rect) {
    this.W = W; this.H = H;
    this.canvas.width = Math.round(W * this.pr); this.canvas.height = Math.round(H * this.pr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.setLayout(rect, W, H);
  }
  setView(v) { const o = this.view; this.view = { ...o, ...v }; if (this.rect && (o.pong !== this.view.pong || o.flip !== this.view.flip)) this.setLayout(this.rect, this.W, this.H); }
  setLayout(rect, W, H) {
    this.rect = rect; const Lo = stageLayout(rect, W, H, this.view); this.mode = Lo.mode; this.orient = Lo.orient;
    this.court = Lo.court; this.bp = Lo.brains.map(([x, y, sc]) => [x, y, sc]); this.bs = Lo.bs; this.center = Lo.center;
    this.ppu = Math.min(rect.w / (Lo.bw * 1.1), rect.h / (Lo.bh * 1.06));
    this.cx = rect.x + rect.w / 2; this.cy = rect.y + rect.h / 2;
    const P = this.L.pos;
    for (const b of this.brains) for (let i = 0; i < N; i++) { const p = this.anchor(b.side, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); b.sx[i] = p.x; b.sy[i] = p.y; }
  }
  w2s(wx, wy) { return { x: this.cx + (wx - this.center[0]) * this.ppu, y: this.cy - (wy - this.center[1]) * this.ppu, ok: true }; }
  anchor(k, x, y, z = 0.1) { const [bx, by, sx] = this.bp[k]; return this.w2s(bx + sx * (x - z * 0.12), by + this.bs * (y + z * 0.1)); }
  // court (x, y) -> world, the same transform as the 3D court group (see stageLayout)
  c2w(x, y) { const lx = x * S - CW / 2, ly = y * S - CH / 2, o = this.orient; return o ? [this.court[0] + ly, this.court[1] + o * lx] : [this.court[0] + lx, this.court[1] + ly]; }
  courtAnchor(x, y) { const [wx, wy] = this.c2w(x, y); return this.w2s(wx, wy); }
  toCourt(sx, sy) {
    const wx = (sx - this.cx) / this.ppu + this.center[0] - this.court[0], wy = -(sy - this.cy) / this.ppu + this.center[1] - this.court[1], o = this.orient;
    const lx = o ? wy * o : wx, ly = o ? wx : wy;
    return { x: (lx + CW / 2) / S, y: (ly + CH / 2) / S };
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
    const q0 = this.courtAnchor(0, 0), q1 = this.courtAnchor(COURT.W, 1), c0 = { x: Math.min(q0.x, q1.x), y: Math.min(q0.y, q1.y) }, c1 = { x: Math.max(q0.x, q1.x), y: Math.max(q0.y, q1.y) }, cw = c1.x - c0.x, ch = c1.y - c0.y;
    x.fillStyle = 'rgba(4,8,22,.92)'; x.fillRect(c0.x, c0.y, cw, ch);
    x.strokeStyle = 'rgba(40,70,170,.35)'; x.lineWidth = 1; x.beginPath();
    const gs = 0.2 * u; for (let gx = c0.x + gs; gx < c1.x; gx += gs) { x.moveTo(gx, c0.y); x.lineTo(gx, c1.y); } for (let gy = c0.y + gs; gy < c1.y; gy += gs) { x.moveTo(c0.x, gy); x.lineTo(c1.x, gy); } x.stroke();
    for (let p = 0; p < 2; p++) { this.flash[p] *= Math.exp(-dt / 0.25); if (this.flash[p] > 0.02) { const e0 = this.courtAnchor(p ? COURT.W : 0, 0.5), e1 = this.courtAnchor(COURT.W * (p ? 0.65 : 0.35), 0.5); const gg = x.createLinearGradient(e0.x, e0.y, e1.x, e1.y); const col = p ? '200,0,170' : '0,170,200'; gg.addColorStop(0, `rgba(${col},${0.7 * this.flash[p]})`); gg.addColorStop(1, `rgba(${col},0)`); x.fillStyle = gg; x.fillRect(c0.x, c0.y, cw, ch); } }
    x.strokeStyle = 'rgba(110,160,255,.85)'; x.lineWidth = 1.5; x.strokeRect(c0.x, c0.y, cw, ch);
    const n0 = this.courtAnchor(COURT.W / 2, 0), n1 = this.courtAnchor(COURT.W / 2, 1);
    x.setLineDash([0.06 * u, 0.06 * u]); x.strokeStyle = 'rgba(90,110,240,.6)'; x.beginPath(); x.moveTo(n0.x, n0.y); x.lineTo(n1.x, n1.y); x.stroke(); x.setLineDash([]);
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
      const pw = Math.max(3, 0.035 * u);
      ['rgba(60,230,255,1)', 'rgba(255,70,220,1)'].forEach((col, p) => { const px = COURT.padX[p] + (p ? 0.01 : -0.01), a = this.courtAnchor(px, f.pad[p] - COURT.padH / 2), b = this.courtAnchor(px, f.pad[p] + COURT.padH / 2);
        x.lineCap = 'butt'; x.strokeStyle = col.replace(',1)', ',.18)'); x.lineWidth = pw * 4; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
        x.strokeStyle = col; x.lineWidth = pw; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); });
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
