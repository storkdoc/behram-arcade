/* TANK DUEL: online two-player test with the in-page PeerJS stand-in (mp/fakepeer.js) + Node broker (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=/workspace/tools/node_modules node games/tank-duel/tests/mp.test.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const broker = require('./mp/broker')({ lat: 40, jit: 10 });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/tank-duel/?q=0';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async name => { const c = await b.newContext({ viewport: { width: 640, height: 400 } }); const p = await c.newPage(); p.name = name;
    await p.route('**/tank-duel/vendor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForFunction(() => window.TD && TD.screen === 'title', null, { timeout: 90000 }); return p; };
  const H = await mk('host');
  const titles = await H.evaluate(() => [...document.querySelectorAll('#title .btn')].map(b => b.textContent.trim()));
  check(titles.some(t => /TWO-PLAYER GAME \(ONLINE\)/.test(t)) && titles.some(t => /JOIN TWO-PLAYER GAME IN PROGRESS/.test(t)), 'title has Two-Player (Online) + Join in progress', titles);
  await H.click('[data-act=host]'); await H.waitForTimeout(200);
  check(await H.evaluate(() => TD.screen) === 'select', 'host picks the variation first');
  await H.click('#bstart'); await H.waitForFunction(() => TD.screen === 'online' && TD.Net.st.status === 'waiting', null, { timeout: 20000 });
  const msg = await H.evaluate(() => document.getElementById('omsg').textContent);
  check(msg === 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 'host message text', msg);
  await H.waitForFunction(() => TD.Net.st.code && document.getElementById('ocode').textContent.includes(TD.Net.st.code), null, { timeout: 10000 }).catch(() => {});
  const code = await H.evaluate(() => TD.Net.st.code), shown = await H.evaluate(() => document.getElementById('ocode').textContent);
  check(code && shown.includes(code), 'backup code shown', code);
  const ids = [...broker.ids.keys()].filter(k => /^behram-/.test(k)); check(ids.length && ids.every(k => k.startsWith('behram-td-v1-')), 'own PeerJS namespace behram-td-v1-*', ids);
  // practice against the CPU while waiting
  await H.click('[data-o=practice]'); await H.waitForTimeout(500);
  const pr = await H.evaluate(() => ({ s: TD.screen, on: TD.app.online, g: TD.app.guestOn, wb: document.getElementById('waitban').textContent, wbv: !document.getElementById('waitban').classList.contains('hidden') }));
  check(pr.s === 'play' && pr.on === 'host' && !pr.g && pr.wbv && pr.wb.includes(code), 'host practises vs CPU with a waiting banner + code', pr);
  await H.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 30000 });
  await H.waitForTimeout(1500);
  check(await H.evaluate(() => Math.hypot(TD.game.tanks[1].x - 29.5, TD.game.tanks[1].y - 10) > 0.3), 'CPU tank is driving during practice');
  // guest joins the game in progress
  const G = await mk('guest');
  await G.click('[data-act=join]');
  await Promise.all([H.waitForFunction(() => TD.app.guestOn && TD.screen === 'play', null, { timeout: 30000 }), G.waitForFunction(() => TD.screen === 'play' && TD.game && TD.app.me === 1, null, { timeout: 30000 })]);
  check(true, 'guest joins in progress and takes over the CPU tank');
  const fresh = await H.evaluate(() => ({ sc: TD.game.tanks.map(t => t.score), ph: TD.game.phase, who: document.getElementById('who1').textContent }));
  check(fresh.sc[0] === 0 && fresh.sc[1] === 0 && fresh.ph === 'countdown' && fresh.who === 'BUDDY', 'scores reset, new countdown, HUD says BUDDY', fresh);
  const priv = await G.evaluate(() => ({ online: document.getElementById('online').classList.contains('show'), wb: !document.getElementById('waitban').classList.contains('hidden'), who: [document.getElementById('who0').textContent, document.getElementById('who1').textContent] }));
  check(!priv.online && !priv.wb && priv.who[1] === 'YOU', "guest never sees the host's waiting screen/banner", priv);
  await G.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 30000 });
  await H.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 30000 });
  // guest input drives tank 2 on the host
  const x0 = await H.evaluate(() => [TD.game.tanks[1].x, TD.game.tanks[1].a]);
  await G.evaluate(() => { TD.keys.u = true; TD.keys.l = true; }); await G.waitForTimeout(1500); await G.evaluate(() => { TD.keys.u = false; TD.keys.l = false; });
  await G.waitForTimeout(600);
  const x1 = await H.evaluate(() => [TD.game.tanks[1].x, TD.game.tanks[1].y]), gx = await G.evaluate(() => [TD.game.tanks[1].x, TD.game.tanks[1].y]);
  check(Math.hypot(x1[0] - 29.5, x1[1] - 10) > 1, 'guest input moves its tank on the host', { host: x1 });
  check(Math.hypot(x1[0] - gx[0], x1[1] - gx[1]) < 0.35, 'guest prediction agrees with the host', { host: x1, guest: gx });
  // guest fires -> shell on host
  const f0 = await H.evaluate(() => TD.game.tanks[1].firedN); await G.keyboard.press('Space'); await G.waitForTimeout(500);
  check(await H.evaluate(() => TD.game.tanks[1].firedN) > f0, 'guest fire button fires on the host');
  await G.waitForTimeout(1500);
  const link = await G.evaluate(() => document.getElementById('link').textContent), hl = await H.evaluate(() => document.getElementById('link').textContent);
  check(/^LINK \d+ MS$/.test(link) && /^LINK \d+ MS$/.test(hl), 'LINK ms readout on both', [link, hl]);
  const t1 = await G.evaluate(() => TD.game.t); await G.waitForTimeout(1000); const t2 = await G.evaluate(() => TD.game.t);
  check(t2 > t1, 'guest receives live snapshots', [t1, t2]);
  // spawn-kill: host kills the guest point blank, then tries again right after the respawn -> shielded, far away, synced
  await G.evaluate(() => { window.__ev = []; const R = TD.R, f = R.fx.bind(R); R.fx = evs => { for (const e of evs) window.__ev.push(Object.assign({}, e)); return f(evs); }; });
  const k1 = await H.evaluate(() => { const g = TD.game, h = g.tanks[0], v = g.tanks[1]; v.x = h.x + 2.5; v.y = h.y; v.prot = 0; const s0 = h.score; TD.S.hitTank(g, v, 0, v.x - 0.4, v.y, 10, 0, 'shell'); return { s0, s1: h.score }; });
  await H.waitForFunction(() => TD.game.tanks[1].prot > 0, null, { timeout: 5000 });
  const k2 = await H.evaluate(() => { const g = TD.game, h = g.tanks[0], v = g.tanks[1]; const s0 = h.score, ok = TD.S.hitTank(g, v, 0, v.x, v.y, 1, 0, 'shell'); return { s0, s1: h.score, ok, d: Math.hypot(v.x - h.x, v.y - h.y), v: [v.x, v.y], prot: v.prot }; });
  check(k1.s1 === k1.s0 + 1 && k2.s1 === k2.s0 && k2.d > 7, 'online: host kill -> guest respawns far away and a re-kill bounces off the shield', { k1, k2 });
  await G.waitForTimeout(400);
  const gv = await G.evaluate(() => ({ prot: TD.game.tanks[1].prot, x: TD.game.tanks[1].x, y: TD.game.tanks[1].y, toast: document.getElementById('toast').textContent, sh: TD.R.tanks[1].pshield.visible, resp: window.__ev.filter(e => e.e === 'respawn').length }));
  check(gv.prot > 0 && gv.sh && Math.hypot(gv.x - k2.v[0], gv.y - k2.v[1]) < 1.2 && /SHIELD UP/.test(gv.toast) && gv.resp === 1, 'guest sees its shield, respawn toast and the respawn position', gv);
  await H.waitForTimeout(2200);
  // privacy: invisible variation -> the quiet host tank's position is never sent
  await H.evaluate(() => { TD.app.variant = TD.S.VARIANTS.findIndex(v => v.name === 'INVISIBLE TANKS'); TD.newOnlineMatch(); });
  await G.waitForFunction(() => TD.game.v.invisible, null, { timeout: 15000 });
  await H.waitForFunction(() => TD.game.phase === 'play', null, { timeout: 30000 }); await H.waitForTimeout(2600);
  const hid = await G.evaluate(() => { const r = TD.gs.lastRaw; return { h: r.k[0].h, x: r.k[0].x, hidden: TD.game.tanks[0].hidden }; });
  check(hid.h === 1 && hid.x === undefined && hid.hidden, 'invisible host tank: no position in guest snapshots', hid);
  await G.evaluate(() => { window.__ev = []; });
  await H.evaluate(() => { const g = TD.game; TD.S.hitTank(g, g.tanks[0], 1, g.tanks[0].x + 0.4, g.tanks[0].y, -10, 0, 'shell'); });
  await H.waitForFunction(() => TD.game.tanks[0].prot > 0, null, { timeout: 5000 }); await H.waitForTimeout(1200);
  const ir = await G.evaluate(() => ({ resp: window.__ev.filter(e => e.e === 'respawn'), hid: TD.game.tanks[0].hidden, sh: TD.R.tanks[0].pshield.visible }));
  check(ir.resp.length === 1 && ir.resp[0].x == null && ir.hid && !ir.sh, 'invisible: the host respawn spot is not leaked to the guest', ir);
  // end of round -> both see the end screen; rematch
  await H.evaluate(() => { const g = TD.game; g.tanks[0].score = 2; g.timeLeft = 0.05; });
  await Promise.all([H, G].map(p => p.waitForFunction(() => TD.screen === 'endp', null, { timeout: 30000 })));
  const et = await Promise.all([H, G].map(p => p.evaluate(() => document.getElementById('etitle').textContent)));
  check(et[0] === 'VICTORY' && et[1] === 'DEFEAT', 'both see the end screen from their own side', et);
  await G.click('[data-e=again]'); await H.click('[data-e=again]');
  await Promise.all([H, G].map(p => p.waitForFunction(() => TD.screen === 'play' && TD.game.phase === 'countdown' && TD.game.tanks[0].score === 0, null, { timeout: 30000 })));
  check(true, 'rematch starts on both');
  // guest leaves -> CPU takes over, host keeps playing and re-opens the game
  await G.evaluate(() => TD.toTitle()); await H.waitForFunction(() => !TD.app.guestOn, null, { timeout: 15000 });
  await H.waitForTimeout(800);
  const after = await H.evaluate(() => ({ s: TD.screen, toast: document.getElementById('toast').textContent, st: TD.Net.st.status }));
  check(after.s === 'play' && /CPU TAKES OVER/.test(after.toast), 'buddy leaves: CPU takes over the tank, game continues', after);
  for (const p of [H, G]) check(p.errs.length === 0, p.name + ': no console errors', p.errs.slice(0, 4));
  console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
