/* NAME THAT GROOVE browser smoke test: desktop 1280x800 + iPhone portrait (touch) + gamepad + reduced motion.
   Run from the repo root:  python3 -m http.server 18752 &   then
     NODE_PATH=$(npm root -g) node games/name-that-groove/tests/smoke.test.js   (env: BASE, CHROME) */
const { chromium, devices } = require('playwright-core');
const BASE = (process.env.BASE || 'http://127.0.0.1:18752/') + 'games/name-that-groove/index.html';
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, q = '') => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('requestfailed', r => { if (!/textdb|ntfy/.test(r.url())) p.errs.push('REQFAIL ' + r.url()); });
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(BASE + q); await p.waitForTimeout(400); return p;
  };
  const st = p => p.evaluate(() => ({ screen: NTG.S.screen, phase: NTG.S.phase, qi: NTG.S.qi, score: NTG.S.score, right: NTG.S.right, paused: NTG.S.paused, audio: NTG.audio.ok, ctx: NTG.audio.ctx && NTG.audio.ctx.state }));
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.screen.show *')].some(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }));

  console.log('== DESKTOP 1280x800, keyboard');
  const D = await open({ viewport: { width: 1280, height: 800 } }, '?seed=7');
  check((await st(D)).screen === 'title', 'title screen shows');
  check(!(await st(D)).audio, 'no audio before a user gesture');
  check(!(await overflow(D)), 'title: no horizontal overflow');
  await D.click('[data-decade="80s"]'); await D.click('[data-diff="easy"]');
  check(await D.evaluate(() => document.body.dataset.theme) === '80s', 'decade pick changes the theme');
  await D.keyboard.press('Space'); await D.waitForTimeout(900);
  let s = await st(D);
  check(s.screen === 'play' && s.phase === 'listen' && s.qi === 0, 'Space starts a round', s);
  check(s.audio && s.ctx === 'running', 'audio unlocked by the gesture and running', s);
  check(await D.evaluate(() => document.querySelectorAll('.ch').length) === 4, '4 choices');
  check(await D.evaluate(() => document.querySelectorAll('.ch .tag').length) === 4, 'easy shows style tags');
  check(!(await overflow(D)), 'play: no horizontal overflow');
  const lay = await D.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(), ch = document.getElementById('choices').getBoundingClientRect(); return { stageH: st.height, chBottom: ch.bottom, ih: innerHeight }; });
  check(lay.stageH > 250 && lay.chBottom <= lay.ih, 'desktop: big visualizer and all choices on screen', lay);
  await D.waitForTimeout(2600);
  check(await D.evaluate(() => document.querySelectorAll('#meter i.on').length) >= 2, 'groove meter advances (drums, bass...)');
  const peak = await D.evaluate(() => { const a = NTG.audio.analyser, d = new Uint8Array(a.fftSize); a.getByteTimeDomainData(d); let m = 0; for (const v of d) m = Math.max(m, Math.abs(v - 128)); return m; });
  check(peak > 2 && peak < 128, 'audio signal present and not clipping hard', peak);
  // Enter = 50:50
  await D.keyboard.press('Enter'); await D.waitForTimeout(100);
  check(await D.evaluate(() => document.querySelectorAll('.ch.gone').length) === 2, 'Enter removes two wrong answers');
  const correct = await D.evaluate(() => NTG.S.round.questions[0].correct);
  await D.keyboard.press(String(correct + 1)); await D.waitForTimeout(200);
  s = await st(D);
  check(s.phase === 'reveal' && s.right === 1 && s.score > 0, 'number key answers; correct scores', s);
  check(await D.evaluate(() => !document.getElementById('reveal').hidden && /original/.test(document.getElementById('rvSub').textContent)), 'reveal labels it an original track');
  await D.keyboard.press('Space'); await D.waitForTimeout(150);
  check((await st(D)).qi === 1, 'Space goes to the next record');
  // arrows + Space choose
  await D.keyboard.press('ArrowDown'); await D.keyboard.press('Space'); await D.waitForTimeout(150);
  check((await st(D)).phase === 'reveal', 'arrows + Space choose an answer');
  // pause on Escape
  await D.keyboard.press('Space'); await D.waitForTimeout(100);
  await D.keyboard.press('Escape'); await D.waitForTimeout(150);
  s = await st(D); check(s.paused && await D.isVisible('#pause'), 'Esc pauses', s);
  const t1 = await D.evaluate(() => NTG.S.t); await D.waitForTimeout(500); const t2 = await D.evaluate(() => NTG.S.t);
  check(t1 === t2, 'clock frozen while paused');
  await D.keyboard.press('Space'); await D.waitForTimeout(150); check(!(await st(D)).paused, 'Space resumes');
  await D.keyboard.press('m'); check(await D.evaluate(() => NTG.audio.muted && document.getElementById('btnMute').textContent === '🔇'), 'M mutes (visible icon)');
  await D.keyboard.press('m');
  // finish the round fast
  for (let i = 0; i < 12; i++) { const ph = (await st(D)).phase; if ((await st(D)).screen !== 'play') break; if (ph === 'listen') await D.keyboard.press('1'); await D.waitForTimeout(60); await D.keyboard.press('Space'); await D.waitForTimeout(80); }
  s = await st(D);
  check(s.screen === 'results', 'round ends on the results screen after 10 records', s);
  check(await D.evaluate(() => document.querySelectorAll('#resList .rec').length) === 10, 'results list all 10 tracks');
  check(await D.evaluate(() => JSON.parse(localStorage.getItem('ntg.best.80s.easy') || '[]').length) === 1, 'high score saved locally');
  check(!(await overflow(D)), 'results: no horizontal overflow');
  // crate + how to
  await D.click('#s-results [data-go="title"]'); await D.click('[data-go="crate"]');
  check(await D.evaluate(() => document.querySelectorAll('#crateList .rec').length) === 24, 'record crate lists 24 tracks per decade');
  await D.click('#crateList .rec'); await D.waitForTimeout(300);
  check(await D.evaluate(() => !!NTG.S.preview), 'crate preview plays');
  await D.keyboard.press('Escape'); await D.waitForTimeout(100);
  check((await st(D)).screen === 'title' && await D.evaluate(() => !NTG.S.preview), 'Esc backs out and stops the preview');
  await D.click('[data-go="howto"]'); check(/50:50/.test(await D.textContent('#s-howto')), 'how to play explains controls');
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  console.log('== iPhone 13 portrait, touch only');
  const M = await open({ ...devices['iPhone 13'] }, '?seed=3');
  check(!(await overflow(M)), 'phone title: no horizontal overflow');
  await M.tap('[data-decade="all"]'); await M.tap('[data-diff="hard"]'); await M.tap('#btnStart'); await M.waitForTimeout(900);
  s = await st(M); check(s.screen === 'play' && s.phase === 'listen', 'tap starts', s);
  const ml = await M.evaluate(() => { const ch = document.getElementById('choices').getBoundingClientRect(), a = document.getElementById('actions').getBoundingClientRect(), st = document.getElementById('stage').getBoundingClientRect(); return { chBottom: ch.bottom, aBottom: a.bottom, ih: innerHeight, stageH: st.height, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  check(ml.aBottom <= ml.ih && ml.stageH >= 150 && ml.sw <= ml.iw, 'phone: visualizer, 4 answers and buttons fit without scrolling', ml);
  check(await M.evaluate(() => document.querySelectorAll('.ch .tag').length) === 0, 'crate digger hides style tags');
  const themes = new Set();
  for (let i = 0; i < 10; i++) { themes.add(await M.evaluate(() => document.body.dataset.theme)); await M.tap('.ch >> nth=' + (i % 4)); await M.waitForTimeout(80); check((await st(M)).phase === 'reveal', 'tap answers #' + (i + 1)); await M.tap('#btnNext'); await M.waitForTimeout(80); }
  check((await st(M)).screen === 'results', 'phone round completes');
  check(themes.size === 3, 'ALL mode switches decade themes per record', [...themes]);
  check(!(await overflow(M)), 'phone results: no horizontal overflow');
  check(M.errs.length === 0, 'phone: no console errors', M.errs);

  console.log('== gamepad + reduced motion');
  const G = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?seed=11');
  await G.evaluate(() => { const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); window.__pad = { id: 'test', connected: true, buttons: btns, axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
  const press = async i => { await G.evaluate(i => { __pad.buttons[i].pressed = true; }, i); await G.waitForTimeout(80); await G.evaluate(i => { __pad.buttons[i].pressed = false; }, i); await G.waitForTimeout(80); };
  await press(0); await G.waitForTimeout(800);
  check((await st(G)).screen === 'play', 'gamepad A starts');
  await press(2); check(await G.evaluate(() => document.querySelectorAll('.ch.gone').length) === 2, 'gamepad X = 50:50');
  await press(13); await press(0); check((await st(G)).phase === 'reveal', 'gamepad d-pad + A answers');
  await press(9); check((await st(G)).paused, 'gamepad Start pauses'); await press(9); check(!(await st(G)).paused, 'gamepad Start resumes');
  check(await G.evaluate(() => getComputedStyle(document.querySelector('.logo .l2')).animationName) === 'none', 'reduced motion turns off CSS animation');
  check(G.errs.length === 0, 'gamepad: no console errors', G.errs);

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
