// Browser smoke test: desktop + iPhone (portrait/landscape) + Canvas2D fallback.
// Usage: serve the repo root on :8080 (python3 -m http.server 8080), then
//   NODE_PATH=<dir with playwright-core> node games/neuro-storm/tests/page.test.cjs
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/games/neuro-storm/';
const CASES = [
  ['desktop 1440x900 @2x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, ''],
  ['iPhone 13 portrait', { ...devices['iPhone 13'] }, ''],
  ['iPhone 13 landscape', { ...devices['iPhone 13 landscape'] }, ''],
  ['iPad Pro 11', { ...devices['iPad Pro 11'] }, ''],
  ['Canvas2D fallback (?gl=0)', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, '?gl=0'],
];
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, opts, q] of CASES) {
    console.log(name);
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + q);
    await p.waitForFunction('window.NS && (NS.ready || NS.fatal)', null, { timeout: 90000 });
    const info = await p.evaluate(() => ({ r: NS.renderer, N: NS.N, fatal: NS.fatal, cls: document.body.className }));
    ok(!info.fatal, `loads (${info.r}, N=${info.N}, body="${info.cls}")`);
    ok(q ? info.r === '2d' : info.r === '3d', 'expected renderer');
    await p.waitForTimeout(800);
    // find a front-facing excitatory neuron that is actually under the pointer (not covered by a panel)
    const pt = await p.evaluate(() => {
      const { net, R } = NS, pr = new Float32Array(net.N * 3); R.project(pr);
      const cand = [];
      for (let i = 0; i < net.N; i++) { if (net.type[i]) continue; const x = pr[i * 3], y = pr[i * 3 + 1], w = pr[i * 3 + 2]; if (w <= 0 || x < 20 || y < 20 || x > innerWidth - 20 || y > innerHeight - 20) continue; const el = document.elementFromPoint(x, y); if (!el || el.tagName !== 'CANVAS') continue; cand.push([w, i, x, y]); }
      cand.sort((a, b) => a[0] - b[0]); const c = cand[Math.floor(cand.length * 0.05)]; return c ? { i: c[1], x: c[2], y: c[3] } : null;
    });
    ok(!!pt, 'found a visible neuron to tap');
    if (pt) {
      const before = await p.evaluate(() => NS.net.t);
      if (opts.hasTouch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
      await p.waitForFunction(() => NS.net.rec != null, null, { timeout: 5000 }).catch(() => {});
      await p.evaluate(() => NS.setSpeed(100));
      await p.waitForFunction(() => NS.S.wave > 20, null, { timeout: 30000 }).catch(() => {});
      const st = await p.evaluate(() => ({ wave: NS.S.wave, sel: NS.net.sel, t: NS.net.t }));
      ok(st.sel != null && st.wave > 20, `tap stimulates and triggers a cascade (selected #${st.sel}, ${st.wave} neurons fired, t ${before.toFixed(0)}→${st.t.toFixed(0)} ms)`);
      await p.waitForFunction(() => NS.S.quiet && NS.net.t - NS.S.quietSince > 100, null, { timeout: 60000 }).catch(() => {});
      const end = await p.evaluate(() => { const V = NS.net.V; let s = 0; for (const v of V) s += v; return { quiet: NS.S.quiet, msg: NS.S.lastQuietMsg, meanV: s / V.length, wave: NS.S.wave, N: NS.N }; });
      ok(end.quiet && Math.abs(end.meanV + 70) < 2.5 && end.wave < end.N * 0.75, `cascade dies out and the network returns to baseline (${end.wave} fired, ${end.msg}, mean V ${end.meanV.toFixed(1)} mV)`);
    }
    if (info.cls.includes('mobile')) {
      await p.click('#bCtl'); await p.waitForTimeout(500);
      ok(await p.evaluate(() => document.body.classList.contains('ctl')), 'controls drawer opens');
      await p.screenshot({ path: `/tmp/ns_${name.replace(/\W+/g, '_')}_drawer.png` });
      await p.click('#bClose'); await p.waitForTimeout(400);
    }
    await p.screenshot({ path: `/tmp/ns_${name.replace(/\W+/g, '_')}.png` });
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
