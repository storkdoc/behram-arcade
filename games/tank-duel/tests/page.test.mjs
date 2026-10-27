// TANK DUEL browser test: node tests/page.test.mjs <chromium|webkit> <desktop|iphone|iphone-land|ipad> [q]
// Needs `python3 -m http.server 8080` from the repo root. Checks menus, play, touch/keyboard input and that no black regions appear.
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core'); import { execFileSync } from 'child_process';
const [eng = 'chromium', dev = 'desktop', q = ''] = process.argv.slice(2);
const UA_I = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DEV = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_I },
  'iphone-land': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_I },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: UA_I.replace('iPhone', 'iPad') },
}[dev];
if (eng === 'webkit' && DEV.isMobile) delete DEV.isMobile;
const touch = !!DEV.hasTouch, tag = eng + '-' + dev + (q ? '-q' + q : ''), out = '/tmp/td-' + tag + '-';
const b = eng === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(DEV);
const errs = [], fails = []; const ok = (c, m, x) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); };
p.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /tank-duel|black/i.test(m.text()))) errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message)); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
const wait = ms => p.waitForTimeout(ms), ev = (f, a) => p.evaluate(f, a);
const tap = async (x, y) => touch ? p.touchscreen.tap(x, y) : p.mouse.click(x, y);
const tapSel = async sel => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); const bb = await el.boundingBox(); await tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await wait(200); };
// black-region check: sample open arena floor that is not covered by DOM, in a real screenshot
async function shot(name, game = 'game') {
  const file = out + name + '.png'; await p.screenshot({ path: file });
  const pts = await ev(which => { const g = which === 'attract' ? TD.attract.g : TD.game, S = TD.S, R = TD.R, cv = document.getElementById('gl'), o = [];
    const clear = el => { for (; el && el !== document.body; el = el.parentElement) { if (el === cv) return true; if (el.id === 'title') continue; const cs = getComputedStyle(el), bg = cs.backgroundColor; if (cs.backgroundImage !== 'none' || !(bg === 'transparent' || /rgba\(.*,\s*0\)$/.test(bg))) return false; } return true; };
    for (let y = 1.5; y < S.ROWS - 1; y += 1) for (let x = 1.5; x < S.COLS - 1; x += 1) { if (S.solidAt(g, x, y) || S.solidAt(g, x, y - 0.7) || g.tanks.some(t => Math.hypot(t.x - x, t.y - y) < 1.2)) continue;
      const s = R.project(x, y, 0); if (s.x < 6 || s.y < 6 || s.x > innerWidth - 6 || s.y > innerHeight - 6) continue; if (!clear(document.elementFromPoint(s.x, s.y))) continue; o.push([s.x, s.y]); }
    return o; }, game);
  const res = JSON.parse(execFileSync('python3', ['-c', `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); d=json.loads(sys.argv[2]); W,H=im.size; s=W/${DEV.viewport.width}
n=0;blk=0
for x,y in d:
  X=int(x*s);Y=int(y*s)
  if 0<=X<W and 0<=Y<H:
    r,g,b=im.getpixel((X,Y)); n+=1
    if r+g+b<15: blk+=1
print(json.dumps({'n':n,'black':blk}))`, file, JSON.stringify(pts)]).toString());
  ok(res.n >= 20 && res.black / res.n < 0.05, `${name}: no black regions on the arena floor`, res);
  return res;
}
await p.goto('http://localhost:8080/games/tank-duel/' + (q ? '?q=' + q : ''));
await p.waitForFunction(() => window.TD && TD.screen === 'title', null, { timeout: 90000 });
await wait(2500);
ok(true, 'loads to the title');
await shot('title', 'attract');
await tapSel('[data-act=cpu]');
ok(await ev(() => TD.screen) === 'select', 'select screen opens');
const nCards = await ev(() => document.querySelectorAll('#cards .card').length); ok(nCards === 26, 'variation grid lists 26 games', nCards);
await tapSel('#cards .card[data-v="11"]'); // GAME 12 BRICK BREAKER
await tapSel('#rounds .chip[data-r="s5"]'); await tapSel('#diffs .chip[data-l="0"]');
ok(await ev(() => TD.app.variant === 11 && TD.app.round === 's5' && TD.app.level === 0), 'choose variation, round and CPU level by tap/click');
await tapSel('#bstart');
await p.waitForFunction(() => TD.screen === 'play' && TD.game.phase === 'play', null, { timeout: 60000 });
ok(true, 'game starts and the countdown finishes');
const lay = await ev(() => ({ rotated: TD.R.rotated, touchShown: !document.getElementById('touch').classList.contains('hidden'), label: document.getElementById('glabel').textContent }));
ok(lay.label.includes('GAME 12'), 'HUD shows the game label', lay.label);
if (touch) ok(lay.touchShown, 'touch controls shown');
if (dev === 'iphone') ok(lay.rotated, 'phone portrait: arena rotated to fit the tall screen');
// drive
let cdp = null, cx = 0, cy = 0;
const p0 = await ev(() => [TD.game.tanks[0].x, TD.game.tanks[0].y]);
if (touch) {
  const z = await (await p.$('#tzone')).boundingBox(); cx = z.x + z.width * 0.5; cy = z.y + z.height * 0.6;
  cdp = eng === 'chromium' ? await p.context().newCDPSession(p) : null;
  if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] }); for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 8, y: cy - i * 4, id: 1 }] }); await wait(30); } await wait(1600); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
  else { await ev(() => { const z = document.getElementById('tzone'), r = z.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.6; const P = (t, X, Y) => z.dispatchEvent(new PointerEvent(t, { pointerId: 7, clientX: X, clientY: Y, bubbles: true, pointerType: 'touch' })); P('pointerdown', x, y); P('pointermove', x + 50, y - 25); setTimeout(() => P('pointerup', x + 50, y - 25), 1600); }); await wait(1800); }
  const f0 = await ev(() => TD.game.tanks[0].firedN); await tapSel('#tfire'); await p.waitForFunction(f0 => TD.game.tanks[0].firedN > f0, f0, { timeout: 8000 }).catch(() => {});
  ok(await ev(() => TD.game.tanks[0].firedN) > f0, 'FIRE button fires');
  // multi-touch: hold the stick and press FIRE at the same time (two simultaneous touch pointers)
  await p.waitForFunction(() => TD.game.shells.every(sh => sh.owner !== 0), null, { timeout: 8000 }).catch(() => {});
  const fb = await (await p.$('#tfire')).boundingBox(), fx = fb.x + fb.width / 2, fy = fb.y + fb.height / 2;
  const m0 = await ev(() => ({ x: TD.game.tanks[0].x, y: TD.game.tanks[0].y, f: TD.game.tanks[0].firedN }));
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 11 }] });
    for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 9, id: 11 }] }); await wait(25); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy - 45, id: 11 }, { x: fx, y: fy, id: 12 }] });
    await wait(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: cx, y: cy - 45, id: 11 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await ev(([fx, fy]) => { const z = document.getElementById('tzone'), f = document.getElementById('tfire'), r = z.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height * 0.6;
      const P = (el, t, id, X, Y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: X, clientY: Y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 21 }));
      P(z, 'pointerdown', 21, x, y); P(z, 'pointermove', 21, x, y - 45); P(f, 'pointerdown', 22, fx, fy);
      setTimeout(() => { P(f, 'pointerup', 22, fx, fy); P(z, 'pointerup', 21, x, y - 45); }, 900); }, [fx, fy]);
    await wait(1100);
  }
  await p.waitForFunction(f => TD.game.tanks[0].firedN > f, m0.f, { timeout: 6000 }).catch(() => {});
  const m1 = await ev(() => ({ x: TD.game.tanks[0].x, y: TD.game.tanks[0].y, f: TD.game.tanks[0].firedN, stickOff: !document.getElementById('stick').classList.contains('on') }));
  ok(m1.f > m0.f && Math.hypot(m1.x - m0.x, m1.y - m0.y) > 0.3, 'multi-touch: steer with the stick and FIRE at the same time', { m0, m1 });
  ok(m1.stickOff, 'stick releases after the touch ends');
  // the page must not scroll / zoom on touch drags during play
  const prevented = await ev(() => { try { const t = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); document.getElementById('gl').dispatchEvent(t); return t.defaultPrevented; } catch (e) { return 'n/a'; } });
  ok(prevented === true || prevented === 'n/a', 'touchmove on the game surface is prevented (no scroll / rubber-band)', prevented);
} else {
  await p.keyboard.down('ArrowUp'); await wait(1500); await p.waitForFunction(x0 => Math.abs(TD.game.tanks[0].x - x0) > 0.6, p0[0], { timeout: 6000 }).catch(() => {}); await p.keyboard.up('ArrowUp');
  const f0 = await ev(() => TD.game.tanks[0].firedN); await p.keyboard.press('Space'); await p.waitForFunction(f0 => TD.game.tanks[0].firedN > f0, f0, { timeout: 8000 }).catch(() => {});
  ok(await ev(() => TD.game.tanks[0].firedN) > f0, 'Space fires');
}
const p1 = await ev(() => [TD.game.tanks[0].x, TD.game.tanks[0].y]);
ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5 || await ev(() => TD.game.tanks[0].spin > 0), 'player tank drives', { p0, p1 });
await wait(2500);
await shot('play');
const st = await ev(() => TD.R.stats()); ok(st.lastSelf && st.lastSelf.black === 0, 'renderer pixel self-check found no black floor', st);
// pause / resume
await tapSel('#bpause'); ok(await ev(() => TD.screen === 'pause' && TD.app.paused), 'pause'); await tapSel('[data-p=resume]'); ok(await ev(() => TD.screen === 'play'), 'resume');
// snowy variation with weather + another look
await ev(() => TD.start(TD.S.VARIANTS.findIndex(v => v.name === 'BLIZZARD'))); await p.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 60000 }); await wait(1500);
await shot('blizzard');
await ev(() => TD.start(TD.S.VARIANTS.findIndex(v => v.name === 'CHAOS'))); await p.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 60000 }); await wait(1500);
await shot('chaos');
// spawn-kill chain: the CPU (ACE) kills me point blank 4 times in a row; each time it is then dropped right next to my respawn
await ev(() => TD.start(TD.S.VARIANTS.findIndex(v => v.name === 'OPEN FIELD'), { level: 3 })); await p.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 60000 });
await ev(() => { window.__hits = []; const R = TD.R, f = R.fx.bind(R); R.fx = evs => { for (const e of evs) if (e.e === 'hit' || e.e === 'respawn') window.__hits.push({ e: e.e, tank: e.tank, t: TD.game.t }); return f(evs); }; });
const rounds = [];
for (let k = 0; k < 4; k++) {
  await ev(() => { const g = TD.game, me = g.tanks[0], c = g.tanks[1]; me.prot = 0; me.spin = 0; c.prot = 0; me.x = Math.max(3, c.x - 2.6); me.y = c.y; TD.S.hitTank(g, me, 1, me.x + 0.4, me.y, -10, 0, 'shell'); });
  await p.waitForFunction(() => TD.game.tanks[0].prot > 0, null, { timeout: 8000 });
  const r = await ev(() => { const g = TD.game, me = g.tanks[0], c = g.tanks[1], d = Math.hypot(me.x - c.x, me.y - c.y);
    // worst case camper: put the CPU 3 tiles in front of my fresh spawn, aimed at me
    const ang = Math.atan2(10 - me.y, 16 - me.x); c.x = me.x + Math.cos(ang) * 3; c.y = me.y + Math.sin(ang) * 3; c.a = ang + Math.PI; c.reload = 0;
    return { d: +d.toFixed(1), t: g.t, score: c.score, sh: TD.R.tanks[0].pshield.visible }; });
  if (k === 0) { await wait(300); await shot('spawn-shield'); }
  await wait(1500);
  const after = await ev(t => ({ spin: TD.game.tanks[0].spin, score: TD.game.tanks[1].score, hits: window.__hits.filter(h => h.e === 'hit' && h.tank === 0 && h.t > t).length, sh: TD.R.tanks[0].pshield.visible, prot: +TD.game.tanks[0].prot.toFixed(2) }), r.t);
  rounds.push({ spawnDist: r.d, shieldShown: r.sh, rekills: after.hits, scoreGain: after.score - r.score, protLeft: after.prot });
  await wait(1200);
}
ok(rounds.every(r => r.spawnDist > 7 && r.shieldShown && r.rekills === 0 && r.scoreGain === 0), 'spawn-kill chain: 4 kills in a row -> far respawn, visible shield, no instant re-kill', rounds);
ok(errs.length === 0, 'no console errors / black-region warnings', errs.slice(0, 5));
console.log(fails.length ? `FAILED ${fails.length} (${tag})` : `ALL PASS (${tag})`); await b.close(); process.exit(fails.length ? 1 : 0);
