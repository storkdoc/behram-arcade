// Browser test: NODE_PATH=/workspace/tools/node_modules node games/congressional-obgyn/tests/page.test.js [baseURL]
// Serve the repo root first: python3 -m http.server 8090
const { chromium } = require('playwright-core');
const TP = require('./testpin.js'); // the real PIN is never in the repo (COB_PIN env, else a test PIN)
const BASE = (process.argv[2] || 'http://localhost:8090') + '/games/congressional-obgyn/';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
async function page(b, opts) {
  const ctx = await b.newContext(opts); const pg = await ctx.newPage(); pg.errs = [];
  if (!TP.real) await ctx.route('**/congressional-obgyn/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error') pg.errs.push(m.text()); });
  await pg.goto(BASE); await pg.waitForFunction(() => window.COB && COB.booted, null, { timeout: 15000 }); return pg;
}
async function playEncounter(pg, touch, wrongFirst) {
  await pg.waitForSelector('#begin', { timeout: 8000 }); await pg.waitForTimeout(300);
  if (touch) await pg.tap('#begin'); else await pg.keyboard.press(' ');
  const n = await pg.evaluate(() => COB.debug.enc.qs.length);
  for (let i = 0; i < n; i++) {
    await pg.waitForSelector('.opt[data-nav]');
    const k = await pg.evaluate(w => { const q = COB.debug.enc.qs[COB.debug.enc.i]; const c = q.opts.findIndex(o => o.correct); return w ? (c + 1) % q.opts.length : c; }, wrongFirst && i === 0);
    if (touch) await pg.tap(`.opt[data-k="${k}"]`); else await pg.keyboard.press(String(k + 1));
    await pg.waitForSelector('#next'); await pg.waitForTimeout(120);
    if (touch) await pg.tap('#next'); else await pg.keyboard.press(' ');
  }
  await pg.waitForSelector('#back', { timeout: 5000 });
  const r = await pg.evaluate(() => COB.debug.day.results.slice(-1)[0]); await pg.waitForTimeout(300);
  if (touch) await pg.tap('#back'); else await pg.keyboard.press(' ');
  return r;
}
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  // ---- desktop, keyboard ----
  let pg = await page(b, { viewport: { width: 1440, height: 900 } });
  ok(await pg.isVisible('#codein') && await pg.isVisible('#instr'), 'gate shows code box and Instructor button');
  await pg.click('#codein'); await pg.keyboard.type('CONG-2345-6789'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  ok(/isn.t valid/.test(await pg.textContent('#code-err')), 'tampered/invalid code rejected in UI');
  const old = await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 43).then(c => c.code));
  await pg.fill('#codein', old); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  ok(/6 weeks are over/.test(await pg.textContent('#code-err')), 'expired code rejected in UI');
  await pg.evaluate(c => localStorage.setItem('cob.access', JSON.stringify({ code: c })), old); await pg.reload(); await pg.waitForFunction(() => COB.booted);
  ok((await pg.textContent('#s-gate')).includes('Your 6-week access has ended, ask Dr. Behram for a new code'), 'stored expired code -> expired screen on launch');
  // instructor via keyboard
  await pg.click('body', { position: { x: 5, y: 400 } }); await pg.keyboard.press('i'); await pg.waitForTimeout(200);
  for (const d of '1111') await pg.keyboard.press(d); await pg.waitForTimeout(500);
  ok(/Incorrect PIN/.test(await pg.textContent('#modal')), 'wrong PIN rejected');
  for (const d of TP.PIN) await pg.keyboard.press(d); await pg.waitForSelector('#bigcode', { timeout: 4000 });
  const code = (await pg.textContent('#bigcode')).trim();
  ok(/^CONG-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code), 'instructor PIN shows code ' + code);
  ok(/through .*2026|through .*2027/.test(await pg.textContent('#modal')), 'expiry shown');
  await pg.click('#more'); await pg.waitForTimeout(400); const code2 = (await pg.textContent('#bigcode')).trim();
  ok(code2 !== code && (await pg.textContent('.codelist')).includes(code), 'generate another code keeps history');
  // student uses generated code in a fresh context
  await pg.close();
  pg = await page(b, { viewport: { width: 1440, height: 900 } });
  await pg.click('#codein'); await pg.keyboard.type(code.toLowerCase()); await pg.keyboard.press('Enter'); await pg.waitForSelector('#go', { timeout: 4000 });
  ok(true, 'student code unlocks title');
  await pg.reload(); await pg.waitForFunction(() => COB.booted); ok(await pg.isVisible('#go'), 'code re-checked and accepted on relaunch');
  await pg.fill('#nm', 'Test Student'); await pg.keyboard.press('Enter'); await pg.keyboard.press(' ');
  await pg.waitForSelector('#hall-inner .door'); ok((await pg.$$('.door')).length === 4, 'hallway with 4 exam rooms');
  let seen = 0; const t0 = Date.now();
  while (seen < 6 && Date.now() - t0 > -1) {
    const room = await pg.waitForFunction(() => { const d = COB.debug.day; if (!d) return -1; for (let r = 0; r < 4; r++) { const id = d.rooms[r]; if (id && d.patients[id - 1].state === 'roomed' && !d.cleaning[r]) return r + 1; } return 0; }, null, { timeout: 60000, polling: 250 }).then(h => h.jsonValue());
    if (room < 0) break;
    await pg.keyboard.press(String(room)); const r = await playEncounter(pg, false, seen === 1); seen++;
    if (seen === 1) ok(r.ok === r.n && r.stars === 3, 'perfect encounter -> 3 stars');
    if (seen === 2) ok(r.ok === r.n - 1, 'one wrong answer recorded');
    await pg.waitForTimeout(400);
  }
  await pg.waitForSelector('#s-summary.show', { timeout: 20000 });
  const sum = await pg.textContent('#s-summary');
  ok(seen === 6 && /Clinic is closed/.test(sum), 'full clinic day of 6 patients reaches summary');
  ok(/[AB]/.test(await pg.textContent('.grade')), 'grade shown: ' + await pg.textContent('.grade'));
  const sv = await pg.evaluate(() => COB.debug.save);
  ok(sv.xp > 0 && sv.board.length === 1 && sv.board[0].name === 'Test Student' && sv.badges.fullday, 'XP, leaderboard and badges saved');
  ok(Object.keys(sv.mastery).length >= 5, 'mastery tracked for ' + Object.keys(sv.mastery).length + ' topics');
  ok(pg.errs.length === 0, 'desktop: no console errors ' + JSON.stringify(pg.errs));
  // ---- iPhone, touch ----
  const m = await page(b, IPHONE);
  await m.tap('#codein'); await m.keyboard.type(code2.replace(/-/g, '')); await m.tap('#code-go'); await m.waitForSelector('#go');
  await m.tap('#go'); await m.waitForSelector('.srow[data-room]');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPhone: no horizontal page overflow');
  await m.locator('.srow[data-room]').first().tap(); const mr = await playEncounter(m, true);
  ok(mr && mr.ok === mr.n, 'iPhone: touch encounter completed');
  await m.waitForSelector('.door-tag[data-nav]', { timeout: 10000 }); await m.locator('.door-tag[data-nav]').first().tap(); await playEncounter(m, true, true);
  ok(true, 'iPhone: door-tag tap opens encounter');
  ok(m.errs.length === 0, 'iPhone: no console errors ' + JSON.stringify(m.errs));
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
