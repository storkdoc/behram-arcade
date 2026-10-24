// Jax's Adventures - boot, main loop, glue
import * as S from './sim.js';
import * as W from './world.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { clamp } from './util.js';

const qs = new URLSearchParams(location.search);
const glCanvas = document.getElementById('gl'), hudCanvas = document.getElementById('hud');
const touchDev = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const mobile = touchDev || /iPhone|iPad|Android/i.test(navigator.userAgent);
const hud = new HUD(hudCanvas, { touch: touchDev });
const input = new Input(hudCanvas, hud);
const audio = new Audio();
let R = null, mode = 'loading', last = performance.now(), acc = 0, pend = null, saveT = 0, fatal = null;

// ---- sizing (native DPR; mobile WebGL capped ~5 MP)
const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none'; document.body.appendChild(probe);
function resize() {
  const w = innerWidth, h = innerHeight, dpr = devicePixelRatio || 1; const cap = mobile ? 5e6 : 9e6; const gdpr = Math.min(dpr, Math.sqrt(cap / (w * h)));
  const cs = getComputedStyle(probe); hud.safeTop = parseFloat(cs.paddingTop) || 0; hud.safeRight = parseFloat(cs.paddingRight) || 0; hud.safeBottom = parseFloat(cs.paddingBottom) || 0; hud.safeLeft = parseFloat(cs.paddingLeft) || 0;
  hud.resize(w, h, dpr); if (R) R.resize(w, h, gdpr);
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---- HUD callbacks
hud.cb = {
  sfx: n => audio.sfx({ name: n }),
  muted: () => audio.muted, toggleMute: () => { audio.unlock(); audio.setMuted(!audio.muted); },
  vol: () => ({ music: audio.music, sfx: audio.sfxVol }), setVol: (k, d) => { audio.unlock(); if (k === 'music') audio.setMusic(Math.round((audio.music + d) * 10) / 10); else { audio.setSfx(Math.round((audio.sfxVol + d) * 10) / 10); audio.sfx({ name: 'coin' }); } },
  quality: () => R ? R.q : 0, setQuality: q => { if (!R) return; R.noAdapt = true; R.setQuality(clamp(q, 0, 3)); try { localStorage.setItem('jaxadv.q', String(R.q)); } catch (e) { } },
  start: fresh => { audio.unlock(); if (fresh) { S.wipeSave(); S.newGame(1 + Math.floor(Math.random() * 1e6)); hud.introI = 0; hud.introT = 0; hud.mode = mode = 'intro'; } else { hud.mode = mode = 'play'; } if (R) R.view.init = false; hud.ui = null; hud.confirm = null; },
  introDone: () => { mode = 'play'; S.save(); if (R) R.view.init = false; },
  toTitle: () => { S.save(); hud.title.hasSave = S.hasSave(); hud.mode = mode = 'title'; },
};
input.onAny = () => audio.unlock();
const save = () => { if (mode === 'play' && S.G && !S.G.caught && !S.G.party) S.save(); };
addEventListener('visibilitychange', () => { if (document.hidden) save(); }); addEventListener('pagehide', save);

// ---- boot
async function boot() {
  resize(); requestAnimationFrame(loop);
  if (S.hasSave() && !qs.has('fresh')) { if (!S.load()) S.newGame(1 + Math.floor(Math.random() * 1e6)); } else S.newGame(1 + Math.floor(Math.random() * 1e6));
  const use2d = qs.get('gl') === '0' || !webglOK();
  try {
    if (!use2d) { const { Renderer3D } = await import('./render3d.js'); R = new Renderer3D(glCanvas, { mobile }); }
  } catch (e) { console.warn('3D renderer unavailable, using 2D fallback', e); R = null; }
  if (!R) { const { Renderer2D } = await import('./render2d.js'); R = new Renderer2D(glCanvas, { mobile }); }
  await R.init((k, msg) => { hud.load = k; if (msg) hud.loadMsg = msg; });
  const sq = (() => { try { return localStorage.getItem('jaxadv.q'); } catch (e) { return null; } })(); if (qs.has('q')) { R.setQuality(+qs.get('q')); R.noAdapt = true; } else if (sq != null) { R.setQuality(+sq); R.noAdapt = true; } hud.loadMsg = 'Drawing the map…'; await new Promise(r => setTimeout(r, 0)); hud.buildMap(); hud.load = 1;
  resize(); hud.title.hasSave = S.hasSave(); mode = 'title'; hud.mode = 'title';
  if (qs.has('play')) hud.cb.start(!S.hasSave() || qs.has('fresh')), qs.has('nointro') && hud.mode === 'intro' && (hud.introI = 99, hud.nextIntro());
  document.body.classList.add('ready');
}
function webglOK() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }

// ---- input merge across frames (edges must reach exactly one sim step)
const EDGE = ['crouchToggle', 'action', 'actionUp', 'interact', 'jump', 'fishDown', 'fishUp', 'bike', 'cancel'];
function mergeEdges(a, b) { if (!a) return { ...b }; for (const k of EDGE) a[k] = a[k] || b[k]; for (const k in b) if (!EDGE.includes(k)) a[k] = b[k]; return a; }

