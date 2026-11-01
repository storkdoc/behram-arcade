// Browser test for OB TRIAGE: NODE_PATH=/workspace/tools/node_modules node games/dr-behrams-office/triage/tests/page.test.js [baseURL]
// Serve the repo root first (python3 -m http.server 8090). Desktop (keyboard), iPhone and iPad (touch): lock screen, unlock with a
// generated student code (throwaway test PIN, see office/tests/testpin.js), a bot plays cases end to end through the real UI,
// checks the debrief, history, shift mode and pause, with no console errors. SHOTS=<dir> saves screenshots. ALL=1 plays every case on desktop.
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
const st = pg => pg.evaluate(() => OBT.screen + '/' + OBT.phase);
// smart = answer and act like a strong student (from the case's own key); otherwise a plausible-but-random student
async function playCase(pg, id, smart, shot) {
  if (!(await vis(pg, '#select'))) { await pg.evaluate(() => { document.querySelector('#d-board') && !document.querySelector('#debrief').classList.contains('hidden') ? document.querySelector('#d-board').click() : null; }); }
  if (!(await vis(pg, '#select'))) { if (pg.touch) await pg.tap('#t-go'); else await pg.keyboard.press(' '); }
  await pg.waitForSelector('#select:not(.hidden)'); await press(pg, `.case[data-id="${id}"]`); await pg.waitForSelector('#brief:not(.hidden)');
  if (shot) await pg.screenshot({ path: shot + '-brief.png' });
  await pg.waitForTimeout(150); if (pg.touch) await pg.tap('#br-go'); else await pg.keyboard.press(' ');
  await pg.waitForFunction(() => OBT.screen === 'desk' && OBT.phase === 'watch'); await pg.waitForTimeout(1800);
  if (shot) await pg.screenshot({ path: shot + '-watch.png' });
  // to analysis: Space or the touch ACTION pad
  if (pg.touch) await pg.tap('#bA'); else await pg.keyboard.press(' ');
  await pg.waitForFunction(() => OBT.phase === 'analyze');
  // mark events on the strip: true events (smart) or a random spot; type via the popover (digit keys / taps)
  const evs = await pg.evaluate(() => OBT.t.key().events.slice(-4).map(e => ({ t: (e.t0 + e.t1) / 2, type: e.type })));
  const T = ['accel', 'early', 'late', 'variable', 'prolonged'];
  for (const e of (smart ? evs : evs.slice(0, 1))) {
    const xy = await pg.evaluate(t => { OBT.view = Math.min(OBT.sim.t, t + 200); document.querySelector('#strip').scrollIntoView({ block: 'center' }); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { const c = document.querySelector('#strip').getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const g = OBT.t.geo(); r({ x: c.left + g.X(t) / dpr, y: c.top + c.height * 0.3 }); }))); }, e.t);
    if (pg.touch) await pg.touchscreen.tap(xy.x, xy.y); else await pg.mouse.click(xy.x, xy.y);
    await pg.waitForSelector('#pop:not(.hidden)', { timeout: 3000 });
    const k = smart ? T.indexOf(e.type) + 1 : 1 + Math.floor(Math.random() * 5);
    if (pg.touch) { await pg.waitForTimeout(450); await pg.tap(`#pop button:nth-of-type(${k})`); } else await pg.keyboard.press(String(k));
  }
  if (shot) await pg.screenshot({ path: shot + '-marks.png' });
  // answer the six questions with chips (keyboard digits on desktop focus flow, taps on touch)
  const K = await pg.evaluate(() => { const k = OBT.t.key(); return { baseline: String(k.baseline), variability: k.variability, accels: k.accels, decel: k.decel, uc: k.uc, cat: k.cat }; });
  for (const q of ['baseline', 'variability', 'accels', 'decel', 'uc', 'cat']) {
    const sel = smart ? `#panel .chip[data-q="${q}"][data-v="${K[q]}"]` : `#panel .chip[data-q="${q}"]`;
    const n = await pg.$$eval(`#panel .chip[data-q="${q}"]`, a => a.length);
    const el = smart ? await pg.$(sel) : (await pg.$$(sel))[Math.floor(Math.random() * n)];
    if (!el) { ok(false, id + ': answer chip for ' + q + ' = ' + K[q] + ' exists'); continue; }
    await (pg.touch ? el.tap() : el.click());
  }
  if (!smart && !pg.touch) await pg.keyboard.press('Enter'); // ask Dr. B for a hint
  await pg.waitForTimeout(150); if (shot) await pg.screenshot({ path: shot + '-analyze.png' });
  await press(pg, '#p-submit'); await pg.waitForFunction(() => OBT.phase === 'feedback' || OBT.phase === 'act');
  if (shot) await pg.screenshot({ path: shot + '-feedback.png' });
  if (await st(pg) === 'desk/feedback') await press(pg, '#p-act');
  await pg.waitForFunction(() => OBT.phase === 'act');
  // act: smart = every key/good action in order of deadline; otherwise two random actions
  const acts = await pg.evaluate(smart => { const c = OBT.case; const g = Object.entries(c.grades).filter(([k, v]) => v.g === 'key' && !v.after).sort((a, b) => a[1].by - b[1].by).map(x => x[0]);
    const good = Object.entries(c.grades).filter(([k, v]) => v.g === 'good' && k !== 'cs' && k !== 'ovd').map(x => x[0]); const all = Object.keys(OBC.ACTIONS).filter(a => a !== 'cs' && a !== 'ovd');
    return smart ? g.filter(a => a !== 'cs' && a !== 'ovd').concat(good.slice(0, 2), g.filter(a => a === 'cs' || a === 'ovd')) : [all[Math.floor(Math.random() * all.length)], all[Math.floor(Math.random() * all.length)]]; }, smart);
  for (const a of acts) { if (await st(pg) !== 'desk/act') break; await press(pg, `#panel .act[data-a="${a}"]`).catch(() => {}); await pg.waitForTimeout(250); }
  if (shot) { await pg.waitForTimeout(600); await pg.screenshot({ path: shot + '-act.png' }); }
  // speed up (F key / speed buttons), answer rechecks and asks, deliver when the case calls for it
  const t0 = Date.now(); let dlv = false;
  while (Date.now() - t0 < 240000) {
    const s = await st(pg); if (s.startsWith('debrief')) break;
    if (s === 'desk/act') {
      if (await pg.evaluate(() => OBT.speed) < 40) await press(pg, '#speeds button:last-child').catch(() => {});
      const later = await pg.evaluate(() => { const c = OBT.case, d = [], f = OBT.flags || {}; for (const [k, v] of Object.entries(c.grades)) if (v.g === 'key' && v.after && (v.after === 'recheck' ? OBT.rechecks.length : f[v.after]) && !OBT.log.some(l => l.id === k)) d.push(k); return d; });
      if (smart) for (const a of later) { if (a === 'cs' || a === 'ovd') { dlv = true; } await press(pg, `#panel .act[data-a="${a}"]`).catch(() => {}); await pg.waitForTimeout(150); }
    }
    if (s === 'desk/recheck') { const chips = await pg.$$('#panel .chip[data-rq]'); const want = smart ? String(await pg.evaluate(() => OBT.rq.correct)) : null; let i = Math.floor(Math.random() * chips.length); if (want != null) for (let k = 0; k < chips.length; k++) if (await chips[k].getAttribute('data-rq') === want) i = k; await (pg.touch ? chips[i].tap() : chips[i].click()).catch(() => {}); }
    await pg.waitForTimeout(400);
  }
  const r = await pg.evaluate(() => ({ screen: OBT.screen, grade: document.querySelector('#d-grade').textContent, score: OBT.result && OBT.result.total, paper: document.querySelector('#d-paper').innerHTML, imgs: document.querySelectorAll('#d-paper img.row').length, errs: OBT.errors.slice(), hist: JSON.parse(localStorage.getItem('obt.v1')).hist.length, how: OBT.result && OBT.result.how }));
  if (shot) { await pg.waitForTimeout(300); await pg.screenshot({ path: shot + '-debrief.png' }); await pg.evaluate(() => { document.querySelector('#debrief').scrollTop = 700; }); await pg.screenshot({ path: shot + '-debrief-strip.png' }); }
  return r;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  let pg = await open(b, 'desktop', false);
  ok(await vis(pg, '#lock') && !(await vis(pg, '#title')), 'no code: badge-access lock screen'); if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-lock.png' });
  await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 43).then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code })))); await pg.reload(); await pg.waitForFunction(() => OBT.booted);
  ok(await vis(pg, '#lock'), 'expired code: still locked');
  await pg.context().close();
  const plan = { desktop: process.env.ALL ? null : [['pit', true], ['cord', false], ['prolapse', true], ['push', true], ['heads', false]], iPhone: [['abruption', true], ['quiet', false]], iPad: [['rupture', true], ['sine', false]] };
  for (const dev of ['desktop', 'iPhone', 'iPad']) {
    pg = await open(b, dev, true);
    ok(await vis(pg, '#title'), dev + ': a generated student code unlocks the title screen'); if (SHOTS) await pg.screenshot({ path: `${SHOTS}/triage-${dev}-title.png` });
    const ids = await pg.evaluate(() => OBC.CASES.map(c => c.id)); if (dev === 'desktop') ok(ids.length >= 12, ids.length + ' cases on the board');
    const list = plan[dev] || ids.map((id, i) => [id, i % 3 !== 1]);
    let first = true;
    for (const [id, smart] of list) {
      const r = await playCase(pg, id, smart, SHOTS && first ? `${SHOTS}/triage-${dev}-${id}` : ''); first = false;
      ok(r.screen === 'debrief', `${dev} ${id}${smart ? ' (strong student)' : ' (random student)'}: reached the debrief, grade ${r.grade} ${r.score}/100, ${r.how}`);
      ok(['Annotated strip', 'Your interpretation', 'What you did', 'What should have happened', 'Summary', 'Pearls', 'Outcome', 'pH'].every(s => r.paper.includes(s)) && r.imgs >= 2, `${dev} ${id}: debrief has every section and ${r.imgs} annotated strip rows`);
      if (smart) ok(r.score >= 75, `${dev} ${id}: a strong student scores well (${r.score})`);
      ok(!r.errs.length && !pg.errs.length, `${dev} ${id}: no runtime or console errors ${r.errs.concat(pg.errs).join(' | ').slice(0, 300)}`);
      await press(pg, '#d-board');
    }
    if (dev === 'desktop') {
      // history + replayed debrief
      await press(pg, '#hist-btn'); await pg.waitForSelector('#hist:not(.hidden)'); const n = await pg.$$eval('#hist-list .hrow', a => a.length);
      ok(n === list.length, 'case history lists every finished case (' + n + ')'); await pg.click('#hist-list .hrow');
      await pg.waitForSelector('#debrief:not(.hidden)'); ok(await pg.$$eval('#d-paper img.row', a => a.length) >= 2, 'history re-opens a debrief with its strip rebuilt by replay');
      ok(await vis(pg, '#d-print'), 'print / save PDF button present'); await press(pg, '#d-board');
      // pause with Esc mid-case
      await press(pg, '.case[data-id="quiet"]'); await pg.waitForSelector('#brief:not(.hidden)'); await pg.waitForTimeout(150); await pg.keyboard.press(' '); await pg.waitForFunction(() => OBT.screen === 'desk'); await pg.waitForTimeout(200); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
      ok(await vis(pg, '#pause'), 'Esc pauses'); const t1 = await pg.evaluate(() => OBT.sim.t); await pg.waitForTimeout(800); ok(await pg.evaluate(() => OBT.sim.t) === t1, 'paused: the strip stops');
      await pg.keyboard.press(' '); ok(!(await vis(pg, '#pause')), 'Space resumes'); await pg.waitForTimeout(200); await pg.keyboard.press('Escape'); await pg.waitForSelector('#pause:not(.hidden)', { timeout: 3000 }); await pg.click('#pa-quit');
      // shift mode: triage 3 monitors
      await press(pg, '#shift-btn'); await pg.waitForSelector('#shift:not(.hidden)'); ok(await pg.$$eval('#sh-beds .sbed', a => a.length) === 3, 'shift mode shows three monitors');
      if (SHOTS) await pg.screenshot({ path: SHOTS + '/triage-desktop-shift.png' });
      for (const k of ['1', '2', '3']) await pg.keyboard.press(k); await pg.click('#sh-go'); ok(await vis(pg, '#sh-res'), 'Dr. Behram reviews the triage order');
      await pg.click('#sh-go'); await pg.waitForSelector('#brief:not(.hidden)'); ok(true, 'shift starts with the first chosen patient');
    }
    if (SHOTS && dev !== 'desktop') { await press(pg, '.case[data-id="pit"]'); await press(pg, '#br-go'); await pg.waitForTimeout(1500); await pg.screenshot({ path: `${SHOTS}/triage-${dev}-monitor.png` }); }
    ok(!pg.errs.length, dev + ': no console errors overall ' + pg.errs.slice(0, 3).join(' | '));
    await pg.context().close();
  }
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
