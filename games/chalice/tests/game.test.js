/* Chalice: browser checks at 1280x800 (keyboard, mouse, gamepad) and iPhone portrait/landscape (touch).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/chalice/tests/game.test.js   (env: BASE, CHROME, SHOTS=<dir for screenshots>) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/chalice/';
const SHOTS = process.env.SHOTS || '';
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, init) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    if (init) await c.addInitScript(init);
    await p.goto(URL); await p.waitForTimeout(900); return p;
  };
  const st = p => p.evaluate(() => window.__chalice.state() || { screen: window.__chalice.App.screen });
  const shot = (p, n) => SHOTS && p.screenshot({ path: `${SHOTS}/${n}.png` });
  const btn = async (p, id) => (await p.evaluate(() => window.__chalice.buttons())).find(q => q.id === id);
  const calm = p => p.evaluate(() => { const S = window.__chalice.App.S; S.dragons.forEach(d => { d.stun = 999; }); if (S.bat) { S.bat.x = -999; S.bat.covet = 1e9; } });

  console.log('== DESKTOP 1280x800 (keyboard + mouse)');
  const D = await open({ viewport: { width: 1280, height: 800 } });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(900);
  check(await D.evaluate(() => window.__chalice.App.screen) === 'title', 'opens on the title screen with an attract-mode demo');
  check(await D.evaluate(() => typeof MoodSticker === 'object'), 'mood sticker loaded');
  const cvs = await D.evaluate(() => { const c = document.querySelector('canvas'); return { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight }; });
  check(cvs.cw === 1280 && cvs.ch === 800, 'canvas fills the window', cvs);
  await shot(D, 'desktop-title');
  await D.keyboard.press('Enter'); await D.waitForTimeout(300);
  let s = await st(D); check(s.screen === 'play', 'Enter starts the game', s.screen);
  await calm(D); await D.evaluate(() => window.__chalice.teleport('kingsroad', 10, 6));
  const x0 = (await st(D)).x; await D.keyboard.down('ArrowRight'); await D.waitForTimeout(500); await D.keyboard.up('ArrowRight');
  s = await st(D); check(s.x > x0 + 1, 'arrow keys walk the knight', [x0, s.x]); check(s.time > 0, 'timer started on first input');
  const y0 = s.y; await D.keyboard.down('w'); await D.waitForTimeout(300); await D.keyboard.up('w'); check((await st(D)).y < y0 - 0.5, 'WASD walks the knight');
  await D.evaluate(() => { const C = window.__chalice, S = C.App.S, k = S.item('gold'); k.holder = null; k.x = S.player.x + 0.5; k.y = S.player.y; });
  await D.waitForTimeout(200); check((await st(D)).held === 'gold', 'walking into the gold key picks it up');
  await D.keyboard.press('Space'); await D.waitForTimeout(200); check((await st(D)).held === null, 'SPACE drops it');
  await D.keyboard.press('Enter'); await D.waitForTimeout(150); check(await D.evaluate(() => window.__chalice.App.S.player.flareCD > 8), 'ENTER fires a flare (special action)');
  await D.keyboard.press('m'); await D.waitForTimeout(250); check((await st(D)).screen === 'map', 'M opens the map'); await shot(D, 'desktop-map');
  await D.keyboard.press('m'); await D.waitForTimeout(150); check((await st(D)).screen === 'play', 'M closes the map');
  await D.keyboard.press('p'); await D.waitForTimeout(150); check((await st(D)).screen === 'paused', 'P pauses'); await D.keyboard.press('Escape'); await D.waitForTimeout(150);
  check((await st(D)).screen === 'play', 'Esc resumes');
  // mouse: hold to walk toward the pointer
  await calm(D); const m0 = await st(D);
  const L = await D.evaluate(() => window.__chalice.App.L);
  await D.mouse.move(L.vx + 30, L.vy + L.vh / 2); await D.mouse.down(); await D.waitForTimeout(500); await D.mouse.up();
  check((await st(D)).x < m0.x - 1, 'holding the mouse walks toward the pointer', [m0.x, (await st(D)).x]);
  await D.evaluate(() => { const C = window.__chalice; C.teleport('gold_castle', 10, 9); }); await D.waitForTimeout(500); await shot(D, 'desktop-play');
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  console.log('== GAMEPAD');
  const G = await open({ viewport: { width: 1280, height: 800 } }, () => {
    window.__pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  const press = async (i) => { await G.evaluate(i => { __pad.buttons[i].pressed = true; }, i); await G.waitForTimeout(120); await G.evaluate(i => { __pad.buttons[i].pressed = false; }, i); await G.waitForTimeout(120); };
  await press(0); check((await st(G)).screen === 'play', 'gamepad A starts the game', (await st(G)).screen);
  await calm(G); await G.evaluate(() => window.__chalice.teleport('kingsroad', 10, 6)); const g0 = await st(G);
  await G.evaluate(() => { __pad.axes[0] = 1; }); await G.waitForTimeout(400); await G.evaluate(() => { __pad.axes[0] = 0; });
  check((await st(G)).x > g0.x + 0.8, 'left stick walks the knight');
  await press(1); check(await G.evaluate(() => window.__chalice.App.S.player.flareCD > 8), 'gamepad B fires a flare');
  await press(9); check((await st(G)).screen === 'paused', 'Start pauses');
  check(G.errs.length === 0, 'gamepad: no console errors', G.errs);

  for (const [name, dev] of [['iphone-portrait', devices['iPhone 13']], ['iphone-landscape', devices['iPhone 13 landscape']]]) {
    console.log('== ' + name.toUpperCase() + ' (touch)');
    const P = await open(dev); const cdp = await P.context().newCDPSession(P);
    const vp = P.viewportSize();
    const c = await P.evaluate(() => { const c = document.querySelector('canvas'); return { cw: c.clientWidth, ch: c.clientHeight, w: c.width }; });
    check(c.cw === vp.width && c.ch === vp.height && c.w >= vp.width * 2, 'full-screen canvas at Retina resolution', c);
    check(await P.evaluate(() => window.__chalice.App.input) === 'touch', 'touch UI by default on a phone');
    await shot(P, name + '-title');
    const play = await btn(P, 'play') || await btn(P, 'start');
    if (play) await P.touchscreen.tap(play.x, play.y); else await P.evaluate(() => window.__chalice.newGame(1));
    await P.waitForTimeout(400); check((await st(P)).screen === 'play', 'tapping Play starts the game');
    await calm(P); await P.evaluate(() => window.__chalice.teleport('kingsroad', 10, 6)); await P.waitForTimeout(100);
    const Lm = await P.evaluate(() => window.__chalice.App.L);
    const jx = Lm.portrait ? vp.width * 0.3 : vp.width * 0.2, jy = Lm.portrait ? (Lm.ctrl ? Lm.ctrl.y + Lm.ctrl.h * 0.6 : vp.height * 0.8) : vp.height * 0.7;
    const t0 = await st(P);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy }] });
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx + i * 10, y: jy }] }); await P.waitForTimeout(20); }
    await P.waitForTimeout(500); await shot(P, name + '-play');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check((await st(P)).x > t0.x + 1, 'dragging the floating joystick walks the knight', [t0.x, (await st(P)).x]);
    await P.evaluate(() => { const S = window.__chalice.App.S, k = S.item('sword'); k.holder = null; k.x = S.player.x + 0.4; k.y = S.player.y; }); await P.waitForTimeout(200);
    check((await st(P)).held === 'sword', 'walk-over pickup');
    await P.evaluate(() => window.__chalice.teleport('southmeadow', 10, 3)); await P.waitForTimeout(100);
    const dropB = await btn(P, 'drop'); check(!!dropB && dropB.w >= 44, 'DROP button is a comfortable touch target', dropB);
    if (dropB) { await P.touchscreen.tap(dropB.x, dropB.y); await P.waitForTimeout(200); check((await st(P)).held === null, 'tapping DROP drops the sword'); }
    const fl = await btn(P, 'flare'); if (fl) { await P.touchscreen.tap(fl.x, fl.y); await P.waitForTimeout(150); check(await P.evaluate(() => window.__chalice.App.S.player.flareCD > 8), 'tapping FLARE fires a flare'); }
    const mp = await btn(P, 'map'); if (mp) { await P.touchscreen.tap(mp.x, mp.y); await P.waitForTimeout(250); check((await st(P)).screen === 'map', 'MAP button opens the map'); await shot(P, name + '-map'); await P.touchscreen.tap(vp.width / 2, vp.height / 2); await P.waitForTimeout(250); check((await st(P)).screen === 'play', 'tap closes the map'); }
    const pz = await btn(P, 'pause'); if (pz) { await P.touchscreen.tap(pz.x, pz.y); await P.waitForTimeout(200); check((await st(P)).screen === 'paused', 'pause button pauses'); }
    // HUD must stay clear of the mood sticker
    const ms = await P.evaluate(() => { const h = document.getElementById('mood-sticker'); if (!h) return null; const e = (h.shadowRoot || h).querySelector('.stk'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    if (ms) { const hudBottom = Lm.st + Lm.hud; check(ms.w > 0 && ms.y >= hudBottom - 4, 'mood sticker does not cover the HUD', { ms, hudBottom }); }
    // a full bot run to the win screen
    const r = await P.evaluate(() => { const C = window.__chalice; C.go('play'); C.newGame(1); C.autoplay(true); let n = 0; while (!C.App.S.won && n < 60 * 600) { C.step(); n++; } C.autoplay(false); return C.App.S.won; });
    await P.waitForTimeout(2500); check(r && (await st(P)).screen === 'win', 'level I can be completed and shows the win screen'); await shot(P, name + '-win');
    check(P.errs.length === 0, name + ': no console errors', P.errs);
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
