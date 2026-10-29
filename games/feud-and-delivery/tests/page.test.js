// Browser test: NODE_PATH=/workspace/tools/node_modules node games/feud-and-delivery/tests/page.test.js [baseURL] [shotDir]
// Serve the repo root first (python3 -m http.server 8090). Uses the office game's test-PIN helper: the real PIN is never in the repo.
const { chromium } = require('playwright-core');
const TP = require('../../congressional-obgyn/tests/testpin.js');
const ROOT = process.argv[2] || 'http://localhost:8090';
const BASE = ROOT + '/games/feud-and-delivery/', OFFICE = ROOT + '/games/congressional-obgyn/';
const SHOTS = process.argv[3] || '/tmp/feud-shots';
require('fs').mkdirSync(SHOTS, { recursive: true });
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const ARGS = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: UA };
const IPHONE_L = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: UA };
const IPAD = { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: UA.replace('iPhone; CPU iPhone OS', 'iPad; CPU OS') };
const shot = (pg, n) => pg.screenshot({ path: SHOTS + '/' + n + '.png' });
async function ctxOf(b, opts) {
  const ctx = await b.newContext(opts);
  if (!TP.real) await ctx.route('**/congressional-obgyn/js/access.js*', r => r.fulfill({ contentType: 'text/javascript', body: TP.patchedAccessSource() }));
  return ctx;
}
function watch(pg) { pg.errs = []; pg.on('pageerror', e => pg.errs.push('pageerror ' + e.message)); pg.on('console', m => { if (m.type() === 'error') pg.errs.push(m.text()); }); return pg; }
let LAST = null;
async function open(ctx, url) { const pg = LAST = watch(await ctx.newPage()); await pg.goto(url || BASE); await pg.waitForFunction(() => window.FEUD && FEUD.booted, null, { timeout: 15000 }); return pg; }
const st = pg => pg.evaluate(() => FEUD.debug.state());
const until = (pg, fn, arg, t) => pg.waitForFunction(fn, arg, { timeout: t || 30000, polling: 100 });
async function unlock(pg, touch) {
  const code = await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay()).then(c => c.code));
  if (touch) { await pg.tap('#codein'); await pg.keyboard.type(code); await pg.tap('#code-go'); } else { await pg.fill('#codein', code); await pg.keyboard.press('Enter'); }
  await pg.waitForSelector('#m1', { timeout: 5000 }); return code;
}
// answer the current prompt: type + Enter (keyboard) or fill + tap (touch)
async function answer(pg, text, touch) {
  await until(pg, () => FEUD.debug.state().mode === 'answer' && !!document.querySelector('#ans'));
  if (touch) { await pg.tap('#ans'); await pg.fill('#ans', text); await pg.tap('#say'); }
  else { await pg.focus('#ans'); await pg.keyboard.type(text); await pg.keyboard.press('Enter'); }
  await until(pg, () => FEUD.debug.state().mode !== 'answer' || FEUD.debug.state().busy);
}
const label = (pg, i) => pg.evaluate(i => FEUD.G.round.r.a[i][0], i);
async function waitDock(pg) { await until(pg, () => !!document.querySelector('#dk-go')); await pg.waitForTimeout(150); }

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ARGS });
  // ================= desktop 1440x900, keyboard =================
  let ctx = await ctxOf(b, { viewport: { width: 1440, height: 900 } });
  let pg = await open(ctx);
  ok(await pg.isVisible('#codein') && await pg.isVisible('#instr'), 'lock screen: code box + INSTRUCTOR button');
  ok((await pg.title()) === 'FEUD & DELIVERY — Behram Arcade', 'page title is Feud & Delivery');
  await shot(pg, 'd01-gate');
  await pg.fill('#codein', 'CONG-2345-6789'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  ok(/isn.t valid/.test(await pg.textContent('#code-err')), 'made-up code rejected');
  const old = await pg.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 43).then(c => c.code));
  await pg.fill('#codein', old); await pg.keyboard.press('Enter'); await pg.waitForTimeout(400);
  ok(/6 weeks are over/.test(await pg.textContent('#code-err')), 'expired code rejected');
  await pg.evaluate(c => localStorage.setItem('cob.access', JSON.stringify({ code: c })), old); await pg.reload(); await pg.waitForFunction(() => FEUD.booted);
  ok((await pg.textContent('#s-gate')).includes('Your 6-week access has ended'), 'stored expired code -> access-ended screen');
  await pg.click('body', { position: { x: 5, y: 450 } }); await pg.keyboard.press('i'); await pg.waitForTimeout(200);
  for (const d of '1111') await pg.keyboard.press(d); await pg.waitForTimeout(500);
  ok(/Incorrect PIN/.test(await pg.textContent('#modal')), 'wrong PIN rejected');
  for (const d of TP.PIN) await pg.keyboard.press(d); await pg.waitForSelector('#bigcode', { timeout: 4000 });
  const code = (await pg.textContent('#bigcode')).trim();
  ok(/^CONG-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/.test(code), 'instructor PIN -> student code ' + code);
  await shot(pg, 'd02-instructor-code');
  await pg.click('#done'); await pg.waitForSelector('#m1'); ok(true, 'instructor gets full access');
  await ctx.close();
  // instructor code unlocks for a student
  ctx = await ctxOf(b, { viewport: { width: 1440, height: 900 } }); pg = await open(ctx);
  await pg.fill('#codein', code.toLowerCase()); await pg.keyboard.press('Enter'); await pg.waitForSelector('#m1', { timeout: 4000 });
  ok(true, 'instructor-made code unlocks the title');
  await ctx.close();
  // a code entered in the OFFICE game unlocks this game too
  ctx = await ctxOf(b, { viewport: { width: 1440, height: 900 } });
  const op = watch(await ctx.newPage()); await op.goto(OFFICE); await op.waitForFunction(() => window.COB && COB.booted, null, { timeout: 15000 });
  const ocode = await op.evaluate(() => COBAccess.makeCode(COBAccess.nyDay() - 10).then(c => c.code));
  await op.fill('#codein', ocode); await op.keyboard.press('Enter'); await op.waitForSelector('#go', { timeout: 5000 });
  pg = await open(ctx); await pg.waitForSelector('#m1', { timeout: 5000 });
  ok(await pg.isVisible('#m1') && !(await pg.isVisible('#codein')), 'code entered in Congressional OB GYN unlocks Feud & Delivery (shared lock)');
  await pg.waitForTimeout(600); await shot(pg, 'd03-title');

  // ---- 2P match: face-off, play, 3 strikes, steal ----
  await pg.keyboard.press('2'); await pg.waitForSelector('#go'); await shot(pg, 'd04-setup');
  await pg.click('#go'); await waitDock(pg); await pg.waitForTimeout(400); await shot(pg, 'd05-round');
  await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().mode === 'buzz');
  await pg.keyboard.press('a'); let s = await st(pg); ok(s.kind === 'faceoff' && s.side === 0, 'A key buzzes in the left team');
  await answer(pg, await label(pg, 0)); // #1 answer wins the face-off outright
  await waitDock(pg); s = await st(pg); ok(s.phase === 'playOrPass' && s.bank > 0, 'top answer wins the face-off; play or pass offered');
  await shot(pg, 'd06-playpass');
  await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().kind === 'play' && FEUD.debug.state().mode === 'answer');
  ok((await st(pg)).control === 0, 'SPACE = PLAY, left team in control');
  const nl = await pg.evaluate(() => FEUD.G.round.r.a.length);
  if (nl > 2) { await answer(pg, await label(pg, 2)); await until(pg, () => FEUD.debug.state().mode === 'answer'); }
  await pg.focus('#ans'); await pg.keyboard.type(await label(pg, 0)); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
  s = await st(pg); ok(s.strikes === 0 && s.mode === 'answer', 'duplicate answer: try again, no strike');
  await pg.fill('#ans', ''); await answer(pg, 'qwzx plorbitis');
  await until(pg, () => FEUD.debug.state().strikes === 1); await pg.waitForTimeout(250); await shot(pg, 'd07-strike1');
  await answer(pg, 'mercury retrograde'); await pg.waitForTimeout(1800); await shot(pg, 'd08-gag-nope');
  await until(pg, () => FEUD.debug.state().strikes === 2);
  await answer(pg, 'zzzz'); await until(pg, () => FEUD.debug.state().strikes === 3);
  await until(pg, () => document.body.classList.contains('slowmo')); await pg.waitForTimeout(500); await shot(pg, 'd09-strike3-slowmo');
  ok(true, 'three strikes (incl. a 0-point gag) -> slow-mo third strike');
  await until(pg, () => FEUD.debug.state().kind === 'steal' && FEUD.debug.state().mode === 'answer');
  s = await st(pg); ok(s.side === 1, 'other team gets ONE steal');
  await shot(pg, 'd10-steal');
  await answer(pg, await label(pg, 1));
  await waitDock(pg); s = await st(pg);
  ok(s.stealResult === true && s.scores[1] > 0 && s.scores[0] === 0, 'steal succeeds: right team banks ' + s.scores[1]);
  await pg.waitForTimeout(300); await shot(pg, 'd11-round-over');
  await pg.keyboard.press(' '); await pg.waitForSelector('#s-pearls.show'); await pg.waitForTimeout(300);
  const pearls = await pg.$$('#s-pearls .pearl:not(.joke)');
  ok(pearls.length === nl && /approximate relative likelihood/.test(await pg.textContent('#s-pearls')), 'reveal-all + a teaching pearl per diagnosis + disclaimer');
  await shot(pg, 'd12-pearls');
  // ---- rounds 2-4 via the HOST OVERRIDE panel ----
  for (let r = 1; r < 4; r++) {
    await pg.keyboard.press(' '); await waitDock(pg);
    await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().mode === 'buzz');
    await pg.keyboard.press(r % 2 ? 'l' : 'a'); await until(pg, () => FEUD.debug.state().mode === 'answer');
    await pg.keyboard.press('Escape'); await pg.keyboard.press('h'); await pg.waitForSelector('#hostpanel:not(.hidden) .slot');
    if (r === 1) { await pg.waitForTimeout(200); await shot(pg, 'd13-hostpanel'); }
    await pg.click('#hostpanel .slot[data-i="0"]'); await waitDock(pg);
    s = await st(pg); ok(s.phase === 'playOrPass', 'round ' + (r + 1) + ': host override judged the face-off');
    await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().mode === 'answer');
    await pg.keyboard.press('Escape'); await pg.keyboard.press('h'); await pg.waitForSelector('#hp-all:not([disabled])'); await pg.click('#hp-all');
    await waitDock(pg); await pg.keyboard.press(' '); await pg.waitForSelector('#s-pearls.show');
  }
  s = await st(pg); ok(s.history.length === 4 && s.roundIdx === 3, 'four rounds played (x1, x1, x2, x3): ' + JSON.stringify(s.scores));
  await pg.keyboard.press(' ');
  if (await pg.evaluate(() => FEUD.G.match.needsSudden())) {
    await waitDock(pg); await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().mode === 'buzz'); await pg.keyboard.press('a');
    await answer(pg, await label(pg, 0)); await waitDock(pg); await pg.keyboard.press(' '); await pg.waitForSelector('#s-pearls.show'); await pg.keyboard.press(' ');
    ok(true, 'tie -> sudden death played');
  }
  await waitDock(pg); await pg.waitForTimeout(500); await shot(pg, 'd14-match-win');
  ok(await pg.evaluate(() => FEUD.G.match.over()), 'match over with a winner');
  // ---- Fast Money ----
  await pg.keyboard.press(' '); await pg.waitForSelector('#s-fm.show'); await waitDock(pg);
  await pg.keyboard.press(' '); await until(pg, () => FEUD.debug.state().fm.running);
  for (let i = 0; i < 5; i++) {
    await until(pg, i => FEUD.debug.state().fm.i === i && document.activeElement && document.activeElement.id === 'ans', i);
    if (i === 2) { await pg.keyboard.press('Tab'); continue; } // pass, comes back later
    await pg.keyboard.type(await pg.evaluate(i => FEUD.G.fmState.fm.prompts[i].a[0][0], i)); await pg.keyboard.press('Enter');
  }
  await until(pg, () => FEUD.debug.state().fm.i === 2 && document.activeElement && document.activeElement.id === 'ans'); ok(true, 'Fast Money: passed condition comes back around');
  await pg.waitForTimeout(200); await shot(pg, 'd15-fm-seat1');
  await pg.keyboard.type('pineapple deficiency'); await pg.keyboard.press('Enter');
  await until(pg, () => FEUD.debug.state().fm.mode === 'reveal'); await pg.waitForTimeout(2500); await shot(pg, 'd16-fm-reveal');
  await until(pg, () => FEUD.debug.state().fm.total >= 200 ? true : !!document.querySelector('#dk-go'), null, 40000);
  const fm1 = (await st(pg)).fm;
  ok(fm1.total >= 100, 'seat 1 scored ' + fm1.total);
  if (fm1.total < 200) {
    await waitDock(pg); await pg.keyboard.press(' ');
    await until(pg, () => FEUD.debug.state().fm.running && document.activeElement && document.activeElement.id === 'ans');
    // a duplicate of seat 1 buzzes and must be retried
    await pg.keyboard.type(await pg.evaluate(() => FEUD.G.fmState.fm.prompts[0].a[0][0])); await pg.keyboard.press('Enter'); await pg.waitForTimeout(250);
    ok((await st(pg)).fm.i === 0, 'Fast Money: repeating partner\'s answer -> try again');
    for (let i = 0; i < 5; i++) {
      await until(pg, i => FEUD.debug.state().fm.i === i && document.activeElement && document.activeElement.id === 'ans', i);
      await pg.fill('#ans', ''); await pg.keyboard.type(await pg.evaluate(i => FEUD.G.fmState.fm.prompts[i].a[1][0], i)); await pg.keyboard.press('Enter');
    }
  }
  await until(pg, () => FEUD.debug.state().fm.mode === 'over', null, 40000); await pg.waitForTimeout(1500); await shot(pg, 'd17-fm-end');
  const fmT = (await st(pg)).fm.total; ok(fmT >= 200, 'Fast Money reaches 200 with top answers: ' + fmT);
  await waitDock(pg); await pg.keyboard.press(' '); await pg.waitForSelector('#s-results.show'); await pg.waitForTimeout(400); await shot(pg, 'd18-results');
  ok(pg.errs.length === 0 && op.errs.length === 0, 'desktop: no console errors ' + JSON.stringify(pg.errs.concat(op.errs)));
  await ctx.close();

  // ================= iPhone portrait, touch, 1P vs Night Float =================
  ctx = await ctxOf(b, IPHONE); pg = await open(ctx);
  await shot(pg, 'p01-gate'); await unlock(pg, true); await pg.waitForTimeout(500); await shot(pg, 'p02-title');
  await pg.tap('#m1'); await pg.waitForSelector('#go'); await shot(pg, 'p03-setup');
  await pg.tap('#go'); await waitDock(pg); await pg.waitForTimeout(300); await shot(pg, 'p04-round');
  await pg.tap('#dk-go'); await until(pg, () => FEUD.debug.state().mode === 'buzz'); await pg.tap('#buzz0');
  s = await st(pg); ok(s.kind === 'faceoff' && s.side === 0, 'iPhone: tap BUZZ beats Night Float');
  await answer(pg, 'qwzx plorbitis', true);
  await until(pg, () => FEUD.debug.state().side === 1 || FEUD.debug.state().mode === 'buzz', null, 15000);
  await pg.waitForTimeout(900); await shot(pg, 'p05-rival-typing');
  // whatever Night Float does, play the round to the end by answering whenever it is our turn
  for (const t0 = Date.now(); Date.now() - t0 < 240000;) {
    s = await st(pg);
    if (s.phase === 'done' || s.mode === 'end') break;
    // the dock re-renders between reading state and tapping, so a missed tap just loops again
    if (s.mode === 'buzz') { await pg.tap('#buzz0', { timeout: 3000 }).catch(() => {}); continue; }
    if (s.mode === 'playpass' || s.mode === 'intro') { await pg.tap('#dk-go', { timeout: 3000 }).catch(() => {}); continue; }
    if (s.mode === 'answer' && s.side === 0 && await pg.$('#ans')) { await answer(pg, s.kind === 'faceoff' ? await pg.evaluate(() => { const r = FEUD.G.round; let i = r.revealed.findIndex((v, k) => !v && k > 0); if (i < 0) i = r.revealed.findIndex(v => !v); return r.r.a[i][0]; }) : s.kind === 'play' ? 'nope nope' : 'zzzz', true); continue; }
    await pg.waitForTimeout(400);
  }
  await waitDock(pg); s = await st(pg); ok(s.history.length === 1, 'iPhone: solo round vs simulated rival completes (' + JSON.stringify(s.scores) + ')');
  await shot(pg, 'p06-round-over');
  await pg.tap('#dk-go'); await pg.waitForSelector('#s-pearls.show'); await pg.waitForTimeout(300); await shot(pg, 'p07-pearls');
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 391, 'iPhone: no horizontal overflow (' + sw + ')');
  await pg.evaluate(() => FEUD.quit()); await pg.tap('#t-fm'); await pg.waitForSelector('#s-fm.show'); await waitDock(pg); await pg.tap('#dk-go');
  await until(pg, () => !!document.querySelector('#ans')); await pg.tap('#ans'); await pg.keyboard.type('endometriosis'); await pg.waitForTimeout(400); await shot(pg, 'p08-fm');
  ok(pg.errs.length === 0, 'iPhone: no console errors ' + JSON.stringify(pg.errs));
  await ctx.close();

  // ================= iPhone landscape + iPad: layouts (fast mode) =================
  for (const [nm, dev] of [['l', IPHONE_L], ['i', IPAD]]) {
    ctx = await ctxOf(b, dev); pg = await open(ctx); await unlock(pg, true); await pg.waitForTimeout(400); await shot(pg, nm + '01-title');
    await pg.tap('#m2'); await pg.tap('#go'); await waitDock(pg); await pg.tap('#dk-go'); await until(pg, () => FEUD.debug.state().mode === 'buzz');
    await pg.tap('#buzz1'); await answer(pg, await label(pg, 1), true); await pg.waitForTimeout(1800);
    await until(pg, () => FEUD.debug.state().mode === 'answer'); await shot(pg, nm + '02-board');
    const ov = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    ok(ov[0] <= ov[1] + 1, nm + ': no horizontal overflow ' + ov);
    ok(await pg.isVisible('#buzz0') && await pg.isVisible('#ans'), nm + ': buzzers and answer box visible');
    await pg.evaluate(() => FEUD.quit()); await pg.tap('#t-fm'); await waitDock(pg); await pg.waitForTimeout(300); await shot(pg, nm + '03-fm');
    ok(pg.errs.length === 0, nm + ': no console errors ' + JSON.stringify(pg.errs));
    await ctx.close();
  }
  await b.close();
  console.log(fail ? fail + ' FAILED' : 'ALL PAGE TESTS PASSED'); process.exit(fail ? 1 : 0);
})().catch(async e => { console.error(e); try { console.log(await LAST.evaluate(() => JSON.stringify(FEUD.debug.state()) + ' | ' + document.querySelector('#dock') && document.querySelector('.show .dock, #s-' + FEUD.screen() + ' .dock').innerText)); await LAST.screenshot({ path: SHOTS + '/zz-fail.png' }); } catch (x) {} process.exit(1); });
