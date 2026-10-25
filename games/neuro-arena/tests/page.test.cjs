// Browser test: desktop + iPhone/iPad emulation. Checks: no console errors, live matches run and finish
// (a generation is recorded), Turbo advances generations in workers, Play mode responds to keys / touch.
// Usage: serve the repo root (python3 -m http.server 8093), then
//   NODE_PATH=<dir with playwright-core> node games/neuro-arena/tests/page.test.cjs
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8093/games/neuro-arena/';
const CASES = [
  ['desktop 1440x900 @2x', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }],
  ['iPhone 13 portrait', { ...devices['iPhone 13'] }],
  ['iPhone 13 landscape', { ...devices['iPhone 13 landscape'] }],
  ['iPad Pro 11', { ...devices['iPad Pro 11'] }],
];
const only = process.argv[2];
let fails = 0;
const shot = (p, o) => p.screenshot({ ...o, timeout: 60000 }).catch(e => console.log('  (screenshot skipped: ' + e.message.split('\n')[0] + ')'));
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, opts] of CASES) {
    if (only && !name.includes(only)) continue;
    console.log(name);
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(() => { if (!sessionStorage.getItem('t')) { localStorage.clear(); sessionStorage.setItem('t', 1); } localStorage.setItem('neuroArena.seenInfo', '1'); });
    await p.goto(BASE);
    await p.waitForFunction(() => window.NA && NA.ui.frame && NA.ui.frame.time > 1500, null, { timeout: 60000 }).catch(() => {});
    const s0 = await p.evaluate(() => ({ t: NA.ui.frame && NA.ui.frame.time, cls: document.body.className, mode: NA.ui.mode }));
    ok(s0.t > 1500, `watch mode: live duel runs (${s0.t} ms of neural time, body="${s0.cls}")`);
    // finish a short match quickly -> a generation is recorded
    await p.evaluate(() => { NA.evo.opts.matchSec = 5; NA.ui.speed = 8; NA.restart(); });
    await p.waitForFunction(() => NA.evo.gen >= 1, null, { timeout: 120000 }).catch(() => {});
    const g1 = await p.evaluate(() => ({ gen: NA.evo.gen, log: document.querySelectorAll('#log li').length, h: NA.evo.history[0], bl: document.getElementById('benchLbl').textContent, gl: document.getElementById('genLbl').textContent }));
    ok(g1.gen >= 1 && g1.log >= 1, `watch match completes and is recorded (gen ${g1.gen}, ${g1.h ? g1.h.errors.length : '?'} copy errors logged)`);
    ok(g1.h && typeof g1.h.childBench === 'number' && /\d+%/.test(g1.bl) && /GENERATION 1/.test(g1.gl), `watch: both brains benchmarked, badge shows "${g1.gl} · ${g1.bl}"`);
    await shot(p, { path: `/tmp/na_${name.replace(/\W+/g, '_')}_watch.png` });
    // turbo
    await p.evaluate(() => { NA.ui.K = 2; });
    await p.click('#mTurbo');
    const gt0 = await p.evaluate(() => NA.evo.gen);
    await p.waitForFunction(g => NA.evo.gen >= g + 2, gt0, { timeout: 180000 }).catch(() => {});
    const gt = await p.evaluate(() => ({ gen: NA.evo.gen, K: NA.ui.K, box: !document.getElementById('turboBox').classList.contains('hidden') }));
    ok(gt.gen >= gt0 + 2 && gt.box, `turbo advances generations in ${gt.K} workers (${gt0} → ${gt.gen})`);
    await shot(p, { path: `/tmp/na_${name.replace(/\W+/g, '_')}_turbo.png` });
    // play
    await p.click('#mPlay');
    await p.waitForFunction(() => NA.ui.mode === 'play' && NA.ui.frame && NA.ui.live && NA.ui.live.kind === 'play', null, { timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(800);
    const y0 = await p.evaluate(() => NA.ui.frame.pad[1]);
    if (opts.hasTouch) {
      // drag on the court near the top of the right half
      const pt = await p.evaluate(() => NA.courtPoint(1.2, 0.9));
      await p.touchscreen.tap(pt.x, pt.y);
      await p.waitForTimeout(3000);
    } else {
      await p.keyboard.press('Space');
      await p.keyboard.down('ArrowUp'); await p.waitForTimeout(2500); await p.keyboard.up('ArrowUp');
    }
    const s2 = await p.evaluate(() => ({ y: NA.ui.frame.pad[1], hold: NA.ui.frame.hold && NA.ui.frame.stats.score[0] + NA.ui.frame.stats.score[1] === 0, t: NA.ui.frame.time, bx: NA.ui.frame.bx }));
    ok(s2.y > y0 + 0.1, `play mode: human paddle responds (${y0.toFixed(2)} → ${s2.y.toFixed(2)})`);
    ok(!s2.hold, `play mode: ball served (t ${s2.t} ms)`);
    await p.waitForTimeout(1500);
    await shot(p, { path: `/tmp/na_${name.replace(/\W+/g, '_')}_play.png` });
    if ((await p.evaluate(() => document.body.className)).includes('compact')) {
      await p.click('#bCtl'); await p.waitForTimeout(300);
      ok(await p.evaluate(() => getComputedStyle(document.getElementById('ctl')).display !== 'none'), 'controls drawer opens');
      await shot(p, { path: `/tmp/na_${name.replace(/\W+/g, '_')}_drawer.png` });
      await p.click('#bCtl');
      await p.click('#tabs button[data-tab="log"]'); await p.waitForTimeout(200);
      ok(await p.evaluate(() => document.getElementById('cardLog').classList.contains('on')), 'panel tabs switch');
    }
    // reload: state persists
    await p.reload(); await p.waitForFunction(() => window.NA && NA.evo, null, { timeout: 30000 });
    const gr = await p.evaluate(() => NA.evo.gen);
    ok(gr >= gt.gen, `progress persists across reload (gen ${gr})`);
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
