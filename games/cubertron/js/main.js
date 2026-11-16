/* CUBERTRON — input, HUD, and the frame loop. */
import { createGame } from './game.js';
import { createView, detectTier } from './view.js';
import { createAudio, TRACKS } from './audio.js';

const qs = new URLSearchParams(location.search);
const CFG = 'cubertron.cfg';
const SCORES = 'cubertron.scores';
const TUT = 'cubertron.tut';
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const TUTORIAL = [
  ['HOP THE DIAGONALS', 'Land on a cube and the face takes the target color. A stage ends when every cube matches.'],
  ['POINT WHERE TO GO', 'Arrows or WASD hop. On a touch screen, tap a neighboring cube. Tap a farther one and Cubertron walks there, one hop at a time. A ghost marks the cube under your finger.'],
  ['FIRE AT THE DRONES', 'Space fires. Tap or drag a drone and an aim line follows your finger. Shift or DASH hops twice. Auto aim, if you want it, bends shots toward the nearest drone.'],
  ['THE DISC CAN CATCH YOU', 'Step off the edge and you fall. A floating disc may carry you back to the top. Shields, rapid fire, slow time, and a pulse show up as the stages get stranger.']
];

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const audio = createAudio();
let view;
try { view = createView(canvas); }
catch (err) { window.CBFatal(err && err.message ? err.message : 'WebGL failed'); throw err; }

const cfg = loadCfg();
let autoAim = cfg.autoAim == null ? matchMedia('(pointer: coarse)').matches : !!cfg.autoAim;
let qualityMode = cfg.quality || 'auto';
let qualityManual = qualityMode !== 'auto';
audio.setVolume(cfg.vol == null ? 0.8 : cfg.vol);
audio.setMuted(!!cfg.muted);
if (qualityMode === 'auto') view.setTier(detectTier());
else view.setTier(qualityMode === 'high' ? 2 : qualityMode === 'low' ? 0 : 1);

let screen = 'title';
let returnScreen = 'title';
let game = createGame({ seed: (Math.random() * 1e9) | 0, demo: true });
let finger = null;
let tutStep = 0;
let slowFrames = 0;
let letters = ['A', 'A', 'A'];
let letterAt = 0;
let overOpened = false;
const held = new Set();
const gpWas = [];
const ui = { aim: null, ghost: null, path: null };

const api = {
  booted: false,
  get screen() { return screen; },
  get game() { return game; },
  audio,
  view,
  projectCell(q, r) {
    const w = game.cellWorld(q, r);
    return view.project(w.x, w.y + 0.04, w.z);
  },
  projectFoe(id) {
    const f = game.foes.find(o => o.id === id) || (game.boss && game.boss.id === id ? game.boss : null);
    return f ? view.project(f.x, f.y + 0.25, f.z) : null;
  },
  spawn(kind, q, r) { return game.spawnFoe(kind, q, r); },
  hopTo(q, r) { return game.hopTo(q, r); }
};
window.CUBERTRON = api;

