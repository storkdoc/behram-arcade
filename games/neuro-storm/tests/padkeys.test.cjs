// Keyboard + gamepad play (js/padkeys.js) on the classic 4K model and the GPU cortex (55K).
// Usage: serve the repo root (python3 -m http.server 8080), then
//   NODE_PATH=<dir with playwright-core> node games/neuro-storm/tests/padkeys.test.cjs
const { chromium } = require('playwright-core');
const BASE = process.env.BASE || 'http://localhost:8080/games/neuro-storm/';
// fake standard gamepad: window.__pad.buttons[i] = 1 presses button i, __pad.axes = [lx, ly, rx, ry]
const PAD = `(() => { window.__pad = { on: false, buttons: Array(17).fill(0), axes: [0, 0, 0, 0] };
  navigator.getGamepads = () => window.__pad.on ? [{ id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: performance.now(), axes: window.__pad.axes.slice(),
    buttons: window.__pad.buttons.map(v => ({ pressed: v > 0.5, value: v, touched: v > 0 })) }] : []; })();`;
let fails = 0;
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const quiet = p => p.waitForFunction(() => NS.S.quiet || NS.S.wave === 0, null, { timeout: 60000 }).catch(() => {});
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const q of ['?tier=4k', '?tier=55k']) {
    console.log(q);
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); await ctx.addInitScript(PAD);
    const p = await ctx.newPage(), errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + q); await p.waitForFunction('window.NS && (NS.ready || NS.fatal)', null, { timeout: 120000 });
    ok(!(await p.evaluate(() => NS.fatal)), `loads (${await p.evaluate(() => NS.renderer + ' N=' + NS.N)})`);
    await p.waitForTimeout(600);
    await p.evaluate(() => NS.setSpeed(100));
    ok(await p.evaluate(() => document.getElementById('reticle').hidden), 'reticle hidden until a key or stick is used');
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
    const ret = await p.evaluate(() => ({ shown: !document.getElementById('reticle').hidden, aimed: NS.pad.aimed() }));
    ok(ret.shown && ret.aimed != null, `arrow key shows the reticle over a neuron (#${ret.aimed})`);
    const paused0 = await p.evaluate(() => NS.S.paused);
    await p.keyboard.press('Space');
    await p.waitForFunction(() => NS.S.wave > 20, null, { timeout: 30000 }).catch(() => {});
    const s1 = await p.evaluate(() => ({ wave: NS.S.wave, sel: NS.net.sel, paused: NS.S.paused }));
    ok(s1.wave > 20 && s1.sel != null && s1.paused === paused0, `SPACE stimulates the aimed neuron and does not pause (${s1.wave} fired, #${s1.sel})`);
    await quiet(p);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => NS.S.wave > 20 && !NS.S.quiet, null, { timeout: 30000 }).catch(() => {});
    ok(await p.evaluate(() => NS.S.wave > 20), `ENTER sends the special volley (${await p.evaluate(() => NS.S.wave)} fired)`);
    const x0 = await p.evaluate(() => NS.pad.state.x);
    await p.keyboard.down('ArrowRight'); await p.waitForFunction(x0 => NS.pad.state.x > x0 + 40, x0, { timeout: 20000 }).catch(() => {}); await p.keyboard.up('ArrowRight');
    ok(await p.evaluate(x0 => NS.pad.state.x > x0 + 40, x0), 'holding an arrow moves the reticle');
    const th0 = await p.evaluate(() => NS.cam.tTheta);
    await p.keyboard.down('Shift'); await p.keyboard.down('ArrowRight'); await p.waitForFunction(th0 => Math.abs(NS.cam.tTheta - th0) > 0.2, th0, { timeout: 20000 }).catch(() => {}); await p.keyboard.up('ArrowRight'); await p.keyboard.up('Shift');
    ok(await p.evaluate(th0 => Math.abs(NS.cam.tTheta - th0) > 0.2, th0), 'SHIFT+arrow rotates the brain');
    await p.keyboard.press('p'); ok(await p.evaluate(() => NS.S.paused), 'P pauses'); await p.keyboard.press('p');
    ok(!(await p.evaluate(() => NS.S.paused)), 'P resumes');
    // gamepad
    await quiet(p);
    await p.evaluate(() => { window.__pad.on = true; window.dispatchEvent(new Event('gamepadconnected')); }); await p.waitForTimeout(200);
    await p.evaluate(() => { NS.pad.state.x = innerWidth / 2 - 120; NS.pad.state.y = innerHeight / 2 - 20; });
    await p.evaluate(() => { window.__pad.axes = [0.9, 0, 0, 0]; }); await p.waitForFunction(() => NS.pad.state.x > innerWidth / 2 - 120 + 30, null, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; });
    ok(await p.evaluate(() => NS.pad.state.x > innerWidth / 2 - 120 + 30), 'left stick moves the reticle');
    for (let k = 0; k < 20 && !(await p.evaluate(() => NS.pad.aimed() != null)); k++) await p.evaluate(() => { NS.pad.state.x += 25; });
    const w0 = await p.evaluate(() => (NS.S.quiet ? 0 : NS.S.wave));
    await p.evaluate(() => { window.__pad.buttons[0] = 1; }); await p.waitForFunction(() => NS.S.wave > 20 && !NS.S.quiet, null, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => { window.__pad.buttons[0] = 0; });
    await p.waitForFunction(() => NS.S.wave > 20 && !NS.S.quiet, null, { timeout: 30000 }).catch(() => {});
    ok(await p.evaluate(() => NS.S.wave > 20 && !NS.S.quiet), `gamepad A stimulates (${await p.evaluate(() => NS.S.wave)} fired, was ${w0})`);
    await p.evaluate(() => { window.__pad.buttons[9] = 1; }); await p.waitForFunction(() => NS.S.paused, null, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => { window.__pad.buttons[9] = 0; }); await p.waitForTimeout(300);
    ok(await p.evaluate(() => NS.S.paused), 'gamepad START pauses');
    const r0 = await p.evaluate(() => NS.cam.tRadius);
    await p.evaluate(() => { window.__pad.buttons[7] = 1; }); await p.waitForFunction(r0 => NS.cam.tRadius < r0 - 0.05, r0, { timeout: 20000 }).catch(() => {}); await p.evaluate(() => { window.__pad.buttons[7] = 0; });
    ok(await p.evaluate(r0 => NS.cam.tRadius < r0 - 0.05, r0), 'RT zooms in');
    // mouse still works and hides the reticle
    await p.mouse.click(5, 400).catch(() => {}); await p.waitForTimeout(100);
    ok(await p.evaluate(() => document.getElementById('reticle').hidden), 'pointer use hides the reticle');
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
