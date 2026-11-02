// Invader animation test (headless Chrome): every alien type gets live animation state, combat ships charge and
// fire (cosmetic bolts + 'efire' sound), Bombards charge before shelling, and kills break into tumbling wrecks
// that fade away again, all without console errors.
// Usage: node games/heliopause/tests/anim.test.js [baseUrl]   (serve the repo root)
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { ({ chromium } = require('/workspace/tools/node_modules/playwright-core')); }
const BASE = process.argv[2] || 'http://localhost:8091/games/heliopause/';
const OUT = process.env.SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let fail = 0; const check = (ok, name, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); if (!ok) fail++; };
  await page.goto(BASE); await sleep(400); await page.click('#beginBtn'); await sleep(600);
  const types = await page.evaluate(() => {
    HP.startGame(0, 'commander'); const s = HP.sim; s.metals = 99999; HP.launch();
    window._ev = {}; const R = HP.R, o = R.onSfx; R.onSfx = e => { window._ev[e.k] = (window._ev[e.k] || 0) + 1; o(e); };
    const sf = HP.AU.sfxEvent.bind(HP.AU); HP.AU.sfxEvent = e => { window._ev['au_' + e.k] = (window._ev['au_' + e.k] || 0) + 1; sf(e); };
    s.aliens.length = 0; const E = s.bp.earth, T = Object.keys(HPD.ALIENS);
    T.forEach((t, i) => { const g = i / T.length * Math.PI * 2, r = HPD.ALIENS[t].boss ? 130 : 62; const a = s.spawn(t, null, E.x + Math.cos(g) * r, E.y + Math.sin(g) * r); a.hp = a.hpMax = 1e9; a.spd = 0; });
    return T;
  });
  await sleep(4500);
  if (OUT) await page.screenshot({ path: OUT + '/anim-1-fleet.png' });
  const st = await page.evaluate(() => { const R = HP.R, s = HP.sim, seen = {}; s.aliens.forEach(a => { if (R.anim[a.id]) seen[a.type] = 1; }); return { seen: Object.keys(seen), n: s.aliens.length, ev: window._ev, bolts: R.bolts.length }; });
  const missing = types.filter(t => st.seen.indexOf(t) < 0);
  check(!missing.length, 'every alien type has animation state', missing.length ? missing : st.seen.length);
  check((st.ev.efire || 0) > 0 && (st.ev.au_efire || 0) > 0, 'combat ships charge and fire (efire)', st.ev);
  const kill = await page.evaluate(() => { const s = HP.sim; s.aliens.slice().forEach(a => { if (a.alive) { a.hp = 1; s.kill(a); } }); return s.aliens.filter(a => a.alive).length; });
  await sleep(250);
  const w = await page.evaluate(() => ({ wrecks: HP.R.wrecks.length, shards: HP.R.wrecks.reduce((n, w) => n + w.p.length, 0), ev: window._ev }));
  if (OUT) await page.screenshot({ path: OUT + '/anim-2-wrecks.png' });
  check(w.wrecks > 5 && w.shards > 20, 'kills break into tumbling wrecks', { wrecks: w.wrecks, shards: w.shards, alive: kill });
  check((w.ev.au_kill || 0) > 0, 'death sounds play', w.ev.au_kill);
  await sleep(5000);
  const left = await page.evaluate(() => ({ wrecks: HP.R.wrecks.length, anim: Object.keys(HP.R.anim).length, alive: HP.sim.aliens.filter(a => a.alive).length, pops: window._ev.epop || 0 }));
  check(left.wrecks === 0 && left.anim <= left.alive, 'wrecks fade out and dead ships release their animation state', left);
  // every new invader sound renders without throwing
  await page.evaluate(() => { ['efire', 'echarge', 'epop', 'shell', 'launch', 'raid', 'impact', 'spawn'].forEach(k => Object.keys(HPD.ALIENS).forEach(t => HP.AU.sfxEvent({ k: k, type: t, x: 0, boss: !!HPD.ALIENS[t].boss }))); });
  await sleep(600);
  check(!errs.length, 'no console errors', errs.slice(0, 5));
  await browser.close();
  console.log(fail ? 'ANIM FAIL ' + fail : 'ANIM OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
