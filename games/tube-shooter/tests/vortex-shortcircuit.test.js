// VORTEX Day 24 (2026-11-20): SHORT-CIRCUIT. A pulsar your shot destroys while it is charging or zapping in YOUR lane pays
// +300 on top of the kill, with a 'SHORT-CIRCUIT!  +300' pop, a first-time tip and a RUN REPORT line. Other lanes, idle
// pulsars and superzapper kills get no bonus; an unshot charging pulsar still zaps. Keyboard, mouse, gamepad A, touch FIRE.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-shortcircuit.test.js http://localhost:8137 [shotDir]
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
  // 1. a pulsar charging in the claw's lane, shot before it zaps: SHORT-CIRCUIT (+200 kill +300 bonus), tip once
  let first = true;
  for (const k of kinds) {
    await E(() => { VORTEX.emptyField(); VORTEX.step(0.4); }); await aim(k);
    // pin the pulsar in the claw's lane at z 0.3 (no flips) frame by frame until its charge has just started
    await sleep(150); await E(() => { VORTEX.step(0.5); VORTEX.emptyField(); VORTEX.step(0.1); });   // no bullets left in flight
    // (it waits 3 lanes away so a pulse already in progress cannot zap the claw before the test starts)
    let r = await E(() => { VORTEX.emptyField(); const away = () => (VORTEX.playerLane() + 3) % VORTEX.webInfo().n; let id = VORTEX.spawn('pulsar', away(), 0.3);
      const pin = l => { if (!VORTEX.enemyList().some(e => e.id === id)) id = VORTEX.spawn('pulsar', l, 0.3); VORTEX.setEnemy(id, { lane: l, z: 0.3, flipping: false }); };
      for (let i = 0; i < 400; i++) { pin(away()); const w = VORTEX.zapWarn(); if (w.pulseAmt > 0 && w.pulseAmt < 0.25 && !w.pulsing) break; VORTEX.step(1 / 60); }
      pin(VORTEX.playerLane()); return { s0: VORTEX.score(), sc0: VORTEX.shortCircuit(), w: VORTEX.zapWarn() }; });
    const f0 = await E(() => VORTEX.shotsFired());
    if (k === 'key') await page.keyboard.down('Space');
    else if (k === 'mouse') await page.mouse.down();
    else if (k === 'pad') await E(() => { window.__padOn = true; window.__padA = true; });
    else await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 7 }] });
    await page.waitForFunction(n => VORTEX.shotsFired() > n, f0, { timeout: 8000 }).catch(() => {});
    await E(() => VORTEX.step(0.6, () => !VORTEX.enemyList().some(e => e.type === 'pulsar')));
    if (k === 'key') await page.keyboard.up('Space');
    else if (k === 'mouse') await page.mouse.up();
    else if (k === 'pad') await E(() => { window.__padA = false; });
    else await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    let q = await E(() => ({ s: VORTEX.score(), sc: VORTEX.shortCircuit(), m: VORTEX.messages(), state: VORTEX.state.state, left: VORTEX.enemyList().length }));
    check(q.state === 'play' && q.left === 0 && q.sc.n === r.sc0.n + 1, `${k}: pulsar charging in your lane (z 0.3, pulseAmt ${r.w.pulseAmt.toFixed(2)}) is SHORT-CIRCUITED (n ${q.sc.n}, ${q.state})`);
    check(q.s - r.s0 >= 500 && q.s - r.s0 < 560, `${k}: pays kill 200 + bonus 300 (score +${q.s - r.s0})`);
    check(q.m.some(t => t === 'SHORT-CIRCUIT!  +300'), `${k}: 'SHORT-CIRCUIT!  +300' pop shown`);
    if (first) check(q.m.some(t => /SHOOT IT BEFORE IT ZAPS/.test(t)), 'first one shows the SHOOT IT BEFORE IT ZAPS tip');
    if (SHOTS && first) { await E(() => VORTEX.freeze(false)); await sleep(40); await page.screenshot({ path: `${SHOTS}/vortex-short-${label.replace(/\W+/g, '_')}.png`, timeout: 10000 }).catch(() => {}); await E(() => VORTEX.freeze(true)); }
    first = false;
    await E(() => VORTEX.step(2.4));
  }
  // 2. no bonus: pulsar in another lane, pulsar killed while not charging, superzapper kill
  let r = await E(() => {
    VORTEX.emptyField(); VORTEX.step(0.3); const l = VORTEX.playerLane(), sc0 = VORTEX.shortCircuit().n, out = {};
    let s0 = VORTEX.score(); let id = VORTEX.spawn('pulsar', (l + 3) % VORTEX.webInfo().n, 0.3); VORTEX.step(3, () => { const w = VORTEX.zapWarn(); return w.pulseAmt > 0 && !w.pulsing; });
    VORTEX.kill(id, false); out.other = VORTEX.score() - s0;
    VORTEX.step(3, () => VORTEX.zapWarn().pulseAmt === 0); s0 = VORTEX.score(); id = VORTEX.spawn('pulsar', l, 0.3); out.amt = VORTEX.zapWarn().pulseAmt; VORTEX.kill(id, false); out.idle = VORTEX.score() - s0;
    s0 = VORTEX.score(); id = VORTEX.spawn('pulsar', l, 0.5); VORTEX.step(3, () => { const w = VORTEX.zapWarn(); return w.pulseAmt > 0 && !w.pulsing; }); VORTEX.kill(id, true); out.zapped = VORTEX.score() - s0;
    out.n = VORTEX.shortCircuit().n - sc0; out.state = VORTEX.state.state; return out;
  });
  check(r.n === 0 && r.other === 200 && r.idle === 200 && r.zapped === 200 && r.state === 'play', `no bonus for other lane / not charging (amt ${r.amt}) / superzapper: +${r.other} / +${r.idle} / +${r.zapped}, shorts ${r.n}`);
  // 3. rules unchanged: a charging pulsar left alone in your lane still zaps you
  r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.3); VORTEX.setAuto(false); const id = VORTEX.spawn('pulsar', VORTEX.playerLane(), 0.4); for (let i = 0; i < 300 && VORTEX.state.state === 'play'; i++) { VORTEX.setEnemy(id, { lane: VORTEX.playerLane(), z: 0.4, flipping: false }); VORTEX.step(1 / 60); } return { state: VORTEX.state.state, k: VORTEX.deathKind() }; });
  check(r.state === 'dying' && r.k === 'zap', `an unshot pulsar still zaps (${r.state}, ${r.k})`);
  // 4. run report line
  let q = await E(() => VORTEX.runReport());
  check(/PULSARS SHORTED \d+/.test(q.lines.extra), `RUN REPORT lists them: "${q.lines.extra}"`);
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
