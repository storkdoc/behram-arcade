/* ==========================================================================
   RILEY'S RUN — tracks.js
   Every course is a centre line sampled every metre (position, tangent,
   signed curvature, bank) plus 8 lanes either side of it. Lane 0 is the
   leftmost lane (the inside of an anticlockwise oval). A runner's progress
   is measured along the centre line; running a lane on the inside of a curve
   covers the same centre-line distance in fewer real metres, so lane choice
   matters (see sim.js).
   ========================================================================== */
export const LANES = 8, LW = 1.25;
export const laneOff = x => (3.5 - x) * LW;           // left offset of lane x from the centre line

function buildPath(segs, loop, startHeading = 0) {
  // segs: [{len, k (signed curvature at end, linear ramp from previous), bank, y}]
  const P = []; let x = 0, z = 0, h = startHeading, k = 0;
  P.push({ x, z, h, k: 0, bank: 0, y: 0 });
  for (const sg of segs) {
    const k0 = k, k1 = sg.k ?? 0, n = Math.round(sg.len), b0 = P[P.length - 1].bank, b1 = sg.bank ?? 0;
    const y0 = P[P.length - 1].y, y1 = sg.y ?? y0;
    for (let i = 1; i <= n; i++) {
      const f = i / n, kk = sg.ramp ? k0 + (k1 - k0) * f : k1;
      h += kk;                                             // 1 m step: heading change = curvature
      x += Math.sin(h); z += Math.cos(h);
      k = kk;
      P.push({ x, z, h, k: kk, bank: sg.ramp ? b0 + (b1 - b0) * f : b1, y: y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos(Math.PI * f)) });
    }
    k = k1;
  }
  if (loop) { // close tiny numerical gaps by spreading the error
    const last = P[P.length - 1], ex = last.x - P[0].x, ez = last.z - P[0].z, n = P.length - 1;
    for (let i = 0; i <= n; i++) { P[i].x -= ex * i / n; P[i].z -= ez * i / n; }
    P.pop();
  }
  return P;
}

class Path {
  constructor(pts, loop) {
    this.p = pts; this.loop = loop; this.len = loop ? pts.length : pts.length - 1;
    // tangent & left normal; forward heading h: direction (sin h, cos h) in xz, left = (cos h, -sin h)
    for (const q of pts) { q.tx = Math.sin(q.h); q.tz = Math.cos(q.h); q.lx = q.tz; q.lz = -q.tx; }
  }
  idx(s) { if (this.loop) { s %= this.len; if (s < 0) s += this.len; } else s = Math.max(0, Math.min(this.len - 0.0001, s)); return s; }
  at(s, out = {}) {
    s = this.idx(s); const i = Math.floor(s), f = s - i, a = this.p[i], b = this.p[(i + 1) % this.p.length] || a;
    out.x = a.x + (b.x - a.x) * f; out.z = a.z + (b.z - a.z) * f; out.y = a.y + (b.y - a.y) * f;
    let dh = b.h - a.h; out.h = a.h + dh * f;
    out.k = a.k + (b.k - a.k) * f; out.bank = a.bank + (b.bank - a.bank) * f;
    out.tx = Math.sin(out.h); out.tz = Math.cos(out.h); out.lx = out.tz; out.lz = -out.tx;
    return out;
  }
  // world position of lane x (0..7) at distance s, h = height above surface
  pos(s, x, hgt = 0, out = {}) {
    const q = this.at(s, out), o = laneOff(x);
    const bankY = Math.sin(q.bank) * o; // banked turns: inside lanes lower (bank>0 tilts outside up)
    out.wx = q.x + q.lx * o; out.wz = q.z + q.lz * o; out.wy = q.y - bankY + hgt;
    return out;
  }
  kAhead(s, d) { let m = 0; for (let t = 0; t <= d; t += 4) { const k = this.at(s + t).k; if (Math.abs(k) > Math.abs(m)) m = k; } return m; }
}

const R = d => d * Math.PI / 180;
function oval(straight, radius, bankDeg = 0) {
  const k = 1 / radius, arc = Math.PI * radius, ease = 10;
  const b = R(bankDeg);
  return buildPath([
    { len: straight - ease, k: 0 },
    { len: ease, k, ramp: 1, bank: b }, { len: arc - ease, k, bank: b }, { len: ease, k: 0, ramp: 1, bank: 0 },
    { len: straight - ease, k: 0 },
    { len: ease, k, ramp: 1, bank: b }, { len: arc - ease, k, bank: b }, { len: ease, k: 0, ramp: 1, bank: 0 },
  ], true, 0);
}

/* ---- objects placed on courses ---- */
function rows(from, to, step) { const a = []; for (let s = from; s <= to; s += step) a.push(s); return a; }

