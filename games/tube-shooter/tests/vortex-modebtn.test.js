// VORTEX 2026-11-04: in phone LANDSCAPE the touch 'MODE: SPINNER/ARROWS' button sat under the feedback sticker
// (top-left, 48px down). It now starts below the sticker. Checks no overlap with the sticker, the spinner knob
// or the arrow buttons on iPhone 14 / iPhone SE / Pixel 7 landscape, and that the button still toggles the mode.
// Day 11: also call touchSync via gotoLevel/step (they now sync data-ts), and null-guard the geometry checks.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-modebtn.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const dev of ['iPhone 14 landscape', 'iPhone SE landscape', 'Pixel 7 landscape', 'iPhone 14']) {
    console.log(`\n=== ${dev} ===`);
    const ctx = await browser.newContext({ ...devices[dev] }), page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(800);
    await page.evaluate(() => { VORTEX.freeze(true); VORTEX.gotoLevel(1); VORTEX.step(3, () => VORTEX.state.state === 'play'); dispatchEvent(new Event('resize')); });
    await sleep(400);
    const r = await page.evaluate(() => {
      const R = el => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && getComputedStyle(el).display !== 'none' ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
      const h = document.getElementById('mood-sticker'), w = h && h.shadowRoot && h.shadowRoot.querySelector('.wrap');
      const btn = w && [...w.children].find(c => c.getBoundingClientRect().width > 20);
      const q = c => document.getElementById(c);
      return { st: VORTEX.state.state, ts: document.body.dataset.ts, mode: R(q('tmode')), sticker: R(btn || w), corner: w && w.className, knob: R(q('tknob')), left: R(q('tleft')), right: R(q('tright')), iw: innerWidth, ih: innerHeight };
    });
    check(r.st === 'play' && r.ts === 'game', `in play with data-ts=game (${r.st}/${r.ts})`);
    check(!!r.mode, `MODE button shown (${JSON.stringify(r.mode)})`);
    if (r.mode) {
      check(r.sticker && !hit(r.mode, r.sticker), `MODE button clear of the feedback sticker ${JSON.stringify(r.sticker)} ${r.corner}`);
      for (const k of ['knob', 'left', 'right']) if (r[k]) check(!hit(r.mode, r[k]), `MODE button clear of ${k}`);
      check(r.mode.y + r.mode.h <= r.ih && r.mode.x >= 0, 'MODE button on screen');
      const m0 = await page.evaluate(() => document.getElementById('tmode').textContent);
      const b = r.mode; await page.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2); await sleep(300);
      const m1 = await page.evaluate(() => document.getElementById('tmode').textContent);
      check(m0 !== m1, `tapping it toggles the mode (${m0} -> ${m1})`);
    }
    check(!errs.length, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})();
