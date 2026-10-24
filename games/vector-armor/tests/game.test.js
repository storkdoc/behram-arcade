/* Vector Armor: rules, rendering setup, controls (Mac keyboard + iPhone touch), fallback and arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/vector-armor/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/vector-armor/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL); await p.waitForTimeout(900); return p;
  };
  const labels = p => p.evaluate(() => VA.hitsCss().map(h => h.label));
  const clickL = async (p, l, touch) => { const h = (await p.evaluate(() => VA.hitsCss())).find(h => h.label === l || (l instanceof RegExp && l.test(h.label))); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x, h.y); else await p.mouse.click(h.x, h.y); await p.waitForTimeout(150); };
  // a clean arena in front of the player for deterministic rule checks
  const arena = p => p.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; g.enemies.length = 0; g.shells.length = 0; g.spawnT = 1e9; g.saucerT = 1e9;
    g.obs = g.obs.filter(o => S.rel(pl, o.x, o.z).d > 260); pl.h = pl.ph = 0; pl.v = 0; pl.w = 0; S.drain(); });

  say('== DESKTOP (1440x900 @2x, Mac keyboard)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(900);
  const t0 = await labels(D);
  check(['1 PLAYER GAME', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HIGH SCORES', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)) && !t0.some(l => /LOCAL|SAME/.test(l)), 'title menu (1P, online 2P, join in progress, scores, how-to, options; no local 2P)', t0);
  const rs = await D.evaluate(() => ({ r: VA.app.renderer, gw: document.getElementById('gl').width, gh: document.getElementById('gl').height, hw: document.getElementById('hud').width, hh: document.getElementById('hud').height, s: VA.R.samples, hdr: VA.R.hdr }));
  check(rs.r === 'webgl2' && rs.gw === 2880 && rs.gh === 1800 && rs.hw === 2880 && rs.hh === 1800, 'WebGL2 renderer + HUD both at native Retina resolution (2880x1800)', rs);
  check(rs.s >= 4 || rs.s === 0, 'MSAA (or FXAA fallback) active', { samples: rs.s, hdr: rs.hdr });
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crisp.length === 0, 'all HUD/menu text drawn on whole device pixels (no blur)', crisp);
  // level select by keyboard
  await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => VA.screen) === 'select', 'Enter on 1 PLAYER GAME opens the starting-level select');
  await D.keyboard.press('ArrowRight'); await D.keyboard.press('ArrowRight'); await D.waitForTimeout(120);
  await clickL(D, 'START LEVEL 3');
  const l3 = await D.evaluate(() => ({ lv: VA.G.level, scr: VA.screen, lives: VA.G.players[0].lives }));
  check(l3.scr === 'play' && l3.lv === 3 && l3.lives === 3, 'arcade level select: starts at level 3 with 3 tanks', l3);
  await D.evaluate(() => VA.freeze(true)); await arena(D);
  // movement
  const m = await D.evaluate(async () => { const pl = VA.G.players[0], x0 = pl.x, z0 = pl.z; return { x0, z0 }; });
  await D.keyboard.down('ArrowUp'); await D.evaluate(() => VA.step(90)); await D.keyboard.up('ArrowUp');
  const m1 = await D.evaluate(() => { const pl = VA.G.players[0]; return { x: pl.x, z: pl.z, v: pl.v }; });
  check(m1.z < m.z0 - 20 && Math.abs(m1.x - m.x0) < 0.5, 'ArrowUp drives forward', { dz: m1.z - m.z0, v: m1.v });
  await D.keyboard.down('ArrowRight'); await D.evaluate(() => VA.step(40)); await D.keyboard.up('ArrowRight');
  const h1 = await D.evaluate(() => VA.G.players[0].h);
  check(h1 > 0.3, 'ArrowRight turns right', h1);
  // collision: drive into a block
  const col = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; const o = { id: 900, k: 'cube', x: S.wrap(pl.x + Math.sin(pl.h) * 30), z: S.wrap(pl.z - Math.cos(pl.h) * 30), hx: 4, hz: 4, h: 8 }; g.obs.push(o); return o; });
  await D.keyboard.down('ArrowUp'); const inside = await D.evaluate(() => { let bad = 0; const g = VA.G, pl = g.players[0], S = VA.sim, o = g.obs[g.obs.length - 1]; for (let i = 0; i < 240; i++) { VA.step(1); if (S.inObs(o, pl.x, 1, pl.z, 0)) bad++; } return { bad, v: pl.v, bumpT: VA.app.bumpT }; }); await D.keyboard.up('ArrowUp');
  check(inside.bad === 0 && Math.abs(inside.v) < 10 && inside.bumpT > 0, 'obstacles block movement ("MOTION BLOCKED BY OBJECT")', inside);
  await arena(D);
  // firing + one shell limit
  await D.keyboard.down('Space'); await D.evaluate(() => VA.step(1));
  const f1 = await D.evaluate(() => ({ n: VA.G.shells.filter(s => s.owner === 'p0').length, fired: VA.G.shotsFired }));
  await D.evaluate(() => VA.step(30));
  const f2 = await D.evaluate(() => ({ n: VA.G.shells.filter(s => s.owner === 'p0').length, fired: VA.G.shotsFired }));
  await D.keyboard.up('Space');
  check(f1.n === 1 && f2.n === 1 && f2.fired === 1, 'Space fires; only one player shell at a time', [f1, f2]);
  await D.evaluate(() => VA.step(150));
  // hits on every enemy type with correct scoring
  for (const type of ['tank', 'super', 'missile', 'saucer']) {
    const r = await D.evaluate(type => { const g = VA.G, pl = g.players[0], S = VA.sim; g.enemies.length = 0; g.shells.length = 0; pl.h = pl.ph = 0;
      const e = S.spawnEnemy(type, { x: pl.x, z: S.wrap(pl.z - 70) }); e.fireCd = 1e9; e.h = 0; if (type === 'missile') { e.y = 2; e.zt = 0; e.h = Math.PI; } S.drain();
      const s0 = pl.score; pl.inp = { fwd: 0, turn: 0, fire: false }; let killed = false;
      S.G = g; const sh = { owner: 'p0' }; // fire via real input
      return { s0, id: e.id }; }, type);
    await D.keyboard.down('Space'); await D.evaluate(() => VA.step(2)); await D.keyboard.up('Space');
    const r2 = await D.evaluate(id => { for (let i = 0; i < 60; i++) { VA.step(1); if (!VA.G.enemies.some(e => e.id === id)) break; } return { gone: !VA.G.enemies.some(e => e.id === id), score: VA.G.players[0].score, alive: VA.G.players[0].alive }; }, r.id);
    const want = await D.evaluate(t => VA.sim.SCORE[t], type);
    check(r2.gone && r2.score - r.s0 === want, `shooting a ${type} destroys it for ${want} points`, { got: r2.score - r.s0, alive: r2.alive });
    await D.evaluate(() => { const pl = VA.G.players[0]; if (!pl.alive) VA.step(200); });
  }
  // obstacles stop shells
  const blk = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; g.enemies.length = 0; g.shells.length = 0; pl.h = pl.ph = 0;
    g.obs.push({ id: 901, k: 'tall', x: pl.x, z: S.wrap(pl.z - 40), hx: 3, hz: 3, h: 14 }); const e = S.spawnEnemy('tank', { x: pl.x, z: S.wrap(pl.z - 80) }); e.fireCd = 1e9; e.h = 0; e.v = 0; S.drain(); return e.id; });
  await D.keyboard.down('Space'); await D.evaluate(() => VA.step(2)); await D.keyboard.up('Space');
  const blk2 = await D.evaluate(id => { let hitObs = false; for (let i = 0; i < 40; i++) VA.step(1); return { alive: VA.G.enemies.some(e => e.id === id), shells: VA.G.shells.filter(s => s.owner === 'p0').length }; }, blk);
  check(blk2.alive && blk2.shells === 0, 'obstacles stop shells (tank behind a block survives)', blk2);
  // enemy AI: approaches, aims and fires
  await arena(D);
  const ai = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; g.level = 5; const e = S.spawnEnemy('tank', { x: S.wrap(pl.x + 60), z: S.wrap(pl.z - 300) }); e.fireCd = 0.5; S.drain();
    const d0 = S.rel(pl, e.x, e.z).d; let fired = false, aimed = 1; pl.inp = { fwd: 0, turn: 0, fire: false };
    for (let i = 0; i < 1200 && !fired; i++) { VA.step(1); if (g.shells.some(s => s.kind === 'enemy')) fired = true; }
    const ee = g.enemies.find(x => x.type === 'tank'); return { d0, d1: ee ? S.rel(pl, ee.x, ee.z).d : -1, fired, alive: pl.alive }; });
  check(ai.fired && ai.d1 < ai.d0, 'enemy tank closes in and fires at the player', ai);
  // dodge: at a high level tanks swerve away from incoming shells
  const dodge = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; let ev = 0;
    for (let k = 0; k < 14 && !ev; k++) { g.enemies.length = 0; g.shells.length = 0; if (!pl.alive) VA.step(220); g.level = 9; pl.h = pl.ph = 0; const e = S.spawnEnemy('tank', { x: pl.x, z: S.wrap(pl.z - 200) }); e.fireCd = 1e9; e.dodgeCd = 0; S.drain();
      g.shells.push({ id: 5000 + k, owner: 'p0', kind: 'player', x: pl.x, z: S.wrap(pl.z - 8), y: 1.7, dx: 0, dz: -1, spd: 190, life: 3, dist: 0, px: pl.x, pz: pl.z });
      for (let i = 0; i < 40; i++) { VA.step(1); if (e.state === 'evade') { ev++; break; } } }
    return ev; });
  check(dodge > 0, 'enemy tanks dodge incoming shells', dodge);
  // radar blips match enemy positions; warnings
  await arena(D);
  const rad = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; pl.h = pl.ph = 0;
    const a = S.spawnEnemy('tank', { x: S.wrap(pl.x + 100), z: S.wrap(pl.z - 200) }); const bb = S.spawnEnemy('super', { x: S.wrap(pl.x - 50), z: S.wrap(pl.z + 300) }); for (const e of g.enemies) { e.fireCd = 1e9; } S.drain();
    VA.render(); const bl = VA.app.radar.blips; const ba = bl.find(x => x.id === a.id), bs = bl.find(x => x.id === bb.id);
    return { ba, bs, warn: VA.app.warn, R: S.C.RADAR }; });
  check(rad.ba && Math.abs(rad.ba.r - 100 / rad.R) < 0.01 && Math.abs(rad.ba.f - 200 / rad.R) < 0.01 && rad.bs && rad.bs.f < 0 && rad.bs.r < 0, 'radar blips sit at the enemies\' relative positions (right/ahead, left/behind)', { a: rad.ba && [rad.ba.r, rad.ba.f], b: rad.bs && [rad.bs.r, rad.bs.f] });
  const wn = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim, out = {};
    for (const [k, dx, dz] of [['ahead', 0, -150], ['left', -150, 0], ['right', 150, 0], ['rear', 0, 150]]) { g.enemies.length = 0; const e = S.spawnEnemy('tank', { x: S.wrap(pl.x + dx), z: S.wrap(pl.z + dz) }); e.fireCd = 1e9; S.drain(); VA.render(); out[k] = [VA.app.warn.inRange, VA.app.warn.dir]; }
    g.enemies.length = 0; VA.render(); out.none = [VA.app.warn.inRange, VA.app.warn.dir]; return out; });
  check(wn.ahead[0] && wn.ahead[1] === null && wn.left[1] === 'LEFT' && wn.right[1] === 'RIGHT' && wn.rear[1] === 'REAR' && !wn.none[0], 'ENEMY IN RANGE / ENEMY TO LEFT / RIGHT / REAR warnings', wn);
  // death: screen crack, lives, respawn
  await arena(D);
  const die = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; const lv0 = pl.lives;
    g.shells.push({ id: 7001, owner: 999, kind: 'enemy', x: pl.x, z: S.wrap(pl.z - 30), y: 1.7, dx: 0, dz: 1, spd: 100, life: 4, dist: 0, px: pl.x, pz: pl.z });
    for (let i = 0; i < 40 && pl.alive; i++) VA.step(1); VA.render();
    const r = { alive: pl.alive, lives: pl.lives, lv0, crack: !!VA.app.crack, phase: g.phase };
    VA.step(200); VA.render(); r.after = { alive: pl.alive, phase: g.phase }; return r; });
  check(!die.alive && die.lives === die.lv0 - 1 && die.crack && die.phase === 'dead' && die.after.alive && die.after.phase === 'play', 'enemy shell kills the player: screen cracks, a tank is lost, then respawn', die);
  // extra tank at the bonus threshold
  const ex = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; g.enemies.length = 0; g.shells.length = 0; pl.score = g.bonus[0] - 500; const l0 = pl.lives; pl.h = pl.ph = 0;
    const e = S.spawnEnemy('tank', { x: pl.x, z: S.wrap(pl.z - 60) }); e.fireCd = 1e9; S.drain(); return { l0, id: e.id }; });
  await D.keyboard.down('Space'); await D.evaluate(() => VA.step(2)); await D.keyboard.up('Space');
  const ex2 = await D.evaluate(() => { VA.step(40); return { lives: VA.G.players[0].lives, msg: VA.app.msg && VA.app.msg.text }; });
  check(ex2.lives === ex.l0 + 1 && ex2.msg === 'EXTRA TANK!', 'extra tank awarded at the bonus score', ex2);
  // escalating difficulty: 5 kills -> next level, supertanks/missiles appear
  const lvl = await D.evaluate(() => { const g = VA.G; const k0 = g.kills; g.kills = Math.ceil((k0 + 1) / 5) * 5 - 1; g.level = g.startLevel + Math.floor(g.kills / 5); const pl = g.players[0], S = VA.sim; g.enemies.length = 0; const e = S.spawnEnemy('tank', { x: pl.x, z: S.wrap(pl.z - 60) }); e.fireCd = 1e9; pl.h = pl.ph = 0; S.drain(); return g.level; });
  await D.keyboard.down('Space'); await D.evaluate(() => VA.step(2)); await D.keyboard.up('Space');
  const lvl2 = await D.evaluate(() => { VA.step(40); return VA.G.level; });
  check(lvl2 === lvl + 1, 'every 5 kills raises the level', [lvl, lvl2]);
  // pause / mute
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => VA.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const mm = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== mm, 'M toggles mute');
  // game over -> initials -> high score table (localStorage)
  const go = await D.evaluate(() => { const g = VA.G, pl = g.players[0], S = VA.sim; pl.score = 77700; pl.lives = 1; g.enemies.length = 0;
    S.killPlayer(pl, 'shell'); VA.step(220); return { phase: g.phase }; });
  await D.evaluate(() => VA.step(260)); await D.evaluate(() => VA.render());
  check(go.phase === 'over' && await D.evaluate(() => VA.screen) === 'initials', 'last tank lost -> GAME OVER -> initials entry', go);
  await D.keyboard.press('KeyB'); await D.keyboard.press('KeyZ'); await D.keyboard.press('KeyA'); await D.keyboard.press('Enter'); await D.waitForTimeout(100);
  const hi = await D.evaluate(() => ({ s: VA.screen, t: JSON.parse(localStorage.getItem('va.hi'))[0] }));
  check(hi.s === 'scores' && hi.t.n === 'BZA' && hi.t.s === 77700, 'high score saved with initials (localStorage)', hi);
  // options: palette + controls
  await D.evaluate(() => VA.toTitle()); await D.waitForTimeout(100); await clickL(D, 'OPTIONS');
  await clickL(D, /^PALETTE/); await clickL(D, /^CONTROLS/);
  const op = await D.evaluate(() => ({ pal: VA.R.palette, ctl: VA.app.opts.ctl, ls: localStorage.getItem('va.pal') }));
  check(op.pal === 'classic' && op.ctl === 'classic' && op.ls === 'classic', 'options: classic green vector palette + classic tread controls (saved)', op);
  // classic treads on the keyboard: W + Down = spin right
  await D.evaluate(() => { VA.start(1); VA.freeze(true); }); await arena(D);
  await D.keyboard.down('KeyW'); await D.keyboard.down('ArrowDown'); await D.evaluate(() => VA.step(40)); await D.keyboard.up('KeyW'); await D.keyboard.up('ArrowDown');
  const tr = await D.evaluate(() => ({ h: VA.G.players[0].h }));
  await D.keyboard.down('KeyW'); await D.keyboard.down('ArrowUp'); await D.evaluate(() => VA.step(40)); await D.keyboard.up('KeyW'); await D.keyboard.up('ArrowUp');
  const tr2 = await D.evaluate(() => ({ v: VA.G.players[0].v, h: VA.G.players[0].h }));
  check(tr.h > 0.3 && tr2.v > 10, 'classic treads: W+Down pivots right, W+Up drives straight', [tr, tr2]);
  await D.evaluate(() => { VA.app.opts.ctl = 'simple'; VA.R.palette = 'modern'; VA.app.opts.pal = 'modern'; localStorage.clear(); VA.freeze(false); VA.toTitle(); });
  await D.waitForTimeout(600);
  check(D.errs.length === 0, 'desktop: no console errors', D.errs.slice(0, 5));

  say('== iPHONE 13 (touch, landscape + portrait)');
  for (const [name, dev] of [['portrait', devices['iPhone 13']], ['landscape', devices['iPhone 13 landscape']]]) {
    const P = await open(dev);
    const info = await P.evaluate(() => ({ touch: VA.app.touch, r: VA.app.renderer, gl: document.getElementById('gl').width * document.getElementById('gl').height, hud: [document.getElementById('hud').width, document.getElementById('hud').height], ww: innerWidth, wh: innerHeight, dpr: devicePixelRatio }));
    check(info.touch && info.gl <= 5.0e6 + 1 && info.hud[0] === Math.round(info.ww * info.dpr), `${name}: touch UI on, GL ≤ 5 MP, HUD at native resolution`, info);
    const fits = await P.evaluate(() => VA.hitsCss().every(h => h.x - h.w / 2 >= 0 && h.x + h.w / 2 <= innerWidth && h.y - h.h / 2 >= 0 && h.y + h.h / 2 <= innerHeight));
    check(fits, `${name}: title menu fits on screen`);
    await clickL(P, '1 PLAYER GAME', true);
    check(await P.evaluate(() => VA.screen) === 'select', `${name}: tap 1 PLAYER GAME -> level select`);
    await clickL(P, 'LEVEL 2', true);
    const st = await P.evaluate(() => ({ s: VA.screen, l: VA.G && VA.G.level }));
    check(st.s === 'play' && st.l === 2, `${name}: tap a level tile starts the game`, st);
    await P.waitForTimeout(200);
    await P.evaluate(() => { VA.freeze(true); const g = VA.G, pl = g.players[0], S = VA.sim; g.enemies.length = 0; g.shells.length = 0; g.spawnT = 1e9; g.saucerT = 1e9; g.obs = g.obs.filter(o => S.rel(pl, o.x, o.z).d > 200); pl.h = pl.ph = 0; VA.render(); });
    const tc = await P.evaluate(() => VA.touchCss());
    const ok = tc && tc.fires.every(f => f.x + f.r <= info.ww && f.y + f.r <= info.wh) && tc.stick.x - tc.stick.r >= 0 && Math.hypot(tc.fires[0].x - tc.stick.x, tc.fires[0].y - tc.stick.y) > tc.fires[0].r + tc.stick.r;
    check(ok, `${name}: joystick + FIRE button on screen, not overlapping`, tc);
    // drag the virtual stick forward
    const pt = (type, id, x, y) => P.evaluate(([type, id, x, y]) => { const el = type === 'pointerdown' ? document.getElementById('hud') : window; el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', bubbles: true, cancelable: true, isPrimary: id === 1 })); }, [type, id, x, y]);
    const z0 = await P.evaluate(() => VA.G.players[0].z);
    await pt('pointerdown', 1, tc.stick.x, tc.stick.y); await pt('pointermove', 1, tc.stick.x, tc.stick.y - tc.stick.r);
    await P.evaluate(() => VA.step(60));
    const z1 = await P.evaluate(() => VA.G.players[0].z);
    // FIRE with a second finger while driving
    await pt('pointerdown', 2, tc.fires[0].x, tc.fires[0].y); await P.evaluate(() => VA.step(1));
    const sh = await P.evaluate(() => VA.G.shells.filter(s => s.owner === 'p0').length);
    await pt('pointerup', 2, tc.fires[0].x, tc.fires[0].y); await pt('pointerup', 1, tc.stick.x, tc.stick.y - tc.stick.r);
    check(z1 < z0 - 10 && sh === 1, `${name}: virtual joystick drives, FIRE button shoots (multi-touch)`, { dz: z1 - z0, sh });
    // classic twin tread sliders
    await P.evaluate(() => { VA.app.opts.ctl = 'classic'; VA.render(); });
    const tc2 = await P.evaluate(() => VA.touchCss()); const h0 = await P.evaluate(() => VA.G.players[0].h);
    await pt('pointerdown', 3, tc2.tl.x, tc2.tl.y); await pt('pointermove', 3, tc2.tl.x, tc2.tl.y - 80);
    await pt('pointerdown', 4, tc2.tr.x, tc2.tr.y); await pt('pointermove', 4, tc2.tr.x, tc2.tr.y + 80);
    await P.evaluate(() => VA.step(40));
    const h1 = await P.evaluate(() => VA.G.players[0].h);
    await pt('pointerup', 3, 0, 0); await pt('pointerup', 4, 0, 0);
    check(h1 - h0 > 0.3, `${name}: classic tread sliders (left up + right down) pivot right`, [h0, h1]);
    await P.evaluate(() => { VA.app.opts.ctl = 'simple'; VA.render(); });
    // pause button
    const pz = await P.evaluate(() => VA.touchCss().pause); await P.touchscreen.tap(pz.x, pz.y); await P.waitForTimeout(80);
    check(await P.evaluate(() => VA.app.paused), `${name}: on-screen pause button`);
    await clickL(P, 'RESUME', true);
    await P.evaluate(() => VA.freeze(false)); await P.waitForTimeout(400);
    check(P.errs.length === 0, `${name}: no console errors`, P.errs.slice(0, 5));
    await P.context().close();
  }

  say('== FALLBACK (no WebGL)');
  const F = await open({ viewport: { width: 1280, height: 800 } }, URL + '?nogl=1');
  const fb = await F.evaluate(() => { VA.start(1); VA.render(); return { r: VA.app.renderer, s: VA.screen }; });
  await F.waitForTimeout(800);
  check(fb.r === 'canvas2d' && fb.s === 'play' && F.errs.length === 0, 'Canvas2D wireframe fallback runs the game when WebGL2 is unavailable', { fb, errs: F.errs.slice(0, 3) });
  const F2 = await open({ viewport: { width: 1280, height: 800 } }, 'about:blank');
  await F2.addInitScript(() => { const o = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { if (/webgl/.test(t)) return null; return o.call(this, t, ...a); }; });
  await F2.goto(URL); await F2.waitForTimeout(900);
  check(await F2.evaluate(() => VA.app.renderer) === 'canvas2d' && F2.errs.length === 0, 'browser without WebGL automatically gets the fallback', F2.errs.slice(0, 3));

  say('== ARCADE REGRESSION');
  const A = await open({ viewport: { width: 1280, height: 800 } }, BASE);
  const cards = await A.evaluate(() => [...document.querySelectorAll('a[href*="games/"]')].map(a => a.getAttribute('href')));
  check(cards.some(h => /vector-armor/.test(h)), 'landing page lists Vector Armor', cards.length);
  check(A.errs.length === 0, 'landing page: no console errors', A.errs.slice(0, 3));
  const slugs = [...new Set(cards.map(h => (/games\/([^/]+)/.exec(h) || [])[1]).filter(Boolean))];
  for (const s of slugs) { const G = await open({ viewport: { width: 1280, height: 800 } }, BASE + 'games/' + s + '/'); await G.waitForTimeout(500); check(G.errs.length === 0, 'game loads without errors: ' + s, G.errs.slice(0, 2)); await G.context().close(); }
  await b.close();
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
