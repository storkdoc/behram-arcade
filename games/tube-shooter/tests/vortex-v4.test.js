// VORTEX v4 test: Superzapper FX, analog rim movement (keyboard / mouse / touch rim drag / fire pad / smart auto-fire),
// the four new enemies (phaser, warden, spark, mine layer + mines) and the error banner.
// Desktop 1280x800 + iPhone 14 portrait/landscape (CDP touch events). Run from the repo root:
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-v4.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const SHOTS = process.argv[3] || '';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = BASE + '/games/tube-shooter/?debug=1';

async function watch(page) {
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  return errs;
}
async function toPlay(page, L = 1) {
  await page.evaluate(L => { window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(L); VORTEX.setInvincible(true); }, L);
  await page.evaluate(() => VORTEX.step(4, () => VORTEX.state.state === 'play'));
  await page.evaluate(() => VORTEX.emptyField());
}

async function desktop(browser) {
  console.log('\n=== desktop 1280x800 ===');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); const errs = await watch(page);
  await page.goto(URL_, { waitUntil: 'load' }); await sleep(600);
  check(!!(await page.evaluate(() => window.VORTEX)), 'game loaded');
  check((await page.evaluate(() => VORTEX.state.touch)) === false, 'no touch controls on desktop');
  // attract: enemy guide page renders
  await page.evaluate(() => VORTEX.attractMode(2)); await sleep(300);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/d-01-guide.png' });
  await toPlay(page);
  let s = await page.evaluate(() => VORTEX.state);
  check(s.state === 'play', 'playing (' + s.state + ')');

  // keyboard: tap = one third of a lane; hold = smooth, monotonic, no skips
  await page.evaluate(() => VORTEX.setLane(5, 0));
  const tap = await page.evaluate(() => { const p0 = VORTEX.state.pos; VORTEX.key('ArrowRight', true); VORTEX.step(0.05); VORTEX.key('ArrowRight', false); VORTEX.step(0.3); return VORTEX.state.pos - p0; });
  check(Math.abs(tap + 1 / 3) < 0.02, `→ tap moves exactly 1/3 lane clockwise (${tap.toFixed(3)})`);
  const hold = await page.evaluate(() => {
    const ps = [VORTEX.state.pos]; VORTEX.key('ArrowLeft', true);
    for (let i = 0; i < 120; i++) { VORTEX.step(1 / 120); ps.push(VORTEX.state.pos); }
    VORTEX.key('ArrowLeft', false); for (let i = 0; i < 48; i++) { VORTEX.step(1 / 120); ps.push(VORTEX.state.pos); }
    let maxD = 0, back = 0; for (let i = 1; i < ps.length; i++) { const d = ps[i] - ps[i - 1]; maxD = Math.max(maxD, Math.abs(d)); if (d < -1e-6) back++; }
    const end = ps[ps.length - 1], frac = ((end * 3 - 0.5) % 1 + 1) % 1;
    return { total: end - ps[0], maxD, back, frac };
  });
  check(hold.total > 4 && hold.back === 0 && hold.maxD < 0.16, `← held 1 s: ${hold.total.toFixed(2)} lanes, monotonic (${hold.back} reversals), max ${hold.maxD.toFixed(3)} lane / 8 ms tick`);
  check(hold.frac < 0.02 || hold.frac > 0.98, `release glides to a third-of-lane stop (frac ${hold.frac.toFixed(3)})`);

  // mouse: claw tracks the pointer around the rim; left = fire; right = superzapper
  const tgt = await page.evaluate(() => { const l = (VORTEX.state.lane + 5) % 16; return { l, p: VORTEX.rimPoint(l + 0.5) }; });
  await page.mouse.move(tgt.p.x + 2, tgt.p.y + 2, { steps: 6 });
  await page.evaluate(() => VORTEX.step(0.25));
  s = await page.evaluate(() => VORTEX.state);
  check(s.lane === tgt.l, `mouse at lane ${tgt.l} rim -> claw in lane ${s.lane}`);
  const f0 = await page.evaluate(() => VORTEX.shotsFired());
  await page.mouse.down(); await page.evaluate(() => VORTEX.step(0.3)); await page.mouse.up();
  check((await page.evaluate(() => VORTEX.shotsFired())) - f0 >= 3, 'left mouse button fires');

  // smart autofire: off-target = no shots, enemy in lane = shots
  await page.evaluate(() => { VORTEX.emptyField(); VORTEX.setAuto(true); });
  let n0 = await page.evaluate(() => { const a = VORTEX.shotsFired(); VORTEX.step(0.5); return VORTEX.shotsFired() - a; });
  const n1 = await page.evaluate(() => { VORTEX.spawn('tanker', VORTEX.state.lane, 0.9); const a = VORTEX.shotsFired(); VORTEX.step(0.5); return VORTEX.shotsFired() - a; });
  check(n0 === 0 && n1 >= 1, `smart auto-fire: ${n0} shots at an empty tube, ${n1} at a tanker in lane`);
  await page.evaluate(() => { VORTEX.setAuto(false); VORTEX.emptyField(); });

  // pool: new enemy types are introduced across the waves
  const pc = await page.evaluate(() => [1, 4, 5, 7, 8, 16].map(L => VORTEX.poolCounts(L)));
  check(pc[0].phasers === 0 && pc[1].phasers >= 1 && pc[1].wardens === 0 && pc[2].wardens >= 1 && pc[3].sparks >= 1 && pc[3].layers === 0 && pc[4].layers >= 1 && pc[5].flippers >= 4,
    'waves introduce PHASER L4, WARDEN L5, SPARK L7, MINE LAYER L8: ' + pc.map(c => `${c.phasers}/${c.wardens}/${c.sparks}/${c.layers}`).join(' '));

  // PHASER: blinks 2-3 lanes, invulnerable while phased
  const ph = await page.evaluate(() => {
    VORTEX.setLane(0, 0); const id = VORTEX.spawn('phaser', 8, 0.95); let jumps = [], last = 8, phased = 0;
    for (let i = 0; i < 360; i++) { VORTEX.step(1 / 120); const e = VORTEX.enemy(id); if (!e) break; if (e.ph) phased++; if (e.lane !== last) { jumps.push(Math.min((e.lane - last + 16) % 16, (last - e.lane + 16) % 16)); last = e.lane; } }
    return { jumps, phased };
  });
  check(ph.jumps.some(j => j >= 2) && ph.phased > 20, `phaser blinks lanes (jumps ${ph.jumps.join(',')}; phased ${ph.phased} ticks)`);
  const phInv = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(3, 0); const id = VORTEX.spawn('phaser', 3, 0.5);
    VORTEX.setEnemy(id, { ph: 'gone', phT: 0, goneDur: 1, tgt: 3 }); VORTEX.key('Space', true); VORTEX.step(0.5); VORTEX.key('Space', false);
    return !!VORTEX.enemy(id);
  });
  check(phInv, 'phased-out phaser is not hit by shots');

  // WARDEN: shield absorbs 3 shots; vulnerable while venting
  const wd = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(6, 0); const id = VORTEX.spawn('warden', 6, 0.8); VORTEX.setEnemy(id, { ventCd: 99 });
    const fire = n => { for (let i = 0; i < n; i++) { VORTEX.key('Space', true); VORTEX.step(0.03); VORTEX.key('Space', false); VORTEX.step(0.17); VORTEX.setEnemy(id, { flipping: false, ft: 0, lane: 6 }); } };
    fire(2); VORTEX.step(0.5); const after2 = VORTEX.enemy(id);
    fire(1); VORTEX.step(0.5); const after3 = VORTEX.enemy(id);
    fire(2); VORTEX.step(0.5); const after5 = VORTEX.enemy(id);
    const id2 = VORTEX.spawn('warden', 6, 0.7); VORTEX.setEnemy(id2, { vent: 0.9, ventCd: 99 }); VORTEX.key('Space', true); VORTEX.step(0.45); VORTEX.key('Space', false);
    return { s2: after2 && after2.shield, s3: after3 ? after3.shield : 'dead', dead5: !after5, vented: !VORTEX.enemy(id2) };
  });
  check(wd.s2 === 1 && wd.s3 === 0 && wd.dead5, `warden shield 3 -> 1 after 2 shots, broken after 3 (${wd.s3}), then killable (${wd.dead5})`);
  check(wd.vented, 'venting warden (shield open) dies to one shot');

  // SPARK: homes toward the claw and detonates on the rim, chain-killing rim enemies next to it
  const sk = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(2, 0); const id = VORTEX.spawn('spark', 9, 1); let minD = 99;
    for (let i = 0; i < 400; i++) { VORTEX.step(1 / 120); const e = VORTEX.enemy(id); if (!e) break; const d = Math.min((e.lane - 2 + 16) % 16, (2 - e.lane + 16) % 16); if (e.z < 0.3) minD = Math.min(minD, d); }
    return { minD, state: VORTEX.state.state, death: VORTEX.deathKind() };
  });
  check(sk.minD <= 1, `spark homes in (lane distance near the rim ${sk.minD})`);
  const chain = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(12, 0); const sc = VORTEX.state.score;
    const f = VORTEX.spawn('flipper', 4, 0); VORTEX.setEnemy(f, { pause: 99 });
    const id = VORTEX.spawn('spark', 3, 0.02); VORTEX.setEnemy(id, { x: 3.5, vx: 0 }); VORTEX.step(0.2);
    return { flipperGone: !VORTEX.enemy(f), gain: VORTEX.state.score - sc };
  });
  check(chain.flipperGone && chain.gain >= 250, `spark rim blast chain-kills a neighbouring rim flipper (+${chain.gain})`);

  // MINE LAYER: drops mines; armed rim mines wall off lanes for the claw
  const ml = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(0, 0); const id = VORTEX.spawn('layer', 8, 0.8); let maxM = 0;
    for (let i = 0; i < 120 * 8; i++) { VORTEX.step(1 / 120); maxM = Math.max(maxM, VORTEX.state.mines); }
    return { maxM, armed: VORTEX.state.armed };
  });
  check(ml.maxM >= 2, `mine layer seeds mines (${ml.maxM} live at once, ${ml.armed} armed)`);
  const wall = await page.evaluate(() => {
    VORTEX.emptyField(); VORTEX.setLane(5, 0); VORTEX.addMine(4, 0, true);   // armed mine in lane 4 (clockwise neighbour)
    VORTEX.key('ArrowRight', true); VORTEX.step(0.8); VORTEX.key('ArrowRight', false); VORTEX.step(0.3);
    const blocked = VORTEX.state.lane; VORTEX.key('ArrowLeft', true); VORTEX.step(0.3); VORTEX.key('ArrowLeft', false); VORTEX.step(0.3);
    return { blocked, after: VORTEX.state.lane, pos: VORTEX.state.pos };
  });
  check(wall.blocked === 5 && wall.after !== 4, `armed rim mine walls off lane 4 (claw stays in ${wall.blocked}, can still go the other way -> ${wall.after})`);
  const shootMine = await page.evaluate(() => { VORTEX.emptyField(); const m0 = VORTEX.state.mines; VORTEX.addMine(VORTEX.state.lane, 0.6, false); VORTEX.key('Space', true); VORTEX.step(0.5); VORTEX.key('Space', false); return VORTEX.state.mines; });
  check(shootMine === 0, `a drifting mine can be shot (${shootMine} left)`);

  // SUPERZAPPER: kills everything, clears mines, spawns shards + full-screen FX, no errors while rendering
  await page.evaluate(() => { VORTEX.emptyField(); for (let i = 0; i < 10; i++) VORTEX.spawn(['flipper', 'tanker', 'warden', 'phaser', 'spark'][i % 5], (i * 3) % 16, 0.3 + i * 0.06); VORTEX.addMine(2, 0.5, false); });
  await page.evaluate(() => { VORTEX.freeze(false); window.__maxShards = 0; window.__zfxSeen = false; const f = () => { const s = VORTEX.state; __maxShards = Math.max(__maxShards, s.shards); __zfxSeen = __zfxSeen || s.zfx; if (s.zfx || s.shards) requestAnimationFrame(f); }; VORTEX.superzap(); requestAnimationFrame(f); });
  await sleep(120); if (SHOTS) await page.screenshot({ path: SHOTS + '/d-02-zap.png' });
  await sleep(250); if (SHOTS) await page.screenshot({ path: SHOTS + '/d-03-zap.png' });
  await sleep(1500);
  const zs = await page.evaluate(() => ({ m: __maxShards, z: __zfxSeen }));
  check(zs.z && zs.m > 60, `superzap FX ran (peak ${zs.m} disintegration shards)`);
  s = await page.evaluate(() => VORTEX.state);
  check(s.zapUses === 1 && s.enemies === 0 && s.mines <= 1, `superzapper cleared the tube (enemies ${s.enemies}, mines ${s.mines})`);
  // frame rate while zapping (headless, software rendering: generous floor)
  const fps = await page.evaluate(async () => { for (let i = 0; i < 12; i++) VORTEX.spawn('flipper', i, 0.5); VORTEX.state; window.VORTEX_superzap2 = 1; const t0 = performance.now(); let n = 0; await new Promise(r => { const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); return n; });
  check(fps > 5, `renders during play (${fps} frames/s headless)`);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

  // error banner
  await page.evaluate(() => setTimeout(() => { throw new Error('test boom'); }, 0)); await sleep(200);
  const eb = await page.evaluate(() => { const e = document.getElementById('errbar'); return e ? { txt: e.textContent, vis: e.getBoundingClientRect().width > 0 } : null; });
  check(eb && eb.vis && /RELOAD/.test(eb.txt) && /test boom/.test(eb.txt), 'uncaught error shows the banner with RELOAD');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/d-04-errbar.png' });
  await ctx.close();
}

