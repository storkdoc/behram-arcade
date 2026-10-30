/* Trackball Football: HELMET CAM (the optional player's-eye second view).
   Node part (no browser): plays.js + sim.js + helmet.js headless
   - every cue the helmet shows comes straight from the sim's AI state (S.it == the AI's own intent), only for men in view
   - the flashing "!" is the real dive window: every CPU dive is flagged on the frame it happens
   - recording intents does not change the AI (same seeded game, same result, with and without reading cues)
   - balance: a bot that jukes ONLY on what the helmet cam shows it is no TD machine (same limits as run-defense)
   Browser part (desktop Chrome + iPhone portrait/landscape emulation):
   - off by default; V, the HELMET CAM button and gamepad Y toggle it; it persists in localStorage across a reload
   - both views render through presnap and live plays with no console errors; the broadcast view shrinks to make room
   - pause menu and options carry the setting; screenshots to /tmp/tbf-helmet-*.png
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/trackball-football/tests/helmet-cam.test.js   (env: URL CHROME N NOBROWSER) */
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = path.join(__dirname, '..', 'js');
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
const src = f => fs.readFileSync(path.join(DIR, f), 'utf8');
function load(rng) {
  const ctx = { console, Math: rng ? Object.assign(Object.create(Math), { random: rng }) : Math, performance: { now: () => 0 } };
  vm.createContext(ctx);
  vm.runInContext(src('plays.js') + '\n' + src('sim.js') + '\n' + src('helmet.js') + '\nthis.Sim = Sim; this.STEP = STEP; this.Helmet = Helmet;', ctx);
  return ctx;
}
const seeded = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const viewOf = (S, me, hfov) => { const q = S.pl[S.ctl[me]]; return { x: q[0], y: q[1], yaw: q[2], hfov: hfov || 70 * Math.PI / 180 }; };

/** a CPU-vs-CPU game, but team 0's controlled man is driven by a dumb "human" so the helmet has an owner */
function play(ctx, steps, onFrame) {
  const { Sim, STEP } = ctx; Sim.newGame({ human: [true, false], diff: 1, half: 900 });
  const G = Sim.G, blank = () => ({ x: 0, y: 0, m: 0, aP: false, bP: false });
  for (let k = 0; k < steps; k++) {
    const inp = [blank(), null];
    if (G.phase === 'select') { for (const t of [0, 1]) if (G.pend[t] && !G.picks[t]) Sim.pick(t, Sim.cpuPick(t), Math.random() < 0.5); }
    if (G.phase === 'presnap' && G.t > 0.8) inp[0].aP = true;
    if (G.phase === 'live') { const me = G.pl[G.ctl[0]], d = G.off === 0 ? 1 : -1, c = Sim.carrier && Sim.carrier();
      if (c && c.team !== 0) { const dx = c.x - me.x, dy = c.y - me.y, n = Math.hypot(dx, dy) || 1; inp[0] = { x: dx / n, y: dy / n, m: 1, aP: false, bP: false }; }
      else inp[0] = { x: d, y: Math.sin(k / 40) * 0.5, m: 1, aP: false, bP: false }; }
    const before = G.pl.map(p => p.st);
    Sim.update(STEP, inp);
    if (onFrame) onFrame(G, before);
    if (G.over) Sim.newGame({ human: [true, false], diff: 1, half: 900 });
  }
}

