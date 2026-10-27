/* THE LIVING BOARD: browser test (Chromium + WebKit, desktop + iPhone viewport).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=/workspace/tools/node_modules node games/living-chess/tests/page.test.js [chromium|webkit] [desktop|iphone] [full]
   Speech is replaced by a recording stand-in so voices can be checked headless. */
const pw = require('playwright-core');
const [ENG = 'chromium', DEV = 'desktop', FULL] = process.argv.slice(2);
const URL = process.env.URL || 'http://localhost:8080/games/living-chess/?fast=1';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); };
const FAKE_SPEECH = () => {
  window.__utter = [];
  const voices = ['Samantha|en-US', 'Daniel|en-GB', 'Karen|en-AU', 'Moira|en-IE', 'Alex|en-US', 'Fred|en-US', 'Tessa|en-ZA'].map((s, i) => { const [name, lang] = s.split('|'); return { name, lang, localService: true, default: i === 0, voiceURI: name }; });
  class FU { constructor(t) { this.text = t; this.pitch = 1; this.rate = 1; this.volume = 1; this.voice = null; } }
  const SS = { speaking: false, pending: false, paused: false, getVoices: () => voices,
    speak(u) { __utter.push({ text: u.text, pitch: u.pitch, rate: u.rate, voice: u.voice && u.voice.name, volume: u.volume }); this.speaking = true;
      setTimeout(() => { u.onstart && u.onstart({}); u.onboundary && u.onboundary({ name: 'word', charIndex: 0 }); setTimeout(() => { this.speaking = false; u.onend && u.onend({}); }, 400); }, 10); },
    cancel() { this.speaking = false; __utter.push({ cancel: true }); }, pause() { }, resume() { }, addEventListener() { }, removeEventListener() { } };
  Object.defineProperty(window, 'speechSynthesis', { value: SS, configurable: true }); window.SpeechSynthesisUtterance = FU;
};
(async () => {
  const phone = DEV === 'iphone';
  const b = ENG === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctxo = phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' } : { viewport: { width: 1280, height: 800 } };
  if (phone && ENG === 'chromium') ctxo.isMobile = true;
  const ctx = await b.newContext(ctxo); await ctx.addInitScript(FAKE_SPEECH);
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /living-chess|black/.test(m.text()))) errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  console.log(`== ${ENG} ${DEV}`);
  await p.goto(URL); await p.waitForFunction(() => window.LCG && LCG.booted && LCG.screen === 'title', null, { timeout: 120000 });
  const st0 = await p.evaluate(() => LCG.api.state());
  check(/stockfish/i.test(st0.engine), 'Stockfish WASM engine loaded', st0.engine);
  if (phone && ENG === 'webkit') check(st0.render.ios && st0.render.maxTier <= 1, 'iOS: no float post targets (max quality 1)', st0.render);
  const titles = await p.evaluate(() => [...document.querySelectorAll('#title .btn')].map(b => b.textContent.trim()));
  check(titles.some(t => /JOIN TWO-PLAYER GAME IN PROGRESS/.test(t)) && titles.some(t => /1 PLAYER/.test(t)) && titles.some(t => /HOST/.test(t)), 'title menu', titles);
  const vp = await p.evaluate(() => { const m = document.querySelector('meta[name=viewport]').content; return { m, fs: getComputedStyle(document.body).touchAction }; });
  check(/user-scalable=no/.test(vp.m) && /viewport-fit=cover/.test(vp.m), 'viewport blocks zoom, covers the notch', vp);
  const tap = async (x, y) => {
    if (!phone) { await p.mouse.move(x, y, { steps: 3 }); await p.waitForTimeout(120); await p.mouse.down(); await p.mouse.up(); return; }
    await p.evaluate(([x, y]) => { const cv = document.getElementById('gl'); const o = { clientX: x, clientY: y, pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true }; cv.dispatchEvent(new PointerEvent('pointerdown', o)); window.dispatchEvent(new PointerEvent('pointerup', o)); }, [x, y]);
  };
  const waitMine = () => p.waitForFunction(() => { const s = LCG.api.state(); return s.over || (s.turn === s.me && s.hasThoughts && !s.busy); }, null, { timeout: 120000 });
  // start a solo game through the menu
  await p.click('[data-act=solo]'); await p.waitForTimeout(150); await p.click('[data-act=startSolo]');
  await waitMine();
  let st = await p.evaluate(() => LCG.api.state());
  check(st.mode === 'solo' && st.screen === null, 'solo game started', st);
  const th = await p.evaluate(() => LCG.api.thoughts());
  check(th && th.length === 16 && th.every(t => t.text && t.text.length > 10 && t.emotion), 'all 16 own pieces have a thought', th && th.length);
  check(th.every(t => /^(King|Queen|Rook|Bishop|Knight|Pawn)$/.test(t.name)), 'pieces are named only by type', [...new Set(th.map(t => t.name))]);
  // hover / tap: emotion, portrait, dialog, voice
  const k = await p.evaluate(() => LCG.api.pieceScreen('g1'));
  await p.evaluate(() => { __utter.length = 0; });
  if (phone) await tap(k.x, k.y); else { await p.mouse.move(k.x - 30, k.y + 30); await p.mouse.move(k.x, k.y, { steps: 4 }); }
  await p.waitForTimeout(900);
  let dlg = await p.evaluate(() => LCG.api.dialog());
  check(/KNIGHT/.test(dlg.name) && dlg.text.length > 10 && dlg.emo, (phone ? 'tap' : 'hover') + ' shows the Knight\'s dialog', dlg);
  const ut = await p.evaluate(() => __utter.filter(u => u.text));
  check(ut.length >= 1 && ut.some(u => u.voice), 'hovered piece speaks with a chosen voice', ut.slice(-2));
  const vc = await p.evaluate(() => LCG.api.voice()); check(vc.on && vc.picks.king && vc.picks.pawn, 'voices on after first gesture; per-type voice cast', vc);
  // counsel (Enter key on desktop, button on phone): the King speaks with a deep slow voice
  await p.evaluate(() => { __utter.length = 0; });
  if (phone) await p.click('#bCounsel'); else await p.keyboard.press('Enter');
  await p.waitForTimeout(700);
  dlg = await p.evaluate(() => LCG.api.dialog());
  const ku = await p.evaluate(() => __utter.filter(u => u.text));
  check(/KING/.test(dlg.name) && /e4|d4|Nf3|c4/.test(dlg.text) && /COUNSEL/.test(dlg.pv) && ku.length > 0, 'counsel: the King speaks the army\'s plan', dlg);
  if (ut.length && ku.length) check(ku[0].pitch < ut[0].pitch + 1e-9 && ku[0].rate <= ut[0].rate + 1e-9, 'King voice is deeper/slower than the Knight', [ku[0], ut[0]]);
  // select a pawn and preview a move: army reacts, ghost path, verdict
  const e2 = await p.evaluate(() => LCG.api.pieceScreen('e2')), e4 = await p.evaluate(() => LCG.api.screenOf('e4'));
  await tap(e2.x, e2.y); await p.waitForTimeout(250);
  check(await p.evaluate(() => LCG.api.state().sel) === 12, 'pawn e2 selected');
  if (phone) await tap(e4.x, e4.y); else await p.mouse.move(e4.x, e4.y, { steps: 5 });
  await p.waitForTimeout(500);
  const pv = await p.evaluate(() => LCG.api.preview());
  check(pv && pv.uci === 'e2e4' && pv.reacts.length >= 8 && pv.verdict, 'preview e2e4: the army reacts', pv);
  check(await p.evaluate(() => LCG.R.ghosts.length > 0), 'ghost path of the foreseen line is drawn');
  const pvt = await p.evaluate(() => LCG.api.dialog().pv); check(/e4/.test(pvt), 'preview box', pvt);
  await tap(e4.x, e4.y); // desktop: click plays; phone: second tap confirms
  await p.waitForFunction(() => LCG.api.state().ply >= 1, null, { timeout: 20000 });
  check(true, 'move played by ' + (phone ? 'tap, tap-again' : 'click'));
  await waitMine();
  st = await p.evaluate(() => LCG.api.state()); check(st.ply === 2, 'the machine replied', st.ply);
  // undo
  await (phone ? p.click('#bUndo') : p.keyboard.press('u')); await p.waitForTimeout(600);
  await waitMine();
  check(await p.evaluate(() => LCG.api.state().ply) === 0, 'undo takes back the move pair');
  // tactical position: hanging queen -> it is terrified and counsel saves it
  await p.evaluate(() => LCG.api.newSolo(0, 0, 0, [], 'rnbqkbnr/ppp1pppp/8/3p4/6Q1/4P3/PPPP1PPP/RNB1KBNR w KQkq - 0 3'));
  await waitMine();
  const q = await p.evaluate(() => LCG.api.thoughts().find(t => t.name === 'Queen'));
  // Bc8 attacks g4 (the d-pawn moved) -> the Queen sees Bxg4 coming
  check(q && /terror|anxiety|horror|panic|fear/.test(q.emotion) && q.advice && q.advice.startsWith('g4') && /g4/.test(q.text), 'attacked Queen is afraid and pleads to move', q);
  const cs = await p.evaluate(() => LCG.api.charState('g4')); check(cs && cs.emo === q.emotion && cs.gesture, 'her body shows it', cs);
  // promotion through the picker
  await p.evaluate(() => LCG.api.newSolo(0, 0, 0, [], '7k/P7/8/8/8/8/6PP/7K w - - 0 1'));
  await waitMine();
  const a7 = await p.evaluate(() => LCG.api.pieceScreen('a7')), a8 = await p.evaluate(() => LCG.api.screenOf('a8'));
  await tap(a7.x, a7.y); await p.waitForTimeout(200); await tap(a8.x, a8.y); await p.waitForTimeout(300);
  if (phone) { await tap(a8.x, a8.y); await p.waitForTimeout(300); }
  const pvis = await p.evaluate(() => !document.getElementById('promo').classList.contains('hidden'));
  check(pvis, 'promotion picker shown');
  if (pvis) { await p.click('#promo .pbtns button:nth-child(2)'); await p.waitForFunction(() => LCG.api.state().ply >= 1, null, { timeout: 20000 }); }
  const pf = await p.evaluate(() => LCG.api.state().fen); check(/^R/.test(pf), 'promoted to the chosen Rook', pf);
  // checkmate cinematic: mate in 1 (Ra8#-like) vs the machine
  await p.evaluate(() => LCG.api.newSolo(0, 0, 0, [], '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'));
  await waitMine();
  const army = await p.evaluate(() => LCG.api.army()); check(army && army.uci === 'a1a8', 'the army finds the mate', army && army.uci);
  const kt = await p.evaluate(() => LCG.api.thoughts().find(t => t.name === 'Rook'));
  check(kt && /thrill|joy|pride|ecsta|triumph/.test(kt.emotion) && /mate|checkmate/i.test(kt.text), 'the Rook dreams of checkmate', kt);
  await p.evaluate(() => LCG.api.move('a1a8'));
  await p.waitForFunction(() => !document.getElementById('over').classList.contains('hidden'), null, { timeout: 60000 });
  const ov = await p.evaluate(() => [document.getElementById('otitle').textContent, document.getElementById('osub').textContent]);
  check(/CHECKMATE|VICTORY|WIN/i.test(ov.join(' ')), 'checkmate panel', ov);
  // full game vs the machine to checkmate
  if (FULL) {
    await p.evaluate(() => { LCG.api.speed(6); LCG.api.newSolo(0, 0, 0); });
    let n = 0, s;
    for (; n < 200; n++) {
      await waitMine(); s = await p.evaluate(() => LCG.api.state()); if (s.over) break;
      const u = await p.evaluate(() => LCG.api.army().uci); await p.evaluate(u => LCG.api.move(u), u);
      await p.waitForFunction(pl => LCG.api.state().ply > pl || LCG.api.state().over, s.ply, { timeout: 60000 });
    }
    s = await p.evaluate(() => LCG.api.state());
    check(s.over && /mate/i.test(JSON.stringify(s.over)), 'full game vs the machine ends in checkmate', { over: s.over, ply: s.ply });
  }
  // rendering: never black
  await p.waitForFunction(() => LCG.R.lastSelf && LCG.R.lastSelf.n >= 6, null, { timeout: 120000 }).catch(() => {});
  const ls = await p.evaluate(() => LCG.R.lastSelf); check(ls && ls.n >= 6 && ls.black === 0, 'pixel self-check: board is not black', ls);
  const png = (await p.screenshot()).toString('base64');
  const lum = await p.evaluate(async d => { const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const a = x.getImageData(0, 0, c.width, c.height).data; let s = 0, dark = 0, n = 0; for (let i = 0; i < a.length; i += 4 * 97) { const l = (a[i] + a[i + 1] + a[i + 2]) / 3; s += l; n++; if (l < 4) dark++; } return { mean: s / n, dark: dark / n }; }, png);
  check(lum.mean > 25 && lum.dark < 0.5, 'screenshot is not a black screen', lum);
  check(errs.length === 0, 'no console errors', errs);
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
