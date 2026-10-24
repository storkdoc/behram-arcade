/* STAR INVADERS — sim.js : the 60 Hz arcade simulation. Logical playfield is 224 x 256 units
   (the original's rotated screen), so every classic rule lives in its native units. */
const Sim = (() => {
  'use strict';
  const W = 224, H = 256, PLAYER_Y = 216, SHIELD_Y = 192, GROUND_Y = 240, UFO_Y = 40, TOP_Y = 32;
  const SR = 3;                      // shield sub-cells per unit (finer erosion than the original)
  const SHIELD_X = [32, 77, 122, 167], SHW = 22, SHH = 16;
  // classic bitmaps ('#' = body, '+' = glowing eye)
  const SPR = {
    squid: [['...##...', '..####..', '.######.', '##+##+##', '########', '..#..#..', '.#.##.#.', '#.#..#.#'],
            ['...##...', '..####..', '.######.', '##+##+##', '########', '.#.##.#.', '#......#', '.#....#.']],
    crab: [['..#.....#..', '...#...#...', '..#######..', '.##+###+##.', '###########', '#.#######.#', '#.#.....#.#', '...##.##...'],
           ['..#.....#..', '#..#...#..#', '#.#######.#', '###+###+###', '###########', '.#########.', '..#.....#..', '.#.......#.']],
    octo: [['....####....', '.##########.', '############', '###++##++###', '############', '...##..##...', '..##.##.##..', '##........##'],
           ['....####....', '.##########.', '############', '###++##++###', '############', '..###..###..', '.##..##..##.', '..##....##..']],
    ufo: [['.....######.....', '...##########...', '..############..', '.##+##+##+##+##.', '################', '..###..##..###..', '...#........#...']],
  };
  const TYPE_OF_ROW = ['octo', 'octo', 'crab', 'crab', 'squid']; // row 0 = bottom
  const PTS = { octo: 10, crab: 20, squid: 30 };
  const WID = { octo: 12, crab: 11, squid: 8 };
  const UFO_PTS = [100, 50, 50, 100, 150, 100, 100, 50, 300, 100, 100, 100, 50, 150, 100]; // 23rd shot, then every 15th -> 300
  const PLUNGER_COLS = [1, 7, 1, 1, 1, 4, 11, 1, 6, 3, 1, 1, 11, 9, 2, 8];
  const SQUIG_COLS = [11, 1, 6, 3, 1, 1, 11, 9, 2, 8, 2, 11, 4, 7, 10];
  const START_DROP = [0, 16, 24, 32, 32, 32, 40, 40, 40]; // each wave starts lower
  const startTop = w => 64 + START_DROP[w <= 9 ? w - 1 : 1 + ((w - 2) % 8)];

  let G = null, ev = [];               // ev: events for audio / particles, drained by the game each frame
  const emit = (t, a) => ev.push(Object.assign({ t }, a || {}));
  let seed = 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function shieldMask() {
    const w = SHW * SR, h = SHH * SR, m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ux = (x + 0.5) / SR, uy = (y + 0.5) / SR;
      let ins = true;
      // chamfered top corners (4 units)
      if (uy < 4) { const c = 4 - uy; if (ux < c || ux > SHW - c) ins = false; }
      // arched cut-out underneath
      const ax = (ux - SHW / 2) / 5.2, ay = (uy - SHH) / 5.0; if (ax * ax + ay * ay < 1) ins = false;
      m[y * w + x] = ins ? 1 : 0;
    }
    return m;
  }
  function newGame(opts) {
    seed = (opts && opts.seed) || ((Math.random() * 1e9) | 0);
    G = { wave: (opts && opts.wave) || 1, score: 0, lives: 3, extraAt: (opts && opts.extraAt) || 1500, extraGiven: false,
      t: 0, phase: 'ready', phaseT: 90, player: { x: 8, alive: true, cool: 0 }, shot: null, bombs: [], ufo: null, aliens: [],
      shields: [], ground: new Uint8Array(W * SR).fill(1), shotsFired: 0, ufoTimer: 0, bombT: 0, bombRot: 0, plIdx: 0, sqIdx: 0,
      mi: 0, dir: 1, cdx: 2, cdy: 0, steps: 0, note: 0, lastNote: -99, boomT: 0, boom: null, raids: 0, rowsSent: [], rowsDone: 0, invaded: false, kills: 0 };
    setupWave();
    return G;
  }
  function setupWave() {
    const top = startTop(G.wave);
    G.aliens = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 11; c++) {
      const type = TYPE_OF_ROW[r];
      G.aliens.push({ r, c, type, x: 24 + c * 16, y: top + (4 - r) * 16, alive: true, f: 0 });
    }
    G.shields = SHIELD_X.map(x => ({ x, m: shieldMask(), dirty: true }));
    G.ground.fill(1);
    G.mi = 0; G.dir = 1; G.cdx = 2; G.cdy = 0; G.steps = 0; G.boomT = 0; G.boom = null;
    G.shot = null; G.bombs = []; G.ufo = null; G.ufoTimer = 0; G.bombT = 0; G.shotsFired = 0; G.rowsSent = [0, 0, 0, 0, 0];
    G.player.x = 8; G.player.alive = true;
    emit('wave', { w: G.wave });
  }
  const alive = () => { let n = 0; for (const a of G.aliens) if (a.alive) n++; return n; };
  const ax0 = a => a.x + ((16 - WID[a.type]) >> 1);     // sprite left
  function bounds() {
    let l = 1e9, r = -1e9, b = -1e9;
    for (const a of G.aliens) if (a.alive) { const x = ax0(a); l = Math.min(l, x); r = Math.max(r, x + WID[a.type]); b = Math.max(b, a.y + 8); }
    return { l, r, b };
  }
  function newCycle() {
    const n = alive(), bd = bounds();
    if (G.dir > 0 && bd.r + 2 > W - 8) { G.cdx = 0; G.cdy = 8; G.dir = -1; }
    else if (G.dir < 0 && bd.l - 2 < 8) { G.cdx = 0; G.cdy = 8; G.dir = 1; }
    else if (G.raids > 0 && bd.b + 8 < PLAYER_Y) { G.raids--; G.cdx = 0; G.cdy = 8; emit('raidDrop'); }
    else { G.cdx = G.dir > 0 ? (n === 1 ? 3 : 2) : -2; G.cdy = 0; }
    G.steps++;
    // heartbeat: one footstep per full rack move (gets faster as the rack thins), never machine-gunning
    if (G.t - G.lastNote >= 5) { G.lastNote = G.t; emit('march', { i: G.note++ & 3 }); }
  }
  function marchTick() {
    if (G.boomT > 0) return;
    for (let guard = 0; guard < 120; guard++) {
      if (G.mi >= G.aliens.length) { G.mi = 0; newCycle(); }
      const a = G.aliens[G.mi++];
      if (!a.alive) continue;
      a.x += G.cdx; a.y += G.cdy; a.f ^= 1;
      // marching into a shield wipes it out where they overlap
      if (a.y + 8 > SHIELD_Y && a.y < SHIELD_Y + SHH) for (const s of G.shields) eraseRect(s, ax0(a), a.y, WID[a.type], 8, true);
      if (a.y + 8 > PLAYER_Y && !G.invaded) { G.invaded = true; killPlayer(true); }
      return;
    }
  }
  /* ---- shields ---- */
  function eraseRect(s, x, y, w, h, quiet) {
    const mw = SHW * SR, mh = SHH * SR;
    const x0 = Math.max(0, Math.floor((x - s.x) * SR)), x1 = Math.min(mw, Math.ceil((x + w - s.x) * SR));
    const y0 = Math.max(0, Math.floor((y - SHIELD_Y) * SR)), y1 = Math.min(mh, Math.ceil((y + h - SHIELD_Y) * SR));
    let n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) if (s.m[yy * mw + xx]) { s.m[yy * mw + xx] = 0; n++; }
    if (n) { s.dirty = true; if (!quiet || n > 6) emit('chunks', { x: x + w / 2, y: y + h / 2, n: Math.min(10, n / 4 | 0), q: 1 }); }
    return n;
  }
  function shieldAt(x, y) {
    if (y < SHIELD_Y || y >= SHIELD_Y + SHH) return null;
    for (const s of G.shields) {
      if (x < s.x || x >= s.x + SHW) continue;
      const mx = Math.floor((x - s.x) * SR), my = Math.floor((y - SHIELD_Y) * SR);
      if (s.m[my * SHW * SR + mx]) return s;
    }
    return null;
  }
  /** blast a ragged crater (radius in units) into a shield */
  function crater(s, x, y, rad, dirY) {
    const mw = SHW * SR, mh = SHH * SR, cx = (x - s.x) * SR, cy = (y - SHIELD_Y) * SR + dirY * rad * SR * 0.35, R = rad * SR;
    let n = 0;
    for (let yy = Math.floor(cy - R - 2); yy <= cy + R + 2; yy++) for (let xx = Math.floor(cx - R - 2); xx <= cx + R + 2; xx++) {
      if (xx < 0 || yy < 0 || xx >= mw || yy >= mh) continue;
      const d = Math.hypot((xx - cx) * 1.15, yy - cy) / R;
      const p = d < 0.75 ? 1 : d < 1.15 ? (1.15 - d) / 0.4 : 0;
      if (p > 0 && rnd() < p && s.m[yy * mw + xx]) { s.m[yy * mw + xx] = 0; n++; }
    }
    if (n) {
      // knock out stray specks left around the crater so edges stay chunky, not noisy
      for (let pass = 0; pass < 2; pass++) for (let yy = Math.floor(cy - R - 3); yy <= cy + R + 3; yy++) for (let xx = Math.floor(cx - R - 3); xx <= cx + R + 3; xx++) {
        if (xx < 0 || yy < 0 || xx >= mw || yy >= mh || !s.m[yy * mw + xx]) continue;
        let nb = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const X2 = xx + dx, Y2 = yy + dy; if (X2 >= 0 && Y2 >= 0 && X2 < mw && Y2 < mh && s.m[Y2 * mw + X2]) nb++; }
        if (nb <= 2) { s.m[yy * mw + xx] = 0; n++; }
      }
      s.dirty = true; emit('chunks', { x, y, n: 3 + Math.min(12, n / 5 | 0), dirY });
    }
  }
  /* ---- player ---- */
  function killPlayer(invasion) {
    if (!G.player.alive) return;
    G.player.alive = false; G.phase = 'dying'; G.phaseT = 130; G.bombs = []; G.shot = null;
    if (invasion) G.lives = 0;
    emit('die', { x: G.player.x + 6.5, y: PLAYER_Y + 4, invasion: !!invasion });
  }
  function addScore(p) {
    G.score += p;
    if (!G.extraGiven && G.extraAt && G.score >= G.extraAt) { G.extraGiven = true; G.lives++; emit('extra'); }
  }
  /* ---- bombs ---- */
  function reload() { const s = G.score; return s < 200 ? 48 : s < 1000 ? 16 : s < 2000 ? 11 : s < 3000 ? 8 : 7; }
  function lowestIn(col) { let best = null; for (const a of G.aliens) if (a.alive && a.c === col && (!best || a.y > best.y)) best = a; return best; }
  function tryBomb() {
    const n = alive(); if (!n || !G.player.alive) return;
    for (let k = 0; k < 3; k++) {
      const type = ['roll', 'plunger', 'squig'][G.bombRot]; G.bombRot = (G.bombRot + 1) % 3;
      if (G.bombs.some(b => b.type === type)) continue;
      let col = -1;
      if (type === 'roll') { const pc = G.player.x + 6.5; for (const a of G.aliens) if (a.alive && Math.abs(a.x + 8 - pc) < 8) { col = a.c; break; } }
      else if (type === 'plunger') { if (n === 1) continue; col = PLUNGER_COLS[G.plIdx++ % PLUNGER_COLS.length] - 1; }
      else { if (G.ufo) continue; col = SQUIG_COLS[G.sqIdx++ % SQUIG_COLS.length] - 1; }
      const a = col >= 0 ? lowestIn(col) : null; if (!a) continue;
      G.bombs.push({ type, x: a.x + 8, y: a.y + 10, f: 0 }); G.bombT = 0; return;
    }
  }
  /* ---- one 60 Hz tick ---- */
  function tick(inp) {
    G.t++;
    if (G.phase === 'ready') { if (--G.phaseT <= 0) G.phase = 'play'; movePlayer(inp); return; }
    if (G.phase === 'over') return;
    if (G.phase === 'clear') {
      updateParticlesOnly();
      if (--G.phaseT <= 0) { G.wave++; setupWave(); G.phase = 'ready'; G.phaseT = 70; }
      return;
    }
    if (G.phase === 'dying') {
      if (--G.phaseT <= 0) {
        if (G.invaded || G.lives <= 1) { G.lives = Math.max(0, G.lives - 1); G.phase = 'over'; emit('over'); }
        else { G.lives--; G.player.alive = true; G.player.x = 8; G.phase = 'play'; emit('respawn'); }
      }
      if (G.ufo) moveUfo();
      return;
    }
    // ---- play ----
    movePlayer(inp);
    if (inp.fire && !G.shot && G.player.alive && G.player.cool <= 0) {
      G.shot = { x: G.player.x + 6, y: PLAYER_Y - 4 }; G.shotsFired++; G.player.cool = 4; emit('shoot', { x: G.shot.x });
    }
    if (G.player.cool > 0) G.player.cool--;
    if (G.boomT > 0 && --G.boomT === 0) G.boom = null;
    marchTick();
    if (G.phase !== 'play') return;
    moveShot();
    G.bombT++; if (G.bombT >= reload()) tryBomb();
    moveBombs();
    // mystery ship
    G.ufoTimer++;
    if (!G.ufo && G.ufoTimer >= 1536 && alive() >= 8) {
      G.ufoTimer = 0; const ltr = (G.shotsFired & 1) === 1;
      G.ufo = { x: ltr ? -16 : W, dir: ltr ? 1 : -1, alive: true }; emit('ufo', { on: true });
    }
    if (G.ufo) moveUfo();
    if (G.ufoShow && --G.ufoShow.t <= 0) G.ufoShow = null;
    if (alive() === 0 && G.phase === 'play' && !G.boomT) { G.phase = 'clear'; G.phaseT = 110; G.bombs = []; G.shot = null; if (G.ufo) { G.ufo = null; emit('ufo', { on: false }); } emit('clear', { w: G.wave }); }
  }
  function updateParticlesOnly() { }
  function movePlayer(inp) {
    if (!G.player.alive) return;
    let v = 0; if (inp.left) v -= 1; if (inp.right) v += 1;
    if (inp.target != null) { const d = inp.target - (G.player.x + 6.5); v = Math.abs(d) < 0.6 ? 0 : Math.sign(d) * Math.min(1, Math.abs(d)); }
    G.player.x = Math.max(8, Math.min(W - 8 - 13, G.player.x + v));
  }
  function moveUfo() {
    const u = G.ufo; u.x += u.dir * 0.75;
    if (u.x < -20 || u.x > W + 4) { G.ufo = null; emit('ufo', { on: false }); }
  }
  function moveShot() {
    const s = G.shot; if (!s) return;
    for (let k = 0; k < 4; k++) {
      s.y -= 1;
      // aliens
      for (const a of G.aliens) {
        if (!a.alive) continue; const x0 = ax0(a);
        if (s.x >= x0 - 0.5 && s.x < x0 + WID[a.type] + 0.5 && s.y >= a.y && s.y < a.y + 8) {
          a.alive = false; G.shot = null; G.kills++; addScore(PTS[a.type]);
          G.boomT = 16; G.boom = { x: a.x, y: a.y, type: a.type };
          emit('kill', { x: x0 + WID[a.type] / 2, y: a.y + 4, type: a.type, f: a.f, ax: x0, ay: a.y });
          // a whole row wiped out -> raid your rival
          if (!G.rowsSent[a.r] && !G.aliens.some(o => o.alive && o.r === a.r)) { G.rowsSent[a.r] = 1; G.rowsDone++; emit('row', { r: a.r }); }
          return;
        }
      }
      // mystery ship
      const u = G.ufo;
      if (u && s.x >= u.x && s.x < u.x + 16 && s.y >= UFO_Y && s.y < UFO_Y + 7) {
        const p = UFO_PTS[G.shotsFired % 15]; addScore(p); G.ufo = null; G.shot = null;
        G.ufoShow = { x: u.x + 8, p, t: 80 }; emit('ufo', { on: false }); emit('ufoHit', { x: u.x + 8, y: UFO_Y + 3, p }); return;
      }
      // bombs
      for (const b of G.bombs) if (Math.abs(b.x - s.x) < 2 && s.y >= b.y - 3 && s.y < b.y + 4) {
        G.shot = null; emit('pop', { x: s.x, y: s.y });
        if (b.type !== 'roll' || rnd() < 0.25) { b.dead = true; } // rolling shots are hard to stop
        G.bombs = G.bombs.filter(o => !o.dead); return;
      }
      const sh = shieldAt(s.x, s.y);
      if (sh) { crater(sh, s.x, s.y, 2.1, -1); G.shot = null; emit('shieldHit', { x: s.x, y: s.y }); return; }
      if (s.y <= TOP_Y) { G.shot = null; emit('pop', { x: s.x, y: TOP_Y }); return; }
    }
  }
  function moveBombs() {
    const sp = alive() <= 8 ? 1.67 : 1.34;
    for (const b of G.bombs) {
      b.f++; const steps = 4;
      for (let k = 0; k < steps && !b.dead; k++) {
        b.y += sp / steps;
        const tip = b.y + 3;
        const sh = shieldAt(b.x, tip);
        if (sh) { crater(sh, b.x, tip, 2.6, 1); b.dead = true; emit('shieldHit', { x: b.x, y: tip }); break; }
        const p = G.player;
        if (p.alive && b.x >= p.x && b.x < p.x + 13 && tip >= PLAYER_Y && b.y < PLAYER_Y + 8) { b.dead = true; killPlayer(false); return; }
        if (tip >= GROUND_Y) {
          b.dead = true; emit('ground', { x: b.x, y: GROUND_Y });
          const gx = Math.floor(b.x * SR); for (let i = gx - 4; i <= gx + 4; i++) if (i >= 0 && i < G.ground.length && rnd() < 0.8) G.ground[i] = 0;
          break;
        }
      }
    }
    G.bombs = G.bombs.filter(b => !b.dead);
  }
  function drain() { const e = ev; ev = []; return e; }
  return { W, H, PLAYER_Y, SHIELD_Y, GROUND_Y, UFO_Y, TOP_Y, SR, SHW, SHH, SPR, WID, PTS, UFO_PTS, startTop, newGame, tick, drain, alive, ax0,
    get G() { return G; }, killPlayer, addScore, setupWave, reload };
})();
