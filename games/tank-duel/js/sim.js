/* ==========================================================================
   TANK DUEL — sim.js   (pure game rules, no DOM; runs in the browser and Node)
   Fixed 60 Hz step. Arena = 32 x 20 tiles of 1 unit. x right, y down.
   Angle a: heading vector (cos a, sin a).
   ========================================================================== */
(function (root) {
  'use strict';
  const COLS = 32, ROWS = 20, DT = 1 / 60;
  const TANK_R = 0.46, SHELL_R = 0.11;
  const EMPTY = 0, WALL = 1, BRICK = 2, BRICK_HP = 3;

  /* ---------- arenas: left half (16 cols); the right half is the 180° rotation ---------- */
  const MAPS = {
    open: { name: 'OPEN FIELD', rows: ['################', ...Array(18).fill('#...............'), '################'] },
    classic: { name: 'CLASSIC MAZE', rows: [
      '################', '#...............', '#...............', '#...##......#...', '#...##......#...', '#...........#...', '#.......####....',
      '#...............', '#...#...........', '#...#.......##..', '#...#.......##..', '#...#...........', '#...............', '#.......####....',
      '#...........#...', '#...##......#...', '#...##......#...', '#...............', '#...............', '################'] },
    bunker: { name: 'BUNKERS', rows: [
      '################', '#...............', '#..####.........', '#.........#.....', '#.........#.....', '#....#....#..###', '#....#..........',
      '#....#..........', '#.........##....', '#...........#...', '#...........#...', '#.....###.......', '#...............', '#.........#.....',
      '#..#......#.....', '#..#..##..#.....', '#..#............', '#...............', '#...............', '################'] },
    pinball: { name: 'PILLARS', rows: [
      '################', '#...............', '#..##...##...##.', '#..##...##...##.', '#...............', '#...............', '#.....##...##...',
      '#.....##...##...', '#...............', '#...#...........', '#...#....##.....', '#........##.....', '#...............', '#.....##...##...',
      '#.....##...##...', '#...............', '#...............', '#..##...##...##.', '#..##...##...##.', '################'] },
    city: { name: 'BRICK CITY', rows: [
      '################', '#...............', '#..BBB...BB.....', '#..B.....BB..BBB', '#..B............', '#......##.......', '#.BB...##..BBB..',
      '#.B.........B...', '#.B...BBB...B...', '#.....B.........', '#.....B.....BB..', '#.B...BBB...BB..', '#.B.............', '#.BB...##..BBB..',
      '#......##.......', '#..B............', '#..B.....BB..BBB', '#..BBB...BB.....', '#...............', '################'] },
    yard: { name: 'RAIL YARD', rows: [
      '################', '#...............', '#...............', '#...###.........', '#...............', '#...............', '#...............',
      '#...........#...', '#...........#...', '#...............', '#...............', '#...........#...', '#...........#...', '#...............',
      '#...............', '#...............', '#...###.........', '#...............', '#...............', '################'],
      movers: [{ x: 8, y: 3, w: 1, h: 3, bx: 8, by: 15, period: 7, phase: 0 }, { x: 12, y: 4, w: 3, h: 1, bx: 12, by: 15, period: 9, phase: 1.6 }] },
    raceway: { name: 'RACEWAY', rows: [
      '################', '#...............', '#...............', '#...############', '#...#...........', '#...#...........', '#...#...####....',
      '#.......#.......', '#.......#.......', '#...#...#...#...', '#...#.......#...', '#...#.......#...', '#...#...........', '#...#...........',
      '#...#...####....', '#...............', '#...............', '#...####........', '#...............', '################'] },
    scatter: { name: 'BADLANDS', rows: [
      '################', '#...............', '#...............', '#......##.......', '#...............', '#..#........#...', '#..#........#...',
      '#...............', '#.......#.......', '#.......#.......', '#...............', '#...........##..', '#...............', '#.....#.........',
      '#.....#.........', '#...............', '#..##.......#...', '#...........#...', '#...............', '################'] },
    portal: { name: 'WORMHOLES', rows: [
      '################', '#...............', '#...............', '#.....#.........', '#.....#....###..', '#.....#.........', '#...............',
      '#..###......#...', '#...........#...', '#.......#...#...', '#.......#.......', '#.......#.......', '#...............', '#...###.........',
      '#...........#...', '#...........#...', '#...........#...', '#...............', '#...............', '################'],
      portals: [[2.5, 2.5, 29.5, 17.5], [14.5, 17.5, 17.5, 2.5]] },
    hill: { name: 'THE HILL', rows: [
      '################', '#...............', '#...............', '#....##.........', '#...............', '#...........##..', '#..#............',
      '#..#.......#....', '#..........#....', '#...............', '#...............', '#..........#....', '#..#.......#....', '#..#............',
      '#...........##..', '#...............', '#....##.........', '#...............', '#...............', '################'], hill: [16, 10, 2.6] },
    chaos: { name: 'SCRAPYARD', rows: [
      '################', '#...............', '#...............', '#...BB..........', '#...BB......#...', '#...........#...', '#.......BBB.....',
      '#...............', '#...#...........', '#...#...........', '#...#...........', '#...#.......BB..', '#...............', '#.......BBB.....',
      '#...........#...', '#...BB......#...', '#...BB..........', '#...............', '#...............', '################'],
      movers: [{ x: 14.5, y: 2, w: 1, h: 2, bx: 14.5, by: 8, period: 6, phase: 0 }], portals: [[2.5, 2.5, 29.5, 17.5]] },
  };
  function buildTiles(mapId) {
    const m = MAPS[mapId], t = new Uint8Array(COLS * ROWS);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < 16; x++) {
      const c = m.rows[y][x], v = c === '#' ? WALL : c === 'B' ? BRICK : EMPTY;
      t[y * COLS + x] = v; t[(ROWS - 1 - y) * COLS + (COLS - 1 - x)] = v;
    }
    return t;
  }
  function buildMovers(mapId) {
    const out = [];
    for (const d of MAPS[mapId].movers || []) {
      out.push({ ax: d.x, ay: d.y, bx: d.bx, by: d.by, w: d.w, h: d.h, period: d.period, phase: d.phase, x: d.x, y: d.y, vx: 0, vy: 0 });
      // mirrored partner (180°): centre (x+w/2, y+h/2) -> (32-., 20-.)
      out.push({ ax: COLS - d.x - d.w, ay: ROWS - d.y - d.h, bx: COLS - d.bx - d.w, by: ROWS - d.by - d.h, w: d.w, h: d.h, period: d.period, phase: d.phase, x: 0, y: 0, vx: 0, vy: 0 });
    }
    return out;
  }

  /* ---------- the numbered game variations ---------- */
  // shell: straight | guided | seeker ; bounces = max wall bounces ; bank = must bounce before it can score
  const V = (o) => Object.assign({ map: 'open', shell: 'straight', bounces: 0, bank: false, invisible: false, night: false, weather: null, destructible: false,
    powerups: false, special: null, speed: 1, hill: false, portals: false, movers: false, ice: false }, o);
  const VARIANTS = [
    V({ name: 'OPEN FIELD', desc: 'Straight shells, nowhere to hide. Pure duel.' }),
    V({ name: 'CLASSIC MAZE', map: 'classic', desc: 'Straight shells in the classic maze.' }),
    V({ name: 'GUIDED MISSILES', map: 'classic', shell: 'guided', desc: 'Steer your shell after firing (turn while it flies).' }),
    V({ name: 'GUIDED · OPEN FIELD', shell: 'guided', desc: 'Guided missiles with no cover at all.' }),
    V({ name: 'RICOCHET', map: 'bunker', bounces: 1, desc: 'Shells bounce once off walls. Watch your own ricochet!' }),
    V({ name: 'PINBALL', map: 'pinball', bounces: 5, desc: 'Shells bounce up to five times among the pillars.' }),
    V({ name: 'BANK SHOT', map: 'bunker', bounces: 3, bank: true, desc: 'A hit only counts after the shell has bounced.' }),
    V({ name: 'INVISIBLE TANKS', map: 'classic', invisible: true, desc: 'Tanks show only when firing, bumping walls or hit.' }),
    V({ name: 'INVISIBLE GUIDED', shell: 'guided', invisible: true, desc: 'Invisible tanks with guided missiles, open field.' }),
    V({ name: 'INVISIBLE RICOCHET', map: 'pinball', bounces: 3, invisible: true, desc: 'Invisible tanks, three-bounce shells.' }),
    V({ name: 'DEMOLITION', map: 'city', destructible: true, desc: 'Blast through brick walls. Three hits per brick.' }),
    V({ name: 'BRICK BREAKER', map: 'city', destructible: true, bounces: 2, desc: 'Bouncing shells chew up the brick city.' }),
    V({ name: 'MOVING WALLS', map: 'yard', movers: true, desc: 'Steel blocks slide across the rail yard.' }),
    V({ name: 'CRUSHER RICOCHET', map: 'yard', movers: true, bounces: 2, desc: 'Moving walls and two-bounce shells.' }),
    V({ name: 'NIGHT PATROL', map: 'classic', night: true, desc: 'Darkness. Only headlights, muzzle flashes and fire.' }),
    V({ name: 'NIGHT RICOCHET', map: 'bunker', night: true, bounces: 2, desc: 'Bank shots in the dark.' }),
    V({ name: 'TURBO', map: 'raceway', speed: 1.35, special: 'nitro', desc: 'Fast tanks. ENTER fires the nitro boost.' }),
    V({ name: 'ARSENAL', map: 'classic', powerups: true, desc: 'Grab power-ups: shield, triple shot, mines, speed, mega shell.' }),
    V({ name: 'MINEFIELD', map: 'scatter', special: 'mine', desc: 'ENTER drops a hidden mine (3, recharging).' }),
    V({ name: 'BLIZZARD', map: 'scatter', weather: 'snow', ice: true, bounces: 1, desc: 'Snow and ice: tanks slide. One bounce.' }),
    V({ name: 'MONSOON', map: 'classic', weather: 'rain', night: true, bounces: 1, desc: 'Night storm, rain and lightning. One bounce.' }),
    V({ name: 'WORMHOLES', map: 'portal', portals: true, bounces: 1, desc: 'Tanks and shells jump through linked portals.' }),
    V({ name: 'SEEKERS', map: 'bunker', shell: 'seeker', desc: 'Shells curve toward the enemy on their own.' }),
    V({ name: 'KING OF THE HILL', map: 'hill', hill: true, desc: 'Hits score, and so does holding the hill alone for 5 s.' }),
    V({ name: 'MEGA SHELL', map: 'city', destructible: true, special: 'mega', desc: 'ENTER fires a mega shell that smashes bricks (8 s recharge).' }),
    V({ name: 'CHAOS', map: 'chaos', powerups: true, movers: true, portals: true, destructible: true, bounces: 2, weather: 'rain', desc: 'Everything at once.' }),
  ];
  VARIANTS.forEach((v, i) => { v.n = i + 1; v.tags = tagsOf(v); });
  function tagsOf(v) {
    const t = [];
    t.push(v.shell === 'guided' ? 'GUIDED' : v.shell === 'seeker' ? 'SEEKER' : 'STRAIGHT');
    if (v.bounces) t.push(v.bank ? 'BANK ' + v.bounces : 'BOUNCE ' + v.bounces);
    if (v.invisible) t.push('INVISIBLE'); if (v.night) t.push('NIGHT'); if (v.weather) t.push(v.weather.toUpperCase());
    if (v.destructible) t.push('DESTRUCTIBLE'); if (v.movers) t.push('MOVING WALLS'); if (v.portals) t.push('PORTALS');
    if (v.powerups) t.push('POWER-UPS'); if (v.special) t.push('ENTER: ' + v.special.toUpperCase()); if (v.hill) t.push('HILL'); if (v.speed > 1) t.push('FAST');
    t.push(MAPS[v.map].name); return t;
  }
  const ROUNDS = [
    { id: 't136', label: '2:16 (CLASSIC)', type: 'time', secs: 136 },
    { id: 't90', label: '1:30', type: 'time', secs: 90 },
    { id: 't180', label: '3:00', type: 'time', secs: 180 },
    { id: 's5', label: 'FIRST TO 5', type: 'score', n: 5 },
    { id: 's10', label: 'FIRST TO 10', type: 'score', n: 10 },
    { id: 's15', label: 'FIRST TO 15', type: 'score', n: 15 },
  ];
  const PU_TYPES = ['shield', 'triple', 'mines', 'speed', 'mega'];

  /* ---------- tiny deterministic RNG ---------- */
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  /* ---------- geometry helpers shared with the AI / renderer ---------- */
  function tileAt(g, x, y) { const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return WALL; return g.tiles[ty * COLS + tx]; }
  function solidAt(g, x, y) { return tileAt(g, x, y) !== EMPTY; }
  function moverAt(g, x, y, pad) { pad = pad || 0; for (const m of g.movers) if (x > m.x - pad && x < m.x + m.w + pad && y > m.y - pad && y < m.y + m.h + pad) return m; return null; }
  /** push a circle out of tiles + movers. returns true if it touched anything */
  function resolveCircle(g, o, r) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const x0 = Math.floor(o.x - r), x1 = Math.floor(o.x + r), y0 = Math.floor(o.y - r), y1 = Math.floor(o.y + r);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && g.tiles[ty * COLS + tx] === EMPTY) continue;
        if (pushOutBox(o, r, tx, ty, 1, 1)) { moved = hit = true; }
      }
      for (const m of g.movers) if (pushOutBox(o, r, m.x, m.y, m.w, m.h)) { moved = hit = true; }
      if (!moved) break;
    }
    return hit;
  }
  function pushOutBox(o, r, bx, by, bw, bh) {
    const cx = clamp(o.x, bx, bx + bw), cy = clamp(o.y, by, by + bh);
    let dx = o.x - cx, dy = o.y - cy; const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 < 1e-9) { // centre inside the box: push along the shallowest axis
      const l = o.x - bx, rr = bx + bw - o.x, t = o.y - by, b = by + bh - o.y, m = Math.min(l, rr, t, b);
      if (m === l) o.x = bx - r; else if (m === rr) o.x = bx + bw + r; else if (m === t) o.y = by - r; else o.y = by + bh + r;
      return true;
    }
    const d = Math.sqrt(d2), k = (r - d) / d; o.x += dx * k; o.y += dy * k; return true;
  }
  /** line of sight between two points (tiles + movers), sampled */
  function los(g, x0, y0, x1, y1, ignoreBricks) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), n = Math.ceil(d / 0.2);
    for (let i = 1; i < n; i++) { const x = x0 + dx * i / n, y = y0 + dy * i / n; const t = tileAt(g, x, y); if (t === WALL || (t === BRICK && !ignoreBricks)) return false; if (moverAt(g, x, y)) return false; }
    return true;
  }

  /* ---------- shells: one movement routine used by the game AND the AI's trace ---------- */
  // returns 'ok' | 'gone' ; mutates s. cb(kind, info) for events
  function moveShell(g, s, dt, cb) {
    const sp = Math.hypot(s.vx, s.vy), steps = Math.max(1, Math.ceil(sp * dt / 0.15)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const ox = s.x, oy = s.y, nx = s.x + s.vx * h, ny = s.y + s.vy * h;
      const tN = tileAt(g, nx, ny), mv = moverAt(g, nx, ny);
      if (tN === EMPTY && !mv) { s.x = nx; s.y = ny; continue; }
      if (tN === BRICK && s.mega) { // mega shell smashes straight through bricks
        cb && cb('brick', { tx: Math.floor(nx), ty: Math.floor(ny), dmg: 99, x: nx, y: ny });
        if (tileAt(g, nx, ny) === EMPTY) { s.x = nx; s.y = ny; continue; }
      }
      // which axis did we cross?
      let rx = false, ry = false;
      if (mv) { const pl = nx - mv.x, pr = mv.x + mv.w - nx, pt = ny - mv.y, pb = mv.y + mv.h - ny; if (Math.min(pl, pr) < Math.min(pt, pb)) rx = true; else ry = true; }
      else {
        const sx = solidAt(g, nx, oy), sy = solidAt(g, ox, ny);
        if (sx && !sy) rx = true; else if (sy && !sx) ry = true; else if (sx && sy) { rx = ry = true; }
        else { // diagonal corner hit
          const fx = Math.floor(nx) !== Math.floor(ox), fy = Math.floor(ny) !== Math.floor(oy);
          if (fx && fy) { rx = ry = true; } else if (fx) rx = true; else ry = true;
        }
      }
      if (tN === BRICK && !s.mega) cb && cb('brick', { tx: Math.floor(nx), ty: Math.floor(ny), dmg: 1, x: nx, y: ny });
      if (s.bounce < s.maxB) {
        if (rx) s.vx = -s.vx; if (ry) s.vy = -s.vy;
        s.bounce++; s.a = Math.atan2(s.vy, s.vx);
        cb && cb('ric', { x: ox, y: oy, mover: !!mv });
        if (tN === BRICK) { cb && cb('gone', { x: ox, y: oy, brick: 1 }); return 'gone'; } // bricks absorb shells
      } else { cb && cb('thud', { x: ox, y: oy, brick: tN === BRICK }); return 'gone'; }
    }
    return 'ok';
  }

  /* ---------- game ---------- */
  function createGame(cfg) {
    cfg = Object.assign({ variant: 0, round: 't136', seed: 12345, cpu: [false, true], names: ['PLAYER 1', 'CPU'] }, cfg || {});
    const v = VARIANTS[cfg.variant] || VARIANTS[0], round = ROUNDS.find(r => r.id === cfg.round) || ROUNDS[0];
    const g = {
      cfg, v, round, rnd: rng(cfg.seed), tiles: buildTiles(v.map), hp: new Uint8Array(COLS * ROWS), movers: v.movers ? buildMovers(v.map) : [],
      portals: [], hill: null, tanks: [], shells: [], mines: [], pups: [], events: [], t: 0, frame: 0,
      phase: 'countdown', phaseT: 3.0, timeLeft: round.type === 'time' ? round.secs : 0, overtime: false, winner: -1, puT: 6, nextId: 1, tilesVer: 0, cease: 0,
    };
    for (let i = 0; i < g.tiles.length; i++) g.hp[i] = g.tiles[i] === BRICK ? BRICK_HP : 0;
    if (!v.destructible) for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === BRICK) g.tiles[i] = WALL;
    if (v.portals) for (const p of MAPS[v.map].portals || []) { const a = g.portals.length; g.portals.push({ x: p[0], y: p[1], to: a + 1 }, { x: p[2], y: p[3], to: a }); }
    if (v.hill && MAPS[v.map].hill) { const h = MAPS[v.map].hill; g.hill = { x: h[0], y: h[1], r: h[2], owner: -1, prog: 0 }; }
    g.tanks = [mkTank(0, 2.5, 10, 0, v), mkTank(1, COLS - 2.5, ROWS - 10, Math.PI, v)];
    updateMovers(g, 0);
    g.events.push({ e: 'round', t: 0 });
    return g;
  }
  function mkTank(id, x, y, a, v) {
    return { id, x, y, a, vx: 0, vy: 0, sx: x, sy: y, sa: a, score: 0, spin: 0, spinDir: 1, kvx: 0, kvy: 0, inv: 0, reload: 0, visT: 1.5, shield: 0, triple: 0, speedT: 0,
      sp: { type: v.special, n: v.special === 'mine' ? 3 : v.special ? 1 : 0, cd: 0 }, bumpT: 0, moving: 0, tread: [0, 0], firedN: 0, lastFire: -9, fireBuf: 0, specBuf: 0,
      seenFireN: 0, seenSpecN: 0, hillT: 0, dist: 0, recoil: 0, pcd: 0, prot: 0, respawns: 0 };
  }
  function updateMovers(g, t) {
    for (const m of g.movers) {
      const u = 0.5 - 0.5 * Math.cos(2 * Math.PI * t / m.period + m.phase);
      const nx = m.ax + (m.bx - m.ax) * u, ny = m.ay + (m.by - m.ay) * u;
      m.vx = (nx - m.x) / DT; m.vy = (ny - m.y) / DT; m.x = nx; m.y = ny;
    }
  }
  function ev(g, e) { e.t = g.t; g.events.push(e); }
  const isVisible = (g, tk) => !g.v.invisible || tk.visT > 0 || tk.spin > 0;

  function fire(g, tk, mega) {
    const v = g.v, base = v.shell === 'guided' ? 8.5 : v.shell === 'seeker' ? 9.5 : 11.5, speed = mega ? 10 : base * (v.speed > 1 ? 1.1 : 1);
    const life = mega ? 3.2 : v.shell === 'guided' ? 3.4 : v.bounces ? 2.2 + 0.25 * Math.min(v.bounces, 4) : 1.9;
    const n = mega ? 1 : tk.triple > 0 ? 3 : 1;
    for (let k = 0; k < n; k++) {
      const a = tk.a + (n === 3 ? (k - 1) * 0.2 : 0);
      const mx = tk.x + Math.cos(a) * (TANK_R + 0.25), my = tk.y + Math.sin(a) * (TANK_R + 0.25);
      // don't spawn inside a wall: fizzle against it
      const s = { id: g.nextId++, owner: tk.id, x: tk.x, y: tk.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a, life, age: 0, bounce: 0, maxB: mega ? 2 : v.bounces, mega: !!mega, guided: v.shell === 'guided' && !mega, seeker: v.shell === 'seeker' && !mega, pcd: 0 };
      // advance from the tank centre to the muzzle with wall checks so point-blank shots behave
      const tmp = { x: tk.x, y: tk.y, vx: mx - tk.x, vy: my - tk.y, bounce: s.maxB, maxB: s.maxB, mega: s.mega };
      const res = moveShell(g, tmp, 1, null);
      if (res === 'gone') { ev(g, { e: 'thud', x: tmp.x, y: tmp.y, owner: tk.id }); continue; }
      s.x = mx; s.y = my; g.shells.push(s);
    }
    tk.prot = 0; // firing ends spawn protection early
    tk.lastFire = g.t; tk.reload = mega ? 0.6 : 0.42; tk.visT = Math.max(tk.visT, 0.9); tk.recoil = 1; tk.firedN++;
    if (tk.triple > 0) tk.triple--;
    // recoil nudge
    tk.vx -= Math.cos(tk.a) * 0.8; tk.vy -= Math.sin(tk.a) * 0.8;
    ev(g, { e: 'fire', tank: tk.id, x: tk.x + Math.cos(tk.a) * (TANK_R + 0.3), y: tk.y + Math.sin(tk.a) * (TANK_R + 0.3), a: tk.a, mega: !!mega, guided: v.shell === 'guided' });
  }
  function hitTank(g, victim, byId, sx, sy, svx, svy, cause) {
    if (victim.spin > 0 || victim.inv > 0 || victim.prot > 0) return false;
    if (victim.shield > 0) { victim.shield = 0; victim.inv = 0.5; const l = Math.hypot(svx, svy) || 1; victim.kvx = svx / l * 2.5; victim.kvy = svy / l * 2.5; ev(g, { e: 'shield', tank: victim.id, x: victim.x, y: victim.y }); return true; }
    const scorer = byId === victim.id ? 1 - victim.id : byId;
    const l = Math.hypot(svx, svy) || 1;
    victim.spin = 1.1; victim.spinDir = (svx * Math.sin(victim.a) - svy * Math.cos(victim.a)) > 0 ? 1 : -1;
    victim.kvx = svx / l * 6.5; victim.kvy = svy / l * 6.5; victim.visT = 2.2;
    if (g.phase === 'play') { g.tanks[scorer].score++; if (!g.cfg.legacySpawn) g.cease = Math.max(g.cease, 0.75); } // brief ceasefire after every kill
    ev(g, { e: 'hit', tank: victim.id, by: scorer, self: byId === victim.id, x: victim.x, y: victim.y, a: Math.atan2(svy, svx), cause: cause || 'shell', score: [g.tanks[0].score, g.tanks[1].score] });
    checkWin(g);
    return true;
  }
  /* ---------- respawn: a destroyed tank comes back somewhere safe ----------
     Candidate spawn points are every open cell the hull fits in (recomputed when bricks fall). Each is scored by
     maze (BFS) distance from the killer, no straight line of fire from the killer, openness and a little
     randomness. Points near movers' rails, mines, portals, the hill, shells in flight or the killer are skipped. */
  const SPAWN_PROT = 2.0;
  function hullFits(g, x, y, r) {
    if (solidAt(g, x, y)) return false;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (solidAt(g, x + Math.cos(a) * r, y + Math.sin(a) * r)) return false; }
    return true;
  }
  function spawnCands(g) {
    if (g._cands && g._candsVer === g.tilesVer) return g._cands;
    const c = [];
    for (let ty = 1; ty < ROWS - 1; ty++) for (let tx = 1; tx < COLS - 1; tx++) { const x = tx + 0.5, y = ty + 0.5; if (hullFits(g, x, y, TANK_R + 0.14)) c.push([x, y]); }
    g._cands = c; g._candsVer = g.tilesVer; return c;
  }
  function bfsFrom(g, x, y) {
    const N = COLS * ROWS, d = new Int16Array(N).fill(-1), q = new Int32Array(N); let h = 0, t = 0;
    const k0 = clamp(Math.floor(y), 0, ROWS - 1) * COLS + clamp(Math.floor(x), 0, COLS - 1); d[k0] = 0; q[t++] = k0;
    while (h < t) { const k = q[h++], cx = k % COLS, cy = (k / COLS) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue; const nk = ny * COLS + nx; if (d[nk] >= 0 || g.tiles[nk] !== EMPTY) continue; d[nk] = d[k] + 1; q[t++] = nk; } }
    return d;
  }
  function openRay(g, x, y, a, max) { const c = Math.cos(a), s = Math.sin(a); let r = 0.3; for (; r < max; r += 0.25) { if (solidAt(g, x + c * r, y + s * r) || moverAt(g, x + c * r, y + s * r, 0.2)) break; } return r; }
  function nearMoverRail(g, x, y, pad) {
    for (const m of g.movers) { const x0 = Math.min(m.ax, m.bx) - pad, x1 = Math.max(m.ax, m.bx) + m.w + pad, y0 = Math.min(m.ay, m.by) - pad, y1 = Math.max(m.ay, m.by) + m.h + pad; if (x > x0 && x < x1 && y > y0 && y < y1) return true; }
    return false;
  }
  function pickSpawn(g, tk) {
    const K = g.tanks[1 - tk.id], cands = spawnCands(g), dist = bfsFrom(g, K.x, K.y);
    let best = null, bs = -1e9;
    const pass = strict => {
      for (const [x, y] of cands) {
        const de = Math.hypot(x - K.x, y - K.y);
        if (de < (strict ? 7 : 3.5)) continue;
        if (nearMoverRail(g, x, y, strict ? 0.9 : 0.6) || moverAt(g, x, y, 0.9)) continue;
        if (g.mines.some(m => Math.hypot(m.x - x, m.y - y) < (strict ? 1.8 : 1.2))) continue;
        if (g.portals.some(p => Math.hypot(p.x - x, p.y - y) < 1.5)) continue;
        if (g.hill && Math.hypot(g.hill.x - x, g.hill.y - y) < g.hill.r + 1) continue;
        if (strict && g.shells.some(s => Math.hypot(s.x - x, s.y - y) < 3)) continue;
        if (g.pups.some(p => Math.hypot(p.x - x, p.y - y) < 0.9)) continue;
        const k = Math.floor(y) * COLS + Math.floor(x), bd = dist[k] < 0 ? 30 : dist[k];
        const sight = los(g, K.x, K.y, x, y);
        let open = 0; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (!solidAt(g, x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2)) open++; }
        const sc = Math.min(bd, 34) + (sight ? 0 : 12) + 0.25 * Math.min(de, 30) + 0.6 * open - 0.12 * Math.hypot(x - tk.sx, y - tk.sy) + g.rnd() * 2.5;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
    };
    pass(true); if (!best) pass(false);
    if (!best) best = [tk.sx, tk.sy];
    // face the most open direction (ties lean away from the killer)
    let ba = tk.sa, bl = -1; const away = Math.atan2(best[1] - K.y, best[0] - K.x);
    for (let i = 0; i < 16; i++) { const a = wrapA(i * Math.PI / 8); const l = openRay(g, best[0], best[1], a, 10) + 0.4 * Math.cos(wrapA(a - away)); if (l > bl) { bl = l; ba = a; } }
    return { x: best[0], y: best[1], a: ba };
  }
  function respawn(g, tk) {
    const from = [tk.x, tk.y], p = pickSpawn(g, tk), K = g.tanks[1 - tk.id];
    tk.x = p.x; tk.y = p.y; tk.a = p.a; tk.vx = tk.vy = tk.kvx = tk.kvy = 0; tk.inv = 0; tk.prot = SPAWN_PROT; tk.respawns++; tk.fireBuf = 0; tk.recoil = 0;
    if (g.v.invisible) tk.visT = 0; // keep invisible tanks hidden: the shimmer is only shown to its owner
    ev(g, { e: 'respawn', tank: tk.id, x: p.x, y: p.y, a: p.a, fx: from[0], fy: from[1] });
    // nudge the killer back toward its own side so the duel restarts fairly
    if (K.spin <= 0) {
      const hx = K.sx - K.x, hy = K.sy - K.y, dh = Math.hypot(hx, hy);
      if (dh > 1.5) { const push = Math.min(3, dh * 0.4), v0 = push * 3.9; K.kvx = hx / dh * v0; K.kvy = hy / dh * v0; ev(g, { e: 'nudge', tank: K.id, x: K.x, y: K.y }); }
    }
  }
  function checkWin(g) {
    const [a, b] = g.tanks;
    if (g.phase !== 'play') return;
    if (g.round.type === 'score' && (a.score >= g.round.n || b.score >= g.round.n)) return endGame(g, a.score > b.score ? 0 : 1);
    if (g.overtime && a.score !== b.score) return endGame(g, a.score > b.score ? 0 : 1);
  }
  function endGame(g, w) { g.phase = 'over'; g.winner = w; g.phaseT = 0; g.shells.length = 0; ev(g, { e: 'over', winner: w, score: [g.tanks[0].score, g.tanks[1].score] }); }

  /** inputs: [{turn, thrust, fire, fireN, spec, specN, dx, dy}, ...] */
  function step(g, inputs) {
    g.events.length = 0;
    g.t += DT; g.frame++;
    if (g.phase === 'countdown') {
      const before = Math.ceil(g.phaseT); g.phaseT -= DT; const after = Math.ceil(g.phaseT);
      if (after !== before && after > 0) ev(g, { e: 'count', n: after });
      if (g.phaseT <= 0) { g.phase = 'play'; ev(g, { e: 'go' }); }
    } else if (g.phase === 'play') {
      if (g.round.type === 'time' && !g.overtime) {
        g.timeLeft -= DT;
        if (g.timeLeft <= 10 && Math.ceil(g.timeLeft) !== Math.ceil(g.timeLeft + DT)) ev(g, { e: 'tick', n: Math.ceil(g.timeLeft) });
        if (g.timeLeft <= 0) {
          g.timeLeft = 0; const [a, b] = g.tanks;
          if (a.score === b.score) { g.overtime = true; ev(g, { e: 'overtime' }); } else endGame(g, a.score > b.score ? 0 : 1);
        }
      }
    } else if (g.phase === 'over') g.phaseT += DT;
    g.cease = Math.max(0, g.cease - DT);
    updateMovers(g, g.t);
    const live = g.phase !== 'over';
    for (const tk of g.tanks) stepTank(g, tk, (live && g.phase === 'play') ? inputs[tk.id] || {} : {}, g.phase === 'play');
    // tank vs tank
    const [A, B] = g.tanks, dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (d < TANK_R * 2 && d > 1e-6) { const p = (TANK_R * 2 - d) / 2, nx = dx / d, ny = dy / d; A.x -= nx * p; A.y -= ny * p; B.x += nx * p; B.y += ny * p; resolveCircle(g, A, TANK_R); resolveCircle(g, B, TANK_R); if (A.bumpT <= 0) { A.bumpT = 0.4; A.visT = Math.max(A.visT, 0.5); B.visT = Math.max(B.visT, 0.5); ev(g, { e: 'bump', tank: 0, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, tanks: 1 }); } }
    stepShells(g, inputs);
    stepMines(g);
    stepPowerups(g);
    stepHill(g);
  }
  function stepTank(g, tk, inp, active) {
    const v = g.v;
    tk.visT = Math.max(0, tk.visT - DT); tk.reload = Math.max(0, tk.reload - DT); tk.bumpT -= DT; tk.inv = Math.max(0, tk.inv - DT); tk.prot = Math.max(0, tk.prot - DT); tk.recoil = Math.max(0, tk.recoil - DT * 4);
    tk.speedT = Math.max(0, tk.speedT - DT); tk.pcd = Math.max(0, tk.pcd - DT);
    if (tk.shield > 0) tk.shield = Math.max(0, tk.shield - DT);
    if (tk.sp.cd > 0) { tk.sp.cd -= DT; if (tk.sp.cd <= 0) { tk.sp.cd = 0; if (tk.sp.type === 'mine' && tk.sp.n < 3 && v.special === 'mine') { tk.sp.n++; if (tk.sp.n < 3) tk.sp.cd = 8; } else if (tk.sp.type === 'mega' && v.special === 'mega') tk.sp.n = 1; else if (tk.sp.type === 'nitro' && v.special === 'nitro') tk.sp.n = 1; } }
    // input edges (counters survive dropped packets / frames)
    if (inp.fireN != null && inp.fireN !== tk.seenFireN) { if (inp.fireN > tk.seenFireN) tk.fireBuf = 0.25; tk.seenFireN = inp.fireN; }
    if (inp.specN != null && inp.specN !== tk.seenSpecN) { if (inp.specN > tk.seenSpecN) tk.specBuf = 0.25; tk.seenSpecN = inp.specN; }
    tk.fireBuf = Math.max(0, tk.fireBuf - DT); tk.specBuf = Math.max(0, tk.specBuf - DT);
    let turn = clamp(inp.turn || 0, -1, 1), thrust = clamp(inp.thrust || 0, -1, 1);
    if (inp.dx != null && (inp.dx || inp.dy)) { // direct steering: stick points where to go
      const m = Math.min(1, Math.hypot(inp.dx, inp.dy)), want = Math.atan2(inp.dy, inp.dx), diff = wrapA(want - tk.a);
      // allow reversing when the stick points mostly backwards and we are slow (feels natural on a stick)
      turn = clamp(diff * 3.2, -1, 1);
      thrust = m * Math.max(0, Math.cos(diff)) * (Math.abs(diff) < 1.25 ? 1 : 0);
    }
    const myShells = g.shells.filter(s => s.owner === tk.id);
    if (tk.spin > 0) {
      tk.spin -= DT; tk.a = wrapA(tk.a + tk.spinDir * DT * 11);
      tk.x += tk.kvx * DT; tk.y += tk.kvy * DT; tk.kvx *= Math.pow(0.03, DT); tk.kvy *= Math.pow(0.03, DT);
      tk.vx = 0; tk.vy = 0;
      if (resolveCircle(g, tk, TANK_R)) { tk.kvx *= -0.4; tk.kvy *= -0.4; }
      if (tk.spin <= 0) { tk.spin = 0; if (g.cfg.legacySpawn) tk.inv = 0.7; else respawn(g, tk); } // legacySpawn: old in-place recovery (tests only)
      tk.moving = 0; return;
    }
    if (tk.kvx || tk.kvy) { tk.x += tk.kvx * DT; tk.y += tk.kvy * DT; tk.kvx *= Math.pow(0.02, DT); tk.kvy *= Math.pow(0.02, DT); if (Math.abs(tk.kvx) + Math.abs(tk.kvy) < 0.05) tk.kvx = tk.kvy = 0; }
    const tr = drive(g, tk, turn, thrust);
    if (active && v.shell === 'guided') for (const s of myShells) if (s.guided) { const sp = Math.hypot(s.vx, s.vy); s.a = wrapA(s.a + turn * 2.7 * DT); s.vx = Math.cos(s.a) * sp; s.vy = Math.sin(s.a) * sp; }
    const fx = Math.cos(tk.a), fy = Math.sin(tk.a); void tr;
    // portals
    if (g.portals.length && tk.pcd <= 0) for (const p of g.portals) if (Math.hypot(tk.x - p.x, tk.y - p.y) < 0.45) {
      const q = g.portals[p.to]; ev(g, { e: 'portal', x: tk.x, y: tk.y, x2: q.x, y2: q.y, tank: tk.id });
      tk.x = q.x + Math.cos(tk.a) * 0.6; tk.y = q.y + Math.sin(tk.a) * 0.6; resolveCircle(g, tk, TANK_R); tk.pcd = 1.0; tk.visT = Math.max(tk.visT, 0.5); break;
    }
    if (!active) return;
    // fire: buffered press or held button
    const maxShells = tk.triple > 0 ? 3 : 1;
    if (g.cease > 0) { tk.fireBuf = 0; if (tk.specBuf > 0 && tk.sp.type === 'mega') tk.specBuf = 0; }
    if (g.cease <= 0 && (tk.fireBuf > 0 || inp.fire) && tk.reload <= 0 && myShells.length < maxShells && !(tk.triple > 0 && myShells.length > 0)) { fire(g, tk, false); tk.fireBuf = 0; }
    // special (ENTER)
    if (tk.specBuf > 0 && tk.sp.type && tk.sp.n > 0) {
      tk.specBuf = 0; const t = tk.sp.type;
      if (t === 'mine') { if (g.mines.filter(m => m.owner === tk.id).length < 4) { g.mines.push({ id: g.nextId++, owner: tk.id, x: tk.x - fx * 0.75, y: tk.y - fy * 0.75, arm: 1.0 }); tk.sp.n--; if (!tk.sp.cd && v.special === 'mine') tk.sp.cd = 8; ev(g, { e: 'minedrop', tank: tk.id, x: tk.x, y: tk.y }); } }
      else if (t === 'nitro') { tk.nitro = 1.6; tk.sp.n = 0; tk.sp.cd = 6; ev(g, { e: 'nitro', tank: tk.id, x: tk.x, y: tk.y }); }
      else if (t === 'mega') { if (tk.reload <= 0) { fire(g, tk, true); tk.sp.n = 0; tk.sp.cd = v.special === 'mega' ? 8 : 0; } else tk.specBuf = 0.2; }
      if (tk.sp.n <= 0 && v.special !== t) { tk.sp.type = v.special; tk.sp.n = 0; }
    }
  }
  /** movement + collisions only (also used by the online guest to predict its own tank) */
  function drive(g, tk, turn, thrust, quiet) {
    const v = g.v;
    const boost = (tk.speedT > 0 ? 1.45 : 1) * (tk.nitro > 0 ? 1.8 : 1);
    if (tk.nitro > 0) { tk.nitro -= DT; thrust = Math.max(thrust, 1); }
    const maxF = 4.3 * v.speed * boost, maxR = 2.7 * v.speed * boost;
    const tr = 2.9 * (v.speed > 1 ? 1.15 : 1);
    tk.a = wrapA(tk.a + turn * tr * DT);
    const want = thrust >= 0 ? thrust * maxF : thrust * maxR;
    const fx = Math.cos(tk.a), fy = Math.sin(tk.a);
    let fwd = tk.vx * fx + tk.vy * fy, lat = -tk.vx * fy + tk.vy * fx;
    const acc = v.ice ? 4.5 : 22, latDamp = v.ice ? 1.2 : 30;
    fwd += clamp(want - fwd, -acc * DT, acc * DT);
    lat -= clamp(lat, -latDamp * DT, latDamp * DT);
    tk.vx = fx * fwd - fy * lat; tk.vy = fy * fwd + fx * lat;
    const ox = tk.x, oy = tk.y;
    tk.x += tk.vx * DT; tk.y += tk.vy * DT;
    if (resolveCircle(g, tk, TANK_R)) {
      const ax = (tk.x - ox) / DT, ay = (tk.y - oy) / DT; const sp0 = Math.hypot(tk.vx, tk.vy);
      tk.vx = ax; tk.vy = ay;
      if (sp0 > 2.2 && tk.bumpT <= 0) { tk.bumpT = 0.5; tk.visT = Math.max(tk.visT, 0.6); if (!quiet) ev(g, { e: 'bump', tank: tk.id, x: tk.x + fx * TANK_R, y: tk.y + fy * TANK_R }); }
    }
    const moved = Math.hypot(tk.x - ox, tk.y - oy); tk.dist += moved;
    tk.moving = moved / DT;
    // treads: left/right belt speeds for the renderer (turning in place runs them opposite)
    tk.tread[0] += (fwd - turn * tr * 0.45) * DT; tk.tread[1] += (fwd + turn * tr * 0.45) * DT;
    tk.turnRate = turn * tr; tk.fwd = fwd;
    return tr;
  }
  function stepShells(g) {
    const v = g.v;
    for (let i = g.shells.length - 1; i >= 0; i--) {
      const s = g.shells[i]; s.age += DT; s.life -= DT; s.pcd = Math.max(0, s.pcd - DT);
      if (s.life <= 0) { ev(g, { e: 'fizzle', x: s.x, y: s.y, owner: s.owner }); g.shells.splice(i, 1); continue; }
      if (s.seeker) { // home on the enemy within a forward cone
        const tgt = g.tanks[1 - s.owner]; if (tgt.spin <= 0 && tgt.prot <= 0 && isVisible(g, tgt)) { const want = Math.atan2(tgt.y - s.y, tgt.x - s.x), d = wrapA(want - s.a);
          if (Math.abs(d) < 1.3 && s.age > 0.15) { const sp = Math.hypot(s.vx, s.vy); s.a = wrapA(s.a + clamp(d, -1.5 * DT, 1.5 * DT)); s.vx = Math.cos(s.a) * sp; s.vy = Math.sin(s.a) * sp; } }
      }
      let gone = false;
      const r = moveShell(g, s, DT, (k, o) => {
        if (k === 'brick') damageBrick(g, o.tx, o.ty, o.dmg, o.x, o.y);
        else if (k === 'ric') { ev(g, { e: 'ric', x: o.x, y: o.y, owner: s.owner, mover: o.mover }); g.tanks[s.owner].visT = Math.max(g.tanks[s.owner].visT, v.invisible ? 0.35 : 0); }
        else if (k === 'thud') ev(g, { e: 'thud', x: o.x, y: o.y, owner: s.owner, brick: o.brick, mega: s.mega });
      });
      if (r === 'gone') { g.shells.splice(i, 1); continue; }
      // portals
      if (g.portals.length && s.pcd <= 0) for (const p of g.portals) if (Math.hypot(s.x - p.x, s.y - p.y) < 0.4) { const q = g.portals[p.to]; ev(g, { e: 'portal', x: s.x, y: s.y, x2: q.x, y2: q.y, shell: 1 }); s.x = q.x + s.vx * 0.04; s.y = q.y + s.vy * 0.04; s.pcd = 0.4; break; }
      // tanks
      for (const tk of g.tanks) {
        if (tk.id === s.owner && s.bounce === 0) continue; // your own shell only threatens you after a ricochet
        if (Math.hypot(tk.x - s.x, tk.y - s.y) < TANK_R + SHELL_R) {
          if (tk.spin > 0 || tk.inv > 0 || tk.prot > 0) { if (tk.id !== s.owner) { gone = true; ev(g, { e: 'deflect', x: s.x, y: s.y }); } break; }
          if (v.bank && s.bounce === 0 && !s.mega) { ev(g, { e: 'deflect', x: s.x, y: s.y, bank: 1 }); gone = true; break; }
          hitTank(g, tk, s.owner, s.x, s.y, s.vx, s.vy, s.mega ? 'mega' : 'shell'); gone = true; break;
        }
      }
      if (gone) { g.shells.splice(i, 1); continue; }
    }
    // shell vs shell: both pop
    for (let i = 0; i < g.shells.length; i++) for (let j = i + 1; j < g.shells.length; j++) {
      const a = g.shells[i], b = g.shells[j]; if (a.owner === b.owner) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < SHELL_R * 3) { ev(g, { e: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); g.shells.splice(j, 1); g.shells.splice(i, 1); i--; break; }
    }
  }
  function damageBrick(g, tx, ty, dmg, x, y) {
    const k = ty * COLS + tx; if (g.tiles[k] !== BRICK) return;
    g.hp[k] = Math.max(0, g.hp[k] - dmg);
    if (g.hp[k] === 0) { g.tiles[k] = EMPTY; ev(g, { e: 'brick', tx, ty, hp: 0, x, y }); } else ev(g, { e: 'brick', tx, ty, hp: g.hp[k], x, y });
    g.tilesVer++;
  }
  function stepMines(g) {
    for (let i = g.mines.length - 1; i >= 0; i--) {
      const m = g.mines[i]; m.arm = Math.max(0, m.arm - DT); if (m.arm > 0) continue;
      for (const tk of g.tanks) {
        if (tk.spin > 0 || tk.prot > 0) continue;
        if (Math.hypot(tk.x - m.x, tk.y - m.y) < TANK_R + 0.3) {
          g.mines.splice(i, 1); ev(g, { e: 'mine', x: m.x, y: m.y, owner: m.owner });
          if (tk.inv <= 0) hitTank(g, tk, m.owner === tk.id ? 1 - tk.id : m.owner, m.x, m.y, tk.x - m.x + 1e-3, tk.y - m.y, 'mine');
          break;
        }
      }
    }
  }
  function stepPowerups(g) {
    if (!g.v.powerups || g.phase !== 'play') return;
    g.puT -= DT;
    if (g.puT <= 0 && g.pups.length < 2) {
      g.puT = 7 + g.rnd() * 5;
      for (let tries = 0; tries < 40; tries++) {
        const x = 2 + Math.floor(g.rnd() * (COLS - 4)) + 0.5, y = 2 + Math.floor(g.rnd() * (ROWS - 4)) + 0.5;
        if (solidAt(g, x, y) || solidAt(g, x + 0.6, y) || solidAt(g, x - 0.6, y) || solidAt(g, x, y + 0.6) || solidAt(g, x, y - 0.6) || moverAt(g, x, y, 0.8)) continue;
        if (g.tanks.some(t => Math.hypot(t.x - x, t.y - y) < 4)) continue;
        if (g.portals.some(p => Math.hypot(p.x - x, p.y - y) < 1.5)) continue;
        // fair: roughly equidistant from both tanks
        const d0 = Math.hypot(g.tanks[0].x - x, g.tanks[0].y - y), d1 = Math.hypot(g.tanks[1].x - x, g.tanks[1].y - y);
        if (Math.abs(d0 - d1) > 6 && tries < 30) continue;
        const type = PU_TYPES[Math.floor(g.rnd() * PU_TYPES.length)];
        g.pups.push({ id: g.nextId++, x, y, type, t: 0 }); ev(g, { e: 'puspawn', x, y, type }); break;
      }
    }
    for (let i = g.pups.length - 1; i >= 0; i--) {
      const p = g.pups[i]; p.t += DT;
      if (p.t > 16) { g.pups.splice(i, 1); ev(g, { e: 'puexpire', x: p.x, y: p.y }); continue; }
      for (const tk of g.tanks) if (tk.spin <= 0 && Math.hypot(tk.x - p.x, tk.y - p.y) < TANK_R + 0.4) {
        g.pups.splice(i, 1); applyPU(g, tk, p.type); ev(g, { e: 'pickup', tank: tk.id, type: p.type, x: p.x, y: p.y }); break;
      }
    }
  }
  function applyPU(g, tk, type) {
    if (type === 'shield') tk.shield = 12;
    else if (type === 'triple') tk.triple = 5;
    else if (type === 'speed') tk.speedT = 8;
    else if (type === 'mines') { tk.sp.type = 'mine'; tk.sp.n = 3; }
    else if (type === 'mega') { tk.sp.type = 'mega'; tk.sp.n = 1; }
  }
  function stepHill(g) {
    const h = g.hill; if (!h || g.phase !== 'play') return;
    const inside = g.tanks.filter(t => t.spin <= 0 && t.prot <= 0 && Math.hypot(t.x - h.x, t.y - h.y) < h.r);
    if (inside.length === 1) {
      const o = inside[0].id; if (h.owner !== o) { h.owner = o; h.prog = 0; }
      h.prog += DT / 5;
      if (h.prog >= 1) { h.prog = 0; g.tanks[o].score++; ev(g, { e: 'hill', tank: o, score: [g.tanks[0].score, g.tanks[1].score] }); checkWin(g); }
    } else if (inside.length === 0) { h.prog = Math.max(0, h.prog - DT / 10); if (h.prog === 0) h.owner = -1; }
  }
  /** reset scores/positions for a fresh round with the same variation (guest takes over mid-game) */
  function restart(g, keepSeed) {
    const n = createGame(Object.assign({}, g.cfg, keepSeed ? {} : { seed: (g.cfg.seed * 31 + 7) >>> 0 }));
    Object.keys(g).forEach(k => delete g[k]); Object.assign(g, n); return g;
  }

  /* ---------- AI helper: trace a would-be shot (bounces included) ---------- */
  function traceShot(g, x, y, a, opts) {
    opts = opts || {}; const v = g.v, speed = opts.speed || (v.shell === 'guided' ? 8.5 : v.shell === 'seeker' ? 9.5 : 11.5) * (v.speed > 1 ? 1.1 : 1);
    const life = opts.life || (v.bounces ? 2.2 + 0.25 * Math.min(v.bounces, 4) : 1.9);
    const s = { x: x + Math.cos(a) * (TANK_R + 0.25), y: y + Math.sin(a) * (TANK_R + 0.25), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, a, bounce: 0, maxB: opts.maxB != null ? opts.maxB : v.bounces, mega: !!opts.mega };
    const pts = [[s.x, s.y, 0, 0]]; const h = 1 / 30; let t = 0, ended = false;
    const fake = { tiles: g.tiles, movers: g.movers };
    if (solidAt(g, s.x, s.y)) return { pts, gone: true };
    while (t < life && !ended) { const r = moveShell(fake, s, h, null); t += h; pts.push([s.x, s.y, t, s.bounce]); if (r === 'gone') ended = true; }
    return { pts, gone: ended };
  }

  const API = { respawn, pickSpawn, spawnCands, SPAWN_PROT, drive, COLS, ROWS, DT, TANK_R, SHELL_R, EMPTY, WALL, BRICK, MAPS, VARIANTS, ROUNDS, PU_TYPES, createGame, step, restart, tileAt, solidAt, moverAt, resolveCircle, los, moveShell, traceShot, isVisible, wrapA, clamp, rng, hitTank, buildTiles };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.TDSim = API;
})(typeof window !== 'undefined' ? window : globalThis);
