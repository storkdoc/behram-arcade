/* Sporewood: centipede rules, trackball physics, rendering setup, controls (Mac + iPhone touch) and arcade regression.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/sporewood/tests/game.test.js   (env: CHROME, BASE) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/sporewood/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : extra); };
// page-side helpers: a quiet, empty board so each rule can be checked on its own
const PREP = `window.__prep = (w, seed) => { CEN.start(w || 1, seed || 7); CEN.freeze(); const G = CEN.G; let n = 0; while (G.phase !== 'play' && n++ < 200) CEN.step(1);
  G.mush.fill(0); G.pois.fill(0); G.spider = G.flea = G.scorp = null; G.spiderT = G.fleaT = G.scorpT = 1e9; G.C = Object.assign({}, G.C, { flea: 0, scorp: false }); G.chains = []; G.god = true; return G; };
  window.__ev = []; const _d = Sim.drain; Sim.drain = () => { const e = _d(); window.__ev.push(...e); return e; };`;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(url || URL); await p.waitForTimeout(700); if (!url || url.startsWith(URL)) await p.evaluate(PREP); return p;
  };
  const labels = p => p.evaluate(() => CEN.hits().map(h => h.label));
  const clickL = async (p, l, touch) => { const h = (await p.evaluate(() => CEN.hits())).find(h => h.label === l); if (!h) throw new Error('no button ' + l); if (touch) await p.touchscreen.tap(h.x, h.y); else await p.mouse.click(h.x, h.y); await p.waitForTimeout(120); };

  say('== DESKTOP (1440x900 @2x, Mac)');
  const D = await open({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await D.evaluate(() => localStorage.clear()); await D.reload(); await D.waitForTimeout(600); await D.evaluate(PREP);
  const t0 = await labels(D);
  check(['1 PLAYER GAME', 'TWO-PLAYER GAME (ONLINE)', 'JOIN TWO-PLAYER GAME IN PROGRESS', 'HIGH SCORES', 'HOW TO PLAY', 'OPTIONS'].every(l => t0.includes(l)) && !t0.some(l => /LOCAL|SAME/.test(l)), 'title menu (1P, online 2P, join in progress, scores, how-to, options; no local 2P)');
  const cvs = await D.evaluate(() => ({ w: CEN.render.cv.width, h: CEN.render.cv.height, dpr: CEN.render.R.dpr, filt: CEN.render.R.FILTER_OK, ss: CEN.render.R.ss }));
  check(cvs.w === 2880 && cvs.h === 1800, 'canvas renders at native Retina resolution (2880x1800 backing store)', cvs);
  const crisp = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw; let n = 0;
    Font.draw = function (ctx, s, x, y, dot, ...a) { n++; const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y, W, H]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r({ bad: bad.slice(0, 3), n }); })); }));
  check(crisp.n > 5 && crisp.bad.length === 0, 'all HUD/menu text is drawn on whole device pixels (no blur)', crisp);
  await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => CEN.screen) === 'select', 'Enter on 1 PLAYER GAME opens the starting-wave select');
  await D.keyboard.press('ArrowRight'); await D.keyboard.press('ArrowRight'); await D.waitForTimeout(100);
  await clickL(D, 'START WAVE 3');
  await D.waitForTimeout(200);
  const w3 = await D.evaluate(() => ({ w: CEN.G.wave, scr: CEN.screen, pal: CEN.render.R.pal, chains: CEN.G.chains.map(c => c.len) }));
  check(w3.scr === 'play' && w3.w === 3 && w3.pal === 2 && w3.chains[0] === 10 && w3.chains.length === 3, 'wave select: wave 3 starts with its own palette and a 10-segment centipede + 2 lone heads', w3);
  const crisp2 = await D.evaluate(() => new Promise(r => { const bad = []; const orig = Font.draw;
    Font.draw = function (ctx, s, x, y, dot, ...a) { const fr = ctx.fillRect; ctx.fillRect = function (X, Y, W, H) { if (X % 1 || Y % 1 || W % 1 || H % 1) bad.push([s, X, Y]); return fr.call(this, X, Y, W, H); }; try { return orig.call(this, ctx, s, x, y, dot, ...a); } finally { delete ctx.fillRect; } };
    requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = orig; r(bad.slice(0, 3)); })); }));
  check(crisp2.length === 0, 'in-game HUD text is pixel-crisp too', crisp2);

  say('-- trackball physics');
  const tb = await D.evaluate(() => {
    const T = CEN.track, dt = 1 / 60, r = {};
    const stroke = (kind, pxPerFrame, frames) => { T.stop(); let peak = 0; for (let i = 0; i < frames; i++) { T.feed(kind, pxPerFrame, 0); T.update(dt); peak = Math.max(peak, T.w.x); } return peak; };
    const release = (kind) => { T.src[kind].last = -1e9; };
    const coast = (secs) => { const out = []; for (let i = 0; i < secs * 60; i++) { T.update(dt); if (i % 15 === 14) out.push(+T.w.x.toFixed(3)); } return out; };
    r.slow = stroke('mouse', 3, 30); r.med = stroke('mouse', 8, 30); r.fast = stroke('mouse', 18, 30);
    release('mouse'); r.fastCoast = coast(2.5);
    r.slow2 = stroke('mouse', 3, 30); release('mouse'); r.slowCoast = coast(0.5);
    r.wheel = stroke('wheel', 12, 30); release('wheel'); r.wheelCoast = coast(0.5);
    T.stop(); for (let i = 0; i < 20; i++) { T.feed('mouse', 18, 0); T.update(dt); } const before = T.w.x; for (let i = 0; i < 6; i++) { T.feed('mouse', -18, 0); T.update(dt); } r.reverse = [before, T.w.x];
    T.stop(); r.vTop = T.TOP; return r;
  });
  check(tb.fast > tb.med * 1.6 && tb.med > tb.slow * 1.8, 'shooter speed scales with how fast you roll the ball (slow < medium < fast stroke)', { slow: tb.slow.toFixed(2), med: tb.med.toFixed(2), fast: tb.fast.toFixed(2) });
  check(tb.fastCoast[1] > 0.25 && tb.fastCoast[tb.fastCoast.length - 1] === 0, 'a hard flick keeps coasting after you let go, then friction stops it', tb.fastCoast);
  check(tb.slowCoast[1] === 0, 'a slow, careful nudge stops dead where you leave it (low-speed brake)', tb.slowCoast);
  check(tb.wheel > 0.3 && tb.wheelCoast[0] > 0, 'two-finger trackpad swipe (wheel) drives the same ball', { peak: tb.wheel.toFixed(2), coast: tb.wheelCoast });
  check(tb.reverse[1] < 0, 'stroking against a spinning ball brakes and reverses it fast (in ~0.1 s)', tb.reverse.map(v => +v.toFixed(2)));
  // real browser events: wheel and pointer-locked mouse movement through the live game loop
  await D.evaluate(() => { const G = __prep(1); CEN.G.player.x = 200; CEN.freeze(false); });
  for (let i = 0; i < 12; i++) { await D.mouse.wheel(40, 0); await D.waitForTimeout(16); }
  await D.waitForTimeout(60);
  const wh = await D.evaluate(() => ({ x: CEN.G.player.x, w: CEN.track.w.x }));
  check(wh.x < 190, 'real two-finger swipe events (wheel deltaX, natural scrolling) roll the shooter', wh);
  await D.evaluate(() => { CEN.track.stop(); CEN.G.player.x = 40; window.__testMouse = true; });
  await D.mouse.move(400, 500); await D.mouse.move(900, 500, { steps: 12 }); await D.waitForTimeout(40);
  const mm = await D.evaluate(() => ({ x: CEN.G.player.x, w: CEN.track.w.x }));
  await D.waitForTimeout(500); const mm2 = await D.evaluate(() => CEN.G.player.x);
  check(mm.x > 50 && mm.w > 0 && mm2 > mm.x + 5, 'mouse movement (movementX, as under Pointer Lock) rolls the shooter, which coasts on', { atRelease: mm, later: mm2 });
  await D.evaluate(() => { window.__testMouse = false; CEN.track.stop(); });
  // Pointer Lock request on click
  const lockReq = await D.evaluate(() => new Promise(r => { const cv = CEN.render.cv; const o = cv.requestPointerLock; let n = 0; cv.requestPointerLock = function () { n++; return o.apply(this, arguments); }; setTimeout(() => r(0), 50); window.__lockN = () => n; }));
  await D.mouse.click(720, 450); await D.waitForTimeout(150);
  const lk = await D.evaluate(() => ({ n: __lockN(), locked: CEN.track.st.locked }));
  check(lk.n >= 1, 'clicking the field grabs the trackball (requests Pointer Lock)', lk);
  // arrows with acceleration
  await D.evaluate(() => { __prep(1); CEN.G.player.x = 30; CEN.freeze(false); CEN.track.stop(); });
  await D.keyboard.down('ArrowRight'); await D.waitForTimeout(120); const k1 = await D.evaluate(() => CEN.track.w.x); await D.waitForTimeout(450); const k2 = await D.evaluate(() => CEN.track.w.x); await D.keyboard.up('ArrowRight');
  await D.waitForTimeout(400); const k3 = await D.evaluate(() => CEN.track.w.x);
  check(k1 > 0 && k2 > k1 * 1.25 && k3 < 0.05, 'arrow keys accelerate the shooter and it settles when released', [k1, k2, k3].map(v => +v.toFixed(2)));
  await D.evaluate(() => { CEN.freeze(); });
  const zone = await D.evaluate(() => { const G = __prep(1); for (let i = 0; i < 60; i++) { CEN.track.feed('mouse', 0, -40); CEN.track.update(1 / 60); CEN.step(1); } const top = G.player.y; CEN.track.stop(); return { top, zoneTop: Sim.ZONE * 8 + 4 }; });
  check(Math.abs(zone.top - zone.zoneTop) < 0.01, 'shooter is confined to the bottom zone', zone);
  const blk = await D.evaluate(() => { const G = __prep(1); G.player.x = 100; G.player.y = 236; Sim.place(14, 29); const T = CEN.track; T.stop(); for (let i = 0; i < 40; i++) { T.feed('mouse', 15, 0); T.update(1 / 60); CEN.step(1); } const r = { x: G.player.x, w: T.w.x }; T.stop(); return r; });
  check(blk.x < 116 - 3.6 - 3.3 + 0.01 && blk.x > 100 && blk.w < 0.3, 'mushrooms in the zone block the shooter and stop the ball', blk);
  // firing
  await D.evaluate(() => { __prep(1); }); 
  await D.keyboard.press('Space'); await D.evaluate(() => CEN.step(1));
  check(await D.evaluate(() => !!CEN.G.shot && CEN.G.shotsFired === 1), 'Space fires a shot');
  await D.keyboard.press('Space'); await D.evaluate(() => CEN.step(1));
  check(await D.evaluate(() => CEN.G.shotsFired === 1), 'single shot: one on screen at a time');
  await D.keyboard.down('Space'); const af = await D.evaluate(() => { const s0 = CEN.G.shotsFired; CEN.step(120); return CEN.G.shotsFired - s0; }); await D.keyboard.up('Space');
  check(af >= 4, 'holding Space auto-fires (rapid single shot re-fires as soon as the shot is gone)', af);
  await D.keyboard.press('KeyP'); check(await D.evaluate(() => CEN.app.paused), 'P pauses'); await D.keyboard.press('KeyP');
  const m0 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM'); const m1 = await D.evaluate(() => Sound.st.on); await D.keyboard.press('KeyM');
  check(m0 !== m1, 'M toggles mute');

  say('-- centipede: split, mushroom, speed, heads');
  const sp = await D.evaluate(() => {
    let G = __prep(1); const r = {}; G.chains = [Sim.mkChain(10, 0, 64, 1, 1, 'above')];
    CEN.step(100); const c = G.chains[0]; r.len0 = c.len; const [x, y] = Sim.segPos(c, 4); r.segY = y;
    const m0 = G.mush.reduce((a, v) => a + (v > 0), 0), s0 = G.score, n0 = Sim.segCount();
    G.player.x = x + 4 + c.dir * 1.5; G.shot = { x: x + 4 + c.dir * 1.5, y: y + 12 }; CEN.step(1);
    r.shotGone = !G.shot; r.chains = G.chains.map(c => c.len); r.dScore = G.score - s0; r.dMush = G.mush.reduce((a, v) => a + (v > 0), 0) - m0; r.dSeg = n0 - Sim.segCount();
    // the rear part grows its own head and keeps going
    const before = G.chains.map(c => Sim.segPos(c, 0).join(',')); CEN.step(30); r.bothMove = G.chains.every((c, i) => Sim.segPos(c, 0).join(',') !== before[i]);
    // shoot a head: 100
    const h = G.chains[0]; const [hx, hy] = Sim.segPos(h, 0); const s1 = G.score; G.shot = { x: hx + 4 + h.dir * 1.5, y: hy + 10 }; CEN.step(1); r.headPts = G.score - s1;
    // lone heads run faster than chain heads
    G = __prep(1); const A = Sim.mkChain(1, 0, 40, 1, 1), B = Sim.mkChain(8, 0, 120, 1, 1); G.chains = [A, B]; CEN.step(60);
    r.loneDx = Sim.segPos(A, 0)[0]; r.chainDx = Sim.segPos(B, 0)[0];
    // speed rises with the wave
    r.speed = [1, 4, 8, 12].map(w => Sim.cfg(w).speed);
    // new heads in the player zone once the centipede reached the bottom
    G = __prep(1); G.chains = [Sim.mkChain(4, 120, 29 * 8, 1, 1)]; let n = 0; while (!G.headGen && n++ < 400) CEN.step(1); r.headGen = G.headGen; r.headsBefore = G.chains.length;
    G.headT = 1; CEN.step(2); const nh = G.chains.find(c => c.fresh); r.newHeadRow = nh && Math.floor(Sim.segPos(nh, 0)[1] / 8);
    // heads that reach the bottom bounce back up but stay inside the player zone
    G = __prep(1); const Z = Sim.mkChain(1, 0, 25 * 8, 1, 1); G.chains = [Z]; let minR = 99, maxR = 0; for (let i = 0; i < 2400; i++) { CEN.step(1); if (!G.chains.includes(Z)) break; const yy = Sim.segPos(Z, 0)[1]; minR = Math.min(minR, yy / 8); maxR = Math.max(maxR, yy / 8); } r.zoneRows = [minR, maxR];
    return r;
  });
  check(sp.shotGone && sp.dSeg === 1 && sp.chains.length === 2 && sp.chains[0] + sp.chains[1] === 9 && sp.dScore === 10, 'shooting a body segment splits the centipede in two (10 pts)', sp);
  check(sp.dMush === 1, 'the destroyed segment leaves a mushroom behind', sp.dMush);
  check(sp.bothMove, 'both halves keep crawling independently (the rear half gets a new head)');
  check(sp.headPts === 100, 'heads are worth 100', sp.headPts);
  check(sp.loneDx > sp.chainDx * 1.25, 'lone heads move faster than a full chain', { lone: sp.loneDx, chain: sp.chainDx });
  check(sp.speed[0] < sp.speed[1] && sp.speed[1] < sp.speed[2] && sp.speed[3] <= 2.6, 'centipede speeds up with each wave', sp.speed);
  check(sp.headGen && sp.newHeadRow >= 25 && sp.newHeadRow <= 26, 'once it reaches the bottom, new heads spawn into the player zone', sp);
  check(sp.zoneRows[0] >= 24 && sp.zoneRows[1] <= 30, 'heads at the bottom wander up and down inside the player zone only', sp.zoneRows);

  say('-- mushrooms, fleas, spiders, scorpions, poison dive');
  const cr = await D.evaluate(() => {
    let G = __prep(2); const r = {};
    // mushrooms take 4 hits, 1 pt
    Sim.place(15, 10); const i = Sim.idx(15, 10); r.hp = []; const s0 = G.score;
    for (let k = 0; k < 4; k++) { G.shot = { x: 124, y: 100 }; CEN.step(3); r.hp.push(G.mush[i]); } r.mushPts = G.score - s0;
    // fleas: drop when the zone is bare, sow mushrooms, 2 hits (first hit speeds it up), 200 pts
    G = __prep(2); G.C.flea = Sim.cfg(2).flea; G.fleaT = 1; const m0 = G.mush.reduce((a, v) => a + (v > 0), 0); CEN.step(2); r.fleaSpawn = !!G.flea;
    let n = 0; while (G.flea && n++ < 300) CEN.step(1); r.fleaSowed = G.mush.reduce((a, v) => a + (v > 0), 0) - m0;
    G.C.flea = 0; Sim.spawnFlea(); G.flea.y = 80; G.flea.x = 60; const v0 = G.flea.vy; G.shot = { x: 60, y: 86 }; CEN.step(1); r.fleaHit = G.flea && G.flea.hp === 1 && G.flea.vy === v0 * 2;
    const s1 = G.score; G.shot = { x: G.flea.x, y: G.flea.y + 6 }; CEN.step(1); r.fleaPts = G.score - s1; r.fleaGone = !G.flea;
    // spider: confined to its band, eats mushrooms, scores 300/600/900 by distance
    G = __prep(3); for (let rr = 19; rr < 31; rr++) for (let c = 0; c < 30; c++) Sim.place(c, rr); const z0 = G.mush.reduce((a, v) => a + (v > 0), 0);
    let ymin = 999, ymax = 0, eaten = 0; for (let k = 0; k < 6; k++) { Sim.spawnSpider(); n = 0; while (G.spider && n++ < 900) { CEN.step(1); if (G.spider) { ymin = Math.min(ymin, G.spider.y); ymax = Math.max(ymax, G.spider.y); } } }
    r.spiderBand = [ymin, ymax]; r.spiderAte = z0 - G.mush.reduce((a, v) => a + (v > 0), 0);
    const spPts = (dy) => { __prep(3); Sim.spawnSpider(); const s = CEN.G.spider; s.x = 120; s.vx = 0; s.vy = 0; s.mode = 'hop'; s.modeT = 1e9; s.y = CEN.G.player.y - dy; const sc = CEN.G.score; CEN.G.shot = { x: 120, y: s.y + 3 }; CEN.step(1); return CEN.G.score - sc; };
    r.spiderPts = [spPts(8), spPts(24), spPts(60)];
    // scorpion poisons mushrooms it crosses (from wave 3), 1000 pts
    G = __prep(3); for (let c = 0; c < 30; c += 2) Sim.place(c, 8); Sim.spawnScorp(); const s = G.scorp; s.x = -12; s.dir = 1; s.y = 8 * 8 + 4; n = 0; while (G.scorp && n++ < 600) CEN.step(1);
    let pz = 0; for (let c = 0; c < 30; c++) pz += G.pois[Sim.idx(c, 8)]; r.poisoned = pz;
    Sim.spawnScorp(); G.scorp.x = 100; G.scorp.y = 60; const s2 = G.score; G.shot = { x: 100, y: 64 }; CEN.step(1); r.scorpPts = G.score - s2;
    r.scorpWave = [Sim.cfg(2).scorp, Sim.cfg(3).scorp];
    // poisoned mushroom: the head plunges straight down to the bottom
    G = __prep(3); Sim.place(20, 5); G.pois[Sim.idx(20, 5)] = 1; const ch = Sim.mkChain(5, 64, 40, 1, 1, 'above'); G.chains = [ch]; window.__ev.length = 0;
    const xs = new Set(); let dived = false, ymaxd = 0; n = 0;
    while (n++ < 800) { CEN.step(1); if (!dived && window.__ev.some(e => e.t === 'dive')) dived = true; if (dived) { const [hx, hy] = Sim.segPos(ch, 0); if (hy >= 30 * 8) break; xs.add(hx); ymaxd = hy; } }
    r.dive = { dived, xs: [...xs], reachedBottom: Sim.segPos(ch, 0)[1] >= 30 * 8 };
    return r;
  });
  check(cr.hp.join() === '3,2,1,0' && cr.mushPts === 1, 'mushrooms take 4 hits (1 point when destroyed)', cr);
  check(cr.fleaSpawn && cr.fleaSowed > 0, 'fleas drop when the zone runs low on mushrooms and sow new ones on the way down', cr.fleaSowed);
  check(cr.fleaHit && cr.fleaPts === 200 && cr.fleaGone, 'fleas take 2 hits: the first makes them fall faster, the second scores 200');
  check(cr.spiderBand[0] >= 19 * 8 + 4 && cr.spiderBand[1] <= 244.01, 'the spider bounces inside the lower band only', cr.spiderBand);
  check(cr.spiderAte > 0, 'the spider eats mushrooms in the zone', cr.spiderAte);
  check(cr.spiderPts.join() === '900,600,300', 'spider points 900 / 600 / 300 by how close it is', cr.spiderPts);
  check(cr.poisoned >= 12 && cr.scorpPts === 1000 && !cr.scorpWave[0] && cr.scorpWave[1], 'scorpions (wave 3+) poison every mushroom they cross; 1000 pts', cr);
  check(cr.dive.dived && cr.dive.xs.length === 1 && cr.dive.reachedBottom, 'a centipede touching a poisoned mushroom dives straight down to the bottom', cr.dive);

  say('-- scoring, death, restore, waves, extra life, high scores');
  const sc = await D.evaluate(() => {
    let G = __prep(1); const r = {};
    // extra life every 12,000 (default)
    G.score = 11999; const l0 = G.lives; CEN.step(1); r.extra0 = G.lives - l0; G.score = 12000; CEN.step(1); r.extra1 = G.lives - l0;
    // death restores damaged and poisoned mushrooms for 5 each
    G = __prep(1); G.god = false; for (let c = 2; c < 8; c++) { Sim.place(c, 6); G.mush[Sim.idx(c, 6)] = 2; } Sim.place(10, 6); G.pois[Sim.idx(10, 6)] = 1; G.chains = [Sim.mkChain(3, 0, 40, 1, 1)];
    const lv = G.lives; Sim.spawnSpider(); G.spider.x = G.player.x; G.spider.y = G.player.y; G.spider.vx = 0; G.spider.vy = 0; const s0 = G.score;
    CEN.step(1); r.dyingPh = G.phase; let n = 0; while (G.phase !== 'ready' && n++ < 400) CEN.step(1);
    r.lives = lv - G.lives; r.restorePts = G.score - s0; let ok = true; for (let c = 2; c < 8; c++) ok = ok && G.mush[Sim.idx(c, 6)] === 4; r.restored = ok && !G.pois[Sim.idx(10, 6)];
    // clearing the wave: next wave, new palette, more heads, faster
    G = __prep(1); G.chains = []; CEN.step(1); r.clearPh = G.phase; n = 0; while (G.wave === 1 && n++ < 200) CEN.step(1); r.wave = G.wave; r.chains2 = G.chains.map(c => c.len); r.speed2 = G.speed;
    return r;
  });
  check(sc.extra0 === 0 && sc.extra1 === 1, 'extra shooter at 12,000 points', sc);
  check(sc.dyingPh === 'dying' && sc.lives === 1 && sc.restored && sc.restorePts === 35, 'losing a life restores damaged/poisoned mushrooms at 5 points each', sc);
  check(sc.clearPh === 'clear' && sc.wave === 2 && sc.chains2.join() === '11,1' && sc.speed2 > 1.5, 'clearing a wave starts the next: 11-segment centipede + 1 extra head, faster', sc);
  await D.evaluate(() => CEN.freeze(false)); await D.waitForTimeout(250);
  const pal = await D.evaluate(() => CEN.render.R.pal);
  check(pal === 1, 'each wave gets a new forest palette', pal);
  const go = await D.evaluate(() => { const G = __prep(1); G.god = false; G.lives = 1; G.score = 4321; Sim.spawnSpider(); G.spider.x = G.player.x; G.spider.y = G.player.y; G.spider.vx = G.spider.vy = 0; let n = 0; while (G.phase !== 'over' && n++ < 600) CEN.step(1); return G.phase; });
  check(go === 'over', 'game over after the last shooter', go);
  await D.evaluate(() => CEN.freeze(false)); await D.waitForTimeout(2900); await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  check(await D.evaluate(() => CEN.screen) === 'initials', 'a top-10 score asks for initials');
  for (const k of ['KeyB', 'KeyH', 'KeyR']) await D.keyboard.press(k); await D.keyboard.press('Enter'); await D.waitForTimeout(150);
  await D.reload(); await D.waitForTimeout(500);
  const hi = await D.evaluate(() => CEN.hi().find(h => h.n === 'BHR')); check(hi && hi.s === 4321, 'high score table persists in localStorage', hi);
  // audio graph builds and plays without errors
  const au = await D.evaluate(async () => { Sound.unlock && Sound.unlock(); for (const n of ['beat', 'shoot', 'mushHit', 'seg', 'fleaKill', 'spiderKill', 'poison', 'dive', 'die', 'restore', 'extra', 'clear']) Sound.play(n, 1); Sound.loop('spider', true); Sound.loop('flea', true); await new Promise(r => setTimeout(r, 300)); Sound.allLoops(false); return true; });
  check(au, 'Web Audio: beat, shots, spider/flea loops and effects play without errors');
  check(D.errs.length === 0, 'desktop: no console errors', D.errs);

  say('== iPHONE 13 PORTRAIT (touch)');
  const P = await open({ ...devices['iPhone 13'] });
  const pc = await P.evaluate(() => ({ touch: CEN.app.touch, c: CEN.controls(), f: CEN.field(), dpr: CEN.render.R.dpr, w: CEN.render.cv.width, ss: CEN.render.R.ss }));
  check(pc.touch && pc.dpr === 3 && pc.w === 390 * 3, 'touch UI on, canvas at native 3x', { dpr: pc.dpr, w: pc.w, ss: pc.ss });
  const fb = pc.f.y + pc.f.h;
  check(pc.c.fire.y - pc.c.fire.r >= fb - 1 && pc.c.ball.y - pc.c.ball.r >= fb - 1 && pc.c.fire.y + pc.c.fire.r <= 844, 'portrait: trackball pad + FIRE sit below the playfield, on screen', { fb, fire: pc.c.fire, ball: pc.c.ball });
  await clickL(P, '1 PLAYER GAME', true); await clickL(P, 'START WAVE 1', true);
  check(await P.evaluate(() => CEN.screen) === 'play', 'tap 1 PLAYER GAME -> START WAVE 1 starts play');
  const cdp = await P.context().newCDPSession(P);
  const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await P.evaluate(() => { __prep(1); });
  await P.touchscreen.tap(pc.c.fire.x, pc.c.fire.y); await P.evaluate(() => CEN.step(1));
  check(await P.evaluate(() => CEN.G.shotsFired) === 1, 'tapping FIRE shoots');
  await tp('touchStart', [{ x: pc.c.fire.x, y: pc.c.fire.y, id: 2 }]); await P.waitForTimeout(60);
  const sf = await P.evaluate(() => { const s0 = CEN.G.shotsFired; CEN.step(120); return CEN.G.shotsFired - s0; }); await tp('touchEnd', []); await P.waitForTimeout(40);
  check(sf >= 4, 'holding FIRE auto-fires', sf);
  // fast flick on the field: shooter follows, then glides on after the finger lifts
  const flick = async (p, x0, y0, dx, n, ms) => { await tp('touchStart', [{ x: x0, y: y0, id: 1 }]); for (let i = 1; i <= n; i++) { await tp('touchMove', [{ x: x0 + dx * i, y: y0, id: 1 }]); await p.waitForTimeout(ms); } const a = await p.evaluate(() => ({ x: CEN.G.player.x, w: CEN.track.w.x })); await tp('touchEnd', []); await p.waitForTimeout(350); const bb = await p.evaluate(() => CEN.G.player.x); return { atLift: a, later: bb }; };
  await P.evaluate(() => { const G = __prep(1); G.player.x = 20; CEN.freeze(false); });
  const fl = await flick(P, 60, 300, 14, 8, 16);
  check(fl.atLift.x > 40 && fl.later > fl.atLift.x + 8, 'drag anywhere moves the shooter; a quick flick keeps it gliding after lift-off', fl);
  await P.evaluate(() => { const G = __prep(1); G.player.x = 60; CEN.track.stop(); CEN.freeze(false); });
  const sl = await flick(P, 100, 300, 2, 10, 30);
  check(sl.atLift.x > 61 && Math.abs(sl.later - sl.atLift.x) < 3, 'a slow drag places the shooter precisely and it stays put on lift', sl);
  await P.evaluate(() => { const G = __prep(1); G.player.x = 120; CEN.track.stop(); CEN.freeze(false); });
  // drag on the trackball pad itself (left of FIRE) while holding FIRE with a second finger
  await tp('touchStart', [{ x: pc.c.ball.x, y: pc.c.ball.y, id: 1 }, { x: pc.c.fire.x, y: pc.c.fire.y, id: 2 }]);
  for (let i = 1; i <= 6; i++) { await tp('touchMove', [{ x: pc.c.ball.x - 10 * i, y: pc.c.ball.y, id: 1 }, { x: pc.c.fire.x, y: pc.c.fire.y, id: 2 }]); await P.waitForTimeout(16); }
  const mt = await P.evaluate(() => ({ x: CEN.G.player.x, fire: CEN.touchFire, shots: CEN.G.shotsFired }));
  await tp('touchEnd', []);
  check(mt.x < 115 && mt.fire && mt.shots > 0, 'multi-touch: roll with one thumb while holding FIRE with the other', mt);
  await P.evaluate(() => CEN.freeze()); const a0 = await P.evaluate(() => CEN.app.opts.auto); await P.touchscreen.tap(pc.c.auto.x, pc.c.auto.y); const a1 = await P.evaluate(() => CEN.app.opts.auto);
  check(a0 !== a1, 'AUTO button toggles auto-fire', [a0, a1]);
  await P.evaluate(() => { CEN.app.opts.auto = true; CEN.freeze(false); });
  await P.touchscreen.tap(pc.c.pause.x, pc.c.pause.y); await P.waitForTimeout(150);
  check(await P.evaluate(() => CEN.app.paused), 'pause button works on touch');
  check(P.errs.length === 0, 'iPhone portrait: no console errors', P.errs);

  say('== iPHONE 13 LANDSCAPE');
  const LS = await open({ ...devices['iPhone 13 landscape'] });
  await LS.evaluate(() => { CEN.start(1); }); await LS.waitForTimeout(200);
  const lc = await LS.evaluate(() => ({ c: CEN.controls(), f: CEN.field(), cw: innerWidth, ch: innerHeight }));
  check(lc.c.fire.x - lc.c.fire.r >= lc.f.x + lc.f.w - 1 && lc.c.ball.x + lc.c.ball.r <= lc.f.x + 1 && lc.c.fire.x + lc.c.fire.r <= lc.cw && lc.c.fire.y + lc.c.fire.r <= lc.ch && lc.c.ball.y + lc.c.ball.r <= lc.ch, 'landscape: trackball pad left, FIRE right, beside the playfield and on screen', lc);
  await LS.evaluate(() => { __prep(1); });
  await LS.touchscreen.tap(lc.c.fire.x, lc.c.fire.y); await LS.evaluate(() => CEN.step(1));
  check(await LS.evaluate(() => CEN.G.shotsFired) === 1, 'landscape FIRE works');
  const cdp2 = await LS.context().newCDPSession(LS);
  await LS.evaluate(() => { const G = __prep(1); G.player.x = 30; CEN.freeze(false); });
  const fx = lc.f.x + lc.f.w * 0.3, fy = lc.f.y + lc.f.h * 0.6;
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fx, y: fy, id: 1 }] });
  for (let i = 1; i <= 8; i++) { await cdp2.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fx + 12 * i, y: fy, id: 1 }] }); await LS.waitForTimeout(16); }
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await LS.waitForTimeout(200);
  check(await LS.evaluate(() => CEN.G.player.x) > 50, 'landscape: drag on the field rolls the shooter');
  check(LS.errs.length === 0, 'iPhone landscape: no console errors', LS.errs);

  say('== RENDER FALLBACKS');
  const NF = await open({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 }, URL + '?nofilter');
  await NF.evaluate(() => { window.__noAdapt = true; CEN.start(1); }); await NF.waitForTimeout(500);
  const nf = await NF.evaluate(() => ({ f: CEN.render.R.FILTER_OK, ss: CEN.render.R.ss, w: CEN.render.cv.width }));
  check(!nf.f && nf.ss === 2 && nf.w === 2000, 'Safari-style blur fallback runs; 1x screens get clean 2:1 supersampling', nf);
  check(NF.errs.length === 0, 'fallback: no console errors', NF.errs);
  const AQ = await open({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 1 });
  await AQ.evaluate(() => { CEN.start(1); CEN.render.R.ss = 2; }); await AQ.waitForTimeout(4500);
  const aq = await AQ.evaluate(() => ({ ss: CEN.render.R.ss, w: CEN.render.cv.width, dpr: CEN.render.R.dpr, fps: Math.round(CEN.render.R.fps) }));
  check(aq.w >= 1000 * aq.dpr, 'adaptive quality never drops below native resolution', aq);
  await AQ.context().close();

  say('== ARCADE REGRESSION');
  const paths = ['', 'games/sporewood/', 'games/star-invaders/', 'games/tube-shooter/', 'games/atari-football/', 'games/trackball-football/'];
  const lp = await open({ viewport: { width: 1280, height: 800 } }, BASE);
  const cards = await lp.evaluate(() => (window.ARCADE_GAMES || []).map(g => g.slug)); await lp.context().close();
  for (const s of cards) if (!paths.includes('games/' + s + '/')) paths.push('games/' + s + '/');
  for (const path of paths) {
    const p = await open({ viewport: { width: 1280, height: 800 } }, BASE + path); const t = await p.title();
    if (!path) check(cards[0] === 'sporewood' && ['star-invaders', 'tube-shooter', 'atari-football', 'trackball-football'].every(s => cards.includes(s)), 'landing page lists Sporewood first plus all earlier games', cards.join(','));
    check(p.errs.length === 0, 'loads without console errors: /' + path + ' (' + t + ')', p.errs);
    await p.context().close();
  }
  say(fails ? '\n' + fails + ' FAIL' : '\nALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
