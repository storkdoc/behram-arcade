// node tools/thumb.mjs -> thumb.png (960x600) from a live render of the CPU-vs-CPU attract game
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core');
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8080/games/tank-duel/?q=3');
await p.waitForFunction(() => window.TD && TD.screen === 'title', null, { timeout: 90000 });
await p.addStyleTag({ content: '.screen,#hud,#toast,#banner,#home{display:none!important} #thumbt{position:fixed;left:40px;bottom:34px;font:900 84px/0.9 "Helvetica Neue",Arial,sans-serif;letter-spacing:3px;color:#fff3d6;text-shadow:0 0 28px rgba(255,170,60,.6),0 4px 14px #000} #thumbt small{display:block;font:700 22px/1.4 monospace;letter-spacing:6px;color:#ffc35a}' });
// wait for a moment with flying shells / fresh explosion
await p.waitForFunction(() => { const g = TD.attract && TD.attract.g; return g && g.shells.length >= 1 && g.t > 6; }, null, { timeout: 120000, polling: 100 }).catch(() => {});
await p.waitForTimeout(250);
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'thumbt'; d.innerHTML = '<small>26 GAME VARIATIONS · 1–2 PLAYERS</small>TANK<br>DUEL'; document.body.appendChild(d); });
await p.waitForTimeout(150);
await p.screenshot({ path: '/workspace/arcade/games/tank-duel/thumb.png' });
await b.close();
