/* Planet Guardian: single-player rules, rendering setup, controls (Mac keyboard + iPhone touch) and arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/planet-guardian/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/planet-guardian/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL); await p.waitForTimeout(700); return p;
  };
  const labels = p => p.evaluate(() => PG.hits().map(h => h.label));
  const clickL = async (p, l, touch) => { const h = (await p.evaluate(() => PG.hits())).find(h => h.label === l); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x, h.y); else await p.mouse.click(h.x, h.y); await p.waitForTimeout(120); };
  // a clean, frozen game: past GET READY, no enemies, no spawning
  const quiet = p => p.evaluate(() => { PG.freeze(); PG.step(115); const G = PG.G; G.en = []; G.bul = []; G.mines = []; G.wl.spawnT = 1e9; G.wl.bait = 1e9; G.ship.vx = 0; G.ship.y = 120; const dm = PG.sim._.spawn('mutant', PG.sim.wrap(G.camX + PG.sim.WW / 2), 40, 1e9); G.wl.spawned = G.wl.total; });

  say('== DESKTOP (1440x900 @2x, Mac keyboard)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(600);
  const t0 = await labels(D);
  check(['1 PLAYER GAME', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HIGH SCORES', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)) && !t0.some(l => /LOCAL|SAME/.test(l)), 'title menu (1P, online 2P, join in progress, scores, how-to, options; no local 2P)');
  const cvs = await D.evaluate(() => ({ w: PG.render.cv.width, h: PG.render.cv.height, filt: PG.render.R.FILTER_OK, VW: PG.render.R.VW }));
  check(cvs.w === 2880 && cvs.h === 1800, 'canvas renders at native Retina resolution (2880x1800 backing store)', cvs);
  check(cvs.VW > 300, 'wide Mac window shows a wider slice of the planet (view ' + cvs.VW.toFixed(0) + ' units)');
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crisp.length === 0, 'all HUD/menu text is drawn on whole device pixels (no blur)', crisp);
  await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => PG.screen) === 'select', 'Enter on 1 PLAYER GAME opens the starting-wave select');
  await D.keyboard.press('ArrowRight'); await D.keyboard.press('ArrowRight'); await D.waitForTimeout(100);
  await clickL(D, 'START WAVE 3');
  const w3 = await D.evaluate(() => { PG.freeze(); PG.step(120); return { w: PG.G.wave, scr: PG.screen, kinds: [...new Set(PG.G.en.map(e => e.k))].sort(), hum: PG.sim.humansLeft() }; });
  check(w3.scr === 'play' && w3.w === 3 && w3.kinds.includes('bomber') && w3.kinds.includes('pod') && w3.hum === 10, 'arcade start-wave select: wave 3 starts with landers, bombers and pods, 10 humanoids', w3);

  say('-- Mac keyboard');
  await quiet(D);
  await D.keyboard.down('ArrowRight'); await D.evaluate(() => PG.step(40)); await D.keyboard.up('ArrowRight');
  const k1 = await D.evaluate(() => ({ vx: PG.G.ship.vx, f: PG.G.ship.face }));
  check(k1.vx > 3 && k1.f === 1, 'Right arrow thrusts (inertia builds speed)', k1);
  await D.evaluate(() => PG.step(30)); const k1b = await D.evaluate(() => PG.G.ship.vx);
  check(k1b > 0.5 && k1b < k1.vx, 'ship coasts with drag after releasing thrust', [k1.vx.toFixed(2), k1b.toFixed(2)]);
  await D.keyboard.down('ArrowLeft'); await D.evaluate(() => PG.step(1)); const k2 = await D.evaluate(() => ({ vx: PG.G.ship.vx, f: PG.G.ship.face }));
  await D.evaluate(() => PG.step(60)); await D.keyboard.up('ArrowLeft'); const k3 = await D.evaluate(() => PG.G.ship.vx);
  check(k2.f === -1 && k2.vx > 0 && k3 < 0, 'Left reverses facing instantly; momentum carries, then thrust turns you around', { k2, k3 });
  const y0 = await D.evaluate(() => PG.G.ship.y); await D.keyboard.down('ArrowUp'); await D.evaluate(() => PG.step(10)); await D.keyboard.up('ArrowUp');
  const y1 = await D.evaluate(() => PG.G.ship.y); await D.keyboard.down('ArrowDown'); await D.evaluate(() => PG.step(20)); await D.keyboard.up('ArrowDown'); const y2 = await D.evaluate(() => PG.G.ship.y);
  check(y1 < y0 - 20 && y2 > y1 + 40, 'Up / Down move the ship', [y0, y1, y2]);
  await D.keyboard.press('Space'); await D.evaluate(() => PG.step(1));
  check(await D.evaluate(() => PG.G.las.length) === 1, 'Space fires a laser');
  const dl0 = await D.evaluate(() => { PG.G.las = []; PG.G.ship.cd = 0; return PG.G.lasId; }); await D.keyboard.down('Space'); await D.evaluate(() => PG.step(30)); await D.keyboard.up('Space');
  check(await D.evaluate(d => PG.G.lasId - d, dl0) >= 4, 'holding Space auto-fires (long laser streaks)');
  const b0 = await D.evaluate(() => { PG.G.las = []; return PG.G.bombs; }); await D.keyboard.press('Enter'); await D.evaluate(() => PG.step(1));
  check(await D.evaluate(() => PG.G.bombs) === b0 - 1, 'Enter fires a smart bomb');
  await D.evaluate(() => { PG.G.hyperRisk = 0; }); const hx0 = await D.evaluate(() => PG.G.ship.x);
  await D.keyboard.press('KeyH'); await D.evaluate(() => PG.step(1)); const hx1 = await D.evaluate(() => PG.G.ship.x);
  await D.evaluate(() => PG.step(60)); await D.keyboard.press('ShiftLeft'); await D.evaluate(() => PG.step(1)); const hx2 = await D.evaluate(() => PG.G.ship.x);
  check(Math.abs(hx1 - hx0) > 5 && Math.abs(hx2 - hx1) > 5, 'H and Shift both jump to hyperspace', [hx0, hx1, hx2].map(v => v.toFixed(0)));
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => PG.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const m1 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== m1, 'M toggles mute');

  say('-- rules');
  const R = await D.evaluate(() => {
    const S = PG.sim, out = {};
    const fresh = (w) => { PG.start(w || 1, { risk: 0 }); PG.freeze(); PG.step(115); const G = PG.G; G.en = []; G.bul = []; G.mines = []; G.wl.spawnT = 1e9; G.wl.bait = 1e9; G.ship.vx = 0; G.ship.y = 100; const dm = PG.sim._.spawn('mutant', PG.sim.wrap(G.camX + PG.sim.WW / 2), 40, 1e9); G.wl.spawned = G.wl.total; return G; };
    const sounds = []; const sp = Sound.play; Sound.play = n => { sounds.push(n); };
    // abduction -> mutant
    let G = fresh(); const h = G.hum.find(h => h.st === 'walk'); h.vx = 0;
    const L = S._.spawn('lander', h.x, 120, 0); L.state = 'seek'; L.tx = h.x; L.target = h; L.hum = null;
    let abducted = false, t = 0; while (t++ < 2400) { PG.step(1); if (G.hum.some(x => x.st === 'carried')) abducted = true; if (G.en.filter(e => e.k === 'mutant').length > 1) break; G.ship.x = S.wrap(h.x + 700); G.ship.alive = true; }
    out.abduct = { abducted, mutant: G.en.filter(e => e.k === 'mutant').length > 1, humanDead: G.hum.filter(x => x.st === 'dead').length === 1, left: S.humansLeft(), ticks: t, snd: sounds.includes('abduct') && sounds.includes('mutate') };
    // rescue: shoot a lander carrying a humanoid, catch it, fly it down
    G = fresh(); const h2 = G.hum.find(h => h.st === 'walk'); h2.st = 'carried'; h2.y = 110;
    const L2 = S._.spawn('lander', S.wrap(G.ship.x + 60), 101, 0); L2.state = 'lift'; L2.hum = h2; h2.by = L2; h2.x = L2.x; h2.vx = 0; G.ship.face = 1; G.ship.y = 101;
    const sc0 = G.score; PG.step(1); PG.sim.tick({ fire: true, fireTap: true }); for (let i = 0; i < 12 && L2.hp !== 0 && G.en.includes(L2); i++) PG.step(1);
    out.shotLander = { gone: !G.en.includes(L2), falling: h2.st === 'fall', pts: G.score - sc0 };
    G.ship.x = h2.x; G.ship.y = h2.y - 3; PG.step(2);
    out.caught = { st: h2.st, pts: G.score - sc0 };
    const sc1 = G.score; for (let i = 0; i < 80 && h2.st === 'ride'; i++) PG.sim.tick({ dy: 1 }) || PG.step(0), PG.step(1);
    out.rescued = { st: h2.st, y: h2.y, pts: G.score - sc1, snd: sounds.includes('rescue') };
    // short fall lands safely (+250), long fall kills
    G = fresh(); const h3 = G.hum.find(h => h.st === 'walk'); h3.st = 'fall'; h3.y = S.GROUND_Y - 40; h3.fy = h3.y; h3.vy = 0; G.ship.x = S.wrap(h3.x + 900);
    const h4 = G.hum.find(h => h.st === 'walk'); h4.st = 'fall'; h4.y = 60; h4.fy = 60; h4.vy = 0;
    const sc2 = G.score; for (let i = 0; i < 400; i++) PG.step(1);
    out.falls = { short: h3.st, long: h4.st, pts: G.score - sc2 };
    // smart bomb: on-screen enemies only
    G = fresh(3); const cam = G.camX; for (let i = 0; i < 6; i++) { const e = S._.spawn(['lander', 'bomber', 'mutant', 'pod', 'swarmer', 'baiter'][i], S.wrap(cam + 30 + i * 30), 60 + i * 15, 0); e.vx = 0; }
    const far = S._.spawn('lander', S.wrap(cam + S.WW / 2), 80, 0);
    G.bul.push({ x: S.wrap(cam + 50), y: 70, vx: 0, vy: 0, t: 0 });
    const sc3 = G.score, k0 = Object.values(G.killed).reduce((a, b) => a + b, 0); S._.smartBomb(); PG.step(1);
    out.smart = { killed: Object.values(G.killed).reduce((a, b) => a + b, 0) - k0, farAlive: G.en.includes(far), bul: G.bul.length, pts: G.score - sc3, swarmers: G.en.filter(e => e.k === 'swarmer').length, bombs: G.bombs };
    // hyperspace: safe jump, then a forced malfunction
    G = fresh(); const hx = G.ship.x; S._.hyperspace(); out.hyper = { moved: Math.abs(S.wdx(G.ship.x, hx)) > 1, alive: G.ship.alive };
    G.hyperRisk = 1; G.ship.hcd = 0; S._.hyperspace(); out.hyperFail = { phase: G.phase, alive: G.ship.alive };
    // planet destruction & restoration
    G = fresh(3); for (let i = 0; i < 4; i++) S._.spawn('lander', S.wrap(G.camX + 1200 + i * 30), 80, 0);
    for (const hh of G.hum) S._.killHuman(hh, 'test'); PG.step(1);
    out.planet = { gone: G.planetGone, landers: G.en.filter(e => e.k === 'lander').length, mutants: G.en.filter(e => e.k === 'mutant').length, snd: sounds.includes('planet') };
    const clearTo = w => { let t = 0; while (G.wave < w && t++ < 5000) { G.wl.spawned = G.wl.total; G.en = G.en.filter(e => e.k !== 'lander' && e.k !== 'mutant'); G.bul = []; G.mines = []; G.ship.alive = true; PG.step(1); } };
    clearTo(4); out.wave4 = { w: G.wave, gone: G.planetGone, hum: S.humansLeft() };
    clearTo(5); out.wave5 = { w: G.wave, gone: G.planetGone, hum: S.humansLeft(), snd: sounds.includes('restore') };
    // wave bonus per humanoid + next wave
    G = fresh(2); G.hum.slice(0, 3).forEach(hh => S._.killHuman(hh, 'test')); const sc4 = G.score;
    G.wl.spawned = G.wl.total; G.en = []; PG.step(2); const phase = G.phase, bonus = G.score - sc4; for (let i = 0; i < 400 && G.wave === 2; i++) PG.step(1);
    out.bonus = { phase, bonus, w: G.wave };
    // scoring table + pod split
    G = fresh(3); const dm = G.en[0]; const kinds = ['lander', 'mutant', 'bomber', 'baiter', 'swarmer', 'pod'], got = {};
    for (const k of kinds) { const e = S._.spawn(k, S.wrap(G.ship.x + 50), G.ship.y, 0); e.vx = 0; e.vy = 0; PG.sim.tick({}); e.vx = 0; e.vy = 0; G.ship.y = e.y; G.ship.face = 1; G.ship.cd = 0; G.las = []; const s0 = G.score; PG.sim.tick({ fire: true, fireTap: true }); for (let i = 0; i < 6; i++) PG.sim.tick({}); got[k] = G.score - s0; if (k === 'pod') got.split = G.en.filter(x => x.k === 'swarmer').length; G.en = [dm]; G.bul = []; G.mines = []; }
    out.scores = got;
    // extra ship + smart bomb every 10,000
    G = fresh(); const l0 = G.lives, bb0 = G.bombs; G.score = 9900; const e1 = S._.spawn('pod', S.wrap(G.ship.x + 50), G.ship.y, 0); e1.vx = 0; e1.vy = 0; G.ship.face = 1; PG.sim.tick({ fire: true, fireTap: true }); for (let i = 0; i < 6; i++) PG.sim.tick({});
    out.extra = { lives: G.lives - l0, bombs: G.bombs - bb0 };
    // baiter arrives if you dawdle
    G = fresh(); G.wl.bait = 30; for (let i = 0; i < 60; i++) PG.step(1); out.baiter = G.en.some(e => e.k === 'baiter');
    Sound.play = sp; S.drain(); return out;
  });
  say('   ', R);
  check(R.abduct.abducted && R.abduct.mutant && R.abduct.humanDead && R.abduct.left === 9 && R.abduct.snd, 'abduction: lander grabs a humanoid, reaches the top, becomes a mutant (humanoid lost, alarm + shriek sounds)', R.abduct.ticks + ' ticks');
  check(R.shotLander.gone && R.shotLander.falling && R.shotLander.pts === 150, 'shooting the abductor drops the humanoid (lander 150)');
  check(R.caught.st === 'ride' && R.caught.pts === 650, 'catching the falling humanoid: +500');
  check(R.rescued.st === 'walk' && R.rescued.pts === 500 && R.rescued.snd, 'flying it back to the ground: +500 rescue', R.rescued);
  check(R.falls.short === 'walk' && R.falls.long === 'dead' && R.falls.pts === 250, 'a short fall lands safely (+250); a long fall is fatal', R.falls);
  check(R.smart.killed >= 6 && R.smart.farAlive && R.smart.bul === 0 && R.smart.swarmers === 0 && R.smart.pts > 0, 'smart bomb destroys everything on screen (pods leave no swarmers), clears bullets, spares off-screen enemies', R.smart);
  check(R.hyper.moved && R.hyper.alive, 'hyperspace teleports the ship');
  check(R.hyperFail.phase === 'dying' && !R.hyperFail.alive, 'classic hyperspace can malfunction (fatal jump)');
  check(R.planet.gone && R.planet.landers === 0 && R.planet.mutants >= 4 && R.planet.snd, 'losing every humanoid explodes the planet; all landers turn mutant', R.planet);
  check(R.wave4.w === 4 && R.wave4.gone && R.wave4.hum === 0, 'planet stays destroyed on the next wave (4)', R.wave4);
  check(R.wave5.w === 5 && !R.wave5.gone && R.wave5.hum === 10 && R.wave5.snd, 'planet restored with 10 humanoids on wave 5', R.wave5);
  check(R.bonus.phase === 'clear' && R.bonus.bonus === 7 * 200 && R.bonus.w === 3, 'wave cleared: bonus 100 x wave per surviving humanoid (7 x 200), then the next wave', R.bonus);
  check(R.scores.lander === 150 && R.scores.mutant === 150 && R.scores.bomber === 250 && R.scores.baiter === 200 && R.scores.swarmer === 150 && R.scores.pod === 1000 && R.scores.split >= 4, 'scoring table (lander/mutant/swarmer 150, baiter 200, bomber 250, pod 1000 and bursts into swarmers)', R.scores);
  check(R.extra.lives === 1 && R.extra.bombs === 1, 'extra ship and smart bomb at 10,000');
  check(R.baiter, 'a baiter appears when you dawdle');

  say('-- scanner');
  const scan = await D.evaluate(() => new Promise(r => {
    PG.start(3); PG.freeze(); PG.step(400); const G = PG.G, S = PG.sim; G.ship.alive = true;
    const want = G.en.filter(e => e.k === 'lander').length, mut = G.en.filter(e => e.k === 'mutant').length, hum = G.hum.filter(h => h.st !== 'dead').length;
    const ctx = PG.render.ctx, f = ctx.fillRect, calls = [];
    ctx.fillRect = function (x, y, w, h) { calls.push([String(this.fillStyle).toLowerCase(), x, y, w, h]); return f.call(this, x, y, w, h); };
    requestAnimationFrame(() => requestAnimationFrame(() => { ctx.fillRect = f;
      const one = calls.slice(0, calls.length / 2 | 0).length ? calls : calls;
      // count dots of one frame: use the last frame only
      const R = PG.render.R, sr = { x0: R.ox + R.s * (R.VW / 2 - R.VW * 0.25), x1: R.ox + R.s * (R.VW / 2 + R.VW * 0.25), y1: R.oy + 30 * R.s };
      const per = calls.filter(c => c[2] < sr.y1 && c[1] >= sr.x0 - 2 && c[1] <= sr.x1 + 2);
      const n = col => per.filter(c => c[0] === col).length;
      r({ want, mut, hum, landers: n('#45f06a') / 2, mutants: n('#c45cff') / 2, ship: n('#ffffff') > 0, terrain: n('rgba(255, 140, 60, 0.85)') > 50 });
    }));
  }));
  check(scan.landers === scan.want && scan.want > 0 && scan.ship && scan.terrain, 'scanner shows every lander in the whole world, the ship and the terrain line', scan);
  const sc2 = await D.evaluate(() => { const G = PG.G, S = PG.sim, W = S.WW, camC = G.camX + PG.render.R.VW / 2; return G.en.every(e => Math.abs(S.wdx(e.x, camC)) <= W / 2); });
  check(sc2, 'scanner is centred on the camera and wraps around the planet');

  say('-- high score');
  await D.evaluate(() => { PG.start(1); PG.freeze(); PG.step(115); PG.G.score = 50000; PG.G.lives = 1; PG.sim._.shipDie('test'); PG.step(200); PG.freeze(false); });
  await D.waitForFunction(() => PG.G.phase === 'over' && PG.app.overT <= 0, null, { timeout: 8000 });
  await D.keyboard.press('Space'); await D.waitForTimeout(150);
  check(await D.evaluate(() => PG.screen) === 'initials', 'game over with a top-10 score asks for initials');
  await D.keyboard.type('BDR'); await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  const hs = await D.evaluate(() => JSON.parse(localStorage.getItem('pg.scores'))[0]);
  check(hs.n === 'BDR' && hs.s === 50000, 'high score saved to localStorage', hs);
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  say('== iPHONE 13 PORTRAIT (touch)');
  const P = await open({ ...devices['iPhone 13'] });
  const pc = await P.evaluate(() => ({ c: PG.controls(), pf: { ...PG.render.R.pf }, dpr: PG.render.R.dpr, VW: PG.render.R.VW, cw: innerWidth, ch: innerHeight }));
  const pfBottom = (pc.pf.y + pc.pf.h) / pc.dpr;
  check(pc.VW === 240, 'portrait: full-width view of the planet (240 units)');
  check(['fire', 'bomb', 'hyper'].every(k => pc.c[k].y - pc.c[k].r >= pfBottom - 1 && pc.c[k].y + pc.c[k].r <= pc.ch) && pc.c.stick.y - pc.c.stick.r >= pfBottom - 1, 'portrait: joystick + FIRE / BOMB / HYPER sit below the playfield, on screen', { pfBottom, c: pc.c });
  await clickL(P, '1 PLAYER GAME', true); await clickL(P, 'START WAVE 1', true);
  check(await P.evaluate(() => PG.screen) === 'play', 'tap 1 PLAYER GAME -> START WAVE 1 starts play');
  await quiet(P);
  const cdp = await P.context().newCDPSession(P);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const st = pc.c.stick, r = st.r;
  const sy0 = await P.evaluate(() => PG.G.ship.y);
  await tp('touchStart', [{ x: st.x, y: st.y, id: 1 }]); await tp('touchMove', [{ x: st.x, y: st.y - r * 0.9, id: 1 }]); await P.waitForTimeout(60); await P.evaluate(() => PG.step(15));
  const sy1 = await P.evaluate(() => PG.G.ship.y);
  await tp('touchMove', [{ x: st.x + r * 0.9, y: st.y, id: 1 }]); await P.waitForTimeout(60); await P.evaluate(() => PG.step(40));
  const tr = await P.evaluate(() => ({ vx: PG.G.ship.vx, f: PG.G.ship.face }));
  await tp('touchMove', [{ x: st.x - r * 0.9, y: st.y, id: 1 }]); await P.waitForTimeout(60); await P.evaluate(() => PG.step(1));
  const tl = await P.evaluate(() => PG.G.ship.face);
  check(sy1 < sy0 - 20, 'joystick up moves the ship up', [sy0, sy1]);
  check(tr.vx > 2 && tr.f === 1 && tl === -1, 'joystick right thrusts; flicking left reverses instantly', { tr, tl });
  // second finger on FIRE while steering (multi-touch, hold = auto-fire)
  const id0 = await P.evaluate(() => { PG.G.las = []; PG.G.ship.cd = 0; return PG.G.lasId; });
  await tp('touchStart', [{ x: st.x - r * 0.9, y: st.y, id: 1 }, { x: pc.c.fire.x, y: pc.c.fire.y, id: 2 }]); await P.waitForTimeout(60); await P.evaluate(() => PG.step(30));
  const lz = await P.evaluate(id0 => PG.G.lasId - id0, id0); await tp('touchEnd', []); await P.waitForTimeout(50);
  check(lz >= 4, 'holding FIRE auto-fires while the other thumb steers (multi-touch)', lz);
  const bb = await P.evaluate(() => PG.G.bombs); await P.touchscreen.tap(pc.c.bomb.x, pc.c.bomb.y); await P.evaluate(() => PG.step(1));
  check(await P.evaluate(() => PG.G.bombs) === bb - 1, 'BOMB button fires a smart bomb');
  await P.evaluate(() => { PG.G.hyperRisk = 0; PG.G.ship.hcd = 0; }); const hx = await P.evaluate(() => PG.G.ship.x);
  await P.touchscreen.tap(pc.c.hyper.x, pc.c.hyper.y); await P.evaluate(() => PG.step(1));
  check(Math.abs((await P.evaluate(() => PG.G.ship.x)) - hx) > 5, 'HYPER button jumps to hyperspace');
  await P.evaluate(() => PG.freeze(false)); await P.touchscreen.tap(pc.c.pause.x, pc.c.pause.y); await P.waitForTimeout(150);
  check(await P.evaluate(() => PG.app.paused), 'pause button works on touch');
  check(P.errs.length === 0, 'iPhone portrait: no console errors', P.errs);

  say('== iPHONE 13 LANDSCAPE');
  const LS = await open({ ...devices['iPhone 13 landscape'] });
  await LS.evaluate(() => { PG.start(1); }); await LS.waitForTimeout(200);
  const lc = await LS.evaluate(() => ({ c: PG.controls(), pf: { ...PG.render.R.pf }, dpr: PG.render.R.dpr, cw: innerWidth, ch: innerHeight }));
  const pfl = lc.pf.x / lc.dpr, pfr = (lc.pf.x + lc.pf.w) / lc.dpr;
  check(['fire', 'bomb', 'hyper'].every(k => lc.c[k].x - lc.c[k].r >= pfr - 1 && lc.c[k].x + lc.c[k].r <= lc.cw && lc.c[k].y + lc.c[k].r <= lc.ch) && lc.c.stick.x + lc.c.stick.r <= pfl + 1, 'landscape: joystick left, FIRE/BOMB/HYPER right, beside the playfield and on screen', { pfl, pfr, c: lc.c });
  await quiet(LS);
  await LS.touchscreen.tap(lc.c.fire.x, lc.c.fire.y); await LS.evaluate(() => PG.step(1));
  check(await LS.evaluate(() => PG.G.las.length) === 1, 'landscape FIRE works');
  check(LS.errs.length === 0, 'iPhone landscape: no console errors', LS.errs);

  say('== iPAD PORTRAIT');
  const IP = await open({ ...devices['iPad Mini'] });
  await IP.evaluate(() => { PG.start(1); }); await IP.waitForTimeout(300);
  const ic = await IP.evaluate(() => ({ c: PG.controls(), pf: { ...PG.render.R.pf }, dpr: PG.render.R.dpr, ch: innerHeight }));
  check(ic.c.fire.y - ic.c.fire.r >= (ic.pf.y + ic.pf.h) / ic.dpr - 1 && ic.c.fire.y + ic.c.fire.r <= ic.ch, 'iPad: touch controls below the playfield');
  check(IP.errs.length === 0, 'iPad: no console errors', IP.errs);

  say('== RENDER FALLBACKS');
  const NF = await open({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 }, URL + '?nofilter');
  await NF.evaluate(() => { PG.start(1); }); await NF.waitForTimeout(500);
  const nf = await NF.evaluate(() => ({ f: PG.render.R.FILTER_OK, ss: PG.render.R.ss, w: PG.render.cv.width }));
  check(!nf.f && nf.ss === 2 && nf.w === 2000, 'Safari-style blur fallback runs; 1x screens get clean 2:1 supersampling', nf);
  check(NF.errs.length === 0, 'fallback: no console errors', NF.errs);

  say('== ARCADE REGRESSION');
  for (const path of ['', 'games/tube-shooter/', 'games/trackball-football/', 'games/star-invaders/', 'games/planet-guardian/']) {
    const p = await open({ viewport: { width: 1280, height: 800 } }, BASE + path); const t = await p.title();
    if (!path) { const cards = await p.evaluate(() => (window.ARCADE_GAMES || []).map(g => g.slug)); check(cards[0] === 'planet-guardian' && ['tube-shooter', 'trackball-football', 'star-invaders'].every(s => cards.includes(s)), 'landing page lists Planet Guardian first plus all earlier games', cards.join(',')); }
    check(p.errs.length === 0, 'loads without console errors: /' + path + ' (' + t + ')', p.errs);
    await p.context().close();
  }
  say(fails ? '\n' + fails + ' FAIL' : '\nALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
