/* ASTRO SHATTER — meshes.js : procedural geometry, generated at load (no model files).
   Rocks: icospheres displaced by fractal noise plus impact craters, stretched per shape, with smooth normals
   (the fragment shader adds fine normal-mapped detail). Debris: small faceted chips. The ship: a faceted
   arrowhead fighter with canopy, twin engine nacelles and a tail fin. Saucers: a lathed hull with dome and
   light ring. Classic mode outlines are also built here. Vertex format: pos3 normal3 rgba (a = emissive). */
const Meshes = (() => {
  'use strict';
  // ---- small seeded noise ----
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const h3 = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t);
  function vnoise(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(h3(xi, yi, zi), h3(xi + 1, yi, zi), xf), l(h3(xi, yi + 1, zi), h3(xi + 1, yi + 1, zi), xf), yf),
      l(l(h3(xi, yi, zi + 1), h3(xi + 1, yi, zi + 1), xf), l(h3(xi, yi + 1, zi + 1), h3(xi + 1, yi + 1, zi + 1), xf), yf), zf);
  }
  function fbm(x, y, z, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * (vnoise(x * f, y * f, z * f) * 2 - 1); n += a; a *= 0.5; f *= 2.03; } return s / n; }

  // ---- icosphere ----
  function icosphere(sub) {
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(v => { const l = Math.hypot(...v); return v.map(c => c / l); });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < sub; s++) {
      const cache = new Map(), F2 = [];
      const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache.has(k)) return cache.get(k); const p = V[a].map((c, i) => (c + V[b][i]) / 2), l = Math.hypot(...p); V.push(p.map(c => c / l)); cache.set(k, V.length - 1); return V.length - 1; };
      for (const [a, b, c] of F) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); F2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      F = F2;
    }
    return { V, F };
  }
  function smoothMesh(V, F, col) { // indexed -> interleaved with smooth normals
    const N = V.map(() => [0, 0, 0]);
    for (const [a, b, c] of F) { const n = cross(sub(V[b], V[a]), sub(V[c], V[a])); for (const i of [a, b, c]) { N[i][0] += n[0]; N[i][1] += n[1]; N[i][2] += n[2]; } }
    const out = new Float32Array(V.length * 10);
    V.forEach((v, i) => { const n = norm(N[i]); out.set([v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], col[3]], i * 10); });
    return { data: out, index: new Uint16Array(F.flat()), count: F.length * 3 };
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /** one rock shape: noise relief + craters, normalised so the mean radius is 1 */
  function rock(seed, subdiv) {
    const R = rng(seed * 7919 + 17), { V, F } = icosphere(subdiv);
    const st = [0.82 + R() * 0.36, 0.82 + R() * 0.36, 0.72 + R() * 0.3];
    const ox = R() * 100, oy = R() * 100, oz = R() * 100;
    const craters = []; for (let i = 0, k = 4 + (R() * 6 | 0); i < k; i++) { const c = norm([R() * 2 - 1, R() * 2 - 1, R() * 2 - 1]); craters.push({ c, r: 0.22 + R() * 0.34, d: 0.05 + R() * 0.09 }); }
    let sum = 0;
    const P = V.map(v => {
      let f = 1 + 0.26 * fbm(v[0] * 1.25 + ox, v[1] * 1.25 + oy, v[2] * 1.25 + oz, 5) + 0.05 * fbm(v[0] * 5 + oz, v[1] * 5 + ox, v[2] * 5 + oy, 2);
      for (const c of craters) { const t = Math.acos(Math.max(-1, Math.min(1, v[0] * c.c[0] + v[1] * c.c[1] + v[2] * c.c[2]))) / c.r; if (t < 1) f -= c.d * (1 - t * t); else if (t < 1.45) f += c.d * 0.35 * (1 - (t - 1) / 0.45); }
      const p = [v[0] * f * st[0], v[1] * f * st[1], v[2] * f * st[2]]; sum += Math.hypot(...p); return p;
    });
    const k = V.length / sum; for (const p of P) { p[0] *= k; p[1] *= k; p[2] *= k; }
    return smoothMesh(P, F, [1, 1, 1, 0]);
  }
  // flat-shaded triangle soup
  function Soup() { const a = []; return { tri(p, q, r, col) { const n = norm(cross(sub(q, p), sub(r, p))); for (const v of [p, q, r]) a.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], col[3]); }, quad(p, q, r, s, col) { this.tri(p, q, r, col); this.tri(p, r, s, col); }, done() { const d = new Float32Array(a); return { data: d, index: null, count: d.length / 10 }; } }; }
  function chip(seed) { // faceted debris chip
    const R = rng(seed * 31 + 5), { V, F } = icosphere(1);
    const P = V.map(v => { const f = 0.7 + R() * 0.55; return [v[0] * f, v[1] * f * (0.6 + R() * 0.4), v[2] * f * 0.7]; });
    const s = Soup(); for (const [a, b, c] of F) s.tri(P[a], P[b], P[c], [1, 1, 1, 0]); return s.done();
  }
  function ship() {
    const s = Soup();
    const HULL = [0.56, 0.59, 0.66, 0], HULL2 = [0.36, 0.39, 0.46, 0], DARK = [0.16, 0.18, 0.23, 0], RED = [0.85, 0.13, 0.12, 0], GLASS = [0.25, 0.85, 1.0, 0.55], HOT = [1.0, 0.55, 0.2, 1];
    const N = [17, 0, 0.6], CK = [4, 0, 4.2], RB = [-7, 0, 3.0], WL = [-11, -12.5, 0], WR = [-11, 12.5, 0], TL = [-8, 0, 0.3], BT = [-4, 0, -2.8], SL = [2, -4.6, 0.7], SR = [2, 4.6, 0.7];
    // top deck
    s.tri(N, SL, CK, HULL); s.tri(N, CK, SR, HULL);
    s.tri(CK, SL, RB, HULL2); s.tri(CK, RB, SR, HULL2);
    s.tri(SL, WL, RB, HULL); s.tri(RB, WR, SR, HULL);
    s.tri(WL, TL, RB, DARK); s.tri(RB, TL, WR, DARK);
    // belly
    s.tri(N, BT, SL, HULL2); s.tri(N, SR, BT, HULL2); s.tri(SL, BT, WL, DARK); s.tri(WR, BT, SR, DARK); s.tri(WL, BT, TL, DARK); s.tri(TL, BT, WR, DARK);
    // red wing-tip stripes (thin raised plates)
    for (const sg of [-1, 1]) { const a = [-6.2, 7.6 * sg, 0.45], b = [-10.2, 11.6 * sg, 0.12], c = [-10.9, 10.6 * sg, 0.2], d = [-7.2, 6.8 * sg, 0.55]; sg < 0 ? s.quad(a, b, c, d, RED) : s.quad(d, c, b, a, RED); }
    // canopy
    const C0 = [9.5, 0, 2.6], C1 = [3, -2.3, 3.7], C2 = [3, 2.3, 3.7], C3 = [1.2, 0, 5.3], C4 = [-1.5, 0, 4.0];
    s.tri(C0, C1, C3, GLASS); s.tri(C0, C3, C2, GLASS); s.tri(C1, C4, C3, GLASS); s.tri(C3, C4, C2, GLASS);
    // engine nacelles + glowing nozzles
    for (const sg of [-1, 1]) {
      const y0 = 3.2 * sg, y1 = 6.4 * sg, x0 = -12, x1 = -3.5, z0 = -1.2, z1 = 1.7;
      const box = (ax, bx, ay, by, az, bz, c, back) => {
        const p = (x, y, z) => [x, y, z];
        s.quad(p(bx, ay, bz), p(ax, ay, bz), p(ax, by, bz), p(bx, by, bz), c); // top
        s.quad(p(bx, by, az), p(ax, by, az), p(ax, ay, az), p(bx, ay, az), c); // bottom
        s.quad(p(ax, ay, az), p(ax, by, az), p(ax, by, bz), p(ax, ay, bz), back); // back (nozzle)
        s.quad(p(bx, ay, bz), p(bx, by, bz), p(bx, by, az), p(bx, ay, az), c); // front
        s.quad(p(ax, ay, az), p(ax, ay, bz), p(bx, ay, bz), p(bx, ay, az), c); s.quad(p(bx, by, az), p(bx, by, bz), p(ax, by, bz), p(ax, by, az), c);
      };
      box(x0, x1, Math.min(y0, y1), Math.max(y0, y1), z0, z1, HULL2, HOT);
      // a darker cowl ring just ahead of the nozzle
      box(x0 + 0.01, x0 + 1.6, Math.min(y0, y1) - 0.25, Math.max(y0, y1) + 0.25, z0 - 0.25, z1 + 0.25, DARK, HOT);
    }
    // tail fin (double sided)
    const F0 = [-4.5, 0, 3.0], F1 = [-11.5, 0, 3.0], F2 = [-12.5, 0, 7.2], F3 = [-9.5, 0, 7.2];
    s.quad(F0, F1, F2, F3, RED); s.quad(F3, F2, F1, F0, RED);
    return s.done();
  }
  function saucer() {
    const prof = [[0, 7.2], [3.2, 7.0], [5.6, 5.6], [7.2, 3.4], [8.6, 2.6], [15, 1.3], [20, 0.25], [20, -0.45], [15.5, -1.4], [9.5, -3.2], [5, -4.3], [0, -4.6]];
    const seg = 36, s = Soup();
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, z0] = prof[i], [r1, z1] = prof[i + 1];
      const dome = i < 3, rim = i === 5 || i === 6;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2;
        const P = (r, z, a) => [Math.cos(a) * r, Math.sin(a) * r, z];
        const lights = rim && i === 6 && k % 3 === 0;
        const col = dome ? [0.3, 1.0, 0.65, 0.7] : lights ? [1, 0.9, 0.4, 1] : i === 4 ? [0.2, 0.22, 0.28, 0] : rim ? [0.82, 0.84, 0.9, 0] : [0.55, 0.58, 0.66, 0];
        s.quad(P(r0, z0, a0), P(r1, z1, a0), P(r1, z1, a1), P(r0, z0, a1), col);
      }
    }
    return s.done();
  }
  // ---- classic vector outlines (unit radius) ----
  const CLASSIC_ROCKS = [
    [[0, -1], [0.5, -0.95], [1, -0.5], [0.75, 0], [1, 0.45], [0.45, 1], [-0.2, 0.75], [-0.5, 1], [-1, 0.5], [-0.8, 0], [-1, -0.5], [-0.45, -0.95]],
    [[-0.25, -1], [0.45, -1], [1, -0.6], [1, -0.15], [0.55, 0.2], [1, 0.5], [0.6, 1], [0.2, 0.8], [-0.5, 1], [-1, 0.45], [-1, -0.3], [-0.55, -0.55]],
    [[0, -1], [0.35, -0.6], [1, -0.75], [0.8, -0.1], [1, 0.35], [0.4, 1], [-0.3, 0.85], [-0.9, 1], [-0.75, 0.25], [-1, -0.25], [-0.65, -0.95]],
    [[-0.5, -1], [0.2, -0.85], [0.75, -1], [1, -0.35], [0.7, 0.15], [1, 0.6], [0.35, 1], [-0.35, 1], [-1, 0.6], [-0.6, 0], [-1, -0.55]],
  ];
  const CLASSIC_SHIP = [[16, 0], [-10, -9], [-6, -6], [-6, 6], [-10, 9]];
  const CLASSIC_SAUCER = [[[-20, 0], [20, 0]], [[-20, 0], [-8, -6]], [[20, 0], [8, -6]], [[-8, -6], [8, -6]], [[-8, -6], [-5, -12]], [[8, -6], [5, -12]], [[-5, -12], [5, -12]], [[-20, 0], [-8, 6]], [[20, 0], [8, 6]], [[-8, 6], [8, 6]]];
  return { rock, chip, ship, saucer, CLASSIC_ROCKS, CLASSIC_SHIP, CLASSIC_SAUCER, rng };
})();
