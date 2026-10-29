/* VORTEX — a vector tube shooter in the spirit of the 1981 arcade classic.
   Plain canvas + Web Audio, no dependencies. (c) 2026 Behram Arcade */
(() => {
'use strict';

/* ============================== setup ============================== */
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug') && params.get('debug') !== '0';
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d', { alpha: false });
const bx1 = document.createElement('canvas').getContext('2d');
const FILTER_OK = new URLSearchParams(location.search).has('nofilter') ? false : (() => { try { bx1.filter = 'blur(2px)'; const ok = bx1.filter === 'blur(2px)'; bx1.filter = 'none'; return ok; } catch (e) { return false; } })();
let W = 0, H = 0, DPR = 1, U = 1;
let SA = { l: 0, r: 0, t: 0, b: 0 };   // safe-area insets (notch / home indicator) in canvas px; 0 on desktop
let viewBoxHook = null;                 // touch layout: returns the screen box the tube must fit in (between the thumb controls)

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
const easeOut3 = t => 1 - Math.pow(1 - t, 3);
const easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const store = {
  get(k, d) { try { const v = localStorage.getItem('vortex.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('vortex.' + k, JSON.stringify(v)); } catch (e) {} }
};

/* ============================== vector font ============================== */
const FONT_SRC = {
  A:'0602204246|0444', B:'06003041423303|3344453606', C:'40000646', D:'00204244260600', E:'40000646|0333', F:'400006|0333',
  G:'400006464323', H:'0006|4046|0343', I:'0040|2026|0646', J:'40460604', K:'0006|400346', L:'000646', M:'0600224046',
  N:'06004640', O:'0040460600', P:'0600404303', Q:'0040460600|2446', R:'0600404303|1346', S:'400003434606', T:'0040|2026',
  U:'00064640', V:'002640', W:'0016233640', X:'0046|4006', Y:'002240|2226', Z:'00400646',
  '0':'0040460600|0640', '1':'112026|1636', '2':'004043030646', '3':'00404606|0343', '4':'000343|4046', '5':'400003434606',
  '6':'400006464303', '7':'004016', '8':'0040460600|0343', '9':'4303004046',
  '-':'0343', '.':'2526', ':':'2122|2526', '!':'2024|2526', '/':'0640', '?':'0040422324|2526', '=':'0242|0444',
  '<':'400346', '>':'004306', "'":'2021', ',':'2517', '(':'30121436', ')':'10323416', '+':'2125|0343', '_':'0646',
  '←':'0343|0321|0325', '→':'0343|4321|4325', '↑':'2026|2002|2042', '↓':'2026|2604|2644', '#':'1016|3036|0242|0444'
};
const FONT = {};
for (const k in FONT_SRC) FONT[k] = FONT_SRC[k].split('|').map(s => { const p = []; for (let i = 0; i < s.length; i += 2) p.push([+s[i], +s[i + 1]]); return p; });

function text(str, x, y, size, color, align = 'left', alpha = 1, lw) {
  str = String(str).toUpperCase();
  const s = size / 6, adv = size;
  const width = str.length * adv - 2 * s;
  let x0 = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || Math.max(1, size * 0.085);
  ctx.beginPath();
  for (let i = 0; i < str.length; i++) {
    const g = FONT[str[i]];
    if (g) for (const pl of g) {
      ctx.moveTo(x0 + pl[0][0] * s, y + pl[0][1] * s);
      for (let j = 1; j < pl.length; j++) ctx.lineTo(x0 + pl[j][0] * s, y + pl[j][1] * s);
      if (pl.length === 1) ctx.lineTo(x0 + pl[0][0] * s + 0.5, y + pl[0][1] * s);
    }
    x0 += adv;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  return width;
}

/* ============================== webs ============================== */
function buildCorners(poly, n, closed) {
  const edges = []; const m = closed ? poly.length : poly.length - 1; let total = 0;
  for (let i = 0; i < m; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); edges.push({ a, b, len }); total += len; }
  const c = edges.map(e => Math.max(1, Math.floor(e.len / total * n)));
  let sum = c.reduce((a, b) => a + b, 0);
  while (sum < n) { let bi = 0, bv = -1; edges.forEach((e, i) => { const v = e.len / c[i]; if (v > bv + 1e-9) { bv = v; bi = i; } }); c[bi]++; sum++; }
  while (sum > n) { let bi = -1, bv = 1e9; edges.forEach((e, i) => { if (c[i] > 1) { const v = e.len / (c[i] - 1); if (v < bv) { bv = v; bi = i; } } }); c[bi]--; sum--; }
  const out = [];
  edges.forEach((e, i) => { for (let k = 0; k < c[i]; k++) { const t = k / c[i]; out.push([lerp(e.a[0], e.b[0], t), lerp(e.a[1], e.b[1], t)]); } });
  if (!closed) out.push(poly[poly.length - 1].slice());
  return out;
}
function buildSmooth(fn, n, closed) {
  const S = 4000, pts = [];
  for (let i = 0; i <= S; i++) pts.push(fn(i / S));
  const cum = [0];
  for (let i = 1; i <= S; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[S], step = total / n, count = closed ? n : n + 1, out = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = Math.min(k * step, total);
    while (j < S - 1 && cum[j + 1] < target) j++;
    const seg = cum[j + 1] - cum[j], t = seg > 0 ? (target - cum[j]) / seg : 0;
    out.push([lerp(pts[j][0], pts[j + 1][0], t), lerp(pts[j][1], pts[j + 1][1], t)]);
  }
  return out;
}
function stepsPoly() {
  const u = 0.4, p = [[0, 0]]; let x = 0, y = 0;
  const seq = ['V', 'H', 'V', 'H', 'V', 'H', 'V'];
  for (const s of seq) { if (s === 'V') y += u; else x += u; p.push([x, y]); }
  x += u; p.push([x, y]);
  for (let i = seq.length - 1; i >= 0; i--) { if (seq[i] === 'V') y -= u; else x += u; p.push([x, y]); }
  return p;
}
const WEB_DEFS = [
  { name: 'CIRCLE', closed: true, fn: t => { const a = Math.PI / 2 + Math.PI / 16 - t * TAU; return [Math.cos(a), Math.sin(a)]; } },
  { name: 'SQUARE', closed: true, poly: [[-1, 1], [1, 1], [1, -1], [-1, -1]] },
  { name: 'PLUS', closed: true, poly: [[-1, 2], [1, 2], [1, 1], [2, 1], [2, -1], [1, -1], [1, -2], [-1, -2], [-1, -1], [-2, -1], [-2, 1], [-1, 1]] },
  { name: 'BOWTIE', closed: true, poly: [[-1, 0.8], [0, 0.32], [1, 0.8], [1, -0.8], [0, -0.32], [-1, -0.8]] },
  { name: 'CROSS', closed: true, poly: [[-0.75, 1.3], [0.75, 1.3], [0.35, 0.35], [1.3, 0.75], [1.3, -0.75], [0.35, -0.35], [0.75, -1.3], [-0.75, -1.3], [-0.35, -0.35], [-1.3, -0.75], [-1.3, 0.75], [-0.35, 0.35]] },
  { name: 'TRIANGLE', closed: true, poly: [[-1.15, 0.85], [1.15, 0.85], [0, -1.15]] },
  { name: 'CLOVER', closed: true, fn: t => { const a = Math.PI / 2 - t * TAU; const r = 0.64 - 0.36 * Math.cos(4 * a); return [r * Math.cos(a), r * Math.sin(a)]; } },
  { name: 'V', closed: false, camY: -1.05, poly: [[-1.3, -0.95], [0, 0.95], [1.3, -0.95]] },
  { name: 'STEPS', closed: false, camY: -1.1, poly: stepsPoly() },
  { name: 'U', closed: false, camY: -1.05, fn: t => {
      const L1 = 1.1, L2 = Math.PI, tot = 2 * L1 + L2, d = t * tot;
      if (d < L1) return [-1, -1 + d];
      if (d < L1 + L2) { const a = Math.PI - (d - L1); return [Math.cos(a), 0.1 + Math.sin(a) * 0.9]; }
      return [1, 0.1 - (d - L1 - L2)];
    } },
  { name: 'FLAT', closed: false, camY: -1.5, poly: [[-1.5, 0.6], [1.5, 0.6]] },
  { name: 'HEART', closed: true, fn: t => { const a = Math.PI - t * TAU; const s = Math.sin(a); return [16 * s * s * s / 17, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17]; } },
  { name: 'STAR', closed: true, poly: Array.from({ length: 16 }, (_, k) => { const a = Math.PI / 2 - k * TAU / 16; const r = k % 2 ? 0.52 : 1; return [r * Math.cos(a), r * Math.sin(a)]; }) },
  { name: 'W', closed: false, camY: -1.05, poly: [[-1.5, -0.9], [-0.75, 0.9], [0, -0.2], [0.75, 0.9], [1.5, -0.9]] },
  { name: 'BROKEN V', closed: false, camY: -1.05, poly: [[-1.5, -0.95], [-0.45, 0.95], [0.55, 0.15], [1.5, -0.95]] },
  { name: 'INFINITY', closed: true, noCenterBias: true, inwardFn: m => [sgn(m[0]) * 0.6, 0], fn: t => { const a = Math.PI / 2 - t * TAU; const d = 1 + Math.sin(a) * Math.sin(a); return [Math.cos(a) / d, Math.sin(a) * Math.cos(a) / d * 1.25]; } },
];
function finishWeb(d) {
  const n = d.closed ? 16 : 15;
  let pts = d.poly ? buildCorners(d.poly, n, d.closed) : buildSmooth(d.fn, n, d.closed);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 1 / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
  pts = pts.map(p => [(p[0] - cx) * s, (p[1] - cy) * s]);
  const P = i => pts[d.closed ? ((i % n) + n) % n : i];
  const lowest = () => { let best = 0, bv = -1e9; for (let i = 0; i < n; i++) { const a = P(i), b = P(i + 1); const v = (a[1] + b[1]) / 2 - (d.noCenterBias ? 0 : 0.12) * Math.abs((a[0] + b[0]) / 2); if (v > bv + 1e-6) { bv = v; best = i; } } return best; };
  let start;
  if (d.closed) { start = lowest(); if (P(start + 1)[0] < P(start)[0]) { pts.reverse(); start = lowest(); } }
  else { if (pts[0][0] > pts[n][0]) pts.reverse(); start = Math.floor(n / 2); }
  const w = { name: d.name, closed: d.closed, pts, n, camY: d.camY || 0, start, inward: [], railIn: [] };
  // inward normals per lane
  for (let i = 0; i < n; i++) {
    const a = P(i), b = P(i + 1), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const tgt = d.closed ? (d.inwardFn ? d.inwardFn(m) : [0, 0]) : [0, -3];
    if (nx * (tgt[0] - m[0]) + ny * (tgt[1] - m[1]) < 0) { nx = -nx; ny = -ny; }
    w.inward.push([nx, ny]);
  }
  const rails = d.closed ? n : n + 1;
  for (let r = 0; r < rails; r++) {
    const A = w.inward[d.closed ? ((r - 1 + n) % n) : Math.max(0, r - 1)], B = w.inward[d.closed ? r % n : Math.min(n - 1, r)];
    let x = A[0] + B[0], y = A[1] + B[1]; const l = Math.hypot(x, y) || 1; w.railIn.push([x / l, y / l]);
  }
  return w;
}
const WEBS = WEB_DEFS.map(finishWeb);

/* ============================== palettes ============================== */
const PALETTES = [
  { web: '#2f5dff', lane: '#ffe81a', claw: '#ffe81a', flipper: '#ff2a2a', tanker: '#c23cff', spiker: '#21ff4a', spike: '#21ff4a', pulsar: '#3cf6ff', eshot: '#ffffff', shot: '#fffb9a' },
  { web: '#ff2b2b', lane: '#39ff52', claw: '#39ff52', flipper: '#c23cff', tanker: '#36d8ff', spiker: '#ffe81a', spike: '#36d8ff', pulsar: '#ffe81a', eshot: '#ffffff', shot: '#d6ff9a' },
  { web: '#ffe11c', lane: '#3e74ff', claw: '#3e74ff', flipper: '#29ff46', tanker: '#ff3030', spiker: '#36e6ff', spike: '#ff3a3a', pulsar: '#ff47e6', eshot: '#ffffff', shot: '#b8ccff' },
  { web: '#2ff0ff', lane: '#4b66ff', claw: '#ffe81a', flipper: '#2bff4c', tanker: '#c23cff', spiker: '#ff3333', spike: '#ff3333', pulsar: '#ffe81a', eshot: '#ffffff', shot: '#fffb9a' },
  { web: '#1a2140', lane: '#ffe81a', claw: '#ffe81a', flipper: '#ff2a2a', tanker: '#c23cff', spiker: '#21ff4a', spike: '#21ff4a', pulsar: '#3cf6ff', eshot: '#ffffff', shot: '#fffb9a' },
  { web: '#25ff48', lane: '#ff3030', claw: '#ff3030', flipper: '#ffe81a', tanker: '#3e74ff', spiker: '#ff47e6', spike: '#ff47e6', pulsar: '#36e6ff', eshot: '#ffffff', shot: '#ffc0c0' },
];
// v4 enemies: fixed colours (distinct from every palette's classic enemies), intro level, attract-screen tip
const NEWE = {
  phaser: { col: '#ffa33d', ghost: '#ffd29a', intro: 4, name: 'PHASER', pts: 250, tip: 'BLINKS 2-3 LANES. SHOOT WHERE THE GHOST IS' },
  warden: { col: '#9fb4ff', shield: '#36e6ff', intro: 5, name: 'WARDEN', pts: 300, tip: 'SHIELDED. HIT IT MID-FLIP OR WHILE IT VENTS' },
  spark: { col: '#bffcff', core: '#36e6ff', intro: 7, name: 'SPARK', pts: 150, tip: 'HOMES IN. DODGE LATE OR LURE IT ONTO RIM FOES' },
  layer: { col: '#ff4fd8', mine: '#ff3a3a', intro: 8, name: 'MINE LAYER', pts: 350, tip: 'ITS MINES ARM ON THE RIM AND WALL OFF LANES' },
};
const RAINBOW = ['#ff2a2a', '#ffe81a', '#2bff4c', '#36e6ff', '#3e74ff', '#ff47e6', '#ffffff'];

/* ============================== projection ============================== */
const DD = 1.0, LL = 4.2;
let camZ = 0, rot = 0;
let view = { F: 100, cx: 0, cy: 0, camY: 0 };
let web = WEBS[0], pal = PALETTES[0];

function computeView(w, box) {
  const [ax0, ay0, ax1, ay1] = box || (viewBoxHook && viewBoxHook()) || [SA.l + W * 0.035, SA.t + H * 0.115, W - SA.r - W * 0.035, H - SA.b - H * 0.035];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of w.pts) for (const zw of [-0.18, LL]) {
    const s = 1 / (DD + zw), x = p[0] * s, y = (p[1] - w.camY) * s;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const F = Math.min((ax1 - ax0) / (x1 - x0), (ay1 - ay0) / (y1 - y0));
  return { F, cx: (ax0 + ax1) / 2 - F * (x0 + x1) / 2, cy: (ay0 + ay1) / 2 - F * (y0 + y1) / 2, camY: w.camY };
}
function proj(x, y, zw) {
  const d = DD + zw - camZ;
  if (d < 0.06) return null;
  if (rot) { const c = Math.cos(rot), s = Math.sin(rot); const nx = x * c - y * s; y = x * s + y * c; x = nx; }
  const s = view.F / d;
  return [view.cx + x * s, view.cy + (y - view.camY) * s];
}
function scaleAt(zw) { const d = DD + zw - camZ; return d < 0.06 ? 0 : view.F / d; }
function seg3(x1, y1, z1, x2, y2, z2) {
  const N = 0.1; const d1 = DD + z1 - camZ, d2 = DD + z2 - camZ;
  if (d1 < N && d2 < N) return;
  if (d1 < N) { const t = (N - d1) / (d2 - d1); x1 += (x2 - x1) * t; y1 += (y2 - y1) * t; z1 += (z2 - z1) * t; }
  else if (d2 < N) { const t = (N - d2) / (d1 - d2); x2 += (x1 - x2) * t; y2 += (y1 - y2) * t; z2 += (z1 - z2) * t; }
  const a = proj(x1, y1, z1), b = proj(x2, y2, z2);
  if (!a || !b) return;
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
}
const wrapLane = l => web.closed ? ((l % web.n) + web.n) % web.n : clamp(l, 0, web.n - 1);
const wrapRail = r => web.closed ? ((r % web.n) + web.n) % web.n : clamp(r, 0, web.n);
const rail = i => web.pts[web.closed ? ((i % web.n) + web.n) % web.n : clamp(i, 0, web.n)];
function laneDiff(a, b) { let d = b - a; if (web.closed) { d = ((d % web.n) + web.n) % web.n; if (d > web.n / 2) d -= web.n; } return d; }
function railF(f) { const i = Math.floor(f), t = f - i, a = rail(i), b = rail(i + 1); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]; }
function laneMid(l) { const a = rail(l), b = rail(l + 1); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function inwardF(f) { const i = Math.floor(f), t = f - i; const a = web.inward[wrapLane(i)], b = web.inward[wrapLane(i + 1)] || a; let x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t); const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

function flipSpan(lane, dir, t) {
  let pi, ai, bi;
  if (dir > 0) { pi = lane + 1; ai = lane; bi = lane + 2; } else { pi = lane; ai = lane + 1; bi = lane - 1; }
  const P = rail(pi), A = rail(ai), B = rail(bi);
  const a0 = Math.atan2(A[1] - P[1], A[0] - P[0]), a1 = Math.atan2(B[1] - P[1], B[0] - P[0]);
  let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da <= -Math.PI) da += TAU;
  const inw = web.railIn[web.closed ? wrapRail(pi) : clamp(pi, 0, web.n)];
  const am = a0 + da / 2;
  if (Math.cos(am) * inw[0] + Math.sin(am) * inw[1] < 0) da = da - sgn(da || 1) * TAU;
  const e = easeIO(t);
  const r = lerp(Math.hypot(A[0] - P[0], A[1] - P[1]), Math.hypot(B[0] - P[0], B[1] - P[1]), e), ang = a0 + da * e;
  return [P, [P[0] + Math.cos(ang) * r, P[1] + Math.sin(ang) * r]];
}
function spanOf(e) { return e.flipping ? flipSpan(e.lane, e.dir, e.ft) : [rail(e.lane), rail(e.lane + 1)]; }
// draw closed/open polygon of local (u, dz) points on a span at depth z
function shape(E0, E1, z, pts, close = true, su = 1) {
  let first = true;
  for (const q of pts) {
    const u = 0.5 + (q[0] - 0.5) * su;
    const p = proj(E0[0] + (E1[0] - E0[0]) * u, E0[1] + (E1[1] - E0[1]) * u, (z + q[1] * su) * LL);
    if (!p) return;
    if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]);
  }
  if (close) ctx.closePath();
}

/* ============================== sound ============================== */
const Sound = {
  ac: null, out: null, noiseBuf: null, humGain: null, muted: !!store.get('muted', false),
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = this.ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; comp.connect(ac.destination);
    this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : 0.6; this.out.connect(comp);
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    const hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 62;
    const lfo = ac.createOscillator(); lfo.frequency.value = 9; const lg = ac.createGain(); lg.gain.value = 18; lfo.connect(lg); lg.connect(hum.frequency); lfo.start();
    const hf = ac.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1100;
    this.humGain = ac.createGain(); this.humGain.gain.value = 0;
    hum.connect(hf); hf.connect(this.humGain); this.humGain.connect(this.out); hum.start();
  },
  // iOS / Android only start Web Audio inside a user gesture (touchend / pointerup / click / keydown):
  // resume the context there and play one silent sample so later sounds are allowed
  unlock() {
    this.init(); const ac = this.ac; if (!ac) return;
    if (ac.state !== 'running') { try { ac.resume(); } catch (e) {} }
    if (!this.unlocked) { try { const b = ac.createBuffer(1, 1, 22050), s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0); this.unlocked = true; } catch (e) {} }
  },
  toggle() {
    this.muted = !this.muted; store.set('muted', this.muted);
    if (this.out) this.out.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ac.currentTime, 0.02);
  },
  hum(v) { if (this.humGain) this.humGain.gain.setTargetAtTime(v, this.ac.currentTime, 0.03); },
  tone(type, f0, f1, dur, vol = 0.15, delay = 0) {
    const ac = this.ac; if (!ac) return; const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  // noise burst into an arbitrary node (used by the layered superzapper / spark sounds)
  nz(dest, t, dur, vol, type, f0, f1, q = 1) {
    const ac = this.ac, s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  osc(dest, type, t, dur, vol, pts, att = 0.006) {   // pts: [[time offset, freq], ...] exponential glide
    const ac = this.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(pts[0][1], t + pts[0][0]); for (let i = 1; i < pts.length; i++) o.frequency.exponentialRampToValueAtTime(Math.max(1, pts[i][1]), t + pts[i][0]);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05); return o;
  },
  crunchBus(gain) {   // soft-clip bus: tanh waveshaper for a gritty, loud-but-safe electric crack
    const ac = this.ac;
    if (!this.crunch) { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 3.2) / Math.tanh(3.2); } this.crunch = c; }
    const ws = ac.createWaveShaper(); ws.curve = this.crunch; ws.oversample = '2x';
    const g = ac.createGain(); g.gain.value = gain; g.connect(ws); ws.connect(this.out);
    setTimeout(() => { try { g.disconnect(); ws.disconnect(); } catch (e) {} }, 2500);
    return g;
  },
  // SUPERZAPPER: sub drop + thunder crack + detuned electric buzz through a sweeping band-pass + charge/discharge sweep
  // + a cloud of random high crackles + a shimmering tail. ~1.3 s.
  zapBig() {
    const ac = this.ac, t = ac.currentTime + 0.005, out = this.out, bus = this.crunchBus(0.85);
    this.osc(out, 'sine', t, 1.25, 0.55, [[0, 170], [1.1, 24]], 0.004);                 // sub drop (clean)
    this.osc(out, 'triangle', t, 0.5, 0.25, [[0, 95], [0.45, 38]], 0.003);
    this.nz(bus, t, 0.95, 0.55, 'lowpass', 9500, 160, 0.7);                              // thunder crack
    this.nz(bus, t, 0.12, 0.5, 'highpass', 3000, 9000, 0.7);                             // initial snap
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5;
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(3800, t + 0.28); bp.frequency.exponentialRampToValueAtTime(420, t + 1.2);
    const bg = ac.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.5, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
    bp.connect(bg); bg.connect(bus);
    for (const f of [55, 58.3, 110.6]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(bp); o.start(t); o.stop(t + 1.3); }
    this.osc(bus, 'square', t, 0.24, 0.07, [[0, 90], [0.22, 3400]]);                     // charge...
    this.osc(bus, 'sawtooth', t + 0.2, 1.0, 0.08, [[0, 3400], [0.95, 45]]);               // ...discharge
    for (let i = 0; i < 26; i++) {                                                        // crackle cloud, densest at the start
      const d = Math.pow(Math.random(), 1.7) * 1.1, f = rand(2200, 9500);
      this.nz(bus, t + d, rand(0.012, 0.05), rand(0.12, 0.32) * (1 - d * 0.5), Math.random() < 0.5 ? 'highpass' : 'bandpass', f, f * rand(0.5, 1.2), rand(0.8, 4));
    }
    // shimmer tail with fast vibrato
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 13; lg.gain.value = 45; lfo.connect(lg); lfo.start(t); lfo.stop(t + 1.3);
    for (const f of [1760, 2637]) { const o = this.osc(out, 'triangle', t + 0.06, 1.1, 0.045, [[0, f], [1.05, f * 0.7]], 0.03); lg.connect(o.frequency); }
  },
  sparkBoom() {
    const ac = this.ac, t = ac.currentTime + 0.005, bus = this.crunchBus(0.7);
    this.nz(bus, t, 0.7, 0.5, 'lowpass', 7000, 150, 0.7); this.osc(bus, 'sawtooth', t, 0.5, 0.12, [[0, 900], [0.48, 60]]);
    this.osc(this.out, 'sine', t, 0.5, 0.35, [[0, 120], [0.45, 35]]);
    for (let i = 0; i < 9; i++) { const d = Math.random() * 0.45, f = rand(3000, 9000); this.nz(bus, t + d, rand(0.01, 0.04), rand(0.1, 0.25), 'highpass', f, f, 1); }
  },
  noise(dur, vol, f0, f1, q = 1, type = 'bandpass', delay = 0) {
    const ac = this.ac; if (!ac) return; const t = ac.currentTime + delay;
    const s = ac.createBufferSource(); s.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random() * 1.0); s.stop(t + dur + 0.05);
  },
  play(n) {
    if (!this.ac || this.muted) return;
    switch (n) {
      case 'shoot': this.tone('square', 1500, 300, 0.075, 0.045); break;
      case 'hit': this.noise(0.42, 0.38, 3200, 160, 0.8); this.tone('triangle', 340, 50, 0.3, 0.16); break;
      case 'tanker': this.noise(0.5, 0.42, 1800, 90, 0.7); this.tone('sawtooth', 220, 40, 0.4, 0.12); break;
      case 'spike': this.tone('square', 2600, 1900, 0.035, 0.035); break;
      case 'flip': this.tone('triangle', 520, 880, 0.05, 0.05); break;
      case 'eshot': this.tone('sawtooth', 260, 900, 0.09, 0.035); break;
      case 'die': this.noise(1.6, 0.6, 5000, 60, 0.6, 'lowpass'); this.tone('sawtooth', 500, 30, 1.4, 0.2); break;
      case 'capture': this.tone('sawtooth', 300, 40, 1.3, 0.16); this.tone('square', 150, 30, 1.3, 0.08); break;
      case 'zap': this.zapBig(); break;
      case 'zap2': { const b = this.crunchBus(0.7), t = this.ac.currentTime; this.nz(b, t, 0.45, 0.45, 'lowpass', 8000, 300, 0.7); this.osc(b, 'sawtooth', t, 0.4, 0.1, [[0, 140], [0.12, 2400], [0.38, 90]]); this.osc(this.out, 'sine', t, 0.4, 0.35, [[0, 130], [0.38, 40]]); for (let i = 0; i < 8; i++) { const f = rand(3000, 9000); this.nz(b, t + Math.random() * 0.35, 0.025, 0.2, 'highpass', f, f, 1); } break; }
      case 'zkill': this.noise(0.2, 0.22, 5200, 700, 1.2); this.tone('square', 1900, 180, 0.12, 0.04); break;
      case 'phaseout': this.tone('sine', 700, 2600, 0.12, 0.09); this.tone('triangle', 1400, 3800, 0.12, 0.04); break;
      case 'phasein': this.tone('sine', 2600, 480, 0.15, 0.1); this.noise(0.12, 0.08, 6000, 1500, 3); break;
      case 'ping': this.tone('sine', 2400, 2350, 0.2, 0.1); this.tone('sine', 3720, 3700, 0.15, 0.05); this.tone('square', 1200, 900, 0.03, 0.03); break;
      case 'wbreak': this.noise(0.38, 0.38, 4200, 300, 0.9); this.tone('triangle', 900, 110, 0.32, 0.13); this.tone('sine', 3000, 1200, 0.2, 0.05); break;
      case 'wvent': this.tone('sawtooth', 320, 110, 0.26, 0.05); this.noise(0.25, 0.05, 1200, 400, 2); break;
      case 'drop': this.tone('square', 240, 230, 0.06, 0.07); this.tone('square', 160, 150, 0.08, 0.07, 0.075); break;
      case 'arm': this.tone('square', 1800, 1800, 0.05, 0.05); this.tone('square', 1800, 1800, 0.05, 0.05, 0.11); break;
      case 'fizz': this.noise(0.32, 0.12, 2500, 9000, 2, 'highpass'); break;
      case 'bump': this.tone('triangle', 140, 60, 0.09, 0.14); break;
      case 'mineboom': this.noise(0.6, 0.5, 2600, 90, 0.7); this.tone('sawtooth', 300, 40, 0.4, 0.12); break;
      case 'sparkspawn': this.noise(0.28, 0.08, 9000, 3000, 4); this.tone('sawtooth', 2200, 3300, 0.1, 0.02); break;
      case 'sparkwarn': this.tone('square', 1400, 2300, 0.1, 0.05); this.tone('square', 1400, 2300, 0.1, 0.05, 0.13); break;
      case 'sparkboom': this.sparkBoom(); break;
      case 'chain': [1047, 1319, 1568].forEach((f, i) => this.tone('square', f, f, 0.07, 0.06, i * 0.05)); break;
      case 'newenemy': [523, 784, 1047, 1568].forEach((f, i) => this.tone('triangle', f, f, 0.12, 0.09, i * 0.07)); break;
      case 'nozap': this.tone('square', 110, 100, 0.18, 0.09); break;
      case 'warp': this.tone('sawtooth', 70, 1800, 2.2, 0.12); this.noise(2.2, 0.16, 150, 7000, 0.5); break;
      case 'zoom': this.tone('sawtooth', 1600, 120, 1.2, 0.07); this.noise(1.1, 0.08, 6000, 300, 0.6); break;
      case 'life': [880, 1109, 1319, 1760, 1319, 1760].forEach((f, i) => this.tone('square', f, f, 0.09, 0.07, i * 0.085)); break;
      case 'start': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.1, 0.07, i * 0.07)); break;
      case 'tick': this.tone('square', 900, 900, 0.03, 0.05); break;
      case 'select': this.tone('square', 660, 1320, 0.14, 0.08); break;
      case 'fuse': this.noise(0.25, 0.2, 7000, 2000, 2); break;
      case 'swarm': [196, 247, 294].forEach((f, i) => this.tone('sawtooth', f, f * 0.7, 0.09, 0.05, i * 0.055)); break;
      case 'pack': [784, 988, 1175, 1568, 1976].forEach((f, i) => this.tone('square', f, f, 0.07, 0.065, i * 0.045)); this.noise(0.3, 0.1, 8000, 2500, 3); break;
      case 'bonus': [392, 523, 659, 784].forEach((f, i) => this.tone('triangle', f, f, 0.14, 0.12, i * 0.1)); break;
    }
  }
};


