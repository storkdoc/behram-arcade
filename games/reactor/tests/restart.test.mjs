// Shift recovery test (Day 2 eval, 2026-10-29): after a trip and reset, the plant must not re-trip on
// HIGH STARTUP RATE from the automatic shutdown-bank withdrawal, and a careful operator (rods + dilution)
// must be able to get back above 8 % power within the shift. Also checks that crew-repair downtime is not scored.
// usage: node games/reactor/tests/restart.test.mjs [baseURL]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require('/workspace/tools/node_modules/playwright-core'); }
const base = process.argv[2] || 'http://localhost:8765/games/reactor/';
const browser = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(base + '?fast', { waitUntil: 'load' });
await page.waitForFunction(() => window.RX && window.RX.booted, null, { timeout: 30000 });
const r = await page.evaluate(() => {
  const R = RX; R.startShift(); R.g.nextFault = 1e9; R.g.nextDispatch = 1e9; R.closeCard && R.closeCard();
  R.sim(20); R.S.doScram(R.s, 'TEST'); R.sim(90);
  const trips0 = R.s.events.filter(e => e.k === 'scram').length;
  R.act('reset'); const resetOk = !R.s.scram;
  let t = 0, reached = null;
  while (t < 300 && reached == null) {
    const s = R.s;
    if (!R.g.sdWithdraw) {
      R.hold('out', s.n < 0.12 && (s.period <= 0 || s.period > 40)); R.hold('in', s.period > 0 && s.period < 15);
      R.hold('dilute', s.rods.every(x => x < 0.05) && !(s.period > 0 && s.period < 60));
    }
    R.sim(1); t++; if (R.s.n >= 0.08) reached = t;
  }
  const retrips = R.s.events.filter(e => e.k === 'scram').length - trips0;
  // scoring: an unrepaired crew-repair fault with the unit off the grid is excused
  R.startShift(); R.g.nextFault = 1e9; R.closeCard && R.closeCard();
  const f = R.C.FAULTS.find(x => x.id === 'turb'); R.g.faults.push({ def: f, t: 0, repaired: false, repairAt: 1e9 }); R.s.turb.tripped = true; R.s.turb.synced = false;
  const n0 = R.g.accN; R.sim(10); const excused = R.g.accN - n0 < 0.5 && R.g.excusedT > 9;
  return { resetOk, retrips, reached, excused };
});
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
ok(r.resetOk, 'trip reset accepted after 90 s');
ok(r.retrips === 0, `no re-trip during restart (re-trips: ${r.retrips})`);
ok(r.reached != null && r.reached < 300, `back above 8 % power in ${r.reached} s of plant time`);
ok(r.excused, 'grid accuracy not scored while the crew repairs a tripping fault');
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 2).join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
