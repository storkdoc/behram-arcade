// Renders thumb.png (960x600). Server at repo root on :8080.  node games/sky-shield/tools/thumb.mjs [wave]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const wave = +(process.argv[2] || 10), out = process.argv[3] || new URL('../thumb.png', import.meta.url).pathname;
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
await p.goto('http://localhost:8080/games/sky-shield/?nolock=1&q=3&touch=0'); await p.waitForFunction(() => window.SS && SS.app.screen === 'title');
await p.evaluate(async wave => {
  const w = t => new Promise(r => setTimeout(r, t));
  SS.app.startWave = wave; SS.newGame('solo', 20261026, wave);
  document.getElementById('hud').style.display = 'none'; document.getElementById('banner').style.display = 'none'; document.getElementById('toast').style.display = 'none';
  while (SS.g.phase !== 'play') await w(100);
  // let the sky fill with warheads, then knock a few down
  while (SS.g.foes.length < 7) await w(100);
  await w(2500);
  const g = SS.g; g.cities[1].alive = false; SS.R.fx([{ e: 'city', i: 1, x: g.cities[1].x, left: 5 }], g);
  const tg = g.foes.slice().sort((a, b) => b.y - a.y).slice(0, 3);
  for (const f of tg) { SS.cross.x = f.x + f.vx * 0.6; SS.cross.y = f.y + f.vy * 0.6; SS.fireBase(-1); await w(60); }
  await w(900);
  SS.app.paused = true;
  const d = document.createElement('div');
  d.innerHTML = '<div style="font:800 15px ui-monospace,Menlo,monospace;letter-spacing:.28em;color:#7dffd0;text-shadow:0 2px 8px #000">DEFEND THE CITIES · 1–2 PLAYERS</div><div style="font:900 92px/0.95 ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 0 24px rgba(120,255,210,.45),0 4px 18px #000;margin-top:6px">SKY<br>SHIELD</div>';
  d.style.cssText = 'position:fixed;left:40px;top:44px;z-index:99;pointer-events:none';
  document.body.appendChild(d);
}, wave);
await p.waitForTimeout(400);
await p.screenshot({ path: out });
await b.close(); console.log('wrote', out);
