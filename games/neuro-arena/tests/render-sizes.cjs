/* Render check across browsers and viewports: node tests/render-sizes.cjs <url> <prefix> [webkit,chromium]  (needs playwright-core + its webkit) */
const pw = require('playwright-core');
const base = process.argv[2], pre = process.argv[3];
const SZ = [['1024x600@2', 1024, 600, 2, false], ['1440x900@2', 1440, 900, 2, false], ['1280x800@1', 1280, 800, 1, false], ['iPhone13', 390, 844, 3, true], ['iPhone13-land', 844, 390, 3, true], ['iPadPro11', 834, 1194, 2, true]];
(async () => {
  for (const name of (process.argv[4] || 'webkit,chromium').split(',')) {
    const b = name === 'chromium' ? await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--ignore-gpu-blocklist'] }) : await pw[name].launch();
    for (const [tag, w, h, d, mob] of SZ) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: d, isMobile: mob && name !== 'firefox', hasTouch: mob }), p = await ctx.newPage(), log = [];
      p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ReadPixels|GPU stall/.test(m.text())) log.push(m.text().slice(0, 160)); });
      p.on('pageerror', e => log.push('PAGEERROR ' + e.message));
      await p.goto(base); await p.waitForTimeout(7000);
      const st = await p.evaluate(() => ({ r: NA.ui.renderer, chk: NA.R && NA.R.lastCheck, z: NA.R && NA.R.lastZero, fx: NA.R && NA.R.fx, t: NA.ui.frame && NA.ui.frame.time, banner: document.getElementById('banner') ? document.getElementById('banner').className : 'n/a' })).catch(e => e.message);
      const f = `/tmp/probe/${pre}_${name}_${tag}.png`;
      await p.screenshot({ path: f, timeout: 60000 }).catch(() => {});
      console.log(name, tag, JSON.stringify(st), log.join(' | '));
      await ctx.close();
    }
    await b.close();
  }
})();
