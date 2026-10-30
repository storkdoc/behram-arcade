// VORTEX Day 3 (2026-10-30): gamepad rumble / touch vibration + audible-and-felt incoming-shot warning. Desktop (fake
// gamepad with a vibrationActuator) + iPhone 14 (navigator.vibrate stub: real iPhones have no vibration API, Android does).
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-haptics.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FAKE = () => {
  window.__rumble = []; window.__vib = []; window.__padA = false;
  const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 && window.__padA, value: i === 0 && window.__padA ? 1 : 0 })); },
    vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { window.__rumble.push({ t, ...o }); return Promise.resolve('complete'); } } };
  navigator.getGamepads = () => [pad, null, null, null];
  navigator.vibrate = ms => { window.__vib.push(ms); return true; };
};
async function suite(browser, label, ctxOpts, touchDev) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), errs = [];
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  await page.route(/textdb\.dev|ntfy\.sh/, r => r.abort());
  page.on('console', m => { if (m.type() === 'error' && !/textdb|ntfy|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(500);
  await page.evaluate(() => { localStorage.removeItem('vortex.haptics'); window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(1); VORTEX.step(4, () => VORTEX.state.state === 'play'); VORTEX.setLane(3, 0); });
  if (touchDev) { await page.touchscreen.tap(30, 300); }
  else { await page.evaluate(() => { window.__padA = true; }); await page.waitForFunction(() => VORTEX.haptics().src === 'pad', null, { timeout: 8000 }).catch(() => {}); await page.evaluate(() => { window.__padA = false; }); await page.waitForFunction(() => VORTEX.haptics().padHeld.length === 0, null, { timeout: 8000 }).catch(() => {}); await sleep(100); }
  const src = await page.evaluate(() => VORTEX.haptics().src);
  check(src === (touchDev ? 'touch' : 'pad'), `last input picks the haptic device (${src})`);
  await page.evaluate(() => { VORTEX.emptyField(); VORTEX.setInvincible(true); VORTEX.setAuto(false); VORTEX.setLane(3, 0); VORTEX.step(0.3); VORTEX.emptyField(); });   // smart auto-fire would shoot the incoming shot down
  // a shot climbing toward the claw's lane: exactly one warning cue (beep + buzz) as it crosses into the red-rim zone
  const r = await page.evaluate(() => { const c0 = VORTEX.shotWarnCues(); VORTEX.addEShot(VORTEX.playerLane(), 0.6); const seen = [], tr = []; for (let i = 0; i < 90; i++) { VORTEX.step(1 / 60); seen.push(VORTEX.shotWarnCues() - c0); if (i % 6 === 0) tr.push(VORTEX.eshotList().map(s => s.lane + ':' + s.z.toFixed(2)).join('|') || '-'); } return { tr: tr.join(' '), S: (({fire, auto, zapUses, pz, pos, aim}) => ({fire, auto, zapUses, pz, pos, aim}))(VORTEX.state), st: VORTEX.state.state, paused: VORTEX.state.paused, alive: VORTEX.state.lives, lane: VORTEX.playerLane(), cues: VORTEX.shotWarnCues() - c0, firstAt: seen.indexOf(1), log: VORTEX.haptics().log.map(x => x.n + ':' + x.dev) }; });
  check(r.cues === 1, `one incoming-shot cue per shot (${r.cues}, at frame ${r.firstAt})` + (r.cues === 1 ? '' : JSON.stringify(r)));
  check(r.log.includes('shotwarn:' + (touchDev ? 'touch' : 'pad')), 'shot cue reaches the device (' + r.log.slice(-3).join(' ') + ')');
  const off = await page.evaluate(() => { const c0 = VORTEX.shotWarnCues(); VORTEX.addEShot((VORTEX.playerLane() + 3) % VORTEX.webInfo().n, 0.5); for (let i = 0; i < 60; i++) VORTEX.step(1 / 60); return VORTEX.shotWarnCues() - c0; });
  check(off === 0, 'no cue for a shot in another lane');
  // death: a big rumble
  const d = await page.evaluate(() => { VORTEX.setInvincible(false); VORTEX.addEShot(VORTEX.playerLane(), 0.01); VORTEX.step(0.1); const k = VORTEX.deathKind(); VORTEX.step(6, () => VORTEX.state.state !== 'dying'); return { k, log: VORTEX.haptics().log.map(x => x.n + ':' + x.dev), rumble: window.__rumble.slice(-8), vib: window.__vib.slice() }; });
  check(d.k === 'shot' && d.log.includes('die:' + (touchDev ? 'touch' : 'pad')), 'death buzzes (' + d.log.slice(-3).join(' ') + ')');
  if (touchDev) check(d.vib.length >= 2 && d.vib.every(x => x > 0 && x <= 120), 'navigator.vibrate called with short pulses ' + JSON.stringify(d.vib));
  else check(d.rumble.some(x => x.t === 'dual-rumble' && x.duration >= 400 && x.strongMagnitude === 1), 'gamepad dual-rumble on death ' + JSON.stringify(d.rumble.slice(-2)));
  // H turns haptics off (stored), and nothing buzzes after that
  const h = await page.evaluate(() => { VORTEX.step(4, () => VORTEX.state.state === 'play'); return 1; });
  await page.keyboard.press('KeyH');
  if (touchDev) await page.touchscreen.tap(30, 300);
  const o = await page.evaluate(() => { const n0 = VORTEX.haptics().log.length; VORTEX.emptyField(); VORTEX.addEShot(VORTEX.playerLane(), 0.5); for (let i = 0; i < 60; i++) VORTEX.step(1 / 60); return { on: VORTEX.haptics().on, stored: localStorage.getItem('vortex.haptics'), n: VORTEX.haptics().log.length - n0 }; });
  check(!o.on && o.stored === 'false' && o.n === 0, `H toggles rumble off and it sticks (${JSON.stringify(o)})`);
  await page.keyboard.press('KeyH');
  check(await page.evaluate(() => VORTEX.haptics().on), 'H turns it back on');
  check(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await suite(browser, 'desktop 1440x900 + gamepad', { viewport: { width: 1440, height: 900 } }, false);
  await suite(browser, 'iPhone 14 (touch)', devices['iPhone 14'], true);
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
