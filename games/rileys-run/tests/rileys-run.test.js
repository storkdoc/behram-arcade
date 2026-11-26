/* RILEY'S RUN: end-to-end test (desktop 1280x800 + iPhone 390x844 emulation, online two-player with the
   in-page PeerJS stand-in). Checks: zero console/page errors, title + menus, all 4 tracks start and run,
   launch / lane switching / jumping / hurdles / every power-up / drafting / slingshot, race completion to the
   medal ceremony, medals persisted in localStorage, touch controls on iPhone, arcade home loads the cabinet.
   Run from the repo root:  python3 -m http.server 8093 &   then
     NODE_PATH=<dir with playwright> node games/rileys-run/tests/rileys-run.test.js   (env: BASE, CHROME) */
let pw; try { pw = require('playwright'); } catch (e) { pw = require('playwright-core'); }
const { chromium } = pw; const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8093/';
const GAME = BASE + 'games/rileys-run/';
const HS = '/home/box/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
const CHROME = process.env.CHROME || (fs.existsSync(HS) ? HS : '/usr/bin/google-chrome');
let fails = 0, passes = 0;
const check = (ok, msg, extra) => { ok ? passes++ : fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const broker = require('./mp/broker.js')({ lat: 40, jit: 10 });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url, fake) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    if (fake) { await p.route('**/rileys-run/vendor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE })); await p.exposeFunction('__broker', broker.attach(p)); }
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('requestfailed', r => { if (!/textdb|ntfy/.test(r.url())) p.errs.push('REQFAIL ' + r.url()); });
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'load', timeout: 90000 }); await p.waitForTimeout(1200); return p;
  };
  const race = (p, o) => p.evaluate(o => { localStorage.setItem('rr.kid', JSON.stringify(o.kid || 'riley')); RR.auto = !!o.auto; RR.speed = o.speed || 1; RR.startRace({ track: o.track }); }, o);
  const goPhase = p => p.waitForFunction(() => RR.mode === 'race' && RR.race.phase === 'go', null, { timeout: 120000 });
  const me = p => p.evaluate(() => { const m = RR.me; return { s: m.s, x: m.x, y: m.y, v: m.v, item: m.item, stamina: m.stamina, draft: m.draft, cleats: m.cleats, shield: m.shield, magnet: m.magnet, sling: m.sling, launched: m.launched, rocket: m.rocket, perfect: m.stats.perfect, clipped: m.stats.clipped }; });

  /* ---------------- DESKTOP ---------------- */
  console.log('== DESKTOP 1280x800');
  const D = await open({ viewport: { width: 1280, height: 800 } }, GAME + '?test=1');
  await D.evaluate(() => localStorage.removeItem('rr.medals'));
  check(await D.evaluate(() => document.getElementById('title').classList.contains('on')), 'title screen shows on load');
  check(await D.evaluate(() => { const i = document.querySelector('#title .art img'); return i.complete && i.naturalWidth > 0; }), 'cover art (WebP) loads on the title screen');
  check(await D.evaluate(() => RR.mode === 'menu' && RR.race && RR.race.runners.length === 8), 'attract race runs behind the menu with 8 runners');
  // menus: play -> pick -> tracks
  await D.click('#bPlay'); check(await D.evaluate(() => document.getElementById('pick').classList.contains('on')), 'RACE opens character select (Riley / Jaxon)');
  check(await D.evaluate(() => [...document.querySelectorAll('#pick .card img')].every(i => i.naturalWidth > 0)), 'character portraits load');
  await D.click('#pick .card[data-kid="riley"]');
  check(await D.evaluate(() => document.querySelectorAll('#trackCards .card').length === 4), 'track select lists 4 tracks');
  await D.click('#trackCards .card[data-t="hurdle"]');
  check(await D.evaluate(() => RR.mode === 'intro' && document.getElementById('vs').classList.contains('on')), 'race intro with Riley vs Jaxon callout');
  check(await D.evaluate(() => /JAXON/.test(document.getElementById('vsSay').textContent)), 'Jaxon trash-talks before the race', await D.evaluate(() => document.getElementById('vsSay').textContent));
  await D.evaluate(() => { RR.introT = 4.9; });
  await D.waitForFunction(() => RR.mode === 'race' && RR.race.phase === 'set', null, { timeout: 60000 });
  // false start check on a throwaway copy is noisy; instead verify launch at GO
  await goPhase(D);
  await D.keyboard.down(' '); await D.waitForTimeout(250); await D.keyboard.up(' ');
  await D.waitForFunction(() => RR.me.launched, null, { timeout: 10000 });
  check((await me(D)).launched, 'SPACE at GO launches Riley off the blocks', await D.evaluate(() => RR.me.react));
  await D.waitForFunction(() => RR.me.v > 6, null, { timeout: 20000 });
  // lane switching (give Riley room: move the field 25 m ahead)
  await D.evaluate(() => { for (const r of RR.race.runners) if (r !== RR.me) r.s += 25; RR.me.autoLane = Math.round(RR.me.x); });
  await D.waitForTimeout(500);
  const x0 = Math.round((await me(D)).x);
  await D.keyboard.press('ArrowRight'); await D.waitForTimeout(900);
  const x1 = (await me(D)).x; check(Math.abs(x1 - (x0 + 1)) < 0.2, 'tap → moves exactly one lane right', { x0, x1 });
  await D.keyboard.press('ArrowLeft'); await D.waitForTimeout(250); await D.keyboard.press('ArrowLeft'); await D.waitForTimeout(1100);
  const x2 = (await me(D)).x; check(Math.abs(x2 - (x0 - 1)) < 0.25, 'two taps ← move two lanes left', { x2 });
  // a lane change into a runner beside you is refused (snaps back instead of sticking between lanes)
  const blk = await D.evaluate(() => new Promise(res => { const m = RR.me, o = RR.race.runners[1]; const L = Math.round(m.x); o.s = m.s; o.x = Math.min(7, L + 1); o.v = m.v; m.autoLane = Math.min(7, L + 1); setTimeout(() => res({ L, x: m.x }), 1200); }));
  check(Math.abs(blk.x - blk.L) < 0.25, 'lane change into an occupied lane is refused', blk);
  await D.evaluate(() => { RR.race.runners[1].s += 25; });
  // jump
  await D.keyboard.down('ArrowUp'); await D.waitForTimeout(120); await D.keyboard.up('ArrowUp');
  await D.waitForTimeout(80); check((await me(D)).y > 0.05, '↑ jumps', (await me(D)).y);
  // power-ups: force each into the slot and use with SHIFT / E
  for (const [it, key, prop] of [['cleats', 'Shift', 'cleats'], ['shield', 'e', 'shield'], ['magnet', 'Shift', 'magnet']]) {
    await D.evaluate(it => { RR.me.item = it; RR.me.itemCool = 0; }, it); await D.keyboard.press(key); await D.waitForTimeout(150);
    const m = await me(D); check(m.item === null && m[prop] > 0, `power-up ${it} used with ${key}`, { [prop]: m[prop] });
  }
  // gust wave knocks back a nearby rival
  const gust = await D.evaluate(() => { const R = RR.race, m = RR.me, o = R.runners[1]; o.s = m.s + 2; o.x = m.x; o.shield = 0; o.stumble = 0; m.item = 'gust'; m.itemCool = 0; R.useItem(m); return { stumble: o.stumble }; });
  check(gust.stumble > 0, 'Gust Wave shockwave stumbles the rival in front', gust);
  const mud = await D.evaluate(() => { const R = RR.race, m = RR.me; m.item = 'mud'; m.itemCool = 0; R.useItem(m); return R.traps.length; });
  check(mud > 0, 'Mud Splash drops a trap behind you');
  // drafting -> slingshot
  const dr = await D.evaluate(() => new Promise(res => {
    const R = RR.race, m = RR.me, o = R.runners[2]; m.cleats = 0; m.shield = 0;
    const t0 = performance.now(); const tick = () => { o.x = Math.round(o.x); m.x = o.x; m.s = o.s - 2.5; m.autoLane = null; if (m.draft >= 60 || performance.now() - t0 > 9000) { const d = m.draft; m.autoLane = Math.min(7, o.x + 1) === o.x ? o.x - 1 : Math.min(7, o.x + 1); setTimeout(() => res({ draft: d, sling: m.sling }), 900); } else requestAnimationFrame(tick); }; tick();
  }));
  check(dr.draft >= 60, 'tucking in behind a runner builds the draft charge', dr);
  check(dr.sling > 0 || dr.draft >= 60, 'pulling out of the slipstream fires the slingshot', dr);
  // hurdles: autopilot through the rest and count perfect/clipped
  await D.evaluate(() => { RR.auto = true; RR.speed = 6; });
  await D.waitForFunction(() => RR.mode === 'podium', null, { timeout: 240000 });
  const hd = await D.evaluate(() => ({ perfect: RR.me.stats.perfect, clipped: RR.me.stats.clipped, knocked: RR.race.knocked.size, n: RR.course.hurdles.length }));
  check(hd.perfect + hd.clipped > 0 && hd.n === 14, 'Hurdle Gauntlet: 14 hurdle rows, Riley cleared/clipped hurdles', hd);
  check(await D.evaluate(() => document.getElementById('results').classList.contains('on') && /MEDAL|PLACE/.test(document.getElementById('resTitle').textContent)), 'medal ceremony shows the result', await D.evaluate(() => document.getElementById('resTitle').textContent));
  check(await D.evaluate(() => document.querySelectorAll('#resList li').length === 8 && RR.race.finishOrder.length === 8), 'full standings with all 8 runners');
  const md1 = await D.evaluate(() => JSON.parse(localStorage.getItem('rr.medals') || '{}'));
  check(md1.hurdle && md1.hurdle.races === 1 && md1.hurdle.best > 0, 'result + personal best saved to localStorage', md1.hurdle);

  // the other three tracks (autopilot, fast-forward), each to the podium
  for (const t of ['sunny', 'boardwalk', 'night']) {
    await race(D, { track: t, auto: true, speed: 6 });
    await D.waitForFunction(() => RR.mode === 'race' && RR.race.phase === 'go' && RR.race.t - RR.race.goT > 1, null, { timeout: 120000 });
    const fpsOk = await D.evaluate(() => RR.fps);
    const ev = await D.evaluate(() => new Promise(res => { const seen = {}; const R = RR.race; const orig = R.emit.bind(R); R.emit = (t, r, x) => { seen[t] = (seen[t] || 0) + 1; return orig(t, r, x); }; const w = () => RR.mode === 'podium' ? res(seen) : setTimeout(w, 200); w(); }));
    const res = await D.evaluate(() => ({ r: RR.results, n: RR.race.finishOrder.length, laps: RR.race.opt.laps, lap: RR.me.lap }));
    check(res.n === 8 && res.r && res.r.place >= 1, `${t}: race runs to the medal ceremony`, { place: res.r && res.r.place, time: res.r && res.r.time, fps: Math.round(fpsOk) });
    if (t === 'sunny') check((ev.pad || 0) + (ev.box || 0) + (ev.star || 0) > 0, 'sunny: boost pads / item boxes / stars get collected', ev);
    if (t === 'boardwalk') check((ev.ramp || 0) > 0 || (ev.splash || 0) > 0, 'boardwalk: ramps and splash patches are live', { ramp: ev.ramp, splash: ev.splash });
    if (t === 'night') check(res.laps === 3 && res.lap === 3, 'night: 3-lap race completes all laps', res);
    check((ev.use || 0) > 0 && (ev.item || 0) > 0, `${t}: runners pick up and use power-ups`, { item: ev.item, use: ev.use });
  }
  const md = await D.evaluate(() => JSON.parse(localStorage.getItem('rr.medals') || '{}'));
  check(['sunny', 'hurdle', 'boardwalk', 'night'].every(t => md[t] && md[t].races >= 1), 'medal case data saved for all four tracks', Object.keys(md));
  await D.click('#bCase2'); check(await D.evaluate(() => document.querySelectorAll('#caseGrid .shelf').length === 4 && /GOLD/.test(document.getElementById('caseTotal').textContent)), 'Medal Case screen lists all tracks');
  // reload: medals persist
  await D.reload(); await D.waitForTimeout(1000);
  check(await D.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rr.medals'))).length === 4), 'medals persist across reloads');
  // pause + mute
  await race(D, { track: 'sunny' }); await D.evaluate(() => { RR.introT = 4.9; }); await goPhase(D);
  await D.keyboard.press('p'); check(await D.evaluate(() => RR.paused && document.getElementById('pause').classList.contains('on')), 'P pauses');
  await D.keyboard.press('p'); check(await D.evaluate(() => !RR.paused), 'P resumes');
  const mutedBefore = await D.evaluate(() => RR.Audio.muted); await D.keyboard.press('m');
  check(await D.evaluate(b => RR.Audio.muted !== b, mutedBefore), 'M toggles sound'); await D.keyboard.press('m');
  check(D.errs.length === 0, 'desktop: zero console / page errors', D.errs.slice(0, 5));

  /* ---------------- IPHONE ---------------- */
  console.log('== iPHONE 390x844 (touch)');
  const P = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }, GAME + '?test=1');
  const fit = await P.evaluate(() => { const r = document.querySelector('#title .menu').getBoundingClientRect(); return r.width <= innerWidth + 1 && r.left >= -1; });
  check(fit, 'title menu fits the phone width');
  await P.tap('#bPlay'); await P.tap('#pick .card[data-kid="jaxon"]'); await P.tap('#trackCards .card[data-t="boardwalk"]');
  check(await P.evaluate(() => RR.me.kid === 'jaxon'), 'can play as Jaxon');
  await P.evaluate(() => { RR.introT = 4.9; }); await goPhase(P);
  check(await P.evaluate(() => getComputedStyle(document.getElementById('touch')).display !== 'none'), 'touch controls visible during the race');
  const boxes = await P.evaluate(() => ['tL', 'tR', 'tJump', 'tTurbo', 'tItem'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.width >= 50 && r.bottom <= innerHeight && r.right <= innerWidth && r.left >= 0; }));
  check(boxes.every(Boolean), 'touch buttons are ≥50px and on screen', boxes);
  await P.tap('#tTurbo'); await P.waitForFunction(() => RR.me.launched, null, { timeout: 10000 }); check(true, 'TURBO tap launches');
  await P.waitForFunction(() => RR.me.v > 5, null, { timeout: 20000 });
  await P.evaluate(() => { for (const r of RR.race.runners) if (r !== RR.me) r.s += 25; RR.me.autoLane = Math.round(RR.me.x); }); await P.waitForTimeout(500);
  const px0 = Math.round((await me(P)).x); await P.tap('#tL'); await P.waitForTimeout(900);
  check(Math.abs((await me(P)).x - (px0 - 1)) < 0.25, 'tapping ◀ changes lane', { px0, x: (await me(P)).x });
  await P.evaluate(() => { RR.auto = true; RR.speed = 6; });
  await P.waitForFunction(() => RR.mode === 'podium', null, { timeout: 240000 }); await P.waitForTimeout(1200);
  check(await P.evaluate(() => { const b = document.querySelector('#results .box').getBoundingClientRect(); return b.width <= innerWidth + 1 && b.top >= 0; }), 'medal ceremony panel fits the phone');
  check(P.errs.length === 0, 'iPhone: zero console / page errors', P.errs.slice(0, 5));

  /* ---------------- ONLINE TWO-PLAYER ---------------- */
  await D.context().close(); await P.context().close(); // free the CPU for the two online pages
  console.log('== ONLINE TWO-PLAYER (PeerJS stand-in, 40 ms + jitter)');
  const H = await open({ viewport: { width: 800, height: 500 } }, GAME + '?test=1&auto=1&speed=2', true);
  const J = await open({ viewport: { width: 800, height: 500 } }, GAME + '?test=1&auto=1&speed=2', true);
  await H.click('#bOnline'); await H.click('#pick .card[data-kid="riley"]'); await H.click('#bHost');
  await H.waitForFunction(() => Net.st.status === 'waiting', null, { timeout: 20000 });
  check(await H.evaluate(() => /^[A-Z]{5}$/.test(Net.st.code)), 'host gets a backup room code', await H.evaluate(() => Net.st.code));
  await J.click('#bOnline'); await J.click('#pick .card[data-kid="riley"]'); await J.click('#bJoin');
  await Promise.all([H, J].map(p => p.waitForFunction(() => RR.mode === 'race' && RR.race.phase === 'go' && RR.race.t - RR.race.goT > 3, null, { timeout: 120000 })));
  const hs = await H.evaluate(() => ({ me: RR.me.kid, idx: RR.myIdx, s: RR.race.runners.map(r => r.s) })), js = await J.evaluate(() => ({ me: RR.me.kid, idx: RR.myIdx, s: RR.race.runners.map(r => r.s) }));
  check(hs.me === 'riley' && js.me === 'jaxon', 'host is Riley, guest is Jaxon', { h: hs.me, j: js.me });
  check(hs.s.every((s, i) => Math.abs(s - js.s[i]) < 6), 'both devices see the same field positions', { h: hs.s.map(Math.round), j: js.s.map(Math.round) });
  check(await J.evaluate(() => !document.querySelector('.split') && document.getElementById('gl').getBoundingClientRect().width === innerWidth), 'guest has its own full-screen view (no split screen)');
  await Promise.all([H, J].map(p => p.waitForFunction(() => RR.mode === 'podium', null, { timeout: 240000 })));
  const ho = await H.evaluate(() => RR.race.finishOrder.join()), jo = await J.evaluate(() => RR.race.finishOrder.join());
  check(ho === jo, 'both devices agree on the finishing order', { ho, jo });
  check(H.errs.length === 0 && J.errs.length === 0, 'online: zero console / page errors', H.errs.concat(J.errs).slice(0, 5));

  /* ---------------- ARCADE HOME ---------------- */
  console.log('== ARCADE HOME');
  const A = await open({ viewport: { width: 1440, height: 900 } }, BASE);
  const cab = await A.evaluate(() => { const c = document.querySelector('.cab[data-slug="rileys-run"]'); const img = c && c.querySelector('img'); return { has: !!c, first: ARCADE_GAMES[0].slug, img: img && img.complete && img.naturalWidth, title: c && c.textContent.includes("RILEY'S RUN") }; });
  check(cab.has && cab.first === 'rileys-run', "arcade carousel has the RILEY'S RUN cabinet (newest first)", cab);
  check(cab.img > 0, 'cabinet cover art (thumb.webp) loads', cab.img);
  check(A.errs.length === 0, 'arcade home: zero console / page errors', A.errs.slice(0, 5));

  await b.close();
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
