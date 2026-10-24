/* Apex Grand Prix: two-player online test. Matchmaking (slot scan, no-game, retry, backup code), own PeerJS namespace,
   host-authoritative race start, same grid/CPU field on both sides, rival car shown + smoothed, LINK readout,
   finishing order, rematch and disconnect. Uses the in-page PeerJS stand-in (mp/fakepeer.js) + Node broker with latency.
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/apex-gp/tests/mp.test.js   (env: LAT JIT CHROME URL) */
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/apex-gp/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, extra) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra)); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (name, q) => {
    const c = await b.newContext({ viewport: { width: 640, height: 400 } }); const p = await c.newPage(); p.name = name;
    await p.route('**/apex-gp/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL + (q || ''), { timeout: 90000 }); await p.waitForTimeout(600);
    return p;
  };
  const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const labels = async p => { await raf(p); return p.evaluate(() => AGP.hits().map(h => h.label)); };
  const tapL = async (p, label) => { await raf(p); await p.evaluate(l => { const h = AGP.app.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + AGP.app.hits.map(h => h.label).join('|')); h.fn(); }, label); };
  const st = p => p.evaluate(() => ({ scr: AGP.screen, ...AGP.net.st }));
  const drawn = p => p.evaluate(() => new Promise(r => { const out = []; const f = Font.draw; Font.draw = function (ctx, s, ...a) { out.push(String(s)); return f.call(this, ctx, s, ...a); }; requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = f; r(out.join(' ')); })); }));
  const host = async p => { await tapL(p, 'HOST TWO-PLAYER ONLINE'); await p.waitForFunction(() => AGP.screen === 'hostwait' && AGP.net.st.status === 'waiting', null, { timeout: 15000 }); };

  say('== MATCHMAKING');
  const H1 = await mk('H1', '?2d');
  await host(H1);
  const hw = (await drawn(H1)).toUpperCase().replace(/\s+/g, ' '); const s1 = await st(H1);
  check(/CALL YOUR BUDDY/.test(hw) && /HOP ON THEIR BIKE/.test(hw) && /JUST LIKE THE OLD DAYS/.test(hw), 'host screen: "call your buddy ... hop on their bike ... just like the old days"');
  check(s1.slot === 1 && hw.includes(s1.code), 'first host takes slot 1, shows backup code ' + s1.code);
  check((await labels(H1)).includes('SEASIDE'), 'host picks the circuit while waiting');
  await tapL(H1, 'SEASIDE');
  const J1 = await mk('J1', '?2d');
  await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForFunction(() => AGP.net.st.status === 'connected', null, { timeout: 20000 });
  const j1 = await st(J1); check(j1.slot === 1 && j1.code === s1.code, 'joiner found the host by slot scan (no code typed)');
  { const named = broker.log.filter(e => e[0] === 'reg').map(e => e[1]).filter(k => /^behram-/.test(k)); check(named.length > 0 && named.every(k => k.startsWith('behram-agp-v1-')), 'own PeerJS namespace behram-agp-v1-*', named.slice(0, 3)); }
  const J3 = await mk('J3', '?2d'); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => AGP.net.st.status === 'nogame', null, { timeout: 15000 });
  const nb = await labels(J3); check(nb.includes('TRY AGAIN') && nb.includes('ENTER BACKUP CODE'), '"No game found" offers try again + backup code', nb);
  const H3 = await mk('H3', '?2d'); await host(H3); const s3 = await st(H3);
  await tapL(J3, 'TRY AGAIN'); await J3.waitForFunction(() => AGP.net.st.status === 'connected', null, { timeout: 15000 });
  check((await st(J3)).code === s3.code, 'try again finds the new host');
  const H4 = await mk('H4', '?2d'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4', '?2d'); await J4.evaluate(() => { AGP.app.code = ''; AGP.go('code'); });
  for (const ch of s4.code) await tapL(J4, ch);
  await tapL(J4, 'JOIN'); await J4.waitForFunction(() => AGP.net.st.status === 'connected', null, { timeout: 15000 });
  check((await st(J4)).code === s4.code, 'backup code path works');
  for (const p of [H3, J3, H4, J4]) await p.context().close();

  say('== HEAD-TO-HEAD  (fake link ' + LAT + ' ms + ' + JIT + ' ms jitter)');
  const H = H1, G = J1;
  await Promise.all([H, G].map(p => p.waitForFunction(() => AGP.screen === 'play' && AGP.G && AGP.G.mode === 'versus', null, { timeout: 15000 })));
  const info = await Promise.all([H, G].map(p => p.evaluate(() => ({ seed: AGP.app.vs.seed, c: AGP.sim.T.id, laps: AGP.G.laps, slot: AGP.G.car.slot, ncpu: AGP.G.cpu.length, remote: !!AGP.G.remote, rl: AGP.G.remote.livery, cpu: AGP.G.cpu.map(c => c.slot).join(',') }))));
  check(info[0].seed === info[1].seed && info[0].c === 'seaside' && info[1].c === 'seaside' && info[0].laps === 3, 'both sides race the host’s circuit (Seaside), same seed, 3 laps', info);
  check(info[0].slot === 0 && info[1].slot === 1 && info[0].ncpu === 6 && info[1].ncpu === 6 && info[0].cpu === info[1].cpu, 'host on pole, guest 2nd, same 6 CPU cars on both grids');
  check(info[0].remote && info[1].remote && info[0].rl[0] === '#ffd400', 'rival shown as a yellow car on both screens');
  const bn = (await G.evaluate(() => AGP.app.msg && AGP.app.msg.text)); check(bn === 'BUDDY CONNECTED!', 'guest sees BUDDY CONNECTED!', bn);
  await Promise.all([H, G].map(p => p.waitForFunction(() => AGP.G.phase === 'run', null, { timeout: 20000 })));
  check(true, 'both go green (host owns the start)');
  // both drive on autopilot for a few seconds
  await Promise.all([H, G].map(p => p.evaluate(() => { AGP.G.auto = true; })));
  await H.waitForTimeout(4000);
  const sync = await Promise.all([H, G].map(p => p.evaluate(() => ({ me: AGP.G.car.dist, riv: AGP.G.remote.dist, cpu: AGP.G.cpu.map(c => c.dist) }))));
  const errH = Math.abs(sync[0].riv - sync[1].me), errG = Math.abs(sync[1].riv - sync[0].me), cpuErr = Math.max(...sync[0].cpu.map((d, i) => Math.abs(d - sync[1].cpu[i])));
  check(sync[0].me > 20 && sync[1].me > 20, 'both cars are racing', [sync[0].me, sync[1].me].map(Math.round));
  check(errH < 25 && errG < 25, 'rival car positions track the other side (prediction + smoothing): ' + errH.toFixed(1) + ' m / ' + errG.toFixed(1) + ' m');
  check(cpuErr < 25, 'CPU cars agree on both sides (host-authoritative, guest smoothed): max ' + cpuErr.toFixed(1) + ' m');
  const gh = await drawn(G); check(/RIVAL/.test(gh) && /LINK \d+ MS/.test(gh), 'HUD shows RIVAL gap + LINK ms readout', gh.match(/LINK \S+ MS/));
  const ping = await G.evaluate(() => AGP.net.st.ping); check(ping > 0 && ping < 400, 'LINK ping measured (' + ping + ' ms)');
  // rival crash propagates as an explosion
  await H.evaluate(() => { const c = AGP.G.car; AGP.sim._.crashCar(c, 'sign'); });
  await G.waitForFunction(() => AGP.G.remote.crash > 0, null, { timeout: 3000 }).then(() => check(true, 'host crash shows as an exploding rival on the guest'), () => check(false, 'rival crash never shown'));
  // finish: guest first, then host
  await G.evaluate(() => { const G = AGP.G; G.car.dist = G.laps * AGP.sim.T.L - 3; G.car.lap = G.laps - 1; });
  await G.waitForFunction(() => AGP.G.finished, null, { timeout: 5000 });
  await H.waitForFunction(() => AGP.app.vs.rivalFin > 0, null, { timeout: 5000 }).then(() => check(true, 'host told the guest finished'), () => check(false, 'fin never reached host'));
  await H.evaluate(() => { const G = AGP.G; G.car.crash = 0; G.car.dist = G.laps * AGP.sim.T.L - 3; G.car.lap = G.laps - 1; G.car.v = 60; });
  await Promise.all([H, G].map(p => p.waitForFunction(() => AGP.screen === 'vsend' && AGP.app.vs.res, null, { timeout: 15000 })));
  const res = await Promise.all([H, G].map(p => p.evaluate(() => AGP.app.vs.res)));
  check(res[0].ord[0] === 'guest' && res[1].ord[0] === 'guest' && res[0].tm[1] === res[1].tm[1], 'finishing order agreed on both sides (guest won)', res);
  const ge = (await drawn(G)).toUpperCase(); const he = (await drawn(H)).toUpperCase();
  check(/YOU WIN/.test(ge) && /YOUR BUDDY WINS/.test(he), 'result screens: guest "YOU WIN!", host "YOUR BUDDY WINS"');
  // rematch
  await tapL(G, 'REMATCH'); await tapL(H, 'REMATCH');
  await Promise.all([H, G].map(p => p.waitForFunction(() => AGP.screen === 'play' && AGP.G.phase !== 'finish' && !AGP.G.finished, null, { timeout: 15000 })));
  const rs = await Promise.all([H, G].map(p => p.evaluate(() => AGP.app.vs.seed)));
  check(rs[0] === rs[1] && rs[0] !== info[0].seed, 'rematch starts a new race on both sides');
  // disconnect
  await G.context().close();
  await H.waitForFunction(() => AGP.app.vs.rivalLeft, null, { timeout: 15000 }).then(() => check(true, 'host notices the buddy left (banner, race continues)'), () => check(false, 'disconnect not noticed'));
  check(await H.evaluate(() => AGP.screen) === 'play', 'host stays in the race after the rival leaves');
  check(H.errs.length === 0 && G.errs.length === 0, 'no console errors', H.errs.concat(G.errs).slice(0, 3));
  await b.close();
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
