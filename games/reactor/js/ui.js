/* ==========================================================================
   MELTDOWN — ui.js : analog gauges, annunciator panel, trend chart, readouts.
   Pure DOM/canvas, no framework. All drawing is throttled by main.js.
   ========================================================================== */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

/* ---------- analog gauge ---------- */
export class Gauge {
  /** o: { label, unit, min, max, ticks, zones:[[a,b,color]], fmt, log } */
  constructor(parent, o) {
    this.o = o; this.v = o.min; this.shown = o.min; this.v2 = null; this.bad = false;
    const w = this.el = document.createElement('div'); w.className = 'gauge'; w.innerHTML = `<canvas></canvas><div class="gl">${o.label}</div><div class="gv">—</div>`;
    parent.appendChild(w); this.cv = w.querySelector('canvas'); this.gv = w.querySelector('.gv'); this.ctx = this.cv.getContext('2d');
  }
  set(v, v2) { this.v = v; this.v2 = v2 == null ? null : v2; }
  frac(v) { const o = this.o; if (o.log) { const a = Math.log10(o.min), b = Math.log10(o.max); return clamp((Math.log10(Math.max(o.min, v)) - a) / (b - a), 0, 1); } return clamp((v - o.min) / (o.max - o.min), 0, 1); }
  draw(dt) {
    const o = this.o, cv = this.cv, r = cv.getBoundingClientRect(), d = DPR();
    if (r.width < 4) return;
    const W = Math.round(r.width * d), H = Math.round(r.height * d); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.6, R = Math.min(W * 0.46, H * 0.56), a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    const A = f => a0 + (a1 - a0) * f;
    // face
    const g = c.createRadialGradient(cx, cy - R * 0.3, R * 0.1, cx, cy, R * 1.1); g.addColorStop(0, '#f2ead6'); g.addColorStop(1, '#c9bfa6');
    c.beginPath(); c.arc(cx, cy, R * 1.04, 0, Math.PI * 2); c.fillStyle = '#1b1e22'; c.fill();
    c.beginPath(); c.arc(cx, cy, R * 0.98, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    // zones
    for (const [za, zb, col] of o.zones || []) { c.beginPath(); c.arc(cx, cy, R * 0.82, A(this.frac(za)), A(this.frac(zb))); c.strokeStyle = col; c.lineWidth = R * 0.1; c.stroke(); }
    // ticks
    const tk = o.ticks || [o.min, o.max]; c.fillStyle = '#222'; c.strokeStyle = '#222'; c.font = `${Math.round(R * 0.17)}px "Courier New", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const t of tk) { const a = A(this.frac(t)); c.lineWidth = Math.max(1, R * 0.025); c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.88, cy + Math.sin(a) * R * 0.88); c.lineTo(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72); c.stroke();
      c.fillText(o.tl ? o.tl(t) : String(t), cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); }
    c.fillStyle = '#444'; c.font = `${Math.round(R * 0.15)}px "Courier New", monospace`; c.fillText(o.unit || '', cx, cy + R * 0.38);
    // needles (secondary first)
    const k = 1 - Math.exp(-dt * 6); this.shown += (this.frac(this.v) - this.shown) * k;
    if (this.v2 != null) this.needle(c, cx, cy, R, A(this.frac(this.v2)), '#1a7a3a', 0.8);
    this.needle(c, cx, cy, R, A(this.shown), this.bad ? '#e02010' : '#b01818', 0.9);
    c.beginPath(); c.arc(cx, cy, R * 0.08, 0, Math.PI * 2); c.fillStyle = '#222'; c.fill();
    // glass
    const gl = c.createLinearGradient(0, cy - R, 0, cy); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.beginPath(); c.ellipse(cx, cy - R * 0.45, R * 0.75, R * 0.42, 0, Math.PI, 0); c.fillStyle = gl; c.fill();
    this.gv.textContent = o.fmt ? o.fmt(this.v) : this.v.toFixed(1);
  }
  needle(c, cx, cy, R, a, col, len) { c.save(); c.translate(cx, cy); c.rotate(a); c.beginPath(); c.moveTo(-R * 0.12, -R * 0.03); c.lineTo(R * len, 0); c.lineTo(-R * 0.12, R * 0.03); c.closePath(); c.fillStyle = col; c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 3; c.fill(); c.restore(); }
}

/* ---------- annunciator window ---------- */
export class Annunciator {
  constructor(parent, defs) {
    this.defs = defs; this.tiles = [];
    for (const d of defs) { const e = document.createElement('div'); e.className = 'ann s' + d.sev; e.textContent = d.t; parent.appendChild(e); this.tiles.push({ d, e, on: false, ack: true }); }
    this.newCount = 0;
  }
  /** returns { level, fresh: [titles] } */
  update(s, g) {
    let level = 0; const fresh = [];
    for (const t of this.tiles) {
      let on = false; try { on = !!t.d.c(s, g); } catch (e) { on = false; }
      if (on && !t.on) { t.ack = false; fresh.push(t.d); }
      if (!on && t.on) t.ack = true;
      t.on = on; t.e.classList.toggle('on', on); t.e.classList.toggle('flash', on && !t.ack);
      if (on) level = Math.max(level, t.ack ? Math.min(t.d.sev, 1) : t.d.sev);
    }
    this.unacked = this.tiles.some(t => t.on && !t.ack);
    return { level, fresh, maxOn: Math.max(0, ...this.tiles.filter(t => t.on).map(t => t.d.sev)) };
  }
  ack() { let any = false; for (const t of this.tiles) if (t.on && !t.ack) { t.ack = true; any = true; } return any; }
  active() { return this.tiles.filter(t => t.on).map(t => t.d); }
}

/* ---------- strip-chart (log or linear) ---------- */
export class Chart {
  constructor(cv, o) { this.cv = cv; this.o = o; this.data = []; this.ctx = cv.getContext('2d'); }
  push(t, v) { this.data.push([t, v]); const span = this.o.span || 60; while (this.data.length > 2 && this.data[0][0] < t - span) this.data.shift(); if (this.data.length > 2000) this.data.splice(0, this.data.length - 2000); }
  clear() { this.data.length = 0; }
  draw() {
    const cv = this.cv, r = cv.getBoundingClientRect(), d = DPR(); if (r.width < 4) return;
    const W = Math.round(r.width * d), H = Math.round(r.height * d); if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = this.ctx, o = this.o; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#071012'; c.fillRect(0, 0, W, H);
    const lo = o.lo, hi = o.hi, Y = v => H - 6 * d - (clamp((o.log ? Math.log10(Math.max(1e-12, v)) : v), lo, hi) - lo) / (hi - lo) * (H - 12 * d);
    c.strokeStyle = 'rgba(80,255,160,0.12)'; c.lineWidth = 1; c.font = `${10 * d}px monospace`; c.fillStyle = 'rgba(120,255,180,0.55)';
    for (let k = Math.ceil(lo); k <= hi; k += o.step || 1) { const y = Y(o.log ? Math.pow(10, k) : k); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); c.fillText(o.lab ? o.lab(k) : String(k), 4 * d, y - 2 * d); }
    if (this.data.length < 2) return;
    const t1 = this.data[this.data.length - 1][0], span = o.span || 60, X = t => W - (t1 - t) / span * W;
    c.strokeStyle = '#5effa0'; c.lineWidth = 2 * d; c.shadowColor = '#5effa0'; c.shadowBlur = 6 * d; c.beginPath();
    this.data.forEach(([t, v], i) => { const x = X(t), y = Y(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); c.shadowBlur = 0;
  }
}

/* ---------- formatting ---------- */
export const fmt = {
  pct: v => (v * 100 >= 10 ? (v * 100).toFixed(0) : v * 100 >= 1 ? (v * 100).toFixed(1) : (v * 100).toPrecision(2)) + '%',
  power: v => v >= 0.01 ? (v * 100).toFixed(v >= 0.1 ? 0 : 1) + '%' : (v * 100).toExponential(1) + '%',
  period: p => !isFinite(p) || Math.abs(p) > 9999 ? '∞' : (p > 0 ? '+' : '') + p.toFixed(Math.abs(p) < 10 ? 2 : 0) + ' s',
  t: sec => { sec = Math.max(0, Math.floor(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },
};
