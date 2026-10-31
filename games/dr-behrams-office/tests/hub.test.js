// Browser smoke test for the Dr. Behram's Office cabinet (hub + all 3 games + old-URL redirects) on desktop, iPhone and iPad.
// NODE_PATH=/workspace/tools/node_modules node games/dr-behrams-office/tests/hub.test.js [baseURL]   (serve the repo root first)
// The instructor PIN is never in the repo: COB_PIN from the environment, else a throwaway test PIN patched into access.js.
// SHOTS=<dir> saves screenshots.
const { chromium } = require('playwright-core');
const TP = require('../office/tests/testpin.js');
const ROOT = process.argv[2] || 'http://localhost:8090', BASE = ROOT + '/games/dr-behrams-office/';
const SHOTS = process.env.SHOTS || '';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 } },
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  iPad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
};
const BOOT = { office: 'window.COB && COB.booted', feud: 'window.FEUD && FEUD.booted', surgery: 'window.SG && SG.booted' };
const UNLOCKED = { office: "!document.querySelector('#codein') || !document.querySelector('#codein').offsetParent", feud: "!document.querySelector('#gate') || getComputedStyle(document.querySelector('#gate')).display === 'none' || document.querySelector('#gate').classList.contains('hidden')", surgery: "getComputedStyle(document.querySelector('#lock')).display === 'none'" };
async function ctxFor(b, dev) {
  const ctx = await b.newContext(DEV[dev]);
  if (!TP.real) await ctx.route('**/office/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  return ctx;
}
function watch(pg) { pg.errs = []; pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) pg.errs.push(m.text()); }); return pg; }
const shown = (pg, s) => pg.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, s);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  for (const dev of ['desktop', 'iPhone', 'iPad']) {
    const ctx = await ctxFor(b, dev), pg = watch(await ctx.newPage());
    await pg.goto(BASE); await pg.waitForFunction(() => window.HUB && HUB.booted, null, { timeout: 15000 });
    ok(await shown(pg, '#gate') && !(await shown(pg, '#menu')), dev + ': front desk asks for a code first');
    if (SHOTS) await pg.screenshot({ path: `${SHOTS}/hub-${dev}-gate.png` });
    await pg.fill('#codein', 'CONG-2345-6789'); await pg.click('#code-go'); await pg.waitForTimeout(400);
    ok(/valid|look/i.test(await pg.textContent('#code-err')), dev + ': a made-up code is rejected');
    const old = await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 43).then(c => c.code));
    await pg.fill('#codein', old); await pg.click('#code-go'); await pg.waitForTimeout(400);
    ok(/6 weeks/.test(await pg.textContent('#code-err')), dev + ': an expired code is rejected');
    const code = await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => c.code));
    await pg.fill('#codein', code); await pg.click('#code-go'); await pg.waitForTimeout(900);
    ok(await shown(pg, '#menu'), dev + ': a generated student code opens the hallway menu');
    ok(await pg.$$eval('.room', a => a.length) === 3, dev + ': three rooms (Clinic Day, Feud & Delivery, Suture Self!)');
    if (SHOTS) await pg.screenshot({ path: `${SHOTS}/hub-${dev}-menu.png` });
    // the same code opens all three games (shared cob.access)
    for (const gk of ['office', 'feud', 'surgery']) {
      const gp = watch(await ctx.newPage());
      await gp.goto(BASE + gk + '/'); await gp.waitForFunction(BOOT[gk], null, { timeout: 20000 }); await gp.waitForTimeout(1500);
      ok(await gp.evaluate(UNLOCKED[gk]), `${dev}: ${gk} is unlocked by the hub code`);
      ok(!gp.errs.length, `${dev}: ${gk} loads with no console errors ${gp.errs.slice(0, 2).join(' | ')}`);
      if (SHOTS) await gp.screenshot({ path: `${SHOTS}/game-${gk}-${dev}.png` });
      await gp.close();
    }
    // keyboard: arrows + Space walk into the selected room (desktop); tap on touch
    if (dev === 'desktop') {
      await pg.evaluate(() => { HUB.noNavigate = true; }); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press(' '); await pg.waitForTimeout(300);
      ok(await pg.evaluate(() => HUB.went) === 'surgery', 'desktop: arrows + SPACE pick the operating room');
      await pg.reload(); await pg.waitForFunction(() => window.HUB && HUB.booted);
      await pg.click('.room[data-g="feud"]'); await pg.waitForURL(/\/feud\/$/, { timeout: 8000 }); ok(true, 'desktop: clicking the conference room walks into Feud & Delivery');
      await pg.goBack(); await pg.waitForFunction(() => window.HUB && HUB.booted);
    } else {
      await pg.tap('.room[data-g="surgery"]'); await pg.waitForURL(/\/surgery\/$/, { timeout: 8000 }); ok(true, dev + ': tapping the OR door walks into Suture Self!');
      await pg.goBack(); await pg.waitForFunction(() => window.HUB && HUB.booted);
    }
    ok(!pg.errs.length, dev + ': hub has no console errors ' + pg.errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // instructor PIN unlocks without a code
  { const ctx = await ctxFor(b, 'desktop'), pg = watch(await ctx.newPage());
    await pg.goto(BASE); await pg.waitForFunction(() => window.HUB && HUB.booted);
    await pg.click('#instr-gate'); for (const d of '0000') await pg.click(`#modal [data-k="${d}"]`); await pg.waitForTimeout(500);
    ok(/Incorrect/.test(await pg.textContent('#modal')), 'a wrong instructor PIN is refused');
    for (const d of TP.PIN) await pg.click(`#modal [data-k="${d}"]`); await pg.waitForTimeout(800);
    ok(/CONG-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(await pg.textContent('#bigcode')), 'the instructor PIN opens the code panel and issues a code');
    const issued = await pg.textContent('#bigcode');
    ok(await pg.evaluate(c => COBAccess.checkCode(c, COBAccess.nyDay()).then(r => r.ok), issued), 'the issued code validates');
    await pg.click('#done'); ok(await shown(pg, '#menu'), 'instructor lands in the menu');
    const sp = watch(await ctx.newPage()); await sp.goto(BASE + 'surgery/'); await sp.waitForFunction(BOOT.surgery);
    ok(await sp.evaluate(() => SG.instructor === true), 'instructor access carries into Suture Self! (Attending mode open)');
    await ctx.close(); }
  // old URLs redirect into the cabinet
  for (const [old, hash] of [['congressional-obgyn', 'office'], ['feud-and-delivery', 'feud']]) {
    const ctx = await ctxFor(b, 'desktop'), pg = watch(await ctx.newPage());
    await pg.goto(ROOT + '/games/' + old + '/'); await pg.waitForURL(/dr-behrams-office\/#/, { timeout: 8000 });
    ok(pg.url().endsWith('/games/dr-behrams-office/#' + hash), `/games/${old}/ redirects to the cabinet (#${hash})`);
    await ctx.close();
  }
  // the arcade lists one cabinet instead of two games
  { const ctx = await ctxFor(b, 'desktop'), pg = watch(await ctx.newPage()); await pg.goto(ROOT + '/');
    const slugs = await pg.evaluate(() => window.ARCADE_GAMES.map(g => g.slug));
    ok(slugs.includes('dr-behrams-office') && !slugs.includes('congressional-obgyn') && !slugs.includes('feud-and-delivery'), 'games.js lists Dr. Behram\'s Office and not the two old games');
    await ctx.close(); }
  await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
