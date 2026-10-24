/* Trackball Football: two-player online test. Matchmaking (slots, no-game, retry, backup code), secret play
   calls (every message the guest receives before the snap and every string either screen draws while
   calling plays), guest prediction latency and disconnect handling. Uses the in-page PeerJS stand-in
   (mp/fakepeer.js) and a Node broker with simulated latency (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/trackball-football/tests/mp.test.js   (env: LAT JIT PLAYS CHROME URL) */
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/trackball-football/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const all = [];
  const mk = async (name) => {
    const c = await b.newContext({ viewport: { width: 1000, height: 640 } }); const p = await c.newPage(); p.name = name; all.push(p);
    await p.route('**/trackball-football/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { // log every string drawn while plays are being called (secrecy test)
      window.__drawn = new Set();
      for (const k of ['fillText', 'strokeText']) { const f = CanvasRenderingContext2D.prototype[k]; CanvasRenderingContext2D.prototype[k] = function (s, ...a) { const S = TBF.App.snap; if (TBF.App.screen === 'game' && S && (S.ph === 'select' || S.ph === 'presnap')) window.__drawn.add(String(s)); return f.call(this, s, ...a); }; }
    });
    return p;
  };
  const tapL = (p, label) => p.evaluate(l => { const h = TBF.UI.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + TBF.UI.hits.map(h => h.label).join('|')); h.fn(); }, label);
  const st = p => p.evaluate(() => ({ scr: TBF.App.screen, mode: TBF.App.mode, ...TBF.Net.st }));
  const host = async p => { await tapL(p, 'TWO-PLAYER GAME (ONLINE)'); await p.waitForFunction(() => TBF.App.screen === 'hostwait' && TBF.Net.st.status === 'waiting', null, { timeout: 15000 }); };

  say('== MENU');
  const H1 = await mk('H1');
  const labels = await H1.evaluate(() => TBF.UI.hits.map(h => h.label));
  say('title buttons:', labels.join(' | '));
  check(labels.includes('PLAY VS COMPUTER') && labels.includes('TWO-PLAYER GAME (ONLINE)') && labels.includes('JOIN TWO-PLAYER GAME IN PROGRESS') && labels.includes('HOW TO PLAY') && !labels.some(l => /LOCAL|SAME-SCREEN/.test(l)), 'menu: vs Computer / Two-Player (Online) / Join in progress / How to Play, no local 2P');

  say('== MATCHMAKING');
  await host(H1);
  const hw = await H1.evaluate(() => { const out = []; const f = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { out.push(String(s)); return f.call(this, s, ...a); }; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => { CanvasRenderingContext2D.prototype.fillText = f; r(out.join(' ')); }))); });
  check(/hop on their bike/.test(hw) && /just like the old days/.test(hw), 'host screen shows the "call your buddy ... hop on their bike ... just like the old days" message');
  const s1 = await st(H1); say('H1', { slot: s1.slot, code: s1.code, status: s1.status }); check(s1.slot === 1 && hw.includes(s1.code.split('').join(' ')), 'first host takes slot 1 and shows its backup code');
  const H2 = await mk('H2'); await host(H2); const s2 = await st(H2); check(s2.slot === 2, 'second host gets slot 2');
  const J1 = await mk('J1');
  const tj = Date.now(); await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForFunction(() => TBF.App.mode === 'guest' && TBF.App.snap, null, { timeout: 20000 });
  const j1 = await st(J1); say('J1 joined slot', j1.slot, 'room', j1.code, 'in', Date.now() - tj, 'ms');
  check(j1.slot === 1 && j1.code === s1.code, 'joiner found the waiting host by slot scan (no code typed)');
  await H1.waitForFunction(() => TBF.App.mode === 'host' && TBF.App.screen === 'game', null, { timeout: 8000 });
  check([...broker.ids.keys()].every(k => !k.startsWith('behram-afb')), 'uses its own PeerJS namespace (behram-tbf-v1-*), never Atari Football\u2019s');
  const J2 = await mk('J2'); await tapL(J2, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J2.waitForFunction(() => TBF.App.mode === 'guest' && TBF.App.snap, null, { timeout: 20000 });
  check((await st(J2)).code === s2.code, 'second joiner matched host 2 (host 1 is busy)');
  const J3 = await mk('J3'); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => TBF.Net.st.status === 'nogame', null, { timeout: 15000 }); await J3.waitForTimeout(150);
  const nb = await J3.evaluate(() => TBF.UI.hits.map(h => h.label)); check(nb.includes('RETRY') && nb.includes('ENTER CODE INSTEAD'), '"No game waiting" offers Retry + Enter code instead');
  const H3 = await mk('H3'); await host(H3); const s3 = await st(H3);
  await tapL(J3, 'RETRY'); await J3.waitForFunction(() => TBF.App.mode === 'guest', null, { timeout: 15000 }); check((await st(J3)).code === s3.code, 'Retry finds the new host');
  const H4 = await mk('H4'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4'); await J4.evaluate(() => TBF.App.go('code')); await J4.waitForTimeout(100);
  for (const ch of s4.code) await tapL(J4, ch);
  await tapL(J4, 'JOIN!'); await J4.waitForFunction(() => TBF.App.mode === 'guest', null, { timeout: 15000 }); check((await st(J4)).code === s4.code, 'backup room code path works');
  for (const p of [H2, J2, H3, J3, H4, J4]) await p.close();

  say('== GAMEPLAY + SECRECY  (fake link: ' + LAT + ' ms one-way + up to ' + JIT + ' ms jitter)');
  const H = H1, G = J1; let secretMsgs = 0; const LAGS = { on: [], off: [] };
  for (let play = 0; play < +(process.env.PLAYS || 5); play++) {
    await H.waitForFunction(() => TBF.Sim.G.phase === 'select', null, { timeout: 60000 });
    await G.waitForFunction(() => TBF.App.snap && TBF.App.snap.ph === 'select', null, { timeout: 10000 });
    const markG = await G.evaluate(() => { window.__drawn.clear(); return window.__rx.length; });
    const markH = await H.evaluate(() => { window.__drawn.clear(); return window.__rx.length; });
    await H.waitForTimeout(400);
    for (let i = 0; i < play % 4; i++) { await H.keyboard.press('ArrowRight'); await H.waitForTimeout(30); }
    const hFlip = play % 2 === 0, gFlip = play % 3 !== 1; // FLIP is part of the secret call
    if (hFlip) { await H.keyboard.press('f'); await H.waitForTimeout(30); }
    await H.keyboard.press('Space');
    const hostLockAt = await H.evaluate(() => performance.now());
    await H.waitForTimeout(250);
    const gAfter = await G.evaluate(() => JSON.stringify(TBF.App.snap));
    for (let i = 0; i < (play * 2 + 1) % 5; i++) { await G.keyboard.press('ArrowRight'); await G.waitForTimeout(40); }
    if (gFlip) { await G.keyboard.press('f'); await G.waitForTimeout(30); }
    await G.waitForTimeout(300);
    await G.keyboard.press('Space');
    await H.waitForFunction(() => TBF.Sim.G.phase === 'presnap' || TBF.Sim.G.phase === 'live', null, { timeout: 8000 });
    const preFF = await H.evaluate(() => [TBF.Sim.G.phase, TBF.Sim.G.formFlip.slice(), TBF.Sim.G.pflip.slice()]);
    // hike (whoever is on offense)
    const offIsHost = await H.evaluate(() => TBF.Sim.G.off === 0);
    await (offIsHost ? H : G).waitForTimeout(900); await (offIsHost ? H : G).keyboard.press('Space');
    await H.waitForFunction(() => TBF.Sim.G.phase === 'live', null, { timeout: 8000 });
    const info = await H.evaluate(() => { const G = TBF.Sim.G, P = id => PLAY_BY_ID[id].name; return { off: G.off, h: G.picks[0], hn: P(G.picks[0]), g: G.picks[1], gn: P(G.picks[1]), pf: G.pflip.slice(), ff: G.formFlip.slice() }; });
    await G.waitForFunction(() => TBF.App.snap && TBF.App.snap.ph === 'live', null, { timeout: 5000 });
    const gRx = await G.evaluate(m => window.__rx.slice(m), markG), hRx = await H.evaluate(m => window.__rx.slice(m), markH);
    const tok = (raw, v) => raw.includes('"' + v + '"');
    let upto = gRx.findIndex(m => { const d = JSON.parse(m.raw); return d.t === 's' && d.s.ph === 'live'; }); if (upto < 0) upto = gRx.length;
    const preG = gRx.slice(0, upto), leak = preG.filter(m => tok(m.raw, info.h) || tok(m.raw, info.hn));
    secretMsgs += preG.length;
    check(leak.length === 0 && preG.length > 20, `play ${play}: host (${info.off === 0 ? 'OFF' : 'DEF'}) called ${info.hn}; ${preG.length} msgs reached the guest before the snap, none contain it` + (leak.length ? ' LEAK ' + leak[0].raw.slice(0, 160) : ''));
    check(!tok(gAfter, info.h) && !tok(gAfter, info.hn), `play ${play}: guest state right after the host locked has no trace of the host's call`);
    // FLIP secrecy: the flip travels with the call, after both locked, and nothing shows it before the snap
    const flLeak = preG.filter(m => /"fl":\[|\(FLIP\)/.test(m.raw));
    check(info.pf[0] === hFlip && info.pf[1] === gFlip, `play ${play}: flips reached the sim (host ${hFlip}, guest ${gFlip}) -> ${JSON.stringify(info.pf)}`);
    check(flLeak.length === 0 && !/"fl":\[/.test(gAfter) && (preFF[0] !== 'presnap' || (!preFF[1][0] && !preFF[1][1])), `play ${play}: no flip info in the ${preG.length} pre-snap msgs to the guest, and formations stay unflipped until the snap (presnap formFlip ${JSON.stringify(preFF[1])})`);
    const gLive = await G.evaluate(() => TBF.App.snap.fl);
    check(JSON.stringify(gLive) === JSON.stringify([hFlip ? 1 : 0, gFlip ? 1 : 0]) && info.ff[0] === hFlip && info.ff[1] === gFlip, `play ${play}: at the snap both flips are revealed and the formations mirror (${JSON.stringify(gLive)})`);
    const hd = hRx.map(m => ({ at: m.at, d: JSON.parse(m.raw) }));
    const iLock = hd.findIndex(m => m.d.t === 'lock'), iPick = hd.findIndex(m => m.d.t === 'pick');
    const before = iPick < 0 ? hd : hd.slice(0, iPick);
    check(iLock >= 0 && iPick > iLock && hd[iPick].at > hostLockAt && !before.some(m => JSON.stringify(m.d).includes('"' + info.g + '"')), `play ${play}: guest called ${info.gn}; host got 'lock' (no id) first and the id only after it had locked itself`);
    check(!before.some(m => 'f' in m.d || 'flip' in m.d) && hd[iPick] && hd[iPick].d.f === (gFlip ? 1 : 0), `play ${play}: the guest's flip (${gFlip}) was sent only inside its 'pick', after the host locked`);
    const cur = hd.slice(Math.max(0, iLock), iPick < 0 ? hd.length : iPick).filter(m => m.d.t === 'i' && (m.d.x || m.d.y));
    check(cur.length === 0, `play ${play}: no guest trackball motion reached the host while picking (${cur.length})`);
    const hDrawn = await H.evaluate(() => [...window.__drawn]), gDrawn = await G.evaluate(() => [...window.__drawn]);
    check(!hDrawn.includes(info.gn), `play ${play}: host screen never drew the guest's call before the snap`);
    check(!gDrawn.includes(info.hn) || info.hn === info.gn && false, `play ${play}: guest screen never drew the host's call before the snap`);
    check(gDrawn.some(s => /OPPONENT (LOCKED IN|IS CHOOSING)/.test(s)) && hDrawn.some(s => /OPPONENT (LOCKED IN|IS CHOOSING)/.test(s)), `play ${play}: both screens show the opponent-status indicator`);
    // guest own-player response, with and without prediction (keyboard stroke on the virtual ball)
    if (play < 4) for (const noPred of play % 2 ? [true, false] : [false, true]) {
      const lag = await G.evaluate(async noPred => {
        TBF.App.noPredict = noPred; await new Promise(r => setTimeout(r, 100));
        const S0 = TBF.App.snap; if (!S0 || S0.ph !== 'live') return null;
        const i = S0.ctl[1]; if (S0.pl[i][4] !== 0) return null; const y0 = S0.pl[i][1], t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
        const r = await new Promise(res => { const f = () => { const S = TBF.App.snap; if (S.ctl[1] !== i || S.ph !== 'live') return res(-2); if (y0 - S.pl[i][1] > 0.12) res(performance.now() - t0); else if (performance.now() - t0 > 900) res(-1); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await new Promise(r => setTimeout(r, 120)); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));
        TBF.Track.stop(); await new Promise(r => setTimeout(r, 300)); TBF.App.noPredict = false;
        return { ms: Math.round(r), ping: TBF.Net.st.ping, buffer: Math.round(TBF.App.delay) };
      }, noPred);
      say(`  own-player response ${noPred ? 'WITHOUT' : 'WITH'} prediction:`, lag);
      if (lag && lag.ms > 0) (noPred ? LAGS.off : LAGS.on).push(lag.ms);
    }
    await H.waitForFunction(() => TBF.Sim.G.phase !== 'live', null, { timeout: 30000 });
    say('  result', await H.evaluate(() => TBF.Sim.G.banner && TBF.Sim.G.banner.t + ' / ' + TBF.Sim.G.banner.sub));
    const sc = await Promise.all([H.evaluate(() => TBF.Sim.snapshot().sc.join('-')), G.evaluate(() => new Promise(r => setTimeout(() => r(TBF.App.snap.sc.join('-')), 400)))]);
    check(sc[0] === sc[1], `play ${play}: guest scoreboard matches host (${sc[0]})`);
  }
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null;
  say('own-player key->screen median ms: WITH prediction', med(LAGS.on), LAGS.on, ' WITHOUT', med(LAGS.off), LAGS.off);
  check(LAGS.on.length && LAGS.off.length && med(LAGS.on) < med(LAGS.off), 'prediction makes the guest\u2019s own player respond faster');
  const sz = await G.evaluate(() => { const a = window.__rx.filter(m => m.raw.startsWith('{"t":"s"')).slice(-120).map(m => m.raw.length); return [Math.min(...a), Math.round(a.reduce((x, y) => x + y, 0) / a.length), Math.max(...a)]; });
  say('state msg bytes min/avg/max', sz);
  say('== ONLINE PICK: guest on defense, Space to grab the closest man, Space again as the ball arrives');
  await H.waitForFunction(() => TBF.Sim.G.phase === 'select', null, { timeout: 60000 });
  await H.evaluate(() => { const G = TBF.Sim.G; G.off = 0; G.los = 60; G.ballY = 160 / 6; G.down = 1; G.togo = 10; });
  await G.waitForFunction(() => TBF.App.snap && TBF.App.snap.ph === 'select' && TBF.App.snap.off === 0, null, { timeout: 5000 });
  await H.waitForTimeout(300); await H.keyboard.press('Space'); await G.waitForTimeout(400); await G.keyboard.press('Space');
  await H.waitForFunction(() => TBF.Sim.G.phase === 'presnap', null, { timeout: 8000 }); await H.waitForTimeout(500); await H.keyboard.press('Space');
  await H.waitForFunction(() => TBF.Sim.G.phase === 'live', null, { timeout: 8000 });
  const markP = await H.evaluate(() => window.__rx.length);
  await H.evaluate(() => { // a long pass in the air; the guest's corner is near the catch, the guest controls the DT far away
    const G = TBF.Sim.G, MID = 160 / 6, tx = G.los + 16, ty = MID, b = G.ball;
    G.pl.forEach((p, k) => { if (k === 5 || k === 11) return; p.x = G.los - 8; p.y = 4 + k * 3.3; p.vx = p.vy = 0; p.st = 'ok'; p.eng = -1; });
    const r = G.pl[5], me = G.pl[11]; r.x = tx - 6; r.y = ty; r.st = 'ok'; r.eng = -1; r.as = 'route'; r.route = [{ x: tx + 2, y: ty }]; r.wp = 0;
    me.x = tx - 1; me.y = ty + 1.2; me.st = 'ok'; me.eng = -1; me.vx = me.vy = 0; G.ctl[1] = 7; G.thrown = true;
    Object.assign(b, { st: 'air', kind: 'pass', holder: -1, t: 0, T: 1.8, sx: G.los, sy: ty, sz: 2, tx, ty, tz: 1.25, tgt: 5, from: 3, x: G.los, y: ty, z: 2, hold: 0, lunge: null, arr: null });
  });
  const gp = await G.evaluate(() => new Promise(res => { let n = 0; const out = {}; const t0 = performance.now();
    const key = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); };
    const f = () => { const S = TBF.App.snap; if (performance.now() - t0 > 4000) return res(Object.assign(out, { timeout: true }));
      if (n === 0 && S.ba != null && S.ba < 1.4) { key(); n = 1; out.first = +S.ba.toFixed(2); }
      else if (n === 1 && S.ba != null && S.ba <= 0.02) { key(); n = 2; out.second = +S.ba.toFixed(3); out.ctl = S.ctl[1]; }
      else if (n === 2 && S.ph !== 'live' || n === 2 && S.ba == null) { out.after = S.b[3] === 0 ? S.b[4] : -1; return res(out); }
      requestAnimationFrame(f); };
    requestAnimationFrame(f); }));
  await H.waitForTimeout(400);
  const hp = await H.evaluate(m => ({ lp: TBF.Sim.G.lastPick, ctl: TBF.Sim.G.ctl[1], lag: TBF.Sim.G.lag, msgs: window.__rx.slice(m).map(x => JSON.parse(x.raw)).filter(d => d.t === 'i' && 'tt' in d).map(d => d.tt) }), markP);
  say('  guest presses (time-to-arrival on its screen)', gp, ' host saw', hp);
  check(gp.ctl === 11 && hp.msgs.length > 0, 'online: the guest\u2019s first Space jumped to the corner nearest the catch, and its presses carry the time-to-arrival it saw');
  check(hp.lp && Math.abs(hp.lp.e) <= 0.12 && hp.lp.g === 'PERFECT', 'online: a press timed to the guest\u2019s own screen is graded on that timing by the host (latency compensated): ' + JSON.stringify(hp.lp));
  say('== DISCONNECT'); await G.close(); await H.waitForFunction(() => TBF.App.screen === 'error', null, { timeout: 15000 });
  await H.waitForTimeout(400); const eb = await H.evaluate(() => TBF.UI.hits.map(h => h.label)); say('host error screen buttons', eb.join(' | '));
  check(eb.includes('MAIN MENU'), 'host sees the opponent-left screen with a way back to the menu');
  const errs = all.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors on any page ' + JSON.stringify(errs.slice(0, 5)));
  say('secrecy: messages inspected before snaps =', secretMsgs);
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
