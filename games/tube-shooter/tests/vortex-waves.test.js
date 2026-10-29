// VORTEX v5 wave formations test: STREAM / SWARM / PINCER / SPIRAL spawn geometry and timing, the PACK CLEAR bonus
// (own shots pay, the Superzapper does not), the wave intro banner, desktop + iPhone, no console errors.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-waves.test.js http://localhost:8137 [shotDir]
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const SHOTS = process.argv[3] || '';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL_ = BASE + '/games/tube-shooter/?debug=1';

// play level L for `sec` simulated seconds; enemies that have entered are removed after ~0.6 s so spawning never stalls
async function spawnLog(page, L, sec) {
  return page.evaluate(([L, sec]) => {
    window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(L); VORTEX.setInvincible(true);
    VORTEX.step(4, () => VORTEX.state.state === 'play');
    const lanes = []; VORTEX.setLane(0, 0);
    for (let t = 0; t < sec; t += 0.1) {
      VORTEX.step(0.1); lanes.push(VORTEX.playerLane());
      for (const e of VORTEX.enemyList()) if (e.z < 0.6) VORTEX.setEnemy(e.id, { dead: true });
    }
    return { w: VORTEX.wave(), web: VORTEX.webInfo() };
  }, [L, sec]);
}
const ld = (a, b, n, closed) => { let d = b - a; if (closed) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; } return d; };

async function suite(browser, label, ctxOpts) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(URL_, { waitUntil: 'load' }); await sleep(500);
  const kinds = await page.evaluate(() => Array.from({ length: 12 }, (_, i) => VORTEX.waveKind(i + 1)));
  check(kinds[0] === 'stream' && kinds[1] === 'stream' && kinds[2] === 'swarm' && kinds[4] === 'pincer' && kinds[5] === 'spiral', 'wave cycle L1-12: ' + kinds.join(' '));

  // STREAM (L1): single entries, no packs
  let r = await spawnLog(page, 1, 12);
  check(r.w.kind === 'stream' && r.w.log.length >= 6 && r.w.log.every(x => !x.pack), `L1 STREAM: ${r.w.log.length} single entries, no packs`);

  // SWARM (L3): packs of 3 adjacent lanes, entered within 0.35 s, then a lull
  r = await spawnLog(page, 3, 16);
  const packs = {}; for (const x of r.w.log) if (x.pack) (packs[x.pack] = packs[x.pack] || []).push(x);
  const P = Object.values(packs);
  const adj = P.every(p => p.every(a => p.every(b => Math.abs(ld(a.lane, b.lane, r.web.n, r.web.closed)) <= 2)));
  const tight = P.every(p => p[p.length - 1].t - p[0].t < 0.35);
  check(r.w.kind === 'swarm' && P.length >= 3 && P.filter(p => p.length === 3).length >= 2 && adj && tight, `L3 SWARM: ${P.length} packs (sizes ${P.map(p => p.length).join(',')}), adjacent=${adj}, each within 0.35 s=${tight}`);
  if (P.length >= 2) { const lull = P[1][0].t - P[0][P[0].length - 1].t; check(lull > 1.2, `SWARM lull between packs ${lull.toFixed(2)} s`); }

  // PINCER (L5): pairs entering together on both sides of the claw, >= 2 lanes away
  r = await page.evaluate(() => {
    window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(5); VORTEX.setInvincible(true);
    VORTEX.step(4, () => VORTEX.state.state === 'play');
    const pairs = [], web = VORTEX.webInfo(); let n0 = VORTEX.wave().log.length;
    for (let t = 0; t < 16; t += 0.02) {
      VORTEX.step(0.02); const lg = VORTEX.wave().log;
      if (lg.length > n0) { const pl = VORTEX.playerLane(); for (const x of lg.slice(n0)) pairs.push({ ...x, pl }); n0 = lg.length; }
      for (const e of VORTEX.enemyList()) if (e.z < 0.6) VORTEX.setEnemy(e.id, { dead: true });
    }
    return { pairs, web };
  });
  let ok = 0, tot = 0;
  for (let i = 0; i + 1 < r.pairs.length; i++) { const a = r.pairs[i], b = r.pairs[i + 1]; if (b.t - a.t < 0.1) { tot++; const da = ld(a.pl, a.lane, r.web.n, r.web.closed), db = ld(a.pl, b.lane, r.web.n, r.web.closed); if (Math.sign(da) !== Math.sign(db) && Math.abs(da) >= 2 && Math.abs(db) >= 2) ok++; i++; } }
  check(tot >= 3 && ok === tot, `L5 PINCER: ${ok}/${tot} simultaneous pairs flank the claw on both sides (>= 2 lanes away), web n=${r.web.n} closed=${r.web.closed}`);

  // SPIRAL (L6): consecutive entries move by a constant step around the web
  r = await spawnLog(page, 6, 14);
  const st = r.w.log.slice(1).map((x, i) => Math.abs(ld(r.w.log[i].lane, x.lane, r.web.n, r.web.closed)));
  const step = r.web.n >= 14 ? 2 : 1;
  check(r.w.kind === 'spiral' && st.length >= 8 && st.filter(d => d === step).length >= st.length - 1, `L6 SPIRAL: steps ${st.join(',')} (expect ${step})`);

  // PACK CLEAR: shots on all 3 members pay 600, a Superzapped pack pays nothing
  r = await page.evaluate(() => {
    window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(3); VORTEX.setInvincible(true);
    VORTEX.step(4, () => VORTEX.state.state === 'play');
    const res = [];
    for (const zapped of [false, true]) {
      VORTEX.step(8, () => { const l = VORTEX.wave().log; const last = l[l.length - 1]; return last && last.pack && l.filter(x => x.pack === last.pack).length === 3 && VORTEX.enemyList().length >= 3; });
      const l = VORTEX.wave().log, pk = l[l.length - 1].pack, c0 = VORTEX.wave().packClears, s0 = VORTEX.score();
      const ids = VORTEX.enemyList().slice(-3).map(e => e.id);
      ids.forEach(id => VORTEX.kill(id, zapped));
      res.push({ zapped, cleared: VORTEX.wave().packClears - c0, gained: VORTEX.score() - s0, pk });
      for (const e of VORTEX.enemyList()) VORTEX.setEnemy(e.id, { dead: true });
      VORTEX.step(0.05);
    }
    return res;
  });
  check(r[0].cleared === 1 && r[0].gained >= 600, `PACK CLEAR by shots: +${r[0].gained} points (bonus 600 + kills), clears ${r[0].cleared}`);
  check(r[1].cleared === 0, `Superzapped pack pays no PACK CLEAR (clears ${r[1].cleared}, +${r[1].gained})`);

  // intro banner renders in real time
  await page.evaluate(() => { VORTEX.freeze(false); VORTEX.gotoLevel(5); });
  await sleep(900);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/waves-${label.replace(/\W+/g, '_')}.png` });
  check((await page.evaluate(() => VORTEX.wave().kind)) === 'pincer', 'live intro of a PINCER level');
  // normal play with real enemies for 20 s at level 8 (all types + formations) stays error-free
  await page.evaluate(() => { VORTEX.freeze(true); window.__noWarp = false; VORTEX.setInvincible(false); VORTEX.gotoLevel(8); VORTEX.setAuto(true); VORTEX.step(25); VORTEX.freeze(false); });
  await sleep(500);
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1280x800', { viewport: { width: 1280, height: 800 } });
  await suite(browser, 'iPhone 14', { ...devices['iPhone 14'] });
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})();
