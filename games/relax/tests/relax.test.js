/* RELAX — headless Chrome. Sand drawing, rover/astronaut collisions and flips,
   the one-minute pattern change, and a real recording through AnalyserNode.
   Run from the repo root:
     python3 -m http.server 8080
     NODE_PATH=/tmp/pw/node_modules node games/relax/tests/relax.test.js
   env: BASE, CHROME, SOAK (seconds to watch the real-time bowl; default 62) */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8080/games/relax/index.html';
const SOAK = Number(process.env.SOAK || 62);
let fails = 0;
const check = (ok, msg, extra) => {
  if (!ok) fails++;
  console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-gpu']
  });
  const open = async (url) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
    page.on('requestfailed', (r) => {
      const u = r.url();
      const why = (r.failure() && r.failure().errorText) || '';
      if (/favicon/i.test(u)) return;
      /* Chrome aborts the first media request when it reissues a Range fetch. */
      if (why === 'net::ERR_ABORTED' && /upload\.wikimedia\.org|commons\.wikimedia\.org/.test(u)) return;
      errs.push('REQFAIL ' + u + ' ' + why);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push(r.status() + ' ' + r.url());
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.RELAX && RELAX.pattern, null, { timeout: 8000 });
    return { page, errs };
  };

  console.log('== boot');
  const boot = await open(BASE + '?seed=1');
  await boot.page.waitForTimeout(2500);
  const early = await boot.page.evaluate(() => {
    const c = document.getElementById('view');
    const ctx = c.getContext('2d');
    const x = (c.width / 2) | 0, y = (c.height * 0.46) | 0;
    const px = ctx.getImageData(x, y, 1, 1).data;
    let reds = 0, darks = 0, n = 0;
    const box = ctx.getImageData(Math.max(0, x - 180), Math.max(0, y - 140), 360, 280).data;
    for (let i = 0; i < box.length; i += 16) {
      const r = box[i], g = box[i + 1], b = box[i + 2];
      if (r > 100 && r > g + 20 && r > b + 30) reds++;
      if (r > 20 && r < 110 && r > g && g < 70) darks++;
      n++;
    }
    const s = RELAX;
    return {
      px: [px[0], px[1], px[2]], reds, darks, n,
      groove: s.groove, pattern: s.pattern, phase: s.phase,
      hits: s.stats.hits, flips: s.stats.flips, maxJ: s.stats.maxJ,
      rover: s.rover, astro: s.astro, ball: s.ball,
      tracks: s.trackCount, all: s.allTrackCount,
      names: s.patterns
    };
  });
  check(early.reds > 20, 'martian sand is visible in the bowl', { px: early.px, reds: early.reds, n: early.n });
  check(early.darks > 2, 'grooves read darker than the flat sand', { darks: early.darks });
  check(early.groove > 20, 'the ball has cut a measurable groove', early.groove);
  check(early.names.length >= 12, 'at least 12 patterns', early.names);
  check(early.all >= 20, 'at least 20 recordings in the catalog', early.all);
  check(early.tracks >= 20, 'this browser can play at least 20 of them', early.tracks);
  check(!/homedics|drift sandscape|youtube|youtu\.be/i.test(await boot.page.content()), 'no trademark and no YouTube in the page');

  console.log('== audio + analyser');
  await boot.page.click('#view');
  const audio = await boot.page.waitForFunction(() => {
    const el = RELAX.audioElement();
    return el && !el.paused && el.currentTime > 0.15 && RELAX.analyserSum() > 0;
  }, null, { timeout: 25000 }).then(() => boot.page.evaluate(() => {
    const el = RELAX.audioElement();
    return { t: el.currentTime, sum: RELAX.analyserSum(), line: RELAX.musicLine(), paused: el.paused, src: (el.currentSrc || '').slice(0, 80) };
  })).catch((e) => ({ error: String(e), state: null }));
  if (audio.error) {
    audio.state = await boot.page.evaluate(() => {
      const el = RELAX.audioElement();
      return { paused: el && el.paused, t: el && el.currentTime, sum: RELAX.analyserSum(), line: RELAX.musicLine(), err: el && el.error && el.error.code };
    });
  }
  check(!audio.error && audio.sum > 0 && audio.t > 0, 'audio element is playing and the analyser returns energy', audio);

  console.log('== inputs and chrome');
  const ui = await boot.page.evaluate(() => ({
    next: !!document.getElementById('btn-next'),
    fx: !!document.getElementById('btn-fx'),
    hint: !!document.getElementById('hint'),
    hintBtn: !!document.getElementById('btn-hint'),
    pattern: !!document.getElementById('pattern'),
    mute: !!document.getElementById('btn-mute'),
    vol: !!document.getElementById('vol'),
    now: !!document.getElementById('now'),
    begin: (document.getElementById('begin') || {}).textContent || '',
    text: document.body.innerText
  }));
  check(!ui.next && !ui.fx && !ui.hint && !ui.hintBtn && !ui.pattern, 'no extra buttons, hint, or pattern label', ui);
  check(ui.mute && ui.vol && ui.now, 'mute, volume, and now playing remain', ui);
  check(!/Space or Next|drag, arrows|show hint/i.test(ui.text), 'no instruction text', ui.text.slice(0, 180));
  const actorsSrc = await boot.page.evaluate(() => fetch('js/actors.js').then(r => r.text()));
  const mainSrc = await boot.page.evaluate(() => fetch('js/main.js').then(r => r.text()));
  check(!/quadraticCurveTo|fillText\(/.test(actorsSrc), 'figures are not drawn with arms, arrows, or debug text');
  check(!/moveTo\(-L/.test(mainSrc), 'sparkles are dots, not crosshair marks');
  const beforeSkip = await boot.page.evaluate(() => RELAX.pattern);
  await boot.page.keyboard.press('Space');
  await boot.page.waitForTimeout(400);
  const afterSpace = await boot.page.evaluate(() => ({ phase: RELAX.phase, pattern: RELAX.pattern }));
  check(afterSpace.phase === 'rake' || afterSpace.pattern !== beforeSkip, 'Space starts the next pattern', afterSpace);
  await boot.page.keyboard.press('Enter');
  check(await boot.page.evaluate(() => RELAX.effects) === false, 'Enter toggles effects off');
  await boot.page.keyboard.press('KeyM');
  const muted = await boot.page.evaluate(() => document.getElementById('btn-mute').getAttribute('aria-pressed'));
  check(muted === 'true', 'M mutes');
  await boot.page.keyboard.press('Enter');
  check(await boot.page.evaluate(() => RELAX.effects) === true, 'Enter toggles the glow back on');

  console.log('== fast pattern change');
  const fast = await open(BASE + '?fast=1&seed=1');
  await fast.page.click('#view');
  await fast.page.waitForFunction(() => RELAX.changes >= 1, null, { timeout: 12000 });
  const fastState = await fast.page.evaluate(() => ({ changes: RELAX.changes, cycle: RELAX.cycle, pattern: RELAX.pattern }));
  check(fastState.changes >= 1 && fastState.cycle === 8, 'fast=1 advances to a new pattern inside a short cycle', fastState);

  console.log('== ' + SOAK + 's bowl (speed, coverage, collisions, minute change)');
  const soak = await open(BASE + '?seed=1');
  await soak.page.click('#view');
  const t0 = Date.now();
  const sample = () => soak.page.evaluate(() => ({
    t: RELAX.cycleT, coverage: RELAX.coverage, speed: RELAX.ballSpeed, progress: RELAX.progress, retrace: RELAX.retrace(), phase: RELAX.phase
  }));
  await soak.page.waitForTimeout(8000);
  const s8 = await sample();
  await soak.page.waitForTimeout(12000);
  const s20 = await sample();
  await soak.page.waitForTimeout(20000);
  const s40 = await sample();
  const remain = Math.max(0, SOAK * 1000 - 40000);
  await soak.page.waitForTimeout(remain);
  const late = await soak.page.evaluate(() => ({
    hits: RELAX.stats.hits,
    flips: RELAX.stats.flips,
    roverFlips: RELAX.stats.roverFlips,
    astroFlips: RELAX.stats.astroFlips,
    roverHits: RELAX.stats.roverHits,
    astroHits: RELAX.stats.astroHits,
    maxJ: RELAX.stats.maxJ,
    changes: RELAX.changes,
    phase: RELAX.phase,
    cycleT: RELAX.cycleT,
    pattern: RELAX.pattern,
    rover: RELAX.rover,
    astro: RELAX.astro,
    groove: RELAX.groove,
    sum: RELAX.analyserSum(),
    line: RELAX.musicLine()
  }));
  console.log('    watched', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify({ s8, s20, s40, late }));
  check(s8.speed > 0.04 && s8.speed < 0.4, 'the ball is moving, and much slower than before', s8.speed);
  check(s20.coverage > s8.coverage + 25 && s40.coverage > s20.coverage + 25, 'groove coverage keeps growing across the minute', { s8: s8.coverage, s20: s20.coverage, s40: s40.coverage });
  check(s40.progress > 0.55 && s40.progress < 0.85, 'the pattern is still unfolding partway through the minute', s40.progress);
  check(s40.retrace < 0.08, 'the magnet is not retracing an earlier stretch', s40.retrace);
  check(late.hits >= 1, 'the ball collides with the rover or the astronaut', late.hits);
  check(late.flips >= 1, 'someone tips or tumbles and the counter moves', late.flips);
  check(late.changes >= 1, 'the pattern changes on the one-minute clock', { changes: late.changes, cycleT: late.cycleT, phase: late.phase });
  check(late.groove > 30, 'a drawing is still in the sand (or was, before the rake)', late.groove);
  check(soak.errs.length === 0 && boot.errs.length === 0 && fast.errs.length === 0, 'no console errors', { boot: boot.errs, fast: fast.errs, soak: soak.errs });

  if (process.env.SAVE_THUMB) {
    const shot = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
    await shot.goto(BASE + '?seed=3', { waitUntil: 'domcontentloaded' });
    await shot.waitForTimeout(4500);
    await shot.screenshot({ path: process.env.SAVE_THUMB, type: 'png' });
    console.log('  thumb', process.env.SAVE_THUMB);
  }

  await browser.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
