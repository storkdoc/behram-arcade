/* MoodSticker auto-dodge (2026-11-09): the default corner must not cover the page's own links/buttons.
   Before: desktop VORTEX's "BACK TO ARCADE" sat under the sticker (clicks opened the rating card instead), and on phones
   Neuro Arena's / Meta Arena's "‹" and Jax's "← Arcade" were covered. A corner the player dragged it to is never overridden.
     python3 -m http.server 8080 &   NODE_PATH=<dir with playwright-core> node tests/mood-sticker-dodge.test.js [base] */
const { chromium } = require('playwright-core');
const BASE = (process.argv[2] || process.env.BASE || 'http://localhost:8080').replace(/\/$/, '');
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', msg); };
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1440, height: 900 } };
const probe = () => { const h = document.getElementById('mood-sticker'), w = h.shadowRoot.querySelector('.wrap'), r = h.shadowRoot.querySelector('.stk').getBoundingClientRect();
  const hits = [...document.querySelectorAll('a[href],button')].filter(e => { const b = e.getBoundingClientRect(); return b.width && b.height && getComputedStyle(e).visibility !== 'hidden' && b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top; }).map(e => e.id || e.textContent.trim());
  return { corner: w.className.split(' ')[1], dodged: w.getAttribute('data-dodged'), hits }; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = async (ctxOpts, slug, init) => { const c = await b.newContext(ctxOpts); const p = await c.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(e.message)); if (init) await p.addInitScript(init);
    await p.goto(`${BASE}/games/${slug}/`, { waitUntil: 'load' }); await p.waitForTimeout(3000); return p; };
  let p = await page(DESK, 'tube-shooter'); let r = await p.evaluate(probe);
  check(r.corner === 'br' && !r.hits.length, `desktop VORTEX: sticker leaves BACK TO ARCADE clear (${JSON.stringify(r)})`);
  const top = await p.evaluate(() => { const a = document.getElementById('back').getBoundingClientRect(); const e = document.elementFromPoint(a.left + 12, a.top + a.height / 2); return e && (e.id || e.tagName); });
  check(top === 'back', `desktop VORTEX: the left end of BACK TO ARCADE is clickable (top element: ${top})`);
  check(!p.errs.length, 'desktop VORTEX: no page errors ' + p.errs.join(' | ')); await p.context().close();
  p = await page(DESK, 'tube-shooter', () => localStorage.setItem('moodSticker.corner.tube-shooter', '"bl"')); r = await p.evaluate(probe);
  check(r.corner === 'bl', `desktop VORTEX: a corner the player dragged to is kept (${r.corner})`); await p.context().close();
  p = await page(DESK, 'star-raider'); r = await p.evaluate(probe);
  check(r.corner === 'bl' && !r.dodged, `desktop Star Raider: unaffected pages keep the default corner (${JSON.stringify(r)})`); await p.context().close();
  for (const slug of ['neuro-arena', 'meta-arena', 'jax-adventures', 'tube-shooter', 'reactor']) {
    p = await page(IPHONE, slug); r = await p.evaluate(probe);
    check(!r.hits.length, `iPhone ${slug}: sticker covers no link/button (${JSON.stringify(r)})`);
    check(!p.errs.length, `iPhone ${slug}: no page errors ` + p.errs.join(' | ')); await p.context().close();
  }
  p = await page(IPHONE, 'neuro-arena');
  const bb = await p.evaluate(() => { const r = document.getElementById('cPrev').getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; const e = document.elementFromPoint(x, y); return { x, y, top: e && (e.closest('#cPrev') ? 'cPrev' : e.tagName) }; });
  await p.touchscreen.tap(bb.x, bb.y); await p.waitForTimeout(400);
  const opened = await p.evaluate(() => MoodSticker.isOpen());
  check(bb.top === 'cPrev' && !opened, `iPhone Neuro Arena: a tap on ‹ reaches the button, not the rating card (top ${bb.top}, card open ${opened})`);
  await p.context().close();
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