function loadCfg() {
  try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch (e) { return {}; }
}
function saveCfg() {
  try {
    localStorage.setItem(CFG, JSON.stringify({ vol: audio.volume, muted: audio.muted, quality: qualityMode, autoAim }));
  } catch (e) { /* private mode */ }
}
function loadScores() {
  try { return JSON.parse(localStorage.getItem(SCORES) || '[]'); } catch (e) { return []; }
}
function saveScores(list) {
  try { localStorage.setItem(SCORES, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ }
}

function unlock() { audio.start(); }

function show(name) {
  screen = name;
  for (const id of ['title', 'how', 'scores', 'credits', 'options', 'pause', 'over', 'tut']) {
    $(id).hidden = id !== name;
  }
  if (name === 'play') {
    for (const id of ['title', 'how', 'scores', 'credits', 'options', 'pause', 'over']) $(id).hidden = true;
  }
  $('hud').hidden = name !== 'play' && name !== 'pause';
  if (name === 'scores') renderScores();
  if (name === 'credits') renderCredits();
  syncOptions();
  const panel = document.querySelector('.screen:not([hidden]) button');
  if (panel && name !== 'play') panel.focus({ preventScroll: true });
}

function startGame(seed, tut) {
  game = createGame({ seed: seed == null ? (Math.random() * 1e9) | 0 : seed | 0, hold: !!tut });
  overOpened = false;
  show('play');
  if (tut) openTut();
  else $('tut').hidden = true;
  layout();
}

function openTut() {
  tutStep = 0;
  $('tut').hidden = false;
  renderTut();
}
function renderTut() {
  const step = TUTORIAL[tutStep];
  $('tut-title').textContent = step[0];
  $('tut-body').textContent = step[1];
  $('tut-dots').innerHTML = TUTORIAL.map((_, i) => `<i class="${i === tutStep ? 'on' : ''}"></i>`).join('');
  $('tut-next').textContent = tutStep === TUTORIAL.length - 1 ? 'GO' : 'NEXT';
}
function closeTut() {
  $('tut').hidden = true;
  game.hold = false;
  try { localStorage.setItem(TUT, '1'); } catch (e) { /* ignore */ }
}

function renderScores() {
  const list = loadScores();
  $('scorelist').innerHTML = list.length ? list.map((s, i) =>
    `<div class="scoreline"><span>${i + 1}  ${s.name}</span><b>${s.score}</b><span>ST ${s.stage}</span></div>`
  ).join('') : '<p>No scores on this device yet.</p>';
}
function renderCredits() {
  $('creditlist').innerHTML = TRACKS.map(t =>
    `<p><b>${t.piece}</b><br>${t.composer}. ${t.performer}. ${t.license}.</p>`
  ).join('');
}
function syncOptions() {
  $('vol').value = String(Math.round(audio.volume * 100));
  $('quality').value = qualityMode;
  $('opt-aim').textContent = 'AUTO AIM: ' + (autoAim ? 'ON' : 'OFF');
  $('opt-aim').setAttribute('aria-pressed', autoAim ? 'true' : 'false');
  $('opt-mute').textContent = 'SOUND: ' + (audio.muted ? 'OFF' : 'ON');
  $('btn-mute').textContent = audio.muted ? 'OFF' : 'SND';
  $('btn-mute').setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  $('btn-aim').setAttribute('aria-pressed', autoAim ? 'true' : 'false');
  $('btn-aim').textContent = autoAim ? 'AIM*' : 'AIM';
}

function layout() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const portrait = innerHeight > innerWidth;
  view.insets = {
    top: 86,
    bottom: coarse ? (portrait ? 108 : 70) : 28,
    left: 16,
    right: coarse && !portrait ? 108 : 18
  };
  view.fit(game);
  view.resize();
}

function directionStep(dx, dy) {
  const p = game.player;
  if (p.q < -20) return null;
  const origin = view.project(p.x, p.y + 0.2, p.z);
  let best = null, score = 0.28;
  for (const [dq, dr] of DIRS) {
    const w = game.cellWorld(p.q + dq, p.r + dr);
    const s = view.project(w.x, w.y, w.z);
    const vx = s.x - origin.x, vy = s.y - origin.y;
    const L = Math.hypot(vx, vy) || 1;
    const dot = (vx / L) * dx + (vy / L) * dy;
    if (dot > score) { score = dot; best = { dq, dr }; }
  }
  return best;
}

function nearestFoe() {
  const p = game.player;
  let best = null, bestD = 1e9;
  const list = game.foes.slice();
  if (game.boss && game.boss.hp > 0) list.push(game.boss);
  for (const f of list) {
    const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2 + (f.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = f; }
  }
  return best;
}

function fireToward(x, y, z) {
  if (autoAim) {
    const n = nearestFoe();
    if (n) {
      const dx = n.x - game.player.x, dz = n.z - game.player.z;
      const tx = x - game.player.x, tz = z - game.player.z;
      const along = dx * tx + dz * tz;
      if (along > 0 || (tx === 0 && tz === 0)) return game.fireAt(n.x, n.y + 0.3, n.z);
    }
  }
  return game.fireAt(x, y, z);
}

function fireFacing() {
  const n = autoAim ? nearestFoe() : null;
  if (n) return game.fireAt(n.x, n.y + 0.3, n.z);
  const p = game.player;
  return game.fireAt(p.x + p.facing.x * 5, p.y + 0.45, p.z + p.facing.z * 5);
}

