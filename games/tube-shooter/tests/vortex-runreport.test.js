// VORTEX day 18 (2026-11-14): RUN REPORT on GAME OVER. The final life's cause used to be invisible (finishDeath went
// straight to GAME OVER) and GAME OVER was a bare 4-s title. Checks: a real game started from the ladder (Space), deaths
// by shot / grab / shot, the report's final cause, levels, lives-lost tally, top killer + tip, kills, NEW BEST LEVEL; the
// screen lasts up to 8 s, can be skipped after 1.2 s by Space (desktop), tap (iPhone) and gamepad A; the next game resets
// the report; no console errors. Screenshots go to $SHOTS (default /tmp).
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-runreport.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const SHOTS = process.env.SHOTS || require('os').tmpdir();
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// lose a life to a shot in the claw's lane, or to a rim grab (big zap unused, so BREAK FREE is offered but not taken)
const DIE = kind => `(() => { const V = VORTEX; window.__noWarp = true; V.step(6, () => V.state.state === 'play'); V.emptyField(); V.setInvincible(false); V.setLane(4, 0);
  if (${JSON.stringify(kind)} === 'shot') V.addEShot(V.playerLane(), 0.02);
  else { const id = V.spawn('flipper', 4, 0); V.setEnemy(id, { z: 0, atRim: true, spawnT: 1, landT: 0, flipping: false }); }
  V.step(8, () => V.state.state === 'zoom' || V.state.state === 'gameover'); return { st: V.state.state, lives: V.state.lives, r: V.runReport() }; })()`;
