// VORTEX day 11: same-lane grabber past 40% of grabDelay fires grabimminent cue + hot rim flash.
// NODE_PATH=... node games/tube-shooter/tests/vortex-grabimminent.test.js http://localhost:18472
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:18472';
let fails = 0;
const check = (ok, label, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + label, extra === undefined ? '' : JSON.stringify(extra)); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['desktop', 'iPhone 14', 'iPhone 14 landscape']) {
    console.log('\n===', dev, '===');
    const opts = dev === 'desktop' ? { viewport: { width: 1440, height: 900 } } : { ...devices[dev] };
    const ctx = await b.newContext(opts); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(BASE + '/games/tube-shooter/?debug=1'); await pg.waitForFunction(() => window.VORTEX);
    await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => {
      const V = VORTEX; V.freeze(true); V.gotoLevel(5); V.step(2, () => V.state.state === 'play');
      V.emptyField(); V.setInvincible(true); V.setLane(4, 0);
      const id = V.spawn('flipper', 4, 0); V.setEnemy(id, { z: 0, atRim: true, spawnT: 1, landT: 0, flipping: false });
      const before = V.grabWarn();
      // advance just past 40% of grabDelay without reaching a full grab
      const gd = V.params().grabDelay;
      V.step(gd * 0.45);
      const mid = V.grabWarn();
      const e = V.enemy(id);
      // finish the grab window under invincible so we don't die mid-test
      V.step(gd);
      const after = V.grabWarn();
      return { gd, before, mid, after, e, tips: V.deathTips(), paramsL1: V.params(1).grabDelay, paramsL20: V.params(20).grabDelay, paramsL99: V.params(99).grabDelay };
    });
    check(r.paramsL1 >= 0.27 && r.paramsL1 <= 0.29, 'L1 grabDelay ~0.28', r.paramsL1);
    check(r.paramsL20 >= 0.18 && r.paramsL20 < 0.2, 'L20 grabDelay near floor', r.paramsL20);
    check(r.paramsL99 === 0.18, 'L99 grabDelay floor 0.18', r.paramsL99);
    check(r.mid.imminent >= 1, 'imminent cue fired by 45% of grabDelay', r.mid);
    check(r.mid.threats.some(t => t.imminent && t.d === 0), 'threat flagged imminent in claw lane', r.mid.threats);
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
