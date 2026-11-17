/* GLOW MUNCH: boots, keyboard play, on-screen joystick, iPhone safe layout.
   python3 -m http.server 8091
   NODE_PATH=<dir with playwright-core> node games/glow-munch/tests/play.test.js
   Env: BASE, CHROME */
const fs = require('fs');
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8091/';
const URL = BASE + 'games/glow-munch/';
const CHROME = process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/local/bin/google-chrome');
let fails = 0;
const check = (ok, msg, extra) => {
  if (!ok) fails++;
  console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
};

async function holdStick(page, x0, y0, x1, y1, ms) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(x0, y0)] });
  await page.waitForTimeout(40);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(x1, y1)] });
  await page.waitForFunction(() => GLOWMUNCH.stickDir === 0 && GLOWMUNCH.game.player.dir === 0 && GLOWMUNCH.game.player.x > 10.8, null, { timeout: ms });
  const mid = await page.evaluate(() => ({
    x: GLOWMUNCH.game.player.x,
    dir: GLOWMUNCH.game.player.dir,
    wish: GLOWMUNCH.game.player.wish,
    stick: GLOWMUNCH.stickDir
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return mid;
}

async function swipe(page, x0, y0, x1, y1) {
  const cdp = await page.context().newCDPSession(page);
  const steps = 6;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }]
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const b = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const open = async (opts, url) => {
    const c = await b.newContext(opts);
    const p = await c.newPage();
    p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForFunction(() => window.GLOWMUNCH && GLOWMUNCH.booted, null, { timeout: 20000 });
    await p.waitForTimeout(200);
    return p;
  };

  console.log('== title');
  const title = await open({ viewport: { width: 1100, height: 700 } }, URL);
  const box = await title.evaluate(() => {
    const h = document.querySelector('#title h1').getBoundingClientRect();
    const home = document.getElementById('home').getBoundingClientRect();
    return {
      text: document.querySelector('#title h1').textContent,
      h: { top: h.top, bottom: h.bottom, left: h.left, right: h.right, w: innerWidth, ht: innerHeight },
      home: { top: home.top, bottom: home.bottom, left: home.left, right: home.right, href: document.getElementById('home').getAttribute('href') },
      mood: typeof MoodSticker === 'object',
      screen: GLOWMUNCH.screen
    };
  });
  check(box.screen === 'title' && box.text === 'GLOW MUNCH', 'title screen is up', box.text);
  check(box.h.top >= 0 && box.h.bottom <= box.h.ht && box.h.left >= 0 && box.h.right <= box.h.w, 'title is fully on screen', box.h);
  check(box.home.top >= 0 && box.home.bottom <= box.h.ht && /index\.html$/.test(box.home.href), 'back to the arcade is on screen', box.home);
  check(box.home.bottom < box.h.top || box.home.right < box.h.left, 'the title does not cover the arcade link', { home: box.home, h: box.h });
  check(box.mood, 'feedback sticker is loaded');
  check(!/pac-?man/i.test(await title.content()), 'page does not use the trademark');
  check(title.errs.length === 0, 'title: no console errors', title.errs.slice(0, 4));
  await title.click('#play');
  await title.waitForFunction(() => GLOWMUNCH.screen === 'play');
  check(await title.evaluate(() => GLOWMUNCH.audio.unlocked), 'starting play unlocks audio');
  await title.context().close();

  console.log('== desktop play');
  const desk = await open({ viewport: { width: 1280, height: 800 } }, URL + '?play=1&seed=3');
  check(desk.errs.length === 0, 'play: no console errors', desk.errs.slice(0, 4));
  const audio = await desk.evaluate(() => {
    const el = document.querySelector('audio');
    return { cross: el.getAttribute('crossorigin'), inline: el.getAttribute('playsinline'), src: el.getAttribute('src') || el.src };
  });
  check(audio.cross == null && audio.inline != null && /galop\.mp3/.test(audio.src), 'music element is inline, with no crossorigin', audio);
  check(await desk.evaluate(() => getComputedStyle(document.getElementById('dock')).display === 'none'), 'desktop keeps the joystick off the board');
  await desk.evaluate(() => {
    const g = GLOWMUNCH.game;
    g.phase = 'play';
    g.player.x = 10; g.player.y = 25; g.player.dir = 2; g.player.wish = null; g.player.wishHeld = false;
    g.ghosts.forEach(gh => { gh.x = 14; gh.y = 10; gh.mode = 'scatter'; });
  });
  await desk.keyboard.down('ArrowRight');
  await desk.waitForFunction(() => GLOWMUNCH.game.player.dir === 0 && GLOWMUNCH.game.player.x > 11, null, { timeout: 2000 });
  await desk.keyboard.up('ArrowRight');
  const moved = await desk.evaluate(() => ({ x: GLOWMUNCH.game.player.x, score: GLOWMUNCH.game.score, phase: GLOWMUNCH.game.phase, dir: GLOWMUNCH.game.player.dir }));
  check(moved.phase === 'play' && moved.dir === 0 && moved.x > 11 && moved.score >= 10, 'arrow key turns, moves, and eats a light', moved);
  check(await desk.evaluate(() => GLOWMUNCH.audio.unlocked), 'the first key unlocks audio');
  await desk.evaluate(() => { GLOWMUNCH.game.player.meter = 100; GLOWMUNCH.game.player.dash = 0; });
  await desk.keyboard.press('Space');
  await desk.waitForTimeout(40);
  check(await desk.evaluate(() => GLOWMUNCH.game.player.dash > 0 || GLOWMUNCH.game.events.indexOf('dash') >= 0 || GLOWMUNCH.game.player.meter < 100), 'space spends the dash meter');
  await desk.keyboard.press('KeyP');
  check(await desk.evaluate(() => GLOWMUNCH.screen === 'pause'), 'P pauses');
  await desk.keyboard.press('Escape');
  check(await desk.evaluate(() => GLOWMUNCH.screen === 'play'), 'Esc resumes');
  check(desk.errs.length === 0, 'desktop play stays clean', desk.errs.slice(0, 4));
  await desk.context().close();

  async function touchPlay(label, opts) {
    console.log('== ' + label);
    const p = await open(opts, URL + '?play=1&seed=4');
    await p.waitForTimeout(250);
    const spot = await p.evaluate(() => {
      const s = GLOWMUNCH.project(GLOWMUNCH.game.player.x, GLOWMUNCH.game.player.y);
      const h = document.querySelector('#title h1');
      const titleBox = h ? h.getBoundingClientRect() : null;
      const home = document.getElementById('home').getBoundingClientRect();
      return {
        s: s,
        phase: GLOWMUNCH.game.phase,
        titleHidden: document.getElementById('title').hidden,
        home: { top: home.top, left: home.left, bottom: home.bottom, right: home.right },
        w: innerWidth, h: innerHeight,
        titleBox: titleBox
      };
    });
    check(spot.phase === 'play' && spot.titleHidden, label + ': a game is running');
    check(spot.home.top >= 0 && spot.home.left >= 0 && spot.home.bottom <= spot.h && spot.home.right <= spot.w, label + ': arcade link is fully on screen', spot.home);
    const before = await p.evaluate(() => ({ x: GLOWMUNCH.game.player.x, y: GLOWMUNCH.game.player.y, dir: GLOWMUNCH.game.player.dir }));
    await swipe(p, spot.s.x, spot.s.y, spot.s.x, spot.s.y - 90);
    await p.waitForTimeout(280);
    const afterSwipe = await p.evaluate(() => ({ x: GLOWMUNCH.game.player.x, y: GLOWMUNCH.game.player.y, dir: GLOWMUNCH.game.player.dir, wish: GLOWMUNCH.game.player.wish }));
    check(afterSwipe.dir === 3 || afterSwipe.wish === 3 || afterSwipe.y < before.y - 0.15, label + ': a swipe up turns the spark upward', { before: before, after: afterSwipe });

    const fit = await p.evaluate(() => {
      const b = GLOWMUNCH.board();
      const maze = { left: b.ox, top: b.oy, right: b.ox + b.boardW, bottom: b.oy + b.boardH, tile: b.tile };
      const stick = document.getElementById('stick').getBoundingClientRect();
      const boost = document.getElementById('boost').getBoundingClientRect();
      const hit = (r) => !(r.right < maze.left + 2 || r.left > maze.right - 2 || r.bottom < maze.top + 2 || r.top > maze.bottom - 2);
      return {
        maze: maze,
        stick: { left: stick.left, top: stick.top, right: stick.right, bottom: stick.bottom, w: stick.width, h: stick.height },
        boost: { left: boost.left, top: boost.top, right: boost.right, bottom: boost.bottom },
        w: innerWidth, h: innerHeight,
        shown: getComputedStyle(document.getElementById('dock')).display !== 'none',
        coverStick: hit(stick),
        coverBoost: hit(boost)
      };
    });
    check(fit.shown && fit.stick.w >= 80 && fit.stick.h >= 80, label + ': a neon joystick is on screen', fit.stick);
    check(fit.maze.top >= -1 && fit.maze.left >= -1 && fit.maze.right <= fit.w + 1 && fit.maze.bottom <= fit.h + 1 && fit.maze.tile >= 8, label + ': the maze stays fully on screen', fit.maze);
    check(!fit.coverStick && !fit.coverBoost, label + ': the stick and boost sit off the maze', { maze: fit.maze, stick: fit.stick, boost: fit.boost });
    check(Math.abs((fit.stick.top + fit.stick.bottom) / 2 - (fit.boost.top + fit.boost.bottom) / 2) < 80, label + ': boost sits beside the stick', { stick: fit.stick, boost: fit.boost });
    await p.evaluate(() => {
      const g = GLOWMUNCH.game;
      g.phase = 'play';
      g.player.x = 10; g.player.y = 25; g.player.dir = 2; g.player.wish = null; g.player.wishHeld = false; g.player.goal = null;
      g.ghosts.forEach(gh => { gh.x = 14; gh.y = 10; gh.mode = 'scatter'; });
    });
    const hub = await p.evaluate(() => {
      const s = document.getElementById('stick').getBoundingClientRect();
      return { x: s.left + s.width / 2, y: s.top + s.height / 2 };
    });
    const steered = await holdStick(p, hub.x, hub.y, hub.x + 46, hub.y, 2000);
    check(steered.stick === 0 && steered.dir === 0 && steered.x > 10.8, label + ': pushing the joystick right turns and moves', steered);
    check(await p.evaluate(() => GLOWMUNCH.audio.unlocked), label + ': the joystick touch unlocks audio');
    const audioEl = await p.evaluate(() => {
      const el = document.querySelector('audio');
      return { cross: el.getAttribute('crossorigin'), inline: el.getAttribute('playsinline') };
    });
    check(audioEl.cross == null && audioEl.inline != null, label + ': music element has no crossorigin', audioEl);
    check(p.errs.length === 0, label + ': no console errors', p.errs.slice(0, 4));
    await p.context().close();
  }

  await touchPlay('iPhone', devices['iPhone 13']);
  await touchPlay('iPhone 390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await touchPlay('iPhone 375x667', { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await touchPlay('landscape', { ...devices['iPhone 13 landscape'] });

  console.log('== iPhone title safe area');
  const phone = await open(devices['iPhone 13'], URL);
  const safe = await phone.evaluate(() => {
    const h = document.querySelector('#title h1').getBoundingClientRect();
    const card = document.querySelector('#title .card').getBoundingClientRect();
    const home = document.getElementById('home').getBoundingClientRect();
    const css = getComputedStyle(document.getElementById('home'));
    const titleCss = getComputedStyle(document.getElementById('title'));
    return {
      h: { top: h.top, bottom: h.bottom, left: h.left, right: h.right },
      card: { top: card.top, bottom: card.bottom, left: card.left, right: card.right },
      home: { top: home.top, bottom: home.bottom, left: home.left, right: home.right },
      w: innerWidth, ht: innerHeight,
      homeUsesSafe: css.top.indexOf('px') === css.top.length - 2,
      titlePad: titleCss.paddingBottom
    };
  });
  check(safe.h.top >= 0 && safe.h.bottom <= safe.ht && safe.h.left >= 4 && safe.h.right <= safe.w - 4, 'iPhone portrait: the title is fully visible', safe.h);
  check(safe.card.bottom <= safe.ht + 1 && safe.card.top >= 0, 'iPhone portrait: the title card is on screen', safe.card);
  check(safe.home.top >= 0 && safe.home.bottom < safe.h.top, 'iPhone portrait: the arcade link sits above the title', { home: safe.home, title: safe.h.top });
  check(phone.errs.length === 0, 'iPhone title: no console errors', phone.errs.slice(0, 4));
  await phone.context().close();

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
