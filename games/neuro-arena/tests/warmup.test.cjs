// 2026-11-18: honest labelling of warm-up contests. Contests with only a handful of distinct puzzles and no curriculum
// (Echo 8, Count the dots 6, Rock paper scissors 3, Pattern 10) can be aced by a memorized lookup table; the carousel
// marks them "warm-up", their tooltip and selection toast say a 100% is not evidence of understanding; curriculum
// contests (Addition, Word completion, Smallest divisor ...) are not marked. Desktop + iPhone 13, no console errors.
//   python3 -m http.server 8093   then   NODE_PATH=<dir with playwright-core> BASE=http://localhost:8093/games/neuro-arena/ node games/neuro-arena/tests/warmup.test.cjs
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8093/games/neuro-arena/';
let fails = 0; const check = (ok, m, x) => { console.log((ok ? 'PASS ' : 'FAIL ') + m, x === undefined ? '' : JSON.stringify(x)); if (!ok) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [dev, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['iPhone 13', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts); const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(BASE); await pg.waitForSelector('#cTrack .cc', { timeout: 60000 }); await pg.waitForTimeout(800);
    const cards = await pg.$$eval('#cTrack .cc', bs => bs.map(b => ({ id: b.dataset.id, cs: b.querySelector('.cs').textContent, title: b.title })));
    const by = Object.fromEntries(cards.map(c => [c.id, c]));
    for (const id of ['echo', 'dots', 'rps', 'pattern']) if (by[id]) check(/^warm-up/.test(by[id].cs) && /lookup table/.test(by[id].title), `${dev}: ${id} card marked warm-up + tooltip explains`, by[id].cs);
    for (const id of ['add', 'text', 'divisor', 'simon', 'big']) if (by[id]) check(!/warm-up/.test(by[id].cs) && !/lookup table/.test(by[id].title), `${dev}: ${id} not marked`, by[id].cs);
    await pg.$eval('#cTrack .cc[data-id="echo"]', el => el.click()); await pg.waitForTimeout(400);
    const t = await pg.$eval('#toast', el => ({ txt: el.textContent, hidden: el.classList.contains('hidden') }));
    check(!t.hidden && /Warm-up: only 8 different puzzles/.test(t.txt), `${dev}: selecting Echo explains the warm-up`, t.txt.slice(0, 160));
    check(errs.length === 0, `${dev}: no console errors`, errs.slice(0, 3));
    await ctx.close();
  }
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
