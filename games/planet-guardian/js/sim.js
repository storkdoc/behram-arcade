/* PLANET GUARDIAN — sim.js : the rules, at a fixed 60 Hz tick. Logical units: the view is 240 tall and VW wide
   (240..430, set by the layout); the planet is WW units around and wraps. Deterministic for a given seed. */
const Sim = (() => {
  'use strict';
  const WW = 2560, H = 240, TOP = 32, SHIP_MIN = 40, SHIP_MAX = 224, GROUND_Y = 233, HUMANS = 10;
  const PTS = { lander: 150, mutant: 150, bomber: 250, pod: 1000, swarmer: 150, baiter: 200, catch: 500, rescue: 500, land: 250 };
  // hit boxes (half width / half height)
  const BOX = { lander: [5, 4.5], mutant: [5, 4.5], bomber: [4, 4], pod: [5, 5], swarmer: [3, 2.5], baiter: [8, 3], human: [2.5, 4] };
  // sprite bitmaps. Each char is a palette entry (see render.js); '.' is empty.
  const SPR = {
    lander: [[
      '...ggggg...', '..gg+g+gg..', '.ggggggggg.', '.gyg.g.gyg.', '..ggggggg..', '...y...y...', '..y.....y..', '.y.......y.'],
    [ '...ggggg...', '..gg+g+gg..', '.ggggggggg.', '.g.gyg.g.g.', '..ggggggg..', '...y...y...', '...y...y...', '..y.....y..']],
    mutant: [[
      '..pgpgp..', '.gp+p+pg.', 'pgpgpgpgp', '.pgpgpgp.', '..p.g.p..', '.g..p..g.', 'g.......g'],
    [ '..gpgpg..', '.pg+g+gp.', 'gpgpgpgpg', '.gpgpgpg.', '..g.p.g..', '..g.p.g..', '.g.....g.']],
    bomber: [[
      '.bbbbb.', 'bb+.+bb', 'b.bbb.b', 'b.b+b.b', 'b.bbb.b', 'bb+.+bb', '.bbbbb.'],
    [ '.bbbbb.', 'bbb+bbb', 'bb.b.bb', 'b+b+b+b', 'bb.b.bb', 'bbb+bbb', '.bbbbb.']],
    pod: [[
      '....r....', '..m.r.m..', '...mmm...', '.mm+m+mm.', 'rrmmmmmrr', '.mmmmmmm.', '...mmm...', '..m.r.m..', '....r....'],
    [ '.r.....r.', '..m...m..', '...mmm...', '.mm+m+mm.', '.rmmmmmr.', '.mmmmmmm.', '...mmm...', '..m...m..', '.r.....r.']],
    swarmer: [['.ooo.', 'o+o+o', '.ooo.', 'o...o'], ['.ooo.', 'o+o+o', '.ooo.', '.o.o.']],
    baiter: [[
      '....kkkkkkk....', '.kkk+k+k+k+kkk.', 'kkkkkkkkkkkkkkk', '...kk.....kk...'],
    [ '....kkkkkkk....', '.kkkk+k+k+kkkk.', 'kkkkkkkkkkkkkkk', '..kk.......kk..']],
    human: [['..h..', '.hhh.', '..c..', '.ccc.', 'c.c.c', '.l.l.', '.l.l.'], ['..h..', '.hhh.', '..c..', '.ccc.', 'c.c.c', '..l..', '.l.l.']],
  };

  let G = null, rnd = Math.random, VW = 320, ev = [];
  const emit = (t, o) => { o = o || {}; o.t = t; ev.push(o); };
  const wrap = x => ((x % WW) + WW) % WW;
  const wdx = (a, b) => { let d = (a - b) % WW; if (d > WW / 2) d -= WW; if (d < -WW / 2) d += WW; return d; };
  const sgn = v => v < 0 ? -1 : v > 0 ? 1 : 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function mkRng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /* ---------- terrain: a wrapping mountain range (sum of whole-period sines + peaks) ---------- */
  let TER = new Float32Array(WW);
  function buildTerrain(r) {
    const comps = []; for (let i = 0; i < 7; i++) comps.push({ k: [2, 3, 5, 7, 11, 17, 29][i], a: [7, 6, 5, 3.5, 2.6, 1.6, 0.9][i] * (0.7 + r() * 0.6), p: r() * 6.283 });
    const peaks = []; for (let i = 0; i < 14; i++) peaks.push({ x: r() * WW, h: 10 + r() * 16, w: 30 + r() * 70 });
    for (let x = 0; x < WW; x++) {
      let h = 0; for (const c of comps) h += Math.sin(x / WW * 6.283 * c.k + c.p) * c.a;
      for (const p of peaks) { const d = Math.abs(wdx(x, p.x)) / p.w; if (d < 1) h += p.h * (1 - d) * (1 - d) * (1 + d * 0.3); }
      TER[x] = clamp(214 - h, 176, 228);
    }
  }
  const terrain = x => { x = wrap(x); const i = x | 0, f = x - i; return TER[i] * (1 - f) + TER[(i + 1) % WW] * f; };

  /* ---------- game ---------- */
  function newGame(o) {
    o = o || {};
    rnd = mkRng(o.seed != null ? o.seed : (Math.random() * 1e9) | 0);
    buildTerrain(mkRng(((o.seed != null ? o.seed : 12345) * 7 + 3) >>> 0));
    G = { t: 0, score: 0, wave: o.wave || 1, lives: 3, bombs: 3, nextExtra: 10000, phase: 'ready', phaseT: 110,
      ship: { x: 200, y: 130, vx: 0, face: 1, alive: true, sx: VW * 0.25, cd: 0, hcd: 0, thrust: 0 },
      camX: 0, en: [], hum: [], las: [], bul: [], mines: [], planetGone: false, hyperRisk: o.hyperRisk != null ? o.hyperRisk : 0.125,
      wl: { total: 0, spawned: 0, spawnT: 0, bait: 0, baitN: 0, waveT: 0 }, harass: 0, lasId: 0, killed: {}, first: o.wave || 1 };
    ev = [];
    startWave(G.wave, true);
    G.camX = wrap(G.ship.x - G.ship.sx);
    return G;
  }
  function freshHumans() { G.hum = []; for (let i = 0; i < HUMANS; i++) G.hum.push({ x: wrap((i + 0.3 + rnd() * 0.4) * WW / HUMANS), y: GROUND_Y, vx: (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.06), st: 'walk', by: null, fy: 0, vy: 0, f: 0 }); }
  function startWave(w, first) {
    G.wave = w; const W = G.wl;
    if (first) { G.planetGone = false; freshHumans(); }
    else if (w % 5 === 0) { // every fifth wave the planet is rebuilt and repopulated
      const was = G.planetGone; G.planetGone = false; freshHumans(); emit('restore', { w, was });
    }
    G.en = []; G.bul = []; G.mines = []; G.las = [];
    W.total = w === 1 ? 15 : 20; W.spawned = 0; W.spawnT = 90; W.waveT = 0; W.bait = Math.max(1500, 2700 - w * 150); W.baitN = 0;
    const nb = w >= 2 ? Math.min(5, 2 + (w >> 1)) : 0, np = w >= 2 ? Math.min(4, 1 + ((w - 1) >> 1)) : 0;
    for (let i = 0; i < nb; i++) spawn('bomber', farX(), 70 + rnd() * 100, 70 + i * 9);
    for (let i = 0; i < np; i++) spawn('pod', farX(), 60 + rnd() * 120, 70 + i * 9);
    G.phase = 'ready'; G.phaseT = 110; emit('wave', { w });
  }
  function farX() { return wrap(G.ship.x + (VW * 0.6 + rnd() * (WW - VW * 1.2)) * (rnd() < 0.5 ? 1 : -1)); }
  function spawn(k, x, y, st) {
    const e = { k, x: wrap(x), y, vx: 0, vy: 0, t: (rnd() * 1000) | 0, spawnT: st || 0, fireT: 60 + (rnd() * 90 | 0), hum: null, state: 'seek', alt: 60 + rnd() * 60, by: y, dropT: 60 + (rnd() * 60 | 0) };
    const sp = 1 + Math.min(0.6, (G.wave - 1) * 0.06);
    if (k === 'lander') e.vx = (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.3) * sp;
    if (k === 'bomber') { e.vx = (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.2); e.by = y; }
    if (k === 'pod') { e.vx = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 0.15); e.vy = (rnd() < 0.5 ? -1 : 1) * 0.2; }
    G.en.push(e); return e;
  }
  const onScreen = (x, m) => { const d = wdx(x, G.camX + VW / 2); return Math.abs(d) < VW / 2 + (m || 0); };
  const viewX = x => wdx(x, G.camX + VW / 2) + VW / 2; // world -> view units

  function shoot(e, spd) {
    if (G.bul.length > 40 || !G.ship.alive) return;
    const S = G.ship, lead = 18 * (0.5 + rnd());
    const dx = wdx(S.x + S.vx * lead, e.x), dy = S.y - e.y, d = Math.hypot(dx, dy) || 1;
    const v = spd || Math.min(2.7, 1.45 + G.wave * 0.07);
    G.bul.push({ x: e.x, y: e.y, vx: dx / d * v, vy: dy / d * v, t: 0 }); emit('eshot', { x: e.x, y: e.y });
  }
  function addScore(p, x, y, show) {
    G.score += p; if (show) emit('pts', { x, y, p });
    while (G.score >= G.nextExtra) { G.nextExtra += 10000; G.lives++; G.bombs++; emit('extra'); }
  }
  function killEnemy(e, how) {
    const i = G.en.indexOf(e); if (i < 0) return; G.en.splice(i, 1);
    addScore(PTS[e.k], e.x, e.y, false); G.killed[e.k] = (G.killed[e.k] || 0) + 1;
    emit('kill', { k: e.k, x: e.x, y: e.y, how, f: (e.t >> 3) & 1 });
    if (e.k === 'lander' && e.hum && e.hum.st === 'carried') { const h = e.hum; h.st = 'fall'; h.fy = h.y; h.vy = 0; h.by = null; emit('drop', { x: h.x, y: h.y }); }
    if (e.k === 'pod' && how !== 'smart') { const n = 4 + (rnd() * 3 | 0); for (let k = 0; k < n; k++) { const s = spawn('swarmer', e.x + (rnd() - 0.5) * 8, e.y + (rnd() - 0.5) * 8, 0); s.vx = (rnd() - 0.5) * 3; s.vy = (rnd() - 0.5) * 2; } emit('split', { x: e.x, y: e.y, n }); }
  }
  function killHuman(h, why) { h.st = 'dead'; if (h.by) { h.by.hum = null; h.by.state = 'seek'; } h.by = null; emit('humanDie', { x: h.x, y: h.y, why }); checkPlanet(); }
  function checkPlanet() {
    if (G.planetGone || G.hum.some(h => h.st !== 'dead')) return;
    G.planetGone = true; emit('planet', {});
    for (const e of G.en) if (e.k === 'lander') { e.k = 'mutant'; e.hum = null; emit('mutate', { x: e.x, y: e.y, silent: true }); }
  }
  function shipDie(cause) {
    const S = G.ship; if (!S.alive) return; S.alive = false; S.vx = 0;
    for (const h of G.hum) if (h.st === 'ride') { h.st = 'fall'; h.fy = h.y; h.vy = 0; }
    G.phase = 'dying'; G.phaseT = 150; emit('die', { x: S.x, y: S.y, cause });
  }
  function respawn() {
    const S = G.ship; S.alive = true; S.vx = 0; S.y = 130; S.face = 1; S.sx = VW * 0.25; S.cd = 0;
    G.bul = []; G.mines = []; G.las = [];
    for (const e of G.en) if (Math.abs(wdx(e.x, S.x)) < VW) e.x = wrap(e.x + (wdx(e.x, S.x) < 0 ? -1 : 1) * VW * 1.1);
    G.phase = 'play'; emit('respawn');
  }
  function smartBomb() {
    if (G.bombs <= 0 || !G.ship.alive) return false;
    G.bombs--; let n = 0;
    for (const e of G.en.slice()) if (e.spawnT <= 0 && onScreen(e.x, 6)) { killEnemy(e, 'smart'); n++; }
    G.bul = G.bul.filter(b => !onScreen(b.x)); G.mines = G.mines.filter(m => !onScreen(m.x));
    emit('smart', { n, x: G.ship.x, y: G.ship.y }); return true;
  }
  function hyperspace() {
    const S = G.ship; if (!S.alive || S.hcd > 0) return;
    const from = { x: S.x, y: S.y }; S.hcd = 45;
    S.x = wrap(S.x + WW * (0.2 + rnd() * 0.6)); S.y = 60 + rnd() * 140; S.vx = 0;
    S.face = rnd() < 0.5 ? -1 : 1; S.sx = S.face > 0 ? VW * 0.25 : VW * 0.75; G.camX = wrap(S.x - S.sx);
    for (const h of G.hum) if (h.st === 'ride') { h.x = S.x; h.y = S.y + 6; }
    emit('hyper', { fx: from.x, fy: from.y, x: S.x, y: S.y });
    if (rnd() < G.hyperRisk) shipDie('hyper');
  }
  function harass(n) { // online: the rival sent a squad of swarmers
    const S = G.ship; if (!G || G.phase === 'over') return;
    for (let i = 0; i < n; i++) { const side = i % 2 ? -1 : 1, e = spawn('swarmer', S.x + side * (VW * 0.62 + i * 10), 60 + rnd() * 140, 30); e.vx = -side * 1.5; e.raid = 1; }
    emit('raidIn', { n });
  }

  /* ---------- tick ---------- */
  function tick(inp) {
    if (!G) return; inp = inp || {};
    G.t++;
    const S = G.ship, W = G.wl;
    if (G.phase === 'over') { updFx(); return; }
    if (G.phase === 'dying') { G.phaseT--; updEnemies(false); updBullets(false); updHumans(); if (G.phaseT <= 0) { G.lives--; if (G.lives <= 0) { G.lives = 0; G.phase = 'over'; emit('over', { sc: G.score }); } else respawn(); } camera(); return; }
    if (G.phase === 'clear') { G.phaseT--; moveShip(inp); camera(); updLasers(); updHumans(); if (G.phaseT <= 0) startWave(G.wave + 1, false); return; }
    if (G.phase === 'ready') { G.phaseT--; if (G.phaseT <= 0) G.phase = 'play'; }
    moveShip(inp); camera();
    if (S.cd > 0) S.cd--; if (S.hcd > 0) S.hcd--;
    if (inp.fire && S.cd <= 0 && G.las.length < 4 && S.alive) { const tap = inp.fireTap; G.las.push({ id: G.lasId++, y: S.y + 0.6, x: wrap(S.x + S.face * 8), dir: S.face, len: 2, t: 0, vx: S.vx }); S.cd = tap ? 3 : 7; emit('fire', { x: S.x + S.face * 8, y: S.y }); }
    if (inp.bomb) smartBomb();
    if (inp.hyper) hyperspace();
    updLasers();
    if (G.phase === 'play') {
      W.waveT++;
      // landers arrive in groups of five, materializing out of the sky
      if (W.spawned < W.total) { W.spawnT--; const live = G.en.filter(e => e.k === 'lander' || e.k === 'mutant').length;
        if (W.spawnT <= 0 || (live < 2 && W.spawnT > 60)) { const n = Math.min(5, W.total - W.spawned); for (let i = 0; i < n; i++) spawn(G.planetGone ? 'mutant' : 'lander', farX(), 44 + rnd() * 26, 60); W.spawned += n; W.spawnT = 540; emit('arrive', { n }); } }
      // dawdle and the baiters come for you
      if (W.waveT >= W.bait) { W.bait += Math.max(420, 780 - G.wave * 40); if (G.en.filter(e => e.k === 'baiter').length < 4) { const side = rnd() < 0.5 ? -1 : 1; spawn('baiter', S.x + side * VW * 0.7, 50 + rnd() * 120, 40); W.baitN++; emit('baiter'); } }
    }
    updEnemies(true); updBullets(true); updHumans();
    // wave complete: every lander (and mutant) destroyed
    if (G.phase === 'play' && W.spawned >= W.total && !G.en.some(e => e.k === 'lander' || e.k === 'mutant')) {
      const n = G.hum.filter(h => h.st !== 'dead').length, per = Math.min(500, 100 * G.wave), bonus = n * per;
      for (const e of G.en) emit('pop', { x: e.x, y: e.y, k: e.k });
      G.en = []; G.bul = []; G.mines = [];
      for (const h of G.hum) if (h.st === 'fall' || h.st === 'carried') { h.st = 'walk'; h.y = GROUND_Y; h.by = null; }
      addScore(bonus, 0, 0, false); G.phase = 'clear'; G.phaseT = 230; emit('clear', { w: G.wave, n, per, bonus });
    }
  }
  function moveShip(inp) {
    const S = G.ship; if (!S.alive) return;
    const dy = clamp(inp.dy || 0, -1, 1), dx = clamp(inp.dx || 0, -1, 1);
    S.y = clamp(S.y + dy * 2.5, SHIP_MIN, SHIP_MAX);
    if (dx) { const d = sgn(dx); if (d !== S.face) { S.face = d; emit('reverse'); } S.vx += S.face * 0.2 * Math.max(0.35, Math.abs(dx)); S.thrust = Math.min(1, S.thrust + 0.2); S.vx *= 0.996; }
    else { S.vx *= 0.972; S.thrust = Math.max(0, S.thrust - 0.12); if (Math.abs(S.vx) < 0.02) S.vx = 0; }
    S.vx = clamp(S.vx, -4.6, 4.6); S.x = wrap(S.x + S.vx);
  }
  function camera() {
    const S = G.ship;
    // the ship swings to the trailing side so you can see ahead (lead in the facing direction)
    const target = S.face > 0 ? VW * 0.24 : VW * 0.76;
    S.sx += (target - S.sx) * 0.045 + clamp(target - S.sx, -1, 1) * Math.min(1.6, Math.abs(S.vx) * 0.35);
    if (Math.abs(target - S.sx) < 0.05) S.sx = target;
    G.camX = wrap(S.x - S.sx);
  }
  function updLasers() {
    for (let i = G.las.length - 1; i >= 0; i--) {
      const L = G.las[i]; L.t++; L.x = wrap(L.x + L.vx); L.len += 15;
      // nearest thing along the beam
      let best = null, bd = 1e9;
      for (const e of G.en) { if (e.spawnT > 0) continue; const b = BOX[e.k], d = wdx(e.x, L.x) * L.dir; if (d > -b[0] && d - b[0] < L.len && Math.abs(e.y - L.y) < b[1] && d < bd && onScreen(e.x, 4)) { bd = d; best = e; } }
      let bh = null; for (const h of G.hum) { if (h.st === 'dead' || h.st === 'ride') continue; const d = wdx(h.x, L.x) * L.dir; if (d > -2 && d < L.len && Math.abs(h.y - L.y) < BOX.human[1] && d < bd) { bd = d; bh = h; best = null; } }
      if (best) { killEnemy(best, 'laser'); G.las.splice(i, 1); continue; }
      if (bh) { emit('pop', { x: bh.x, y: bh.y, k: 'human' }); killHuman(bh, 'shot'); G.las.splice(i, 1); continue; }
      if (L.t > 26 || L.len > VW + 60) G.las.splice(i, 1);
    }
  }
  function updEnemies(live) {
    const S = G.ship, w = G.wave;
    for (const e of G.en.slice()) {
      e.t++;
      if (e.spawnT > 0) { e.spawnT--; continue; }
      const vis = onScreen(e.x, -4), dxs = wdx(S.x, e.x), dys = S.y - e.y;
      if (e.fireT > 0) e.fireT--;
      if (e.k === 'lander') {
        if (G.planetGone) { e.k = 'mutant'; emit('mutate', { x: e.x, y: e.y }); continue; }
        if (e.state === 'seek') {
          let h = e.hum;
          if (!h || h.st !== 'walk') { e.hum = null; if (e.t % 30 === 0) { const free = G.hum.filter(q => q.st === 'walk' && !G.en.some(o => o.hum === q)); if (free.length && rnd() < 0.5) { free.sort((a, b) => Math.abs(wdx(a.x, e.x)) - Math.abs(wdx(b.x, e.x))); e.hum = free[rnd() < 0.7 ? 0 : (rnd() * free.length) | 0]; } } h = e.hum; }
          const sp = 0.5 + Math.min(0.5, w * 0.05);
          if (h) { const d = wdx(h.x, e.x); e.vx += (sgn(d) * sp - e.vx) * 0.03; if (Math.abs(d) < 3) { e.state = 'descend'; } }
          e.y += (e.alt + Math.sin(e.t * 0.04) * 10 - e.y) * 0.02; e.x = wrap(e.x + e.vx);
        } else if (e.state === 'descend') {
          const h = e.hum; if (!h || h.st !== 'walk') { e.state = 'seek'; e.hum = null; continue; }
          e.x = wrap(e.x + clamp(wdx(h.x, e.x), -0.8, 0.8)); e.y += 0.75;
          if (e.y >= h.y - 9) { h.st = 'carried'; h.by = e; e.state = 'lift'; e.y = h.y - 9; emit('abduct', { x: h.x, y: h.y }); }
        } else if (e.state === 'lift') {
          const h = e.hum; if (!h || h.st !== 'carried') { e.state = 'seek'; e.hum = null; continue; }
          e.y -= 0.34 + Math.min(0.3, w * 0.02); e.x = wrap(e.x + Math.sin(e.t * 0.05) * 0.15); h.x = e.x; h.y = e.y + 9;
          if (e.y <= TOP + 6) { e.k = 'mutant'; e.hum = null; e.state = 'seek'; h.by = null; killHuman(h, 'mutated'); emit('mutate', { x: e.x, y: e.y }); }
        }
        if (live && vis && e.fireT <= 0 && rnd() < 0.012 + w * 0.002) { shoot(e); e.fireT = Math.max(40, 110 - w * 8); }
      } else if (e.k === 'mutant') {
        const sp = Math.min(2.4, 1.15 + w * 0.08), far = Math.abs(dxs) > VW * 0.9;
        e.vx += (sgn(dxs) * (far ? 2.6 : sp) - e.vx) * 0.06; e.x = wrap(e.x + e.vx + (rnd() - 0.5) * 1.2);
        e.y = clamp(e.y + clamp(dys, -1, 1) * (0.7 + rnd() * 0.6) + (rnd() < 0.08 ? (rnd() - 0.5) * 10 : 0), SHIP_MIN, SHIP_MAX);
        if (live && vis && e.fireT <= 0 && rnd() < 0.02 + w * 0.003) { shoot(e); e.fireT = Math.max(30, 80 - w * 6); }
      } else if (e.k === 'bomber') {
        e.x = wrap(e.x + e.vx); e.y = e.by + Math.sin(e.t * 0.025) * 34;
        if (--e.dropT <= 0) { e.dropT = 50 + (rnd() * 50 | 0); if (onScreen(e.x, 80) && G.mines.length < 24) G.mines.push({ x: e.x, y: e.y, t: 0 }); }
      } else if (e.k === 'pod') {
        e.x = wrap(e.x + e.vx); e.y += e.vy; if (e.y < 56 || e.y > 196) e.vy = -e.vy;
      } else if (e.k === 'swarmer') {
        const top = Math.min(3.2, 2.1 + w * 0.08);
        e.vx = clamp(e.vx + sgn(dxs) * 0.11, -top, top); e.x = wrap(e.x + e.vx);
        e.y = clamp(e.y + clamp(dys * 0.025, -1.2, 1.2) + Math.sin(e.t * 0.12) * 0.9, SHIP_MIN, SHIP_MAX);
        if (live && vis && e.fireT <= 0 && sgn(e.vx) === sgn(dxs) && rnd() < 0.02) { shoot(e); e.fireT = 70; }
      } else if (e.k === 'baiter') {
        const want = S.vx + sgn(dxs) * clamp(Math.abs(dxs) * 0.03, 0.4, 3.2);
        e.vx += (want - e.vx) * 0.09; e.x = wrap(e.x + e.vx);
        e.y += clamp(dys - 18 * Math.sin(e.t * 0.02), -1.6, 1.6) * 0.6;
        if (live && vis && e.fireT <= 0 && rnd() < 0.05) { shoot(e, Math.min(3, 2 + w * 0.05)); e.fireT = Math.max(24, 46 - w * 2); }
      }
      // collision with the ship
      if (live && S.alive && G.phase !== 'clear') { const b = BOX[e.k]; if (Math.abs(wdx(e.x, S.x)) < b[0] + 6 && Math.abs(e.y - S.y) < b[1] + 2) { killEnemy(e, 'ram'); shipDie('ram'); } }
    }
  }
  function updBullets(live) {
    const S = G.ship;
    for (let i = G.bul.length - 1; i >= 0; i--) { const b = G.bul[i]; b.t++; b.x = wrap(b.x + b.vx); b.y += b.vy;
      if (b.t > 170 || b.y < TOP || b.y > H || !onScreen(b.x, 40)) { G.bul.splice(i, 1); continue; }
      if (live && S.alive && Math.abs(wdx(b.x, S.x)) < 6.5 && Math.abs(b.y - S.y) < 2.6) { G.bul.splice(i, 1); shipDie('shot'); } }
    for (let i = G.mines.length - 1; i >= 0; i--) { const m = G.mines[i]; m.t++;
      if (m.t > 420) { G.mines.splice(i, 1); continue; }
      if (live && S.alive && Math.abs(wdx(m.x, S.x)) < 6 && Math.abs(m.y - S.y) < 3) { G.mines.splice(i, 1); shipDie('mine'); } }
  }
  function updHumans() {
    const S = G.ship;
    for (const h of G.hum) {
      h.f++;
      if (h.st === 'walk') { h.x = wrap(h.x + h.vx); if (rnd() < 0.002) h.vx = -h.vx; h.y = GROUND_Y; }
      else if (h.st === 'fall') {
        h.vy = Math.min(1.5, h.vy + 0.03); h.y += h.vy;
        if (S.alive && Math.abs(wdx(h.x, S.x)) < 9 && Math.abs(h.y - (S.y + 3)) < 7) { h.st = 'ride'; addScore(PTS.catch, h.x, h.y, true); emit('catch', { x: h.x, y: h.y }); }
        else if (h.y >= GROUND_Y) { h.y = GROUND_Y; if (GROUND_Y - h.fy > 95) killHuman(h, 'fall'); else { h.st = 'walk'; addScore(PTS.land, h.x, h.y, true); emit('land', { x: h.x, y: h.y }); } }
      } else if (h.st === 'ride') {
        h.x = wrap(S.x - S.face * 2); h.y = S.y + 6.5;
        if (S.y >= SHIP_MAX - 10) { h.st = 'walk'; h.y = GROUND_Y; h.vx = (rnd() < 0.5 ? -1 : 1) * 0.07; addScore(PTS.rescue, h.x, h.y, true); emit('rescue', { x: h.x, y: h.y }); }
      }
    }
  }
  function updFx() { }

  return {
    WW, H, TOP, SHIP_MIN, SHIP_MAX, GROUND_Y, PTS, SPR, BOX, HUMANS,
    newGame, tick, harass, terrain, wrap, wdx, viewX, onScreen,
    setView(v) { VW = v; if (G) { G.ship.sx = Math.min(G.ship.sx, v); } },
    get VW() { return VW; }, get G() { return G; }, get TER() { return TER; },
    drain() { const e = ev; ev = []; return e; },
    humansLeft() { return G ? G.hum.filter(h => h.st !== 'dead').length : 0; },
    _: { spawn, killEnemy, killHuman, shipDie, smartBomb, hyperspace, startWave, rng: () => rnd() },
  };
})();