say('== Node: cues come from the AI state');
{
  const ctx = load(seeded(7)), { Sim, Helmet } = ctx;
  let frames = 0, mism = 0, outOfView = 0, missing = 0, dives = 0, flagged = 0, kinds = new Set(), behind = 0, routes = 0, keys = new Set();
  play(ctx, 60 * 60 * 25, (G, before) => {
    if (G.phase !== 'live') return;
    const S = Sim.snapshot(); frames++;
    // 1. the snapshot's intent is the AI's own
    G.pl.forEach((p, j) => { const it = S.it[j];
      if (!p.itK) { if (it) mism++; return; }
      if (!it || it[0] !== p.itK || Math.abs(it[1] - p.itX) > 0.06 || Math.abs(it[2] - p.itY) > 0.06) mism++;
      kinds.add(p.itK); });
    // 2. the helmet shows exactly those, and only for men in its field of view
    for (const me of [0, 1]) {
      const v = viewOf(S, me), cs = Helmet.cues(S, me, v);
      for (const c of cs.vis) { if (!Helmet.inView(v, S.pl[c.i][0], S.pl[c.i][1])) outOfView++; const it = S.it[c.i]; if ((it ? it[0] : '') !== c.k || (it && (it[1] !== c.tx || it[2] !== c.ty))) mism++; }
      for (let j = 0; j < 14; j++) if (j !== S.ctl[me] && Helmet.inView(v, S.pl[j][0], S.pl[j][1]) && !cs.vis.some(c => c.i === j)) missing++;
      behind += cs.behind.length;
    }
    if (S.rt) routes += S.rt.filter(Boolean).length;
    if (S.ky) keys.add(S.ky);
    // 3. "!" = the real dive window: every CPU dive is flagged that very frame
    G.pl.forEach((p, j) => { if (p.st === 'dive' && before[j] !== 'dive' && !(G.ctl[0] === j)) { dives++; if (S.it[j] && S.it[j][0] === 'dive') flagged++; } });
  });
  say(`    ${frames} live frames, kinds seen: ${[...kinds].sort().join(' ')}`);
  check(frames > 3000, 'played plenty of live football');
  check(mism === 0, `snapshot + helmet cues match the AI's intent exactly (${mism} mismatches)`);
  check(outOfView === 0 && missing === 0, `cues only for men inside the helmet's field of view, and all of them (${outOfView} outside, ${missing} missing)`);
  for (const k of ['pursue', 'block', 'route', 'rush']) check(kinds.has(k), `AI intent "${k}" is recorded`);
  check(kinds.has('edge') || kinds.has('deep') || kinds.has('contain'), 'run-fit jobs (contain edge / deep safety) are recorded');
  check(dives > 5 && flagged === dives, `every CPU dive was flagged "!" when it happened (${flagged}/${dives})`);
  check(routes > 0, 'receiver routes travel in the snapshot on pass plays');
  check(behind > 0, 'blind-side pursuers get an edge warning');
  say('    key reads seen:', [...keys].join(', ') || '(none)');
}
say('== Node: reading cues changes nothing in the sim');
{
  const run = read => { const ctx = load(seeded(99)); let h = 0; play(ctx, 60 * 60 * 3, G => { if (read && G.phase === 'live') { const S = ctx.Sim.snapshot(); ctx.Helmet.cues(S, 0, viewOf(S, 0)); } }); const G = ctx.Sim.G; for (const p of G.pl) h = (h * 31 + Math.round(p.x * 100) + Math.round(p.y * 100)) | 0; return [G.score.join('-'), G.clock.toFixed(2), h].join('|'); };
  const a = run(false), b = run(true); check(a === b, `identical game with and without the helmet reading it (${a})`);
}
say('== Node: balance, a bot that jukes only on what the helmet shows');
{
  const RD = require('./run-defense.test.js'), N = +process.env.N || 120, LIMIT = [0.12, 0.08, 0.06];
  const ctx = load(), Helmet = ctx.Helmet;
  const helmetJuke = (G, me, team) => { const S = RD.Sim.snapshot(); if (!S.it) return false; const cs = Helmet.cues(S, team, viewOf(S, team));
    return cs.vis.some(c => c.k === 'dive' || (c.threat && c.dist < 2.2)) || cs.behind.some(b => b.dist < 1.6); };
  for (let diff = 0; diff < 3; diff++) {
    const a = RD.rate('evasive', 'sweep', { diff, jukeWhen: helmetJuke }, N), b = RD.rate('evasive', 'dive', { diff, jukeWhen: helmetJuke }, N);
    const base = [RD.rate('evasive', 'sweep', { diff }, N), RD.rate('evasive', 'dive', { diff }, N)];
    const hr = (a.td + b.td) / 2, br = (base[0].td + base[1].td) / 2;
    say(`    ${['ROOKIE', 'PRO', 'ALL-PRO'][diff]}: helmet bot TD ${(hr * 100).toFixed(1)}% avg ${((a.avg + b.avg) / 2).toFixed(1)} yd | plain evasive bot TD ${(br * 100).toFixed(1)}% avg ${((base[0].avg + base[1].avg) / 2).toFixed(1)} yd`);
    check(hr <= LIMIT[diff] * 1.6, `${['ROOKIE', 'PRO', 'ALL-PRO'][diff]}: the helmet cam's cues are no TD machine (${(hr * 100).toFixed(1)}%, limit ${(LIMIT[diff] * 160).toFixed(1)}%)`);
  }
}

