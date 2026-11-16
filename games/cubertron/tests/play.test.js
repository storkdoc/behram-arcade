/* CUBERTRON: loads clean, and touch can hop and fire.
   From the repo root, with a static server:
     python3 -m http.server 8091
     NODE_PATH=<dir with playwright-core> node games/cubertron/tests/play.test.js
   Env: BASE, CHROME */
const { chromium, devices } = require('playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8091/';
const URL = BASE + 'games/cubertron/';
let fails = 0;
const check = (ok, msg, extra) => {
  if (!ok) fails++;
  console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
};

(async () => {
  const b = await chromium.launch({
    executablePath: process.env.CHROME || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  });
  const open = async (opts, url) => {
    const c = await b.newContext({ ...opts, hasTouch: true });
    const p = await c.newPage();
    p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('response', r => { if (r.status() >= 400) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(url, { waitUntil: 'load' });
    await p.waitForFunction(() => window.CUBERTRON && CUBERTRON.booted, null, { timeout: 20000 });
    await p.waitForTimeout(400);
    return p;
  };

  console.log('== title');
  const title = await open({ viewport: { width: 1280, height: 800 } }, URL);
  check(await title.evaluate(() => CUBERTRON.screen === 'title' && CUBERTRON.game.demo === true), 'title screen runs the attract mode');
  check(title.errs.length === 0, 'title: no console errors', title.errs.slice(0, 4));
  await title.context().close();

  async function play(label, opts) {
    console.log('== ' + label);
    const p = await open(opts, URL + '?play=1&seed=1');
    check(p.errs.length === 0, label + ': loads with no console errors', p.errs.slice(0, 4));
    const audio = await p.evaluate(() => ({
      cross: document.querySelector('audio').getAttribute('crossorigin'),
      playsinline: document.querySelector('audio').getAttribute('playsinline')
    }));
    check(audio.cross == null && audio.playsinline != null, label + ': music element has no crossorigin', audio);

    const frame = await p.evaluate(() => {
      const vp = { w: innerWidth, h: innerHeight };
      const off = CUBERTRON.game.cubes.filter(c => c.kind !== 'mover').filter(c => {
        const s = CUBERTRON.projectCell(c.q, c.r);
        return s.behind || s.x < -2 || s.y < -2 || s.x > vp.w + 2 || s.y > vp.h + 2;
      }).map(c => c.q + ',' + c.r);
      return { off, vp };
    });
    check(frame.off.length === 0, label + ': every cube is on screen', frame);

    const hop = await p.evaluate(() => {
      const g = CUBERTRON.game;
      const n = [{ q: g.player.q + 1, r: g.player.r }, { q: g.player.q, r: g.player.r + 1 }].find(c => g.hasFooting(c.q, c.r));
      return { hops: g.hops, n, spot: CUBERTRON.projectCell(n.q, n.r) };
    });
    await p.touchscreen.tap(hop.spot.x, hop.spot.y);
    await p.waitForFunction(h => CUBERTRON.game.hops > h, hop.hops, { timeout: 4000 });
    const hopped = await p.evaluate(n => {
      const pl = CUBERTRON.game.player;
      const toward = pl.hop && pl.hop.tq === n.q && pl.hop.tr === n.r;
      const there = pl.q === n.q && pl.r === n.r;
      return toward || there;
    }, hop.n);
    check(hopped, label + ': tap on a neighboring cube hops there', hop.n);

    await p.waitForTimeout(500);
    const foe = await p.evaluate(() => {
      const g = CUBERTRON.game;
      const cubes = g.cubes.filter(c => c.kind !== 'mover' && !(c.q === g.player.q && c.r === g.player.r));
      let best = cubes[0], bestD = -1;
      for (const c of cubes) {
        const s = CUBERTRON.projectCell(c.q, c.r);
        if (s.x < 48 || s.y < 90 || s.x > innerWidth - 48 || s.y > innerHeight - 90) continue;
        const d = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight / 2);
        if (d > bestD) { bestD = d; best = c; }
      }
      const id = CUBERTRON.spawn('hopper', best.q, best.r);
      return { id, pos: CUBERTRON.projectFoe(id), fired: g.shotsFired };
    });
    await p.touchscreen.tap(foe.pos.x, foe.pos.y);
    await p.waitForFunction(n => CUBERTRON.game.shotsFired > n, foe.fired, { timeout: 3000 });
    const fired = await p.evaluate(id => {
      const g = CUBERTRON.game;
      const f = g.foes.find(o => o.id === id);
      return { shots: g.shotsFired, hp: f ? f.hp : 0, gone: !f, unlocked: CUBERTRON.audio.unlocked };
    }, foe.id);
    check(fired.shots > foe.fired, label + ': tap on a drone fires', fired);
    check(fired.unlocked, label + ': the first tap unlocks audio');
    check(p.errs.length === 0, label + ': still no console errors', p.errs.slice(0, 4));
    await p.context().close();
  }

  await play('desktop', { viewport: { width: 1280, height: 800 } });
  await play('iPhone', devices['iPhone 13']);
  await play('landscape', { viewport: { width: 844, height: 390 } });

  console.log('== keyboard');
  const keys = await open({ viewport: { width: 1100, height: 700 } }, URL + '?play=1&seed=2');
  const h0 = await keys.evaluate(() => CUBERTRON.game.hops);
  await keys.keyboard.press('ArrowDown');
  await keys.waitForFunction(h => CUBERTRON.game.hops > h, h0, { timeout: 4000 });
  check(true, 'arrow key hops');
  const f0 = await keys.evaluate(() => CUBERTRON.game.shotsFired);
  await keys.keyboard.press('Space');
  await keys.waitForTimeout(200);
  check(await keys.evaluate(n => CUBERTRON.game.shotsFired > n, f0), 'space fires');
  check(keys.errs.length === 0, 'keyboard: no console errors', keys.errs.slice(0, 4));
  await keys.context().close();

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
