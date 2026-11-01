// VORTEX Day 5 (2026-11-01): JUMP power-up (Tempest 2000). Desktop (keyboard, mouse middle button, gamepad Y) + iPhone 14
// (JUMP touch button). Dodges enemy shots, rim grabbers and fuseballs in the air, hops over mine walls, recharge, lost on death.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-jump.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137', SHOTS = process.argv[3];
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = () => {
  window.__padY = false;
  const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: i === 3 && window.__padY, value: i === 3 && window.__padY ? 1 : 0 })); } };
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
  await E(() => { window.__noWarp = true; window.__noPups = true; VORTEX.freeze(true); VORTEX.gotoLevel(2); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); VORTEX.setLane(3, 0); VORTEX.setAuto(false); });
  // 0. no jump before the power-up
  let r = await E(() => { VORTEX.doJump(); VORTEX.step(0.05); return VORTEX.jump(); });
  check(!r.has && !r.air, 'no JUMP before the 2nd crystal');
  r = await E(() => { const l = VORTEX.playerLane(); VORTEX.dropPup(l, 0.02); VORTEX.step(0.3); VORTEX.dropPup(l, 0.02); VORTEX.step(0.3); return { j: VORTEX.jump(), p: VORTEX.power(), m: VORTEX.messages() }; });
  check(r.p.laser && r.j.has && !r.p.droid, '1st crystal LASER, 2nd crystal JUMP');
  // 1. input: keyboard Shift (desktop) / JUMP button (touch)
  if (touchDev) {
    // the next animation frame syncs the touch controls (slow under SwiftShader)
    await page.waitForFunction(() => getComputedStyle(document.getElementById('tjump')).display === 'flex', null, { timeout: 15000 }).catch(() => {});
    const box = await page.locator('#tjump').boundingBox();
    check(!!box && box.width > 40, 'JUMP touch button is visible (' + (box ? Math.round(box.width) + 'px at ' + Math.round(box.x) + ',' + Math.round(box.y) : 'missing') + ')');
    const over = await E(() => { const j = document.getElementById('tjump').getBoundingClientRect(); const hit = id => { const el = document.getElementById(id); if (!el || getComputedStyle(el).display === 'none') return false; const b = el.getBoundingClientRect(); return !(b.right <= j.left || b.left >= j.right || b.bottom <= j.top || b.top >= j.bottom); };
      return ['tfire', 'tzap', 'tknob', 'tpause', 'tmute', 'tauto', 'tleft', 'tright'].filter(hit); });
    check(over.length === 0, 'JUMP button overlaps no other control ' + JSON.stringify(over));
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else await page.keyboard.press('ShiftLeft');
  r = await E(() => { const a = VORTEX.jump(); VORTEX.step(0.3); return { a, b: VORTEX.jump() }; });
  check(r.a.air && r.a.n === 1 && r.b.air && r.b.h > 0.5, (touchDev ? 'tapping JUMP' : 'Shift') + ' launches the claw (height ' + r.b.h.toFixed(2) + ')');
  if (SHOTS) { await sleep(150); await page.screenshot({ path: `${SHOTS}/vortex-jump-${touchDev ? 'iphone' : 'desktop'}.png` }); }
  // 2. lands, then recharges; a press while recharging does nothing
  r = await E(() => { VORTEX.step(0.6); const landed = VORTEX.jump(); VORTEX.doJump(); VORTEX.step(0.02); const blocked = VORTEX.jump(); VORTEX.step(1.6); VORTEX.doJump(); VORTEX.step(0.02); return { landed, blocked, again: VORTEX.jump() }; });
  check(!r.landed.air && r.landed.cd > 0 && !r.blocked.air && r.again.air && r.again.n === 2, `lands after ~0.75 s, recharges (cd ${r.landed.cd.toFixed(2)} s), then jumps again`);
  await E(() => VORTEX.step(2.5));
  // 3. an enemy shot reaching the rim in the claw's lane passes under a jumping claw
  r = await E(() => { VORTEX.emptyField(); const l = VORTEX.playerLane(); VORTEX.addEShot(l, 0.06); VORTEX.doJump(); VORTEX.step(0.5); return { st: VORTEX.state.state, es: VORTEX.eshotList().length, j: VORTEX.jump(), m: VORTEX.messages() }; });
  check(r.st === 'play' && r.es === 0 && r.j.dodged >= 1 && r.m.includes('DODGED!'), `enemy shot passes under the jumping claw (${r.st}, dodged ${r.j.dodged})`);
  await E(() => VORTEX.step(2.5));
  // 4. a fuseball sitting on the claw's rail does not kill it in the air; on the ground the same thing kills
  r = await E(() => { VORTEX.emptyField(); const l = VORTEX.playerLane(); VORTEX.doJump(); VORTEX.step(0.1); const id = VORTEX.spawn('flipper', l, 0); VORTEX.setEnemy(id, { landT: 9, z: 0 }); VORTEX.step(0.3); const air = VORTEX.state.state; return { air }; });
  check(r.air === 'play', 'a rim flipper in the claw\'s lane cannot grab it in the air');
  r = await E(() => { VORTEX.step(1.2); return { st: VORTEX.state.state, k: VORTEX.deathKind() }; });
  check(r.st === 'dying' && r.k === 'capture', 'after landing the same flipper grabs it (JUMP is a dodge, not a shield): ' + r.k);
  r = await E(() => { VORTEX.step(8, () => VORTEX.state.state === 'play'); return { st: VORTEX.state.state, p: VORTEX.power(), j: VORTEX.jump() }; });
  check(r.st === 'play' && !r.p.jump && !r.p.laser, 'losing a life loses JUMP (with the laser)');
  // 5. hop over an armed mine wall
  r = await E(() => { VORTEX.emptyField(); const l = VORTEX.playerLane(); VORTEX.dropPup(l, 0.02); VORTEX.step(0.3); VORTEX.dropPup(l, 0.02); VORTEX.step(0.3);
    const n = VORTEX.webInfo().n, w = (l + 1) % n; VORTEX.addMine(w, 0, true);
    VORTEX.key('ArrowLeft', true); VORTEX.step(0.5); VORTEX.key('ArrowLeft', false); VORTEX.step(0.2); const blocked = VORTEX.playerLane();
    VORTEX.doJump(); VORTEX.key('ArrowLeft', true); VORTEX.step(0.35); VORTEX.key('ArrowLeft', false); VORTEX.step(0.6); return { l, w, blocked, after: VORTEX.playerLane(), st: VORTEX.state.state, n }; });
  check(r.blocked === r.l && r.after !== r.l && r.after !== r.w && r.st === 'play', `a mine wall stops the claw on the ground (lane ${r.blocked}) but it hops over in the air (lane ${r.l} -> ${r.after}, wall ${r.w})`);
  // 6. gamepad Y (desktop) / mouse middle button
  if (!touchDev) {
    await E(() => { VORTEX.emptyField(); VORTEX.step(2.5); window.__padOn = true; window.__padY = true; });
    await page.waitForFunction(() => VORTEX.jump().air, null, { timeout: 4000 }).catch(() => {});
    r = await E(() => { window.__padY = false; return VORTEX.jump(); });
    check(r.air, 'gamepad Y jumps');
    await E(() => { window.__padOn = false; VORTEX.step(2.5); });
    await page.mouse.move(700, 450); await page.mouse.down({ button: 'middle' }); await page.mouse.up({ button: 'middle' });
    r = await E(() => VORTEX.jump());
    check(r.air, 'mouse middle button jumps');
  }
  await E(() => { VORTEX.freeze(false); }); await sleep(1500);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } }, false);
  await suite(browser, 'iPhone 14', devices['iPhone 14'], true);
  await suite(browser, 'iPhone 14 landscape', devices['iPhone 14 landscape'], true);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
