// quick render screenshots: node tests/shot.mjs <url-suffix> <out.png> [engine] [wait ms]
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const { chromium, webkit } = require('playwright-core');
const [,, suf, out, eng = 'chromium', wait = '4000', dev = 'desktop'] = process.argv;
const B = eng === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const D = { desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: eng !== 'webkit', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } }[dev];
const ctx = await B.newContext(D); const p = await ctx.newPage(); const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
if (process.env.EVAL) p.on('load', () => {}); 
await p.goto('http://localhost:8080/games/by-dawns-early-light/' + suf); await p.waitForTimeout(+wait); if (process.env.EVAL) { await p.evaluate(process.env.EVAL); await p.waitForTimeout(600); }
await p.screenshot({ path: out }); const info = await p.evaluate(() => window.st ? { tier: st.tier, self: st.lastSelf, frames: window.__frames, bh: st.blackHoles } : null).catch(e => String(e));
console.log(JSON.stringify(info)); console.log(logs.slice(0, 15).join('\n')); await B.close();
