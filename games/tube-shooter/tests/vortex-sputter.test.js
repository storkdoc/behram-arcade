// VORTEX 2026-11-09: SPUTTER FIRE + barrel-heat feedback. An overheated barrel used to go silent for ~0.5 s; most bot deaths
// to enemy shots happened in that window. Now, while hot, held fire still spits one weak orange shot every 0.3 s (no extra
// heat, no laser) that can still kill an enemy shot in your lane; the claw glows orange as heat builds, a hiss plays and a
// one-time tip shows. Held fire still cannot build a wall: the on-screen cap and the overall rate stay limited.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-sputter.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
let fails = 0; const check = (ok, l) => { console.log((ok ? 'PASS ' : 'FAIL ') + l); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14']) {
    console.log(`\n=== ${dev} ===`);
    const ctx = await b.newContext(dev === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] });
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(BASE + '/games/tube-shooter/', { waitUntil: 'load' }); await pg.waitForTimeout(800);
    const r = await pg.evaluate(() => {
      const V = VORTEX; V.freeze(true); V.setAuto(false); V.gotoLevel(4); V.step(4, () => V.state.state === 'play'); V.setLives(5);
      // keep the level alive with one far-end decoy pinned out of firing range (an empty field would end the level -> warp)
      let decoy = null; const pin = () => { if (!V.enemyList().some(e => e.id === decoy)) { V.emptyField(); decoy = V.spawn('flipper', V.playerLane() + 4, 0.99); } V.setEnemy(decoy, { z: 0.99, dead: false }); };
      const stepP = (sec, until) => { const n = Math.round(sec * 120); for (let i = 0; i < n; i++) { pin(); V.step(1 / 120, null, true); if (until && until()) break; } };
      pin();
      const out = { fires: [], heatAtSputter: [] };
      V.key('Space', true);
      let t = 0, lastShots = V.fire().sputter, hotSeen = false, glowT = null, preHeat = 0;
      // 1) hold fire for 3 s: count shots per state
      const before = V.fire(); let fired = 0, hotFired = 0;
      for (let i = 0; i < 360; i++) {
        const f0 = V.fire(); stepP(1 / 120); const f1 = V.fire(); t += 1 / 120;
        if (f1.overheat) hotSeen = true;
        if (f1.sputter > f0.sputter) { hotFired++; out.heatAtSputter.push(+(f1.heat - f0.heat).toFixed(3)); }
      }
      const held = V.fire();
      V.key('Space', false); stepP(1.5);
      // 2) put the claw in a hot state with an enemy shot 0.2 down its lane: a sputter shot must still kill it
      V.key('Space', true); stepP(0.9, () => V.fire().overheat); const hotNow = V.fire().overheat;
      V.emptyField(); pin(); V.addEShot(V.playerLane(), 0.12);   // no own shots still in flight: only a new (sputter) shot can save the claw
      const lives0 = V.state.lives; stepP(0.6); const after = V.eshotList().length, lives1 = V.state.lives, st2 = V.state.state;
      V.key('Space', false); V.render && V.render();
      return { state: V.state.state, hotSeen, hotFired, maxHeatDelta: Math.max(0, ...out.heatAtSputter), overheats: held.overheats, tip: held.tip, hotNow, after, lives0, lives1, st2 };
    });
    check(r.hotSeen && r.overheats >= 1, `${dev}: holding fire still overheats (${r.overheats} overheats in 3 s)`);
    check(r.hotFired >= 2 && r.hotFired <= 8, `${dev}: while hot the barrel sputters single shots, not a stream (${r.hotFired} sputter shots in 3 s)`);
    check(r.maxHeatDelta <= 0, `${dev}: sputter shots add no heat (max heat change at a sputter ${r.maxHeatDelta})`);
    check(r.tip && r.state === 'play', `${dev}: one-time BARREL HOT tip shown (state ${r.state})`);
    check(r.hotNow && r.after === 0 && r.lives1 === r.lives0 && r.st2 === 'play', `${dev}: an overheated claw still shoots down an enemy shot already near the rim (hot ${r.hotNow}, eshots left ${r.after}, lives ${r.lives0}->${r.lives1}, state ${r.st2})`);
    // glow is drawn: render one frame while hot and compare orange pixels near the claw
    const px = await pg.evaluate(() => { const V = VORTEX; V.key('Space', true); V.step(0.9, () => V.fire().overheat); const c = document.querySelector('canvas'); const g = c.getContext('2d'); let n = 0; for (let f = 0; f < 4 && V.fire().overheat; f++) { V.step(1 / 60); const d = g.getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 220 && d[i + 1] > 60 && d[i + 1] < 170 && d[i + 2] < 90) k++; n = Math.max(n, k); } V.key('Space', false); return { n, hot: V.fire().overheat }; });
    check(px.n > 20, `${dev}: overheated claw glows orange on screen (${px.n} orange samples)`);
    check(!errs.length, `${dev}: no console/page errors ${errs.slice(0, 3).join(' | ')}`);
    if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/sputter-${dev.replace(/\s/g, '')}.png` });
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