function pick(x, y) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const foeR = coarse ? 86 : 60;
  let best = null, bestD = foeR;
  const consider = (obj, lift) => {
    const p = view.project(obj.x, obj.y + lift, obj.z);
    if (p.behind) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = obj; }
  };
  for (const f of game.foes) consider(f, 0.28);
  if (game.boss && game.boss.hp > 0) consider(game.boss, 0.5);
  if (best) return { type: 'enemy', id: best.id, x: best.x, y: best.y + 0.3, z: best.z };
  const hits = view.raycast(x, y);
  if (hits[0] && hits[0].object.userData) {
    const u = hits[0].object.userData;
    return { type: 'cube', q: u.q, r: u.r };
  }
  let cube = null, cd = coarse ? 58 : 40;
  for (const c of game.cubes) {
    if (c.gone) continue;
    const w = game.worldOf(c);
    const p = view.project(w.x, w.y + 0.02, w.z);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < cd) { cd = d; cube = c; }
  }
  if (cube) {
    if (cube.kind === 'mover') {
      const cell = game.moverCell(cube);
      return { type: 'cube', q: cell.q, r: cell.r };
    }
    return { type: 'cube', q: cube.q, r: cube.r };
  }
  return { type: 'sky' };
}

function interactive(target) {
  return target && target.closest && target.closest('button, a, input, select, .panel, .card');
}

