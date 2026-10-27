// Two-player tests over the stand-in PeerJS transport (tests/mp/fakepeer.js + broker.js): host lobby, join, GALACTIC WAR
// from both views, fog privacy on the wire, squadron orders from the guest, the live flagship duel, win conditions,
// rematch, disconnects, and co-op.   node games/star-raider/tests/mp.test.mjs [chromium|webkit]
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const here = path.dirname(fileURLToPath(import.meta.url));
const makeBroker = require(path.join(here, 'mp/broker.js'));
const FAKE = require('fs').readFileSync(path.join(here, 'mp/fakepeer.js'), 'utf8');
const ROOT = process.env.SR_URL || 'http://localhost:8080/games/star-raider/';
const eng = process.argv[2] || 'chromium';
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); } console.log((c ? 'ok   ' : 'FAIL ') + m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(page, fn, ms = 15000, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await wait(120); } return false; }
const AIMLIB = () => {
  window.__aimAt = (p, pos) => { const V = SR.S.V, d = V.norm(V.sub(pos, p.pos)), f = [0, 0, -1];
    const ax = [f[1] * d[2] - f[2] * d[1], f[2] * d[0] - f[0] * d[2], f[0] * d[1] - f[1] * d[0]], s2 = Math.hypot(...ax), c = f[0] * d[0] + f[1] * d[1] + f[2] * d[2], h = Math.atan2(s2, c) / 2, k = s2 > 1e-6 ? Math.sin(h) / s2 : 0;
    p.q = s2 > 1e-6 ? [ax[0] * k, ax[1] * k, ax[2] * k, Math.cos(h)] : c > 0 ? [0, 0, 0, 1] : [0, 1, 0, 0]; p.speed = 0; p.thr = 0; };
};
const launchOpts = eng === 'webkit' ? {} : { executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

async function pair(browser, broker, errs) {
  const mk = async name => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } }); const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(m.text())) errs.push(name + ': ' + m.text()); });
    await page.route('**/vendor/peerjs.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE }));
    await page.exposeFunction('__broker', broker.attach(page));
    await page.addInitScript(AIMLIB);
    await page.goto(ROOT + '?nolock=1&q=0');
    return page;
  };
  const H = await mk('host'), J = await mk('guest');
  ok(await until(H, () => window.SR && SR.booted && SR.app.screen === 'title', 30000) && await until(J, () => window.SR && SR.booted && SR.app.screen === 'title', 30000), 'both pages boot');
  return { H, J };
}
async function hostSetup(H, mode, layout = 'classic') {
  await H.click('[data-act=host]');
  await H.click(`[data-m=${mode}]`);
  if (mode === 'war') { await H.click(`#layouts [data-ly=${layout}]`); await H.click('[data-l=short]'); }
  await H.click('#bstart');
}

