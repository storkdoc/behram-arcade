/* Mushroom Cloud: two-player online test with the in-page PeerJS stand-in (mp/fakepeer.js) + Node broker (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=/workspace/tools/node_modules node games/mushroom-cloud/tests/mp.test.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const broker = require('./mp/broker')({ lat: 40, jit: 10 });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/mushroom-cloud/?q=1';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async name => { const c = await b.newContext({ viewport: { width: 1024, height: 640 } }); const p = await c.newPage(); p.name = name;
    await p.route('**/mushroom-cloud/vendor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForFunction(() => window.MC && MC.screen === 'title', null, { timeout: 90000 }); return p; };
  const H = await mk('host');
  const titles = await H.evaluate(() => [...document.querySelectorAll('#title .btn')].map(b => b.textContent.trim()));
  check(titles.some(t => /TWO-PLAYER GAME \(ONLINE\)/.test(t)) && titles.some(t => /JOIN TWO-PLAYER GAME IN PROGRESS/.test(t)), 'title has Two-Player (Online) + Join in progress', titles);
  await H.click('[data-act=host]'); await H.waitForTimeout(300);
  check(await H.evaluate(() => MC.screen) === 'select', 'host picks the scenario first');
  await H.click('#bstart'); await H.waitForFunction(() => MC.screen === 'online' && MC.net.st.status === 'waiting', null, { timeout: 20000 });
  const msg = await H.evaluate(() => document.getElementById('omsg').textContent);
  check(msg === 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 'host message text', msg);
  await H.waitForFunction(() => MC.net.st.code && document.getElementById('ocode').textContent.includes(MC.net.st.code), null, { timeout: 10000 }).catch(() => {});
  const code = await H.evaluate(() => MC.net.st.code), shown = await H.evaluate(() => document.getElementById('ocode').textContent);
  check(code && shown.includes(code), 'backup code shown', code);
  const ids = [...broker.ids.keys()].filter(k => /^behram-/.test(k)); check(ids.length && ids.every(k => k.startsWith('behram-mc-v1-')), 'own PeerJS namespace behram-mc-v1-*', ids);
  const G = await mk('guest');
  await G.click('[data-act=join]');
  await Promise.all([H, G].map(p => p.waitForFunction(() => MC.screen === 'play' && MC.view, null, { timeout: 30000 })));
  check(true, 'both sides enter the match');
  const meta = await Promise.all([H, G].map(p => p.evaluate(() => ({ me: MC.app.me, role: MC.app.role }))));
  check(meta[0].role === 'host' && meta[1].role === 'guest' && meta[0].me !== meta[1].me, 'different blocs, host authoritative', meta);
  // guest deploys via a real order -> host sim
  await G.evaluate(() => MC.cmd('auto')); await G.waitForTimeout(1500);
  const gUnitsOnHost = await H.evaluate(b => MC.game.units.filter(u => u.bloc === b).length, meta[1].me);
  check(gUnitsOnHost >= 10, 'guest AUTO-DEPLOY executed on the host', gUnitsOnHost);
  await H.evaluate(() => MC.cmd('auto')); await H.waitForTimeout(1500);
  // privacy: guest's view must not contain the host's undetected units or private fields
  const priv = await G.evaluate(hb => { const v = MC.view; const e = v.units.filter(u => u.bloc === hb); return { n: e.length, bad: e.filter(u => 'wh' in u || 'abm' in u || 'fi' in u || 'bo' in u || 'pend' in u || 'path' in u).length, budget: v.my.budget, hostBudgetLeak: JSON.stringify(v).includes('"budget"') && Object.keys(v.my).includes('budget') }; }, meta[0].me);
  const hostTotal = await H.evaluate(() => MC.game.units.filter(u => u.bloc === MC.app.me).length);
  check(priv.bad === 0 && priv.n < hostTotal, 'guest sees no hidden host units / private fields', { seen: priv.n, hostTotal, bad: priv.bad });
  await H.waitForTimeout(2500);
  const link = await G.evaluate(() => document.getElementById('link').textContent);
  check(/^LINK \d+ MS$/.test(link), 'LINK ms readout on guest', link);
  // speed changes on the host reach the guest; guest sim time follows
  const t1 = await G.evaluate(() => MC.view.t); await G.waitForTimeout(2000); const t2 = await G.evaluate(() => MC.view.t);
  check(t2 > t1, 'guest receives live state', [t1, t2]);
  await H.evaluate(() => { const g = MC.game; for (let k = 0; k < 20000 && !g.over; k++) { if (g.defcon === 1 && !g._t) { g._t = 1; } g.step(0.1); } });
  await Promise.all([H, G].map(p => p.waitForFunction(() => MC.screen === 'end', null, { timeout: 30000 })));
  const rb = await G.evaluate(() => [...document.querySelectorAll('#endp .btn')].map(b => b.textContent));
  check(rb.includes('REMATCH'), 'both see the end screen; REMATCH offered', rb);
  await G.click('[data-e=again]'); await H.click('[data-e=again]');
  await Promise.all([H, G].map(p => p.waitForFunction(() => MC.screen === 'play' && MC.view && MC.view.t < 30, null, { timeout: 30000 })));
  check(true, 'rematch starts on both');
  for (const p of [H, G]) check(p.errs.length === 0, p.name + ': no console errors', p.errs.slice(0, 4));
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
