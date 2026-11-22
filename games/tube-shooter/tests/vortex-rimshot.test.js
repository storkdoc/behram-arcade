// VORTEX Day 26 (2026-11-22): RIM SHOT. Your shot killing a grabber that has settled on the rim in YOUR lane pays +250
// on top of the kill (RIM SHOT), or +500 inside the last part of the grab countdown (CLUTCH RIM SHOT), with a pop, a
// first-time tip, a rim flash and a RUN REPORT line. Mid-tube kills and superzapper kills get no bonus; an unshot grabber
// still grabs. Keyboard, mouse, gamepad A (desktop), touch FIRE (iPhone 14 portrait + landscape).
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-rimshot.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137', SHOTS = process.argv[3];
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = () => {
  window.__padA = false;
  const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 && window.__padA, value: i === 0 && window.__padA ? 1 : 0 })); } };
  navigator.getGamepads = () => [window.__padOn ? pad : null, null, null, null];
};
async function suite(browser, label, ctxOpts, touchDev) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), errs = [];
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  await page.route(/textdb\.dev|ntfy\.sh/, r => r.abort());
  page.on('console', m => { if (m.type() === 'error' && !/textdb|ntfy|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  const E = (f, a) => page.evaluate(f, a);
  const setup = () => E(() => { window.__noWarp = true; window.__noPups = true; VORTEX.freeze(true); VORTEX.gotoLevel(3); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); VORTEX.setLane(3, 0); VORTEX.setAuto(false); VORTEX.step(0.6); });
  await setup();
  const cdp = touchDev ? await ctx.newCDPSession(page) : null;
  const fireBox = touchDev ? await (async () => { await page.waitForFunction(() => getComputedStyle(document.getElementById('tfire')).display !== 'none' && document.getElementById('tfire').getBoundingClientRect().width > 0, null, { timeout: 15000 }).catch(() => {}); return page.locator('#tfire').boundingBox(); })() : null;
  // hold the given input, advance game time, release
  // the mouse steers the claw to the pointer, so park the pointer on the claw's own lane first
  async function aim(kind) {
    if (kind !== 'mouse') return;
    const p = await E(() => VORTEX.rimPoint(VORTEX.playerLane() + 0.5)); await page.mouse.move(p.x, p.y);
    await sleep(60); await E(() => VORTEX.step(0.3));
  }
  async function fireFor(kind, sec) {
    const f0 = await E(() => VORTEX.shotsFired());
    if (kind === 'key') await page.keyboard.down('Space');
    else if (kind === 'mouse') await page.mouse.down();
    else if (kind === 'pad') await E(() => { window.__padOn = true; window.__padA = true; });
    else if (kind === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 7 }] });
    // gamepads are polled on animation frames: wait (real time) until the input has fired, then advance game time
    await page.waitForFunction(n => VORTEX.shotsFired() > n, f0, { timeout: 8000 }).catch(() => {});
    await E(s => VORTEX.step(s, () => VORTEX.eshotList().length === 0), sec);
    if (kind === 'key') await page.keyboard.up('Space');
    else if (kind === 'mouse') await page.mouse.up();
    else if (kind === 'pad') await E(() => { window.__padA = false; });
    else if (kind === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(60); await E(() => VORTEX.step(0.4));
  }
  const kinds = touchDev ? ['touch'] : ['key', 'mouse', 'pad'];
  const down = async k => { if (k === 'key') await page.keyboard.down('Space'); else if (k === 'mouse') await page.mouse.down(); else if (k === 'pad') await E(() => { window.__padOn = true; window.__padA = true; }); else await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 7 }] }); };
  const up = async k => { if (k === 'key') await page.keyboard.up('Space'); else if (k === 'mouse') await page.mouse.up(); else if (k === 'pad') await E(() => { window.__padA = false; }); else await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  let first = true;
  for (const k of kinds) for (const clutch of [false, true]) {
    await E(() => { VORTEX.emptyField(); VORTEX.step(0.6); VORTEX.emptyField(); }); await aim(k); await sleep(120);
    await E(() => { VORTEX.step(0.5); VORTEX.emptyField(); VORTEX.step(0.1); });
    // a flipper settled on the rim in the claw's lane, part-way through its grab countdown
    const r = await E(c => { const l = VORTEX.playerLane(), gd = VORTEX.params().grabDelay; const id = VORTEX.spawn('flipper', l, 0);
      VORTEX.setEnemy(id, { lane: l, z: 0, flipping: false, landT: gd * (c ? 0.6 : 0.1), pause: 0 });
      return { id, s0: VORTEX.score(), rs0: VORTEX.rimShot(), gd, l }; }, clutch);
    const f0 = await E(() => VORTEX.shotsFired());
    await down(k);
    await page.waitForFunction(n => VORTEX.shotsFired() > n, f0, { timeout: 8000 }).catch(() => {});
    await E(() => VORTEX.step(0.3, () => !VORTEX.enemyList().length));
    const mid = await E(() => ({ flash: VORTEX.rimShot().flash }));
    await up(k);
    const q = await E(() => ({ s: VORTEX.score(), rs: VORTEX.rimShot(), m: VORTEX.messages(), state: VORTEX.state.state, left: VORTEX.enemyList().length }));
    const tag = `${k} ${clutch ? 'CLUTCH' : 'early'}`;
    check(q.state === 'play' && q.left === 0 && q.rs.n === r.rs0.n + 1 && q.rs.clutch === r.rs0.clutch + (clutch ? 1 : 0), `${tag}: settled rim grabber shot in your lane is a ${clutch ? 'CLUTCH ' : ''}RIM SHOT (n ${q.rs.n}, clutch ${q.rs.clutch}, ${q.state})`);
    const want = 150 + (clutch ? 500 : 250);
    check(q.s - r.s0 >= want && q.s - r.s0 < want + 60, `${tag}: pays kill 150 + bonus ${clutch ? 500 : 250} (score +${q.s - r.s0})`);
    check(q.m.some(t => t === (clutch ? 'CLUTCH RIM SHOT!  +500' : 'RIM SHOT!  +250')), `${tag}: pop shown (${q.m.filter(t => /RIM/.test(t)).join(' | ')})`);
    check(mid.flash, `${tag}: rim flash drawn on the lane`);
    if (first) check(q.m.some(t => /HIT GRABBERS THE MOMENT THEY LAND/.test(t)), 'first one shows the HIT GRABBERS THE MOMENT THEY LAND tip');
    if (SHOTS && first) { await E(() => VORTEX.freeze(false)); await sleep(40); await page.screenshot({ path: `${SHOTS}/vortex-rimshot-${label.replace(/\W+/g, '_')}.png`, timeout: 10000 }).catch(() => {}); await E(() => VORTEX.freeze(true)); }
    first = false;
    await E(() => VORTEX.step(1.2));
  }
  // 2. no bonus: mid-tube flipper, superzapper kill of a settled rim grabber
  let r = await E(() => {
    VORTEX.emptyField(); VORTEX.step(0.3); const l = VORTEX.playerLane(), n0 = VORTEX.rimShot().n, out = {};
    let s0 = VORTEX.score(); let id = VORTEX.spawn('flipper', l, 0.4); VORTEX.kill(id, false); out.mid = VORTEX.score() - s0;
    s0 = VORTEX.score(); id = VORTEX.spawn('flipper', l, 0); VORTEX.setEnemy(id, { lane: l, z: 0, flipping: false, landT: 0.05 }); VORTEX.kill(id, true); out.zapped = VORTEX.score() - s0;
    s0 = VORTEX.score(); id = VORTEX.spawn('flipper', (l + 3) % VORTEX.webInfo().n, 0); VORTEX.kill(id, false); out.other = VORTEX.score() - s0;
    out.n = VORTEX.rimShot().n - n0; out.state = VORTEX.state.state; return out;
  });
  check(r.n === 0 && r.mid === 150 && r.zapped === 150 && r.other === 150 && r.state === 'play', `no bonus mid-tube / superzapper / other lane: +${r.mid} / +${r.zapped} / +${r.other}, rim shots ${r.n}`);
  // 3. rules unchanged: a settled grabber left alone still grabs
  r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.3); VORTEX.setAuto(false); const l = VORTEX.playerLane(); const id = VORTEX.spawn('flipper', l, 0); VORTEX.setEnemy(id, { lane: l, z: 0, flipping: false, landT: 0 });
    for (let i = 0; i < 120 && VORTEX.state.state === 'play'; i++) VORTEX.step(1 / 60); return { state: VORTEX.state.state, k: VORTEX.deathKind() }; });
  check(r.state === 'dying' && r.k === 'capture', `an unshot rim grabber still grabs (${r.state}, ${r.k})`);
  // 4. run report line
  const q = await E(() => VORTEX.runReport());
  check(/RIM SHOTS \d+/.test(q.lines.extra), `RUN REPORT lists them: "${q.lines.extra}"`);
  check(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 3)));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await suite(browser, 'desktop 1280x800 (keyboard, mouse, gamepad)', { viewport: { width: 1280, height: 800 } }, false);
    await suite(browser, 'iPhone 14 (touch FIRE)', devices['iPhone 14'], true);
    await suite(browser, 'iPhone 14 landscape (touch FIRE)', devices['iPhone 14 landscape'], true);
  } catch (e) { console.log('FAIL exception ' + e.stack); fails++; }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
