/* Two-player online test: matchmaking (slots, busy, no-game, code path), secret play calls (every message
   the guest receives and every string either screen draws during play selection), latency and disconnects.
   Uses an in-page stand-in for PeerJS (mp/fakepeer.js) and a Node broker with simulated latency (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &  then  npm i playwright-core  and
     node games/atari-football/tests/mp.test.js     (env: LAT=40 JIT=10 PLAYS=5 CHROME=path SHOTS=dir URL=...) */
// Two-player matchmaking + gameplay + play-call secrecy + latency, over the fake PeerJS transport.
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const OUT = []; const say = (...a) => { const s = a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); OUT.push(s); console.log(s); };
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const all = [];
  const mk = async (name, opts = {}) => {
    const c = await b.newContext(Object.assign({ viewport: { width: 1200, height: 750 } }, opts)); const p = await c.newPage(); p.name = name; all.push(p);
    await p.route('**/atari-football/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto((process.env.URL || 'http://localhost:8080/games/atari-football/')); await p.waitForTimeout(400);
    await p.evaluate(() => { // log every string drawn on screen, by phase (secrecy test)
      window.__drawn = new Set(); for (const k of ['draw', 'shadow']) { const f = FONT[k]; FONT[k] = function (ctx, s, ...a) { const S = AFB.App.snap; if (AFB.App.screen === 'game' && S && (S.ph === 'select' || S.ph === 'presnap')) window.__drawn.add(String(s)); return f.call(this, ctx, s, ...a); }; }
    });
    return p;
  };
  const tapL = (p, label) => p.evaluate(l => { const h = AFB.UI.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + AFB.UI.hits.map(h => h.label).join('|')); h.fn(); }, label);
  const st = p => p.evaluate(() => ({ scr: AFB.App.screen, mode: AFB.App.mode, ...AFB.Net.st }));
  const host = async p => { await tapL(p, 'TWO-PLAYER GAME (ONLINE)'); await p.waitForTimeout(1500); const s1 = await p.evaluate(() => AFB.App.screen); await p.keyboard.press('Escape'); await p.waitForFunction(() => AFB.App.screen === 'hostLobby' && AFB.Net.st.status === 'waiting', null, { timeout: 15000 }); return s1; };

  say('== MENU');
  const H1 = await mk('H1');
  const labels = await H1.evaluate(() => AFB.UI.hits.map(h => h.label));
  say('title buttons:', labels.join(' | '));
  check(labels.includes('TWO-PLAYER GAME (ONLINE)') && labels.includes('JOIN TWO-PLAYER GAME IN PROGRESS') && !labels.some(l => /LOCAL|SAME-SCREEN/.test(l)), 'menu has Two-Player / Join-in-progress and no local 2P');

  say('== MATCHMAKING');
  const firstScreen = await host(H1); check(firstScreen === 'homage', 'Two-Player Game opens the "call your buddy" homage first');
  await H1.waitForTimeout(400); (process.env.SHOTS && await H1.screenshot({ path: process.env.SHOTS + '/60-waiting.png' }));
  const s1 = await st(H1); say('H1', { slot: s1.slot, code: s1.code, status: s1.status }); check(s1.slot === 1, 'first host takes slot 1');
  const H2 = await mk('H2'); await host(H2); const s2 = await st(H2); say('H2', { slot: s2.slot, code: s2.code }); check(s2.slot === 2, 'second host gets slot 2 (slot 1 answered unavailable-id)');
  const J1 = await mk('J1');
  const tj = Date.now(); await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForTimeout(150); (process.env.SHOTS && await J1.screenshot({ path: process.env.SHOTS + '/61-looking.png' }));
  await J1.waitForFunction(() => AFB.App.mode === 'guest' && AFB.App.snap, null, { timeout: 20000 });
  const j1 = await st(J1); say('J1 joined slot', j1.slot, 'room', j1.code, 'in', Date.now() - tj, 'ms; dead slots seen', j1.dead, 'live', j1.live);
  const pairedHost = j1.code === s1.code ? H1 : H2, otherHost = pairedHost === H1 ? H2 : H1;
  check(j1.slot === 1 && pairedHost === H1, 'joiner found the waiting host by slot scan (no code typed)');
  await H1.waitForFunction(() => AFB.App.mode === 'host', null, { timeout: 5000 });
  await H1.waitForTimeout(600);
  say('broker ids now', [...broker.ids.keys()].filter(k => k.startsWith('behram')).join(' '));
  check(![...broker.ids.keys()].includes('behram-afb-v1-slot-1'), 'paired host released slot 1 (and its code) from the server');
  const J2 = await mk('J2'); await tapL(J2, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J2.waitForFunction(() => AFB.App.mode === 'guest' && AFB.App.snap, null, { timeout: 20000 });
  const j2 = await st(J2); say('J2 joined slot', j2.slot, 'room', j2.code); check(j2.code === s2.code, 'second pair: joiner 2 matched host 2 (host 1 is already in a game)');
  const J3 = await mk('J3'); const t3 = Date.now(); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => AFB.Net.st.status === 'nogame', null, { timeout: 15000 });
  say('J3 nogame after', Date.now() - t3, 'ms'); await J3.waitForTimeout(200); (process.env.SHOTS && await J3.screenshot({ path: process.env.SHOTS + '/62-nogame.png' }));
  const nb = await J3.evaluate(() => AFB.UI.hits.map(h => h.label)); say('J3 buttons', nb.join(' | '));
  check(nb.includes('RETRY') && nb.includes('ENTER CODE INSTEAD'), '"No game waiting" screen offers Retry + Enter code instead');
  const H3 = await mk('H3'); await host(H3); const s3 = await st(H3); check(s3.slot === 1, 'a new host re-uses the freed slot 1 (got ' + s3.slot + ')');
  await tapL(J3, 'RETRY'); await J3.waitForFunction(() => AFB.App.mode === 'guest', null, { timeout: 15000 }); check((await st(J3)).code === s3.code, 'Retry finds the new host');
  // code fallback: H4 hosts, J4 types its code
  const H4 = await mk('H4'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4'); await tapL(J4, 'JOIN TWO-PLAYER GAME IN PROGRESS'); await J4.waitForTimeout(100);
  // (J4 would find H4 by scan too; test the code path explicitly)
  await J4.evaluate(() => { AFB.Net.leave(); AFB.App.go('join'); }); await J4.waitForTimeout(100);
  for (const ch of s4.code) await tapL(J4, ch);
  await tapL(J4, 'JOIN!'); await J4.waitForFunction(() => AFB.App.mode === 'guest', null, { timeout: 15000 }); check((await st(J4)).code === s4.code, 'backup room code path works');
  // busy host: a 3rd device dialing H1's code after it is paired is refused / not found
  for (const p of [H2, J2, H3, J3, H4, J4]) await p.close();

  say('== GAMEPLAY + SECRECY  (fake link: ' + LAT + ' ms one-way + up to ' + JIT + ' ms jitter)');
  const H = H1, G = J1;
  let secretChecks = 0, plays = 0; const LAGS = { on: [], off: [] };
  for (let play = 0; play < +(process.env.PLAYS || 5); play++) {
    await H.waitForFunction(() => AFB.Sim.G.phase === 'select', null, { timeout: 60000 });
    const markG = await G.evaluate(() => { window.__drawn.clear(); return window.__rx.length; });
    const markH = await H.evaluate(() => { window.__drawn.clear(); return window.__rx.length; });
    await H.waitForTimeout(500);
    // host calls a play (keyboard), guest calls one (keyboard)
    for (let i = 0; i < (play * 3) % 7; i++) await H.keyboard.press('ArrowDown');
    await H.keyboard.press('Space');
    const hostLockAt = await H.evaluate(() => performance.now());
    await H.waitForTimeout(200);
    const gSnapAfterHostLock = await G.evaluate(() => JSON.stringify(AFB.App.snap));
    for (let i = 0; i < (play * 2 + 1) % 6; i++) { await G.keyboard.press('ArrowDown'); await G.waitForTimeout(40); }
    await G.waitForTimeout(400);
    await G.keyboard.press('Space');
    await H.waitForFunction(() => AFB.Sim.G.phase === 'live', null, { timeout: 8000 });
    const info = await H.evaluate(() => { const G = AFB.Sim.G, P = id => (OFFENSE.concat(DEFENSE).find(p => p.id === id) || {}).name; return { off: G.off, h: G.picks[0], hn: P(G.picks[0]), g: G.picks[1], gn: P(G.picks[1]) }; });
    plays++;
    const gRx = await G.evaluate(m => window.__rx.slice(m), markG), hRx = await H.evaluate(m => window.__rx.slice(m), markH);
    const tok = (raw, v) => raw.includes('"' + v + '"');
    let upto = gRx.findIndex(m => { const d = JSON.parse(m.raw); return d.t === 's' && d.s.ph === 'live'; }); if (upto < 0) upto = gRx.length;
    const preG = gRx.slice(0, upto); const leakG = preG.filter(m => tok(m.raw, info.h) || tok(m.raw, info.hn));
    secretChecks += preG.length;
    check(leakG.length === 0, `play ${play}: host (${info.off === 0 ? 'O' : 'D'}) called ${info.hn}; ${preG.length} msgs reached the guest before the snap, 0 contain it` + (leakG.length ? ' LEAK ' + leakG[0].raw.slice(0, 200) : ''));
    check(!tok(gSnapAfterHostLock, info.h) && !tok(gSnapAfterHostLock, info.hn), `play ${play}: guest state after host locked has no trace of host call`);
    // host side: guest's id only arrives in a 'pick' after 'need', and no cursor traffic while picking
    const hd = hRx.map(m => ({ at: m.at, d: JSON.parse(m.raw) }));
    const iLock = hd.findIndex(m => m.d.t === 'lock'), iPick = hd.findIndex(m => m.d.t === 'pick');
    const before = iPick < 0 ? hd : hd.slice(0, iPick);
    check(iLock >= 0 && iPick > iLock && hd[iPick].at > hostLockAt && !before.some(m => JSON.stringify(m.d).includes('"' + info.g + '"')),
      `play ${play}: guest called ${info.gn}; host got 'lock' (no id) first, the id only after the host had locked`);
    const cursor = hd.slice(iLock < 0 ? 0 : Math.max(0, iLock - 0), iPick < 0 ? hd.length : iPick).filter(m => m.d.t === 'i' && (m.d.x || m.d.y || m.d.a));
    check(cursor.length === 0, `play ${play}: no guest stick/cursor input reached the host while picking (${cursor.length})`);
    const hDrawn = await H.evaluate(() => [...window.__drawn]), gDrawn = await G.evaluate(() => [...window.__drawn]);
    const shows = (arr, n) => arr.filter(s => s === n || s === 'YOUR CALL: ' + n || s.startsWith(n + '  VS') || s.endsWith('VS  ' + n) || s === 'LOCK IN ' + n || /^\s*\d+ /.test(s) && s.replace(/^\s*\d+ /, '') === n);
    check(shows(hDrawn, info.gn).length === 0, `play ${play}: host screen never drew the guest's call before the snap`);
    check(shows(gDrawn, info.hn).length === 0, `play ${play}: guest screen never drew the host's call before the snap`);
    check(gDrawn.some(s => /OPPONENT (LOCKED IN|IS CHOOSING)/.test(s)) && hDrawn.some(s => /OPPONENT (LOCKED IN|IS CHOOSING)/.test(s)), `play ${play}: both screens show the opponent-status indicator`);
    // latency: guest's own player response to a key press, with and without prediction
    if (play < 4) for (const noPred of play % 2 ? [true, false] : [false, true]) {
      const lag = await G.evaluate(async noPred => {
        AFB.App.noPredict = noPred;
        await new Promise(r => setTimeout(r, 120));
        const S0 = AFB.App.snap; if (!S0 || S0.ph !== 'live') return null;
        const i = S0.ctl[1], y0 = S0.pl[i][1], t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp', key: 'ArrowUp' }));
        const r = await new Promise(res => { const f = () => { const S = AFB.App.snap; const p = S.pl[S.ctl[1]]; if (S.ctl[1] !== i || S.ph !== 'live') return res(-2); if (y0 - p[1] > 0.12) res(performance.now() - t0); else if (performance.now() - t0 > 800) res(-1); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await new Promise(r => setTimeout(r, 150));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp', key: 'ArrowUp' }));
        await new Promise(r => setTimeout(r, 450)); // let the player stop on both screens before the next sample
        AFB.App.noPredict = false;
        return { ms: Math.round(r), ping: AFB.Net.st.ping, buffer: Math.round(AFB.App.delay), role: S0.roles[i] };
      }, noPred);
      say(`  own-player response ${noPred ? 'WITHOUT' : 'WITH'} prediction:`, lag);
      if (lag && lag.ms > 0) (noPred ? LAGS.off : LAGS.on).push(lag.ms);
    }
    if (play === 0) (process.env.SHOTS && await G.screenshot({ path: process.env.SHOTS + '/63-guest-live.png' }));
    await H.waitForFunction(() => AFB.Sim.G.phase !== 'live', null, { timeout: 25000 });
    say('  result', await H.evaluate(() => AFB.Sim.G.banner && AFB.Sim.G.banner.txt + ' / ' + (AFB.Sim.G.banner.sub || '')));
  }
  // guest-view drift vs host
  const d = await Promise.all([H.evaluate(() => AFB.Net.st.ping), G.evaluate(() => [AFB.Net.st.ping, Math.round(AFB.App.delay), Math.round(AFB.App.iv * 10) / 10])]);
  say('LINK readout host', d[0], 'ms; guest', d[1][0], 'ms; guest interpolation buffer', d[1][1], 'ms; mean state interval', d[1][2], 'ms');
  // size of a state message
  const sz = await G.evaluate(() => { const a = window.__rx.filter(m => m.raw.startsWith('{"t":"s"')).slice(-120).map(m => m.raw.length); return [Math.min(...a), Math.round(a.reduce((x, y) => x + y, 0) / a.length), Math.max(...a)]; });
  say('state msg bytes min/avg/max', sz);
  const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null;
  say('own-player key->screen median ms: WITH prediction', med(LAGS.on), LAGS.on, ' WITHOUT', med(LAGS.off), LAGS.off);
  say('== DISCONNECT'); await G.close(); await H.waitForFunction(() => AFB.App.screen === 'error', null, { timeout: 15000 });
  await H.waitForTimeout(300); (process.env.SHOTS && await H.screenshot({ path: process.env.SHOTS + '/64-disconnect.png' }));
  say('host error screen buttons', (await H.evaluate(() => AFB.UI.hits.map(h => h.label))).join(' | '));
  const errs = all.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors on any page ' + JSON.stringify(errs.slice(0, 5)));
  say('secrecy: messages inspected before snaps =', secretChecks, 'over', plays, 'plays');
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
