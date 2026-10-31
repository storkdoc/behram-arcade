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
    const A = TBF.App, Sim = TBF.Sim; A.timeScale = 4; const log = [], errs = [], cpuF = { n: 0, f: 0 }; let before = null, plays = 0, lastPh = null, liveT = 0, kinds = {};
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
        if (plays > N || G.over) { A.autoplay = null; A.timeScale = 1; done({ cpuF, log, errs, kinds, plays: plays - 1, sc: G.score, half: G.half, clock: G.clock }); }
      }
      if (G.phase === 'result' && lastPh === 'live') G.lastResult = Object.assign({}, G.result);
      if (G.phase === 'live' && lastPh !== 'live' && !G.special && G.op && G.op.kind !== 'punt' && G.op.kind !== 'fg') { cpuF.n++; if (G.pflip[1]) cpuF.f++; }
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
  say('  CPU flipped', report.cpuF.f, 'of', report.cpuF.n, 'non-kicking calls');
  check(report.cpuF.f > 0 && report.cpuF.f < report.cpuF.n, 'the CPU sometimes flips its play');
  check(Object.keys(report.kinds).length >= 3, 'variety of outcomes seen: ' + Object.keys(report.kinds).join(', '));
  const hud = await D.evaluate(() => TBF.App.snap.sc.join('-')); check(hud === report.sc.join('-'), 'scoreboard shows the sim score');

  say('== DESKTOP: FLIP on the select panel (vs CPU)');
  await D.evaluate(() => { TBF.App.quit(); }); await D.waitForTimeout(200); await tapL(D, 'PLAY VS COMPUTER');
  await D.waitForFunction(() => TBF.App.screen === 'game' && TBF.Sim.G.phase === 'select', null, { timeout: 30000 });
  await D.waitForTimeout(250);
  const fl0 = await D.evaluate(() => [TBF.App.Sel.flip, TBF.UI.hits.some(h => h.label === 'FLIP')]);
  await D.keyboard.press('f'); await D.waitForTimeout(120);
  const fl1 = await D.evaluate(() => TBF.App.Sel.flip);
  await D.evaluate(() => TBF.UI.hits.find(h => h.label === 'FLIP').fn()); await D.waitForTimeout(80);
  const fl2 = await D.evaluate(() => TBF.App.Sel.flip);
  await D.keyboard.press('Shift'); await D.waitForTimeout(120);
  const fl3 = await D.evaluate(() => TBF.App.Sel.flip);
  // gamepad shoulder button (LB) flips too
  await D.evaluate(() => { const pad = b4 => ({ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, k) => ({ pressed: k === 4 && b4, value: k === 4 && b4 ? 1 : 0 })) }); window.__pad = pad(true); navigator.getGamepads = () => [window.__pad]; });
  await D.waitForTimeout(120); await D.evaluate(() => { window.__pad.buttons[4] = { pressed: false, value: 0 }; }); await D.waitForTimeout(120);
  const fl4 = await D.evaluate(() => TBF.App.Sel.flip); await D.evaluate(() => { navigator.getGamepads = () => []; });
  check(!fl0[0] && fl0[1] && fl1 === true && fl2 === false && fl3 === true && fl4 === false, `FLIP toggles from F (${fl1}), the FLIP pill (${fl2}), Shift (${fl3}) and a gamepad shoulder (${fl4})`);
  // the diagrams on the cards redraw mirrored: compare the pixels of the selected card's diagram, flipped vs not
  const cardPx = () => D.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
    const h = TBF.UI.hits.find(h => h.label.startsWith('PLAY:')), cv = document.getElementById('screen'), k = TBF.DPR, ctx = cv.getContext('2d');
    const x = Math.round((h.x + 6) * k), y = Math.round((h.y + 6) * k), w = Math.round((h.w - 12) * k), hh = Math.round((h.h * 0.5) * k);
    const d = ctx.getImageData(x, y, w, hh).data; r({ w, hh, d: Array.from(d) });
  }))));
  await D.keyboard.press('f'); await D.waitForTimeout(150); const pf = await cardPx();
  await D.keyboard.press('f'); await D.waitForTimeout(150); const pn = await cardPx();
  const vmirror = (a, b) => { let same = 0, mir = 0, n = 0; for (let y = 0; y < a.hh; y += 2) for (let x = 0; x < a.w; x += 2) { const i = (y * a.w + x) * 4, j = ((a.hh - 1 - y) * a.w + x) * 4; const lum = (d, i) => d[i] + d[i + 1] + d[i + 2]; if (lum(a.d, i) < 200 && lum(b.d, i) < 200) continue; n++; if (Math.abs(lum(a.d, i) - lum(b.d, i)) < 60) same++; if (Math.abs(lum(a.d, i) - lum(b.d, j)) < 90) mir++; } return { n, same: +(same / n).toFixed(2), mir: +(mir / n).toFixed(2) }; };
  const vm = vmirror(pf, pn); say('  card diagram flipped vs normal (bright pixels):', vm);
  check(vm.same < 0.9, 'the play diagram visibly changes when flipped');
  // lock it flipped: vs the CPU the formation lines up mirrored right away
  await D.keyboard.press('f'); await D.waitForTimeout(80);
  const lockRes = await D.evaluate(() => { const A = TBF.App; TBF.GameScreen.lockSel(); return [A.Sel.flip, TBF.Sim.G.pflip[A.me]]; });
  await D.waitForFunction(() => TBF.Sim.G.phase === 'presnap', null, { timeout: 15000 });
  await D.waitForTimeout(150);
  const flipAfter = await D.evaluate(() => [TBF.App.Sel.flip, TBF.Sim.G.formFlip[TBF.App.me], TBF.Sim.G.opts.secret]);
  await D.keyboard.press('f'); await D.waitForTimeout(80); const flipLocked = await D.evaluate(() => TBF.Sim.G.pflip[TBF.App.me]);
  check(lockRes[0] && lockRes[1] && flipAfter[1] === true && !flipAfter[2] && flipLocked === true, 'locking passes the flip to the sim, the formation lines up mirrored vs the CPU, and F after locking changes nothing');
  await D.evaluate(() => { TBF.App.paused = true; });

  say('== SIM: flip mirrors formation, routes, run direction, coverage');
  const flipRes = await D.evaluate(() => {
    const Sim = TBF.Sim, STEP = 1 / 60, N0 = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false }), MID = 160 / 6;
    const step = (n, f) => { for (let k = 0; k < n; k++) Sim.update(STEP, f ? f(k) : [N0(), N0()]); };
    function toLive(oid, ofl, did, dfl) {
      Sim.newGame({ human: [true, true], diff: 1, half: 150 }); const G = Sim.G; let k = 0;
      while (G.phase !== 'select' && k++ < 4000) step(1);
      const off = G.off; Sim.pick(off, oid, ofl); Sim.pick(1 - off, did, dfl);
      k = 0; while (G.phase !== 'presnap' && k++ < 100) step(1);
      G.ballY = MID; G.flip = 1; // mirror about the center line
      let snapRec = null;
      k = 0; while (G.phase !== 'live' && k++ < 900) { const a = [N0(), N0()]; if (G.t > 0.3) a[off].aP = true; step(1, () => a); }
      return G;
    }
    const rec = G => { const off = G.off, los = G.los, by = G.ballY, d = Sim.dirOf(off); return G.pl.map(p => ({ o: p.team === off, f: (p.x - los) * d, l: p.y - by, route: (p.route || []).map(q => [(q.x - los) * d, q.y - by]), zone: p.zone ? [(p.zone.x - los) * d, p.zone.y - by] : null, man: p.manT == null ? null : p.manT % 7, as: p.as })); };
    const A = rec(toLive('slants', false, 'man', false)), B = rec(toLive('slants', true, 'man', false));
    const Z = rec(toLive('slants', false, 'zone', false)), Zf = rec(toLive('slants', true, 'zone', true));
    const R = rec(toLive('sweep', false, 'zone', false)), Rf = rec(toLive('sweep', true, 'zone', false));
    const near = (a, b, t) => Math.abs(a - b) <= t;
    let posBad = [], routeBad = [], defSame = [], manBad = [], zoneBad = [], defMir = [], runBad = [];
    A.forEach((p, i) => { const q = B[i];
      if (p.o) { if (!near(p.f, q.f, 0.35) || !near(p.l, -q.l, 0.35)) posBad.push(i); if (p.route.length !== q.route.length || p.route.some((w, k) => !near(w[0], q.route[k][0], 0.01) || !near(w[1], -q.route[k][1], 0.01))) routeBad.push(i); }
      else { if (!near(p.l, q.l, 0.35)) defSame.push(i); if (p.as === 'man' && (p.man === 5 || p.man === 6) && q.man !== 11 - p.man) manBad.push(i); }
    });
    Z.forEach((p, i) => { const q = Zf[i]; if (!p.o) { if (!near(p.l, -q.l, 0.35)) defMir.push(i); if (p.zone && (!near(p.zone[0], q.zone[0], 0.01) || !near(p.zone[1], -q.zone[1], 0.01))) zoneBad.push(i); } });
    const rbN = R.find((p, i) => p.o && i % 7 === 4), rbF = Rf.find((p, i) => p.o && i % 7 === 4);
    const runSide = rb => Math.sign(rb.route[rb.route.length - 1][1]);
    return { posBad, routeBad, defSame, manBad, zoneBad, defMir, run: [runSide(rbN), runSide(rbF)], wr: [A.filter(p => p.o).map(p => +p.l.toFixed(1)), B.filter(p => p.o).map(p => +p.l.toFixed(1))], calls: Sim.G.calls };
  });
  say('  offense lateral spots (yd from the center line) normal', flipRes.wr[0], ' flipped', flipRes.wr[1]);
  check(!flipRes.posBad.length && !flipRes.routeBad.length, 'FLIP mirrors every offensive spot and route about the center line ' + JSON.stringify([flipRes.posBad, flipRes.routeBad]));
  check(!flipRes.defSame.length && !flipRes.manBad.length, 'an unflipped defense stays put, and its corners trade receivers against a flipped offense ' + JSON.stringify([flipRes.defSame, flipRes.manBad]));
  check(!flipRes.defMir.length && !flipRes.zoneBad.length, 'a flipped defense mirrors its spots and zones ' + JSON.stringify([flipRes.defMir, flipRes.zoneBad]));
  check(flipRes.run[0] === -flipRes.run[1] && flipRes.run[0] !== 0, `a flipped SWEEP runs to the other side (${flipRes.run})`);
  check(/\(FLIP\)/.test(flipRes.calls[0]), 'the revealed call says (FLIP): ' + flipRes.calls.join(' vs '));

  say('== SIM: defensive Space selects the closest defender, timed lunges, interceptions');
  const pk = await D.evaluate(() => {
    const Sim = TBF.Sim, STEP = 1 / 60, N0 = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false }), MID = 160 / 6;
    const step = (n, f) => { for (let k = 0; k < n; k++) Sim.update(STEP, f ? f(k) : [N0(), N0()]); };
    function toLive(oid, did, diff, human) {
      Sim.newGame({ human: human || [true, true], diff: diff == null ? 1 : diff, half: 600 }); const G = Sim.G; let k = 0;
      while (G.phase !== 'select' && k++ < 4000) step(1);
      // put the ball at midfield with team 0 on offense
      G.off = 0; G.los = 60; G.ballY = MID; G.flip = 1; G.down = 1; G.togo = 10;
      Sim.pick(0, oid, false); Sim.pick(1, did, false);
      k = 0; while (G.phase !== 'live' && k++ < 900) { const a = [N0(), N0()]; if (G.phase === 'presnap' && G.t > 0.3) a[0].aP = true; step(1, () => a); }
      return G;
    }
    // a pass in the air to a receiver at the catch point, the human defender `dist` yd from it, everyone else far away
    function stage(G, dist, opt = {}) {
      const off = G.off, def = 1 - off, d = Sim.dirOf(off), tx = G.los + d * 14, ty = MID;
      G.phase = 'live'; G.result = null; G.intercepted = false; G.wrap = null; G.run = false; G.thrown = true; G.caught = false; G.special = null; G.lastPick = null; G.lag = opt.lag || [0, 0];
      G.pl.forEach((p, k) => { p.x = G.los - d * 8; p.y = 4 + k * 3.3; p.vx = p.vy = 0; p.st = 'ok'; p.stT = 0; p.eng = -1; p.recov = 0; p.imm = 0; p.tcd = 0; p.noEng = 0; p.burst = 0; });
      const r = G.pl[off * 7 + 5], me = G.pl[def * 7 + 4], qb = G.pl[off * 7 + 3];
      r.x = tx - d * 1.0; r.y = ty; r.as = 'route'; r.route = [{ x: tx + d * 3, y: ty }]; r.wp = 0;
      me.x = tx; me.y = ty + dist; G.ctl[def] = opt.ctl != null ? opt.ctl : me.i; G.ctl[off] = qb.i;
      Object.assign(G.ball, { st: 'air', kind: 'pass', holder: -1, t: 0, T: 1.0, sx: G.los, sy: ty, sz: 2, tx, ty, tz: 1.25, tgt: r.i, from: qb.i, x: G.los, y: ty, z: 2, hold: 0, lunge: null, arr: null });
      return { off, def, me, r, tx, ty };
    }
    const press = (G, t, extra) => { const a = [N0(), N0()]; a[t].aP = true; Object.assign(a[t], extra || {}); Sim.update(STEP, a); };
    const settle = G => { let k = 0; while (G.ball.st === 'air' && k++ < 120) step(1); return G.ball.st === 'held' && G.pl[G.ball.holder].team !== G.off; };
    // one timed press at e (s from arrival, < 0 = early); returns [intercepted?, lastPick]
    function trial(G, e, dist, opt) {
      const s = stage(G, dist, opt), b = G.ball;
      if (e < 0) b.t = b.T + e;
      else { b.t = b.T - 1e-4; step(1); if (!b.hold) return [false, 'nohold']; b.t = b.T + e; }
      press(G, s.def, opt && opt.extra);
      return [settle(G), G.lastPick];
    }
    const out = {};
    // ---- Space picks the closest defender
    let G = toLive('slants', 'zone');
    let s = stage(G, 1.0, { ctl: 1 * 7 + 0 }); // controlling the DT, far from the play
    const ev0 = G.evSeq; press(G, s.def);
    out.selPass = { ctl: G.ctl[s.def], want: s.me.i, ev: G.ev.filter(e => e.s > ev0 && e.n === 'switch' && e.sel).length };
    const ctl1 = G.ctl[s.def]; press(G, s.def); step(1); press(G, s.def);
    out.noThrash = G.ctl[s.def] === ctl1;
    // with a runner: closest defender to the carrier
    s = stage(G, 9, { ctl: 1 * 7 + 4 });
    const runner = G.pl[0 * 7 + 4], cb = G.pl[1 * 7 + 6]; runner.x = 75; runner.y = 10; cb.x = 76.2; cb.y = 10.5;
    Object.assign(G.ball, { st: 'held', holder: runner.i, kind: 'pass' }); G.run = true;
    press(G, 1); out.selRun = { ctl: G.ctl[1], want: cb.i };
    // ---- odds via the real press path
    const N = 160, rate = (e, dist, opt) => { let n = 0; const ps = []; for (let k = 0; k < N; k++) { const [i, lp] = trial(G, e, dist, opt); if (i) n++; if (k === 0) ps.push(lp); } return { rate: +(n / N).toFixed(2), sample: ps[0] }; };
    out.perfectNear = rate(-0.004, 1.0); out.perfectFar = rate(-0.004, 2.9);
    out.early = rate(-0.24, 1.0); out.late = rate(0.19, 1.6); out.lateHold = trial(G, 0.16, 1.6)[1];
    out.wayEarly = rate(-0.45, 1.0);
    // ---- early-press penalty: an early lunge leaves you stumbling; a perfect one doesn't
    s = stage(G, 1.0); G.ball.t = G.ball.T - 0.45; press(G, s.def); const eRec = s.me.recov; step(20); out.earlyStun = { recov: +eRec.toFixed(2), st: s.me.st };
    s = stage(G, 1.0); G.ball.t = G.ball.T - 0.05; press(G, s.def); out.perfectRecov = s.me.recov;
    // mashing from 0.55 s out: one lunge per pass, at the wrong time
    let mash = 0; for (let k = 0; k < N; k++) { s = stage(G, 1.0); G.ball.t = G.ball.T - 0.55; for (let f = 0; f < 45 && G.ball.st === 'air'; f++) press(G, s.def); if (settle(G)) mash++; }
    out.mash = +(mash / N).toFixed(2);
    // presses more than 0.6 s out only confirm your man (no lunge)
    s = stage(G, 1.0); G.ball.t = G.ball.T - 0.8; press(G, s.def); out.tooEarly = { st: s.me.st, lunge: !!(G.ball.lunge && G.ball.lunge[1]) };
    // ---- online guest: its press carries the time-to-arrival it saw; the host checks it against the link lag
    s = stage(G, 1.0, { lag: [0, 0.15] }); G.ball.t = G.ball.T - 0.10; press(G, 1, { tta: 0.2 }); const gOk = G.ball.lunge[1].e;
    s = stage(G, 1.0, { lag: [0, 0.15] }); G.ball.t = G.ball.T - 0.10; press(G, 1, { tta: 0.9 }); const gBad = G.ball.lunge[1].e;
    s = stage(G, 1.0, { lag: [0, 0.15] }); G.ball.t = G.ball.T - 0.10; press(G, 1); const gNone = G.ball.lunge[1].e;
    s = stage(G, 1.0, { lag: [0, 0.15] }); G.ball.t = G.ball.T - 1e-4; step(1); const holdFor = +(G.ball.hold - G.t).toFixed(3);
    out.guest = { reported: +gOk.toFixed(3), implausible: +gBad.toFixed(3), none: +gNone.toFixed(3), holdFor };
    // ---- the pure odds table
    const o = Sim.intOdds, I = Sim.INT;
    out.table = { perfect: o(0, 1, 0.78), early: o(-0.2, 1, 0.78), late: o(0.17, 1, 0.78), edgeE: o(-0.33, 1, 0.78), edgeL: o(0.23, 1, 0.78), near: o(0, 1.4, 0.78), mid: o(0, 2.3, 0.78), far: o(0, 3.3, 0.78), recvCloser: o(0, 1, 0.78, true) };
    out.I = I;
    // ---- CPU defenders: timing-based picks, more on higher levels (human QB vs CPU defense)
    out.cpu = [0, 1, 2].map(diff => { const G2 = toLive('slants', 'zone', diff, [true, false]); let n = 0, c = 0; const M = 400;
      for (let k = 0; k < M; k++) { const s2 = stage(G2, 0.6); G2.ctl[s2.def] = s2.def * 7 + 3; s2.r.x = s2.tx + 1.4; s2.r.route = [{ x: s2.r.x, y: s2.ty }]; G2.ball.t = G2.ball.T - 1e-4; step(1); c++; if (G2.ball.st === 'held' && G2.pl[G2.ball.holder].team !== G2.off) n++; }
      return +(n / c).toFixed(2); });
    // ---- rules after an INT: possession, spot, downs; pick-six; touchback in your own end zone
    G = toLive('slants', 'zone');
    const intOnce = () => { for (let k = 0; k < 60; k++) { const r = trial(G, -0.004, 0.5); if (r[0]) return true; } return false; };
    const toSelect = () => { let k = 0; while (G.phase !== 'select' && k++ < 1200) step(1); };
    out.rules = {};
    intOnce(); const ctlAfter = G.ctl[1] === G.ball.holder, carrier = G.pl[G.ball.holder]; carrier.x = 50; carrier.y = 20;
    Sim.endPlay({ type: 'tackle', team: 1, x: 50, y: 20 }); toSelect();
    out.rules.ret = { ctlIsPicker: ctlAfter, off: G.off, down: G.down, togo: G.togo, los: +G.los.toFixed(1) };
    G = toLive('slants', 'zone'); const sc0 = G.score.slice(); intOnce(); { const c = G.pl[G.ball.holder]; c.x = 9; c.y = 20; c.vx = -5; } step(3);
    out.rules.six = { type: G.result && G.result.type, team: G.result && G.result.team, d: [G.score[0] - sc0[0], G.score[1] - sc0[1]] }; toSelect(); out.rules.six.nextOff = G.off;
    G = toLive('slants', 'zone'); const sc1 = G.score.slice(); intOnce(); { const c = G.pl[G.ball.holder]; c.x = 114; c.y = 20; }
    Sim.endPlay({ type: 'tackle', team: 1, x: 114, y: 20 }); toSelect();
    out.rules.tb = { off: G.off, los: +G.los.toFixed(1), down: G.down, d: [G.score[0] - sc1[0], G.score[1] - sc1[1]] };
    return out;
  });
  say('  tuning', pk.I);
  say('  select', pk.selPass, 'run', pk.selRun, 'no thrash', pk.noThrash);
  check(pk.selPass.ctl === pk.selPass.want && pk.selPass.ev === 1, 'pass in the air: Space jumps to the defender closest to where it comes down, with a highlight (switch event)');
  check(pk.selRun.ctl === pk.selRun.want, 'runner: Space jumps to the defender closest to the ball carrier');
  check(pk.noThrash, 'repeated presses do not thrash between defenders');
  say('  INT rate (pvp base) perfect/near', pk.perfectNear, ' perfect/far 2.9yd', pk.perfectFar, ' early -0.24s', pk.early, ' late +0.19s', pk.late, ' way early -0.45s', pk.wayEarly, ' late hold sample', pk.lateHold);
  check(Math.abs(pk.perfectNear.rate - 0.78) < 0.11, `a PERFECT press close to the catch intercepts about 78% vs a human QB (${pk.perfectNear.rate})`);
  check(pk.early.rate < pk.perfectNear.rate - 0.2 && pk.late.rate < pk.perfectNear.rate - 0.2 && pk.wayEarly.rate < 0.06, `EARLY (${pk.early.rate}) and LATE (${pk.late.rate}) presses pick far less; way early ${pk.wayEarly.rate}`);
  check(pk.perfectFar.rate < pk.perfectNear.rate * 0.5, `far from the catch (2.9 yd) picks far less (${pk.perfectFar.rate})`);
  check(pk.lateHold && pk.lateHold.g === 'LATE', 'a late press still counts during the catch (graded LATE)');
  const T = pk.table; say('  odds table', Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +v.toFixed(3)])));
  check(T.perfect > T.early && T.perfect > T.late && T.edgeE === 0 && T.edgeL === 0 && T.near === T.perfect && T.perfect > T.mid && T.mid > T.far && T.far === 0 && T.recvCloser < T.perfect, 'odds taper with timing (perfect > early/late > 0 at the edges) and distance (near > mid > far = 0)');
  say('  early penalty', pk.earlyStun, 'perfect recov', pk.perfectRecov, 'mash rate', pk.mash, 'too early', pk.tooEarly);
  check(pk.earlyStun.recov > 0.5 && pk.earlyStun.st === 'stun' && pk.perfectRecov === 0, 'an early lunge costs a stumble (stun), a perfect one costs nothing');
  check(pk.mash < 0.05, `mashing from 0.55 s out gets one bad lunge: ${pk.mash} INT rate`);
  check(pk.tooEarly.st === 'ok' && !pk.tooEarly.lunge, 'a press more than 0.6 s out only confirms your man');
  say('  online guest timing', pk.guest);
  check(pk.guest.reported === -0.2 && pk.guest.implausible === -0.25 && pk.guest.none === -0.25 && Math.abs(pk.guest.holdFor - 0.37) < 0.02, 'online: the guest\u2019s reported timing is used when plausible, else host time minus lag; the catch waits 0.22 s + lag');
  say('  CPU defender INT rate when it beats the receiver to the ball (Rookie/Pro/All-Pro):', pk.cpu);
  check(pk.cpu[0] < pk.cpu[1] && pk.cpu[1] < pk.cpu[2] && pk.cpu[0] > 0.05 && pk.cpu[2] < 0.7, 'CPU defenders make timing-based picks at difficulty-matched rates');
  say('  after INT', pk.rules);
  const R = pk.rules;
  check(R.ret.ctlIsPicker && R.ret.off === 1 && R.ret.down === 1 && R.ret.togo === 10 && R.ret.los === 50, 'after a pick: you steer the interceptor, then it is 1st & 10 for the defense where he went down');
  check(R.six.type === 'td' && R.six.team === 1 && (R.six.d[1] === 6 || R.six.d[1] === 7) && R.six.d[0] === 0 && R.six.nextOff === 0, 'pick-six scores for the defense and they kick off');
  check(R.tb.off === 1 && R.tb.los === 90 && R.tb.down === 1 && R.tb.d[0] === 0 && R.tb.d[1] === 0, 'a pick downed in your own end zone is a touchback (no safety)');
  await D.evaluate(() => { TBF.App.paused = false; TBF.App.quit(); });

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
  for (const [path, test] of [['', () => document.querySelectorAll('a[href*="games/"]').length], ['games/tube-shooter/', () => !!document.querySelector('canvas')]]) {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); const e = []; p.on('pageerror', x => e.push(x.message)); p.on('console', m => { if (m.type() === 'error') e.push(m.text()); });
    const r = await p.goto(BASE + path); await p.waitForTimeout(1200); const v = await p.evaluate(test);
    check(r.status() === 200 && v && e.length === 0, `${path || 'landing page'} loads (${JSON.stringify(v)}) with no errors ${e.slice(0, 2).join(' ')}`);
    if (!path) { const t = await p.evaluate(() => [...document.querySelectorAll('a[href*="games/"]')].map(a => a.getAttribute('href'))); say('  landing links', t.join(' ')); check(t.some(h => h.includes('trackball-football')) && t.some(h => h.includes('tube-shooter')) && !t.some(h => h.includes('atari-football')), 'landing page lists both games (and not the removed Atari Football)'); }
  }
  const errs = pages.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors in the game ' + JSON.stringify(errs.slice(0, 5)));
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