if (process.env.NOBROWSER) { say(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0); }

/* ---------------- browser ---------------- */
const { chromium } = require('playwright-core');
const URL = process.env.URL || 'http://localhost:8080/games/trackball-football/';
const IPHONE = { deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
async function open(c, name) {
  const p = await c.newPage(); p.name = name; p.errs = [];
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  await p.goto(URL); await p.waitForFunction(() => window.TBF && TBF.UI.hits.length > 0); return p;
}
const tapL = (p, label) => p.evaluate(l => { const h = TBF.UI.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + TBF.UI.hits.map(h => h.label).join('|')); h.fn(); }, label);
const hasL = (p, re) => p.evaluate(re => TBF.UI.hits.some(h => new RegExp(re).test(h.label)), re);
async function snapPlay(p, side) { // call a play (offense or defense), hike, let it run
  await p.waitForFunction(() => TBF.Sim.G.phase === 'select', null, { timeout: 40000 });
  await p.evaluate(side => { const A = TBF.App, G = TBF.Sim.G; G.off = side === 'def' ? 1 - A.me : A.me; TBF.GameScreen.resetSelect(TBF.Sim.snapshot());
    const L = A.Sel.list, w = side === 'run' ? L.find(x => /sweep|dive|run/i.test(x.id)) : side === 'pass' ? L.find(x => /post|slant|bomb|curl|pass/i.test(x.id)) : L[0]; A.lockPick((w || L[0]).id); }, side);
  await p.waitForFunction(() => TBF.Sim.G.phase === 'presnap', null, { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.evaluate(() => { if (TBF.Sim.G.off === TBF.App.me) TBF.Track.press(); });
  await p.waitForFunction(() => TBF.Sim.G.phase === 'live', null, { timeout: 15000 });
}
const state = p => p.evaluate(() => { const H = TBF.Helmet, L = TBF.App.L, R = TBF.Render.cam.rect || {};
  return { on: H.st.on, k: +H.st.k.toFixed(2), ls: localStorage.getItem('tbf.helmet'), helm: L.helm ? [L.helm.x, L.helm.y, L.helm.w, L.helm.h].map(Math.round) : null, mode: L.helmMode, field: [R.x, R.y, R.w, R.h].map(v => Math.round(v || 0)), W: L.W, H: L.H }; });

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  // ---- desktop: keyboard V, persistence, button, gamepad Y, pause + options
  say('== desktop Chrome 1280x800');
  {
    const c = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); const p = await open(c, 'desktop');
    check((await state(p)).on === false, 'HELMET CAM is off by default');
    await tapL(p, 'PLAY VS COMPUTER');
    await p.waitForFunction(() => TBF.Sim.G && TBF.Sim.G.phase === 'select', null, { timeout: 30000 });
    check(await hasL(p, '^HELMET CAM$'), 'the HELMET CAM button is on screen in a game');
    await p.keyboard.press('KeyV');
    await p.waitForTimeout(150);
    let s = await state(p); check(s.on && s.ls === '1', 'V turns it on and it is saved');
    check(s.k === 0, 'it stays tucked away while plays are being called');
    await snapPlay(p, 'run'); await p.waitForTimeout(900);
    s = await state(p); say('   ', s);
    check(s.k === 1 && s.mode === 'split' && s.helm && s.helm[2] > 400 && s.field[2] + s.helm[2] === s.W, 'live play: broadcast left, helmet cam right (side by side)');
    const cue = await p.evaluate(() => { const S = TBF.App.snap, me = TBF.App.me, cs = TBF.Helmet.cues(S, me, TBF.Helmet.view()), G = TBF.Sim.G;
      return { n: cs.vis.length, ok: cs.vis.every(c => (G.pl[c.i].itK || '') === c.k || !S.it), owner: cs.owner === S.ctl[me] }; });
    check(cue.owner && cue.ok, `on-screen cues match the live AI state (${cue.n} men in view)`);
    await p.screenshot({ path: '/tmp/tbf-helmet-desktop-run.png' });
    await snapPlay(p, 'def'); await p.waitForTimeout(1300);
    await p.screenshot({ path: '/tmp/tbf-helmet-desktop-defense.png' });
    await p.reload(); await p.waitForFunction(() => window.TBF && TBF.UI.hits.length > 0);
    check((await state(p)).on === true, 'still on after a reload (localStorage)');
    await tapL(p, 'PLAY VS COMPUTER'); await snapPlay(p, 'pass'); await p.waitForTimeout(700);
    await p.screenshot({ path: '/tmp/tbf-helmet-desktop-pass.png' });
    await tapL(p, 'HELMET CAM'); await p.waitForTimeout(600);
    s = await state(p); check(!s.on && s.k === 0 && !s.helm && s.field[2] === s.W && s.ls === '0', 'the button turns it off; the broadcast view gets the whole screen back');
    // gamepad Y (button 3)
    await p.evaluate(() => { const mk = y => [{ connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 3 && y, value: i === 3 && y ? 1 : 0 })) }];
      window.__padY = true; navigator.getGamepads = () => mk(window.__padY); setTimeout(() => { window.__padY = false; }, 120); });
    await p.waitForTimeout(400);
    check((await state(p)).on === true, 'gamepad Y toggles it');
    await p.evaluate(() => { TBF.App.paused = true; }); await p.waitForTimeout(150);
    check(await hasL(p, '^HELMET CAM:  ON$'), 'the pause menu shows the HELMET CAM setting');
    await p.evaluate(() => { TBF.App.paused = false; TBF.App.quit(); }); await p.waitForTimeout(200);
    s = await state(p); check(s.k === 0 && !s.helm, 'quitting to the menu puts the full-screen attract view back');
    await tapL(p, 'OPTIONS'); await p.waitForTimeout(150);
    check(await hasL(p, '^HELMET CAM:'), 'options lists HELMET CAM');
    check(p.errs.length === 0, 'desktop: no console errors ' + p.errs.slice(0, 3).join(' | '));
    await c.close();
  }
  for (const [name, vp] of [['iphone-portrait', { width: 390, height: 844 }], ['iphone-landscape', { width: 844, height: 390 }]]) {
    say(`== ${name}`);
    const c = await b.newContext(Object.assign({ viewport: vp }, IPHONE)); const p = await open(c, name);
    await tapL(p, 'PLAY VS COMPUTER');
    await p.waitForFunction(() => TBF.Sim.G && TBF.Sim.G.phase === 'select', null, { timeout: 30000 });
    await p.waitForTimeout(200);
    if (name === 'iphone-portrait') { await tapL(p, 'HELMET CAM'); } else await p.evaluate(() => TBF.Helmet.setOn(true));
    await snapPlay(p, 'run'); await p.waitForTimeout(1000);
    let s = await state(p); say('   ', s);
    if (name === 'iphone-portrait') check(s.mode === 'stack' && s.helm && s.helm[1] === 0 && s.field[1] === s.helm[3] && s.helm[3] > 200, 'portrait: helmet cam stacked on top, broadcast below');
    else check(s.mode === 'split' && s.helm && s.helm[2] > 300 && s.field[2] + s.helm[2] === s.W, 'landscape: side by side');
    await p.screenshot({ path: `/tmp/tbf-helmet-${name}-run.png` });
    await snapPlay(p, 'def'); await p.waitForTimeout(1300);
    await p.screenshot({ path: `/tmp/tbf-helmet-${name}-defense.png` });
    if (name === 'iphone-landscape') { // still toggles from the on-screen button when no plays are being called
      await p.waitForFunction(() => TBF.Sim.G.phase !== 'select', null, { timeout: 20000 }).catch(() => {});
      if (await hasL(p, '^HELMET CAM$')) { await tapL(p, 'HELMET CAM'); check((await state(p)).on === false, 'landscape: the button toggles it'); }
    }
    check(p.errs.length === 0, `${name}: no console errors ` + p.errs.slice(0, 3).join(' | '));
    await c.close();
  }
  await b.close();
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
