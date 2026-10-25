// Browser test: node tests/game.test.mjs <chromium|webkit> <desktop|small|iphone|ipad> [full]
// Needs `python3 -m http.server 8080` from the repo root.
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core');
const [eng = 'chromium', dev = 'desktop', full = '', q = ''] = process.argv.slice(2);
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  small: { viewport: { width: 1024, height: 600 }, deviceScaleFactor: 2 },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
}[dev];
if (eng === 'webkit' && DEV.isMobile) delete DEV.isMobile; // WebKit has no isMobile emulation
const touch = !!DEV.hasTouch, tag = eng + '-' + dev + (q ? '-q' + q : ''), out = '/tmp/mc-' + tag + '-';
const b = eng === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(DEV);
const errs = [], fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /mushroom|black/i.test(m.text()))) errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
const wait = ms => p.waitForTimeout(ms), ev = (f, a) => p.evaluate(f, a);
const frames = (n = 3) => ev(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const tap = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
const tapSel = async sel => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); const bb = await el.boundingBox(); await tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(150); await frames(); };
// black-region check: sample the sunlit, front-facing part of the globe in a real screenshot
async function shot(name) {
  const file = out + name + '.png'; await p.screenshot({ path: file });
  const pts = await ev(() => { const g = MC.globe, L = g.U.sunDir.value, out = [], W = innerWidth, H = innerHeight;
    for (let la = -70; la <= 70; la += 7) for (let lo = -180; lo < 180; lo += 7) { const r = la * Math.PI / 180, o = lo * Math.PI / 180; const x = Math.cos(r) * Math.cos(o), y = Math.sin(r), z = -Math.cos(r) * Math.sin(o);
      if (x * L.x + y * L.y + z * L.z < 0.35) continue; const s = g.project(la, lo, 0); if (!s || !s.front || s.x < 8 || s.y < 8 || s.x > W - 8 || s.y > H - 8) continue;
      const c = g.cam.position.clone().normalize(); if (x * c.x + y * c.y + z * c.z < 0.3) continue; out.push([s.x, s.y]); }
    return { pts: out, dpr: devicePixelRatio }; });
  const { execFileSync } = await import('child_process');
  const res = JSON.parse(execFileSync('python3', ['-c', `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); d=json.loads(sys.argv[2]); W,H=im.size; s=W/${DEV.viewport.width}
n=0;blk=0
for x,y in d['pts']:
  X=int(x*s);Y=int(y*s)
  if 0<=X<W and 0<=Y<H:
    r,g,b=im.getpixel((X,Y)); n+=1
    if r+g+b<10: blk+=1
print(json.dumps({'n':n,'black':blk,'size':[W,H]}))`, file, JSON.stringify(pts)]).toString());
  ok(res.n < 5 || res.black <= Math.max(1, res.n * 0.03), `${name}: no black regions on sunlit globe (${res.black}/${res.n} dark samples, ${res.size.join('x')})`);
  return res;
}
const t0 = Date.now();
await p.goto('http://localhost:8080/games/mushroom-cloud/' + (q ? '?q=' + q : ''));
await p.waitForFunction(() => window.MC && MC.screen === 'title', null, { timeout: 90000 });
await wait(1500);
const st = await ev(() => ({ tier: MC.globe.tier, max: MC.globe.maxTier, dpr: devicePixelRatio, cw: MC.globe.r.domElement.width, iw: innerWidth, self: MC.globe.lastSelf }));
console.log('render', JSON.stringify(st));
ok(st.cw >= st.iw * st.dpr - 2, 'canvas resolution >= native DPR');
await shot('1-title');
await tapSel('[data-act=sp]'); ok(await ev(() => MC.screen) === 'select', 'level select opens');
await shot('2-select');
await tapSel('#bstart'); ok(await ev(() => MC.screen) === 'brief', 'briefing opens'); await shot('3-brief');
await tapSel('[data-act=bskip]'); await wait(800); ok(await ev(() => MC.screen) === 'play', 'match starts');
// deploy one silo by a real click/tap inside our territory
if (await ev(() => MC.app.place !== 'silo')) await tapSel('#palette [data-type=silo]');
ok(await ev(() => MC.app.place === 'silo'), 'silo selected for placement');
const spot = await ev(() => { const g = MC.globe, me = MC.app.me, S = MC.sim; let best = null;
  for (let la = -60; la <= 70; la += 1.5) for (let lo = -180; lo < 180; lo += 1.5) { if ([[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]].some(([a,o]) => S.landBloc(la + a, lo + o) !== me)) continue; const s = g.project(la, lo, 0); if (!s.front) continue;
    const d = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight * 0.45); const el = document.elementFromPoint(s.x, s.y); if (!el || el.id !== 'gl') continue; if (!best || d < best.d) best = { d, x: s.x, y: s.y }; }
  return best; });
