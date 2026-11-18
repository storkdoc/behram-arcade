// VORTEX day 22 (2026-11-18): centre messages stay clear of the touch control deck in portrait. Before, WAVE: <NAME> + tip,
// TAP ZAP TO BREAK FREE / USES YOUR LAST ZAP and POWER-UPS LOST (58-81 % of the height) were drawn over the MODE button,
// the square button bar, ZAP and the knob, which start at ~67 % on phones. Checks on iPhone SE (320 + 375) + iPhone 14 portrait (+ MODE no longer runs under AUTO on 320-px phones): every
// drawn message ends above the deck, messages do not overlap each other, order is kept; on desktop + iPhone 14 landscape the
// layout is unchanged (no band, same y as before). No console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-msgband.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const SHOTS = process.env.SHOTS || require('os').tmpdir();
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
const SCEN = (which) => {
  const V = VORTEX; window.__noWarp = true; window.__noTokens = true; window.__noPups = true; V.freeze(true); V.setLives(9);
  if (V.setAuto) V.setAuto(false);
  V.setInvincible(true); V.gotoLevel(9); V.step(4, () => V.state.state === 'play', true);
  if (which === 'grab') {
    V.emptyField(); V.setLane(4, 0); V.step(1 / 60, null, true); const pl = V.playerLane(); V.setInvincible(false);
    const id = V.spawn('flipper', pl, 0); V.setEnemy(id, { z: 0, atRim: true, spawnT: 1, landT: 0, flipping: false });
    for (let i = 0; i < 1200 && V.state.state === 'play'; i++) V.step(1 / 120, null, true);
    V.step(0.2, null, true);
  } else V.step(0.3, null, true);
  V.step(0);
  return { L: V.msgLayout(), msgs: V.messages(), st: V.state.state };
};
async function suite(b, dev, opts, portrait) {
  console.log('\n===', dev, '==='); const errs = [];
  const ctx = await b.newContext(opts); const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX); await pg.waitForTimeout(500);
  for (const which of ['intro', 'grab']) {
    const r = await pg.evaluate(SCEN, which);
    const d = r.L.drawn, deck = r.L.ctrlTop * r.L.DPR;
    const want = which === 'intro' ? /^WAVE: / : /BREAK FREE/;
    check(d.some(m => want.test(m.text)), `${dev} ${which}: ${want} drawn`, d.map(m => m.text));
    if (portrait) {
      check(r.L.touch && r.L.band && r.L.band.k < 1, `${dev} ${which}: portrait touch band active`, r.L.band);
      check(d.every(m => m.bottom <= deck), `${dev} ${which}: every message ends above the control deck (${Math.round(deck)})`, d.map(m => [m.text.slice(0, 18), Math.round(m.bottom)]));
    } else check(!r.L.band, `${dev} ${which}: no band (layout unchanged)`, r.L.band);
    const s = d.slice().sort((a, b) => a.top - b.top);
    check(s.every((m, i) => i === 0 || m.top >= s[i - 1].bottom - 0.5), `${dev} ${which}: messages do not overlap`, s.map(m => [m.text.slice(0, 14), Math.round(m.top), Math.round(m.bottom)]));
    await pg.screenshot({ path: `${SHOTS}/vortex-msgband-${which}-${dev.replace(/ /g, '_')}.png` });
  }
  if (portrait) {
    const ov = await pg.evaluate(() => { const R = id => document.getElementById(id).getBoundingClientRect(); const m = R('tmode');
      return ['tauto', 'tfs', 'tmute', 'tpause'].filter(id => getComputedStyle(document.getElementById(id)).display !== 'none').map(id => [id, R(id)]).filter(([, r]) => r.left < m.right && r.right > m.left && r.top < m.bottom && r.bottom > m.top).map(([id]) => id); });
    check(ov.length === 0, `${dev}: MODE button does not overlap the square button bar`, ov);
  }
  check(errs.length === 0, `${dev}: no console errors` + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(b, 'desktop', { viewport: { width: 1440, height: 900 } }, false);
  await suite(b, 'iPhone SE (320)', devices['iPhone SE'], true);
  await suite(b, 'iPhone SE 2/3', { ...devices['iPhone SE'], viewport: { width: 375, height: 553 } }, true);
  await suite(b, 'iPhone 14', devices['iPhone 14'], true);
  await suite(b, 'iPhone 14 landscape', devices['iPhone 14 landscape'], false);
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
