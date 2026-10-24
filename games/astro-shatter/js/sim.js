/* ASTRO SHATTER — sim.js
   The rules, at a fixed 60 Hz tick on a screen-wrapping field (about 900 x 675 units; the aspect follows the
   screen the game starts on, the area stays the same). Deterministic from a seed (mulberry32), so the
   two online players get the same rock field. The renderer never changes anything in here.

   Faithful to the 1979 coin-op where it counts:
     ship        rotate / thrust / coast with drag, hyperspace (a risky jump), wrap-around
     shots       at most 4 on screen, they wrap and expire
     rocks       large -> 2 medium -> 2 small; 20 / 50 / 100 points
     saucers     big (200) fires at random; small (1000) aims, and gets more accurate as your score climbs
     heartbeat   two alternating tones that speed up through each wave
     extra ship  every 10,000 points
     waves       4, 6, 8, 10, then 11 large rocks, a little faster each wave */
const Sim = (() => {
  'use strict';
  const TAU = Math.PI * 2;
  const C = {
    ROT: 0.0736,          // rad per tick  (4.2 deg, ~253 deg/s)
    ACC: 0.12,            // thrust, units / tick^2
    DRAG: 0.9925,         // velocity kept per tick (coasting)
    MAXV: 7.0,            // ship top speed
    SHIP_R: 11,           // collision radius
    SHOT_V: 9.5, SHOT_LIFE: 52, MAX_SHOTS: 4, AUTO_GAP: 9,
    ROCK_R: [0, 11, 22, 44], ROCK_PTS: [0, 100, 50, 20], MAX_ROCKS: 26,
    SAUCER_R: { big: 20, small: 11 }, SAUCER_PTS: { big: 200, small: 1000 }, SAUCER_V: { big: 2.0, small: 2.7 },
    SSHOT_V: 6.2, SSHOT_LIFE: 72, SSHOT_MAX: 2, SFIRE: { big: 44, small: 34 },
    HYPER_T: 36, HYPER_COOL: 24,
    BEAT0: 60, BEAT_MIN: 15, BEAT_K: 0.97,
    EXTRA: 10000, LIVES: 3, AREA: 900 * 675,
    RESPAWN_T: 110, SPAWN_CLEAR: 120, SHIELD_T: 120,
  };
  let G = null, ev = [];
  const emit = e => ev.push(e);
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapD = (d, L) => { d = (d + L / 2) % L; if (d < 0) d += L; return d - L / 2; };
  const wrapP = (o) => { const W = G.W, H = G.H; if (o.x < 0) o.x += W; else if (o.x >= W) o.x -= W; if (o.y < 0) o.y += H; else if (o.y >= H) o.y -= H; };
  const dist2 = (a, b) => { const dx = wrapD(a.x - b.x, G.W), dy = wrapD(a.y - b.y, G.H); return dx * dx + dy * dy; };
  const hit = (a, ar, b, br) => dist2(a, b) < (ar + br) * (ar + br);
  /** field size: same area, aspect clamped to 3:4 .. 16:9 */
  function fieldFor(aspect) { const a = clamp(aspect || 4 / 3, 0.6, 2.25); const H = Math.round(Math.sqrt(C.AREA / a)); return { W: Math.round(H * a), H }; }
  const waveRocks = w => Math.min(11, 2 + 2 * w);
  const waveSpeed = w => Math.min(1.35, 1 + 0.045 * (w - 1));

  function newGame(o) {
    o = o || {};
    const f = o.W ? { W: o.W, H: o.H } : fieldFor(o.aspect);
    const seed = (o.seed != null ? o.seed : (Math.random() * 1e9)) >>> 0;
    G = {
      W: f.W, H: f.H, seed, rnd: rng(seed), fx: rng(seed ^ 0x9e3779b9), t: 0, wave: clamp(o.wave || 1, 1, 99), startWave: clamp(o.wave || 1, 1, 99),
      score: 0, lives: o.attract ? 0 : C.LIVES, extraAt: o.extraAt === undefined ? C.EXTRA : o.extraAt, nextExtra: o.extraAt === undefined ? C.EXTRA : o.extraAt,
      phase: o.attract ? 'attract' : 'ready', phaseT: 100, attract: !!o.attract,
      ship: { x: f.W / 2, y: f.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: !o.attract, thrust: false, hyper: 0, hyperCool: 0, shield: 0, respawnT: 0, autoT: 0, bank: 0 },
      shots: [], rocks: [], saucer: null, sshots: [], saucerT: 600, clearT: 0, overT: 0,
      beat: { T: 0, gap: C.BEAT0, i: 0, n: 0 }, largeKills: 0, sentAtk: 0, gotAtk: 0, pendingSaucer: 0, fired: 0, hypers: 0, deaths: 0, nid: 1,
      stats: { rocks: [0, 0, 0, 0], saucers: { big: 0, small: 0 } },
    };
    spawnWave(G.wave);
    return G;
  }
  function rockAt(size, x, y, vx, vy) {
    const R = G.fx;
    const ax = R() * 2 - 1, ay = R() * 2 - 1, az = R() * 2 - 1, l = Math.hypot(ax, ay, az) || 1;
    const r = { id: G.nid++, s: size, r: C.ROCK_R[size], x, y, vx, vy, shape: (R() * 8) | 0, ax: ax / l, ay: ay / l, az: az / l, spin: (0.006 + R() * 0.02) * (size === 1 ? 2.2 : size === 2 ? 1.5 : 1) * (R() < 0.5 ? -1 : 1), rot: R() * TAU, hue: R() };
    G.rocks.push(r); return r;
  }
  function spawnWave(w) {
    const n = waveRocks(w), sp = waveSpeed(w), R = G.rnd;
    for (let i = 0; i < n; i++) {
      // large rocks start on the edges, never near the centre where the ship appears
      let x, y; if (R() < 0.5) { x = R() * G.W; y = R() < 0.5 ? 0 : G.H - 1; } else { x = R() < 0.5 ? 0 : G.W - 1; y = R() * G.H; }
      const a = R() * TAU, v = (0.55 + R() * 0.75) * sp;
      rockAt(3, x, y, Math.cos(a) * v, Math.sin(a) * v);
    }
    G.beat.gap = C.BEAT0; G.beat.T = 30; G.beat.n = 0;
    G.saucerT = Math.round(saucerGap() * 1.2);
  }
  const saucerGap = () => Math.round(Math.max(240, 760 - (G.wave - 1) * 50) * (0.8 + G.rnd() * 0.4));

  function split(r, byPlayer, vx0, vy0) {
    G.rocks.splice(G.rocks.indexOf(r), 1);
    if (byPlayer) { addScore(C.ROCK_PTS[r.s]); G.stats.rocks[r.s]++; if (r.s === 3) largeKill(); }
    emit({ t: 'boom', s: r.s, x: r.x, y: r.y, r: r.r, vx: r.vx, vy: r.vy, shape: r.shape, rot: r.rot, ax: r.ax, ay: r.ay, az: r.az, by: byPlayer ? 'p' : 'o' });
    if (r.s > 1) {
      const R = G.rnd, n = G.rocks.length >= C.MAX_ROCKS - 1 ? (G.rocks.length >= C.MAX_ROCKS ? 0 : 1) : 2;
      const sp = waveSpeed(G.wave) * (r.s === 3 ? 1 : 1.25);
      const base = Math.atan2(r.vy + (vy0 || 0) * 0.08, r.vx + (vx0 || 0) * 0.08);
      for (let k = 0; k < n; k++) {
        const a = base + (k ? 1 : -1) * (0.35 + R() * 0.9), v = (Math.hypot(r.vx, r.vy) * 0.5 + 0.9 + R() * 1.1) * sp;
        const c = rockAt(r.s - 1, r.x + Math.cos(a) * r.r * 0.3, r.y + Math.sin(a) * r.r * 0.3, Math.cos(a) * v, Math.sin(a) * v);
        c.parent = r.id;
      }
    }
  }
  function largeKill() {
    G.largeKills++;
    // online raids: every 2nd large rock you break sends a large rock to your rival, every 8th sends a small saucer
    if (G.largeKills % 8 === 0) { G.sentAtk++; emit({ t: 'attack', k: 'saucer' }); }
    else if (G.largeKills % 2 === 0) { G.sentAtk++; emit({ t: 'attack', k: 'rock' }); }
  }
  function addScore(p) {
    if (G.attract || G.phase === 'over') return;
    G.score += p;
    while (G.extraAt && G.score >= G.nextExtra) { G.lives++; G.nextExtra += G.extraAt; emit({ t: 'extra' }); }
  }

  /* ---------------- saucers ---------------- */
  function smallChance() { const s = G.score; if (s < 3000) return 0; if (s >= 40000) return 1; return 0.3 + 0.6 * (s / 40000); }
  function spawnSaucer(kind) {
    const R = G.rnd; if (!kind) kind = R() < smallChance() ? 'small' : 'big';
    const dir = R() < 0.5 ? 1 : -1, y = G.H * (0.15 + R() * 0.7);
    G.saucer = { kind, r: C.SAUCER_R[kind], x: dir > 0 ? 0 : G.W - 0.01, y, vx: dir * C.SAUCER_V[kind] * (kind === 'small' ? 1 : 1) * Math.min(1.3, waveSpeed(G.wave)), vy: 0, dir, trav: 0, turnT: 60 + (R() * 60 | 0), fireT: 30, spin: 0 };
    emit({ t: 'saucer', on: true, kind });
  }
  /** error of the small saucer's aim in radians: sloppy at 0 points, dead-on from 35,000 */
  const aimError = score => 0.02 + 0.5 * (1 - clamp(score / 35000, 0, 1));
  function saucerFire() {
    const s = G.saucer, R = G.rnd, ship = G.ship; if (G.sshots.length >= C.SSHOT_MAX) return;
    let a;
    if (s.kind === 'small' && ship.alive && !ship.hyper) { const dx = wrapD(ship.x - s.x, G.W), dy = wrapD(ship.y - s.y, G.H); a = Math.atan2(dy, dx) + (R() * 2 - 1) * aimError(G.score); }
    else a = R() * TAU;
    G.sshots.push({ x: s.x + Math.cos(a) * s.r, y: s.y + Math.sin(a) * s.r, vx: Math.cos(a) * C.SSHOT_V + s.vx * 0.3, vy: Math.sin(a) * C.SSHOT_V + s.vy * 0.3, life: C.SSHOT_LIFE, a });
    emit({ t: 'sfire', kind: s.kind, x: s.x, y: s.y, a });
  }
  function killSaucer(byPlayer) {
    const s = G.saucer; if (!s) return; G.saucer = null;
    if (byPlayer) { addScore(C.SAUCER_PTS[s.kind]); G.stats.saucers[s.kind]++; }
    emit({ t: 'saucerBoom', kind: s.kind, x: s.x, y: s.y, p: byPlayer ? C.SAUCER_PTS[s.kind] : 0 });
    emit({ t: 'saucer', on: false });
    G.saucerT = saucerGap();
  }
  function updSaucer() {
    const s = G.saucer;
    if (!s) {
      if (G.pendingSaucer > 0 && !G.attract) { G.pendingSaucer--; spawnSaucer('small'); return; }
      if (G.attract || !G.ship.alive || G.phase !== 'play' || G.rocks.length === 0) return;
      if (--G.saucerT <= 0) spawnSaucer();
      return;
    }
    s.x += s.vx; s.y += s.vy; s.trav += Math.abs(s.vx); s.spin += 0.05;
    if (s.y < 0) s.y += G.H; else if (s.y >= G.H) s.y -= G.H;
    if (s.trav >= G.W) { G.saucer = null; emit({ t: 'saucer', on: false }); G.saucerT = saucerGap(); return; }
    if (s.x < 0) s.x += G.W; else if (s.x >= G.W) s.x -= G.W;
    if (--s.turnT <= 0) { const R = G.rnd; s.turnT = 50 + (R() * 70 | 0); const k = (R() * 3 | 0) - 1; s.vy = k * Math.abs(s.vx) * 0.75; }
    if (--s.fireT <= 0) { s.fireT = C.SFIRE[s.kind]; saucerFire(); }
  }

  /* ---------------- ship ---------------- */
  function centreClear() { const c = { x: G.W / 2, y: G.H / 2 }; for (const r of G.rocks) if (hit(c, C.SPAWN_CLEAR, r, r.r)) return false; if (G.saucer && hit(c, C.SPAWN_CLEAR, G.saucer, G.saucer.r)) return false; for (const s of G.sshots) if (hit(c, 60, s, 0)) return false; return true; }
  function killShip(cause) {
    const p = G.ship; if (!p.alive) return;
    p.alive = false; p.thrust = false; G.deaths++; G.lives--;
    emit({ t: 'die', x: p.x, y: p.y, vx: p.vx, vy: p.vy, a: p.a, cause });
    emit({ t: 'thrust', on: false });
    p.respawnT = C.RESPAWN_T;
    if (G.lives <= 0) { G.overT = 150; }
  }
  function updShip(inp) {
    const p = G.ship;
    if (!p.alive) {
      if (G.lives <= 0) { if (G.phase !== 'over' && --G.overT <= 0) { G.phase = 'over'; emit({ t: 'over' }); } return; }
      if (p.respawnT > 0) { p.respawnT--; return; }
      if (!centreClear()) return;
      Object.assign(p, { x: G.W / 2, y: G.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, alive: true, hyper: 0, hyperCool: 0, shield: C.SHIELD_T, autoT: 0 });
      G.beat.T = 20; emit({ t: 'spawn', x: p.x, y: p.y });
      return;
    }
    if (p.hyper > 0) {
      if (--p.hyper === 0) {
        // re-enter at a random spot. The jump can fail: the more rocks, the bigger the risk.
        p.x = G.rnd() * G.W; p.y = G.rnd() * G.H; p.vx = p.vy = 0;
        emit({ t: 'hyperOut', x: p.x, y: p.y });
        if (G.rnd() < hyperRisk()) { killShip('hyper'); return; }
      }
      return;
    }
    if (p.hyperCool > 0) p.hyperCool--;
    if (p.shield > 0) p.shield--;
    let turn = 0;
    if (inp.aim != null) { const d = wrapD(inp.aim - p.a, TAU); turn = Math.abs(d) < C.ROT ? d / C.ROT : Math.sign(d); }
    else turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    p.a += turn * C.ROT; if (p.a > Math.PI) p.a -= TAU; else if (p.a < -Math.PI) p.a += TAU;
    p.bank += (turn * 0.5 - p.bank) * 0.15;
    const was = p.thrust; p.thrust = !!inp.thrust;
    if (p.thrust !== was) emit({ t: 'thrust', on: p.thrust });
    if (p.thrust) { p.vx += Math.cos(p.a) * C.ACC; p.vy += Math.sin(p.a) * C.ACC; }
    p.vx *= C.DRAG; p.vy *= C.DRAG;
    const v = Math.hypot(p.vx, p.vy); if (v > C.MAXV) { p.vx *= C.MAXV / v; p.vy *= C.MAXV / v; }
    p.x += p.vx; p.y += p.vy; wrapP(p);
    // fire: one shot per press (keyboard / gamepad); a held touch button auto-fires at a steady rate
    let fire = !!inp.fire;
    if (inp.autofire) { if (p.autoT > 0) p.autoT--; if (p.autoT === 0) { fire = true; } }
    if (fire && G.shots.length < C.MAX_SHOTS) {
      const nx = Math.cos(p.a), ny = Math.sin(p.a);
      G.shots.push({ x: p.x + nx * 15, y: p.y + ny * 15, vx: nx * C.SHOT_V + p.vx, vy: ny * C.SHOT_V + p.vy, life: C.SHOT_LIFE, id: G.nid++ });
      G.fired++; p.autoT = C.AUTO_GAP; emit({ t: 'fire', x: p.x + nx * 15, y: p.y + ny * 15, a: p.a });
    } else if (!inp.autofire) p.autoT = 0;
    if (inp.hyper && p.hyperCool === 0) {
      p.hyper = C.HYPER_T; p.hyperCool = C.HYPER_COOL; G.hypers++; p.shield = 0; if (p.thrust) { p.thrust = false; emit({ t: 'thrust', on: false }); }
      emit({ t: 'hyperIn', x: p.x, y: p.y, a: p.a });
    }
  }
  const hyperRisk = () => clamp(0.03 + G.rocks.length * 0.011, 0.03, 0.3);

  /* ---------------- tick ---------------- */
  function moveShot(s) { s.x += s.vx; s.y += s.vy; wrapP(s); s.life--; }
  function tick(inp) {
    if (!G) return; inp = inp || {};
    G.t++;
    if (G.phase === 'ready') { if (--G.phaseT <= 0) { G.phase = 'play'; emit({ t: 'go' }); } }
    const live = G.phase === 'play' || G.phase === 'over';
    if (G.phase === 'play') updShip(inp);
    // rocks drift and tumble
    for (const r of G.rocks) { r.x += r.vx; r.y += r.vy; wrapP(r); r.rot += r.spin; }
    if (live) updSaucer();
    // player shots (two sub-steps so fast bolts never tunnel through small rocks)
    for (let i = G.shots.length - 1; i >= 0; i--) {
      const s = G.shots[i]; let gone = false;
      for (let k = 0; k < 2 && !gone; k++) {
        s.x += s.vx / 2; s.y += s.vy / 2; wrapP(s);
        for (const r of G.rocks) if (hit(s, 2, r, r.r)) { split(r, true, s.vx, s.vy); gone = true; break; }
        if (!gone && G.saucer && hit(s, 2, G.saucer, G.saucer.r)) { killSaucer(true); gone = true; }
      }
      if (gone) { emit({ t: 'shotHit', x: s.x, y: s.y }); G.shots.splice(i, 1); continue; }
      if (--s.life <= 0) G.shots.splice(i, 1);
    }
    // saucer shots
    const p = G.ship, pOk = p.alive && !p.hyper;
    for (let i = G.sshots.length - 1; i >= 0; i--) {
      const s = G.sshots[i]; moveShot(s); let gone = s.life <= 0;
      if (!gone) for (const r of G.rocks) if (hit(s, 2, r, r.r)) { split(r, false); gone = true; break; }
      if (!gone && pOk && hit(s, 2, p, C.SHIP_R)) { gone = true; if (p.shield > 0) emit({ t: 'shieldHit', x: s.x, y: s.y }); else killShip('saucer'); }
      if (gone) G.sshots.splice(i, 1);
    }
    // ship vs rocks / saucer
    if (pOk && G.phase === 'play') {
      for (const r of G.rocks) if (hit(p, C.SHIP_R, r, r.r * 0.92)) {
        if (p.shield > 0) { // the spawn shield shoves rocks away instead
          const dx = wrapD(r.x - p.x, G.W), dy = wrapD(r.y - p.y, G.H), l = Math.hypot(dx, dy) || 1; r.vx += dx / l * 0.25; r.vy += dy / l * 0.25; continue;
        }
        split(r, true, p.vx, p.vy); killShip('rock'); break;
      }
      if (p.alive && G.saucer && hit(p, C.SHIP_R, G.saucer, G.saucer.r)) { if (p.shield <= 0) { killSaucer(true); killShip('saucer'); } }
    }
    // saucer vs rocks
    if (G.saucer) for (const r of G.rocks) if (hit(G.saucer, G.saucer.r, r, r.r * 0.9)) { split(r, false); killSaucer(false); break; }
    // heartbeat: two tones, getting faster through the wave
    if (G.phase === 'play' && p.alive && G.rocks.length) {
      if (--G.beat.T <= 0) { emit({ t: 'beat', i: G.beat.i, gap: G.beat.gap }); G.beat.i ^= 1; G.beat.n++; G.beat.T = Math.round(G.beat.gap); G.beat.gap = Math.max(C.BEAT_MIN, G.beat.gap * C.BEAT_K); }
    }
    // wave clear
    if (G.phase === 'play' && G.rocks.length === 0) {
      if (G.clearT === 0) { G.clearT = 130; emit({ t: 'clear', w: G.wave }); }
      else if (--G.clearT === 0) { G.wave++; spawnWave(G.wave); emit({ t: 'wave', w: G.wave }); }
    }
    if (G.phase === 'attract' && G.rocks.length === 0) spawnWave(G.wave);
  }
  /** online raid arrives: a large rock from the edge, or a small saucer */
  function incoming(kind) {
    if (!G || G.phase === 'over' || G.attract) return;
    G.gotAtk++;
    if (kind === 'saucer') { if (G.saucer) G.pendingSaucer++; else spawnSaucer('small'); }
    else {
      const R = G.rnd, p = G.ship; let x, y;
      if (R() < 0.5) { x = R() * G.W; y = 0; } else { x = 0; y = R() * G.H; }
      if (p.alive && dist2({ x, y }, p) < 200 * 200) { x = (x + G.W / 2) % G.W; y = (y + G.H / 2) % G.H; }
      const a = Math.atan2(G.H / 2 - y, G.W / 2 - x) + (R() - 0.5), v = 1.1 + R() * 0.6;
      rockAt(3, x, y, Math.cos(a) * v, Math.sin(a) * v).raid = true;
    }
    emit({ t: 'incoming', k: kind });
  }
  function drain() { const e = ev; ev = []; return e; }
  return { C, get G() { return G; }, newGame, tick, drain, incoming, spawnSaucer, aimError, hyperRisk, smallChance, waveRocks, waveSpeed, fieldFor, wrapD, rockAt, killShip, split };
})();
