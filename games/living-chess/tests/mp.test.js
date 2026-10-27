/* THE LIVING BOARD: online two-player test with the in-page PeerJS stand-in (mp/fakepeer.js) + Node broker (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=/workspace/tools/node_modules node games/living-chess/tests/mp.test.js */
const { chromium } = require('playwright-core'); const fs = require('fs');
const broker = require('./mp/broker')({ lat: 40, jit: 10 });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/living-chess/?fast=1&mute=1';
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x).slice(0, 300)); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mk = async name => { const c = await b.newContext({ viewport: { width: 900, height: 600 } }); const p = await c.newPage(); p.name = name;
    await p.route('**/living-chess/vendor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL, { timeout: 180000 }); await p.waitForFunction(() => window.LCG && LCG.booted && LCG.screen === 'title', null, { timeout: 120000 }); return p; };
  const mine = p => p.waitForFunction(() => { const s = LCG.api.state(); return s.over || (s.turn === s.me && s.hasThoughts && !s.busy); }, null, { timeout: 90000 });
  const H = await mk('host');
  await H.click('[data-act=host]');
  await H.waitForFunction(() => LCG.Net && LCG.Net.st.status === 'waiting' || document.getElementById('ostat').textContent.includes('WAITING'), null, { timeout: 20000 });
  const msg = await H.evaluate(() => document.getElementById('omsg').textContent.trim());
  check(msg === 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 'host waiting message', msg);
  await H.waitForTimeout(400);
  const code = await H.evaluate(() => document.getElementById('ocode').textContent);
  check(/BACKUP CODE: [A-Z0-9]{5}/.test(code), 'backup code shown', code);
  const ids = [...broker.ids.keys()].filter(k => /^behram-/.test(k)); check(ids.length && ids.every(k => k.startsWith('behram-lc-v1-')), 'own PeerJS namespace behram-lc-v1-*', ids);
  // practise vs the machine while waiting
  await H.click('[data-act=practice]'); await mine(H);
  await H.evaluate(() => LCG.api.move('e2e4')); await mine(H);
  await H.evaluate(() => LCG.api.move('g1f3'));
  await H.waitForFunction(() => LCG.api.state().ply === 3, null, { timeout: 20000 });
  check(await H.evaluate(() => LCG.api.state().mode) === 'practice', 'host practises vs the machine while waiting');
  // buddy joins the game in progress (takes over Black mid-game)
  const G = await mk('guest');
  await G.waitForTimeout(500);
  await G.evaluate(() => document.querySelector('[data-act=join]').click());
  await G.waitForFunction(() => LCG.api.state().mode === 'guest', null, { timeout: 90000 });
  await H.waitForFunction(() => LCG.api.state().mode === 'host', null, { timeout: 90000 });
  const gs = await G.evaluate(() => LCG.api.state()), hs = await H.evaluate(() => LCG.api.state());
  check(gs.me === 1 && gs.ply >= 3 && gs.fen === hs.fen, 'guest joins mid-game as Black with the same position', { g: gs.fen, h: hs.fen });
  check(await H.evaluate(() => LCG.R.orient) === 0 && await G.evaluate(() => LCG.R.orient) === 1, 'each board faces its own player');
  const one = async (P, Q) => { await mine(P); const pl = await P.evaluate(() => LCG.api.state().ply); const u = await P.evaluate(() => LCG.api.army().uci); await P.evaluate(u => LCG.api.move(u), u);
    await Q.waitForFunction(pl => LCG.api.state().ply === pl + 1, pl, { timeout: 60000 }).catch(async e => { console.log('STUCK', u, JSON.stringify(await Q.evaluate(() => ({ st: LCG.api.state(), q: LCG.netQ, rx: window.__rx.slice(-4).map(r => r.raw) })))); throw e; }); await Q.waitForTimeout(300); return u; };
  if (gs.turn === 0) await one(H, G);
  await mine(G);
  const gth = await G.evaluate(() => LCG.api.thoughts());
  check(gth && gth.length === 16 && gth.every(t => t.id < 16), 'guest hears only its own (Black) pieces', gth && gth.map(t => t.sq).join(' '));
  // the guest hovers an enemy piece: body language only
  let ed = null; await G.bringToFront(); await G.evaluate(() => { window.__pm = 0; document.getElementById('gl').addEventListener('pointermove', e => { window.__pm++; window.__pt = [e.clientX, e.clientY, e.pointerType]; }); window.addEventListener('mousemove', () => { window.__mm = (window.__mm || 0) + 1; }); });
  for (let tr = 0; tr < 4 && !(ed && /ENEMY/.test(ed.name)); tr++) {
    await G.waitForTimeout(1200);
    const wq = await G.evaluate(() => { let best = null; for (let sq = 0; sq < 64; sq++) { const pc = LCG.chess.board[sq]; if (!pc || LC.colOf(pc) !== 0) continue; const ps = LCG.api.pieceScreen(sq); const pk = LCG.R.pick(ps.x, ps.y); if (pk.sq === sq && (!best || ps.y > best.y)) best = ps; } return best; });
    await G.mouse.move(wq.x + 40, wq.y + 40); await G.mouse.move(wq.x, wq.y, { steps: 4 }); await G.waitForTimeout(600);
    ed = await G.evaluate(() => LCG.api.dialog());
    if (!/ENEMY/.test(ed.name)) console.log('hover miss', JSON.stringify(wq), await G.evaluate(w => { const e = w && document.elementFromPoint(w.x, w.y); return [e && (e.id || e.className), LCG.hoverId, LCG.R.pick(w.x, w.y), LCG.api.state().turn, LCG.api.state().busy, window.__pm, window.__mm, window.__pt]; }, wq));
  }
  check(/ENEMY/.test(ed.name) && !/\b(I|me)\b/.test(ed.text), 'enemy pieces show no thoughts', ed);
  // moves sync both ways
  const gu = await one(G, H); await mine(H);
  check(await H.evaluate(() => LCG.api.state().fen) === await G.evaluate(() => LCG.api.state().fen), 'guest move arrives on the host', gu);
  const hu = await one(H, G);
  const dbg = async P => P.evaluate(() => ({ s: LCG.api.state().mode, lost: LCG.netLost, st: LCG.Net.st.status, err: LCG.Net.st.error, ply: LCG.api.state().ply, ev: LCG.api.events().slice(-4) }));
  console.log(JSON.stringify([await dbg(H), await dbg(G)]));
  check(await H.evaluate(() => LCG.api.state().fen) === await G.evaluate(() => LCG.api.state().fen), 'host move arrives on the guest', hu);
  const plNow = await H.evaluate(() => LCG.api.state().ply);
  // an illegal/out-of-turn move from the guest is rejected and resynced
  await G.evaluate(pl => LCG.Net.send({ t: 'mv', uci: 'a7a1', ply: pl }), plNow); await H.waitForTimeout(600);
  check(await H.evaluate(() => LCG.api.state().ply) === plNow, 'host rejects an illegal guest move');
  await G.waitForTimeout(2200);
  const link = [await H.evaluate(() => document.getElementById('link').textContent), await G.evaluate(() => document.getElementById('link').textContent)];
  check(link.every(l => /^LINK \d+ ms$/.test(l)), 'LINK ms readout on both', link);
  if (!link.every(l => /^LINK \d+ ms$/.test(l))) console.log(JSON.stringify(await G.evaluate(() => ({ m: LCG.mode, lost: LCG.netLost, over: LCG.over, net: LCG.Net.st, toast: document.getElementById('toast').textContent }))));
  // privacy: nothing either side feels or foresees crosses the wire
  const rxs = [...await G.evaluate(() => window.__rx.map(r => r.raw)), ...await H.evaluate(() => window.__rx.map(r => r.raw))];
  const leak = rxs.filter(r => /"(text|emotion|thought|advice|foresee|pieces|army|urgency|gesture|line)"/.test(r));
  check(rxs.length > 3 && leak.length === 0, 'no thoughts/advice/emotions are ever sent', { n: rxs.length, leak: leak.slice(0, 3), kinds: [...new Set(rxs.map(r => JSON.parse(r).t))] });
  for (const P of [H, G]) { const f = await P.evaluate(() => { const e = document.getElementById('fatal'); return e && getComputedStyle(e).display !== 'none' ? e.textContent : ''; }); if (f || P.errs.length) console.log('FATAL?', P.name, f, P.errs.slice(0, 5)); }
  // guest resigns -> both see the result; rematch swaps colours
  await G.click('#bMenu'); await G.waitForTimeout(200);
  await G.click('#gmenu [data-g=resign]');
  await H.waitForFunction(() => LCG.api.state().over, null, { timeout: 20000 }).catch(() => {});
  const ho = await H.evaluate(() => LCG.api.state().over); check(ho && ho.reason === 'resignation' && ho.winner === 0, 'guest resigns: host wins', ho);
  await G.waitForFunction(() => !document.getElementById('over').classList.contains('hidden'), null, { timeout: 20000 }).catch(() => {});
  await H.waitForFunction(() => !document.getElementById('over').classList.contains('hidden'), null, { timeout: 20000 }).catch(() => {});
  await H.click('#bAgain'); await G.click('#bAgain');
  await G.waitForFunction(() => LCG.api.state().ply === 0 && LCG.api.state().me === 0, null, { timeout: 20000 }).catch(() => {});
  const r2 = [await H.evaluate(() => LCG.api.state()), await G.evaluate(() => LCG.api.state())];
  check(r2[0].me === 1 && r2[1].me === 0 && r2[0].ply === 0 && !r2[0].over, 'rematch: colours swap', r2.map(s => [s.mode, s.me, s.ply]));
  // guest's (now White) first move
  await mine(G); const g2 = await G.evaluate(() => LCG.api.army().uci); await G.evaluate(u => LCG.api.move(u), g2);
  await H.waitForFunction(() => LCG.api.state().ply === 1, null, { timeout: 20000 }).catch(() => {});
  check(await H.evaluate(() => LCG.api.state().ply) === 1, 'rematch moves sync', g2);
  // buddy disconnects -> the machine takes over on the host
  await G.close();
  await H.waitForFunction(() => /MACHINE/.test(document.getElementById('nOpp').textContent), null, { timeout: 40000 }).catch(() => {});
  check(/MACHINE/.test(await H.evaluate(() => document.getElementById('nOpp').textContent)), 'disconnect: the machine takes over the buddy\'s army');
  check(H.errs.length === 0 && G.errs.length === 0, 'no console errors', [H.errs, G.errs]);
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
