/* APEX GRAND PRIX — sim.js
   Circuits, car physics and race rules at a fixed 60 Hz tick. Pure logic, no drawing.
   Units: metres, seconds, m/s. A car lives in track coordinates: dist (metres travelled
   along the centre line since the start line, may be negative on the grid) and d (lateral
   offset, + = right of the centre line). Positive curvature = right-hand bend. */
const Sim = (() => {
  'use strict';
  const DT = 1 / 60, DS = 2;
  const HALF = 7.5, RUMBLE = 1.6, EDGE = HALF + RUMBLE;   // road half-width (3 x 5 m lanes) + kerb
  const SIGN_D = EDGE + 6.2, WALL = EDGE + 24;              // billboard offset, outer tyre wall
  const GRIP = 24;                                          // lateral grip at full lock (m/s^2)
  const TOP = [55, 84];                                     // LOW / HIGH gear top speed: 198 / 302 km/h
  const KMH = 3.6, LANES = [-5, 0, 5];
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function mkRng(seed) { let s = (seed >>> 0) || 0x9e3779b9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /* ---------------- circuits ----------------
     straights {L, e}; bends {a: degrees (+ right), r: radius, e: climb}. Angles sum to 360 (clockwise).
     Two straights are stretched automatically so the loop closes exactly. */
  const CIRCUITS = [
    { id: 'fuji', name: 'FUJI SPEEDWAY', sub: 'THE CLASSIC - 1.5 KM STRAIGHT, MT. FUJI AHEAD', theme: 'fuji', segs: [
      { L: 1250, e: -8 }, { a: 150, r: 30, e: -2 }, { L: 110, e: -2 }, { a: -60, r: 80, e: -2 }, { a: 70, r: 110, e: -4 },
      { L: 300, e: -5 }, { a: -150, r: 26 }, { L: 160, e: 2 }, { a: 170, r: 170, e: -10 }, { L: 640, e: -4 },
      { a: -60, r: 40 }, { a: 60, r: 40 }, { L: 160, e: 8 }, { a: 90, r: 50, e: 6 }, { L: 160, e: 8 }, { a: -45, r: 60, e: 3 },
      { a: 45, r: 60, e: 3 }, { L: 90, e: 2 }, { a: 90, r: 42, e: 4 }, { L: 330, e: 3 }] },
    { id: 'seaside', name: 'SEASIDE CIRCUIT', sub: 'FAST SWEEPERS AT SUNSET BY THE OCEAN', theme: 'seaside', segs: [
      { L: 800, e: 2 }, { a: 110, r: 120, e: 3 }, { L: 300, e: 4 }, { a: -40, r: 200 }, { L: 250, e: -3 }, { a: 120, r: 70, e: -2 },
      { L: 600, e: -6 }, { a: -60, r: 90 }, { a: 60, r: 90 }, { L: 260, e: 4 }, { a: 170, r: 85, e: 2 }, { L: 300, e: -4 }] },
    { id: 'alpine', name: 'ALPINE RING', sub: 'TIGHT AND TWISTY UNDER THE PEAKS', theme: 'alpine', segs: [
      { L: 520, e: 6 }, { a: 90, r: 50, e: 4 }, { L: 150, e: 8 }, { a: -90, r: 40, e: 2 }, { L: 140 }, { a: 150, r: 35, e: -4 },
      { L: 250, e: -10 }, { a: -60, r: 70, e: -3 }, { L: 200, e: -6 }, { a: 110, r: 45 }, { L: 180, e: 5 }, { a: -50, r: 60 },
      { a: 120, r: 40, e: 2 }, { L: 160 }, { a: 90, r: 50, e: -2 }, { L: 300, e: -2 }] },
  ];

  function integrate(segs) { // -> samples of curvature / climb per DS, plus straight headings
    const k = [], e = [], stInfo = [];
    let th = 0;
    for (let si = 0; si < segs.length; si++) {
      const g = segs[si];
      if (g.a == null) {
        const n = Math.max(1, Math.round(g.L / DS)); stInfo.push({ si, th });
        for (let i = 0; i < n; i++) { k.push(0); e.push((g.e || 0) / n); }
      } else {
        const ang = g.a * Math.PI / 180, arc = Math.abs(ang) * g.r, n = Math.max(4, Math.round(arc / DS)), q = 0.22, peak = ang / arc / (1 - q);
        for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, w = u < q ? u / q : u > 1 - q ? (1 - u) / q : 1; k.push(peak * w); e.push((g.e || 0) / n); }
        // exact heading total
        let sum = 0; for (let i = k.length - n; i < k.length; i++) sum += k[i] * DS; const f = ang / sum; for (let i = k.length - n; i < k.length; i++) k[i] *= f;
        th += ang;
      }
    }
    return { k, e, stInfo };
  }
  function trace(k) { let x = 0, z = 0, th = 0; for (let i = 0; i < k.length; i++) { const tm = th + k[i] * DS / 2; x += Math.cos(tm) * DS; z += Math.sin(tm) * DS; th += k[i] * DS; } return { x, z }; }
  const cache = {};
  function build(id) {
    if (cache[id]) return cache[id];
    const C = CIRCUITS.find(c => c.id === id) || CIRCUITS[0];
    const segs = C.segs.map(s => ({ ...s }));
    // close the loop: stretch the pair of straights that needs the least change
    let r = integrate(segs), best = null;
    for (let it = 0; it < 4; it++) {
      const E = trace(r.k), sts = r.stInfo; if (Math.hypot(E.x, E.z) < 0.05) break; best = null;
      for (let i = 0; i < sts.length; i++) for (let j = i + 1; j < sts.length; j++) {
        const a1 = sts[i].th, a2 = sts[j].th, ux = Math.cos(a1), uz = Math.sin(a1), vx = Math.cos(a2), vz = Math.sin(a2), det = ux * vz - uz * vx;
        if (Math.abs(det) < 0.2) continue;
        const A = (-E.x * vz + E.z * vx) / det, B = (-ux * E.z + uz * E.x) / det;
        const L1 = segs[sts[i].si].L + A, L2 = segs[sts[j].si].L + B; if (L1 < 50 || L2 < 50) continue;
        const cost = Math.abs(A) + Math.abs(B); if (!best || cost < best.cost) best = { cost, i: sts[i].si, j: sts[j].si, L1, L2, A, B };
      }
      if (!best) break; segs[best.i].L = best.L1; segs[best.j].L = best.L2; r = integrate(segs);
    }
    const Ef = trace(r.k);
    const n = r.k.length, T = { id: C.id, name: C.name, sub: C.sub, theme: C.theme, n, L: n * DS, k: Float32Array.from(r.k), x: new Float32Array(n + 1), z: new Float32Array(n + 1), y: new Float32Array(n + 1), th: new Float32Array(n + 1), gravel: new Int8Array(n), signs: [], close: best && { i: best.i, j: best.j, A: best.A | 0, B: best.B | 0 } };
    let x = 0, z = 0, th = 0, y = 0, climb = 0; for (let i = 0; i < n; i++) climb += r.e[i];
    for (let i = 0; i <= n; i++) {
      T.x[i] = x - Ef.x * i / n; T.z[i] = z - Ef.z * i / n; T.th[i] = th; T.y[i] = y;
      if (i === n) break;
      const tm = th + r.k[i] * DS / 2; x += Math.cos(tm) * DS; z += Math.sin(tm) * DS; th += r.k[i] * DS; y += r.e[i] - climb / n;
    }
    // gravel traps on the outside of every real bend (and a run-off after it)
    for (let i = 0; i < n; i++) if (Math.abs(T.k[i]) > 1 / 220) { const side = T.k[i] > 0 ? -1 : 1; for (let j = i; j < i + 25; j++) T.gravel[j % n] = side; }
    // billboards: lining the outside of the bends, plus both sides of the main straight
    const byS = new Set();
    const put = (s, side, kind) => { const key = Math.round(s / 12) + ':' + side; if (byS.has(key)) return; byS.add(key); T.signs.push({ s: ((s % T.L) + T.L) % T.L, side, kind }); };
    let kind = 0;
    for (let i = 0; i < n; i++) if (Math.abs(T.k[i]) > 1 / 400 && (i % 6 === 0)) { const side = T.k[i] > 0 ? -1 : 1; put(i * DS, side, (kind++ >> 2) % 8); }
    for (let s = 40; s < 760; s += 36) { put(s, s % 72 < 36 ? 1 : -1, (kind++ >> 1) % 8); }
    T.signs.sort((a, b) => a.s - b.s);
    // ideal speed profile (also the CPU drivers' brain) and the par lap
    const vmax = new Float32Array(n), v = new Float32Array(n);
    for (let i = 0; i < n; i++) vmax[i] = Math.min(TOP[1] * 0.985, Math.sqrt(GRIP * 0.9 / Math.max(1e-6, Math.abs(T.k[i]))));
    for (let i = 0; i < n; i++) v[i] = vmax[i];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 2 * n - 1; i >= 0; i--) { const a = i % n, b = (i + 1) % n; v[a] = Math.min(v[a], Math.sqrt(v[b] * v[b] + 2 * 15 * DS)); }
      for (let i = 0; i < 2 * n; i++) { const a = i % n, b = (i + 1) % n, acc = Math.max(engineAcc(v[a], v[a] < 37 ? 0 : 1, 1) - drag(v[a]), 0.3); v[b] = Math.min(v[b], Math.sqrt(v[a] * v[a] + 2 * acc * DS)); }
    }
    T.vref = v; let par = 0; for (let i = 0; i < n; i++) par += DS / v[i]; T.par = par;
    // gentle banking-free minimap points
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9; for (let i = 0; i < n; i++) { mnx = Math.min(mnx, T.x[i]); mxx = Math.max(mxx, T.x[i]); mnz = Math.min(mnz, T.z[i]); mxz = Math.max(mxz, T.z[i]); }
    T.box = { mnx, mxx, mnz, mxz };
    cache[id] = T; return T;
  }
  const wrapS = (T, s) => ((s % T.L) + T.L) % T.L;
  function at(T, s) { // centre line point at s (interpolated)
    s = wrapS(T, s); const f = s / DS, i = Math.floor(f) % T.n, u = f - Math.floor(f), j = i + 1;
    return { x: T.x[i] + (T.x[j] - T.x[i]) * u, z: T.z[i] + (T.z[j] - T.z[i]) * u, y: T.y[i] + (T.y[j] - T.y[i]) * u, th: T.th[i] + (T.th[j] - T.th[i]) * u, k: T.k[i] };
  }
  function world(T, s, d) { const p = at(T, s), rx = -Math.sin(p.th), rz = Math.cos(p.th); return { x: p.x + rx * d, z: p.z + rz * d, y: p.y, th: p.th, k: p.k }; }
  const kAt = (T, s) => T.k[Math.floor(wrapS(T, s) / DS) % T.n];
  const vrefAt = (T, s) => T.vref[Math.floor(wrapS(T, s) / DS) % T.n];

  /* ---------------- car model ---------------- */
  function engineAcc(v, gear, gas) {
    const top = TOP[gear]; let a;
    if (gear === 0) a = 10.5 * (1 - (v / top) * (v / top));
    else a = 8.2 * clamp(0.18 + v / 45, 0, 1) * (1 - Math.pow(Math.min(v, top) / top, 1.6));
    if (v > top) return -(v - top) * 2;
    return a * gas;
  }
  const drag = v => 0.35 + 0.00011 * v * v;
  const rpmOf = (v, gear) => clamp(1500 + 10500 * v / TOP[gear], 1500, 12400);

  /* ---------------- race state ---------------- */
  let G = null, T = null, rnd = mkRng(1), ev = [];
  const emit = (t, o) => ev.push(Object.assign({ t }, o || {}));
  const DIFF = [{ id: 'beginner', name: 'BEGINNER', cpu: 0.8, ext: 1.32, qual: 1.4 }, { id: 'pro', name: 'PRO', cpu: 0.86, ext: 1.2, qual: 1.3 }, { id: 'expert', name: 'EXPERT', cpu: 0.915, ext: 1.12, qual: 1.22 }];
  const LIVERY = [['#e8202a', '#ffffff'], ['#1a4dff', '#ffd400'], ['#0aa84a', '#ffffff'], ['#ffb000', '#111111'], ['#ffffff', '#e8202a'], ['#7b2cff', '#00e0ff'], ['#111418', '#ff6a00'], ['#00b8d4', '#ffffff'], ['#ff4fa0', '#222222']];
  const PLAYER_LIVERY = ['#d8d8e0', '#e8202a'];
  function mkCar(dist, d, o) { return Object.assign({ dist, d, v: 0, ld: 0, gear: 0, rpm: 1500, steer: 0, gas: 0, brake: 0, skid: 0, off: 0, surf: 'road', crash: 0, ghost: 0, lap: 0, lapStart: 0, spin: 0, bob: 0 }, o || {}); }
  function newRace(o) {
    o = o || {}; rnd = mkRng(o.seed || ((Math.random() * 1e9) | 0)); ev = [];
    T = build(o.circuit || 'fuji');
    const diff = DIFF[clamp(o.diff == null ? 1 : o.diff, 0, 2)], mode = o.mode || 'race';
    G = { T, mode, diff, laps: o.laps || (mode === 'versus' ? 3 : 4), t: 0, rt: 0, phase: 'intro', phaseT: mode === 'qualify' ? 2.6 : 3.6, score: o.score || 0,
      timeLeft: 0, ext: T.par / 2 * diff.ext, grid: o.grid || 8, qualTime: 0, best: 0, lapTimes: [], cps: 0, passes: 0, pos: 0, finished: false, finishT: 0, bonus: 0, reason: '', cpu: [], remote: null, auto: !!o.auto, timed: mode !== 'versus' && mode !== 'demo' };
    if (mode === 'qualify') {
      G.car = mkCar(-14, 0, { livery: PLAYER_LIVERY }); G.timeLeft = Math.round(T.par * diff.qual);
      const n = 4; for (let i = 0; i < n; i++) G.cpu.push(mkCar(T.L * (0.18 + i * 0.21), LANES[i % 3], { skill: diff.cpu - 0.1 + rnd() * 0.04, lane: i % 3, laneT: 4 + rnd() * 6, livery: LIVERY[i], id: i }));
    } else {
      const slots = 8, mine = mode === 'versus' ? (o.slot || 0) : clamp(G.grid - 1, 0, 7);
      const slotPos = i => ({ dist: -10 - 9 * i, d: i % 2 ? 3.2 : -3.2 });
      const sp = slotPos(mine); G.car = mkCar(sp.dist, sp.d, { livery: PLAYER_LIVERY, slot: mine });
      let li = 0;
      for (let i = 0; i < slots; i++) {
        if (i === mine) continue;
        if (mode === 'versus' && i === (o.rivalSlot != null ? o.rivalSlot : 1 - mine)) continue;
        const p = slotPos(i); G.cpu.push(mkCar(p.dist, p.d, { skill: diff.cpu + (7 - i) * 0.008 + rnd() * 0.01, lane: p.d < 0 ? 0 : 2, laneT: 6 + rnd() * 8, livery: LIVERY[li % LIVERY.length], id: li, slot: i })); li++;
      }
      G.cpu.forEach(c => { c.lane = c.d < 0 ? 0 : 2; c.hold = 3 + rnd() * 2; });
      if (mode === 'versus') { const rs = o.rivalSlot != null ? o.rivalSlot : 1 - mine, p = slotPos(rs); G.remote = mkCar(p.dist, p.d, { livery: ['#ffd400', '#1a4dff'], remote: true }); }
      G.timeLeft = G.timed ? Math.round(G.ext + 6) : 0;
    }
    if (mode === 'demo') { G.phase = 'run'; G.auto = true; G.car.dist = 30; G.cpu.forEach((c, i) => { c.dist = 60 + i * 140; c.v = 40; }); }
    emit('intro', { mode });
    return G;
  }

  /* ---------------- autopilot (CPU brain, attract mode, tests) ---------------- */
  function autopilot(c, dTarget, skill) {
    const s = c.dist, look = s + Math.max(8, c.v * 0.9), vt = Math.min(vrefAt(T, look), vrefAt(T, s + c.v * 0.4)) * (skill || 0.97);
    const k = kAt(T, s + c.v * 0.12), sf = Math.min(1, c.v / 12) * GRIP;
    const ff = sf > 0 ? (c.v * c.v * k) / sf : 0;
    const steer = clamp(ff + ((dTarget || 0) - c.d) * 0.09 - c.ld * 0.25, -1, 1);
    return { steer, gas: c.v < vt ? 1 : 0, brake: c.v > vt + 2.5 ? clamp((c.v - vt) / 6, 0, 1) : 0, gear: c.v < 36 ? 0 : 1 };
  }

  /* ---------------- player car physics ---------------- */
  function drive(c, inp, live) {
    if (c.crash > 0) { c.crash -= DT; c.v = 0; c.rpm = 1500; if (c.crash <= 0) respawn(c); return; }
    if (c.ghost > 0) c.ghost -= DT;
    if (inp.shift && live) { c.gear ^= 1; emit('gear', { g: c.gear }); }
    if (inp.gear != null) { if (inp.gear !== c.gear) emit('gear', { g: inp.gear }); c.gear = inp.gear; }
    const gas = live ? clamp(inp.gas || 0, 0, 1) : 0, brake = live ? clamp(inp.brake || 0, 0, 1) : 1, steer = clamp(inp.steer || 0, -1, 1);
    c.gas = gas; c.brake = brake; c.steer += (steer - c.steer) * Math.min(1, DT * 14);
    const v0 = c.v, k = kAt(T, c.dist), ad = Math.abs(c.d);
    c.surf = ad <= HALF ? 'road' : ad <= EDGE ? 'kerb' : T.gravel[Math.floor(wrapS(T, c.dist) / DS) % T.n] === Math.sign(c.d) ? 'gravel' : 'grass';
    // longitudinal
    let a = engineAcc(c.v, c.gear, gas) - drag(c.v) - brake * 19;
    if (c.surf === 'grass') a -= c.v > 20 ? 7 + c.v * 0.12 : 1.5;
    if (c.surf === 'gravel') a -= c.v > 12 ? 12 + c.v * 0.2 : 4;
    // lateral: steering against the curve's centrifugal push; first-order response
    const grip = c.surf === 'road' || c.surf === 'kerb' ? 1 : 0.55, sf = Math.min(1, c.v / 12) * GRIP * grip;
    const want = c.steer * sf, cen = c.v * c.v * k, lat = want - cen;
    const usage = Math.abs(cen) / (GRIP * grip);
    const skid = (usage > 0.93 && Math.sign(c.steer) === Math.sign(k) && Math.abs(c.steer) > 0.6) || usage > 1.02 || (Math.abs(c.steer) > 0.8 && c.v > 60) || (brake > 0.7 && c.v > 45 && Math.abs(c.steer) > 0.4);
    c.ld += (lat * 0.42 - c.ld) * Math.min(1, DT * 6);
    if (skid) { a -= 4 + usage * 2; if (!c.skid) emit('skid', {}); c.skid = Math.min(1, c.skid + DT * 6); } else c.skid = Math.max(0, c.skid - DT * 4);
    c.v = Math.max(0, c.v + a * DT); if (brake > 0 && c.v < 0.2 && gas === 0) c.v = 0;
    c.d += c.ld * DT; c.dist += (c.v + v0) / 2 * DT;
    c.rpm = rpmOf(c.v, c.gear) * (gas > 0 && c.v < 3 ? 1.6 : 1); c.spin += c.v * DT / 0.33; c.bob = (c.surf === 'road' ? 0 : c.surf === 'kerb' ? 0.5 : 1);
    // walls and billboards
    if (Math.abs(c.d) > SIGN_D - 1.4 && c.ghost <= 0 && signNear(c.dist, Math.sign(c.d))) return crashCar(c, 'sign');
    if (Math.abs(c.d) > WALL) { if (c.v > 18 && c.ghost <= 0) return crashCar(c, 'wall'); c.d = Math.sign(c.d) * WALL; c.v *= 0.9; c.ld = 0; }
  }
  function signNear(dist, side) { const s = wrapS(T, dist), L = T.L; for (const g of T.signs) { if (g.side !== side) continue; let ds = Math.abs(g.s - s); if (ds > L / 2) ds = L - ds; if (ds < 5.2) return true; } return false; }
  function crashCar(c, why) {
    const p = world(T, c.dist, c.d);
    c.crash = 2.4; c.wreck = { why, v: c.v }; emit('crash', { x: p.x, y: p.y, z: p.z, v: c.v, why, me: c === G.car });
    c.v = 0; c.ld = 0; c.skid = 0;
  }
  function respawn(c) {
    c.crash = 0; c.v = 0; c.gear = 0; c.ld = 0; c.ghost = 1.6; c.steer = 0;
    // back on the road, in the clearest lane
    let bestD = 0, bestGap = -1; for (const d of LANES) { let gap = 1e9; for (const o of G.cpu) { if (Math.abs(o.d - d) < 2.5) { const g = o.dist - c.dist; if (g > -30 && g < 60) gap = Math.min(gap, Math.abs(g)); } } if (gap > bestGap) { bestGap = gap; bestD = d; } }
    c.d = bestD; emit('respawn', { me: c === G.car });
  }

  /* ---------------- CPU traffic ---------------- */
  function cpuTick(live) {
    for (const c of G.cpu) {
      if (c.slow > 0) c.slow -= DT;
      if (!live) { c.v = 0; continue; }
      if (c.hold > 0) { c.hold -= DT; } else { c.laneT -= DT; if (c.laneT <= 0) { c.laneT = 5 + rnd() * 9; c.lane = clamp(c.lane + (rnd() < 0.5 ? -1 : 1), 0, 2); } }
      const s = c.dist, k = kAt(T, s);
      let vt = Math.min(vrefAt(T, s + Math.max(10, c.v)), vrefAt(T, s + c.v * 0.4)) * c.skill; if (c.slow > 0) vt *= 0.55;
      // don't drive through the car ahead in the same lane: change lanes or follow
      for (const o of G.cpu) { if (o === c) continue; const gap = o.dist - c.dist; if (gap > 0 && gap < 28 && Math.abs(o.d - c.d) < 2.4 && o.v < c.v + 1) { if (c.laneT > 1.2) { c.lane = clamp(c.lane + (c.lane === 1 ? (rnd() < 0.5 ? -1 : 1) : (c.lane === 0 ? 1 : -1)), 0, 2); c.laneT = 1.2; } vt = Math.min(vt, o.v); } }
      const gear = c.v < 36 ? 0 : 1, acc = Math.max(0, engineAcc(c.v, gear, 1) - drag(c.v)) * 0.92;
      if (c.v < vt) c.v = Math.min(vt, c.v + acc * DT); else c.v = Math.max(vt, c.v - 15 * DT);
      const td = c.hold > 0 ? c.d : LANES[c.lane]; c.d += clamp(td - c.d, -2.4 * DT, 2.4 * DT);
      c.dist += c.v * DT; c.gear = gear; c.rpm = rpmOf(c.v, gear); c.spin += c.v * DT / 0.33; c.steer = clamp(c.v * c.v * k / GRIP * 0.8, -1, 1); c.brake = c.v > vt + 0.5 ? 1 : 0;
    }
  }
  function nearGap(a, b) { let g = b.dist - a.dist; const L = T.L; if (G.mode === 'qualify' || G.mode === 'demo') { g = ((g % L) + L) % L; if (g > L / 2) g -= L; } return g; }
  function collide(c, o, other) {
    if (c.crash > 0 || c.ghost > 0 || (o.crash || 0) > 0) return;
    const g = nearGap(c, o); if (Math.abs(g) > 4.4 || Math.abs(c.d - o.d) > 1.9) return;
    const rv = c.v - o.v;
    if ((g > 0 && rv > 7) || (g < 0 && rv < -7) || (Math.abs(g) < 2.5 && Math.abs(c.ld - (o.ld || 0)) > 5)) { crashCar(c, 'car'); if (!other) o.slow = 2; return; }
    // a nudge: trade a little speed and push apart sideways
    if (g > 0) c.v = Math.min(c.v, o.v - 1); else c.v = Math.max(c.v, o.v + 1);
    const push = c.d >= o.d ? 1 : -1; c.d += push * 0.25; c.ld = push * 2.5; emit('bump', {});
  }

  /* ---------------- the tick ---------------- */
  function tick(inp) {
    inp = inp || {}; const c = G.car; G.t += DT;
    if (G.phase === 'intro') { G.phaseT -= DT; if (G.phaseT <= 0) { G.phase = G.mode === 'qualify' ? 'run' : 'count'; G.phaseT = 3; if (G.mode !== 'qualify') emit('lights', { n: 3 }); else emit('go', {}); } }
    else if (G.phase === 'count') { const before = Math.ceil(G.phaseT); G.phaseT -= DT; const now = Math.ceil(G.phaseT); if (now !== before && now > 0) emit('lights', { n: now }); if (G.phaseT <= 0) { G.phase = 'run'; emit('go', {}); } }
    const live = G.phase === 'run' || G.phase === 'finish';
    if (G.auto || inp.auto) {
      let dT = c.apD != null ? c.apD : 0;
      for (const o of G.cpu) { const gap = nearGap(c, o); if (gap > 0 && gap < 40 && Math.abs(o.d - c.d) < 2.8 && o.v < c.v + 2) { dT = clamp(o.d > 0.5 ? o.d - 5 : o.d < -0.5 ? o.d + 5 : (c.d >= 0 ? 5 : -5), -5.5, 5.5); c.apT = 2; } }
      if (c.apT > 0) c.apT -= DT; else dT = dT * 0.995; c.apD = dT;
      const ap = autopilot(c, dT, inp.skill || 0.97); if (!inp.manual) inp = ap;
    }
    const d0 = c.dist;
    drive(c, inp, live && !(G.phase === 'finish' && G.mode !== 'versus'));
    cpuTick(live);
    if (G.phase === 'run') {
      G.rt += DT;
      for (const o of G.cpu) collide(c, o);
      if (G.remote) collide(c, G.remote, true);
      if (c.dist > d0) G.score += Math.floor(c.dist) - Math.floor(Math.max(d0, Math.floor(d0)));
      // timers
      if (G.timed) { G.timeLeft = Math.max(0, G.timeLeft - DT); }
      // checkpoints (race: every half lap) and lap lines
      if (G.mode !== 'qualify') {
        const half = T.L / 2, k0 = Math.floor(d0 / half), k1 = Math.floor(c.dist / half);
        if (k1 > k0 && k1 >= 1 && c.dist < G.laps * T.L) { G.cps++; if (G.timed) { G.timeLeft += G.ext; emit('extend', { add: G.ext, cp: G.cps }); } }
      }
      const l0 = Math.floor(d0 / T.L), l1 = Math.floor(c.dist / T.L);
      if (l1 > l0 && l1 >= 1) {
        const lt = G.rt - c.lapStart; c.lapStart = G.rt; c.lap = l1; G.lapTimes.push(lt); if (!G.best || lt < G.best) G.best = lt;
        emit('lap', { lap: l1, time: lt, best: G.best });
        if (G.mode === 'qualify') { G.qualTime = G.rt; G.grid = gridFor(G.rt); G.bonus = [4000, 2000, 1400, 1000, 800, 600, 400, 200][G.grid - 1]; G.score += G.bonus; G.phase = 'done'; G.phaseT = 4; emit('qualified', { time: G.rt, grid: G.grid, bonus: G.bonus }); }
        else if (l1 >= G.laps) { G.finished = true; G.finishT = G.rt; G.pos = position(); G.bonus = G.timed ? Math.ceil(G.timeLeft) * 200 : 0; G.score += G.bonus; G.phase = 'finish'; G.phaseT = 5; emit('finish', { time: G.rt, pos: G.pos, bonus: G.bonus }); }
      }
      // passing
      for (const o of G.cpu) { const was = o.ahead, now = o.dist > c.dist; if (was === true && !now && G.mode !== 'qualify') { G.passes++; G.score += 50; emit('pass', {}); } o.ahead = now; }
      G.pos = position();
      if (G.timed && G.timeLeft <= 0 && G.phase === 'run') { G.phase = 'over'; G.reason = G.mode === 'qualify' ? 'dnq' : 'time'; G.phaseT = 4; emit('timeup', { mode: G.mode }); }
    } else if (G.phase === 'done' || G.phase === 'finish' || G.phase === 'over') { G.phaseT -= DT; for (const o of G.cpu) o.ahead = o.dist > c.dist; if (G.phase === 'finish' && G.mode !== 'versus') { c.gas = 0; } }
  }
  function gridFor(t) { const pq = T.par + 3.5; return clamp(1 + Math.floor(Math.max(0, t / pq - 1) / 0.02), 1, 8); }
  function position() { let p = 1; const me = G.car.dist; for (const o of G.cpu) if (o.dist > me) p++; if (G.remote && G.remote.dist > me) p++; return p; }

  return { DT, DS, HALF, RUMBLE, EDGE, SIGN_D, WALL, GRIP, TOP, KMH, LANES, CIRCUITS, DIFF, LIVERY, PLAYER_LIVERY,
    build, at, world, kAt, vrefAt, wrapS: (s) => wrapS(T, s), newRace, tick, autopilot, engineAcc, drag, rpmOf, gridFor, position,
    get G() { return G; }, get T() { return T; }, drain() { const e = ev; ev = []; return e; },
    _: { crashCar, respawn, signNear, collide, mkCar, rng: () => rnd() } };
})();
if (typeof module !== 'undefined') module.exports = Sim;
