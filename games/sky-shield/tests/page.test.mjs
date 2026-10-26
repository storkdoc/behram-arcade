// Page tests: Chromium + WebKit × desktop / iPhone portrait / iPhone landscape / iPad.
// Needs a server at repo root (python3 -m http.server 8080). node games/sky-shield/tests/page.test.mjs [chromium|webkit|all] [shotDir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const ROOT = process.env.SS_URL || 'http://localhost:8080/games/sky-shield/';
const which = process.argv[2] || 'all', SHOTS = process.argv[3] || '';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: IOS },
  'iphone-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: IOS },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: IPAD },
};
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(page, fn, ms = 12000, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await wait(120); } return false; }
// decode a screenshot in the page and count grid cells that are (nearly) pure black
async function blackCells(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, GX = 8, GY = 8, out = [];
    for (let gy = 0; gy < GY * 0.75; gy++) for (let gx = 0; gx < GX; gx++) {   // sky + skyline (the ground strip may legitimately be dark)
      let dark = 0, n = 0; const x0 = Math.floor(gx * c.width / GX), x1 = Math.floor((gx + 1) * c.width / GX), y0 = Math.floor(gy * c.height / GY), y1 = Math.floor((gy + 1) * c.height / GY);
      for (let y = y0; y < y1; y += 4) for (let xx = x0; xx < x1; xx += 4) { const i = (y * c.width + xx) * 4; n++; if (d[i] + d[i + 1] + d[i + 2] < 7) dark++; }
      if (dark / n > 0.97) out.push(gx + ',' + gy);
    }
    return out;
  }, b64);
}
async function runCase(browserType, eng, dev) {
  const tag = `${eng}/${dev}`, o = Object.assign({}, DEVICES[dev]); if (eng === 'webkit') delete o.isMobile; // WebKit has no isMobile
  const ctx = await browserType.newContext(o); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|peerjs|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await page.route(/0\.peerjs\.com|peerjs\.com\/peerjs/, r => r.abort());
  const touch = dev !== 'desktop';
  await page.goto(ROOT + '?nolock=1' + (touch ? '&touch=1' : ''));
  ok(await until(page, () => window.SS && SS.booted && SS.app.screen === 'title'), `${tag}: boots to title`);
  await wait(1800);
  const st = await page.evaluate(() => SS.R.stats());
  ok(st.lastSelf && st.lastSelf.black < 6, `${tag}: WebGL pixel self-check (black ${st.lastSelf && st.lastSelf.black}/24, tier ${st.tier}, pr ${st.pr.toFixed(2)})`);
  const bc = await blackCells(page); ok(bc.length === 0, `${tag}: no black regions on title ${bc.join(' ')}`);
  if (touch) ok(st.tier <= 2, `${tag}: mobile starts at a lower tier (${st.tier})`);
  // menus
  const click = async sel => touch ? page.tap(sel) : page.click(sel);
  await click('[data-act=solo]'); ok(await until(page, () => SS.app.screen === 'select'), `${tag}: wave select`);
  await click('#waves [data-w="3"]'); await click('[data-act=start]');
  ok(await until(page, () => SS.app.screen === 'play' && SS.g && SS.g.wave === 3), `${tag}: game starts at wave 3`);
  ok(await until(page, () => SS.g.phase === 'play', 8000), `${tag}: intro -> play`);
  const meta = await page.evaluate(() => { const m = document.querySelector('meta[name=viewport]').content; return { m, ta: getComputedStyle(document.body).touchAction, ob: getComputedStyle(document.documentElement).overscrollBehavior || getComputedStyle(document.body).overscrollBehavior }; });
  if (touch) ok(/user-scalable=no/.test(meta.m) && /viewport-fit=cover/.test(meta.m) && meta.ta === 'none', `${tag}: no zoom / no bounce / safe areas (${meta.ta}, ${meta.ob})`);
  if (!touch) {
    const f0 = await page.evaluate(() => SS.g.stats.fired);
    await page.mouse.move(640, 300); await page.mouse.move(700, 250, { steps: 5 });
    await page.keyboard.press('Space'); await wait(150); await page.keyboard.press('KeyA'); await wait(150); await page.keyboard.press('KeyD'); await wait(150); await page.keyboard.press('KeyX'); await wait(250);
    const r = await page.evaluate(() => ({ f: SS.g.stats.fired, a: SS.g.bases.map(b => b.ammo) }));
    ok(r.f - f0 === 4 && r.a[0] < 10 && r.a[2] < 10 && r.a[1] < 10, `${tag}: Space + A/D/X fire (${r.f - f0} shots, ammo ${r.a})`);
    const e0 = await page.evaluate(() => SS.g.emp); await page.keyboard.press('Enter'); await wait(200);
    ok(await page.evaluate(e0 => SS.g.emp === e0 - 1, e0), `${tag}: Enter fires EMP`);
    const c0 = await page.evaluate(() => [SS.cross.x, SS.cross.y]); await page.keyboard.down('ArrowLeft'); await wait(400); await page.keyboard.up('ArrowLeft');
    const c1 = await page.evaluate(() => [SS.cross.x, SS.cross.y]); ok(c1[0] < c0[0] - 3, `${tag}: arrow keys roll the crosshair (${c0[0].toFixed(1)} -> ${c1[0].toFixed(1)})`);
    await page.keyboard.press('KeyP'); ok(await until(page, () => SS.app.screen === 'pause', 3000), `${tag}: P pauses`);
    const t0 = await page.evaluate(() => SS.g.t); await wait(400); ok(await page.evaluate(t0 => SS.g.t === t0, t0), `${tag}: paused sim is frozen`);
    await page.keyboard.press('Escape'); ok(await until(page, () => SS.app.screen === 'play', 3000), `${tag}: resume`);
  } else {
    const vis = await page.evaluate(() => [...document.querySelectorAll('#tbtns .tb')].map(b => { const r = b.getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, r.width, r.height]; }));
    ok(vis.length === 4 && vis.every(v => v[0] && v[1] >= 44 && v[2] >= 44), `${tag}: 4 touch buttons on screen, >=44px (${vis.map(v => v[1].toFixed(0) + 'x' + v[2].toFixed(0)).join(' ')})`);
    const pad = await page.evaluate(() => { const r = document.getElementById('tpad').getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.45 }; });
    const btn = await page.evaluate(() => { const r = document.querySelector('.tb[data-b="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cx0 = await page.evaluate(() => SS.cross.x), f0 = await page.evaluate(() => SS.g.stats.fired);
    if (eng === 'chromium') {
      const cdp = await ctx.newCDPSession(page); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await T('touchStart', [{ x: pad.x, y: pad.y, id: 1 }]);
      for (let i = 1; i <= 8; i++) { await T('touchMove', [{ x: pad.x + i * 12, y: pad.y - i * 4, id: 1 }]); await wait(16); }
      // second finger taps FIRE R while the first is still on the pad (multi-touch)
      await T('touchStart', [{ x: pad.x + 96, y: pad.y - 32, id: 1 }, { x: btn.x, y: btn.y, id: 2 }]); await wait(60);
      await T('touchMove', [{ x: pad.x + 110, y: pad.y - 36, id: 1 }, { x: btn.x, y: btn.y, id: 2 }]);
      await T('touchEnd', [{ x: pad.x + 110, y: pad.y - 36, id: 1 }]); await wait(40); await T('touchEnd', []);
    } else {
      await page.evaluate(({ pad, btn }) => {
        const P = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const tp = document.getElementById('tpad'), b = document.elementFromPoint(btn.x, btn.y).closest('.tb');
        P(tp, 'pointerdown', 1, pad.x, pad.y); for (let i = 1; i <= 8; i++) P(tp, 'pointermove', 1, pad.x + i * 12, pad.y - i * 4);
        P(b, 'pointerdown', 2, btn.x, btn.y); P(b, 'pointerup', 2, btn.x, btn.y); P(tp, 'pointerup', 1, pad.x + 96, pad.y - 32);
      }, { pad, btn });
    }
    await wait(500);
    const r = await page.evaluate(() => ({ x: SS.cross.x, f: SS.g.stats.fired, a: SS.g.bases[2].ammo }));
    ok(r.x > cx0 + 3, `${tag}: swipe trackball moves crosshair (${cx0.toFixed(1)} -> ${r.x.toFixed(1)})`);
    ok(r.f - f0 >= 1 && r.a < 10, `${tag}: multi-touch: fire button while swiping (shots ${r.f - f0})`);
    // EMP button
    const e0 = await page.evaluate(() => SS.g.emp);
    if (eng === 'chromium') await page.tap('.tb.emp'); else await page.evaluate(() => { const b = document.querySelector('.tb.emp'); b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, pointerType: 'touch', bubbles: true, cancelable: true })); });
    await wait(200); ok(await page.evaluate(e0 => SS.g.emp === e0 - 1, e0), `${tag}: EMP button`);
    // pause button
    await page.tap('#bpause'); ok(await until(page, () => SS.app.screen === 'pause', 3000), `${tag}: pause button`);
    await page.tap('[data-p=resume]'); ok(await until(page, () => SS.app.screen === 'play', 3000), `${tag}: resume`);
  }
  await wait(1200);
  const bc2 = await blackCells(page); ok(bc2.length === 0, `${tag}: no black regions in play ${bc2.join(' ')}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${eng}-${dev}.png` });
  ok(errs.length === 0, `${tag}: no page errors ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
for (const eng of which === 'all' ? ['chromium', 'webkit'] : [which]) {
  const b = eng === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const dev of Object.keys(DEVICES)) { try { await runCase(b, eng, dev); } catch (e) { ok(false, `${eng}/${dev}: exception ${e.message.split('\n')[0]}`); } }
  await b.close();
}
console.log(`\n${pass} passed, ${fail} failed`); if (fails.length) console.log('failures:\n  ' + fails.join('\n  '));
process.exit(fail ? 1 : 0);
