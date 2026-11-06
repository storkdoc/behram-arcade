/* NAME THAT GROOVE browser smoke test: desktop 1280x800 + iPhone portrait (touch) + gamepad + reduced motion,
   plus the YouTube failure paths (video won't embed, stuck loading, needs a tap, API blocked) and one
   check against the REAL YouTube player.
   Game-flow sections use ?yt=mock (a fake player, no network) so they are deterministic. The real-YouTube
   section needs internet; note that YouTube refuses to play embeds for the default "HeadlessChrome" user
   agent (error 150 on every video), so that section uses a normal desktop Chrome user agent.
   Run from the repo root:  python3 -m http.server 18961 &   then
     NODE_PATH=$(npm root -g) node games/name-that-groove/tests/smoke.test.js   (env: BASE, CHROME, NO_REAL_YT=1) */
const { chromium, devices } = require('playwright-core');
const ROOT = process.env.BASE || 'http://localhost:18961/';
const BASE = ROOT + 'games/name-that-groove/index.html';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const THIRD = /youtube\.com|ggpht|youtube-nocookie|ytimg|googlevideo|doubleclick|google\.com|gstatic|googleapis|textdb|ntfy/;
let fails = 0, warns = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const warn = (msg, extra) => { warns++; console.log('  WARN', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, q = '') => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error' && !THIRD.test(m.text() + ' ' + ((m.location() || {}).url || '')) && !/Failed to load resource/.test(m.text())) p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('requestfailed', r => { if (!THIRD.test(r.url())) p.errs.push('REQFAIL ' + r.url()); });
    p.on('response', r => { if (r.status() >= 400 && !THIRD.test(r.url())) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(BASE + q); await p.waitForTimeout(400); return p;
  };
  const st = p => p.evaluate(() => ({ screen: NTG.S.screen, phase: NTG.S.phase, qi: NTG.S.qi, score: NTG.S.score, right: NTG.S.right, paused: NTG.S.paused, media: NTG.S.media, t: +NTG.S.t.toFixed(2), yst: NTG.yt.state() }));
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('.screen.show *')].some(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }));
  const playerBox = p => p.evaluate(() => { const r = document.getElementById('ytBox').getBoundingClientRect(), v = document.getElementById('viz').getBoundingClientRect(), cs = getComputedStyle(document.getElementById('ytBox')); return { w: r.width, h: r.height, vis: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity === 1, coverBottomGap: r.bottom - v.bottom, coverPE: getComputedStyle(document.getElementById('viz')).pointerEvents }; });
  const firstAnswerYt = (p, mode, diff, seed) => p.evaluate(([mode, diff, seed]) => { const r = NTG_Quiz.makeRound({ mode, diff, seed }); return NTG_Catalog.byId(r.questions[0].answer).yt; }, [mode, diff, seed]);

  console.log('== DESKTOP 1280x800, keyboard (test player)');
  const D = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&seed=7');
  check((await st(D)).screen === 'title', 'title screen shows');
  check(/YouTube/.test(await D.textContent('.honest')) && /ads/.test(await D.textContent('.honest')), 'title says music comes from YouTube, which controls availability and ads');
  check(!(await D.textContent('body')).match(/original (track|composition)|synthesi/i), 'no leftover "original tracks / synthesized" copy');
  check(!(await overflow(D)), 'title: no horizontal overflow');
  await D.click('[data-decade="80s"]'); await D.click('[data-diff="easy"]');
  check(await D.evaluate(() => document.body.dataset.theme) === '80s', 'decade pick changes the theme');
  await D.keyboard.press('Space'); await D.waitForTimeout(700);
  let s = await st(D);
  check(s.screen === 'play' && s.phase === 'listen' && s.qi === 0, 'Space starts a round', s);
  check(s.media === 'playing' && s.yst === 1, 'the song is playing in the player', s);
  check(await D.evaluate(() => NTG.yt.log[0] === NTG_Catalog.byId(NTG.S.round.questions[0].answer).yt), 'the player loads the answer\'s YouTube video');
  check(await D.evaluate(() => document.querySelectorAll('.ch').length) === 4, '4 choices');
  check(await D.evaluate(() => document.querySelectorAll('.ch .tag').length) === 4, 'easy shows the artist on each choice');
  const pb = await playerBox(D);
  check(pb.w >= 480 && pb.h >= 270 && pb.vis, 'player region is full size and visible (not hidden / 0px)', pb);
  check(pb.coverBottomGap >= 36 && pb.coverPE === 'none', 'listening cover leaves the control bar uncovered and lets clicks through', pb);
  check(await D.evaluate(() => getComputedStyle(document.getElementById('viz')).opacity) === '1', 'cover hides the picture and title while guessing');
  check(!(await overflow(D)), 'play: no horizontal overflow');
  const lay = await D.evaluate(() => { const ch = document.getElementById('choices').getBoundingClientRect(); return { chBottom: ch.bottom, ih: innerHeight }; });
  check(lay.chBottom <= lay.ih, 'desktop: all choices on screen', lay);
  await D.waitForTimeout(1500);
  s = await st(D); check(s.t > 1 && s.t < 3, 'clock follows the song position', s);
  await D.keyboard.press('Enter'); await D.waitForTimeout(100);
  check(await D.evaluate(() => document.querySelectorAll('.ch.gone').length) === 2, 'Enter removes two wrong answers');
  const correct = await D.evaluate(() => NTG.S.round.questions[0].correct);
  await D.keyboard.press(String(correct + 1)); await D.waitForTimeout(800);
  s = await st(D);
  check(s.phase === 'reveal' && s.right === 1 && s.score > 0, 'number key answers; correct scores', s);
  const rv = await D.evaluate(() => ({ cls: document.body.classList.contains('revealed'), op: getComputedStyle(document.getElementById('viz')).opacity, href: document.getElementById('rvYt').href, title: document.getElementById('rvTitle').textContent, sub: document.getElementById('rvSub').textContent, ans: NTG_Catalog.byId(NTG.S.round.questions[0].answer) }));
  check(rv.cls && +rv.op < 0.05, 'reveal lifts the cover to show the video', rv.op);
  check(rv.title === rv.ans.title && rv.sub.includes(rv.ans.artist) && rv.sub.includes(String(rv.ans.year)), 'reveal names song, artist and year', rv.sub);
  check(rv.href.startsWith('https://www.youtube.com/watch?v=' + rv.ans.yt), 'WATCH ON YOUTUBE opens the video on YouTube', rv.href);
  check((await st(D)).yst === 1, 'the song keeps playing on the reveal');
  await D.keyboard.press('Space'); await D.waitForTimeout(400);
  s = await st(D); check(s.qi === 1 && s.phase === 'listen' && !(await D.evaluate(() => document.body.classList.contains('revealed'))), 'Space goes to the next song, cover back on', s);
  await D.keyboard.press('ArrowDown'); await D.keyboard.press('Space'); await D.waitForTimeout(150);
  check((await st(D)).phase === 'reveal', 'arrows + Space choose an answer');
  await D.keyboard.press('Space'); await D.waitForTimeout(400);
  await D.keyboard.press('Escape'); await D.waitForTimeout(150);
  s = await st(D); check(s.paused && await D.isVisible('#pause') && s.yst === 2, 'Esc pauses the game and the video', s);
  const t1 = await D.evaluate(() => NTG.S.t); await D.waitForTimeout(500); const t2 = await D.evaluate(() => NTG.S.t);
  check(t1 === t2, 'clock frozen while paused');
  await D.keyboard.press('Space'); await D.waitForTimeout(150); s = await st(D); check(!s.paused && s.yst === 1, 'Space resumes game and video', s);
  await D.keyboard.press('m'); check(await D.evaluate(() => NTG.yt.muted && NTG.audio.muted && document.getElementById('btnMute').textContent === '🔇'), 'M mutes the video and the game sounds');
  await D.keyboard.press('m'); check(await D.evaluate(() => !NTG.yt.muted), 'M unmutes');
  // a clip that runs out: player paused at the clip end, REPLAY enabled, then time's up
  await D.evaluate(() => { NTG.yt.t = NTG_Catalog.byId(NTG.S.round.questions[NTG.S.qi].answer).start + NTG.S.clipLen - 0.2; }); await D.waitForTimeout(500);
  s = await st(D); check(s.media === 'ended' && s.yst === 2 && !(await D.isDisabled('#btnReplay')), 'clip stops itself at the clip length; REPLAY unlocks', s);
  const win = await D.evaluate(() => { const x = NTG_Catalog.byId(NTG.S.round.questions[NTG.S.qi].answer); return [x.start, x.end, NTG.yt.time()]; });
  check(Math.abs(win[2] - win[1]) < 0.3, 'the excerpt stops at its exact end second', win);
  await D.keyboard.press('r'); await D.waitForTimeout(400); s = await st(D);
  const pos2 = await D.evaluate(() => NTG.yt.time() - NTG_Catalog.byId(NTG.S.round.questions[NTG.S.qi].answer).start);
  check(s.media === 'playing' && s.yst === 1 && pos2 >= 0 && pos2 < 0.8, 'R replays the same excerpt from its exact start', { pos2 });
  for (let i = 0; i < 14; i++) { const x = await st(D); if (x.screen !== 'play') break; if (x.phase === 'listen') await D.keyboard.press('1'); await D.waitForTimeout(60); await D.keyboard.press('Space'); await D.waitForTimeout(120); }
  s = await st(D);
  check(s.screen === 'results', 'round ends on the results screen after 10 songs', s);
  check(await D.evaluate(() => NTG.yt.state() === -1), 'video stops after the round');
  check(await D.evaluate(() => [...document.querySelectorAll('#resList .rec')].filter(a => a.href.startsWith('https://www.youtube.com/watch')).length) === 10, 'results list all 10 songs with YouTube links');
  check(await D.evaluate(() => JSON.parse(localStorage.getItem('ntg.best2.80s.easy') || '[]').length) === 1, 'high score saved locally');
  check(!(await overflow(D)), 'results: no horizontal overflow');
  await D.click('#s-results [data-go="title"]'); await D.click('[data-go="crate"]');
  const crate = await D.evaluate(() => ({ n: document.querySelectorAll('#crateList .rec').length, yt: [...document.querySelectorAll('#crateList .rec')].every(a => /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}/.test(a.href) && a.target === '_blank') }));
  check(crate.n >= 20 && crate.yt, 'record crate lists the decade with YouTube links', crate);
  await D.keyboard.press('Escape'); await D.waitForTimeout(100);
  check((await st(D)).screen === 'title', 'Esc backs out');
  await D.click('[data-go="howto"]'); const how = await D.textContent('#s-howto');
  check(/50:50/.test(how) && /availability and any ads are controlled by YouTube/.test(how), 'how to play explains controls and the YouTube note');
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  console.log('== YouTube failure paths (test player)');
  let P = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&seed=12');
  let badId = await firstAnswerYt(P, '90s', 'normal', 12);
  P = await open({ viewport: { width: 1280, height: 800 } }, `?yt=mock&seed=12&ytfail=${badId}`);
  await P.click('[data-decade="90s"]'); await P.click('[data-diff="normal"]'); await P.click('#btnStart'); await P.waitForTimeout(900);
  s = await P.evaluate(() => ({ ans: NTG_Catalog.byId(NTG.S.round.questions[0].answer).yt, swapped: NTG.S.round.questions[0].swapped, media: NTG.S.media, toast: !document.getElementById('toast').hidden && document.getElementById('toast').textContent, bad: NTG.bad.size }));
  check(s.ans !== badId && s.swapped === 1 && s.media === 'playing' && /won't play/.test(s.toast), 'unembeddable / removed video: clear message, another song swaps in and plays', s);
  check(await P.evaluate(id => JSON.parse(localStorage.getItem('ntg.badvids'))[id] > 0, badId), 'the broken video is remembered and skipped for a day');
  check(P.errs.length === 0, 'no console errors', P.errs);

  P = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&seed=13');
  badId = await firstAnswerYt(P, '70s', 'hard', 13);
  P = await open({ viewport: { width: 1280, height: 800 } }, `?yt=mock&seed=13&ytstall=${badId}`);
  await P.click('[data-decade="70s"]'); await P.click('[data-diff="hard"]'); await P.click('#btnStart'); await P.waitForTimeout(3000);
  s = await st(P); check(s.media === 'waiting' && s.t === 0, 'stuck loading: "Waiting for YouTube" and the clock does not run', s);
  check(await P.isHidden('#btnSkip'), 'SKIP hidden at first');
  await P.waitForTimeout(6500);
  check(await P.isVisible('#btnSkip'), 'SKIP SONG appears after 8 s without music');
  await P.keyboard.press('s'); await P.waitForTimeout(600);
  s = await P.evaluate(() => ({ ans: NTG_Catalog.byId(NTG.S.round.questions[0].answer).yt, media: NTG.S.media, q: NTG.S.qi }));
  check(s.ans !== badId && s.media === 'playing' && s.q === 0, 'S skips to a different song in the same slot (round never stalls)', s);
  check(P.errs.length === 0, 'no console errors', P.errs);

  P = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&seed=14&ytneedtap');
  await P.click('#btnStart'); await P.waitForTimeout(3800);
  s = await st(P); check(s.media === 'needtap' && /Tap the player/.test(await P.textContent('#coverMsg')), 'autoplay blocked: asks for a tap on the player', s);
  await P.evaluate(() => NTG.yt.tap()); await P.waitForTimeout(400);
  s = await st(P); check(s.media === 'playing', 'tap on the player starts the music', s);

  P = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&seed=15&ytpre=4');
  await P.click('#btnStart'); await P.waitForTimeout(2200);
  s = await st(P); const op = await P.evaluate(() => getComputedStyle(document.getElementById('viz')).opacity);
  check(s.media === 'yt' && s.t === 0 && /YouTube is showing something/.test(await P.textContent('#coverMsg')), 'YouTube plays its own content first: game says so and the clock waits', s);
  await P.waitForTimeout(700); check(+(await P.evaluate(() => getComputedStyle(document.getElementById('viz')).opacity)) < 0.05, 'the cover lifts so nothing YouTube shows is hidden');
  await P.waitForTimeout(2500); s = await st(P); check(s.media === 'playing' && s.t > 0.3, 'the excerpt and the clock start once the song itself plays', s);
  P = await open({ viewport: { width: 1280, height: 800 } }, '?yt=mock&ytapifail');
  await P.waitForTimeout(300);
  check(await P.isVisible('#ytNote') && /YouTube didn't load/.test(await P.textContent('#ytNote')), 'YouTube blocked / offline: honest note on the title screen');
  await P.click('#btnStart'); await P.waitForTimeout(300);
  check((await st(P)).screen === 'title', 'no music means no round (and no stand-in synthesized music)');
  check(P.errs.length === 0, 'no console errors', P.errs);

  console.log('== iPhone 13 portrait, touch only (test player)');
  const M = await open({ ...devices['iPhone 13'] }, '?yt=mock&seed=3');
  check(!(await overflow(M)), 'phone title: no horizontal overflow');
  await M.tap('[data-decade="all"]'); await M.tap('[data-diff="hard"]'); await M.tap('#btnStart'); await M.waitForTimeout(800);
  s = await st(M); check(s.screen === 'play' && s.phase === 'listen', 'tap starts', s);
  const ml = await M.evaluate(() => { const a = document.getElementById('actions').getBoundingClientRect(), st = document.getElementById('ytBox').getBoundingClientRect(); return { aBottom: a.bottom, ih: innerHeight, pw: st.width, ph: st.height, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  check(ml.aBottom <= ml.ih && ml.ph >= 200 && ml.pw >= 200 && ml.sw <= ml.iw, 'phone: player (200px+), 4 answers and buttons fit without scrolling', ml);
  check(await M.evaluate(() => document.querySelectorAll('.ch .tag').length) === 0, 'crate digger shows titles only');
  const themes = new Set();
  for (let i = 0; i < 10; i++) { themes.add(await M.evaluate(() => document.body.dataset.theme)); await M.tap('.ch >> nth=' + (i % 4)); await M.waitForTimeout(80); check((await st(M)).phase === 'reveal', 'tap answers #' + (i + 1)); await M.tap('#btnNext'); await M.waitForTimeout(150); }
  check((await st(M)).screen === 'results', 'phone round completes');
  check(themes.size === 3, 'ALL mode switches decade themes per song', [...themes]);
  check(!(await overflow(M)), 'phone results: no horizontal overflow');
  check(M.errs.length === 0, 'phone: no console errors', M.errs);

  console.log('== gamepad + reduced motion (test player)');
  const G = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?yt=mock&seed=11');
  await G.evaluate(() => { const btns = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })); window.__pad = { id: 'test', connected: true, buttons: btns, axes: [0, 0, 0, 0] }; navigator.getGamepads = () => [window.__pad]; });
  const press = async i => { await G.evaluate(i => { __pad.buttons[i].pressed = true; }, i); await G.waitForTimeout(80); await G.evaluate(i => { __pad.buttons[i].pressed = false; }, i); await G.waitForTimeout(80); };
  await press(0); await G.waitForTimeout(600);
  check((await st(G)).screen === 'play', 'gamepad A starts');
  await press(2); check(await G.evaluate(() => document.querySelectorAll('.ch.gone').length) === 2, 'gamepad X = 50:50');
  await press(13); await press(0); check((await st(G)).phase === 'reveal', 'gamepad d-pad + A answers');
  await press(9); check((await st(G)).paused, 'gamepad Start pauses'); await press(9); check(!(await st(G)).paused, 'gamepad Start resumes');
  check(await G.evaluate(() => getComputedStyle(document.querySelector('.logo .l2')).animationName) === 'none', 'reduced motion turns off CSS animation');
  check(G.errs.length === 0, 'gamepad: no console errors', G.errs);

  if (!process.env.NO_REAL_YT) {
    console.log('== REAL YouTube IFrame player (network)');
    const R = await open({ viewport: { width: 1280, height: 800 }, userAgent: UA }, '?seed=21');
    try { await R.waitForFunction(() => NTG.yt.status !== 'loading', null, { timeout: 20000 }); } catch (e) { }
    const status = await R.evaluate(() => NTG.yt.status);
    if (status !== 'ready') warn('TEST ENVIRONMENT: YouTube IFrame API did not load here, real playback not checked', status);
    else {
      check(await R.evaluate(() => !!document.querySelector('#ytBox iframe[src^="https://www.youtube.com/embed/"]')), 'official YouTube embed iframe is on the page');
      await R.click('[data-decade="all"]'); await R.click('[data-diff="normal"]'); await R.click('#btnStart');
      let ok = false, x;
      for (let i = 0; i < 25 && !ok; i++) { await R.waitForTimeout(1000); x = await R.evaluate(() => ({ media: NTG.S.media, st: NTG.yt.state(), ct: NTG.yt.time(), t: NTG.S.t, swaps: NTG.S.swaps, song: NTG.S.round.questions[0].answer })); ok = x.media === 'playing' && x.t > 2; }
      if (ok) check(true, 'a real song plays from YouTube and the clock follows it', x);
      else if (x.media === 'yt') warn('YouTube was still showing its own content before the song after 25 s (not a game fault)', x);
      else check(false, 'a real song plays from YouTube', x);
      const box = await playerBox(R); check(box.w >= 480 && box.h >= 270, 'real player is full size', box);
      const ans = await R.evaluate(() => NTG.S.round.questions[0].correct); await R.keyboard.press(String(ans + 1)); await R.waitForTimeout(1500);
      x = await R.evaluate(() => ({ phase: NTG.S.phase, st: NTG.yt.state(), rev: document.body.classList.contains('revealed') }));
      check(x.phase === 'reveal' && x.rev, 'real reveal shows the video', x);
      check(R.errs.length === 0, 'real: no console errors from the game', R.errs);
    }
  }

  await b.close();
  console.log(fails ? `\n${fails} FAILED` : `\nALL PASSED${warns ? ' (' + warns + ' environment warnings)' : ''}`); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
