// VORTEX 2026-11-08: CONTINUE. After GAME OVER on level >= 3 (and after any high-score initials) a 9-second countdown offers
// to carry on from the level you died on with 3 lives and the score reset to 0. Checks keyboard (Space / Enter, with a short
// lock against a held-fire accident), Esc and the countdown running out (-> attract), no offer below level 3, the high-score
// table is filled before the score resets, iPhone tap (data-ts=menu so ← ARCADE stays visible), gamepad A, no page errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-continue.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// play level L, lose the last life to an enemy shot, run GAME OVER out (4 s) -> continue offer / initials / attract
const dieOn = (pg, L, extraScore = 0) => pg.evaluate(({ L, extraScore }) => {
  const V = VORTEX; V.freeze(true); V.setAuto(false); V.gotoLevel(L); V.step(4, () => V.state.state === 'play');
  if (extraScore) V.addScore(extraScore); V.setLives(1);
  V.addEShot(V.playerLane(), 0.02); V.step(8, () => V.state.state === 'gameover');
  const go = V.state.state; V.step(4.2, () => V.state.state !== 'gameover');
  return { go, after: V.state.state, cont: V.cont() };
}, { L, extraScore });
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14']) {
    console.log(`\n=== ${dev} ===`);
    const ctx = await browser.newContext(dev === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] });
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.addInitScript(() => { try { localStorage.removeItem('vortex.hiscores'); } catch (e) {} });
    await pg.goto(BASE + '/games/tube-shooter/', { waitUntil: 'load' }); await sleep(800);
    let r = await dieOn(pg, 6);
    check(r.go === 'gameover' && r.after === 'continue' && r.cont.level === 6, `${dev}: GAME OVER on level 6 offers CONTINUE (${r.go} -> ${r.after}, level ${r.cont.level})`);
    await pg.evaluate(() => VORTEX.step(0.6)); await sleep(150);
    const shot = await pg.evaluate(() => ({ ts: document.body.dataset.ts, back: (() => { const b = document.getElementById('back'); return b ? getComputedStyle(b).display : 'none'; })() }));
    if (dev === 'desktop') {
      await pg.keyboard.press('Space'); await sleep(150);
    } else {
      check(shot.ts === 'menu' && shot.back !== 'none', `iPhone: continue screen is a menu screen with ← ARCADE visible (ts=${shot.ts}, back=${shot.back})`);
      const c = await pg.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.45 }; });
      await pg.touchscreen.tap(c.x, c.y); await sleep(200);
    }
    r = await pg.evaluate(() => { VORTEX.step(3, () => VORTEX.state.state === 'play'); const s = VORTEX.state; return { st: s.state, level: s.level, lives: s.lives, score: s.score, cont: VORTEX.cont() }; });
    check(['zoom', 'play'].includes(r.st) && r.level === 6 && r.lives === 3 && r.score === 0 && r.cont.used === 1, `${dev}: ${dev === 'desktop' ? 'Space' : 'tap'} continues on level 6 with 3 lives and score 0 (${JSON.stringify({ st: r.st, level: r.level, lives: r.lives, score: r.score, used: r.cont.used })})`);
    if (dev === 'desktop') {
      // fire held/mashed straight into the offer is ignored for the first 0.35 s
      r = await dieOn(pg, 4);
      await pg.keyboard.press('Space'); await sleep(100);
      check(await pg.evaluate(() => VORTEX.state.state) === 'continue', 'desktop: a press in the first 0.35 s does not continue by accident');
      await pg.evaluate(() => VORTEX.step(0.5)); await pg.keyboard.press('Enter'); await sleep(100);
      r = await pg.evaluate(() => ({ st: VORTEX.state.state, level: VORTEX.state.level, used: VORTEX.cont().used }));
      check(r.level === 4 && r.used === 2 && r.st !== 'continue', `desktop: Enter continues too; continue count carries (${JSON.stringify(r)})`);
      r = await dieOn(pg, 5); await pg.evaluate(() => VORTEX.step(0.5)); await pg.keyboard.press('Escape'); await sleep(100);
      check(await pg.evaluate(() => VORTEX.state.state) === 'attract', 'desktop: Esc declines -> attract');
      r = await dieOn(pg, 7); const left = await pg.evaluate(() => { VORTEX.step(9.3); return VORTEX.state.state; });
      check(r.after === 'continue' && left === 'attract', `desktop: countdown running out -> attract (${left})`);
      r = await dieOn(pg, 2);
      check(r.after === 'attract', `desktop: no CONTINUE below level 3 (${r.after})`);
      // a high score is entered first, then the offer; the table keeps the score after the continue resets it
      r = await dieOn(pg, 8, 61000);
      check(r.after === 'initials', `desktop: high score goes to initials first (${r.after})`);
      for (const k of ['KeyQ', 'KeyA', 'KeyZ', 'Enter']) { await pg.keyboard.press(k); await sleep(60); }
      r = await pg.evaluate(() => ({ st: VORTEX.state.state, top: VORTEX.hiscores()[0], lvl: VORTEX.cont().level }));
      check(r.st === 'continue' && r.lvl === 8 && r.top[0] === 'QAZ' && r.top[1] >= 61000, `desktop: after initials the CONTINUE offer appears, score saved (${JSON.stringify(r)})`);
      // gamepad A continues
      await pg.evaluate(() => { VORTEX.step(0.5); const btn = i => ({ pressed: i === 0, value: i === 0 ? 1 : 0 }); window.__pad = { id: 'test pad', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i)) }; navigator.getGamepads = () => [window.__pad]; });
      await pg.waitForFunction(() => VORTEX.state.state !== 'continue', null, { timeout: 5000 }).catch(() => {});
      r = await pg.evaluate(() => ({ st: VORTEX.state.state, level: VORTEX.state.level, score: VORTEX.state.score, lives: VORTEX.state.lives, held: VORTEX.haptics().padHeld, t: VORTEX.cont().t }));
      check(r.st !== 'continue' && r.level === 8 && r.score === 0 && r.lives === 3, `desktop: gamepad A continues on level 8 (${JSON.stringify(r)})`);
    }
    check(!errs.length, `${dev}: no console/page errors ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
