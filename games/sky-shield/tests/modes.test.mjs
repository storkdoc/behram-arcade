// Launch-mode browser test (needs server at repo root). SS_URL=http://localhost:8080/games/sky-shield/ node games/sky-shield/tests/modes.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const ROOT = process.env.SS_URL || 'http://localhost:8080/games/sky-shield/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'ok   ' : 'FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(page, fn, ms = 12000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn)) return true; } catch (e) {} await wait(120); } return false; }
const b = await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function start(touch, launch) {
  const ctx = await b.newContext(touch ? { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/peerjs\.com/, r => r.abort());
  await page.goto(ROOT + '?nolock=1' + (touch ? '&touch=1' : ''));
  await until(page, () => window.SS && SS.booted && SS.app.screen === 'title');
  await page.evaluate(l => { SS.setAim('direct'); SS.setLaunch(l); }, launch);
  await page.evaluate(() => SS.newGame ? SS.newGame({}) : 0).catch(() => {});
  if (!(await until(page, () => SS.app.screen === 'play' && SS.g, 3000))) { await page.click('[data-act=solo]'); await page.click('[data-act=start]'); }
  await until(page, () => SS.g && SS.g.phase === 'play', 9000);
  return { page, ctx, errs };
}
const ammo = p => p.evaluate(() => SS.g.bases.map(b => b.ammo));
const diff = (a, c) => a.map((x, i) => x - c[i]);
// desktop closest mode
{ const { page, ctx, errs } = await start(false, 'closest');
  ok(await page.evaluate(() => localStorage.getItem('ss.launch') === '"closest"'), 'closest: persisted in localStorage');
  ok(await page.evaluate(() => /double-click = closest silo/.test(document.getElementById('tfoot').textContent)), 'closest: footer help updated');
  const W = 1280; await page.mouse.move(W * 0.08, 300); await wait(100);
  let a0 = await ammo(page); await page.keyboard.press('Space'); await wait(200); let d = diff(a0, await ammo(page));
  ok(d[0] === 1 && d[1] === 0 && d[2] === 0, `closest: Space aimed left fires LEFT silo (${d})`);
  await page.mouse.move(W * 0.92, 300); await wait(100);
  a0 = await ammo(page); await page.mouse.dblclick(W * 0.92, 300); await wait(200); d = diff(a0, await ammo(page));
  ok(d[2] === 1 && d[0] === 0 && d[1] === 0, `closest: double-click on right fires RIGHT silo once (${d})`);
  a0 = await ammo(page); await page.mouse.click(W * 0.5, 300); await wait(450); d = diff(a0, await ammo(page));
  ok(d.every(x => x === 0), `closest: a single click does not fire (${d})`);
  await page.evaluate(() => { SS.g.bases[0].ammo = 0; }); await page.mouse.move(W * 0.08, 300); await wait(100);
  a0 = await ammo(page); await page.keyboard.press('Space'); await wait(200); d = diff(a0, await ammo(page));
  ok(d[1] === 1, `closest: left empty -> CENTER fires (${d})`);
  a0 = await ammo(page); await page.keyboard.press('KeyD'); await wait(200); d = diff(a0, await ammo(page)); ok(d[2] === 1, `closest: D still fires right silo (${d})`);
  ok(!errs.length, 'closest: no page errors ' + errs.join(';')); await ctx.close(); }
// desktop L/C/R mode (original behaviour)
{ const { page, ctx, errs } = await start(false, 'lcr');
  ok(await page.evaluate(() => localStorage.getItem('ss.launch') === '"lcr"'), 'lcr: persisted');
  const W = 1280; await page.mouse.move(W * 0.92, 300); await wait(100);
  for (const [k, i] of [['KeyA', 0], ['KeyS', 1], ['KeyD', 2], ['KeyZ', 0], ['KeyX', 1], ['KeyC', 2]]) { const a0 = await ammo(page); await page.keyboard.press(k); await wait(180); const d = diff(a0, await ammo(page)); ok(d[i] === 1 && d.reduce((s, x) => s + x) === 1, `lcr: ${k} fires silo ${i} (${d})`); }
  const exp = await page.evaluate(() => SS.S.bestBase(SS.g, SS.g.cx, Math.max(SS.g.cy, 13)));
  let a0 = await ammo(page); await page.keyboard.press('Space'); await wait(200); let d = diff(a0, await ammo(page)); ok(d[exp] === 1, `lcr: Space fires best battery ${exp} (${d})`);
  a0 = await ammo(page); await page.mouse.click(W * 0.92, 300); await wait(200); d = diff(a0, await ammo(page)); ok(d.reduce((s, x) => s + x) === 1, `lcr: single click fires (${d})`);
  ok(!errs.length, 'lcr: no page errors'); await ctx.close(); }
// touch double-tap
{ const { page, ctx, errs } = await start(true, 'closest');
  await wait(300); const a0 = await ammo(page); await page.touchscreen.tap(60, 300); await wait(120); await page.touchscreen.tap(60, 300); await wait(250); const d = diff(a0, await ammo(page));
  ok(d.reduce((s, x) => s + x) === 1 && d[0] === 1, `touch: double-tap on left fires closest LEFT silo (${d})`);
  const a1 = await ammo(page); await page.tap('#tbtns .tb[data-b="2"]'); await wait(200); const d2 = diff(a1, await ammo(page)); ok(d2[2] === 1, `touch: R button still fires right (${d2})`);
  ok(!errs.length, 'touch: no page errors'); await ctx.close(); }
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