const START = async (pg, touch) => {
  await pg.evaluate(() => { const V = VORTEX; V.freeze(false); });
  for (let i = 0; i < 2; i++) {
    if (touch && i === 0) { const c = await pg.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.45 }; }); await pg.touchscreen.tap(c.x, c.y); }
    else if (touch) { await pg.waitForFunction(() => document.body.dataset.ts === 'select', null, { timeout: 8000 }).catch(() => {}); const c = await pg.evaluate(() => { const r = document.getElementById('tstart').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await pg.touchscreen.tap(c.x, c.y); }   // the ladder's START button
    else await pg.keyboard.press('Space');
    await sleep(350);
  }
  await pg.waitForFunction(() => ['zoom', 'play'].includes(VORTEX.state.state), null, { timeout: 8000 }).catch(() => {});
  return pg.evaluate(() => { const V = VORTEX; V.freeze(true); V.setAuto(false); return { st: V.state.state, level: V.state.level, r: V.runReport() }; });
};
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14', 'iPhone 14 landscape']) {
    console.log('\n===', dev, '===');
    const touch = dev !== 'desktop';
    const ctx = await b.newContext(touch ? { ...devices[dev] } : { viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.addInitScript(() => { try { localStorage.removeItem('vortex.hiscores'); localStorage.setItem('vortex.bestLevel', '1'); localStorage.setItem('vortex.lastStart', '0'); } catch (e) {} });
    await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX); await sleep(600);
    let s = await START(pg, touch);
    check(['zoom', 'play'].includes(s.st) && s.r.from === s.level && s.r.total === 0 && s.r.kills === 0, `${dev}: a fresh game starts a clean report`, { st: s.st, from: s.r.from, total: s.r.total });
    // a kill counts, then climb to level 3 so the report covers more than one level
    const k = await pg.evaluate(() => { const V = VORTEX; window.__noWarp = true; V.step(6, () => V.state.state === 'play'); V.emptyField(); const id = V.spawn('flipper', 2, 0.5); V.kill(id); V.kill(V.spawn('flipper', 6, 0.6)); V.gotoLevel(3); V.step(6, () => V.state.state === 'play'); return V.runReport(); });
    check(k.kills === 2 && k.to === 3, `${dev}: kills counted, report follows the level`, { kills: k.kills, to: k.to });
    const d1 = await pg.evaluate(DIE('shot'));
    check(d1.st === 'zoom' && d1.r.total === 1 && d1.r.last === 'shot', `${dev}: life 1 lost to a shot is tallied`, d1.r.lines);
    const d2 = await pg.evaluate(DIE('grab'));
    check(d2.st === 'zoom' && d2.r.total === 2 && d2.r.last === 'capture', `${dev}: life 2 lost to a rim grab is tallied`, d2.r.lines);
    const d3 = await pg.evaluate(DIE('shot'));
    const L = d3.r.lines;
    check(d3.st === 'gameover', `${dev}: last life -> GAME OVER`, d3.st);
    check(L.final === 'FINAL LIFE: HIT BY AN ENEMY SHOT', `${dev}: report names what took the final life`, L.final);
    check(/^LEVEL 1 → 3 +SCORE \d+$/.test(L.levels), `${dev}: levels covered and score`, L.levels);
    check(/SHOT 2/.test(L.lost) && /GRAB 1/.test(L.lost) && L.lost.indexOf('SHOT') < L.lost.indexOf('GRAB'), `${dev}: lives lost by cause, worst first`, L.lost);
    check(L.topLabel === 'TOP KILLER: SHOT' && /SHOOT IT OR STEP ASIDE/.test(L.tip), `${dev}: top killer + its counter-play tip`, [L.topLabel, L.tip]);
    check(/KILLS 2/.test(L.extra) && d3.r.newBest, `${dev}: kills + NEW BEST LEVEL`, [L.extra, d3.r.newBest]);
    // drawn for real: render a few frames unfrozen and look at the screen
    await pg.evaluate(() => { VORTEX.step(1.0); VORTEX.freeze(false); }); await sleep(500);
    await pg.evaluate(() => VORTEX.freeze(true));
    await pg.screenshot({ path: `${SHOTS}/vortex-runreport-${dev.replace(/ /g, '')}.png` });
    const fit = await pg.evaluate(() => { const c = document.querySelector('canvas'); const x = c.getContext('2d'); const w = c.width, h = c.height; const row = y => { const d = x.getImageData(0, Math.floor(h * y), w, 2).data; let n = 0, edge = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) { n++; const px = (i / 4) % w; if (px < w * 0.02 || px > w * 0.98) edge++; } return { n, edge }; }; return [0.2, 0.33, 0.405, 0.48].map(row); });
    check(fit.every(r => r.n > 0), `${dev}: title and report rows are drawn`, fit.map(r => r.n));
    check(fit.every(r => r.edge === 0), `${dev}: report rows fit the screen width`, fit.map(r => r.edge));
    // still up after the old 4 s; skip is locked for the first 1.2 s
    const held = await pg.evaluate(() => { VORTEX.step(3.5); return { st: VORTEX.state.state }; });
    check(held.st === 'gameover', `${dev}: report stays up past the old 4-s GAME OVER`, held);
    // skip by the device's own input
    if (dev === 'desktop') { await pg.keyboard.press('Space'); }
    else { const c = await pg.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.45 }; }); await pg.touchscreen.tap(c.x, c.y); }
    await sleep(200);
    let after = await pg.evaluate(() => VORTEX.state.state);
    check(after === 'continue' || after === 'attract' || after === 'initials', `${dev}: ${touch ? 'tap' : 'Space'} skips the report`, after);
    if (dev === 'desktop') {
      // gamepad A skips it too, and it times out on its own at 8 s
      await pg.evaluate(() => { const V = VORTEX; window.__noWarp = false; V.step(10); });   // continue offer runs out -> attract
      s = await START(pg, false);
      check(s.r.total === 0 && s.r.kills === 0 && !s.r.last, 'desktop: the next game resets the report', s.r);
      await pg.evaluate(() => { VORTEX.setLives(1); }); const g = await pg.evaluate(DIE('shot'));
      check(g.st === 'gameover' && g.r.lines.topLabel === 'HOW TO SURVIVE IT' && !g.r.newBest, 'desktop: one death -> tip label, no NEW BEST on a level already reached', g.r.lines);
      await pg.evaluate(() => { VORTEX.step(1.5); const btn = i => ({ pressed: i === 0, value: i === 0 ? 1 : 0 }); window.__pad = { id: 'test pad', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i)) }; navigator.getGamepads = () => [window.__pad]; VORTEX.freeze(false); });
      await pg.waitForFunction(() => VORTEX.state.state !== 'gameover', null, { timeout: 5000 }).catch(() => {});
      check(await pg.evaluate(() => VORTEX.state.state) !== 'gameover', 'desktop: gamepad A skips the report');
      await pg.evaluate(() => { window.__pad.buttons.forEach(b => { b.pressed = false; b.value = 0; }); }); await sleep(300);   // release A before unplugging
      await pg.evaluate(() => { navigator.getGamepads = () => []; VORTEX.freeze(true); VORTEX.step(10); });
      s = await START(pg, false); await pg.evaluate(() => VORTEX.setLives(1)); const g2 = await pg.evaluate(DIE('shot')); check(g2.st === 'gameover', 'desktop: third game reaches GAME OVER', [s.st, g2.st]);
      const t = await pg.evaluate(() => { const V = VORTEX; V.step(7.5); const a = V.state.state; V.step(0.7); return [a, V.state.state]; });
      check(t[0] === 'gameover' && t[1] !== 'gameover', 'desktop: report times out on its own at 8 s', t);
    }
    check(!errs.length, `${dev}: no console/page errors`, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
