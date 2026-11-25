// VORTEX Day 29 (2026-11-25): CLEAN TUBE. On a level where spikes were laid, warping out with every spike cut to the root
// pays 250 + 150 x level (max 3000), with a pop, sound and announcer line. Cutting a lane to the root snaps (cuts++);
// with the pool empty and <= 3 enemies left, a first-time tip appears and leftover tips pulse. Spikes left = no bonus and
// the usual AVOID SPIKES. No spikes laid = no bonus. RUN REPORT lists CLEAN TUBES.
// Keyboard, mouse, gamepad A (desktop), touch FIRE (iPhone 14 portrait + landscape).
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-cleantube.test.js http://localhost:8137 [shotDir]
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
  // level L, empty field, claw in lane 3, auto-fire off, one straggler far away so the level is not over yet
  const setup = L => E(L => { window.__noWarp = true; window.__noPups = true; window.__noTokens = true; window.__noBonus = true; VORTEX.freeze(true); VORTEX.gotoLevel(L);
    VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); VORTEX.setLane(3, 0); VORTEX.setAuto(false); VORTEX.step(0.4); VORTEX.emptyField();
    const n = VORTEX.webInfo().n, far = (VORTEX.playerLane() + Math.floor(n / 2)) % n; const id = VORTEX.spawn('fuseball', far, 0.95); VORTEX.setEnemy(id, { z: 0.95 });
    return { id, far, me: VORTEX.playerLane() }; }, L);
  await setup(3);
  const cdp = touchDev ? await ctx.newCDPSession(page) : null;
  const fireBox = touchDev ? await (async () => { await page.waitForFunction(() => getComputedStyle(document.getElementById('tfire')).display !== 'none' && document.getElementById('tfire').getBoundingClientRect().width > 0, null, { timeout: 15000 }).catch(() => {}); return page.locator('#tfire').boundingBox(); })() : null;
  const down = async k => { if (k === 'key') await page.keyboard.down('Space'); else if (k === 'mouse') await page.mouse.down(); else if (k === 'pad') await E(() => { window.__padOn = true; window.__padA = true; }); else await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fireBox.x + fireBox.width / 2, y: fireBox.y + fireBox.height / 2, id: 7 }] }); };
  const up = async k => { if (k === 'key') await page.keyboard.up('Space'); else if (k === 'mouse') await page.mouse.up(); else if (k === 'pad') await E(() => { window.__padA = false; }); else await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  const kinds = touchDev ? ['touch'] : ['key', 'mouse', 'pad'];
  let first = true;
  for (const k of kinds) {
    const L = 3 + kinds.indexOf(k) * 2;
    const st = await setup(L);
    if (k === 'mouse') { const p = await E(() => VORTEX.rimPoint(VORTEX.playerLane() + 0.5)); await page.mouse.move(p.x, p.y); await sleep(60); await E(() => VORTEX.step(0.2)); }
    // 1. spikes laid: one in my lane, one next to it; straggler alive -> hint
    const h = await E(() => { const me = VORTEX.playerLane(); VORTEX.setSpike(me, 0.28); VORTEX.setSpike(me + 1, 0.12); VORTEX.step(0.1); return { ct: VORTEX.cleanTube(), m: VORTEX.messages(), me }; });
    check(h.ct.laid && h.ct.hint && h.ct.left === 2, `${k} L${L}: pool empty + 1 enemy + spikes -> CLEAN TUBE hint live (left ${h.ct.left})`);
    if (first) check(h.m.some(t => /CUT EVERY SPIKE BEFORE THE LAST KILL/.test(t)) && h.m.some(t => /CLEAN TUBE BONUS \+/.test(t)), 'first time: tip "CUT EVERY SPIKE BEFORE THE LAST KILL / CLEAN TUBE BONUS +N"');
    if (SHOTS && first) { await E(() => VORTEX.freeze(false)); await sleep(300); await page.screenshot({ path: `${SHOTS}/vortex-cleantube-${label.replace(/\W+/g, '_')}.png`, timeout: 10000 }).catch(() => {}); await E(() => VORTEX.freeze(true)); }
    // 2. cut my lane's spike with the real input
    const c0 = await E(() => VORTEX.cleanTube().cuts), f0 = await E(() => VORTEX.shotsFired());
    await down(k);
    await page.waitForFunction(n => VORTEX.shotsFired() > n, f0, { timeout: 8000 }).catch(() => {});
    await E(() => VORTEX.step(3, () => VORTEX.state.spikes[VORTEX.playerLane()] === 0));
    await up(k); await sleep(60); await E(() => VORTEX.step(0.3));
    let q = await E(() => ({ ct: VORTEX.cleanTube(), sp: VORTEX.state.spikes[VORTEX.playerLane()], m: VORTEX.messages() }));
    check(q.sp === 0 && q.ct.cuts === c0 + 1 && q.ct.left === 1, `${k}: firing cuts my lane's spike to the root (cuts ${c0}->${q.ct.cuts}, left ${q.ct.left})`);
    check(q.m.some(t => t === 'SPIKES LEFT: 1'), `${k}: pop "SPIKES LEFT: 1" (${q.m.join(' | ')})`);
    // cut the other one (step over, fire, step back) via the same input
    await E(() => { VORTEX.setLane(VORTEX.playerLane() + 1, 0); VORTEX.step(0.2); });
    if (k === 'mouse') { const p = await E(() => VORTEX.rimPoint(VORTEX.playerLane() + 0.5)); await page.mouse.move(p.x, p.y); await sleep(60); await E(() => VORTEX.step(0.2)); }
    const f1 = await E(() => VORTEX.shotsFired());
    await down(k);
    await page.waitForFunction(n => VORTEX.shotsFired() > n, f1, { timeout: 8000 }).catch(() => {});
    await E(() => VORTEX.step(3, () => VORTEX.cleanTube().left === 0));
    await up(k); await sleep(60); await E(() => VORTEX.step(0.2));
    q = await E(() => ({ ct: VORTEX.cleanTube(), m: VORTEX.messages() }));
    check(q.ct.left === 0 && q.m.some(t => t === 'TUBE CLEAN! NOW FINISH THEM'), `${k}: all spikes cut -> "TUBE CLEAN! NOW FINISH THEM" (left ${q.ct.left})`);
    // 3. last kill -> warp -> CLEAN TUBE bonus
    const w = await E(id => { window.__noWarp = false; const s0 = VORTEX.score(), n0 = VORTEX.cleanTube().n; VORTEX.kill(id, false); VORTEX.step(0.5, () => VORTEX.state.state === 'warp');
      return { state: VORTEX.state.state, d: VORTEX.score() - s0, ct: VORTEX.cleanTube(), n0, m: VORTEX.messages() }; }, st.id);
    const want = Math.min(3000, 250 + 150 * L);
    check(w.state === 'warp' && w.ct.n === w.n0 + 1 && w.ct.last && w.ct.last.clean && w.ct.last.pts === want, `${k}: warp with a clean tube pays CLEAN TUBE ${want} (n ${w.ct.n}, ${w.state})`);
    check(w.d >= want && w.d < want + 600, `${k}: score +${w.d} (fuseball kill + ${want})`);
    check(w.m.some(t => t === 'CLEAN TUBE! +' + want) && !w.m.includes('AVOID SPIKES'), `${k}: pop "CLEAN TUBE! +${want}", no AVOID SPIKES`);
    first = false;
  }
  // 4. a spike left -> no bonus, AVOID SPIKES as before; and the warp still kills on a spike in your lane
  let st = await setup(4);
  let r = await E(id => { VORTEX.setSpike(VORTEX.playerLane() + 3, 0.2); VORTEX.step(0.1); window.__noWarp = false; const s0 = VORTEX.score(); VORTEX.kill(id, false); VORTEX.step(0.5, () => VORTEX.state.state === 'warp');
    return { state: VORTEX.state.state, d: VORTEX.score() - s0, ct: VORTEX.cleanTube(), m: VORTEX.messages() }; }, st.id);
  check(r.state === 'warp' && r.ct.last && !r.ct.last.clean && r.ct.last.left === 1 && r.d < 600 && r.m.includes('AVOID SPIKES'), `spike left: no bonus (+${r.d}), AVOID SPIKES shown, last ${JSON.stringify(r.ct.last)}`);
  // 5. no spikes laid at all -> no bonus, no hint
  st = await setup(4);
  r = await E(id => { VORTEX.step(0.2); const hint = VORTEX.cleanTube().hint; window.__noWarp = false; const s0 = VORTEX.score(), n0 = VORTEX.cleanTube().n; VORTEX.kill(id, false); VORTEX.step(0.5, () => VORTEX.state.state === 'warp');
    return { hint, state: VORTEX.state.state, d: VORTEX.score() - s0, dn: VORTEX.cleanTube().n - n0 }; }, st.id);
  check(r.state === 'warp' && !r.hint && r.dn === 0 && r.d < 600, `no spikes laid: no hint, no bonus (+${r.d})`);
  // 6. real spiker: spikes it lays count as laid
  st = await setup(6);
  r = await E(() => { const id = VORTEX.spawn('spiker', (VORTEX.playerLane() + 2) % VORTEX.webInfo().n, 1); VORTEX.step(1.5); return { laid: VORTEX.cleanTube().laid, left: VORTEX.cleanTube().left }; });
  check(r.laid && r.left >= 1, `a real spiker's spikes count (laid ${r.laid}, lanes ${r.left})`);
  // 7. pulsing tips draw without errors on live frames
  await E(() => { window.__noWarp = true; VORTEX.freeze(false); }); await sleep(600); await E(() => VORTEX.freeze(true));
  const rep = await E(() => VORTEX.runReport());
  check(/CLEAN TUBES \d+/.test(rep.lines.extra), `RUN REPORT lists them: "${rep.lines.extra}"`);
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