function onDown(e) {
  unlock();
  if (interactive(e.target)) return;
  if (screen === 'title' && game.demo) {
    /* Let a tap on the pyramid hop the attract robot, and also unlock music. */
  }
  if (screen !== 'play' || game.phase === 'over') return;
  if ($('tut') && !$('tut').hidden && e.target.closest && e.target.closest('#tut')) return;
  const hit = pick(e.clientX, e.clientY);
  if (hit.type === 'enemy') {
    finger = { mode: 'aim', pid: e.pointerId, id: hit.id, x: e.clientX, y: e.clientY };
    game.fireAt(hit.x, hit.y, hit.z);
  } else if (hit.type === 'cube') {
    finger = { mode: 'move', pid: e.pointerId, q: hit.q, r: hit.r, x: e.clientX, y: e.clientY };
  } else {
    const n = autoAim ? nearestFoe() : null;
    finger = { mode: 'aim', pid: e.pointerId, id: n ? n.id : 0, x: e.clientX, y: e.clientY };
    if (n) game.fireAt(n.x, n.y + 0.3, n.z);
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
}

function onMove(e) {
  if (!finger || e.pointerId !== finger.pid) return;
  finger.x = e.clientX; finger.y = e.clientY;
  const hit = pick(e.clientX, e.clientY);
  if (finger.mode === 'move' && hit.type === 'enemy') {
    finger.mode = 'aim';
    finger.id = hit.id;
    game.fireAt(hit.x, hit.y, hit.z);
  } else if (finger.mode === 'move' && hit.type === 'cube') {
    finger.q = hit.q; finger.r = hit.r;
  } else if (finger.mode === 'aim') {
    if (hit.type === 'enemy') finger.id = hit.id;
    const id = finger.id;
    const f = game.foes.find(o => o.id === id) || (game.boss && game.boss.id === id ? game.boss : null);
    if (f) game.fireAt(f.x, f.y + 0.3, f.z);
    else if (autoAim) {
      const n = nearestFoe();
      if (n) game.fireAt(n.x, n.y + 0.3, n.z);
    }
  }
}

function onUp(e) {
  if (!finger || e.pointerId !== finger.pid) return;
  if (finger.mode === 'move') game.hopTo(finger.q, finger.r);
  finger = null;
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);

window.addEventListener('keydown', (e) => {
  unlock();
  if (e.code === 'KeyM') { audio.toggleMuted(); saveCfg(); syncOptions(); return; }
  if (e.code === 'KeyQ') { view.spin -= 0.35; return; }
  if (e.code === 'KeyE') { view.spin += 0.35; return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) { startGame(null, !localStorage.getItem(TUT)); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (!$('tut').hidden) { closeTut(); return; }
    if (screen === 'play') { show('pause'); return; }
    if (screen === 'pause') { show('play'); return; }
    if (screen === 'over') { toTitle(); return; }
    if (screen !== 'title' && screen !== 'play') { show(returnScreen === 'pause' ? 'pause' : 'title'); }
    return;
  }
  if (screen === 'over' && !$('initials').hidden) {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
      const dir = e.code === 'ArrowUp' ? 1 : -1;
      letters[letterAt] = String.fromCharCode(65 + (letters[letterAt].charCodeAt(0) - 65 + dir + 26) % 26);
      paintLetters();
      return;
    }
    if (e.code === 'ArrowLeft') { letterAt = (letterAt + 2) % 3; return; }
    if (e.code === 'ArrowRight') { letterAt = (letterAt + 1) % 3; return; }
    if (e.code === 'Enter') { commitScore(); return; }
  }
  if (screen !== 'play' || game.phase === 'over') return;
  held.add(e.code);
  if (e.repeat) return;
  if (e.code === 'Space') fireFacing();
  else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') doDash();
  else if (e.code === 'Enter') game.pulse();
  else keyboardHop(true);
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

function keyboardHop(force) {
  if (screen !== 'play' || game.phase !== 'play') return;
  const p = game.player;
  if (p.mode !== 'ground') return;
  let x = 0, y = 0;
  if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
  if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
  if (held.has('ArrowDown') || held.has('KeyS')) y += 1;
  if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
  if (!x && !y) return;
  const L = Math.hypot(x, y);
  const step = directionStep(x / L, y / L);
  if (!step) return;
  if (force) p.path = [];
  if (p.path.length) return;
  game.hopTo(p.q + step.dq, p.r + step.dr);
}

function doDash() {
  const p = game.player;
  let dq = p.dq || 1, dr = p.dr || 0;
  let x = 0, y = 0;
  if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
  if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
  if (held.has('ArrowDown') || held.has('KeyS')) y += 1;
  if (held.has('ArrowUp') || held.has('KeyW')) y -= 1;
  if (x || y) {
    const L = Math.hypot(x, y);
    const step = directionStep(x / L, y / L);
    if (step) { dq = step.dq; dr = step.dr; }
  }
  game.dash(dq, dr);
}

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && (pads[0] || pads[1]);
  if (!gp) return;
  const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const edge = (i) => pressed(i) && !gpWas[i];
  if (edge(9) || edge(8)) {
    for (let i = 0; i < gp.buttons.length; i++) gpWas[i] = pressed(i);
    if (screen === 'play') show('pause');
    else if (screen === 'pause') show('play');
    else if (screen === 'title') startGame(null, !localStorage.getItem(TUT));
    return;
  }
  if (screen !== 'play' || game.phase !== 'play') {
    for (let i = 0; i < gp.buttons.length; i++) gpWas[i] = pressed(i);
    return;
  }
  if (edge(0)) fireFacing();
  if (edge(1)) doDash();
  if (edge(2)) game.pulse();
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.hypot(ax, ay) > 0.55 && game.player.mode === 'ground' && !game.player.path.length) {
    const step = directionStep(ax, ay);
    if (step) game.hopTo(game.player.q + step.dq, game.player.r + step.dr);
  }
  const rx = gp.axes[2] || 0;
  if (Math.abs(rx) > 0.4) view.spin += rx * 0.03;
  for (let i = 0; i < gp.buttons.length; i++) gpWas[i] = pressed(i);
}

function driveDemo() {
  if (screen !== 'title' || !game.demo) return;
  const p = game.player;
  if (p.mode !== 'ground' || p.path.length) return;
  if (Math.random() > 0.05) return;
  const left = game.cubes.filter(c => !c.gone && c.prog < c.need && !(c.q === p.q && c.r === p.r));
  if (!left.length) {
    const n = DIRS.find(([dq, dr]) => game.hasFooting(p.q + dq, p.r + dr));
    if (n) game.hopTo(p.q + n[0], p.r + n[1]);
    return;
  }
  left.sort((a, b) => (Math.abs(a.q - p.q) + Math.abs(a.r - p.r)) - (Math.abs(b.q - p.q) + Math.abs(b.r - p.r)));
  game.hopTo(left[0].q, left[0].r);
  if (game.foes[0] && p.cool <= 0) game.fireAt(game.foes[0].x, game.foes[0].y, game.foes[0].z);
}

