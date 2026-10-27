// Renders thumb.png (960x600) from the real game. Server at repo root on :8080.  node games/star-raider/tools/thumb.mjs [out.png]
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright-core'); } catch (e) { pw = createRequire('/workspace/tools/node_modules/')('playwright-core'); }
const out = process.argv[2] || new URL('../thumb.png', import.meta.url).pathname;
const b = await pw.chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
await p.goto('http://localhost:8080/games/star-raider/?nolock=1&q=3&touch=0'); await p.waitForFunction(() => window.SR && SR.booted && SR.app.screen === 'title', null, { timeout: 60000 });
await p.click('[data-act=solo]'); await p.click('#diffs [data-d="1"]'); await p.click('[data-act=start]');
await p.waitForFunction(() => SR.app.screen === 'play' && SR.sess && SR.sess.G, null, { timeout: 60000 });
await p.evaluate(() => { const G = SR.sess.G, me = SR.sess.me; const f = G.fleets.slice().sort((a, b) => (b.d + b.l + b.h) - (a.d + a.l + a.h))[0]; f.x = me.sx; f.y = me.sy; f.px = f.x; f.py = f.y; me.shields = true; me.thr = 3; });
await p.waitForFunction(() => SR.sess.ships.length >= 2, null, { timeout: 120000 });
// stage the shot: Vrell ships spread ahead of the pilot, one blowing up, a torpedo pair in flight
await p.evaluate(async () => {
  const w = t => new Promise(r => setTimeout(r, t)); const S = SR.S, G = SR.sess.G, me = SR.sess.me, sk = S.key(me.sx, me.sy);
  me.q = [0, 0, 0, 1];
  const L = G.ships.filter(s => s.sk === sk && !s.gone);
  const spots = [[-30, 8, -62], [34, -14, -95], [72, 26, -170], [-80, -20, -210], [6, 38, -300]];
  L.forEach((s, i) => { const o = spots[i % spots.length]; s.pos = [me.pos[0] + o[0], me.pos[1] + o[1], me.pos[2] + o[2]]; s.fwd = S.V.norm([-o[0] * 0.3 + (i % 2 ? 0.6 : -0.6), 0.1, 1]); });
  SR.R.explode([me.pos[0] + 52, me.pos[1] + 6, me.pos[2] - 140], 2.4, [0, 0, 0], [1, 0.6, 0.25]);
  SR.hud.alertT = 0;
  await w(500); me.q = [0, 0, 0, 1];
  SR.app.paused = true;
  const d = document.createElement('div');
  d.innerHTML = '<div style="font:800 14px ui-monospace,Menlo,monospace;letter-spacing:.3em;color:#8fe8ff;text-shadow:0 2px 8px #000">HOLD THE GALAXY · 1–2 PLAYERS</div><div style="font:900 86px/0.95 ui-monospace,Menlo,monospace;color:#fff;text-shadow:0 0 26px rgba(120,200,255,.5),0 4px 18px #000;margin-top:6px">STAR<br>RAIDER</div>';
  d.style.cssText = 'position:fixed;right:40px;top:64px;text-align:right;z-index:99;pointer-events:none';
  document.body.appendChild(d);
});
await p.waitForTimeout(1200);
await p.screenshot({ path: out });
await b.close(); console.log('wrote', out);