/* ============================== music ==============================
   Procedural chiptune / synthwave. Each level gets its own track (16 styles per
   16-level cycle, transposed + faster in later cycles). Low volume, routed through
   Sound.out so M mutes it too. Look-ahead scheduler for sample-accurate loops. */
const Music = {
  VOL: 0.26, bus: null, track: null, pending: null, step: 0, nextT: 0, timer: null, level: 0, cur: 0, offFor: 0,
  PROGS: [
    [[0, 0], [8, 1], [3, 1], [10, 1]], [[0, 0], [5, 0], [10, 1], [3, 1]], [[0, 0], [10, 1], [8, 1], [7, 1]], [[0, 0], [3, 1], [5, 0], [8, 1]],
    [[0, 0], [0, 0], [8, 1], [10, 1]], [[0, 0], [7, 0], [8, 1], [5, 0]], [[0, 0], [8, 1], [5, 0], [7, 1]], [[0, 0], [1, 1], [0, 0], [10, 1]],
  ],
  BASS: [
    [0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 0, null, 12, null],
    [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12],
    [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 12, null, null],
    [0, null, 7, null, 12, null, 7, null, 0, null, 7, null, 12, 10, 7, null],
  ],
  ARPS: [
    [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3],
    [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1],
    [0, 2, 1, 3, 2, 4, 3, 5, 0, 2, 1, 3, 2, 4, 3, 5],
    [4, 2, 0, 2, 4, 2, 0, 2, 5, 3, 1, 3, 5, 3, 1, 3],
  ],
  DRUMS: [ // k = kick, s = snare, h = hat, o = open hat
    'k.h.s.h.k.h.s.hh', 'k.hhs.hkk.hhs.ho', 'k..hs..hk.k.s..h', 'k.h.k.h.s.h.k.ho',
  ],
  ensure() {
    const ac = Sound.ac; if (!ac) return false;
    if (!this.bus) {
      this.bus = ac.createGain(); this.bus.gain.value = 0;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      this.bus.connect(lp); lp.connect(Sound.out);
      // echo send for the arpeggio
      this.dly = ac.createDelay(1); this.fb = ac.createGain(); this.fb.gain.value = 0.32; this.send = ac.createGain(); this.send.gain.value = 0.5;
      this.send.connect(this.dly); this.dly.connect(this.fb); this.fb.connect(this.dly); this.dly.connect(this.bus);
    }
    return true;
  },
  makeTrack(L) {
    const i = (L - 1) % 16, cyc = Math.floor((L - 1) / 16);
    let seed = 1234 + i * 7919 + cyc * 104729; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const bpm = Math.min(152, 112 + (i % 4) * 6 + (i >> 3) * 4 + cyc * 4);
    const root = 45 + [0, 5, -2, 3, 7, -4, 2, -5][i % 8] + (cyc % 3) * 2;
    const scale = [0, 3, 5, 7, 10];
    const lead = []; for (let k = 0; k < 64; k++) lead.push(k % 2 === 0 && rnd() < 0.55 ? scale[Math.floor(rnd() * 5)] + 12 * (rnd() < 0.3 ? 2 : 1) : null);
    return {
      L, bpm, root, s16: 60 / bpm / 4,
      prog: this.PROGS[i % 8], bass: this.BASS[(i + (i >> 3)) % 4], arp: this.ARPS[(i * 3 + cyc) % 4], drum: this.DRUMS[(i >> 1) % 4],
      bassWave: ['sawtooth', 'square', 'sawtooth', 'triangle'][i % 4], arpWave: i % 2 ? 'square' : 'sawtooth', lead, leadOn: i % 3 !== 1,
    };
  },
  play(L) {
    if (!this.ensure()) { this.level = L; return; }
    this.level = L; const t = this.makeTrack(L);
    if (!this.timer) { this.track = t; this.step = 0; this.nextT = Sound.ac.currentTime + 0.08; this.timer = setInterval(() => this.tick(), 25); }
    else this.pending = t;
  },
  // called every frame: decide target loudness from game state
  update(dt) {
    let want = 0;
    if (!paused) { if (state === 'zoom' || state === 'play') want = 1; else if (state === 'dying') want = 0.3; else if (state === 'warp') want = 0; }
    if (want > 0 && !this.timer && Sound.ac && this.level) this.play(this.level);
    if (this.bus && want !== this.cur) { this.cur = want; this.bus.gain.setTargetAtTime(want * this.VOL, Sound.ac.currentTime, want > 0 ? 0.35 : 0.25); }
    if (want === 0) { this.offFor += dt; if (this.offFor > 2 && this.timer) { clearInterval(this.timer); this.timer = null; } } else this.offFor = 0;
  },
  tick() {
    const ac = Sound.ac; if (!ac || !this.track) return;
    if (this.nextT < ac.currentTime - 0.05) this.nextT = ac.currentTime + 0.05; // recover after throttling
    while (this.nextT < ac.currentTime + 0.14) {
      if (this.pending && this.step % 16 === 0) { this.track = this.pending; this.pending = null; this.step = 0; }
      if (this.pending && this.cur === 0) { this.track = this.pending; this.pending = null; this.step = 0; }
      this.sched(this.track, this.step, this.nextT);
      this.nextT += this.track.s16; this.step = (this.step + 1) % 128;
    }
  },
  hz(m) { return 440 * Math.pow(2, (m - 69) / 12); },
  voice(type, f, t, dur, vol, { cut = 0, cutEnd = 0, q = 1, att = 0.004, dest = null, det = 0 } = {}) {
    const ac = Sound.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
    let n = o;
    if (cut) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q; fl.frequency.setValueAtTime(cut, t); if (cutEnd) fl.frequency.exponentialRampToValueAtTime(cutEnd, t + dur); o.connect(fl); n = fl; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(g); g.connect(dest || this.bus); o.start(t); o.stop(t + dur + 0.05);
    return g;
  },
  hit(t, dur, vol, type, f, q) {
    const ac = Sound.ac, s = ac.createBufferSource(); s.buffer = Sound.noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.bus); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  sched(tr, step, t) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, loop = Math.floor(step / 64);
    const [cr, minor] = [tr.prog[bar][0], tr.prog[bar][1] === 0];
    const chordRoot = tr.root + cr, tones = [0, minor ? 3 : 4, 7, 12, minor ? 15 : 16, 19];
    const S = tr.s16;
    // pad: once per bar, soft detuned saws
    if (s === 0) for (const iv of [12, 12 + tones[1], 19]) for (const dt of [-9, 9]) this.voice('sawtooth', this.hz(chordRoot + iv), t, S * 16 * 0.98, 0.018, { cut: 1400, cutEnd: 700, att: S * 3, det: dt });
    // bass
    const b = tr.bass[s]; if (b != null) this.voice(tr.bassWave, this.hz(chordRoot - 12 + b), t, S * 0.95, 0.2, { cut: 1600, cutEnd: 220, q: 6 });
    // arpeggio (with echo)
    const a = tr.arp[s]; if (a != null && (loop > 0 || bar > 0 || s >= 8)) {
      const g = this.voice(tr.arpWave, this.hz(chordRoot + 12 + tones[a]), t, S * 0.9, 0.05, { cut: 3200, cutEnd: 900, q: 3 }); g.connect(this.send);
    }
    // lead melody every other loop half
    if (tr.leadOn && (loop % 2 === 1)) { const n = tr.lead[step % 64]; if (n != null) this.voice('triangle', this.hz(tr.root + 12 + n), t, S * 1.8, 0.07, { att: 0.01 }); }
    // drums
    const d = tr.drum[s];
    if (d === 'k') { const ac = Sound.ac, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.25); }
    else if (d === 's') { this.hit(t, 0.14, 0.13, 'bandpass', 1900, 0.9); this.voice('triangle', 200, t, 0.08, 0.06); }
    else if (d === 'h') this.hit(t, 0.03, 0.045, 'highpass', 8000, 0.7);
    else if (d === 'o') this.hit(t, 0.16, 0.04, 'highpass', 7000, 0.7);
    if (s % 4 === 2 && d === '.') this.hit(t, 0.025, 0.022, 'highpass', 9000, 0.7);
  },
};

/* ============================== input ============================== */
const keys = {};
const touch = { on: false, fire: false, fireBtn: false, fireZone: false, pend: 0, auto: store.get('touchAuto', true) };   // touch controls: FIRE held, smart auto-fire
const mouse = { fire: false, used: false };
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyZ', 'KeyX', 'ControlLeft', 'ControlRight', 'Enter', 'NumpadEnter', 'KeyP', 'KeyM', 'KeyF', 'Escape', 'Backspace']);
addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code) || (state === 'initials' && /^Key[A-Z]$/.test(e.code))) e.preventDefault();
  Sound.init();
  const was = keys[e.code]; keys[e.code] = true;
  if (!was) onPress(e.code);
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.fire = false; if (inGame()) paused = true; });
/* Mouse (desktop): the claw tracks the pointer's position around the rim (absolute, eased by the same 20 ms filter as
   every other input); hold the left button to fire, right button = Superzapper. Ignored while touch controls are on. */
const isMouse = e => e.pointerType === 'mouse' && !touch.on;
addEventListener('pointermove', e => {
  if (!isMouse(e) || !inGame() || paused || window.__freeze_input) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null, last = evs && evs.length ? evs[evs.length - 1] : e;
  const q = rimCoordAt(last.clientX * DPR, last.clientY * DPR, player.aim); if (!q) return;
  if (web.closed && q.r < q.R * 0.18) return;          // too close to the centre: direction is ambiguous
  mouse.used = true; aimTo(q.c);
});
addEventListener('pointerdown', e => {
  if (!isMouse(e) || e.target.closest && e.target.closest('a')) return;
  if (inGame() && !paused) { if (e.button === 0) mouse.fire = true; else if (e.button === 2) onPress('Enter'); e.preventDefault(); }
  else if (e.button === 0 && e.target === canvas) {
    Sound.unlock();
    if (state === 'attract' || state === 'gameover') onPress('Space');
    else if (state === 'select') {
      const px = e.clientX * DPR, py = e.clientY * DPR, r = selRects.find(r => px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]);
      if (r) { if (r[4] === select.idx) startGame(); else { select.idx = r[4]; Sound.play('tick'); } }
    } else if (paused && inGame()) paused = false;
  }
});
addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) mouse.fire = false; });
addEventListener('contextmenu', e => { if (inGame()) e.preventDefault(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && inGame()) paused = true; });
addEventListener('mousemove', () => { if (inGame() && !paused) return; document.body.classList.add('showcursor'); clearTimeout(window.__ct); window.__ct = setTimeout(() => document.body.classList.remove('showcursor'), 1500); });
addEventListener('pointerdown', () => Sound.init());
for (const ev of ['pointerup', 'touchend', 'click']) addEventListener(ev, () => Sound.unlock(), true);
const pad = { prev: {}, ax: 0, lastAx: 0 };
function pollPad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : []; const g = gps && [...gps].find(x => x);
  if (!g) return;
  const b = i => g.buttons[i] && g.buttons[i].pressed;
  const ax = g.axes[0] || 0, steer = state === 'play' || state === 'zoom' || state === 'warp';
  // in game the left stick is analog (speed proportional to deflection, 0.2 dead zone); in menus it acts like the d-pad
  const dz = 0.2, m = Math.abs(ax) > dz ? sgn(ax) * Math.pow((Math.abs(ax) - dz) / (1 - dz), 1.5) : 0;
  pad.ax = steer ? m : 0; if (m) pad.lastAx = m;
  const map = { ArrowLeft: (!steer && ax < -0.5) || b(14), ArrowRight: (!steer && ax > 0.5) || b(15), ArrowUp: (g.axes[1] || 0) < -0.5 || b(12), ArrowDown: (g.axes[1] || 0) > 0.5 || b(13), Space: b(0) || b(7), Enter: b(1) || b(2) || b(6) || b(9), KeyP: b(8) };
  for (const k in map) { const v = !!map[k]; if (v !== !!pad.prev[k]) { keys[k] = v; if (v) { Sound.init(); onPress(k); } } pad.prev[k] = v; }
}

/* ============================== game state ============================== */
let state = 'attract', paused = false, T = 0;
let score = 0, lives = 3, level = 1, nextLife = 20000, bonusPending = 0, startLevel = 1;
let hiscores = store.get('hiscores', null);
if (!Array.isArray(hiscores)) hiscores = [['VTX', 50000, 20], ['ACE', 40000, 17], ['NEO', 30000, 13], ['ZAP', 25000, 11], ['ARC', 20000, 9], ['CRT', 15000, 7], ['PIX', 10000, 5], ['BIT', 8000, 4], ['SYN', 6000, 3], ['RAD', 5000, 2]];
let bestLevel = store.get('bestLevel', 1);
const player = { lane: 0, vis: 0, z: 0, alive: true, fireCd: 0, sub: 0, lean: 0, heat: 0, overheat: false, pos: 0.5, aim: 0.5 };
let enemies = [], pool = [], eshots = [], pshots = [], fx = [], msgs = [], spikes = [], mines = [], shards = [], bolts = [];
let zfx = null, seenTypes = new Set(), bumpT = 0, packClears = 0;
let shotsFired = 0;
let LP = null, spawnTimer = 0, zapUses = 0, zap = { active: false, t: 0, next: 0, flash: 0 }, pulseT = 0, pulseAmt = 0, pulsing = false;
let autofire = store.get('autofire2', false), invincible = false, fireLock = false;
let zoom = null, warp = null, death = null, eid = 0;
let move = { dir: 0, hold: 0, padOn: false };
let attract = { t: 0, web: 0, mode: 0, modeT: 0 };
let select = { idx: 0, t: 10, lastTick: 10 };
let initials = { chars: ['A', 'A', 'A'], pos: 0, rank: 0 };
let gameOverT = 0, shake = 0, flash = 0, flashColor = '#fff';
const inGame = () => ['zoom', 'play', 'warp', 'dying'].includes(state);

// arcade starting-level ladder and bonus values
const LADDER = [[1, 0], [3, 6000], [5, 16000], [7, 32000], [9, 54000], [11, 74000], [13, 94000], [15, 114000], [17, 134000], [20, 152000], [22, 170000], [24, 188000], [26, 208000], [28, 228000], [31, 248000], [33, 266000], [36, 284000], [38, 302000], [40, 320000], [42, 340000], [44, 360000], [47, 380000], [49, 400000], [52, 422000], [54, 442000], [56, 462000], [58, 482000], [60, 502000], [63, 522000], [65, 542000], [68, 562000], [70, 584000], [72, 606000], [74, 626000], [76, 646000], [79, 666000], [81, 688000], [84, 710000], [86, 732000], [88, 752000], [90, 774000], [92, 796000], [95, 818000], [97, 842000], [99, 868000]];

