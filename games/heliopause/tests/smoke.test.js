// Headless smoke test: desktop, iPhone and iPad landscape. Usage: NODE_PATH=... node tests/smoke.test.js [baseUrl]
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8091/games/heliopause/';
const OUT = process.env.SHOTS || '/workspace/td-shots';
const VPS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, dpr: 1, touch: false },
  { name: 'iphone', viewport: { width: 844, height: 390 }, dpr: 3, touch: true, mobile: true },
  { name: 'ipad', viewport: { width: 1180, height: 820 }, dpr: 2, touch: true, mobile: true }
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let fail = 0;
  for (const vp of VPS) {
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: !!vp.mobile });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(BASE, { waitUntil: 'load' }); await sleep(800);
    await page.screenshot({ path: `${OUT}/${vp.name}-0-begin.png` });
    if (vp.touch) await page.tap('#beginBtn'); else await page.click('#beginBtn');
    await sleep(vp.name === 'desktop' ? 16000 : 1500);
    await page.screenshot({ path: `${OUT}/${vp.name}-1-title.png` });
    await page.keyboard.press('Space'); await sleep(1200);
    await page.screenshot({ path: `${OUT}/${vp.name}-2-menu.png` });
    // keyboard into campaign
    await page.keyboard.press('ArrowDown'); await sleep(100);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
    // click campaign via text
    await page.evaluate(() => [...document.querySelectorAll('#mlist button')].find(b => /CAMPAIGN/.test(b.textContent)).click());
    await sleep(700); await page.screenshot({ path: `${OUT}/${vp.name}-3-chapters.png` });
    await page.click('#chGo'); await sleep(1500);
    await page.screenshot({ path: `${OUT}/${vp.name}-4-game.png` });
    // select a site by tapping/clicking where eo1 is
    const pos = await page.evaluate(() => { const s = HP.sim, p = s.sitePos('lu1'); return HP.R.toScreen(p.x, p.y); });
    if (vp.touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
    await sleep(300);
    const sel = await page.evaluate(() => HP.ui().sel);
    await page.keyboard.press('1'); await sleep(200);
    await page.evaluate(() => { HP.select('eo1'); HP.doAct('build', 'rail'); HP.select('eo3'); HP.doAct('build', 'rail'); HP.select('ve1'); HP.doAct('build', 'solar'); HP.select('eo2'); });
    await sleep(400); await page.screenshot({ path: `${OUT}/${vp.name}-5-build.png` });
    await page.keyboard.press('Escape'); await sleep(100);
    await page.keyboard.press('Space'); await sleep(200);
    await page.keyboard.press('f'); await page.keyboard.press('f');
    await sleep(9000); await page.screenshot({ path: `${OUT}/${vp.name}-6-wave.png` });
    await page.keyboard.press('r'); await sleep(500); await page.screenshot({ path: `${OUT}/${vp.name}-7-research.png` });
    await page.keyboard.press('r'); await sleep(200);
    // gamepad: fake a pad pressing Start
    await page.evaluate(() => { const btn = (p) => ({ pressed: p, value: p ? 1 : 0 }); let t = 0; navigator.getGamepads = () => [{ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i === 9 && t++ < 3)) }]; });
    await sleep(400);
    const st = await page.evaluate(() => HP.state);
    await page.screenshot({ path: `${OUT}/${vp.name}-8-pause.png` });
    const info = await page.evaluate(() => ({ w: HP.sim.w, mode: HP.sim.mode, structs: Object.keys(HP.sim.structs), earth: HP.sim.earthHp, aliens: HP.sim.aliens.length }));
    console.log(vp.name, JSON.stringify({ focused, sel, st, info, errs }));
    if (errs.length || sel !== 'lu1' || st !== 'pause' || info.structs.indexOf('lu1') < 0) fail++;
    await ctx.close();
  }
  await browser.close();
  console.log(fail ? 'SMOKE FAIL ' + fail : 'SMOKE OK'); process.exit(fail ? 1 : 0);
})();
