// VORTEX Day 2 (2026-10-29): incoming-shot lane warning + death-cause tips. Desktop + iPhone, no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-tips.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function suite(browser, label, ctxOpts) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  const clear = () => page.evaluate(() => { for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true }); VORTEX.step(1 / 60); });
  await page.evaluate(() => { window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(1); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setLane(3, 0); });
  await clear();
  let w = await page.evaluate(() => { VORTEX.addEShot(VORTEX.playerLane(), 0.8); VORTEX.step(1 / 120); return VORTEX.shotWarn(); });
  check(w === 0, `no warning while the shot is far down the tube (warn ${w})`);
  w = await page.evaluate(() => { const n = VORTEX.webInfo().n; VORTEX.addEShot((VORTEX.playerLane() + 2) % n, 0.15); VORTEX.step(1 / 120); return VORTEX.shotWarn(); });
  check(w === 0, `no warning for a close shot in another lane (warn ${w})`);
  await sleep(150); const base = await page.evaluate(() => VORTEX.shotWarnFrames());
  w = await page.evaluate(() => { VORTEX.addEShot(VORTEX.playerLane(), 0.12); VORTEX.step(1 / 120); return VORTEX.shotWarn(); });
  await page.waitForFunction(b => VORTEX.shotWarnFrames() >= b + 2, base, { timeout: 8000 }).catch(() => {}); const lit = await page.evaluate(() => VORTEX.shotWarnFrames());
  check(w > 0.5, `close shot in the claw's lane raises the warning (warn ${w.toFixed(2)})`);
  const st2 = await page.evaluate(() => [VORTEX.state.state, VORTEX.shotWarn(), VORTEX.state.paused]);
  check(lit - base >= 2, `the warning is drawn while it applies (${lit - base} frames; ${st2})`);
  // death tips (first two deaths by enemy shot)
  for (let k = 1; k <= 2; k++) {
    const r = await page.evaluate(() => {
      for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true });
      VORTEX.setInvincible(false); VORTEX.addEShot(VORTEX.playerLane(), 0.01); VORTEX.step(0.1);
      const kind = VORTEX.deathKind(); VORTEX.step(6, () => VORTEX.state.state !== 'dying');
      return { kind, m: VORTEX.messages(), lives: VORTEX.state.lives };
    });
    check(r.kind === 'shot' && r.m.includes('HIT BY AN ENEMY SHOT') && r.m.some(t => /SHOOT IT OR STEP ASIDE/.test(t)), `death ${k}: cause + tip shown (${r.kind}; ${r.m.join(' / ')})`);
    await page.evaluate(() => VORTEX.step(4, () => VORTEX.state.state === 'play'));
  }
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900', { viewport: { width: 1440, height: 900 } });
  await suite(browser, 'iPhone 14', devices['iPhone 14']);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
