/* BEHRAM ARCADE landing page (cabinet carousel): desktop Chrome + iPhone emulation.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node tests/landing.test.js     (env: BASE, CHROME, SKIP_GAMES=1) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const open = async (opts, url = BASE, setup) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text() + ' ' + (m.location().url || '')); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('requestfailed', r => p.errs.push('REQFAIL ' + r.url()));
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    if (setup) await setup(p);
    await p.goto(url); await p.waitForTimeout(500); return p;
  };
  const idx = p => p.evaluate(() => ARCADE.index);
  const settled = p => p.waitForTimeout(30).then(() => p.waitForFunction(() => ARCADE.pos === ARCADE.index && !document.querySelector(".dragging"), null, { timeout: 3000 })).then(() => p.waitForTimeout(60));
  const centerBox = (p, i) => p.evaluate(i => { const r = document.querySelectorAll('.cab .front')[i].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, i);

  console.log('== DESKTOP Chrome 1440x900 @2x');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(500);
  const reg = await D.evaluate(() => ({ games: ARCADE_GAMES.map(g => g.slug), items: ARCADE.items.map(i => i.slug), dom: [...document.querySelectorAll('.cab')].map(c => c.dataset.slug), first: ARCADE_GAMES[0].slug }));
  check(reg.games.every(s => reg.items.includes(s) && reg.dom.includes(s)), 'every game in games.js has a cabinet', reg.games);
  check(reg.dom[reg.dom.length - 1] === '__soon', 'unplugged COMING SOON cabinet is last');
  check(await idx(D) === 0 && reg.items[0] === reg.first, 'newest game is centred on a first visit');
  const n = reg.items.length;
  const nodesc = await D.evaluate(() => !document.querySelector('.desc,.controls') && !/rules|description/i.test(document.getElementById('track').innerText));
  check(nodesc, 'no descriptions or rules on the cabinets');
  // crisp centre: front face exactly W x H at an integer position, no residual 3D scale
  const crisp = await D.evaluate(() => { const f = document.querySelectorAll('.cab .front')[ARCADE.index].getBoundingClientRect(); const W = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cw')); return { x: f.x, y: f.y, w: f.width, W }; });
  check(crisp.w === crisp.W && Number.isInteger(crisp.x) && Number.isInteger(crisp.y), 'centre cabinet renders 1:1 at whole pixels (crisp text)', crisp);
  const titleOk = await D.evaluate(() => [...document.querySelectorAll('.mq-t')].every(t => t.scrollWidth <= t.parentNode.clientWidth + 1));
  check(titleOk, 'every marquee title fits its marquee');
  await D.keyboard.press('ArrowRight'); await settled(D); check(await idx(D) === 1, 'Right arrow rotates to the next cabinet');
  await D.keyboard.press('ArrowLeft'); await D.keyboard.press('ArrowLeft'); await settled(D); check(await idx(D) === n - 1, 'Left arrow wraps around past the first cabinet', await idx(D));
  for (let k = 0; k < n; k++) await D.keyboard.press('ArrowRight');
  await settled(D); check(await idx(D) === n - 1, `${n} Right presses go all the way round`, await idx(D));
  await D.keyboard.press('ArrowRight'); await settled(D);
  // wheel / trackpad: one swipe gesture = one step
  const swipeWheel = dx => D.evaluate(dx => new Promise(res => { let k = 0; const fire = () => {
    // a trackpad swipe: a burst of pixel deltas followed by a decaying inertia tail
    const v = k < 8 ? dx : dx * Math.pow(0.85, k - 8);
    document.getElementById('carousel').dispatchEvent(new WheelEvent('wheel', { deltaX: v, deltaY: 0, deltaMode: 0, bubbles: true, cancelable: true }));
    if (++k < 30) setTimeout(fire, 12); else res(); }; fire(); }), dx);
  await swipeWheel(18);
  await settled(D); check(await idx(D) === 1, 'one horizontal trackpad swipe = one step', await idx(D));
  await D.waitForTimeout(250);
  await swipeWheel(-18);
  await settled(D); check(await idx(D) === 0, 'swipe back = one step back', await idx(D));
  // click a side cabinet -> it rotates to the centre
  const side = await centerBox(D, 1);
  await D.mouse.click(side.x + side.w * 0.75, side.y + side.h * 0.3); await settled(D);
  check(await idx(D) === 1, 'clicking a side cabinet brings it to the centre', await idx(D));
  // mouse drag
  await D.mouse.move(900, 500); await D.mouse.down(); for (let k = 1; k <= 10; k++) await D.mouse.move(900 - k * 30, 500); await D.mouse.up(); await settled(D);
  check(await idx(D) === 2, 'mouse drag rotates one cabinet', await idx(D));
  // persistence
  await D.reload(); await D.waitForTimeout(500);
  check(await idx(D) === 2, 'selection persists after reload', await idx(D));
  // Enter launches the right game
  const want = reg.items[2];
  await D.keyboard.press('Enter'); await D.waitForURL(u => /\/games\//.test(String(u)), { timeout: 3000 });
  check(D.url().endsWith(`games/${want}/index.html`), 'Enter launches the centred game', D.url());
  await D.goBack(); await D.waitForTimeout(600);
  check(await idx(D) === 2 && !(await D.evaluate(() => document.getElementById('fade').classList.contains('on'))), 'back from a game returns to the same cabinet, page visible');
  // click centre launches
  const cb = await centerBox(D, 2);
  await D.mouse.click(cb.x + cb.w / 2, cb.y + cb.h * 0.3); await D.waitForURL(u => /\/games\//.test(String(u)), { timeout: 3000 });
  check(D.url().endsWith(`games/${want}/index.html`), 'clicking the centre cabinet launches it');
  await D.goto(BASE); await D.waitForTimeout(400);
  // COMING SOON is not launchable
  await D.evaluate(() => localStorage.setItem('arcade.selected', '__soon')); await D.reload(); await D.waitForTimeout(400);
  check(await idx(D) === n - 1, 'unplugged cabinet can be selected');
  await D.keyboard.press('Enter'); await D.waitForTimeout(500);
  check(D.url() === BASE || D.url() === BASE + 'index.html', 'Enter on COMING SOON does not navigate');
  check(/NEW GAME EVERY DAY/.test(await D.textContent('#press')), 'caption nods to a new game every day');
  // deep link
  const D2 = await open({ viewport: { width: 1280, height: 800 } }, BASE + '?game=' + reg.items[3]);
  check(await idx(D2) === 3, '?game= deep link centres that game');
  // a11y
  const a11y = await D2.evaluate(() => { const c = document.querySelectorAll('.cab')[ARCADE.index]; return { tab: c.tabIndex, label: c.getAttribute('aria-label'), others: [...document.querySelectorAll('.cab')].filter(x => x.tabIndex === 0).length }; });
  check(a11y.tab === 0 && a11y.others === 1 && /game \d+ of/.test(a11y.label), 'centre cabinet is the focusable one, with an aria label', a11y);
  check(D.errs.length === 0 && D2.errs.length === 0, 'desktop: no console errors', [...D.errs, ...D2.errs]);

  console.log('== iPhone 13 (touch)');
  const I = await open({ ...devices['iPhone 13'] });
  await I.evaluate(() => localStorage.clear()); await I.reload(); await I.waitForTimeout(500);
  const cdp = await I.context().newCDPSession(I);
  // each touch carries its own timestamp (k * dt ms apart): on a loaded machine the CDP round trips alone take
  // 30-250 ms, which turned the 'fast flick' into a slow drag and made that check flaky
  const swipe = async (x0, x1, y, steps = 6, dt = 12) => {
    const t0 = Date.now() / 1000, ts = k => t0 + k * dt / 1000;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }], timestamp: ts(0) });
    for (let k = 1; k <= steps; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k / steps, y }], timestamp: ts(k) }); await I.waitForTimeout(dt); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: ts(steps + 1) });
  };
  await swipe(300, 190, 450, 8, 30); await settled(I);
  check(await idx(I) === 1, 'slow swipe left moves one cabinet', await idx(I));
  await swipe(80, 340, 450, 6, 4); await settled(I);   // 260 px in 24 ms: the drag (~1 cabinet) plus up to 4 more of momentum
  const fl = await idx(I); check(fl >= n - 4 && fl <= n - 1, 'fast flick right carries momentum past several cabinets and snaps', [fl, await I.evaluate(() => ARCADE.flick)]);
  check(await I.evaluate(() => Number.isInteger(ARCADE.pos)), 'flick snaps to a whole cabinet');
  await swipe(200, 200, 450, 2, 10); await settled(I);
  await I.evaluate(() => localStorage.setItem('arcade.selected', ARCADE.items[0].slug)); await I.reload(); await I.waitForTimeout(500);
  const vp = I.viewportSize();
  const sideI = await centerBox(I, 1);
  check(sideI.x < vp.width && sideI.x > vp.width / 2, 'side cabinet peeks in from the right on a narrow phone', sideI);
  await I.touchscreen.tap(vp.width - 20, sideI.y + sideI.h * 0.35); await settled(I);
  check(await idx(I) === 1, 'tapping a side cabinet brings it to the centre', await idx(I));
  const cI = await centerBox(I, 1);
  check(cI.w > vp.width * 0.5, 'centre cabinet is large on iPhone', cI);
  await I.touchscreen.tap(cI.x + cI.w / 2, cI.y + cI.h * 0.3);
  await I.waitForURL(u => /\/games\//.test(String(u)), { timeout: 3000 });
  check(I.url().endsWith(`games/${reg.items[1]}/index.html`), 'tapping the centre cabinet launches it', I.url());
  check(I.errs.length === 0, 'iPhone: no console errors', I.errs);
  for (const dev of ['iPhone 13 landscape', 'iPad Pro 11', 'iPad Pro 11 landscape']) {
    const p = await open({ ...devices[dev] });
    const ok = await p.evaluate(() => { const f = document.querySelectorAll('.cab .front')[ARCADE.index].getBoundingClientRect(); return f.top >= 0 && f.bottom <= innerHeight && f.width > 80; });
    check(ok && !p.errs.length, dev + ': centre cabinet fully on screen, no errors', p.errs);
    await p.context().close();
  }
  const R = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await R.keyboard.press('ArrowRight'); check(await R.evaluate(() => ARCADE.pos) === 1, 'reduced motion: rotation jumps without animation');

  console.log('== simulated new game prepended to games.js (network-level, file untouched)');
  const fake = { slug: 'zz-test-new', title: 'TEST NEW GAME', thumb: 'games/tube-shooter/thumb.png', added: '2099-01-01', accent: '#7dff5a', tagline: 't', description: 'd', controls: 'c', touch: 't' };
  const inject = async p => p.route('**/games.js*', async route => {
    const res = await route.fetch(); const body = await res.text();
    await route.fulfill({ response: res, body: body.replace('window.ARCADE_GAMES = [', 'window.ARCADE_GAMES = [' + JSON.stringify(fake) + ',') });
  });
  const N = await open({ viewport: { width: 1440, height: 900 } }, BASE, async p => {
    await p.goto(BASE); await p.evaluate(s => { localStorage.setItem('arcade.newestSeen', s); localStorage.setItem('arcade.selected', s); }, reg.first);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); await inject(p);
  });
  check(await N.evaluate(() => ARCADE.items[0].slug) === 'zz-test-new', 'prepended game is first in the carousel');
  check(await idx(N) === 0, 'a newly added game is centred on the next visit');
  check(await N.evaluate(() => !!document.querySelectorAll('.cab')[0].querySelector('.badge')), 'newly added game wears the NEW badge');
  await N.keyboard.press('ArrowRight'); await settled(N); await N.reload(); await N.waitForTimeout(400);
  check(await idx(N) === 1, 'after that, the last-selected cabinet is remembered again');
  check(N.errs.length === 0, 'no console errors with the extra entry', N.errs);

  if (!process.env.SKIP_GAMES) {
    console.log('== every game page still loads');
    const G = await open({ viewport: { width: 1280, height: 800 } });
    for (const it of await G.evaluate(() => ARCADE.items.filter(i => !i.soon))) {
      const pg = await G.context().newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
      const r = await pg.goto(BASE + it.url); await pg.waitForTimeout(900);
      check(r && r.status() === 200 && !errs.length, `${it.title} (${it.url}) loads`, errs); await pg.close();
    }
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
