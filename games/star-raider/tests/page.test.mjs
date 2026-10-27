// Page tests: Chromium + WebKit × desktop / iPhone portrait / iPhone landscape / iPad.
// Needs a server at repo root (python3 -m http.server 8080).  node games/star-raider/tests/page.test.mjs [chromium|webkit|all] [shotDir]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const ROOT = process.env.SR_URL || 'http://localhost:8080/games/star-raider/';
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
// decode a screenshot in the page and count 8x8 grid cells that are (nearly) pure black
async function blackCells(page) {
  const b64 = (await page.screenshot()).toString('base64');
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, GX = 8, GY = 8, out = [];
    for (let gy = 0; gy < GY * 0.6; gy++) for (let gx = 1; gx < GX - 1; gx++) {   // the view (cockpit frame at the edges can be dark)
      let dark = 0, n = 0; const x0 = Math.floor(gx * c.width / GX), x1 = Math.floor((gx + 1) * c.width / GX), y0 = Math.floor(gy * c.height / GY), y1 = Math.floor((gy + 1) * c.height / GY);
      for (let y = y0; y < y1; y += 4) for (let xx = x0; xx < x1; xx += 4) { const i = (y * c.width + xx) * 4; n++; if (d[i] + d[i + 1] + d[i + 2] < 7) dark++; }
      if (dark / n > 0.985) out.push(gx + ',' + gy);
    }
    return out;
  }, b64);
}
// aim the player at the nearest hostile (test helper: a stand-in for the human's hands on the stick)
const AIM = () => { const s = SR.sess, p = s.me, G = s.G, sk = SR.S.key(p.sx, p.sy); const t = G.ships.filter(x => x.sk === sk && !x.gone).sort((a, b) => SR.S.V.dist(a.pos, p.pos) - SR.S.V.dist(b.pos, p.pos))[0]; if (!t) return false;
  const d = SR.S.V.norm(SR.S.V.sub(SR.S.V.madd(t.pos, t.fwd, t.speed * 0.45), p.pos)); const f = [0, 0, -1]; const ax = [f[1] * d[2] - f[2] * d[1], f[2] * d[0] - f[0] * d[2], f[0] * d[1] - f[1] * d[0]]; const s2 = Math.hypot(...ax), c = f[0] * d[0] + f[1] * d[1] + f[2] * d[2], h = Math.atan2(s2, c) / 2, k = s2 > 1e-6 ? Math.sin(h) / s2 : 0; p.q = [ax[0] * k, ax[1] * k, ax[2] * k, Math.cos(h)]; return true; };
