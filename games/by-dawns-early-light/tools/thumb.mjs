// node tools/thumb.mjs -> raw frame /tmp/bdel_thumb_raw.png (strike film, window POV mushroom), then PIL adds the title -> thumb.png 960x600
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const { chromium } = require('playwright-core'); const T = +(process.env.T || 8);
const B = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await B.newContext({ viewport: { width: 960, height: 600 } })).newPage();
await p.goto('http://localhost:8080/games/by-dawns-early-light/tests/render.html?m=cine&film=strike&q=2' + (process.env.X || ''));
await p.waitForFunction(() => window.cin, null, { timeout: 60000 });
await p.addStyleTag({ content: '#cin:before,#cin:after,.csub,.cskip{display:none!important}' });
await p.waitForFunction(t => !cin.active || cin.T >= t, T, { timeout: 300000 });
await p.screenshot({ path: '/tmp/bdel_thumb_raw.png' }); console.log(await p.evaluate(() => JSON.stringify({ T: cin.T, tier: st.tier }))); await B.close();
