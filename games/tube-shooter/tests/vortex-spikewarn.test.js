// VORTEX 2026-11-04: WARP SPIKE GUIDE (the spike in the claw's lane burns red-hot during the warp, a rising
// 'parking sensor' blip, and the nearest spike-free lane each way lights green). Desktop + iPhone 14 (+ landscape).
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-spikewarn.test.js http://localhost:8137
// SHOTS=<dir> saves a screenshot of the guide.
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
  // a level in play, claw in lane 3, spikes in lanes 2 and 3 only, then clear the level -> warp
  const setup = (spiked, tokens) => page.evaluate(({ spiked, tokens }) => {
    window.__noTokens = !tokens; VORTEX.freeze(true); VORTEX.setAuto(false); /* smart autofire (default on touch) would shoot the spike down */ VORTEX.setLives(9); VORTEX.gotoLevel(2);
    VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setLane(3, 0);
    for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true }); VORTEX.emptyField();
    for (const l of spiked) VORTEX.setSpike(l, 0.55);
    if (tokens) VORTEX.setTokens(3);
    VORTEX.clearLevel(); VORTEX.step(0.05);
    return { st: VORTEX.state.state, g: VORTEX.spikeGuide(), bonus: VORTEX.bonus().active };
  }, { spiked, tokens: !!tokens });
  // 1. spike ahead in the claw's lane: flagged, nearest clear lanes are 1 and 4
  let r = await setup([2, 3]);
  check(r.st === 'warp' && r.g.ahead && r.g.lane === 3, `warp with a spike in the claw's lane is flagged (${JSON.stringify(r)})`);
  check(JSON.stringify(r.g.safe.slice().sort()) === '[1,4]', `nearest spike-free lane each way lights green (${JSON.stringify(r.g.safe)})`);
  check(r.g.beeps >= 1, `the blip starts at once (${r.g.beeps})`);
  const f0 = r.g.frames;
  await page.waitForFunction(b => VORTEX.spikeGuide().frames >= b + 2, f0, { timeout: 8000 }).catch(() => {});
  check((await page.evaluate(() => VORTEX.spikeGuide().frames)) - f0 >= 2, 'the hot spike and green lanes are drawn');
  check((await page.evaluate(() => VORTEX.messages())).some(m => /SPIKE AHEAD/.test(m)), 'first-time tip: SPIKE AHEAD! STEER TO A GREEN LANE');
  if (SHOTS) { await page.screenshot({ path: `${SHOTS}/spikewarn-${label.replace(/\W+/g, '_')}.png` }); }
  // blips get faster as the tip closes in
  r = await page.evaluate(() => { const b0 = VORTEX.spikeGuide().beeps; VORTEX.step(0.4); const b1 = VORTEX.spikeGuide().beeps; const g = VORTEX.spikeGuide(); return { early: b1 - b0, dz: g.dz }; });
  const late = await page.evaluate(() => { const b0 = VORTEX.spikeGuide().beeps; VORTEX.step(0.4, () => !VORTEX.spikeGuide().ahead); return VORTEX.spikeGuide().beeps - b0; });
  check(late > r.early, `blip rate rises as the tip gets closer (${r.early} -> ${late} per 0.4 s)`);
  // 2. ignore it: you still die on the spike (nothing is removed)
  r = await page.evaluate(() => { VORTEX.step(3, () => VORTEX.state.state !== 'warp'); return { st: VORTEX.state.state, k: VORTEX.deathKind() }; });
  check(r.st === 'dying' && r.k === 'spike', `staying in the lane still hits the spike (${JSON.stringify(r)})`);
  // 3. steer out (keyboard hold, the same path as pad/touch steering): guide clears, counted, warp completes
  r = await setup([2, 3]);
  r = await page.evaluate(() => {
    const L0 = VORTEX.state.lives;
    VORTEX.key('ArrowLeft', true); VORTEX.step(0.6, () => VORTEX.playerLane() !== 3); VORTEX.key('ArrowLeft', false);
    VORTEX.step(0.6, () => [1, 4].includes(VORTEX.playerLane()) || VORTEX.state.state !== 'warp');
    const g = VORTEX.spikeGuide(), lane = VORTEX.playerLane();
    VORTEX.step(4, () => VORTEX.state.state !== 'warp');
    return { lane, g, st: VORTEX.state.state, lvl: VORTEX.state.level, lost: L0 - VORTEX.state.lives, k: VORTEX.deathKind() };
  });
  check(!r.g.ahead && r.g.steered >= 1, `steering into a clear lane clears the guide and counts (${JSON.stringify(r.g)}, lane ${r.lane})`);
  check(r.lost === 0 && r.st !== 'dying' && r.lvl === 3, `the warp completes into level 3 with no life lost (${JSON.stringify({ st: r.st, lvl: r.lvl, lost: r.lost })})`);
  // 4. no spike in the lane: silent
  r = await setup([7]);
  r = await page.evaluate(() => { VORTEX.step(0.5); return VORTEX.spikeGuide(); });
  check(!r.ahead && r.frames === 0 || !r.ahead, `no guide and no blip when the claw's lane is clear (${JSON.stringify(r)})`);
  const b4 = r.beeps;
  r = await page.evaluate(() => { VORTEX.step(0.5); return VORTEX.spikeGuide().beeps; });
  check(r === b4, 'no blips while clear');
  // 5. BONUS WARP gate round: no spike guide
  r = await setup([2, 3], true);
  check(r.bonus && !r.g.ahead, `BONUS WARP gate round shows no spike guide (${JSON.stringify({ bonus: r.bonus, ahead: r.g.ahead })})`);
  check(errs.length === 0, `no console errors ${JSON.stringify(errs.slice(0, 3))}`);
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } });
  await suite(browser, 'iPhone 14', { ...devices['iPhone 14'] });
  await suite(browser, 'iPhone 14 landscape', { ...devices['iPhone 14 landscape'] });
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
