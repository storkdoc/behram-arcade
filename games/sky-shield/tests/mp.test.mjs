// Two-player test with a stand-in PeerJS transport (tests/mp/fakepeer.js + broker.js).
// Needs a server at repo root:  python3 -m http.server 8080   then:  node games/sky-shield/tests/mp.test.mjs [chromium|webkit]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const fs = require('fs'), path = require('path');
const makeBroker = require('./mp/broker.js');
const ENG = process.argv[2] || 'chromium';
const BASE = process.env.SS_URL || 'http://localhost:8080/games/sky-shield/?q=0&nolock=1&touch=0';
const fake = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'mp/fakepeer.js'), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(page, fn, ms = 15000, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await wait(150); } return false; }
const browser = ENG === 'webkit' ? await pw.webkit.launch() : await pw.chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const broker = makeBroker({ lat: 35, jit: 10 });
const errs = [];
async function mk(name) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 } }); const p = await ctx.newPage();
  await p.route('**/vendor/peerjs.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fake }));
  await p.exposeFunction('__broker', broker.attach(p));
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(BASE); await until(p, () => window.SS && SS.app.screen === 'title'); return p;
}
try {
  const H = await mk('host'), G = await mk('guest');
  await H.click('[data-act=host]');
  const call = await H.textContent('#callmsg');
  ok(call.includes('Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.'), 'host sees the call-your-buddy message verbatim');
  ok(await until(H, () => /[A-Z0-9]{4,}/.test(document.getElementById('ocode').textContent)), 'backup code shown: ' + (await H.textContent('#ocode')));
  ok([...broker.ids.keys()].length > 0 && [...broker.ids.keys()].every(k => k.startsWith('behram-ss-v1-')), 'peer ids namespaced behram-ss-v1-: ' + [...broker.ids.keys()].join(','));
  await H.click('[data-act=practice]');
  ok(await until(H, () => SS.app.screen === 'play' && SS.app.mode === 'practice'), 'host plays solo practice while waiting');
  ok(await until(H, () => !document.getElementById('waitban').classList.contains('hidden')), 'waiting banner visible during practice');
  ok((await G.textContent('[data-act=join]')).toUpperCase().includes('JOIN TWO-PLAYER GAME IN PROGRESS'), 'title has "Join Two-Player Game in Progress"');
  await G.click('[data-act=join]');
  ok(await until(G, () => SS.app.mode === 'versus' && SS.g, 20000) && await until(H, () => SS.app.mode === 'versus'), 'guest joined, both in versus');
  const sH = await H.evaluate(() => [SS.g.seed, SS.g.startWave, JSON.stringify(SS.g.sched.list)]), sG = await G.evaluate(() => [SS.g.seed, SS.g.startWave, JSON.stringify(SS.g.sched.list)]);
  ok(sH[0] === sG[0] && sH[2] === sG[2], 'same seed + identical wave schedule on both screens (' + sH[0] + ')');
  ok(await until(H, () => /^LINK \d+ MS$/.test(document.getElementById('link').textContent), 8000) && await until(G, () => /^LINK \d+ MS$/.test(document.getElementById('link').textContent), 8000), 'LINK ms readout: ' + await H.textContent('#link'));
  ok(await until(H, () => !document.getElementById('opp').classList.contains('hidden')), 'opponent strip shown');
  await G.evaluate(() => { SS.g.score = 4321; });
  ok(await until(H, () => document.getElementById('oscore').textContent === '4321', 4000), 'opponent strip mirrors buddy score');
  await until(H, () => SS.g.phase === 'play'); await until(G, () => SS.g.phase === 'play');
  await H.evaluate(() => { SS.g.outAtk += 2; });
  ok(await until(G, () => SS.g.inAtk > 0 || SS.g.foes.some(f => f.kind === 'buddy'), 5000), 'chain kills send extra warheads to the buddy');
  ok(/INCOMING/.test(await G.textContent('#toast')), 'buddy sees INCOMING toast');
  // host loses all cities -> THE END; guest must finish the wave to win
  await H.evaluate(() => { const g = SS.g; g.cities.forEach(c => c.alive = false); g.reserve = 0; g.foes.length = 0; g.flyers.length = 0; });
  ok(await until(G, () => /FINISH THIS WAVE/.test(document.getElementById('toast').textContent), 25000), 'guest told to finish the wave');
  await G.evaluate(() => { const g = SS.g; g.sched.list.length = 0; g.foes.length = 0; g.flyers.length = 0; g.inAtk = 0; });
  ok(await until(G, () => SS.app.screen === 'endp', 25000), 'guest results shown');
  ok(await until(H, () => SS.app.screen === 'endp' && /BUDDY WINS/.test(document.getElementById('etitle').textContent), 25000), 'host results: ' + await H.textContent('#etitle'));
  ok(/YOU WIN/.test(await G.textContent('#etitle')), 'guest wins (more waves survived): ' + await G.textContent('#etitle'));
  // rematch
  const oldSeed = sH[0];
  await H.click('#emenu [data-e=again]'); await wait(400); await G.click('#emenu [data-e=again]');
  ok(await until(H, () => SS.app.screen === 'play' && SS.app.mode === 'versus', 8000) && await until(G, () => SS.app.screen === 'play' && SS.app.mode === 'versus', 8000), 'rematch starts on both');
  const r1 = await H.evaluate(() => SS.g.seed), r2 = await G.evaluate(() => SS.g.seed);
  ok(r1 === r2 && r1 !== oldSeed, 'rematch uses a fresh shared seed');
  // disconnect
  await G.close();
  ok(await until(H, () => /DISCONNECTED|LEFT|LINK LOST/.test(document.getElementById('toast').textContent) && SS.app.online === null, 12000), 'host told buddy disconnected: ' + await H.textContent('#toast'));
  ok(await H.evaluate(() => SS.app.mode === 'solo' && SS.app.screen === 'play' && document.getElementById('opp').classList.contains('hidden')), 'host keeps playing solo');
} catch (e) { fail++; console.log('FAIL exception ' + e.stack); }
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await browser.close();
console.log(`\n${ENG}: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
