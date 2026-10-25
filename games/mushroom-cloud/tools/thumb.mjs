// node tools/thumb.mjs  -> thumb.png (960x600) from a live render
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core');
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8080/games/mushroom-cloud/?q=3');
await p.waitForFunction(() => window.MC && MC.screen === 'title', null, { timeout: 90000 });
await p.evaluate(() => { const S = MC.sim; MC.app.cfg.scenario = 'second'; MC.app.cfg.bloc = 0; MC.app.cfg.opp = 1; MC.startSP(); const g = MC.game;
  MC.app.speed = 1; });
await p.waitForFunction(() => MC.game.detonations >= 3, null, { timeout: 120000, polling: 500 }).catch(() => {});
await p.evaluate(() => { MC.app.slow = 0.05; MC.app.slowUntil = performance.now() + 60000; });
await p.evaluate(() => { const D = MC.globe.fx.dets, d = D[D.length - 1] || { lat: 45, lon: -90 }; MC.globe.focus(d.lat - 10, d.lon + 10, 2.1); MC.app.hints = false; });
await p.waitForTimeout(3000);
await p.addStyleTag({ content: '#hud,#hint,#home,#bigmsg,#toast{display:none!important} #thumbt{position:fixed;left:44px;bottom:40px;font:900 76px/0.92 "Helvetica Neue",Arial,sans-serif;letter-spacing:2px;color:#f6efe2;text-shadow:0 0 30px rgba(255,140,60,.55),0 4px 14px #000} #thumbt small{display:block;font:600 15px monospace;letter-spacing:6px;color:#ffb347;margin-bottom:10px}' });
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'thumbt'; d.innerHTML = '<small>DEFCON 1</small>MUSHROOM<br>CLOUD'; document.body.appendChild(d); });
await p.waitForTimeout(500);
await p.screenshot({ path: '/workspace/arcade/games/mushroom-cloud/thumb.png' });
await b.close();
