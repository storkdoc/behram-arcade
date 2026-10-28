// Renders games/reactor/thumb.png (960x600, 16:10). Needs a local server:
//   python3 -m http.server 8765 --directory <repo>; node games/reactor/tools/thumb.mjs [url]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (_) { pw = require('/workspace/tools/node_modules/playwright-core'); }
import { fileURLToPath } from 'url'; import path from 'path';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'thumb.png');
const url = process.argv[2] || 'http://localhost:8765/games/reactor/?fast&preserve&q=3';
const b = await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
await p.goto(url); await p.waitForFunction(() => window.RX && RX.booted); await p.waitForTimeout(600);
await p.evaluate(() => {
  RX.startShift(); RX.closeCard && RX.closeCard(); RX.s.n = 1.04; 
  const st = document.createElement('style'); st.textContent = '#console,#qbar,#toasts,#hud,#hint,#labels,#teach,#faults,#home,#tutbox{display:none!important} #app{grid-template-columns:1fr!important}';
  document.head.appendChild(st); dispatchEvent(new Event('resize'));
  const t = document.createElement('div'); t.style.cssText = 'position:fixed;left:34px;bottom:30px;z-index:99;font:900 76px/1 system-ui,Helvetica,Arial,sans-serif;letter-spacing:.06em;color:#eef4ff;text-shadow:0 0 24px rgba(80,160,255,.8),0 4px 0 #000';
  t.innerHTML = 'MELT<span style="color:#ff5a3c;text-shadow:0 0 28px rgba(255,80,40,.9),0 4px 0 #000">DOWN</span><div style="font:700 16px system-ui,Arial;letter-spacing:.3em;color:#9fc4ff;margin-top:10px">KEEP THE CORE COVERED</div>';
  document.body.appendChild(t);
});
await p.waitForTimeout(2500);
await p.evaluate(() => { RX.R.fx('alarm'); });
await p.waitForTimeout(300);
await p.screenshot({ path: out }); console.log('wrote', out); await b.close();