// v3 difficulty: steeper, arcade-like ramp (see README). s = level - 1
function levelParams(L) {
  const s = Math.min(L, 99) - 1;
  return {
    flipSpeed: Math.min(0.17 + 0.016 * s, 0.75),      // climb speed (tube lengths / s)
    flipRate: Math.min(0.45 + 0.07 * s, 2.2),          // in-tube flips per second
    flipDur: Math.max(0.13, 0.3 - 0.007 * s),
    rimFlipDur: Math.max(0.09, 0.22 - 0.006 * s),      // rim hunting: one lane flip
    rimPause: Math.max(0.02, 0.16 - 0.007 * s),        // rim hunting: pause between flips
    chaseBias: Math.min(0.4 + 0.04 * s, 0.92),
    tankerSpeed: Math.min(0.11 + 0.01 * s, 0.45),
    spikerSpeed: Math.min(0.18 + 0.011 * s, 0.55),
    spikerTurnMin: Math.max(0.12, 0.45 - 0.015 * s),
    fuseSpeed: Math.min(0.2 + 0.008 * s, 0.5),
    fuseRimPause: Math.max(0.12, 0.3 - 0.008 * s),
    pulsarSpeed: Math.min(0.13 + 0.01 * s, 0.5),
    pulsePeriod: Math.max(1.1, 2.2 - 0.04 * s),
    eshotSpeed: Math.min(0.5 + 0.015 * s, 1.1),
    fireRate: Math.min(0.22 + 0.05 * s, 1.2),
    maxEShots: Math.min(2 + Math.floor(s / 3), 6),
    maxActive: Math.min(4 + Math.floor(L / 2), 12),
    spawnGap: Math.max(0.25, 1.05 - 0.04 * s),
    grabDelay: Math.max(0.1, 0.25 - 0.0075 * s),      // rim enemy settled in your lane: time before it grabs (the kill window)
    phaseGone: Math.max(0.24, 0.44 - 0.006 * s),       // phaser: time between vanishing and re-appearing (ghost telegraph)
    sparkSpeed: Math.min(0.24 + 0.009 * s, 0.55),      // spark climb speed
    sparkLat: Math.min(1.9 + 0.045 * s, 3.6),          // spark max lateral speed (lanes / s) ...
    sparkAcc: Math.min(4.5 + 0.1 * s, 9),              // ... and steering acceleration: momentum makes a late dodge work
    mineSpeed: Math.min(0.17 + 0.005 * s, 0.34),       // mines drift up the lane at this speed
    mineLife: Math.max(5, 7.5 - 0.05 * s),             // armed rim mine lifetime
  };
}
function poolCounts(L) {
  const total = Math.min(14 + Math.floor(L * 1.5), 44);
  const tankers = L >= 2 ? Math.min(1 + Math.floor((L - 2) / 3), 6) : 0;
  const spikers = L >= 3 ? Math.min(1 + Math.floor((L - 3) / 4), 5) : 0;
  const fuses = L >= 6 ? Math.min(1 + Math.floor((L - 6) / 4), 5) : 0;
  const pulsars = L >= 9 ? Math.min(1 + Math.floor((L - 9) / 4), 6) : 0;
  const phasers = L >= 4 ? Math.min(1 + Math.floor((L - 4) / 4), 4) : 0;
  const wardens = L >= 5 ? Math.min(1 + Math.floor((L - 5) / 5), 3) : 0;
  const sparks = L >= 7 ? Math.min(1 + Math.floor((L - 7) / 3), 5) : 0;
  const layers = L >= 8 ? Math.min(1 + Math.floor((L - 8) / 6), 2) : 0;
  const flippers = Math.max(4, total - tankers - spikers - fuses - pulsars - phasers - wardens - sparks - layers);
  return { total: flippers + tankers + spikers + fuses + pulsars + phasers + wardens + sparks + layers, flippers, tankers, spikers, fuses, pulsars, phasers, wardens, sparks, layers };
}
function buildPool(L) {
  const c = poolCounts(L);
  const cargo = ['flipper']; if (L >= 17) cargo.push('fuseball'); if (L >= 25) cargo.push('pulsar');
  const list = [];
  for (let i = 0; i < c.tankers; i++) list.push({ type: 'tanker', cargo: cargo[randi(0, cargo.length - 1)] });
  for (let i = 0; i < c.spikers; i++) list.push({ type: 'spiker' });
  for (let i = 0; i < c.fuses; i++) list.push({ type: 'fuseball' });
  for (let i = 0; i < c.pulsars; i++) list.push({ type: 'pulsar' });
  for (const t of ['phaser', 'warden', 'spark', 'layer']) for (let i = 0; i < c[t + 's']; i++) list.push({ type: t });
  for (let i = 0; i < c.flippers - 2; i++) list.push({ type: 'flipper' });
  for (let i = list.length - 1; i > 0; i--) { const j = randi(0, i); [list[i], list[j]] = [list[j], list[i]]; }
  list.unshift({ type: 'flipper' }, { type: 'flipper' });
  return list;
}
function makeEnemy(type, lane, z, cargo) {
  const e = { id: ++eid, type, lane, z, cargo, dir: 1, flipping: false, ft: 0, flipDur: 0.3, spawnT: 0, pause: 0, landT: 0, spMul: rand(0.9, 1.12), mdir: -1, runs: 0, turnZ: 0.5, rail: lane, jumping: false, jt: 0, jdir: 1, jumpDur: 0.35, atRim: false, rimTimer: 0, phase: Math.random() * TAU };
  if (type === 'spiker') e.turnZ = rand(LP.spikerTurnMin, 0.72);
  if (type === 'fuseball') { e.rail = lane; }
  if (type === 'phaser') { e.ph = null; e.phT = 0; e.cd = rand(0.6, 1.4); e.tgt = lane; }
  if (type === 'warden') { e.shield = 3; e.vent = 0; e.ventCd = rand(1.4, 2.8); e.hitT = 0; }
  if (type === 'spark') { e.x = lane + 0.5; e.vx = 0; e.warned = false; }
  if (type === 'layer') { e.mode = 'dive'; e.cruiseZ = rand(0.5, 0.68); e.crawlT = rand(5.5, 7.5); e.dropCd = rand(0.6, 1.2); e.cdir = Math.random() < 0.5 ? -1 : 1; e.pause = 0.3; }
  return e;
}
function addScore(v) {
  score += v;
  while (score >= nextLife) { nextLife += 20000; if (lives < 6) { lives++; Sound.play('life'); msg('BONUS LIFE', 1.6, 0.36, pal.claw); } }
}
function msg(t, dur = 2, y = 0.5, color = '#fff', size = 5) { msgs = msgs.filter(m => m.y !== y); msgs.push({ t: 0, text: t, dur, y, color, size }); }

/* ============================== flow ============================== */
function startGame() {
  fireLock = true;
  score = 0; lives = 3; nextLife = 20000; seenTypes = new Set(); seenWaves = new Set(); packClears = 0; startLevel = LADDER[select.idx][0]; bonusPending = LADDER[select.idx][1];
  store.set('lastStart', select.idx);
  Sound.play('start');
  beginLevel(startLevel);
}
function beginLevel(L) {
  level = L; web = WEBS[(L - 1) % 16]; pal = PALETTES[Math.floor((L - 1) / 16) % PALETTES.length];
  LP = levelParams(L); spikes = new Array(web.n).fill(0); pool = buildPool(L);
  enemies = []; eshots = []; pshots = []; mines = []; shards = []; bolts = []; zfx = null; zapUses = 0; zap.active = false; rot = 0;
  placeClaw(web.start, 0); player.z = 0; player.alive = true; player.heat = 0; player.overheat = false;
  Music.play(L);
  if (L > bestLevel) { bestLevel = L; store.set('bestLevel', L); }
  beginZoom(-18, 1.5, true);
  msg('LEVEL ' + L, 2.2, 0.5, '#fff', 5.5);
  if (L > startLevel) msg('SUPERZAPPER RECHARGE', 2.2, 0.6, pal.claw, 3);
  waveReset(waveKind(L));
  if (wave.kind !== 'stream') { const W = WAVES[wave.kind]; msg('WAVE: ' + W.name, 2.6, 0.67, W.col, 2.8); if (!seenWaves.has(wave.kind)) { seenWaves.add(wave.kind); msg(W.tip, 2.8, 0.72, '#ffffff', 1.4); } }
}
function beginZoom(from, dur, full) {
  view = computeView(web); camZ = from; zoom = { t: 0, dur, from, full };
  spawnTimer = 1.4; state = 'zoom'; Sound.play('zoom');
}
function startWarp() {
  state = 'warp'; warp = { t: 0 }; eshots = []; player.z = 0; window.MoodSticker && window.MoodSticker.event('big'); window.MoodSticker && window.MoodSticker.screen('warp');
  Sound.play('warp');
  if (bonusPending > 0) { addScore(bonusPending); msg('BONUS ' + bonusPending, 2.4, 0.42, '#fff', 4.5); Sound.play('bonus'); bonusPending = 0; }
  if (spikes.some(s => s > 0.02)) msg('AVOID SPIKES', 2.0, 0.58, pal.spike, 4);
}
function killPlayer(kind, captor) {
  if (invincible || !player.alive) return;
  player.alive = false; eshots = [];
  death = { kind, t: 0, captor, exploded: false, inWarp: state === 'warp' };
  state = 'dying'; window.MoodSticker && window.MoodSticker.event('hit');
  if (kind === 'capture') Sound.play('capture'); else explodePlayer();
}
function explodePlayer() {
  death.exploded = true; Sound.play('die'); shake = 0.6; flash = 0.35; flashColor = '#fff';
  const f = player.vis, E0 = railF(f), E1 = railF(f + 1);
  fx.push({ x: (E0[0] + E1[0]) / 2, y: (E0[1] + E1[1]) / 2, zw: player.z * LL, t: 0, dur: 1.5, size: 0.75, rays: 30, colors: RAINBOW, seed: Math.random() * 6, big: true });
}
function finishDeath() {
  lives--;
  if (lives <= 0) { state = 'gameover'; gameOverT = 0; Sound.hum(0); window.MoodSticker && window.MoodSticker.event('lose'); window.MoodSticker && window.MoodSticker.screen('gameover'); return; }
  if (death.inWarp) { beginLevel(level + 1); return; }
  // remaining enemies return to the far end
  for (const e of enemies) pool.unshift(e.type === 'tanker' ? { type: 'tanker', cargo: e.cargo } : { type: e.type });
  enemies = []; eshots = []; pshots = []; mines = []; waveReset();
  player.alive = true; player.z = 0; placeClaw(player.lane, 0);
  beginZoom(-7, 0.9, false);
}
function qualifies(s) { return s > 0 && (hiscores.length < 10 || s > hiscores[hiscores.length - 1][1]); }

/* ============================== key events ============================== */
const INITIAL_SET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ .-'.split('');
function onPress(k) {
  if (k === 'KeyM') { Sound.toggle(); return; }
  if (k === 'KeyF' && inGame()) { autofire = !autofire; store.set('autofire2', autofire); msg(autofire ? 'AUTOFIRE ON' : 'AUTOFIRE OFF', 1.2, 0.68, '#9ff', 2.6); return; }
  const confirm = k === 'Enter' || k === 'NumpadEnter';
  if (DEBUG && inGame()) {
    if (k === 'KeyN') { pool = []; enemies = []; eshots = []; if (state === 'play') startWarp(); return; }
    if (k === 'KeyK') { for (const e of enemies) killEnemy(e, false); return; }
    if (k === 'KeyI') { invincible = !invincible; msg(invincible ? 'INVINCIBLE' : 'MORTAL', 1, 0.68, '#f0f', 2.5); return; }
    if (k === 'KeyS') { for (let i = 0; i < web.n; i++) spikes[i] = rand(0.2, 0.6); return; }
  }
  switch (state) {
    case 'attract':
      if (confirm || k === 'Space' || k === 'KeyZ') { state = 'select'; select.t = 10; select.lastTick = 10; select.idx = clamp(store.get('lastStart', 0), 0, LADDER.length - 1); const pl = parseInt(params.get('level')); if (pl) { const i = LADDER.findIndex(r => r[0] >= pl); if (i >= 0) select.idx = i; } Sound.play('select'); }
      else if (k === 'Escape') location.href = '../../index.html';
      break;
    case 'select':
      if (k === 'ArrowLeft' || k === 'ArrowDown') { select.idx = Math.max(0, select.idx - 1); Sound.play('tick'); }
      else if (k === 'ArrowRight' || k === 'ArrowUp') { select.idx = Math.min(LADDER.length - 1, select.idx + 1); Sound.play('tick'); }
      else if (confirm || k === 'KeyZ' || k === 'Space' || k === 'ControlLeft' || k === 'ControlRight') startGame();
      else if (k === 'Escape') state = 'attract';
      break;
    case 'zoom': case 'play': case 'warp': case 'dying':
      if (k === 'KeyP' || k === 'Escape') { paused = !paused; return; }
      if (paused) { if (confirm || k === 'Space') paused = false; return; }
      if (confirm && state === 'play') superzap();
      break;
    case 'gameover':
      if (gameOverT > 1.2 && (confirm || k === 'Space')) endGameOver();
      break;
    case 'initials': {
      const I = initials; let ci = INITIAL_SET.indexOf(I.chars[I.pos]);
      if (k === 'ArrowUp' || k === 'ArrowRight') { I.chars[I.pos] = INITIAL_SET[(ci + 1) % INITIAL_SET.length]; Sound.play('tick'); }
      else if (k === 'ArrowDown' || k === 'ArrowLeft') { I.chars[I.pos] = INITIAL_SET[(ci - 1 + INITIAL_SET.length) % INITIAL_SET.length]; Sound.play('tick'); }
      else if (/^Key[A-Z]$/.test(k)) { I.chars[I.pos] = k[3]; Sound.play('tick'); if (I.pos < 2) I.pos++; }
      else if (k === 'Backspace') { if (I.pos > 0) I.pos--; }
      else if (confirm || k === 'Space' || k === 'ControlLeft') {
        Sound.play('select');
        if (I.pos < 2) I.pos++;
        else { hiscores.splice(I.rank, 0, [I.chars.join(''), score, level]); hiscores = hiscores.slice(0, 10); store.set('hiscores', hiscores); state = 'attract'; attract.mode = 1; attract.modeT = 0; }
      }
      break;
    }
  }
}
function endGameOver() {
  if (qualifies(score)) { state = 'initials'; initials = { chars: ['A', 'A', 'A'], pos: 0, rank: hiscores.findIndex(h => score > h[1]) }; if (initials.rank < 0) initials.rank = hiscores.length; }
  else { state = 'attract'; attract.mode = 1; attract.modeT = 0; }
}

/* ============================== player ============================== */
function verticalDir(sign) {
  const cur = player.lane, cands = [-1, 1]; let best = 0, bv = 0;
  const yOf = l => { const m = laneMid(l); const p = proj(m[0], m[1], 0); return p ? p[1] : 0; };
  const y0 = yOf(cur); const a = rail(cur), b = rail(cur + 1); const lw = Math.hypot(b[0] - a[0], b[1] - a[1]) * scaleAt(0);
  for (const d of cands) {
    const nl = cur + d; if (!web.closed && (nl < 0 || nl >= web.n)) continue;
    const dy = (yOf(wrapLane(nl)) - y0) * sign;
    if (dy > lw * 0.2 && dy > bv) { bv = dy; best = d; }
  }
  return best;
}
/* Continuous rim position (v4). player.pos is a real-valued lane coordinate (lane + fraction; unwrapped on closed
   webs so there is never a wrap-around jump). Every input device writes player.aim; pos eases toward aim with a ~20 ms
   exponential filter, so motion is analog, interpolated and jitter-free at any frame rate. Derived each tick:
   lane = floor(pos); sub (-1 / 0 / +1 edge-centre-edge, with hysteresis) for the rim-grab rule; vis + lean for drawing
   (the claw rests in its lane and only hops across a rail in the last 14 % of the lane). Keyboard / d-pad taps step
   one third of a lane, holds accelerate smoothly; the stick is proportional; mouse and touch track the rim directly. */
const MOVE = { tau: 0.02, keyV0: 5.5, keyVmax: 17, keyAcc: 26, padVmax: 15, edge: 0.14 };
const laneOfPos = p => web.closed ? wrapLane(Math.floor(p)) : clamp(Math.floor(p), 0, web.n - 1);
function placeClaw(l, sub) { player.pos = player.aim = Math.floor(l) + 0.5 + (sub || 0) / 3; player.sub = sub || 0; player.lane = laneOfPos(player.pos); updateVis(); }
function mineAt(l) { for (const m of mines) if (m.armed && !m.dead && m.lane === l) return m; return null; }
// move a -> b along the rim, stopping at the rail before a lane walled off by an armed rim mine
function constrainMove(a, b, quiet) {
  if (!web.closed) b = clamp(b, MOVE.edge + 0.01, web.n - MOVE.edge - 0.01);
  if (!mines.length) return b;
  const dir = sgn(b - a); if (!dir) return b;
  let l = Math.floor(a);
  for (let k = 0; k < 64; k++) {
    const rl = dir > 0 ? l + 1 : l;
    if (dir > 0 ? b < rl : b >= rl) return b;
    const next = dir > 0 ? l + 1 : l - 1;
    if (mineAt(laneOfPos(next))) { if (!quiet) bumpWall(laneOfPos(next)); return dir > 0 ? rl - 0.03 : rl + 0.03; }
    l = next;
  }
  return b;
}
function bumpWall(l) { if (T - bumpT > 0.35) { bumpT = T; Sound.play('bump'); const m = mineAt(l); if (m) m.bump = 0.25; } }
function aimAdd(d) { if (d) player.aim = constrainMove(player.aim, player.aim + d); }
function aimTo(c) {   // absolute rim coordinate (mouse): nearest equivalent to the current aim on closed webs
  if (web.closed) c += Math.round((player.aim - c) / web.n) * web.n;
  player.aim = constrainMove(player.aim, c);
}
// next third-of-a-lane stop in direction d (stops at lane + 1/6, 1/2, 5/6 = sub -1, 0, +1)
function subStop(p, d) { const x = p * 3 - 0.5; return ((d > 0 ? Math.floor(x + 1e-6) + 1 : Math.ceil(x - 1e-6) - 1) + 0.5) / 3; }
function settle(d) { const x = player.pos * 3 - 0.5;   // from the visible position: no lurch forward on release
  player.aim = constrainMove(player.aim, ((d > 0 ? Math.ceil(x - 1e-6) : Math.floor(x + 1e-6)) + 0.5) / 3, true); }
function verticalDir(sign) {
  const cur = player.lane, cands = [-1, 1]; let best = 0, bv = 0;
  const yOf = l => { const m = laneMid(l); const p = proj(m[0], m[1], 0); return p ? p[1] : 0; };
  const y0 = yOf(cur); const a = rail(cur), b = rail(cur + 1); const lw = Math.hypot(b[0] - a[0], b[1] - a[1]) * scaleAt(0);
  for (const d of cands) {
    const nl = cur + d; if (!web.closed && (nl < 0 || nl >= web.n)) continue;
    const dy = (yOf(wrapLane(nl)) - y0) * sign;
    if (dy > lw * 0.2 && dy > bv) { bv = dy; best = d; }
  }
  return best;
}
function handleMove(dt) {
  // keyboard / d-pad (arrow sense reversed since v2: Left = toward higher lane index)
  let d = 0;
  if (keys.ArrowLeft && !keys.ArrowRight) d = 1; else if (keys.ArrowRight && !keys.ArrowLeft) d = -1;
  else if (keys.ArrowUp) d = -verticalDir(-1); else if (keys.ArrowDown) d = -verticalDir(1);
  if (d !== move.dir) {
    if (move.dir && move.hold > 0.14) settle(move.dir);           // release after a hold: glide on to the next stop
    move.dir = d; move.hold = 0;
    if (d) player.aim = constrainMove(player.aim, subStop(player.aim, d));   // tap = exactly one third of a lane
  } else if (d) {
    move.hold += dt;
    if (move.hold > 0.14) aimAdd(d * Math.min(MOVE.keyVmax, MOVE.keyV0 + MOVE.keyAcc * (move.hold - 0.14)) * dt);
  }
  // analog stick: speed proportional to deflection
  if (pad.ax) { aimAdd(-pad.ax * MOVE.padVmax * dt); move.padOn = true; }
  else if (move.padOn) { move.padOn = false; settle(-sgn(pad.lastAx)); }
  // critically-damped-ish exponential ease toward the aim (frame-rate independent)
  const k = 1 - Math.exp(-dt / MOVE.tau);
  let np = player.pos + (player.aim - player.pos) * k;
  if (Math.abs(player.aim - np) < 1e-4) np = player.aim;
  const cp = constrainMove(player.pos, np, true);
  if (cp !== np) player.aim = cp;
  player.pos = cp;
  if (web.closed && Math.abs(player.pos) > web.n * 4) { const s = Math.round(player.pos / web.n) * web.n; player.pos -= s; player.aim -= s; }
  player.lane = laneOfPos(player.pos);
  updateVis();
}
function updateVis() {
  const p = player.pos, l = Math.floor(p), f = p - l, E = MOVE.edge;
  let o = 0, lean;
  if (f < E) { o = -(E - f) / E * 0.5; lean = -f / E; }
  else if (f > 1 - E) { o = (f - (1 - E)) / E * 0.5; lean = (1 - f) / E; }
  else lean = (f - E) / (1 - 2 * E) * 2 - 1;
  player.vis = web.closed ? (((l + o) % web.n) + web.n) % web.n : l + o;
  player.lean = lean;
  const s = player.sub, h = 0.04, lo = 1 / 3 + (s === -1 ? h : -h), hi = 2 / 3 + (s === 1 ? -h : h);
  player.sub = f < lo ? -1 : f > hi ? 1 : 0;
}
// screen point (canvas px) -> rim coordinate. Closed webs: by angle around the rim's centre; open webs: by x.
// Multi-valued shapes (infinity, cross...) pick the crossing nearest to `ref`, so tracking is continuous.
function rimCoordAt(px, py, ref) {
  const N = web.n * 10, S = [];
  let cx = 0, cy = 0;
  for (let i = 0; i <= N; i++) { const c = i / 10, q = railF(c), p = proj(q[0], q[1], 0); if (!p) return null; S.push([c, p[0], p[1]]); if (i < N) { cx += p[0]; cy += p[1]; } }
  cx /= N; cy /= N;
  const g = web.closed ? (x, y) => Math.atan2(y - cy, x - cx) : (x) => x;
  const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const gf = g(px, py); let best = null, bd = 1e9;
  const dist = c => { let d = c - ref; if (web.closed) { d = ((d % web.n) + web.n) % web.n; if (d > web.n / 2) d -= web.n; } return Math.abs(d); };
  for (let i = 0; i < N; i++) {
    const g0 = g(S[i][1], S[i][2]), g1 = g(S[i + 1][1], S[i + 1][2]);
    const dg = web.closed ? wrapA(g1 - g0) : g1 - g0; if (Math.abs(dg) < 1e-9) continue;
    const t = (web.closed ? wrapA(gf - g0) : gf - g0) / dg;
    if (t < 0 || t > 1) continue;
    const c = S[i][0] + t * (S[i + 1][0] - S[i][0]), dd = dist(c);
    if (dd < bd) { bd = dd; best = c; }
  }
  if (best == null) { if (web.closed) return null; let bx = 1e9; for (const s of S) { const dx = Math.abs(s[1] - px); if (dx < bx) { bx = dx; best = s[0]; } } }
  let R = 0; for (let i = 0; i < N; i += 5) R += Math.hypot(S[i][1] - cx, S[i][2] - cy); R /= Math.ceil(N / 5);
  return { c: best, r: Math.hypot(px - cx, py - cy), R };
}
const rimDiff = (a, b) => { let d = b - a; if (web.closed) { d = ((d % web.n) + web.n) % web.n; if (d > web.n / 2) d -= web.n; } return d; };
function handleFire(dt) {
  player.fireCd -= dt;
  let manual = keys.Space || keys.KeyZ || keys.KeyX || keys.ControlLeft || keys.ControlRight || touch.fire || mouse.fire;
  if (fireLock) { if (!manual) fireLock = false; manual = false; }
  // rapid-fire cap (v3): max 8 shots on screen + barrel heat. Holding fire gives ~5-shot bursts with a cool-down gap,
  // so a held button can't keep a solid wall of shots in the lane; deliberate taps at a human rate never overheat.
  player.heat = Math.max(0, (player.heat || 0) - FIRE.cool * dt);
  if (player.overheat && player.heat <= FIRE.resume) player.overheat = false;
  // smart auto-fire (F key / touch AUTO): only shoots while something shootable is *down the tube* in the claw's lane
  // (or about to flip into it), so it never burns barrel heat on an empty tube. It deliberately ignores enemies already
  // on the rim: the timed rim shot stays a manual skill and the anti-camping rule still bites.
  const auto = (touch.on ? touch.auto : autofire) && player.fireCd <= 0 && laneHasTarget(player.lane);
  if ((auto || manual) && player.fireCd <= 0 && pshots.length < FIRE.maxShots && !player.overheat) {
    pshots.push({ lane: player.lane, z: player.z, pz: player.z, born: T }); shotsFired++;
    player.fireCd = manual ? FIRE.cd : 0.11;
    player.heat += 1; if (player.heat >= FIRE.max) player.overheat = true;
    Sound.play('shoot');
    checkShotHits();
  }
}
const FIRE = { maxShots: 8, cd: 0.07, cool: 6, max: 6, resume: 3, speed: 2.3 };
function laneHasTarget(l) {
  if (spikes[l] > 0.02) return true;
  for (const s of eshots) if (s.lane === l) return true;
  for (const m of mines) if (!m.armed && m.lane === l) return true;
  for (const e of enemies) {
    if (e.spawnT < 0.5) continue;
    const hl = hittableLane(e);
    if (hl === l && (e.z > 0 || e.type === 'fuseball')) return true;
    if (e.z > 0 && e.z < 0.5 && e.lane !== l && Math.abs(laneDiff(e.lane, l)) === 1) return true;  // likely to flip in
  }
  return false;
}
function superzap() {
  if (zapUses === 0) {
    zapUses = 1; zap.active = true; zap.t = 0; zap.next = 0.05; zap.flash = 0.75; Sound.play('zap');
    zapFxStart(true);
    for (const s of eshots) shardBurst(laneMid(s.lane), s.z * LL, ['#ffffff', '#ff6af0'], 5, 0.5);
    eshots = [];
    for (const m of mines) { const c = laneMid(m.lane); shardBurst(c, m.z * LL, [NEWE.layer.mine, '#ffffff'], 8, 0.8); boltTo([c[0], c[1], m.z * LL]); }
    mines = [];
  } else if (zapUses === 1) {
    zapUses = 2; Sound.play('zap2'); zap.flash = 0.25; zapFxStart(false);
    const live = enemies.filter(e => e.spawnT >= 1);
    if (live.length) { zap.kill = true; killEnemy(live[randi(0, live.length - 1)], false); zap.kill = false; }
  } else Sound.play('nozap');
}
/* ---------- superzapper / disintegration effects ----------
   zfx: one timeline per zap (arcs race down every rail, rim + far-ring crackle, chromatic tube-ring and screen
   shockwave, white flash, bloom surge). shards: 3D line fragments from disintegrated enemies, drawn in a handful
   of batched paths. bolts: jagged lightning from the claw to each zapped enemy. All capped for phones. */