function playFx() {
  for (const ev of game.fx) {
    if (ev.k === 'hop' || ev.k === 'dash') audio.playFx('hop');
    else if (ev.k === 'land') audio.playFx('land');
    else if (ev.k === 'shot') audio.playFx('shot');
    else if (ev.k === 'paint') audio.playFx('paint');
    else if (ev.k === 'boom' || ev.k === 'pulse' || ev.k === 'crumble') audio.playFx('boom');
    else if (ev.k === 'hurt') audio.playFx('hurt');
    else if (ev.k === 'power' || ev.k === 'shield' || ev.k === 'catch' || ev.k === 'clear' || ev.k === 'life') audio.playFx(ev.k === 'clear' ? 'clear' : 'power');
  }
}

function updateHud() {
  $('score').textContent = String(game.score).padStart(6, '0');
  $('combo').textContent = game.combo > 1 ? 'x' + game.combo : '';
  $('stage').textContent = game.def.boss ? game.def.name : ('STAGE ' + (game.stage + 1));
  const hearts = Math.max(0, game.player.lives);
  $('lives').textContent = hearts ? '♥'.repeat(Math.min(5, hearts)) : '—';
  const prog = game.painted();
  $('meter').style.width = (prog.need ? (100 * prog.n / prog.need) : 0) + '%';
  const b = $('banner');
  if (game.bannerT > 0) { b.textContent = game.banner; b.classList.add('on'); }
  else b.classList.remove('on');
  const boss = game.boss && game.boss.hp > 0;
  $('bossbar').hidden = !boss;
  if (boss) {
    $('bossname').textContent = game.boss.name;
    $('bosshp').style.width = Math.max(0, 100 * game.boss.hp / game.boss.max) + '%';
  }
  $('btn-bomb').hidden = !(game.player.bombs > 0);
  const box = $('pops');
  const pops = game.pops;
  while (box.children.length < pops.length) box.appendChild(document.createElement('div'));
  while (box.children.length > pops.length) box.removeChild(box.lastChild);
  pops.forEach((pop, i) => {
    const el = box.children[i];
    const s = view.project(pop.x, pop.y + pop.age * 0.6, pop.z);
    el.className = 'pop';
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    el.style.opacity = String(Math.max(0, 1 - pop.age / pop.life));
    el.style.color = pop.tint;
    el.textContent = pop.text;
  });
  if (game.shake > 0.4) {
    $('flash').style.opacity = String(Math.min(0.45, game.shake * 0.5));
  } else $('flash').style.opacity = '0';
}

function paintLetters() {
  document.querySelectorAll('[data-li]').forEach((b) => {
    const i = Number(b.getAttribute('data-li'));
    b.textContent = letters[i];
    b.style.borderColor = i === letterAt ? '#7ef0ff' : '';
  });
}

function openOver() {
  overOpened = true;
  show('over');
  $('overscore').textContent = 'SCORE ' + game.score + '   ·   REACHED STAGE ' + (game.stage + 1);
  const list = loadScores();
  const qualify = game.score > 0 && (list.length < 8 || game.score > list[list.length - 1].score);
  $('initials').hidden = !qualify;
  letters = ['A', 'A', 'A']; letterAt = 0; paintLetters();
}
function commitScore() {
  const list = loadScores();
  list.push({ name: letters.join(''), score: game.score, stage: game.stage + 1 });
  list.sort((a, b) => b.score - a.score);
  saveScores(list);
  $('initials').hidden = true;
}
function toTitle() {
  game = createGame({ seed: (Math.random() * 1e9) | 0, demo: true });
  overOpened = false;
  show('title');
  layout();
}

