/* Vector Armor: two-player online test. Matchmaking (slots, no-game, retry, backup code), the own PeerJS namespace,
   the duel (host-authoritative battlefield, guest prediction, each player through their own periscope), hits,
   the LINK readout, match end, rematch and disconnect. Uses the in-page PeerJS stand-in (mp/fakepeer.js) and a
   Node broker with simulated latency (mp/broker.js).
   Run from the repo root:  python3 -m http.server 8080 &   then
     NODE_PATH=<dir with playwright-core> node games/vector-armor/tests/mp.test.js   (env: LAT JIT CHROME URL) */
const { chromium } = require('playwright-core'); const fs = require('fs');
const makeBroker = require('./mp/broker');
const LAT = +(process.env.LAT || 40), JIT = +(process.env.JIT || 10);
const broker = makeBroker({ lat: LAT, jit: JIT });
const FAKE = fs.readFileSync(__dirname + '/mp/fakepeer.js', 'utf8');
const URL = process.env.URL || 'http://localhost:8080/games/vector-armor/';
const say = (...a) => console.log(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; say(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : x); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const all = [];
  const mk = async (name) => {
    const c = await b.newContext({ viewport: { width: 900, height: 560 } }); const p = await c.newPage(); p.name = name; all.push(p);
    await p.route('**/vector-armor/peerjs.min.js', r => r.fulfill({ contentType: 'application/javascript', body: FAKE }));
    await p.exposeFunction('__broker', broker.attach(p));
    p.errs = []; p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); }); p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
    await p.goto(URL); await p.waitForTimeout(500);
    return p;
  };
  const labels = p => p.evaluate(() => VA.app.hits.map(h => h.label));
  const tapL = (p, label) => p.evaluate(l => { const h = VA.app.hits.find(h => h.label === l); if (!h) throw new Error('no button ' + l + ' in ' + VA.app.hits.map(h => h.label).join('|')); h.fn(); }, label);
  const st = p => p.evaluate(() => ({ scr: VA.screen, ...VA.net.st }));
  const drawn = p => p.evaluate(() => new Promise(r => { const out = []; const f = Font.draw; Font.draw = function (ctx, s, ...a) { out.push(String(s)); return f.call(this, ctx, s, ...a); }; requestAnimationFrame(() => requestAnimationFrame(() => { Font.draw = f; r(out.join(' ')); })); }));
  const host = async p => { await tapL(p, 'TWO-PLAYER GAME (ONLINE)'); await p.waitForFunction(() => VA.screen === 'hostwait' && VA.net.st.status === 'waiting', null, { timeout: 15000 }); };

  say('== MENU');
  const H1 = await mk('H1');
  const tl = await labels(H1); say('title buttons:', tl.join(' | '));
  check(tl.includes('1 PLAYER GAME') && tl.includes('TWO-PLAYER GAME (ONLINE)') && tl.includes('JOIN TWO-PLAYER GAME IN PROGRESS') && !tl.some(l => /LOCAL|SAME-SCREEN/.test(l)), 'menu: 1 Player / Two-Player (Online) / Join in progress, no local 2P');

  say('== MATCHMAKING');
  await host(H1); await H1.waitForTimeout(150);
  const hw = (await drawn(H1)).toUpperCase().replace(/\s+/g, ' ');
  const s1 = await st(H1); say('H1', { slot: s1.slot, code: s1.code, status: s1.status });
  check(/CALL YOUR BUDDY/.test(hw) && /HOP ON THEIR BIKE/.test(hw) && /JUST LIKE THE OLD DAYS/.test(hw), 'host screen: "call your buddy ... hop on their bike ... just like the old days"');
  check(s1.slot === 1 && hw.includes(s1.code), 'first host takes slot 1 and shows its backup code (' + s1.code + ')');
  const H2 = await mk('H2'); await host(H2); const s2 = await st(H2); check(s2.slot === 2, 'second host gets slot 2');
  const J1 = await mk('J1');
  const tj = Date.now(); await tapL(J1, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J1.waitForFunction(() => VA.net.st.status === 'connected', null, { timeout: 20000 });
  const j1 = await st(J1); say('J1 joined slot', j1.slot, 'room', j1.code, 'in', Date.now() - tj, 'ms');
  check(j1.slot === 1 && j1.code === s1.code, 'joiner found the waiting host by slot scan (no code typed)');
  { const ids = [...broker.ids.keys()], named = ids.filter(k => /^behram-/.test(k)); check(named.length > 0 && named.every(k => k.startsWith('behram-bz-v1-')), 'uses its own PeerJS namespace (behram-bz-v1-*): ' + named.slice(0, 3).join(',')); }
  const J2 = await mk('J2'); await tapL(J2, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J2.waitForFunction(() => VA.net.st.status === 'connected', null, { timeout: 20000 });
  check((await st(J2)).code === s2.code, 'second joiner matched host 2 (host 1 is busy)');
  const J3 = await mk('J3'); await tapL(J3, 'JOIN TWO-PLAYER GAME IN PROGRESS');
  await J3.waitForFunction(() => VA.screen === 'nogame', null, { timeout: 15000 }); await J3.waitForTimeout(200);
  const nb = await labels(J3); check(nb.includes('RETRY') && nb.includes('ENTER CODE INSTEAD'), '"No game waiting" offers Retry + Enter code instead', nb);
  const H3 = await mk('H3'); await host(H3); const s3 = await st(H3);
  await tapL(J3, 'RETRY'); await J3.waitForFunction(() => VA.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J3)).code === s3.code, 'Retry finds the new host');
  const H4 = await mk('H4'); await host(H4); const s4 = await st(H4);
  const J4 = await mk('J4'); await J4.evaluate(() => { VA.app.code = ''; VA.go('code'); }); await J4.waitForTimeout(150);
  for (const ch of s4.code) await tapL(J4, ch);
  const jl = (await labels(J4)).find(l => /^JOIN [A-Z0-9]{5}$/.test(l)); await tapL(J4, jl);
  await J4.waitForFunction(() => VA.net.st.status === 'connected', null, { timeout: 15000 }); check((await st(J4)).code === s4.code, 'backup room code path works');
  for (const p of [H2, J2, H3, J3, H4, J4]) await p.close();

  say('== DUEL  (fake link: ' + LAT + ' ms one-way + up to ' + JIT + ' ms jitter)');
  const H = H1, G = J1;
  await Promise.all([H, G].map(p => p.waitForFunction(() => VA.screen === 'play' && VA.G && VA.G.mode === 'duel', null, { timeout: 15000 })));
  check(true, 'both sides count down and start the duel');
  const meta = await Promise.all([H, G].map(p => p.evaluate(() => ({ seed: VA.G.seed, me: VA.app.me, obs: VA.G.obs.length }))));
  check(meta[0].seed === meta[1].seed && meta[0].obs === meta[1].obs, 'same battlefield (seed + obstacles) on both sides', meta);
  check(meta[0].me === 0 && meta[1].me === 1, 'each side drives its own tank (host = tank 0, guest = tank 1)');
  // guest drives forward: its own predicted tank moves at once, the host sees it too
  const gz0 = await H.evaluate(() => { const p = VA.G.players[1]; return [p.x, p.z]; });
  await G.keyboard.down('ArrowUp'); await G.waitForTimeout(1200); await G.keyboard.up('ArrowUp'); await G.waitForTimeout(500);
  const gz1 = await H.evaluate(() => { const p = VA.G.players[1]; return [p.x, p.z]; }), gpred = await G.evaluate(() => { const p = VA.G.players[1]; return [p.x, p.z]; });
  const moved = Math.hypot(VA_wd(gz1[0] - gz0[0]), VA_wd(gz1[1] - gz0[1]));
  function VA_wd(d) { return d - 1400 * Math.round(d / 1400); }
  check(moved > 10, 'guest input drives its tank on the host (authoritative)', moved.toFixed(1));
  const perr = Math.hypot(VA_wd(gpred[0] - gz1[0]), VA_wd(gpred[1] - gz1[1]));
  check(perr < 3, 'guest prediction agrees with the host after reconciliation', perr.toFixed(2));
  const hp = await H.evaluate(() => [VA.G.players[0].x, VA.G.players[0].z]); await G.waitForTimeout(300);
  const hpg = await G.evaluate(() => [VA.G.players[0].x, VA.G.players[0].z]);
  check(Math.hypot(VA_wd(hp[0] - hpg[0]), VA_wd(hp[1] - hpg[1])) < 3, 'guest sees the host tank where the host has it');
  const gd = await drawn(G); check(/LINK \d+ MS/.test(gd), 'guest HUD shows the LINK ms readout', (gd.match(/LINK [^ ]+ MS/) || [])[0]);
  // a host shell hits the guest: place the guest right in front of the host, host fires
  await H.evaluate(() => { const g = VA.G, a = g.players[0], c = g.players[1], S = VA.sim; g.obs = g.obs.filter(o => S.rel(a, o.x, o.z).d > 120); a.h = a.ph = 0; c.x = a.x; c.z = S.wrap(a.z - 60); c.v = 0; });
  await H.keyboard.down('Space'); await H.waitForTimeout(150); await H.keyboard.up('Space');
  await H.waitForFunction(() => VA.G.players[0].hits >= 1, null, { timeout: 4000 }).catch(() => {});
  const hh = await H.evaluate(() => ({ hits: VA.G.players[0].hits, alive: VA.G.players[1].alive }));
  check(hh.hits === 1 && !hh.alive, 'host shell destroys the guest tank (host scores a hit)', hh);
  await G.waitForTimeout(400);
  const gv = await G.evaluate(() => ({ hits: VA.G.players[0].hits, alive: VA.G.players[1].alive, crack: !!VA.app.crack }));
  check(gv.hits === 1 && !gv.alive && gv.crack, 'guest learns it was hit: tally updates, its own glass cracks', gv);
  await H.waitForFunction(() => VA.G.players[1].alive, null, { timeout: 8000 }).catch(() => {});
  check(await H.evaluate(() => VA.G.players[1].alive), 'destroyed tank respawns elsewhere');
  // the guest fires back and hits the host
  await H.evaluate(() => { const g = VA.G, a = g.players[1], c = g.players[0], S = VA.sim; g.obs = g.obs.filter(o => S.rel(a, o.x, o.z).d > 120); g.shells.length = 0; c.x = S.wrap(a.x + Math.sin(a.h) * 60); c.z = S.wrap(a.z - Math.cos(a.h) * 60); c.v = 0; });
  await G.waitForTimeout(300);
  await G.keyboard.down('Space'); await G.waitForTimeout(200); await G.keyboard.up('Space');
  await H.waitForFunction(() => VA.G.players[1].hits >= 1, null, { timeout: 4000 }).catch(() => {});
  check(await H.evaluate(() => VA.G.players[1].hits) === 1, 'guest shell destroys the host tank (guest scores a hit)');
  // match end: first to 5
  await H.evaluate(() => { const g = VA.G; g.players[0].hits = 4; const a = g.players[0], c = g.players[1], S = VA.sim; if (!a.alive) { a.alive = true; } VA.sim.G = g; S.killPlayer(c, 'rival'); });
  await Promise.all([H, G].map(p => p.waitForFunction(() => VA.screen === 'vsend', null, { timeout: 10000 })));
  const res = await Promise.all([H, G].map(p => p.evaluate(() => VA.app.vs.result)));
  check(res[0].me === 5 && res[1].them === 5, 'first to 5 wins: both see the result (host 5)', res);
  const ed = (await drawn(G)).toUpperCase(); check(/REMATCH/.test(ed), 'result screen offers REMATCH');
  // rematch
  const seed0 = meta[0].seed;
  await tapL(G, 'REMATCH'); await G.waitForTimeout(300); await tapL(H, 'REMATCH');
  await Promise.all([H, G].map(p => p.waitForFunction(() => VA.screen === 'play' && VA.G.players[0].hits === 0, null, { timeout: 10000 })));
  const seeds = await Promise.all([H, G].map(p => p.evaluate(() => VA.G.seed)));
  check(seeds[0] === seeds[1] && seeds[0] !== seed0, 'rematch: both restart on a fresh shared battlefield');
  say('== DISCONNECT'); await G.close();
  await H.waitForFunction(() => VA.app.vs && VA.app.vs.rivalLeft, null, { timeout: 15000 }).then(() => check(true, 'host notices the buddy left'), () => check(false, 'host never noticed disconnect'));
  await H.waitForTimeout(200);
  const eb = await labels(H), et = (await drawn(H)).toUpperCase();
  check(/YOUR BUDDY LEFT/.test(et) && eb.includes('MAIN MENU') && !eb.includes('REMATCH'), 'result screen says the buddy left, offers Main Menu, no rematch', eb);
  const errs = all.flatMap(p => p.errs.map(e => p.name + ': ' + e)).filter(e => !/WebGL|GPU stall|swiftshader/i.test(e));
  check(errs.length === 0, 'no console errors on any page', errs.slice(0, 5));
  say(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  await b.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