const SHARD_MAX = 420;
function zapFxStart(big) { zfx = { t: 0, big }; if (big) shake = Math.max(shake, 0.32); }
function shardBurst(c, zw, cols, n, power = 1) {
  const s = scaleAt(Math.max(0, zw)) || 1;
  for (let i = 0; i < n; i++) {
    if (shards.length >= SHARD_MAX) shards.shift();
    const a = Math.random() * TAU, sp = rand(0.25, 1.1) * power, el = rand(-1, 1);
    shards.push({ x: c[0], y: c[1], z: zw, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.6, vz: el * sp * 1.6 + 0.6 * power,
      a: Math.random() * TAU, va: rand(-14, 14), len: rand(0.018, 0.05) * (1 + power * 0.4), t: 0, dur: rand(0.5, 1.05), c: cols[i % cols.length] });
  }
}
function clawWorld() { const c = railF(player.vis + 0.5); return [c[0], c[1], player.z * LL]; }
function boltTo(p) { if (bolts.length < 24) bolts.push({ a: clawWorld(), b: p, t: 0, dur: 0.2 }); }
function updFxParts(dt) {
  if (zfx) { zfx.t += dt; if (zfx.t > 1.4) zfx = null; }
  if (shards.length) {
    const damp = Math.exp(-2.2 * dt);
    for (const s of shards) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vx *= damp; s.vy *= damp; s.vz = s.vz * damp + 0.9 * dt; s.a += s.va * dt; }
    shards = shards.filter(s => s.t < s.dur);
  }
  if (bolts.length) { for (const b of bolts) b.t += dt; bolts = bolts.filter(b => b.t < b.dur); }
  for (const m of mines) if (m.bump > 0) m.bump -= dt;
}

/* ============================== enemies ============================== */
function centerOf(e) {
  if (e.type === 'spark') { const p = railF(e.x); return [p[0], p[1], e.z * LL]; }
  if (e.type === 'fuseball') { const r = e.jumping ? e.rail + e.jdir * e.jt : e.rail; const p = railF(r); return [p[0], p[1], e.z * LL]; }
  const [A, B] = spanOf(e); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, e.z * LL];
}
function enemyColor(e) { return e.type === 'fuseball' ? '#fff' : NEWE[e.type] ? NEWE[e.type].col : pal[e.type] || '#fff'; }
function killEnemy(e, byShot) {
  if (e.dead) return; e.dead = true;
  const c = centerOf(e);
  let pts = 0;
  switch (e.type) {
    case 'flipper': pts = 150; break;
    case 'tanker': pts = 100; break;
    case 'spiker': pts = 50; break;
    case 'pulsar': pts = 200; break;
    case 'fuseball': pts = e.z > 0.66 ? 250 : e.z > 0.33 ? 500 : 750; break;
    default: if (NEWE[e.type]) pts = NEWE[e.type].pts;
  }
  addScore(pts);
  const zapped = zap.active || zap.kill;
  fx.push({ x: c[0], y: c[1], zw: c[2], t: 0, dur: 0.55, size: 0.42, rays: 12, colors: ['#fff', enemyColor(e), '#ffe81a'], seed: Math.random() * 6 });
  // disintegration: line shards in the enemy's colour (a big cloud for zapped enemies, a few for normal kills)
  shardBurst(c, c[2], [enemyColor(e), '#ffffff', zapped ? '#7df9ff' : enemyColor(e)], zapped ? 22 : 7, zapped ? 1.25 : 0.7);
  if (zapped) boltTo(c);
  if (e.pack) packKill(e, zapped);
  if (e.type === 'tanker' && byShot) { splitTanker(e); Sound.play('tanker'); } else Sound.play(zapped ? 'zkill' : 'hit');
}
function startFlip(e, dir, dur) {
  let t = e.lane + dir;
  if (!web.closed && (t < 0 || t >= web.n)) { dir = -dir; t = e.lane + dir; if (t < 0 || t >= web.n) return false; }
  e.flipping = true; e.dir = dir; e.ft = 0; e.flipDur = dur; return true;
}
function splitTanker(e) {
  const z = Math.max(0, e.z), c = e.cargo || 'flipper';
  if (c === 'fuseball') {
    for (const r of [e.lane, e.lane + 1]) { const f = makeEnemy('fuseball', wrapRail(r), z); f.spawnT = 1; f.mdir = z <= 0 ? 1 : -1; if (z <= 0) f.z = 0.01; enemies.push(f); }
  } else {
    for (const d of [-1, 1]) { const ch = makeEnemy(c, e.lane, z); ch.spawnT = 1; ch.pause = LP.rimPause; startFlip(ch, d, LP.flipDur * 0.85); enemies.push(ch); }
  }
}
function maybeFire(e, dt) {
  if (e.z > 0.12 && e.z < 0.92 && !e.flipping && eshots.length < LP.maxEShots && Math.random() < LP.fireRate * dt) {
    eshots.push({ lane: e.lane, z: e.z, pz: e.z, spin: Math.random() * 6 }); Sound.play('eshot');
  }
}
function rimGrab(e) { if (e.type === 'pulsar') killPlayer('zap'); else killPlayer('capture', e); }
function updFlipper(e, dt) {
  const pl = player.lane;
  if (e.flipping) {
    e.ft += dt / e.flipDur;
    // a rim flipper flipping into the claw's lane pivots on the shared rail; if the claw sits on that edge
    // (sub-position facing the incoming flipper) it is grabbed as soon as the flipper swings past vertical
    if (e.z <= 0 && player.alive && state === 'play' && e.ft >= 0.5 && wrapLane(e.lane + e.dir) === pl && player.sub === -e.dir) { rimGrab(e); return; }
    if (e.z > 0) e.z = Math.max(0, e.z - (e.type === 'pulsar' ? LP.pulsarSpeed : LP.flipSpeed) * e.spMul * dt * 0.35);
    if (e.ft >= 1) { e.flipping = false; e.lane = wrapLane(e.lane + e.dir); e.ft = 0; e.landT = 0; if (e.z <= 0) e.pause = LP.rimPause; if (e.z <= 0) Sound.play('flip'); }
    return;
  }
  if (e.z > 0) {
    e.z -= (e.type === 'pulsar' ? LP.pulsarSpeed : LP.flipSpeed) * e.spMul * dt;
    if (e.z <= 0) { e.z = 0; e.pause = LP.rimPause * 0.6; e.landT = 0; }
    else {
      if (Math.random() < LP.flipRate * dt && e.z < 0.97) {
        const toward = sgn(laneDiff(e.lane, pl));
        const d = Math.random() < LP.chaseBias && toward ? toward : (Math.random() < 0.5 ? -1 : 1);
        startFlip(e, d, LP.flipDur);
      }
      maybeFire(e, dt);
    }
    return;
  }
  // on the rim (v3): hunt the claw along the rim, shortest way round on closed webs, never parking.
  if (!player.alive) return;
  if (e.lane === pl) {
    // settled in the claw's lane: short grab delay = the only window in which it can be shot
    e.landT += dt;
    if (e.landT >= LP.grabDelay) rimGrab(e);
    return;
  }
  e.landT = 0;
  e.pause -= dt;
  if (e.pause <= 0) {
    let d = sgn(laneDiff(e.lane, pl));
    // armed rim mines wall off lanes for enemies too: go the other way round (closed webs) or wait
    if (d && mines.length && mineAt(wrapLane(e.lane + d))) d = web.closed && !mineAt(wrapLane(e.lane - d)) ? -d : 0;
    if (d) { startFlip(e, d, LP.rimFlipDur); e.pause = LP.rimPause; } else e.pause = LP.rimPause;
  }
}
/* PHASER: climbs like a flipper but blinks 2-3 lanes sideways (biased toward the claw). It vanishes (invulnerable),
   a flickering ghost marks the destination lane, then it re-forms there. On the rim it blinks next to a distant claw. */
function startPhase(e, t, gone) { e.ph = 'out'; e.phT = 0; e.tgt = t; e.goneDur = gone; e.flipping = false; Sound.play('phaseout'); }
function updPhaser(e, dt) {
  if (e.ph) {
    e.phT += dt;
    if (e.z > 0) e.z = Math.max(0, e.z - LP.flipSpeed * 0.75 * e.spMul * dt);
    if (e.ph === 'out' && e.phT >= 0.16) { e.ph = 'gone'; e.phT = 0; }
    else if (e.ph === 'gone' && e.phT >= e.goneDur) { e.ph = 'in'; e.phT = 0; e.lane = e.tgt; Sound.play('phasein'); }
    else if (e.ph === 'in' && e.phT >= 0.14) { e.ph = null; e.phT = 0; e.cd = rand(0.9, 1.8); e.landT = 0; if (e.z <= 0) e.pause = LP.rimPause * 1.5; }
    return;
  }
  e.cd -= dt;
  const pl = player.lane;
  if (e.cd <= 0 && !e.flipping && player.alive) {
    if (e.z > 0.08) {
      const toward = sgn(laneDiff(e.lane, pl)) || (Math.random() < 0.5 ? -1 : 1);
      let t = e.lane + (Math.random() < LP.chaseBias ? toward : -toward) * randi(2, 3);
      if (!web.closed) t = clamp(t, 0, web.n - 1);
      t = wrapLane(t);
      if (t !== e.lane) { startPhase(e, t, LP.phaseGone); return; }
      e.cd = 0.4;
    } else if (e.z <= 0 && Math.abs(laneDiff(e.lane, pl)) >= 3) {
      const side = -sgn(laneDiff(e.lane, pl)); let t = pl + side;
      if (!web.closed && (t < 0 || t >= web.n)) t = pl - side;
      t = wrapLane(t);
      if (!mineAt(t) && t !== pl) { startPhase(e, t, LP.phaseGone + 0.12); return; }
      e.cd = 0.4;
    }
  }
  updFlipper(e, dt);
}
/* WARDEN: slow climber carrying a 3-hit shield facing the rim. Shots in its lane hit the shield (ping) - and the shield
   also covers enemies behind it in that lane. Openings: mid-flip (the shield swings aside) and each time it vents to
   fire (the shield drops for half a second first). Breaking the shield takes 3 hits. On the rim the shield is spent. */
function updWarden(e, dt) {
  if (e.hitT > 0) e.hitT -= dt;
  if (e.z <= 0) { e.shield = 0; e.vent = 0; updFlipper(e, dt); return; }
  if (e.flipping) { e.ft += dt / e.flipDur; if (e.ft >= 1) { e.flipping = false; e.lane = wrapLane(e.lane + e.dir); e.ft = 0; } return; }
  e.z -= LP.tankerSpeed * 1.05 * e.spMul * dt;
  if (e.z <= 0) { e.z = 0; e.pause = LP.rimPause; e.landT = 0; e.shield = 0; Sound.play('flip'); return; }
  if (e.vent > 0) {
    e.vent -= dt;
    if (e.vent <= 0) { if (eshots.length < LP.maxEShots + 1) { eshots.push({ lane: e.lane, z: e.z, pz: e.z, spin: 0 }); Sound.play('eshot'); } e.ventCd = rand(2.0, 3.4); }
    return;
  }
  e.ventCd -= dt;
  if (e.ventCd <= 0 && e.z > 0.15 && e.z < 0.92) { e.vent = 0.55; Sound.play('wvent'); return; }
  if (Math.random() < 0.34 * dt && e.z < 0.96) {
    const toward = sgn(laneDiff(e.lane, player.lane));
    startFlip(e, toward && Math.random() < 0.6 ? toward : (Math.random() < 0.5 ? -1 : 1), LP.flipDur * 1.8);
  }
}
const shieldUp = e => e.type === 'warden' && e.shield > 0 && e.z > 0 && !e.flipping && !(e.vent > 0);
/* SPARK: fast homing star. Steers sideways toward the claw with limited acceleration (momentum), stops steering in the
   last stretch, and detonates when it reaches the rim: deadly in its own lane, and it blows up rim enemies and mines in
   its lane and both neighbours - lure it onto them for a chain bonus. */
function updSpark(e, dt) {
  if (e.z > 0.14 && player.alive) {
    const d = rimDiff(e.x, player.pos), want = clamp(d * 3.2, -LP.sparkLat, LP.sparkLat);
    e.vx += clamp(want - e.vx, -LP.sparkAcc * dt, LP.sparkAcc * dt);
  } else e.vx *= Math.exp(-1.5 * dt);
  e.x += e.vx * dt;
  if (web.closed) e.x = ((e.x % web.n) + web.n) % web.n;
  else if (e.x < 0.5 || e.x > web.n - 0.5) { e.x = clamp(e.x, 0.5, web.n - 0.5); e.vx = 0; }
  e.lane = laneOfPos(e.x);
  e.z -= LP.sparkSpeed * e.spMul * dt;
  if (!e.warned && e.z < 0.3) { e.warned = true; Sound.play('sparkwarn'); }
  if (e.z <= 0) sparkBlast(e);
}
function sparkBlast(e) {
  e.dead = true; e.z = 0;
  const c = centerOf(e);
  fx.push({ x: c[0], y: c[1], zw: 0, t: 0, dur: 0.8, size: 0.75, rays: 22, colors: ['#ffffff', NEWE.spark.core, NEWE.spark.col], seed: Math.random() * 6, big: true });
  shardBurst(c, 0, ['#ffffff', NEWE.spark.core], 16, 1.1);
  Sound.play('sparkboom'); shake = Math.max(shake, 0.25);
  let chain = 0;
  for (const o of enemies) if (!o.dead && o !== e && o.spawnT >= 1 && (o.type === 'fuseball' ? o.z <= 0.12 && Math.abs(laneDiff(wrapLane(o.rail), e.lane)) <= 1 : o.z <= 0.1 && Math.abs(laneDiff(o.lane, e.lane)) <= 1)) { killEnemy(o, false); chain++; }
  for (const m of mines) if (m.armed && Math.abs(laneDiff(m.lane, e.lane)) <= 1) { m.dead = true; chain++; shardBurst(laneMid(m.lane), 0, [NEWE.layer.mine, '#fff'], 8, 0.8); }
  if (chain) { addScore(250 * chain); msg('CHAIN ' + chain + '  +' + 250 * chain, 1.4, 0.64, NEWE.spark.core, 2.6); Sound.play('chain'); }
  if (player.alive && state === 'play' && player.lane === e.lane) killPlayer('spark');
}
/* MINE LAYER: dives to mid-tube, then crawls sideways from lane to lane dropping mines, then climbs and hunts like a
   flipper. Mines drift up their lane (one shot kills them). A mine that reaches the rim in the claw's lane explodes;
   elsewhere it ARMS: for a few seconds the lane is walled off - neither the claw nor rim enemies can enter it. */
