/* ==========================================================================
   STAR RAIDER — sim.js : the rules. No rendering, no DOM (runs in node tests).
   Two layers:
     STRATEGIC  a 16 x 8 galactic chart. Vrell fleets move sector to sector in
                real time toward your starbases, take siege positions on the four
                sides of a base and destroy it if left alone long enough. Hunter
                fleets chase you, heavy fleets call reinforcements.
     TACTICAL   every sector a player is in becomes a live 3D battle: darters
                (evasive dogfighters), lancers (flankers) and hives (shielded
                carriers) with dodgeable plasma. Photon torpedoes, lock-on,
                shields, energy, subsystem damage, docking, hyperwarp with drift.
   The host runs stepWorld for every player. Each pilot's own ship motion
   (steering, throttle, the hyperwarp marker) is stepPilot, which a guest also
   runs locally for its own ship (client-owned pose, host-owned everything else).
   ========================================================================== */
(function (root) {
  'use strict';
  const W = 16, H = 8;
  const SPEED = [0, 3, 6, 10, 16, 24, 34, 46, 60, 74];
  const DRAIN = [0, 0.6, 1.0, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 9.5];
  const DIFFS = ['NOVICE', 'PILOT', 'WARRIOR', 'COMMANDER'];
  const SYS = ['P', 'E', 'S', 'C', 'L', 'R'];
  const SYSNAME = { P: 'PHOTONS', E: 'ENGINES', S: 'SHIELDS', C: 'COMPUTER', L: 'LONG-RANGE SCAN', R: 'SUBSPACE RADIO' };
  const KIND = {
    darter: { name: 'DARTER', hp: 1, shield: 0, r: 3.6, speed: 50, turn: 2.3, pts: 10 },
    lancer: { name: 'LANCER', hp: 2, shield: 0, r: 5.5, speed: 33, turn: 1.15, pts: 25 },
    hive: { name: 'HIVE', hp: 3, shield: 4, r: 11, speed: 13, turn: 0.45, pts: 60 },
  };
  const BASE_POS = [0, -18, -260];
  const RANKS = ['GALACTIC FRY COOK', 'ASTEROID JANITOR', 'GARBAGE BARGE PILOT', 'SPACE CADET', 'COMET CHASER', 'ENSIGN', 'WINGMAN', 'LIEUTENANT', 'ACE', 'STARSHIP CAPTAIN', 'FLEET COMMANDER', 'STAR COMMANDER'];
  const RANK_CAP = [6, 8, 10, 11];
  // per difficulty
  const DCFG = [
    { fleets: [3, 3, 0], bases: 4, move: 1.6, need: 4, siege: 95, plasmaV: 70, aimErr: 0.16, fireMul: 1.6, home: 0, drift: 0, hitE: 90, bareE: 600, bareSys: 2, bareKill: 0, hunters: 0 },
    { fleets: [3, 4, 1], bases: 4, move: 1.25, need: 3, siege: 75, plasmaV: 82, aimErr: 0.1, fireMul: 1.25, home: 0.1, drift: 0.12, hitE: 120, bareE: 900, bareSys: 3, bareKill: 0.25, hunters: 1 },
    { fleets: [3, 4, 2], bases: 3, move: 1.0, need: 3, siege: 70, plasmaV: 95, aimErr: 0.06, fireMul: 1.0, home: 0.25, drift: 0.24, hitE: 150, bareE: 1200, bareSys: 3, bareKill: 0.6, hunters: 2 },
    { fleets: [3, 5, 3], bases: 3, move: 0.8, need: 2, siege: 58, plasmaV: 108, aimErr: 0.035, fireMul: 0.8, home: 0.45, drift: 0.38, hitE: 180, bareE: 0, bareSys: 0, bareKill: 1, hunters: 3 },
  ];
  const MISSIONS = {
    campaign: { name: 'CAMPAIGN', desc: 'Destroy every Vrell fleet before they take your starbases.' },
    laststand: { name: 'LAST STAND', desc: 'One starbase, waves of fleets. Hold out as long as you can.' },
    blitz: { name: 'BLITZ', desc: 'Small, fast galaxy. Twice the fleet speed, half the energy.' },
  };

  /* ---------- tiny math ---------- */
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    len: a => Math.hypot(a[0], a[1], a[2]), dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    madd: (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s],
  };
  const Q = {
    mul: (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]],
    axis: (ax, ang) => { const s = Math.sin(ang / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)]; },
    rot: (q, v) => { const [x, y, z, w] = q; const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
      return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; },
    norm: q => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; },
  };
  const fwdOf = q => Q.rot(q, [0, 0, -1]), upOf = q => Q.rot(q, [0, 1, 0]), rightOf = q => Q.rot(q, [1, 0, 0]);
  /** rotate unit vector a toward unit vector b by at most ang radians */
  function turnToward(a, b, ang) {
    const d = Math.max(-1, Math.min(1, V.dot(a, b))), th = Math.acos(d);
    if (th <= ang || th < 1e-5) return b.slice();
    let ax = V.cross(a, b); if (V.len(ax) < 1e-6) ax = Math.abs(a[1]) < 0.9 ? V.cross(a, [0, 1, 0]) : V.cross(a, [1, 0, 0]);
    return V.norm(Q.rot(Q.axis(V.norm(ax), ang), a));
  }
  function rng(seed) { let s = seed >>> 0 || 1; const f = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.r = (a, b) => a + f() * (b - a); f.i = n => Math.floor(f() * n); return f; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const key = (x, y) => y * W + x;
  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  const man = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

  /* ---------- new game ---------- */
  function newGame(o = {}) {
    const diff = clamp(o.diff | 0, 0, 3), seed = (o.seed >>> 0) || 1, R = rng(seed), mission = MISSIONS[o.mission] ? o.mission : 'campaign';
    const C = Object.assign({}, DCFG[diff]);
    const G = { diff, seed, mission, C, R, t: 0, W, H, nextId: 1, bases: [], fleets: [], players: [], ships: [], shots: [], ev: [], msgs: [], over: null,
      wave: 0, waveT: 0, stats: { killPts: 0, kills: { darter: 0, lancer: 0, hive: 0 }, basesLost: 0, energyUsed: 0, deaths: 0, warps: 0, docks: 0 }, galSeq: 0 };
    if (mission === 'blitz') { C.move *= 0.7; C.siege *= 0.85; }
    // starbases, spread out
    const nb = mission === 'laststand' ? 1 : C.bases;
    let guard = 0;
    while (G.bases.length < nb && guard++ < 5000) {
      const x = mission === 'laststand' ? 7 : 1 + R.i(W - 2), y = mission === 'laststand' ? 4 : 1 + R.i(H - 2);
      if (G.bases.some(b => cheb(b.x, b.y, x, y) < 4)) continue;
      G.bases.push({ id: G.nextId++, x, y, alive: true, siege: 0, alert: 0, hp: 1 });
    }
    // fleets
    if (mission === 'laststand') { spawnWave(G); }
    else {
      const comp = [['patrol', C.fleets[0]], ['strike', C.fleets[1]], ['heavy', C.fleets[2]]];
      let hunters = C.hunters;
      for (const [type, n] of comp) for (let i = 0; i < n; i++) {
        let x, y, g2 = 0;
        do { x = R.i(W); y = R.i(H); g2++; } while (g2 < 3000 && (G.bases.some(b => cheb(b.x, b.y, x, y) < 3) || G.fleets.some(f => f.x === x && f.y === y) || cheb(x, y, G.bases[0].x, G.bases[0].y) < 4 || G.bases.some(b => cheb(b.x, b.y, x, y) < 4 - (mission === 'blitz' ? 1 : 0))));
        const f = makeFleet(G, type, x, y); if (type === 'patrol' && hunters > 0) { f.role = 'hunter'; hunters--; } G.fleets.push(f);
      }
    }
    if (mission === 'blitz') G.energyMax = 6000;
    return G;
  }
  function makeFleet(G, type, x, y) {
    const R = G.R;
    const f = { id: G.nextId++, type, x, y, px: x, py: y, mt: 0, d: 0, h: 0, l: 0, role: 'raider', goal: null, slotOf: 0, moveT: 0, engaged: false, call: null };
    if (type === 'patrol') f.d = 2 + R.i(2);
    else if (type === 'strike') { f.d = 2 + R.i(2); f.l = 1 + (R() < 0.3 ? 1 : 0); }
    else { f.h = 1; f.d = 2; f.l = 1; f.role = 'siege'; }
    f.moveT = interval(G, f) * (0.4 + R() * 0.8);
    return f;
  }
  function spawnWave(G) {
    G.wave++;
    const n = 2 + G.wave, R = G.R, b = G.bases[0];
    for (let i = 0; i < n; i++) {
      const edge = R.i(4); let x = edge === 0 ? 0 : edge === 1 ? W - 1 : R.i(W), y = edge === 2 ? 0 : edge === 3 ? H - 1 : R.i(H);
      if (G.fleets.some(f => f.x === x && f.y === y) || (b && cheb(b.x, b.y, x, y) < 3)) { x = R.i(2) ? 0 : W - 1; y = R.i(H); }
      const type = G.wave > 2 && i === 0 ? 'heavy' : i % 2 ? 'strike' : 'patrol';
      const f = makeFleet(G, type, x, y); if (G.wave > 1 && i === n - 1) f.role = 'hunter';
      if (G.wave > 3) f.d++;
      G.fleets.push(f);
    }
    G.waveT = 0; msg(G, 'WAVE ' + G.wave + ': ' + n + ' VRELL FLEETS INBOUND', 'alert');
  }
  const interval = (G, f) => (f.h ? 15 : f.l ? 10.5 : 7.5) * G.C.move;

  /* ---------- players ---------- */
  function addPlayer(G, idx, at) {
    const b = at || G.bases.find(b => b.alive) || { x: 7, y: 4 };
    const p = { idx, sx: b.x, sy: b.y, pos: [0, 0, 40], q: [0, 0, 0, 1], speed: 0, thr: 0, energy: G.energyMax || 9999, emax: G.energyMax || 9999,
      shields: false, comp: true, dmg: { P: 0, E: 0, S: 0, C: 0, L: 0, R: 0 }, alive: true, kills: 0, cool: 0, side: 0, targetId: 0, lock: false, lockT: 0,
      warp: null, dock: null, respawn: 0, hitT: 0, shieldT: 0, view: 'fore', inTransit: false, track: false, steer: [0, 0], used: 0, redAlert: 0 };
    G.players[idx] = p; return p;
  }
  function msg(G, text, kind = 'info', who = -1) { G.msgs.push({ id: G.nextId++, t: G.t, text, kind, who }); if (G.msgs.length > 40) G.msgs.shift(); }
  function ev(G, o) { o.id = G.nextId++; G.ev.push(o); }
  const sectorKey = p => p.inTransit || !p.alive ? -1 : key(p.sx, p.sy);
  const fleetAt = (G, x, y) => G.fleets.find(f => f.x === x && f.y === y);
  const baseAt = (G, x, y) => G.bases.find(b => b.alive && b.x === x && b.y === y);
  const thrCap = p => p.dmg.E >= 2 ? 2 : p.dmg.E >= 1 ? 5 : 9;

  /** hyperwarp cost and duration between sectors */
  function warpCost(G, p, tx, ty) { const d = Math.hypot(tx - p.sx, ty - p.sy); return { d, e: Math.round(d < 0.5 ? 0 : 160 + 110 * d), dur: 2.6 + d * 0.32 }; }

  /* ---------- the pilot's own ship: steering, throttle, hyperwarp (deterministic given input) ---------- */
  // inp: { yaw, pitch (-1..1), roll? , thr (0-9 or null) }
  function stepPilot(G, p, inp, dt) {
    if (!p.alive) return;
    if (inp.thr != null) p.thr = clamp(inp.thr | 0, 0, 9);
    const cap = thrCap(p), thr = Math.min(p.thr, cap);
    if (p.warp) { stepWarp(G, p, inp, dt); return; }
    if (p.dock && p.dock.phase !== 'done') { p.speed = Math.max(0, p.speed - 30 * dt); p.pos = V.madd(p.pos, fwdOf(p.q), p.speed * dt); return; }
    const target = SPEED[thr];
    p.speed += clamp(target - p.speed, -40 * dt, 22 * dt);
    const tr = (p.dmg.E >= 1 ? 1.15 : 1.6) * (p.view === 'aft' ? -1 : 1);
    const yaw = clamp(inp.yaw || 0, -1, 1), pitch = clamp(inp.pitch || 0, -1, 1);
    p.steer = [yaw, pitch];
    if (yaw || pitch || inp.roll) {
      // in aft view the stick is mirrored, as in the original: push right, the aft view swings right
      let q = p.q;
      q = Q.mul(q, Q.axis([0, 1, 0], -yaw * tr * dt));
      q = Q.mul(q, Q.axis([1, 0, 0], pitch * tr * dt));
      if (inp.roll) q = Q.mul(q, Q.axis([0, 0, 1], -inp.roll * 1.4 * dt));
      p.q = Q.norm(q);
    }
    p.pos = V.madd(p.pos, fwdOf(p.q), p.speed * dt);
  }
  function startWarp(G, p, tx, ty) {
    if (!p.alive || p.warp) return 'busy';
    if (p.dmg.E >= 2) return 'engines';
    if (tx === p.sx && ty === p.sy) return 'here';
    const c = warpCost(G, p, tx, ty); if (p.energy < c.e + 50) return 'energy';
    p.warp = { tx, ty, t: 0, spool: 1.6, dur: c.dur, exit: 0.9, phase: 'spool', m: [0, 0], dv: [0, 0], cost: c.e, d: c.d, land: null, sd: (G.R() * 1e6) | 0 };
    p.dock = null; return 'ok';
  }
  function stepWarp(G, p, inp, dt) {
    const w = p.warp; w.t += dt;
    if (w.phase === 'spool') { p.speed += (SPEED[9] * 1.4 - p.speed) * Math.min(1, dt * 2); if (w.t >= w.spool) { w.phase = 'tunnel'; w.t = 0; } return; }
    if (w.phase === 'tunnel') {
      // the hyperwarp target marker drifts; the pilot steers to keep it centered
      const dr = G.C.drift * (0.6 + w.d / 9);
      if (dr > 0) {
        const s = w.sd, tt = G.t * 0.9 + w.t;
        const nx = Math.sin(tt * 1.3 + s) + Math.sin(tt * 2.9 + s * 1.7) * 0.6, ny = Math.cos(tt * 1.1 + s * 0.3) + Math.sin(tt * 2.3 + s * 2.1) * 0.6;
        w.dv[0] += (nx * dr * 1.4 - w.dv[0]) * Math.min(1, dt * 1.5); w.dv[1] += (ny * dr * 1.4 - w.dv[1]) * Math.min(1, dt * 1.5);
        w.m[0] += w.dv[0] * dt; w.m[1] += w.dv[1] * dt;
      }
      w.m[0] -= clamp(inp.yaw || 0, -1, 1) * 0.75 * dt; w.m[1] -= clamp(inp.pitch || 0, -1, 1) * 0.75 * dt;
      w.m[0] = clamp(w.m[0], -1.2, 1.2); w.m[1] = clamp(w.m[1], -1.2, 1.2);
      if (w.t >= w.dur) {
        const e = Math.hypot(w.m[0], w.m[1]); let lx = w.tx, ly = w.ty;
        if (e > 0.22) { const k = Math.min(3, Math.ceil((e - 0.22) / 0.3)); lx = clamp(Math.round(w.tx + Math.sign(w.m[0]) * Math.min(k, Math.round(Math.abs(w.m[0]) / e * k + 0.3))), 0, W - 1); ly = clamp(Math.round(w.ty - Math.sign(w.m[1]) * Math.min(k, Math.round(Math.abs(w.m[1]) / e * k + 0.3))), 0, H - 1); }
        w.land = [lx, ly]; w.err = e; w.phase = 'exit'; w.t = 0;
        p.sx = lx; p.sy = ly; p.pos = [(G.R() - 0.5) * 20, (G.R() - 0.5) * 10, 40]; p.q = [0, 0, 0, 1];
        p.arrived = (p.arrived || 0) + 1;
      }
      return;
    }
    if (w.phase === 'exit') { p.speed += (SPEED[Math.min(p.thr, thrCap(p))] - p.speed) * Math.min(1, dt * 3); p.pos = V.madd(p.pos, fwdOf(p.q), p.speed * dt); if (w.t >= w.exit) p.warp = null; }
  }

  /* ---------- the host's world step ---------- */
  // inputs[idx]: { yaw, pitch, thr, fire (count), shields (bool), comp (bool), view, warpTo:[x,y], dock (bool), target: 'next'|'near', track }
  function stepWorld(G, inputs, dt, opts = {}) {
    if (G.over) return;
    G.t += dt; G.ev.length = 0;
    const R = G.R, C = G.C;
    for (const p of G.players) if (p) stepPlayerSystems(G, p, inputs[p.idx] || {}, dt, opts.remote && opts.remote[p.idx]);
    stepGalaxy(G, dt);
    stepShips(G, dt);
    stepShots(G, dt);
    // game end
    if (!G.over) {
      const alivePl = G.players.filter(p => p && (p.alive || p.respawn > 0));
      if (G.mission !== 'laststand' && G.fleets.length === 0 && G.ships.length === 0) end(G, true, 'ALL VRELL FLEETS DESTROYED');
      else if (!G.bases.some(b => b.alive)) end(G, false, 'ALL STARBASES DESTROYED');
      else if (alivePl.length === 0) end(G, false, G.lastDeath || 'SHIP DESTROYED');
    }
  }
  function stepPlayerSystems(G, p, inp, dt, remote) {
    if (!p.alive) {
      if (p.respawn > 0) { p.respawn -= dt; if (p.respawn <= 0) respawn(G, p); }
      return;
    }
    if (!remote) stepPilot(G, p, inp, dt);
    else if (inp.pose) { // guest-owned ship pose
      const o = inp.pose; p.pos = o.pos; p.q = o.q; p.speed = o.speed; p.view = o.view || p.view; if (o.thr != null) p.thr = o.thr;
      if (o.warp && !p.inTransit) { p.inTransit = true; p.warpRemote = o.warp; }
    }
    p.hitT = Math.max(0, p.hitT - dt); p.shieldT = Math.max(0, p.shieldT - dt); p.cool = Math.max(0, p.cool - dt);
    if (inp.view) p.view = inp.view;
    if (inp.shields != null) p.shields = !!inp.shields;
    if (inp.comp != null) p.comp = !!inp.comp;
    if (inp.track != null) p.track = !!inp.track;
    // warp request
    if (inp.warpTo && !remote) { const r = startWarp(G, p, inp.warpTo[0], inp.warpTo[1]); p.lastWarp = r; if (r === 'ok') { use(G, p, p.warp.cost); G.stats.warps++; ev(G, { e: 'warp', p: p.idx }); } }
    if (remote && inp.warpStart) { const c = warpCost(G, p, inp.warpStart[0], inp.warpStart[1]); use(G, p, c.e); G.stats.warps++; p.inTransit = true; p.dock = null; }
    if (remote && inp.arrive) { p.inTransit = false; p.sx = inp.arrive[0]; p.sy = inp.arrive[1]; arriveSector(G, p); }
    if (!remote && p.warp) p.inTransit = p.warp.phase !== 'exit';
    if (!remote && p.arrived !== p._arrSeen) { p._arrSeen = p.arrived; if (p.arrived) arriveSector(G, p); }
    // energy
    const thr = Math.min(p.thr, thrCap(p));
    let drain = 0.8 + DRAIN[p.inTransit ? 0 : thr] + (p.shields && p.dmg.S < 2 ? 2.5 : 0) + (p.comp && p.dmg.C < 2 ? 0.6 : 0);
    use(G, p, drain * dt);
    if (p.energy <= 0) { p.energy = 0; kill(G, p, 'ENERGY EXHAUSTED'); return; }
    if (p.inTransit) { p.lock = false; return; }
    // targeting: the nearest ship near the crosshair, else the nearest in the view hemisphere
    const sk = sectorKey(p), dir = viewDir(p);
    let best = null, bs = 1e9, cur = null;
    for (const s of G.ships) {
      if (s.sk !== sk) continue;
      const rel = V.sub(s.pos, p.pos), d = V.len(rel), c = V.dot(rel, dir) / (d || 1);
      if (s.id === p.targetId) cur = { s, d, c };
      if (c < 0.05) continue;
      const score = d * (1.6 - c) * (c > 0.995 ? 0.3 : 1);
      if (score < bs) { bs = score; best = s; }
    }
    if (inp.target === 'next') { const list = G.ships.filter(s => s.sk === sk).sort((a, b) => V.dist(a.pos, p.pos) - V.dist(b.pos, p.pos)); if (list.length) { const i = list.findIndex(s => s.id === p.targetId); p.targetId = list[(i + 1) % list.length].id; p.manualT = 4; } }
    p.manualT = Math.max(0, (p.manualT || 0) - dt);
    if (!(p.manualT > 0 && cur) && !(p.track && cur)) p.targetId = best ? best.id : 0;
    const tg = G.ships.find(s => s.id === p.targetId);
    const wasLock = p.lock;
    p.lock = false;
    if (tg && p.comp && p.dmg.C < 1) { const rel = V.sub(tg.pos, p.pos), d = V.len(rel); if (d < 240 && V.dot(rel, dir) / d > Math.cos(0.075)) p.lock = true; }
    if (p.lock && !wasLock) ev(G, { e: 'lock', p: p.idx });
    // tracking computer: keep the target in view by switching fore / aft automatically
    if (p.track && tg && !remote) { const rel = V.sub(tg.pos, p.pos), f = fwdOf(p.q); const want = V.dot(rel, f) < -0.2 * V.len(rel) ? 'aft' : 'fore'; if (p.view !== want && (p.view === 'fore' || p.view === 'aft')) { p.view = want; ev(G, { e: 'trackflip', p: p.idx }); } }
    // fire torpedoes
    let n = inp.fire | 0;
    while (n-- > 0) fire(G, p, inp.fireAt);
    // red alert when enemies are in the sector
    const hostile = G.ships.some(s => s.sk === sk);
    if (hostile && !p.redAlert) { p.redAlert = 1; ev(G, { e: 'redalert', p: p.idx }); }
    if (!hostile) p.redAlert = 0;
    // docking
    const base = baseAt(G, p.sx, p.sy);
    if (base && !p.dock) {
      const rel = V.sub(BASE_POS, p.pos), d = V.len(rel), f = fwdOf(p.q);
      p.canDock = d < 70 && V.dot(rel, f) / d > 0.9;
      if (p.canDock && (p.speed < 0.8 || inp.dock)) { p.dock = { t: 0, phase: 'orbit' }; p.thr = 0; ev(G, { e: 'orbit', p: p.idx }); msg(G, 'ORBIT ESTABLISHED', 'good', p.idx); }
    } else if (!base) p.canDock = false;
    if (p.dock) {
      const D = p.dock; D.t += dt;
      if (D.phase === 'orbit' && D.t > 1.2) { D.phase = 'drone'; D.t = 0; ev(G, { e: 'drone', p: p.idx }); }
      else if (D.phase === 'drone' && D.t > 5.5) {
        D.phase = 'done'; D.t = 0; p.energy = p.emax; for (const k of SYS) p.dmg[k] = 0; G.stats.docks++;
        ev(G, { e: 'docked', p: p.idx }); msg(G, 'TRANSFER COMPLETE · ENERGY FULL · ALL SYSTEMS REPAIRED', 'good', p.idx);
      } else if (D.phase === 'done' && (p.thr > 0 || D.t > 3)) p.dock = null;
      if (D.phase !== 'done' && (p.thr > 0 || !base)) { if (D.phase === 'drone') msg(G, 'DOCKING ABORTED', 'warn', p.idx); p.dock = null; }
    }
  }
  const viewDir = p => { const f = fwdOf(p.q); return p.view === 'aft' ? V.mul(f, -1) : f; };
  function use(G, p, e) { p.energy -= e; p.used += e; G.stats.energyUsed += e; }
  function fire(G, p, at) {
    if (p.dmg.P >= 2) { ev(G, { e: 'dry', p: p.idx }); return; }
    if (p.cool > 0) return;
    const mine = G.shots.filter(s => s.own === p.idx).length; if (mine >= (p.dmg.P ? 2 : 4)) return;
    if (p.energy < 20) return;
    const pose = at || p, q = pose.q, f = fwdOf(q), aft = (at ? at.view : p.view) === 'aft', dir = aft ? V.mul(f, -1) : f;
    p.side = p.dmg.P ? 0 : 1 - p.side;
    const r = rightOf(q), u = upOf(q), sx = (p.side ? 1 : -1) * 1.8 * (aft ? -1 : 1);
    const pos = V.add(V.add(pose.pos, V.mul(r, sx)), V.add(V.mul(u, -0.9), V.mul(dir, 2)));
    const sp = 190 + (aft ? -1 : 1) * V.dot(dir, f) * (pose.speed || 0);
    const s = { id: G.nextId++, own: p.idx, sk: key(p.sx, p.sy), pos, vel: V.mul(dir, Math.max(120, sp)), life: 1.5, tgt: p.lock ? p.targetId : 0, kind: 'torp', side: p.side };
    G.shots.push(s); p.cool = p.dmg.P ? 0.6 : 0.26; use(G, p, 8);
    ev(G, { e: 'torp', p: p.idx, side: p.side, aft });
  }
  function kill(G, p, why) {
    if (!p.alive) return;
    p.alive = false; p.warp = null; p.dock = null; p.lock = false; p.inTransit = false; G.stats.deaths++;
    ev(G, { e: 'pdead', p: p.idx, pos: p.pos, sk: key(p.sx, p.sy), why }); G.lastDeath = why;
    const coop = G.players.filter(Boolean).length > 1;
    if (coop && G.bases.some(b => b.alive)) { p.respawn = 9; msg(G, 'PILOT ' + (p.idx + 1) + ' LOST · NEW SHIP IN 9 SECONDS', 'alert'); }
  }
  function respawn(G, p) {
    const b = G.bases.filter(b => b.alive)[G.R.i(Math.max(1, G.bases.filter(b => b.alive).length))]; if (!b) return;
    Object.assign(p, { alive: true, sx: b.x, sy: b.y, pos: [0, 0, 40], q: [0, 0, 0, 1], speed: 0, thr: 0, energy: p.emax, shields: false, dmg: { P: 0, E: 0, S: 0, C: 0, L: 0, R: 0 }, warp: null, dock: null, inTransit: false, respawned: (p.respawned || 0) + 1 });
    ev(G, { e: 'respawn', p: p.idx }); arriveSector(G, p);
  }
  function arriveSector(G, p) {
    const f = fleetAt(G, p.sx, p.sy);
    if (f) materialize(G, f, p);
    p.redAlert = 0;
    const b = baseAt(G, p.sx, p.sy);
    ev(G, { e: 'arrive', p: p.idx, base: !!b, fleet: !!f });
  }
  /** a fleet becomes live 3D ships around player p */
  function materialize(G, f, p, fromEdge) {
    const R = G.R, sk = key(f.x, f.y);
    const have = { darter: 0, lancer: 0, hive: 0 };
    for (const s of G.ships) if (s.fleet === f.id) have[s.kind]++;
    const want = { darter: f.d, lancer: f.l, hive: f.h };
    const fw = fwdOf(p.q);
    let k = 0;
    for (const kind of ['hive', 'lancer', 'darter']) for (let i = have[kind]; i < want[kind]; i++) {
      const ang = R.r(-1.1, 1.1) + (k % 2 ? 0.4 : -0.4), el = R.r(-0.35, 0.35), dist = (fromEdge ? 420 : 300) + R.r(0, 160) + (kind === 'hive' ? 120 : 0);
      const base = Math.atan2(fw[0], -fw[2]);
      const dir = [Math.sin(base + ang) * Math.cos(el), Math.sin(el), -Math.cos(base + ang) * Math.cos(el)];
      spawnShip(G, kind, f, sk, V.madd(p.pos, dir, dist), V.mul(dir, -1)); k++;
    }
    f.engaged = true;
  }
  function spawnShip(G, kind, f, sk, pos, fwd) {
    const K = KIND[kind], R = G.R;
    const s = { id: G.nextId++, kind, fleet: f.id, sk, pos, fwd: V.norm(fwd), speed: K.speed * 0.7, hp: K.hp, sh: K.shield, shT: 0, st: 'attack', stT: 0, fireT: R.r(1.5, 4) * G.C.fireMul, side: R() < 0.5 ? -1 : 1, jink: null, bank: 0, burst: 0, launchT: 18, hitT: 0, brk: null, tgt: -1 };
    G.ships.push(s); return s;
  }

  /* ---------- strategic layer ---------- */
  function siegeSlots(b) { return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [b.x + dx, b.y + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < W && y < H); }
  function siegeCount(G, b) { return siegeSlots(b).filter(([x, y]) => fleetAt(G, x, y)).length; }
  const needFor = (G, b) => Math.min(siegeSlots(b).length, G.C.need);
  function playersIn(G, x, y) { return G.players.filter(p => p && p.alive && !p.inTransit && p.sx === x && p.sy === y); }
  function stepGalaxy(G, dt) {
    const C = G.C, R = G.R;
    // which fleets are engaged (a player is in their sector)
    for (const f of G.fleets) {
      const here = playersIn(G, f.x, f.y).length > 0;
      if (here && !f.engaged) { const p = playersIn(G, f.x, f.y)[0]; materialize(G, f, p, true); msg(G, 'VRELL FLEET ENTERING SECTOR', 'alert'); ev(G, { e: 'fleetin', x: f.x, y: f.y }); }
      if (!here && f.engaged) { f.engaged = false; G.ships = G.ships.filter(s => s.fleet !== f.id); }
      if (here && f.h && !f.called && G.diff >= 1) { f.called = true; callHelp(G, f); }
    }
    // remove ships of fleets that no longer exist
    // move fleets
    for (const f of G.fleets.slice()) {
      f.mt = Math.min(1, f.mt + dt / 0.9); // animation 0..1 of the last move
      if (f.engaged) continue;
      f.moveT -= dt;
      if (f.moveT > 0) continue;
      f.moveT = interval(G, f) * (0.85 + R() * 0.3);
      const goal = chooseGoal(G, f); f.goal = goal;
      if (!goal || (goal[0] === f.x && goal[1] === f.y)) continue;
      const step = stepToward(G, f, goal);
      if (step) { f.px = f.x; f.py = f.y; f.x = step[0]; f.y = step[1]; f.mt = 0; G.galSeq++; }
    }
    // siege
    for (const b of G.bases) {
      if (!b.alive) continue;
      const n = siegeCount(G, b), need = needFor(G, b), guarded = playersIn(G, b.x, b.y).length > 0;
      if (n >= need && !guarded) {
        if (b.siege === 0 || !b.alerted) { b.alerted = true; msg(G, 'STARBASE SURROUNDED AT ' + b.x + ',' + b.y + ' · DEFEND IT!', 'alert', -2); ev(G, { e: 'siege', x: b.x, y: b.y }); }
        b.siege += dt;
        if (b.siege >= C.siege) destroyBase(G, b);
      } else if (n >= need && guarded) { /* held off while a player guards it */ }
      else { b.siege = Math.max(0, b.siege - dt * 2); if (b.siege === 0) b.alerted = false; }
    }
    // last stand waves
    if (G.mission === 'laststand') { G.waveT += dt; if (G.fleets.length === 0 && G.ships.length === 0 && G.waveT > 4) spawnWave(G); }
    // blitz/campaign: hives slowly breed a new patrol if the game drags on
    if (G.mission !== 'laststand') { G.breedT = (G.breedT || 0) + dt; if (G.breedT > 240 / (1 + G.diff * 0.35)) { G.breedT = 0; const h = G.fleets.find(f => f.h && !f.engaged); if (h) { const s = freeNeighbor(G, h.x, h.y); if (s) { const nf = makeFleet(G, 'patrol', s[0], s[1]); nf.role = G.diff >= 2 ? 'hunter' : 'raider'; G.fleets.push(nf); msg(G, 'HIVE AT ' + h.x + ',' + h.y + ' LAUNCHED A NEW PATROL', 'warn', -2); } } } }
  }
  function freeNeighbor(G, x, y) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !fleetAt(G, nx, ny) && !baseAt(G, nx, ny) && !playersIn(G, nx, ny).length) return [nx, ny]; } return null; }
  function callHelp(G, f) {
    let n = 0;
    for (const o of G.fleets) if (o !== f && !o.engaged && cheb(o.x, o.y, f.x, f.y) <= 3 && n < 2) { o.call = { x: f.x, y: f.y, t: G.t }; n++; }
    if (n) msg(G, 'HIVE DISTRESS CALL · ' + n + ' FLEET' + (n > 1 ? 'S' : '') + ' RESPONDING', 'warn', -2);
  }
  function destroyBase(G, b) {
    b.alive = false; b.siege = 0; G.stats.basesLost++;
    msg(G, 'STARBASE AT ' + b.x + ',' + b.y + ' DESTROYED', 'alert', -2); ev(G, { e: 'basedead', x: b.x, y: b.y });
    for (const p of G.players) if (p && p.dock && p.sx === b.x && p.sy === b.y) p.dock = null;
    if (!fleetAt(G, b.x, b.y)) { const f = makeFleet(G, 'patrol', b.x, b.y); f.role = 'raider'; G.fleets.push(f); }
  }
  const nearestPlayer = (G, x, y) => { let best = null, bd = 1e9; for (const p of G.players) if (p && p.alive && !p.inTransit) { const d = cheb(p.sx, p.sy, x, y); if (d < bd) { bd = d; best = p; } } return best ? { p: best, d: bd } : null; };
  function chooseGoal(G, f) {
    if (f.call && G.t - f.call.t < 60 && fleetAt(G, f.call.x, f.call.y)) return [f.call.x, f.call.y];
    f.call = null;
    const np = nearestPlayer(G, f.x, f.y);
    if (f.role === 'hunter' && np && np.d <= 4) return [np.p.sx, np.p.sy];
    // raiders / siege: pick a free siege slot, preferring bases already partly surrounded
    const bases = G.bases.filter(b => b.alive); if (!bases.length) return null;
    // already holding a slot? stay
    for (const b of bases) for (const [x, y] of siegeSlots(b)) if (x === f.x && y === f.y) return [x, y];
    let best = null, bc = 1e9;
    for (const b of bases) {
      const have = siegeCount(G, b), need = needFor(G, b);
      const claimed = G.fleets.filter(o => o !== f && o.goal && siegeSlots(b).some(([x, y]) => o.goal[0] === x && o.goal[1] === y)).length;
      for (const [x, y] of siegeSlots(b)) {
        if (fleetAt(G, x, y)) continue;
        if (G.fleets.some(o => o !== f && o.goal && o.goal[0] === x && o.goal[1] === y)) continue;
        let c = man(f.x, f.y, x, y) - 2.2 * Math.min(have + claimed, need);
        if (f.role !== 'hunter' && np) { const pd = cheb(np.p.sx, np.p.sy, x, y); if (pd <= 1) c += 3 - G.diff * 0.5; }
        if (claimed + have >= need + 1) c += 6; // already enough attackers there: spread out
        if (c < bc) { bc = c; best = [x, y]; }
      }
    }
    return best;
  }
  function stepToward(G, f, goal) {
    const np = nearestPlayer(G, f.x, f.y);
    let best = null, bc = man(f.x, f.y, goal[0], goal[1]) + 0.01;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const x = f.x + dx, y = f.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const hasP = playersIn(G, x, y).length > 0;
      const isGoal = x === goal[0] && y === goal[1];
      if (fleetAt(G, x, y) || (baseAt(G, x, y) && !(hasP && isGoal && f.role !== 'raider'))) continue;
      if (hasP && f.role !== 'hunter' && !isGoal) continue; // raiders route around you
      let c = Math.hypot(x - goal[0], y - goal[1]) + (dx && dy ? 0.05 : 0);
      if (np && f.role !== 'hunter') { const pd = cheb(np.p.sx, np.p.sy, x, y); if (pd <= 1) c += 0.8; }
      if (c < bc) { bc = c; best = [x, y]; }
    }
    return best;
  }

  /* ---------- tactical: enemy ships ---------- */
  function stepShips(G, dt) {
    const C = G.C, R = G.R;
    const bySk = {};
    for (const p of G.players) if (p && p.alive && !p.inTransit) (bySk[key(p.sx, p.sy)] = bySk[key(p.sx, p.sy)] || []).push(p);
    const lancers = {};
    for (const s of G.ships) {
      const K = KIND[s.kind], pl = bySk[s.sk]; if (!pl) continue;
      // target the nearest player in the sector
      let p = pl[0], pd = V.dist(s.pos, p.pos); for (const o of pl) { const d = V.dist(s.pos, o.pos); if (d < pd) { pd = d; p = o; } }
      s.tgt = p.idx; s.hitT = Math.max(0, s.hitT - dt); s.stT += dt;
      const rel = V.sub(p.pos, s.pos), dist = V.len(rel), toP = V.mul(rel, 1 / (dist || 1));
      const pf = fwdOf(p.q), pv = V.mul(pf, p.speed);
      const lead = V.madd(p.pos, pv, Math.min(2.5, dist / (C.plasmaV + 1)));
      const pvd = viewDir(p), aimed = V.dot(V.mul(rel, -1), pvd) / (dist || 1) > Math.cos(0.09) && dist < 260; // the player is aiming at me
      let want = toP, spd = K.speed;
      if (s.kind === 'darter') {
        if (s.st === 'attack') {
          want = V.norm(V.sub(lead, s.pos));
          if (dist < 34) { s.st = 'break'; s.stT = 0; const r = V.norm(V.cross(toP, [R.r(-1, 1), R.r(-1, 1), R.r(-1, 1)])); s.brk = r; }
          if (aimed && !s.jink && R() < dt * (0.6 + G.diff * 0.45)) s.jink = { d: V.norm(V.cross(toP, [R.r(-1, 1), R.r(-1, 1), R.r(-1, 1)])), t: R.r(0.5, 1.0) };
        } else if (s.st === 'break') {
          want = V.norm(V.add(s.brk, V.mul(toP, -0.6))); spd = K.speed * 1.2;
          if (s.stT > R.r(1.4, 2.4) || dist > 180) { s.st = 'attack'; s.stT = 0; }
        }
        if (s.jink) { want = V.norm(V.add(want, V.mul(s.jink.d, 1.6))); s.jink.t -= dt; if (s.jink.t <= 0) s.jink = null; }
      } else if (s.kind === 'lancer') {
        // flank: take position off your wing (opposite sides for pairs), swap when you turn onto it
        const list = lancers[s.sk] = lancers[s.sk] || []; list.push(s);
        const r = rightOf(p.q), back = G.diff >= 3 ? -60 : 30;
        const slot = V.add(V.add(p.pos, V.mul(r, s.side * 120)), V.mul(pf, back));
        const toSlot = V.sub(slot, s.pos), ds = V.len(toSlot);
        if (s.st !== 'strafe' && s.st !== 'flank') { s.st = 'flank'; s.stT = 0; }
        if (s.st === 'flank') {
          if (aimed && s.stT > 2.5) { s.side = -s.side; s.stT = 0; }
          want = V.norm(toSlot); spd = K.speed * (ds > 300 ? 1.8 : 1.15) + p.speed * 0.8;
          if (ds < 60 || s.stT > 9) { s.st = 'strafe'; s.stT = 0; s.run = V.norm(V.sub(lead, s.pos)); }
        } else {
          // attack run: commit to a straight pass across your bow, firing, then swap flanks
          want = s.stT < 1.2 ? V.norm(V.sub(lead, s.pos)) : s.run; spd = K.speed * 1.3;
          if (s.stT < 1.2) s.run = want;
          if (s.stT > 4 || dist < 25) { s.st = 'flank'; s.stT = 0; s.side = -s.side; }
        }      } else {
        // hive: hold at standoff range, broadside, launch darters, regenerate shields
        const want0 = dist > 200 ? toP : dist < 140 ? V.mul(toP, -1) : V.norm(V.cross(toP, [0, 1, 0]));
        want = want0; spd = dist > 380 ? K.speed + p.speed : K.speed;
        s.shT += dt; if (s.shT > 4 && s.sh < K.shield) { s.sh = Math.min(K.shield, s.sh + dt / 5); }
        s.launchT -= dt;
        const f = G.fleets.find(f => f.id === s.fleet);
        if (s.launchT <= 0 && f) { s.launchT = 26 - G.diff * 3; if (f.d < 5) { f.d++; const ns = spawnShip(G, 'darter', f, s.sk, V.madd(s.pos, s.fwd, 14), V.norm(V.add(s.fwd, toP))); ns.speed = 60; ev(G, { e: 'launch', pos: s.pos, sk: s.sk }); } }
      }
      // steer & move
      const prev = s.fwd;
      s.fwd = turnToward(s.fwd, want, K.turn * dt);
      const turnAmt = V.dot(V.cross(prev, s.fwd), upOf(p.q));
      s.bank += (clamp(-turnAmt / (dt || 1) * 1.2, -1.2, 1.2) - s.bank) * Math.min(1, dt * 4);
      s.speed += clamp(spd - s.speed, -30 * dt, 30 * dt);
      s.pos = V.madd(s.pos, s.fwd, s.speed * dt);
      // keep up with a fleeing player (fighters and lancers are faster in a pursuit)
      if (dist > 700) s.pos = V.madd(s.pos, toP, (dist - 700) * 0.5 * dt);
      // fire plasma
      s.fireT -= dt;
      const facing = V.dot(s.fwd, toP);
      if (s.kind === 'darter' && s.fireT <= 0 && dist < 190 && facing > 0.94) { plasma(G, s, p, 1); s.fireT = R.r(1.6, 3.0) * C.fireMul; }
      if (s.kind === 'lancer') {
        if (s.burst > 0) { s.burstT -= dt; if (s.burstT <= 0) { plasma(G, s, p, 1); s.burst--; s.burstT = 0.22; } }
        else if (s.fireT <= 0 && dist < 230 && facing > 0.8) { s.burst = 3; s.burstT = 0; s.fireT = R.r(3.5, 5) * C.fireMul; }
      }
      if (s.kind === 'hive' && s.fireT <= 0 && dist < 320) { for (let i = 0; i < 5; i++) plasma(G, s, p, 1, (i - 2) * 0.07); s.fireT = R.r(4, 6) * C.fireMul; }
      // ram
      if (dist < K.r + 2.5) { hitPlayer(G, p, s.pos, 2); damageShip(G, s, 9, p.idx, true); }
    }
    G.ships = G.ships.filter(s => s.hp > 0);
  }
  function plasma(G, s, p, n, spread = 0) {
    const R = G.R, C = G.C;
    const pv = V.mul(fwdOf(p.q), p.speed), d = V.dist(s.pos, p.pos);
    const tl = d / C.plasmaV;
    let aim = V.norm(V.sub(V.madd(p.pos, pv, tl), s.pos));
    const e = C.aimErr; aim = V.norm(V.add(aim, [R.r(-e, e), R.r(-e, e), R.r(-e, e)]));
    if (spread) aim = V.norm(Q.rot(Q.axis(V.norm(V.cross(aim, [0, 1, 0])), 0), Q.rot(Q.axis([0, 1, 0], spread), aim)));
    const pos = V.madd(s.pos, s.fwd, KIND[s.kind].r + 1);
    G.shots.push({ id: G.nextId++, own: -1, sk: s.sk, pos, vel: V.mul(aim, C.plasmaV), life: 3.6, kind: 'plasma', tgt: p.idx });
    ev(G, { e: 'plasma', pos, sk: s.sk, kind: s.kind });
  }
  function stepShots(G, dt) {
    const C = G.C;
    for (const sh of G.shots) {
      sh.life -= dt;
      if (sh.kind === 'torp' && sh.tgt) { const t = G.ships.find(s => s.id === sh.tgt); if (t) { const sp = V.len(sh.vel), d = V.norm(V.sub(t.pos, sh.pos)); sh.vel = V.mul(turnToward(V.norm(sh.vel), d, 2.6 * dt), sp); } }
      if (sh.kind === 'plasma' && C.home > 0) { const p = G.players[sh.tgt]; if (p && p.alive && !p.inTransit && key(p.sx, p.sy) === sh.sk) { const sp = V.len(sh.vel); sh.vel = V.mul(turnToward(V.norm(sh.vel), V.norm(V.sub(p.pos, sh.pos)), C.home * dt), sp); } }
      const p0 = sh.pos; sh.pos = V.madd(sh.pos, sh.vel, dt);
      if (sh.kind === 'torp') {
        for (const s of G.ships) { if (s.sk !== sh.sk || s.hp <= 0) continue; const r = KIND[s.kind].r + (s.sh > 0.5 ? 2.5 : 0) + 1.2; if (segDist(p0, sh.pos, s.pos) < r) { damageShip(G, s, 1, sh.own, false, sh.pos); sh.life = 0; break; } }
        if (sh.life > 0) for (const o of G.shots) { if (o.kind !== 'plasma' || o.life <= 0 || o.sk !== sh.sk) continue; if (segDist(p0, sh.pos, o.pos) < 3.2) { o.life = 0; sh.life = 0; ev(G, { e: 'pop', pos: o.pos, sk: o.sk }); break; } }
      } else {
        for (const p of G.players) { if (!p || !p.alive || p.inTransit || key(p.sx, p.sy) !== sh.sk) continue; if (segDist(p0, sh.pos, p.pos) < 3.4) { hitPlayer(G, p, sh.pos, 1); sh.life = 0; break; } }
      }
    }
    G.shots = G.shots.filter(s => s.life > 0);
  }
  function segDist(a, b, c) { const ab = V.sub(b, a), t = clamp(V.dot(V.sub(c, a), ab) / (V.dot(ab, ab) || 1), 0, 1); return V.dist(V.madd(a, ab, t), c); }
  function damageShip(G, s, n, by, ram, at) {
    if (s.hp <= 0) return;
    s.hitT = 0.25; s.shT = 0;
    if (s.sh >= 1 && !ram) { s.sh -= 1; ev(G, { e: 'shieldhit', pos: at || s.pos, sk: s.sk, ship: s.id, left: Math.floor(s.sh) }); return; }
    s.hp -= n;
    if (s.hp > 0) { ev(G, { e: 'hullhit', pos: at || s.pos, sk: s.sk, ship: s.id }); return; }
    const K = KIND[s.kind];
    ev(G, { e: 'boom', pos: s.pos, sk: s.sk, kind: s.kind, size: s.kind === 'hive' ? 3 : s.kind === 'lancer' ? 1.7 : 1, vel: V.mul(s.fwd, s.speed), by });
    const f = G.fleets.find(f => f.id === s.fleet);
    if (f) { if (s.kind === 'darter') f.d = Math.max(0, f.d - 1); else if (s.kind === 'lancer') f.l = Math.max(0, f.l - 1); else f.h = Math.max(0, f.h - 1);
      if (f.d + f.l + f.h <= 0) { G.fleets = G.fleets.filter(o => o !== f); msg(G, 'VRELL FLEET DESTROYED', 'good'); ev(G, { e: 'fleetdead', x: f.x, y: f.y }); G.galSeq++; } }
    if (by >= 0) { const p = G.players[by]; if (p) p.kills++; G.stats.kills[s.kind]++; G.stats.killPts += K.pts; }
  }
  function hitPlayer(G, p, at, sev) {
    if (!p.alive || p.hitT > 0.15) return;
    const C = G.C, R = G.R;
    p.hitT = 0.5;
    const shieldsUp = p.shields && p.dmg.S < 2 && (p.dmg.S === 0 || R() < 0.75);
    if (shieldsUp) {
      use(G, p, C.hitE * sev); p.shieldT = 0.6;
      if (R() < 0.22 * sev + G.diff * 0.04) damageSys(G, p);
      ev(G, { e: 'phit', p: p.idx, shield: true, pos: at });
    } else {
      ev(G, { e: 'phit', p: p.idx, shield: false, pos: at });
      if (R() < C.bareKill) { kill(G, p, 'HIT WITH SHIELDS DOWN'); return; }
      use(G, p, C.bareE * sev); for (let i = 0; i < C.bareSys; i++) damageSys(G, p);
    }
    if (p.energy <= 0) { p.energy = 0; kill(G, p, 'ENERGY EXHAUSTED'); }
  }
  function damageSys(G, p) {
    const R = G.R, list = SYS.filter(k => p.dmg[k] < 2); if (!list.length) return;
    const k = list[R.i(list.length)]; p.dmg[k]++;
    if (k === 'E' && p.thr > thrCap(p)) p.thr = thrCap(p);
    if (k === 'S' && p.dmg.S >= 2) p.shields = false;
    msg(G, SYSNAME[k] + (p.dmg[k] >= 2 ? ' DESTROYED' : ' DAMAGED'), 'warn', p.idx);
    ev(G, { e: 'sysdmg', p: p.idx, k, lvl: p.dmg[k] });
  }
  function end(G, win, why) {
    if (G.over) return;
    const S = G.stats, minutes = G.t / 60;
    const alive = G.bases.filter(b => b.alive).length;
    let R = S.killPts + (win ? 200 : 0) + alive * 20 - S.basesLost * 40 - S.energyUsed / 200 - minutes * 2 - S.deaths * 60;
    if (G.mission === 'laststand') R = S.killPts * 1.2 + (G.wave - 1) * 40 - S.deaths * 60;
    R *= [0.8, 1.3, 1.7, 2.1][G.diff];
    R = Math.max(0, R);
    const ri = Math.min(RANK_CAP[G.diff], Math.floor(R / 100)), cls = ri >= RANK_CAP[G.diff] && R >= (RANK_CAP[G.diff] + 1) * 100 ? 1 : 5 - Math.min(4, Math.floor((R % 100) / 20));
    G.over = { win, why, rating: Math.round(R), rank: RANKS[ri], rankIdx: ri, cls, t: G.t };
    ev(G, { e: 'over', win });
  }
  /** quick strategic summary for HUD / autopilot */
  function threat(G) { return G.bases.filter(b => b.alive).map(b => ({ b, n: siegeCount(G, b), need: needFor(G, b), siege: b.siege, max: G.C.siege })); }

  root.SRSim = { W, H, SPEED, DRAIN, DIFFS, SYS, SYSNAME, KIND, BASE_POS, RANKS, MISSIONS, DCFG, V, Q, fwdOf, upOf, rightOf, turnToward, rng, clamp, key,
    newGame, addPlayer, stepPilot, stepWorld, startWarp, warpCost, thrCap, fleetAt, baseAt, siegeSlots, siegeCount, needFor, viewDir, threat, end, msg, kill, interval, cheb };
  if (typeof module !== 'undefined') module.exports = root.SRSim;
})(typeof window !== 'undefined' ? window : globalThis);
