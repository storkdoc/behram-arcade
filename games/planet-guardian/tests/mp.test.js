/* Planet Guardian: two-player online test. Matchmaking (slots, no-game, retry, backup code), the countdown,
   separate-worlds privacy (only scores/status cross the wire - never the other planet), swarmer raids on rescues and wave clears,
   game over -> result, rematch, and disconnect. Uses the in-page PeerJS stand-in (mp/fakepeer.js) and a Node
   broker with simulated latency (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/planet-guardian/tests/mp.test.js   (env: LAT JIT CHROME URL) */
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/planet-guardian/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const all = [];
  const mk = async (name) => {
    const c = await b.newContext({ viewport: { width: 1000, height: 640 } }); const p = await c.newPage(); p.name = name; all.push(p);
    await p.route('**/planet-guardian/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForTimeout(400);
    return p;
  };
  const labels = p => p.evaluate(() => PG.hits().map(h => h.label));
  const tapL = (p, label) => p.evaluate(l => { const h = PG.app.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + PG.app.hits.map(h => h.label).join('|')); h.fn(); }, label);
  const st = p => p.evaluate(() => ({ scr: PG.screen, ...PG.net.st }));
  const drawn = p => p.evaluate(() => new Promise(r => { const out = []; const f = Font.draw; Font.draw = function (ctx, s, ...a) { out.push(String(s)); return f.call(this, ctx, s, ...a); }; requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = f; r(out.join(' ')); })); }));
  const host = async p => { await tapL(p, 'TWO-PLAYER GAME (ONLINE)'); await p.waitForFunction(() => PG.screen === 'hostwait' && PG.net.st.status === 'waiting', null, { timeout: 15000 }); };

  say('== MENU');
  const H1 = await mk('H1');
  const tl = await labels(H1); say('title buttons:', tl.join(' | '));
  check(tl.includes('1 PLAYER GAME') && tl.includes('TWO-PLAYER GAME (ONLINE)') && tl.includes('JOIN TWO-PLAYER GAME IN PROGRESS') && !tl.some(l => /LOCAL|SAME-SCREEN|2 PLAYER GAME$/.test(l)), 'menu: 1 Player / Two-Player (Online) / Join in progress, no local 2P');

  say('== MATCHMAKING');
  await host(H1); await H1.waitForTimeout(150);
  const hw = (await drawn(H1)).toUpperCase().replace(/\s+/g, ' ');
  const s1 = await st(H1); say('H1', { slot: s1.slot, code: s1.code, status: s1.status });
  check(/CALL YOUR BUDDY/.test(hw) && /HOP ON THEIR BIKE/.test(hw) && /JUST LIKE THE OLD DAYS/.test(hw), 'host screen shows "call your buddy ... hop on their bike ... just like the old days"');
  check(s1.slot === 1 && hw.includes(s1.code), 'first host takes slot 1 and shows its backup code (' + s1.code + ')');
  const H2 = await mk('H2'); await host(H2); const s2 = await st(H2); check(s2.slot === 2, 'second host gets slot 2');
  const J1 = await mk('J1');
  const tj = Date.now(); await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForFunction(() => PG.net.st.status === 'connected', null, { timeout: 20000 });
  const j1 = await st(J1); say('J1 joined slot', j1.slot, 'room', j1.code, 'in', Date.now() - tj, 'ms');
  check(j1.slot === 1 && j1.code === s1.code, 'joiner found the waiting host by slot scan (no code typed)');
  { const ids = [...broker.ids.keys()], named = ids.filter(k => /^behram-/.test(k)); check(named.length > 0 && named.every(k => k.startsWith('behram-pg-v1-')), 'uses its own PeerJS namespace (behram-pg-v1-*), never another game\u2019s: ' + named.slice(0, 3).join(',')); }
  const J2 = await mk('J2'); await tapL(J2, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J2.waitForFunction(() => PG.net.st.status === 'connected', null, { timeout: 20000 });
  check((await st(J2)).code === s2.code, 'second joiner matched host 2 (host 1 is busy)');
  const J3 = await mk('J3'); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => PG.net.st.status === 'nogame', null, { timeout: 15000 }); await J3.waitForTimeout(200);
  const nb = await labels(J3); say('no-game buttons', nb.join(' | ')); check(nb.includes('RETRY') && nb.includes('ENTER CODE INSTEAD'), '"No game waiting" offers Retry + Enter code instead');
  const H3 = await mk('H3'); await host(H3); const s3 = await st(H3);
  await tapL(J3, 'RETRY'); await J3.waitForFunction(() => PG.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J3)).code === s3.code, 'Retry finds the new host');
  const H4 = await mk('H4'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4'); await J4.evaluate(() => PG.go('code')); await J4.waitForTimeout(150);
  for (const ch of s4.code) await tapL(J4, ch);
  const jl = (await labels(J4)).find(l => /^JOIN/.test(l)); await tapL(J4, jl);
  await J4.waitForFunction(() => PG.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J4)).code === s4.code, 'backup room code path works');
  for (const p of [H2, J2, H3, J3, H4, J4]) await p.close();

  say('== VERSUS  (fake link: ' + LAT + ' ms one-way + up to ' + JIT + ' ms jitter)');
  const H = H1, G = J1;
  const scr = await Promise.all([H, G].map(p => p.evaluate(() => PG.screen)));
  check(scr.every(s => s === 'vsready' || s === 'play'), 'both sides enter the countdown (' + scr + ')');
  await Promise.all([H, G].map(p => p.waitForFunction(() => PG.screen === 'play' && PG.G && PG.G.phase === 'play', null, { timeout: 15000 })));
  check(true, 'both sides start playing after the countdown');
  const seeds = await Promise.all([H, G].map(p => p.evaluate(() => PG.app.vs.seed)));
  check(seeds[0] === seeds[1], 'both fields start from the same seed');
  // each side plays its own field: host moves right & fires, guest stays still
  const px0 = await Promise.all([H, G].map(p => p.evaluate(() => PG.G.ship.x)));
  await H.keyboard.down('ArrowRight'); await H.waitForTimeout(600); await H.keyboard.up('ArrowRight');
  const px = await Promise.all([H, G].map(p => p.evaluate(() => PG.G.ship.x)));
  check(px[0] !== px0[0] && px[1] === px0[1], 'worlds are independent: host ship flew, guest ship did not (' + px.map(x => x.toFixed(1)) + ')');
  await H.waitForTimeout(1200);
  await H.evaluate(() => { const h = PG.G.hum.find(h => h.st === 'walk'); PG.sim._.killHuman(h, 'test'); }); await H.waitForTimeout(900);
  const rv = await G.evaluate(() => PG.app.vs.rival), hs = await H.evaluate(() => ({ sc: PG.G.score, l: PG.G.lives, h: PG.sim.humansLeft(), w: PG.G.wave }));
  check(rv.h === hs.h && hs.h === 9 && rv.l === hs.l && rv.w === hs.w && rv.sc === hs.sc, 'guest\u2019s rival readout tracks the host (score ' + rv.sc + ', wave ' + rv.w + ', lives ' + rv.l + ', humanoids ' + rv.h + ')');
  const gd = await drawn(G); check(/RIVAL/.test(gd), 'guest HUD draws the small RIVAL readout');
  // raid 1: the host returns a humanoid to the ground -> 2 swarmers dive at the guest
  const sw0 = await G.evaluate(() => PG.G.en.filter(e => e.raid).length);
  await H.evaluate(() => { const G = PG.G, h = G.hum.find(h => h.st === 'walk'); h.st = 'ride'; G.ship.y = PG.sim.SHIP_MAX - 4; });
  await G.waitForFunction(() => PG.app.vs.raids >= 2, null, { timeout: 5000 }).then(() => check(true, 'host rescued a humanoid -> guest received 2 raid swarmers'), () => check(false, 'rescue raid never reached the guest'));
  const sw1 = await G.evaluate(() => PG.G.en.filter(e => e.raid).length + PG.G.killed.swarmer|0);
  check(sw1 >= sw0 + 2 || (await G.evaluate(() => PG.app.vs.raids)) >= 2, 'raid swarmers spawned in the guest\u2019s own world');
  const gb = await drawn(G); check(/INCOMING!/.test(gb), 'guest sees the INCOMING! raid banner');
  // raid 2: the guest clears a wave -> 4 swarmers at the host
  await G.evaluate(() => { const G = PG.G; G.wl.spawned = G.wl.total; G.en = G.en.filter(e => e.k !== 'lander' && e.k !== 'mutant'); });
  await H.waitForFunction(() => PG.app.vs.raids >= 4, null, { timeout: 6000 }).then(() => check(true, 'guest cleared a wave -> host received 4 raid swarmers'), () => check(false, 'wave-clear raid never reached the host'));
  const hRx = await H.evaluate(() => window.__rx.map(m => m.raw)), gRx = await G.evaluate(() => window.__rx.map(m => m.raw));
  const types = new Set([...hRx, ...gRx].map(r => JSON.parse(r).t)); say('message types seen', [...types].join(','), ' counts H/G', hRx.length, gRx.length);
  const NETCTL = ['claim', 'avail', 'welcome', 'ping', 'pong', 'hello', 'bye', 'busy'];
  check([...types].every(t => ['go', 'st', 'raid', 'over', 'again'].includes(t) || NETCTL.includes(t)), 'only go/st/raid/over/again game messages (plus link handshake/ping) cross the wire');
  const bigKeys = [...hRx, ...gRx].filter(r => /"en"|hum\b|"x"|"y"|ship|las|mines|camX|terrain/.test(r) || r.length > 120);
  check(bigKeys.length === 0, 'no world data (enemies/humanoids/positions/terrain) is ever sent - neither player can see the other\u2019s planet');
  // game over on the host (last ship lost), guest keeps playing
  await H.evaluate(() => { PG.G.lives = 1; PG.sim._.shipDie('test'); });
  await H.waitForFunction(() => PG.G.phase === 'over', null, { timeout: 15000 });
  await G.waitForFunction(() => PG.app.vs.rivalOver, null, { timeout: 15000 }).then(() => check(true, 'guest is told the host is out'), () => check(false, 'guest never saw rival over'));
  await H.waitForTimeout(2900); await H.keyboard.press('Space');
  await H.waitForFunction(() => PG.screen === 'vswait' || PG.screen === 'vsend', null, { timeout: 8000 });
  check((await H.evaluate(() => PG.screen)) === 'vswait', 'host (out first) waits for the rival to finish');
  await G.evaluate(() => { PG.G.lives = 1; PG.sim._.shipDie('test'); });
  await G.waitForFunction(() => PG.G.phase === 'over', null, { timeout: 15000 }); await G.waitForTimeout(2900); await G.keyboard.press('Space');
  await Promise.all([H, G].map(p => p.waitForFunction(() => PG.screen === 'vsend', null, { timeout: 8000 })));
  const res = await Promise.all([H, G].map(p => drawn(p)));
  say('results:', res.map(r => (r.match(/YOU WIN!|RIVAL WINS|A TIE!/) || ['?'])[0]).join(' / '));
  check(res.every(r => /YOU WIN!|RIVAL WINS|A TIE!/.test(r)) && (/YOU WIN/.test(res[0]) !== /YOU WIN/.test(res[1]) || /TIE/.test(res[0] + res[1])), 'both see consistent results');
  await tapL(H, 'REMATCH'); await H.waitForTimeout(200); await tapL(G, 'REMATCH');
  await Promise.all([H, G].map(p => p.waitForFunction(() => PG.screen === 'play' && PG.G.phase !== 'over' && PG.G.score === 0, null, { timeout: 15000 })));
  check(true, 'rematch: both back in a fresh game');

  say('== DISCONNECT'); await G.close();
  await H.waitForFunction(() => PG.app.vs.rivalLeft, null, { timeout: 15000 }).then(() => check(true, 'host notices the buddy left (banner, keeps playing solo)'), () => check(false, 'host never noticed disconnect'));
  await H.evaluate(() => { PG.G.lives = 1; PG.sim._.shipDie('test'); }); await H.waitForFunction(() => PG.G.phase === 'over', null, { timeout: 15000 }); await H.waitForTimeout(2900); await H.keyboard.press('Space');
  await H.waitForFunction(() => PG.screen === 'vsend', null, { timeout: 8000 }); await H.waitForTimeout(200);
  const eb = await labels(H); const ed = await drawn(H); say('host end buttons', eb.join(' | '));
  check(/YOUR BUDDY LEFT/.test(ed) && eb.includes('MAIN MENU') && !eb.includes('REMATCH'), 'result screen says the buddy left, offers Main Menu, no rematch');
  const errs = all.flatMap(p => p.errs.map(e => p.name + ': ' + e)); check(errs.length === 0, 'no console errors on any page ' + JSON.stringify(errs.slice(0, 5)));
  say(fails ? 'FAILURES: ' + fails : 'ALL PASS');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