async function runCase(browserType, eng, dev) {
  const tag = `${eng}/${dev}`, o = Object.assign({}, DEVICES[dev]); if (eng === 'webkit') delete o.isMobile;
  const ctx = await browserType.newContext(o); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/favicon|peerjs|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  await page.route(/0\.peerjs\.com|peerjs\.com\/peerjs/, r => r.abort());
  const touch = dev !== 'desktop';
  if (eng === 'chromium' && dev === 'desktop') {   // the desktop HDR (half-float) chain boots and passes the pixel self-check; the play loop below runs 8-bit for speed under software GL
    await page.goto(ROOT + '?nolock=1');
    ok(await until(page, () => window.SR && SR.booted && SR.app.screen === 'title', 30000), `${tag}: boots (HDR)`);
    ok(await until(page, () => { const s = SR.R.stats(); return s.lastSelf && s.lastSelf.black < 6; }, 20000), `${tag}: HDR self-check not black (hdr ${await page.evaluate(() => SR.R.stats().hdr)})`);
  }
  await page.goto(ROOT + '?nolock=1&hdr=0' + (touch ? '&touch=1' : ''));
  ok(await until(page, () => window.SR && SR.booted && SR.app.screen === 'title', 25000), `${tag}: boots to title`);
  await wait(1500);
  const st = await page.evaluate(() => SR.R.stats());
  ok(st.lastSelf && st.lastSelf.black < 6, `${tag}: WebGL pixel self-check (black ${st.lastSelf && st.lastSelf.black}/24, tier ${st.tier})`);
  if (touch) ok(st.tier <= 2, `${tag}: phones/tablets start one quality tier lower (${st.tier})`);
  ok((await blackCells(page)).length === 0, `${tag}: title not black`);
  const click = async sel => touch ? page.tap(sel) : page.click(sel);
  await click('[data-act=solo]'); ok(await until(page, () => SR.app.screen === 'setup'), `${tag}: setup`);
  await click('#diffs [data-d="0"]'); await click('#missions [data-mi=campaign]'); await click('[data-act=start]');
  ok(await until(page, () => SR.app.screen === 'play' && SR.sess && SR.sess.G), `${tag}: game starts`);
  await wait(600);
  const meta = await page.evaluate(() => ({ m: document.querySelector('meta[name=viewport]').content, ta: getComputedStyle(document.body).touchAction }));
  if (touch) ok(/user-scalable=no/.test(meta.m) && /viewport-fit=cover/.test(meta.m) && meta.ta === 'none', `${tag}: no zoom / no bounce / safe areas`);
  if (!touch) {
    // throttle, steering, fire, shields, computer, views
    await wait(1500); await page.keyboard.press('Digit4'); ok(await until(page, () => SR.sess.me.thr === 4, 4000), `${tag}: 4 sets throttle`);
    const q0 = await page.evaluate(() => SR.sess.me.q.slice()); await page.keyboard.down('ArrowLeft'); await wait(450); await page.keyboard.up('ArrowLeft');
    const q1 = await page.evaluate(() => SR.sess.me.q.slice()); ok(Math.abs(q1[1] - q0[1]) > 0.02, `${tag}: arrows steer (q.y ${q0[1].toFixed(3)} -> ${q1[1].toFixed(3)})`);
    for (let i = 0; i < 6 && !(await page.evaluate(() => SR.sess.fired >= 2)); i++) { await page.keyboard.press('Space'); await until(page, n => (SR.sess.fired || 0) > n, 1500, i); await wait(500); }
    ok(await until(page, () => SR.sess.fired >= 2, 4000), `${tag}: Space fires alternating torpedoes`);
    if (process.env.DIAG) console.log('DIAG', await page.evaluate(() => JSON.stringify({ f: SR.sess.fired, t: SR.sess.G.t, scr: SR.app.screen, p: SR.app.paused, en: SR.sess.me.energy, al: SR.sess.me.alive, dk: SR.sess.me.dock, hs: SR.sess.hitStop, w: !!SR.sess.me.warp })), errs.slice(0, 3));
    await page.keyboard.press('KeyS'); await wait(100); ok(await page.evaluate(() => SR.sess.me.shields), `${tag}: S raises shields`);
    await page.keyboard.press('KeyA'); await wait(100); ok(await page.evaluate(() => SR.sess.me.view === 'aft'), `${tag}: A aft view`);
    await page.keyboard.press('KeyF'); await page.keyboard.press('KeyL'); await wait(300); ok(await page.evaluate(() => SR.sess.me.view === 'lrs'), `${tag}: L long-range scan`);
    await page.keyboard.press('KeyF');
    // dock: Enter auto-approaches the starbase in the start sector
    await page.keyboard.press('Digit0'); await page.evaluate(() => { SR.sess.me.energy = 5000; SR.sess.me.dmg.S = 1; });
    await page.keyboard.press('Enter');
    ok(await until(page, () => SR.sess.me.dock && SR.sess.me.dock.phase === 'done', 100000), `${tag}: Enter auto-approach -> orbit -> drone -> docked`);
    ok(await page.evaluate(() => SR.sess.me.energy > 9000 && SR.sess.me.dmg.S === 0), `${tag}: docking refuels and repairs`);
    // combat: bring a fleet here, aim and fire
    await page.keyboard.press('Digit3');
    await page.evaluate(() => { const G = SR.sess.G, p = SR.sess.me; const f = G.fleets.find(f => f.type !== 'hive') || G.fleets[0]; f.x = p.sx; f.y = p.sy; f.px = f.x; f.py = f.y; });
    ok(await until(page, () => { const s = SR.sess; return s.ships.length > 0; }, 15000), `${tag}: Vrell fleet arrives in sector`);
    const k0 = await page.evaluate(() => SR.sess.me.kills); let kills = k0;
    for (let i = 0; i < 70 && kills === k0; i++) { await page.evaluate(AIM); await page.keyboard.press('Space'); await wait(220); kills = await page.evaluate(() => SR.sess.me.kills); }
    ok(kills > k0, `${tag}: torpedo kill (kills ${k0} -> ${kills})`);
    // chart + warp
    await page.keyboard.press('KeyG'); await wait(200); ok(await page.evaluate(() => SR.sess.me.view === 'chart'), `${tag}: G galactic chart`);
    const from = await page.evaluate(() => [SR.sess.me.sx, SR.sess.me.sy]);
    await page.keyboard.press(from[0] > 4 ? 'ArrowLeft' : 'ArrowRight'); await page.keyboard.press(from[0] > 4 ? 'ArrowLeft' : 'ArrowRight'); await wait(100);
    await page.evaluate(() => { SR.sess.me.energy = 9000; for (const s of SR.sess.G.ships) s.gone = true; SR.sess.G.ships.length = 0; });
    await page.keyboard.press('KeyH');
    ok(await until(page, () => !!SR.sess.me.warp, 3000), `${tag}: H hyperwarp starts`);
    ok(await until(page, () => !SR.sess.me.warp, 20000) && await page.evaluate(f => SR.sess.me.sx !== f[0] || SR.sess.me.sy !== f[1], from), `${tag}: warp arrives in a new sector`);
    await page.keyboard.press('KeyP'); ok(await until(page, () => SR.app.screen === 'pause', 3000), `${tag}: P pauses`);
    const t0 = await page.evaluate(() => SR.sess.G.t); await wait(400); ok(await page.evaluate(t0 => SR.sess.G.t === t0, t0), `${tag}: paused sim frozen`);
    await page.keyboard.press('Escape'); ok(await until(page, () => SR.app.screen === 'play', 3000), `${tag}: resume`);
  } else {
    const vis = await page.evaluate(() => [...document.querySelectorAll('#touch [data-b]')].map(b => { const r = b.getBoundingClientRect(); return [r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, r.width, r.height, b.dataset.b]; }));
    ok(vis.length === 7 && vis.every(v => v[0] && v[1] >= 40 && v[2] >= 40), `${tag}: 7 touch buttons on screen, >=40px (${vis.map(v => v[3] + ':' + v[1].toFixed(0) + 'x' + v[2].toFixed(0)).join(' ')})`);
    const R = sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height, w: r.width, top: r.top }; }, sel);
    const stick = await R('#tstick'), thr = await R('#tthr'), fire = await R('#tfire');
    const q0 = await page.evaluate(() => SR.sess.me.q.slice()), f0 = await page.evaluate(() => SR.sess.fired || 0);
    if (eng === 'chromium') {
      const cdp = await ctx.newCDPSession(page); const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
      await T('touchStart', [{ x: thr.x, y: thr.top + thr.h * 0.85, id: 3 }]); await T('touchMove', [{ x: thr.x, y: thr.top + thr.h * 0.35, id: 3 }]); await T('touchEnd', []);
      await T('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
      for (let i = 1; i <= 6; i++) { await T('touchMove', [{ x: stick.x + i * stick.w * 0.07, y: stick.y, id: 1 }]); await wait(16); }
      await wait(400);
      await T('touchStart', [{ x: stick.x + stick.w * 0.42, y: stick.y, id: 1 }, { x: fire.x, y: fire.y, id: 2 }]); await wait(80);
      await T('touchEnd', [{ x: stick.x + stick.w * 0.42, y: stick.y, id: 1 }]); await wait(40); await T('touchEnd', []);
    } else {
      await page.evaluate(({ stick, thr, fire }) => {
        const P = (el, type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
        const th = document.getElementById('tthr'); P(th, 'pointerdown', 3, thr.x, thr.top + thr.h * 0.85); P(th, 'pointermove', 3, thr.x, thr.top + thr.h * 0.35); P(th, 'pointerup', 3, thr.x, thr.top + thr.h * 0.35);
        const ts = document.getElementById('tstick'); P(ts, 'pointerdown', 1, stick.x, stick.y); for (let i = 1; i <= 6; i++) P(ts, 'pointermove', 1, stick.x + i * stick.w * 0.07, stick.y);
        window.__end = () => { const f = document.getElementById('tfire'); P(f, 'pointerdown', 2, fire.x, fire.y); P(f, 'pointerup', 2, fire.x, fire.y); P(ts, 'pointerup', 1, stick.x, stick.y); };
      }, { stick, thr, fire });
      await wait(400); await page.evaluate(() => window.__end());
    }
    await wait(300);
    const r = await page.evaluate(() => ({ q: SR.sess.me.q.slice(), f: SR.sess.fired || 0, thr: SR.sess.me.thr }));
    ok(Math.abs(r.q[1] - q0[1]) > 0.02, `${tag}: touch stick steers (q.y ${q0[1].toFixed(3)} -> ${r.q[1].toFixed(3)})`);
    ok(r.thr >= 4 && r.thr <= 7, `${tag}: throttle slider (thr ${r.thr})`);
    ok(r.f - f0 >= 1, `${tag}: multi-touch FIRE while steering (${r.f - f0})`);
    const tapB = async b => { if (eng === 'chromium') await page.tap(`#touch [data-b=${b}]`); else await page.evaluate(b => { const el = document.querySelector(`#touch [data-b=${b}]`); el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true })); el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true, cancelable: true })); }, b); await wait(150); };
    await tapB('shld'); ok(await page.evaluate(() => SR.sess.me.shields), `${tag}: SHLD button`);
    await tapB('chart'); ok(await page.evaluate(() => SR.sess.me.view === 'chart'), `${tag}: CHART button`);
    // tap a chart cell two columns away, then WARP
    const from = await page.evaluate(() => [SR.sess.me.sx, SR.sess.me.sy]);
    const cell = await page.evaluate(f => { const r = SR.hud.chartRect(), tx = f[0] > 4 ? f[0] - 2 : f[0] + 2; return { x: r.x + (tx + 0.5) * r.cw, y: r.y + (f[1] + 0.5) * r.cw, tx }; }, from);
    if (eng === 'chromium') await page.touchscreen.tap(cell.x, cell.y); else await page.evaluate(c => document.getElementById('gl').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', clientX: c.x, clientY: c.y, bubbles: true })), cell);
    await wait(150); ok(await page.evaluate(c => SR.sess.cursor[0] === c.tx, cell), `${tag}: tap a chart sector moves the cursor`);
    await tapB('warp'); ok(await until(page, () => !!SR.sess.me.warp, 3000), `${tag}: WARP button`);
    ok(await until(page, () => !SR.sess.me.warp, 20000), `${tag}: warp completes`);
    if (eng === 'chromium') await page.tap('#bpause'); else await page.evaluate(() => document.getElementById('bpause').click());
    ok(await until(page, () => SR.app.screen === 'pause', 3000), `${tag}: pause button`);
    await click('[data-p=resume]'); ok(await until(page, () => SR.app.screen === 'play', 3000), `${tag}: resume`);
  }
  await wait(900);
  const bc2 = await blackCells(page); ok(bc2.length === 0, `${tag}: no black regions in play ${bc2.join(' ')}`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${eng}-${dev}.png` });
  // game over + rank
  await page.evaluate(() => { const G = SR.sess.G; G.fleets.length = 0; for (const s of G.ships) s.gone = true; });
  ok(await until(page, () => SR.app.screen === 'endp', 12000), `${tag}: last fleet destroyed -> end screen`);
  const end = await page.evaluate(() => ({ t: document.getElementById('etitle').textContent, r: document.getElementById('erank').textContent, c: document.getElementById('ecls').textContent }));
  ok(/MISSION COMPLETE/.test(end.t) && /RANK: \S/.test(end.r) && /CLASS \d/.test(end.c), `${tag}: rank + class shown (${end.t} · ${end.r} · ${end.c})`);
  await click('#emenu [data-e=title]'); ok(await until(page, () => SR.app.screen === 'title', 3000), `${tag}: back to title`);
  ok(errs.length === 0, `${tag}: no page errors ${errs.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
for (const eng of which === 'all' ? ['chromium', 'webkit'] : [which]) {
  const b = eng === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const dev of (process.env.DEV ? process.env.DEV.split(',') : Object.keys(DEVICES))) { try { await runCase(b, eng, dev); } catch (e) { ok(false, `${eng}/${dev}: exception ${e.message.split('\n')[0]}`); } }
  await b.close();
}
console.log(`\n${pass} passed, ${fail} failed`); if (fails.length) console.log('failures:\n  ' + fails.join('\n  '));
process.exit(fail ? 1 : 0);
