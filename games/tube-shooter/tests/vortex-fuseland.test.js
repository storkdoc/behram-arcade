// VORTEX 2026-11-11: FUSEBALL LANDING WARNING. A fuseball climbing the last 30% of the tube on one of the claw's own
// rails is flagged (white streak + landing ring + one chirp) and, on reaching the rim, flares for a short grace before
// it is lethal. Standing still still dies; stepping off the rail during the warning survives. Others unchanged.
// Desktop + iPhone 14 (+ landscape), no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-fuseland.test.js http://localhost:8137
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
  const fresh = () => page.evaluate(() => {
    VORTEX.setInvincible(false); VORTEX.setLives(9); if (VORTEX.setAuto) VORTEX.setAuto(false);
    if (VORTEX.state.state !== 'play') { VORTEX.gotoLevel(6); VORTEX.step(6, () => VORTEX.state.state === 'play'); }
    for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true }); VORTEX.emptyField(); VORTEX.setLane(3, 0); VORTEX.step(1 / 60);
  });
  await page.evaluate(() => { window.__noWarp = true; window.__noTokens = true; VORTEX.freeze(true); VORTEX.setLives(9); VORTEX.gotoLevel(6); VORTEX.step(4, () => VORTEX.state.state === 'play'); });
  // climbing fuseball spawner: on rail r, at depth z, moving toward the rim, no random jumps
  await page.evaluate(() => { window.__climb = (rail, z) => { const id = VORTEX.spawn('fuseball', rail, z); VORTEX.setEnemy(id, { rail, z, atRim: false, jumping: false, mdir: -1 }); return id; };
    window.__noJump = () => { for (const e of VORTEX.enemyList()) if (e.type === 'fuseball' && !e.atRim) VORTEX.setEnemy(e.id, { jumping: false, jt: 0, rail: window.__rail, mdir: -1 }); }; });
  await fresh();
  // 1. climbing deep in the tube on the claw's rail: not flagged yet
  let r = await page.evaluate(() => { const pl = VORTEX.playerLane(); window.__rail = pl; window.__climb(pl, 0.6); VORTEX.step(1 / 120); return VORTEX.fuseWarn(); });
  check(r.threats.length === 0 && r.landCues === 0, `deep fuseball on the claw rail is not flagged (${JSON.stringify(r.threats)})`);
  await fresh();
  // 2. climbing on the claw's rail within 30% of the rim: flagged as landing + one chirp; ring drawn
  const f0 = await page.evaluate(() => VORTEX.fuseWarn().landFrames);
  r = await page.evaluate(() => { const pl = VORTEX.playerLane(); window.__rail = pl + 1; window.__fid = window.__climb(pl + 1, 0.25); VORTEX.setInvincible(true); VORTEX.step(1 / 120); return VORTEX.fuseWarn(); });
  check(r.threats.length === 1 && r.threats[0].landing && r.threats[0].climbing && r.threats[0].d === 0, `climbing fuseball on a claw rail inside 30% is flagged as LANDING (${JSON.stringify(r.threats)})`);
  check(r.landCues === 1 && r.cues >= 1, `one landing chirp (landCues ${r.landCues}, cues ${r.cues})`);
  await page.waitForFunction(b => VORTEX.fuseWarn().landFrames >= b + 2, f0, { timeout: 8000 }).catch(() => {});
  if (SHOTS) { await page.screenshot({ path: `${SHOTS}/fuseland-${label.replace(/\W+/g, '_')}.png` }); }
  const f1 = await page.evaluate(() => VORTEX.fuseWarn().landFrames);
  check(f1 - f0 >= 2, `the landing streak + ring are drawn (${f1 - f0} frames)`);
  r = await page.evaluate(() => { for (let i = 0; i < 6; i++) { window.__noJump(); VORTEX.step(0.02); } return VORTEX.fuseWarn().landCues; });
  check(r === 1, `the chirp does not repeat while it climbs (landCues ${r})`);
  await fresh();
  // 3. a climbing fuseball on a rail 1 away from the claw is not a landing threat
  r = await page.evaluate(() => { const pl = VORTEX.playerLane(); window.__climb(pl + 2, 0.2); VORTEX.step(1 / 120); return VORTEX.fuseWarn(); });
  check(!r.threats.some(t => t.climbing), `climbing fuseball one rail off is not flagged (${JSON.stringify(r.threats)})`);
  await fresh();
  // 4. standing still: it lands, flares, then kills (not on the landing frame)
  r = await page.evaluate(() => {
    const pl = VORTEX.playerLane(); window.__rail = pl; const id = window.__climb(pl, 0.05);
    let landedAt = -1, t = 0, aliveAfterLand = false;
    for (let i = 0; i < 240 && VORTEX.deathKind() == null; i++) { window.__noJump(); VORTEX.step(1 / 120); t += 1 / 120; const e = VORTEX.enemyList().find(x => x.id === id);
      if (e && e.atRim && landedAt < 0) { landedAt = t; aliveAfterLand = VORTEX.deathKind() == null; } }
    return { landedAt, aliveAfterLand, kind: VORTEX.deathKind(), killT: t, grace: VORTEX.fuseWarn().grace, fd: VORTEX.fuseDeaths() };
  });
  check(r.landedAt > 0 && r.aliveAfterLand, `the landing frame is not lethal (${JSON.stringify(r)})`);
  check(r.kind === 'fuse' && r.killT - r.landedAt >= r.grace - 0.02, `standing still on the rail still dies after the ${r.grace}s flare (${(r.killT - r.landedAt).toFixed(3)} s)`);
  await page.evaluate(() => VORTEX.step(8, () => VORTEX.state.state === 'play'));
  await fresh();
  // 5. stepping off the rail during the warning survives
  r = await page.evaluate(() => {
    const pl = VORTEX.playerLane(); window.__rail = pl; const id = window.__climb(pl, 0.1);
    const fd0 = VORTEX.fuseDeaths(), lives0 = VORTEX.state.lives;
    for (let i = 0; i < 6; i++) { window.__noJump(); VORTEX.step(1 / 120); }
    VORTEX.setLane(pl + 3, 0);   // step two lanes away
    for (let i = 0; i < 120; i++) { VORTEX.setEnemy(id, { pause: 99, jumping: false }); VORTEX.step(1 / 120); }
    const e = VORTEX.enemyList().find(x => x.id === id);
    const fd1 = VORTEX.fuseDeaths();
    return { died: fd1.arrive + fd1.chase + fd1.rimjump - fd0.arrive - fd0.chase - fd0.rimjump, lives: VORTEX.state.lives - lives0, atRim: e && e.atRim, st: VORTEX.state.state };
  });
  check(r.died === 0 && r.st === 'play' && r.atRim, `dodging off the rail during the warning survives the landing (${JSON.stringify(r)})`);
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