document.body.addEventListener('click', (e) => {
  const go = e.target && e.target.getAttribute && e.target.getAttribute('data-go');
  if (go) {
    unlock();
    if (go === 'play') { startGame(null, !localStorage.getItem(TUT)); return; }
    returnScreen = screen === 'pause' ? 'pause' : 'title';
    if (screen === 'play') returnScreen = 'pause';
    show(go);
    return;
  }
  if (e.target && e.target.closest && e.target.closest('[data-back]')) show(returnScreen === 'pause' ? 'pause' : 'title');
});
$('resume').addEventListener('click', () => show('play'));
$('quit').addEventListener('click', () => toTitle());
$('again').addEventListener('click', () => { unlock(); startGame(null, false); });
$('over-menu').addEventListener('click', () => toTitle());
$('save-score').addEventListener('click', commitScore);
$('btn-pause').addEventListener('click', () => { if (screen === 'play') show('pause'); });
$('btn-mute').addEventListener('click', () => { audio.toggleMuted(); saveCfg(); syncOptions(); });
$('btn-aim').addEventListener('click', () => { autoAim = !autoAim; saveCfg(); syncOptions(); });
$('btn-dash').addEventListener('click', () => { unlock(); doDash(); });
$('btn-bomb').addEventListener('click', () => { unlock(); game.pulse(); });
$('opt-aim').addEventListener('click', () => { autoAim = !autoAim; saveCfg(); syncOptions(); });
$('opt-mute').addEventListener('click', () => { audio.toggleMuted(); saveCfg(); syncOptions(); });
$('vol').addEventListener('input', () => { audio.setVolume(Number($('vol').value) / 100); saveCfg(); });
$('quality').addEventListener('change', () => {
  qualityMode = $('quality').value;
  qualityManual = qualityMode !== 'auto';
  if (!qualityManual) view.setTier(detectTier());
  else view.setTier(qualityMode === 'high' ? 2 : qualityMode === 'low' ? 0 : 1);
  saveCfg();
});
$('tut-skip').addEventListener('click', closeTut);
$('tut-next').addEventListener('click', () => {
  if (tutStep >= TUTORIAL.length - 1) closeTut();
  else { tutStep++; renderTut(); }
});
document.querySelectorAll('[data-li]').forEach((b) => {
  b.addEventListener('click', () => {
    const i = Number(b.getAttribute('data-li'));
    if (letterAt === i) letters[i] = String.fromCharCode(65 + (letters[i].charCodeAt(0) - 64) % 26);
    letterAt = i;
    paintLetters();
  });
});

function aimVisual() {
  ui.ghost = null;
  ui.aim = null;
  ui.path = game.player.path;
  if (!finger || screen !== 'play') return;
  if (finger.mode === 'move') ui.ghost = { q: finger.q, r: finger.r };
  else {
    const f = game.foes.find(o => o.id === finger.id) || (game.boss && game.boss.id === finger.id ? game.boss : null);
    if (f) ui.aim = { on: true, x: f.x, y: f.y + 0.35, z: f.z };
    else {
      const hits = view.raycast(finger.x, finger.y);
      if (hits[0]) ui.aim = { on: true, x: hits[0].point.x, y: hits[0].point.y + 0.3, z: hits[0].point.z };
      else ui.aim = { on: true, x: game.player.x + game.player.facing.x * 2, y: game.player.y + 0.6, z: game.player.z + game.player.facing.z * 2 };
    }
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try {
    if (screen === 'play' && game.phase !== 'over') {
      keyboardHop(false);
      pollPad();
      game.step(dt);
    } else if (screen === 'title') {
      driveDemo();
      game.step(dt);
    }
    if (game.phase === 'over' && screen === 'play' && !overOpened) openOver();
    playFx();
    aimVisual();
    view.sync(game, dt, ui);
    view.render();
    if (screen === 'play' || screen === 'pause') updateHud();
    audio.tick();
    if (!qualityManual && view.tier > 0) {
      if (dt > 0.028) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 50) { view.setTier(view.tier - 1); slowFrames = 0; }
    }
    api.booted = true;
  } catch (err) {
    if (!api.booted) window.CBFatal(err && err.message ? err.message : 'render failed');
    else console.error(err);
  }
  requestAnimationFrame(frame);
}

window.addEventListener('resize', layout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') show('pause'); });

if (qs.has('play')) startGame(Number(qs.get('seed') || 1), false);
else { show('title'); layout(); }
syncOptions();
requestAnimationFrame(frame);
