// VORTEX Day 25 (2026-11-21): ANNOUNCER. Tempest 2000-style voice callouts through speechSynthesis (stubbed here so the
// test is deterministic): level start / SUPERZAPPER RECHARGE / EXCELLENT / power-ups / SHORT CIRCUIT / GAME OVER, one line at
// a time with priority + 4 s repeat guard, music ducks while it talks, silenced by mute, toggled by V key, pad R3 and a
// HOLD (0.6 s+, judged at release) on the touch mute button (a tap still just mutes). Also a run with the browser's real speechSynthesis.
//   python3 -m http.server 8137   then   NODE_PATH=/path/to/node_modules node games/tube-shooter/tests/vortex-voice.test.js http://localhost:8137
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
let fails = 0;
const check = (ok, label) => { console.log((ok ? 'PASS ' : 'FAIL ') + label); if (!ok) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const STUB = () => {
  window.__spoken = [];
  window.__padR3 = false; window.__padOn = false;
  const pad = { id: 'Fake pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], timestamp: 0,
    get buttons() { return Array.from({ length: 17 }, (_, i) => ({ pressed: i === 11 && window.__padR3, value: i === 11 && window.__padR3 ? 1 : 0 })); } };
  navigator.getGamepads = () => [window.__padOn ? pad : null, null, null, null];
  if (window.__realSpeech) return;
  const voices = [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Fred', lang: 'en-US', localService: true }, { name: 'Thomas', lang: 'fr-FR', localService: true }];
  const ss = { speaking: false, pending: false, cur: null, getVoices: () => voices, addEventListener() {},
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, pitch: u.pitch, vol: u.volume }); if (u.text.trim() === '') return; this.speaking = true; this.cur = u; setTimeout(() => { u.onstart && u.onstart(); }, 5); setTimeout(() => { if (this.cur === u) { this.speaking = false; this.cur = null; u.onend && u.onend(); } }, 700); },
    cancel() { const u = this.cur; this.speaking = false; this.cur = null; if (u && u.onerror) u.onerror({ error: 'interrupted' }); } };
  Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.volume = 1; this.pitch = 1; this.rate = 1; };
};
async function suite(browser, label, ctxOpts, touchDev, real) {
  console.log(`\n=== ${label} ===`);
  const ctx = await browser.newContext(ctxOpts), errs = [];
  if (real) await ctx.addInitScript(() => { window.__realSpeech = true; });
  await ctx.addInitScript(STUB);
  const page = await ctx.newPage();
  await page.route(/textdb\.dev|ntfy\.sh/, r => r.abort());
  page.on('console', m => { if (m.type() === 'error' && !/textdb|ntfy|ERR_FAILED/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.goto(BASE + '/games/tube-shooter/?debug=1', { waitUntil: 'load' }); await sleep(600);
  const E = (f, a) => page.evaluate(f, a);
  let v = await E(() => VORTEX.voice());
  check(v.ok && v.on, `announcer supported + ON by default (ok ${v.ok}, on ${v.on})`);
  // a real gesture unlocks audio + speech (iOS needs the first speak inside a gesture)
  if (touchDev) await page.touchscreen.tap(ctxOpts.viewport.width / 2, ctxOpts.viewport.height * 0.3); else await page.mouse.click(400, 300);
  await sleep(150);
  if (!real) check(await E(() => window.__spoken.some(s => s.text === ' ' && s.vol === 0)), 'first gesture speaks one silent blank (iOS unlock)');
  if (await E(() => VORTEX.muted())) await E(() => { /* start un-muted */ }), await page.keyboard.press('KeyM');
  // level start
  await E(() => { window.__noWarp = true; VORTEX.freeze(true); VORTEX.gotoLevel(1); VORTEX.step(3, () => VORTEX.state.state === 'play'); });
  v = await E(() => VORTEX.voice());
  check(v.log.some(l => l.key === 'level' && /Level 1/.test(l.text)), 'level start: "Level 1. Go!" ' + JSON.stringify(v.log.map(l => l.text)));
  if (!real) {
    check(v.name === 'Fred', `deepest/robotic English voice picked (${v.name}), never the French one`);
    const sp = await E(() => window.__spoken.filter(s => s.text.trim()).pop());
    check(sp && sp.voice === 'Fred' && sp.pitch <= 1, `spoken with that voice (${JSON.stringify(sp)})`);
    await sleep(120);
    const duck = await E(() => VORTEX.voice().speaking);
    check(duck, 'speaking flag set while the line plays (music ducks)');
    await sleep(900);
    check(!(await E(() => VORTEX.voice().speaking)), 'flag clears after the line ends');
  }
  // next level: SUPERZAPPER RECHARGE (priority 1)
  await E(() => { window.__noWarp = false; VORTEX.clearLevel(); VORTEX.step(8, () => VORTEX.state.state === 'play' && VORTEX.state.level === 2); });
  v = await E(() => VORTEX.voice());
  check(v.log.some(l => l.key === 'recharge'), 'level 2: "Superzapper recharge"');
  // priority: a must-hear line (perfect warp prio 3) cuts a flavour line; a same-prio line while busy is dropped
  if (!real) {
    await sleep(800);
    const r = await E(async () => {
      const n0 = VORTEX.voice().said, d0 = VORTEX.voice().dropped;
      VORTEX.addScore(0); VORTEX.dropPup(VORTEX.playerLane(), 0.02); VORTEX.step(0.2);           // power-up name (prio 2)
      const a = VORTEX.voice().said - n0;
      VORTEX.dropPup(VORTEX.playerLane(), 0.02); VORTEX.step(0.2);                               // 2nd power-up while busy: dropped (same prio + same key guard)
      return { a, b: VORTEX.voice().said - n0, dropped: VORTEX.voice().dropped - d0, log: VORTEX.voice().log.slice(-2).map(l => l.text) };
    });
    check(r.a === 1 && r.b === 1, `power-up callout once, the next one does not pile up (said +${r.b}, ${JSON.stringify(r.log)})`);
  }
  // muted: no speech
  await page.keyboard.press('KeyM'); await sleep(50);
  let n0 = (await E(() => VORTEX.voice())).said;
  await E(() => { VORTEX.clearLevel(); VORTEX.step(8, () => VORTEX.state.state === 'play' && VORTEX.state.level === 3); });
  check((await E(() => VORTEX.voice())).said === n0, 'muted (M): no callouts');
  await page.keyboard.press('KeyM'); await sleep(50);
  // toggles: V key, pad R3, touch hold
  if (!touchDev) {
    await page.keyboard.press('KeyV'); await sleep(50);
    v = await E(() => ({ v: VORTEX.voice(), m: VORTEX.messages() }));
    check(!v.v.on && v.m.includes('ANNOUNCER OFF'), 'V key: announcer OFF + message');
    n0 = v.v.said;
    await E(() => { VORTEX.clearLevel(); VORTEX.step(8, () => VORTEX.state.state === 'play' && VORTEX.state.level === 4); });
    check((await E(() => VORTEX.voice())).said === n0, 'announcer OFF: no callouts');
    await E(() => VORTEX.freeze(false));
    await E(() => { window.__padOn = true; window.__padR3 = true; }); await page.waitForFunction(() => VORTEX.voice().on, null, { timeout: 5000 }).catch(() => {});
    await E(() => { window.__padR3 = false; }); await sleep(200);
    v = await E(() => VORTEX.voice());
    check(v.on && v.log.some(l => l.key === 'voiceon'), 'gamepad R3: announcer back ON + "Announcer on"');
    check(await E(() => localStorage.getItem('vortex.voice') !== null || Object.keys(localStorage).some(k => /voice/.test(k))), 'setting stored');
  } else {
    await E(() => VORTEX.freeze(false)); await sleep(100);
    await page.waitForFunction(() => { const e = document.getElementById('tmute'); return e && e.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
    const b = await E(() => { const r = document.getElementById('tmute').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const cdp = await ctx.newCDPSession(page);
    const m0 = await E(() => VORTEX.muted());
    // quick tap: under SwiftShader load each CDP touch waits for a (multi-second) frame, so the tap is sent as a real
    // pointerdown + pointerup pair from the page itself (a few ms apart, like a finger tap on a phone)
    await E(() => { const el = document.getElementById('tmute'), r = el.getBoundingClientRect(), o = { pointerId: 41, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); });
    await sleep(300);
    v = await E(() => ({ m: VORTEX.muted(), on: VORTEX.voice().on }));
    check(v.m === !m0 && v.on, `tap mute: sound toggles (${m0} -> ${v.m}), announcer unchanged`);
    await E(() => { const el = document.getElementById('tmute'), r = el.getBoundingClientRect(), o = { pointerId: 42, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); });
    await sleep(300);
    const m1 = await E(() => VORTEX.muted());
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y, id: 5 }] }); await sleep(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(150);
    v = await E(() => ({ m: VORTEX.muted(), on: VORTEX.voice().on, msgs: VORTEX.messages() }));
    check(v.m === m1 && !v.on && v.msgs.includes('ANNOUNCER OFF'), `HOLD mute 0.9 s: announcer OFF, sound state kept (${m1} -> ${v.m})`);
  }
  // game over line
  await E(() => { VORTEX.freeze(true); VORTEX.setLives(1); }); if (!(await E(() => VORTEX.voice().on))) await E(() => VORTEX.voiceToggle());
  await sleep(4200);
  await E(() => { VORTEX.emptyField(); VORTEX.setAuto(false); const id = VORTEX.spawn('pulsar', VORTEX.playerLane(), 0.4); for (let i = 0; i < 2000 && VORTEX.state.state !== 'gameover' && VORTEX.state.state !== 'initials' && VORTEX.state.state !== 'continue'; i++) { const e = VORTEX.enemyList().find(x => x.id === id); if (e) VORTEX.setEnemy(id, { lane: VORTEX.playerLane(), z: 0.4, flipping: false }); VORTEX.step(1 / 30); } });
  v = await E(() => VORTEX.voice());
  check(v.log.some(l => l.key === 'gameover' || l.key === 'hiscore'), 'game over callout: ' + JSON.stringify(v.log.slice(-1)));
  check(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 3)));
  await ctx.close();
}
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    await suite(browser, 'desktop 1440x900 (mouse, keyboard V, gamepad R3)', { viewport: { width: 1440, height: 900 } }, false);
    await suite(browser, 'iPhone 14 (touch, hold mute)', devices['iPhone 14'], true);
    await suite(browser, 'desktop, REAL speechSynthesis (no stub)', { viewport: { width: 1440, height: 900 } }, false, true);
  } catch (e) { console.log('FAIL exception ' + e.stack); fails++; }
  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})();
