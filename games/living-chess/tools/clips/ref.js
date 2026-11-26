// render reference stills of one Living Chess piece on its own square, green surround, in-game-like camera
const { chromium } = require('playwright');
const [T = 'B', SIDE = 'w', SQ = 'dark', EL = '0.62', OUT = '/workspace/chess-clips-assets/ref'] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 720, height: 720 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8097/games/living-chess/?fast=1&cine=off&q=1', { timeout: 120000 });
  await p.waitForFunction(() => window.LCG && LCG.booted && LCG.screen === 'title', null, { timeout: 120000 });
  const types = 'PNBRQK';
  await p.evaluate(async ([T, SIDE, SQ, EL]) => {
    const G = LCG, R = G.R, THREE_ = null;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
    const sq = SQ === 'dark' ? 27 : 28; // d4 dark, e4 light
    const pc = SIDE === 'w' ? T : T.toLowerCase();
    const row4 = SQ === 'dark' ? '3' + pc + '4' : '4' + pc + '3';
    const kw = T === 'K' && SIDE === 'w', kb = T === 'K' && SIDE === 'b';
    const fen = (kb ? '8' : '7k') + '/8/8/8/' + row4 + '/8/8/' + (kw ? '8' : 'K7') + ' w - - 0 1';
    G.chess = new LC.Chess(fen); R.resetReactions(); R.sync(G.chess); R.setLast(null); R.setSel(null); R.setDots([]); R.setGhost && R.setGhost(null);
    const target = R.charAt(sq);
    for (const c of R.chars.values()) c.root.visible = c === target;
    const x = (sq & 7) - 3.5, z = 3.5 - (sq >> 3);
    R.boardG.children.forEach(m => { m.visible = Math.abs(m.position.x - x) < 0.01 && Math.abs(m.position.z - z) < 0.01 && m.position.y > -0.1; });
    const C = target.root.position.constructor;
    R.scene.background = new (R.scene.background.constructor)(0x00b140); R.scene.fog = null;
    R.dust.mesh.visible = false;
    for (const o of R.scene.children) if (o.isMesh || o.isGroup || o.isPoints) { if (o !== target.root && o !== R.boardG) o.visible = false; }
    const st = document.createElement('style'); st.textContent = 'body > *:not(canvas):not(#gl){visibility:hidden!important} #gl{visibility:visible!important}'; document.head.appendChild(st); let e = R.r.domElement; while (e && e !== document.body) { e.style.visibility = 'visible'; e = e.parentElement; }
    const el = +EL, d = 3.9, look = new C(x, 0.62, z);
    const pos = new C(x, look.y + Math.sin(el) * d, z + Math.cos(el) * d);
    R.setInsets({ top: 0, bottom: 0, left: 0, right: 0 });
    R.camShot = { pos, look, t: 0, hold: 1e9, k: 50, orbit: 0, focus: 0 }; R.camCur.pos.copy(pos); R.camCur.look.copy(look);
    target.setState('calm', 0.3, 'idle', null);
    window.__ok = true;
  }, [T, SIDE, SQ, EL]);
  await p.waitForTimeout(2500);
  const f = `${OUT}/${T}${SIDE}-${SQ}.png`;
  await p.screenshot({ path: f });
  console.log('wrote', f);
  await b.close();
})();
