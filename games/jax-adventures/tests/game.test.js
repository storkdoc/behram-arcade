/* JAX'S ADVENTURES: desktop Chrome + iPhone checks of the core loops.
   From the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/jax-adventures/tests/game.test.js   (env: BASE, CHROME) */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/';
const URL = BASE + 'games/jax-adventures/index.html?q=0';
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const open = async (opts, url = URL) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(url); await p.waitForFunction('window.JAX && (JAX.mode === "title" || JAX.fatal)', null, { timeout: 60000 }); return p;
  };
  const ev = (p, f, a) => p.evaluate(f, a);

  console.log('== DESKTOP Chrome 1280x800');
  const D = await open({ viewport: { width: 1280, height: 800 } });
  await ev(D, () => localStorage.clear());
  check(await ev(D, () => !JAX.fatal && !!JAX.R && JAX.R.constructor.name !== 'Render2D'), '3D renderer boots to the title');
  await ev(D, () => JAX.start(true, true)); await D.waitForTimeout(1500);
  check(await ev(D, () => JAX.mode === 'play'), 'New game starts');

  // sneak-grab from a picnic stash
  const grab = await ev(D, () => { const { S, W } = JAX; for (const n of S.G.npcs) n.aware = 0; let c = null; for (const s of W.STASHES) { if (!S.G.stash[s.id].items.length) continue; for (let a = 0; a < 6.28 && !(c && c.k === 'grab'); a += 0.785) { JAX.tp(s.x + Math.cos(a) * 1.1, s.z + Math.sin(a) * 1.1); c = S.getCtx(); } if (c && c.k === 'grab') break; } const n0 = S.G.inv.length; if (c && c.k === 'grab') S.interact(c); return { k: c && c.k, got: S.G.inv.length - n0 }; });
  check(grab.k === 'grab' && grab.got === 1, 'grab a snack from a picnic basket', grab);

  // hide in a trash bin
  const hide = await ev(D, () => { const { S, W } = JAX; const h = W.HIDES.find(h => h.kind === 'bin'); JAX.tp(h.x + 1.1, h.z, Math.PI); const c = S.getCtx(); if (c && c.k === 'hide') S.interact(c); const r = { k: c && c.k, hidden: S.G.p.hidden }; S.interact(); return r; });
  check(hide.k === 'hide' && !!hide.hidden, 'hide in a trash bin', hide);

  // ranger spots you (carrying food), chases, catches, walks you home
  const chase = await ev(D, () => { const { S } = JAX; S.G.quest.ch = 1; S.G.quest.step = 0; JAX.time(12); S.addItem({ id: 'sandwich' }); const r = S.npc('ranger'); r.state = 'patrol'; r.aware = 0;
    JAX.tp(r.x + Math.cos(r.rot) * 4, r.z + Math.sin(r.rot) * 4); const seen = []; for (let i = 0; i < 80 && !S.G.caught; i++) { JAX.step(0.1); seen.push(r.state); }
    const caught = !!S.G.caught; for (let i = 0; i < 120 && S.G.caught; i++) JAX.step(0.1); return { chased: seen.includes('chase'), caught, food: S.G.inv.filter(i => i.id === 'sandwich').length, released: !S.G.caught }; });
  check(chase.chased && chase.caught && chase.released && chase.food === 0, 'ranger chases, catches, takes items and walks you home', chase);

  // fishing: cast, bite, reel, land, journal
  const fish = await ev(D, () => { const { S } = JAX; const G = S.G; G.owned.rod = 1; G.bait = 3; JAX.time(10); JAX.tp(9, -20, 3.0); const ok = S.startFishing(); if (!ok) return { ok };
    JAX.step(0.5, { fishHeld: true }); JAX.step(0.02, { fishUp: true }); JAX.step(1); G.forceSpecies = 'perch'; G.forceBite = true; JAX.step(0.05); const bite = G.fish && G.fish.st; JAX.step(0.02, { fishDown: true });
    for (let i = 0; i < 2000 && G.fish && G.fish.st === 'reel'; i++) JAX.step(1 / 60, { fishHeld: G.fish.tension < 0.75 });
    return { ok, bite, st: G.fish && G.fish.st, journal: !!G.journal.perch, inv: G.inv.some(i => i.fish && i.fish.sp === 'perch') }; });
  check(fish.ok && fish.bite === 'bite' && fish.st === 'caught' && fish.journal && fish.inv, 'fish: cast, bite, reel and land a perch (journal + backpack)', fish);
  await D.waitForTimeout(1500);

  // sell / buy / trade
  const shop = await ev(D, () => { const { S } = JAX; const G = S.G; const c0 = G.coins; const i = G.inv.findIndex(i => i.fish); const got = S.sell(i, 'hollis'); const sold = G.coins - c0 === got && got > 0;
    G.coins = 1000; const bought = S.buy('bike') && G.owned.bike && G.coins === 1000 - S.SHOP_BY_ID ? true : !!G.owned.bike; const baitBefore = G.bait; S.buy('bait5'); 
    for (const f of ['bluegill', 'perch', 'bluegill', 'perch']) S.addItem({ id: 'fish', fish: { sp: f, size: 20 } }); S.addItem({ id: 'apple' }); S.addItem({ id: 'apple' });
    const k = G.trades.findIndex((o, k) => S.canTrade(k)); const traded = k >= 0 && S.trade(k); return { sold, got, bought, bait: G.bait - baitBefore, trades: G.trades.length, traded }; });
  check(shop.sold && shop.bought && shop.traded, 'sell a fish, buy a bike, complete a trade with Willa', shop);

  // UI screens open and close via keys
  await ev(D, () => { JAX.S.G.fish = null; JAX.S.G.toasts && (JAX.S.G.toasts.length = 0); });
  for (const [code, ui] of [['KeyI', 'inv'], ['KeyM', 'map'], ['KeyQ', 'quests'], ['KeyJ', 'journal'], ['KeyP', 'pause']]) {
    await ev(D, () => { if (JAX.S.G.menu) JAX.S.act('close'); });
    await D.keyboard.press(code); await D.waitForTimeout(700); const u = await ev(D, () => JAX.hud.ui); const why = await ev(D, () => ({ menu: JAX.S.G.menu && JAX.S.G.menu.k, fish: !!JAX.S.G.fish, caught: !!JAX.S.G.caught, mode: JAX.mode })); check(!!u, `${code} opens a menu`, u || why); await D.keyboard.press('Escape'); await D.waitForTimeout(700);
    await ev(D, () => JAX.ui(null));
  }

  // save / load across a reload
  await ev(D, () => { JAX.S.G.coins = 4321; JAX.S.G.flags.testFlag = 1; JAX.tp(20, 30); JAX.S.save(); });
  await D.reload(); await D.waitForFunction('window.JAX && (JAX.mode === "title" || JAX.fatal)', null, { timeout: 60000 });
  const sv = await ev(D, () => ({ has: JAX.hud.title.hasSave, coins: JAX.S.G.coins, flag: JAX.S.G.flags.testFlag, bike: !!JAX.S.G.owned.bike, perch: !!JAX.S.G.journal.perch, x: Math.round(JAX.S.G.p.x) }));
  check(sv.has && sv.coins === 4321 && sv.flag === 1 && sv.bike && sv.perch && sv.x === 20, 'save survives a reload (coins, gear, journal, position)', sv);
  await ev(D, () => { JAX.start(false); JAX.time(21); JAX.weather('rain'); }); await D.waitForTimeout(3000);
  check(await ev(D, () => JAX.mode === 'play' && !JAX.fatal), 'continue, night and rain render');
  check(D.errs.length === 0, 'desktop: no console errors', D.errs.slice(0, 5)); await D.context().close();

  console.log('== 2D fallback (?gl=0)');
  const F = await open({ viewport: { width: 900, height: 600 } }, URL + '&gl=0');
  await ev(F, () => JAX.start(true, true)); await F.waitForTimeout(1500);
  check(await ev(F, () => JAX.mode === 'play' && !JAX.fatal), '2D fallback plays'); check(F.errs.length === 0, 'fallback: no console errors', F.errs.slice(0, 5)); await F.context().close();

  if (process.env.DESKTOP_ONLY) { await b.close(); console.log(fails ? `\n${fails} FAILED` : "\nALL PASS"); process.exit(fails ? 1 : 0); }
  for (const land of [false, true]) {
    console.log('== iPhone 13 ' + (land ? 'landscape' : 'portrait'));
    const P = await open({ ...devices[land ? 'iPhone 13 landscape' : 'iPhone 13'] });
    await ev(P, () => localStorage.clear());
    const vw = await ev(P, () => ({ w: innerWidth, h: innerHeight, c: document.querySelector('canvas').width }));
    check(vw.c >= vw.w * 2, 'canvas renders at device pixel ratio', vw);
    await ev(P, () => JAX.start(true, true)); await P.waitForTimeout(1500);
    // joystick drag moves Jax
    const x0 = await ev(P, () => [JAX.S.G.p.x, JAX.S.G.p.z]);
    const jx = 90, jy = vw.h - 110; const cdp = await P.context().newCDPSession(P);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await tp('touchStart', jx, jy); for (let k = 1; k <= 5; k++) { await tp('touchMove', jx, jy - k * 12); await P.waitForTimeout(60); } await P.waitForTimeout(2500); await tp('touchEnd');
    const x1 = await ev(P, () => [JAX.S.G.p.x, JAX.S.G.p.z]);
    check(Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) > 0.5, 'left joystick moves Jax', { x0, x1 });
    check(await ev(P, () => JAX.mode === 'play' && !JAX.fatal), 'plays on iPhone'); check(P.errs.length === 0, 'iPhone: no console errors', P.errs.slice(0, 5)); await P.context().close();
  }
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASS'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
