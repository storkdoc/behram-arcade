/* CUBERTRON — simulation.
   A pyramid of cubes in (q, r), q >= 0, r >= 0, q + r < rows.
   Four hops: q+1, q-1, r+1, r-1. Those are the diagonals on screen.
   No rendering and no DOM, so the rules can run under Node. */
const STEP = 1.28;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const STAGES = [
  { name: 'AMBER RISE', rows: 4, hits: 1, sky: 0, grace: 5.2, every: 5.4, cap: 2, hop: 1.85, chase: 0.28, mix: ['hopper'], discs: 2 },
  { name: 'TIDEGLASS', rows: 5, hits: 1, sky: 1, grace: 3.4, every: 4.4, cap: 3, hop: 1.55, chase: 0.48, mix: ['hopper', 'hopper', 'roller'], discs: 1 },
  { name: 'CINDER VAULT', rows: 5, hits: 1, sky: 2, grace: 2.8, every: 3.8, cap: 4, hop: 1.4, chase: 0.58, mix: ['hopper', 'roller', 'bomber'], discs: 2 },
  { name: 'TWINPLATE', rows: 6, hits: 2, sky: 3, grace: 2.6, every: 3.6, cap: 4, hop: 1.35, chase: 0.62, mix: ['hopper', 'roller', 'bomber'], discs: 2 },
  { name: 'AEGIS PRIME', rows: 5, hits: 1, sky: 4, grace: 2.2, every: 4.2, cap: 2, hop: 1.45, chase: 0.5, mix: ['hopper'], discs: 2, boss: { name: 'AEGIS PRIME', hp: 14 } },
  { name: 'FLIPSTORM', rows: 6, hits: 1, sky: 5, grace: 2.2, every: 3.3, cap: 5, hop: 1.28, chase: 0.66, mix: ['hopper', 'flipper', 'roller'], discs: 2, toggle: 0.42 },
  { name: 'CRUMB RIDGE', rows: 6, hits: 1, sky: 6, grace: 2.2, every: 3.2, cap: 5, hop: 1.22, chase: 0.64, mix: ['hopper', 'bomber', 'roller'], discs: 2, crumble: 0.34 },
  { name: 'SHUTTLE ISLES', rows: 6, hits: 1, sky: 7, grace: 2.0, every: 3.0, cap: 5, hop: 1.18, chase: 0.7, mix: ['hopper', 'roller', 'bomber', 'flipper'], discs: 2, movers: 3 },
  { name: 'MILLWRIGHT', rows: 7, hits: 2, sky: 2, grace: 1.8, every: 3.4, cap: 3, hop: 1.2, chase: 0.6, mix: ['hopper', 'flipper'], discs: 2, boss: { name: 'MILLWRIGHT', hp: 22 }, toggle: 0.18 }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const SCORE = { hopper: 100, roller: 150, bomber: 200, flipper: 250 };

export function createGame(opts = {}) {
  const g = {
    rng: mulberry32((opts.seed == null ? 1 : opts.seed) >>> 0),
    stage: opts.stage || 0,
    demo: !!opts.demo,
    hold: !!opts.hold,
    score: 0,
    combo: 0,
    comboT: 0,
    nextLife: 10000,
    phase: 'play',
    time: 0,
    clearT: 0,
    spawnT: 0,
    pickupT: 9,
    shake: 0,
    shotsFired: 0,
    hops: 0,
    pops: [],
    fx: [],
    foes: [],
    shots: [],
    pickups: [],
    discs: [],
    cubes: [],
    boss: null,
    nextId: 1,
    rows: 4,
    def: STAGES[0],
    loop: 0,
    speed: 1,
    banner: '',
    bannerT: 0,
    sky: 0,
    player: null
  };

  g.cellWorld = (q, r) => {
    const x = (q - r) * STEP;
    const z = (q + r) * STEP * 0.56;
    const qq = q < 0 ? 0 : q;
    const rr = r < 0 ? 0 : r;
    const y = (g.rows - 1 - qq - rr) * 0.72;
    return { x, y, z };
  };

  g.worldOf = (c) => {
    if (!c) return { x: 0, y: 0, z: 0 };
    if (c.kind === 'mover') {
      const A = g.cellWorld(c.from.q, c.from.r);
      const B = g.cellWorld(c.to.q, c.to.r);
      const u = c.u;
      const s = u * u * (3 - 2 * u);
      return { x: A.x + (B.x - A.x) * s, y: A.y + (B.y - A.y) * s, z: A.z + (B.z - A.z) * s };
    }
    const w = g.cellWorld(c.q, c.r);
    w.y += c.yoff || 0;
    return w;
  };

  g.moverCell = (c) => (c.u < 0.5 ? { q: c.from.q, r: c.from.r } : { q: c.to.q, r: c.to.r });

  g.cubeById = (id) => g.cubes.find(c => c.id === id) || null;

  g.cubeAt = (q, r) => {
    let mover = null;
    for (const c of g.cubes) {
      if (c.gone) continue;
      if (c.kind === 'mover') {
        const cell = g.moverCell(c);
        if (cell.q === q && cell.r === r) mover = c;
      } else if (c.q === q && c.r === r) return c;
    }
    return mover;
  };

  g.hasFooting = (q, r) => {
    const c = g.cubeAt(q, r);
    if (!c || c.gone) return false;
    if (c.kind === 'mover') {
      const w = g.worldOf(c);
      const cell = g.cellWorld(q, r);
      return Math.hypot(w.x - cell.x, w.z - cell.z) < 0.78;
    }
    return true;
  };

  g.adjacent = (q, r, nq, nr) => Math.abs(q - nq) + Math.abs(r - nr) === 1;

  function key(q, r) { return q + ',' + r; }

  g.route = (sq, sr, tq, tr) => {
    if (sq === tq && sr === tr) return [];
    if (!g.hasFooting(tq, tr)) return null;
    const prev = new Map();
    const start = key(sq, sr);
    prev.set(start, null);
    const queue = [{ q: sq, r: sr }];
    while (queue.length) {
      const cur = queue.shift();
      for (const [dq, dr] of DIRS) {
        const nq = cur.q + dq, nr = cur.r + dr;
        const k = key(nq, nr);
        if (prev.has(k)) continue;
        if (!g.hasFooting(nq, nr)) continue;
        prev.set(k, cur);
        if (nq === tq && nr === tr) {
          const path = [];
          let c = { q: nq, r: nr };
          while (c && !(c.q === sq && c.r === sr)) {
            path.push({ q: c.q, r: c.r });
            c = prev.get(key(c.q, c.r));
          }
          path.reverse();
          return path;
        }
        queue.push({ q: nq, r: nr });
      }
    }
    return null;
  };

  g.centroid = () => {
    let x = 0, y = 0, z = 0, n = 0;
    for (const c of g.cubes) {
      if (c.kind === 'mover') continue;
      const w = g.cellWorld(c.q, c.r);
      x += w.x; y += w.y; z += w.z; n++;
    }
    return n ? { x: x / n, y: y / n, z: z / n } : { x: 0, y: 0, z: 0 };
  };

  function pushFx(e) {
    g.fx.push(e);
    if (g.fx.length > 48) g.fx.shift();
  }

  function popup(text, x, y, z, tint) {
    g.pops.push({ text, x, y, z, tint: tint || '#fff', life: 0.9, age: 0 });
    if (g.pops.length > 8) g.pops.shift();
  }

  g.addScore = (base) => {
    if (base <= 0 || g.demo) return;
    if (g.comboT > 0) g.combo = Math.min(9, g.combo + 1);
    else g.combo = 1;
    g.comboT = 2.5;
    const gained = base * g.combo;
    g.score += gained;
    while (g.score >= g.nextLife) {
      g.player.lives = Math.min(7, g.player.lives + 1);
      g.nextLife += 15000;
      pushFx({ k: 'life' });
      popup('1UP', g.player.x, g.player.y + 0.8, g.player.z, '#ffe56a');
    }
  };

  g.paint = (c) => {
    if (!c || c.gone) return;
    if (c.kind === 'toggle') {
      const was = c.prog;
      c.prog = c.prog ? 0 : 1;
      if (c.prog > was) g.addScore(25);
      pushFx({ k: 'paint', x: g.player.x, y: g.player.y, z: g.player.z, on: c.prog });
      return;
    }
    if (c.prog < c.need) {
      c.prog++;
      g.addScore(c.prog >= c.need ? 50 : 25);
      pushFx({ k: 'paint', x: g.player.x, y: g.player.y, z: g.player.z, on: 1 });
      if (c.kind === 'crumble' && c.prog >= c.need) c.crumb = 0.01;
    }
  };

  g.collect = (q, r) => {
    for (let i = g.pickups.length - 1; i >= 0; i--) {
      const p = g.pickups[i];
      if (p.q !== q || p.r !== r) continue;
      g.pickups.splice(i, 1);
      const pl = g.player;
      if (p.kind === 'shield') { pl.shield = 1; popup('SHIELD', pl.x, pl.y + 0.6, pl.z, '#7ef0ff'); }
      else if (p.kind === 'rapid') { pl.rapid = 8; popup('RAPID', pl.x, pl.y + 0.6, pl.z, '#ffb15a'); }
      else if (p.kind === 'slow') { pl.slow = 6.5; popup('SLOW', pl.x, pl.y + 0.6, pl.z, '#d2b0ff'); }
      else if (p.kind === 'bomb') { pl.bombs = Math.min(2, pl.bombs + 1); popup('PULSE', pl.x, pl.y + 0.6, pl.z, '#ffe56a'); }
      pushFx({ k: 'power', kind: p.kind, x: pl.x, y: pl.y, z: pl.z });
      if (!g.demo) g.addScore(20);
    }
  };

  g.respawn = () => {
    const p = g.player;
    const w = g.cellWorld(0, 0);
    p.mode = 'ground';
    p.q = 0; p.r = 0;
    p.x = w.x; p.y = w.y; p.z = w.z;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.path = [];
    p.hop = null;
    p.ride = 0;
    p.fast = 0;
    p.inv = Math.max(p.inv, 1.45);
  };

  g.hurt = () => {
    const p = g.player;
    if (!p.alive || p.inv > 0 || g.phase !== 'play' || p.mode === 'rescue') return;
    if (p.shield) {
      p.shield = 0;
      p.inv = 0.7;
      g.shake = Math.max(g.shake, 0.22);
      pushFx({ k: 'shield', x: p.x, y: p.y, z: p.z });
      popup('BLOCK', p.x, p.y + 0.7, p.z, '#9aefff');
      return;
    }
    g.combo = 0;
    g.comboT = 0;
    g.shake = Math.max(g.shake, 0.55);
    pushFx({ k: 'hurt', x: p.x, y: p.y, z: p.z });
    if (g.demo) { g.respawn(); return; }
    p.lives--;
    if (p.lives <= 0) {
      p.alive = false;
      p.mode = 'dead';
      g.phase = 'over';
      return;
    }
    g.respawn();
  };

  g.beginHop = (q, r) => {
    const p = g.player;
    if (p.mode !== 'ground' || !p.alive) return false;
    const dest = g.cellWorld(q, r);
    const footing = g.hasFooting(q, r);
    const dur = p.fast > 0 ? 0.15 : 0.27;
    if (p.fast > 0) p.fast--;
    p.hop = {
      tq: q, tr: r, off: !footing, t: 0, dur,
      from: { x: p.x, y: p.y, z: p.z },
      dest
    };
    p.mode = 'hop';
    p.dq = q - p.q;
    p.dr = r - p.r;
    const dx = dest.x - p.x, dz = dest.z - p.z;
    const L = Math.hypot(dx, dz) || 1;
    p.facing = { x: dx / L, z: dz / L };
    p.vx = dx / Math.max(0.12, dur);
    p.vz = dz / Math.max(0.12, dur);
    g.hops++;
    pushFx({ k: 'hop' });
    return true;
  };

  g.consume = () => {
    const p = g.player;
    if (p.mode !== 'ground' || !p.path.length) return;
    const n = p.path[0];
    if (!g.adjacent(p.q, p.r, n.q, n.r)) {
      const last = p.path[p.path.length - 1];
      p.path = g.route(p.q, p.r, last.q, last.r) || [];
      if (!p.path.length) return;
    }
    const step = p.path.shift();
    g.beginHop(step.q, step.r);
  };

  g.hopTo = (q, r) => {
    const p = g.player;
    if (!p.alive || g.phase === 'over') return false;
    if (p.mode === 'fall' || p.mode === 'rescue' || p.mode === 'dead') return false;
    if (p.mode === 'hop' && p.hop) {
      const path = g.route(p.hop.tq, p.hop.tr, q, r);
      if (path) { p.path = path; return true; }
      return false;
    }
    if (q === p.q && r === p.r) { p.path = []; return false; }
    const path = g.route(p.q, p.r, q, r);
    if (path && path.length) {
      p.path = path;
      g.consume();
      return true;
    }
    if (g.adjacent(p.q, p.r, q, r)) {
      p.path = [];
      return g.beginHop(q, r);
    }
    return false;
  };

  g.dash = (dq, dr) => {
    const p = g.player;
    if (p.mode !== 'ground' || p.dashCd > 0 || !p.alive || g.phase !== 'play') return false;
    p.dashCd = 0.72;
    p.fast = 2;
    p.inv = Math.max(p.inv, 0.3);
    const q1 = p.q + dq, r1 = p.r + dr;
    const q2 = p.q + dq * 2, r2 = p.r + dr * 2;
    if (g.hasFooting(q1, r1) && g.hasFooting(q2, r2)) p.path = [{ q: q1, r: r1 }, { q: q2, r: r2 }];
    else p.path = [{ q: q1, r: r1 }];
    pushFx({ k: 'dash' });
    g.consume();
    return true;
  };

  g.fireAt = (x, y, z) => {
    const p = g.player;
    if (!p.alive || g.phase !== 'play' || p.cool > 0 || p.mode === 'dead') return false;
    p.cool = p.rapid > 0 ? 0.1 : 0.3;
    const ox = p.x, oy = p.y + 0.45, oz = p.z;
    let dx = x - ox, dy = y - oy, dz = z - oz;
    const L = Math.hypot(dx, dy, dz) || 1;
    dx /= L; dy /= L; dz /= L;
    const sp = 15.5;
    g.shots.push({
      id: g.nextId++, x: ox, y: oy, z: oz,
      vx: dx * sp, vy: dy * sp, vz: dz * sp,
      life: 0.85, px: ox, py: oy, pz: oz
    });
    g.shotsFired++;
    pushFx({ k: 'shot', x: ox, y: oy, z: oz });
    return true;
  };

  g.pulse = () => {
    const p = g.player;
    if (!p.alive || p.bombs <= 0 || g.phase !== 'play') return false;
    p.bombs--;
    for (const f of g.foes) f.hp = 0;
    if (g.boss && g.boss.hp > 0) {
      g.boss.hp = Math.max(0, g.boss.hp - 6);
      popup('−6', g.boss.x, g.boss.y + 0.4, g.boss.z, '#ffe56a');
    }
    g.shake = Math.max(g.shake, 0.7);
    pushFx({ k: 'pulse', x: p.x, y: p.y, z: p.z });
    if (!g.demo) g.addScore(40);
    popup('PULSE', p.x, p.y + 0.8, p.z, '#ffe56a');
    return true;
  };

  g.spawnFoe = (kind, q, r) => {
    if (q == null || r == null) {
      if (kind === 'roller') {
        q = 0; r = 0;
        if (g.player.q === 0 && g.player.r === 0) { q = 1; r = 0; }
      } else {
        const spots = g.cubes.filter(c => c.kind !== 'mover' && !c.gone && Math.abs(c.q - g.player.q) + Math.abs(c.r - g.player.r) >= 2);
        if (!spots.length) return 0;
        const c = spots[(g.rng() * spots.length) | 0];
        q = c.q; r = c.r;
      }
    }
    const w = g.cellWorld(q, r);
    const f = {
      id: g.nextId++, kind, q, r,
      x: w.x, y: w.y + (kind === 'bomber' ? 3.3 : 0), z: w.z,
      hp: kind === 'flipper' ? 2 : 1,
      wait: 0.35 + g.rng() * 0.45,
      mode: kind === 'bomber' ? 'air' : 'ground',
      hop: null, dead: false, drop: 1.15 + g.rng() * 0.35
    };
    g.foes.push(f);
    return f.id;
  };

  function killFoe(f) {
    if (f.dead) return;
    f.dead = true;
    f.hp = 0;
    pushFx({ k: 'boom', x: f.x, y: f.y + 0.2, z: f.z, kind: f.kind });
    g.addScore(SCORE[f.kind] || 100);
    popup(String(SCORE[f.kind] || 100), f.x, f.y + 0.5, f.z, '#ffd2a1');
  }

  function landHop() {
    const p = g.player;
    const h = p.hop;
    p.hop = null;
    if (!h) return;
    if (h.off || !g.hasFooting(h.tq, h.tr)) {
      p.mode = 'fall';
      p.y = h.dest.y + 0.15;
      p.x = h.dest.x;
      p.z = h.dest.z;
      p.vy = 1.6;
      p.vx *= 0.35;
      p.vz *= 0.35;
      p.q = -99; p.r = -99;
      p.ride = 0;
      pushFx({ k: 'fall' });
      return;
    }
    const c = g.cubeAt(h.tq, h.tr);
    p.mode = 'ground';
    p.q = h.tq; p.r = h.tr;
    p.ride = c && c.kind === 'mover' ? c.id : 0;
    const w = c ? g.worldOf(c) : g.cellWorld(h.tq, h.tr);
    p.x = w.x; p.y = w.y; p.z = w.z;
    p.squash = -0.3;
    g.paint(c);
    g.collect(h.tq, h.tr);
    pushFx({ k: 'land', x: p.x, y: p.y, z: p.z });
    if (p.path.length) g.consume();
  }

  function advanceHop(dt) {
    const p = g.player;
    const h = p.hop;
    if (!h) { p.mode = 'ground'; return; }
    h.t += dt;
    const u = Math.min(1, h.t / h.dur);
    const e = u * u * (3 - 2 * u);
    p.x = h.from.x + (h.dest.x - h.from.x) * e;
    p.z = h.from.z + (h.dest.z - h.from.z) * e;
    p.y = h.from.y + (h.dest.y - h.from.y) * e + Math.sin(Math.PI * u) * (h.dur < 0.2 ? 0.78 : 0.58);
    p.squash = Math.sin(Math.PI * u) * 0.18;
    if (u >= 1) landHop();
  }

  function stickGround() {
    const p = g.player;
    const c = p.ride ? g.cubeById(p.ride) : g.cubeAt(p.q, p.r);
    if (!c || c.gone) {
      p.mode = 'fall';
      p.vy = 1.1;
      p.vx = p.facing.x * 1.4;
      p.vz = p.facing.z * 1.4;
      p.ride = 0;
      p.path = [];
      p.q = -99; p.r = -99;
      pushFx({ k: 'fall' });
      return;
    }
    if (c.kind === 'mover') {
      const cell = g.moverCell(c);
      p.q = cell.q; p.r = cell.r;
    }
    const w = g.worldOf(c);
    p.x = w.x; p.y = w.y; p.z = w.z;
  }

  function advanceFall(dt) {
    const p = g.player;
    p.vy -= 12.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vx *= Math.pow(0.35, dt);
    p.vz *= Math.pow(0.35, dt);
    for (const d of g.discs) {
      const dist = Math.hypot(p.x - d.x, p.z - d.z);
      if (dist < 1.38 && p.y < d.y + 0.95 && p.y > d.y - 1.2 && p.vy < 2.2) {
        p.mode = 'rescue';
        p.rescue = 0;
        p.disc = d;
        p.inv = Math.max(p.inv, 0.4);
        pushFx({ k: 'catch', x: d.x, y: d.y, z: d.z });
        popup('CAUGHT', d.x, d.y + 0.4, d.z, '#9aefff');
        g.addScore(75);
        return;
      }
    }
    if (p.y < -6.5) g.hurt();
  }

  function advanceRescue(dt) {
    const p = g.player;
    p.rescue += dt;
    const top = g.cellWorld(0, 0);
    const u = Math.min(1, p.rescue / 0.92);
    const e = u * u * (3 - 2 * u);
    const d = p.disc;
    p.x = d.x + (top.x - d.x) * e;
    p.z = d.z + (top.z - d.z) * e;
    p.y = d.y + 0.2 + (top.y - d.y) * e;
    if (u >= 1) {
      p.mode = 'ground';
      p.q = 0; p.r = 0;
      p.x = top.x; p.y = top.y; p.z = top.z;
      p.ride = 0;
      p.path = [];
      p.inv = Math.max(p.inv, 0.55);
    }
  }

  function placeFoe(f) {
    if (f.kind === 'bomber') return;
    if (f.hop) {
      const h = f.hop;
      h.t += 0;
      const u = Math.min(1, h.t / h.dur);
      const e = u * u * (3 - 2 * u);
      f.x = h.from.x + (h.to.x - h.from.x) * e;
      f.z = h.from.z + (h.to.z - h.from.z) * e;
      f.y = h.from.y + (h.to.y - h.from.y) * e + Math.sin(Math.PI * u) * (f.kind === 'roller' ? 0.72 : 0.42);
      return;
    }
    const w = g.cellWorld(f.q, f.r);
    f.x = w.x;
    f.z = w.z;
    if (f.kind !== 'bomber') f.y = w.y;
  }

  function foeHop(f, nq, nr, dur) {
    const from = { x: f.x, y: g.cellWorld(f.q, f.r).y, z: f.z };
    const to = g.cellWorld(nq, nr);
    f.hop = { t: 0, dur, from, to, q: nq, r: nr, off: !g.hasFooting(nq, nr) };
    f.mode = 'hop';
  }

  function finishFoeHop(f) {
    const h = f.hop;
    f.hop = null;
    if (!h || h.off) { f.dead = true; return; }
    f.q = h.q; f.r = h.r;
    f.mode = 'ground';
    f.wait = (g.def.hop || 1.4) * (0.85 + g.rng() * 0.3);
    placeFoe(f);
    if (f.kind === 'flipper') {
      const c = g.cubeAt(f.q, f.r);
      if (c && c.kind !== 'mover' && c.prog > 0) {
        c.prog = Math.max(0, c.prog - 1);
        c.crumb = 0;
        pushFx({ k: 'unpaint', x: f.x, y: f.y, z: f.z });
      }
    }
  }

  function updateFoe(f, dt) {
    const slow = g.player.slow > 0 ? 0.45 : 1;
    const step = dt * slow * g.speed;
    if (f.kind === 'bomber') {
      const w = g.cellWorld(f.q, f.r);
      f.x = w.x; f.z = w.z;
      if (f.mode === 'air') {
        f.drop -= step;
        f.y = w.y + 2.4 + Math.sin(g.time * 6) * 0.08;
        if (f.drop <= 0) { f.mode = 'drop'; f.vy = -0.2; }
      } else {
        f.vy -= 14 * step;
        f.y += f.vy * step;
        if (f.y <= w.y) {
          f.y = w.y;
          pushFx({ k: 'boom', x: f.x, y: f.y, z: f.z, kind: 'bomb' });
          const c = g.cubeAt(f.q, f.r);
          if (c && c.prog > 0 && c.kind !== 'toggle') c.prog = Math.max(0, c.prog - 1);
          if (g.player.q === f.q && g.player.r === f.r && g.player.mode === 'ground') g.hurt();
          f.dead = true;
        }
      }
      return;
    }
    if (f.hop) {
      f.hop.t += step;
      placeFoe(f);
      if (f.hop && f.hop.t >= f.hop.dur) finishFoeHop(f);
      return;
    }
    placeFoe(f);
    f.wait -= step;
    if (f.wait > 0) return;
    const opts = [];
    for (const [dq, dr] of DIRS) {
      const nq = f.q + dq, nr = f.r + dr;
      opts.push({ q: nq, r: nr, foot: g.hasFooting(nq, nr), down: nq + nr > f.q + f.r });
    }
    if (f.kind === 'roller') {
      const downs = opts.filter(o => o.foot && o.down);
      if (!downs.length) { foeHop(f, f.q + 1, f.r, 0.34); return; }
      const pick = downs[(g.rng() * downs.length) | 0];
      foeHop(f, pick.q, pick.r, 0.34);
      return;
    }
    const foot = opts.filter(o => o.foot);
    if (!foot.length) { f.wait = 0.6; return; }
    let pick = foot[(g.rng() * foot.length) | 0];
    const chase = g.def.chase || 0.5;
    if (g.rng() < chase && g.player.mode !== 'fall' && g.player.q > -50) {
      foot.sort((a, b) => (Math.abs(a.q - g.player.q) + Math.abs(a.r - g.player.r)) - (Math.abs(b.q - g.player.q) + Math.abs(b.r - g.player.r)));
      pick = foot[0];
    }
    foeHop(f, pick.q, pick.r, f.kind === 'flipper' ? 0.4 : 0.36);
  }

  function updateBoss(dt) {
    const b = g.boss;
    if (!b || b.hp <= 0) return;
    const c = g.centroid();
    const rad = g.rows * 0.95 + 1.4;
    b.ang += dt * 0.45;
    b.x = c.x + Math.cos(b.ang) * rad;
    b.z = c.z + Math.sin(b.ang) * rad * 0.72;
    b.y = c.y + 1.55 + Math.sin(g.time * 1.6) * 0.18;
    if (g.hold || g.phase !== 'play') return;
    b.cool -= dt * (g.player.slow > 0 ? 0.5 : 1);
    if (b.cool <= 0 && !b.mark && g.player.q > -50) {
      b.cool = Math.max(1.35, 2.5 - g.loop * 0.15);
      b.mark = { q: g.player.q, r: g.player.r, t: 0.72 };
      pushFx({ k: 'warn' });
    }
    if (b.mark) {
      b.mark.t -= dt;
      if (b.mark.t <= 0) {
        const m = b.mark;
        b.mark = null;
        const w = g.cellWorld(m.q, m.r);
        pushFx({ k: 'boom', x: w.x, y: w.y, z: w.z, kind: 'bomb' });
        const cube = g.cubeAt(m.q, m.r);
        if (cube && cube.kind !== 'toggle' && cube.prog > 0) cube.prog = Math.max(0, cube.prog - 1);
        if (g.player.q === m.q && g.player.r === m.r && g.player.mode === 'ground') g.hurt();
      }
    }
  }

  function updateShots(dt) {
    for (const s of g.shots) {
      s.px = s.x; s.py = s.y; s.pz = s.z;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      s.life -= dt;
      if (s.life <= 0) continue;
      for (const f of g.foes) {
        if (f.dead) continue;
        const rad = f.kind === 'bomber' ? 0.62 : f.kind === 'roller' ? 0.5 : 0.46;
        const dx = f.x - s.x, dy = (f.y + 0.25) - s.y, dz = f.z - s.z;
        if (dx * dx + dy * dy + dz * dz < rad * rad) {
          f.hp--;
          s.life = 0;
          pushFx({ k: 'spark', x: s.x, y: s.y, z: s.z });
          if (f.hp <= 0) killFoe(f);
          break;
        }
      }
      if (s.life > 0 && g.boss && g.boss.hp > 0) {
        const b = g.boss;
        const dx = b.x - s.x, dy = b.y - s.y, dz = b.z - s.z;
        if (dx * dx + dy * dy + dz * dz < 1.7) {
          b.hp--;
          s.life = 0;
          g.shake = Math.max(g.shake, 0.16);
          pushFx({ k: 'spark', x: s.x, y: s.y, z: s.z });
          if (!g.demo) g.score += 50;
          if (b.hp <= 0) {
            pushFx({ k: 'boom', x: b.x, y: b.y, z: b.z, kind: 'boss' });
            g.addScore(2000);
            popup('DOWN', b.x, b.y + 0.6, b.z, '#ffe56a');
            g.shake = 0.8;
          }
        }
      }
    }
    g.shots = g.shots.filter(s => s.life > 0);
    g.foes = g.foes.filter(f => !f.dead);
  }

  function touchFoes() {
    const p = g.player;
    if (p.inv > 0 || p.mode === 'rescue' || p.mode === 'dead' || !p.alive) return;
    for (const f of g.foes) {
      const rad = f.kind === 'roller' ? 0.56 : f.kind === 'bomber' ? 0.5 : 0.44;
      const dx = f.x - p.x, dy = (f.y + 0.15) - (p.y + 0.3), dz = f.z - p.z;
      if (dx * dx + dy * dy + dz * dz < rad * rad) { g.hurt(); return; }
    }
  }

  function updateCubes(dt) {
    const slow = g.player.slow > 0 ? 0.45 : 1;
    for (const c of g.cubes) {
      if (c.kind === 'mover') {
        c.u += c.dir * dt * 0.18 * (g.player.slow > 0 ? 0.45 : 1);
        if (c.u >= 1) { c.u = 1; c.dir = -1; }
        if (c.u <= 0) { c.u = 0; c.dir = 1; }
      }
      if (c.kind === 'crumble' && !c.gone && c.crumb > 0 && c.prog >= c.need) {
        c.crumb += dt * slow;
        c.yoff = c.crumb > 4 ? Math.sin(g.time * 28) * 0.035 : 0;
        if (c.crumb > 6.4) {
          c.gone = true;
          c.prog = 0;
          c.crumb = 0;
          c.yoff = 0;
          c.respawn = 2.7;
          pushFx({ k: 'crumble', x: g.cellWorld(c.q, c.r).x, y: g.cellWorld(c.q, c.r).y, z: g.cellWorld(c.q, c.r).z });
          if (g.player.mode === 'ground' && g.player.q === c.q && g.player.r === c.r && !g.player.ride) {
            g.player.mode = 'fall';
            g.player.vy = 0.4;
            g.player.q = -99; g.player.r = -99;
          }
        }
      } else if (c.kind === 'crumble') c.yoff = 0;
      if (c.gone) {
        c.respawn -= dt;
        if (c.respawn <= 0) { c.gone = false; c.pop = 0.28; }
      }
      if (c.pop > 0) c.pop = Math.max(0, c.pop - dt);
    }
  }

  function updateDiscs(dt) {
    const c = g.centroid();
    const base = (g.rows - 1) * STEP * 0.48 + 1.15;
    const falling = g.player.mode === 'fall';
    g.discs.forEach((d, i) => {
      d.ang += dt * (0.45 + i * 0.08);
      const hx = c.x + Math.cos(d.ang) * base;
      const hz = c.z + Math.sin(d.ang) * (base * 0.78);
      const hy = Math.max(0.35, c.y * 0.5);
      if (falling) {
        const dx = g.player.x - d.x, dz = g.player.z - d.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const sp = 9.5;
        d.x += (dx / dist) * Math.min(dist, sp * dt);
        d.z += (dz / dist) * Math.min(dist, sp * dt);
        d.y += (g.player.y - 0.12 - d.y) * Math.min(1, dt * 7);
        return;
      }
      if (g.player.mode === 'rescue' && g.player.disc === d) return;
      d.x += (hx - d.x) * Math.min(1, dt * 1.4);
      d.z += (hz - d.z) * Math.min(1, dt * 1.4);
      d.y += (hy - d.y) * Math.min(1, dt * 1.4);
    });
  }

  function maybeSpawn(dt) {
    if (g.hold || g.phase !== 'play' || g.time < g.def.grace) return;
    g.spawnT -= dt * (g.player.slow > 0 ? 0.5 : 1) * g.speed;
    if (g.spawnT > 0) return;
    g.spawnT = g.def.every * (0.85 + g.rng() * 0.35);
    if (g.foes.length >= g.def.cap + g.loop) return;
    const mix = g.def.mix;
    const kind = mix[(g.rng() * mix.length) | 0];
    g.spawnFoe(kind);
  }

  function maybePickup(dt) {
    if (g.hold || g.phase !== 'play' || g.demo) return;
    if (g.pickups.length) {
      for (const p of g.pickups) p.life -= dt;
      g.pickups = g.pickups.filter(p => p.life > 0);
      return;
    }
    g.pickupT -= dt;
    if (g.pickupT > 0 || g.time < 8) return;
    g.pickupT = 13 + g.rng() * 4;
    const spots = g.cubes.filter(c => !c.gone && c.kind !== 'mover' && !(c.q === g.player.q && c.r === g.player.r));
    if (!spots.length) return;
    const c = spots[(g.rng() * spots.length) | 0];
    const kinds = g.stage === 0 ? ['shield', 'shield', 'rapid', 'slow', 'bomb'] : ['shield', 'rapid', 'slow', 'bomb'];
    g.pickups.push({ id: g.nextId++, q: c.q, r: c.r, kind: kinds[(g.rng() * kinds.length) | 0], life: 12 });
  }

  g.painted = () => {
    let n = 0, need = 0;
    for (const c of g.cubes) {
      if (c.gone) { need++; continue; }
      need++;
      if (c.prog >= c.need) n++;
    }
    return { n, need };
  };

  g.isClear = () => {
    if (g.boss && g.boss.hp > 0) return false;
    for (const c of g.cubes) {
      if (c.gone || c.prog < c.need) return false;
    }
    return g.cubes.length > 0;
  };

  g.build = (index) => {
    const n = STAGES.length;
    const loop = Math.floor(index / n);
    const def = STAGES[index % n];
    g.stage = index;
    g.loop = loop;
    g.speed = 1 + loop * 0.1;
    g.def = def;
    g.rows = def.rows;
    g.sky = def.sky;
    g.buildId = (g.buildId || 0) + 1;
    g.phase = 'play';
    g.time = 0;
    g.clearT = 0;
    g.spawnT = 0.4;
    g.pickupT = 8;
    g.foes = [];
    g.shots = [];
    g.pickups = [];
    g.cubes = [];
    g.banner = (def.boss ? 'BOSS  ·  ' : ('STAGE ' + (index + 1) + '  ·  ')) + def.name;
    g.bannerT = 2.3;
    const keep = g.player;
    const w0 = { x: 0, y: (def.rows - 1) * 0.72, z: 0 };
    g.player = {
      q: 0, r: 0, x: w0.x, y: w0.y, z: w0.z,
      vx: 0, vy: 0, vz: 0,
      facing: { x: 0, z: 1 },
      dq: 1, dr: 0,
      mode: 'ground',
      hop: null, path: [], ride: 0, fast: 0,
      lives: keep ? keep.lives : 3,
      alive: true,
      inv: 1.1,
      shield: 0,
      rapid: 0,
      slow: 0,
      bombs: keep ? keep.bombs : 0,
      cool: 0,
      dashCd: 0,
      squash: 0,
      blink: 0
    };
    for (let q = 0; q < def.rows; q++) {
      for (let r = 0; r < def.rows - q; r++) {
        let kind = 'normal';
        if (!(q === 0 && r === 0)) {
          const roll = g.rng();
          const tog = def.toggle || 0;
          const cr = def.crumble || 0;
          if (roll < tog) kind = 'toggle';
          else if (roll < tog + cr) kind = 'crumble';
        }
        g.cubes.push({
          id: g.nextId++, q, r, kind,
          need: kind === 'toggle' ? 1 : def.hits,
          prog: 0, crumb: 0, gone: false, yoff: 0, pop: 0, respawn: 0
        });
      }
    }
    const movers = def.movers || 0;
    for (let i = 0; i < movers; i++) {
      const q = def.rows - 2 - i;
      g.cubes.push({
        id: g.nextId++, q, r: -1, kind: 'mover',
        from: { q, r: -1 }, to: { q: q + 1, r: -1 },
        u: (i * 0.33) % 1, dir: i % 2 ? -1 : 1,
        need: 1, prog: 0, gone: false, yoff: 0, pop: 0, crumb: 0, respawn: 0
      });
    }
    g.boss = def.boss ? {
      id: g.nextId++, name: def.boss.name, hp: def.boss.hp + loop * 4, max: def.boss.hp + loop * 4,
      x: 0, y: 2, z: 0, ang: 0.4, cool: 1.6, mark: null
    } : null;
    const cen = g.centroid();
    g.discs = [];
    for (let i = 0; i < def.discs; i++) {
      const ang = (Math.PI * 2 * i) / def.discs;
      g.discs.push({ ang, x: cen.x + Math.cos(ang) * 3, y: 0.4, z: cen.z + Math.sin(ang) * 2 });
    }
    const top = g.cellWorld(0, 0);
    g.player.x = top.x; g.player.y = top.y; g.player.z = top.z;
  };

  g.step = (dt) => {
    dt = Math.max(0, Math.min(0.05, dt));
    if (g.phase === 'over') return;
    const p = g.player;
    g.time += dt;
    if (g.bannerT > 0) g.bannerT -= dt;
    if (p.inv > 0) p.inv -= dt;
    if (p.rapid > 0) p.rapid -= dt;
    if (p.slow > 0) p.slow -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;
    if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
    p.blink -= dt;
    if (p.blink < -0.12) p.blink = 2.4 + g.rng() * 2.2;
    if (p.mode !== 'hop') p.squash *= Math.exp(-10 * dt);
    updateCubes(dt);
    updateDiscs(dt);
    if (p.mode === 'hop') advanceHop(dt);
    else if (p.mode === 'fall') advanceFall(dt);
    else if (p.mode === 'rescue') advanceRescue(dt);
    else if (p.mode === 'ground') stickGround();
    if (!g.hold && g.phase === 'play') {
      for (const f of g.foes) updateFoe(f, dt);
      g.foes = g.foes.filter(f => !f.dead);
      updateBoss(dt);
      maybeSpawn(dt);
      maybePickup(dt);
    } else {
      for (const f of g.foes) placeFoe(f);
    }
    updateShots(dt);
    if (g.phase === 'play') touchFoes();
    for (const pop of g.pops) pop.age += dt;
    g.pops = g.pops.filter(pop => pop.age < pop.life);
    g.shake *= Math.exp(-5.5 * dt);
    if (g.phase === 'play' && !g.hold && g.isClear()) {
      g.phase = 'clear';
      g.clearT = 1.25;
      const bonus = 500 * (g.stage + 1);
      g.addScore(bonus);
      popup('CLEAR', p.x, p.y + 1, p.z, '#b8ff9a');
      pushFx({ k: 'clear' });
      g.banner = 'CLEARED';
      g.bannerT = 1.2;
    } else if (g.phase === 'clear') {
      g.clearT -= dt;
      if (g.clearT <= 0) g.build(g.stage + 1);
    }
  };

  g.build(g.stage);
  if (opts.demo) g.demo = true;
  if (opts.hold) g.hold = true;
  return g;
}
