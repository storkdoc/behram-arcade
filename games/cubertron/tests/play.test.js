/* CUBERTRON maze shooter: loads clean, tap-to-move, tap-to-fire, keyboard.
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
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForFunction(() => window.CUBERTRON && CUBERTRON.booted, null, { timeout: 20000 });
    await p.waitForTimeout(350);
    return p;
  };

  console.log('== title');
  const title = await open({ viewport: { width: 1100, height: 700 } }, URL);
  check(await title.evaluate(() => CUBERTRON.screen === 'title'), 'title screen is up');
  check(title.errs.length === 0, 'title: no console errors', title.errs.slice(0, 3));
  await title.context().close();

  async function play(label, opts) {
    console.log('== ' + label);
    const p = await open(opts, URL + '?play=1&seed=1');
    await p.evaluate(() => { CUBERTRON.game.player.inv = 30; });
    check(p.errs.length === 0, label + ': loads with no console errors', p.errs.slice(0, 3));
    const audio = await p.evaluate(() => ({ cross: document.querySelector('audio').getAttribute('crossorigin'), inline: document.querySelector('audio').getAttribute('playsinline') }));
    check(audio.cross == null && audio.inline != null, label + ': music element has no crossorigin', audio);

    const spot = await p.evaluate(() => {
      const g = CUBERTRON.game;
      let best = null;
      for (let z = 1.2; z < g.ROWS - 1.2; z += 0.55) {
        for (let x = 1.2; x < g.COLS - 1.2; x += 0.55) {
          if (!g.openAt(x, z)) continue;
          if (Math.hypot(x - g.player.x, z - g.player.z) < 1.1) continue;
          const s = CUBERTRON.project(x, z);
          if (s.behind || s.x < 48 || s.y < 96 || s.x > innerWidth - 48 || s.y > innerHeight - 110) continue;
          const el = document.elementFromPoint(s.x, s.y);
          if (!el || el.id !== 'gl') continue;
          let clear = 999;
          for (const r of g.robots) {
            const rs = CUBERTRON.project(r.x, r.z);
            clear = Math.min(clear, Math.hypot(rs.x - s.x, rs.y - s.y));
          }
          if (clear < 90) continue;
          const center = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight / 2);
          if (!best || center < best.center) best = { x, z, s, clear, center, px: g.player.x, pz: g.player.z };
        }
      }
      return best;
    });
    check(!!spot && spot.clear > 80, label + ': found an open floor point away from sentries', spot && { clear: Math.round(spot.clear) });
    if (spot) {
      const before = Math.hypot(spot.px - spot.x, spot.pz - spot.z);
      const shotsBefore = await p.evaluate(() => CUBERTRON.game.shotsFired);
      await p.touchscreen.tap(spot.s.x, spot.s.y);
      await p.waitForTimeout(450);
      const after = await p.evaluate((s) => {
        const g = CUBERTRON.game;
        const pl = g.player;
        const bolt = g.bullets[g.bullets.length - 1];
        const dx = s.x - s.px, dz = s.z - s.pz;
        const aimed = !!(bolt && bolt.vx * dx + bolt.vz * dz > 0);
        return { dist: Math.hypot(pl.x - s.x, pl.z - s.z), shots: g.shotsFired, aimed };
      }, spot);
      check(after.dist < before - 0.12 && after.shots > shotsBefore, label + ': one tap walks toward the point and fires that way', { before: +before.toFixed(2), after: +after.dist.toFixed(2), shotsBefore, shots: after.shots, aimed: after.aimed });
    }

    const visibleBot = () => p.evaluate(() => {
      const g = CUBERTRON.game;
      let best = null;
      for (const r of g.robots) {
        const s = CUBERTRON.project(r.x, r.z);
        if (s.behind || s.x < 30 || s.y < 80 || s.x > innerWidth - 30 || s.y > innerHeight - 80) continue;
        const el = document.elementFromPoint(s.x, s.y);
        if (!el || el.id !== 'gl') continue;
        const center = Math.hypot(s.x - innerWidth / 2, s.y - innerHeight / 2);
        if (!best || center < best.center) best = { id: r.id, s, center };
      }
      return { bot: best, shots: g.shotsFired };
    });
    let bot = await visibleBot();
    if (!bot.bot) {
      await p.evaluate(() => {
        const g = CUBERTRON.game;
        const x = g.player.x + 1.35, z = g.player.z;
        if (g.openAt(x, z)) {
          const id = g.spawnRobot(x, z, 0);
          const bot = g.robots.find(r => r.id === id);
          if (bot) bot.think = 30;
        }
      });
      await p.waitForTimeout(80);
      bot = await visibleBot();
    }
    if (bot.bot) {
      await p.evaluate(() => { CUBERTRON.game.player.cool = 0; });
      await p.touchscreen.tap(bot.bot.s.x, bot.bot.s.y);
      await p.waitForTimeout(120);
      const shots = await p.evaluate(() => CUBERTRON.game.shotsFired);
      check(shots > bot.shots, label + ': tap on a sentry fires', { before: bot.shots, after: shots });
    } else check(false, label + ': a sentry is on screen');
    check(await p.evaluate(() => CUBERTRON.audio.unlocked), label + ': the first tap unlocks audio');
    check(p.errs.length === 0, label + ': still no console errors', p.errs.slice(0, 3));
    await p.context().close();
  }

  await play('desktop', { viewport: { width: 1280, height: 800 } });
  await play('iPhone', devices['iPhone 13']);
  await play('landscape', { viewport: { width: 844, height: 390 } });

  console.log('== keyboard');
  const keys = await open({ viewport: { width: 1100, height: 700 } }, URL + '?play=1&seed=2');
  await keys.evaluate(() => { CUBERTRON.game.player.inv = 30; CUBERTRON.game.player.cool = 0; });
  const x0 = await keys.evaluate(() => CUBERTRON.game.player.x);
  await keys.keyboard.down('ArrowRight');
  await keys.waitForTimeout(400);
  await keys.keyboard.up('ArrowRight');
  const x1 = await keys.evaluate(() => CUBERTRON.game.player.x);
  check(x1 > x0 + 0.04, 'arrow key moves', { x0, x1 });
  await keys.waitForTimeout(350);
  const s0 = await keys.evaluate(() => CUBERTRON.game.shotsFired);
  await keys.keyboard.press('Space');
  await keys.waitForTimeout(80);
  const s1 = await keys.evaluate(() => CUBERTRON.game.shotsFired);
  check(s1 > s0, 'space fires', { s0, s1 });
  await keys.waitForTimeout(400);
  await keys.evaluate(() => { CUBERTRON.game.player.cool = 0; });
  await keys.keyboard.down('ShiftLeft');
  await keys.keyboard.press('ArrowUp');
  await keys.keyboard.up('ShiftLeft');
  await keys.waitForTimeout(40);
  const face = await keys.evaluate(() => ({ z: CUBERTRON.game.player.faceZ, shots: CUBERTRON.game.shotsFired }));
  check(face.z < -0.4 && face.shots > s1, 'shift plus arrow fires that way without needing to step', face);
  check(keys.errs.length === 0, 'keyboard: no console errors', keys.errs.slice(0, 3));
  await keys.context().close();

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
