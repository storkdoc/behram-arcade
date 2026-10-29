/* MoodSticker (corner smiley + Fun/Okay/Skip + optional suggestion) — desktop Chrome + iPhone emulation.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node tests/mood-sticker.test.js     (env: BASE, CHROME, NO_REMOTE=1)
   Submissions made by automated browsers carry "test": true (navigator.webdriver), so the daily reader skips them.
   Unless NO_REMOTE=1, it also checks the round trip: the records it submitted are read back by tools/read-feedback.mjs. */
const { chromium, devices } = require('playwright-core');
const { execFileSync } = require('child_process');
const path = require('path');
const BASE = (process.env.BASE || 'http://localhost:8080/').replace(/\/?$/, '/');
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
const ids = [];
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const open = async (opts, url) => {
    const c = await b.newContext(opts); const p = await c.newPage(); p.errs = [];
    p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text() + ' ' + (m.location().url || '')); });
    p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) p.errs.push(r.status() + ' ' + r.url()); });
    await p.goto(BASE + url, { waitUntil: 'load' }); await p.waitForTimeout(700); return p;
  };
  const S = (p, sel) => p.locator('mood-sticker').locator(sel);           // playwright pierces open shadow roots
  const panelOpen = p => p.evaluate(() => MoodSticker.isOpen());
  const lastLog = p => p.evaluate(() => { const l = MoodSticker.submissions(); return l[l.length - 1]; });
  const settle = async p => {   // let in-flight deliveries finish before a context is closed
    for (let i = 0; i < 40; i++) { if (await p.evaluate(() => MoodSticker.submissions().every(x => x.textdb !== 'sending' && x.ntfy !== 'sending'))) return; await p.waitForTimeout(500); }
  };
  const waitDelivered = async (p, id) => {
    for (let i = 0; i < 40; i++) {
      const e = await p.evaluate(id => MoodSticker.submissions().find(x => x.rec.id === id), id);
      if (e && e.textdb !== 'sending' && e.ntfy !== 'sending') return e;
      await p.waitForTimeout(500);
    }
    return null;
  };

  for (const [name, opts] of [['DESKTOP 1280x800', { viewport: { width: 1280, height: 800 } }], ['iPhone 13', devices['iPhone 13']]]) {
    const touch = !!opts.hasTouch;
    const tap = (p, sel) => touch ? S(p, sel).tap() : S(p, sel).click();
    console.log('== ' + name);

    // ---------- home page ----------
    const H = await open(opts, '');
    check(await H.evaluate(() => !!document.querySelector('mood-sticker') && typeof MoodSticker.event === 'function'), 'home: sticker present + API');
    const box = await S(H, '.stk').boundingBox();
    check(box && box.width >= 30 && box.width <= 50, 'home: sticker is small', box);
    if (!touch) {
      const i0 = await H.evaluate(() => ARCADE.index); await H.keyboard.press('ArrowRight'); await H.waitForTimeout(400);
      check(await H.evaluate(() => ARCADE.index) !== i0, 'home: arrow keys still drive the carousel while sticker is closed');
    }
    await tap(H, '.stk'); await H.waitForTimeout(300);
    check(await panelOpen(H), 'home: tap/click opens the rating panel');
    check(await S(H, '.rate').count() === 3 && await S(H, 'textarea').isVisible(), 'home: three options + suggestion box visible');
    const ph = await S(H, 'textarea').getAttribute('placeholder');
    check(/optional/i.test(ph), 'home: suggestion box is labelled optional', ph);
    await H.screenshot({ path: `/tmp/ms-${touch ? 'm' : 'd'}-home-open.png` });
    await tap(H, '.rate.fun'); await H.waitForTimeout(200);
    let e = await lastLog(H);
    check(e && e.rec.rating === 'fun' && e.rec.text === '' && e.rec.test === true && e.rec.game === 'arcade-home', 'home: empty submit (Fun, no text) is logged', e && e.rec);
    ids.push(e.rec.id);
    await H.waitForTimeout(1700);
    check(!(await panelOpen(H)), 'home: panel closes itself after the thank-you');
    const d = await waitDelivered(H, e.rec.id);
    check(d && d.textdb === 'ok' && d.ntfy === 'ok', 'home: delivered to textdb + ntfy', d && { textdb: d.textdb, ntfy: d.ntfy });
    check(H.errs.length === 0, 'home: no console errors', H.errs);
    await settle(H); await H.context().close();

    // ---------- VORTEX: gameplay keys not stolen, typing does not reach the game ----------
    const V = await open(opts, 'games/tube-shooter/');
    const st = () => V.evaluate(() => VORTEX.state.state);
    const s0 = await st();
    await tap(V, '.stk'); await V.waitForTimeout(250);
    await S(V, 'textarea').click();
    await V.keyboard.type('More levels please. Space bar and Enter feel great', { delay: 5 });
    await V.keyboard.press('Enter');   // newline in the box, must not start the game
    await V.keyboard.type('ok', { delay: 5 });
    check(await st() === s0, 'vortex: typing (incl. Space/Enter) in the box does not reach the game', { s0, now: await st() });
    const typed = await S(V, 'textarea').inputValue();
    check(/Space bar and Enter/.test(typed) && typed.includes('\n'), 'vortex: text box received the typing', typed);
    await tap(V, '.rate.okay'); await V.waitForTimeout(200);
    e = await lastLog(V);
    check(e && e.rec.rating === 'okay' && /More levels please/.test(e.rec.text) && e.rec.game === 'tube-shooter' && e.rec.sessionStart && e.rec.durationSec >= 0 && e.rec.lastScreen && e.rec.viewport.w > 0 && e.rec.device && /^[0-9a-f]{16}$/.test(e.rec.sid),
      'vortex: submit with text logs rating + text + session fields', e && e.rec);
    ids.push(e.rec.id);
    check(e.rec.device === (touch ? 'phone' : 'desktop'), 'vortex: device class', e.rec.device);
    await V.waitForTimeout(1800);
    check(!(await panelOpen(V)), 'vortex: panel closed');
    if (!touch) {
      await V.mouse.click(640, 400); await V.waitForTimeout(100);
      await V.keyboard.press('Space'); await V.waitForTimeout(400);
      const s1 = await st();
      check(s1 !== s0, 'vortex: Space reaches the game after the panel closes (nothing blocked)', { s0, s1 });
      // keyboard open (backquote) + Esc close
      await V.keyboard.press('Backquote'); await V.waitForTimeout(250);
      check(await panelOpen(V), 'vortex: ` key opens the panel');
      const foc = await V.evaluate(() => { const h = document.querySelector('mood-sticker'); const a = h.shadowRoot.activeElement; return a && a.className; });
      check(/rate fun/.test(foc || ''), 'vortex: keyboard open focuses the first choice', foc);
      await V.keyboard.press('Escape'); await V.waitForTimeout(150);
      check(!(await panelOpen(V)), 'vortex: Esc closes without submitting');
      const nLog = (await V.evaluate(() => MoodSticker.submissions().length));
      // keyboard-only submit: ` -> ArrowRight x2 -> Enter = Skip
      await V.keyboard.press('Backquote'); await V.waitForTimeout(200);
      await V.keyboard.press('ArrowRight'); await V.keyboard.press('ArrowRight'); await V.keyboard.press('Enter'); await V.waitForTimeout(200);
      e = await lastLog(V);
      check((await V.evaluate(() => MoodSticker.submissions().length)) === nLog + 1 && e.rec.rating === 'skip', 'vortex: keyboard-only Skip submit', e && e.rec.rating);
      ids.push(e.rec.id);
    }
    check(V.errs.length === 0, 'vortex: no console errors', V.errs);
    await settle(V); await V.context().close();

    // ---------- Congressional OB GYN: note-only send + reactions + gamepad ----------
    const C = await open(opts, 'games/congressional-obgyn/');
    check(await C.evaluate(() => !!document.querySelector('mood-sticker')), 'cob: sticker present');
    await C.evaluate(() => MoodSticker.event('win')); await C.waitForTimeout(100);
    check(await C.evaluate(() => MoodSticker.mood()) === 'party', 'cob: event(win) -> celebrates');
    await C.evaluate(() => MoodSticker.event('stall'));
    check(await C.evaluate(() => MoodSticker.mood()) === 'droopy', 'cob: event(stall) -> droops');
    await C.evaluate(() => MoodSticker.event('big'));
    check(await C.evaluate(() => MoodSticker.mood()) === 'perky', 'cob: event(big) -> perks up');
    await tap(C, '.stk'); await C.waitForTimeout(250);
    await S(C, 'textarea').fill('Add a timer toggle for studying');
    await C.waitForTimeout(100);
    check(await S(C, '.send').isVisible(), 'cob: Send-note button appears once there is text');
    await C.screenshot({ path: `/tmp/ms-${touch ? 'm' : 'd'}-cob-open.png` });
    await tap(C, '.send'); await C.waitForTimeout(200);
    e = await lastLog(C);
    check(e && e.rec.rating === null && e.rec.text === 'Add a timer toggle for studying' && e.rec.game === 'congressional-obgyn' && e.rec.lastScreen, 'cob: note-only submit (no rating) logged', e && e.rec);
    ids.push(e.rec.id);
    // PII scrub + length cap
    const r2 = await C.evaluate(() => MoodSticker._record('okay', 'mail me at jane.doe@example.com or 301-555-0199 ' + 'x'.repeat(900)));
    check(!/example\.com|555/.test(r2.text) && r2.text.length <= 500, 'cob: emails/phone numbers scrubbed, text capped at 500', r2.text.slice(0, 80));
    if (!touch) {
      // fake gamepad: hold SELECT to open, D-pad right, A to submit
      await C.evaluate(() => {
        const btn = () => ({ pressed: false, value: 0 }); window.__pad = { id: 'fake', index: 0, connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, btn), mapping: 'standard', timestamp: 0 };
        navigator.getGamepads = () => [window.__pad]; window.dispatchEvent(new Event('gamepadconnected'));
      });
      await C.waitForTimeout(1700);   // let the sticker's thank-you close first
      const n0 = await C.evaluate(() => MoodSticker.submissions().length);
      await C.evaluate(() => { __pad.buttons[8].pressed = true; }); await C.waitForTimeout(900);
      await C.evaluate(() => { __pad.buttons[8].pressed = false; }); await C.waitForTimeout(100);
      check(await panelOpen(C), 'cob: gamepad hold SELECT opens the panel');
      await C.evaluate(() => { __pad.buttons[15].pressed = true; }); await C.waitForTimeout(80);
      await C.evaluate(() => { __pad.buttons[15].pressed = false; }); await C.waitForTimeout(80);
      await C.evaluate(() => { __pad.buttons[0].pressed = true; }); await C.waitForTimeout(80);
      await C.evaluate(() => { __pad.buttons[0].pressed = false; }); await C.waitForTimeout(200);
      e = await lastLog(C);
      check((await C.evaluate(() => MoodSticker.submissions().length)) === n0 + 1 && e.rec.rating === 'okay' && e.rec.input === 'gamepad', 'cob: gamepad D-pad + A submits Okay', e && { r: e.rec.rating, input: e.rec.input });
      ids.push(e.rec.id);
    }
    check(C.errs.length === 0, 'cob: no console errors', C.errs);
    await settle(C); await C.context().close();
  }

  // ---------- concurrent writers (two tabs submitting at the same moment) ----------
  if (!process.env.NO_REMOTE) {
    const c1 = await b.newContext(), c2 = await b.newContext();
    const [p1, p2] = await Promise.all([c1.newPage(), c2.newPage()]);
    await Promise.all([p1.goto(BASE + 'games/star-invaders/'), p2.goto(BASE + 'games/sky-shield/')]);
    await p1.waitForTimeout(600);
    const res = await Promise.all([p1, p2].map(p => p.evaluate(async () => { const o = MoodSticker._submit('fun', 'concurrency test'); const d = await o.delivered; return { id: o.record.id, d }; })));
    res.forEach(r => ids.push(r.id));
    check(res.every(r => r.d.textdb && r.d.ntfy), 'two simultaneous writers both land (verify + retry)', res);
    await c1.close(); await c2.close();
  }

  // ---------- round trip through the remote sink ----------
  if (!process.env.NO_REMOTE) {
    console.log('== round trip (textdb.dev + ntfy.sh -> tools/read-feedback.mjs)');
    await new Promise(r => setTimeout(r, 2500));
    let got = [];
    for (let i = 0; i < 3; i++) {
      const out = execFileSync('node', [path.join(__dirname, '..', 'tools', 'read-feedback.mjs'), '--hours', '2', '--only-test', '--json'], { encoding: 'utf8' });
      got = JSON.parse(out);
      if (ids.every(id => got.some(r => r.id === id))) break;
      await new Promise(r => setTimeout(r, 3000));
    }
    const missing = ids.filter(id => !got.some(r => r.id === id));
    check(missing.length === 0, `reader reads back all ${ids.length} test submissions`, missing);
    const both = got.filter(r => ids.includes(r.id) && r._sources.includes('textdb'));
    check(both.length === ids.length, 'all of them are in the durable textdb day document', both.length);
    const direct = got.filter(r => ids.includes(r.id) && r._sources.includes('textdb') && r._sources.includes('ntfy'));
    check(direct.length === ids.length, 'and in the ntfy mirror', direct.length);
    check(got.every(r => r.test === true), 'reader --only-test returns only test records');
  }
  await b.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
