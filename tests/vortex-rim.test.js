// VORTEX rim-fight regression tests (headless Chrome via playwright-core).
// Run:  python3 -m http.server 8080 (from repo root)  then
//       NODE_PATH=/path/to/node_modules node tests/vortex-rim.test.js [baseURL]
// Uses the VORTEX test hooks (freeze/step/key) to fast-forward game time deterministically.
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8080';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/games/tube-shooter/?ss=1', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const V = window.VORTEX; V.freeze(true); V.key('Space', false); V.step(0.2); V.setLives(99);
    window.__setup = (L) => {
      V.setLives(99); V.gotoLevel(L); V.key('Space', false);
      V.step(4, () => V.state.state === 'play'); V.step(0.05);
      return V.state.web;
    };
  });

  // ---- 1. rim camping: park in one lane, hold fire; must die soon after enemies reach the rim ----
  const cases = [
    [1, 'mid', 0], [2, 'mid', 0], [5, 'mid', 1], [6, 'mid', 0],     // CIRCLE, SQUARE, CROSS, TRIANGLE (closed)
    [8, 'mid', 0], [8, 'edge', 0], [9, 'mid', -1], [11, 'edge', 0], // V, STEPS, FLAT (open; edge lane too)
    [11, 'mid', 0], [15, 'mid', 0], [16, 'mid', 1], [17, 'mid', 0], // FLAT, BROKEN V, INFINITY, CIRCLE set 2
  ];
  const TRIALS = 3, MAX_AFTER_RIM = 20;
  for (const [L, where, sub] of cases) {
    const res = [];
    for (let k = 0; k < TRIALS; k++) {
      res.push(await page.evaluate(([L, where, sub, MAX]) => {
        const V = window.VORTEX; const web = window.__setup(L);
        const n = V.params && V.state.spikes.length; // lanes
        const lane = where === 'edge' ? 0 : Math.floor(n / 2);
        V.setLane(lane, sub); V.key('Space', true);
        let t = 0, rim = null, kills0 = V.state.score;
        while (t < 90) {
          V.step(0.05); t += 0.05;
          const s = V.state;
          if (s.state === 'warp' || s.state === 'zoom') return { web, died: false, cleared: true, t, rim };
          if (rim == null && V.enemyList().some(e => e.z <= 0)) rim = t;
          if (s.state === 'dying' || s.state === 'gameover') return { web, died: true, t: +t.toFixed(2), rim: rim == null ? null : +rim.toFixed(2), kind: V.deathKind(), lane: s.lane };
          if (rim != null && t - rim > MAX) break;
        }
        V.key('Space', false);
        return { web, died: false, t, rim };
      }, [L, where, sub, MAX_AFTER_RIM]));
      await page.evaluate(() => window.VORTEX.key('Space', false));
    }
    const ok = res.every(r => r.died && (r.rim == null || r.t - r.rim <= MAX_AFTER_RIM));
    check(ok, `camping L${L} ${res[0].web} lane=${where} sub=${sub}: ` + res.map(r => r.died ? `died@${r.t}s(${r.kind}, rim@${r.rim}s)` : (r.cleared ? 'CLEARED-ALIVE' : `ALIVE ${r.t.toFixed(1)}s`)).join(', '));
  }

  // ---- 2. a well-timed shot kills a rim flipper that settles in the claw's lane ----
  for (const L of [1, 9, 17, 33]) {
    for (const where of ['mid', 'edge']) {
      const r = await page.evaluate(([L, where]) => {
        const V = window.VORTEX; const web = window.__setup(L); V.emptyField();
        const n = V.state.spikes.length, lane = where === 'edge' ? 0 : Math.floor(n / 2);
        V.setLane(lane, 0);
        const from = where === 'edge' ? 1 : lane + 1;
        const id = V.spawn('flipper', from, 0);
        const me = () => V.enemyList().find(e => e.id === id);
        // wait (no firing) until it has flipped and settled in our lane
        V.step(3, () => { const e = me(); return !e || (e.lane === lane && !e.flipping && e.z <= 0); });
        const e0 = me(); if (!e0) return { web, err: 'flipper vanished' };
        V.step(0.03);                              // react a beat after it lands
        V.key('Space', true); V.step(1 / 120); V.key('Space', false);
        V.step(0.05);
        return { web, killed: !me(), alive: ['play', 'warp'].includes(V.state.state), grab: V.params().grabDelay };
      }, [L, where]);
      check(r.killed && r.alive, `timed shot L${L} ${r.web} ${where}: killed=${r.killed} playerAlive=${r.alive} (grab delay ${r.grab && r.grab.toFixed(3)}s)` + (r.err ? ' ' + r.err : ''));
    }
  }

  // ---- 3. late shot / mid-flip shot does NOT save you ----
  for (const L of [1, 17]) {
    const r = await page.evaluate((L) => {
      const V = window.VORTEX; const web = window.__setup(L); V.emptyField();
      const n = V.state.spikes.length, lane = Math.floor(n / 2);
      V.setLane(lane, 0);
      const id = V.spawn('flipper', lane + 1, 0);
      const me = () => V.enemyList().find(e => e.id === id);
      V.step(3, () => { const e = me(); return e && e.flipping && e.ft > 0.55; });   // mid-flip into our lane
      V.key('Space', true); V.step(1 / 120); V.key('Space', false);
      V.step(1.0);
      return { web, survived: !!me() || V.state.state === 'dying', state: V.state.state, kind: V.deathKind() };
    }, L);
    check(r.state === 'dying' || r.state === 'gameover', `mid-flip shot L${L} ${r.web}: shot ignored, player grabbed (${r.state}, ${r.kind})`);
  }

  // ---- 4. fuseball on the rim cannot be shot; a flipper arriving on the claw's edge grabs instantly ----
  {
    const r = await page.evaluate(() => {
      const V = window.VORTEX; window.__setup(6); V.emptyField();
      const n = V.state.spikes.length, lane = Math.floor(n / 2);
      V.setLane(lane, 0); const id = V.spawn('fuseball', lane + 3, 0.02);
      V.step(1, () => { const e = V.enemyList().find(e => e.id === id); return e && e.atRim; });
      let hit = false; V.key('Space', true);
      for (let i = 0; i < 240 && V.state.state === 'play'; i++) { V.step(1 / 120); if (!V.enemyList().find(e => e.id === id)) { hit = true; break; } }
      V.key('Space', false);
      return { hit, state: V.state.state, kind: V.deathKind() };
    });
    check(!r.hit && r.state === 'dying', `rim fuseball invulnerable and hunts: shotDown=${r.hit} state=${r.state} (${r.kind})`);
    const r2 = await page.evaluate(() => {
      const V = window.VORTEX; window.__setup(2); V.emptyField();
      const n = V.state.spikes.length, lane = Math.floor(n / 2);
      V.setLane(lane, 1);                         // claw on the +1 edge; flipper comes from lane+1 (dir -1)
      V.spawn('flipper', lane + 1, 0); V.key('Space', true);
      const t = V.step(2, () => V.state.state !== 'play'); V.key('Space', false);
      return { t, state: V.state.state, kind: V.deathKind() };
    });
    check(r2.state === 'dying', `edge sub-position grabbed by incoming rim flipper despite held fire: ${r2.state} after ${r2.t.toFixed(2)}s`);
  }

  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