async function phone(browser, name, device) {
  console.log(`\n=== ${name} (${device.viewport.width}x${device.viewport.height}) ===`);
  const ctx = await browser.newContext({ ...device, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = await watch(page);
  const cdp = await ctx.newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id, radiusX: 4, radiusY: 4, force: 1 })) });
  const center = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom } : null; }, sel);
  await page.goto(URL_, { waitUntil: 'load' }); await sleep(700);
  await toPlay(page);
  await page.evaluate(() => { VORTEX.freeze(false); VORTEX.emptyField(); }); await sleep(250);
  let s = await page.evaluate(() => VORTEX.state);
  check(s.touch && s.state === 'play', 'touch controls on, playing');
  const vis = await page.evaluate(() => ['trim', 'tfz', 'tauto', 'tfire', 'tzap'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return id + ':' + (r.width > 0); }).join(' '));
  check(!/false/.test(vis), 'rim zone, fire pad, AUTO, FIRE and ZAP visible in game (' + vis + ')');
  // tube must stay clear of the round thumb controls
  const ov = await page.evaluate(() => { const b = VORTEX.webBounds(), out = []; for (const id of ['tknob', 'tfire', 'tzap', 'tauto', 'tpause', 'tmute', 'tmode']) { const r = document.getElementById(id).getBoundingClientRect(); if (r.width && r.left < b.x1 && r.right > b.x0 && r.top < b.y1 && r.bottom > b.y0) out.push(id); } return out; });
  check(ov.length === 0, 'tube clear of controls' + (ov.length ? ': ' + ov : ''));

  // rim drag: slide a finger 3 lanes along the rim (relative tracking with ~1.15 gain), sampled for monotonic motion
  const lane0 = s.lane;
  const pts = await page.evaluate(l => { const a = []; for (let i = 0; i <= 24; i++) a.push(VORTEX.rimPoint(l + 0.5 + 3 * i / 24)); return a; }, lane0);
  const inset = await page.evaluate(() => VORTEX.rimCenter());
  const P = p => ({ x: p.x + (inset.x - p.x) * 0.08, y: p.y + (inset.y - p.y) * 0.08 });   // just inside the rim
  const p0 = await page.evaluate(() => VORTEX.state.pos);
  await T('touchStart', [{ ...P(pts[0]), id: 1 }]);
  const trace = [];
  for (let i = 1; i < pts.length; i++) { await T('touchMove', [{ ...P(pts[i]), id: 1 }]); await sleep(16); trace.push(await page.evaluate(() => VORTEX.state.aim)); }
  await T('touchEnd', []); await sleep(200);
  const p1 = await page.evaluate(() => VORTEX.state.pos);
  let rev = 0; for (let i = 1; i < trace.length; i++) if (trace[i] < trace[i - 1] - 1e-6) rev++;
  check(p1 - p0 > 2.6 && p1 - p0 < 4.3 && rev === 0, `3-lane rim drag moves the claw ${(p1 - p0).toFixed(2)} lanes, smoothly (${rev} reversals)`);
  // drag back the other way along the rim
  const q0 = p1;
  await T('touchStart', [{ ...P(pts[24]), id: 1 }]);
  for (let i = 23; i >= 12; i--) { await T('touchMove', [{ ...P(pts[i]), id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(200);
  const q1 = await page.evaluate(() => VORTEX.state.pos);
  check(q1 - q0 < -1.2, `reverse drag moves back ${(q1 - q0).toFixed(2)} lanes`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-rim.png` });

  // fire pad (big zone around FIRE) and AUTO toggle
  const fz = await center('#tfz');
  const fp = { x: fz.l + 12, y: fz.b - 12 };
  await T('touchStart', [{ ...fp, id: 3 }]); await sleep(120);
  const firing = (await page.evaluate(() => VORTEX.state)).fire;
  await T('touchEnd', []); await sleep(80);
  check(firing && (await page.evaluate(() => VORTEX.state)).fire === false, 'holding the fire pad fires; release stops');
  const a0 = (await page.evaluate(() => VORTEX.state)).auto;
  const au = await center('#tauto'); await T('touchStart', [{ x: au.x, y: au.y, id: 4 }]); await sleep(40); await T('touchEnd', []); await sleep(80);
  check((await page.evaluate(() => VORTEX.state)).auto === !a0, `AUTO button toggles smart auto-fire (${a0} -> ${!a0})`);
  // knob still works (relative analog spin)
  const kn = await center('#tknob');
  const k0 = await page.evaluate(() => VORTEX.state.pos);
  await T('touchStart', [{ x: kn.x - 40, y: kn.y, id: 1 }]);
  for (let i = 1; i <= 10; i++) { await T('touchMove', [{ x: kn.x - 40 + i * 8, y: kn.y, id: 1 }]); await sleep(16); }
  await T('touchEnd', []); await sleep(200);
  const stepPx = await page.evaluate(() => VORTEX.touchStepPx()), k1 = await page.evaluate(() => VORTEX.state.pos);
  check(Math.abs((k0 - k1) - 80 / stepPx / 3) < 0.4, `knob: 80 px drag = ${(k0 - k1).toFixed(2)} lanes clockwise (expect ${(80 / stepPx / 3).toFixed(2)})`);
  // zap via ZAP button on a phone (FX must not error)
  await page.evaluate(() => { for (let i = 0; i < 8; i++) VORTEX.spawn('flipper', i * 2, 0.5); });
  const zb = await center('#tzap'); await T('touchStart', [{ x: zb.x, y: zb.y, id: 5 }]); await sleep(40); await T('touchEnd', []);
  await sleep(150); if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-zap.png` });
  await sleep(1200);
  check((await page.evaluate(() => VORTEX.state)).enemies === 0, 'ZAP clears the tube on the phone');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await desktop(browser);
    await phone(browser, 'iphone14', devices['iPhone 14']);
    await phone(browser, 'iphone14-land', devices['iPhone 14 landscape']);
  } catch (e) { console.log('FAIL exception: ' + (e.stack || e)); fails++; }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
