/* ==========================================================================
   VECTOR ARMOR — sim.js
   The battlefield rules at a fixed 60 Hz tick. Pure logic (no DOM), so the
   same code runs solo, on the online host (authoritative) and on the online
   guest (prediction of its own tank).

   WORLD: a seamless wrapping plane, W x W units (like the endless 1980
   battlefield). Every distance uses the shortest wrapped delta wd().
   Heading h: forward = (sin h, -cos h) on the x/z plane; turning right = +h.
   ========================================================================== */
const Sim = (() => {
  'use strict';
  const DT = 1 / 60, W = 1400, HW = W / 2, TAU = Math.PI * 2;
  const wrap = v => ((v % W) + W) % W;
  const wd = d => d - W * Math.round(d / W);
  const angN = a => a - TAU * Math.round(a / TAU);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  const SCORE = { tank: 1000, super: 3000, missile: 2000, saucer: 5000 };
  const MAIN = { tank: 1, super: 1, missile: 1 };
  const C = {
    P_R: 4.2, P_SPD: 22, P_TURN: 1.15, P_ACC: 44, EYE: 2.7,
    SHELL_SPD: 190, SHELL_RANGE: 430, SHELL_Y: 1.7,
    RADAR: 520, VIEW_HALF: 0.52, KILLS_PER_LEVEL: 5,
    HIT_R: { tank: 4.6, super: 4.4, missile: 3.2, saucer: 6.2, player: 4.0 },
  };

  /* ---------------- obstacles ---------------- */
  function makeObstacles(seed) {
    const r = rng((seed ^ 0x5eed) >>> 0), obs = [];
    let tries = 0;
    while (obs.length < 62 && tries++ < 4000) {
      const q = r(); let k, hx, hz, h;
      if (q < 0.32) { k = 'cube'; hx = hz = 5.5 + r() * 3; h = hx * 2; }
      else if (q < 0.62) { k = 'pyr'; hx = hz = 7 + r() * 4; h = hx * 1.7; }
      else if (q < 0.84) { k = 'short'; hx = 9 + r() * 6; hz = 3.5 + r() * 2; h = 4 + r() * 1.5; if (r() < 0.5) { const t = hx; hx = hz; hz = t; } }
      else { k = 'tall'; hx = hz = 3.2 + r() * 1.6; h = 18 + r() * 10; }
      const x = r() * W, z = r() * W;
      if (Math.hypot(wd(x - HW), wd(z - HW)) < 50) continue;
      if (obs.some(o => Math.hypot(wd(o.x - x), wd(o.z - z)) < 58)) continue;
      obs.push({ k, x, z, hx, hz, h, id: obs.length });
    }
    return obs;
  }
  /** is point (x,y,z) inside obstacle o (pad widens the footprint) */
  function inObs(o, x, y, z, pad) {
    pad = pad || 0;
    const dx = wd(x - o.x), dz = wd(z - o.z), ax = Math.abs(dx), az = Math.abs(dz);
    if (ax > o.hx + pad || az > o.hz + pad) return false;
    if (y == null) return true;
    if (o.k === 'pyr') return y < o.h * (1 - Math.max(ax / o.hx, az / o.hz)) + pad * 0.5;
    return y < o.h;
  }
  function obsAt(G, x, y, z, pad) { for (const o of G.obs) if (inObs(o, x, y, z, pad)) return o; return null; }
  /** push a circle (radius r) out of all obstacles; returns true when it touched one */
  function pushOut(G, b, r) {
    let hit = false;
    for (const o of G.obs) {
      const dx = wd(b.x - o.x), dz = wd(b.z - o.z);
      if (Math.abs(dx) > o.hx + r || Math.abs(dz) > o.hz + r) continue;
      const cx = clamp(dx, -o.hx, o.hx), cz = clamp(dz, -o.hz, o.hz), ex = dx - cx, ez = dz - cz, d2 = ex * ex + ez * ez;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; b.x += ex * k; b.z += ez * k; }
      else { const px = o.hx + r - Math.abs(dx), pz = o.hz + r - Math.abs(dz); if (px < pz) b.x += Math.sign(dx || 1) * px; else b.z += Math.sign(dz || 1) * pz; }
    }
    b.x = wrap(b.x); b.z = wrap(b.z);
    return hit;
  }
  /** clear line of sight at shell height between two points */
  function los(G, ax, az, bx, bz) {
    const dx = wd(bx - ax), dz = wd(bz - az), L = Math.hypot(dx, dz), n = Math.ceil(L / 3);
    for (let i = 1; i < n; i++) { const t = i / n; if (obsAt(G, ax + dx * t, C.SHELL_Y, az + dz * t)) return false; }
    return true;
  }

  /* ---------------- game ---------------- */
  let G = null; const EV = [];
  const emit = e => { EV.push(e); if (EV.length > 400) EV.shift(); };
  function drain() { const out = EV.slice(); EV.length = 0; return out; }

  function newPlayer(id, x, z, h) { return { id, x, z, h, px: x, pz: z, ph: h, v: 0, w: 0, alive: true, deadT: 0, lives: 3, score: 0, hits: 0, bumpT: 0, inp: { fwd: 0, turn: 0, fire: false }, fired: 0 }; }
  /**
   * opts: { level (start level 1..9), seed, mode:'solo'|'duel', bonus:[15000,100000], lives, cpu (duel CPU tanks), to (duel hits to win) }
   */
  function newGame(opts) {
    opts = opts || {};
    const seed = (opts.seed == null ? (Math.random() * 1e9) : opts.seed) >>> 0;
    G = {
      mode: opts.mode || 'solo', seed, rnd: rng(seed ^ 0x9e3779b9), t: 0, tick: 0, obs: makeObstacles(seed),
      startLevel: clamp(opts.level || 1, 1, 9), level: clamp(opts.level || 1, 1, 9), kills: 0, bonus: (opts.bonus || [15000, 100000]).slice(), bonusIdx: 0,
      phase: 'play', phaseT: 0, players: [], enemies: [], shells: [], nextId: 1, spawnT: 2.0, saucerT: 22, cpu: !!opts.cpu, duelTo: opts.to || 5, winner: -1,
      shotsFired: 0,
    };
    const p0 = newPlayer(0, HW, HW, 0); p0.lives = opts.lives || 3; G.players.push(p0);
    if (G.mode === 'duel') {
      p0.x = HW; p0.z = HW + 140; p0.h = 0; p0.lives = 0;
      const p1 = newPlayer(1, HW, HW - 140, Math.PI); p1.lives = 0; G.players.push(p1);
      for (const p of G.players) { pushOut(G, p, C.P_R + 2); p.px = p.x; p.pz = p.z; p.ph = p.h; }
      G.spawnT = G.cpu ? 6 : 1e9; G.saucerT = G.cpu ? 30 : 1e9;
    }
    EV.length = 0;
    return G;
  }
  const diff = () => clamp(G.level, 1, 12);

  /* ---------------- player tank ---------------- */
  /** move one tank one tick with input {fwd, turn} (shared by the sim and the online guest's prediction) */
  function movePlayer(g, p, inp, others) {
    p.px = p.x; p.pz = p.z; p.ph = p.h;
    const fwd = clamp(+inp.fwd || 0, -1, 1), turn = clamp(+inp.turn || 0, -1, 1);
    const tv = fwd * C.P_SPD; p.v += clamp(tv - p.v, -C.P_ACC * DT, C.P_ACC * DT);
    const tw = turn * C.P_TURN; p.w += clamp(tw - p.w, -7 * DT, 7 * DT);
    p.h = angN(p.h + p.w * DT);
    p.x = wrap(p.x + Math.sin(p.h) * p.v * DT); p.z = wrap(p.z - Math.cos(p.h) * p.v * DT);
    const saveG = G; G = g;
    let hit = pushOut(g, p, C.P_R);
    if (others) for (const o of others) {
      if (!o || o === p || o.alive === false) continue;
      const dx = wd(p.x - o.x), dz = wd(p.z - o.z), d = Math.hypot(dx, dz), rr = C.P_R + (o.r || C.P_R);
      if (d < rr && d > 1e-6) { p.x = wrap(p.x + dx / d * (rr - d)); p.z = wrap(p.z + dz / d * (rr - d)); hit = true; }
    }
    G = saveG;
    if (hit) { p.v *= 0.2; if (p.bumpT <= 0 && Math.abs(fwd) > 0.1) { p.bumpT = 0.6; emit({ t: 'bump', pid: p.id }); } }
    p.bumpT -= DT;
    return hit;
  }
  const shellOf = owner => G.shells.find(s => s.owner === owner);
  function fire(owner, x, z, h, spd, life, kind, extra) {
    const s = { id: G.nextId++, owner, kind, x: wrap(x + Math.sin(h) * 6.5), z: wrap(z - Math.cos(h) * 6.5), y: C.SHELL_Y, dx: Math.sin(h), dz: -Math.cos(h), spd, life, dist: 0, px: 0, pz: 0 };
    s.px = s.x; s.pz = s.z;
    // a muzzle jammed into an obstacle fizzles at once
    if (obsAt(G, s.x, s.y, s.z)) { emit({ t: 'fizz', x: s.x, z: s.z, y: s.y, owner }); return null; }
    Object.assign(s, extra || {}); G.shells.push(s);
    emit({ t: 'fire', owner, kind, x: s.x, z: s.z, h, sid: s.id });
    return s;
  }
  function playerTick(p) {
    if (!p.alive) return;
    const others = G.enemies.filter(e => e.type === 'tank' || e.type === 'super').map(e => ({ x: e.x, z: e.z, r: 4.2 })).concat(G.players.filter(o => o !== p && o.alive));
    movePlayer(G, p, p.inp, others);
    if (p.inp.fire && !shellOf('p' + p.id) && G.phase === 'play') {
      if (fire('p' + p.id, p.x, p.z, p.h, C.SHELL_SPD, C.SHELL_RANGE / C.SHELL_SPD, 'player')) { p.fired++; G.shotsFired++; }
    }
  }

  /* ---------------- enemies ---------------- */
  function targetOf(e) {
    let best = null, bd = 1e9;
    for (const p of G.players) { if (!p.alive) continue; const d = Math.hypot(wd(p.x - e.x), wd(p.z - e.z)); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function spawnPos(minD, maxD) {
    const p = G.players.find(p => p.alive) || G.players[0];
    for (let i = 0; i < 40; i++) {
      const a = G.rnd() * TAU, d = minD + G.rnd() * (maxD - minD);
      const x = wrap(p.x + Math.sin(a) * d), z = wrap(p.z - Math.cos(a) * d);
      if (obsAt(G, x, null, z, 7)) continue;
      if (G.players.some(q => Math.hypot(wd(q.x - x), wd(q.z - z)) < minD * 0.8)) continue;
      return { x, z };
    }
    return { x: wrap(p.x + minD), z: p.z };
  }
  function spawnEnemy(type, at) {
    const L = diff();
    const pos = at || spawnPos(type === 'missile' ? 380 : 260, type === 'missile' ? 430 : 420);
    const e = { id: G.nextId++, type, x: pos.x, z: pos.z, y: type === 'saucer' ? 3.4 : type === 'missile' ? 2.0 : 0, h: G.rnd() * TAU, v: 0, w: 0,
      state: 'approach', stateT: 0, fireCd: 2.5 + G.rnd() * 1.5, zt: G.rnd() * 10, avoid: 0, flank: 0, dodgeCd: 0, life: 0, alive: true, px: 0, pz: 0, ph: 0, py: 0, aimErr: 0, spin: 0 };
    const tg = targetOf(e); if (tg && type !== 'saucer') e.h = Math.atan2(wd(tg.x - e.x), -wd(tg.z - e.z)) + (G.rnd() - 0.5) * 1.2;
    e.px = e.x; e.pz = e.z; e.ph = e.h; e.py = e.y;
    G.enemies.push(e); emit({ t: 'spawn', type, id: e.id, x: e.x, z: e.z, lvl: L });
    return e;
  }
  function chooseType() {
    const L = diff(), r = G.rnd();
    const hasMissile = G.enemies.some(e => e.type === 'missile');
    const pm = L >= 2 && !hasMissile ? Math.min(0.32, 0.08 + 0.04 * L) : 0;
    const ps = L >= 2 ? Math.min(0.6, 0.14 * (L - 1)) : 0;
    if (r < pm) return 'missile';
    if (r < pm + ps * (1 - pm)) return 'super';
    return 'tank';
  }
  const wantEnemies = () => G.mode === 'duel' ? (G.cpu ? 1 : 0) : Math.min(3, 1 + Math.floor((G.level - 1) / 3));
  const mainCount = () => G.enemies.filter(e => MAIN[e.type]).length;

  function drive(e, spd, turnRate, wantH, throttle) {
    let err = angN(wantH - e.h);
    // obstacle avoidance: feel ahead, swerve to a stable side while blocked
    const fx = Math.sin(e.h), fz = -Math.cos(e.h), probe = obsAt(G, e.x + fx * 15, null, e.z + fz * 15, 4.5) || obsAt(G, e.x + fx * 7, null, e.z + fz * 7, 4.5);
    if (probe) {
      if (!e.avoid) { const ox = wd(probe.x - e.x), oz = wd(probe.z - e.z); e.avoid = (fx * oz - fz * ox) > 0 ? 1 : -1; }
      err = e.avoid * 1.2; throttle = Math.min(throttle, 0.45);
    } else if (e.avoid && Math.abs(err) < 0.6) e.avoid = 0;
    const tw = clamp(err * 3, -1, 1) * turnRate; e.w += clamp(tw - e.w, -5 * DT, 5 * DT);
    e.h = angN(e.h + e.w * DT);
    const tv = spd * throttle; e.v += clamp(tv - e.v, -30 * DT, 30 * DT);
    e.x = wrap(e.x + Math.sin(e.h) * e.v * DT); e.z = wrap(e.z - Math.cos(e.h) * e.v * DT);
    if (pushOut(G, e, 4.2)) e.v *= 0.5;
    for (const p of G.players) if (p.alive) { const dx = wd(e.x - p.x), dz = wd(e.z - p.z), d = Math.hypot(dx, dz); if (d < 8.4 && d > 1e-6) { e.x = wrap(e.x + dx / d * (8.4 - d)); e.z = wrap(e.z + dz / d * (8.4 - d)); e.v = 0; } }
    return err;
  }
  function incoming(e) {
    for (const s of G.shells) {
      if (s.kind !== 'player') continue;
      const rx = wd(e.x - s.x), rz = wd(e.z - s.z), along = rx * s.dx + rz * s.dz;
      if (along < 0 || along > 260) continue;
      const miss = Math.abs(rx * s.dz - rz * s.dx);
      if (miss < 9) return s;
    }
    return null;
  }
  function tankTick(e) {
    const L = diff(), sup = e.type === 'super';
    const spd = (sup ? 25 : 11) * (1 + 0.025 * L), turn = (sup ? 1.45 : 0.72) * (1 + 0.03 * L);
    const tg = targetOf(e);
    e.stateT -= DT; e.fireCd -= DT; e.dodgeCd -= DT;
    if (!tg) { drive(e, spd, turn, e.h + 0.3, 0.3); return; }
    const dx = wd(tg.x - e.x), dz = wd(tg.z - e.z), dist = Math.hypot(dx, dz);
    // lead the target a little (better with level)
    const tti = dist / (95 + 5 * L), lead = Math.min(1, 0.25 + 0.07 * L);
    const lx = dx + Math.sin(tg.h) * tg.v * tti * lead, lz = dz - Math.cos(tg.h) * tg.v * tti * lead;
    const aim = Math.atan2(lx, -lz) + e.aimErr;
    const th = incoming(e);
    if (th && e.dodgeCd <= 0 && e.state !== 'evade') {
      e.dodgeCd = 2.2;
      if (G.rnd() < Math.min(0.85, (sup ? 0.4 : 0.12) + 0.055 * L)) {
        const side = (wd(e.x - th.x) * th.dz - wd(e.z - th.z) * th.dx) > 0 ? 1 : -1;
        e.state = 'evade'; e.stateT = 1.0 + G.rnd() * 0.6; e.evH = Math.atan2(th.dx, -th.dz) + side * Math.PI / 2 * -1;
        emit({ t: 'dodge', id: e.id });
      }
    }
    if (e.state === 'evade') { drive(e, spd * 1.15, turn * 1.4, e.evH, 1); if (e.stateT <= 0) e.state = 'approach'; return; }
    if (e.state === 'flank') { drive(e, spd, turn, aim + e.flank, 1); if (e.stateT <= 0) e.state = 'approach'; return; }
    if (e.state === 'approach') {
      const err = drive(e, spd, turn, aim, dist > 150 ? 1 : 0.35);
      if (Math.abs(err) < 0.3 && dist < 440) { e.state = 'aim'; e.aimErr = (G.rnd() - 0.5) * Math.max(0.015, 0.1 - 0.008 * L); }
      return;
    }
    // aim: stop and swing the gun on target, fire when clear
    const err = drive(e, spd, turn * 0.8, aim, dist > 200 ? 0.25 : 0);
    if (Math.abs(err) > 0.6 || dist > 470) { e.state = 'approach'; return; }
    if (Math.abs(err) < 0.035 && e.fireCd <= 0 && !shellOf(e.id) && G.phase === 'play' && los(G, e.x, e.z, tg.x, tg.z)) {
      fire(e.id, e.x, e.z, e.h, 96 + 5 * L + (sup ? 12 : 0), 4.4, 'enemy');
      e.fireCd = Math.max(1.4, (sup ? 2.6 : 4.0) - 0.24 * L) + G.rnd() * 0.8;
      if (G.rnd() < 0.45) { e.state = 'flank'; e.stateT = 1.4 + G.rnd() * 1.6; e.flank = (G.rnd() < 0.5 ? -1 : 1) * (0.7 + G.rnd() * 0.5); }
    }
  }
  function missileTick(e) {
    const L = diff(), tg = targetOf(e);
    e.zt += DT;
    if (!tg) { e.x = wrap(e.x + Math.sin(e.h) * 40 * DT); e.z = wrap(e.z - Math.cos(e.h) * 40 * DT); e.life += DT; if (e.life > 6) e.alive = false; return; }
    const dx = wd(tg.x - e.x), dz = wd(tg.z - e.z), dist = Math.hypot(dx, dz);
    const zig = Math.sin(e.zt * 2.9) * 0.75 * clamp((dist - 45) / 260, 0, 1);
    const want = Math.atan2(dx, -dz) + zig;
    const err = angN(want - e.h); e.h = angN(e.h + clamp(err, -2.4 * DT, 2.4 * DT));
    const spd = 52 + 3 * L;
    e.v = spd; e.x = wrap(e.x + Math.sin(e.h) * spd * DT); e.z = wrap(e.z - Math.cos(e.h) * spd * DT);
    // hop over obstacles in the way
    let ty = 2.0; const fx = Math.sin(e.h), fz = -Math.cos(e.h);
    for (const k of [0, 8, 16, 24]) { const o = obsAt(G, e.x + fx * k, null, e.z + fz * k, 3); if (o) ty = Math.max(ty, o.h + 3.5); }
    if (ty > 2.1 && !e.hop) { e.hop = 1; emit({ t: 'hop', id: e.id }); } else if (ty <= 2.1) e.hop = 0;
    e.y += clamp(ty - e.y, -16 * DT, 34 * DT);
    if (dist < 5.5 && e.y < 6 && G.phase === 'play') { e.alive = false; emit({ t: 'boom', type: 'missile', x: e.x, z: e.z, y: e.y, id: e.id }); killPlayer(tg, 'missile', e); }
  }
  function saucerTick(e) {
    e.life += DT; e.stateT -= DT; e.spin += DT;
    if (e.stateT <= 0) { e.stateT = 2 + G.rnd() * 3; e.tw = (G.rnd() - 0.5) * 1.2; e.tv = 8 + G.rnd() * 8; }
    e.h = angN(e.h + (e.tw || 0) * DT); e.v += ((e.tv || 10) - e.v) * DT;
    e.x = wrap(e.x + Math.sin(e.h) * e.v * DT); e.z = wrap(e.z - Math.cos(e.h) * e.v * DT);
    e.y = 3.4 + Math.sin(e.life * 1.7) * 0.9;
    if (e.life > 24) { e.alive = false; emit({ t: 'saucerGone', id: e.id }); }
  }

  /* ---------------- shells ---------------- */
  function shellTick(s) {
    const n = 3, step = s.spd * DT / n;
    s.px = s.x; s.pz = s.z;
    for (let k = 0; k < n; k++) {
      s.x = wrap(s.x + s.dx * step); s.z = wrap(s.z + s.dz * step); s.dist += step;
      const o = obsAt(G, s.x, s.y, s.z);
      if (o) { s.dead = true; emit({ t: 'hitObs', x: s.x, z: s.z, y: s.y, owner: s.owner, kind: s.kind, oid: o.id }); return; }
      if (s.kind === 'player') {
        for (const e of G.enemies) {
          if (!e.alive) continue;
          if (e.type === 'missile' && e.y > 5.5) continue;
          if (Math.hypot(wd(s.x - e.x), wd(s.z - e.z)) < C.HIT_R[e.type]) { s.dead = true; killEnemy(e, s.owner); return; }
        }
      }
      for (const p of G.players) {
        if (!p.alive || s.owner === 'p' + p.id) continue;
        if (Math.hypot(wd(s.x - p.x), wd(s.z - p.z)) < C.HIT_R.player) { s.dead = true; killPlayer(p, s.kind === 'player' ? 'rival' : 'shell', s); return; }
      }
      if (s.dist >= s.life * s.spd) { s.dead = true; emit({ t: 'fizz', x: s.x, z: s.z, y: s.y, owner: s.owner }); return; }
    }
  }
  const ownerPlayer = o => (typeof o === 'string' && o[0] === 'p') ? G.players[+o.slice(1)] : null;
  function addScore(p, n) {
    if (!p) return;
    const before = p.score; p.score += n;
    if (G.mode === 'solo') {
      while (G.bonusIdx < G.bonus.length && before < G.bonus[G.bonusIdx] && p.score >= G.bonus[G.bonusIdx]) { G.bonusIdx++; p.lives++; emit({ t: 'extra', pid: p.id, lives: p.lives }); }
    }
  }
  function killEnemy(e, owner) {
    e.alive = false;
    const p = ownerPlayer(owner), pts = SCORE[e.type];
    addScore(p, pts);
    emit({ t: 'kill', type: e.type, id: e.id, x: e.x, z: e.z, y: e.y, h: e.h, pts, by: p ? p.id : -1 });
    if (MAIN[e.type]) {
      G.kills++; G.spawnT = Math.max(G.spawnT, 2.6 - Math.min(1.2, G.level * 0.1));
      if (G.mode === 'solo') {
        const lv = clamp(G.startLevel + Math.floor(G.kills / C.KILLS_PER_LEVEL), 1, 99);
        if (lv > G.level) { G.level = lv; emit({ t: 'level', level: lv }); }
      }
    }
  }
  function killPlayer(p, by, src) {
    if (!p.alive) return;
    p.alive = false; p.v = 0; p.w = 0; p.deadT = 3.2;
    emit({ t: 'die', pid: p.id, by, x: p.x, z: p.z, sx: src && src.x, sz: src && src.z });
    if (G.mode === 'solo') {
      p.lives--; G.phase = 'dead'; G.phaseT = 3.2;
      G.shells = G.shells.filter(s => s.kind === 'player');
    } else {
      const rival = G.players[1 - p.id];
      if (by === 'rival' && rival) { rival.hits++; addScore(rival, 3000); if (rival.hits >= G.duelTo && G.winner < 0) { G.winner = rival.id; G.phase = 'over'; G.phaseT = 0; emit({ t: 'duelOver', winner: rival.id }); } }
    }
  }
  function respawnSolo() {
    const p = G.players[0];
    p.alive = true; p.v = 0; p.w = 0; p.px = p.x; p.pz = p.z; p.ph = p.h;
    G.shells.length = 0;
    // the enemy pulls back out of sight, as in the arcade
    for (const e of G.enemies) {
      if (e.type === 'missile') { e.alive = false; continue; }
      if (e.type === 'saucer') continue;
      const pos = spawnPos(300, 420); e.x = e.px = pos.x; e.z = e.pz = pos.z; e.state = 'approach'; e.fireCd = 3 + G.rnd() * 2; e.v = 0;
    }
    G.enemies = G.enemies.filter(e => e.alive);
    G.spawnT = Math.max(G.spawnT, 2.5);
    emit({ t: 'respawn', pid: 0 });
  }
  function respawnDuel(p) {
    const rival = G.players[1 - p.id];
    for (let i = 0; i < 60; i++) {
      const x = G.rnd() * W, z = G.rnd() * W;
      if (obsAt(G, x, null, z, 8)) continue;
      if (rival && Math.hypot(wd(x - rival.x), wd(z - rival.z)) < 220) continue;
      p.x = x; p.z = z; break;
    }
    p.h = rival ? Math.atan2(wd(rival.x - p.x), -wd(rival.z - p.z)) + (G.rnd() - 0.5) * 1.5 : 0;
    p.px = p.x; p.pz = p.z; p.ph = p.h; p.alive = true; p.v = 0; p.w = 0;
    emit({ t: 'respawn', pid: p.id });
  }

  /* ---------------- tick ---------------- */
  function step() {
    if (!G || G.phase === 'over') return;
    G.t += DT; G.tick++;
    for (const e of G.enemies) { e.px = e.x; e.pz = e.z; e.ph = e.h; e.py = e.y; }
    for (const p of G.players) playerTick(p);
    for (const e of G.enemies) {
      if (!e.alive) continue;
      if (e.type === 'tank' || e.type === 'super') tankTick(e);
      else if (e.type === 'missile') missileTick(e);
      else saucerTick(e);
    }
    for (const s of G.shells) if (!s.dead) shellTick(s);
    G.shells = G.shells.filter(s => !s.dead);
    G.enemies = G.enemies.filter(e => e.alive);
    if (G.phase === 'dead') {
      G.phaseT -= DT;
      if (G.phaseT <= 0) { if (G.players[0].lives > 0) { G.phase = 'play'; respawnSolo(); } else { G.phase = 'over'; emit({ t: 'over' }); } }
      return;
    }
    if (G.mode === 'duel') for (const p of G.players) if (!p.alive) { p.deadT -= DT; if (p.deadT <= 0 && G.phase === 'play') respawnDuel(p); }
    // spawning
    G.spawnT -= DT;
    if (mainCount() < wantEnemies() && G.spawnT <= 0) { spawnEnemy(chooseType()); G.spawnT = 3.5; }
    G.saucerT -= DT;
    if (G.saucerT <= 0 && !G.enemies.some(e => e.type === 'saucer')) { spawnEnemy('saucer', spawnPos(130, 260)); G.saucerT = 30 + G.rnd() * 25; }
  }

  /* ---------------- HUD queries ---------------- */
  /** enemy position in player p's frame: fwd (ahead), right, distance, bearing (rad, + = right) */
  function rel(p, x, z) {
    const dx = wd(x - p.x), dz = wd(z - p.z), fx = Math.sin(p.h), fz = -Math.cos(p.h);
    const f = dx * fx + dz * fz, r = dx * -fz + dz * fx;
    return { f, r, d: Math.hypot(dx, dz), b: Math.atan2(r, f) };
  }
  /** radar blips for player pid: main enemies (and the rival in a duel) within radar range, in units of the radar radius */
  function radarBlips(g, pid, extra) {
    g = g || G; const p = g.players[pid || 0], out = [];
    const list = g.enemies.filter(e => MAIN[e.type]).map(e => ({ id: e.id, type: e.type, x: e.x, z: e.z })).concat(extra || []);
    if (g.mode === 'duel') { const o = g.players[1 - (pid || 0)]; if (o && o.alive) list.push({ id: 'rival', type: 'rival', x: o.x, z: o.z }); }
    for (const e of list) { const q = rel(p, e.x, e.z); if (q.d <= C.RADAR) out.push({ id: e.id, type: e.type, r: q.r / C.RADAR, f: q.f / C.RADAR, b: q.b, d: q.d }); }
    return out;
  }
  /** the classic warnings: in range + which way to turn when the nearest enemy is out of sight */
  function warnings(g, pid, extra) {
    const bl = radarBlips(g, pid, extra);
    if (!bl.length) return { inRange: false, dir: null, nearest: null };
    bl.sort((a, b) => a.d - b.d); const n = bl[0];
    let dir = null;
    if (Math.abs(n.b) > C.VIEW_HALF) dir = Math.abs(n.b) > 2.36 ? 'REAR' : n.b < 0 ? 'LEFT' : 'RIGHT';
    return { inRange: true, dir, nearest: n };
  }
  return { DT, W, HW, C, SCORE, wd, wrap, angN, rng, newGame, step, drain, movePlayer, makeObstacles, inObs, obsAt, pushOut, los, spawnEnemy, killPlayer, radarBlips, warnings, rel, shellOf: o => G && shellOf(o),
    get G() { return G; }, set G(v) { G = v; }, emit };
})();
if (typeof module !== 'undefined') module.exports = Sim;
