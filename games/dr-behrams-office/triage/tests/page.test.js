// Browser test for OB TRIAGE: NODE_PATH=/workspace/tools/node_modules node games/dr-behrams-office/triage/tests/page.test.js [baseURL]
// Serve the repo root first (python3 -m http.server 8090). Desktop (keyboard), iPhone and iPad (touch): lock screen, unlock with a
// generated student code (throwaway test PIN, see office/tests/testpin.js). Desktop plays every case with digit keys (best call, plus some
// wrong calls after a hint); iPhone and iPad tap options. Checks the half-screen strip, the debrief, history, pause, shift mode, Attending
// mode, with no console errors. SHOTS=<dir> saves screenshots.
const { chromium } = require('playwright-core');
const TP = require('../../office/tests/testpin.js');
const BASE = (process.argv[2] || 'http://localhost:8090') + '/games/dr-behrams-office/triage/';
const SHOTS = process.env.SHOTS || '';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 } },
  iPhone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  iPad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
};
async function open(b, dev, unlock) {
  const ctx = await b.newContext(DEV[dev]); const pg = await ctx.newPage(); pg.errs = []; pg.dev = dev; pg.touch = dev !== 'desktop';
  if (!TP.real) await ctx.route('**/office/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) pg.errs.push(m.text()); });
  await pg.goto(BASE); await pg.waitForFunction(() => window.OBT && OBT.booted, null, { timeout: 15000 });
  if (unlock) { await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code })))); await pg.reload(); await pg.waitForFunction(() => window.OBT && OBT.booted, null, { timeout: 15000 }); }
  return pg;
}
const vis = (pg, s) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) return false; for (let x = e; x && x.nodeType === 1; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return true; }, s);
const press = async (pg, sel) => { if (pg.touch) await pg.tap(sel, { timeout: 4000 }); else await pg.click(sel, { timeout: 4000 }); };
// smart = pick the best call; otherwise a wrong pick after asking Dr. B for a hint. Desktop uses digit keys, touch taps the option.
async function playCase(pg, id, smart, shot) {
  if (await vis(pg, '#debrief')) await press(pg, '#d-board');
  if (!(await vis(pg, '#select'))) { if (pg.touch) await pg.tap('#t-go'); else await pg.keyboard.press(' '); }
  await pg.waitForSelector('#select:not(.hidden)'); await press(pg, `.case[data-id="${id}"]`);
  await pg.waitForFunction(() => OBT.screen === 'desk'); await pg.waitForTimeout(700);
  if (shot) await pg.screenshot({ path: shot + '-reveal.png' });
  await pg.waitForFunction(() => OBT.reveal == null, null, { timeout: 6000 }); await pg.waitForTimeout(400);
  const L = await pg.evaluate(() => { const m = document.querySelector('#monitor').getBoundingClientRect(), d = document.querySelector('#desk').getBoundingClientRect(), s = document.querySelector('#strip').getBoundingClientRect();
    return { mw: m.width, vw: innerWidth, frac: m.height / d.height, sh: s.height, n: document.querySelectorAll('#choices .opt').length, keys: [...document.querySelectorAll('#choices .opt')].map(b => +b.dataset.i) }; });
  ok(L.mw >= L.vw - 2 && L.frac > 0.42 && L.frac < 0.6 && L.sh > 150, `${pg.dev} ${id}: strip spans the full width and about the top half (${Math.round(L.frac * 100)}%, ${Math.round(L.sh)}px tall)`);
  ok(L.n >= 4 && L.n <= 6, `${pg.dev} ${id}: one question with ${L.n} options`);
  if (shot) await pg.screenshot({ path: shot + '-desk.png' });
  const best = await pg.evaluate(() => OBT.t.bestKey());
  let k = best;
  if (!smart) { if (pg.touch) await press(pg, '#q-hint'); else await pg.keyboard.press('h'); await pg.waitForTimeout(150); ok(await vis(pg, '#q-hinttxt'), `${pg.dev} ${id}: Dr. B gives a hint`); k = best === 1 ? 2 : 1; }
  if (pg.touch) await pg.tap(`#choices .opt[data-k="${k}"]`); else await pg.keyboard.press(String(k));
  await pg.waitForSelector('#debrief:not(.hidden)', { timeout: 5000 });
  const r = await pg.evaluate(() => ({ screen: OBT.screen, grade: document.querySelector('#d-grade').textContent, score: OBT.result && OBT.result.total, g: OBT.result && OBT.result.g, paper: document.querySelector('#d-paper').innerHTML, imgs: document.querySelectorAll('#d-paper img.row').length, errs: OBT.errors.slice(), hist: JSON.parse(localStorage.getItem('obt.v1')).hist.length }));
  if (shot) { await pg.waitForTimeout(300); await pg.screenshot({ path: shot + '-debrief.png' }); await pg.evaluate(() => { const d = document.querySelector('#debrief'); d.scrollTop = document.querySelector('#d-paper img.row').offsetTop - 80; }); await pg.waitForTimeout(150); await pg.screenshot({ path: shot + '-debrief-strip.png' }); }
  return r;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  let pg = await open(b, 'desktop', false);
  ok(await vis(pg, '#lock') && !(await vis(pg, '#title')), 'no code: badge-access lock screen'); if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-lock.png' });
  await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 43).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code })))); await pg.reload(); await pg.waitForFunction(() => OBT.booted);
  ok(await vis(pg, '#lock'), 'expired code: still locked');
  await pg.context().close();
  const plan = { desktop: null, iPhone: [['abruption', true], ['quiet', false], ['mag', true]], iPad: [['rupture', true], ['sine', false], ['drop', true]] };
  for (const dev of ['desktop', 'iPhone', 'iPad']) {
    pg = await open(b, dev, true);
    ok(await vis(pg, '#title'), dev + ': a generated student code unlocks the title screen'); if (SHOTS) await pg.screenshot({ path: `${SHOTS}/triage-${dev}-title.png` });
    const ids = await pg.evaluate(() => OBC.CASES.map(c => c.id)); if (dev === 'desktop') ok(ids.length >= 14, ids.length + ' cases on the board');
    const list = plan[dev] || ids.map((id, i) => [id, i % 4 !== 1]);
    let first = true;
    for (const [id, smart] of list) {
      const r = await playCase(pg, id, smart, SHOTS && first ? `${SHOTS}/triage-${dev}-${id}` : ''); first = false;
      ok(r.screen === 'debrief', `${dev} ${id}${smart ? ' (best call)' : ' (wrong call after hint)'}: reached the debrief, grade ${r.grade} ${r.score}/100 (${r.g})`);
      ok(['Your call', 'read of the strip', 'Annotated strip', 'Every option', 'Summary', 'Pearls'].every(s => r.paper.includes(s)) && r.imgs >= 1, `${dev} ${id}: debrief has every section and ${r.imgs} annotated strip rows`);
      ok(smart ? r.score === 100 && r.g === 'best' : r.score < 90 && r.g !== 'best', `${dev} ${id}: ${smart ? 'the best call scores 100' : 'a wrong call scores below the best'} (${r.score})`);
      ok(!r.errs.length && !pg.errs.length, `${dev} ${id}: no runtime or console errors ${r.errs.concat(pg.errs).join(' | ').slice(0, 300)}`);
      await press(pg, '#d-board');
    }
    if (dev === 'desktop') {
      // history + replayed debrief
      await press(pg, '#hist-btn'); await pg.waitForSelector('#hist:not(.hidden)'); const n = await pg.$$eval('#hist-list .hrow', a => a.length);
      ok(n === list.length, 'case history lists every finished case (' + n + ')'); await pg.click('#hist-list .hrow');
      await pg.waitForSelector('#debrief:not(.hidden)'); ok(await pg.$$eval('#d-paper img.row', a => a.length) >= 1, 'history re-opens a debrief with its strip rebuilt by replay');
      ok(await vis(pg, '#d-print'), 'print / save PDF button present'); await press(pg, '#d-board');
      // pause with Esc mid-case
      await press(pg, '.case[data-id="quiet"]'); await pg.waitForFunction(() => OBT.screen === 'desk'); await pg.keyboard.press(' '); await pg.waitForFunction(() => OBT.reveal == null); await pg.waitForTimeout(300); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
      ok(await vis(pg, '#pause'), 'Esc pauses'); const t1 = await pg.evaluate(() => OBT.sim.t); await pg.waitForTimeout(800); ok(await pg.evaluate(() => OBT.sim.t) === t1, 'paused: the strip stops');
      await pg.keyboard.press(' '); ok(!(await vis(pg, '#pause')), 'Space resumes'); await pg.waitForTimeout(200); await pg.keyboard.press('Escape'); await pg.waitForSelector('#pause:not(.hidden)', { timeout: 3000 }); await pg.click('#pa-quit');
      // shift mode: triage 3 monitors
      await press(pg, '#shift-btn'); await pg.waitForSelector('#shift:not(.hidden)'); ok(await pg.$$eval('#sh-beds .sbed', a => a.length) === 3, 'shift mode shows three monitors');
      if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-desktop-shift.png' });
      for (const k of ['1', '2', '3']) await pg.keyboard.press(k); await pg.click('#sh-go'); ok(await vis(pg, '#sh-res'), 'Dr. Behram reviews the triage order');
      await pg.click('#sh-go'); await pg.waitForFunction(() => OBT.screen === 'desk'); ok(true, 'shift starts with the first chosen patient');
      for (let i = 0; i < 3; i++) { await pg.waitForFunction(() => OBT.screen === 'desk'); await pg.waitForFunction(() => OBT.reveal == null); await pg.keyboard.press(String(await pg.evaluate(() => OBT.t.bestKey()))); await pg.waitForSelector('#debrief:not(.hidden)'); if (i < 2) await pg.keyboard.press(' '); }
      ok((await pg.$eval('#d-paper', e => e.innerHTML)).includes('Shift report'), 'after the third patient the debrief adds a shift report');
      if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-desktop-shift-report.png' });
      // Attending mode (unlocked by the A grades above): no Dr. B prompt, no hint
      await press(pg, '#d-board'); await pg.waitForSelector('#select:not(.hidden)');
      if (await vis(pg, '#sel-att')) { await pg.click('#sel-att'); await press(pg, '.case[data-id="pit"]'); await pg.waitForFunction(() => OBT.screen === 'desk');
        ok(await pg.evaluate(() => OBT.att) && !(await vis(pg, '#v-dr')) && !(await vis(pg, '#q-hint')), 'Attending mode hides Dr. B and the hint'); if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-desktop-attending.png' }); }
      else ok(false, 'Attending toggle visible after A grades');
    }
    
    ok(!pg.errs.length, dev + ': no console errors overall ' + pg.errs.slice(0, 3).join(' | '));
    await pg.context().close();
  }
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
