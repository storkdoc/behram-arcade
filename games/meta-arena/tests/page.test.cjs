// GENESIS browser test: desktop + iPhone. Checks: no console errors; the arena re-runs archived designs live in
// the sandbox worker and they match the archive; verdict, lineage, map views render; one generation can be bred
// in the browser with built-in operators.  Serve the repo root (python3 -m http.server 8095), then
//   NODE_PATH=<dir with playwright-core> node games/meta-arena/tests/page.test.cjs [filter]
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8095/games/meta-arena/';
const CASES = [
  ['desktop 1440x900', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }, true],
  ['iPhone 13 portrait', { ...devices['iPhone 13'] }, false],
  ['iPhone 13 landscape', { ...devices['iPhone 13 landscape'] }, false],
];
const only = process.argv[2]; let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const shot = (p, path) => p.screenshot({ path, timeout: 60000 }).catch(e => console.log('  (screenshot skipped ' + e.message.split('\n')[0] + ')'));
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, opts, breed] of CASES) {
    if (only && !name.includes(only)) continue; console.log(name);
    const ctx = await b.newContext(opts), p = await ctx.newPage(), errs = [], tag = name.replace(/\W+/g, '_');
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE);
    await p.waitForFunction(() => window.GENESIS && GENESIS.S.live && GENESIS.S.live.i > 5, null, { timeout: 30000 }).catch(() => {});
    ok(await p.evaluate(() => GENESIS.S.live.i > 5), 'arena: live run started in the sandbox worker');
    await shot(p, `/tmp/gen_${tag}_arena.png`);
    await p.evaluate(() => { GENESIS.S.auto = false; GENESIS.S.speedI = 4; });
    await p.waitForFunction(() => GENESIS.S.live.done, null, { timeout: 60000 }).catch(() => {});
    const m = await p.evaluate(() => GENESIS.S.live.match);
    ok(m && m.every(x => x === true), `arena: live re-run matches archive for all 5 designs (${JSON.stringify(m)})`);
    await shot(p, `/tmp/gen_${tag}_done.png`);
    // scrambled + another gen
    await p.evaluate(() => { GENESIS.setGen(3); GENESIS.setContest(4, true); });
    await p.waitForFunction(() => GENESIS.S.live.done, null, { timeout: 60000 }).catch(() => {});
    const m2 = await p.evaluate(() => GENESIS.S.live.match);
    ok(m2 && m2.every(x => x === true), `arena gen 4 scrambled: matches archive (${JSON.stringify(m2)})`);
    await p.keyboard.press('Enter'); await p.waitForTimeout(3000);
    ok(await p.evaluate(() => !document.getElementById('verdict').classList.contains('hidden') && document.querySelectorAll('.vrow.in').length === 5), 'verdict overlay via ENTER');
    await shot(p, `/tmp/gen_${tag}_verdict.png`);
    await p.keyboard.press('Enter');
    if (opts.hasTouch) { await p.tap('[data-view=lineage]'); } else await p.keyboard.press('2');
    await p.waitForTimeout(600); await shot(p, `/tmp/gen_${tag}_lineage.png`);
    await p.click('[data-view=map]'); await p.waitForTimeout(600);
    ok(await p.evaluate(() => document.querySelectorAll('#heat td').length > 50 && document.querySelectorAll('#audit tr').length > 5), 'map: heatmap and audit rendered');
    await shot(p, `/tmp/gen_${tag}_map.png`);
    await p.click('#heat td.nm'); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !document.getElementById('drawer').classList.contains('hidden')), 'design card opens');
    await shot(p, `/tmp/gen_${tag}_card.png`);
    await p.click('#dClose');
    if (breed) {
      await p.click('[data-view=evolve]'); await p.click('#bBreed');
      await p.waitForFunction(() => GENESIS.S.gens.length === 5 && !GENESIS.S.evolving, null, { timeout: 180000 }).catch(() => {});
      const g = await p.evaluate(() => { const G = GENESIS.S.gens[4]; return G && { gen: G.gen, w: G.verdict.text, n: G.entries.length }; });
      ok(g && g.gen === 5 && g.n === 5, `evolve: browser bred gen 5 (${g && g.w})`);
      await shot(p, `/tmp/gen_${tag}_evolve.png`);
    }
    ok(await p.evaluate(() => document.getElementById('err').classList.contains('hidden')), 'no error banner');
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
