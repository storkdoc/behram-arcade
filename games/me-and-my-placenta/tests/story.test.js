/* Me & My Placenta — headless Chrome.
   Title cover, narration on a gesture, pictures that change, ducked nursery
   music, the Amazon link, the provided QR, and the cabinet on the landing page.
   Run from the repo root:
     python3 -m http.server 8099
     node games/me-and-my-placenta/tests/story.test.js
*/
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8099/games/me-and-my-placenta/index.html';
const HOME = process.env.HOME_URL || 'http://127.0.0.1:8099/';
const AMAZON = 'https://www.amazon.com/s?k=steve+behram&crid=HGRQYCNCX1JN&sprefix=steve+behram%2Caps%2C79&ref=nb_sb_noss_1';
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERR ' + e.message));
  page.on('requestfailed', (r) => {
    const u = r.url();
    const why = (r.failure() && r.failure().errorText) || '';
    if (/favicon/i.test(u)) return;
    if (why === 'net::ERR_ABORTED' && /archive\.org|upload\.wikimedia\.org|commons\.wikimedia\.org/.test(u)) return;
    errs.push('REQFAIL ' + u + ' ' + why);
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push(r.status() + ' ' + r.url());
  });

  await page.goto(BASE + '?fast=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.PLACENTA && PLACENTA.ready, null, { timeout: 8000 });
  await page.evaluate(() => PLACENTA.ready);

  const title = await page.evaluate(() => {
    const cover = document.getElementById('cover');
    const titleEl = document.getElementById('title');
    const r = cover.getBoundingClientRect();
    return {
      hidden: titleEl.hasAttribute('hidden'),
      src: cover.getAttribute('src'),
      w: r.width,
      h: r.height,
      natural: cover.naturalWidth,
      text: document.querySelector('.title-copy').innerText
    };
  });
  check(!title.hidden && title.w > 400 && title.h > 300 && title.natural > 0, 'title screen shows the cover', title);
  check(title.src === 'art/cover.jpg', 'cover image is the official file', title.src);
  check(/Steve Behram/.test(title.text) && /play/i.test(title.text) && /Listen to the book/.test(title.text), 'title names the author and offers play and listen', title.text);

  const buy = await page.evaluate(() => {
    const a = document.getElementById('buy');
    const b = document.getElementById('buy-end');
    return { href: a.href, target: a.target, rel: a.rel, end: b.href, endTarget: b.target };
  });
  check(buy.href === AMAZON && buy.target === '_blank' && /noopener/.test(buy.rel) && buy.end === AMAZON && buy.endTarget === '_blank', 'Amazon buttons use the official URL and open a new tab', buy);
  const review = await page.evaluate(() => {
    const a = document.getElementById('review');
    const b = document.getElementById('review-end');
    return { text: a.textContent, href: a.href, target: a.target, rel: a.rel, endText: b.textContent, end: b.href, endTarget: b.target, endRel: b.rel };
  });
  check(review.text === 'Leave a review on Amazon' && review.endText === 'Leave a review on Amazon' && review.href === AMAZON && review.end === AMAZON && review.target === '_blank' && review.endTarget === '_blank' && /noopener/.test(review.rel) && /noopener/.test(review.endRel), 'review links use the official search and open a new tab', review);

  const qr = await page.evaluate(async () => {
    const img = document.getElementById('qr');
    const end = document.getElementById('qr-end');
    const buf = await fetch(img.src).then(r => r.arrayBuffer());
    const bytes = new Uint8Array(buf);
    let hash = 0;
    for (let i = 0; i < bytes.length; i++) hash = (hash * 33 + bytes[i]) >>> 0;
    return {
      src: img.getAttribute('src'),
      endSrc: end.getAttribute('src'),
      w: img.naturalWidth,
      h: img.naturalHeight,
      n: bytes.length,
      hash: hash
    };
  });
  check(qr.src === 'qr/qr-code.png' && qr.endSrc === 'qr/qr-code.png' && qr.w === 3000 && qr.h === 3000 && qr.n === 105342, 'QR image is the provided file', qr);

  const board = await page.evaluate(async () => {
    const names = ['01-cosmic-ballet-conception.jpg', '10-grand-entrance.jpg', '23-thank-you.jpg'];
    const out = [];
    for (const name of names) {
      const r = await fetch('art/board/' + name);
      const buf = await r.arrayBuffer();
      out.push({ name, ok: r.ok, n: buf.byteLength, type: r.headers.get('content-type') });
    }
    return out;
  });
  check(board.every(b => b.ok && b.n > 200000 && /jpeg/.test(b.type || '')), 'storyboard frames are served', board);

  const book = await page.evaluate(async () => {
    const html = await fetch('index.html').then(r => r.text());
    const m = await fetch('audio/manifest.json').then(r => r.json());
    const ids = m.chapters.map(c => c.id + '|' + c.file + '|' + c.kicker);
    const sizes = {};
    for (const name of ['03-ch01.mp3', '04-ch02.mp3', '05-ch03.mp3', '06-ch04.mp3']) {
      const r = await fetch('audio/' + name, { method: 'HEAD' });
      sizes[name] = { ok: r.ok, len: r.headers.get('content-length') };
    }
    return { ids, missing: /not in this copy/i.test(html), sizes };
  });
  const order = ['opening|clip-04-12sec.mp3|Opening', 'dedication|clip-05-30sec.mp3|Dedication', 'ch01|03-ch01.mp3|Chapter 1', 'ch02|04-ch02.mp3|Chapter 2', 'ch03|05-ch03.mp3|Chapter 3', 'ch04|06-ch04.mp3|Chapter 4', 'grand|clip-03-656sec.mp3|Chapter 5', 'goodbye|clip-01-66sec.mp3|Acknowledgments', 'credits|clip-02-29sec.mp3|Credits'];
  check(!book.missing && JSON.stringify(book.ids) === JSON.stringify(order), 'nine tracks are in official order and the missing-chapter note is gone', book.ids);
  const want = { '03-ch01.mp3': '7002528', '04-ch02.mp3': '12751008', '05-ch03.mp3': '22289712', '06-ch04.mp3': '22079184' };
  const sizeOk = Object.keys(want).every(n => book.sizes[n] && book.sizes[n].ok && book.sizes[n].len === want[n]);
  check(sizeOk, 'chapter mp3 content lengths match', book.sizes);

  await page.click('#listen');
  await page.waitForFunction(() => PLACENTA.chapterId === 'grand' && PLACENTA.narration.currentTime > 0.02, null, { timeout: 8000 });
  const before = await page.evaluate(() => PLACENTA.art);
  const audio = await page.waitForFunction(() => {
    const n = PLACENTA.narration;
    const m = PLACENTA.musicElement();
    return n && m && n !== m && !n.paused && n.volume > 0 && n.currentTime > 0.15
      && !m.paused && m.volume > 0 && m.currentTime > 0.05 && PLACENTA.ducked;
  }, null, { timeout: 12000 }).then(() => page.evaluate(() => {
    const n = PLACENTA.narration;
    const m = PLACENTA.musicElement();
    return {
      nt: n.currentTime, nv: n.volume, np: n.paused,
      mt: m.currentTime, mv: m.volume, mp: m.paused,
      ducked: PLACENTA.ducked, art: PLACENTA.art, chapter: PLACENTA.chapterId,
      line: PLACENTA.musicLine(), tracks: PLACENTA.trackCount(),
      different: n !== m
    };
  })).catch(async (e) => ({ error: String(e), state: await page.evaluate(() => {
    const n = PLACENTA.narration;
    const m = PLACENTA.musicElement();
    return { np: n && n.paused, nt: n && n.currentTime, nv: n && n.volume, ne: n && n.error && n.error.code, mp: m && m.paused, mt: m && m.currentTime, mv: m && m.volume, me: m && m.error && m.error.code, art: PLACENTA.art, chapter: PLACENTA.chapterId, ducked: PLACENTA.ducked };
  }) }));
  check(!audio.error && audio.different && audio.nv > 0 && audio.nt > 0.1 && audio.mv > 0 && audio.mt > 0 && audio.ducked, 'narration plays on a gesture and nursery music ducks under it', audio);
  check(audio.chapter === 'grand' && audio.tracks >= 15, 'fast mode plays the long chapter over a real lullaby set', audio);

  const changed = await page.waitForFunction((first) => PLACENTA.art && PLACENTA.art !== first, before, { timeout: 8000 })
    .then(() => page.evaluate((first) => ({ first: first, now: PLACENTA.art, curtain: PLACENTA.curtain, globe: PLACENTA.globe }), before))
    .catch(async (e) => ({ error: String(e), now: await page.evaluate(() => PLACENTA.art) }));
  check(!changed.error && changed.now && changed.now !== changed.first, 'illustrations change during the long chapter', changed);

  await page.evaluate(() => PLACENTA.narration.pause());
  await page.waitForFunction(() => !PLACENTA.ducked, null, { timeout: 2000 }).catch(() => {});
  const risen = await page.evaluate(() => ({ ducked: PLACENTA.ducked, mv: PLACENTA.musicElement().volume, paused: PLACENTA.narration.paused }));
  check(risen.paused && !risen.ducked && risen.mv > 0, 'music rises when the narration pauses', risen);

  const clean = errs.filter(e => !/net::ERR_ABORTED/.test(e));
  check(clean.length === 0, 'no console errors', clean);

  const playPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const playErrs = [];
  playPage.on('pageerror', (e) => playErrs.push('PAGEERR ' + e.message));
  playPage.on('console', (m) => { if (m.type() === 'error') playErrs.push(m.text()); });
  await playPage.goto(BASE + '?fast=1', { waitUntil: 'domcontentloaded' });
  await playPage.evaluate(() => PLACENTA.ready);
  await playPage.click('#play-game');
  await playPage.waitForFunction(() => PLACENTA.mode === 'play' && PLACENTA.playStage === 'meet', null, { timeout: 4000 });
  const x0 = await playPage.evaluate(() => PLACENTA.player.x);
  await playPage.keyboard.down('ArrowRight');
  await playPage.waitForTimeout(500);
  const x1 = await playPage.evaluate(() => PLACENTA.player.x);
  await playPage.keyboard.up('ArrowRight');
  check(x1 > x0 + 0.02, 'arrow keys float Cletus toward Placy', { x0, x1 });
  await playPage.keyboard.down('ArrowRight');
  const kicked = await playPage.waitForFunction(() => PLACENTA.playStage === 'kick', null, { timeout: 8000 })
    .then(() => true).catch(() => false);
  await playPage.keyboard.up('ArrowRight');
  check(kicked, 'reaching Placy opens kicking practice', await playPage.evaluate(() => PLACENTA.playStage));
  for (let i = 0; i < 6; i++) {
    await playPage.keyboard.press('Space');
    await playPage.waitForTimeout(180);
  }
  const afterKick = await playPage.evaluate(() => ({ stage: PLACENTA.playStage, kicks: PLACENTA.kicks, actions: PLACENTA.actions }));
  check(afterKick.actions >= 4 && (afterKick.kicks >= 1 || afterKick.stage !== 'kick'), 'space kicks on the beat', afterKick);
  await playPage.keyboard.press('Escape');
  const paused = await playPage.evaluate(() => PLACENTA.paused === true && !document.getElementById('paused').hasAttribute('hidden'));
  check(paused, 'escape pauses the journey');
  await playPage.keyboard.press('Escape');
  const back = await playPage.evaluate(() => PLACENTA.mode === 'title' && !document.getElementById('title').hasAttribute('hidden'));
  check(back, 'escape again returns to the title');
  check(playErrs.length === 0, 'play mode has no console errors', playErrs);

  const home = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await home.goto(HOME, { waitUntil: 'domcontentloaded' });
  await home.waitForFunction(() => window.ARCADE && ARCADE.items, null, { timeout: 8000 });
  const cab = await home.evaluate(() => {
    const g = ARCADE_GAMES.find(x => x.slug === 'me-and-my-placenta');
    const el = document.querySelector('.cab[data-slug="me-and-my-placenta"]');
    const img = el && el.querySelector('.scr img');
    return {
      first: ARCADE_GAMES[0].slug,
      title: g && g.title,
      thumb: g && g.thumb,
      img: img && img.getAttribute('src'),
      inDom: !!el
    };
  });
  check(cab.first === 'me-and-my-placenta' && cab.inDom && cab.img === 'games/me-and-my-placenta/thumb.png', 'cabinet is on the home carousel with the cover thumb', cab);

  await browser.close();
  if (fails) { console.log(fails + ' failed'); process.exit(1); }
  console.log('all passed');
})().catch((e) => { console.error(e); process.exit(1); });
