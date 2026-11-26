/* LIVING CHESS — cinematic emotion scenes: browser test.
   Run from the repo root:  python3 -m http.server 8093 &   then
     NODE_PATH=<playwright node_modules> node games/living-chess/tests/cine.test.js [chromium|webkit] [desktop|iphone|ipad]
   Checks: every emotion plays (bars, title card, camera close-up, dimmed room + key spot, grade, body pose, particles,
   stinger, restore afterwards); real game moves trigger the right emotion; the machine waits for a scene in untimed games;
   tap / key / gamepad skip; Short / Off; throttle; game state untouched; no <video>; no console errors. */
const pw = require('playwright-core');
const [ENG = 'chromium', DEV = 'desktop'] = process.argv.slice(2);
const BASE = process.env.URL || 'http://localhost:8093/games/living-chess/';
const SLOW = +(process.env.SLOW || 3); // software GL here renders ~1-4 fps, so scenes run on a slowed clock (?cineslow) to get enough frames to inspect
const CHROME = process.env.CHROME || '/usr/bin/google-chrome'; // the headless shell also works (CHROME=...chrome-headless-shell), a little slower
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); };
const PAD = () => { // a controllable fake gamepad
  window.__pad = { connected: true, id: 'test pad', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  navigator.getGamepads = () => [window.__pad];
};
(async () => {
  const touch = DEV !== 'desktop';
  const vp = DEV === 'iphone' ? { width: 390, height: 844 } : DEV === 'ipad' ? { width: 820, height: 1180 } : { width: 1280, height: 800 };
  const b = ENG === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const co = { viewport: vp }; if (touch) Object.assign(co, { deviceScaleFactor: DEV === 'iphone' ? 3 : 2, hasTouch: true, userAgent: DEV === 'iphone' ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  if (touch && ENG === 'chromium') co.isMobile = true;
  const ctx = await b.newContext(co); await ctx.addInitScript(PAD);
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => { console.log('  !! pageerror', JSON.stringify(e.message), e.name, String(e.stack)); if (e.name === 'ExitStatus') { console.log('  NOTE Stockfish WASM worker raised ExitStatus (engine-side, game continues)'); return; } errs.push('PAGEERR ' + e.message); });
  console.log(`== cine ${ENG} ${DEV} ${vp.width}x${vp.height}`);
  await p.goto(BASE + '?fast=1&cine=full&cineslow=' + SLOW, { timeout: 180000 });
  await p.waitForFunction(() => window.LCG && LCG.booted && LCG.screen === 'title', null, { timeout: 120000 });
  await p.mouse.click(5, vp.height - 5); // a user gesture unlocks WebAudio
  await p.evaluate(() => { window.__st = []; const o = LCAudio.stinger.bind(LCAudio); LCAudio.stinger = (k, L, x) => { const r = o(k, L, x); __st.push({ k, L: +L.toFixed(2), ok: r }); return r; }; });
  const solo = async (fen, me = 0) => { await p.evaluate(([f, m]) => LCG.api.newSolo(m, 0, 0, [], f), [fen, me]); await p.waitForFunction(() => { const s = LCG.api.state(); return s.mode === 'solo' && !s.busy; }, null, { timeout: 60000 }); await p.waitForTimeout(300); };
  const waitIdle = (ms = 30000) => p.waitForFunction(() => !LCG.api.cine().active, null, { timeout: ms });
  const waitActive = (ms = 20000) => p.waitForFunction(() => LCG.api.cine().active, null, { timeout: ms }).then(() => true, () => false);
  await solo('r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1');

  // ---------- 1. every emotion, forced on pieces of every type and both sides ----------
  const SC = [['fear', 'd1', { threat: 'd8' }], ['sadness', 'c8', { threat: 'e5' }], ['dismay', 'e1', { threat: 'e5' }], ['rage', 'f3', { threat: 'e5', word: 'RAGE' }],
    ['triumph', 'c1'], ['hope', 'd4', { goal: 'd8' }], ['relief', 'a8'], ['despair', 'e8'], ['stalemate', 'e1', { otherSq: 60 }], ['fear', 'c6', { threat: 'd4' }], ['triumph', 'h8'], ['sadness', 'f8']];
  for (const [emo, sq, o] of SC) {
    await waitIdle();
    const t0 = Date.now(); const ok = await p.evaluate(([e, s, x]) => LCG.api.cinePlay(e, s, x || {}), [emo, sq, o || null]);
    const rt0 = await p.evaluate(() => LCG.R.time);
    await p.waitForFunction(rt => { const c = LCG.api.cine(); return !c.active || (c.t >= 1.0 && LCG.R.time - rt >= 0.15); }, rt0, { timeout: 60000 });
    const m = await p.evaluate(([sq]) => {
      const R = LCG.R, c = R.charAt(LC.sqIdx(sq)), st = LCG.api.cine(), root = document.getElementById('cine'), bar = root.querySelector('.cbar.top').getBoundingClientRect();
      const word = root.querySelector('.cword'), wr = word.getBoundingClientRect(), line = root.querySelector('.cline');
      const camD = c ? R.cam.position.distanceTo(c.root.position) : null;
      return { st, on: root.classList.contains('on'), bar: Math.round(bar.height), word: word.textContent, wordShown: word.classList.contains('show'), wordFits: wr.left >= -1 && wr.right <= innerWidth + 1, wordW: Math.round(wr.width), line: line.textContent,
        camD: camD && +camD.toFixed(2), key: +(R.key.intensity / R.baseLights.key).toFixed(2), spot: +R.cineSpot.intensity.toFixed(1), sat: +R.focusPass.uniforms.sat.value.toFixed(2), gradeCss: +getComputedStyle(root.querySelector('.cgrade')).opacity, tier: R.tier,
        pose: c && c.cine ? { emo: c.cine.emo, g: c.cine.g } : null, fx: R.sparks.p.length + R.cineFx.p.length, hud: getComputedStyle(document.getElementById('side')).opacity, fov: R.cam.fov, type: c && c.type, side: c && c.side };
    }, [sq]);
    const graded = m.tier >= 2 ? m.sat !== 1 : m.gradeCss > 0;
    check(ok && m.st.active && m.on && m.bar > 5 && m.wordShown && m.word.length > 2 && m.line.length > 3, `${emo} (${['', 'P', 'N', 'B', 'R', 'Q', 'K'][m.type]}${m.side ? ' black' : ' white'} on ${sq}): letterbox + title card + line`, { word: m.word, line: m.line, bar: m.bar, active: m.st.active, t: m.st.t, on: m.on, shown: m.wordShown });
    check(m.camD != null && m.camD < 6.8 && m.key < 0.8 && m.spot > 1 && graded, `   ${emo}: close-up camera, dimmed room, key spot, colour grade`, { camD: m.camD, key: m.key, spot: m.spot, sat: m.sat, css: m.gradeCss, fov: +m.fov.toFixed(1), occl: m.st.occluded });
    check(m.pose && m.fx > 0 && m.wordFits && +m.hud < 0.5, `   ${emo}: body pose, particles, caption fits, HUD faded`, { pose: m.pose, fx: m.fx, wordW: m.wordW });
    await waitIdle(); const dur = (Date.now() - t0) / 1000;
    const r = await p.evaluate(() => { const R = LCG.R; return { key: R.key.intensity === R.baseLights.key, spot: R.cineSpot.intensity, fov: R.cam.fov, sat: R.focusPass.uniforms.sat.value, poses: [...R.chars.values()].filter(c => c.cine).length, hidden: document.getElementById('cine').classList.contains('hidden'), exp: R.r.toneMappingExposure === R.baseLights.exp }; });
    const lgD = await p.evaluate(() => LCG.api.cineLog().slice(-1)[0]);
    check(lgD.ms >= lgD.total * 1000 * SLOW * 0.8 && lgD.ms <= ((lgD.total + (lgD.lost || 0)) * SLOW + 6) * 1000 && r.key && r.exp && r.spot === 0 && r.fov === 36 && r.sat === 1 && r.poses === 0 && r.hidden, `   ${emo}: ${(lgD.ms / 1000).toFixed(1)} s (planned ${lgD.total} s x${SLOW} slow clock, +${lgD.lost || 0} s held back by slow frames), then everything restored`, Object.assign(r, { wall: dur }));
  }
  const st = await p.evaluate(() => __st);
  check(['fear', 'sadness', 'dismay', 'rage', 'triumph', 'hope', 'relief', 'despair', 'stalemate'].every(k => st.some(s => s.k === k && s.ok)), 'a scored stinger played for every emotion (WebAudio running)', st.map(s => s.k + (s.ok ? '' : '!')));

  // ---------- 2. skip: key, tap, gamepad ----------
  for (const how of ['key', 'tap', 'pad']) {
    await waitIdle(); await p.evaluate(() => LCG.api.cinePlay('fear', 'd1', { threat: 'd8' })); await p.waitForTimeout(500);
    const t0 = Date.now();
    if (how === 'key') await p.keyboard.press('x');
    else if (how === 'tap') { if (touch) await p.touchscreen.tap(vp.width / 2, vp.height / 2); else await p.mouse.click(vp.width / 2, vp.height / 2); }
    else { await p.evaluate(() => { __pad.buttons[0].pressed = true; }); await waitIdle(); await p.evaluate(() => { __pad.buttons[0].pressed = false; }); }
    await waitIdle(); const dt = Date.now() - t0;
    const lg = await p.evaluate(() => LCG.api.cineLog().slice(-1)[0]);
    const s2 = await p.evaluate(() => ({ sel: LCG.api.state().sel, ply: LCG.api.state().ply }));
    check(lg.skipped && (lg.framesAfterSkip <= 3 * SLOW || lg.msAfterSkip <= (0.28 * SLOW + 1.5) * 1000) && lg.ms < (lg.total * SLOW * 1000) && s2.sel == null, `skip by ${how} ends the scene within ${lg.framesAfterSkip} frame(s) / ${lg.msAfterSkip} ms and the input does not touch the board`, { dt, ms: lg.ms, frames: lg.framesAfterSkip, sel: s2.sel });
  }

  // ---------- 3. throttle ----------
  await waitIdle(); await p.evaluate(() => LCG.api.cinePlay('triumph', 'g1')); await waitIdle();
  const th = await p.evaluate(() => { const low = LCG.api.cineConsider([{ emo: 'fear', tag: 'attacked', id: 3, side: 1, type: 2, prio: 52, sq: 18 }]); LCG.api.cineSkip(); return { low }; });
  await waitIdle();
  const th2 = await p.evaluate(() => { const hi = LCG.api.cineConsider([{ emo: 'fear', tag: 'check', id: 4, side: 1, type: 6, prio: 80, sq: 60 }]); return { hi }; });
  check(!th.low && th2.hi, 'throttle: a minor moment right after a scene is skipped; a big one (check) still plays', Object.assign(th, th2));
  await p.evaluate(() => LCG.api.cineSkip()); await waitIdle();

  // ---------- 4. real moves trigger the right emotion (and the machine waits for the scene) ----------
  const REAL = [
    ['check -> enemy King FEAR', '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 0, 'a1a8', 'fear', 'check', 6, 1],
    ['capture -> TRIUMPH for your Rook', '4k3/8/8/8/8/8/r7/R3K3 w - - 0 1', 0, 'a1a2', 'triumph', 'capture', 4, 0],
    ['pawn hits the Queen -> her FEAR', '4k3/8/8/3q4/8/8/2P5/4K3 w - - 0 1', 0, 'c2c4', 'fear', 'attacked', 5, 1],
    ['Bb5 pin -> PINNED Knight FEAR', '4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1', 0, 'f1b5', 'fear', 'pin', 2, 1],
    ['pawn on the 7th -> HOPE', '7k/8/P7/8/8/8/8/4K3 w - - 0 1', 0, 'a6a7', 'hope', 'march', 1, 0],
    ['promotion -> ASCENSION', '7k/P7/8/8/8/8/8/4K3 w - - 0 1', 0, 'a7a8q', 'triumph', 'promo', 5, 0],
    ['out of check -> King RELIEF', '4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 0, 'e1e2', 'relief', 'escape', 6, 0],
    ['hanging Queen escapes -> RELIEF', '4k3/8/8/8/1p6/Q7/8/4K3 w - - 0 1', 0, 'a3h3', 'relief', 'saved', 5, 0],
    ['the machine takes your Rook -> SORROW', 'k7/8/8/7p/4b2P/8/r7/K7 w - - 0 1', 1, null, 'sadness', 'grief', 3, 1],
    ['the machine takes your Rook, your Knight can strike back -> RAGE', 'k7/8/8/8/8/3n4/6PP/R3r2K w - - 0 1', 1, null, 'rage', 'avenge', 2, 1],
    ['the machine takes your Queen -> your King in DISMAY', 'k7/8/8/7p/4b2P/8/q7/K7 w - - 0 1', 1, null, 'dismay', 'queenLost', 6, 1],
  ];
  for (const [name, fen, me, uci, emo, tag, type, side] of REAL) {
    await waitIdle(); await p.evaluate(() => LCG.api.cineReset());
    let n0 = await p.evaluate(() => LCG.api.cineLog().length); // taken before solo(): the machine may move (and its scene start) before solo() returns
    await solo(fen, me); await p.evaluate(() => LCG.api.cineReset());
    if (uci) n0 = await p.evaluate(() => LCG.api.cineLog().length);
    if (uci) await p.evaluate(u => LCG.api.move(u), uci);
    await waitActive(30000).catch(() => { });
    const info = await p.evaluate(() => ({ st: LCG.api.cine(), log: LCG.api.cineLog().slice(-1)[0], ply: LCG.api.state().ply, n: LCG.api.cineLog().length, fen: LCG.api.state().fen, busy: LCG.api.state().busy, engine: LCG.api.state().engine, ev: LCG.api.events().filter(e => e.t !== 'say').slice(-4) }));
    const lg = info.log;
    check(info.n > n0 && lg.emo === emo && lg.tag === tag && lg.type === type && lg.side === side, name, info.n > n0 ? lg : { lg, fen: info.fen, busy: info.busy, engine: info.engine, ev: info.ev, ply: info.ply });
    if (uci) { // the machine's reply waits for the scene
      const plyDuring = info.ply; await waitIdle(); await p.waitForTimeout(150);
      const after = await p.evaluate(() => LCG.api.state());
      check(plyDuring === 1, '   the machine did not move during the scene', { plyDuring });
      if (!after.over) await p.waitForFunction(() => LCG.api.state().ply >= 2 || LCG.api.state().over, null, { timeout: 30000 });
    } else await waitIdle();
  }
  // game state untouched by the scenes
  await solo('k7/8/8/7p/4b2P/8/r7/K7 w - - 0 1', 1); await p.evaluate(() => LCG.api.cineReset()); await waitActive(30000); await waitIdle();
  const fen1 = await p.evaluate(() => LCG.api.state().fen);
  check(fen1.startsWith('k7/8/8/7p/4b2P/8/K7/8 b'), 'board after the only move is exactly Kxa2 (scenes never change the game)', fen1);

  // ---------- 5. checkmate, stalemate, defeat ----------
  await solo('7k/8/6K1/8/8/8/8/R7 w - - 0 1'); await p.evaluate(() => LCG.api.cineReset()); await p.evaluate(() => LCG.api.move('a1a8'));
  await waitActive(20000); await p.waitForTimeout(600);
  const m1 = await p.evaluate(() => ({ st: LCG.api.cine(), over: !document.getElementById('over').classList.contains('hidden') }));
  await p.waitForFunction(() => LCG.api.cine().shot === 'triumph', null, { timeout: 60000 }).catch(() => { });
  const m2 = await p.evaluate(() => LCG.api.cine());
  await waitIdle(); await p.waitForTimeout(800);
  const m3 = await p.evaluate(() => ({ over: !document.getElementById('over').classList.contains('hidden'), title: document.getElementById('otitle').textContent, lg: LCG.api.cineLog().slice(-1)[0] }));
  check(m1.st.emo === 'checkmate' && m1.st.shot === 'despair' && !m1.over && m2.shot === 'triumph' && m3.over && /CHECKMATE/.test(m3.title), 'checkmate: King DESPAIR, cut to the mating Rook VICTORY, then the result panel', { m1: m1.st, m2: m2.shot, m3: m3.title, total: m3.lg.total });
  await solo('7k/5K2/8/8/8/8/8/6Q1 w - - 0 1'); await p.evaluate(() => LCG.api.move('g1g6'));
  await waitActive(20000); const s1 = await p.evaluate(() => ({ st: LCG.api.cine(), word: document.querySelector('#cine .cword').textContent })); await waitIdle(); await p.waitForTimeout(700);
  const s2 = await p.evaluate(() => ({ over: !document.getElementById('over').classList.contains('hidden'), title: document.getElementById('otitle').textContent }));
  check(s1.st.emo === 'stalemate' && s2.over && /DRAW/.test(s2.title), 'stalemate scene, then the DRAW panel', { s1, s2 });
  await solo('r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1');
  await p.evaluate(() => { document.querySelector('#gmenu [data-g=resign]').click(); }); await waitActive(8000);
  const rs = await p.evaluate(() => LCG.api.cineLog().slice(-1)[0]); await waitIdle();
  check(rs.emo === 'sadness' && rs.tag === 'loss' && rs.type === 6, 'resigning: your King in DEFEAT', rs);

  // ---------- 6. Short and Off ----------
  await p.evaluate(() => LCG.api.cineMode('short')); await solo('4k3/8/8/8/8/8/r7/R3K3 w - - 0 1'); await p.evaluate(() => LCG.api.cineReset());
  await p.evaluate(() => LCG.api.move('a1a2')); await waitActive(20000); await waitIdle();
  const lgS = await p.evaluate(() => LCG.api.cineLog().slice(-1)[0]), sd = lgS.ms / 1000;
  check(lgS.mode === 'short' && lgS.total <= 2.3 && sd <= lgS.total * SLOW + 3, `SHORT: the triumph scene is ${lgS.total} s (vs 3.4 s in FULL)`, lgS);
  const btn = await p.evaluate(() => { LCG.api.cineMode('off'); return document.getElementById('bCine').textContent; });
  await p.waitForFunction(() => LCG.api.state().ply >= 2 || LCG.api.state().over, null, { timeout: 30000 }).catch(() => { });
  await solo('4k3/8/8/8/8/8/r7/R3K3 w - - 0 1'); await p.evaluate(() => LCG.api.cineReset()); const nOff = await p.evaluate(() => LCG.api.cineLog().length);
  await p.evaluate(() => LCG.api.move('a1a2')); await p.waitForTimeout(1500);
  const offS = await p.evaluate(() => ({ n: LCG.api.cineLog().length, a: LCG.api.cine().active }));
  check(offS.n === nOff && !offS.a && /OFF/.test(btn), 'OFF: no scene, and the settings chip says so', { btn, offS });
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('lc-settings')).cine);
  check(saved === 'off', 'setting is saved', saved);
  await p.evaluate(() => LCG.api.cineMode('full'));
  // ---------- 7. no video anywhere ----------
  const vids = await p.evaluate(() => document.querySelectorAll('video').length);
  check(vids === 0, 'no <video> element exists; scenes are live WebGL', vids);
  check(errs.length === 0, 'no console errors', errs.slice(0, 5));
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
