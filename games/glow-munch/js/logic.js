/* GLOW MUNCH — maze, movement, wisp AI, scoring.
   Works in the browser (window.GlowLogic) and in Node (module.exports). */
(function (root) {
  'use strict';

  const COLS = 28;
  const ROWS_N = 31;
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const DIR_NAME = ['right', 'down', 'left', 'up'];
  const PREF = [3, 2, 1, 0]; // up, left, down, right

  const MAZE_ROWS = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o#  #.#   #.##.#   #.#  #o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.#####.##.#####.######',
    '######................######',
    '######.#..###--###..#.######',
    '######.#..#HHHHHH#..#.######',
    '######.#..#HHHHHH#..#.######',
    '######.#..########..#.######',
    'T......##############......T',
    '######.#####.##.#####.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#............##............#',
    '#..........................#',
    '############################'
  ];

  const START = { x: 13, y: 25 };
  const FRUIT_AT = { x: 14, y: 20 };
  const DOOR = { x: 14, y: 10 };
  const HOMES = [
    { x: 14, y: 10, dir: 2 },
    { x: 12, y: 13, dir: null },
    { x: 14, y: 13, dir: null },
    { x: 15, y: 13, dir: null }
  ];
  const GHOSTS = [
    { id: 0, name: 'RUSH', color: '#ff3b4e', scatter: { x: 25, y: -3 }, dots: 0, wait: 0 },
    { id: 1, name: 'VEIL', color: '#ff8ad4', scatter: { x: 2, y: -3 }, dots: 0, wait: 0.45 },
    { id: 2, name: 'ECHO', color: '#3dffe4', scatter: { x: 27, y: 33 }, dots: 18, wait: 3.1 },
    { id: 3, name: 'LOOM', color: '#ffb347', scatter: { x: 0, y: 33 }, dots: 42, wait: 6.2 }
  ];
  const TREATS = [
    { name: 'SPARK', points: 100 },
    { name: 'PIP', points: 300 },
    { name: 'PEACH', points: 500 },
    { name: 'APPLE', points: 700 },
    { name: 'MELON', points: 1000 },
    { name: 'COMET', points: 2000 },
    { name: 'BELL', points: 3000 },
    { name: 'KEY', points: 5000 }
  ];
  const ACTS = [
    { title: 'CORNERED', line: 'They break for the four corners.' },
    { title: 'AHEAD OF YOU', line: 'One of them aims where you are going.' },
    { title: 'THE MIRROR', line: 'One steers by where the chaser stands.' },
    { title: 'KEEP YOUR DISTANCE', line: 'The shy one hunts only from afar.' }
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(x, y) { return x + ',' + y; }
  function cell(x, y) {
    if (y < 0 || y >= ROWS_N) return '#';
    let xx = x;
    if (xx < 0 || xx >= COLS) {
      const dest = ((xx % COLS) + COLS) % COLS;
      const edge = xx < 0 ? 0 : COLS - 1;
      if (MAZE_ROWS[y][dest] !== 'T' && MAZE_ROWS[y][edge] !== 'T') return '#';
      xx = dest;
    }
    return MAZE_ROWS[y][xx];
  }
  function passable(x, y, ghost) {
    const t = cell(x, y);
    if (t === '#' || t == null) return false;
    if (t === '-' || t === 'H') {
      return !!(ghost && (ghost.mode === 'house' || ghost.mode === 'exit' || ghost.mode === 'eaten'));
    }
    return t === '.' || t === 'o' || t === ' ' || t === 'T';
  }
  function wrapActor(ent) {
    if (ent.x < -0.5) ent.x += COLS;
    else if (ent.x >= COLS - 0.5) ent.x -= COLS;
  }
  function distToNext(ent, dir) {
    if (dir === 0) return Math.floor(ent.x + 1e-8) + 1 - ent.x;
    if (dir === 2) return ent.x - (Math.ceil(ent.x - 1e-8) - 1);
    if (dir === 1) return Math.floor(ent.y + 1e-8) + 1 - ent.y;
    return ent.y - (Math.ceil(ent.y - 1e-8) - 1);
  }
  function snap(ent) {
    if (Math.abs(ent.x - Math.round(ent.x)) < 1e-4) ent.x = Math.round(ent.x);
    if (Math.abs(ent.y - Math.round(ent.y)) < 1e-4) ent.y = Math.round(ent.y);
  }

  function speeds(level) {
    const n = Math.min(Math.max(level, 1), 16);
    const p = 6.55 * (1 + (n - 1) * 0.045);
    return {
      player: p,
      playerFright: p * 1.08,
      ghost: p * 0.94,
      ghostFright: p * 0.56,
      eaten: p * 1.75,
      tunnel: p * 0.5,
      dash: p * 2.25
    };
  }
  function frightDuration(level) {
    return Math.max(1.25, 6.4 - (level - 1) * 0.42);
  }
  function scheduleFor(level) {
    if (level <= 1) {
      return [
        ['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20],
        ['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', 1e9]
      ];
    }
    if (level < 5) {
      return [
        ['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20],
        ['scatter', 5], ['chase', 1033], ['scatter', 0.02], ['chase', 1e9]
      ];
    }
    return [
      ['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', 20],
      ['scatter', 5], ['chase', 1e9]
    ];
  }
  function treatFor(level) { return TREATS[Math.min(Math.max(level, 1) - 1, TREATS.length - 1)]; }

  function validateMaze() {
    const errors = [];
    if (MAZE_ROWS.length !== ROWS_N) errors.push('row count ' + MAZE_ROWS.length);
    MAZE_ROWS.forEach((r, i) => { if (r.length !== COLS) errors.push('row ' + i + ' is ' + r.length); });
    let powers = 0, dots = 0, house = 0, doors = 0;
    for (let y = 0; y < MAZE_ROWS.length; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = MAZE_ROWS[y][x];
        const b = MAZE_ROWS[y][COLS - 1 - x];
        if (a !== b) errors.push('asym ' + x + ',' + y + ' ' + a + ' vs ' + b);
        if (a === 'o') powers++;
        if (a === '.' || a === 'o') dots++;
        if (a === 'H') house++;
        if (a === '-') doors++;
        if (y === 0 || y === ROWS_N - 1 || (a !== 'T' && (x === 0 || x === COLS - 1))) {
          if (a !== '#' && a !== 'T') errors.push('border ' + x + ',' + y);
        }
      }
    }
    if (powers !== 4) errors.push('powers ' + powers);
    if (doors !== 2) errors.push('doors ' + doors);
    if (house < 8) errors.push('house ' + house);
    if (MAZE_ROWS[15][0] !== 'T' || MAZE_ROWS[15][COLS - 1] !== 'T') errors.push('tunnel');
    const startCh = MAZE_ROWS[START.y][START.x];
    if (startCh === '#' || startCh === 'H' || startCh === '-') errors.push('start blocked');
    const seen = new Set();
    const q = [[START.x, START.y]];
    seen.add(key(START.x, START.y));
    while (q.length) {
      const [x, y] = q.shift();
      for (let d = 0; d < 4; d++) {
        let nx = x + DX[d], ny = y + DY[d];
        if (!passable(nx, ny, null)) continue;
        if (nx < 0 || nx >= COLS) nx = (nx + COLS) % COLS;
        const k = key(nx, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    for (let y = 0; y < ROWS_N; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = MAZE_ROWS[y][x];
        if ((a === '.' || a === 'o') && !seen.has(key(x, y))) errors.push('unreachable ' + x + ',' + y);
      }
    }
    if (!seen.has(key(FRUIT_AT.x, FRUIT_AT.y))) errors.push('fruit tile blocked');
    return { ok: errors.length === 0, errors, dots, powers, reachable: seen.size };
  }

  function bfs(sx, sy, gx, gy) {
    gx = Math.round(gx); gy = Math.round(gy);
    if (sx === gx && sy === gy) return [];
    if (!passable(gx, gy, null)) return null;
    const prev = new Map();
    const q = [[sx, sy]];
    prev.set(key(sx, sy), '');
    while (q.length) {
      const [x, y] = q.shift();
      for (let d = 0; d < 4; d++) {
        let nx = x + DX[d], ny = y + DY[d];
        if (!passable(nx, ny, null)) continue;
        if (nx < 0 || nx >= COLS) nx = (nx + COLS) % COLS;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        prev.set(k, key(x, y));
        if (nx === gx && ny === gy) {
          const path = [{ x: nx, y: ny }];
          let cur = key(x, y);
          while (cur && cur !== key(sx, sy)) {
            const parts = cur.split(',');
            path.push({ x: +parts[0], y: +parts[1] });
            cur = prev.get(cur);
          }
          path.reverse();
          return path;
        }
        q.push([nx, ny]);
      }
    }
    return null;
  }

  function dirBetween(x, y, n) {
    if (!n) return null;
    if (n.y === y && (n.x === x + 1 || (x === COLS - 1 && n.x === 0))) return 0;
    if (n.y === y && (n.x === x - 1 || (x === 0 && n.x === COLS - 1))) return 2;
    if (n.x === x && n.y === y + 1) return 1;
    if (n.x === x && n.y === y - 1) return 3;
    return null;
  }

  function chooseDir(ghost, tx, ty, target) {
    const back = ghost.dir == null ? -1 : (ghost.dir + 2) % 4;
    const options = [];
    for (let d = 0; d < 4; d++) {
      if (d === back) continue;
      if (passable(tx + DX[d], ty + DY[d], ghost)) options.push(d);
    }
    if (!options.length) {
      if (back >= 0 && passable(tx + DX[back], ty + DY[back], ghost)) return back;
      return ghost.dir;
    }
    if (ghost.mode === 'frightened') {
      return options[Math.floor(ghost.rng() * options.length)];
    }
    let best = options[0], bestD = Infinity;
    for (const d of PREF) {
      if (options.indexOf(d) < 0) continue;
      const nx = tx + DX[d], ny = ty + DY[d];
      const dist = (nx - target.x) * (nx - target.x) + (ny - target.y) * (ny - target.y);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  function ghostTarget(ghost, player, rush) {
    if (ghost.mode === 'eaten' || ghost.mode === 'exit' || ghost.mode === 'house') return { x: DOOR.x, y: DOOR.y };
    if (ghost.mode === 'scatter') return GHOSTS[ghost.id].scatter;
    const px = Math.round(player.x), py = Math.round(player.y);
    const dir = player.dir == null ? 2 : player.dir;
    if (ghost.id === 0) return { x: px, y: py };
    if (ghost.id === 1) {
      let tx = px + DX[dir] * 4;
      let ty = py + DY[dir] * 4;
      if (dir === 3) tx -= 4;
      return { x: tx, y: ty };
    }
    if (ghost.id === 2) {
      let ax = px + DX[dir] * 2;
      let ay = py + DY[dir] * 2;
      if (dir === 3) ax -= 2;
      const bx = rush ? rush.x : px;
      const by = rush ? rush.y : py;
      return { x: ax + (ax - bx), y: ay + (ay - by) };
    }
    const dist = Math.hypot(ghost.x - px, ghost.y - py);
    if (dist > 8) return { x: px, y: py };
    return GHOSTS[ghost.id].scatter;
  }

  function advance(ent, dt, ghost, onCenter) {
    let left = ent.speed * dt;
    let guard = 0;
    while (left > 1e-5 && guard++ < 40) {
      snap(ent);
      const on = ent.x === Math.round(ent.x) && ent.y === Math.round(ent.y);
      if (!on && !ghost && ent.wish != null && ent.dir != null && ent.wish !== ent.dir && (ent.wish % 2) !== (ent.dir % 2)) {
        const ahead = distToNext(ent, ent.dir);
        if (ahead < 0.3 && ahead > 1e-4) {
          const cx = Math.round(ent.x + DX[ent.dir] * ahead);
          const cy = Math.round(ent.y + DY[ent.dir] * ahead);
          if (passable(cx + DX[ent.wish], cy + DY[ent.wish], null)) {
            ent.x = cx; ent.y = cy; wrapActor(ent);
            ent.dir = ent.wish;
            left -= ahead;
            if (onCenter) onCenter(ent);
            continue;
          }
        }
      }
      if (on) {
        if (onCenter) onCenter(ent);
        if (ghost && ghost.mode === 'house') { ent.dir = null; return; }
        snap(ent);
        const tx = ent.x, ty = ent.y;
        if (ent.dir == null || !passable(tx + DX[ent.dir], ty + DY[ent.dir], ghost)) {
          if (!ghost) { ent.dir = null; return; }
          let found = null;
          for (let d = 0; d < 4; d++) if (passable(tx + DX[d], ty + DY[d], ghost)) { found = d; break; }
          ent.dir = found;
          if (found == null) return;
        }
      }
      if (ent.dir == null) return;
      const dist = distToNext(ent, ent.dir);
      const step = Math.min(left, Math.max(dist, 0));
      if (!(step > 1e-8)) return;
      ent.x += DX[ent.dir] * step;
      ent.y += DY[ent.dir] * step;
      wrapActor(ent);
      snap(ent);
      left -= step;
    }
  }

  function createGame(opts) {
    opts = opts || {};
    const rng = mulberry32(opts.seed == null ? 1 : (opts.seed | 0));
    const mazeCheck = validateMaze();
    if (!mazeCheck.ok) throw new Error('maze ' + mazeCheck.errors.join('; '));

    const game = {
      demo: !!opts.demo,
      level: 1,
      score: 0,
      lives: 3,
      extra: false,
      phase: 'ready',
      phaseT: opts.ready == null ? 1.35 : opts.ready,
      mode: 'scatter',
      modeI: 0,
      modeT: 0,
      fright: 0,
      chain: 0,
      dotsEaten: 0,
      totalDots: 0,
      dots: new Set(),
      powers: new Set(),
      fruit: null,
      fruitN: 0,
      fruitMarks: [],
      levelTime: 0,
      time: 0,
      shake: 0,
      streak: 0,
      lastDot: -10,
      streakMult: 1,
      pops: [],
      events: [],
      over: false,
      travel: 0,
      pendingOver: false,
      act: null,
      player: null,
      ghosts: [],
      rng: rng
    };

    function rebuildDots() {
      game.dots = new Set();
      game.powers = new Set();
      for (let y = 0; y < ROWS_N; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = MAZE_ROWS[y][x];
          if (t === '.' || t === 'o') game.dots.add(key(x, y));
          if (t === 'o') game.powers.add(key(x, y));
        }
      }
      game.dots.delete(key(START.x, START.y));
      game.totalDots = game.dots.size;
      game.dotsEaten = 0;
      game.fruit = null;
      game.fruitN = 0;
      game.fruitMarks = [Math.floor(game.totalDots * 0.3), Math.floor(game.totalDots * 0.68)];
    }

    function makeGhost(i) {
      const def = GHOSTS[i];
      const home = HOMES[i];
      return {
        id: i, name: def.name, color: def.color,
        x: home.x, y: home.y, dir: home.dir, speed: 0,
        mode: i === 0 ? 'scatter' : 'house',
        outAt: def.wait, dotsNeed: def.dots, release: null, rng: rng
      };
    }

    function placeActors(kind) {
      const p = game.player || {
        x: START.x, y: START.y, dir: 2, wish: null, wishHeld: false, wishAge: 0,
        goal: null, speed: 0, dash: 0, meter: 0
      };
      p.x = START.x; p.y = START.y; p.dir = 2; p.goal = null; p.dash = 0;
      if (kind === 'level') { p.wish = null; p.wishHeld = false; }
      game.player = p;
      if (game.ghosts.length !== 4) game.ghosts = [0, 1, 2, 3].map(makeGhost);
      const scale = Math.max(0.55, 1 - (game.level - 1) * 0.05);
      game.ghosts.forEach((g, i) => {
        const home = HOMES[i];
        g.x = home.x; g.y = home.y; g.dir = home.dir; g.release = null;
        if (i === 0) g.mode = game.mode === 'frightened' ? 'chase' : game.mode;
        else g.mode = 'house';
        if (kind === 'level') g.outAt = GHOSTS[i].wait * scale;
        else g.outAt = game.levelTime + 0.22 * i;
      });
    }

    function loadLevel(n, first) {
      game.level = n;
      rebuildDots();
      const sched = scheduleFor(n);
      game.mode = sched[0][0];
      game.modeI = 0;
      game.modeT = sched[0][1];
      game.fright = 0;
      game.chain = 0;
      game.streak = 0;
      game.streakMult = 1;
      game.act = null;
      placeActors('level');
      if (first) {
        game.phase = 'ready';
        game.phaseT = opts.ready == null ? 1.35 : opts.ready;
      }
    }

    loadLevel(opts.level || 1, true);
    if (opts.phase) { game.phase = opts.phase; game.phaseT = 0; }

    function dotsLeft() { return game.dots.size; }

    function pop(x, y, text, kind) {
      game.pops.push({ x: x, y: y, text: text, kind: kind || 'score', life: 0.95 });
      if (game.pops.length > 24) game.pops.shift();
    }

    function addScore(n) {
      const before = game.score;
      game.score += n;
      if (!game.extra && before < 10000 && game.score >= 10000) {
        game.extra = true;
        game.lives++;
        game.events.push('extra');
        pop(game.player.x, game.player.y - 1, '1UP', 'extra');
      }
    }

    function reverseOut() {
      game.ghosts.forEach(g => {
        if (g.mode === 'house' || g.mode === 'exit' || g.mode === 'eaten' || g.dir == null) return;
        g.dir = (g.dir + 2) % 4;
      });
    }

    function beginFright() {
      game.fright = frightDuration(game.level);
      game.chain = 0;
      game.ghosts.forEach(g => {
        if (g.mode === 'chase' || g.mode === 'scatter') {
          g.mode = 'frightened';
          if (g.dir != null) g.dir = (g.dir + 2) % 4;
        }
      });
    }

    function endFright() {
      game.fright = 0;
      game.ghosts.forEach(g => {
        if (g.mode === 'frightened') {
          g.mode = game.mode;
          if (g.dir != null) g.dir = (g.dir + 2) % 4;
        }
      });
    }

    function eatDot(x, y) {
      const k = key(x, y);
      if (!game.dots.has(k)) return;
      const power = game.powers.has(k);
      const gap = game.time - game.lastDot;
      game.dots.delete(k);
      game.powers.delete(k);
      game.dotsEaten++;
      game.lastDot = game.time;
      if (power) {
        addScore(50);
        pop(x, y, '50', 'power');
        game.events.push('power');
        beginFright();
        game.streak = Math.max(game.streak, 1);
        if (game.player.dash <= 0) game.player.meter = Math.min(100, game.player.meter + 28);
      } else {
        if (gap < 0.52) game.streak++;
        else game.streak = 1;
        const mult = 1 + Math.min(3, Math.floor((game.streak - 1) / 7));
        if (mult !== game.streakMult) {
          game.streakMult = mult;
          if (mult > 1) game.events.push('streak');
        }
        const pts = 10 * mult;
        addScore(pts);
        pop(x, y, mult > 1 ? pts + ' x' + mult : '', 'dot');
        game.events.push('dot');
        if (game.player.dash <= 0) game.player.meter = Math.min(100, game.player.meter + 7.5);
      }
      if (game.dots.size === 0) clearLevel();
    }

    function clearLevel() {
      const even = game.level % 2 === 0;
      game.phase = even ? 'act' : 'clear';
      game.phaseT = even ? 2.75 : 1.55;
      game.act = even ? ACTS[Math.floor((game.level / 2 - 1) % ACTS.length)] : null;
      game.events.push(even ? 'act' : 'clear');
      game.shake = Math.min(1, game.shake + 0.35);
    }

    function eatFruit() {
      if (!game.fruit) return;
      if (Math.hypot(game.player.x - game.fruit.x, game.player.y - game.fruit.y) > 0.55) return;
      addScore(game.fruit.points);
      pop(game.fruit.x, game.fruit.y, String(game.fruit.points), 'fruit');
      game.events.push('fruit');
      game.fruit = null;
      game.shake = Math.min(1, game.shake + 0.25);
    }

    function eatGhost(g) {
      const step = Math.min(game.chain, 3);
      const pts = 200 * Math.pow(2, step);
      game.chain++;
      addScore(pts);
      g.mode = 'eaten';
      g.dir = g.dir == null ? 3 : g.dir;
      pop(g.x, g.y - 0.2, String(pts), 'chain');
      game.events.push('ghost');
      game.shake = Math.min(1, game.shake + 0.22 + step * 0.12);
    }

    function killPlayer() {
      if (game.phase !== 'play') return;
      if (game.demo) {
        placeActors('death');
        game.lives = 3;
        game.player.dir = 2;
        return;
      }
      game.lives--;
      game.phase = 'die';
      game.phaseT = 1.15;
      game.pendingOver = game.lives <= 0;
      game.player.goal = null;
      game.player.dash = 0;
      game.events.push('die');
      game.shake = 1;
    }

    function collide() {
      for (let i = 0; i < game.ghosts.length; i++) {
        const g = game.ghosts[i];
        if (g.mode === 'eaten' || g.mode === 'house' || g.mode === 'exit') continue;
        if (Math.hypot(g.x - game.player.x, g.y - game.player.y) > 0.7) continue;
        if (g.mode === 'frightened') eatGhost(g);
        else { killPlayer(); return; }
      }
    }

    function ghostSpeed(g) {
      const s = speeds(game.level);
      if (g.mode === 'eaten') return s.eaten;
      if (g.mode === 'frightened') return s.ghostFright;
      const row = MAZE_ROWS[Math.round(g.y)];
      const xx = Math.round(g.x);
      if (row && row.indexOf('T') >= 0 && (xx <= 6 || xx >= COLS - 7)) return s.tunnel;
      let v = s.ghost;
      if (g.id === 0 && dotsLeft() < 20) v *= 1.08;
      if (g.id === 0 && dotsLeft() < 10) v *= 1.08;
      return v;
    }

    function playerSpeed() {
      const s = speeds(game.level);
      let v = game.fright > 0 ? s.playerFright : s.player;
      if (game.player.dash > 0) v = s.dash;
      return v;
    }

    function onPlayerCenter(p) {
      const tx = Math.round(p.x), ty = Math.round(p.y);
      eatDot(tx, ty);
      if (p.goal && !p.wishHeld) {
        if (tx === p.goal.x && ty === p.goal.y) p.goal = null;
        else {
          const path = bfs(tx, ty, p.goal.x, p.goal.y);
          const d = path && dirBetween(tx, ty, path[0]);
          if (d == null) p.goal = null;
          else p.wish = d;
        }
      }
      if (p.wish != null && passable(tx + DX[p.wish], ty + DY[p.wish], null)) p.dir = p.wish;
    }

    function revive(g) {
      const spot = HOMES[g.id] || HOMES[1];
      g.mode = 'house';
      g.x = g.id === 0 ? 14 : spot.x;
      g.y = 13;
      g.dir = null;
      g.release = 0.55;
      g.outAt = Infinity;
    }

    function onGhostCenter(g) {
      const tx = Math.round(g.x), ty = Math.round(g.y);
      if (g.mode === 'eaten' && Math.hypot(tx - DOOR.x, ty - DOOR.y) < 0.6 && ty <= DOOR.y) {
        revive(g);
        return;
      }
      if (g.mode === 'exit' && ty <= DOOR.y && cell(tx, ty) !== '-' && cell(tx, ty) !== 'H') {
        g.mode = game.fright > 0 ? 'frightened' : game.mode;
      }
      if (g.mode === 'house') { g.dir = null; return; }
      const target = ghostTarget(g, game.player, game.ghosts[0]);
      g.dir = chooseDir(g, tx, ty, target);
    }

    function steerDemo() {
      const p = game.player;
      if (p.goal) return;
      const sx = Math.round(p.x), sy = Math.round(p.y);
      let best = null, bestD = 1e9;
      game.dots.forEach(k => {
        const parts = k.split(',');
        const x = +parts[0], y = +parts[1];
        const d = Math.abs(x - sx) + Math.abs(y - sy);
        if (d < bestD) { bestD = d; best = { x: x, y: y }; }
      });
      if (best) p.goal = best;
    }

    function tryDash() {
      const p = game.player;
      if (game.phase !== 'play') return false;
      if (p.meter < 100 || p.dash > 0) return false;
      p.meter = 0;
      p.dash = 0.24;
      game.events.push('dash');
      game.shake = Math.min(1, game.shake + 0.18);
      return true;
    }

    function finishPhase() {
      if (game.phase === 'ready') { game.phase = 'play'; return; }
      if (game.phase === 'die') {
        if (game.pendingOver || game.lives <= 0) {
          game.phase = 'over';
          game.over = true;
          game.events.push('over');
          return;
        }
        placeActors('death');
        game.phase = 'ready';
        game.phaseT = 1.05;
        return;
      }
      if (game.phase === 'clear' || game.phase === 'act') {
        loadLevel(game.level + 1, false);
        game.phase = 'ready';
        game.phaseT = 1.15;
      }
    }

    function tick(dt) {
      game.time += dt;
      game.shake = Math.max(0, game.shake - dt * 1.4);
      for (let i = game.pops.length - 1; i >= 0; i--) {
        game.pops[i].life -= dt;
        game.pops[i].y -= dt * 0.55;
        if (game.pops[i].life <= 0) game.pops.splice(i, 1);
      }
      if (game.phase !== 'play') {
        game.phaseT -= dt;
        if (game.phaseT <= 0) finishPhase();
        return;
      }
      game.levelTime += dt;
      const p = game.player;
      if (!p.wishHeld) {
        p.wishAge += dt;
        if (p.wishAge > 0.17) p.wish = null;
      } else p.wishAge = 0;

      if (game.fright > 0) {
        game.fright -= dt;
        if (game.fright <= 0) endFright();
      } else {
        game.modeT -= dt;
        if (game.modeT <= 0) {
          const sched = scheduleFor(game.level);
          game.modeI = Math.min(sched.length - 1, game.modeI + 1);
          game.mode = sched[game.modeI][0];
          game.modeT = sched[game.modeI][1];
          game.ghosts.forEach(g => { if (g.mode === 'chase' || g.mode === 'scatter') g.mode = game.mode; });
          reverseOut();
        }
      }

      game.ghosts.forEach(g => {
        if (g.mode !== 'house') return;
        if (g.release != null) {
          g.release -= dt;
          if (g.release <= 0) { g.release = null; g.mode = 'exit'; }
          return;
        }
        if (game.dotsEaten >= g.dotsNeed || game.levelTime >= g.outAt) g.mode = 'exit';
      });

      if (!game.fruit && game.fruitN < 2 && game.dotsEaten >= game.fruitMarks[game.fruitN]) {
        const treat = treatFor(game.level);
        game.fruit = { x: FRUIT_AT.x, y: FRUIT_AT.y, left: 9, name: treat.name, points: treat.points };
        game.fruitN++;
        game.events.push('spawnfruit');
      } else if (game.fruit) {
        game.fruit.left -= dt;
        if (game.fruit.left <= 0) game.fruit = null;
      }

      if (game.demo) steerDemo();
      if (p.dash > 0) p.dash -= dt;
      const beforeX = p.x, beforeY = p.y;
      p.speed = playerSpeed();
      advance(p, dt, null, onPlayerCenter);
      game.travel += Math.hypot(p.x - beforeX, p.y - beforeY);
      if (game.phase !== 'play') return;
      eatFruit();

      game.ghosts.forEach(g => {
        if (g.mode === 'house') return;
        g.speed = ghostSpeed(g);
        advance(g, dt, g, onGhostCenter);
      });
      collide();

      if (game.streak > 0 && game.time - game.lastDot > 0.55) {
        game.streak = 0;
        game.streakMult = 1;
      }
    }

    game.step = function (dt) {
      game.events = [];
      let left = Math.max(0, Math.min(dt, 1));
      while (left > 1e-6) {
        const h = Math.min(left, 1 / 30);
        const phase = game.phase;
        tick(h);
        left -= h;
        if (game.phase !== phase && game.phase !== 'play') break;
      }
    };
    game.hold = function (dir) {
      const p = game.player;
      if (dir == null) {
        if (p.wishHeld) { p.wishHeld = false; p.wishAge = 0; }
        return;
      }
      p.wish = dir;
      p.wishHeld = true;
      p.wishAge = 0;
      p.goal = null;
    };
    game.release = function () { game.hold(null); };
    game.tapTile = function (x, y) {
      const p = game.player;
      const gx = Math.round(x), gy = Math.round(y);
      const path = bfs(Math.round(p.x), Math.round(p.y), gx, gy);
      p.goal = path ? { x: gx, y: gy } : null;
      p.wishHeld = false;
      return path;
    };
    game.dash = tryDash;
    game.targetOf = function (i) { return ghostTarget(game.ghosts[i], game.player, game.ghosts[0]); };
    game.speeds = function () { return speeds(game.level); };
    game.dotsLeft = dotsLeft;
    game.cell = cell;
    game.passable = passable;

    return game;
  }

  const api = {
    COLS: COLS,
    ROWS: ROWS_N,
    DX: DX,
    DY: DY,
    DIR_NAME: DIR_NAME,
    MAZE_ROWS: MAZE_ROWS,
    START: START,
    GHOSTS: GHOSTS,
    TREATS: TREATS,
    ACTS: ACTS,
    FRUIT_AT: FRUIT_AT,
    createGame: createGame,
    validateMaze: validateMaze,
    speeds: speeds,
    frightDuration: frightDuration,
    ghostTarget: ghostTarget,
    bfs: bfs,
    cell: cell,
    passable: passable
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GlowLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
