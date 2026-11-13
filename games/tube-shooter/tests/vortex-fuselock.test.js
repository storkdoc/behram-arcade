// VORTEX 2026-11-13: FUSEBALL LOCK-ON. While a fuseball in the tube is mid-jump across a lane (and so can be shot),
// cyan lock-on brackets + a lane glow are drawn, and a "lock" blip plays once per jump if the lane is the claw's or next
// to it. Window 10-90% of the hop. Rim fuseballs stay invulnerable. Desktop + iPhone 14, no console errors.
//   NODE_PATH=... node games/tube-shooter/tests/vortex-fuselock.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14']) {
    console.log('\n===', dev, '===');
    const ctx = await b.newContext(dev === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] });
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX); await pg.waitForTimeout(400);
    await pg.evaluate(() => { window.__noWarp = true; const V = VORTEX; V.freeze(true); V.setLives(9); V.gotoLevel(6); V.step(4, () => V.state.state === 'play'); V.setAuto(false); });
    const fresh = () => pg.evaluate(() => { const V = VORTEX; V.setInvincible(true); for (const e of V.enemyList()) V.setEnemy(e.id, { dead: true }); V.emptyField(); V.setLane(3, 0); V.step(1 / 60); });
    await fresh();
    // a fuseball deep in the tube on the claw's left rail, about to hop right across the claw's lane
    const r1 = await pg.evaluate(() => { const V = VORTEX, pl = V.playerLane(); const id = V.spawn('fuseball', pl, 0.5);
      V.setEnemy(id, { rail: pl, z: 0.5, atRim: false, jumping: true, jdir: 1, jt: 0.02, jumpDur: 0.32, mdir: -1, spawnT: 1 });
      const L0 = V.fuseLock(), before = V.fuseOpen(id); V.step(1 / 60); V.step(0.03); const L1 = V.fuseLock(); return { id, before, open: V.fuseOpen(id), L0, L1 }; });
    check(!r1.before && r1.open, 'fuseball becomes shootable once it is 10% into its hop');
    check(r1.L1.opens === r1.L0.opens + 1 && r1.L1.cues === r1.L0.cues + 1, 'one lock blip for a hop across the claw\'s lane ' + JSON.stringify(r1.L1));
    check(JSON.stringify(r1.L1.window) === '[0.1,0.9]', 'window is 10-90% of the hop');
    const fr0 = r1.L1.frames; await pg.waitForFunction(f => VORTEX.fuseLock().frames > f + 1, fr0, { timeout: 6000 }).catch(() => {});
    if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/fuselock-${dev.replace(/ /g, '_')}.png` });
    // keep it frozen mid-hop while the real renderer draws
    check((await pg.evaluate(() => VORTEX.fuseLock().frames)) > fr0, 'lock-on brackets are drawn while it is open');
    // shooting it while open kills it
    const r2 = await pg.evaluate(id => { const V = VORTEX; V.setEnemy(id, { jt: 0.3 }); const k0 = V.fuseLock().kills; window.__k = k0;
      for (let i = 0; i < 40 && V.enemy(id); i++) { V.setEnemy(id, { jt: 0.3, z: 0.5 }); V.firePress && V.firePress(); V.step(1 / 30); }
      return { gone: !V.enemy(id) || V.enemy(id).dead, kills: V.fuseLock().kills - k0 }; }, r1.id);
    if (!r2.gone) {   // no firePress hook: fire with the real input
      await pg.keyboard.down('Space'); await pg.evaluate(id => { for (let i = 0; i < 60 && VORTEX.enemy(id); i++) { VORTEX.setEnemy(id, { jt: 0.3, z: 0.5 }); VORTEX.step(1 / 30); } }, r1.id); await pg.keyboard.up('Space');
    }
    const r2b = await pg.evaluate(id => ({ gone: !VORTEX.enemy(id), kills: VORTEX.fuseLock().kills - window.__k }), r1.id);
    check(r2b.gone && r2b.kills === 1, 'a shot kills it inside the window ' + JSON.stringify(r2b));
    await fresh();
    // far hop (3+ lanes away): brackets, but no blip
    const r3 = await pg.evaluate(() => { const V = VORTEX, pl = V.playerLane(); const rail = (pl + 5) % V.webInfo().n; const id = V.spawn('fuseball', rail, 0.5);
      V.setEnemy(id, { rail, z: 0.5, atRim: false, jumping: true, jdir: 1, jt: 0.02, jumpDur: 0.32, mdir: -1, spawnT: 1 });
      const L0 = V.fuseLock(); V.step(0.05); const L1 = V.fuseLock(); return { open: V.fuseOpen(id), d: L1.opens - L0.opens, c: L1.cues - L0.cues }; });
    check(r3.open && r3.d === 1 && r3.c === 0, 'a hop far from the claw is marked but silent ' + JSON.stringify(r3));
    await fresh();
    // rim fuseball: never open, still invulnerable
    const r4 = await pg.evaluate(() => { const V = VORTEX, pl = V.playerLane(); const rail = (pl + 4) % V.webInfo().n; const id = V.spawn('fuseball', rail, 0);
      V.setEnemy(id, { rail, z: 0, atRim: true, rimAge: 1, rimTimer: 5, pause: 0.01, jumping: true, jdir: 1, jt: 0.5, jumpDur: 0.42, spawnT: 1 }); return V.fuseOpen(id); });
    check(r4 === false, 'a fuseball hopping on the rim is never shootable (arcade rule kept)');
    // the death tip names the cue
    const tip = await pg.evaluate(() => { const V = VORTEX; V.setInvincible(false); return 1; });
    check(errs.length === 0, 'no console errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
