// VORTEX day 21 (2026-11-17): KILL CAM. When a life is lost, the killer is frozen inside red lock-on brackets with
// "KILLED BY <NAME>" for the death sequence. Checks, per cause (enemy shot, rim grab, fuseball, pulsar zap, mine, spark,
// warp spike): the right label + lane, brackets + label drawn and fully on screen, a grab reads "GRABBED BY" while the
// claw is dragged (BREAK FREE still offered and still works), the cam stops after KILLCAM_SEC, no gameplay change (the
// same cause still costs the life), desktop + iPhone 14 (+ landscape), no console errors. Screenshots go to $SHOTS.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-killcam.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const SHOTS = process.env.SHOTS || require('os').tmpdir();
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RUN = ({ kind, L }) => {
  const V = VORTEX; window.__noWarp = true; window.__noTokens = true; window.__noPups = true; V.freeze(true); V.setLives(9);
  if (V.setAuto) V.setAuto(false);
  V.setInvincible(true); V.gotoLevel(L || 9); V.step(4, () => V.state.state === 'play', true); V.emptyField(); V.setLane(4, 0); V.step(1 / 60, null, true);
  const pl = V.playerLane(); let id = null;
  V.setInvincible(false);
  if (kind === 'shot') V.addEShot(pl, 0.03);
  else if (kind === 'capture') { id = V.spawn('flipper', pl, 0); V.setEnemy(id, { z: 0, atRim: true, spawnT: 1, landT: 0, flipping: false }); }
  else if (kind === 'fuse') { id = V.spawn('fuseball', pl, 0); V.setEnemy(id, { z: 0, atRim: true, rail: pl, rimAge: 1, rimTimer: 9, pause: 0, jumping: false, spawnT: 1 }); }
  else if (kind === 'zap') { id = V.spawn('pulsar', pl, 0.3); V.setEnemy(id, { pause: 99, flipping: false, z: 0.3, spMul: 0 }); }
  else if (kind === 'mine') V.addMine(pl, 0.02, false);
  else if (kind === 'spark') { id = V.spawn('spark', pl, 0.02); V.setEnemy(id, { z: 0.005, x: pl + 0.5, lane: pl, spawnT: 1 }); }
  const before = V.killCam().shown;
  for (let i = 0; i < 1200 && V.state.state === 'play'; i++) { V.step(1 / 120, null, true); if (kind === 'zap' && id != null) V.setEnemy(id, { pause: 99, flipping: false, z: 0.3 }); }
  const st = V.state.state, dk = V.deathKind();
  V.step(0.15, null, true); V.step(0);   // let the brackets snap in, then render one frame
  const k1 = V.killCam(); const bf = V.breakFree ? V.breakFree() : null;
  return { pl, st, dk, shown: k1.shown - before, cur: k1.cur, active: k1.active, W: k1.W, H: k1.H, sec: k1.sec, bfCan: bf && bf.can };
};
const AFTER = () => { const V = VORTEX; const d0 = V.killCam().cur ? V.killCam().cur.drawn : 0; V.step(VORTEX.killCam().sec, () => V.state.state !== 'dying', true); V.step(0); const k = V.killCam(); return { st: V.state.state, active: k.active, drawnAfter: k.cur ? k.cur.drawn - d0 : 0 }; };
const onScreen = (s, W, H) => s && s.x > 0 && s.x < W && s.y > 0 && s.y < H && s.lx - (s.name.length * s.sz) / 2 >= 0 && s.lx + (s.name.length * s.sz) / 2 <= W && s.ly - s.sz * 1.6 >= 0 && s.ly + s.sz <= H;
const LABEL = { shot: 'ENEMY SHOT', capture: 'GRABBER', fuse: 'FUSEBALL', zap: 'PULSAR', mine: 'MINE', spark: 'SPARK' };
async function suite(b, dev, ctxOpts) {
  console.log('\n===', dev, '==='); const errs = [];
  const ctx = await b.newContext(ctxOpts); const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX); await sleep(500);
  for (const kind of ['shot', 'capture', 'fuse', 'zap', 'mine', 'spark']) {
    const r = await pg.evaluate(RUN, { kind, L: kind === 'mine' ? 10 : 9 });
    const want = kind === 'capture' ? 'capture' : kind;
    check(r.st === 'dying' && r.dk === want && r.shown === 1, `${dev}: ${kind} still kills (${r.dk}) and opens one kill cam`, { st: r.st, dk: r.dk, shown: r.shown });
    check(r.cur && r.cur.label === LABEL[kind] && (kind === 'spark' || r.cur.lane === r.pl), `${dev}: ${kind} labelled ${r.cur && r.cur.label}${r.cur && r.cur.sub ? ': ' + r.cur.sub : ''}, lane ${r.cur && r.cur.lane} (claw ${r.pl})`);
    check(r.active && r.cur && r.cur.drawn > 0 && onScreen(r.cur.scr, r.W, r.H), `${dev}: ${kind} brackets + label drawn on screen`, r.cur && r.cur.scr);
    if (kind === 'capture') {
      check(r.cur.sub === 'FLIPPER' && r.cur.scr.name === 'FLIPPER' && r.cur.scr.head === 'GRABBED BY' && r.bfCan, `${dev}: grab reads GRABBED BY: FLIPPER while BREAK FREE is offered`, { head: r.cur.scr.head, bf: r.bfCan });
      if (kind === 'capture' && dev === 'desktop') await pg.screenshot({ path: `${SHOTS}/vortex-killcam-grab-${dev.replace(/ /g, '_')}.png` });
      const freed = await pg.evaluate(() => { const ok = VORTEX.tryBreakFree ? VORTEX.tryBreakFree() : null; VORTEX.step(0); return { ok, st: VORTEX.state.state, active: VORTEX.killCam().active }; });
      check(freed.st === 'play' && !freed.active, `${dev}: BREAK FREE still works and clears the kill cam`, freed);
      continue;
    }
    if (kind === 'fuse') await pg.screenshot({ path: `${SHOTS}/vortex-killcam-fuse-${dev.replace(/ /g, '_')}.png` });
    const a = await pg.evaluate(AFTER);
    check(!a.active && a.drawnAfter <= 1, `${dev}: ${kind} kill cam ends after ${r.sec}s`, a);
  }
  // warp spike: fly the warp into a spike
  const sp = await pg.evaluate(() => {
    const V = VORTEX; window.__noWarp = false; V.setInvincible(true); V.gotoLevel(9); V.step(4, () => V.state.state === 'play', true); V.emptyField(); V.setLane(4, 0);
    V.setSpikes(0); V.setSpike(V.playerLane(), 0.9); V.setInvincible(false); const b0 = V.killCam().shown;
    V.step(12, () => V.state.state === 'dying', true); V.step(0.1, null, true); V.step(0);
    const k = V.killCam(); return { st: V.state.state, dk: V.deathKind(), shown: k.shown - b0, cur: k.cur, W: k.W, H: k.H };
  });
  check(sp.dk === 'spike' && sp.shown === 1 && sp.cur && sp.cur.label === 'SPIKE', `${dev}: warp spike opens a SPIKE kill cam`, { st: sp.st, dk: sp.dk, cur: sp.cur && sp.cur.label });
  check(sp.cur && sp.cur.drawn > 0 && onScreen(sp.cur.scr, sp.W, sp.H), `${dev}: spike brackets + label on screen`, sp.cur && sp.cur.scr);
  check(errs.length === 0, `${dev}: no console errors` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(b, 'desktop', { viewport: { width: 1440, height: 900 } });
  await suite(b, 'iPhone 14', devices['iPhone 14']);
  await suite(b, 'iPhone 14 landscape', devices['iPhone 14 landscape']);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
