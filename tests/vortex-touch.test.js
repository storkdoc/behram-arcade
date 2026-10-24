// VORTEX touch-controls test: Playwright mobile emulation (hasTouch + isMobile), driven by touch input only
// (CDP Input.dispatchTouchEvent, so real touchstart/pointerdown events with multi-touch).
// Run:  python3 -m http.server 8080 (from repo root)  then
//       NODE_PATH=/path/to/node_modules node tests/vortex-touch.test.js [baseURL] [screenshotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8080';
const SHOTS = process.argv[3] || '';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(browser, name, device) {
  console.log(`\n=== ${name} (${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x) ===`);
  const ctx = await browser.newContext({ ...device, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const cdp = await ctx.newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
  const tap = async (x, y) => { await T('touchStart', [{ x, y, id: 1 }]); await sleep(40); await T('touchEnd', []); await sleep(60); };
  const center = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; }, sel);
  const tapEl = async sel => { const c = await center(sel); if (!c) throw new Error('not visible: ' + sel); await tap(c.x, c.y); };
  const st = () => page.evaluate(() => window.VORTEX.state);
  const shot = async n => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${n}.png` }); };
  const vw = device.viewport.width, vh = device.viewport.height;

  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' });
  await sleep(900);
  let s = await st();
  check(s.touch === true, `touch controls auto-enabled (touch=${s.touch}, internal res ${s.res}, ${(eval(s.res.replace('x', '*')) / 1e6).toFixed(2)} MP)`);
  check(eval(s.res.replace('x', '*')) <= 5.05e6, 'mobile render cap <= ~5 MP');
  check(await page.evaluate(() => getComputedStyle(document.body).touchAction) === 'none', 'touch-action:none on body');
  await shot('01-title');

  // title: tap to start
  await tap(vw / 2, vh * 0.55); await sleep(250);
  s = await st(); check(s.state === 'select', 'tap on title -> RATE YOURSELF (' + s.state + ')');
  const idx0 = await page.evaluate(() => 0);
  // swipe left on the canvas -> higher starting level
  const lv0 = await page.evaluate(() => window.VORTEX.selectIdx());
  await T('touchStart', [{ x: vw * 0.6, y: vh * 0.45, id: 1 }]);
  for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: vw * 0.6 - i * 14, y: vh * 0.45, id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(80);
  const lv1 = await page.evaluate(() => window.VORTEX.selectIdx());
  check(lv1 > lv0, `swipe left picks a higher level (${lv0} -> ${lv1})`);
  // tap the left-most box -> lower level
  const boxes = await page.evaluate(() => window.VORTEX.selectBoxes());
  await tap(boxes[0].x, boxes[0].y); await sleep(80);
  const lv2 = await page.evaluate(() => window.VORTEX.selectIdx());
  check(lv2 === boxes[0].idx, `tap a level box selects it (idx ${lv2}, wanted ${boxes[0].idx})`);
  // back to level 1 with the ◀ button
  for (let i = 0; i < 6; i++) await tapEl('#tleft');
  check(await page.evaluate(() => window.VORTEX.selectIdx()) === 0, '◀ button steps down to level 1');
  await shot('02-select');
  await tapEl('#tstart'); await sleep(200);
  s = await st(); check(s.state === 'zoom' || s.state === 'play', 'START button starts the game (' + s.state + ')');
  await sleep(1800);
  await page.evaluate(() => { VORTEX.setInvincible(true); });
  s = await st(); check(s.state === 'play', 'playing');
  await shot('03-play');

  // tube must not sit under the thumb controls
  const ov = await page.evaluate(() => {
    const b = window.VORTEX.webBounds(); const out = [];
    for (const id of ['tknob', 'tfire', 'tzap', 'tpause', 'tmute', 'tmode']) { const e = document.getElementById(id); const r = e.getBoundingClientRect(); if (!r.width) continue;
      if (r.left < b.x1 && r.right > b.x0 && r.top < b.y1 && r.bottom > b.y0) out.push(id); }
    return { b, out };
  });
  // thumb controls must not overlap each other (round buttons tested as circles)
  const cc = await page.evaluate(() => {
    const ids = ['tknob', 'tleft', 'tright', 'tmode', 'tfire', 'tzap', 'tpause', 'tmute', 'tfs'], round = new Set(['tknob', 'tfire', 'tzap']);
    const sh = ids.map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width ? { id, r } : null; }).filter(Boolean);
    const hit = (a, b) => {
      if (round.has(a.id) && round.has(b.id)) return Math.hypot(a.r.x + a.r.width / 2 - b.r.x - b.r.width / 2, a.r.y + a.r.height / 2 - b.r.y - b.r.height / 2) < (a.r.width + b.r.width) / 2;
      if (round.has(b.id)) [a, b] = [b, a];
      if (round.has(a.id)) { const cx = a.r.x + a.r.width / 2, cy = a.r.y + a.r.height / 2, R = a.r.width / 2;
        const nx = Math.max(b.r.left, Math.min(cx, b.r.right)), ny = Math.max(b.r.top, Math.min(cy, b.r.bottom)); return Math.hypot(cx - nx, cy - ny) < R; }
      return a.r.left < b.r.right && a.r.right > b.r.left && a.r.top < b.r.bottom && a.r.bottom > b.r.top;
    };
    const out = []; for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) if (hit(sh[i], sh[j])) out.push(sh[i].id + '/' + sh[j].id);
    const offscreen = sh.filter(x => x.r.left < 0 || x.r.top < 0 || x.r.right > innerWidth || x.r.bottom > innerHeight).map(x => x.id);
    return { out, offscreen, n: sh.length };
  });
  check(cc.out.length === 0 && cc.offscreen.length === 0, `${cc.n} visible controls don't overlap / stay on screen` + (cc.out.length ? ' overlaps: ' + cc.out : '') + (cc.offscreen.length ? ' offscreen: ' + cc.offscreen : ''));
  check(ov.out.length === 0, `tube (${ov.b.x0.toFixed(0)},${ov.b.y0.toFixed(0)})-(${ov.b.x1.toFixed(0)},${ov.b.y1.toFixed(0)}) clear of controls` + (ov.out.length ? ' overlaps ' + ov.out : ''));

  // spinner: horizontal drag right = clockwise (same as → key: lower lane index), proportional to distance
  const pos = s => s.lane * 3 + s.sub;   // sub-position index
  const knob = await center('#tknob');
  const sx = knob.x - 40, sy = knob.y;
  await page.evaluate(() => { VORTEX.setLane(VORTEX.state.lane, 0); });
  let a = await st();
  await T('touchStart', [{ x: sx, y: sy, id: 1 }]);
  for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: sx + i * 8, y: sy, id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(150);
  let b = await st();
  const stepPx = await page.evaluate(() => window.VORTEX.touchStepPx());
  const moved = ((pos(a) - pos(b)) % 48 + 48) % 48;
  const expect = Math.min(6 + 80 / stepPx, Math.floor(80 / stepPx));
  check(Math.abs(moved - Math.floor(80 / stepPx)) <= 1, `80 px drag right moves the claw ${moved} sub-positions clockwise (expected ~${Math.floor(80 / stepPx)}, ${stepPx.toFixed(1)} px/step) lane ${a.lane}:${a.sub} -> ${b.lane}:${b.sub}`);
  // drag left by 40 px -> back counter-clockwise
  a = b;
  await T('touchStart', [{ x: sx + 60, y: sy, id: 1 }]);
  for (let i = 1; i <= 5; i++) { await T('touchMove', [{ x: sx + 60 - i * 8, y: sy, id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(150);
  b = await st();
  const back = ((pos(b) - pos(a)) % 48 + 48) % 48;
  check(Math.abs(back - Math.floor(40 / stepPx)) <= 1, `40 px drag left moves ${back} sub-positions counter-clockwise`);
  // circling clockwise with the thumb
  a = b;
  const R = 34, cx = knob.x, cy = knob.y;
  await T('touchStart', [{ x: cx + R, y: cy, id: 1 }]);
  for (let i = 1; i <= 48; i++) { const t = i / 48 * Math.PI * 2 * 1.5; await T('touchMove', [{ x: cx + R * Math.cos(t), y: cy + R * Math.sin(t), id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(200);
  b = await st();
  const circ = ((pos(a) - pos(b)) % 48 + 48) % 48;
  const path = 2 * Math.PI * R * 1.5;
  check(circ >= 0.55 * path / stepPx && circ <= 1.1 * path / stepPx, `1.5 clockwise thumb circles (r=${R}px, ${path.toFixed(0)} px of travel) move the claw ${circ} sub-positions clockwise (~${(path / stepPx).toFixed(0)} max)`);
  await shot('04-spin');

  // multi-touch: hold FIRE while spinning
  const fire = await center('#tfire');
  await page.evaluate(() => VORTEX.emptyField());
  a = await st();
  const shots0 = await page.evaluate(() => VORTEX.shotsFired());
  await T('touchStart', [{ x: fire.x, y: fire.y, id: 2 }]);
  await T('touchStart', [{ x: fire.x, y: fire.y, id: 2 }, { x: sx, y: sy, id: 1 }]);
  let fireMax = 0, overheated = false;
  for (let i = 1; i <= 12; i++) { await T('touchMove', [{ x: fire.x, y: fire.y, id: 2 }, { x: sx + i * 6, y: sy, id: 1 }]); await sleep(16); }
  for (let i = 0; i < 40; i++) { const f = await page.evaluate(() => VORTEX.fire()); fireMax = Math.max(fireMax, f.shots); if (f.overheat) overheated = true; await sleep(25); }
  await shot('05-fire-and-spin');
  await T('touchEnd', []); await sleep(100);
  b = await st();
  const fired = (await page.evaluate(() => VORTEX.shotsFired())) - shots0;
  check(fired >= 5, `FIRE held fires repeatedly (${fired} shots in ~1.4 s, ${await page.evaluate(() => VORTEX.fps())} fps)`);
  check(overheated && fireMax <= 8, `heat limit still applies to touch FIRE (overheat=${overheated}, max on screen ${fireMax})`);
  check(pos(a) !== pos(b), `claw moved while FIRE was held (multi-touch) ${a.lane}:${a.sub} -> ${b.lane}:${b.sub}`);
  check((await st()).fire === false, 'FIRE released');

  // ZAP
  await page.evaluate(() => { for (let i = 0; i < 6; i++) VORTEX.spawn('flipper', i * 2, 0.5 + i * 0.05); });
  await sleep(100);
  const en0 = (await st()).enemies;
  await tapEl('#tzap'); await sleep(900);
  s = await st();
  check(s.zapUses === 1 && s.enemies < en0, `ZAP fires the superzapper (zapUses=${s.zapUses}, enemies ${en0} -> ${s.enemies})`);

  // pause / resume
  await tapEl('#tpause'); await sleep(150);
  s = await st(); check(s.paused === true, 'pause button pauses');
  await shot('06-paused');
  await tap(vw / 2, vh * 0.4); await sleep(150);
  s = await st(); check(s.paused === false, 'tap resumes');
  // mute
  const m0 = await page.evaluate(() => VORTEX.muted());
  await tapEl('#tmute'); await sleep(80);
  check(await page.evaluate(() => VORTEX.muted()) === !m0, 'mute button toggles sound');
  await tapEl('#tmute'); await sleep(80);

  // arrows mode
  await tapEl('#tmode'); await sleep(80);
  s = await st(); check(s.touchMode === 'arrows' && !!(await center('#tright')) && !(await center('#tknob')), 'MODE toggles to ◀ ▶ arrow buttons');
  await page.evaluate(() => { VORTEX.setLane(VORTEX.state.lane, 0); });
  await page.evaluate(() => { const e = document.getElementById('tright'); e.addEventListener('pointerdown', () => window.__pd = performance.now()); e.addEventListener('pointerup', () => window.__pu = performance.now()); });
  a = await st(); await tapEl('#tright'); await sleep(80); b = await st();
  const held = await page.evaluate(() => Math.round(window.__pu - window.__pd));
  const tapSteps = ((pos(a) - pos(b)) % 48 + 48) % 48;
  check(tapSteps === 1 || (held >= 130 && tapSteps === 2), `▶ tap = one sub-position clockwise (like →; repeat starts after 0.14 s, finger down ${held} ms) ${a.lane}:${a.sub} -> ${b.lane}:${b.sub}`);
  a = b; const rr = await center('#tright');
  await T('touchStart', [{ x: rr.x, y: rr.y, id: 1 }]); await sleep(600); await T('touchEnd', []); await sleep(60);
  b = await st();
  check(((pos(a) - pos(b)) % 48 + 48) % 48 >= 8, `▶ held auto-repeats (${((pos(a) - pos(b)) % 48 + 48) % 48} steps in 0.6 s)`);
  await shot('07-arrows');
  await tapEl('#tmode'); await sleep(80);
  check((await st()).touchMode === 'spin', 'MODE back to spinner');

  // no scroll / zoom
  await cdp.send('Input.synthesizePinchGesture', { x: vw / 2, y: vh / 2, scaleFactor: 2, relativeSpeed: 800, gestureSourceType: 'touch' }).catch(() => {});
  await sleep(300);
  const vp = await page.evaluate(() => ({ scale: window.visualViewport ? visualViewport.scale : 1, sx: scrollX, sy: scrollY }));
  check(vp.scale === 1 && vp.sx === 0 && vp.sy === 0, `pinch does not zoom / scroll (scale ${vp.scale}, scroll ${vp.sx},${vp.sy})`);

  // game over -> initials via the letter pad
  await page.evaluate(() => { VORTEX.emptyField(); VORTEX.addScore(990000); VORTEX.setLives(1); VORTEX.setInvincible(false); VORTEX.spawn('flipper', VORTEX.state.lane, 0); });
  for (let i = 0; i < 60 && (await st()).state !== 'gameover'; i++) await sleep(100);
  await sleep(1400);
  check((await st()).state === 'gameover', 'game over reached');
  await tap(vw / 2, vh / 2); await sleep(250);
  s = await st(); check(s.state === 'initials', 'tap after GAME OVER -> initials entry (' + s.state + ')');
  const key = c => page.evaluate(c => { const k = [...document.querySelectorAll('#tkeys .tkey')].find(e => e.dataset.c === c); const r = k.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, c);
  for (const c of ['T', 'C', 'H']) { const p = await key(c); await tap(p.x, p.y); }
  let p = await key('↑'); await tap(p.x, p.y);   // H -> I
  await shot('08-initials');
  p = await key('OK'); await tap(p.x, p.y); await sleep(150);
  s = await st();
  const hs = await page.evaluate(() => VORTEX.hiscores());
  check(s.state === 'attract' && hs.some(h => h[0] === 'TCI' && h[1] >= 990000), 'letter pad + ↑ + OK saves initials "TCI" (' + (hs[0] || []).join(' ') + ')');
  await shot('09-hiscores');

  const real = errs.filter(e => !/apple-mobile-web-app-capable/.test(e));
  check(real.length === 0, 'no console errors/warnings' + (real.length ? ': ' + real.join(' | ') : ''));
  await ctx.close();
}

async function landing(browser) {
  console.log('\n=== landing page (iPhone 14 portrait) ===');
  const ctx = await browser.newContext({ ...devices['iPhone 14'], hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await sleep(600);
  const info = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, cards: document.querySelectorAll('a.card').length,
    touchText: [...document.querySelectorAll('a.card[data-slug="tube-shooter"] .controls')].map(e => e.textContent).join(' | '), footer: document.querySelector('footer span').textContent }));
  check(info.sw <= info.iw, `no horizontal overflow (${info.sw} <= ${info.iw})`);
  check(/TOUCH/i.test(info.touchText) && /SPACE/i.test(info.touchText), 'VORTEX card shows keyboard and touch controls: ' + info.touchText);
  check(/TAP/i.test(info.footer), 'footer hint for touch: ' + info.footer);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/landing-iphone.png`, fullPage: false });
  const c = await page.evaluate(() => { const e = document.querySelector('a.card[data-slug="tube-shooter"]'); e.scrollIntoView({ block: 'center' }); const r = e.querySelector('.screen').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await sleep(200);
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForURL(/tube-shooter/, { timeout: 5000 }).catch(() => {});
  check(/games\/tube-shooter\//.test(page.url()), 'one tap on the card opens the game: ' + page.url());
  check(errs.length === 0, 'landing: no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const only = process.env.ONLY;
  const runs = [['iphone14-landscape', devices['iPhone 14 landscape']], ['iphone14-portrait', devices['iPhone 14']], ['ipad-landscape', devices['iPad Pro 11 landscape']], ['ipad-portrait', devices['iPad Pro 11']]];
  for (const [n, d] of runs) if (!only || n.includes(only)) await run(browser, n, d);
  if (!only || only === 'landing') await landing(browser);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
