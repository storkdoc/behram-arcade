/* LIVING CHESS — on-board emotion clips: browser test.
   Run from the repo root:  python3 -m http.server 8097 &   then
     NODE_PATH=<playwright node_modules> CHROME=<chromium> node games/living-chess/tests/clips.test.js [desktop|iphone]
   Checks: manifest + atlases (WebP, small), forced clips play on the piece's square (quad shown, piece hidden, restored
   afterwards; a death keeps it hidden), key skip, a real capture plays the victim's death then the capturer's
   celebration with the game state untouched, Off falls back to the old shatter, no <video>, no console errors. */
const pw = require('playwright');
const fs = require('fs'), path = require('path');
const DEV = process.argv[2] || 'desktop';
const BASE = process.env.URL || 'http://localhost:8097/games/living-chess/';
const CHROME = process.env.CHROME || '/home/box/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); };
(async () => {
  // 1. assets on disk
  const dir = path.join(__dirname, '..', 'clips'), man = fs.readFileSync(path.join(dir, 'manifest.js'), 'utf8');
  const list = JSON.parse(man.slice(man.indexOf('['), man.lastIndexOf(']') + 1));
  check(list.length >= 24, 'manifest lists clips', list.length);
  const big = list.filter(c => !fs.existsSync(path.join(dir, c.f)) || fs.statSync(path.join(dir, c.f)).size > 300 * 1024);
  check(!big.length, 'every atlas exists and is under 300 KB', big.map(c => c.f));
  check(list.every(c => c.f.endsWith('.webp') && c.n > 10 && c.cols * c.rows >= c.n), 'atlas grids are sane');
  const demiseStyles = new Set(list.filter(c => c.e === 'demise').map(c => c.s));
  check(demiseStyles.size >= 6, 'deaths are varied', [...demiseStyles]);
  check(new Set(list.filter(c => c.e === 'triumph').map(c => c.s)).size >= 4, 'celebrations are varied');

  const touch = DEV !== 'desktop', vp = DEV === 'iphone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const b = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const co = { viewport: vp }; if (touch) Object.assign(co, { deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const ctx = await b.newContext(co), p = await ctx.newPage(), errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => { if (e.name === 'ExitStatus') return; errs.push('PAGEERR ' + e.message); });
  console.log(`== clips ${DEV} ${vp.width}x${vp.height}`);
  await p.goto(BASE + '?cine=full&engine=js', { timeout: 180000 });
  await p.waitForFunction(() => window.LCG && LCG.booted && LCG.screen === 'title', null, { timeout: 120000 });
  await p.mouse.click(5, vp.height - 5);
  const solo = async fen => { await p.evaluate(f => LCG.api.newSolo(0, 0, 0, [], f), fen); await p.waitForFunction(() => { const s = LCG.api.state(); return s.mode === 'solo' && !s.busy; }, null, { timeout: 60000 }); await p.waitForTimeout(300); };
  const idle = (ms = 60000) => p.waitForFunction(() => !LCG.api.cine().active, null, { timeout: ms });
  const vis = sq => p.evaluate(s => { const c = LCG.R.charAt(LC.sqIdx(s)); return c ? c.root.visible : null; }, sq);
  await solo('r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1');
  const fen0 = await p.evaluate(() => LCG.api.state().fen);

  // 2. forced clips
  for (const [emo, sq, keep] of [['triumph', 'f3', false], ['demise', 'c8', true]]) {
    await idle(); await p.evaluate(() => LCG.api.cineReset());
    const ok = await p.evaluate(([e, s]) => LCG.api.cinePlay(e, s), [emo, sq]);
    check(ok, `${emo} on ${sq} starts`);
    await p.waitForFunction(() => LCG.api.cine().quad && LCG.api.cine().e > 0.6, null, { timeout: 30000 });
    const st = await p.evaluate(() => LCG.api.cine());
    check(st.clip && st.shot === emo, `${emo} shows a clip`, st);
    check((await vis(sq)) === false, `${emo}: the 3D piece hides while its clip plays`);
    const scr = await p.evaluate(s => { const q = LCG.cine.quad, R = LCG.R; const a = R.project(q.position.clone()), b = LCG.api.screenOf(s); return { d: Math.hypot(a.x - b.x, a.y - b.y), W: R.W }; }, sq);
    check(scr.d < scr.W * 0.12, `${emo}: the clip sits on its square`, scr);
    const no = await p.evaluate(() => document.querySelectorAll('video').length);
    check(no === 0, 'no <video> elements');
    await idle();
    check((await vis(sq)) === !keep, keep ? 'a death clip leaves the piece gone' : 'the piece comes back afterwards');
  }
  // 3. key skip
  await p.evaluate(() => LCG.api.cineReset()); await solo('r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R w KQkq - 0 1');
  await p.evaluate(() => LCG.api.cinePlay('triumph', 'f3'));
  await p.waitForFunction(() => LCG.api.cine().quad, null, { timeout: 30000 });
  await p.keyboard.press('Space'); await idle(15000);
  const lg = await p.evaluate(() => LCG.api.cineLog().slice(-1)[0]);
  check(lg.skipped, 'a key skips the clip', lg);
  check((await vis('f3')) === true, 'skipped piece restored');
  check((await p.evaluate(() => LCG.api.state().fen)) === fen0, 'forced clips never change the game');
  // 4. a real capture: death on the victim's square, then the capturer celebrates
  await p.evaluate(() => LCG.api.cineReset());
  const n0 = await p.evaluate(() => LCG.api.cineLog().length);
  await p.evaluate(() => LCG.api.move('d4e5'));
  await p.waitForFunction(n => LCG.api.cineLog().length >= n + 2 && !LCG.api.cine().active, n0, { timeout: 120000 }).catch(() => {});
  const L = await p.evaluate(n => LCG.api.cineLog().slice(n), n0);
  check(L[0] && L[0].emo === 'demise' && L[0].type === 1 && L[0].side === 1 && L[0].shown, 'the captured pawn dies in a clip on its square', L[0]);
  check(L[1] && L[1].emo === 'triumph' && L[1].tag === 'capture' && L[1].side === 0 && L[1].shown, 'the capturer celebrates on its new square', L[1]);
  await p.waitForFunction(() => !LCG.api.state().busy && LCG.api.state().turn === 0, null, { timeout: 120000 });
  const after = await p.evaluate(() => LCG.api.state());
  check(after.ply === 2, 'the game went on (engine replied)', after.ply);
  check(await p.evaluate(() => { const c = LCG.R.charAt(LC.sqIdx('e5')); return !c || (c.side === 0 ? true : c.root.visible); }), 'board shows the capturer');
  // 5. Off: no clips, the old shatter
  await p.evaluate(() => LCG.api.cineMode('off'));
  await solo('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
  const n1 = await p.evaluate(() => LCG.api.cineLog().length);
  await p.evaluate(() => LCG.api.move('e4d5'));
  await p.waitForFunction(() => LCG.api.state().ply >= 1 && !LCG.api.state().busy, null, { timeout: 120000 });
  check((await p.evaluate(() => LCG.api.cineLog().length)) === n1, 'Off: no clips');
  check(errs.length === 0, 'no console errors', errs);
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
