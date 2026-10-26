// film contact sheet: node tests/film.mjs <film> <prefix> [engine] [dev] [extra-query] — screenshots at intervals across the whole film
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const { chromium, webkit } = require('playwright-core');
const [,, film = 'coldopen', pre = '/tmp/film', eng = 'chromium', dev = 'desktop', extra = ''] = process.argv;
const B = eng === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const D = { desktop: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }, iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: eng !== 'webkit', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' } }[dev];
const ctx = await B.newContext(D); const p = await ctx.newPage(); const logs = [];
p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
await p.goto(`http://localhost:8080/games/by-dawns-early-light/tests/render.html?m=cine&film=${film}${extra}`);
await p.waitForFunction(() => window.cin, null, { timeout: 30000 });
const marks = (process.env.MARKS || '').split(',').filter(Boolean).map(s => s.split(':').map(Number)); let n = 0;
for (const [si, t] of marks) { await p.waitForFunction(([si, t]) => !cin.active || cin.si > si || (cin.si === si && cin.T >= t), [si, t], { timeout: 120000 }).catch(() => logs.push('timeout ' + si + ':' + t));
  const f = `${pre}-${n++}.png`; await p.screenshot({ path: f }); const i = await p.evaluate(() => ({ si: cin.si, T: +cin.T.toFixed(1), tier: st.tier, fr: __frames, sub: document.querySelector('.csub').textContent.slice(0, 50) })); console.log(f, JSON.stringify(i)); }
console.log(logs.slice(0, 12).join('\n')); await B.close();
