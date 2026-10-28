// quick screenshots of the arena at the end of a stream: node tests/shots.cjs
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8095/games/meta-arena/';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [n, o] of [['desk', { viewport: { width: 1440, height: 900 } }], ['port', devices['iPhone 13']], ['land', devices['iPhone 13 landscape']]]) {
    const c = await b.newContext(o), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await p.goto(BASE); await p.waitForFunction(() => window.GENESIS && GENESIS.S.live && GENESIS.S.live.i > 3, null, { timeout: 30000 });
    await p.evaluate(() => { GENESIS.S.auto = false; GENESIS.setGen(3); GENESIS.setContest(1, false); GENESIS.S.speedI = 2; });
    await p.waitForTimeout(4000); await p.screenshot({ path: `/tmp/s_${n}_mid.png` });
    await p.evaluate(() => { GENESIS.S.speedI = 4; }); await p.waitForFunction(() => GENESIS.S.live.done, null, { timeout: 60000 }); await p.waitForTimeout(300);
    await p.screenshot({ path: `/tmp/s_${n}_done.png` }); console.log(n, errs); await c.close();
  }
  await b.close();
})();
