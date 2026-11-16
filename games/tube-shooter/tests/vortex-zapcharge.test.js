// VORTEX day 20 (2026-11-16): PULSAR CHARGE-UP. The old 'zapwarn' buzz played when the lane was already lethal. Checks: a
// pulsar in the claw's lane gives one 'zapcharge' cue at the START of the charge, at least 0.35 s before the lethal pulse
// (and >= 40 % of a normal 0.25-s reaction + move at every level 9-40); the rim charge bar fills; the safe neighbour lane
// is found; stepping aside after the cue survives the pulse, staying dies to 'zap'; a pulsar in another lane gives no cue;
// the STEP ASIDE label is drawn; desktop + iPhone 14 (+ landscape), no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-zapcharge.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fresh(browser, ctxOpts, errs) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(400);
  return { ctx, page };
}
// one scenario: pulsar in the claw's lane (or 4 lanes away); optionally step aside `aside` s after the cue.
// Returns times measured in game seconds from the same 1/120-s loop.
const RUN = ({ L, other, aside }) => {
  const V = VORTEX; window.__noWarp = true; window.__noTokens = true; window.__noPups = true; V.freeze(true); V.setLives(9);
  if (V.setAuto) V.setAuto(false);
  window.__txt = []; const f = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { if (window.__txt.length < 4000) window.__txt.push(String(s)); return f.call(this, s, ...a); };
  V.setInvincible(true); V.gotoLevel(L); V.step(4, () => V.state.state === 'play'); V.emptyField(); V.setLane(3, 0); V.step(1 / 60);
  const pl = V.playerLane(), id = V.spawn('pulsar', other ? pl + 4 : pl, 0.3);
  V.setEnemy(id, { pause: 99, flipping: false, z: 0.3, spMul: 0 });
  const tick = () => { V.step(1 / 120, null, true); V.clearEShots(); V.setEnemy(id, { pause: 99, flipping: false, z: 0.3 }); };
  for (let i = 0; i < 1200 && (V.zapWarn().pulseAmt > 0 || V.zapWarn().pulsing); i++) tick();   // start outside the charge
  V.setInvincible(false);
  const c0 = V.zapWarn().chargeCues; let t = 0, cueT = null, lethalT = null, died = null, progs = [], drew = false, safe = 0, moved = false;
  for (let i = 0; i < 1200; i++) {
    tick(); t += 1 / 120; const z = V.zapWarn();
    if (cueT === null && z.chargeCues > c0) { cueT = t; safe = z.safe; const d0 = z.drawn; V.step(0); drew = V.zapWarn().drawn > d0 && V.zapWarn().label === 'STEP ASIDE'; }
    if (cueT !== null && !z.pulsing) progs.push(z.prog);
    if (aside != null && cueT !== null && !moved && t - cueT >= aside) { moved = true; V.setLane(pl + (V.zapWarn().safe || safe || 1), 0); }
    if (lethalT === null && z.pulsing) lethalT = t;
    if (V.state.state !== 'play') { died = V.deathKind(); break; }
    if (lethalT !== null && t - lethalT > 0.6) break;
  }
  return { L, pl, cueT, lethalT, lead: cueT !== null && lethalT !== null ? +(lethalT - cueT).toFixed(3) : null, died, safe, drew, period: V.zapWarn().period,
    progUp: progs.every((p, i, a) => i === 0 || p >= a[i - 1] - 1e-9), progMax: Math.max(0, ...progs), cues: V.zapWarn().chargeCues - c0 };
};
async function suite(browser, label, ctxOpts) {
  console.log(`\n=== ${label} ===`);
  const errs = [];
  for (const L of [9, 20, 40]) {
    const { ctx, page } = await fresh(browser, ctxOpts, errs);
    const r = await page.evaluate(RUN, { L, other: false, aside: null });
    check(r.cueT !== null && r.cues === 1, `L${L}: one charge cue before the pulse`, r);
    check(r.lead !== null && r.lead >= 0.35, `L${L}: cue ${r.lead}s before the lethal pulse (>= 0.35 s; period ${r.period})`);
    check(r.died === 'zap', `L${L}: staying in the lane still dies to the zap`, { died: r.died });
    check(r.progUp && r.progMax > 0.9, `L${L}: rim charge bar fills to full (max ${r.progMax.toFixed(2)})`);
    check(r.drew && r.safe !== 0, `L${L}: STEP ASIDE label drawn, safe lane ${r.safe}`);
    await ctx.close();
  }
  for (const aside of [0.25]) {
    const { ctx, page } = await fresh(browser, ctxOpts, errs);
    const r = await page.evaluate(RUN, { L: 20, other: false, aside });
    check(r.died === null && r.lethalT !== null, `L20: stepping aside ${aside}s after the cue survives the pulse`, r);
    await ctx.close();
  }
  { const { ctx, page } = await fresh(browser, ctxOpts, errs);
    const r = await page.evaluate(RUN, { L: 9, other: true, aside: null });
    check(r.cues === 0 && r.died === null, 'no charge cue / death for a pulsar 4 lanes away', r);
    await ctx.close(); }
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } });
  await suite(browser, 'iPhone 14', devices['iPhone 14']);
  await suite(browser, 'iPhone 14 landscape', devices['iPhone 14 landscape']);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
