/* ==========================================================================
   SKY SHIELD — sim.js : the rules, as a deterministic fixed-step (60 Hz) sim.
   No DOM, no three.js: runs in the browser (window.SSSim) and in Node tests.

   World units: x 0..160 (left -> right), y 0..128 (ground -> sky).
   Three missile bases (left / center / right) with 10 interceptors each,
   six cities between them. Incoming ICBMs (some MIRV and split), bombers and
   satellites that drop bombs, smart bombs that dodge blasts. Speed rises every
   wave, points are multiplied by wave (x1..x6), the end-of-wave bonus counts
   remaining interceptors and cities, a bonus city every 10,000 points, and
   THE END when the last city falls with no bonus city in reserve.

   Waves are generated from a seeded RNG that never depends on what the player
   does, so two players with the same seed face exactly the same waves
   (versus mode). Counterattacks from the opponent use a second RNG.
   ========================================================================== */
(function (root) {
  'use strict';
  const DT = 1 / 60, W = 160, H = 128;
  const BASES = [{ x: 12, y: 7.5 }, { x: 80, y: 8.5 }, { x: 148, y: 7.5 }];
  const CITY_X = [30, 45, 60, 100, 115, 130], CITY_Y = 2.2;
  const AMMO = 10, BONUS_EVERY = 10000;
  const ABM_SPD = [82, 135, 82];          // the center base is the fast one, like the original
  const PTS = { icbm: 25, mirv: 25, bomb: 25, buddy: 25, smart: 125, bomber: 100, sat: 100 };
  const BLAST = {  // rMax, grow, hold, shrink (s)
    abm: [9.0, 0.5, 0.35, 0.6], foe: [5.8, 0.34, 0.16, 0.42], ground: [8.0, 0.35, 0.3, 0.7], emp: [42, 0.75, 0.15, 0.35], air: [6.4, 0.3, 0.2, 0.5],
  };
  // chain reactions: each generation of secondary blast is a little smaller; past CHAIN_GEN_MAX no new blasts spawn (no runaway loops)
  const CHAIN_GEN_MAX = 12, CHAIN_SHRINK = 0.93, CHAIN_MIN = 0.65;
  /** score multiplier for the n-th kill of one chain: x1, x1, x2, x2, x3 ... capped at x5 */
  const chainMult = n => Math.min(5, 1 + Math.floor(Math.max(0, n - 1) / 2));
  const CROSS = { x0: 1.5, x1: W - 1.5, y0: 13, y1: H - 1 };

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  /** difficulty for wave n (1-based) */
  function waveParams(n) {
    return {
      n, mult: Math.min(6, Math.ceil(n / 2)),
      spd: Math.min(27.5, (7.2 + 1.2 * (n - 1)) * 1.06),
      icbms: Math.min(36, 11 + 2 * (n - 1)),
      salvo: Math.min(6, 2 + Math.floor(n / 3)),
      gap: Math.max(1.5, 4.3 - 0.26 * (n - 1)),
      mirvP: n >= 2 ? Math.min(0.42, 0.12 + 0.03 * n) : 0,
      flyers: n >= 2 ? Math.min(5, 1 + Math.floor((n - 2) / 3)) : 0,
      smart: n >= 6 ? Math.min(7, n - 5) : 0,
    };
  }
  /** the wave's spawn schedule: every rng draw happens here, in a fixed order */
  function buildSchedule(g, n) {
    const R = g.rnd, P = waveParams(n), out = [];
    let t = 0.6, left = P.icbms;
    while (left > 0) {
      const k = Math.min(left, 1 + Math.floor(R() * P.salvo)); left -= k;
      for (let i = 0; i < k; i++) {
        const mirv = R() < P.mirvP, nSplit = 2 + Math.floor(R() * 3), splitY = 52 + R() * 36, picks = [R(), R(), R(), R()];
        out.push({ t: t + R() * 0.9, kind: mirv ? 'mirv' : 'icbm', x0: 4 + R() * (W - 8), pick: R(), spd: P.spd * (0.88 + R() * 0.24), mirv, nSplit, splitY, picks });
      }
      t += P.gap * (0.75 + R() * 0.5);
    }
    const span = t;
    for (let i = 0; i < P.flyers; i++) {
      const sat = n >= 4 && (i % 2 === 1 || R() < 0.3), dir = R() < 0.5 ? 1 : -1, nb = 2 + Math.floor(R() * 2), drops = [];
      for (let j = 0; j < nb; j++) drops.push(20 + R() * (W - 40));
      out.push({ t: 3 + R() * Math.max(2, span - 6), kind: sat ? 'sat' : 'bomber', dir, y: sat ? 88 + R() * 14 : 58 + R() * 20, vx: (sat ? 17 : 12) + R() * 5 + n * 0.35, drops, picks: drops.map(() => R()), spd: P.spd * 0.95 });
    }
    for (let i = 0; i < P.smart; i++) out.push({ t: 4 + R() * Math.max(2, span - 4), kind: 'smart', x0: 10 + R() * (W - 20), pick: R(), spd: P.spd * 0.72 });
    out.sort((a, b) => a.t - b.t);
    return { list: out, i: 0, P };
  }

  function createGame(cfg = {}) {
    const seed = (cfg.seed >>> 0) || 1, wave = Math.max(1, cfg.startWave | 0 || 1);
    const g = {
      seed, startWave: wave, wave, versus: !!cfg.versus,
      rnd: rng(seed), rnd2: rng(seed ^ 0x9e3779b9),
      t: 0, phase: 'intro', pt: 0, id: 1,
      score: 0, nextBonus: BONUS_EVERY, reserve: 0, emp: cfg.emp != null ? cfg.emp : 2,
      cx: W / 2, cy: 64,
      bases: BASES.map((b, i) => ({ i, x: b.x, y: b.y, ammo: AMMO, alive: true, fired: 0 })),
      cities: CITY_X.map((x, i) => ({ i, x, y: CITY_Y, alive: true, lostAt: -1 })),
      foes: [], flyers: [], abms: [], blasts: [],
      chains: {}, chainId: 0, outAtk: 0, inAtk: 0, atkT: 0,
      sched: null, P: waveParams(wave), stats: { kills: 0, fired: 0, bestChain: 0, lostCities: 0 },
      tally: null, events: [], ended: false, over: false, survived: 0,
    };
    // skipping ahead: you still get the score a little head start in bonus city progress (none), like the arcade's level select
    g.sched = null;
    startIntro(g, true);
    return g;
  }
  const ev = (g, e) => { g.events.push(e); return e; };
  const aliveCities = g => g.cities.filter(c => c.alive).length;

  function startIntro(g, first) {
    g.phase = 'intro'; g.pt = 0; g.P = waveParams(g.wave);
    for (const b of g.bases) { if (!b.alive) ev(g, { e: 'baseback', i: b.i }); b.alive = true; b.ammo = AMMO; }
    // bonus cities fill empty slots (left to right, alternating like the arcade's "random" refill but deterministic)
    const order = [2, 3, 1, 4, 0, 5];
    while (g.reserve > 0 && aliveCities(g) < 6) { const c = order.map(i => g.cities[i]).find(c => !c.alive); c.alive = true; g.reserve--; ev(g, { e: 'cityback', i: c.i }); }
    g.sched = buildSchedule(g, g.wave);
    if (!first) ev(g, { e: 'wave', n: g.wave, mult: g.P.mult }); else ev(g, { e: 'wave', n: g.wave, mult: g.P.mult, first: true });
  }

  function targets(g) {
    const t = [];
    for (const c of g.cities) if (c.alive) t.push({ x: c.x, y: 1.2, kind: 'city', i: c.i });
    for (const b of g.bases) if (b.alive) t.push({ x: b.x, y: b.y - 0.5, kind: 'base', i: b.i });
    if (!t.length) for (const c of g.cities) t.push({ x: c.x, y: 1.2, kind: 'city', i: c.i });
    return t;
  }
  function pickTarget(g, r) { const t = targets(g); const o = t[Math.min(t.length - 1, Math.floor(r * t.length))]; return { x: o.x + (r * 977 % 1 - 0.5) * 3, y: o.y }; }

  function spawnFoe(g, kind, x0, y0, tgt, spd, extra) {
    const dx = tgt.x - x0, dy = tgt.y - y0, L = Math.hypot(dx, dy) || 1;
    const f = Object.assign({ id: g.id++, kind, x0, y0, x: x0, y: y0, tx: tgt.x, ty: tgt.y, vx: dx / L * spd, vy: dy / L * spd, spd, born: g.t, dodge: 0 }, extra || {});
    g.foes.push(f); ev(g, { e: 'spawn', id: f.id, kind, x: x0, y: y0 });
    return f;
  }
  function spawnFrom(g, s) {
    if (s.kind === 'icbm' || s.kind === 'mirv') spawnFoe(g, s.kind, s.x0, H + 2, pickTarget(g, s.pick), s.spd, s.mirv ? { splitY: s.splitY, nSplit: s.nSplit, picks: s.picks } : null);
    else if (s.kind === 'smart') spawnFoe(g, 'smart', s.x0, H + 2, pickTarget(g, s.pick), s.spd);
    else { const x = s.dir > 0 ? -6 : W + 6; g.flyers.push({ id: g.id++, kind: s.kind, x, y: s.y, vx: s.vx * s.dir, drops: s.drops.slice(), picks: s.picks.slice(), spd: s.spd, born: g.t }); ev(g, { e: 'flyer', kind: s.kind, dir: s.dir }); }
  }

  function addBlast(g, x, y, kind, chain, extra) {
    const B = BLAST[kind];
    const b = Object.assign({ id: g.id++, x, y, kind, r: 0, rMax: B[0], tg: B[1], th: B[2], ts: B[3], t: 0, chain, gen: 0 }, extra || {});
    if (b.gen > 0) b.rMax = B[0] * Math.max(CHAIN_MIN, Math.pow(CHAIN_SHRINK, b.gen - 1));
    g.blasts.push(b); ev(g, { e: 'blast', id: b.id, kind, x, y, r: b.rMax });
    return b;
  }
  function newChain(g, noAtk) { const c = ++g.chainId; g.chains[c] = { n: 0, noAtk: !!noAtk, sent: 0 }; return c; }

  /** fire an interceptor: base 0/1/2, or -1 = the best base for this target */
  function bestBase(g, tx, ty) {
    let best = -1, bt = 1e9;
    for (const b of g.bases) {
      if (!b.alive || b.ammo <= 0) continue;
      const t = Math.hypot(tx - b.x, ty - (b.y + 2)) / ABM_SPD[b.i] + (b.ammo <= 2 ? 0.05 : 0);
      if (t < bt) { bt = t; best = b.i; }
    }
    return best;
  }
  /** closest-silo launch: available bases (alive, with ammo) ordered by straight-line distance to the target */
  function closestOrder(g, tx, ty) {
    return g.bases.filter(b => b.alive && b.ammo > 0)
      .map(b => ({ i: b.i, d: Math.hypot(tx - b.x, ty - b.y) })).sort((a, b) => a.d - b.d || a.i - b.i).map(o => o.i);
  }
  function closestBase(g, tx, ty) { const o = closestOrder(g, tx, ty); return o.length ? o[0] : -1; }
  /** which: 0/1/2 = that base, -1 (or null) = best base, -2 = closest available base (CLOSEST SILO launch mode) */
  function fire(g, which) {
    if (g.phase !== 'play') return false;
    const tx = g.cx, ty = Math.max(g.cy, CROSS.y0);
    const i = which === -2 ? closestBase(g, tx, ty) : which == null || which < 0 ? bestBase(g, tx, ty) : which;
    const b = g.bases[i];
    if (!b || !b.alive) { ev(g, { e: 'dry', i }); return false; }
    if (b.ammo <= 0) { ev(g, { e: 'dry', i }); return false; }
    if (ty < b.y + 3) return false;
    b.ammo--; b.fired++; g.stats.fired++;
    const x0 = b.x, y0 = b.y + 2.2, L = Math.hypot(tx - x0, ty - y0) || 1, s = ABM_SPD[i];
    const a = { id: g.id++, base: i, x0, y0, x: x0, y: y0, tx, ty, vx: (tx - x0) / L * s, vy: (ty - y0) / L * s, left: L };
    g.abms.push(a); ev(g, { e: 'launch', base: i, id: a.id, x: x0, y: y0, tx, ty, ammo: b.ammo });
    if (b.ammo === 3) ev(g, { e: 'low', i }); if (b.ammo === 0) ev(g, { e: 'out', i });
    return true;
  }
  /** the super weapon: a wide electromagnetic pulse at the crosshair (limited charges) */
  function emp(g) {
    if (g.phase !== 'play' || g.emp <= 0) return false;
    g.emp--; addBlast(g, g.cx, Math.max(g.cy, 30), 'emp', newChain(g, true)); ev(g, { e: 'emp', x: g.cx, y: Math.max(g.cy, 30), left: g.emp });
    return true;
  }
  /** opponent's counterattack lands in our sky */
  function addAttack(g, n) { g.inAtk = Math.min(14, g.inAtk + (n | 0)); }

  function addScore(g, pts) {
    g.score += pts;
    while (g.score >= g.nextBonus) { g.nextBonus += BONUS_EVERY; g.reserve++; ev(g, { e: 'bonuscity', reserve: g.reserve }); }
  }
  function killFoe(g, f, blast) {
    f.dead = true; g.stats.kills++;
    const ch = blast && g.chains[blast.chain];
    let pts = 0;
    let mult = 1;
    if (ch) { ch.n++; mult = chainMult(ch.n); pts = (PTS[f.kind] || 25) * g.P.mult * mult; addScore(g, pts);
      if (ch.n >= 2) ev(g, { e: 'chainpop', n: ch.n, mult, x: f.x, y: f.y });
      if (ch.n > g.stats.bestChain) g.stats.bestChain = ch.n;
      if (!ch.noAtk && ch.n >= 2 && ch.n % 2 === 0) { g.outAtk++; ch.sent++; ev(g, { e: 'chain', n: ch.n, x: f.x, y: f.y }); } }
    ev(g, { e: 'kill', id: f.id, kind: f.kind, x: f.x, y: f.y, pts, mult });
    // the destroyed enemy detonates in a (slightly smaller) secondary blast that can catch others
    const gen = (blast && blast.gen || 0) + 1;
    if (gen <= CHAIN_GEN_MAX) addBlast(g, f.x, f.y, f.kind === 'bomber' || f.kind === 'sat' ? 'air' : 'foe', blast ? blast.chain : 0, { gen });
  }
  function impact(g, f) {
    f.dead = true;
    addBlast(g, f.x, Math.max(0.5, f.y), 'ground', 0, { impact: true });
    for (const c of g.cities) if (c.alive && Math.abs(c.x - f.x) < 6.2) { c.alive = false; c.lostAt = g.t; g.stats.lostCities++; ev(g, { e: 'city', i: c.i, x: c.x, left: aliveCities(g) }); }
    for (const b of g.bases) if (b.alive && Math.abs(b.x - f.x) < 6.2) { b.alive = false; b.ammo = 0; ev(g, { e: 'base', i: b.i, x: b.x }); }
    ev(g, { e: 'impact', id: f.id, x: f.x, y: f.y, kind: f.kind });
  }

  function stepFoe(g, f) {
    if (f.kind === 'smart') {
      // smart bombs sense nearby blasts and slide away from them, then steer back on target
      let ax = 0, ay = 0;
      for (const b of g.blasts) { if (b.kind === 'emp') continue; const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy) || 0.01, zone = b.r + 9;
        if (d < zone) { const k = (zone - d) / zone; ax += dx / d * k * 95; ay += Math.max(0, dy / d) * k * 50; f.dodge = 0.4; } }
      const tx = f.tx - f.x, ty = f.ty - f.y, L = Math.hypot(tx, ty) || 1;
      const steer = f.dodge > 0 ? 1.5 : 4; f.dodge = Math.max(0, f.dodge - DT);
      f.vx += (tx / L * f.spd - f.vx) * steer * DT + ax * DT; f.vy += (ty / L * f.spd - f.vy) * steer * DT + ay * DT;
      const v = Math.hypot(f.vx, f.vy), vm = f.spd * 1.9; if (v > vm) { f.vx *= vm / v; f.vy *= vm / v; }
      if (f.vy > -f.spd * 0.15 && f.y > 30) f.vy = Math.min(f.vy, f.dodge > 0 ? f.spd * 0.3 : -f.spd * 0.15);
    }
    f.x += f.vx * DT; f.y += f.vy * DT;
    if (f.x < -4 || f.x > W + 4) f.x = Math.max(-4, Math.min(W + 4, f.x));
    if (f.splitY && f.y <= f.splitY) {
      // MIRV: the bus splits into several warheads aimed at different targets
      f.dead = true; f.split = true; ev(g, { e: 'split', id: f.id, x: f.x, y: f.y, n: f.nSplit });
      for (let i = 0; i < f.nSplit; i++) spawnFoe(g, 'mirv', f.x, f.y, pickTarget(g, f.picks[i]), f.spd * 1.04, { parent: f.id });
      return;
    }
    if (f.y <= f.ty + 0.05 || (f.vy >= 0 && f.y < 4)) impact(g, f);
  }

  function stepFlyer(g, fl) {
    fl.x += fl.vx * DT;
    for (let j = fl.drops.length - 1; j >= 0; j--) {
      const dx = fl.drops[j]; if ((fl.vx > 0 && fl.x >= dx) || (fl.vx < 0 && fl.x <= dx)) {
        spawnFoe(g, 'bomb', fl.x, fl.y - 1.5, pickTarget(g, fl.picks[j]), fl.spd, { from: fl.kind }); fl.drops.splice(j, 1); fl.picks.splice(j, 1);
        ev(g, { e: 'drop', x: fl.x, y: fl.y });
      }
    }
    if (fl.x < -10 || fl.x > W + 10) { fl.dead = true; fl.gone = true; }
  }

  function step(g, inp) {
    g.events.length = 0; g.t += DT; g.pt += DT;
    if (inp) {
      if (inp.cx != null) { g.cx = Math.max(CROSS.x0, Math.min(CROSS.x1, inp.cx)); g.cy = Math.max(CROSS.y0, Math.min(CROSS.y1, inp.cy)); }
      if (inp.fire) for (const w of inp.fire) fire(g, w);
      if (inp.emp) emp(g);
    }
    // interceptors
    for (const a of g.abms) {
      const s = Math.hypot(a.vx, a.vy) * DT; a.left -= s;
      if (a.left <= 0) { a.dead = true; addBlast(g, a.tx, a.ty, 'abm', newChain(g)); }
      else { a.x += a.vx * DT; a.y += a.vy * DT; }
    }
    // blasts grow, hold, shrink
    for (const b of g.blasts) {
      b.t += DT; const T = b.t;
      if (T < b.tg) { const u = T / b.tg; b.r = b.rMax * (1 - (1 - u) * (1 - u)); }
      else if (T < b.tg + b.th) b.r = b.rMax;
      else if (T < b.tg + b.th + b.ts) { const u = (T - b.tg - b.th) / b.ts; b.r = b.rMax * (1 - u * u); }
      else { b.r = 0; b.dead = true; }
    }
    // spawn
    if (g.phase === 'play') {
      const S = g.sched;
      if (!g.cleared) while (S.i < S.list.length && S.list[S.i].t <= g.pt) spawnFrom(g, S.list[S.i++]);
      if (g.inAtk > 0) { g.atkT -= DT; if (g.atkT <= 0) { g.inAtk--; g.atkT = 0.7; const R = g.rnd2; spawnFoe(g, 'buddy', 6 + R() * (W - 12), H + 2, pickTarget(g, R()), g.P.spd * (1.0 + R() * 0.2)); } }
    }
    for (const f of g.foes) if (!f.dead) stepFoe(g, f);
    for (const fl of g.flyers) if (!fl.dead) stepFlyer(g, fl);
    // blast hits
    for (const b of g.blasts) {
      if (b.dead || b.r <= 0) continue;
      for (const f of g.foes) { if (f.dead) continue; if (Math.hypot(f.x - b.x, f.y - b.y) < b.r + 0.35) killFoe(g, f, b.chain ? b : null); }
      for (const fl of g.flyers) { if (fl.dead) continue; if (Math.hypot(fl.x - b.x, (fl.y - b.y) * 1.3) < b.r + 1.8) { killFoe(g, fl, b.chain ? b : null); } }
    }
    g.foes = g.foes.filter(f => !f.dead); g.flyers = g.flyers.filter(f => !f.dead); g.abms = g.abms.filter(a => !a.dead); g.blasts = g.blasts.filter(b => !b.dead);
    // phases
    if (g.phase === 'intro') { if (g.pt >= 2.8) { g.phase = 'play'; g.pt = 0; g.cleared = false; ev(g, { e: 'go' }); } }
    else if (g.phase === 'play') {
      if (!g.cleared && aliveCities(g) === 0) { g.cleared = true; ev(g, { e: 'allgone' }); }
      const done = (g.cleared || g.sched.i >= g.sched.list.length) && !g.foes.length && !g.flyers.length && !g.abms.length && !g.blasts.length && (g.cleared || g.inAtk === 0);
      if (done) { g.idle = (g.idle || 0) + DT; if (g.idle > 1.0) startTally(g); } else g.idle = 0;
    }
    else if (g.phase === 'tally') stepTally(g);
    else if (g.phase === 'end') { if (g.pt > 8.5) { g.phase = 'over'; g.over = true; ev(g, { e: 'over' }); } }
    return g.events;
  }

  function startTally(g) {
    g.phase = 'tally'; g.pt = 0; g.idle = 0;
    const ammo = g.bases.reduce((s, b) => s + (b.alive ? b.ammo : 0), 0);
    g.tally = { ammo, ammoN: 0, cities: aliveCities(g), cityN: 0, stage: 'ammo', t: 0.6, ammoPts: 0, cityPts: 0, mult: g.P.mult, wave: g.wave };
    ev(g, { e: 'tally', ammo, cities: g.tally.cities, mult: g.P.mult });
  }
  function stepTally(g) {
    const T = g.tally; T.t -= DT; if (T.t > 0) return;
    if (T.stage === 'ammo') {
      if (T.ammoN < T.ammo) {
        T.ammoN++; const p = 5 * T.mult; T.ammoPts += p; addScore(g, p);
        // take the interceptor out of a base stock (left to right) so you watch the racks empty
        const b = g.bases.find(b => b.alive && b.ammo > 0); if (b) b.ammo--;
        ev(g, { e: 'tick', what: 'ammo', n: T.ammoN, pts: T.ammoPts, base: b ? b.i : -1 }); T.t = 0.055;
      } else { T.stage = 'cities'; T.t = 0.5; }
    } else if (T.stage === 'cities') {
      if (T.cityN < T.cities) { T.cityN++; const p = 100 * T.mult; T.cityPts += p; addScore(g, p); const c = g.cities.filter(c => c.alive)[T.cityN - 1]; ev(g, { e: 'tick', what: 'city', n: T.cityN, pts: T.cityPts, i: c ? c.i : -1 }); T.t = 0.36; }
      else { T.stage = 'hold'; T.t = 1.5; }
    } else if (T.stage === 'hold') {
      if (g.wave % 3 === 0 && g.emp < 3) { g.emp++; ev(g, { e: 'empcharge', left: g.emp }); }
      g.survived = g.wave - g.startWave + 1;
      if (aliveCities(g) === 0 && g.reserve === 0) { g.phase = 'end'; g.pt = 0; g.ended = true; g.survived = g.wave - g.startWave; ev(g, { e: 'end' }); return; }
      ev(g, { e: 'waveclear', n: g.wave });
      g.wave++; startIntro(g, false);
    }
  }

  /** for the opponent strip / tests */
  function status(g) { return { c: aliveCities(g), r: g.reserve, s: g.score, w: g.wave, e: g.emp, a: !g.ended }; }

  const SSSim = { DT, W, H, BASES, CITY_X, CITY_Y, AMMO, ABM_SPD, PTS, BLAST, CROSS, BONUS_EVERY, rng, waveParams, buildSchedule, createGame, step, fire, emp, addAttack, chainMult, CHAIN_GEN_MAX, bestBase, closestBase, closestOrder, aliveCities, status, addScore };
  if (typeof module !== 'undefined' && module.exports) module.exports = SSSim; else root.SSSim = SSSim;
})(typeof window !== 'undefined' ? window : globalThis);
