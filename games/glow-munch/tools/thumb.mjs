// Renders thumb.png (960x600) from the live game.
// Server at the repo root: python3 -m http.server 8091
//   node games/glow-munch/tools/thumb.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright-core'); }
catch (e) { pw = createRequire('/tmp/pw/node_modules/playwright-core/package.json')('playwright-core'); }
const out = process.argv[2] || new URL('../thumb.png', import.meta.url).pathname;
const b = await pw.chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
});
const p = await (await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
await p.goto('http://127.0.0.1:8091/games/glow-munch/?play=1&seed=4', { waitUntil: 'load' });
await p.waitForFunction(() => window.GLOWMUNCH && GLOWMUNCH.booted);
await p.evaluate(() => {
  const g = GLOWMUNCH.game;
  g.phase = 'play';
  g.phaseT = 0;
  g.fright = 0;
  g.player.x = 13;
  g.player.y = 17;
  g.player.dir = 0;
  g.player.meter = 80;
  const spots = [[18, 17, 2], [9, 17, 0], [13, 22, 3], [21, 14, 2]];
  g.ghosts.forEach((gh, i) => {
    gh.x = spots[i][0];
    gh.y = spots[i][1];
    gh.dir = spots[i][2];
    gh.mode = 'chase';
  });
  g.pops.push({ x: 15, y: 16.2, text: '200', kind: 'chain', life: 0.85, sparked: true });
  document.getElementById('hud').hidden = true;
  document.getElementById('home').style.display = 'none';
  document.querySelectorAll('#mood-sticker, .mood-sticker, button.mood').forEach(el => { el.style.display = 'none'; });
  const sticker = document.querySelector('[class*=mood], [id*=mood]');
  if (sticker) sticker.style.display = 'none';
});
await p.waitForTimeout(250);
await p.screenshot({ path: out });
await b.close();
console.log('wrote', out);
