/* JUKEBOX browser smoke. Serves the game, plays one real iTunes preview,
   and checks the analyser sees non-zero frequency data.
   node games/jukebox/tests/smoke.test.js   (env BASE, CHROME) */
const { chromium, devices } = require('playwright-core');
const ROOT = process.env.BASE || 'http://127.0.0.1:18973/';
const BASE = ROOT + 'games/jukebox/index.html';
let fails = 0;
const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required']
  });
  const open = async (opts) => {
    const c = await b.newContext(opts);
    const p = await c.newPage();
    p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(BASE);
    await p.waitForFunction(() => window.JUKE && JUKE.songs().length >= 300, null, { timeout: 20000 });
    return p;
  };
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

  console.log('== desktop');
  const D = await open({ viewport: { width: 1280, height: 800 } });
  const info = await D.evaluate(() => ({
    n: JUKE.songs().length,
    iframes: document.querySelectorAll('iframe').length,
    courtesy: document.getElementById('courtesy').textContent,
    canvas: document.getElementById('vizCanvas').getBoundingClientRect().height,
    body: document.body.innerText
  }));
  check(info.n >= 300 && info.n <= 500, 'catalog is the hits shelf', info.n);
  check(info.iframes === 0, 'no embedded frame');
  check(/courtesy of iTunes/.test(info.courtesy), 'courtesy line is visible');
  check(!/youtube/i.test(info.body), 'page text does not mention a video site');
  check(info.canvas >= 240, 'visualizer canvas is the hero', info.canvas);
  const wide = await D.evaluate(() => {
    const c = document.getElementById('vizCanvas').getBoundingClientRect();
    return { w: c.width, vw: innerWidth };
  });
  check(wide.w >= wide.vw * 0.7, 'visualizer spans the page width', wide);
  check(!(await overflow(D)), 'desktop: no horizontal overflow');
  await D.fill('#q', 'billie jean');
  await D.waitForTimeout(50);
  const narrowed = await D.evaluate(() => {
    const note = document.getElementById('crateNote').textContent || '';
    const m = note.match(/(\d+)/);
    return m ? +m[1] : -1;
  });
  check(narrowed >= 1 && narrowed < 80, 'search narrows the list', narrowed);
  await D.click('.song');
  await D.click('#btnPlay');
  let heard = null;
  for (let i = 0; i < 30; i++) {
    await D.waitForTimeout(400);
    heard = await D.evaluate(() => {
      const s = JUKE.engine.sample();
      return {
        t: JUKE.engine.audio.currentTime,
        sum: s.sum,
        mode: JUKE.S.mode,
        state: JUKE.engine.ctx && JUKE.engine.ctx.state,
        title: document.getElementById('npTitle').textContent
      };
    });
    if (heard.t > 0.4 && heard.sum > 500) break;
  }
  check(heard && heard.t > 0.4 && heard.sum > 500 && heard.mode === 'playing', 'preview plays and the analyser sees the audio', heard);
  await D.click('[data-viz="wave"]');
  check(await D.evaluate(() => document.getElementById('vizPanel').dataset.look) === 'wave', 'wave mode switches the drawing only');
  check(D.errs.length === 0, 'desktop: no page errors', D.errs);

  console.log('== iPhone');
  const ip = devices['iPhone 13'];
  const M = await open({ viewport: ip.viewport, userAgent: ip.userAgent, isMobile: true, hasTouch: true, deviceScaleFactor: ip.deviceScaleFactor });
  check(!(await overflow(M)), 'phone: no horizontal overflow');
  const phone = await M.evaluate(() => {
    const c = document.getElementById('vizCanvas').getBoundingClientRect();
    const song = document.querySelector('.song').getBoundingClientRect();
    return { ch: c.height, cw: c.width, sh: song.height };
  });
  check(phone.ch >= 180 && phone.cw >= 280 && phone.sh >= 44, 'phone canvas is large and targets are tappable', phone);
  check(M.errs.length === 0, 'phone: no page errors', M.errs);

  console.log('== reduced motion');
  const R = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  check(await R.evaluate(() => getComputedStyle(document.querySelector('.logo')).animationName) === 'none', 'reduced motion disables the sign flicker');

  await b.close();
  console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
