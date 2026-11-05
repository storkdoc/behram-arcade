// VORTEX 2026-11-05: rim FUSEBALL WARNING (white/cyan sparks + bright chirp when a rim fuseball is within 2 rails).
// Also checks the pulsar zap cue (rising buzz when YOUR lane is about to zap).
// Desktop + iPhone 14 (+ landscape), no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-fusewarn.test.js http://localhost:8137
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
  await page.evaluate(() => { window.__noWarp = true; window.__noTokens = true; VORTEX.freeze(true); VORTEX.setLives(9); VORTEX.gotoLevel(6); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setLane(3, 0); });
  await clear();
  // 1. far rim fuseball: no warning
  let r = await page.evaluate(() => {
    const pl = VORTEX.playerLane();
    const id = VORTEX.spawn('fuseball', pl + 5, 0);
    VORTEX.setEnemy(id, { atRim: true, z: 0, rail: pl + 5, pause: 99, rimTimer: 99, jumping: false });
    VORTEX.step(1 / 120);
    return VORTEX.fuseWarn();
  });
  check(r.threats.length === 0 && r.cues === 0, `no warning for a rim fuseball 5 rails away (${JSON.stringify(r)})`);
  await clear();
  // 2. two rails away: flagged, no cue yet (cue fires at d<=1)
  const f0 = await page.evaluate(() => VORTEX.fuseWarn().frames);
  r = await page.evaluate(() => {
    const pl = VORTEX.playerLane();
    // place fuseball so min dist to claw rails (pl, pl+1) is 2
    const rail = pl + 3; // dist to pl = 3, to pl+1 = 2 → min 2
    const id = VORTEX.spawn('fuseball', rail, 0);
    VORTEX.setEnemy(id, { atRim: true, z: 0, rail, pause: 99, rimTimer: 99, jumping: false });
    VORTEX.step(1 / 120);
    window.__fid = id;
    return VORTEX.fuseWarn();
  });
  check(r.threats.length === 1 && r.threats[0].d === 2 && r.cues === 0, `rim fuseball 2 rails away is flagged, no cue yet (${JSON.stringify(r.threats)}, cues ${r.cues})`);
  await page.waitForFunction(b => VORTEX.fuseWarn().frames >= b + 2, f0, { timeout: 8000 }).catch(() => {});
  const f1 = await page.evaluate(() => VORTEX.fuseWarn().frames);
  check(f1 - f0 >= 2, `the white sparks are drawn while it applies (${f1 - f0} frames)`);
  // 3. move it one rail closer: cue fires once
  r = await page.evaluate(() => {
    const pl = VORTEX.playerLane();
    VORTEX.setEnemy(window.__fid, { rail: pl + 2, pause: 99, rimTimer: 99, atRim: true, jumping: false });
    VORTEX.step(1 / 60);
    return VORTEX.fuseWarn();
  });
  check(r.threats.length === 1 && r.threats[0].d === 1 && r.cues === 1, `adjacent fuseball: one bright chirp (${JSON.stringify(r.threats)}, cues ${r.cues})`);
  if (SHOTS) { await sleep(250); await page.screenshot({ path: `${SHOTS}/fusewarn-${label.replace(/\W+/g, '_')}.png` }); }
  r = await page.evaluate(() => { VORTEX.step(0.3); return VORTEX.fuseWarn().cues; });
  check(r === 1, `the cue does not repeat while it waits next to the claw (cues ${r})`);
  // 4. kill it: warning gone
  r = await page.evaluate(() => { VORTEX.kill(window.__fid); VORTEX.step(1 / 60); return VORTEX.fuseWarn(); });
  check(r.threats.length === 0, 'killing the fuseball clears the warning');
  await clear();
  // 5. rim flipper (grabber) is NOT a fuse threat; mid-tube fuseball is not
  r = await page.evaluate(() => {
    const pl = VORTEX.playerLane();
    const a = VORTEX.spawn('flipper', pl + 1, 0); VORTEX.setEnemy(a, { pause: 99 });
    const b = VORTEX.spawn('fuseball', pl + 1, 0.5); VORTEX.setEnemy(b, { atRim: false, jumping: false, mdir: 0 });
    VORTEX.step(1 / 120);
    return VORTEX.fuseWarn();
  });
  check(r.threats.length === 0, `no fuse warning for a rim flipper or a mid-tube fuseball (${JSON.stringify(r.threats)})`);
  await clear();
  // 6. lethal rail (d=0): flagged while invincible, then death tip names the white sparks
  r = await page.evaluate(() => {
    VORTEX.setInvincible(true);
    const pl = VORTEX.playerLane();
    const id = VORTEX.spawn('fuseball', pl, 0);
    VORTEX.setEnemy(id, { atRim: true, z: 0, rail: pl, pause: 99, rimTimer: 99, jumping: false });
    VORTEX.step(1 / 120);
    const g = VORTEX.fuseWarn();
    const seen0 = g.threats.some(t => t.d === 0);
    // now let it kill
    VORTEX.setInvincible(false);
    VORTEX.step(0.5, () => VORTEX.deathKind() != null);
    const kind = VORTEX.deathKind();
    VORTEX.step(8, () => VORTEX.state.state === 'play');
    return { seen0, kind, m: VORTEX.messages(), threats: g.threats };
  });
  check(r.seen0 && r.kind === 'fuse', `lethal-rail fuseball is flagged before the kill (${r.seen0}, death ${r.kind})`);
  check(r.m.includes('FUSEBALL') && r.m.some(t => /WHITE RIM SPARKS/.test(t)), `fuse tip points at the sparks (${r.m.join(' / ')})`);
  await clear();
  // 7. pulsar zap cue: when a pulsar in your lane enters the pulse window, zapWarn cues once
  r = await page.evaluate(() => {
    // fresh play state after the fuse death
    VORTEX.setInvincible(true); VORTEX.setLives(9);
    if (VORTEX.setAuto) VORTEX.setAuto(false);   // iPhone smart auto-fire would shoot the pulsar in our lane
    if (VORTEX.state.state !== 'play') { VORTEX.gotoLevel(6); VORTEX.step(4, () => VORTEX.state.state === 'play'); }
    VORTEX.emptyField(); VORTEX.setLane(3, 0);
    const pl = VORTEX.playerLane();
    const id = VORTEX.spawn('pulsar', pl, 0.25);
    VORTEX.setEnemy(id, { pause: 99, flipping: false, z: 0.25, spMul: 0 });
    const before = VORTEX.zapWarn().cues;
    let sawPulse = false, cues = before;
    for (let i = 0; i < 900; i++) {   // ~15 s: pulsar pulse cycle is a few seconds
      VORTEX.step(1 / 60);
      const z = VORTEX.zapWarn();
      if (z.pulseAmt > 0.55) sawPulse = true;
      if (z.cues > before) { cues = z.cues; break; }
    }
    return { before, cues, sawPulse, z: VORTEX.zapWarn(), st: VORTEX.state.state };
  });
  check(r.sawPulse && r.cues === r.before + 1, `pulsar in your lane: one zapwarn cue when the pulse rises (${JSON.stringify(r)})`);
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
