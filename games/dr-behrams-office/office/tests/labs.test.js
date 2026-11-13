// Reference lab values sheet (2026-11-13, player feedback). Data checks + desktop keyboard, gamepad-style keys and iPhone touch.
// NODE_PATH=... node games/dr-behrams-office/office/tests/labs.test.js [baseURL]
const { chromium } = require('playwright-core');
const TP = require('./testpin.js');
global.window = global; require('../js/bank.js'); const L = require('../js/labs.js');
const BASE = (process.argv[2] || 'http://localhost:8090') + '/games/dr-behrams-office/office/';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const rows = []; L.LABS.forEach(g => g[1].forEach(r => rows.push(r)));
ok(rows.length >= 35 && rows.every(r => r[0] && r[1] && typeof r[2] === 'string' && r[3] instanceof RegExp), rows.length + ' rows, each with test, range, note, keywords');
ok(new Set(rows.map(r => r[0])).size === rows.length, 'row names unique');
const bank = global.COB_BANK;
if (Array.isArray(bank)) { let n = 0, hit = 0; bank.forEach(t => t.cases.forEach(c => { n++; if (L.relevant(c.v + ' ' + c.cc).length) hit++; }));
  ok(hit / n > 0.3, `"In this chart" finds relevant labs for ${hit}/${n} case vignettes`); }
{ const r = L.relevant('Platelets 88,000, AST 140'); ok(r.includes('Platelets') && r.includes('AST / ALT'), 'relevance picks up platelets / AST ' + r); }
ok(L.relevant('She feels well and has no complaints.').length === 0, 'no false relevance on plain text');
ok(L.relevant('She delivered vaginally and has vulvar itching and a fever.').length === 0, 'no false relevance: delivered != liver, vulvar itching != cholestasis, any fever != Triple I ' + L.relevant('She delivered vaginally and has vulvar itching and a fever.'));
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
async function toEncounter(b, opts, touch) {
  const ctx = await b.newContext(opts); const pg = await ctx.newPage(); pg.errs = [];
  if (!TP.real) await ctx.route('**/office/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error') pg.errs.push(m.text()); });
  await pg.goto(BASE); await pg.waitForFunction(() => window.COB && COB.booted, null, { timeout: 15000 });
  await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code }))));
  await pg.reload(); await pg.waitForFunction(() => COB.booted); await pg.waitForSelector('#go', { timeout: 6000 });
  await pg.fill('#nm', 'Student'); if (touch) await pg.tap('#go'); else { await pg.keyboard.press('Enter'); await pg.keyboard.press(' '); }
  await pg.waitForSelector('#hall-inner .door', { timeout: 8000 });
  const room = await pg.waitForFunction(() => { const d = COB.debug.day; for (let r = 0; r < 4; r++) { const id = d.rooms[r]; if (id && d.patients[id - 1].state === 'roomed' && !d.cleaning[r]) return r + 1; } return 0; }, null, { timeout: 60000, polling: 250 }).then(h => h.jsonValue());
  if (touch) await pg.tap(`.door:nth-child(${room})`).catch(async () => pg.keyboard.press(String(room))); else await pg.keyboard.press(String(room));
  await pg.waitForSelector('#begin', { timeout: 8000 }); await pg.waitForTimeout(300);
  return pg;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  // desktop keyboard
  let pg = await toEncounter(b, { viewport: { width: 1440, height: 900 } }, false);
  ok(await pg.isVisible('#labs'), 'desktop: Lab values button on the chart screen');
  await pg.keyboard.press('l'); await pg.waitForSelector('.labs-card');
  ok((await pg.$$('.labs-card tr')).length >= rows.length, 'L opens the full sheet');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(150); ok(!(await pg.isVisible('.labs-card')), 'Esc closes it');
  await pg.keyboard.press(' '); await pg.waitForSelector('.opt[data-nav]');
  ok(await pg.isVisible('#labs'), 'Lab values button during a question');
  const qt0 = await pg.evaluate(() => COB.debug.enc.qt);
  await pg.keyboard.press('l'); await pg.waitForSelector('.labs-card');
  ok(/clock is paused/.test(await pg.textContent('.labs-card')), 'sheet says the question clock is paused');
  ok(await pg.evaluate(() => { const s = document.querySelector('.labs-card').getBoundingClientRect(); return s.top >= 0 && s.bottom <= innerHeight; }), 'sheet fits the desktop viewport');
  await pg.keyboard.press('1'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => !COB.debug.enc.res[COB.debug.enc.i]), 'answer keys do not leak through the open sheet');
  await pg.waitForTimeout(2000); await pg.keyboard.press('l'); await pg.waitForTimeout(150);
  const qt1 = await pg.evaluate(() => COB.debug.enc.qt);
  ok(!(await pg.isVisible('.labs-card')) && qt1 - qt0 > 1.8, 'L closes it and the 2 s spent reading did not count against the speed bonus (+' + (qt1 - qt0).toFixed(2) + ' s)');
  await pg.keyboard.press('1'); await pg.waitForSelector('#next'); ok(await pg.isVisible('#labs'), 'Lab values button after answering');
  ok(pg.errs.length === 0, 'desktop: no console errors ' + JSON.stringify(pg.errs));
  if (process.env.SHOTS) { await pg.keyboard.press('l'); await pg.waitForTimeout(300); await pg.screenshot({ path: process.env.SHOTS + '/labs-desktop.png' }); }
  await pg.context().close();
  // iPhone touch
  pg = await toEncounter(b, IPHONE, true);
  await pg.tap('#begin'); await pg.waitForSelector('.opt[data-nav]');
  await pg.tap('#labs'); await pg.waitForSelector('.labs-card');
  const fit = await pg.evaluate(() => { const s = document.querySelector('.labs-card').getBoundingClientRect(), c = document.querySelector('#labs-close').getBoundingClientRect(), sc = document.querySelector('.labs-scroll'); return { top: s.top, bottom: s.bottom, h: innerHeight, w: s.width, cb: c.bottom, scrolls: sc.scrollHeight > sc.clientHeight, ow: document.documentElement.scrollWidth <= innerWidth }; });
  ok(fit.top >= 0 && fit.bottom <= fit.h && fit.cb <= fit.h && fit.ow, 'iPhone: sheet and close button on screen, no sideways overflow ' + JSON.stringify(fit));
  ok(fit.scrolls, 'iPhone: the table scrolls inside the card');
  if (process.env.SHOTS) await pg.screenshot({ path: process.env.SHOTS + '/labs-iphone.png' });
  await pg.tap('#labs-close'); await pg.waitForTimeout(200); ok(!(await pg.isVisible('.labs-card')), 'iPhone: tap closes it');
  ok(pg.errs.length === 0, 'iPhone: no console errors ' + JSON.stringify(pg.errs));
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
