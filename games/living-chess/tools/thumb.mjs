// node tools/thumb.mjs -> thumb.png (960x600) rendered from the real game: a tense middlegame, a terrified Bishop pleading
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core');
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await p.goto('http://localhost:8080/games/living-chess/?fast=1&mute=1&q=3', { timeout: 180000 });
await p.waitForFunction(() => window.LCG && LCG.booted, null, { timeout: 180000 });
await p.evaluate(() => LCG.api.newSolo(0, 0, 0, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5']));
await p.waitForFunction(() => LCG.api.state().hasThoughts, null, { timeout: 120000 });
await p.addStyleTag({ content: '#side,#topbar,#home,#toast,#pv{display:none!important} #thumbt{position:fixed;z-index:50;left:34px;bottom:30px;font:900 70px/0.92 Georgia,serif;letter-spacing:2px;color:#fff1d0;text-shadow:0 0 26px rgba(255,170,60,.55),0 4px 14px #000,0 0 40px #000,0 0 80px rgba(0,0,0,.8)} #thumbt small{display:block;font:700 19px/1.5 Georgia,serif;letter-spacing:5px;color:#ffc35a}' });
await p.evaluate(() => { const R = LCG.R; R.setInsets({ top: 0, bottom: 0, left: 0, right: 0 }); const c = R.charAt(LC.sqIdx('c4')); R.shot(c.root.position.clone().setY(0.6), { dist: 4.6, el: 0.42, yaw: 0.45, hold: 999, k: 3, focus: 0.5 }); });
await p.evaluate(() => { const R = LCG.R; const set = (sq, emo, g) => { const c = R.charAt(LC.sqIdx(sq)); if (c) { c.setState(emo, 1, g); } }; set('c4', 'terror', 'cower'); { const c = R.charAt(LC.sqIdx('g5')), t = R.charAt(LC.sqIdx('f7')); if (c && t) c.setState('thrill', 1, 'point', t.root.position.clone().setY(0.5)); } set('e4', 'anxiety', 'glance'); set('d1', 'pride', 'beckon'); });
await p.waitForTimeout(6000);
await p.evaluate(() => { const d = document.createElement('div'); d.id = 'thumbt'; d.innerHTML = '<small>EVERY PIECE IS ALIVE · 1–2 PLAYERS</small>THE LIVING<br>BOARD'; document.body.appendChild(d); });
await p.waitForTimeout(400);
await p.screenshot({ path: '/workspace/arcade/games/living-chess/thumb.png' });
await b.close();
