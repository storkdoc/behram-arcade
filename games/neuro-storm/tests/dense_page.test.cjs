// Browser test of the dense GPU cortex page (default tier under SwiftShader = 55K).
// Usage: serve the repo root on :8080, then NODE_PATH=<dir with playwright-core> node games/neuro-storm/tests/dense_page.test.cjs
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/games/neuro-storm/';
const CASES = [
  ['desktop 1440x900 @2x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, ''],
  ['iPhone 13 portrait', { ...devices['iPhone 13'] }, '?tier=55k'],
  ['iPad Pro 11 landscape', { ...devices['iPad Pro 11 landscape'] }, '?tier=55k'],
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
    const t0 = Date.now();
    await p.goto(BASE + q);
    await p.waitForFunction('window.NS && (NS.ready || NS.fatal)', null, { timeout: 120000 });
    const info = await p.evaluate(() => ({ r: NS.renderer, N: NS.N, tier: NS.tier, boot: NS.boot, cls: document.body.className, syn: document.getElementById('synInfo').textContent }));
    ok(info.r === 'dense' && info.N > 50000, `loads dense mode (${info.tier}, N=${info.N}, ${(Date.now() - t0) / 1000}s, boot ${JSON.stringify({ ...info.boot, gpu: undefined })})`);
    ok(/synapses/.test(info.syn), `synapse count shown: "${info.syn}"`);
    await p.waitForTimeout(1500);
    const pt = await p.evaluate(() => {
      const { net, R } = NS, pr = new Float32Array(net.N * 3); R.project(pr); const cand = [];
      for (let i = 0; i < net.N; i += 7) { if (net.cls[i] !== 0) continue; const x = pr[i * 3], y = pr[i * 3 + 1], w = pr[i * 3 + 2]; if (w <= 0 || x < 30 || y < 30 || x > innerWidth - 30 || y > innerHeight - 30) continue; const el = document.elementFromPoint(x, y); if (!el || el.tagName !== 'CANVAS') continue; cand.push([w, i, x, y]); }
      cand.sort((a, b) => a[0] - b[0]); const c = cand[Math.floor(cand.length * 0.05)]; return c ? { i: c[1], x: c[2], y: c[3] } : null;
    });
    ok(!!pt, 'found a visible neuron to tap');
    if (pt) {
      if (opts.hasTouch) await p.touchscreen.tap(pt.x, pt.y); else await p.mouse.click(pt.x, pt.y);
      await p.waitForFunction(() => NS.net.sel != null && !NS.S.quiet, null, { timeout: 8000 }).catch(() => {});
      const st = await p.evaluate(() => ({ sel: NS.net.sel, name: document.getElementById('iName').textContent, wave: NS.S.wave }));
      ok(st.sel != null, `tap selects + stimulates (${st.name})`);
      // software GL renders slowly, so advance the GPU simulation directly (300 ms of model time) with rendering paused
      await p.evaluate(() => { NS.togglePause(true); NS.setView('column'); for (let k = 0; k < 4; k++) NS.runBlocks(100); });
      await p.waitForTimeout(1500);
      await p.screenshot({ path: `/tmp/nsd_${name.replace(/\W+/g, '_')}_wave.png` });
      await p.evaluate(() => { for (let k = 0; k < 11; k++) NS.runBlocks(100); });
      await p.waitForFunction(() => NS.S.quiet && NS.net.t - NS.S.quietSince > 60, null, { timeout: 30000 }).catch(() => {});
      await p.evaluate(() => NS.togglePause(false));
      const end = await p.evaluate(() => ({ quiet: NS.S.quiet, msg: NS.S.lastQuietMsg, wave: NS.S.wave, N: NS.N, t: NS.net.t, ms: NS.msPerBlock() }));
      ok(end.quiet && end.wave < end.N * 0.6, `cascade spreads then returns to baseline (${end.wave} fired = ${(end.wave / end.N * 100).toFixed(1)}%, ${end.msg}, sim t ${end.t.toFixed(0)} ms, ${end.ms.toFixed(1)} ms/block)`);
    }
    // thalamic mode, cutaway, lobes, keys
    await p.evaluate(() => document.getElementById('mThal').click());
    ok(await p.evaluate(() => NS.S.mode === 'thal'), 'thalamic mode button');
    await p.keyboard.press('c'); await p.evaluate(() => document.getElementById('cLobe').click());
    ok(await p.evaluate(() => NS.R.clip.value < 5 && NS.R.lobeMix.value === 1), 'cutaway (C) and lobe tint toggles');
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `/tmp/nsd_${name.replace(/\W+/g, '_')}_cut.png` });
    await p.keyboard.press('c'); await p.keyboard.press('l');
    ok(await p.evaluate(() => NS.S.view === 'trace'), 'L toggles inspector view');
    const sl = await p.evaluate(() => { const e = document.getElementById('sI'); e.value = 0.5; e.dispatchEvent(new Event('input')); return NS.net.p.wI; });
    ok(Math.abs(sl - 0.5) < 1e-6, 'inhibition slider drives the GPU net');
    await p.evaluate(() => NS.defaults());
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
