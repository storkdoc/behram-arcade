// Screenshots of the hospital drive at fixed moments: NODE_PATH=/workspace/tools/node_modules node tests/drive-shots.js [base] [outdir]
const { chromium } = require('playwright-core');
const TP = require('../office/tests/testpin.js');
const BASE = (process.argv[2] || 'http://localhost:8090') + '/games/dr-behrams-office/', OUT = process.argv[3] || '/tmp';
const DEV = { desktop: { viewport: { width: 1440, height: 900 } }, iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, iPad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const only = process.env.DEVS ? process.env.DEVS.split(',') : Object.keys(DEV);
  for (const dev of only) {
    const ctx = await b.newContext(DEV[dev]); if (!TP.real) await ctx.route('**/office/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(BASE); await pg.waitForFunction(() => window.HUB && HUB.booted);
    await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code })))); await pg.reload(); await pg.waitForFunction(() => window.HUB && HUB.booted);
    await pg.evaluate(() => { HUB.noNavigate = true; DriveFX.preload('office/assets/behram-face.jpg'); }); await pg.waitForTimeout(400);
    const moments = (process.env.AT || '0.6,1.6,2.6,3.0,3.9,4.6,5.4,6.0').split(',').map(Number);
    await pg.evaluate(() => HUB.go('triage'));
    for (const t of moments) { await pg.evaluate(t => { DriveFX.at = t; }, t); await pg.waitForTimeout(120); await pg.screenshot({ path: `${OUT}/drive-${dev}-${t.toFixed(1)}.png` }); }
    await pg.evaluate(() => { DriveFX.at = null; DriveFX.skip(); }); await pg.waitForTimeout(400);
    await pg.evaluate(() => { DriveFX.play({ dir: 'back', dest: 'triage' }); });
    for (const t of [0.5, 1.6, 2.6]) { await pg.evaluate(t => { DriveFX.at = t; }, t); await pg.waitForTimeout(120); await pg.screenshot({ path: `${OUT}/drive-${dev}-back-${t.toFixed(1)}.png` }); }
    await pg.evaluate(() => { DriveFX.at = null; DriveFX.skip(); });
    console.log(dev, 'errors:', errs.length ? errs : 'none');
    await ctx.close();
  }
  await b.close();
})();
