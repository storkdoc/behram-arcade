/* BY DAWN'S EARLY LIGHT: two-player online test with the in-page PeerJS stand-in (mp/fakepeer.js) + Node broker (mp/broker.js).
   From the repo root:  python3 -m http.server 8080 &   then  NODE_PATH=/workspace/tools/node_modules node games/by-dawns-early-light/tests/mp.test.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const broker = require('./mp/broker')({ lat: 40, jit: 10 });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/by-dawns-early-light/?q=0';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async (name, cine) => { const c = await b.newContext({ viewport: { width: 1024, height: 640 } }); const p = await c.newPage(); p.name = name;
    await p.addInitScript(cine => localStorage.setItem('bdel.cine', cine), String(cine));
    await p.route('**/by-dawns-early-light/vendor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForFunction(() => window.BDEL && BDEL.screen === 'title', null, { timeout: 90000 }); return p; };
  const H = await mk('host', false);
  const titles = await H.evaluate(() => [...document.querySelectorAll('#title .btn')].map(b => b.textContent.trim()));
  check(titles.some(t => /TWO-PLAYER GAME \(ONLINE\)/.test(t)) && titles.some(t => /JOIN TWO-PLAYER GAME IN PROGRESS/.test(t)), 'title has Two-Player (Online) + Join in progress', titles);
  await H.click('[data-a=host]'); await H.waitForFunction(() => BDEL.screen === 'online' && Net.st.status === 'waiting', null, { timeout: 20000 });
  const msg = await H.evaluate(() => document.getElementById('omsg').textContent);
  check(msg === 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 'host message text', msg);
  await H.waitForFunction(() => Net.st.code && document.getElementById('ocode').textContent.includes(Net.st.code), null, { timeout: 10000 }).catch(() => {});
  const code = await H.evaluate(() => Net.st.code), shown = await H.evaluate(() => document.getElementById('ocode').textContent);
  check(code && shown.includes(code), 'backup code shown', code);
  const ids = [...broker.ids.keys()].filter(k => /^behram-/.test(k)); check(ids.length && ids.every(k => k.startsWith('behram-bdel-v1-')), 'own PeerJS namespace behram-bdel-v1-*', ids);
  // host starts solo while waiting
  await H.click('[data-a=solo]'); await H.waitForFunction(() => BDEL.screen === 'play' && BDEL.view, null, { timeout: 20000 });
  check(true, 'host can start solo while waiting');
  const G = await mk('guest', false);
  await G.click('[data-a=join]');
  await Promise.all([H, G].map(p => p.waitForFunction(() => BDEL.screen === 'play' && BDEL.view && BDEL.role !== 'sp', null, { timeout: 30000 }))).catch(async e => { for (const p of [H, G]) console.log(p.name, await p.evaluate(() => JSON.stringify({ s: BDEL.screen, r: BDEL.role, n: Net.st, v: !!BDEL.view, err: document.getElementById('err').textContent })), p.errs); throw e; });
  check(true, 'buddy arrives: both enter the two-player night');
  const meta = await Promise.all([H, G].map(p => p.evaluate(() => ({ side: BDEL.side, role: BDEL.role, post: document.querySelector('#station') ? 1 : 0, two: BDEL.view.two }))));
  check(meta[0].role === 'host' && meta[1].role === 'guest' && meta[0].side === 0 && meta[1].side === 1 && meta[1].two, 'host=Commonwealth, guest=Federation, host authoritative', meta);
  // hotline: guest says something; host sees it
  await G.evaluate(() => BDEL_T.cmd({ t: 'hl', a: 'say', text: 'This is KESTREL. We are not firing.' })); await H.waitForTimeout(1500);
  const heard = await H.evaluate(() => BDEL.game.hl.some(h => /We are not firing/.test(h.text)));
  check(heard, 'guest hotline message reaches the host sim');
  // guest orders a wing via the host
  await G.evaluate(() => BDEL_T.cmd({ t: 'wing', w: 1, cmd: 'hold' })); await H.waitForTimeout(1500);
  const pend = await H.evaluate(() => { const w = BDEL.game.sides[1].wings[1]; return w.pend ? w.pend.cmd : w.state; });
  check(pend === 'hold', 'guest wing order executed on the host', pend);
  // privacy
  const priv = await G.evaluate(() => { const v = BDEL.view; return { card: v.me.card, themKeys: Object.keys(v.them), hostCardLeak: false }; });
  const hostCard = await H.evaluate(() => BDEL.view.me.card);
  const gjson = await G.evaluate(() => JSON.stringify(BDEL.view));
  check(!gjson.includes(hostCard) && !priv.themKeys.includes('inbox') && !priv.themKeys.includes('card'), 'guest view hides host card/inbox', { themKeys: priv.themKeys });
  await H.waitForTimeout(2500);
  const link = await G.evaluate(() => document.getElementById('link').textContent);
  check(/^LINK \d+ MS$/.test(link), 'LINK ms readout on guest', link);
  const t1 = await G.evaluate(() => BDEL.view.t); await G.waitForTimeout(2500); const t2 = await G.evaluate(() => BDEL.view.t);
  check(t2 > t1, 'guest receives live state', [t1, t2]);
  await H.evaluate(() => { const g = BDEL.game; for (let k = 0; k < 40000 && !g.over; k++) g.step(0.05); });
  await Promise.all([H, G].map(p => p.waitForFunction(() => BDEL.screen === 'end', null, { timeout: 40000 })));
  const rb = await G.evaluate(() => [...document.querySelectorAll('#endp .btn')].map(b => b.textContent));
  check(rb.includes('REMATCH'), 'both see the after-action report; REMATCH offered', rb);
  await G.click('[data-e=rematch]'); await H.click('[data-e=rematch]');
  await Promise.all([H, G].map(p => p.waitForFunction(() => BDEL.screen === 'play' && BDEL.view && BDEL.view.t < 10 && !BDEL.view.over, null, { timeout: 30000 })));
  check(true, 'rematch starts on both');
  // disconnect: host leaves -> guest sees LINK LOST
  await H.close(); await G.waitForFunction(() => BDEL.screen === 'end' && /LINK LOST/.test(document.getElementById('endp').textContent), null, { timeout: 30000 }).then(() => check(true, 'guest sees LINK LOST when host disconnects'), () => check(false, 'guest sees LINK LOST when host disconnects'));
  for (const p of [G]) check(p.errs.length === 0, p.name + ': no console errors', p.errs.slice(0, 4));
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
