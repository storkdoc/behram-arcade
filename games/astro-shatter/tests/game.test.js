/* Astro Shatter: single-player rules, WebGL2 rendering setup, controls (Mac keyboard, gamepad, iPhone touch),
   Canvas2D fallback and arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/astro-shatter/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/astro-shatter/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (opts, url, init) => {
    const c = await b.newContext(opts); if (init) await c.addInitScript(init); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL); await p.waitForTimeout(900); return p;
  };
  // software GL (swiftshader) renders the 5 MP Retina canvas slowly, so wait for real frames after every UI transition
  const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const labels = async p => { await raf(p); return p.evaluate(() => AST.hits().map(h => h.label)); };
  const clickL = async (p, l, touch) => { await raf(p); const h = (await p.evaluate(() => AST.hits())).find(h => h.label === l); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x, h.y); else await p.mouse.click(h.x, h.y); await p.waitForTimeout(150); await raf(p); };

  say('== DESKTOP (1440x900 @2x, Mac keyboard)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(900);
  const t0 = await labels(D);
  check(['1 PLAYER GAME', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HIGH SCORES', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)) && !t0.some(l => /LOCAL|SAME/.test(l)), 'title menu (1P, online 2P, join in progress, scores, how-to, options; no local 2P)', t0);
  const gl = await D.evaluate(() => { const R = AST.render.R; return { mode: R.mode, hdr: R.hdr, msaa: R.msaa, w: AST.render.cv.width, h: AST.render.cv.height, hw: AST.render.hud.width, err: R.glErr }; });
  check(gl.mode === 'gl' && gl.w === 2880 && gl.h === 1800 && gl.hw === 2880, 'WebGL2 scene + HUD canvases at native Retina resolution (2880x1800)', gl);
  check(gl.msaa >= 4 || gl.msaa === 0, 'anti-aliasing: 4x MSAA (or FXAA when unavailable)', gl);
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { AST.start(1); requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; AST.toTitle(); r(bad.slice(0, 3)); })); })); }));
  check(crisp.length === 0, 'all HUD/menu text is drawn on whole device pixels (no blur), menus and in-game HUD', crisp);
  // wave select by keyboard
  await raf(D); await D.keyboard.press('Enter'); await raf(D);
  check(await D.evaluate(() => AST.screen) === 'select', 'Enter on 1 PLAYER GAME opens the starting-wave select');
  await D.keyboard.press('ArrowRight'); await D.keyboard.press('ArrowRight'); await raf(D);
  await clickL(D, 'START WAVE 3');
  const w3 = await D.evaluate(() => ({ w: AST.G.wave, n: AST.G.rocks.filter(r => r.s === 3).length, n1: AST.sim.waveRocks(1), n3: AST.sim.waveRocks(3), scr: AST.screen, lives: AST.G.lives }));
  check(w3.scr === 'play' && w3.w === 3 && w3.n === w3.n3 && w3.n3 > w3.n1, 'arcade start-wave select: wave 3 starts with more large rocks', w3);
  await D.evaluate(() => { AST.freeze(); AST.step(101); const G = AST.G; G.saucerT = 1e9; G.rocks.length = 0; AST.sim.rockAt(3, G.W / 2, 80, 0, 0); G.ship.x = G.W / 2; G.ship.y = G.H / 2; G.ship.vx = G.ship.vy = 0; G.ship.a = 0; G.ship.shield = 0; });
  // inertia: thrust, then coast with drag
  await D.keyboard.down('ArrowUp'); await D.evaluate(() => AST.step(30)); await D.keyboard.up('ArrowUp');
  const in1 = await D.evaluate(() => { const p = AST.G.ship, v0 = Math.hypot(p.vx, p.vy), x0 = p.x; AST.step(60); const v1 = Math.hypot(p.vx, p.vy); return { v0, v1, moved: p.x - x0, thrust: p.thrust }; });
  check(in1.v0 > 2.5 && in1.v1 > in1.v0 * 0.5 && in1.v1 < in1.v0 && in1.moved > 60 && !in1.thrust, 'inertia: thrust builds speed, the ship coasts after release and drag slowly bleeds it off', in1);
  const rot = await D.evaluate(() => { const p = AST.G.ship; p.vx = p.vy = 0; const a0 = p.a; AST.keys.ArrowLeft = true; AST.step(10); AST.keys.ArrowLeft = false; return { d: p.a - a0, want: -10 * AST.sim.C.ROT }; });
  check(Math.abs(rot.d - rot.want) < 1e-9, 'Left arrow rotates the ship', rot);
  const wrap = await D.evaluate(() => { const G = AST.G, p = G.ship; p.x = G.W - 1; p.y = 100; p.vx = 3; p.vy = 0; AST.step(1); const a = p.x; p.x = 50; p.y = 1; p.vx = 0; p.vy = -3; AST.step(1); return { a, b: p.y, H: G.H }; });
  check(wrap.a < 5 && wrap.b > wrap.H - 5, 'ship wraps around the screen edges', wrap);
  // shots: 4 max, wrap, expire
  const shots = await D.evaluate(() => { const G = AST.G, p = G.ship; p.vx = p.vy = 0; p.x = G.W / 2; p.y = G.H / 2; p.a = Math.PI / 2; p.alive = true; p.respawnT = 0; p.hyper = 0; G.rocks.length = 0; AST.sim.rockAt(3, G.W / 2, 80, 0, 0); G.shots.length = 0; const f0 = G.fired;
    const o = []; for (let i = 0; i < 6; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' })); AST.step(1); o.push(G.shots.length); }
    const fired = G.fired - f0; return { o, fired }; });
  check(Math.max(...shots.o) === 4 && shots.fired === 4, 'Space fires one shot per press, at most 4 on screen', shots);
  const sw = await D.evaluate(() => { const G = AST.G; G.shots.length = 0; G.shots.push({ x: G.W - 2, y: 300, vx: 9.5, vy: 0, life: 52, id: 999 }); AST.step(1); const x = G.shots[0].x; AST.step(60); return { x, left: G.shots.length }; });
  check(sw.x < 10 && sw.left === 0, 'shots wrap the edges and expire', sw);
  // splitting + scoring
  const split = await D.evaluate(() => {
    const G = AST.G, p = G.ship, S = AST.sim; G.score = 0; G.shots.length = 0; p.x = 200; p.y = 300; p.vx = p.vy = 0; p.a = 0; p.shield = 0; G.nextExtra = 10000;
    const shoot = (s) => { G.rocks.length = 0; G.sshots.length = 0; const r = S.rockAt(s, 300, 300, 0, 0); r.vx = r.vy = 0; const sc = G.score; G.shots.length = 0; G.shots.push({ x: 300 - 40, y: 300, vx: 9.5, vy: 0, life: 52, id: 1 }); AST.step(8); return { pts: G.score - sc, kids: G.rocks.map(r => r.s) }; };
    return [shoot(3), shoot(2), shoot(1)];
  });
  check(split[0].pts === 20 && split[0].kids.join() === '2,2' && split[1].pts === 50 && split[1].kids.join() === '1,1' && split[2].pts === 100 && split[2].kids.length === 0, 'large -> 2 medium (20), medium -> 2 small (50), small destroyed (100)', split);
  // saucers
  const sau = await D.evaluate(() => {
    const G = AST.G, S = AST.sim, p = G.ship; const out = {};
    const run = (kind, score) => { G.rocks.length = 0; S.rockAt(1, 3, 3, 0, 0); G.score = score; G.sshots.length = 0; G.saucer = null; p.x = G.W / 2; p.y = G.H / 2; p.vx = p.vy = 0; p.alive = true; p.shield = 1e9; S.spawnSaucer(kind); G.saucer.y = G.H * 0.2;
      const errs = []; let guard = 0; while (errs.length < 12 && guard++ < 4000) { const n = G.sshots.length; AST.step(1); if (!G.saucer) { S.spawnSaucer(kind); G.saucer.y = G.H * 0.2; } if (G.sshots.length > n) { const s = G.sshots[G.sshots.length - 1]; const a = Math.atan2(S.wrapD(p.y - s.y, G.H), S.wrapD(p.x - s.x, G.W)); errs.push(Math.abs(S.wrapD(s.a - a, Math.PI * 2))); } }
      errs.sort((a, b) => a - b); return { med: errs[errs.length >> 1], max: errs[errs.length - 1], n: errs.length }; };
    out.big = run('big', 0); out.small0 = run('small', 0); out.small40 = run('small', 40000);
    const kill = kind => { G.saucer = null; S.spawnSaucer(kind); const s = G.saucer; s.x = 400; s.y = 200; s.vx = s.vy = 0; G.rocks.length = 0; S.rockAt(1, 3, 3, 0, 0); const sc = G.score; G.shots.length = 0; G.shots.push({ x: 380 - s.r, y: 200, vx: 9.5, vy: 0, life: 52, id: 2 }); AST.step(6); return G.score - sc; };
    out.ptsBig = kill('big'); out.ptsSmall = kill('small'); p.shield = 0; G.saucer = null; G.sshots.length = 0; G.saucerT = 1e9;
    return out;
  });
  check(sau.big.med > 0.4, 'big saucer fires at random', sau.big);
  check(sau.small0.max < 0.8 && sau.small40.max < 0.03 && sau.small40.med < sau.small0.med, 'small saucer aims at you, and gets more accurate as your score climbs', { s0: sau.small0, s40: sau.small40 });
  check(sau.ptsBig === 200 && sau.ptsSmall === 1000, 'saucer points: big 200, small 1000', sau);
  // hyperspace
  const hy = await D.evaluate(() => { const G = AST.G, p = G.ship; G.rocks.length = 0; AST.sim.rockAt(1, 3, 3, 0, 0); p.alive = true; p.hyper = 0; p.hyperCool = 0; p.x = 100; p.y = 100; const h0 = G.hypers;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Enter' })); AST.step(1); const inH = p.hyper > 0; AST.step(40);
    let moved = 0, deaths = 0; for (let i = 0; i < 200; i++) { G.lives = 3; p.alive = true; p.hyper = 0; p.hyperCool = 0; p.respawnT = 0; const d0 = G.deaths; const x0 = p.x, y0 = p.y; AST.keys.ShiftLeft = true; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); AST.step(40); if (p.x !== x0 || p.y !== y0) moved++; deaths += G.deaths - d0; }
    return { inH, n: G.hypers - h0, moved, deaths, risk: AST.sim.hyperRisk() }; });
  check(hy.inH && hy.n >= 200 && hy.moved >= 190 && hy.deaths > 0 && hy.deaths < 40, 'hyperspace (Enter / Shift): vanish, reappear elsewhere, sometimes fatally', hy);
  // extra life at 10,000
  const ex = await D.evaluate(() => { const G = AST.G, p = G.ship; G.lives = 3; p.alive = true; p.shield = 0; G.score = 9950; G.nextExtra = 10000; G.rocks.length = 0; const r = AST.sim.rockAt(1, 300, 300, 0, 0); G.shots.length = 0; G.shots.push({ x: 280, y: 300, vx: 9.5, vy: 0, life: 52, id: 3 }); AST.step(5); return { s: G.score, l: G.lives, next: G.nextExtra }; });
  check(ex.s === 10050 && ex.l === 4 && ex.next === 20000, 'extra ship at 10,000 points', ex);
  // heartbeat speeds up
  const hb = await D.evaluate(() => { AST.start(1); AST.step(101); const G = AST.G; G.saucerT = 1e9; G.ship.shield = 1e9; const rec = []; const orig = AST.sound.play; AST.sound.play = (n, a) => { if (n === 'beat') rec.push([G.t, a]); return orig.call(AST.sound, n, a); };
    AST.step(1500); AST.sound.play = orig; const gaps = rec.slice(1).map((r, i) => r[0] - rec[i][0]); return { n: rec.length, first: gaps.slice(0, 3), last: gaps.slice(-3), alt: rec.slice(0, 4).map(r => r[1]) }; });
  check(hb.n > 10 && hb.first[0] > hb.last[0] * 2 && hb.alt.join() === '0,1,0,1', 'two-tone heartbeat alternates and accelerates through the wave', hb);
  // wave progression
  const wv = await D.evaluate(() => { const G = AST.G; G.rocks.length = 0; G.saucer = null; AST.step(140); return { w: G.wave, n: G.rocks.filter(r => r.s === 3).length, want: AST.sim.waveRocks(2) }; });
  check(wv.w === 2 && wv.n === wv.want, 'clearing the rocks starts the next wave with more of them', wv);
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => AST.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const m1 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== m1, 'M toggles mute');
  // game over -> initials -> high score table (persisted)
  const go = await D.evaluate(() => { AST.start(1); AST.step(101); const G = AST.G; G.score = 23450; G.saucerT = 1e9; for (let i = 0; i < 3; i++) { G.ship.shield = 0; G.ship.alive && AST.sim.killShip('test'); AST.step(1); G.ship.respawnT = 0; G.rocks.length = 0; AST.sim.rockAt(1, 3, 3, 0, 0); AST.step(3); } AST.step(200); return { ph: G.phase, l: G.lives }; });
  check(go.ph === 'over' && go.l === 0, 'losing the last ship ends the game', go);
  await D.evaluate(() => { AST.freeze(false); AST.app.overT = 0; }); await raf(D); await D.keyboard.press('Enter'); await raf(D);
  check(await D.evaluate(() => AST.screen) === 'initials', 'a top-10 score asks for initials');
  for (const k of ['KeyB', 'KeyH', 'KeyR']) await D.keyboard.press(k); await raf(D); await D.keyboard.press('Enter'); await raf(D);
  check(await D.evaluate(() => AST.screen) === 'scores', 'initials -> high score table');
  await D.reload(); await D.waitForTimeout(800); await raf(D);
  const hi = await D.evaluate(() => AST.hi()[0]); check(hi.n === 'BHR' && hi.s === 23450, 'high score table persists in localStorage', hi);
  // classic vector mode + adaptive quality
  await D.evaluate(() => { AST.go('options'); }); await raf(D);
  const cl = (await labels(D)).find(l => /^GRAPHICS/.test(l)); await clickL(D, cl);
  await D.evaluate(() => AST.start(4)); await raf(D); await raf(D);
  const cv = await D.evaluate(() => ({ classic: AST.render.R.classic, drawn: AST.render.R.drawn }));
  check(cv.classic === true, 'Options: GRAPHICS toggles the Classic vector mode', cv);
  await D.evaluate(() => { AST.render.R.classic = false; localStorage.setItem('ast.classic', '0'); FX.st.classic = false; });
  const ad = await D.evaluate(() => new Promise(r => { const q0 = 2; const t0 = performance.now(); const id = setInterval(() => { const R = AST.render.R; if (R.quality < q0 || performance.now() - t0 > 20000) { clearInterval(id); r({ q0, q: R.quality, fps: R.fps, dpr: R.dpr, w: AST.render.cv.width }); } }, 200); }));
  check(ad.q < 2 && ad.dpr === 2 && ad.w === 2880, 'adaptive quality: slow software GPU (<45 fps for 3 s) drops effects, never the native resolution', ad);
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);
  await D.context().close();

  say('== GAMEPAD (standard mapping, stubbed)');
  const GP = await open({ viewport: { width: 1000, height: 700 } }, URL, () => {
    window.__pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  const gp = await GP.evaluate(async () => {
    const wait = n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
    const press = async i => { __pad.buttons[i].pressed = true; await wait(3); __pad.buttons[i].pressed = false; await wait(3); };
    await press(0); const scr1 = AST.screen; await press(0); const scr2 = AST.screen;
    AST.freeze(); AST.step(101); AST.freeze(false); const G = AST.G; G.saucerT = 1e9; G.rocks.length = 0; AST.sim.rockAt(1, 3, 3, 0, 0);
    const a0 = G.ship.a; __pad.axes[0] = -1; await wait(10); __pad.axes[0] = 0; const turned = G.ship.a !== a0;
    const f0 = G.fired; await press(0); const fired = G.fired - f0;
    __pad.buttons[7].pressed = true; await wait(10); const thr = G.ship.thrust; __pad.buttons[7].pressed = false; await wait(3);
    const h0 = G.hypers; await press(1); const hyp = G.hypers - h0;
    return { scr1, scr2, turned, fired, thr, hyp };
  });
  check(gp.scr1 === 'select' && gp.scr2 === 'play' && gp.turned && gp.fired === 1 && gp.thr && gp.hyp === 1, 'gamepad: A selects / fires, stick rotates, RT thrusts, B hyperspace', gp);
  check(GP.errs.length === 0, 'gamepad: no console errors', GP.errs);
  await GP.context().close();

  say('== iPHONE 13 PORTRAIT (touch)');
  const P = await open({ ...devices['iPhone 13'] });
  await clickL(P, '1 PLAYER GAME', true); await clickL(P, 'START WAVE 1', true);
  check(await P.evaluate(() => AST.screen) === 'play', 'tap 1 PLAYER GAME -> START WAVE 1 starts play');
  const pc = await P.evaluate(() => ({ touch: AST.app.touch, c: AST.controls(), pf: { ...AST.render.R.pf }, dpr: AST.render.R.dpr, w: AST.render.cv.width, mode: AST.render.R.mode }));
  check(pc.touch && pc.dpr === 3 && pc.w === 390 * 3 && pc.mode === 'gl', 'touch UI on, WebGL canvas at native 3x', { dpr: pc.dpr, w: pc.w });
  const pfBottom = (pc.pf.y + pc.pf.h) / 3, cs = pc.c;
  const below = ['rotL', 'rotR', 'thrust', 'fire'].every(k => cs[k].y - cs[k].r >= pfBottom - 1 && cs[k].y + cs[k].r <= 664) && cs.hyper.y - cs.hyper.h / 2 >= pfBottom - 1;
  check(below, 'portrait: ◀ ▶, THRUST, FIRE and HYPER sit below the playfield, on screen', { pfBottom, cs });
  await P.evaluate(() => { AST.freeze(); AST.step(101); const G = AST.G; G.saucerT = 1e9; G.rocks.length = 0; AST.sim.rockAt(1, 3, 3, 0, 0); G.ship.shield = 0; });
  await P.touchscreen.tap(cs.fire.x, cs.fire.y); await P.evaluate(() => AST.step(1));
  check(await P.evaluate(() => AST.G.fired) === 1, 'tapping FIRE shoots');
  const cdp = await P.context().newCDPSession(P);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const a0 = await P.evaluate(() => AST.G.ship.a);
  await tp('touchStart', [{ x: cs.rotR.x, y: cs.rotR.y, id: 1 }]); await P.waitForTimeout(80); await P.evaluate(() => AST.step(10));
  const a1 = await P.evaluate(() => AST.G.ship.a);
  await tp('touchMove', [{ x: cs.rotR.x, y: cs.rotR.y, id: 1 }, { x: cs.thrust.x, y: cs.thrust.y, id: 2 }, { x: cs.fire.x, y: cs.fire.y, id: 3 }]); await P.waitForTimeout(80);
  const mt = await P.evaluate(() => { const G = AST.G, f0 = G.fired; G.shots.length = 0; let mx = 0; for (let i = 0; i < 90; i++) { AST.step(1); mx = Math.max(mx, G.shots.length); } return { fired: G.fired - f0, thrust: G.ship.thrust, v: Math.hypot(G.ship.vx, G.ship.vy), mx }; });
  await tp('touchEnd', []); await P.waitForTimeout(60);
  check(a1 > a0 + 0.5, 'holding ▶ rotates the ship', [a0, a1]);
  check(mt.thrust && mt.v > 0.5 && mt.fired >= 5 && mt.mx <= 4, 'multi-touch: rotate + THRUST + held FIRE (auto-fire, still max 4 shots) together', mt);
  const h0 = await P.evaluate(() => AST.G.hypers); await P.touchscreen.tap(cs.hyper.x, cs.hyper.y); await P.evaluate(() => AST.step(1));
  check(await P.evaluate(() => AST.G.hypers) === h0 + 1, 'HYPER button jumps to hyperspace');
  // stick steering option
  await P.evaluate(() => { AST.app.opts.steer = 'stick'; AST.step(40); AST.G.ship.hyper = 0; AST.G.ship.alive = true; AST.G.ship.a = 0; });
  const st = (await P.evaluate(() => AST.controls())).stick;
  await tp('touchStart', [{ x: st.x, y: st.y - st.r * 0.6, id: 5 }]); await P.waitForTimeout(80); await P.evaluate(() => AST.step(40)); await tp('touchEnd', []);
  const sa = await P.evaluate(() => AST.G.ship.a);
  check(Math.abs(sa + Math.PI / 2) < 0.08, 'virtual stick steering points the ship where you push', sa);
  await P.evaluate(() => { AST.app.opts.steer = 'buttons'; AST.freeze(false); });
  await P.touchscreen.tap(cs.pause.x, cs.pause.y); await P.waitForTimeout(200);
  check(await P.evaluate(() => AST.app.paused), 'pause button works on touch');
  check(P.errs.length === 0, 'iPhone portrait: no console errors', P.errs);
  await P.context().close();

  say('== iPHONE 13 LANDSCAPE');
  const LS = await open({ ...devices['iPhone 13 landscape'] });
  await LS.evaluate(() => { AST.start(1); }); await LS.waitForTimeout(250);
  const lc = await LS.evaluate(() => ({ c: AST.controls(), pf: { ...AST.render.R.pf }, dpr: AST.render.R.dpr, cw: innerWidth, ch: innerHeight }));
  const on = ['rotL', 'rotR', 'thrust', 'fire'].every(k => { const q = lc.c[k]; return q.x - q.r >= 0 && q.x + q.r <= lc.cw && q.y + q.r <= lc.ch; });
  check(on && lc.c.rotR.x < lc.cw / 2 && lc.c.fire.x > lc.cw / 2 && lc.pf.w / lc.dpr >= lc.cw * 0.75, 'landscape: field fills the screen, rotate left / THRUST + FIRE right, all on screen', lc);
  await LS.evaluate(() => { AST.freeze(); AST.step(101); AST.G.saucerT = 1e9; AST.G.rocks.length = 0; AST.sim.rockAt(1, 3, 3, 0, 0); });
  await LS.touchscreen.tap(lc.c.fire.x, lc.c.fire.y); await LS.evaluate(() => AST.step(1));
  check(await LS.evaluate(() => AST.G.fired) === 1, 'landscape FIRE works');
  check(LS.errs.length === 0, 'iPhone landscape: no console errors', LS.errs);
  await LS.context().close();

  say('== CANVAS2D FALLBACK (?nogl)');
  const NF = await open({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 }, URL + '?nogl');
  await NF.evaluate(() => { AST.start(2); }); await NF.waitForTimeout(2500);
  const nf = await NF.evaluate(() => ({ mode: AST.render.R.mode, w: AST.render.cv.width, rocks: AST.G.rocks.length, t: AST.G.t }));
  check(nf.mode === '2d' && nf.w === 2000 && nf.rocks > 0 && nf.t > 30, 'no WebGL2: Canvas2D renderer runs the same game at native resolution', nf);
  check(NF.errs.length === 0, 'fallback: no console errors', NF.errs);
  await NF.context().close();

  say('== ARCADE REGRESSION');
  const fs = require('fs'), path = require('path'); const root = path.join(__dirname, '..', '..', '..');
  const slugs = fs.readdirSync(path.join(root, 'games')).filter(d => fs.existsSync(path.join(root, 'games', d, 'index.html')));
  for (const pth of ['', ...slugs.map(s => 'games/' + s + '/')]) {
    const p = await open({ viewport: { width: 1280, height: 800 } }, BASE + pth); const t = await p.title();
    if (!pth) { const cards = await p.evaluate(() => (window.ARCADE_GAMES || []).map(g => g.slug)); check(cards[0] === 'astro-shatter' && slugs.every(s => cards.includes(s)), 'landing page lists Astro Shatter first plus all other games', cards); }
    check(p.errs.length === 0, 'loads without console errors: /' + pth + ' (' + t + ')', p.errs);
    await p.context().close();
  }
  say(fails ? '\n' + fails + ' FAIL' : '\nALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
