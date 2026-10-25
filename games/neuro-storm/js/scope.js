/* Oscilloscope of the inspected neuron's membrane potential + population raster (Canvas2D at native DPR) */
import { PHYS, DT, relEnd } from './sim.js';

const fitCanvas = (cv) => {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w: r.width, h: r.height, dpr };
};
const FONT = '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif';

export class Scope {
  constructor(cv) { this.cv = cv; this.g = cv.getContext('2d'); this.win = 60; this.showTh = true; }
  draw(net) {
    const { w, h, dpr } = fitCanvas(this.cv), g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const L = 44, R = 8, T = 14, B = 16, pw = w - L - R, ph = h - T - B;
    if (pw < 40 || ph < 30) return;
    const vMin = -92, vMax = 45, y = v => T + (vMax - v) / (vMax - vMin) * ph;
    const rec = net.rec, now = net.t, W = this.win, x = t => L + (t - (now - W)) / W * pw;
    g.fillStyle = 'rgba(4,8,18,0.55)'; g.fillRect(L, T, pw, ph);
    if (!rec) {
      g.fillStyle = '#8fa3c4'; g.font = `13px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('Click or tap a neuron: its membrane potential appears here', L + pw / 2, T + ph / 2); return;
    }
    const i = rec.i, T0 = net.paramsOf ? net.paramsOf(i) : net.type[i] ? PHYS.I : PHYS.E, rel = relEnd(T0);
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    // refractory shading
    for (const ts of rec.spikes) {
      if (ts + rel < now - W) continue;
      const xa = x(ts), xb = x(ts + T0.tAbs), xc = x(ts + rel);
      const grd = g.createLinearGradient(xb, 0, xc, 0); grd.addColorStop(0, 'rgba(255,170,60,0.26)'); grd.addColorStop(1, 'rgba(255,170,60,0.0)');
      g.fillStyle = grd; g.fillRect(xb, T, xc - xb, ph);
      g.fillStyle = 'rgba(255,60,60,0.30)'; g.fillRect(xa, T, Math.max(1, xb - xa), ph);
    }
    // reference lines
    const thr = Math.round(T0.th0 ?? -55); const ref = [[T0.Vpk, 'spike peak', 'rgba(255,255,255,0.18)'], [0, '0 mV', 'rgba(255,255,255,0.10)'], [thr, 'threshold', 'rgba(255,190,90,0.55)'], [-70, 'rest −70', 'rgba(120,200,255,0.55)'], [-80, 'E GABA / AHP −80', 'rgba(220,120,255,0.35)']];
    g.setLineDash([4, 4]); g.lineWidth = 1;
    for (const [v, , c] of ref) { g.strokeStyle = c; g.beginPath(); g.moveTo(L, Math.round(y(v)) + 0.5); g.lineTo(L + pw, Math.round(y(v)) + 0.5); g.stroke(); }
    g.setLineDash([]);
    // V trace: per-pixel min/max envelope from the 0.05 ms samples
    const n = rec.n, head = rec.head, cols = Math.round(pw * dpr), spp = W / DT / cols;
    const sample = (ms) => { const k = Math.round(ms / DT); if (k >= n || k < 1) return null; return (head - k + n) % n; };
    const drawTrace = (arr, color, width, env) => {
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.beginPath(); let started = false;
      for (let c = 0; c <= cols; c++) {
        const tc = c / cols * W; // ms ago (c = 0 is the right edge = now)
        const k1 = Math.max(1, Math.round(tc / DT)), k0 = Math.max(k1, Math.round((tc + W / cols) / DT));
        if (k0 >= n) continue;
        let mn = 1e9, mx = -1e9; for (let k = k1; k <= k0 && k < n; k++) { const v = arr[(head - k + n) % n]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const px = L + pw - c / dpr;
        if (!env) { const v = (mn + mx) / 2; if (!started) { g.moveTo(px, y(v)); started = true; } else g.lineTo(px, y(v)); }
        else { if (!started) { g.moveTo(px, y(mx)); started = true; } else g.lineTo(px, y(mx)); g.lineTo(px, y(mn)); }
      }
      g.stroke();
    };
    if (this.showTh) drawTrace(rec.th, 'rgba(255,170,60,0.9)', 1.25, false);
    const col = net.colorOf ? net.colorOf(i) : net.type[i] ? '#ff7be3' : '#7fe2ff';
    g.shadowColor = col; g.shadowBlur = 6; drawTrace(rec.V, col, 1.6, true); g.shadowBlur = 0;
    // synaptic arrival markers
    g.font = `9px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const ev = rec.ev;
    for (let k = 0; k < ev.length; k += 2) {
      const t = ev[k]; if (t < now - W) continue; const px = x(t);
      if (ev[k + 1] > 0) { g.fillStyle = '#5fd8ff'; g.beginPath(); g.moveTo(px, T + 2); g.lineTo(px - 3.5, T + 8); g.lineTo(px + 3.5, T + 8); g.fill(); }
      else { g.fillStyle = '#ff5fd8'; g.beginPath(); g.moveTo(px, T + ph - 2); g.lineTo(px - 3.5, T + ph - 8); g.lineTo(px + 3.5, T + ph - 8); g.fill(); }
    }
    g.fillStyle = '#ffd36a'; g.font = `12px ${FONT}`;
    for (const t of rec.stims) { if (t < now - W) continue; g.fillText('⚡', x(t), T + 18); }
    // AP / AHP annotations on the most recent visible spike
    const last = rec.spikes.length ? rec.spikes[rec.spikes.length - 1] : null;
    if (last !== null && last > now - W) {
      g.font = `600 10px ${FONT}`; g.fillStyle = '#ffffff'; g.textAlign = 'left';
      const xs = x(last); g.fillText('action potential', Math.min(xs + 6, L + pw - 80), y(T0.Vpk) + 2);
      const ahpT = last + 6; if (ahpT < now) { g.fillStyle = '#b9a6ff'; g.fillText('AHP', Math.min(x(ahpT), L + pw - 26), y(-80) + 9); }
      if (x(last + T0.tAbs) - xs > 12) { g.fillStyle = '#ff8a8a'; g.textAlign = 'center'; g.fillText('ARP', (xs + x(last + T0.tAbs)) / 2, T + ph - 16); }
      if (x(last + rel) - x(last + T0.tAbs) > 30) { g.fillStyle = '#ffc070'; g.textAlign = 'center'; g.fillText('RRP', (x(last + T0.tAbs) + x(last + rel)) / 2, T + ph - 16); }
    }
    g.restore();
    // axis labels
    g.font = `10px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const [v, lab, c] of (ph < 110 ? [[T0.Vpk, `+${T0.Vpk}`], [0, '0'], [thr, '−' + -thr], [-70, '−70']] : [[T0.Vpk, `+${T0.Vpk}`], [0, '0'], [thr, '−' + -thr], [-70, '−70'], [-80, '−80']])) { g.fillStyle = v === thr ? '#ffbe5a' : v <= -70 && v > -80 ? '#7fd0ff' : '#8fa3c4'; g.fillText(lab, L - 5, y(v)); }
    g.save(); g.translate(9, T + ph / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillStyle = '#8fa3c4'; g.fillText('mV', 0, 0); g.restore();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = '#8fa3c4';
    g.fillText(`−${W} ms`, L, h - 3); g.textAlign = 'right'; g.fillText('now', L + pw, h - 3);
    // colour-keyed legend, centred between the time labels
    const items = [['▲ EPSP', '#5fd8ff'], ['▼ IPSP', '#ff5fd8'], ['⚡ stim', '#ffd36a'], ['▮ abs. refractory', '#ff7a7a'], ['▮ rel.', '#ffb35a']];
    if (this.showTh) items.push(['─ threshold θ', '#ffaa3c']);
    g.font = `10px ${FONT}`; g.textAlign = 'left';
    const lw = items.reduce((a, [t]) => a + g.measureText(t).width + 9, -9), tw = g.measureText(`−${W} ms`).width + 10;
    if (lw < pw - 2 * tw) { let lx = L + pw / 2 - lw / 2; for (const [t, c] of items) { g.fillStyle = c; g.fillText(t, lx, h - 3); lx += g.measureText(t).width + 9; } }
    // live readout
    g.textAlign = 'right'; g.textBaseline = 'top'; g.font = `600 11px ${FONT}`; g.fillStyle = '#e9f1ff';
    g.fillText(`V ${(net.vOf ? net.vOf(i) : net.V[i]).toFixed(1)} mV   θ ${(net.thOf ? net.thOf(i) : net.th[i]).toFixed(1)} mV`, L + pw - 4, 1);
  }
}

export class Raster {
  constructor(cv, net) {
    this.cv = cv; this.g = cv.getContext('2d'); this.win = 600; this.setNet(net);
    this.cap = 400000; this.t = new Float64Array(this.cap); this.id = new Int32Array(this.cap); this.head = 0; this.count = 0;
    this.rateBins = new Float32Array(4000); this.rateT0 = 0;
  }
  setNet(net) {
    this.net = net;
    if (net.gSamp) {   // dense mode: rows are a fixed sample of neurons (already sorted), rate from GPU totals
      const S = net.gSamp; this.rows = S.length; this.rank = Int32Array.from(S.keys()); this.rowCol = Uint32Array.from(S, n => this.abgr(net.colorOf(n)));
      this.nLeft = S.reduce((a, n) => a + (net.hemi[n] < 0 ? 1 : 0), 0); return;
    }
    const N = net.N, ord = [...Array(N).keys()];
    ord.sort((a, b) => (net.hemi[a] - net.hemi[b]) || (net.pos[b * 3 + 2] - net.pos[a * 3 + 2]));
    this.rank = new Int32Array(N); ord.forEach((n, r) => (this.rank[n] = r)); this.rows = N; this.rowCol = null;
    this.nLeft = net.hemi.reduce((a, s) => a + (s < 0 ? 1 : 0), 0);
  }
  abgr(hex) { const v = parseInt(hex.slice(1), 16); return (0xff000000 | ((v & 255) << 16) | (v & 0xff00) | (v >> 16)) >>> 0; }
  pushOnly(t, i) { const h = this.head; this.t[h] = t; this.id[h] = i; this.head = (h + 1) % this.cap; if (this.count < this.cap) this.count++; }
  addRate(t, c) { this.rateBins[Math.floor(t) % 4000] += c; }
  clear() { this.head = 0; this.count = 0; this.rateBins.fill(0); }
  push(t, i) { const h = this.head; this.t[h] = t; this.id[h] = i; this.head = (h + 1) % this.cap; if (this.count < this.cap) this.count++; this.rateBins[Math.floor(t) % 4000]++; }
  tick(now) { // zero rate bins that are about to be reused
    const cur = Math.floor(now); if (this.lastBin === undefined) this.lastBin = cur;
    for (let b = this.lastBin + 1; b <= cur && b - this.lastBin < 4000; b++) this.rateBins[b % 4000] = 0; this.lastBin = cur;
  }
  draw(now) {
    const { w, h, dpr } = fitCanvas(this.cv), g = this.g, net = this.net, N = net.N;
    const L = 6, R = 6, T = 2, B = 14;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    const pl = Math.round(L * dpr), pr = W - Math.round(R * dpr), pt = Math.round(T * dpr), pb = H - Math.round(B * dpr);
    const pw = pr - pl, ph = pb - pt; if (pw < 10 || ph < 10) return;
    if (!this.img || this.img.width !== W || this.img.height !== H) { this.img = g.createImageData(W, H); this.u32 = new Uint32Array(this.img.data.buffer); }
    const u = this.u32; u.fill(0);
    const bgc = 0xb0120804; for (let yy = pt; yy < pb; yy++) u.fill(bgc, yy * W + pl, yy * W + pr);
    // hemisphere divider
    const NR = this.rows, yDiv = pt + Math.round(this.nLeft / NR * ph);
    u.fill(0x40ffffff, yDiv * W + pl, yDiv * W + pr);
    const cE = 0xffffd85a, cI = 0xffd85aff; // ABGR: E cyan-ish (r=5a,g=d8,b=ff), I magenta
    const t0 = now - this.win, rowH = Math.max(1, Math.round(ph / NR * 1.6));
    for (let k = 0, idx = (this.head - 1 + this.cap) % this.cap; k < this.count; k++, idx = (idx - 1 + this.cap) % this.cap) {
      const t = this.t[idx]; if (t < t0) break;
      const n = this.id[idx], xx = pl + Math.floor((t - t0) / this.win * pw), yy = pt + Math.floor(this.rank[n] / NR * ph);
      const c = this.rowCol ? this.rowCol[n] : net.type[n] ? cI : cE;
      for (let r = 0; r < rowH && yy + r < pb; r++) { const o = (yy + r) * W + xx; u[o] = c; if (dpr > 1.5 && xx + 1 < pr) u[o + 1] = c; }
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(this.img, 0, 0);
    // population rate (% of cells firing per 5 ms)
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pw2 = w - L - R, ph2 = h - T - B; let peak = 0; const pts = [];
    for (let s = 0; s <= pw2; s += 2) {
      const tb = now - this.win + s / pw2 * this.win; let c = 0; for (let q = 0; q < 5; q++) { const b = Math.floor(tb) - q; if (b >= 0 && b > now - 4000 && b <= now) c += this.rateBins[b % 4000]; }
      const v = c / N * 100; pts.push(v); if (v > peak) peak = v;
    }
    const top = Math.max(4, peak * 1.15);
    g.strokeStyle = 'rgba(255,211,106,0.95)'; g.lineWidth = 1.4; g.beginPath();
    pts.forEach((v, k) => { const px = L + k * 2, py = T + ph2 - v / top * ph2; k ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
    g.font = `10px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#8fa3c4'; g.textAlign = 'left';
    g.fillText(w < 560 ? `raster · ${this.win} ms · L above, R below` : `raster · ${this.win} ms · rows = ${this.rowCol ? NR + ' sampled ' : ''}neurons front→back (L hemisphere above, R below)`, L, h - 2);
    g.textAlign = 'right'; g.fillStyle = '#ffd36a'; g.fillText(w < 560 ? `${pts[pts.length - 1].toFixed(1)}%/5 ms` : `firing ${pts[pts.length - 1].toFixed(1)}%/5 ms (scale ${top.toFixed(0)}%)`, w - R, h - 2);
  }
}