(async () => {
  const browser = await pw[eng].launch(launchOpts);
  const wire = [];   // every message the host put on the wire to the guest
  let HOSTPAGE = null;
  const broker = makeBroker({ lat: 40, jit: 15, tap: (from, to, d) => { if (from === HOSTPAGE) wire.push(typeof d === 'string' ? JSON.parse(d) : d); } });
  const errs = [];
  /* ================= GALACTIC WAR ================= */
  let { H, J } = await pair(browser, broker, errs); HOSTPAGE = H;
  await hostSetup(H, 'war');
  ok(await until(H, () => SR.app.screen === 'online'), 'host: online lobby');
  ok((await H.textContent('#callmsg')).trim() === 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.', 'host: exact call-your-buddy message');
  ok(await until(H, () => /BACKUP CODE [A-Z]{5}/.test(document.getElementById('ocode').textContent)), 'host: backup code shown');
  const code = (await H.textContent('#ocode')).match(/CODE\s*([A-Z]{5})/)[1];
  ok([...broker.ids.keys()].some(k => k.startsWith('behram-sr-v1-')), 'peer ids use the behram-sr-v1- namespace');
  ok(await H.evaluate(() => document.getElementById('bhoststart').classList.contains('hidden')), 'war: no START FLYING NOW (the war starts when the opponent arrives)');
  // the guest joins with the backup code (the auto-search is the other path; co-op below uses it)
  // open the join screen without the auto-search (which would find the host first) so the code path itself is tested
  await J.evaluate(() => SR.show('join')); await J.fill('#jcode', code); await J.click('[data-j=code]');
  ok(await until(H, () => SR.app.screen === 'play' && SR.sess.war && SR.sess.G.players[1]) && await until(J, () => SR.app.screen === 'play' && SR.sess && SR.sess.role === 'guest' && SR.sess.war), 'both in a GALACTIC WAR match');
  if (fails.length) { console.log('DIAG host', await H.evaluate(() => JSON.stringify({ s: SR.app.screen, net: SR.Net.st, on: SR.app.online, w: document.getElementById('ewhy').textContent }))); console.log('DIAG guest', await J.evaluate(() => JSON.stringify({ s: SR.app.screen, net: SR.Net.st, on: SR.app.online, j: document.getElementById('jstat').textContent, w: document.getElementById('ewhy').textContent, t: document.getElementById('etitle').textContent }))); const cnt = {}; for (const m of wire) cnt[m.t] = (cnt[m.t] || 0) + 1; console.log('WIRE', JSON.stringify(cnt), wire.length ? JSON.stringify(wire[0]).slice(0, 200) : ''); console.log(errs); process.exit(3); }
  const seeds = await Promise.all([H.evaluate(() => SR.sess.cfg.seed), J.evaluate(() => SR.sess.cfg.seed)]);
  ok(seeds[0] === seeds[1], 'same galaxy seed on both sides');
  ok(await H.evaluate(() => SR.sess.me.team === 0) && await J.evaluate(() => SR.sess.me.team === 1), 'host commands side 0, guest side 1');
  if (process.env.DIAG) { await H.evaluate(() => { window.__rf = 0; const f = () => { __rf++; requestAnimationFrame(f); }; requestAnimationFrame(f); }); console.log('ERRS', errs, await H.evaluate(() => JSON.stringify({ p: SR.app.paused, hs: SR.sess.hitStop, acc: 0 }))); } if (process.env.DIAG) for (let i = 0; i < 5; i++) { console.log('RF', await H.evaluate(() => __rf), await J.evaluate(() => SR.R.stats().fps)); await wait(1000); console.log('T', i, await H.evaluate(() => JSON.stringify({ t: SR.sess.G.t.toFixed(1), sc: SR.app.screen, st: SR.Net.st.status, rx: Math.round(performance.now() - SR.Net.st.lastRx) })), await J.evaluate(() => JSON.stringify({ sc: SR.app.screen, st: SR.Net.st.status, rx: Math.round(performance.now() - SR.Net.st.lastRx), ping: SR.Net.st.ping, fps: SR.R.stats().fps })), wire.length); }
  ok(await until(J, () => /\d+\s*MS/i.test(document.getElementById('link').textContent)), 'guest: LINK latency shown');
  ok(await until(J, () => SR.sess.warV && SR.sess.warV.team === 1 && SR.sess.warV.fleets.some(f => f.own)), 'guest: receives its own war view with its squadrons');
  // both command charts
  await H.keyboard.press('KeyG'); await J.keyboard.press('KeyG');
  ok(await until(H, () => SR.sess.me.view === 'chart' && !document.getElementById('warbar').classList.contains('hidden')), 'host: galactic chart + war bar');
  ok(await until(J, () => SR.sess.me.view === 'chart' && !document.getElementById('warbar').classList.contains('hidden')), 'guest: galactic chart + war bar');
  // guest orders a squadron: Tab selects, arrow moves the cursor, O orders
  await J.keyboard.press('Tab');
  const sel = await J.evaluate(() => SR.sess.selF);
  ok(sel > 0, 'guest: Tab selects a squadron');
  const dest = await J.evaluate(() => { const f = SR.sess.warV.fleets.find(f => f.id === SR.sess.selF); return [f.x, f.y]; });
  await J.keyboard.press(dest[0] > 0 ? 'ArrowLeft' : 'ArrowRight'); await J.keyboard.press('KeyO');
  ok(await until(H, a => { const f = SR.sess.G.fleets.find(f => f.id === a.id); return f && f.team === 1 && f.order && f.order[0] === a.x; }, 8000, { id: sel, x: dest[0] + (dest[0] > 0 ? -1 : 1) }), 'guest order reaches the host sim (only for its own squadron)');
  // guest spends reserves: build a squadron (B), reserves drop on the guest's own bar
  const r0 = await J.evaluate(() => SR.sess.warV.res);
  await J.keyboard.press('KeyB');
  ok(await until(H, () => SR.sess.G.war.builds.some(b => b.team === 1)), 'guest build order queued on the host');
  ok(await until(J, r => SR.sess.warV.res < r || SR.sess.warV.builds.length > 0, 6000, r0), 'guest: reserves spent / build shows on its bar');
  // host probes, jams
  await H.keyboard.press('KeyJ');
  ok(await until(H, () => SR.sess.G.war.jam[1] > 0 || SR.sess.G.war.jam[0] > 0), 'host jams the enemy sensors');
  ok(await until(J, () => SR.sess.warV.jam), 'guest: sees it is being jammed');
  await J.keyboard.press('KeyK');
  ok(await until(H, () => SR.sess.G.war.eccmT[1] > 0 || !SR.sess.G.war.jam[1]), 'guest ECCM reaches the host');

  /* ---- fog privacy, on the wire ---- */
  await wait(2500);
  const W = wire.slice();
  const snaps = W.filter(m => m.t === 's'), views = snaps.filter(m => m.w), evm = W.filter(m => m.t === 'e');
  ok(snaps.length > 20 && views.length > 3, `wire: guest got snapshots (${snaps.length}) and war views (${views.length})`);
  ok(views.every(m => m.w.team === 1), 'wire: every war view is the guest side\'s view');
  ok(W.every(m => !m.g), 'wire: never the full co-op galaxy in a war');
  const leak = views.flatMap(m => m.w.fleets.filter(f => !f.own && ('order' in f || 'name' in f || 'px' in f || 'l' in f)));
  ok(leak.length === 0, 'wire: enemy squadron orders / names / routes never sent');
  const hostTruth = await H.evaluate(() => ({ n0: SR.sess.G.fleets.filter(f => f.team === 0).length, res0: Math.floor(SR.sess.G.war.res[0]), res1: Math.floor(SR.sess.G.war.res[1]), ids0: SR.sess.G.fleets.filter(f => f.team === 0).map(f => f.id) }));
  const lastV = views[views.length - 1].w;
  ok(lastV.fleets.filter(f => f.own).every(f => !hostTruth.ids0.includes(f.id)), 'wire: "own" squadrons in the guest view are all the guest\'s');
  ok(lastV.fleets.filter(f => !f.own).length < hostTruth.n0 + 1 && JSON.stringify(lastV).indexOf('"res":' + hostTruth.res0 + ',') < 0 || hostTruth.res0 === hostTruth.res1, 'wire: host reserves not in the guest view');
  ok(evm.every(m => (m.m || []).every(x => x.who === 1 || x.who === -1)), 'wire: no host-only radio traffic sent to the guest');
  ok(evm.every(m => (m.ev || []).every(e => !(e.e === 'jammed' || e.e === 'siege') || e.team === 1)), 'wire: no host-side alerts sent to the guest');
  const gpos = await H.evaluate(() => { const a = SR.sess.G.players[0], b = SR.sess.G.players[1]; return SR.S.key(a.sx, a.sy) !== SR.S.key(b.sx, b.sy); });
  if (gpos) ok(snaps.slice(-20).every(m => !m.b), 'wire: host flagship pose never sent while in another sector');
  const enemyShips = snaps.slice(-20).flatMap(m => m.sh || []);
  const g1 = await H.evaluate(() => SR.S.key(SR.sess.G.players[1].sx, SR.sess.G.players[1].sy));
  ok(await H.evaluate(([ids, k]) => ids.every(id => { const s = SR.sess.G.ships.find(s => s.id === id); return !s || s.sk === k; }), [enemyShips.map(s => s.id), g1]), 'wire: only ships in the guest\'s own sector are sent');

  /* ---- live flagship duel ---- */
  await H.keyboard.press('KeyF'); await J.keyboard.press('KeyF');
  const duel = await H.evaluate(() => {
    const G = SR.sess.G, S = SR.S; let best = null;
    for (let y = 0; y < S.H && !best; y++) for (let x = 0; x < S.W; x++) if (!G.bases.some(b => b.x === x && b.y === y) && !G.fleets.some(f => f.x === x && f.y === y) && !(G.nebula || []).some(n => n[0] === x && n[1] === y)) { best = [x, y]; break; }
    const [x, y] = best, a = G.players[0], b = G.players[1], k = S.key(x, y);
    for (const s of G.ships) if (s.sk === k) s.gone = true;
    Object.assign(a, { sx: x, sy: y, pos: [0, 0, 0], speed: 0, thr: 0, energy: 9000, warp: null, dock: null, shields: true });
    Object.assign(b, { sx: x, sy: y, pos: [0, 0, -70], speed: 0, thr: 0, energy: 9000, warp: null, dock: null });
    b.respawned = (b.respawned || 0) + 1;   // makes the host send the guest a position reset
    return best;
  });
  ok(await until(J, k => SR.sess.me.sx === k[0] && SR.sess.me.sy === k[1], 8000, duel), 'duel: guest moved into the host\'s sector');
  ok(await until(J, () => SR.sess.bud && SR.sess.bud.rival === 1), 'duel: guest sees the ENEMY flagship');
  ok(await until(H, () => { const a = SR.sess.G.players[0], b = SR.sess.G.players[1]; return SR.S.key(a.sx, a.sy) === SR.S.key(b.sx, b.sy) && b.alive; }), 'duel: host sees the rival in its sector');
  // guest shoots the host: aim at the host's ship and fire
  let gHit = false;
  for (let i = 0; i < 14 && !gHit; i++) {
    await J.evaluate(() => { if (SR.sess.bud) __aimAt(SR.sess.me, SR.sess.bud.pos); });
    await J.keyboard.press('Space');
    gHit = await until(H, () => SR.sess.G.players[0].hitT > 0, 900);
  }
  ok(gHit, 'duel: guest torpedo hits the host flagship');
  // host shoots the guest, then finishes it off
  let hHit = false, gSaw = false;
  for (let i = 0; i < 14 && !hHit; i++) {
    await H.evaluate(() => __aimAt(SR.sess.G.players[0], SR.sess.G.players[1].pos));
    await H.keyboard.press('Space');
    if (process.env.DIAG) console.log('HD', await H.evaluate(() => { const G = SR.sess.G, a = G.players[0], b = G.players[1]; return JSON.stringify({ a: a.pos.map(Math.round), b: b.pos.map(Math.round), ak: SR.S.key(a.sx, a.sy), bk: SR.S.key(b.sx, b.sy), bal: b.alive, tr: b.inTransit, view: a.view, sh: G.shots.filter(s => s.own === 0).map(s => [s.kind, s.pos.map(Math.round), s.sk, s.life.toFixed(1)]) }); }));
    const seen = J.evaluate(() => new Promise(r => { const t0 = performance.now(); const f = () => { const p = SR.sess.me; if (p.hitT > 0 || p.shieldT > 0) r(true); else if (performance.now() - t0 > 2500) r(false); else setTimeout(f, 30); }; f(); }));
    hHit = await until(H, () => SR.sess.G.players[1].hitT > 0, 900);
    if (hHit) gSaw = await seen; else await seen;
  }
  ok(hHit, 'duel: host torpedo hits the guest flagship');
  ok(gSaw, 'duel: the guest sees the hit (shield flash / hull hit from the host)');
  await H.evaluate(() => { const b = SR.sess.G.players[1]; b.energy = 600; b.shields = false; });
  let dead = false;
  for (let i = 0; i < 16 && !dead; i++) {
    await H.evaluate(() => { const b = SR.sess.G.players[1]; if (b.alive) { b.energy = Math.min(b.energy, 600); b.shields = false; __aimAt(SR.sess.G.players[0], b.pos); } });
    await H.keyboard.press('Space');
    dead = await until(H, () => !SR.sess.G.players[1].alive, 900);
  }
  ok(dead && await H.evaluate(() => SR.sess.G.war.score[0].flag === 1 && /ENEMY FLAGSHIP|ENERGY/.test(SR.sess.G.lastDeath)), 'duel: enemy flagship destroyed by torpedoes, host scores it');
  ok(await until(J, () => !SR.sess.me.alive && SR.sess.me.respawn > 0), 'guest: flagship lost, respawn countdown (respawns cost time)');
  await H.evaluate(() => { SR.sess.G.players[1].respawn = 0.3; });
  ok(await until(J, () => SR.sess.me.alive, 12000), 'guest: new flagship at a starbase');

  /* ---- win: all enemy starbases destroyed ---- */
  await H.evaluate(() => {
    const G = SR.sess.G, S = SR.S, L = G.bases.filter(b => b.team === 1 && b.alive);
    for (const b of L.slice(1)) b.alive = false;
    const t = L[0]; t.hp = 2; const a = G.players[0];
    for (const s of G.ships) if (s.sk === S.key(t.x, t.y)) s.gone = true;
    Object.assign(a, { sx: t.x, sy: t.y, pos: [S.BASE_POS[0], S.BASE_POS[1], S.BASE_POS[2] + 140], energy: 9000, warp: null, dock: null });
    window.__tb = t.id;
  });
  let over = false;
  for (let i = 0; i < 20 && !over; i++) {
    await H.evaluate(() => { const a = SR.sess.G.players[0]; a.energy = 9000; __aimAt(a, SR.S.BASE_POS); });
    await H.keyboard.press('Space');
    over = await until(H, () => !!SR.sess.G.over, 800);
  }
  ok(over && await H.evaluate(() => /STARBASES/.test(SR.sess.G.over.why) && SR.sess.G.over.winner === 0), 'win: last enemy starbase destroyed ends the war');
  ok(await until(H, () => SR.app.screen === 'endp' && document.getElementById('etitle').textContent === 'VICTORY'), 'host: VICTORY screen');
  ok(await until(J, () => SR.app.screen === 'endp' && document.getElementById('etitle').textContent === 'DEFEAT'), 'guest: DEFEAT screen');
  ok(/1/.test(await J.textContent('#estats')), 'guest: end stats listed');

  /* ---- rematch, then the timer win ---- */
  const oldSeed = seeds[0];
  await J.click('[data-e=again]'); await H.click('[data-e=again]');
  ok(await until(H, s => SR.app.screen === 'play' && SR.sess.cfg.seed !== s && !SR.sess.G.over, 15000, oldSeed) && await until(J, s => SR.app.screen === 'play' && SR.sess.cfg.seed !== s, 15000, oldSeed), 'rematch: both back in a fresh war');
  ok(await H.evaluate(() => SR.sess.cfg.seed) === await J.evaluate(() => SR.sess.cfg.seed), 'rematch: same new galaxy on both');
  await H.evaluate(() => { SR.sess.G.war.tLeft = 0.4; });
  ok(await until(H, () => SR.sess.G.over && /TIME/.test(SR.sess.G.over.why)), 'win: timer runs out, sectors held decide');
  ok(await until(H, () => SR.app.screen === 'endp') && await until(J, () => SR.app.screen === 'endp'), 'both: end screens after the timer');
  const tH = await H.textContent('#etitle'), tJ = await J.textContent('#etitle');
  ok((tH === 'VICTORY' && tJ === 'DEFEAT') || (tH === 'DEFEAT' && tJ === 'VICTORY'), `timer result consistent (${tH} / ${tJ})`);
  // another rematch, then the guest walks out: host wins by forfeit
  await H.click('[data-e=again]'); await J.click('[data-e=again]');
  ok(await until(H, () => SR.app.screen === 'play' && !SR.sess.G.over, 15000) && await until(J, () => SR.app.screen === 'play', 15000), 'second rematch starts');
  await J.close(); HOSTPAGE = null;
  ok(await until(H, () => SR.app.screen === 'endp' && /FORFEIT/.test(document.getElementById('ewhy').textContent), 15000), 'disconnect: host wins by forfeit');
  await H.close();

  /* ================= CO-OP ================= */
  ({ H, J } = await pair(browser, broker, errs));
  await hostSetup(H, 'coop');
  ok(await until(H, () => SR.app.screen === 'online' && !document.getElementById('bhoststart').classList.contains('hidden')), 'co-op: START FLYING NOW offered');
  await H.click('#bhoststart');
  ok(await until(H, () => SR.app.screen === 'play' && SR.sess.role === 'host'), 'co-op: host flies while waiting');
  ok(await until(H, () => !document.getElementById('waitban').classList.contains('hidden')), 'co-op: waiting-for-buddy banner');
  await J.click('[data-act=join]');   // auto-search finds the host
  ok(await until(J, () => SR.app.screen === 'play' && SR.sess && SR.sess.role === 'guest' && !SR.sess.war, 20000), 'co-op: guest found the game and joined as wingman');
  ok(await until(H, () => SR.sess.G.players[1] && document.getElementById('waitban').classList.contains('hidden')), 'co-op: host has a wingman, banner gone');
  ok(await until(J, () => SR.sess.gal && SR.sess.gal.fleets.length > 0), 'co-op: guest gets the shared galactic chart');
  let flew = false;
  for (let i = 0; i < 6 && !flew; i++) { await J.keyboard.press('Digit5'); flew = await until(H, () => SR.sess.G.players[1].speed > 1, 2500); }
  ok(flew, 'co-op: guest flight reaches the host');
  await J.close();
  ok(await until(H, () => SR.app.screen === 'play' && SR.sess.G.players.length === 1, 15000), 'co-op: buddy leaves, host keeps flying solo');
  await H.close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log(`\n${eng}: ${pass} passed, ${fail} failed`); if (fails.length) console.log(fails.join('\n'));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
