/* NEURO STORM, dense mode: live cortical column / slice view (Canvas2D at native DPR).
   A vertical section through the 2.5 mm grey-matter sheet under the selected neuron: every dot is one
   simulated neuron at its real lateral position and cortical depth, coloured by cell type, flashing when it fires. */
import { LAYERS, CLASSES, SHEET } from './dense.js';
const FONT = '-apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", Roboto, sans-serif';
export class ColumnView {
  constructor(cv) { this.cv = cv; this.g = cv.getContext('2d'); this.lastSpk = null; }
  setPatch(net) {
    const ids = net.colSamp, c = net.colCenter, P = net.pos, n = ids.length;
    // local frame at the centre cell: radial (outward), tangent t1 (roughly anterior-posterior)
    const hx = (net.hemi[c] < 0 ? -0.56 : 0.56), r = [P[c * 3] - hx, P[c * 3 + 1] - 0.08, P[c * 3 + 2]]; const rl = Math.hypot(...r); r[0] /= rl; r[1] /= rl; r[2] /= rl;
    let t = [0, 0, 1]; const dot = t[0] * r[0] + t[1] * r[1] + t[2] * r[2]; t = [t[0] - dot * r[0], t[1] - dot * r[1], t[2] - dot * r[2]]; let tl = Math.hypot(...t);
    if (tl < 0.2) { t = [0, 1, 0]; const d2 = r[1]; t = [-d2 * r[0], 1 - d2 * r[1], -d2 * r[2]]; tl = Math.hypot(...t); }
    t = t.map(v => v / tl);
    this.x = new Float32Array(n); let mx = 1e-3;
    for (let k = 0; k < n; k++) { const i = ids[k]; const v = (P[i * 3] - P[c * 3]) * t[0] + (P[i * 3 + 1] - P[c * 3 + 1]) * t[1] + (P[i * 3 + 2] - P[c * 3 + 2]) * t[2]; this.x[k] = v; mx = Math.max(mx, Math.abs(v)); }
    this.span = mx; this.lastSpk = new Float64Array(n).fill(-1e9); this.center = c;
  }
  spike(k, t) { if (this.lastSpk) this.lastSpk[k] = t; }
  draw(net, now) {
    const r = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = r.width, h = r.height;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr)); if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    if (!this.lastSpk || net.colCenter !== this.center) this.setPatch(net);
    const L = 54, R = 8, T = 16, B = 16, pw = w - L - R, ph = h - T - B; if (pw < 60 || ph < 40) return;
    g.fillStyle = 'rgba(4,8,18,0.55)'; g.fillRect(L, T, pw, ph);
    // layer bands
    const y = f => T + f * ph;
    LAYERS.forEach((Ly, k) => {
      g.fillStyle = k % 2 ? 'rgba(120,150,255,0.07)' : 'rgba(120,150,255,0.025)'; g.fillRect(L, y(Ly.top), pw, y(Ly.bot) - y(Ly.top));
      g.strokeStyle = 'rgba(160,180,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, Math.round(y(Ly.top)) + 0.5); g.lineTo(L + pw, Math.round(y(Ly.top)) + 0.5); g.stroke();
      g.fillStyle = '#c9d6ff'; g.font = `600 11px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle'; g.fillText(Ly.name, L - 6, (y(Ly.top) + y(Ly.bot)) / 2);
    });
    g.fillStyle = '#8fa3c4'; g.font = `9px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'top'; g.fillText('pia', L - 6, T - 12); g.textBaseline = 'bottom'; g.fillText('white matter', L + 50, h);
    // neurons
    const ids = net.colSamp, n = ids.length, sx = pw / (2 * this.span * 1.04), cx = L + pw / 2, fl = Math.max(1.2, (this.flashMs || 4));
    const layerAct = new Float32Array(5), layerN = new Float32Array(5);
    for (let k = 0; k < n; k++) {
      const i = ids[k], cls = net.cls[i], C = CLASSES[cls], px = cx + this.x[k] * sx, py = y(net.depth[i]);
      const age = now - this.lastSpk[k], f = age >= 0 ? Math.exp(-age / fl) : 0;
      layerN[net.layer[i]]++; if (age < 10) layerAct[net.layer[i]]++;
      const rad = (cls === 2 ? 2.6 : cls === 1 ? 1.6 : cls >= 4 ? 1.7 : 2.0) * (1 + 0.7 * f);
      g.globalAlpha = 0.38 + 0.62 * f; g.fillStyle = f > 0.5 ? '#ffffff' : C.color;
      if (cls === 0 || cls === 2 || cls === 3) { g.beginPath(); g.moveTo(px, py - rad * 1.5); g.lineTo(px - rad, py + rad); g.lineTo(px + rad, py + rad); g.closePath(); g.fill(); } // pyramids
      else { g.beginPath(); g.arc(px, py, rad, 0, 6.283); g.fill(); }
      if (f > 0.25) { g.globalAlpha = 0.25 * f; g.fillStyle = C.color; g.beginPath(); g.arc(px, py, rad * 3, 0, 6.283); g.fill(); }
    }
    g.globalAlpha = 1;
    const ci = ids.indexOf(net.sel); if (ci >= 0) { const px = cx + this.x[ci] * sx, py = y(net.depth[net.sel]); g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, 6, 0, 6.283); g.stroke(); }
    // per-layer activity (fraction of sampled cells that fired in the last 10 ms)
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = `10px ${FONT}`;
    LAYERS.forEach((Ly, k) => { const a = layerN[k] ? layerAct[k] / layerN[k] : 0; if (a <= 0) return; const yy = (y(Ly.top) + y(Ly.bot)) / 2; g.fillStyle = 'rgba(255,211,106,0.85)'; g.fillRect(L + pw - 4 - Math.min(60, a * 300), yy - 2, Math.min(60, a * 300), 4); });
    // title + legend
    const mm = (2 * this.span * 60).toFixed(1);
    g.fillStyle = '#8fa3c4'; g.font = `10px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillText(`slice under the selected cell · ${n} neurons · ${mm} mm wide × ${(SHEET * 60).toFixed(1)} mm deep (depth exaggerated)`, L, T - 4);
    let lx = L + 60; g.textAlign = 'left'; g.font = `10px ${FONT}`;
    for (const C of CLASSES) { const tw = g.measureText(C.short).width; if (lx + tw + 14 > L + pw) break; g.fillStyle = C.color; g.fillRect(lx, h - 9, 7, 7); g.fillStyle = '#c9d6ff'; g.fillText(C.short, lx + 10, h - 2); lx += tw + 20; }
  }
}
