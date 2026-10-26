// Page tests: node tests/game.test.mjs [chromium|webkit] [devices,comma] — title, cinematic, stations, touch, cockpit, detonation; no black regions.
import { createRequire } from 'module'; const require = createRequire('/workspace/tools/');
const { chromium, webkit } = require('playwright-core');
const eng = process.argv[2] || 'chromium', only = (process.argv[3] || 'desktop,iphoneP,iphoneL,ipad').split(',');
const UAi = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const UAp = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DEV = { desktop: { viewport: { width: 1280, height: 800 } }, iphoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: eng !== 'webkit', userAgent: UAi },
  iphoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: eng !== 'webkit', userAgent: UAi }, ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, hasTouch: true, isMobile: eng !== 'webkit', userAgent: UAp } };
let fails = 0; const check = (ok, m, x) => { if (!ok) fails++; console.log((ok ? '  PASS ' : '  FAIL ') + eng + ' ' + m + (x === undefined ? '' : ' ' + JSON.stringify(x))); };
const B = eng === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const selfOK = async (p, tag) => { await p.evaluate(() => { BDEL.st.lastCheck = -999; BDEL._sc = BDEL.st.selfChecks; }); await p.waitForFunction(() => BDEL.st.selfChecks > BDEL._sc, null, { timeout: 20000 }).catch(() => {}); const s = await p.evaluate(() => BDEL.st.lastSelf); check(s && s.black < Math.max(3, s.n * 0.15), tag + ': no black regions (pixel readback)', s); };
for (const d of only) {
  const ctx = await B.newContext(DEV[d]); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404|AudioContext/.test(m.text())) errs.push(m.text()); });
  const touch = !!DEV[d].hasTouch, tap = async sel => { if (touch) await p.tap(sel); else await p.click(sel); };
  await p.goto('http://localhost:8080/games/by-dawns-early-light/'); await p.waitForFunction(() => window.BDEL && BDEL.screen === 'title', null, { timeout: 90000 });
  check(true, d + ' title'); await selfOK(p, d + ' title globe'); await p.screenshot({ path: `/tmp/gt_${eng}_${d}_1title.png` });
  check(await p.evaluate(() => document.body.classList.contains('touch')) === touch, d + ' touch mode detection');
  await tap('[data-a=campaign]'); await p.waitForFunction(() => BDEL.screen === 'play' && BDEL.cin.active, null, { timeout: 20000 });
  check(true, d + ' campaign starts with cold open'); await p.waitForTimeout(2500); await selfOK(p, d + ' cold open'); await p.screenshot({ path: `/tmp/gt_${eng}_${d}_2cine.png` });
  for (let i = 0; i < 10; i++) { if (!(await p.evaluate(() => BDEL.cin.active))) break; await tap('#cin'); await p.waitForTimeout(600); }
  check(!(await p.evaluate(() => BDEL.cin.active)), d + ' tap/click skips cinematics');
  await p.evaluate(() => { BDEL.cineOn = false; }); await p.waitForTimeout(500);
  await tap('.tab[data-st=map]'); await p.waitForTimeout(800); check(await p.evaluate(() => BDEL.station) === 'map', d + ' station tab works by ' + (touch ? 'tap' : 'click'));
  await selfOK(p, d + ' strategic map'); await p.screenshot({ path: `/tmp/gt_${eng}_${d}_3map.png` });
  const wb = await p.$('[data-cmd=recall]'); if (wb) { await wb.scrollIntoViewIfNeeded(); if (touch) await wb.tap(); else await wb.click(); await p.waitForTimeout(500); check(await p.evaluate(() => BDEL.view.me.wings.some(w => w.pend === 'recall' || w.state === 'recall')), d + ' RECALL button sends the order'); }
  await tap('.tab[data-st=post]'); await p.waitForTimeout(1200); await selfOK(p, d + ' command post'); await p.screenshot({ path: `/tmp/gt_${eng}_${d}_4post.png` });
  // detonation cinematic (window POV)
  await p.evaluate(() => { BDEL.cineOn = true; BDEL_T.playFilm('strike', { text: 'Federation missiles strike Plains bomber base.', on: 0 }); }); await p.waitForTimeout(eng === 'webkit' ? 4000 : 6000);
  await selfOK(p, d + ' detonation film'); await p.screenshot({ path: `/tmp/gt_${eng}_${d}_5nuke.png` }); await p.evaluate(() => BDEL.cin.skip()); await p.waitForTimeout(1200);
  // bomber cockpit
  await p.evaluate(() => { BDEL.cineOn = false; BDEL_T.startCockpit(0, 'HALBERD'); }); await p.waitForTimeout(3000);
  check(await p.evaluate(() => !!BDEL.cp && !document.getElementById('cockpit').hidden), d + ' cockpit opens'); await selfOK(p, d + ' cockpit');
  if (touch) { const bb = await p.$('#cpstick'); check(bb && await bb.isVisible(), d + ' touch stick visible'); const fl = await p.$('#cpflare'); if (fl) await fl.tap(); }
  await p.screenshot({ path: `/tmp/gt_${eng}_${d}_6cockpit.png` });
  check(errs.length === 0, d + ' no page errors', errs.slice(0, 3)); await ctx.close();
}
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); await B.close(); process.exit(fails ? 1 : 0);
