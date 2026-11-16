// VORTEX day 16 (2026-11-12): BREAK FREE. While a grabber drags the claw down the tube, the Superzapper (Enter /
// right click / ZAP button / gamepad) kills the captor and springs the claw back, spending the level's big zap.
// NODE_PATH=... node games/tube-shooter/tests/vortex-breakfree.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
// put a settled flipper on the rim in the claw's lane and let it grab
const GRAB = `(() => { const V = VORTEX; window.__noWarp = true; V.emptyField(); V.setInvincible(false); V.setLane(4, 0);
  const id = V.spawn('flipper', 4, 0); V.setEnemy(id, { z: 0, atRim: true, spawnT: 1, landT: 0, flipping: false });
  V.step(1, () => V.state.state === 'dying'); V.step(0.15); return { id, st: V.state.state, kind: V.deathKind(), bf: V.breakFree(), msgs: V.messages() }; })()`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14', 'iPhone 14 landscape']) {
    console.log('\n===', dev, '===');
    const touch = dev !== 'desktop';
    const opts = touch ? { ...devices[dev] } : { viewport: { width: 1440, height: 900 } };
    const ctx = await b.newContext(opts); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX);
    await pg.waitForTimeout(400);
    if (touch) { await pg.touchscreen.tap(200, 200); await pg.waitForTimeout(200); }
    await pg.evaluate(() => { const V = VORTEX; V.freeze(true); V.gotoLevel(6); V.step(3, () => V.state.state === 'play'); V.setLives(3); });
    // power-up held before the grab
    const pw0 = await pg.evaluate(() => { const V = VORTEX; window.__noWarp = true; V.emptyField(); V.setLane(4, 0); V.dropPup(4, 0.02); V.step(0.6); return V.power(); });
    const g1 = await pg.evaluate(GRAB);
    check(g1.st === 'dying' && g1.kind === 'capture', 'flipper grabs: claw is being dragged', { st: g1.st, kind: g1.kind });
    check(g1.bf.can && g1.bf.offers === 1, 'break-free is offered while the big zap is unused', g1.bf);
    check(g1.msgs.some(m => /BREAK FREE/.test(m)) && (!touch || g1.msgs.some(m => /TAP ZAP/.test(m))), 'prompt says how', g1.msgs);
    // the input: Enter on desktop, the ZAP button on touch
    if (touch) await pg.tap('#tzap'); else await pg.keyboard.press('Enter');
    await pg.waitForTimeout(80);
    const a1 = await pg.evaluate((id) => { const V = VORTEX; const r = { st: V.state.state, lives: V.state.lives, zap: V.state.zapUses, captor: V.enemy(id), bf: V.breakFree(), pw: V.power(), msgs: V.messages() };
      V.step(0.5); r.z2 = V.state.pz; r.grace2 = V.breakFree().grace; V.step(0.6); r.grace3 = V.breakFree().grace; return r; }, g1.id);
    check(a1.st === 'play' && a1.lives === 3, (touch ? 'ZAP button' : 'Enter') + ' breaks free: back in play, no life lost', { st: a1.st, lives: a1.lives });
    check(!a1.captor || a1.captor.dead, 'the captor is destroyed', a1.captor && { dead: a1.captor.dead });
    check(a1.zap === 1 && a1.bf.used === 1, 'it spends the big zap (small zap left)', { zap: a1.zap, bf: a1.bf });
    check(a1.bf.grace > 0.5 && a1.grace3 === 0, 'short grace after breaking free, then mortal again', { g: a1.bf.grace, g3: a1.grace3 });
    check(a1.z2 === 0, 'claw springs back to the rim', a1.z2);
    check(pw0.n === 0 || (a1.pw.laser === pw0.laser && a1.pw.jump === pw0.jump), 'power-ups survive a break-free', { before: pw0, after: { laser: a1.pw.laser, jump: a1.pw.jump } });
    check(a1.msgs.includes('BROKE FREE!'), 'BROKE FREE! message');
    // second grab on the same level (day 19): the small zap is still left, so it can break free once more, spending it
    const g2 = await pg.evaluate(GRAB);
    check(g2.st === 'dying' && g2.bf.can && g2.msgs.some(m => /LAST ZAP/.test(m)), 'second grab this level: offered again with the LAST zap', { bf: g2.bf, msgs: g2.msgs });
    if (!touch) await pg.keyboard.press('Enter'); else await pg.tap('#tzap');
    await pg.waitForTimeout(80);
    const a2 = await pg.evaluate(() => { const V = VORTEX; return { st: V.state.state, lives: V.state.lives, zap: V.state.zapUses, bf: V.breakFree() }; });
    check(a2.st === 'play' && a2.lives === 3 && a2.zap === 2 && a2.bf.lastZap === 1, 'the last zap breaks free too (both zaps now spent)', a2);
    if (touch) check(await pg.waitForFunction(() => document.getElementById('tzap').classList.contains('used'), null, { timeout: 8000 }).then(() => true, () => false), 'ZAP button greys out once both zaps are gone');
    // third grab on the same level: no zap left -> fatal
    await pg.evaluate(() => VORTEX.step(1.2));
    const g3x = await pg.evaluate(GRAB);
    check(g3x.st === 'dying' && !g3x.bf.can, 'third grab this level: no offer (both zaps spent)', g3x.bf);
    if (!touch) await pg.mouse.click(720, 450, { button: 'right' }); else await pg.tap('#tzap');
    const a3 = await pg.evaluate(() => { const V = VORTEX; V.step(4, () => V.state.state !== 'dying'); return { st: V.state.state, lives: V.state.lives, zap: V.state.zapUses }; });
    check(a3.lives === 2, 'with no zap left the capture still costs a life', a3);
    // new level restores the offer; too late (claw dragged past the window) cannot break free
    const g3 = await pg.evaluate(() => { const V = VORTEX; V.gotoLevel(7); V.step(3, () => V.state.state === 'play'); return 1; });
    const g4 = await pg.evaluate(GRAB);
    check(g4.bf.can, 'new level: offer is back', g4.bf);
    const late = await pg.evaluate(() => { const V = VORTEX; V.step(2, () => V.state.pz >= V.breakFree().windowZ); const can = V.breakFree().can; const ok = V.tryBreakFree();
      V.step(4, () => V.state.state !== 'dying'); return { can, ok, lives: V.state.lives, failed: V.breakFree().failed }; });
    check(!late.can && !late.ok && late.lives === 1, 'too late in the drag: cannot break free', late);
    check(late.failed >= 1, 'missed chances are counted', late.failed);
    if (!touch) {   // right click works as the break-free input too
      await pg.evaluate(() => { const V = VORTEX; V.setLives(3); V.gotoLevel(8); V.step(3, () => V.state.state === 'play'); });
      await pg.evaluate(GRAB);
      await pg.mouse.click(720, 450, { button: 'right' }); await pg.waitForTimeout(60);
      const rc = await pg.evaluate(() => ({ st: VORTEX.state.state, lives: VORTEX.state.lives }));
      check(rc.st === 'play' && rc.lives === 3, 'right click breaks free too', rc);
    }
    if (process.env.SHOTS) await pg.screenshot({ path: `${process.env.SHOTS}/breakfree-${dev.replace(/ /g, '_')}.png` });
    check(!errs.length, 'no console errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