function updLayer(e, dt) {
  if (e.mode === 'climb') { updFlipper(e, dt); return; }
  if (e.flipping) { e.ft += dt / e.flipDur; if (e.ft >= 1) { e.flipping = false; e.lane = wrapLane(e.lane + e.dir); e.ft = 0; } return; }
  if (e.mode === 'dive') { e.z -= LP.flipSpeed * 1.2 * dt; if (e.z <= e.cruiseZ) { e.z = e.cruiseZ; e.mode = 'crawl'; } return; }
  e.crawlT -= dt; e.dropCd -= dt; e.pause -= dt;
  if (e.dropCd <= 0) {
    if (mines.filter(m => !m.armed).length < 4) { mines.push({ lane: e.lane, z: e.z - 0.02, armed: false, t: 0, life: 0, bump: 0 }); Sound.play('drop'); }
    e.dropCd = rand(1.7, 2.5);
  }
  if (e.crawlT <= 0) { e.mode = 'climb'; return; }
  if (e.pause <= 0) { if (startFlip(e, e.cdir, 0.3)) e.cdir = e.dir; e.pause = 0.38; }
}
function updMines(dt) {
  for (const m of mines) {
    if (m.dead) continue;
    m.t += dt;
    if (!m.armed) {
      m.z -= LP.mineSpeed * dt;
      if (m.z <= 0) {
        m.z = 0;
        if (player.alive && state === 'play' && m.lane === player.lane) {
          m.dead = true; const c = laneMid(m.lane);
          fx.push({ x: c[0], y: c[1], zw: 0, t: 0, dur: 0.6, size: 0.5, rays: 14, colors: [NEWE.layer.mine, '#fff'], seed: 1 });
          Sound.play('mineboom'); killPlayer('mine'); return;
        }
        m.armed = true; m.life = LP.mineLife; Sound.play('arm');
        const armed = mines.filter(x => x.armed && !x.dead);
        if (armed.length > 3) armed[0].dead = true;          // at most 3 walls: the rim can never be sealed for long
      }
    } else {
      m.life -= dt;
      if (m.life <= 0) { m.dead = true; shardBurst(laneMid(m.lane), 0, [NEWE.layer.mine], 5, 0.4); Sound.play('fizz'); }
    }
  }
  mines = mines.filter(m => !m.dead);
}
function updTanker(e, dt) {
  e.z -= LP.tankerSpeed * e.spMul * dt; maybeFire(e, dt);
  if (e.z <= 0) { e.z = 0; e.dead = true; splitTanker(e); Sound.play('flip'); }
}
function updSpiker(e, dt) {
  if (e.mdir < 0) {
    e.z -= LP.spikerSpeed * dt;
    spikes[e.lane] = Math.max(spikes[e.lane], 1 - e.z);
    if (e.z <= e.turnZ) e.mdir = 1;
  } else {
    e.z += LP.spikerSpeed * dt;
    if (e.z >= 1) {
      e.z = 1; e.runs++;
      if (e.runs >= 2) { e.type = 'flipper'; e.spMul = 1; e.mdir = -1; }
      else { e.lane = randi(0, web.n - 1); e.mdir = -1; e.turnZ = rand(LP.spikerTurnMin, 0.72); }
    }
  }
}
function startJump(e, d) {
  let t = e.rail + d;
  if (!web.closed && (t < 0 || t > web.n)) { d = -d; t = e.rail + d; }
  e.jumping = true; e.jdir = d; e.jt = 0; e.jumpDur = e.atRim ? 0.42 : 0.32;
}
function updFuse(e, dt) {
  const pl = player.lane;
  if (e.jumping) {
    e.jt += dt / e.jumpDur;
    if (e.atRim && player.alive && e.jt > 0.42 && e.jt < 0.58) {
      const lane = e.jdir > 0 ? e.rail : wrapLane(e.rail - 1);
      if (lane === pl) { killPlayer('fuse'); return; }
    }
    if (e.jt >= 1) { e.jumping = false; e.rail = wrapRail(e.rail + e.jdir); e.jt = 0; }
    return;
  }
  if (!e.atRim) {
    e.z += e.mdir * LP.fuseSpeed * dt;
    if (e.z >= 1) { e.z = 1; e.mdir = -1; }
    if (e.z <= 0) { e.z = 0; e.atRim = true; e.rimTimer = rand(3, 5); e.pause = LP.fuseRimPause; Sound.play('fuse'); return; }
    if (Math.random() < 0.9 * dt) startJump(e, Math.random() < 0.5 ? -1 : 1);
    else if (Math.random() < 0.3 * dt && e.z < 0.85) e.mdir = -e.mdir;
    return;
  }
  // on the rim
  if (player.alive && (e.rail === pl || e.rail === wrapRail(pl + 1))) { killPlayer('fuse'); return; }
  e.rimTimer -= dt;
  if (e.rimTimer <= 0) { e.atRim = false; e.mdir = 1; e.z = 0.01; return; }
  e.pause -= dt;
  if (e.pause <= 0 && player.alive) {
    const d1 = laneDiff(e.rail, pl), d2 = laneDiff(e.rail, pl + 1);
    const d = Math.abs(d1) < Math.abs(d2) ? d1 : d2;
    if (d) startJump(e, sgn(d));
    e.pause = LP.fuseRimPause;
  }
}
function hittableLane(e) {
  if (e.type === 'phaser' && e.ph && !(e.ph === 'in' && e.phT > 0.07)) return -1;   // phased out: shots pass through
  if (e.type === 'fuseball') {
    if (e.atRim) return -1;               // arcade rule: fuseballs on the rim are invulnerable, dodge them
    if (!e.jumping || e.jt < 0.15 || e.jt > 0.85) return -1;
    return e.jdir > 0 ? e.rail : wrapLane(e.rail - 1);
  }
  if (e.flipping) {
    if (e.z <= 0) return -1;              // mid-flip on the rim: can't be hit (no free kills from a held trigger)
    return e.ft < 0.5 ? e.lane : wrapLane(e.lane + e.dir);
  }
  return e.lane;
}
function checkShotHits() {
  for (const s of pshots) {
    if (s.dead) continue;
    const z0 = Math.min(s.pz, s.z) - 0.03, z1 = Math.max(s.pz, s.z) + 0.03;
    for (const es of eshots) if (!es.dead && es.lane === s.lane && es.z >= z0 - 0.02 && es.z <= z1 + 0.02) { es.dead = true; s.dead = true; fx.push({ x: laneMid(es.lane)[0], y: laneMid(es.lane)[1], zw: es.z * LL, t: 0, dur: 0.3, size: 0.2, rays: 8, colors: ['#fff'], seed: 0 }); break; }
    if (s.dead) continue;
    for (const e of enemies) {
      if (e.dead || e.spawnT < 0.5) continue;
      if (hittableLane(e) !== s.lane) continue;
      if (e.z <= 0 && e.type !== 'fuseball' && (e.lane !== player.lane || !player.alive)) continue; // rim: only while settled in the claw's lane
      if (shieldUp(e) && e.z - 0.035 >= z0 - 0.01 && e.z - 0.035 <= z1) {   // shield (sits just in front of the warden)
        s.dead = true; e.shield--; e.hitT = 0.15; addScore(10);
        const c = centerOf(e);
        shardBurst(c, c[2] - 0.035 * LL, [NEWE.warden.shield, '#ffffff'], e.shield ? 4 : 14, e.shield ? 0.4 : 0.9);
        Sound.play(e.shield ? 'ping' : 'wbreak'); break;
      }
      if (e.z >= z0 && e.z <= z1) { killEnemy(e, true); s.dead = true; break; }
    }
    if (s.dead) continue;
    for (const m of mines) if (!m.armed && !m.dead && m.lane === s.lane && m.z >= z0 && m.z <= z1) {
      m.dead = true; s.dead = true; addScore(50); Sound.play('hit');
      const c = laneMid(m.lane); fx.push({ x: c[0], y: c[1], zw: m.z * LL, t: 0, dur: 0.35, size: 0.25, rays: 8, colors: [NEWE.layer.mine, '#fff'], seed: 0 });
      shardBurst(c, m.z * LL, [NEWE.layer.mine, '#ffffff'], 5, 0.5); break;
    }
    if (s.dead) continue;
    const sp = spikes[s.lane];
    if (sp > 0 && s.z >= 1 - sp) {
      spikes[s.lane] = Math.max(0, sp - 0.055); if (spikes[s.lane] < 0.03) spikes[s.lane] = 0;
      s.dead = true; addScore(1); Sound.play('spike');
      fx.push({ x: laneMid(s.lane)[0], y: laneMid(s.lane)[1], zw: (1 - sp) * LL, t: 0, dur: 0.22, size: 0.18, rays: 6, colors: [pal.spike, '#fff'], seed: 0 });
    }
  }
  pshots = pshots.filter(s => !s.dead); eshots = eshots.filter(s => !s.dead); enemies = enemies.filter(e => !e.dead);
  if (mines.length) mines = mines.filter(m => !m.dead);
}
function updShots(dt) {
  const v = FIRE.speed;
  for (const s of pshots) { s.pz = s.z; s.z += v * dt; if (s.z > 1.02) s.dead = true; }
  pshots = pshots.filter(s => !s.dead);
  for (const s of eshots) {
    s.pz = s.z; s.z -= LP.eshotSpeed * dt; s.spin += dt * 9;
    if (s.z <= 0) { s.dead = true; if (state === 'play' && player.alive && s.lane === player.lane) killPlayer('shot'); }
  }
  eshots = eshots.filter(s => !s.dead);
}
function updPulse(dt) {
  const hasP = enemies.some(e => e.type === 'pulsar');
  pulseT += dt; const ph = (pulseT % LP.pulsePeriod) / LP.pulsePeriod;
  pulsing = false; pulseAmt = 0;
  if (hasP) {
    if (ph > 0.55 && ph < 0.8) pulseAmt = (ph - 0.55) / 0.25 * 0.6;
    else if (ph >= 0.8) { pulseAmt = 1; pulsing = true; }
  }
  Sound.hum(hasP ? pulseAmt * 0.07 : 0);
  if (pulsing && player.alive && state === 'play') for (const e of enemies) if (e.type === 'pulsar' && !e.flipping && e.spawnT >= 1 && e.lane === player.lane && e.z < 0.8) { killPlayer('zap'); break; }
}
function updEnemies(dt) {
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.spawnT < 1) { e.spawnT = Math.min(1, e.spawnT + dt / 0.4); continue; }
    if (e.type === 'flipper' || e.type === 'pulsar') updFlipper(e, dt);
    else if (e.type === 'tanker') updTanker(e, dt);
    else if (e.type === 'spiker') updSpiker(e, dt);
    else if (e.type === 'fuseball') updFuse(e, dt);
    else if (e.type === 'phaser') updPhaser(e, dt);
    else if (e.type === 'warden') updWarden(e, dt);
    else if (e.type === 'spark') updSpark(e, dt);
    else if (e.type === 'layer') updLayer(e, dt);
    if (state !== 'play') break;
  }
  enemies = enemies.filter(e => !e.dead);
}
/* Wave formations (v5): every level from 3 on has a spawn pattern, named at the level intro, so waves differ in
   rhythm and geometry, not only in enemy mix. The enemy pool and count are unchanged; only WHERE and WHEN they enter.
   - STREAM: one at a time, random lane (the classic feel).
   - SWARM:  packs of 3 in adjacent lanes, then a long lull. Destroy a whole pack with shots (not the Superzapper) for
             a PACK CLEAR bonus of 200 per member.
   - PINCER: pairs that enter on both sides of the claw (about a quarter of the web away), converging on you.
   - SPIRAL: entries sweep around the web lane by lane at a steady beat, so you can read the next lane and pre-aim. */
const WAVES = {
  stream: { name: 'STREAM', tip: '' },
  swarm: { name: 'SWARM', tip: 'PACKS OF 3. SHOOT A WHOLE PACK FOR A BONUS', col: '#ff9a3c' },
  pincer: { name: 'PINCER', tip: 'THEY ENTER ON BOTH SIDES OF YOU', col: '#ff5ad1' },
  spiral: { name: 'SPIRAL', tip: 'ENTRIES SWEEP AROUND THE WEB. PRE-AIM THE NEXT LANE', col: '#5affc8' },
};
const WAVE_CYCLE = ['swarm', 'stream', 'pincer', 'spiral', 'stream', 'swarm', 'spiral', 'pincer'];
const waveKind = L => L < 3 ? 'stream' : WAVE_CYCLE[(L - 3) % WAVE_CYCLE.length];
let wave = { kind: 'stream', q: [], sweep: 0, sdir: 1, packs: {}, packId: 0, log: [] }, seenWaves = new Set();
function waveReset(kind) { wave = { kind: kind || wave.kind, q: [], sweep: randi(0, web.n - 1), sdir: Math.random() < 0.5 ? -1 : 1, packs: {}, packId: 0, log: [] }; }
function uniqLanes(ls) { const out = []; for (const l of ls) { const w = wrapLane(l); if (!out.includes(w)) out.push(w); } return out; }
function planWave() {
  const n = web.n, g = LP.spawnGap, room = LP.maxActive - enemies.length;
  const single = () => wave.q.push({ lane: randi(0, n - 1), gap: g * rand(0.6, 1.3) });
  if (wave.kind === 'swarm' && pool.length >= 2 && room >= 2) {
    const c = randi(0, n - 1); let ls = uniqLanes([c, c - 1, c + 1]);
    if (ls.length < 3 && !web.closed) ls = uniqLanes(c <= 0 ? [0, 1, 2] : [n - 1, n - 2, n - 3]);
    ls = ls.slice(0, Math.min(3, pool.length, room));
    const id = ++wave.packId; wave.packs[id] = { n: ls.length, left: ls.length, clean: true };
    ls.forEach((l, i) => wave.q.push({ lane: l, pack: id, gap: i < ls.length - 1 ? 0.14 : g * rand(2.2, 2.7) }));
  } else if (wave.kind === 'pincer' && pool.length >= 2 && room >= 2) {
    const off = Math.max(2, Math.round(n / 4)) + randi(0, 1), pl = player.lane;
    let ls = uniqLanes([pl - off, pl + off]);
    if (!web.closed) ls = uniqLanes([clamp(pl - off, 0, n - 1), clamp(pl + off, 0, n - 1)]);
    ls.forEach((l, i) => wave.q.push({ lane: l, gap: i < ls.length - 1 ? 0.06 : g * rand(1.7, 2.1) }));
  } else if (wave.kind === 'spiral') {
    const step = n >= 14 ? 2 : 1;
    let l = wave.sweep + wave.sdir * step;
    if (web.closed) l = wrapLane(l);
    else if (l < 0 || l > n - 1) { wave.sdir = -wave.sdir; l = clamp(wave.sweep + wave.sdir * step, 0, n - 1); }
    wave.sweep = l; wave.q.push({ lane: l, gap: g * rand(0.78, 0.9) });
  } else single();
}
function spawnEnemies(dt) {
  spawnTimer -= dt;
  if (spawnTimer > 0 || !pool.length || zap.active) return;
  if (enemies.length >= LP.maxActive) return;
  if (!wave.q.length) planWave();
  const s = wave.q.shift(), p = pool.shift();
  const e = makeEnemy(p.type, p.type === 'fuseball' ? randi(0, web.closed ? web.n - 1 : web.n) : s.lane, 1, p.cargo);
  if (s.pack && wave.packs[s.pack]) e.pack = s.pack;
  enemies.push(e); wave.log.push({ t: T, lane: s.lane, type: p.type, pack: s.pack || 0 }); if (wave.log.length > 80) wave.log.shift();
  if (s.pack && wave.packs[s.pack] && !wave.packs[s.pack].started) { wave.packs[s.pack].started = true; Sound.play('swarm'); }
  if (e.type === 'spark') Sound.play('sparkspawn');
  const ne = NEWE[e.type];
  if (ne && !seenTypes.has(e.type)) {   // first one this game: name it and say how to beat it
    seenTypes.add(e.type); Sound.play('newenemy');
    msg('NEW: ' + ne.name, 3.2, 0.25, ne.col, 3.4); msg(ne.tip, 3.2, 0.31, '#ffffff', 1.5);
  }
  spawnTimer = s.gap;
}
// a pack member died: a pack destroyed entirely by the player's own shots (or a lured spark chain) pays a bonus
function packKill(e, zapped) {
  const P = wave.packs[e.pack]; if (!P) return;
  if (zapped) P.clean = false;
  if (--P.left > 0) return;
  delete wave.packs[e.pack];
  if (!P.clean || P.n < 2) return;
  const b = 200 * P.n; addScore(b); packClears++;
  msg('PACK CLEAR +' + b, 1.6, 0.4, WAVES.swarm.col, 3.2); Sound.play('pack');
  const c = centerOf(e); shardBurst(c, c[2], [WAVES.swarm.col, '#ffffff', '#ffe81a'], 16, 1);
}

/* ============================== state updates ============================== */
function update(dt) {
  T += dt;
  switch (state) {
    case 'attract': {
      attract.t += dt; attract.modeT += dt;
      if (attract.modeT > (attract.mode === 1 ? 6 : 9)) { attract.mode = (attract.mode + 1) % 3; attract.modeT = 0; }
      const wi = Math.floor(attract.t / 5) % 16; if (wi !== attract.web) attract.web = wi;
      break;
    }
    case 'select':
      select.t -= dt;
      if (Math.ceil(select.t) < select.lastTick) { select.lastTick = Math.ceil(select.t); if (select.lastTick <= 3 && select.lastTick > 0) Sound.play('tick'); }
      if (select.t <= 0) startGame();
      break;
    case 'zoom':
      zoom.t += dt / zoom.dur; handleMove(dt);
      camZ = zoom.from * (1 - easeOut3(Math.min(1, zoom.t)));
      if (zoom.t >= 1) { camZ = 0; state = 'play'; window.MoodSticker && window.MoodSticker.screen('play'); }
      break;
    case 'play':
      handleMove(dt); handleFire(dt);
      updShots(dt); checkShotHits(); if (state !== 'play') break;
      updPulse(dt); if (state !== 'play') break;
      spawnEnemies(dt); updEnemies(dt); if (state !== 'play') break;
      if (mines.length) { updMines(dt); if (state !== 'play') break; }
      checkShotHits();
      if (zap.active) {
        zap.t += dt; zap.next -= dt;
        if (zap.next <= 0) { const live = enemies.filter(e => !e.dead); if (live.length) killEnemy(live[randi(0, live.length - 1)], false); enemies = enemies.filter(e => !e.dead); zap.next = 0.055; }
        if (zap.t > 0.7) zap.active = false;
      }
      if (!pool.length && !enemies.length && !zap.active && !window.__noWarp) { mines = []; startWarp(); }
      break;
    case 'warp': {
      handleMove(dt); handleFire(dt); updShots(dt); checkShotHits();
      warp.t += dt; const v = 0.13 + 0.6 * warp.t;
      player.z += v * dt; camZ = player.z * LL * 0.9;
      if (player.z <= 1 && spikes[player.lane] > 0 && player.z >= 1 - spikes[player.lane] - 0.01) { killPlayer('spike'); break; }
      if (player.z >= 1.42) { player.z = 0; beginLevel(level + 1); }
      Sound.hum(0);
      break;
    }
    case 'dying':
      death.t += dt; Sound.hum(0);
      if (death.kind === 'capture' && !death.exploded) {
        player.z = Math.min(1, death.t * 0.8);
        if (death.captor) { death.captor.z = player.z; death.captor.lane = player.lane; death.captor.flipping = false; }
        if (player.z >= 1) { explodePlayer(); if (death.captor) death.captor.dead = true; enemies = enemies.filter(e => !e.dead); death.t2 = death.t; }
      }
      updShots(dt);
      if (death.exploded && death.t - (death.t2 || 0) > (death.kind === 'capture' ? 1.6 : 2.2) && (death.kind !== 'capture' || death.t2)) finishDeath();
      break;
    case 'gameover':
      gameOverT += dt; if (gameOverT > 4) endGameOver();
      break;
  }
  // effects
  for (const f of fx) f.t += dt;
  fx = fx.filter(f => f.t < f.dur);
  for (const m of msgs) m.t += dt;
  msgs = msgs.filter(m => m.t < m.dur);
  if (zap.flash > 0) zap.flash -= dt;
  if (shake > 0) shake -= dt;
  if (flash > 0) flash -= dt;
  updFxParts(dt);
  updStars(dt);
}

