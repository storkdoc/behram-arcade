// node tools/thumb.mjs [port] -> thumb.png (960x600) rendered from the real game's title scene (serve repo root first)
import { createRequire } from 'module'; import { fileURLToPath } from 'url'; import path from 'path';
const require = createRequire('/workspace/tools/'); const pw = require('playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url)), port = process.argv[2] || '8090';
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:${port}/games/congressional-obgyn/`); await p.waitForFunction(() => window.COB && COB.booted);
await p.evaluate(() => COBAccess.makeCode().then(c => localStorage.setItem('cob.access', JSON.stringify({ code: c.code }))));
await p.reload(); await p.waitForFunction(() => window.COB && COB.booted); await p.waitForTimeout(1200);
await p.addStyleTag({ content: '.title-wrap,#home,.instructor-btn,.doc .tagline,#toasts{display:none!important} .doc{width:400px!important;right:10px!important} .doc .bubble{display:block!important;right:74%!important;top:3%!important;max-width:240px;font-size:16px} #tt{position:fixed;z-index:50;left:36px;top:150px;font:400 54px/1 Georgia,serif;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.7),0 0 40px rgba(14,33,54,.8)} #tt b{display:block;font:800 76px/1 system-ui,sans-serif;letter-spacing:4px;color:#ff8fab} #tt small{display:block;margin-top:12px;font:italic 26px Georgia,serif;color:#ffd27a}' });
await p.evaluate(() => { document.querySelector('.doc .bubble').textContent = 'Exam 3 is ready for you, doctor!'; const d = document.createElement('div'); d.id = 'tt'; d.innerHTML = 'Congressional<b>OB GYN</b><small>Clinic Day with Dr. Behram</small>'; document.body.appendChild(d); });
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(here, '..', 'thumb.png') });
await b.close();
