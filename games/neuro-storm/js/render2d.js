/* NEURO STORM: Canvas2D fallback renderer (no WebGL). Same camera, same picking API. */
import { PHYS, relEnd } from './sim.js';
export class Render2D {
  constructor(canvas, net, cam) {
    this.kind = '2d'; this.net = net; this.cam = cam; this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.pr = Math.min(window.devicePixelRatio || 1, 2); this.proj = new Float32Array(net.N * 3); this.V = null; this.fl = null; this.since = null;
    this.ripples = []; this.view = { x: 0, y: 0 };
    this.resize(window.innerWidth, window.innerHeight);
  }
  resize(w, h) { this.w = w; this.h = h; this.canvas.width = Math.round(w * this.pr); this.canvas.height = Math.round(h * this.pr); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; }
  setPixelRatio() {}
  setSelected(i) { this.sel = i; }
  addPulse() {} clearPulses() { this.ripples.length = 0; }
  ripple(i) { this.ripples.push({ i, t: 0 }); }
  updateState(V, fl, since) { this.V = V; this.fl = fl; this.since = since; }
  project(out) {
    const c = this.cam, e = c.eye(), t = c.target, N = this.net.N, p = this.net.pos;
    let fx = t[0] - e[0], fy = t[1] - e[1], fz = t[2] - e[2]; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = fz * 0 - fy * 0, ry = 0, rz = 0; // right = f x up
    rx = -fz; rz = fx; ry = 0; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
    const foc = this.h / (2 * Math.tan(c.fov * Math.PI / 360)), cx = this.w / 2 - this.view.x, cy = this.h / 2 - this.view.y;
    for (let i = 0; i < N; i++) {
      const dx = p[i * 3] - e[0], dy = p[i * 3 + 1] - e[1], dz = p[i * 3 + 2] - e[2];
      const z = dx * fx + dy * fy + dz * fz;
      out[i * 3] = cx + (dx * rx + dy * ry + dz * rz) / z * foc; out[i * 3 + 1] = cy - (dx * ux + dy * uy + dz * uz) / z * foc; out[i * 3 + 2] = z;
    }
  }
  render(view, simT, realT, dt) {
    this.view = view || { x: 0, y: 0 };
    const g = this.ctx, pr = this.pr, N = this.net.N, P = this.proj; this.project(P);
    g.setTransform(pr, 0, 0, pr, 0, 0); g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, this.h); bg.addColorStop(0, '#060912'); bg.addColorStop(1, '#020309'); g.fillStyle = bg; g.fillRect(0, 0, this.w, this.h);
    g.globalCompositeOperation = 'lighter';
    const foc = this.h / (2 * Math.tan(this.cam.fov * Math.PI / 360)), type = this.net.type, relE = relEnd(PHYS.E), relI = relEnd(PHYS.I);
    for (let i = 0; i < N; i++) {
      const z = P[i * 3 + 2]; if (z <= 0.1) continue;
      const V = this.V ? this.V[i] : -70, f = this.fl ? this.fl[i] : 0, s = this.since ? this.since[i] : -1;
      const dep = Math.min(1, Math.max(0, (V + 70) / 16)), hyp = Math.min(1, Math.max(0, (-70.5 - V) / 8.5));
      const fade = Math.min(1.1, Math.max(0.35, 1.25 - (z - 3.2) * 0.32));
      let r0, g0, b0; if (type[i]) { r0 = 255; g0 = 60; b0 = 210; } else { r0 = 46; g0 = 200; b0 = 255; }
      let k = (0.3 + 1.0 * dep) * (1 - 0.7 * hyp) * fade;
      const rw = type[i] ? relI : relE; const ember = s >= 0 && s < rw ? (1 - s / rw) * 0.5 * (1 - f) : 0;
      let R = r0 * k + 255 * ember, G = g0 * k + 110 * ember, B = b0 * k + 30 * ember;
      R += (255 - R) * f; G += (255 - G) * f; B += (255 - B) * f;
      const rad = Math.max(1, 0.03 * foc / z * (1 + 1.4 * f));
      g.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},${0.55 + 0.45 * f})`;
      g.beginPath(); g.arc(P[i * 3], P[i * 3 + 1], rad * (f > 0.05 ? 2 : 1), 0, 6.283); g.fill();
    }
    if (this.sel != null) { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(P[this.sel * 3], P[this.sel * 3 + 1], 9, 0, 6.283); g.stroke(); }
    this.ripples = this.ripples.filter(r => (r.t += dt) < 0.9);
    for (const r of this.ripples) { const u = r.t / 0.9; g.strokeStyle = `rgba(255,210,110,${(1 - u) * 0.9})`; g.lineWidth = 2; g.beginPath(); g.arc(P[r.i * 3], P[r.i * 3 + 1], 6 + 60 * Math.sqrt(u), 0, 6.283); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
  }
}