/* ============================== rendering ============================== */
const stars = Array.from({ length: 260 }, () => ({ x: rand(-8, 8), y: rand(-8, 8), z: rand(0.3, 30), c: Math.random() }));
let starSpeed = 2;
function updStars(dt) {
  const target = state === 'warp' ? 42 : state === 'zoom' ? (zoom && zoom.full ? 30 : 12) : (state === 'attract' || state === 'select' || state === 'initials') ? 2.2 : 0;
  starSpeed = lerp(starSpeed, target, Math.min(1, dt * 3));
  for (const s of stars) { s.pz = s.z; s.z -= starSpeed * dt; if (s.z < 0.3) { s.z = 30; s.pz = 30; s.x = rand(-8, 8); s.y = rand(-8, 8); } }
}
let starsPass = false;
function drawStars() {
  if (!starsPass || starSpeed < 0.05) return; // stars are drawn after the glow pass (no blotchy halos)
  const F = Math.min(W, H) * 0.6, cx = W / 2, cy = H / 2;
  const alpha = inGame() ? clamp(starSpeed / 6, 0, 1) : clamp(starSpeed / 4, 0.25, 1);
  ctx.lineWidth = Math.max(1, 1.3 * DPR);
  for (let g = 0; g < 3; g++) {
    ctx.strokeStyle = ['#ffffff', '#8fb6ff', '#ffd2fb'][g]; ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (let i = g; i < stars.length; i += 3) {
      const s = stars[i]; const z1 = s.z, z0 = Math.min(30, s.z + Math.max(0.05, starSpeed * 0.035));
      const x1 = cx + s.x * F / z1, y1 = cy + s.y * F / z1, x0 = cx + s.x * F / z0, y0 = cy + s.y * F / z0;
      ctx.moveTo(x0, y0); ctx.lineTo(x1 + 0.6 * DPR, y1);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function LW(m = 1) { return Math.max(DPR * 0.9, U * 0.19 * m); }

function drawWeb(color, laneColor, highlight = true) {
  const p = web.pts, n = web.n, segs = web.closed ? n : n;
  ctx.strokeStyle = color; ctx.lineWidth = LW(0.95);
  ctx.beginPath();
  for (let i = 0; i < segs; i++) {
    const a = p[i], b = web.closed ? p[(i + 1) % n] : p[i + 1];
    seg3(a[0], a[1], 0, b[0], b[1], 0);
    seg3(a[0], a[1], LL, b[0], b[1], LL);
  }
  const rails = web.closed ? n : n + 1;
  for (let i = 0; i < rails; i++) { const a = p[i]; seg3(a[0], a[1], 0, a[0], a[1], LL); }
  ctx.stroke();
  if (highlight && laneColor) {
    const l = player.lane, a = rail(l), b = rail(l + 1);
    ctx.strokeStyle = laneColor; ctx.lineWidth = LW(1.1);
    ctx.beginPath();
    seg3(a[0], a[1], 0, a[0], a[1], LL); seg3(b[0], b[1], 0, b[0], b[1], LL);
    seg3(a[0], a[1], 0, b[0], b[1], 0); seg3(a[0], a[1], LL, b[0], b[1], LL);
    ctx.stroke();
  }
}
function drawPulseLanes() {
  if (pulseAmt <= 0) return;
  for (const e of enemies) {
    if (e.type !== 'pulsar' || e.flipping || e.spawnT < 1) continue;
    const a = rail(e.lane), b = rail(e.lane + 1), z = e.z * LL;
    ctx.globalAlpha = pulsing ? (0.6 + 0.4 * Math.sin(T * 60)) : pulseAmt * 0.6;
    ctx.strokeStyle = pulsing ? '#ffffff' : pal.pulsar; ctx.lineWidth = LW(pulsing ? 1.8 : 1.2);
    ctx.beginPath(); seg3(a[0], a[1], 0, a[0], a[1], z); seg3(b[0], b[1], 0, b[0], b[1], z); seg3(a[0], a[1], 0, b[0], b[1], 0);
    if (pulsing) { // electrified zigzag down the lane
      const N = 14; let prev = null;
      for (let k = 0; k <= N; k++) { const t = k / N, u = (k % 2 ? 0.25 : 0.75) + rand(-0.08, 0.08); const pt = proj(lerp(a[0], b[0], u), lerp(a[1], b[1], u), z * t); if (!pt) continue; if (prev) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(pt[0], pt[1]); } prev = pt; }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function drawSpikes() {
  ctx.strokeStyle = pal.spike; ctx.lineWidth = LW(1.15);
  ctx.beginPath();
  const tips = [];
  for (let i = 0; i < web.n; i++) {
    const s = spikes[i]; if (s <= 0) continue;
    const m = laneMid(i); seg3(m[0], m[1], LL, m[0], m[1], (1 - s) * LL);
    tips.push([m, (1 - s) * LL]);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  for (const [m, zw] of tips) { const p = proj(m[0], m[1], zw); if (p) { const r = Math.max(1.5 * DPR, scaleAt(zw) * 0.018); ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2); } }
}
const FLIPPER = [[0, -0.032], [1, 0.032], [1, -0.032], [0, 0.032]];
const FLIPPER_IN = [[0.2, 0], [0.5, -0.016], [0.8, 0], [0.5, 0.016]];
const TANKER = [[0.06, 0], [0.5, -0.05], [0.94, 0], [0.5, 0.05]];
const TANKER_IN = [[0.28, 0], [0.5, -0.028], [0.72, 0], [0.5, 0.028]];
const CLAW = [[0, 0], [0.2, 0.3], [0.5, 0.44], [0.8, 0.3], [1, 0], [0.74, 0.17], [0.6, 0.09], [0.4, 0.09], [0.26, 0.17]];
function drawSpiral(cx, cy, R, color, spin) {
  ctx.strokeStyle = color; ctx.beginPath();
  const N = 26;
  for (let k = 0; k <= N; k++) { const t = k / N, a = spin + t * TAU * 2.2, r = R * t; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.85; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
}
function laneWidthPx(l, zw) { const a = rail(l), b = rail(l + 1); return Math.hypot(b[0] - a[0], b[1] - a[1]) * scaleAt(zw); }
function drawFuse(cx, cy, R, t) {
  const cols = ['#ff2a2a', '#ffe81a', '#2bff4c', '#3e9bff', '#ff47e6'];
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.moveTo(cx, cy);
    const base = i / 5 * TAU + t * 1.7;
    for (let k = 1; k <= 5; k++) { const r = R * k / 5, a = base + Math.sin(t * 9 + i * 1.7 + k) * 0.55 + k * 0.32; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.stroke();
  }
}
function drawEnemy(e) {
  const sp = e.spawnT < 1 ? easeOut3(e.spawnT) : 1;
  ctx.lineWidth = LW(1.15);
  if (e.type === 'flipper' || e.type === 'tanker' || e.type === 'pulsar') {
    const [A, B] = spanOf(e);
    const z = Math.max(e.z, e.type === 'tanker' ? 0.05 : 0.034);
    e = Object.assign({}, e, { z });
    ctx.strokeStyle = pal[e.type]; ctx.beginPath();
    if (e.type === 'flipper') { shape(A, B, e.z, FLIPPER, true, sp); shape(A, B, e.z, FLIPPER_IN, true, sp); }
    else if (e.type === 'tanker') {
      shape(A, B, e.z, TANKER, true, sp); shape(A, B, e.z, TANKER_IN, true, sp);
      ctx.stroke(); ctx.beginPath();
      ctx.strokeStyle = e.cargo === 'pulsar' ? pal.pulsar : e.cargo === 'fuseball' ? '#ffffff' : pal.flipper;
      if (e.cargo === 'pulsar') shape(A, B, e.z, [[0.36, 0], [0.43, -0.014], [0.5, 0.014], [0.57, -0.014], [0.64, 0]], false, sp);
      else if (e.cargo === 'fuseball') { shape(A, B, e.z, [[0.4, -0.012], [0.6, 0.012]], false, sp); shape(A, B, e.z, [[0.4, 0.012], [0.6, -0.012]], false, sp); }
      else shape(A, B, e.z, [[0.38, -0.01], [0.62, 0.01], [0.62, -0.01], [0.38, 0.01]], true, sp);
    } else {
      const amp = 0.012 + 0.03 * pulseAmt, pts = [];
      for (let k = 0; k <= 8; k++) pts.push([k / 8, k === 0 || k === 8 ? 0 : (k % 2 ? -amp : amp)]);
      if (pulsing) ctx.strokeStyle = Math.sin(T * 50) > 0 ? '#ffffff' : pal.pulsar;
      shape(A, B, e.z, pts, false, sp);
    }
    ctx.stroke();
  } else if (e.type === 'spiker') {
    const m = laneMid(e.lane), p = proj(m[0], m[1], e.z * LL); if (!p) return;
    drawSpiral(p[0], p[1], laneWidthPx(e.lane, e.z * LL) * 0.36 * sp, pal.spiker, -T * 7 + e.phase);
  } else if (e.type === 'fuseball') {
    const c = centerOf(e), p = proj(c[0], c[1], c[2]); if (!p) return;
    const lw = laneWidthPx(wrapLane(Math.floor(e.rail)), c[2]);
    drawFuse(p[0], p[1], lw * 0.42 * sp, T + e.phase);
  } else if (NEWE[e.type]) drawNewEnemy(e, sp);
}
const PHASER = [[0, 0], [0.25, -0.034], [0.5, 0], [0.75, -0.034], [1, 0], [0.75, 0.034], [0.5, 0], [0.25, 0.034]];
const PHASER_IN = [[0.4, 0], [0.5, -0.012], [0.6, 0], [0.5, 0.012]];
const WARDEN = [[0.16, 0.004], [0.3, -0.03], [0.7, -0.03], [0.84, 0.004], [0.7, 0.04], [0.3, 0.04]];
const WARDEN_IN = [[0.38, 0.004], [0.5, -0.012], [0.62, 0.004], [0.5, 0.02]];
const LAYER = [[0.08, 0.01], [0.3, -0.026], [0.7, -0.026], [0.92, 0.01], [0.72, 0.034], [0.28, 0.034]];
const LAYER_LEGS = [[[0.24, 0.026], [0.12, 0.06]], [[0.42, 0.034], [0.38, 0.07]], [[0.58, 0.034], [0.62, 0.07]], [[0.76, 0.026], [0.88, 0.06]]];
function drawStar(x, y, R, spin, n, inner) {
  ctx.beginPath();
  for (let k = 0; k <= n * 2; k++) { const a = spin + k * Math.PI / n, r = k % 2 ? R * inner : R; const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.stroke();
}
function drawNewEnemy(e, sp) {
  const d = NEWE[e.type];
  if (e.type === 'phaser') {
    const flick = e.ph ? (e.ph === 'gone' ? 0 : e.ph === 'out' ? 1 - e.phT / 0.16 : e.phT / 0.14) : 1;
    const z = Math.max(e.z, 0.034);
    if (e.ph === 'gone' || e.ph === 'out') {   // ghost telegraph at the destination lane
      const g = e.ph === 'gone' ? 0.35 + 0.45 * (Math.sin(T * 60) > 0 ? 1 : 0.4) * (e.phT / e.goneDur) : 0.2;
      ctx.globalAlpha = g; ctx.strokeStyle = d.ghost; ctx.setLineDash([U * 0.6, U * 0.5]); ctx.beginPath();
      shape(rail(e.tgt), rail(e.tgt + 1), z, PHASER, true, 0.9); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (flick <= 0.02) return;
    const [A, B] = spanOf(e);
    ctx.globalAlpha = e.ph ? flick * (0.6 + 0.4 * Math.random()) : 1;
    ctx.strokeStyle = d.col; ctx.beginPath();
    const su = sp * (e.ph ? 0.4 + 0.6 * flick : 1);
    shape(A, B, z, PHASER, true, su); shape(A, B, z, PHASER_IN, true, su); ctx.stroke();
    if (e.ph) { ctx.strokeStyle = '#ffffff'; ctx.beginPath(); shape(A, B, z, [[0, 0], [1, 0]], false, 1.2 - flick * 0.4); ctx.stroke(); }
    ctx.globalAlpha = 1;
  } else if (e.type === 'warden') {
    const [A, B] = spanOf(e), z = Math.max(e.z, 0.045);
    const venting = e.vent > 0;
    ctx.strokeStyle = d.col; ctx.beginPath(); shape(A, B, z, WARDEN, true, sp); ctx.stroke();
    ctx.strokeStyle = venting ? (Math.sin(T * 70) > 0 ? '#ffffff' : '#ff3a3a') : d.col; ctx.beginPath(); shape(A, B, z, WARDEN_IN, true, sp); ctx.stroke();
    if (e.shield > 0 && e.z > 0) {
      // shield: one curved bar per remaining hit, in front of the body; swings aside while flipping, opens while venting
      const open = e.flipping ? 0.5 : venting ? Math.min(1, (0.55 - e.vent) / 0.12) * 0.7 : 0;
      ctx.strokeStyle = e.hitT > 0 ? '#ffffff' : d.shield; ctx.globalAlpha = open ? 0.45 : 1;
      ctx.beginPath();
      for (let k = 0; k < e.shield; k++) {
        const dz = -0.036 - k * 0.011, w = 0.46 - k * 0.04;
        const L = [[0.5 - w, dz + 0.012], [0.5 - w * 0.5, dz], [0.5 - w * 0.12 - open * 0.3, dz - 0.002]];
        const R = [[0.5 + w * 0.12 + open * 0.3, dz - 0.002], [0.5 + w * 0.5, dz], [0.5 + w, dz + 0.012]];
        shape(A, B, z, L, false, sp); shape(A, B, z, R, false, sp);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  } else if (e.type === 'spark') {
    const c = centerOf(e), p = proj(c[0], c[1], c[2]); if (!p) return;
    const lw = laneWidthPx(e.lane, c[2]), R = lw * 0.3 * sp;
    // trail: where it was a moment ago (shows its lateral momentum)
    const q = railF(web.closed ? ((e.x - e.vx * 0.12) % web.n + web.n) % web.n : clamp(e.x - e.vx * 0.12, 0, web.n)), pq = proj(q[0], q[1], c[2] + 0.12 * LL);
    if (pq) { ctx.globalAlpha = 0.5; ctx.strokeStyle = d.core; ctx.beginPath(); ctx.moveTo(pq[0], pq[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = d.col; drawStar(p[0], p[1], R, T * 9 + e.phase, 4, 0.28);
    ctx.strokeStyle = e.z < 0.3 && Math.sin(T * 50) > 0 ? '#ffffff' : d.core; drawStar(p[0], p[1], R * 0.62, -T * 13, 4, 0.35);
    ctx.lineWidth = LW(0.8); ctx.beginPath();
    for (let k = 0; k < 3; k++) { const a = Math.random() * TAU; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(a) * R * 0.6, p[1] + Math.sin(a) * R * 0.6); ctx.lineTo(p[0] + Math.cos(a + 0.5) * R * 1.15, p[1] + Math.sin(a + 0.5) * R * 1.15); }
    ctx.stroke();
  } else if (e.type === 'layer') {
    const [A, B] = spanOf(e), z = Math.max(e.z, 0.04);
    ctx.strokeStyle = d.col; ctx.beginPath(); shape(A, B, z, LAYER, true, sp);
    const wig = Math.sin(T * 14 + e.phase) * 0.008;
    for (const [a, b] of LAYER_LEGS) shape(A, B, z, [a, [b[0], b[1] + wig]], false, sp);
    ctx.stroke();
    ctx.strokeStyle = e.dropCd < 0.35 && e.mode === 'crawl' ? '#ffffff' : d.mine; ctx.beginPath();
    shape(A, B, z, [[0.44, 0.004], [0.5, -0.01], [0.56, 0.004], [0.5, 0.018]], true, sp); ctx.stroke();
  }
}
function drawMines() {
  if (!mines.length) return;
  const col = NEWE.layer.mine;
  ctx.lineWidth = LW(1);
  for (const m of mines) {
    if (!m.armed) {
      const c = laneMid(m.lane), zw = m.z * LL, p = proj(c[0], c[1], zw); if (!p) continue;
      const R = Math.max(2, laneWidthPx(m.lane, zw) * 0.17);
      ctx.strokeStyle = Math.sin(T * 20 + m.lane) > 0 ? col : '#ffffff'; ctx.beginPath();
      ctx.moveTo(p[0], p[1] - R); ctx.lineTo(p[0] + R, p[1]); ctx.lineTo(p[0], p[1] + R); ctx.lineTo(p[0] - R, p[1]); ctx.closePath();
      for (let k = 0; k < 4; k++) { const a = T * 3 + k * TAU / 4 + 0.785; ctx.moveTo(p[0] + Math.cos(a) * R * 0.7, p[1] + Math.sin(a) * R * 0.7); ctx.lineTo(p[0] + Math.cos(a) * R * 1.4, p[1] + Math.sin(a) * R * 1.4); }
      ctx.stroke();
    } else {
      // armed: a crackling gate across the lane mouth and a short fence down the rails
      const blink = m.life < 1.5 ? (Math.sin(T * 40) > 0 ? 1 : 0.25) : 1;
      ctx.globalAlpha = blink * (m.bump > 0 ? 1 : 0.85); ctx.strokeStyle = m.bump > 0 ? '#ffffff' : col;
      const A = rail(m.lane), B = rail(m.lane + 1);
      ctx.beginPath();
      shape(A, B, 0, [[0, 0], [1, 0.07], [1, 0], [0, 0.07]], true);
      const jag = [];
      for (let k = 0; k <= 6; k++) jag.push([k / 6, 0.035 + (k % 2 ? 1 : -1) * 0.02 * Math.random()]);
      shape(A, B, 0, jag, false);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
}
function drawShards() {
  if (!shards.length) return;
  // batch by colour and 4 alpha levels: a few stroke() calls for hundreds of fragments
  const groups = new Map();
  for (const s of shards) {
    const q = Math.min(3, Math.floor(s.t / s.dur * 4)), key = s.c + q;
    let g = groups.get(key); if (!g) { g = { c: s.c, a: 1 - q * 0.26, list: [] }; groups.set(key, g); }
    g.list.push(s);
  }
  ctx.lineWidth = LW(0.9);
  for (const g of groups.values()) {
    ctx.strokeStyle = g.c; ctx.globalAlpha = g.a; ctx.beginPath();
    for (const s of g.list) {
      const dx = Math.cos(s.a) * s.len, dy = Math.sin(s.a) * s.len;
      const p0 = proj(s.x - dx, s.y - dy, s.z), p1 = proj(s.x + dx, s.y + dy, s.z + dx * 0.5); if (!p0 || !p1) continue;
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function jagLine(x0, y0, x1, y1, n, amp) {
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
  ctx.moveTo(x0, y0);
  for (let k = 1; k < n; k++) { const t = k / n, o = (Math.random() * 2 - 1) * amp; ctx.lineTo(x0 + dx * t + nx * o, y0 + dy * t + ny * o); }
  ctx.lineTo(x1, y1);
}
function drawBolts() {
  if (!bolts.length) return;
  for (const b of bolts) {
    const p0 = proj(b.a[0], b.a[1], b.a[2]), p1 = proj(b.b[0], b.b[1], b.b[2]); if (!p0 || !p1) continue;
    const k = b.t / b.dur, l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    ctx.globalAlpha = 1 - k * k;
    ctx.lineWidth = LW(1.4); ctx.strokeStyle = '#7df9ff'; ctx.beginPath(); jagLine(p0[0], p0[1], p1[0], p1[1], 9, l * 0.06); ctx.stroke();
    ctx.lineWidth = LW(0.7); ctx.strokeStyle = '#ffffff'; ctx.beginPath(); jagLine(p0[0], p0[1], p1[0], p1[1], 7, l * 0.035); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// superzapper burst, drawn in the 3D scene (arcs, crackle, chromatic tube ring) and in screen space (chromatic shockwave)
function drawZapFx() {
  if (!zfx) return;
  const t = zfx.t, big = zfx.big, head = Math.min(1, t / 0.34), fade = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.7);
  if (fade <= 0) return;
  const nR = web.closed ? web.n : web.n + 1, cols = ['#ffffff', '#7df9ff', '#ff6af0'];
  const seg = IS_MOBILE ? 10 : 16;
  ctx.lineWidth = LW(big ? 1.3 : 0.9);
  for (let c = 0; c < 3; c++) {
    ctx.strokeStyle = cols[c]; ctx.globalAlpha = fade * (big ? 1 : 0.6) * (t > 0.34 && Math.random() < 0.3 ? 0.3 : 1);
    ctx.beginPath();
    for (let i = c; i < nR; i += 3) {
      const r = rail(i), zEnd = head * LL;
      let first = true;
      for (let k = 0; k <= seg; k++) {
        const zw = zEnd * k / seg, s = scaleAt(zw), j = k && k < seg ? (Math.random() * 2 - 1) * 0.035 * (big ? 1 : 0.6) : 0;
        const p = proj(r[0], r[1], zw); if (!p || !s) break;
        const x = p[0] + j * s, y = p[1] + (Math.random() * 2 - 1) * 0.035 * s * (k && k < seg ? 1 : 0);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }
  // rim crackle (jagged ring around the mouth of the tube) and a bright head ring racing to the far end
  ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = fade * 0.9; ctx.beginPath();
  for (let i = 0; i < web.n; i++) { const a = rail(i), b = rail(i + 1); const pa = proj(a[0], a[1], 0), pb = proj(b[0], b[1], 0); if (pa && pb) jagLine(pa[0], pa[1], pb[0], pb[1], 4, U * 0.9); }
  ctx.stroke();
  // chromatic tube-ring shockwave: the web's cross-section racing down the tube, split into R / G / B depths
  const zs = Math.min(1.2, t / 0.55) * LL;
  if (t < 0.7) {
    const rgb = ['#ff2848', '#28ff6a', '#3a6bff'];
    ctx.lineWidth = LW(big ? 2.2 : 1.4);
    for (let c = 0; c < 3; c++) {
      ctx.strokeStyle = rgb[c]; ctx.globalAlpha = (1 - t / 0.7) * (big ? 1 : 0.6); ctx.beginPath();
      const zw = zs + (c - 1) * 0.12 * (1 + t * 2);
      let first = true;
      for (let i = 0; i <= (web.closed ? web.n : web.n); i++) { const r = rail(i), p = proj(r[0], r[1], Math.max(0, zw)); if (!p) continue; if (first) { ctx.moveTo(p[0], p[1]); first = false; } else ctx.lineTo(p[0], p[1]); }
      if (web.closed) ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function drawZapScreen() {
  if (!zfx || !zfx.big || zfx.t > 0.75) return;
  const k = zfx.t / 0.75, c = proj(0, 0, 0) || [W / 2, H / 2], R = easeOut3(k) * Math.hypot(W, H) * 0.75, rgb = ['#ff2848', '#28ff6a', '#3a6bff'];
  ctx.lineWidth = Math.max(1, U * 1.1 * (1 - k));
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = rgb[i]; ctx.globalAlpha = (1 - k) * 0.9;
    ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(1, R + (i - 1) * U * (1.2 + 3 * k)), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function guideIcon(k, x, y, s) {
  ctx.lineWidth = LW(1); const d = NEWE[k];
  const poly = (pts, close) => { ctx.beginPath(); pts.forEach(([u, v], i) => { const px = x + (u - 0.5) * s * 2, py = y + v * s * 12; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); if (close) ctx.closePath(); ctx.stroke(); };
  ctx.strokeStyle = d.col;
  if (k === 'phaser') { poly(PHASER, true); ctx.globalAlpha = 0.4; ctx.setLineDash([U * 0.5, U * 0.4]); const x0 = x; x += s * 2.4; poly(PHASER, true); x = x0; ctx.setLineDash([]); ctx.globalAlpha = 1; }
  else if (k === 'warden') { poly(WARDEN, true); ctx.strokeStyle = d.shield; poly([[0.05, -0.024], [0.3, -0.036], [0.7, -0.036], [0.95, -0.024]], false); }
  else if (k === 'spark') { drawStar(x, y, s * 0.6, T * 9, 4, 0.28); ctx.strokeStyle = d.core; drawStar(x, y, s * 0.36, -T * 13, 4, 0.35); }
  else { poly(LAYER, true); for (const [a, b] of LAYER_LEGS) poly([a, b], false); ctx.strokeStyle = d.mine; const R = s * 0.22, my = y + s * 1.1; ctx.beginPath(); ctx.moveTo(x, my - R); ctx.lineTo(x + R, my); ctx.lineTo(x, my + R); ctx.lineTo(x - R, my); ctx.closePath(); ctx.stroke(); }
}
function drawShots() {
  // enemy shots
  ctx.lineWidth = LW(1);
  for (const s of eshots) {
    const m = laneMid(s.lane), zw = s.z * LL, p = proj(m[0], m[1], zw); if (!p) continue;
    const R = Math.max(2, laneWidthPx(s.lane, zw) * 0.16);
    ctx.strokeStyle = pal.eshot; ctx.beginPath();
    for (let k = 0; k < 4; k++) { const a = s.spin + k * TAU / 4; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(a) * R, p[1] + Math.sin(a) * R); }
    ctx.stroke();
    ctx.fillStyle = '#ff6af0';
    for (let k = 0; k < 4; k++) { const a = s.spin + (k + 0.5) * TAU / 4; ctx.fillRect(p[0] + Math.cos(a) * R * 0.8 - 1.5 * DPR, p[1] + Math.sin(a) * R * 0.8 - 1.5 * DPR, 3 * DPR, 3 * DPR); }
  }
  // player shots
  ctx.strokeStyle = pal.shot; ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (const s of pshots) {
    const m = laneMid(s.lane), zw = s.z * LL, p = proj(m[0], m[1], zw); if (!p) continue;
    const R = Math.max(1.5, laneWidthPx(s.lane, zw) * 0.11);
    ctx.moveTo(p[0], p[1] - R); ctx.lineTo(p[0] + R, p[1]); ctx.lineTo(p[0], p[1] + R); ctx.lineTo(p[0] - R, p[1]); ctx.closePath();
  }
  ctx.stroke();
  for (const s of pshots) { const m = laneMid(s.lane), p = proj(m[0], m[1], s.z * LL); if (p) ctx.fillRect(p[0] - 1.2 * DPR, p[1] - 1.2 * DPR, 2.4 * DPR, 2.4 * DPR); }
}
function clawPoints(f, zw, lean = 0) {
  const E0 = railF(f), E1 = railF(f + 1), n = inwardF(f + 0.5 - 0.5);
  const len = Math.hypot(E1[0] - E0[0], E1[1] - E0[1]);
  const out = [];
  for (const [u0, w0] of CLAW) {
    // lean: slide the claw's peak toward one rail and tilt it (taller on the leaning side)
    const u = clamp(u0 + lean * (0.04 + 0.19 * w0 / 0.44) * (1 - Math.abs(u0 - 0.5) * 0.9), 0, 1);
    const w = w0 * (1 + lean * (u0 - 0.5) * 0.5);
    const x = E0[0] + (E1[0] - E0[0]) * u + n[0] * w * len, y = E0[1] + (E1[1] - E0[1]) * u + n[1] * w * len;
    const p = proj(x, y, zw + w * 0.22); if (!p) return null; out.push(p);
  }
  return out;
}
function drawClaw() {
  const pts = clawPoints(player.vis, player.z * LL, player.lean); if (!pts) return;
  ctx.strokeStyle = pal.claw; ctx.lineWidth = LW(1.35);
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[7][0], pts[7][1]); ctx.moveTo(pts[2][0], pts[2][1]); ctx.lineTo(pts[6][0], pts[6][1]);
  ctx.stroke();
}
function drawFx() {
  for (const f of fx) {
    const p = proj(f.x, f.y, f.zw); if (!p) continue;
    const k = f.t / f.dur, s = scaleAt(f.zw), R = f.size * s * (0.25 + 1.1 * easeOut3(k));
    ctx.globalAlpha = 1 - k * k; ctx.lineWidth = LW(f.big ? 1.6 : 1.1);
    for (let i = 0; i < f.rays; i++) {
      const a = f.seed + i / f.rays * TAU + (i % 2) * 0.15, r0 = R * (f.big ? 0.15 + 0.5 * k : 0.3 + 0.4 * k), r1 = R * (i % 2 ? 0.7 : 1);
      ctx.strokeStyle = f.colors[(i + Math.floor(f.t * 30)) % f.colors.length];
      ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(a) * r0, p[1] + Math.sin(a) * r0); ctx.lineTo(p[0] + Math.cos(a) * r1, p[1] + Math.sin(a) * r1); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
function drawClawIcon(x, y, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = LW(0.9); ctx.beginPath();
  CLAW.forEach(([u, v], i) => { const px = x + u * w, py = y - v * w; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.closePath(); ctx.stroke();
}
function drawHUD() {
  const sz = U * 3.6, lx = SA.l + U * 3, ty = SA.t;
  text(String(score), lx, ty + U * 2.4, sz, pal.claw === '#ffe81a' ? '#3cf6ff' : pal.claw, 'left');
  for (let i = 0; i < Math.min(lives - (inGame() ? 1 : 0), 7); i++) drawClawIcon(lx + i * U * 4.2, ty + U * 10, U * 3.4, pal.claw);
  const hi = Math.max(score, hiscores[0] ? hiscores[0][1] : 0);
  text(String(hi), W / 2, ty + U * 2.4, U * 2.4, '#ffffff', 'center');
  text('LEVEL ' + level, W / 2, ty + U * 5.6, U * 1.7, pal.web === '#1a2140' ? '#5c6ab0' : pal.web, 'center');
  const zx = W - SA.r - U * 3;
  text('ZAP', zx - U * 6.5, ty + U * 2.4, U * 1.7, '#ffffff', 'right', 0.85);
  for (let i = 0; i < 2; i++) {
    const on = zapUses <= i; ctx.globalAlpha = on ? 1 : 0.25; ctx.strokeStyle = on ? '#ff47e6' : '#888'; ctx.lineWidth = LW(1);
    const cx = zx - U * 4.6 + i * U * 2.6, cy = ty + U * 3.25, r = U * 0.9;
    ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (Sound.muted && !touch.on) text('SOUND OFF  M', W - U * 3, H - U * 3.2, U * 1.3, '#888', 'right', 0.8);
  if (invincible) text('INVINCIBLE', zx, ty + U * 6.2, U * 1.3, '#f0f', 'right');
}
function drawMsgs() {
  for (const m of msgs) {
    const a = m.t < 0.15 ? m.t / 0.15 : m.t > m.dur - 0.4 ? (m.dur - m.t) / 0.4 : 1;
    text(m.text, W / 2, H * m.y - U * m.size / 2, U * m.size, m.color, 'center', clamp(a, 0, 1));
  }
}
function drawGameScene() {
  let webColor = pal.web;
  if (zap.flash > 0) webColor = RAINBOW[Math.floor(T * 40) % RAINBOW.length];
  const showClaw = state === 'play' || state === 'warp' || (state === 'zoom' && zoom.t > 0.78) || (state === 'dying' && !death.exploded);
  drawWeb(webColor, showClaw && state !== 'dying' ? pal.lane : null, true);
  drawPulseLanes();
  drawSpikes();
  drawMines();
  for (const e of enemies) drawEnemy(e);
  drawShots();
  if (showClaw) drawClaw();
  drawFx();
  drawShards();
  drawZapFx();
  drawBolts();
}

/* ---------- screens ---------- */
function drawTitleLogo(cy, size) {
  const t = 'VORTEX';
  const jitter = Math.sin(T * 2) * U * 0.15;
  text(t, W / 2 + U * 0.5, cy + U * 0.5, size, '#36e6ff', 'center', 0.55, size * 0.07);
  text(t, W / 2 + jitter, cy, size, '#ff47e6', 'center', 1, size * 0.075);
}
function drawAttract() {
  drawStars();
  // rotating web backdrop
  const w = WEBS[attract.web];
  const saveWeb = web, savePal = pal; web = w; pal = PALETTES[Math.floor(attract.t / 80) % 4];
  view = computeView(w, [W * 0.1, H * 0.12, W * 0.9, H * 0.98]);
  const local = (attract.t % 5) / 5;
  camZ = local < 0.15 ? -10 * (1 - easeOut3(local / 0.15)) : local > 0.9 ? (local - 0.9) / 0.1 * 4.8 : 0;
  rot = w.closed ? attract.t * 0.25 : 0;
  ctx.globalAlpha = 0.38; drawWeb(pal.web, null, false); ctx.globalAlpha = 1;
  rot = 0; camZ = 0; web = saveWeb; pal = savePal;
  // panel
  const size = Math.min(U * 16, W / 7.5);
  drawTitleLogo(H * 0.12, size);
  text('A VECTOR TUBE SHOOTER', W / 2, H * 0.12 + size * 1.25, U * 1.9, '#ffe81a', 'center');
  if (attract.mode === 0) {
    const rows = touch.on ? [['RIM', 'DRAG ALONG THE TUBE RIM'], ['KNOB', 'DRAG OR CIRCLE TO SPIN'], ['FIRE', 'HOLD THE FIRE PAD'], ['AUTO', 'SMART AUTO-FIRE ' + (touch.auto ? '(ON)' : '(OFF)')], ['ZAP', 'SUPERZAPPER'], ['MODE', 'SPINNER OR ARROWS']] : [['MOUSE', 'POINT AT THE RIM, CLICK FIRE'], ['← →', 'MOVE CLAW  (HOLD = FASTER)'], ['SPACE', 'FIRE  (HOLD FOR RAPID FIRE)'], ['ENTER', 'SUPERZAPPER  (RIGHT CLICK)'], ['PAD', 'STICK = ANALOG SPIN, A FIRE'], ['F', 'SMART AUTOFIRE  ' + (autofire ? '(ON)' : '(OFF)')], ['P', 'PAUSE'], ['M', 'SOUND + MUSIC ON / OFF']];
    const top = H * 0.44, lh = U * 3.6, cs = U * 1.9;
    text('CONTROLS', W / 2, top - lh * 1.4, U * 2.4, '#36e6ff', 'center');
    rows.forEach(([k, d], i) => { text(k, W / 2 - U * 2, top + i * lh, cs, '#ffe81a', 'right'); text(d, W / 2 + U * 2, top + i * lh, cs, '#ffffff', 'left'); });
  } else if (attract.mode === 2) {
    // enemy guide: the four v4 enemies, drawn live, with their counter-play
    const top = H * 0.42, lh = Math.min(U * 9, H * 0.11), cs = U * 1.75;
    text('KNOW YOUR ENEMY', W / 2, top - U * 5, U * 2.4, '#36e6ff', 'center');
    const keys = ['phaser', 'warden', 'spark', 'layer'];
    keys.forEach((k, i) => {
      const d = NEWE[k], y = top + i * lh, x0 = W / 2 - U * 36;
      guideIcon(k, x0 + U * 4, y + U * 1.4, U * 3.4);
      text(d.name + '  L' + d.intro + '+  ' + d.pts, x0 + U * 10, y, cs * 1.15, d.col, 'left');
      text(d.tip, x0 + U * 10, y + U * 2.9, cs * 0.82, '#ffffff', 'left', 0.9);
    });
  } else {
    const top = H * 0.42, lh = U * 3.7, cs = U * 2.3;
    text('HIGH SCORES', W / 2, top - lh * 1.5, U * 2.8, '#36e6ff', 'center');
    hiscores.slice(0, 10).forEach((h, i) => {
      const c = i === 0 ? '#ffe81a' : '#ffffff';
      text((i + 1) + '.', W / 2 - U * 15, top + i * lh, cs, '#ff47e6', 'right');
      text(h[0], W / 2 - U * 12, top + i * lh, cs, c, 'left');
      text(String(h[1]), W / 2 + U * 10, top + i * lh, cs, c, 'right');
      text('L' + h[2], W / 2 + U * 17, top + i * lh, cs * 0.8, '#7fa0ff', 'right');
    });
  }
  if (Math.floor(T * 2) % 2 === 0) text(touch.on ? 'TAP TO START' : 'PRESS SPACE OR ENTER TO START', W / 2, H * 0.9 - SA.b * 0.5, U * 2.8, '#ff47e6', 'center');
  text('(C) 2026 BEHRAM ARCADE', W / 2, H * 0.955 - SA.b * 0.7, U * 1.3, '#6a78c0', 'center');
  if (Sound.muted && !touch.on) text('SOUND OFF  M', W - U * 3, H - U * 3.2, U * 1.3, '#888', 'right', 0.8);
}
const selRects = [];   // level boxes on RATE YOURSELF (canvas px), for tap selection
function drawSelect() {
  drawStars();
  text('RATE YOURSELF', W / 2, H * 0.1, U * 5, '#ff2a2a', 'center');
  text(touch.on ? 'TAP OR SWIPE TO CHOOSE A LEVEL   TAP START' : '← → TO CHOOSE A STARTING LEVEL   SPACE / ENTER TO START', W / 2, H * 0.1 + U * 7.5, U * 1.6, '#36e6ff', 'center');
  selRects.length = 0;
  const vis = 5, half = 2;
  let first = clamp(select.idx - half, 0, LADDER.length - vis);
  // narrow (portrait) screens: shrink the boxes so the LEVEL / HOLE / BONUS labels stay on screen
  const lab = U * 10, room = W - SA.l - SA.r - U * 2;
  let bw = Math.min(U * 18, W * 0.17), total = vis * bw * 1.12 - bw * 0.12, x0 = W / 2 - total / 2;
  if (x0 - lab < SA.l + U) { bw = Math.min(bw, (room - lab) / (vis * 1.12 - 0.12)); total = vis * bw * 1.12 - bw * 0.12; x0 = SA.l + U + lab + (room - lab - total) / 2; }
  const gap = bw * 0.12, top = H * 0.33, bh = bw * 1.25;
  text('LEVEL', x0 - U * 2, top + U * 1.2, U * 1.7, '#ffe81a', 'right');
  text('HOLE', x0 - U * 2, top + bh * 0.45, U * 1.7, '#ffe81a', 'right');
  text('BONUS', x0 - U * 2, top + bh - U * 2.2, U * 1.7, '#ffe81a', 'right');
  const saveWeb = web, savePal = pal, saveView = view;
  for (let i = 0; i < vis; i++) {
    const idx = first + i, [L, bonus] = LADDER[idx], x = x0 + i * (bw + gap);
    const sel = idx === select.idx;
    const pw = PALETTES[Math.floor((L - 1) / 16) % PALETTES.length];
    selRects.push([x, top - U * 0.8, bw, bh + U * 1.6, idx]);
    if (sel) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = LW(1.3 + 0.4 * Math.sin(T * 8)); ctx.strokeRect(x, top - U * 0.8, bw, bh + U * 1.6); }
    text(String(L), x + bw / 2, top + U * 0.6, U * 2.6, sel ? '#ffffff' : '#36e6ff', 'center');
    web = WEBS[(L - 1) % 16]; pal = pw; camZ = 0; rot = 0;
    view = computeView(web, [x + bw * 0.14, top + U * 5, x + bw * 0.86, top + bh - U * 5]);
    drawWeb(pw.web === '#1a2140' ? '#3a4680' : pw.web, null, false);
    text(String(bonus), x + bw / 2, top + bh - U * 2.6, U * 1.7, sel ? '#ffffff' : '#2bff4c', 'center');
  }
  web = saveWeb; pal = savePal; view = saveView;
  text('NOVICE', x0, top + bh + U * 4, U * 1.8, '#ff47e6', 'left');
  text('EXPERT', x0 + total, top + bh + U * 4, U * 1.8, '#ff47e6', 'right');
  // ladder overview bar
  const by = top + bh + U * 9, bx0 = x0, bx1 = x0 + total;
  ctx.strokeStyle = '#3a4680'; ctx.lineWidth = LW(0.8); ctx.beginPath(); ctx.moveTo(bx0, by); ctx.lineTo(bx1, by); ctx.stroke();
  const px = lerp(bx0, bx1, select.idx / (LADDER.length - 1));
  ctx.strokeStyle = '#ffe81a'; ctx.lineWidth = LW(1.4); ctx.beginPath(); ctx.moveTo(px, by - U); ctx.lineTo(px, by + U); ctx.stroke();
  const yb = touch.on && touch.ctrlTop ? Math.min(H, touch.ctrlTop * DPR) : H;   // touch portrait: stay above the START / arrow buttons
  text('TIME ' + Math.max(0, Math.ceil(select.t)), W / 2, Math.min(H * 0.86, yb - U * 9), U * 2.6, '#ffffff', 'center');
  text('HIGHER STARTS EARN THE BONUS WHEN THAT LEVEL IS CLEARED', W / 2, Math.min(H * 0.93, yb - U * 4), U * 1.3, '#6a78c0', 'center');
}
function drawInitials() {
  drawStars();
  const H = touch.on && touch.kbTop ? Math.min(canvas.height, touch.kbTop * DPR) : canvas.height;   // touch: fit above the letter pad
  text('GREAT SCORE!', W / 2, H * 0.16, U * 5, '#ff47e6', 'center');
  text(String(score), W / 2, H * 0.28, U * 3.6, '#ffe81a', 'center');
  text('ENTER YOUR INITIALS', W / 2, H * 0.4, U * 2.6, '#36e6ff', 'center');
  const cs = U * 7, gap = U * 3, total = 3 * cs + 2 * gap, x0 = W / 2 - total / 2;
  for (let i = 0; i < 3; i++) {
    const x = x0 + i * (cs + gap), on = i === initials.pos;
    text(initials.chars[i], x + cs / 2, H * 0.5, cs, on ? '#ffffff' : '#ffe81a', 'center', on ? 0.75 + 0.25 * Math.sin(T * 10) : 1);
    ctx.strokeStyle = on ? '#ff47e6' : '#3a4680'; ctx.lineWidth = LW(1.2); ctx.beginPath(); ctx.moveTo(x, H * 0.5 + cs * 1.25); ctx.lineTo(x + cs, H * 0.5 + cs * 1.25); ctx.stroke();
  }
  text(touch.on ? 'TAP LETTERS OR ↑ ↓   OK TO CONFIRM' : '↑ ↓ OR TYPE TO CHANGE   ENTER TO CONFIRM', W / 2, H * 0.76, U * 1.7, '#ffffff', 'center');
  text('RANK ' + (initials.rank + 1), W / 2, H * 0.83, U * 2, '#2bff4c', 'center');
}
// Glow. Built from a progressive half-size downsample chain (each step is an exact 2:1 box
// filter, so thin lines never alias into dotted/ghosted copies), blurred at two small levels and
// added back faintly. The full-resolution strokes are left untouched, so the crisp core stays on top.
// Browsers without ctx.filter (Safari) get an equivalent multi-tap blur instead of unblurred
// upscaled copies -- that fallback was what smeared and ghosted text on Safari.
const mips = [];
let glowA = null, glowB = null;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); return { c, x, w, h }; }
function buildMips(cssW) {
  mips.length = 0; let w = W, h = H;
  while (w > cssW / 3.5 && mips.length < 8) { w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2)); mips.push(mkCanvas(w, h)); }
  glowA = mips.find(m => m.w <= cssW * 0.6) || mips[mips.length - 1];   // ~css/2: tight halo
  glowB = mips.find(m => m.w <= cssW * 0.3) || mips[mips.length - 1];  // ~css/4: soft ambient
  glowA.tmp = mkCanvas(glowA.w, glowA.h); glowB.tmp = mkCanvas(glowB.w, glowB.h);
}
function blurLevel(m, px) {
  if (FILTER_OK) {
    m.tmp.x.globalCompositeOperation = 'copy'; m.tmp.x.filter = `blur(${px}px)`; m.tmp.x.drawImage(m.c, 0, 0); m.tmp.x.filter = 'none';
    return m.tmp.c;
  }
  // separable-ish 5-tap blur, two passes (r=1 then r=2) ~ gaussian of similar radius
  let src = m, dst = m.tmp;
  // additive 9-tap kernel (centre + 4 axis + 4 diagonal), weights sum to 1, applied at growing radii
  for (const r of px > 1.6 ? [1, 2, 3, 4] : [1, 1.5]) {
    dst.x.globalCompositeOperation = 'copy'; dst.x.globalAlpha = 0.2; dst.x.drawImage(src.c, 0, 0);
    dst.x.globalCompositeOperation = 'lighter';
    dst.x.globalAlpha = 0.12; for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) dst.x.drawImage(src.c, dx, dy);
    dst.x.globalAlpha = 0.08; for (const [dx, dy] of [[r, r], [-r, r], [r, -r], [-r, -r]]) dst.x.drawImage(src.c, dx, dy);
    dst.x.globalAlpha = 1; dst.x.globalCompositeOperation = 'source-over'; const t = src; src = dst; dst = t;
  }
  return src.c;
}
function bloomPass(boost = 0) {
  if (!mips.length) return;
  let prev = canvas;
  for (const m of mips) { m.x.globalCompositeOperation = 'copy'; m.x.imageSmoothingEnabled = true; m.x.drawImage(prev, 0, 0, m.w, m.h); prev = m.c; }
  const a = blurLevel(glowA, 1.4), b = blurLevel(glowB, 4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.95; ctx.drawImage(a, 0, 0, W, H);
  ctx.globalAlpha = 1; ctx.drawImage(b, 0, 0, W, H);
  if (boost > 0.02) { ctx.globalAlpha = Math.min(1, boost); ctx.drawImage(b, 0, 0, W, H); ctx.drawImage(a, 0, 0, W, H); if (boost > 1) { ctx.globalAlpha = boost - 1; ctx.drawImage(b, 0, 0, W, H); } }
  ctx.restore();
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (shake > 0) ctx.setTransform(1, 0, 0, 1, rand(-1, 1) * shake * U * 1.2, rand(-1, 1) * shake * U * 1.2);
  ctx.globalCompositeOperation = 'lighter';
  if (state === 'attract') drawAttract();
  else if (state === 'select') drawSelect();
  else if (state === 'initials') drawInitials();
  else {
    drawStars();
    drawGameScene();
    drawHUD();
    drawZapScreen();
    drawMsgs();
    if (state === 'gameover') { text('GAME OVER', W / 2, H * 0.47, U * 7, '#ff2a2a', 'center', Math.min(1, gameOverT * 2)); }
    if (paused) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'; text('PAUSED', W / 2, H * 0.44, U * 6, '#ffffff', 'center'); text(touch.on ? 'TAP TO RESUME' : 'P TO RESUME', W / 2, H * 0.56, U * 2, '#36e6ff', 'center'); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (flash > 0) { ctx.fillStyle = flashColor; ctx.globalAlpha = flash * 0.35; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  let boost = 0;
  if (zfx && inGame()) {
    // superzapper: white flash (before bloom, so it blooms too) and a bloom surge that decays over ~0.9 s
    if (zfx.t < 0.2) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = (zfx.big ? 0.55 : 0.2) * (1 - zfx.t / 0.2); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    boost = (zfx.big ? 1.3 : 0.5) * Math.max(0, 1 - zfx.t / 0.9);
  }
  bloomPass(boost);
  if (!paused) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; starsPass = true; drawStars(); starsPass = false; ctx.restore(); }
}

/* ============================== touch controls ==============================
   Shown automatically on phones / tablets (coarse pointer or mobile UA, or on the first real touch);
   hidden on desktop. ?touch=1 forces them on, ?touch=0 off. The controls are DOM elements laid out
   here in CSS px (safe-area aware) over the canvas, and the tube's view box shrinks to sit between them.
   - Spinner: drag (or circle) anywhere on the left half; sub-steps proportional to drag distance.
     Drag right / circle clockwise = turn the knob clockwise (same as the → key). MODE swaps in ◀ ▶ buttons.
   - FIRE (hold = rapid fire, same heat limit), ZAP, pause, mute, fullscreen (where supported).
   - Menus: tap to start, tap / swipe levels + START, letter pad for initials, tap to resume. */
const TOUCH_PARAM = params.get('touch');
const UA = navigator.userAgent || '';
const mq = q => !!(window.matchMedia && matchMedia(q).matches);
const IS_MOBILE = /iPhone|iPad|iPod|Android|Mobile|Silk|Kindle/i.test(UA) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || '')) || (mq('(pointer: coarse)') && !mq('(hover: hover)'));
const TC = { E: {}, mode: store.get('touchMode', 'spin') === 'arrows' ? 'arrows' : 'spin', stepPx: 8, knobR: 60, box: null, ts: null, sa: { l: 0, r: 0, t: 0, b: 0 }, sync: {}, akeys: new Set(), built: false };
const mk = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const ICON = {
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  snd: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M16 4L6 12l10 8z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M8 4l10 8-10 8z"/></svg>',
};
const probe = mk('div', 'tprobe'); document.body.appendChild(probe);   // reads env(safe-area-inset-*)
function readSafe() { const cs = getComputedStyle(probe), f = v => parseFloat(v) || 0; return { t: f(cs.paddingTop), r: f(cs.paddingRight), b: f(cs.paddingBottom), l: f(cs.paddingLeft) }; }
function fsSupported() { const d = document, el = d.documentElement; return !!((d.fullscreenEnabled || d.webkitFullscreenEnabled) && (el.requestFullscreen || el.webkitRequestFullscreen)) && !navigator.standalone && !mq('(display-mode: standalone)'); }
function fsToggle() {
  const d = document, el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' }); if (r && r.catch) r.catch(() => {}); }
  } catch (e) {}
}
// press-and-hold helper: pointer capture per finger, so several controls work at once (multi-touch)
function hold(el, down, up) {
  const ids = new Set();
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    ids.add(e.pointerId); el.classList.add('on'); if (down) down(e);
  });
  const end = e => { if (!ids.delete(e.pointerId)) return; if (!ids.size) { el.classList.remove('on'); if (up) up(e); } };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, end);
}
function setMode(m) {
  TC.mode = m; store.set('touchMode', m);
  for (const k of TC.akeys) keys[k] = false; TC.akeys.clear();
  document.body.classList.toggle('arrows', m === 'arrows');
  if (TC.E.mode) TC.E.mode.textContent = m === 'arrows' ? 'MODE: ARROWS' : 'MODE: SPINNER';
}
const sp = { id: null, x: 0, y: 0, ux: 0, uy: 0, has: false, turn: 0, ang: 0 };
function spinMove(x, y) {
  const dx = x - sp.x, dy = y - sp.y, len = Math.hypot(dx, dy);
  if (len < 3) return;
  sp.x = x; sp.y = y;
  const ux = dx / len, uy = dy / len;
  if (sp.has) {
    const a = Math.atan2(sp.ux * uy - sp.uy * ux, sp.ux * ux + sp.uy * uy);   // turn between segments, + = clockwise on screen
    if (Math.abs(a) > 2.2) sp.turn = 0;                // sharp reversal: a back-and-forth scrub, not a circle
    else sp.turn = sp.turn * Math.exp(-len / 90) + a;  // curvature accumulated over the last ~90 px of path
  }
  sp.ux = ux; sp.uy = uy; sp.has = true;
  // horizontal drag: distance along x (right = clockwise). Small circles: path length, signed by the turning direction
  const d = Math.abs(sp.turn) > 1.4 ? len * sgn(sp.turn) : dx;
  sp.ang += d / TC.knobR;
  TC.E.dial.style.transform = 'rotate(' + sp.ang.toFixed(3) + 'rad)';
  if (canSteer()) aimAdd(-d / (3 * TC.stepPx));   // analog: one third of a lane per stepPx; clockwise = lower lane index (→ key)
}
const canSteer = () => (state === 'zoom' || state === 'play' || state === 'warp') && !paused && !window.__freeze_input;
/* Rim tracking (v4): put a finger anywhere over the tube and slide it along (or around) the rim - the claw follows the
   finger's rim position *relatively* (so the finger never hides the claw and there is no jump on touch-down), with a
   small gain. On closed webs, motion near the centre of the tube is damped (the angle is unstable there). */
const rt = { id: null, c: 0, x: 0, y: 0 };
function rimMove(x, y) {
  if (!canSteer()) return;
  const q = rimCoordAt(x * DPR, y * DPR, rt.c); if (!q) return;
  const w = web.closed ? clamp((q.r - 0.12 * q.R) / (0.25 * q.R), 0, 1) : 1;
  const d = rimDiff(rt.c, q.c); rt.c = q.c;
  if (Math.abs(d) < web.n / 3) aimAdd(d * w * 1.15);
  rt.x = x; rt.y = y;
}
function fireSync() { touch.fire = touch.fireBtn || touch.fireZone; }
function initialsKey(c) {
  if (c === '↑') onPress('ArrowUp'); else if (c === '↓') onPress('ArrowDown');
  else if (c === 'DEL') onPress('Backspace'); else if (c === 'OK') onPress('Enter');
  else if (state === 'initials') { initials.chars[initials.pos] = c; Sound.play('tick'); if (initials.pos < 2) initials.pos++; }
}
function touchBuild() {
  if (TC.built) return; TC.built = true;
  const root = mk('div', 'tc'), E = TC.E;
  E.spin = mk('div', 'tspin');
  E.knob = mk('div', 'tknob', 'tctl', '<i></i><b>SPIN</b>'); E.dial = E.knob.firstChild;
  E.left = mk('div', 'tleft', 'tctl', ICON.left); E.right = mk('div', 'tright', 'tctl', ICON.right);
  E.mode = mk('div', 'tmode', 'tctl');
  E.rim = mk('div', 'trim'); E.fz = mk('div', 'tfz', null, '<span>FIRE ZONE</span>'); E.auto = mk('div', 'tauto', 'tctl tsq', 'AUTO');
  E.ring = mk('div', 'tring');
  E.zap = mk('div', 'tzap', 'tctl', 'ZAP'); E.fire = mk('div', 'tfire', 'tctl', 'FIRE'); E.start = mk('div', 'tstart', 'tctl', 'START');
  E.pause = mk('div', 'tpause', 'tctl tsq', ICON.pause); E.mute = mk('div', 'tmute', 'tctl tsq', ICON.snd); E.fs = mk('div', 'tfs', 'tctl tsq', ICON.fs);
  E.keys = mk('div', 'tkeys');
  for (const c of [...INITIAL_SET, '↑', '↓', 'DEL', 'OK']) { const k = mk('div', null, 'tkey' + (c.length > 1 || c === '↑' || c === '↓' ? ' fn' : ''), c === ' ' ? 'SPC' : c); k.dataset.c = c; E.keys.appendChild(k); }
  for (const k of ['rim', 'ring', 'fz', 'spin', 'knob', 'left', 'right', 'mode', 'zap', 'fire', 'start', 'auto', 'pause', 'mute', 'fs', 'keys']) root.appendChild(E[k]);
  document.body.appendChild(root);
  E.spin.setAttribute('aria-label', 'spinner'); E.fire.setAttribute('aria-label', 'fire'); E.zap.setAttribute('aria-label', 'superzapper');
  if (fsSupported()) document.body.classList.add('fsok');
  // spinner zone
  E.spin.addEventListener('pointerdown', e => {
    e.preventDefault(); if (sp.id != null) return;
    try { E.spin.setPointerCapture(e.pointerId); } catch (_) {}
    sp.id = e.pointerId; sp.x = e.clientX; sp.y = e.clientY; sp.has = false; sp.turn = 0; E.knob.classList.add('on');
  });
  E.spin.addEventListener('pointermove', e => {
    if (e.pointerId !== sp.id) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (evs && evs.length) for (const c of evs) spinMove(c.clientX, c.clientY); else spinMove(e.clientX, e.clientY);
  });
  const spinEnd = e => { if (e.pointerId !== sp.id) return; sp.id = null; E.knob.classList.remove('on'); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) E.spin.addEventListener(ev, spinEnd);
  // rim-tracking zone over the tube
  E.rim.addEventListener('pointerdown', e => {
    e.preventDefault(); if (rt.id != null) return;
    try { E.rim.setPointerCapture(e.pointerId); } catch (_) {}
    rt.id = e.pointerId; rt.x = e.clientX; rt.y = e.clientY;
    const q = rimCoordAt(e.clientX * DPR, e.clientY * DPR, player.pos); rt.c = q ? q.c : player.pos;
    E.ring.classList.add('on'); placeRing(e.clientX, e.clientY);
  });
  E.rim.addEventListener('pointermove', e => {
    if (e.pointerId !== rt.id) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (evs && evs.length) for (const c of evs) rimMove(c.clientX, c.clientY); else rimMove(e.clientX, e.clientY);
    placeRing(e.clientX, e.clientY);
  });
  const rimEnd = e => { if (e.pointerId !== rt.id) return; rt.id = null; E.ring.classList.remove('on'); };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) E.rim.addEventListener(ev, rimEnd);
  // big fire pad (the whole thumb area around FIRE / ZAP): hold anywhere = fire
  hold(E.fz, () => { touch.fireZone = true; fireSync(); }, () => { touch.fireZone = false; fireSync(); });
  hold(E.auto, () => { touch.auto = !touch.auto; store.set('touchAuto', touch.auto); autoSync(); msg(touch.auto ? 'SMART AUTO-FIRE ON' : 'AUTO-FIRE OFF', 1.2, 0.68, '#9ff', 2.4); Sound.play('tick'); });
  // arrow buttons (alternative to the spinner; also pick the level on RATE YOURSELF) behave like the arrow keys
  for (const [el, k] of [[E.left, 'ArrowLeft'], [E.right, 'ArrowRight']]) hold(el, () => { keys[k] = true; TC.akeys.add(k); onPress(k); }, () => { keys[k] = false; TC.akeys.delete(k); });
  hold(E.mode, () => setMode(TC.mode === 'spin' ? 'arrows' : 'spin'));
  hold(E.fire, () => { touch.fireBtn = true; fireSync(); }, () => { touch.fireBtn = false; fireSync(); });
  hold(E.zap, () => onPress('Enter'));
  hold(E.start, null, () => { if (state === 'select') onPress('Enter'); });
  hold(E.pause, () => onPress('KeyP'));
  hold(E.mute, () => { Sound.unlock(); onPress('KeyM'); });
  // fullscreen needs a real activation: touchend for fingers, pointerup for mouse / pen
  hold(E.fs, null, e => { if (e.pointerType !== 'touch') fsToggle(); });
  E.fs.addEventListener('touchend', e => { e.preventDefault(); fsToggle(); });
  E.keys.addEventListener('pointerdown', e => {
    const k = e.target.closest && e.target.closest('.tkey'); if (!k) return;
    e.preventDefault(); k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 130);
    initialsKey(k.dataset.c);
  });
  setMode(TC.mode); autoSync();
}
function autoSync() { if (TC.E.auto) { TC.E.auto.classList.toggle('off', !touch.auto); TC.E.auto.classList.toggle('lit', touch.auto); } }
function placeRing(x, y) { const s = TC.E.ring.style; s.transform = 'translate(' + Math.round(x - 30) + 'px,' + Math.round(y - 30) + 'px)'; }
// taps / swipes on the canvas drive the menus
const ct = { id: null, x0: 0, y0: 0, ax: 0, swiped: false };
canvas.addEventListener('pointerdown', e => {
  if (!touch.on) return; e.preventDefault();
  ct.id = e.pointerId; ct.x0 = ct.ax = e.clientX; ct.y0 = e.clientY; ct.swiped = false;
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerId !== ct.id || state !== 'select') return;
  const stepW = Math.max(28, Math.min(innerWidth, innerHeight) * 0.09), n = Math.trunc((e.clientX - ct.ax) / stepW);
  if (n) { const i = clamp(select.idx - n, 0, LADDER.length - 1); ct.ax += n * stepW; ct.swiped = true; if (i !== select.idx) { select.idx = i; Sound.play('tick'); } }
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerId !== ct.id) return; ct.id = null;
  if (ct.swiped || Math.hypot(e.clientX - ct.x0, e.clientY - ct.y0) > 16) return;
  Sound.unlock();
  if (state === 'attract' || state === 'gameover') onPress('Space');
  else if (state === 'select') {
    const px = e.clientX * DPR, py = e.clientY * DPR;
    const r = selRects.find(r => px >= r[0] && px <= r[0] + r[2] && py >= r[1] && py <= r[1] + r[3]);
    if (r) { if (r[4] === select.idx) startGame(); else { select.idx = r[4]; Sound.play('tick'); } }
  } else if (paused && inGame()) paused = false;
});
canvas.addEventListener('pointercancel', () => { ct.id = null; });
// no page scroll, pinch zoom, double-tap zoom, callout or text selection on the game page
document.addEventListener('touchstart', e => { if (e.target.closest && e.target.closest('a,#errbar')) return; if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('contextmenu', e => { if (touch.on) e.preventDefault(); });
function touchEnable(on) {
  if (touch.on === on) return;
  touch.on = on; document.body.classList.toggle('touch', on);
  if (on) touchBuild();
  TC.ts = null; touchSync(); resize();
}
// a real finger on a device that wasn't detected as touch (e.g. a touchscreen laptop) switches the controls on
addEventListener('pointerdown', e => { if (e.pointerType === 'touch' && TOUCH_PARAM !== '0') touchEnable(true); }, true);
const place = (el, x, y, w, h) => { const s = el.style; s.left = Math.round(x) + 'px'; s.top = Math.round(y) + 'px'; s.width = Math.round(w) + 'px'; s.height = Math.round(h) + 'px'; };
function touchLayout() {
  if (!TC.built) return;
  const E = TC.E, sa = TC.sa, iw = innerWidth, ih = innerHeight, m = Math.min(iw, ih), land = iw >= ih;
  const ts = TC.ts || 'menu', game = ts === 'game' || ts === 'paused';
  TC.stepPx = clamp(m * 0.022, 6, 12);
  const bot = ih - Math.max(sa.b, 8), hudH = sa.t + m * 0.14;
  const sq = clamp(m * 0.1, 36, 46);
  let barX, barY, ctrlTop = ih;
  if (land) {
    const side = clamp(iw * 0.22, 150, 300), lx = sa.l, rx = iw - sa.r - side;
    const fireD = clamp(Math.min(side - 30, ih * 0.34), 84, 160), zapD = Math.round(fireD * 0.62);
    const knobD = clamp(Math.min(side - 20, (bot - hudH - 50) * 0.85), 96, 230);
    place(E.spin, 0, hudH, lx + side + 2, ih - hudH);
    place(E.fz, rx - 2, hudH, iw - rx + 2, ih - hudH);
    place(E.knob, lx + (side - knobD) / 2, bot - 8 - knobD, knobD, knobD);
    const ab = clamp((side - 34) / 2, 58, 120);
    place(E.left, lx + side / 2 - ab - 6, bot - 8 - ab, ab, ab); place(E.right, lx + side / 2 + 6, bot - 8 - ab, ab, ab);
    place(E.mode, lx + 10, hudH + 4, Math.min(side - 20, 150), 32);
    const fx = iw - sa.r - 14 - fireD, fy = bot - 8 - fireD;
    place(E.fire, fx, fy, fireD, fireD); place(E.start, fx, fy, fireD, fireD);
    place(E.zap, Math.max(rx + 6, fx - zapD * 0.3), fy - zapD - 12, zapD, zapD);
    barX = iw - sa.r - 10; barY = game ? sa.t + m * 0.09 : sa.t + 6;
    TC.box = [lx + side + 4, sa.t + ih * 0.115, rx - 4, ih - sa.b - ih * 0.035];
    TC.knobR = knobD / 2;
    place(E.rim, lx + side + 2, hudH * 0.6, rx - lx - side - 4, ih - hudH * 0.6);
  } else {
    const ctrlH = clamp(ih * 0.33, 200, 330), cy0 = ih - sa.b - ctrlH; ctrlTop = cy0;
    const knobD = clamp(Math.min(iw * 0.44, ctrlH - 64), 110, 240);
    place(E.spin, 0, cy0 - 10, iw * 0.56, ih - cy0 + 10);
    place(E.fz, iw * 0.56, cy0 - 10, iw * 0.44, ih - cy0 + 10);
    place(E.knob, sa.l + Math.max(12, iw * 0.25 - knobD / 2), bot - 10 - knobD, knobD, knobD);
    const ab = clamp(iw * 0.2, 60, 110);
    place(E.left, sa.l + 12, bot - 10 - ab, ab, ab); place(E.right, sa.l + 24 + ab, bot - 10 - ab, ab, ab);
    place(E.mode, sa.l + 12, cy0 + 4, 150, 32);
    const fireD = clamp(Math.min(iw * 0.32, ctrlH * 0.5), 90, 160), zapD = Math.round(fireD * 0.62);
    const fx = iw - sa.r - 14 - fireD, fy = bot - 14 - fireD;
    place(E.fire, fx, fy, fireD, fireD); place(E.start, fx, fy, fireD, fireD);
    barX = iw - sa.r - 10; barY = game ? cy0 : sa.t + 4;
    // ZAP sits up-left of FIRE, below the button bar and clear of the knob
    place(E.zap, fx - zapD * 0.78, Math.max(fy - zapD * 0.55, cy0 + sq + 10), zapD, zapD);
    TC.box = [sa.l + iw * 0.035, sa.t + m * 0.14, iw - sa.r - iw * 0.035, cy0 - 12];
    TC.knobR = knobD / 2;
    place(E.rim, 0, sa.t + m * 0.1, iw, cy0 - 10 - sa.t - m * 0.1);
  }
  // small square buttons, right-aligned: [fullscreen] [mute] [pause]
  const bar = [E.pause, E.mute, E.fs, E.auto].filter(el => getComputedStyle(el).display !== 'none');
  bar.forEach((el, i) => place(el, barX - (i + 1) * sq - i * 8, barY, sq, sq));
  // initials letter pad along the bottom
  const cols = land ? 17 : 9, rows = Math.ceil(E.keys.children.length / cols);
  const kw = Math.min(54, (iw - sa.l - sa.r - 20) / cols), kh = clamp(kw * 0.95, 36, 50);
  const kx = (iw - kw * cols) / 2, ky = bot - 8 - rows * kh;
  place(E.keys, kx, ky, kw * cols, rows * kh); E.keys.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
  touch.kbTop = ky - 6; touch.ctrlTop = ctrlTop;
}
function touchSync() {
  const ts = !touch.on ? '' : inGame() ? (paused ? 'paused' : 'game') : (state === 'attract' || state === 'gameover') ? 'menu' : state;
  if (ts !== TC.ts) {
    TC.ts = ts; document.body.dataset.ts = ts;
    if (ts !== 'game') { touch.fireBtn = touch.fireZone = false; fireSync(); rt.id = null; if (TC.E.ring) TC.E.ring.classList.remove('on'); }
    touchLayout();
  }
  if (!touch.on || !TC.built) return;
  const E = TC.E, S = TC.sync;
  if (player.overheat !== S.hot) { S.hot = player.overheat; E.fire.classList.toggle('hot', S.hot); }
  if (zapUses !== S.zap) { S.zap = zapUses; E.zap.classList.toggle('used', zapUses >= 2); }
  if (Sound.muted !== S.mute) { S.mute = Sound.muted; E.mute.innerHTML = S.mute ? ICON.mute : ICON.snd; E.mute.classList.toggle('off', S.mute); }
  if (paused !== S.pause) { S.pause = paused; E.pause.innerHTML = paused ? ICON.play : ICON.pause; }
}
viewBoxHook = () => touch.on && TC.box ? TC.box.map(v => v * DPR) : null;
if (TOUCH_PARAM === '1' || (TOUCH_PARAM !== '0' && IS_MOBILE)) { touch.on = true; document.body.classList.add('touch'); touchBuild(); touchSync(); }

/* ============================== loop ============================== */
// Rendering resolution: full devicePixelRatio x supersampling (default 2x), capped at
// ~9.4 MP (~5 MP on phones / tablets, to hold 60 fps) for performance; the browser downsamples the canvas for anti-aliased, crisp lines.
// Adaptive: if the frame rate sags the supersample factor steps down. ?ss=1..3 overrides.
const SS_FIXED = parseFloat(params.get('ss')) || 0;
let SS = SS_FIXED || 2, slowT = 0, fastT = 0;
const MAX_PIX = IS_MOBILE ? 5e6 : 9.4e6;
function resize() {
  const cw = Math.max(1, innerWidth), ch = Math.max(1, innerHeight), dpr = window.devicePixelRatio || 1;
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';   // exactly the visible viewport (iOS 100vh includes hidden toolbars)
  // never below native device resolution (dpr capped at 3); the pixel cap only limits supersampling
  const nat = Math.min(Math.max(dpr, 1), 3);
  let s = nat * SS; s = Math.min(s, Math.sqrt(MAX_PIX / (cw * ch))); s = Math.max(s, nat);
  DPR = s;
  W = Math.max(1, Math.round(cw * s)); H = Math.max(1, Math.round(ch * s));
  canvas.width = W; canvas.height = H;
  // glow buffers sized from CSS pixels so the bloom looks the same at any internal resolution
  buildMips(cw);
  U = Math.min(W, H) / 100;
  const sa = readSafe(); TC.sa = sa; SA = { l: sa.l * s, r: sa.r * s, t: sa.t * s, b: sa.b * s };
  touchLayout();
  if (inGame() || state === 'gameover') view = computeView(web);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => { resize(); setTimeout(resize, 350); });   // iOS updates safe-area insets a moment later
resize();
let last = performance.now(), fps = 60;
let frameErrs = 0;
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); frameErrs = 0; }
  catch (err) {
    // never a silent black screen: report it (banner with RELOAD) and keep the loop alive in case it was transient
    console.error(err);
    if (++frameErrs >= 3 && window.__vortexError) window.__vortexError((err && err.message) || String(err));
    paused = paused || frameErrs >= 3;
  }
}
function frameBody(now) {
  let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1; if (dt > 0) fps = lerp(fps, 1 / dt, 0.05);
  pollPad();
  Music.update(dt);
  if (!SS_FIXED && !document.hidden && dt > 0) {
    // only step down for sustained slowness (fps < 45 for 3 s of real, non-hitch frames); never below native res
    if (fps < 45 && SS > 1 && dt < 0.09) { slowT += dt; if (slowT > 3) { SS = Math.max(1, SS - 0.5); resize(); slowT = 0; fps = 60; } } else slowT = Math.max(0, slowT - dt * 2);
  }
  if (!paused && !window.__freeze) { let rem = dt; while (rem > 1e-6) { const h = Math.min(rem, 1 / 120); update(h); rem -= h; } }
  render();
  touchSync();
  if (DEBUG) text(Math.round(fps) + ' FPS', W - U * 2, H - U * 6, U * 1.3, '#0f0', 'right');
}
requestAnimationFrame(frame);

// hooks for automated testing / debugging
window.VORTEX = {
  get state() { return { touch: touch.on, touchMode: TC.mode, fire: touch.fire, auto: touch.on ? touch.auto : autofire, pos: player.pos, aim: player.aim, mines: mines.length, armed: mines.filter(m => m.armed).length, shards: shards.length, zfx: !!zfx, dpr: DPR, ss: SS, res: W + 'x' + H, sub: player.sub, lean: player.lean, music: Music.track ? Music.track.L : 0, musicOn: !!Music.timer, state, paused, level, score, lives, zapUses, enemies: enemies.length, pool: pool.length, spikes: spikes.slice(), web: web.name, lane: player.lane, pz: player.z, camZ }; },
  debug: DEBUG,
  setInvincible(v) { invincible = !!v; },
  clearLevel() { pool = []; enemies = []; eshots = []; if (state === 'play') startWarp(); },
  spawn(type, lane, z) { const e = makeEnemy(type, lane, z == null ? 1 : z); e.spawnT = 1; enemies.push(e); return e.id; },
  setSpikes(v) { for (let i = 0; i < web.n; i++) spikes[i] = v; },
  hiscores: () => hiscores.slice(),
  setLives(v) { lives = v; },
  addScore(v) { addScore(v); },
  freeze(v) { window.__freeze = !!v; },
  attractMode(m) { attract.mode = m; attract.modeT = 0; },
  // test harness: deterministic fast-forward (call freeze(true) first so the rAF loop doesn't also advance)
  key(code, down) { keys[code] = !!down; },
  step(sec, until) { const n = Math.round(sec * 120); for (let i = 0; i < n; i++) { update(1 / 120); if (until && until()) return i / 120; } return sec; },
  emptyField() { pool = []; enemies = []; eshots = []; pshots = []; mines = []; spikes.fill(0); },
  setLane(l, sub) { placeClaw(wrapLane(l), sub || 0); },
  setAuto(v) { if (touch.on) { touch.auto = !!v; autoSync(); } else autofire = !!v; },
  mineList: () => mines.map(m => ({ lane: m.lane, z: m.z, armed: m.armed })),
  addMine(lane, z, armed) { mines.push({ lane, z: armed ? 0 : z, armed: !!armed, t: 0, life: armed ? 7 : 0, bump: 0 }); },
  enemy: id => { const e = enemies.find(e => e.id === id); return e ? { type: e.type, lane: e.lane, z: e.z, ph: e.ph, shield: e.shield, vent: e.vent, x: e.x, mode: e.mode, flipping: e.flipping } : null; },
  setEnemy(id, o) { const e = enemies.find(e => e.id === id); if (e) Object.assign(e, o); },
  rimPoint(c) { const q = railF(c), p = proj(q[0], q[1], 0); return p ? { x: p[0] / DPR, y: p[1] / DPR } : null; },
  rimCenter() { let x = 0, y = 0; for (let i = 0; i < web.n; i++) { const q = railF(i), p = proj(q[0], q[1], 0); x += p[0]; y += p[1]; } return { x: x / web.n / DPR, y: y / web.n / DPR }; },
  superzap() { superzap(); },
  params: L => L ? levelParams(L) : Object.assign({}, LP),
  poolCounts: L => poolCounts(L),
  enemyList: () => enemies.map(e => ({ id: e.id, type: e.type, lane: e.lane, z: e.z, flipping: e.flipping, ft: e.ft, dir: e.dir, landT: e.landT, atRim: e.atRim, rail: e.rail })),
  fire: () => ({ heat: player.heat, overheat: player.overheat, shots: pshots.length }),
  deathKind: () => death ? death.kind : null,
  // touch-test helpers (CSS px)
  selectIdx: () => select.idx,
  selectBoxes: () => selRects.map(r => ({ x: (r[0] + r[2] / 2) / DPR, y: (r[1] + r[3] / 2) / DPR, idx: r[4] })),
  webBounds() { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const q of web.pts) for (const zw of [-0.18, LL]) { const a = proj(q[0], q[1], zw); if (!a) continue; x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } return { x0: x0 / DPR, x1: x1 / DPR, y0: y0 / DPR, y1: y1 / DPR }; },
  touchStepPx: () => TC.stepPx,
  shotsFired: () => shotsFired,
  muted: () => Sound.muted,
  fps: () => Math.round(fps),
  wave: () => ({ kind: wave.kind, queued: wave.q.length, packs: Object.keys(wave.packs).length, packClears, log: wave.log.slice() }),
  waveKind: L => waveKind(L),
  kill(id, zapped) { const e = enemies.find(e => e.id === id); if (!e) return false; if (zapped) zap.kill = true; killEnemy(e, !zapped); zap.kill = false; enemies = enemies.filter(e => !e.dead); return true; },
  score: () => score,
  playerLane: () => player.lane,
  webInfo: () => ({ n: web.n, closed: web.closed }),
  gotoLevel(L) { startLevel = L; bonusPending = 0; beginLevel(L); },
};
})();