export const TRACKS = [
  {
    id: 'sunny', name: 'SUNNY STADIUM 400M', short: 'Sunny Stadium', laps: 1, theme: 'sunny',
    blurb: 'Classic red oval, packed bleachers. Boost pads and draft lanes: hug the inside on the bends.',
    tag: 'SPEED · DRAFTING', icon: '☀️',
    make() {
      const path = new Path(oval(80, 38.2), true);
      const start = 60, dist = path.len;
      return {
        path, start, dist,
        boost: [{ s: start + 100, l: [1, 5] }, { s: start + 180, l: [0, 3, 6] }, { s: start + 300, l: [2, 6] }, { s: start + 360, l: [1, 4] }],
        items: [start + 45, start + 150, start + 255, start + 330],
        stars: rows(start + 20, start + dist - 30, 26),
        hurdles: [], puddles: [], ramps: [], gusts: [],
      };
    }
  },
  {
    id: 'hurdle', name: 'HURDLE GAUNTLET', short: 'Hurdle Gauntlet', laps: 1, theme: 'hurdle',
    blurb: 'A 320 m straight with 14 rows of hurdles. Jump at the top of the stride for a PERFECT burst; clip one and you stumble.',
    tag: 'TIMING · HURDLES', icon: '🚧',
    make() {
      const path = new Path(buildPath([{ len: 380, k: 0 }], false), false);
      const start = 20, dist = 320;
      return {
        path, start, dist,
        hurdles: rows(start + 30, start + 290, 20),
        boost: [{ s: start + 60, l: [3, 4] }, { s: start + 140, l: [0, 7] }, { s: start + 220, l: [2, 5] }],
        items: [start + 50, start + 130, start + 210],
        stars: rows(start + 15, start + dist - 15, 20).map(s => s + 10),
        puddles: [], ramps: [], gusts: [],
      };
    }
  },
  {
    id: 'boardwalk', name: 'BOARDWALK SPRINT', short: 'Boardwalk Sprint', laps: 1, theme: 'boardwalk',
    blurb: 'Golden hour by the sea. Wind gusts (tuck in behind someone!), slick splash patches and jump ramps for big air.',
    tag: 'WIND · RAMPS · SPLASH', icon: '🌅',
    make() {
      const path = new Path(buildPath([
        { len: 60, k: 0 }, { len: 40, k: 1 / 70, ramp: 1 }, { len: 50, k: 1 / 70 }, { len: 40, k: 0, ramp: 1 },
        { len: 60, k: 0 }, { len: 40, k: -1 / 60, ramp: 1 }, { len: 60, k: -1 / 60 }, { len: 40, k: 0, ramp: 1 },
        { len: 70, k: 0 }, { len: 40, k: 1 / 80, ramp: 1 }, { len: 40, k: 1 / 80 }, { len: 40, k: 0, ramp: 1 },
        { len: 130, k: 0 },
      ], false), false);
      const start = 20, dist = 620;
      return {
        path, start, dist,
        gusts: [{ s0: start + 120, s1: start + 200, side: 1 }, { s0: start + 330, s1: start + 420, side: -1 }, { s0: start + 520, s1: start + 590, side: 1 }],
        puddles: [{ s: start + 90, l: 2 }, { s: start + 95, l: 5 }, { s: start + 240, l: 1 }, { s: start + 250, l: 4 }, { s: start + 255, l: 6 },
          { s: start + 380, l: 3 }, { s: start + 450, l: 0 }, { s: start + 460, l: 6 }, { s: start + 560, l: 2 }, { s: start + 565, l: 5 }],
        ramps: [{ s: start + 160, l0: 2, l1: 5 }, { s: start + 300, l0: 0, l1: 3 }, { s: start + 300, l0: 5, l1: 7 }, { s: start + 490, l0: 3, l1: 6 }],
        boost: [{ s: start + 60, l: [3, 4] }, { s: start + 270, l: [2, 6] }, { s: start + 540, l: [0, 7] }],
        items: [start + 40, start + 200, start + 350, start + 470],
        stars: rows(start + 20, start + dist - 20, 24),
        hurdles: [],
      };
    }
  },
  {
    id: 'night', name: 'NIGHT CHAMPIONSHIP GP', short: 'Night Championship', laps: 3, theme: 'night',
    blurb: '3 laps under the floodlights on a banked oval. Pace your stamina, steal the inside line, full power-up chaos.',
    tag: '3 LAPS · BANKED · CHAOS', icon: '🌙',
    make() {
      const path = new Path(oval(95, 24, 9), true);
      const start = 75, dist = path.len * 3;
      const L = path.len;
      const items = [], boost = [], stars = [];
      for (let lap = 0; lap < 3; lap++) {
        const b = start + lap * L;
        items.push(b + 30, b + 120, b + 215, b + 300);
        boost.push({ s: b + 100, l: [0, 4, 7] }, { s: b + 210, l: [2, 5] });
        for (let s = 15; s < L - 10; s += 30) stars.push(b + s);
      }
      return { path, start, dist, items: items.filter(s => s < start + dist - 20), boost, stars: stars.filter(s => s < start + dist - 15), hurdles: [], puddles: [], ramps: [], gusts: [] };
    }
  },
];
export const trackById = id => TRACKS.find(t => t.id === id) || TRACKS[0];
