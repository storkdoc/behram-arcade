// Renders thumb.png (960x600) from the live game.
// Server at the repo root: python3 -m http.server 8091
//   node games/cubertron/tools/thumb.mjs
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
await p.goto('http://127.0.0.1:8091/games/cubertron/?play=1&seed=4', { waitUntil: 'load' });
await p.waitForFunction(() => window.CUBERTRON && CUBERTRON.booted);
await p.evaluate(() => {
  const g = CUBERTRON.game;
  g.cubes.forEach((c, i) => { if (c.kind !== 'mover' && i % 3 !== 1) c.prog = c.need; });
  g.spawnFoe('hopper', 2, 0);
  g.spawnFoe('roller', 1, 2);
  g.bannerT = 0;
  document.getElementById('hud').hidden = true;
  document.getElementById('home').style.display = 'none';
  const sticker = document.querySelector('#mood-sticker, .mood-sticker, button.mood');
  if (sticker) sticker.style.display = 'none';
});
await p.waitForTimeout(500);
await p.screenshot({ path: out });
await b.close();
console.log('wrote', out);
