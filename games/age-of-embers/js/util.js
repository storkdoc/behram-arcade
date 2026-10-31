/* AGE OF EMBERS — shared helpers (no DOM; runs in browsers and in Node for bot playtests) */
(function (E) {
  'use strict';
  const U = E.U = {};
  U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  U.d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.rng = function (seed) {
    let s = (seed >>> 0) || 1;
    const r = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    r.int = (n) => Math.floor(r() * n);
    r.range = (a, b) => a + r() * (b - a);
    r.pick = (a) => a[Math.floor(r() * a.length)];
    r.state = () => s; r.setState = (v) => { s = v >>> 0; };
    return r;
  };
  // smooth value noise (tileable not needed)
  U.noise2 = function (seed) {
    const P = new Uint8Array(512), r = U.rng(seed);
    const p = []; for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = r.int(i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255];
    const G = []; for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; G.push([Math.cos(a), Math.sin(a)]); }
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    const n = function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const g = (ix, iy, dx, dy) => { const v = G[P[P[ix] + iy] & 255]; return v[0] * dx + v[1] * dy; };
      const u = fade(xf), v = fade(yf);
      const a = g(X, Y, xf, yf), b = g(X + 1, Y, xf - 1, yf), c = g(X, Y + 1, xf, yf - 1), d = g(X + 1, Y + 1, xf - 1, yf - 1);
      return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.41;
    };
    n.fbm = function (x, y, oct) { let s = 0, a = 1, f = 1, t = 0; for (let i = 0; i < (oct || 4); i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2.03; } return s / t; };
    return n;
  };
  // binary min-heap keyed by Float64 priority (indices into typed arrays)
  U.Heap = function (cap) {
    this.k = new Int32Array(cap); this.p = new Float64Array(cap); this.n = 0;
  };
  U.Heap.prototype.push = function (key, pri) {
    if (this.n >= this.k.length) { const k = new Int32Array(this.k.length * 2), p = new Float64Array(this.k.length * 2); k.set(this.k); p.set(this.p); this.k = k; this.p = p; }
    let i = this.n++; const K = this.k, P = this.p;
    while (i > 0) { const pa = (i - 1) >> 1; if (P[pa] <= pri) break; K[i] = K[pa]; P[i] = P[pa]; i = pa; }
    K[i] = key; P[i] = pri;
  };
  U.Heap.prototype.pop = function () {
    const K = this.k, P = this.p, top = K[0], n = --this.n;
    if (n > 0) {
      const key = K[n], pri = P[n]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && P[c + 1] < P[c]) c++; if (P[c] >= pri) break; K[i] = K[c]; P[i] = P[c]; i = c; }
      K[i] = key; P[i] = pri;
    }
    return top;
  };
  U.fmtTime = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return m + ':' + String(s % 60).padStart(2, '0'); };
  U.hexToRgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  U.shade = (h, f) => { const c = U.hexToRgb(h); const g = (v) => Math.round(U.clamp(f < 0 ? v * (1 + f) : v + (255 - v) * f, 0, 255)); return 'rgb(' + g(c[0]) + ',' + g(c[1]) + ',' + g(c[2]) + ')'; };
  U.mix = (h1, h2, t) => { const a = U.hexToRgb(h1), b = U.hexToRgb(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
