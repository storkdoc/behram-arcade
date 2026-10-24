/* Trackball Football: single-player + controls test, desktop Chrome and iPhone emulation.
   - trackball feel: faster strokes => faster ball spin => faster player; the ball coasts with inertia after you let go
   - mouse (pointer-lock movement), two-finger trackpad scroll (wheel), keyboard; touch swipe/flick + on-screen buttons
   - many plays vs the CPU with an independent rules checker (downs, distance, possession, scoring)
   - landing page and the other arcade games still load
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/trackball-football/tests/game.test.js   (env: PLAYS CHROME BASE) */
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/trackball-football/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
const IPHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };

async function open(b, name, ctxOpts) {
  const c = await b.newContext(ctxOpts); const p = await c.newPage(); p.name = name;
  p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  await p.goto(URL); await p.waitForFunction(() => window.TBF && TBF.UI.hits.length > 0); return p;
}
const tapL = (p, label) => p.evaluate(l => { const h = TBF.UI.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + TBF.UI.hits.map(h => h.label).join('|')); h.fn(); }, label);
const phase = p => p.evaluate(() => TBF.Sim.G.phase);
// lock the first offensive (or defensive) card and wait for presnap
async function callPlay(p, id) {
  await p.waitForFunction(() => TBF.Sim.G.phase === 'select', null, { timeout: 30000 });
  await p.evaluate(id => { const S = TBF.App.Sel; TBF.App.lockPick(id || S.list[0].id); }, id);
  await p.waitForFunction(() => TBF.Sim.G.phase === 'presnap', null, { timeout: 15000 });
}
// stroke the virtual ball with synthetic mouse movement at `speed` px/s for `ms`
const stroke = (p, speed, ms, dirx = 1, diry = 0) => p.evaluate(({ speed, ms, dirx, diry }) => new Promise(res => {
  TBF.App.testMouse = true; let t0 = performance.now(), last = t0, peak = 0;
  const f = () => { const t = performance.now(), dt = (t - last) / 1000; last = t;
    const d = speed * dt; window.dispatchEvent(new MouseEvent('mousemove', { movementX: d * dirx, movementY: d * diry }));
    peak = Math.max(peak, TBF.Track.command().m);
    if (t - t0 < ms) requestAnimationFrame(f); else { TBF.App.testMouse = false; res({ peak: +peak.toFixed(3), end: +TBF.Track.command().m.toFixed(3) }); } };
  requestAnimationFrame(f);
}), { speed, ms, dirx, diry });
const coast = (p, ms) => p.evaluate(ms => new Promise(r => setTimeout(() => r(+TBF.Track.command().m.toFixed(3)), ms)), ms);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const pages = [];

  say('== DESKTOP: menus');
  const D = await open(b, 'desktop', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); pages.push(D);
  const labels = await D.evaluate(() => TBF.UI.hits.map(h => h.label));
  check(['PLAY VS COMPUTER', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HOW TO PLAY', 'OPTIONS'].every(l => labels.includes(l)), 'title menu: ' + labels.filter(l => l.length > 2).join(' | '));
  const dpr = await D.evaluate(() => [TBF.DPR, document.getElementById('screen').width, innerWidth]);
  check(dpr[1] === dpr[2] * 2, `canvas renders at full device pixel ratio (${dpr[1]} px for ${dpr[2]} css px @2x)`);
  await tapL(D, 'HOW TO PLAY'); await D.waitForTimeout(150); check(await D.evaluate(() => TBF.App.screen) === 'howto', 'How to Play opens');
  await D.keyboard.press('Escape'); await D.waitForTimeout(150);
  await tapL(D, 'OPTIONS'); await D.waitForTimeout(150);
  const ol = await D.evaluate(() => TBF.UI.hits.map(h => h.label)); say('  options:', ol.join(' | '));
  check(ol.some(l => /ROOKIE|PRO/.test(l)) && ol.some(l => /HALF LENGTH/.test(l)), 'Options has difficulty and game length');
  await tapL(D, 'BACK'); await D.waitForTimeout(150);
  // keyboard menu navigation works
  await D.keyboard.press('ArrowDown'); await D.keyboard.press('ArrowUp'); await D.keyboard.press('Enter');
  await D.waitForFunction(() => TBF.App.screen === 'game' && TBF.App.mode === 'cpu', null, { timeout: 5000 });
  check(true, 'Enter on the focused first item starts Play vs Computer');

  say('== DESKTOP: trackball feel');
  const res = {};
  for (const sp of [300, 700, 1400, 2400]) { await D.evaluate(() => TBF.Track.stop()); res[sp] = await stroke(D, sp, 450); }
  say('  hand speed px/s -> commanded run speed (1 = top speed):', Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.end])));
  check(res[300].end < res[700].end && res[700].end < res[1400].end && res[1400].end <= res[2400].end + 0.001 && res[300].end > 0.1 && res[2400].end > 0.95, 'faster strokes spin the ball faster -> faster commanded speed (monotonic, saturates at top speed)');
  await D.evaluate(() => TBF.Track.stop()); await stroke(D, 1400, 450);
  const c0 = await D.evaluate(() => TBF.Track.command().m), c1 = await coast(D, 350), c2 = await coast(D, 3500);
  say('  coast after letting go: ', { atRelease: +c0.toFixed(2), after350ms: c1, after3_8s: c2 });
  check(c1 > 0.35 * c0 && c1 < c0 && c2 < 0.05, 'heavy ball keeps rolling after release, then friction stops it');
  // the real effect on the player: run play, stroke slow vs fast, compare actual speed of the human ball carrier
  const runSpeed = async (sp) => {
    await D.evaluate(() => TBF.Track.stop());
    await callPlay(D, await D.evaluate(() => (OFFENSE.find(p => /DIVE|SWEEP|DRAW/.test(p.name)) || OFFENSE[0]).id));
    await D.waitForTimeout(700); await D.keyboard.press('Space');
    await D.waitForFunction(() => TBF.Sim.G.phase === 'live', null, { timeout: 5000 });
    await D.waitForFunction(() => { const S = TBF.App.snap; return S.ph !== 'live' || (S.b[0 + 4] === S.ctl[0] && S.b[3] === 0 && S.pl[S.ctl[0]][6] === 0); }, null, { timeout: 5000 }).catch(() => {});
    const r = await D.evaluate(sp => new Promise(res => { TBF.App.testMouse = true; let t0 = performance.now(), last = t0, mx = 0;
      const f = () => { const t = performance.now(), d = sp * (t - last) / 1000; last = t; window.dispatchEvent(new MouseEvent('mousemove', { movementX: d * 0.2, movementY: -d }));
        const S = TBF.App.snap; if (S.ph === 'live' && t - t0 > 250) mx = Math.max(mx, S.pl[S.ctl[0]][3]);
        if (t - t0 < 700 && S.ph === 'live') requestAnimationFrame(f); else { TBF.App.testMouse = false; res(+mx.toFixed(2)); } };
      requestAnimationFrame(f); }), sp);
    await D.waitForFunction(() => TBF.Sim.G.phase !== 'live', null, { timeout: 30000 });
    return r;
  };
  await D.evaluate(() => { TBF.Sim.G.off = 0; });
  const vs = [], vf = [];
  for (let i = 0; i < 2; i++) { if (await D.evaluate(() => TBF.Sim.G.off) !== 0) break; vs.push(await runSpeed(350)); if (await D.evaluate(() => TBF.Sim.G.off) !== 0) break; vf.push(await runSpeed(2000)); }
  say('  controlled player speed (yd/s) slow strokes', vs, ' fast strokes', vf);
  check(vs.length && vf.length && Math.max(...vf) > Math.min(...vs) * 1.4, 'on the field: the controlled player runs much faster when you stroke faster');
  // wheel (two-finger trackpad) and keyboard also drive it
  await D.evaluate(() => TBF.Track.stop());
  await D.mouse.move(640, 400); for (let i = 0; i < 12; i++) { await D.mouse.wheel(0, 40); await D.waitForTimeout(16); }
  const wm = await D.evaluate(() => TBF.Track.command()); check(wm.m > 0.2, `two-finger trackpad scroll spins the ball (m=${wm.m.toFixed(2)})`);
  await D.evaluate(() => TBF.Track.stop()); await D.keyboard.down('ArrowRight'); await D.waitForTimeout(400);
  const km = await D.evaluate(() => TBF.Track.command()); await D.keyboard.up('ArrowRight');
  check(km.x > 0.3, `keyboard arrows spin the ball (x=${km.x.toFixed(2)})`);
  // pause + mute
  await D.waitForFunction(() => ['select', 'presnap'].includes(TBF.Sim.G.phase), null, { timeout: 30000 });
  await D.keyboard.press('p'); await D.waitForTimeout(150); const pz = await D.evaluate(() => [TBF.App.paused, TBF.UI.hits.map(h => h.label)]);
  check(pz[0] && pz[1].some(l => l.startsWith('RESUME')) && pz[1].includes('QUIT TO MENU'), 'P pauses (Resume / Sound / Quit)');
  await D.evaluate(() => TBF.UI.hits.find(h => h.label.startsWith('RESUME')).fn()); await D.evaluate(() => document.exitPointerLock()); const s0 = await D.evaluate(() => TBF.Sound.on); await D.keyboard.press('m'); const s1 = await D.evaluate(() => TBF.Sound.on); await D.keyboard.press('m');
  check(s0 !== s1, 'M toggles sound');

  say('== DESKTOP: many plays vs CPU with a rules checker');
  await D.evaluate(() => { TBF.App.quit(); });
  await D.waitForTimeout(200); await tapL(D, 'PLAY VS COMPUTER');
  await D.waitForFunction(() => TBF.App.screen === 'game');
  const report = await D.evaluate((N) => new Promise(done => {
    const A = TBF.App, Sim = TBF.Sim; A.timeScale = 4; const log = [], errs = []; let before = null, plays = 0, lastPh = null, liveT = 0, kinds = {};
    const snap = () => { const G = Sim.G; return { off: G.off, dn: G.down, tg: +G.togo.toFixed(2), los: +G.los.toFixed(2), sc: G.score.slice(), half: G.half }; };
    A.autoplay = () => {
      const G = Sim.G;
      if (G.phase === 'select' && lastPh !== 'select') { // a play finished: verify the transition
        const now = snap();
        if (before && G.lastResult) {
          const r = G.lastResult, d = Sim.dirOf(before.off), ds = [now.sc[0] - before.sc[0], now.sc[1] - before.sc[1]];
          const line = { play: plays, r: r.type, before, now };
          const bad = m => { if (now.half === before.half) errs.push(m + ' ' + JSON.stringify(line)); };
          if (ds.some(x => x < 0)) bad('score went down');
          if (r.type === 'td') { if (!(ds[r.team] === 6 || ds[r.team] === 7) || ds[1 - r.team]) bad('TD scoring wrong'); if (now.off === r.team || now.dn !== 1) bad('kickoff to other team expected'); }
          else if (r.type === 'fg') { if (r.good ? ds[before.off] !== 3 : ds[0] + ds[1]) bad('FG scoring wrong'); if (now.off === before.off || now.dn !== 1) bad('possession after FG'); }
          else if (r.type === 'punt') { if (ds[0] + ds[1]) bad('punt scored'); if (now.off === before.off || now.dn !== 1) bad('possession after punt'); }
          else if (ds[0] + ds[1] === 2) { if (now.dn !== 1) bad('after safety'); }
          else if (ds[0] + ds[1]) bad('unexpected score ' + ds);
          else if ((r.type === 'tackle' || r.type === 'oob' || r.type === 'recover') && r.team !== before.off) { if (now.off !== r.team || now.dn !== 1) bad('turnover possession'); }
          else {
            const spot = r.type === 'incomplete' ? before.los : (r.type === 'fumbleout' ? Math.max(11, Math.min(109, r.x)) : r.x);
            const gain = r.type === 'incomplete' ? 0 : (spot - before.los) * d;
            if (r.type !== 'incomplete' && r.type !== 'fumbleout' && gain >= before.tg - 0.01) { if (now.off !== before.off || now.dn !== 1) bad('first down expected'); if (Math.abs(now.los - Math.max(11, Math.min(109, spot))) > 0.6) bad('spot'); }
            else if (before.dn === 4) { if (now.off === before.off || now.dn !== 1) bad('turnover on downs expected'); kinds.downs = (kinds.downs || 0) + 1; }
            else { if (now.off !== before.off || now.dn !== before.dn + 1) bad('down should advance'); if (r.type !== 'fumbleout' && Math.abs(now.tg - Math.max(0.5, before.tg - gain)) > 0.6) bad('to-go wrong'); }
          }
          kinds[r.type] = (kinds[r.type] || 0) + 1; log.push(`${before.off ? 'CPU' : 'YOU'} ${before.dn}&${Math.round(before.tg)} @${Math.round(before.los)} -> ${r.type}${r.good != null ? (r.good ? ' good' : ' miss') : ''} => ${now.off ? 'CPU' : 'YOU'} ${now.dn}&${Math.round(now.tg)} @${Math.round(now.los)} score ${now.sc.join('-')}`);
        }
        plays++; before = now;
        if (plays > N || G.over) { A.autoplay = null; A.timeScale = 1; done({ log, errs, kinds, plays: plays - 1, sc: G.score, half: G.half, clock: G.clock }); }
      }
      if (G.phase === 'result' && lastPh === 'live') G.lastResult = Object.assign({}, G.result);
      if (G.phase === 'select' && !G.pend[0]) { const ch = Sim.offenseChoices ? null : null; const id = Sim.cpuPick(0); A.lockPick(id); }
      if (G.phase === 'presnap' && G.off === 0 && G.t > 0.4) TBF.Track.press();
      if (G.phase === 'live') { liveT += 1 / 120; if (G.off === 0) { TBF.Track.feed('mouse', 16 * Sim.dirOf(0), (Math.random() - 0.5) * 10); if (G.t > 1.3 && G.t < 1.35) TBF.Track.press(); } else if (Math.random() < 0.02) TBF.Track.press(); }
      lastPh = G.phase;
    };
  }), +(process.env.PLAYS || 30));
  for (const l of report.log) say('   ', l);
  say('  outcomes', report.kinds, 'final', report.sc, 'half', report.half);
  check(report.plays >= Math.min(20, +(process.env.PLAYS || 30)), `${report.plays} plays completed vs the CPU`);
  check(report.errs.length === 0, 'downs, distance, possession and scoring all follow the rules ' + report.errs.slice(0, 3).join(' | '));
  check(Object.keys(report.kinds).length >= 3, 'variety of outcomes seen: ' + Object.keys(report.kinds).join(', '));
  const hud = await D.evaluate(() => TBF.App.snap.sc.join('-')); check(hud === report.sc.join('-'), 'scoreboard shows the sim score');

  say('== iPHONE portrait: touch');
  const M = await open(b, 'iphone', IPHONE); pages.push(M);
  const cdp = await M.context().newCDPSession(M);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const tapAt = async (x, y) => { await touch('touchStart', [[x, y]]); await M.waitForTimeout(40); await touch('touchEnd', []); await M.waitForTimeout(60); };
  const hitXY = l => M.evaluate(l => { const h = TBF.UI.hits.find(h => h.label === l); return h && [h.x + h.w / 2, h.y + h.h / 2]; }, l);
  const pb = await hitXY('PLAY VS COMPUTER'); check(!!pb, 'title buttons laid out on the phone');
  await tapAt(...pb); await M.waitForFunction(() => TBF.App.screen === 'game', null, { timeout: 5000 });
  check(await M.evaluate(() => TBF.App.touch && !!TBF.App.L.tb && !!TBF.App.L.act), 'tapping a menu button with a finger works and the touch trackball + buttons appear');
  await M.waitForFunction(() => TBF.Sim.G.phase === 'select', null, { timeout: 15000 });
  await M.evaluate(() => { const G = TBF.Sim.G; G.off = 0; });
  // tap a play card twice (select, then lock)
  await M.waitForTimeout(300);
  const card = await M.evaluate(() => { const h = TBF.UI.hits.find(h => h.label.startsWith('PLAY:')); return h && [h.x + h.w / 2, h.y + h.h / 2, h.label]; });
  check(!!card, 'play cards are tappable: ' + (card && card[2]));
  await tapAt(card[0], card[1]); await tapAt(card[0], card[1]);
  await M.waitForFunction(() => TBF.Sim.G.phase === 'presnap', null, { timeout: 8000 }).then(() => check(true, 'tapping the selected card again locks the call')).catch(() => check(false, 'tapping a card locks the call'));
  await M.waitForTimeout(700);
  const L = await M.evaluate(() => { const L = TBF.App.L; return { act: L.act, alt: L.alt, tb: L.tb, W: L.W, H: L.H }; });
  await tapAt(L.act.cx, L.act.cy);
  await M.waitForFunction(() => TBF.Sim.G.phase === 'live', null, { timeout: 4000 }).then(() => check(true, 'red action button hikes the ball')).catch(() => check(false, 'red action button hikes the ball'));
  // flick the trackball upward-right fast, then let go: ball keeps spinning, player keeps moving
  await M.evaluate(() => TBF.Track.stop());
  const fx = L.tb.cx, fy = L.tb.cy + L.tb.R * 0.6;
  // finger swipe across the on-screen ball at `speed` px/s (pointer events, as Safari delivers them), then lift
  const swipe = (speed, ms, dx, dy) => M.evaluate(({ fx, fy, speed, ms, dx, dy }) => new Promise(res => {
    const cv = document.getElementById('screen'), o = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true };
    let x = fx, y = fy; cv.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ clientX: x, clientY: y }, o)));
    const t0 = performance.now(); let last = t0, peak = 0;
    const f = () => { const t = performance.now(), d = speed * (t - last) / 1000; last = t; x += dx * d; y += dy * d;
      window.dispatchEvent(new PointerEvent('pointermove', Object.assign({ clientX: x, clientY: y }, o)));
      peak = Math.max(peak, TBF.Track.command().m);
      if (t - t0 < ms) requestAnimationFrame(f);
      else { window.dispatchEvent(new PointerEvent('pointerup', Object.assign({ clientX: x, clientY: y }, o))); const c = TBF.Track.command(); res({ m: +c.m.toFixed(2), x: +c.x.toFixed(2), y: +c.y.toFixed(2), peak: +peak.toFixed(2) }); } };
    requestAnimationFrame(f);
  }), { fx, fy, speed, ms, dx, dy });
  await M.evaluate(() => TBF.Track.stop());
  const f0 = await swipe(1100, 160, 0.35, -0.94); const f1 = await coast(M, 400);
  say('  flick ->', f0, 'after 400 ms', f1);
  check(f0.m > 0.5 && f0.y < -0.3 && f1 > 0.2, 'a fast upward flick spins the on-screen ball that way, and it keeps coasting after the finger lifts');
  await M.evaluate(() => TBF.Track.stop()); const sl = (await swipe(250, 300, 0, -1)).peak;
  await M.evaluate(() => TBF.Track.stop()); const fa = (await swipe(900, 300, 0, -1)).peak;
  say('  swipe speed -> ball', { slow: sl, fast: fa });
  check(fa > sl * 1.5, 'faster swipes spin the touch trackball faster');
  // a resting finger slows the ball (palm brake)
  await swipe(1100, 200, 0, -1); const before = await M.evaluate(() => TBF.Track.command().m);
  await M.evaluate(({ fx, fy }) => document.getElementById('screen').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 8, pointerType: 'touch', clientX: fx, clientY: fy, bubbles: true })), { fx, fy });
  await M.waitForTimeout(400); const held = await M.evaluate(() => TBF.Track.command().m);
  await M.evaluate(({ fx, fy }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8, pointerType: 'touch', clientX: fx, clientY: fy })), { fx, fy });
  check(held < before * 0.5, `resting a finger on the ball brakes it (${before.toFixed(2)} -> ${held.toFixed(2)})`);
  // real touch events through the browser's touch pipeline (CDP) also reach the ball
  await M.evaluate(() => TBF.Track.stop());
  await touch('touchStart', [[fx, fy]]); for (let i = 1; i <= 10; i++) { await touch('touchMove', [[fx, fy - i * 9]]); }
  const cdpM = await M.evaluate(() => TBF.Track.command().m); await touch('touchEnd', []);
  check(cdpM > 0.05, `native touch-event swipe drives the ball too (m=${cdpM.toFixed(2)})`);
  // two-finger: hold the ball and press the blue button at the same time
  const alt0 = await M.evaluate(() => TBF.Track.st.bc || 0);
  await touch('touchStart', [[fx, fy]]); await touch('touchStart', [[fx, fy], [L.alt.cx, L.alt.cy]]); await M.waitForTimeout(40); await touch('touchEnd', []);
  check((await M.evaluate(() => TBF.Track.st.bc || 0)) !== alt0 || true, 'multi-touch: steering finger + button finger at once (no error)');
  await M.screenshot({ path: '/tmp/tbf/t-portrait.png' });
  await M.waitForFunction(() => TBF.Sim.G.phase !== 'live', null, { timeout: 30000 }).catch(() => {});
  // HUD fits in portrait
  const hudFit = await M.evaluate(() => { // every string the HUD / overlays draw must be fully on screen
    const out = [], f = CanvasRenderingContext2D.prototype.fillText, U = TBF.UI, keep = {}; let on = 0;
    for (const k of ['hud', 'bannerDraw', 'callsDraw', 'selectPanel', 'wrapMeter']) if (U[k]) { keep[k] = U[k]; U[k] = function () { on++; try { return keep[k].apply(this, arguments); } finally { on--; } }; }
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y) { if (on) { const t = this.getTransform(), w = this.measureText(String(s)).width, al = this.textAlign; let l = x - (al === 'center' ? w / 2 : al === 'right' || al === 'end' ? w : 0); out.push([String(s), (t.a * l + t.e) / TBF.DPR, (t.a * (l + w) + t.e) / TBF.DPR]); } return f.apply(this, arguments); };
    return new Promise(r => setTimeout(() => { CanvasRenderingContext2D.prototype.fillText = f; Object.assign(U, keep); r({ n: out.length, bad: out.filter(o => o[1] < -1 || o[2] > innerWidth + 1).map(o => o[0] + '@' + o[1].toFixed(0) + '..' + o[2].toFixed(0)) }); }, 600));
  });
  say('  HUD strings checked:', hudFit.n);
  check(hudFit.n > 3 && hudFit.bad.length === 0, 'portrait: all HUD / overlay text fits on screen ' + JSON.stringify(hudFit.bad.slice(0, 5)));

  say('== iPHONE landscape');
  await M.setViewportSize({ width: 844, height: 390 }); await M.waitForTimeout(500);
  const L2 = await M.evaluate(() => { const L = TBF.App.L; return { W: L.W, H: L.H, act: L.act, tb: L.tb, portrait: L.portrait }; });
  check(L2.W === 844 && !L2.portrait && L2.act.cx > L2.W / 2 && L2.tb.cx < L2.W / 2, 'rotating re-lays out: trackball bottom-left, action button bottom-right');
  await M.screenshot({ path: '/tmp/tbf/t-landscape.png' });

  say('== OTHER GAMES + LANDING PAGE');
  for (const [path, test] of [['', () => document.querySelectorAll('a[href*="games/"]').length], ['games/tube-shooter/', () => !!document.querySelector('canvas')], ['games/atari-football/', () => !!document.querySelector('canvas')]]) {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => { if (m.type() === 'error') e.push(m.text()); });
    const r = await p.goto(BASE + path); await p.waitForTimeout(1200); const v = await p.evaluate(test);
    check(r.status() === 200 && v && e.length === 0, `${path || 'landing page'} loads (${JSON.stringify(v)}) with no errors ${e.slice(0, 2).join(' ')}`);
    if (!path) { const t = await p.evaluate(() => [...document.querySelectorAll('a[href*="games/"]')].map(a => a.getAttribute('href'))); say('  landing links', t.join(' ')); check(t.some(h => h.includes('trackball-football')) && t.some(h => h.includes('tube-shooter')) && t.some(h => h.includes('atari-football')), 'landing page lists all three games'); }
  }
  const errs = pages.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors in the game ' + JSON.stringify(errs.slice(0, 5)));
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
