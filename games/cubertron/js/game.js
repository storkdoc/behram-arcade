/* CUBERTRON — maze simulation.
   An original top-down grid shooter. Rooms of electrified walls, patrolling
   sentries, and an invincible bouncing entity called the Gleam.
   No rendering and no DOM, so the rules can run under Node. */
const COLS = 13;
const ROWS = 9;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [0.707, -0.707], [-0.707, 0.707], [-0.707, -0.707]];

export const TIERS = [
  { name: 'SCOUT', speed: 1.45, cool: 2.35, error: 0.7, hp: 1, shield: 0, crash: 0.06, color: '#3ee7ff' },
  { name: 'STRIKER', speed: 1.95, cool: 1.55, error: 0.4, hp: 1, shield: 0, crash: 0.12, color: '#ffb15a' },
  { name: 'FLANKER', speed: 2.25, cool: 1.25, error: 0.28, hp: 1, shield: 0, crash: 0.16, color: '#d27bff' },
  { name: 'BULWARK', speed: 1.7, cool: 1.45, error: 0.22, hp: 1, shield: 1, crash: 0.1, color: '#f4f7ff' }
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

function hypot(x, z) { return Math.hypot(x, z); }

export function createGame(opts = {}) {
  const g = {
    seed: (opts.seed == null ? 1 : opts.seed) >>> 0,
    demo: !!opts.demo,
    hold: !!opts.hold,
    COLS, ROWS,
    rx: 0, ry: 0,
    came: null,
    visits: 0,
    score: 0,
    combo: 0,
    comboT: 0,
    nextLife: 8000,
    phase: 'play',
    time: 0,
    roomTime: 0,
    gleamIn: 24,
    slowmo: 0,
    shake: 0,
    shotsFired: 0,
    kills: 0,
    cleared: false,
    hadRobots: false,
    banner: '',
    bannerT: 0,
    walls: [],
    grid: [],
    doors: { n: true, e: true, s: true, w: true },
    sealed: { n: false, e: false, s: false, w: false },
    robots: [],
    bullets: [],
    pickups: [],
    gleam: null,
    pops: [],
    fx: [],
    visited: {},
    roomSerial: 0,
    nextId: 1,
    wish: { x: 0, z: 0, kill: true },
    target: null,
    firing: false,
    aim: { x: 0, z: 1 },
    player: null,
    accent: '#3ee7ff'
  };

  function rngFor(rx, ry, salt) {
    return mulberry32((g.seed + rx * 92821 + ry * 68917 + salt * 17) >>> 0);
  }

  function pushFx(e) {
    g.fx.push(e);
    if (g.fx.length > 40) g.fx.shift();
  }
  function popup(text, x, z, tint) {
    g.pops.push({ text, x, z, tint: tint || '#fff', life: 0.9, age: 0 });
    if (g.pops.length > 8) g.pops.shift();
  }

  g.addScore = (base) => {
    if (base <= 0 || g.demo) return;
    if (g.comboT > 0) g.combo = Math.min(8, g.combo + 1);
    else g.combo = 1;
    g.comboT = 2.6;
    g.score += base * g.combo;
    while (g.score >= g.nextLife) {
      g.player.lives = Math.min(6, g.player.lives + 1);
      g.nextLife += 12000;
      popup('1UP', g.player.x, g.player.z, '#ffe56a');
      pushFx({ k: 'life' });
    }
  };

  function doorSpan(horizontal) {
    const n = horizontal ? COLS : ROWS;
    const a = Math.floor((n - 2) / 2);
    return [a, a + 2];
  }

  function cellWall(grid, c, r) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
    return grid[r][c] === 1;
  }

  g.wallAt = (x, z) => {
    const c = Math.floor(x), r = Math.floor(z);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
    return g.grid[r][c] === 1;
  };

  g.openAt = (x, z) => x > 0.2 && z > 0.2 && x < COLS - 0.2 && z < ROWS - 0.2 && !g.wallAt(x, z);

  function overlapsWall(x, z, rad) {
    const c0 = Math.floor(x - rad), c1 = Math.floor(x + rad);
    const r0 = Math.floor(z - rad), r1 = Math.floor(z + rad);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!cellWall(g.grid, c, r)) continue;
        const nx = Math.max(c, Math.min(x, c + 1));
        const nz = Math.max(r, Math.min(z, r + 1));
        const dx = x - nx, dz = z - nz;
        if (dx * dx + dz * dz < rad * rad) return true;
      }
    }
    return false;
  }

  function inDoor(side, x, z) {
    const [a, b] = doorSpan(side === 'n' || side === 's');
    if (side === 'n' || side === 's') return x >= a && x <= b;
    return z >= a && z <= b;
  }

  function buildGrid(rx, ry, difficulty) {
    const rand = rngFor(rx, ry, 3);
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    for (let c = 0; c < COLS; c++) { grid[0][c] = 1; grid[ROWS - 1][c] = 1; }
    for (let r = 0; r < ROWS; r++) { grid[r][0] = 1; grid[r][COLS - 1] = 1; }
    const [dx0, dx1] = doorSpan(true);
    const [dz0, dz1] = doorSpan(false);
    for (let c = dx0; c < dx1; c++) { grid[0][c] = 0; grid[ROWS - 1][c] = 0; }
    for (let r = dz0; r < dz1; r++) { grid[r][0] = 0; grid[r][COLS - 1] = 0; }
    const guard = new Set();
    for (let c = dx0 - 1; c <= dx1; c++) {
      guard.add(c + ',1'); guard.add(c + ',' + (ROWS - 2));
      guard.add(c + ',0'); guard.add(c + ',' + (ROWS - 1));
    }
    for (let r = dz0 - 1; r <= dz1; r++) {
      guard.add('1,' + r); guard.add((COLS - 2) + ',' + r);
      guard.add('0,' + r); guard.add((COLS - 1) + ',' + r);
    }
    const posts = Math.min(6, 1 + Math.floor(difficulty / 2));
    let placed = 0, guardTries = 0;
    while (placed < posts && guardTries < 80) {
      guardTries++;
      const horiz = rand() < 0.5;
      const len = 2 + (rand() < 0.4 ? 1 : 0);
      const c = 2 + Math.floor(rand() * (COLS - 4 - (horiz ? len : 1)));
      const r = 2 + Math.floor(rand() * (ROWS - 4 - (horiz ? 1 : len)));
      const cells = [];
      let ok = true;
      for (let i = 0; i < len; i++) {
        const cc = c + (horiz ? i : 0), rr = r + (horiz ? 0 : i);
        if (cc <= 1 || rr <= 1 || cc >= COLS - 2 || rr >= ROWS - 2 || guard.has(cc + ',' + rr) || grid[rr][cc] === 1) { ok = false; break; }
        cells.push([cc, rr]);
      }
      if (!ok || cells.length < 2) continue;
      for (const [cc, rr] of cells) grid[rr][cc] = 1;
      placed++;
    }
    return grid;
  }

  function applySeals(grid) {
    const [dx0, dx1] = doorSpan(true);
    const [dz0, dz1] = doorSpan(false);
    if (g.sealed.n) for (let c = dx0; c < dx1; c++) grid[0][c] = 1;
    if (g.sealed.s) for (let c = dx0; c < dx1; c++) grid[ROWS - 1][c] = 1;
    if (g.sealed.w) for (let r = dz0; r < dz1; r++) grid[r][0] = 1;
    if (g.sealed.e) for (let r = dz0; r < dz1; r++) grid[r][COLS - 1] = 1;
    g.doors = {
      n: !g.sealed.n, s: !g.sealed.s, w: !g.sealed.w, e: !g.sealed.e
    };
  }

  function roster(n) {
    const count = Math.min(7, 3 + Math.floor(n / 2));
    const list = [];
    for (let i = 0; i < count; i++) {
      let tier = 0;
      if (n >= 2 && i === count - 1) tier = 1;
      if (n >= 4 && i >= Math.max(0, count - 2)) tier = Math.max(tier, 1);
      if (n >= 5 && i === 0) tier = 2;
      if (n >= 7 && i === count - 1) tier = 3;
      if (n >= 9 && i % 2 === 1) tier = Math.min(3, tier + 1);
      list.push(tier);
    }
    return list;
  }

  function emptyCells() {
    const out = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) if (g.grid[r][c] === 0) out.push({ c, r });
    }
    return out;
  }

  function spawnAt(side) {
    const [dx0] = doorSpan(true);
    const [dz0] = doorSpan(false);
    const cx = dx0 + 1;
    const cz = dz0 + 1;
    if (side === 'n') return { x: cx, z: 1.7, fx: 0, fz: 1 };
    if (side === 's') return { x: cx, z: ROWS - 1.7, fx: 0, fz: -1 };
    if (side === 'w') return { x: 1.7, z: cz, fx: 1, fz: 0 };
    if (side === 'e') return { x: COLS - 1.7, z: cz, fx: -1, fz: 0 };
    return { x: COLS / 2, z: ROWS / 2, fx: 0, fz: 1 };
  }

  g.enter = (rx, ry, from) => {
    g.rx = rx; g.ry = ry;
    g.came = from;
    g.visits++;
    const diff = Math.max(0, g.visits - 1);
    g.sealed = { n: false, e: false, s: false, w: false };
    if (from === 'n') g.sealed.n = true;
    if (from === 's') g.sealed.s = true;
    if (from === 'e') g.sealed.e = true;
    if (from === 'w') g.sealed.w = true;
    g.grid = buildGrid(rx, ry, diff);
    applySeals(g.grid);
    g.rand = rngFor(rx, ry, 40 + g.visits);
    g.roomSerial++;
    g.roomTime = 0;
    g.cleared = false;
    g.bullets = [];
    g.gleam = null;
    g.pickups = [];
    g.target = null;
    g.gleamIn = g.demo ? 999 : Math.max(9, 24 - diff * 1.2);
    const pal = ['#3ee7ff', '#ffb15a', '#d27bff', '#7dffb0'][(Math.abs(rx) + Math.abs(ry)) % 4];
    g.accent = pal;
    const spot = spawnAt(from);
    if (!g.player) {
      g.player = {
        x: spot.x, z: spot.z, r: 0.26, lives: 3, alive: true,
        inv: 1.3, cool: 0, shield: 0, rapid: 0, slow: 0,
        faceX: spot.fx, faceZ: spot.fz
      };
    } else {
      g.player.x = spot.x; g.player.z = spot.z;
      g.player.faceX = spot.fx; g.player.faceZ = spot.fz;
      g.player.inv = Math.max(g.player.inv, 0.7);
      g.player.alive = true;
    }
    const rand = rngFor(rx, ry, 9 + g.visits);
    const cells = emptyCells().filter(p => hypot(p.c + 0.5 - spot.x, p.r + 0.5 - spot.z) > 2.5);
    const tiers = g.demo ? [0, 0, 1] : roster(diff);
    g.robots = [];
    for (let i = 0; i < tiers.length && cells.length; i++) {
      const idx = Math.floor(rand() * cells.length);
      const cell = cells.splice(idx, 1)[0];
      const tier = tiers[i];
      const spec = TIERS[tier];
      const dir = DIRS[Math.floor(rand() * 4)];
      g.robots.push({
        id: g.nextId++, tier, x: cell.c + 0.5, z: cell.r + 0.5, r: 0.32,
        dx: dir[0], dz: dir[1], hp: spec.hp, shield: spec.shield,
        cool: 0.6 + rand() * 0.8, think: 0.2 + rand() * 0.4, alive: true
      });
    }
    g.hadRobots = g.robots.length > 0;
    if (!g.demo && diff === 0) {
      const far = emptyCells().find(p => hypot(p.c + 0.5 - spot.x, p.r + 0.5 - spot.z) > 2 && hypot(p.c + 0.5 - spot.x, p.r + 0.5 - spot.z) < 4.2);
      if (far) g.pickups.push({ id: g.nextId++, x: far.c + 0.5, z: far.r + 0.5, kind: 'shield', life: 20 });
    }
    g.visited[rx + ',' + ry] = true;
    g.banner = 'SECTOR ' + (g.visits);
    g.bannerT = 1.5;
    g.phase = 'play';
  };

  function slide(ent, dx, dz, kill) {
    const ox = ent.x, oz = ent.z;
    ent.x += dx;
    let hit = null;
    if (overlapsWall(ent.x, ent.z, ent.r)) {
      ent.x = ox;
      if (kill && Math.abs(dx) > 0.0012) hit = 'wall';
    }
    ent.z += dz;
    if (overlapsWall(ent.x, ent.z, ent.r)) {
      ent.z = oz;
      if (kill && Math.abs(dz) > 0.0012) hit = 'wall';
    }
    return hit;
  }

  function exitSide() {
    const p = g.player;
    if (g.doors.n && p.z < 0.35 && inDoor('n', p.x, p.z)) return 'n';
    if (g.doors.s && p.z > ROWS - 0.35 && inDoor('s', p.x, p.z)) return 's';
    if (g.doors.w && p.x < 0.35 && inDoor('w', p.x, p.z)) return 'w';
    if (g.doors.e && p.x > COLS - 0.35 && inDoor('e', p.x, p.z)) return 'e';
    return null;
  }

  function leave(side) {
    const map = { n: [0, -1, 's'], s: [0, 1, 'n'], w: [-1, 0, 'e'], e: [1, 0, 'w'] };
    const m = map[side];
    g.enter(g.rx + m[0], g.ry + m[1], m[2]);
  }

  g.hurt = (why) => {
    const p = g.player;
    if (!p.alive || p.inv > 0 || g.phase !== 'play') return;
    if (g.demo) { p.inv = 0.4; return; }
    if (p.shield) {
      p.shield = 0;
      p.inv = 0.45;
      g.shake = Math.max(g.shake, 0.25);
      pushFx({ k: 'shield', x: p.x, z: p.z });
      popup('BLOCK', p.x, p.z, '#9aefff');
      return;
    }
    g.combo = 0; g.comboT = 0;
    g.shake = 0.6;
    pushFx({ k: 'hurt', x: p.x, z: p.z, why: why || '' });
    p.lives--;
    if (p.lives <= 0) {
      p.alive = false;
      g.phase = 'over';
      g.banner = 'GRID DOWN';
      g.bannerT = 2;
      return;
    }
    const from = g.came;
    const rx = g.rx, ry = g.ry;
    const lives = p.lives;
    const shield = 0;
    g.visits--;
    g.enter(rx, ry, from);
    g.player.lives = lives;
    g.player.shield = shield;
    g.player.inv = 1.35;
  };

  function killRobot(bot, how) {
    if (!bot.alive) return;
    bot.alive = false;
    g.kills++;
    const bonus = how === 'friend' ? 200 : how === 'wall' ? 150 : 100;
    g.addScore(bonus);
    popup(String(bonus), bot.x, bot.z, TIERS[bot.tier].color);
    pushFx({ k: 'boom', x: bot.x, z: bot.z, color: TIERS[bot.tier].color });
    g.shake = Math.max(g.shake, 0.18);
  }

  function fireBolt(x, z, dx, dz, from, owner) {
    const L = hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const sp = from === 'player' ? 11 : 7.2;
    g.bullets.push({
      id: g.nextId++, x: x + dx * 0.42, z: z + dz * 0.42,
      vx: dx * sp, vz: dz * sp, from, owner, life: 1.15, r: 0.12
    });
    if (from === 'player') g.shotsFired++;
    pushFx({ k: 'shot', x, z, color: from === 'player' ? '#bffbff' : '#ff8a7a' });
  }

  g.fireAim = (dx, dz) => {
    const p = g.player;
    const L = hypot(dx, dz);
    if (L < 0.05 || !p.alive || g.phase !== 'play') return false;
    p.faceX = dx / L; p.faceZ = dz / L;
    if (p.cool > 0) return false;
    p.cool = p.rapid > 0 ? 0.11 : 0.28;
    fireBolt(p.x, p.z, p.faceX, p.faceZ, 'player', 0);
    return true;
  };

  function los(x0, z0, x1, z1) {
    const dist = hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(dist / 0.28));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      if (g.wallAt(x, z)) return false;
    }
    return true;
  }

  function nearestRobot(x, z) {
    let best = null, bestD = 1e9;
    for (const bot of g.robots) {
      if (!bot.alive) continue;
      const d = hypot(bot.x - x, bot.z - z);
      if (d < bestD) { bestD = d; best = bot; }
    }
    return best;
  }
  g.nearestRobot = nearestRobot;
  g.los = los;

  function updatePlayer(dt) {
    const p = g.player;
    if (!p.alive) return;
    if (p.inv > 0) p.inv -= dt;
    if (p.cool > 0) p.cool -= dt;
    if (p.rapid > 0) p.rapid -= dt;
    if (p.slow > 0) p.slow -= dt;
    const mx = g.wish.x, mz = g.wish.z;
    const stick = hypot(mx, mz) > 0.18;
    const sp = 3.75;
    if (stick) {
      g.target = null;
      const L = hypot(mx, mz);
      const dx = mx / L, dz = mz / L;
      p.faceX = dx; p.faceZ = dz;
      const hit = slide(p, dx * sp * dt, dz * sp * dt, g.wish.kill);
      if (hit) g.hurt('wall');
    } else if (g.target) {
      let dx = g.target.x - p.x, dz = g.target.z - p.z;
      const L = hypot(dx, dz);
      if (L < 0.2) g.target = null;
      else {
        dx /= L; dz /= L;
        p.faceX = dx; p.faceZ = dz;
        slide(p, dx * sp * dt, dz * sp * dt, false);
      }
    }
    const side = exitSide();
    if (side && p.alive && g.phase === 'play' && !g.demo) leave(side);
  }

  function turnRobot(bot, prefer) {
    const options = DIRS.slice();
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(g.rand() * (i + 1));
      const t = options[i]; options[i] = options[j]; options[j] = t;
    }
    if (prefer) {
      options.sort((a, b) => (b[0] * prefer.x + b[1] * prefer.z) - (a[0] * prefer.x + a[1] * prefer.z));
    }
    for (const d of options) {
      if (!overlapsWall(bot.x + d[0] * 0.7, bot.z + d[1] * 0.7, bot.r * 0.86)) {
        bot.dx = d[0]; bot.dz = d[1];
        return true;
      }
    }
    return false;
  }

  function updateRobots(dt) {
    const slow = g.player.slow > 0 ? 0.42 : 1;
    const step = dt * slow;
    for (const bot of g.robots) {
      if (!bot.alive) continue;
      const spec = TIERS[bot.tier];
      bot.cool -= step;
      bot.think -= step;
      if (bot.think <= 0) {
        bot.think = 0.34 + g.rand() * 0.28;
        const see = los(bot.x, bot.z, g.player.x, g.player.z);
        const toward = { x: g.player.x - bot.x, z: g.player.z - bot.z };
        const ahead = overlapsWall(bot.x + bot.dx * 0.62, bot.z + bot.dz * 0.62, bot.r * 0.9);
        if (ahead || g.rand() < 0.03) {
          const prefer = bot.tier >= 1 && see ? toward : null;
          if (!turnRobot(bot, prefer)) { killRobot(bot, 'wall'); continue; }
        } else if (bot.tier >= 1 && see && g.rand() < 0.18) {
          const L = hypot(toward.x, toward.z) || 1;
          const charge = { x: toward.x / L, z: toward.z / L };
          if (overlapsWall(bot.x + charge.x * 0.7, bot.z + charge.z * 0.7, bot.r * 0.86)) {
            if (g.rand() < spec.crash + 0.15) { killRobot(bot, 'wall'); continue; }
          } else { bot.dx = charge.x; bot.dz = charge.z; }
        }
        if (see && bot.cool <= 0 && !g.hold && g.roomTime > 1.3) {
          bot.cool = spec.cool * (0.85 + g.rand() * 0.3);
          const err = (g.rand() - 0.5) * spec.error;
          const ang = Math.atan2(toward.x, toward.z) + err;
          fireBolt(bot.x, bot.z, Math.sin(ang), Math.cos(ang), 'robot', bot.id);
        }
      }
      const ox = bot.x, oz = bot.z;
      bot.x += bot.dx * spec.speed * step;
      bot.z += bot.dz * spec.speed * step;
      if (overlapsWall(bot.x, bot.z, bot.r * 0.82)) {
        bot.x = ox; bot.z = oz;
        if (!turnRobot(bot, null)) killRobot(bot, 'wall');
      }
    }
    for (let i = 0; i < g.robots.length; i++) {
      const a = g.robots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < g.robots.length; j++) {
        const b = g.robots[j];
        if (!b.alive) continue;
        if (hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 0.04) {
          killRobot(a, 'friend');
          killRobot(b, 'friend');
        }
      }
      if (a.alive && g.player.alive && g.player.inv <= 0 && hypot(a.x - g.player.x, a.z - g.player.z) < a.r + g.player.r - 0.02) {
        g.hurt('sentry');
      }
    }
    g.robots = g.robots.filter(bot => bot.alive);
  }

  function updateBullets(dt) {
    const slow = g.player.slow > 0 ? 0.45 : 1;
    for (const b of g.bullets) {
      b.life -= dt;
      b.x += b.vx * dt * (b.from === 'robot' ? slow : 1);
      b.z += b.vz * dt * (b.from === 'robot' ? slow : 1);
      if (b.life <= 0 || overlapsWall(b.x, b.z, b.r) || b.x < 0 || b.z < 0 || b.x > COLS || b.z > ROWS) {
        b.life = 0;
        pushFx({ k: 'spark', x: b.x, z: b.z, color: b.from === 'player' ? '#bffbff' : '#ff8a7a' });
        continue;
      }
      if (b.from === 'robot' && g.player.alive && g.player.inv <= 0 && hypot(b.x - g.player.x, b.z - g.player.z) < b.r + g.player.r) {
        b.life = 0;
        g.hurt('bolt');
        continue;
      }
      for (const bot of g.robots) {
        if (!bot.alive) continue;
        if (b.from === 'robot' && b.owner === bot.id) continue;
        if (hypot(b.x - bot.x, b.z - bot.z) < b.r + bot.r) {
          b.life = 0;
          if (bot.shield > 0 && b.from === 'player') {
            bot.shield = 0;
            pushFx({ k: 'spark', x: bot.x, z: bot.z, color: '#f4f7ff' });
          } else killRobot(bot, b.from === 'robot' ? 'friend' : 'shot');
          break;
        }
      }
    }
    g.bullets = g.bullets.filter(b => b.life > 0);
  }

  function updateGleam(dt) {
    if (g.hold || g.demo) return;
    if (!g.gleam) {
      g.gleamIn -= dt;
      if (g.gleamIn > 0) return;
      const side = ['n', 'e', 's', 'w'].find(s => g.doors[s]) || 'n';
      const spot = spawnAt(side);
      const dx = g.player.x - spot.x, dz = g.player.z - spot.z;
      const L = hypot(dx, dz) || 1;
      const diff = Math.max(0, g.visits - 1);
      const sp = Math.min(4.5, 3.05 + diff * 0.12);
      g.gleam = { x: spot.x, z: spot.z, vx: dx / L * sp, vz: dz / L * sp, r: 0.34, sp };
      g.banner = 'THE GLEAM';
      g.bannerT = 1.4;
      g.shake = Math.max(g.shake, 0.35);
      pushFx({ k: 'gleam', x: spot.x, z: spot.z });
      return;
    }
    const m = g.gleam;
    m.x += m.vx * dt;
    if (overlapsWall(m.x, m.z, m.r) || m.x < 0.4 || m.x > COLS - 0.4) {
      m.x -= m.vx * dt;
      m.vx *= -1;
    }
    m.z += m.vz * dt;
    if (overlapsWall(m.x, m.z, m.r) || m.z < 0.4 || m.z > ROWS - 0.4) {
      m.z -= m.vz * dt;
      m.vz *= -1;
    }
    const sp = hypot(m.vx, m.vz) || m.sp;
    m.vx = m.vx / sp * m.sp;
    m.vz = m.vz / sp * m.sp;
    if (g.player.alive && g.player.inv <= 0 && hypot(m.x - g.player.x, m.z - g.player.z) < m.r + g.player.r) {
      g.hurt('gleam');
    }
  }

  function updatePickups(dt) {
    for (const item of g.pickups) {
      item.life -= dt;
      if (hypot(item.x - g.player.x, item.z - g.player.z) < 0.45) {
        item.life = 0;
        if (item.kind === 'shield') g.player.shield = 1;
        else if (item.kind === 'rapid') g.player.rapid = 8;
        else if (item.kind === 'slow') g.player.slow = 6;
        popup(item.kind.toUpperCase(), item.x, item.z, '#9aefff');
        pushFx({ k: 'power', x: item.x, z: item.z });
        g.addScore(25);
      }
    }
    g.pickups = g.pickups.filter(item => item.life > 0);
    if (!g.demo && !g.hold && g.phase === 'play' && g.roomTime > 8 && g.pickups.length === 0 && Math.floor(g.roomTime) === 8) {
      const cells = emptyCells().filter(p => hypot(p.c + 0.5 - g.player.x, p.r + 0.5 - g.player.z) > 1.5);
      if (cells.length) {
        const cell = cells[Math.floor(mulberry32((g.rx * 9 + g.ry + g.visits) >>> 0)() * cells.length)];
        const kinds = ['rapid', 'slow', 'shield'];
        g.pickups.push({ id: g.nextId++, x: cell.c + 0.5, z: cell.r + 0.5, kind: kinds[g.visits % 3], life: 14 });
      }
    }
  }

  function checkClear() {
    if (g.cleared || !g.hadRobots || g.robots.length || g.demo) return;
    g.cleared = true;
    g.slowmo = 0.85;
    const bonus = 200 * g.visits;
    g.addScore(bonus);
    popup('CLEAR', g.player.x, g.player.z, '#b6ff8a');
    g.banner = 'SECTOR CLEAR';
    g.bannerT = 1.3;
    pushFx({ k: 'clear', x: g.player.x, z: g.player.z });
  }

  g.autoAim = (dx, dz) => {
    const bot = nearestRobot(g.player.x, g.player.z);
    if (!bot) return { x: dx, z: dz };
    const tx = bot.x - g.player.x, tz = bot.z - g.player.z;
    const L = hypot(dx, dz) || 1;
    const along = (tx * dx + tz * dz) / (L * (hypot(tx, tz) || 1));
    if (along < 0.35) return { x: dx, z: dz };
    return { x: tx, z: tz };
  };

  g.spawnRobot = (x, z, tier) => {
    const spec = TIERS[tier || 0];
    const bot = {
      id: g.nextId++, tier: tier || 0, x, z, r: 0.32,
      dx: 1, dz: 0, hp: spec.hp, shield: spec.shield,
      cool: 5, think: 9, alive: true
    };
    g.robots.push(bot);
    g.hadRobots = true;
    return bot.id;
  };

  g.step = (dt) => {
    dt = Math.max(0, Math.min(0.05, dt));
    if (g.phase === 'over') return;
    const real = dt;
    if (g.slowmo > 0) {
      g.slowmo -= real;
      dt *= 0.38;
    }
    g.time += real;
    g.roomTime += real;
    if (g.bannerT > 0) g.bannerT -= real;
    if (g.comboT > 0) { g.comboT -= real; if (g.comboT <= 0) g.combo = 0; }
    updatePlayer(real);
    if (g.phase !== 'play') return;
    if (g.firing) {
      const aim = g.aim || { x: g.player.faceX, z: g.player.faceZ };
      g.fireAim(aim.x, aim.z);
    }
    if (!g.hold) {
      updateRobots(dt);
      updateGleam(dt);
    }
    updateBullets(dt);
    updatePickups(real);
    checkClear();
    for (const pop of g.pops) pop.age += real;
    g.pops = g.pops.filter(pop => pop.age < pop.life);
    g.shake *= Math.exp(-5 * real);
  };

  g.enter(0, 0, null);
  if (opts.demo) g.demo = true;
  if (opts.hold) g.hold = true;
  return g;
}
