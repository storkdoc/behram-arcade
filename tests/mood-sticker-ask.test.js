/* MoodSticker ASK bubble (2026-11-20): after a game over / win, once per page and once per game per day, a purely visual
   'How was it? Tap me' bubble shows next to the sticker for 7 s. It never takes input from the game.
     python3 -m http.server 8080 &   NODE_PATH=<dir with playwright-core> node tests/mood-sticker-ask.test.js [base] */
const { chromium } = require('playwright-core');
const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:8080').replace(/\/$/, '');
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', msg); };
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 800 } };
const FAST = () => { window.MOOD_STICKER_CONFIG = { askAfterMs: 1, textdbKey: null, ntfyUrl: null }; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [dev, opts, slug] of [['desktop', DESK, 'star-invaders'], ['iPhone', IPHONE, 'star-invaders'], ['desktop', DESK, 'tube-shooter'], ['iPhone', IPHONE, 'reactor']]) {
    const c = await b.newContext(opts); await c.addInitScript(FAST); await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort());
    const p = await c.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${BASE}/games/${slug}/`, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    if (dev === 'iPhone') await p.touchscreen.tap(5, 400); else await p.mouse.move(600, 400);
    await p.evaluate(() => MoodSticker.event('lose')); await p.waitForTimeout(1600);
    let a = await p.evaluate(() => MoodSticker._ask());
    const want = dev === 'iPhone' ? 'How was it? Tap me' : 'How was it? Click me ( ` )';
    check(a.shown === 1 && a.on && a.text === want, `${dev} ${slug}: bubble shows after GAME OVER ("${a.text}", on ${a.on})`);
    const geo = await p.evaluate(() => { const h = document.getElementById('mood-sticker'), s = h.shadowRoot, r = s.querySelector('.ask').getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y), pe = getComputedStyle(s.querySelector('.ask')).pointerEvents;
      return { r: [r.left, r.top, r.right, r.bottom].map(Math.round), W: innerWidth, H: innerHeight, top: e && e.id, pe }; });
    check(geo.r[0] >= 0 && geo.r[1] >= 0 && geo.r[2] <= geo.W && geo.r[3] <= geo.H, `${dev} ${slug}: bubble fully on screen ${JSON.stringify(geo.r)} in ${geo.W}x${geo.H}`);
    check(geo.pe === 'none' && geo.top !== 'mood-sticker', `${dev} ${slug}: bubble takes no clicks/taps (pointer-events ${geo.pe}, top element "${geo.top}")`);
    check(!(await p.evaluate(() => MoodSticker.isOpen())), `${dev} ${slug}: the card does not open by itself`);
    await p.evaluate(() => MoodSticker.event('lose')); await p.waitForTimeout(300);
    a = await p.evaluate(() => MoodSticker._ask());
    check(a.shown === 1 && a.skipped === 'once per page', `${dev} ${slug}: only once per page (${a.skipped})`);
    await p.waitForTimeout(7600); a = await p.evaluate(() => MoodSticker._ask());
    check(!a.on, `${dev} ${slug}: bubble hides itself after 7 s`);
    await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(1200); await p.evaluate(() => MoodSticker.event('win')); await p.waitForTimeout(300);
    a = await p.evaluate(() => MoodSticker._ask());
    check(a.shown === 0 && a.skipped === 'asked today', `${dev} ${slug}: not again the same day after a reload (${a.skipped})`);
    check(!errs.length, `${dev} ${slug}: no page errors ${errs.join(' | ')}`);
    await c.close();
  }
  // rated recently -> no bubble; default delay -> too early; opening the card hides a showing bubble
  let c = await b.newContext(DESK); await c.addInitScript(FAST); await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort()); let p = await c.newPage();
  await p.goto(`${BASE}/games/star-invaders/`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(() => { MoodSticker._submit('fun', ''); MoodSticker.event('lose'); }); await p.waitForTimeout(300);
  let a = await p.evaluate(() => MoodSticker._ask());
  check(a.shown === 0 && a.skipped === 'rated recently', `no bubble when this game was rated in the last 3 days (${a.skipped})`);
  await c.close();
  c = await b.newContext(DESK); await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort()); p = await c.newPage();
  await p.goto(`${BASE}/games/star-invaders/`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(() => MoodSticker.event('lose')); await p.waitForTimeout(300);
  a = await p.evaluate(() => MoodSticker._ask());
  check(a.shown === 0 && a.skipped === 'too early', `default: no bubble in the first 40 s on a page (${a.skipped})`);
  await c.close();
  c = await b.newContext(DESK); await c.addInitScript(FAST); await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort()); p = await c.newPage();
  await p.goto(`${BASE}/games/star-invaders/`, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.evaluate(() => MoodSticker.event('win')); await p.waitForTimeout(1600);
  await p.keyboard.press('Backquote'); await p.waitForTimeout(300);
  a = await p.evaluate(() => ({ a: MoodSticker._ask(), open: MoodSticker.isOpen() }));
  check(a.open && !a.a.on, `the backquote key still opens the card, and that hides the bubble (open ${a.open}, on ${a.a.on})`);
  await c.close();
  // LONG-PLAY ASK (2026-11-24): after askPlayMs of active play with no game over, the bubble shows at the first lull
  for (const [dev, opts, slug] of [['desktop', DESK, 'dr-behrams-office'], ['iPhone', IPHONE, 'jukebox']]) {
    c = await b.newContext(opts);
    await c.addInitScript(() => { window.MOOD_STICKER_CONFIG = { askAfterMs: 1, askPlayMs: 10000, textdbKey: null, ntfyUrl: null }; });
    await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort()); p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(`${BASE}/games/${slug}/`, { waitUntil: 'domcontentloaded' });
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < 13000) { if (dev === 'iPhone') await p.touchscreen.tap(5, 700); else await p.mouse.move(300 + (i++ % 9) * 20, 400); await p.waitForTimeout(500); }
    a = await p.evaluate(() => MoodSticker._ask());
    check(a.shown === 0, `${dev} ${slug}: no long-play bubble while the player keeps giving input (play ${a.playSec} s)`);
    await p.waitForFunction(() => MoodSticker._ask().on, null, { timeout: 12000 }).catch(() => {}); a = await p.evaluate(() => MoodSticker._ask());
    const want = dev === 'iPhone' ? 'How was it? Tap me' : 'How was it? Click me ( ` )';
    check(a.shown === 1 && a.why === 'play' && a.on && a.text === want, `${dev} ${slug}: long-play bubble at the first lull (why ${a.why}, on ${a.on}, "${a.text}")`);
    check(!(await p.evaluate(() => MoodSticker.isOpen())), `${dev} ${slug}: the card still does not open by itself`);
    await p.evaluate(() => MoodSticker.event('lose')); await p.waitForTimeout(300); a = await p.evaluate(() => MoodSticker._ask());
    check(a.shown === 1, `${dev} ${slug}: a later GAME OVER does not ask again on the same page`);
    check(!errs.length, `${dev} ${slug}: no page errors ${errs.join(' | ')}`);
    await c.close();
  }
  // idle (no input at all) never counts as play
  c = await b.newContext(DESK); await c.addInitScript(() => { window.MOOD_STICKER_CONFIG = { askAfterMs: 1, askPlayMs: 33000, textdbKey: null, ntfyUrl: null }; });
  await c.route(/textdb\.dev|ntfy\.sh/, r => r.abort()); p = await c.newPage();
  await p.goto(`${BASE}/games/relax/`, { waitUntil: 'load' }); 
  await p.waitForTimeout(1000); await p.mouse.move(400, 400); await p.waitForTimeout(36000);
  a = await p.evaluate(() => MoodSticker._ask());
  check(a.shown === 0 && a.playSec <= 35, `an idle page does not count as play (play ${a.playSec} s, shown ${a.shown})`);
  await c.close();
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
