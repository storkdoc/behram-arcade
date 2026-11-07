// VORTEX 2026-11-03: rim GRAB WARNING (orange chevrons on the rim + 'wup-wup' cue when a rim grabber is within 2 lanes).
// Desktop + iPhone 14 (+ landscape), no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-grabwarn.test.js http://localhost:8137
// SHOTS=<dir> saves a screenshot of the warning.
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const SHOTS = process.env.SHOTS || '';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function suite(browser, label, ctxOpts) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  const clear = () => page.evaluate(() => { for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true }); VORTEX.emptyField(); VORTEX.step(1 / 60); });
  await page.evaluate(() => { window.__noWarp = true; window.__noTokens = true; VORTEX.freeze(true); VORTEX.setLives(9); VORTEX.gotoLevel(1); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setLane(3, 0); });
  await clear();
  // 1. far grabber: no warning
  let r = await page.evaluate(() => { const id = VORTEX.spawn('flipper', VORTEX.playerLane() + 4, 0); VORTEX.setEnemy(id, { pause: 99 }); VORTEX.step(1 / 120); return VORTEX.grabWarn(); });
  check(r.threats.length === 0 && r.cues === 0, `no warning for a rim flipper 4 lanes away (${JSON.stringify(r)})`);
  await clear();
  // 2. two lanes away: warned (drawn), no cue yet
  const f0 = await page.evaluate(() => VORTEX.grabWarn().frames);
  r = await page.evaluate(() => { const id = VORTEX.spawn('flipper', VORTEX.playerLane() + 2, 0); VORTEX.setEnemy(id, { pause: 99 }); VORTEX.step(1 / 120); window.__gid = id; return VORTEX.grabWarn(); });
  check(r.threats.length === 1 && Math.abs(r.threats[0].d) === 2 && r.cues === 0, `rim flipper 2 lanes away is flagged, no cue yet (${JSON.stringify(r.threats)}, cues ${r.cues})`);
  await page.waitForFunction(b => VORTEX.grabWarn().frames >= b + 2, f0, { timeout: 8000 }).catch(() => {});
  const f1 = await page.evaluate(() => VORTEX.grabWarn().frames);
  check(f1 - f0 >= 2, `the chevrons are drawn while it applies (${f1 - f0} frames)`);
  // 3. let it flip one lane closer: the cue fires once
  r = await page.evaluate(() => { VORTEX.setEnemy(window.__gid, { pause: 0 }); const t = VORTEX.step(3, () => { const g = VORTEX.grabWarn(); return g.threats.length && Math.abs(g.threats[0].d) === 1; }); VORTEX.setEnemy(window.__gid, { pause: 99 }); VORTEX.step(0.2); return { t, ...VORTEX.grabWarn() }; });
  check(r.threats.length === 1 && Math.abs(r.threats[0].d) === 1 && r.cues === 1, `adjacent grabber: one 'wup-wup' cue (${JSON.stringify(r.threats)}, cues ${r.cues})`);
  if (SHOTS) { await sleep(250); await page.screenshot({ path: `${SHOTS}/grabwarn-${label.replace(/\W+/g, '_')}.png` }); }
  r = await page.evaluate(() => { VORTEX.step(0.3); return VORTEX.grabWarn().cues; });
  check(r === 1, `the cue does not repeat while it waits next to the claw (cues ${r})`);
  // 4. kill it: warning gone
  r = await page.evaluate(() => { VORTEX.kill(window.__gid); VORTEX.step(1 / 60); return VORTEX.grabWarn(); });
  check(r.threats.length === 0, 'killing the grabber clears the warning');
  await clear();
  // 5. fuseballs and enemies still climbing the tube are not grabbers
  r = await page.evaluate(() => { const L = VORTEX.playerLane(); const a = VORTEX.spawn('fuseball', L + 1, 0); VORTEX.setEnemy(a, { pause: 99, rimTimer: 99 }); const b = VORTEX.spawn('flipper', L + 1, 0.5); VORTEX.setEnemy(b, { spMul: 0 }); VORTEX.step(1 / 120); return VORTEX.grabWarn(); });
  check(r.threats.length === 0, `no warning for a rim fuseball or a flipper still down the tube (${JSON.stringify(r.threats)})`);
  await clear();
  // 6. in the claw's lane it is flagged (d = 0) until it grabs; the capture tip points at the orange rim cue
  r = await page.evaluate(() => { VORTEX.setInvincible(false); const id = VORTEX.spawn('flipper', VORTEX.playerLane() + 1, 0); VORTEX.setEnemy(id, { pause: 0 });
    let seen0 = false; VORTEX.step(4, () => { const g = VORTEX.grabWarn(); if (g.threats.some(t => t.d === 0)) seen0 = true; return VORTEX.deathKind() != null; });
    const kind = VORTEX.deathKind(); VORTEX.step(6, () => VORTEX.state.state !== 'dying'); return { seen0, kind, m: VORTEX.messages() }; });
  check(r.seen0 && r.kind === 'capture', `in-lane grab countdown is flagged before the grab (${r.seen0}, death ${r.kind})`);
  check(r.m.includes('GRABBED AT THE RIM') && r.m.some(t => /ORANGE RIM/.test(t)), `capture tip points at the orange rim cue (${r.m.join(' / ')})`);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } });
  await suite(browser, 'iPhone 14', devices['iPhone 14']);
  await suite(browser, 'iPhone 14 landscape', devices['iPhone 14 landscape']);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
