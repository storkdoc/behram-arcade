/* Astro Shatter: two-player online test. Matchmaking (slots, no-game, retry, backup code), the countdown,
   privacy (only scores/status cross the wire - never the other field), rock/saucer attacks, rival readout + LINK ms,
   game over -> result, rematch, and disconnect. Uses the in-page PeerJS stand-in (mp/fakepeer.js) and a Node
   broker with simulated latency (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/astro-shatter/tests/mp.test.js   (env: LAT JIT CHROME URL) */
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/astro-shatter/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const all = [];
  const mk = async (name) => {
    const c = await b.newContext({ viewport: { width: 800, height: 520 } }); const p = await c.newPage(); p.name = name; all.push(p);
    await p.route('**/astro-shatter/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForTimeout(500);
    return p;
  };
  const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const labels = async p => { await raf(p); return p.evaluate(() => AST.hits().map(h => h.label)); };
  const tapL = async (p, label) => { await raf(p); await p.evaluate(l => { const h = AST.app.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + AST.app.hits.map(h => h.label).join('|')); h.fn(); }, label); };
  const st = p => p.evaluate(() => ({ scr: AST.screen, ...AST.net.st }));
  const drawn = p => p.evaluate(() => new Promise(r => { const out = []; const f = Font.draw; Font.draw = function (ctx, s, ...a) { out.push(String(s)); return f.call(this, ctx, s, ...a); }; requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = f; r(out.join(' ')); })); }));
  const host = async p => { await tapL(p, 'TWO-PLAYER GAME (ONLINE)'); await p.waitForFunction(() => AST.screen === 'hostwait' && AST.net.st.status === 'waiting', null, { timeout: 15000 }); };
  const endMine = p => p.evaluate(() => { AST.freeze(); const G = AST.G; G.lives = 1; G.ship.shield = 0; G.ship.hyper = 0; if (G.ship.alive) AST.sim.killShip('test'); AST.step(240); AST.app.overT = 0; AST.freeze(false); return G.phase; });

  say('== MENU');
  const H1 = await mk('H1');
  const tl = await labels(H1); say('title buttons:', tl.join(' | '));
  check(tl.includes('1 PLAYER GAME') && tl.includes('TWO-PLAYER GAME (ONLINE)') && tl.includes('JOIN TWO-PLAYER GAME IN PROGRESS') && !tl.some(l => /LOCAL|SAME-SCREEN/.test(l)), 'menu: 1 Player / Two-Player Game (Online) / Join Two-Player Game in Progress, no local 2P');

  say('== MATCHMAKING');
  await host(H1); await H1.waitForTimeout(150);
  const hw = (await drawn(H1)).toUpperCase().replace(/\s+/g, ' ');
  const s1 = await st(H1); say('H1', { slot: s1.slot, code: s1.code, status: s1.status });
  check(/CALL YOUR BUDDY AND TELL THEM TO HOP ON THEIR BIKE AND HEAD OVER/.test(hw) && /THE GAME IS LOADING/.test(hw) && /JUST LIKE THE OLD DAYS/.test(hw), 'host screen: "Call your buddy and tell them to hop on their bike and head over. The game is loading... just like the old days."');
  check(s1.slot === 1 && hw.includes(s1.code), 'first host takes slot 1 and shows its backup code (' + s1.code + ')');
  const H2 = await mk('H2'); await host(H2); const s2 = await st(H2); check(s2.slot === 2, 'second host gets slot 2');
  const J1 = await mk('J1');
  const tj = Date.now(); await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForFunction(() => AST.net.st.status === 'connected', null, { timeout: 20000 });
  const j1 = await st(J1); say('J1 joined slot', j1.slot, 'room', j1.code, 'in', Date.now() - tj, 'ms');
  check(j1.slot === 1 && j1.code === s1.code, 'joiner found the waiting host by slot scan (no code typed)');
  { const ids = [...broker.ids.keys()], named = ids.filter(k => /^behram-/.test(k)); check(named.length > 0 && named.every(k => k.startsWith('behram-ast-v1-')), 'uses its own PeerJS namespace (behram-ast-v1-*): ' + named.slice(0, 3).join(',')); }
  const J2 = await mk('J2'); await tapL(J2, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J2.waitForFunction(() => AST.net.st.status === 'connected', null, { timeout: 20000 });
  check((await st(J2)).code === s2.code, 'second joiner matched host 2 (host 1 is busy)');
  const J3 = await mk('J3'); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => AST.net.st.status === 'nogame', null, { timeout: 15000 }); await J3.waitForTimeout(200);
  const nb = await labels(J3); say('no-game buttons', nb.join(' | ')); check(nb.includes('RETRY') && nb.includes('ENTER CODE INSTEAD'), '"No game waiting" offers Retry + Enter code instead');
  const H3 = await mk('H3'); await host(H3); const s3 = await st(H3);
  await tapL(J3, 'RETRY'); await J3.waitForFunction(() => AST.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J3)).code === s3.code, 'Retry finds the new host');
  const H4 = await mk('H4'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4'); await J4.evaluate(() => { AST.app.code = ''; AST.go('code'); }); await raf(J4);
  for (const ch of s4.code) await tapL(J4, ch);
  const jl = (await labels(J4)).find(l => /^JOIN/.test(l)); await tapL(J4, jl);
  await J4.waitForFunction(() => AST.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J4)).code === s4.code, 'backup room code path works');
  for (const p of [H2, J2, H3, J3, H4, J4]) await p.close();

  say('== VERSUS  (fake link: ' + LAT + ' ms one-way + up to ' + JIT + ' ms jitter)');
  const H = H1, G = J1;
  const scr = await Promise.all([H, G].map(p => p.evaluate(() => AST.screen)));
  check(scr.every(s => s === 'vsready' || s === 'play'), 'both sides enter the countdown (' + scr + ')');
  await Promise.all([H, G].map(p => p.waitForFunction(() => AST.screen === 'play' && AST.G && !AST.G.attract && AST.G.phase !== 'over', null, { timeout: 20000 })));
  check(true, 'both sides start playing after the countdown');
  const seeds = await Promise.all([H, G].map(p => p.evaluate(() => AST.app.vs.seed)));
  check(seeds[0] === seeds[1], 'both fields start from the same seed');
  await H.evaluate(() => { AST.G.ship.shield = 1e9; }); await G.evaluate(() => { AST.G.ship.shield = 1e9; });
  await H.keyboard.down('ArrowUp'); await H.waitForTimeout(700); await H.keyboard.up('ArrowUp');
  const sp = await Promise.all([H, G].map(p => p.evaluate(() => Math.hypot(AST.G.ship.vx, AST.G.ship.vy))));
  check(sp[0] > 0.5 && sp[1] < 0.01, 'fields are independent: host ship thrusted, guest ship did not (' + sp.map(x => x.toFixed(2)) + ')');
  await H.evaluate(() => { AST.G.score = 1230; }); await H.waitForTimeout(1500);
  const rv = await G.evaluate(() => AST.app.vs.rival), hs = await H.evaluate(() => ({ sc: AST.G.score, l: AST.G.lives, w: AST.G.wave }));
  check(rv.sc === hs.sc && rv.l === hs.l && rv.w === hs.w, 'guest\u2019s rival readout tracks the host (score ' + rv.sc + ', lives ' + rv.l + ', wave ' + rv.w + ')');
  const gd = await drawn(G); check(/RIVAL/.test(gd) && /LINK \d+ MS/.test(gd), 'guest HUD draws the RIVAL score and LINK ms readout (' + (gd.match(/LINK \d+ MS/) || [''])[0] + ')');
  // attack: host breaks two large rocks -> a large rock warps into the guest's field
  const got0 = await G.evaluate(() => AST.app.vs.got);
  const sent = await H.evaluate(() => { AST.freeze(); const G = AST.G, S = AST.sim; G.saucer = null; G.saucerT = 1e9; const s0 = AST.app.vs.sent;
    for (let i = 0; i < 2; i++) { G.rocks.length = 0; G.sshots.length = 0; S.rockAt(1, 40, 40, 0, 0); const r = S.rockAt(3, 300, 300, 0, 0); r.vx = r.vy = 0; G.ship.x = 150; G.ship.y = 150; G.shots.length = 0; G.shots.push({ x: 260, y: 300, vx: 9.5, vy: 0, life: 52, id: 50 + i }); AST.step(8); }
    AST.freeze(false); return AST.app.vs.sent - s0; });
  check(sent === 1, 'host broke 2 large rocks -> sent one attack');
  await G.waitForFunction(g0 => AST.app.vs.got > g0 && AST.G.gotAtk > 0, got0, { timeout: 5000 }).then(() => check(true, 'guest received the attack (an extra large rock warped into their field)'), () => check(false, 'attack never reached the guest'));
  const hRx = await H.evaluate(() => window.__rx.map(m => m.raw)), gRx = await G.evaluate(() => window.__rx.map(m => m.raw));
  const types = new Set([...hRx, ...gRx].map(r => JSON.parse(r).t)); say('message types seen', [...types].join(','), ' counts H/G', hRx.length, gRx.length);
  const NETCTL = ['claim', 'avail', 'welcome', 'ping', 'pong', 'hello', 'bye', 'busy'];
  check([...types].every(t => ['go', 'st', 'atk', 'over', 'again'].includes(t) || NETCTL.includes(t)), 'only go/st/atk/over/again game messages (plus link handshake/ping) cross the wire');
  const leak = [...hRx, ...gRx].filter(r => /rocks|ship|shots|saucer"|"x"|"y"|"vx"|"vy"|"a"/.test(r) || r.length > 120);
  check(leak.length === 0, 'no field data (rocks/ship/shots/positions) is ever sent - neither player can see the other\u2019s field' + (leak.length ? ' ' + leak.slice(0, 2) : ''));
  // game over on the host, guest keeps playing
  check(await endMine(H) === 'over', 'host loses last ship');
  await G.waitForFunction(() => AST.app.vs.rivalOver, null, { timeout: 5000 }).then(() => check(true, 'guest is told the host is out'), () => check(false, 'guest never saw rival over'));
  await raf(H); await H.keyboard.press('Enter');
  await H.waitForFunction(() => AST.screen === 'vswait' || AST.screen === 'vsend', null, { timeout: 8000 });
  check((await H.evaluate(() => AST.screen)) === 'vswait', 'host (out first) waits for the rival to finish');
  await endMine(G); await raf(G); await G.keyboard.press('Enter');
  await Promise.all([H, G].map(p => p.waitForFunction(() => AST.screen === 'vsend', null, { timeout: 8000 })));
  const res = await Promise.all([H, G].map(p => drawn(p)));
  say('results:', res.map(r => (r.match(/YOU WIN!|RIVAL WINS|A TIE!/) || ['?'])[0]).join(' / '));
  check(res.every(r => /YOU WIN!|RIVAL WINS|A TIE!/.test(r)) && (/YOU WIN/.test(res[0]) !== /YOU WIN/.test(res[1]) || /TIE/.test(res[0] + res[1])), 'both see consistent results');
  await tapL(H, 'REMATCH'); await H.waitForTimeout(200); await tapL(G, 'REMATCH');
  await Promise.all([H, G].map(p => p.waitForFunction(() => AST.screen === 'play' && AST.G.phase !== 'over' && AST.G.score === 0 && !AST.G.attract, null, { timeout: 20000 })));
  check(true, 'rematch: both back in a fresh game');

  say('== DISCONNECT'); await G.close();
  await H.waitForFunction(() => AST.app.vs.rivalLeft, null, { timeout: 15000 }).then(() => check(true, 'host notices the buddy left (banner, keeps playing solo)'), () => check(false, 'host never noticed disconnect'));
  await endMine(H); await raf(H); await H.keyboard.press('Enter');
  await H.waitForFunction(() => AST.screen === 'vsend', null, { timeout: 8000 }); await H.waitForTimeout(200);
  const eb = await labels(H); const ed = await drawn(H); say('host end buttons', eb.join(' | '));
  check(/YOUR BUDDY LEFT/.test(ed) && eb.includes('MAIN MENU') && !eb.includes('REMATCH'), 'result screen says the buddy left, offers Main Menu, no rematch');
  const errs = all.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors on any page ' + JSON.stringify(errs.slice(0, 5)));
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