function loop(now) {
  requestAnimationFrame(loop); let dt = (now - last) / 1000; last = now; if (!(dt > 0)) dt = 0; dt = Math.min(dt, 0.1);
  try { frame(dt); } catch (e) { if (!fatal) { fatal = e; console.error(e); } }
}
function frame(dt) {
  document.body.classList.toggle('menu', mode === 'loading' || mode === 'title');
  const camYaw = R && R.ok !== false ? R.camYaw() : 0; const f = input.frame(camYaw); const ui = f.ui; ui.digits = ui.digits.length ? ui.digits[0] : null; hud.pad = f.pad;
  ui.anyKey = f.inp.action || f.inp.interact || f.inp.jump;
  // touch visuals
  const st = input.touch.stick; if (st) { const Rr = input.stickR(); const v = input.stickVec(); hud.stick = { active: true, ox: st.ox, oy: st.oy, dx: v ? v.x : 0, dy: v ? v.y : 0, r: Rr }; } else hud.stick = null; hud.pressedBtns = new Set(input.touch.btn.values()); hud.touch = hud.touch || input.mobile;
  if (ui.mute) hud.cb.toggleMute();
  if (mode === 'loading') { hud.draw(dt, null); return; }
  const G = S.G; let inp = f.inp;
  if (mode === 'title' || mode === 'intro') { hud.input(ui); if (R) { R.orbit(dt * (mode === 'title' ? 0.06 : 0.1), 0, 1); R.render(dt); } stepSim(dt, {}); hud.draw(dt, R); return; }
  // play
  const busy = G.fish || G.skip; if (busy && ui.pause && inp.cancel) ui.pause = false;
  if (busy) { ui.nav.ok = false; ui.nav.back = false; }
  const consumed = hud.input(ui); const uiOpen = !!hud.ui || !!hud.confirm; G.paused = uiOpen;
  if (consumed || G.menu || uiOpen) inp = { mx: 0, mz: 0 };
  R.orbit(f.orb.dx, f.orb.dy, f.orb.zoom); if (Math.abs(f.orb.dx) + Math.abs(f.orb.dy) > 0.0005) R.view.idle = 0;
  stepSim(dt, inp);
  const ev = G.ev.splice(0); R.events(ev); audio.events(ev); if (ev.some(e => e.t === 'teleport')) hud.ui = null;
  R.render(dt); hud.draw(dt, R);
  // audio ambience
  const p = G.p; let chase = false; for (const n of G.npcs) if (n.kind === 'ranger' && n.state === 'chase') chase = true;
  const fireD = S.fireLit() ? Math.hypot(p.x - W.LOC.firePit.x, p.z - W.LOC.firePit.z) : 99;
  audio.update(dt, { wind: G.weather.wind, alt: p.y, rain: G.weather.rain, water: (p.swim || p.canoe || W.H(p.x, p.z) < 1.5) ? 1 : 0, fire: clamp(1 - fireD / 12, 0, 1), day: S.sunHeight() > 0 ? 1 : 0, chase });
  saveT += dt; if (saveT > 20) { saveT = 0; save(); }
}
function stepSim(dt, inp) {
  if (!S.G) return; pend = mergeEdges(pend, inp); acc += dt; let n = 0;
  while (acc >= S.DT && n < 6) { S.update(S.DT, pend); acc -= S.DT; n++; if (n === 1) { const keep = pend; pend = { ...keep }; for (const k of EDGE) pend[k] = false; } }
  if (n > 0) pend = null; if (acc > S.DT * 6) acc = 0;
  if (mode !== 'play') S.G.ev.length = 0;
}

// ---- debug / test hooks
window.JAX = {
  S, W, hud, input, audio, get R() { return R; }, get mode() { return mode; }, get fatal() { return fatal; },
  start: (fresh = true, skipIntro = true) => { hud.cb.start(fresh); if (skipIntro && hud.mode === 'intro') { hud.introI = 99; hud.nextIntro(); } },
  step: (sec, inp = {}) => { const n = Math.round(sec / S.DT); for (let i = 0; i < n; i++) S.update(S.DT, i === 0 ? inp : { ...inp, action: false, interact: false, fishDown: false, jump: false, crouchToggle: false, bike: false, cancel: false }); },
  tp: (x, z, rot) => { const p = S.G.p; p.x = x; p.z = z; p.y = W.ground(x, z); if (rot != null) p.rot = rot; p.swim = false; p.canoe = false; if (R) R.view.init = false; },
  time: h => { S.G.clock = h; }, coins: n => { S.G.coins = n; }, give: id => S.addItem({ id }), weather: k => S.setWeather(k), ui: k => { k ? hud.openUI(k) : (hud.ui = null); },
  key: (code, down = true) => { const e = new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }); dispatchEvent(e); },
};
window.addEventListener('error', e => { if (!fatal) fatal = e.error || e.message; });
boot().catch(e => { fatal = e; console.error(e); hud.loadMsg = 'Something went wrong loading the game. Try reloading.'; });
