// VORTEX Day 6 (2026-11-02): WARP TOKENS + BONUS WARP (Tempest 2000 bonus round). Desktop (keyboard, mouse, gamepad) + iPhone 14
// (touch spinner). Tokens from a clean level (no life lost, level 3+) and from 4th+ crystals, kept across deaths; 3 tokens open
// a gate round during the warp; perfect run pays big + extra life; misses cost the streak; no shooting, no deaths; then the
// normal warp flight to the next level.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-bonus.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137', SHOTS = process.argv[3];
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = () => {
  window.__padX = 0;
  const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', get axes() { return [window.__padX, 0, 0, 0]; }, timestamp: 0,
    get buttons() { return Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); } };
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
  const toPlay = () => E(() => VORTEX.step(12, () => VORTEX.state.state === 'play'));
  await E(() => { window.__noPups = true; window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(3); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); VORTEX.setLane(3, 0); VORTEX.setAuto(false); });
  // 1. clean level 3 -> EXCELLENT + token
  let r = await E(() => { const b0 = VORTEX.bonus(); VORTEX.clearLevel(); VORTEX.step(0.05); return { b0, b: VORTEX.bonus(), m: VORTEX.messages(), st: VORTEX.state.state }; });
  check(r.b0.tokens === 0 && r.b.tokens === 1 && r.m.some(x => /EXCELLENT/.test(x)) && r.st === 'warp' && !r.b.active, `clean level -> EXCELLENT + WARP TOKEN 1/3 (no bonus yet): ${r.b.tokens}`);
  await toPlay();
  // 2. losing a life: no token for that level, but tokens already earned are kept
  r = await E(() => { VORTEX.emptyField(); VORTEX.addEShot(VORTEX.playerLane(), 0.03); VORTEX.step(0.5); const dying = VORTEX.state.state; VORTEX.step(10, () => VORTEX.state.state === 'play'); VORTEX.emptyField();
    const kept = VORTEX.bonus().tokens; VORTEX.clearLevel(); VORTEX.step(0.05); return { dying, kept, after: VORTEX.bonus().tokens, clean: VORTEX.bonus().clean }; });
  check(r.dying === 'dying' && r.kept === 1 && r.after === 1, `a life lost: token kept (${r.kept}), no new token for that level (${r.after})`);
  await toPlay();
  // 3. third token -> BONUS WARP opens instead of the plain warp
  r = await E(() => { VORTEX.emptyField(); VORTEX.setTokens(2); const lv = VORTEX.state.level, lives = VORTEX.state.lives, sc = VORTEX.score(); VORTEX.clearLevel(); VORTEX.step(0.05); return { lv, lives, sc, b: VORTEX.bonus(), st: VORTEX.state.state, m: VORTEX.messages() }; });
  const lives0 = r.lives, sc0 = r.sc, lv0 = r.lv;
  check(r.st === 'warp' && r.b.active && r.b.tokens === 0 && r.b.b.gates.length === 16 && r.m.includes('BONUS WARP'), `3 tokens open the BONUS WARP (${r.b.b && r.b.b.gates.length} gates, tokens reset to ${r.b.tokens})`);
  const gl = r.b.b.gates, n = await E(() => VORTEX.webInfo().n), closed = await E(() => VORTEX.webInfo().closed);
  const steps = gl.slice(1).map((g, i) => { let d = Math.abs(g.lane - gl[i].lane); if (closed) d = Math.min(d, n - d); return d; });
  check(steps.every(d => d >= 1 && d <= 3) && gl.every(g => g.lane >= 0 && g.lane < n), `gate path moves 1-3 lanes per gate, always on the web (${steps.join(',')})`);
  // 4. real input steers the claw during the bonus (fire is off)
  const lane0 = await E(() => VORTEX.playerLane());
  if (touchDev) {
    const cdp = await ctx.newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
    await page.waitForFunction(() => { const k = document.getElementById('tknob'); return k && getComputedStyle(k).display !== 'none'; }, null, { timeout: 15000 }).catch(() => {});
    const kb = await page.locator('#tknob').boundingBox().catch(() => null);
    if (kb) { const sx = kb.x + kb.width / 2 - 50, sy = kb.y + kb.height / 2; await T('touchStart', [{ x: sx, y: sy, id: 1 }]); for (let i = 1; i <= 12; i++) { await T('touchMove', [{ x: sx + i * 9, y: sy, id: 1 }]); await sleep(16); } await T('touchEnd', []); }
    await E(() => VORTEX.step(0.05));
  } else {
    await page.keyboard.down('ArrowLeft'); await E(() => VORTEX.step(0.25)); await page.keyboard.up('ArrowLeft');
  }
  let lane1 = await E(() => VORTEX.playerLane());
  check(lane1 !== lane0, `${touchDev ? 'touch spinner drag' : 'arrow key'} steers the claw in the bonus (${lane0} -> ${lane1})`);
  if (!touchDev) {
    await page.mouse.move(200, 450); await sleep(50); await E(() => VORTEX.step(0.05)); const a = await E(() => VORTEX.playerLane());
    await page.mouse.move(1240, 450); await sleep(50); await E(() => VORTEX.step(0.3)); const b = await E(() => VORTEX.playerLane());
    check(a !== b, `mouse steers the claw in the bonus (${a} -> ${b})`);
    await E(() => { window.__padOn = true; window.__padX = 1; }); for (let i = 0; i < 5; i++) { await sleep(60); await E(() => VORTEX.step(0.06)); }
    const c = await E(() => { const l = VORTEX.playerLane(); window.__padX = 0; return l; }); await sleep(120); await E(() => { window.__padOn = false; });
    check(c !== b, `gamepad stick steers the claw in the bonus (${b} -> ${c})`);
  }
  r = await E(() => { VORTEX.key('Space', true); VORTEX.step(0.1); VORTEX.key('Space', false); return VORTEX.shotList().length; });
  check(r === 0, 'no shooting during the bonus warp');
  // 5. bot rides every gate -> PERFECT, extra life, then the normal warp to the next level
  r = await E(() => { let guard = 0; while (VORTEX.bonus().active && guard++ < 4000) { const b = VORTEX.bonus().b, g = b.gates.find(x => !x.res); if (g && g.z < 0.5) VORTEX.setLane(g.lane, 1); VORTEX.step(1 / 60); }
    return { s: VORTEX.bonus().stats, m: VORTEX.messages(), st: VORTEX.state.state }; });
  const gain = await E(() => VORTEX.score());
  check(r.s.last && r.s.last.passed === 16 && r.s.last.bestStreak === 16 && r.m.some(x => /PERFECT/.test(x)), `perfect run: ${r.s.last && r.s.last.passed}/16 gates, +${r.s.last && r.s.last.pts} gate points`);
  check(gain - sc0 >= 10000 + 16 * 250, `perfect run pays at least 14 000 (+${gain - sc0})`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/vortex-bonus-end-${touchDev ? 'iphone' : 'desktop'}.png` });
  r = await E(() => { VORTEX.step(12, () => VORTEX.state.state === 'play'); return { st: VORTEX.state.state, lv: VORTEX.state.level, lives: VORTEX.state.lives }; });
  check(r.st === 'play' && r.lv === lv0 + 1 && r.lives >= Math.min(6, lives0 + 1), `then warps on to level ${r.lv} with an extra life (plus any 20 000-point life) (${lives0} -> ${r.lives})`);
  // 6. second bonus, ignore the gates: misses, no life, and nothing kills the claw
  r = await E(() => { VORTEX.emptyField(); VORTEX.setTokens(3); const lives = VORTEX.state.lives; VORTEX.clearLevel(); let mid = null, guard = 0;
    while (VORTEX.bonus().active && guard++ < 4000) { VORTEX.step(1 / 60); if (!mid && VORTEX.bonus().b && VORTEX.bonus().b.passed + VORTEX.bonus().b.missed === 4) mid = 1; }
    const s = VORTEX.bonus().stats.last; VORTEX.step(12, () => VORTEX.state.state === 'play'); return { s, lives, after: VORTEX.state.lives, st: VORTEX.state.state }; });
  check(r.s.passed < 12 && r.after === r.lives && r.st === 'play', `ignoring the gates: ${r.s.passed}/16, no extra life (${r.lives} -> ${r.after}), survives to the next level`);
  // 7. mid-bonus screenshot for the visuals
  if (SHOTS) { await E(() => { VORTEX.emptyField(); VORTEX.setTokens(3); VORTEX.clearLevel(); VORTEX.step(3.2); }); await sleep(300); await page.screenshot({ path: `${SHOTS}/vortex-bonus-${touchDev ? 'iphone' : 'desktop'}.png` }); }
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } }, false);
  await suite(browser, 'iPhone 14', { ...devices['iPhone 14'] }, true);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
