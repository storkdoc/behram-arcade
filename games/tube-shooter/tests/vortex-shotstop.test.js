// VORTEX Day 23 (2026-11-19): SHOT-STOPPER. Shooting down an enemy shot pays STOP.pts; stopping one already in your lane
// inside the red warning zone is a BLOCK (STOP.closePts, 'BLOCKED! +100', bigger burst, parry sound). Unstopped shots still
// kill. Every input (keyboard Space, mouse left button, gamepad A, touch FIRE) stops shots the same way.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-shotstop.test.js http://localhost:8137 [shotDir]
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
  // 1. a far shot (z 0.85) in the claw's lane, shot down: +25, tip once, no BLOCK
  const kinds = touchDev ? ['touch'] : ['key', 'mouse', 'pad'];
  await aim(kinds[0]);
  let r = await E(() => { VORTEX.emptyField(); const l = VORTEX.playerLane(); VORTEX.addEShot(l, 0.85); return { s0: VORTEX.score(), st0: VORTEX.shotStop() }; });
  await fireFor(kinds[0], 0.5);
  let q = await E(() => ({ s: VORTEX.score(), st: VORTEX.shotStop(), es: VORTEX.eshotList().length, m: VORTEX.messages(), state: VORTEX.state.state }));
  check(q.es === 0 && q.st.n === 1 && q.st.close === 0, `${kinds[0]}: far enemy shot is shot down (stops ${q.st.n}, blocks ${q.st.close})`);
  check(q.s - r.s0 === 25, `far stop pays +25 (score +${q.s - r.s0})`);
  check(q.m.some(t => /SHOOT THEIR SHOTS DOWN/.test(t)), 'first stop shows the SHOOT THEIR SHOTS DOWN tip');
  check(!q.m.some(t => /BLOCKED/.test(t)) && q.state === 'play', 'no BLOCKED pop for a far stop, still playing');
  await E(() => VORTEX.step(2.5));
  // 2. a shot already inside the red warning zone in the claw's lane: BLOCK +100
  for (const k of kinds) {
    await E(() => VORTEX.emptyField()); await aim(k);
    r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.5); const l = VORTEX.playerLane(); VORTEX.addEShot(l, 0.26); return { s0: VORTEX.score(), st0: VORTEX.shotStop(), z: VORTEX.shotStop().warnZ }; });
    await fireFor(k, 0.25);
    q = await E(() => ({ s: VORTEX.score(), st: VORTEX.shotStop(), m: VORTEX.messages(), state: VORTEX.state.state, k: VORTEX.deathKind() }));
    check(q.state === 'play' && q.st.close === r.st0.close + 1, `${k}: shot inside the warning zone (z 0.26 < ${r.z}) is BLOCKED (blocks ${q.st.close}, ${q.state})`);
    check(q.s - r.s0 === 100, `${k}: BLOCK pays +100 (score +${q.s - r.s0})`);
    check(q.m.some(t => t === 'BLOCKED!  +100'), `${k}: 'BLOCKED!  +100' pop shown`);
    if (SHOTS && k === kinds[0]) { await E(() => { VORTEX.freeze(false); }); await sleep(30); await page.screenshot({ path: `${SHOTS}/vortex-shotstop-${label.replace(/\W+/g, '_')}.png` }); await E(() => VORTEX.freeze(true)); }
    await E(() => VORTEX.step(1.2));
  }
  // 3. rules unchanged: a shot not shot down still kills
  r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.5); const l = VORTEX.playerLane(); VORTEX.addEShot(l, 0.1); VORTEX.step(0.6); return { state: VORTEX.state.state, k: VORTEX.deathKind() }; });
  check(r.state === 'dying' && r.k === 'shot', `an unstopped shot still kills (${r.state}, ${r.k})`);
  // 4. run report lists the stops
  q = await E(() => VORTEX.runReport());
  check(q.stops >= 1 + (touchDev ? 1 : 3) && /SHOTS STOPPED \d+/.test(q.lines.extra), `RUN REPORT lists them: "${q.lines.extra}"`);
  // 5. droid shots stop bullets but score nothing (unit check via hook stats unchanged by a plain step)
  r = await E(() => VORTEX.shotStop());
  check(r.droid === 0 && r.pts === r.n * 0 + r.close * 100 + (r.n - r.close) * 25, `stop points add up (${r.n} stops, ${r.close} blocks, ${r.pts} pts)`);
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
