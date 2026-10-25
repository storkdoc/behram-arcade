// quick smoke: node tests/smoke.mjs [chromium|webkit] [w] [h]
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const pw = require('playwright-core');
const eng = process.argv[2] || 'chromium', W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const b = eng === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = []; p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); }); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
await p.goto('http://localhost:8080/games/mushroom-cloud/');
await p.waitForFunction(() => window.MC && MC.screen === 'title', null, { timeout: 60000 }).catch(e => errs.push('no title'));
await p.waitForTimeout(1500); await p.screenshot({ path: `/tmp/mc-${eng}-title.png` });
await p.click('[data-act=sp]'); await p.waitForTimeout(500); await p.screenshot({ path: `/tmp/mc-${eng}-select.png` });
await p.click('#bstart'); await p.waitForTimeout(500);
if (await p.evaluate(() => MC.screen) === 'brief') { await p.screenshot({ path: `/tmp/mc-${eng}-brief.png` }); await p.click("[data-act=bskip]"); await p.waitForTimeout(300); }
console.log('screen', await p.evaluate(() => MC.screen));
await p.waitForTimeout(1500); await p.screenshot({ path: `/tmp/mc-${eng}-deploy.png` });
console.log(errs.join('\n')); await b.close();
