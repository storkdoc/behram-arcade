// Browser test for SUTURE SELF!: NODE_PATH=/workspace/tools/node_modules node games/dr-behrams-office/surgery/tests/page.test.js [baseURL]
// Serve the repo root first: python3 -m http.server 8090. A bot plays every case (time limits shortened via SG.limitScale)
// and checks the teaching op note, history, print button and the lock screen. SHOTS=<dir> saves screenshots.
const { chromium } = require('playwright-core');
const TP = require('../../office/tests/testpin.js'); // the real PIN never appears in the repo
const BASE = (process.argv[2] || 'http://localhost:8090') + '/games/dr-behrams-office/surgery/';
const SHOTS = process.env.SHOTS || '';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const IPAD = { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
async function page(b, opts, unlock) {
  const ctx = await b.newContext(opts); const pg = await ctx.newPage(); pg.errs = [];
  if (!TP.real) await ctx.route('**/office/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) pg.errs.push(m.text()); });
  await pg.goto(BASE); await pg.waitForFunction(() => window.SG && SG.booted, null, { timeout: 15000 });
  if (unlock) { await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code })))); await pg.reload(); await pg.waitForFunction(() => window.SG && SG.booted, null, { timeout: 15000 }); }
  return pg;
}
const vis = (pg, s) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return false; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }, s);
async function playCase(pg, id, touch, shotPrefix) {
  await pg.evaluate(() => { SG.limitScale = 0.06; });
  if (!(await vis(pg, '#select'))) { if (touch) await pg.tap('#t-go'); else await pg.keyboard.press(' '); }
  await pg.waitForSelector('#select:not(.hidden)'); await pg.click(`.case[data-id="${id}"]`); await pg.waitForSelector('#preop:not(.hidden)');
  if (touch) await pg.tap('#po-go'); else await pg.click('#po-go');
  const t0 = Date.now(); let shots = 0, seen = new Set();
  while (Date.now() - t0 < (+process.env.CASE_MS || 240000)) {
    if (await vis(pg, '#note')) break;
    if (process.env.VERBOSE) { const st = await pg.evaluate(() => (SG.si + ':' + (SG.cur && SG.cur.step ? SG.cur.step.k : '-') + ' scr=' + SG.screen + ' modal=' + !!SG.modal + ' mini=' + !!SG.miniTick + ' p=' + document.querySelector('#p-txt').textContent.slice(0, 50))); if (st !== pg._last) { console.log('  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's ' + st); pg._last = st; } }
    if (shotPrefix && shots < 4) { const k = await pg.evaluate(() => SG.cur && SG.cur.step ? SG.cur.step.k : ''); if (k && !seen.has(k) && ['trace', 'bleed', 'lapfind', 'suture', 'clamp', 'veress', 'ports'].includes(k) && !(await vis(pg, '#quiz')) && !(await vis(pg, '#tray'))) { seen.add(k); await pg.waitForTimeout(600); await pg.screenshot({ path: `${shotPrefix}-${k}.png` }); shots++; } }
    if (await vis(pg, '#pause')) { pg.pauses = (pg.pauses || 0) + 1; await pg.click('#pa-go', { timeout: 1500 }).catch(() => {}); continue; }
    if (await vis(pg, '#baby')) { await pg.click('#baby', { timeout: 1500 }).catch(() => {}); continue; }
    if (await vis(pg, '#quiz')) { if (await vis(pg, '#q-ok')) await pg.click('#q-ok', { timeout: 1500 }).catch(() => {}); else { const n = await pg.$$eval('#q-opts .opt:not([disabled])', a => a.length); if (n) { const i = Math.floor(Math.random() * n); const el = (await pg.$$('#q-opts .opt:not([disabled])'))[i]; await (touch ? el.tap({ timeout: 1500 }) : el.click({ timeout: 1500 })).catch(() => {}); } } await pg.waitForTimeout(80); continue; }
    if (await vis(pg, '#tray')) { const els = await pg.$$('#tr-items .tool:not([disabled])'); if (els.length) await els[Math.floor(Math.random() * els.length)].click({ timeout: 1500 }).catch(() => {}); await pg.waitForTimeout(150); continue; }
    if (touch) { const box = await pg.$('#bA'); await box.dispatchEvent('pointerdown', { pointerType: 'touch' }); await pg.waitForTimeout(250); await box.dispatchEvent('pointerup', { pointerType: 'touch' }); if (Math.random() < 0.3) { const bb = await pg.$('#bB'); await bb.dispatchEvent('pointerdown', { pointerType: 'touch' }); await bb.dispatchEvent('pointerup', { pointerType: 'touch' }); } }
    else { await pg.keyboard.down(' '); await pg.waitForTimeout(220); await pg.keyboard.up(' '); if (Math.random() < 0.3) await pg.keyboard.press('Enter'); }
  }
  return pg.evaluate(() => ({ note: !document.querySelector('#note').classList.contains('hidden'), html: document.querySelector('#n-paper').innerHTML, grade: document.querySelector('#n-grade').textContent, log: SG.log.length, steps: SG.steps.length, surp: SG.surp.length, errs: SG.errors.slice() }));
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  // locked without a code
  let pg = await page(b, { viewport: { width: 1280, height: 800 } }, false);
  ok(await vis(pg, '#lock'), 'no code: lock screen'); ok(!(await vis(pg, '#title')), 'no code: title hidden');
  await pg.context().close();
  // desktop: every case
  pg = await page(b, { viewport: { width: 1440, height: 900 } }, true);
  ok(await vis(pg, '#title'), 'valid student code unlocks the title screen');
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/surgery-title.png' });
  const all = await pg.evaluate(() => SS.CASES.map(c => c.id)); const cases = process.env.CASES ? process.env.CASES.split(',') : process.env.ALL ? all : ['breech', 'tah', 'adnexal']; // ALL=1: every case (~25 min)
  ok(all.length === 7, '7 cases');
  for (const id of cases) {
    const r = await playCase(pg, id, false, SHOTS ? SHOTS + '/surgery-' + id : '');
    ok(r.note, id + ': reached the op note (grade ' + r.grade + ', ' + r.log + '/' + r.steps + ' steps, ' + r.surp + ' surprises)');
    ok(r.log === r.steps, id + ': every step logged');
    ok(['Pre-op diagnosis', 'Post-op diagnosis', 'Procedure', 'Surgeon', 'Assistant', 'Anesthesia', 'Findings', 'EBL', 'Fluids / urine', 'Specimens', 'Complications', 'Counts', 'Disposition', 'Description of procedure', 'Key teaching pearls', 'Grade'].every(s => r.html.includes(s)), id + ': op note has every section');
    ok(/class="(ok|sub|bad)"/.test(r.html), id + ': steps annotated');
    ok(!r.errs.length, id + ': no runtime errors ' + r.errs.join(' | ').slice(0, 300));
    if (SHOTS && id === 'breech') await pg.screenshot({ path: SHOTS + '/surgery-opnote.png', fullPage: false });
    await pg.click('#n-sched');
  }
  const hist = await pg.evaluate(() => JSON.parse(localStorage.getItem('sts.v1')).hist.length); ok(hist === cases.length, 'op-note history saved (' + hist + ')');
  await pg.click('#hist-btn'); ok(await pg.$$eval('#hist-list .hrow', a => a.length) === cases.length, 'history list shows past notes');
  await pg.click('#hist-list .hrow'); ok(await vis(pg, '#note') && await vis(pg, '#n-print'), 'history opens a note with Print/PDF');
  const printCss = await pg.evaluate(() => { let f = false; for (const s of document.styleSheets) { try { for (const r of s.cssRules) if (r.media && /print/.test(r.media.mediaText)) f = true; } catch (e) {} } return f; }); ok(printCss, 'print stylesheet present');
  await pg.emulateMedia({ media: 'print' }); ok(await pg.evaluate(() => getComputedStyle(document.querySelector('#top')).display === 'none' && getComputedStyle(document.querySelector('#n-paper')).display !== 'none'), 'print media shows only the paper'); await pg.emulateMedia({ media: 'screen' });
  await pg.click('#n-again'); ok(await vis(pg, '#preop'), 'Replay this case opens its pre-op');
  ok(!pg.errs.length, 'desktop: no console errors ' + pg.errs.slice(0, 3).join(' | '));
  await pg.context().close();
  // iPhone + iPad: touch play of one case each
  for (const [nm, dev, id] of [['iPhone', IPHONE, 'cat3'], ['iPad', IPAD, 'dermoid']]) {
    pg = await page(b, dev, true);
    if (SHOTS) await pg.screenshot({ path: `${SHOTS}/surgery-${nm}-title.png` });
    const r = await playCase(pg, id, true, SHOTS ? `${SHOTS}/surgery-${nm}-${id}` : '');
    ok(r.note && r.log === r.steps, nm + ': touch play of ' + id + ' reaches the op note (' + r.grade + ')');
    if (SHOTS) await pg.screenshot({ path: `${SHOTS}/surgery-${nm}-note.png` });
    ok(!pg.errs.length && !r.errs.length, nm + ': no errors ' + pg.errs.concat(r.errs).slice(0, 3).join(' | '));
    await pg.context().close();
  }
  await b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