const n0 = await ev(() => MC.view.units.filter(u => u.bloc === MC.app.me).length);
if (spot) { await tap(spot.x, spot.y); await wait(200); await frames(); }
console.log('toast:', await ev(() => document.getElementById('toast').textContent));
ok(spot && await ev(() => MC.view.units.filter(u => u.bloc === MC.app.me).length) === n0 + 1, 'silo placed by ' + (touch ? 'tap' : 'click'));
await shot('4-deploy');
await tapSel('[data-cmd=auto]'); await wait(400);
const nu = await ev(() => MC.view.units.filter(u => u.bloc === MC.app.me).length); ok(nu >= 10, 'auto-deploy filled forces (' + nu + ' units)');
// fast-forward to DEFCON 3 / 2 / 1 with the ▶▶ button
for (const target of [3, 1]) {
  for (let i = 0; i < 6 && await ev(() => MC.view.defcon) > target; i++) { if (await ev(() => !MC.app.ff)) await tapSel('#speed [data-speed=ff]'); await ev(t => { const g = MC.game; for (let k = 0; k < 6000 && g.defcon > t; k++) g.step(0.1); }, target); await wait(500); }
  if (target === 3) { ok(await ev(() => MC.view.defcon) <= 3, 'reached DEFCON 3'); await shot('5-defcon3');
    // switch a silo to LAUNCH with keyboard / touch button
    await ev(() => { const s = MC.view.units.find(u => u.bloc === MC.app.me && u.type === 'silo'); MC.select(s); });
    if (touch) await tapSel('[data-cmd=mode]'); else await p.keyboard.press('m');
    await frames(); ok(await ev(() => MC.view.units.some(u => u.bloc === MC.app.me && u.type === 'silo' && (u.pend === 'launch' || u.mode === 'launch'))), 'silo mode switch ordered');
  }
}
ok(await ev(() => MC.view.defcon) === 1, 'reached DEFCON 1');
await ev(() => { const g = MC.game; for (let k = 0; k < 250; k++) g.step(0.1); }); // let the mode switch complete
await wait(600);
// select the launch-mode silo, target the enemy heartland, fire
await ev(() => { const s = MC.view.units.find(u => u.bloc === MC.app.me && u.type === 'silo' && u.mode === 'launch' && u.wh > 0); if (s) MC.select(s); });
const opp = await ev(() => MC.app.cfg.opp);
const tgt = await ev(o => { const c = MC.sim.AI.centroid(o); MC.globe.focus(c[0], c[1], 2.6); return c; }, opp);
await wait(2500);
const tp = await ev(o => { const g = MC.globe, S = MC.sim; let best = null;
  for (let la = -60; la <= 75; la += 1.5) for (let lo = -180; lo < 180; lo += 1.5) { if ([[0,0],[1.5,0],[-1.5,0],[0,1.5],[0,-1.5]].some(([a,b]) => S.landBloc(la + a, lo + b) !== o)) continue; const s = g.project(la, lo, 0); if (!s.front) continue;
    const el = document.elementFromPoint(s.x, s.y); if (!el || el.id !== 'gl') continue; const d = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight * 0.4); if (!best || d < best.d) best = { d, x: s.x, y: s.y }; }
  return best; }, opp);
const m0 = await ev(() => MC.game.missiles.length);
await tap(tp.x, tp.y); await frames();
ok(await ev(() => !!MC.app.target), (await ev(() => document.getElementById('toast').textContent)) + ' | target chosen by ' + (touch ? 'tap' : 'click'));
if (touch) await tapSel('[data-cmd=fire]'); else await p.keyboard.press('Space');
await frames(); ok(await ev(() => MC.game.missiles.length) > m0 || await ev(() => MC.view.blocs[MC.app.me].launched > 0), 'launch fired');
// strike package via ENTER (desktop) / button (touch)
if (touch) await tapSel('[data-cmd=desel]'), await tapSel('[data-cmd=strike]'); else await p.keyboard.press('Enter');
await wait(400); ok(await ev(() => MC.screen) === 'play-modal', 'strike package panel opens'); await shot('6-strike');
await tapSel('[data-m=exec]'); await wait(300); ok(await ev(() => MC.screen) === 'play', 'strike authorised');
await ev(() => { const g = MC.game; for (let k = 0; k < 260; k++) g.step(0.1); }); // flight time
await wait(2500); await shot('7-war');
await ev(() => { MC.app.warRoom = true; }); await wait(1500); await p.screenshot({ path: out + '7b-warroom.png' }); await ev(() => { MC.app.warRoom = false; });
if (full) {
  await ev(() => { const g = MC.game; for (let k = 0; k < 9000 && !g.over; k++) g.step(0.1); });
  await p.waitForFunction(() => MC.screen === 'end', null, { timeout: 20000 }).catch(() => { });
  ok(await ev(() => MC.screen) === 'end', 'end screen shown');
  const txt = await ev(() => document.getElementById('endp').innerText); ok(/dead|DETERRENCE/i.test(txt), 'end screen reports the human cost');
  await p.screenshot({ path: out + '8-end.png' });
  await tapSel('[data-e=title]'); ok(await ev(() => MC.screen) === 'title', 'back to title');
}
const e2 = errs.filter(e => !/AudioContext|autoplay/i.test(e));
ok(e2.length === 0, 'no console errors' + (e2.length ? ': ' + e2.slice(0, 5).join(' | ') : ''));
console.log('final tier', await ev(() => MC.globe.tier + ' self ' + JSON.stringify(MC.globe.lastSelf)));
console.log(`${tag}: ${fails.length ? 'FAILED ' + fails.length : 'ALL PASS'} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
await b.close(); process.exit(fails.length ? 1 : 0);
