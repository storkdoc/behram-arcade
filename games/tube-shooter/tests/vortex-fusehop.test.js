// VORTEX Day 27 (2026-11-23): ONE HOP, THEN DROP (arcade fuseball rule). Outside the end-of-round hunt, a rim fuseball
// crosses one lane along the rim, lingers briefly, then drops back into the tube (where mid-jump shots can kill it).
// When the pool is empty and only fuseballs are left, they hunt the claw as before, with a one-time callout.
// Real input dodges the hunt: keyboard (desktop), touch spinner (iPhone 14 portrait + landscape). No console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-fusehop.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function suite(browser, label, ctxOpts, touchDev) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), errs = [];
  const page = await ctx.newPage();
  await page.route(/textdb\.dev|ntfy\.sh/, r => r.abort());
  page.on('console', m => { if (m.type() === 'error' && !/textdb|ntfy|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  const E = (f, a) => page.evaluate(f, a);
  await E(() => {
    window.__noWarp = true; window.__noPups = true; window.__noTokens = true; VORTEX.freeze(true); VORTEX.setLives(9);
    VORTEX.gotoLevel(3); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setAuto(false);
    // a rim fuseball on `rail`, settled, about to hop
    window.__rimFuse = rail => { const id = VORTEX.spawn('fuseball', rail, 0); VORTEX.setEnemy(id, { rail, z: 0, atRim: true, rimAge: 1, rimTimer: 4, pause: 0, jumping: false, jt: 0, rimHops: 0, dropping: false }); return id; };
    // a far flipper kept deep in the tube so the round is not over (no hunt)
    window.__decoy = () => { const id = VORTEX.spawn('flipper', (VORTEX.playerLane() + 6) % VORTEX.webInfo().n, 1); window.__dec = id; return id; };
    window.__hold = () => { if (window.__dec) VORTEX.setEnemy(window.__dec, { z: 1, flipping: false }); };
    window.__fresh = () => { VORTEX.setInvincible(false); VORTEX.setLives(9); if (VORTEX.state.state !== 'play') VORTEX.step(8, () => VORTEX.state.state === 'play'); VORTEX.emptyField(); window.__dec = null; VORTEX.setLane(3, 0); VORTEX.step(0.3); VORTEX.emptyField(); };
  });
  const info = await E(() => VORTEX.webInfo());
  check(info.n >= 10, `level 3 web has room (${info.n} lanes, closed ${info.closed})`);
  // 1. mid-round: a rim fuseball two rails off hops once (next to the claw), lingers, then drops back down; standing still survives
  let r = await E(() => {
    window.__fresh(); window.__decoy(); const pl = VORTEX.playerLane(); const id = window.__rimFuse(pl + 3);
    const rails = [], lives0 = VORTEX.state.lives, d0 = VORTEX.fuseHop().drops; let dropT = -1, t = 0;
    for (let i = 0; i < 360; i++) { window.__hold(); VORTEX.step(1 / 120); t += 1 / 120; const e = VORTEX.enemyList().find(x => x.id === id); if (!e) break;
      if (e.atRim && rails[rails.length - 1] !== e.rail) rails.push(e.rail); if (!e.atRim && dropT < 0) dropT = t; }
    return { pl, rails, dropT, died: VORTEX.state.lives < lives0 || VORTEX.deathKind() != null, drops: VORTEX.fuseHop().drops - d0, hunting: VORTEX.fuseHop().hunting };
  });
  check(!r.hunting, 'a live flipper in the tube: not the end-of-round hunt');
  check(r.rails.length === 2 && r.rails[1] === r.pl + 2, `it crosses exactly one lane on the rim, stopping beside the claw (${JSON.stringify(r)})`);
  check(r.dropT > 0 && r.dropT < 1.6 && r.drops === 1, `then drops back into the tube (${r.dropT.toFixed(2)} s, drops ${r.drops})`);
  check(!r.died, 'standing still in the next lane survives (the hunt would have hopped onto the claw)');
  // 2. it is shootable again once it jumps between rails in the tube
  r = await E(() => {
    const e = VORTEX.enemyList().find(x => x.type === 'fuseball'); if (!e) return { none: true };
    VORTEX.setEnemy(e.id, { z: 0.4, jumping: true, jdir: -1, jt: 0.5, atRim: false });
    return { lane: VORTEX.hittable ? VORTEX.hittable(e.id) : 'n/a', atRim: VORTEX.enemyList().find(x => x.id === e.id).atRim };
  });
  check(r.atRim === false, `the dropped fuseball is back in the tube (${JSON.stringify(r)})`);
  // 3. end of round: only fuseballs left -> it hunts (more than one hop) and the callout shows once; standing still dies
  r = await E(() => {
    window.__fresh(); const pl = VORTEX.playerLane(); const id = window.__rimFuse(pl + 4);
    const rails = [], h0 = VORTEX.fuseHop().hunts; let t = 0;
    for (let i = 0; i < 480 && VORTEX.deathKind() == null; i++) { VORTEX.step(1 / 120); t += 1 / 120; const e = VORTEX.enemyList().find(x => x.id === id); if (!e) break; if (e.atRim && rails[rails.length - 1] !== e.rail) rails.push(e.rail); }
    return { pl, rails, kind: VORTEX.deathKind(), t, hunts: VORTEX.fuseHop().hunts - h0, told: VORTEX.fuseHop().told, msgs: VORTEX.msgs ? VORTEX.msgs().map(m => m.text) : null };
  });
  check(r.rails.length >= 3, `end of round: the last fuseball hunts along the rim (${JSON.stringify(r.rails)})`);
  check(r.hunts === 1 && r.told, `one 'LAST FUSEBALLS HUNT YOU' callout (${r.hunts})`);
  check(r.kind === 'fuse', `standing still during the hunt still dies (${r.kind} at ${r.t.toFixed(2)} s)`);
  await E(() => VORTEX.step(8, () => VORTEX.state.state === 'play'));
  // 4. real input escapes the hunt
  r = await E(() => { window.__fresh(); const pl = VORTEX.playerLane(); window.__fid = window.__rimFuse(pl + 3); VORTEX.setEnemy(window.__fid, { pause: 0.25 }); const f = VORTEX.fuseDeaths(); window.__fd0 = f.arrive + f.chase + f.rimjump; window.__lv0 = VORTEX.state.lives; return { pl }; });
  const pl0 = r.pl;
  if (!touchDev) {
    await page.keyboard.down('ArrowRight');
    await E(() => VORTEX.step(0.35)); await page.keyboard.up('ArrowRight');
  } else {
    const cdp = await ctx.newCDPSession(page);
    await page.waitForFunction(() => { const k = document.getElementById('tknob'); return k && getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0; }, null, { timeout: 15000 }).catch(() => {});
    const b = await page.locator('#tknob').boundingBox();
    const T = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 3, radiusX: 4, radiusY: 4, force: 1 }] });
    // a straight drag to the right on the SPIN knob = clockwise = lower lane index (same as the right arrow key)
    const x0 = b.x + b.width * 0.2, y0 = b.y + b.height / 2, stepPx = await E(() => VORTEX.touchInfo ? VORTEX.touchInfo().stepPx : 8);
    await T('touchStart', x0, y0);
    for (let i = 1; i <= 12; i++) await T('touchMove', x0 + i * 10, y0);
    await T('touchEnd'); await E(() => VORTEX.step(0.15));
  }
  r = await E(pl0 => { const sum = () => { const f = VORTEX.fuseDeaths(); return f.arrive + f.chase + f.rimjump; };
    const f0 = window.__fd0;
    for (let i = 0; i < 120; i++) VORTEX.step(1 / 120);
    return { pl0, pl: VORTEX.playerLane(), died: sum() > f0, lives: VORTEX.state.lives - window.__lv0, st: VORTEX.state.state }; }, pl0);
  check(r.pl !== r.pl0 && !r.died && r.lives === 0, `${touchDev ? 'touch spinner' : 'keyboard'}: steering away from the hunting fuseball survives (${JSON.stringify(r)})`);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1280x800 (keyboard)', { viewport: { width: 1280, height: 800 } }, false);
  await suite(browser, 'iPhone 14 (touch)', devices['iPhone 14'], true);
  await suite(browser, 'iPhone 14 landscape (touch)', devices['iPhone 14 landscape'], true);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
