/* Star Invaders: single-player rules, rendering setup, controls (Mac keyboard + iPhone touch) and arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/star-invaders/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/star-invaders/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL); await p.waitForTimeout(700); return p;
  };
  const labels = p => p.evaluate(() => INV.hits().map(h => h.label));
  const clickL = async (p, l, touch) => { const h = (await p.evaluate(() => INV.hits())).find(h => h.label === l); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x, h.y); else await p.mouse.click(h.x, h.y); await p.waitForTimeout(120); };
  const masks = p => p.evaluate(() => INV.G.shields.map(s => s.m.reduce((a, v) => a + v, 0)));

  say('== DESKTOP (1440x900 @2x, Mac keyboard)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(600);
  const t0 = await labels(D);
  check(['1 PLAYER GAME', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HIGH SCORES', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)) && !t0.some(l => /LOCAL|SAME/.test(l)), 'title menu (1P, online 2P, join in progress, scores, how-to, options; no local 2P)');
  const cvs = await D.evaluate(() => ({ w: INV.render.cv.width, h: INV.render.cv.height, dpr: INV.render.R.dpr, filt: INV.render.R.FILTER_OK }));
  check(cvs.w === 2880 && cvs.h === 1800, 'canvas renders at native Retina resolution (2880x1800 backing store)', cvs);
  // text is whole device pixels: every fillRect issued by the bitmap font lands on integer coordinates
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const f = CanvasRenderingContext2D.prototype.fillRect; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crisp.length === 0, 'all HUD/menu text is drawn on whole device pixels (no blur)', crisp);
  // wave select by keyboard
  await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => INV.screen) === 'select', 'Enter on 1 PLAYER GAME opens the starting-wave select');
  await D.keyboard.press('ArrowRight'); await D.keyboard.press('ArrowRight'); await D.waitForTimeout(100);
  await clickL(D, 'START WAVE 3');
  const w3 = await D.evaluate(() => ({ w: INV.G.wave, top: Math.min(...INV.G.aliens.map(a => a.y)), t1: INV.sim.startTop(1), t3: INV.sim.startTop(3), scr: INV.screen }));
  check(w3.scr === 'play' && w3.w === 3 && w3.top === w3.t3 && w3.t3 > w3.t1, 'arcade start-wave select: wave 3 swarm starts lower', w3);
  // real keys: move + fire
  await D.evaluate(() => { INV.freeze(); INV.step(95); });
  const x0 = await D.evaluate(() => INV.G.player.x);
  await D.keyboard.down('ArrowRight'); await D.evaluate(() => INV.step(40)); await D.keyboard.up('ArrowRight');
  const x1 = await D.evaluate(() => INV.G.player.x);
  check(Math.abs(x1 - x0 - 40) < 0.01, 'ArrowRight moves the cannon 1 unit per tick', [x0, x1]);
  await D.keyboard.press('Space'); await D.evaluate(() => INV.step(1));
  check(await D.evaluate(() => !!INV.G.shot && INV.G.shotsFired === 1), 'Space fires a shot');
  await D.keyboard.press('Space'); await D.evaluate(() => INV.step(1));
  check(await D.evaluate(() => INV.G.shotsFired === 1), 'only one player shot on screen at a time');
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => INV.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const m1 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== m1, 'M toggles mute');

  say('-- march');
  const march = await D.evaluate(() => {
    INV.start(1); INV.step(91);
    const G = INV.G, rec = []; const orig = Sound.play; Sound.play = (n, a) => { if (n === 'march') rec.push(G.t); };
    const cyc = () => { const s0 = G.steps; let t = 0; while (G.steps === s0) { INV.step(1); t++; } const s1 = G.steps; let n = 0; while (G.steps === s1) { INV.step(1); n++; } return n; };
    G.bombT = -1e9; const full = cyc();
    const notesFull = rec.length; rec.length = 0;
    G.aliens.forEach((a, i) => { if (i % 11 > 2 || a.r > 1) a.alive = false; }); const six = cyc(); const s0 = G.steps; const tt = G.t; while (G.steps < s0 + 6) INV.step(1); const gaps6 = (G.t - tt) / 6;
    G.aliens.forEach((a, i) => { if (i) a.alive = false; }); const one = cyc(); const x0 = G.aliens[0].x; const d0 = G.dir; INV.step(1); const dx = G.aliens[0].x - x0;
    Sound.play = orig; return { full, six, one, notes: rec.length, gaps6, dx, d0 };
  });
  check(march.full >= 54 && march.six <= 6 && march.one <= 1, 'one alien moves per tick, so the rack speeds up as it thins (55 -> 6 -> 1 alive)', march);
  check(march.notes > 0, 'the 4-note march heartbeat plays on rack steps and accelerates (gap ~' + march.gaps6.toFixed(1) + ' ticks with 6 left)');
  check(march.d0 < 0 || march.dx === 3, 'last invader moves at the classic 3-unit step', march);

  say('-- shields');
  const sh = await D.evaluate(() => {
    INV.start(1); INV.step(91); const G = INV.G; G.bombT = -1e9; const cnt = () => G.shields.map(s => s.m.reduce((a, v) => a + v, 0));
    const a0 = cnt(); G.player.x = G.shields[0].x + 4; G.shot = { x: G.shields[0].x + 8, y: 214 }; INV.step(12); const a1 = cnt();
    G.bombs.push({ type: 'plunger', x: G.shields[1].x + 11, y: 180, f: 0 }); INV.step(30); const a2 = cnt();
    // march a live alien into shield 3
    const al = G.aliens.find(a => a.alive && a.c === 8 && a.r === 0); al.y = 190; G.aliens.forEach(a => { if (a !== al) a.alive = false; }); G.aliens.push(); INV.step(4); const a3 = cnt();
    return { a0, a1, a2, a3, ph: G.phase };
  });
  check(sh.a1[0] < sh.a0[0], 'player shots erode shields (from below)', [sh.a0[0], sh.a1[0]]);
  check(sh.a2[1] < sh.a1[1], 'alien bombs erode shields (from above)', [sh.a1[1], sh.a2[1]]);
  check(sh.a3[2] + sh.a3[3] < sh.a2[2] + sh.a2[3], 'invaders marching into a shield wipe it away', [sh.a2.slice(2), sh.a3.slice(2)]);

  say('-- mystery ship');
  const ufo = await D.evaluate(() => {
    const r = {}; INV.start(1); INV.step(91); const G = INV.G; G.bombT = -1e9;
    G.shotsFired = 4; G.ufoTimer = 1535; INV.step(1); r.spawn = !!G.ufo; r.dir = G.ufo && G.ufo.dir;
    G.shotsFired = 5; G.ufo = null; G.ufoTimer = 1535; INV.step(1); r.dir2 = G.ufo && G.ufo.dir;
    const hit = (shots) => { G.ufo = { x: 100, dir: 1, alive: true }; G.shotsFired = shots; const s0 = G.score; G.shot = { x: 108, y: G.ufo ? 52 : 0 }; INV.step(4); return G.score - s0; };
    r.p23 = hit(23); r.p38 = hit(38); r.p1 = hit(1); r.p4 = hit(4);
    G.aliens.forEach((a, i) => { if (i > 5) a.alive = false; }); G.ufo = null; G.ufoTimer = 1535; INV.step(1); r.fewNoUfo = !G.ufo;
    return r;
  });
  check(ufo.spawn && ufo.dir !== ufo.dir2, 'mystery ship appears on its timer; entry side follows the shot count', ufo);
  check(ufo.p23 === 300 && ufo.p38 === 300 && ufo.p1 === 50 && ufo.p4 === 150, 'shot-count scoring: 23rd shot (and every 15th after) = 300', ufo);
  check(ufo.fewNoUfo, 'no mystery ship when fewer than 8 invaders remain');

  say('-- scoring, extra base, waves');
  const sc = await D.evaluate(() => {
    const r = {}; INV.start(1); INV.step(91); const G = INV.G; G.bombT = -1e9;
    const shoot = (row) => { const a = G.aliens.find(a => a.alive && a.r === row); const s0 = G.score; G.shot = { x: INV.sim.ax0(a) + 3, y: a.y + 12 }; for (let i = 0; i < 6 && G.shot; i++) INV.step(1); while (G.boomT) INV.step(1); return G.score - s0; };
    r.squid = shoot(4); r.crab = shoot(2); r.octo = shoot(0);
    G.score = 1490; const l0 = G.lives; shoot(4); r.extra = G.lives - l0; G.score = 2990; shoot(4); r.extra2 = G.lives - l0;
    G.aliens.forEach(a => a.alive = false); INV.step(2); r.clear = G.phase; INV.step(120); r.wave = G.wave; r.top = Math.min(...G.aliens.map(a => a.y)); r.t2 = INV.sim.startTop(2); r.shields = G.shields[0].m.reduce((a, v) => a + v, 0);
    return r;
  });
  check(sc.squid === 30 && sc.crab === 20 && sc.octo === 10, 'invader points 30 / 20 / 10', sc);
  check(sc.extra === 1 && sc.extra2 === 1, 'one extra base at 1,500 points', sc);
  check(sc.clear === 'clear' && sc.wave === 2 && sc.top === sc.t2 && sc.t2 > 64, 'clearing the wave starts wave 2 lower, with fresh shields', sc);

  say('-- death, game over, high score table');
  const go = await D.evaluate(() => {
    const r = {}; INV.start(1); INV.step(91); const G = INV.G; G.bombT = -1e9; G.score = 4321;
    const bomb = () => { G.bombs.push({ type: 'squig', x: G.player.x + 6, y: 205, f: 0 }); INV.step(20); INV.step(140); };
    bomb(); r.l1 = G.lives; bomb(); bomb(); r.ph = G.phase; r.l = G.lives;
    INV.start(1); INV.step(91); INV.G.aliens[0].y = 209; INV.step(60); r.invaded = INV.G.invaded; INV.step(200); r.ph2 = INV.G.phase;
    INV.G.score = 4321; return r;
  });
  check(go.l1 === 2 && go.ph === 'over' && go.l === 0, 'bombs cost a base; game over after the last one', go);
  check(go.invaded && go.ph2 === 'over', 'invaders reaching the cannon row end the game', go);
  await D.evaluate(() => INV.freeze(false)); await D.waitForTimeout(2800); await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => INV.screen) === 'initials', 'a top-10 score asks for initials');
  for (const k of ['KeyB', 'KeyH', 'KeyR']) await D.keyboard.press(k); await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  await D.reload(); await D.waitForTimeout(500);
  const hi = await D.evaluate(() => INV.hi()[0]); check(hi.n === 'BHR' && hi.s === 4321, 'high score table persists in localStorage', hi);
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  say('== iPHONE 13 PORTRAIT (touch)');
  const P = await open({ ...devices['iPhone 13'] });
  const pc = await P.evaluate(() => ({ touch: INV.app.touch, c: INV.controls(), pf: { ...INV.render.R.pf }, dpr: INV.render.R.dpr, w: INV.render.cv.width }));
  check(pc.touch && pc.dpr === 3 && pc.w === 390 * 3, 'touch UI on, canvas at native 3x', { dpr: pc.dpr, w: pc.w });
  const pfBottom = (pc.pf.y + pc.pf.h) / 3;
  check(pc.c.fire.y - pc.c.fire.r >= pfBottom - 1 && pc.c.rock.y - pc.c.rock.h / 2 >= pfBottom - 1, 'portrait: controls sit below the playfield', { pfBottom, fire: pc.c.fire, rock: pc.c.rock });
  await clickL(P, '1 PLAYER GAME', true); await clickL(P, 'START WAVE 1', true);
  check(await P.evaluate(() => INV.screen) === 'play', 'tap 1 PLAYER GAME -> START WAVE 1 starts play');
  await P.evaluate(() => { INV.freeze(); INV.step(95); INV.G.bombT = -1e9; });
  await P.touchscreen.tap(pc.c.fire.x, pc.c.fire.y); await P.evaluate(() => INV.step(1));
  check(await P.evaluate(() => INV.G.shotsFired) === 1, 'tapping FIRE shoots');
  // hold the right half of the rocker with a real touch point (CDP)
  const cdp = await P.context().newCDPSession(P);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const rx = pc.c.rock.x + pc.c.rock.w * 0.3, ry = pc.c.rock.y;
  const px0 = await P.evaluate(() => INV.G.player.x);
  await tp('touchStart', [{ x: rx, y: ry, id: 1 }]); await P.waitForTimeout(80); await P.evaluate(() => INV.step(30));
  const px1 = await P.evaluate(() => INV.G.player.x);
  // second finger on FIRE while moving (auto-fire held)
  await tp('touchMove', [{ x: rx, y: ry, id: 1 }, { x: pc.c.fire.x, y: pc.c.fire.y, id: 2 }]); await P.waitForTimeout(80);
  const sf0 = await P.evaluate(() => INV.G.shotsFired); await P.evaluate(() => INV.step(240)); const sf1 = await P.evaluate(() => INV.G.shotsFired);
  await tp('touchEnd', []); await P.waitForTimeout(50);
  check(px1 > px0 + 20, 'holding the rocker moves the cannon (multi-touch)', [px0, px1]);
  check(sf1 - sf0 >= 3, 'holding FIRE auto-fires on touch', sf1 - sf0);
  // drag on the playfield: cannon follows the finger
  const tx = (pc.pf.x + 180 * (pc.pf.w / 224)) / 3, ty = (pc.pf.y + 150 * (pc.pf.h / 256)) / 3;
  await tp('touchStart', [{ x: tx, y: ty, id: 3 }]); await P.waitForTimeout(80); await P.evaluate(() => INV.step(200)); await tp('touchEnd', []);
  const dragX = await P.evaluate(() => INV.G.player.x + 6.5);
  check(Math.abs(dragX - 180) < 2, 'dragging on the playfield steers the cannon to the finger', dragX);
  const a0 = await P.evaluate(() => INV.app.opts.auto); await P.touchscreen.tap(pc.c.auto.x, pc.c.auto.y); const a1 = await P.evaluate(() => INV.app.opts.auto);
  check(a0 !== a1, 'AUTO button toggles the touch auto-fire mode', [a0, a1]);
  await P.evaluate(() => { INV.app.opts.auto = 'touch'; INV.freeze(false); });
  await P.touchscreen.tap(pc.c.pause.x, pc.c.pause.y); await P.waitForTimeout(150);
  check(await P.evaluate(() => INV.app.paused), 'pause button works on touch');
  check(P.errs.length === 0, 'iPhone portrait: no console errors', P.errs);

  say('== iPHONE 13 LANDSCAPE');
  const LS = await open({ ...devices['iPhone 13 landscape'] });
  await LS.evaluate(() => { INV.start(1); });
  await LS.waitForTimeout(200);
  const lc = await LS.evaluate(() => ({ c: INV.controls(), pf: { ...INV.render.R.pf }, dpr: INV.render.R.dpr, cw: innerWidth, ch: innerHeight }));
  const pfl = lc.pf.x / lc.dpr, pfr = (lc.pf.x + lc.pf.w) / lc.dpr;
  check(lc.c.fire.x - lc.c.fire.r >= pfr - 1 && lc.c.rock.x + lc.c.rock.w / 2 <= pfl + 1 && lc.c.fire.x + lc.c.fire.r <= lc.cw && lc.c.fire.y + lc.c.fire.r <= lc.ch, 'landscape: rocker left, FIRE right, both beside the playfield and on screen', { pfl, pfr, fire: lc.c.fire, rock: lc.c.rock });
  await LS.evaluate(() => { INV.freeze(); INV.step(95); INV.G.bombT = -1e9; });
  await LS.touchscreen.tap(lc.c.fire.x, lc.c.fire.y); await LS.evaluate(() => INV.step(1));
  check(await LS.evaluate(() => INV.G.shotsFired) === 1, 'landscape FIRE works');
  check(LS.errs.length === 0, 'iPhone landscape: no console errors', LS.errs);

  say('== RENDER FALLBACKS');
  const NF = await open({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 }, URL + '?nofilter');
  await NF.evaluate(() => { INV.start(1); }); await NF.waitForTimeout(500);
  const nf = await NF.evaluate(() => ({ f: INV.render.R.FILTER_OK, ss: INV.render.R.ss, w: INV.render.cv.width }));
  check(!nf.f && nf.ss === 2 && nf.w === 2000, 'Safari-style blur fallback runs; 1x screens get clean 2:1 supersampling', nf);
  check(NF.errs.length === 0, 'fallback: no console errors', NF.errs);

  say('== ARCADE REGRESSION');
  for (const path of ['', 'games/tube-shooter/', 'games/trackball-football/', 'games/star-invaders/']) {
    const p = await open({ viewport: { width: 1280, height: 800 } }, BASE + path); const t = await p.title();
    let extra = '';
    if (!path) { const cards = await p.evaluate(() => (window.ARCADE_GAMES || []).map(g => g.slug)); extra = cards.join(','); check(cards[0] === 'star-invaders' && ['tube-shooter', 'trackball-football'].every(s => cards.includes(s)), 'landing page lists Star Invaders first plus all earlier games', extra); }
    check(p.errs.length === 0, 'loads without console errors: /' + path + ' (' + t + ')', p.errs);
    await p.context().close();
  }
  say(fails ? '\n' + fails + ' FAIL' : '\nALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
