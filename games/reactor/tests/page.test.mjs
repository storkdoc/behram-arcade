// Headless page test: chromium (desktop, iPhone, iPad) + webkit. No console errors, renders non-black, modes start.
// usage: node tests/page.test.mjs [baseURL] [--shots dir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = require('/workspace/tools/node_modules/playwright-core'); }
const base = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:8765/games/reactor/';
const si = process.argv.indexOf('--shots'), shots = si > 0 ? process.argv[si + 1] : null;
const only = process.env.ONLY;
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const CASES = [
  { name: 'desktop', browser: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { name: 'iphone-portrait', browser: 'chromium', ctx: iphone },
  { name: 'iphone-landscape', browser: 'chromium', ctx: { ...iphone, viewport: { width: 844, height: 390 } } },
  { name: 'ipad', browser: 'chromium', ctx: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } },
  { name: 'webkit-iphone', browser: 'webkit', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
].filter(c => !only || c.name === only);
let fails = 0;
for (const c of CASES) {
  const bt = pw[c.browser];
  const browser = await bt.launch(c.browser === 'chromium' ? { executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  const ctx = await browser.newContext(c.ctx); const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const res = [];
  const ok = (cond, msg) => { res.push((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };
  try {
    await page.goto(base + '?fast&preserve', { waitUntil: 'load' });
    await page.waitForFunction(() => window.RX && window.RX.booted, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => !document.getElementById('fatal')), 'no fatal banner');
    ok(await page.evaluate(() => RX.screen === 'title'), 'title screen');
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-title.png` });
    // shift
    await page.evaluate(() => RX.act('shift'));
    await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({ mode: RX.mode, n: RX.s.n, self: RX.R.lastSelf, tier: RX.R.tier }));
    ok(st.mode === 'shift' && st.n > 0.9, 'shift running at power ' + st.n.toFixed(3));
    ok(!st.self || st.self.black / Math.max(1, st.self.n) < 0.5, 'render self-check ' + JSON.stringify(st.self) + ' tier ' + st.tier);
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-shift.png` });
    // fault: force one and close the card
    await page.evaluate(() => { const f = RX.C.FAULTS.find(x => x.id === 'rcp'); RX.g.nextFault = 0; RX.g.recent = RX.C.FAULTS.filter(x => x.id !== 'rcp').map(x => x.id); localStorage.clear(); });
    await page.evaluate(() => RX.sim(0.1));
    await page.waitForTimeout(600);
    ok(await page.evaluate(() => RX.screen === 'card' && RX.g.faults.length === 1), 'fault card shown');
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-card.png` });
    await page.keyboard.press('Space'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => RX.screen === null), 'card closed by Space');
    // SCRAM via the guarded button (hold)
    const b = await page.$('#qscram'); const bb = await b.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
    await page.waitForTimeout(1500);
    ok(await page.evaluate(() => RX.s.scram && RX.s.scramCause === 'MANUAL'), 'guarded SCRAM by hold');
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-scram.png` });
    // lab
    await page.evaluate(() => { RX.show(null); RX.startLab(); RX.closeCard(); RX.labAct('1.2'); });
    await page.waitForTimeout(2500);
    ok(await page.evaluate(() => RX.mode === 'lab'), 'lab running');
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-lab.png` });
    // drills start
    for (let i = 0; i < 7; i++) { await page.evaluate(i => { RX.startDrill(i); RX.closeCard(); }, i); await page.waitForTimeout(250); }
    ok(await page.evaluate(() => RX.mode === 'drill' && RX.s.type.name === 'RBMK'), 'drills start (last is RBMK)');
    await page.waitForTimeout(1500);
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-rbmk.png` });
    await page.evaluate(() => RX.startTutorial()); await page.waitForTimeout(800);
    if (shots) await page.screenshot({ path: `${shots}/${c.name}-tut.png` });
    ok(await page.evaluate(() => RX.mode === 'tutorial'), 'tutorial');
    ok(await page.evaluate(() => !document.getElementById('fatal')), 'still no fatal banner');
  } catch (e) { ok(false, 'exception: ' + e.message); }
  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  console.log(`== ${c.name} (${c.browser})\n  ` + res.join('\n  '));
  await browser.close();
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
