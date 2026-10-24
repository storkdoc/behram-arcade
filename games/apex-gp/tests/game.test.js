/* Apex Grand Prix: rules, rendering setup, Mac keyboard + iPhone touch/tilt controls, 2D fallback, arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/apex-gp/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/apex-gp/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL, { timeout: 90000 }); await p.waitForTimeout(1200); return p;
  };
  const raf2 = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const labels = async p => { await raf2(p); return p.evaluate(() => AGP.hits().map(h => h.label)); };
  const clickL = async (p, l, touch) => { await raf2(p); const h = (await p.evaluate(() => AGP.hits())).find(h => h.label === l); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x + h.w / 2, h.y + h.h / 2); else await p.mouse.click(h.x + h.w / 2, h.y + h.h / 2); await p.waitForTimeout(150); };
  // frozen qualifying run past the intro, on the straight, no traffic nearby
  const ready = (p, circuit) => p.evaluate(c => { AGP.app.circuit = c || 'fuji'; AGP.startQualify(); AGP.freeze(); AGP.step(170); const G = AGP.G; G.cpu.forEach((o, i) => { o.dist = 2000 + i * 300; }); return G.phase; }, circuit);

  say('== DESKTOP (1440x900 @2x, Mac keyboard)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(1200);
  const t0 = await labels(D);
  check(['START RACE', 'HOST TWO-PLAYER ONLINE', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'RECORDS', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)), 'title menu (race, host online, join in progress, records, how-to, options)', t0);
  const r0 = await D.evaluate(() => ({ use2D: AGP.use2D, gl: [document.getElementById('gl').width, document.getElementById('gl').height], hud: [document.getElementById('hud').width, document.getElementById('hud').height], demo: AGP.app.demo, scr: AGP.screen }));
  check(!r0.use2D && r0.gl[0] === 2880 && r0.gl[1] === 1800, 'true-3D WebGL2 renderer at native Retina resolution (2880x1800)', r0);
  check(r0.hud[0] === 2880 && r0.hud[1] === 1800, 'HUD overlay at native device pixels');
  check(r0.demo, 'attract mode drives a demo lap behind the title');
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { if (x % 1 || y % 1 || dot % 1) bad.push([s, x, y, dot]); const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crisp.length === 0, 'all menu text is drawn on whole device pixels (no blur)', crisp);
  await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => AGP.screen) === 'select', 'Enter on START RACE opens circuit select');
  const s0 = await labels(D);
  check(['FUJI', 'SEASIDE', 'ALPINE RING', 'BEGINNER', 'PRO', 'EXPERT', 'START QUALIFYING'].every(l => s0.includes(l)), 'three circuits + three difficulties offered', s0);
  await D.keyboard.press('ArrowRight'); const c1 = await D.evaluate(() => AGP.app.circuit); await D.keyboard.press('ArrowLeft');
  check(c1 === 'seaside' && await D.evaluate(() => AGP.app.circuit) === 'fuji', '◀ ▶ cycles circuits on the select screen');
  await D.keyboard.press('Digit2'); check(await D.evaluate(() => AGP.app.diff) === 1, 'number keys pick difficulty');
  await clickL(D, 'START QUALIFYING');
  const q0 = await D.evaluate(() => ({ scr: AGP.screen, mode: AGP.G.mode, ph: AGP.G.phase, msg: AGP.app.msg && AGP.app.msg.text, tl: AGP.G.timeLeft }));
  check(q0.scr === 'play' && q0.mode === 'qualify' && q0.ph === 'intro' && q0.msg === 'PREPARE TO QUALIFY', '"PREPARE TO QUALIFY" banner (with voice) opens the qualifying lap', q0);
  const crispH = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { if (x % 1 || y % 1 || dot % 1) bad.push([s, x, y, dot]); return orig.call(this, ctx, s, x, y, dot, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crispH.length === 0, 'in-race HUD text snapped to device pixels', crispH);

  say('-- Mac keyboard driving');
  await ready(D);
  await D.keyboard.down('ArrowUp'); await D.evaluate(() => AGP.step(240)); 
  const v1 = await D.evaluate(() => AGP.G.car.v);
  check(v1 > 30, '▲ (Up arrow) accelerates', +v1.toFixed(1));
  await D.keyboard.press('Space'); await D.evaluate(() => AGP.step(2));
  check(await D.evaluate(() => AGP.G.car.gear) === 1, 'Space shifts LO → HI');
  await D.keyboard.press('ShiftLeft'); await D.evaluate(() => AGP.step(2)); const g2 = await D.evaluate(() => AGP.G.car.gear); await D.keyboard.press('Space'); await D.evaluate(() => AGP.step(2));
  check(g2 === 0, 'Shift also changes gear');
  const acc = await D.evaluate(() => { const S = AGP.sim; return { lo: S.engineAcc(30, 0, 1), hi: S.engineAcc(30, 1, 1), loTop: S.engineAcc(70, 0, 1), hiTop: S.engineAcc(70, 1, 1) }; });
  check(acc.lo > acc.hi && acc.hiTop > acc.loTop, 'LO gear pulls harder at low speed, HI gear needed for top speed', acc);
  const d0 = await D.evaluate(() => AGP.G.car.d); await D.keyboard.down('ArrowRight'); await D.evaluate(() => AGP.step(30)); await D.keyboard.up('ArrowRight');
  const st1 = await D.evaluate(() => ({ d: AGP.G.car.d, steer: AGP.G.car.steer }));
  check(st1.d > d0 + 0.5, '▶ (Right arrow) steers right', { d0, ...st1 });
  await D.keyboard.down('ArrowLeft'); await D.evaluate(() => AGP.step(50)); await D.keyboard.up('ArrowLeft');
  check(await D.evaluate(() => AGP.G.car.d) < st1.d - 0.5, '◀ steers left');
  await D.keyboard.up('ArrowUp'); await D.keyboard.down('ArrowDown'); const vb0 = await D.evaluate(() => AGP.G.car.v); await D.evaluate(() => AGP.step(30)); await D.keyboard.up('ArrowDown');
  const vb1 = await D.evaluate(() => AGP.G.car.v); check(vb1 < vb0 - 8, '▼ brakes hard', [vb0, vb1].map(x => +x.toFixed(1)));
  const off = await D.evaluate(() => { const c = AGP.G.car; c.d = 11; c.v = 60; c.ghost = 9; AGP.keys.ArrowUp = true; AGP.step(30); AGP.keys.ArrowUp = false; return { surf: c.surf, v: c.v }; });
  check(off.surf !== 'road' && off.surf !== 'kerb' && off.v < 55, 'running off-road onto grass/gravel slows the car', off);
  const sk = await D.evaluate(() => { const c = AGP.G.car; c.d = 0; c.v = 80; c.gear = 1; c.ghost = 9; AGP.keys.ArrowUp = true; AGP.keys.ArrowRight = true; let mx = 0, ev = 0; for (let i = 0; i < 40; i++) { AGP.step(1); mx = Math.max(mx, c.skid); } AGP.keys.ArrowUp = AGP.keys.ArrowRight = false; return { mx }; });
  check(sk.mx > 0.3, 'full lock at high speed skids (tyre squeal)', sk);
  const cr = await D.evaluate(() => { const G = AGP.G, c = G.car, S = AGP.sim, T = S.T; const g = T.signs[3]; c.dist = g.s - 0.5; c.d = g.side * (S.SIGN_D - 0.5); c.v = 40; c.ghost = 0; c.gear = 1; AGP.step(2); const a = c.crash; AGP.step(160); return { a, after: c.crash, d: c.d, ghost: c.ghost, why: c.wreck && c.wreck.why }; });
  check(cr.a > 0 && cr.why === 'sign', 'hitting a billboard explodes the car', cr);
  check(cr.after === 0 && Math.abs(cr.d) <= 7.5 && cr.ghost > 0, 'the car respawns on the racing line (briefly ghosted)', cr);
  const cc = await D.evaluate(() => { const G = AGP.G, c = G.car, o = G.cpu[0]; c.ghost = 0; c.crash = 0; c.d = 0; c.v = 80; o.dist = c.dist + 3; o.d = 0; o.v = 30; o.ghost = 0; o.crash = 0; AGP.step(3); return { me: c.crash > 0, cpu: o.crash > 0 }; });
  check(cc.me, 'rear-ending a CPU car at speed explodes you', cc);
  await D.evaluate(() => AGP.step(200));
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => AGP.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  check(!(await D.evaluate(() => AGP.app.paused)), 'P resumes');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const m1 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== m1, 'M mutes / unmutes');

  say('-- qualifying → grid → race');
  const qr = await D.evaluate(() => { AGP.startQualify(); AGP.freeze(); AGP.G.auto = true; let n = 0; while (AGP.G.phase !== 'done' && n < 20000) { AGP.step(1); n++; } return { ph: AGP.G.phase, qt: AGP.G.qualTime, grid: AGP.G.grid, score: AGP.G.score, msg: AGP.app.msg && AGP.app.msg.text, qual: AGP.qual().fuji }; });
  check(qr.ph === 'done' && qr.qt > 30 && qr.grid >= 1 && qr.grid <= 8, 'a flying qualifying lap sets a time and a grid slot', qr);
  check(/^QUALIFIED/.test(qr.msg) && qr.qual === qr.qt, '"QUALIFIED nTH" banner, qualifying record saved', qr.msg);
  const rc = await D.evaluate(() => { AGP.step(250); const G = AGP.G; return { mode: G.mode, grid: G.grid, ncpu: G.cpu.length, slot: G.car.slot, ahead: G.cpu.filter(o => o.dist > G.car.dist).length, score: G.score, msg: AGP.app.msg && AGP.app.msg.text }; });
  check(rc.mode === 'race' && rc.grid === qr.grid && rc.ncpu === 7 && rc.ahead === qr.grid - 1, 'race starts from the qualified grid slot with 7 CPU cars', rc);
  check(rc.msg === 'PREPARE TO RACE' && rc.score === qr.score, '"PREPARE TO RACE"; qualifying bonus carried into the race score', rc);
  const lt = await D.evaluate(() => { const ev = []; const G = AGP.G; while (G.phase !== 'run') AGP.step(1); return { ph: G.phase, msg: AGP.app.msg && AGP.app.msg.text }; });
  check(lt.ph === 'run' && lt.msg === 'GO!', 'start lights count down then GO!', lt);
  const race = await D.evaluate(() => { const G = AGP.G; G.auto = true; let ext = 0, t0 = G.timeLeft, laps = [], passes = 0, n = 0, minT = 1e9; while (!G.finished && G.phase !== 'over' && n < 60000) { const tl = G.timeLeft; AGP.step(1); if (G.timeLeft > tl + 1) ext++; minT = Math.min(minT, G.timeLeft); n++; } return { fin: G.finished, pos: G.pos, ext, cps: G.cps, laps: G.lapTimes.length, best: G.best, passes: G.passes, rec: AGP.laps().fuji, score: G.score, bonus: G.bonus, minT }; });
  check(race.fin && race.laps === 4, 'race runs the full 4 laps to the flag', race);
  check(race.ext >= 6 && race.cps === race.ext, 'checkpoints every half lap extend the time', { ext: race.ext, cps: race.cps });
  check(race.passes > 0 && race.pos >= 1, 'CPU traffic is overtaken (pass bonus) and final position computed', { passes: race.passes, pos: race.pos });
  check(race.rec && race.rec.t <= race.best + 1e-6 && race.bonus > 0, 'best lap stored as the circuit lap record; time bonus on finish', { rec: race.rec, best: race.best });
  const eg = await D.evaluate(() => { AGP.step(330); return AGP.screen; });
  check(eg === 'initials' || eg === 'results', 'after the flag: initials (if a high score) then results', eg);
  if (eg === 'initials') { await D.keyboard.type('BEH'); await D.keyboard.press('Enter'); await D.waitForTimeout(120); }
  const res = await D.evaluate(() => ({ scr: AGP.screen, hi: AGP.hi().slice(0, 10).map(e => e.n), stored: JSON.parse(localStorage.getItem('agp.scores') || '[]').length, name: localStorage.getItem('agp.name') }));
  check(res.scr === 'results' && (eg !== 'initials' || res.hi.includes('BEH')) && res.stored > 0, 'results screen; high score + initials stored in localStorage', res);
  const rl = await labels(D); check(['RACE AGAIN', 'CHANGE CIRCUIT', 'RECORDS', 'MAIN MENU'].every(l => rl.includes(l)), 'results offers race again / change circuit / records / menu');
  const persist = await D.evaluate(() => ({ laps: JSON.parse(localStorage.getItem('agp.laps')), qual: JSON.parse(localStorage.getItem('agp.qual')) }));
  check(persist.laps && persist.laps.fuji && persist.qual && persist.qual.fuji, 'lap and qualifying records persisted', persist);

  say('-- time up / DNQ');
  const dnq = await D.evaluate(() => { AGP.startQualify(); AGP.freeze(); AGP.step(170); AGP.G.timeLeft = 0.5; AGP.step(40); return { ph: AGP.G.phase, why: AGP.G.reason, msg: AGP.app.msg && AGP.app.msg.text }; });
  check(dnq.ph === 'over' && dnq.why === 'dnq' && dnq.msg === 'DID NOT QUALIFY', 'running out of time in qualifying = DID NOT QUALIFY', dnq);
  await D.evaluate(() => AGP.step(260)); await D.keyboard.press('Enter'); await D.waitForTimeout(100);
  check(['results', 'initials'].includes(await D.evaluate(() => AGP.screen)), 'Enter continues to the results after time up');

  say('-- all circuits drive cleanly (autopilot qualifying lap)');
  for (const c of ['seaside', 'alpine']) {
    const r = await D.evaluate(c => { AGP.app.circuit = c; AGP.startQualify(); AGP.freeze(); AGP.G.auto = true; let n = 0, crashes = 0; while (AGP.G.phase !== 'done' && AGP.G.phase !== 'over' && n < 20000) { const a = AGP.G.car.crash > 0; AGP.step(1); if (!a && AGP.G.car.crash > 0) crashes++; n++; } return { ph: AGP.G.phase, t: AGP.G.qualTime, crashes, T: AGP.sim.T.id }; }, c);
    check(r.ph === 'done' && r.T === c, c + ' circuit: qualifying lap completes', r);
  }
  const lvl = await D.evaluate(() => { AGP.freeze(false); AGP.setLevel(3); const a = AGP.level; AGP.setLevel(0); return [a, AGP.level]; });
  check(lvl[0] === 3 && lvl[1] === 0, 'graphics quality levels switch (adaptive quality drops effects only)', lvl);
  await D.evaluate(() => AGP.toTitle()); await D.waitForTimeout(1200);
  check(D.errs.length === 0, 'desktop: no console errors', D.errs.slice(0, 3)); await D.context().close();

  say('== iPhone landscape (touch)');
  const P = await open({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 } });
  check(await P.evaluate(() => AGP.app.touch && !AGP.use2D), 'touch controls detected; WebGL2 renderer');
  await clickL(P, 'START RACE', true); await clickL(P, 'START QUALIFYING', true);
  check(await P.evaluate(() => AGP.screen) === 'play', 'tap START RACE → START QUALIFYING');
  await ready(P);
  const ctl = await P.evaluate(() => AGP.controls());
  check(ctl.gas && ctl.brake && ctl.gear && ctl.left && ctl.right && ctl.pause && ctl.mute && ctl.tilt, 'on-screen ◀ ▶ GAS BRAKE GEAR + pause/mute/tilt', Object.keys(ctl));
  const inView = Object.values(ctl).every(b => b.x > 0 && b.x < 844 && b.y > 0 && b.y < 390); check(inView, 'all touch controls on screen');
  const cdp = await P.context().newCDPSession(P);
  const tp = (id, b) => ({ x: b.x, y: b.y, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, ctl.gas), tp(2, ctl.right)] });
  await P.waitForTimeout(80); await P.evaluate(() => AGP.step(60));
  const t1 = await P.evaluate(() => ({ v: AGP.G.car.v, d: AGP.G.car.d, gas: AGP.touch.gas, right: AGP.touch.right }));
  check(t1.gas && t1.right && t1.v > 10 && t1.d > 0.5, 'multi-touch: hold GAS + ▶ together accelerates and steers right', t1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const g0 = await P.evaluate(() => AGP.G.car.gear); await P.touchscreen.tap(ctl.gear.x, ctl.gear.y); await P.evaluate(() => AGP.step(2));
  check(await P.evaluate(() => AGP.G.car.gear) !== g0, 'GEAR button shifts');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(3, ctl.brake)] }); await P.waitForTimeout(50);
  const bk = await P.evaluate(() => AGP.touch.brake); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(bk, 'BRAKE button brakes');
  const dz = ctl.drag; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 120, y: 200, id: 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60, y: 200, id: 4 }] }); await P.waitForTimeout(50);
  const drag = await P.evaluate(() => AGP.touch.steer); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(drag < -0.5, 'dragging on the left half steers (drag left = left)', drag);
  const tl = await P.evaluate(() => { AGP.tilt.on = true; Object.defineProperty(screen.orientation, 'angle', { value: 90, configurable: true }); window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 15, gamma: 0 })); const a = AGP.tilt.v; const c = AGP.G.car; c.d = 0; AGP.step(40); return { v: a, d: c.d }; });
  check(tl.v > 0.4 && tl.d > 0.3, 'simulated tilt (landscape, beta 15°) steers right', tl);
  await P.evaluate(() => { AGP.tilt.on = false; });
  await P.touchscreen.tap(ctl.pause.x, ctl.pause.y); check(await P.evaluate(() => AGP.app.paused), 'pause button pauses'); await clickL(P, 'RESUME', true);
  const crispP = await P.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw; AGP.freeze(false);
    Font.draw = function (ctx, s, x, y, dot, ...a) { if (x % 1 || y % 1 || dot % 1) bad.push([s, x, y, dot]); return orig.call(this, ctx, s, x, y, dot, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crispP.length === 0, 'iPhone HUD + control labels snapped to device pixels', crispP);
  const px = await P.evaluate(() => { const g = document.getElementById('gl'); return [g.width, g.height, g.width * g.height]; });
  check(px[2] <= 5.0e6 && px[0] >= 844 * 2, 'iPhone 3D canvas at native DPR within the ~5 MP mobile cap', px);
  check(P.errs.length === 0, 'iPhone landscape: no console errors', P.errs.slice(0, 3)); await P.context().close();

  say('== iPhone portrait');
  const Q = await open({ ...devices['iPhone 13'] });
  await clickL(Q, 'START RACE', true); await clickL(Q, 'START QUALIFYING', true); await ready(Q);
  const pc = await Q.evaluate(() => ({ panel: AGP.L.panel, c: AGP.controls(), vh: AGP.R.view.h }));
  check(pc.panel && pc.c.gas.y > pc.panel.y && pc.c.left.y > pc.panel.y && pc.c.gear.y > pc.panel.y, 'portrait works: game view on top, controls panel below', { panel: pc.panel, vh: pc.vh });
  await Q.touchscreen.tap(pc.c.gas.x, pc.c.gas.y);
  const pt = await Q.evaluate(() => { AGP.tilt.on = true; Object.defineProperty(screen.orientation, 'angle', { value: 0, configurable: true }); window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: 40, gamma: -12 })); return AGP.tilt.v; });
  check(pt < -0.3, 'portrait tilt uses gamma (tilt left = left)', pt);
  check(Q.errs.length === 0, 'iPhone portrait: no console errors', Q.errs.slice(0, 3)); await Q.context().close();

  say('== Canvas2D fallback (?2d)');
  const F = await open({ viewport: { width: 1280, height: 720 } }, URL + '?2d');
  check(await F.evaluate(() => AGP.use2D && getComputedStyle(document.getElementById('c2d')).display === 'block'), '2D fallback renderer active');
  const f1 = await F.evaluate(() => { AGP.startQualify(); AGP.freeze(); AGP.G.auto = true; AGP.step(900); AGP.freeze(false); return { v: AGP.G.car.v, ph: AGP.G.phase }; });
  await F.waitForTimeout(600);
  const fp = await F.evaluate(() => { const c = document.getElementById('c2d'), g = c.getContext('2d'), d = g.getImageData(c.width / 2, c.height * 0.7, 1, 1).data; return [c.width, c.height, d[3]]; });
  check(f1.ph === 'run' && f1.v > 30 && fp[2] === 255, 'fallback: race runs and road renders', { f1, fp });
  check(F.errs.length === 0, 'fallback: no console errors', F.errs.slice(0, 3)); await F.context().close();

  say('== Arcade regression');
  const games = ['', 'games/apex-gp/', 'games/astro-shatter/', 'games/vector-armor/', 'games/sporewood/', 'games/planet-guardian/', 'games/star-invaders/', 'games/trackball-football/', 'games/atari-football/', 'games/tube-shooter/'];
  for (const g of games) {
    const p = await open({ viewport: { width: 1280, height: 800 } }, BASE + g); await p.waitForTimeout(600);
    const st = await p.evaluate(() => document.title);
    check(p.errs.length === 0, (g || 'landing page') + ' loads, no console errors (' + st + ')', p.errs.slice(0, 2));
    if (!g) { const first = await p.evaluate(() => window.ARCADE_GAMES && window.ARCADE_GAMES[0].slug); check(first === 'apex-gp', 'landing page lists Apex Grand Prix first', first); }
    await p.context().close();
  }

  await b.close();
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
