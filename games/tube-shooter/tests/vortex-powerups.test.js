// VORTEX Day 4 (2026-10-31): Tempest 2000-style power-ups (PARTICLE LASER, AI DROID, BONUS). Desktop + iPhone, no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-powerups.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137', SHOTS = process.argv[3];
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function suite(browser, label, ctxOpts, tag) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  const E = f => page.evaluate(f);
  await E(() => { window.__noWarp = true; window.__noPups = true; VORTEX.freeze(true); VORTEX.gotoLevel(2); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); VORTEX.setLane(3, 0); });
  // 1. catch a crystal in the claw's lane -> PARTICLE LASER
  let r = await E(() => { VORTEX.dropPup(VORTEX.playerLane(), 0.3); VORTEX.step(0.5); const mid = VORTEX.pups().length; VORTEX.step(0.8); return { mid, left: VORTEX.pups().length, p: VORTEX.power(), m: VORTEX.messages() }; });
  check(r.mid === 1 && r.left === 0 && r.p.laser && r.m.includes('PARTICLE LASER'), `crystal drifts up and is caught at the rim -> PARTICLE LASER (${JSON.stringify(r.p)})`);
  // 2. laser shots are faster
  r = await E(() => { VORTEX.key('Space', true); VORTEX.step(1 / 120); VORTEX.key('Space', false); const s0 = VORTEX.shotList()[0]; VORTEX.step(0.2); const s1 = VORTEX.shotList()[0]; return { s0, s1 }; });
  check(r.s0 && r.s0.laser && r.s1 && r.s1.z > 2.3 * 0.2 * 1.3, `laser shot fired and flies faster (z after 0.2 s: ${r.s1 && r.s1.z.toFixed(3)} vs normal ${(2.3 * 0.2).toFixed(3)})`);
  // 3. pierce: one laser shot kills two flippers in a line
  r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.3); const l = VORTEX.playerLane(); VORTEX.spawn('flipper', l, 0.5); VORTEX.spawn('flipper', l, 0.58);
    const sc = VORTEX.score(); VORTEX.key('Space', true); VORTEX.step(1 / 120); VORTEX.key('Space', false); VORTEX.step(0.45); return { left: VORTEX.enemyList().length, gain: VORTEX.score() - sc, shots: VORTEX.shotList().length }; });
  check(r.left === 0 && r.gain >= 300, `one laser shot pierces two flippers (${r.left} left, +${r.gain})`);
  // 4. laser burns through an enemy shot and still hits the enemy behind it
  r = await E(() => { VORTEX.emptyField(); VORTEX.step(0.3); const l = VORTEX.playerLane(); VORTEX.addEShot(l, 0.35); VORTEX.spawn('flipper', l, 0.7);
    VORTEX.key('Space', true); VORTEX.step(1 / 120); VORTEX.key('Space', false); VORTEX.step(0.5); return { es: VORTEX.eshotList().length, left: VORTEX.enemyList().length, alive: VORTEX.state.state }; });
  check(r.es === 0 && r.left === 0 && r.alive === 'play', `laser shot burns through an enemy shot and kills the flipper behind it (${JSON.stringify(r)})`);
  // 5. a crystal waits on the rim; it is caught when the claw moves into its lane -> AI DROID
  r = await E(() => { VORTEX.emptyField(); const n = VORTEX.webInfo().n, l = (VORTEX.playerLane() + 3) % n; VORTEX.dropPup(l, 0.05); VORTEX.step(1.0);
    const waiting = VORTEX.pups().length, still = VORTEX.power().droid; VORTEX.setLane(l, 0); VORTEX.step(0.1); return { waiting, still, p: VORTEX.power(), m: VORTEX.messages() }; });
  check(r.waiting === 1 && !r.still && r.p.droid && r.m.includes('AI DROID'), `crystal waits on the rim, moving into its lane catches it -> AI DROID (${JSON.stringify(r.p.droid)})`);
  // 6. the droid hunts: a flipper 4 lanes from the claw is shot by the droid
  r = await E(() => { VORTEX.emptyField(); const n = VORTEX.webInfo().n, l = (VORTEX.playerLane() + 4) % n; const id = VORTEX.spawn('flipper', l, 0.35); VORTEX.step(2.0, () => !VORTEX.enemy(id));
    return { dead: !VORTEX.enemy(id), dk: VORTEX.power().stats.droidKills, st: VORTEX.state.state }; });
  check(r.dead && r.dk >= 1 && r.st === 'play', `AI droid shoots an enemy in another lane (droid kills ${r.dk})`);
  if (SHOTS) { await E(() => { const l = VORTEX.playerLane(), n = VORTEX.webInfo().n; VORTEX.spawn('flipper', (l + 5) % n, 0.6); VORTEX.spawn('tanker', (l + 2) % n, 0.8); VORTEX.dropPup((l + 1) % n, 0.4); VORTEX.key('Space', true); VORTEX.step(0.12); VORTEX.key('Space', false); VORTEX.freeze(true); });
    await sleep(400); await page.screenshot({ path: `${SHOTS}/vortex-powerups-${tag}.png` }); await E(() => VORTEX.emptyField()); }
  // 7. third crystal -> BONUS 2500
  r = await E(() => { VORTEX.emptyField(); const sc = VORTEX.score(); VORTEX.dropPup(VORTEX.playerLane(), 0.02); VORTEX.step(0.3); return { gain: VORTEX.score() - sc, m: VORTEX.messages(), n: VORTEX.power().n }; });
  check(r.gain >= 2500 && r.m.includes('BONUS 2500'), `third crystal pays BONUS 2500 (+${r.gain})`);
  // 7b. the droid is a treat, not a permanent wingman: it powers down 12 s after it was caught
  r = await E(() => { VORTEX.emptyField(); const had = !!VORTEX.power().droid; VORTEX.step(16, () => !VORTEX.power().droid); return { had, now: VORTEX.power().droid, m: VORTEX.messages(), laser: VORTEX.power().laser }; });
  check(r.had && !r.now && r.m.includes('DROID OFFLINE') && r.laser, `AI droid powers down after 12 s (laser kept)`);
  // 8. losing a life loses the power-ups
  r = await E(() => { VORTEX.emptyField(); VORTEX.setAuto(false); VORTEX.addEShot(VORTEX.playerLane(), 0.01); VORTEX.step(0.1); const k = VORTEX.deathKind(); const p = VORTEX.power(); VORTEX.step(6, () => VORTEX.state.state === 'play'); return { k, p }; });
  check(r.k === 'shot' && !r.p.laser && !r.p.droid, `death clears LASER and DROID (${JSON.stringify(r.p)})`);
  // 9. natural drops: none on level 1; on level 3 a crystal drops after 6-11 shot kills
  r = await E(() => { window.__noPups = false; VORTEX.gotoLevel(1); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField();
    const l1 = []; for (let i = 0; i < 14; i++) l1.push(VORTEX.spawn('flipper', i % 4, 0.6)); l1.forEach(id => VORTEX.kill(id)); const onL1 = VORTEX.pups().length;
    VORTEX.gotoLevel(3); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); let at = -1;
    for (let i = 0; i < 14 && at < 0; i++) { VORTEX.kill(VORTEX.spawn('flipper', i % 4, 0.6)); if (VORTEX.pups().length) at = i + 1; }
    return { onL1, at }; });
  check(r.onL1 === 0 && r.at >= 1 && r.at <= 11, `no drops on level 1; first drop on level 3 after ${r.at} kills`);
  // 10. a crystal still in the tube when the level clears is collected at the warp
  r = await E(() => { window.__noWarp = false; VORTEX.emptyField(); VORTEX.dropPup(0, 0.9); const n0 = VORTEX.power().n; VORTEX.clearLevel(); VORTEX.step(0.05); return { n0, n1: VORTEX.power().n, st: VORTEX.state.state }; });
  check(r.n1 === r.n0 + 1 && r.st === 'warp', `crystal left in the tube is granted at the warp (${r.n0} -> ${r.n1}, ${r.st})`);
  await E(() => VORTEX.freeze(false)); await sleep(1500);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } }, 'desktop');
  await suite(browser, 'iPhone 14', devices['iPhone 14'], 'iphone');
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
