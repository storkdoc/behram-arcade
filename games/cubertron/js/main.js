/* CUBERTRON — input, HUD, and the frame loop. */
import { createGame } from './game.js';
import { createView, detectTier } from './view.js';
import { createAudio, TRACKS } from './audio.js';

const qs = new URLSearchParams(location.search);
const CFG = 'cubertron.cfg';
const SCORES = 'cubertron.grid.scores';
const TUT = 'cubertron.grid.tut';
const TUTORIAL = [
  ['TAP', 'Arrows or WASD move eight ways. Tap to move and fire that way. Hold or drag and the walker keeps going, firing toward your finger. A marker, aim line, and reticle stay up.'],
  ['AIM', 'Space shoots the way you face. Hold Shift and press an arrow to shoot that way without stepping. A tap on or near a sentry aims that shot at the sentry.'],
  ['WALLS KILL', 'A wall or a sentry ends the run. Sentries also fall apart if they hit a wall, each other, or a bolt that was not their own.'],
  ['LEAVE, OR THE GLEAM COMES', 'A lit door opens the next sector, and the door you used seals. Clear the sentries for a bonus. Wait too long and the Gleam bounces in. It cannot be destroyed.']
];

const $ = (id) => document.getElementById(id);
const canvas = $('gl');
const audio = createAudio();
let view;
try { view = createView(canvas); }
catch (err) { window.CBFatal(err && err.message ? err.message : 'WebGL failed'); throw err; }

function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch (e) { return {}; } }
const cfg = loadCfg();
const coarse = matchMedia('(pointer: coarse)').matches;
let autoAim = cfg.autoAim == null ? coarse : !!cfg.autoAim;
let sticksOn = cfg.sticks == null ? false : !!cfg.sticks;
let qualityMode = cfg.quality || 'auto';
let qualityManual = qualityMode !== 'auto';
audio.setVolume(cfg.vol == null ? 0.8 : cfg.vol);
audio.setMuted(!!cfg.muted);
audio.voices = !!cfg.voices;
if (qualityMode === 'auto') view.setTier(detectTier());
else view.setTier(qualityMode === 'high' ? 2 : qualityMode === 'low' ? 0 : 1);

let screen = 'title';
let returnScreen = 'title';
let game = createGame({ seed: (Math.random() * 1e9) | 0, demo: true });
let tutStep = 0;
let slowFrames = 0;
let letters = ['A', 'A', 'A'];
let letterAt = 0;
let overOpened = false;
let lastSerial = -1;
const held = new Set();
const gpWas = [];
const pointers = new Map();
const ui = { target: null, aim: null };

const api = {
  booted: false,
  get screen() { return screen; },
  get game() { return game; },
  audio, view,
  project(x, z) { return view.project(x, z); }
};
window.CUBERTRON = api;

function saveCfg() {
  try {
    localStorage.setItem(CFG, JSON.stringify({
      vol: audio.volume, muted: audio.muted, quality: qualityMode, autoAim, sticks: sticksOn, voices: audio.voices
    }));
  } catch (e) { /* private mode */ }
}
function loadScores() { try { return JSON.parse(localStorage.getItem(SCORES) || '[]'); } catch (e) { return []; } }
function saveScores(list) { try { localStorage.setItem(SCORES, JSON.stringify(list.slice(0, 8))); } catch (e) { /* ignore */ } }
function unlock() { audio.start(); }

function show(name) {
  screen = name;
  for (const id of ['title', 'how', 'scores', 'credits', 'options', 'pause', 'over', 'tut']) $(id).hidden = id !== name;
  if (name === 'play') {
    for (const id of ['title', 'how', 'scores', 'credits', 'options', 'pause', 'over']) $(id).hidden = true;
  }
  $('hud').hidden = !(name === 'play' || name === 'pause');
  if (name === 'scores') renderScores();
  if (name === 'credits') renderCredits();
  syncOptions();
  applySticks();
}

function startGame(seed, tut) {
  game = createGame({ seed: seed == null ? (Math.random() * 1e9) | 0 : seed | 0, hold: !!tut });
  overOpened = false;
  lastSerial = -1;
  show('play');
  if (tut) { tutStep = 0; $('tut').hidden = false; renderTut(); }
  else $('tut').hidden = true;
  layout();
}
function renderTut() {
  const step = TUTORIAL[tutStep];
  $('tut-title').textContent = step[0];
  $('tut-body').textContent = step[1];
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
    `<div class="scoreline"><span>${i + 1}  ${s.name}</span><b>${s.score}</b><span>S${s.sector}</span></div>`
  ).join('') : '<p>No scores on this device yet.</p>';
}
function renderCredits() {
  $('creditlist').innerHTML = TRACKS.map(t =>
    `<p><b>${t.piece}</b><br>${t.composer}. ${t.performer}. ${t.license}.</p>`
  ).join('') + '<p>Sentry voices, when enabled, are spoken by this device.</p>';
}
function syncOptions() {
  $('vol').value = String(Math.round(audio.volume * 100));
  $('quality').value = qualityMode;
  const set = (id, on, label) => {
    const b = $(id);
    b.textContent = label + (on ? 'ON' : 'OFF');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  set('opt-aim', autoAim, 'AUTO AIM: ');
  set('opt-sticks', sticksOn, 'ON-SCREEN STICKS: ');
  set('opt-voices', audio.voices, 'SENTRY VOICES: ');
  $('opt-mute').textContent = 'SOUND: ' + (audio.muted ? 'OFF' : 'ON');
  $('btn-mute').textContent = audio.muted ? 'OFF' : 'SND';
  $('btn-aim').textContent = autoAim ? 'AIM*' : 'AIM';
  $('btn-aim').setAttribute('aria-pressed', autoAim ? 'true' : 'false');
  $('btn-sticks').textContent = sticksOn ? 'STICKS*' : 'STICKS';
  $('btn-sticks').setAttribute('aria-pressed', sticksOn ? 'true' : 'false');
}
function applySticks() {
  $('sticks').hidden = !(sticksOn && screen === 'play');
}
function layout() { view.resize(); }

function interactive(target) {
  return target && target.closest && target.closest('button, a, input, select, .panel, .card, .stick');
}
function pickRobot(x, y) {
  const rad = matchMedia('(pointer: coarse)').matches ? 74 : 48;
  let best = null, bestD = rad;
  for (const bot of game.robots) {
    const s = view.project(bot.x, bot.z);
    if (s.behind) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bestD) { bestD = d; best = bot; }
  }
  return best;
}
function clampRoom(pt) {
  if (!pt) return null;
  return {
    x: Math.max(0.45, Math.min(game.COLS - 0.45, pt.x)),
    z: Math.max(0.45, Math.min(game.ROWS - 0.45, pt.z))
  };
}

function onDown(e) {
  unlock();
  if (interactive(e.target) && !(e.target.closest && e.target.closest('.stick'))) return;
  const stick = e.target.closest && e.target.closest('.stick');
  if (stick && sticksOn) {
    pointers.set(e.pointerId, { type: stick.id === 'stick-l' ? 'left' : 'right' });
    movePointer(e);
    e.preventDefault();
    return;
  }
  if (screen !== 'play' || game.phase === 'over') return;
  if (!$('tut').hidden && e.target.closest && e.target.closest('#tut')) return;
  const touch = touchAt(e.clientX, e.clientY);
  pointers.set(e.pointerId, { type: 'touch', x: touch.x, z: touch.z, id: touch.id, sx: e.clientX, sy: e.clientY });
  beginTouch(touch);
  e.preventDefault();
}
function touchAt(clientX, clientY) {
  const bot = pickRobot(clientX, clientY);
  const pt = clampRoom(view.floorPoint(clientX, clientY));
  const spot = pt || (bot ? { x: bot.x, z: bot.z } : { x: game.player.x, z: game.player.z });
  return { x: spot.x, z: spot.z, id: bot ? bot.id : 0 };
}
function beginTouch(touch) {
  game.target = { x: touch.x, z: touch.z };
  game.wish.x = 0; game.wish.z = 0; game.wish.kill = false;
  const bot = touch.id ? game.robots.find(b => b.id === touch.id) : null;
  if (bot) game.fireAim(bot.x - game.player.x, bot.z - game.player.z);
  else game.fireAim(touch.x - game.player.x, touch.z - game.player.z);
}
function movePointer(e) {
  const rec = pointers.get(e.pointerId);
  if (!rec) return;
  if (rec.type === 'left' || rec.type === 'right') {
    const el = $(rec.type === 'left' ? 'stick-l' : 'stick-r');
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.42);
    const y = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.42);
    const L = Math.hypot(x, y) || 1;
    const k = Math.min(1, L);
    rec.x = x / L * k;
    rec.z = y / L * k;
    const knob = el.querySelector('i');
    knob.style.transform = `translate(${rec.x * 28}px, ${rec.z * 28}px)`;
    return;
  }
  rec.sx = e.clientX; rec.sy = e.clientY;
  const touch = touchAt(e.clientX, e.clientY);
  rec.x = touch.x; rec.z = touch.z; rec.id = touch.id;
}
function onMove(e) { movePointer(e); }
function onUp(e) {
  const rec = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (rec && (rec.type === 'left' || rec.type === 'right')) {
    const el = $(rec.type === 'left' ? 'stick-l' : 'stick-r');
    const knob = el.querySelector('i');
    knob.style.transform = '';
  }
}

canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointerdown', (e) => { if (e.target && e.target.closest && e.target.closest('.stick')) onDown(e); });
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);

window.addEventListener('keydown', (e) => {
  unlock();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { audio.toggleMuted(); saveCfg(); syncOptions(); return; }
  if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) { startGame(null, !localStorage.getItem(TUT)); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (!$('tut').hidden) { closeTut(); return; }
    if (screen === 'play') { show('pause'); return; }
    if (screen === 'pause') { show('play'); return; }
    if (screen === 'over') { toTitle(); return; }
    if (screen !== 'title') show(returnScreen === 'pause' ? 'pause' : 'title');
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
  const shift = held.has('ShiftLeft') || held.has('ShiftRight');
  const vec = keyVector();
  if (shift && Math.hypot(vec.x, vec.z) > 0) {
    game.wish.x = 0; game.wish.z = 0;
    const aim = autoAim ? game.autoAim(vec.x, vec.z) : vec;
    game.fireAim(aim.x, aim.z);
  } else if (e.code === 'Space') {
    const aim = autoAim ? game.autoAim(game.player.faceX, game.player.faceZ) : { x: game.player.faceX, z: game.player.faceZ };
    game.fireAim(aim.x, aim.z);
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());

function keyVector() {
  let x = 0, z = 0;
  if (held.has('ArrowRight') || held.has('KeyD')) x += 1;
  if (held.has('ArrowLeft') || held.has('KeyA')) x -= 1;
  if (held.has('ArrowDown') || held.has('KeyS')) z += 1;
  if (held.has('ArrowUp') || held.has('KeyW')) z -= 1;
  return { x, z };
}

function applyInput() {
  game.wish.x = 0; game.wish.z = 0; game.wish.kill = true;
  game.firing = false;
  const shift = held.has('ShiftLeft') || held.has('ShiftRight');
  const keys = keyVector();
  const keyMag = Math.hypot(keys.x, keys.z);
  if (screen === 'play' && game.phase === 'play') {
    if (shift && keyMag > 0) {
      game.target = null;
      game.firing = true;
      game.aim = { x: keys.x, z: keys.z };
    } else if (keyMag > 0) {
      game.target = null;
      game.wish.x = keys.x; game.wish.z = keys.z;
      game.aim = { x: keys.x, z: keys.z };
      game.firing = held.has('Space');
    } else if (held.has('Space')) {
      game.firing = true;
      game.aim = { x: game.player.faceX, z: game.player.faceZ };
    }
  }
  let touchFinger = null, left = null, right = null;
  for (const rec of pointers.values()) {
    if (rec.type === 'touch') touchFinger = rec;
    else if (rec.type === 'left') left = rec;
    else if (rec.type === 'right') right = rec;
  }
  if (sticksOn && left && Math.hypot(left.x, left.z) > 0.2) {
    game.target = null;
    game.wish.x = left.x; game.wish.z = left.z;
    game.aim = { x: left.x, z: left.z };
  }
    if (sticksOn && right && Math.hypot(right.x, right.z) > 0.28) {
      game.firing = true;
      game.aim = { x: right.x, z: right.z };
    }
  if (touchFinger && screen === 'play') {
    const bot = touchFinger.id ? game.robots.find(b => b.id === touchFinger.id) : null;
    if (!left) {
      game.target = { x: touchFinger.x, z: touchFinger.z };
      game.wish.x = 0; game.wish.z = 0; game.wish.kill = false;
    }
    game.firing = true;
    if (bot) game.aim = { x: bot.x - game.player.x, z: bot.z - game.player.z };
    else game.aim = { x: touchFinger.x - game.player.x, z: touchFinger.z - game.player.z };
    ui.target = { x: touchFinger.x, z: touchFinger.z };
    ui.aim = bot ? { x: bot.x, z: bot.z } : { x: touchFinger.x, z: touchFinger.z };
  } else if (game.firing) {
    const L = Math.hypot(game.aim.x, game.aim.z) || 1;
    ui.aim = { x: game.player.x + game.aim.x / L * 2.2, z: game.player.z + game.aim.z / L * 2.2 };
    ui.target = game.target;
  } else {
    ui.aim = null;
    ui.target = game.target;
  }
  const touching = [...pointers.values()].some(r => r.type === 'touch');
  if (autoAim && game.firing && !touching) game.aim = game.autoAim(game.aim.x, game.aim.z);
}

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = pads && (pads[0] || pads[1]);
  if (!gp) return;
  const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
  const edge = (i) => pressed(i) && !gpWas[i];
  if (edge(9)) {
    if (screen === 'play') show('pause');
    else if (screen === 'pause') show('play');
    else if (screen === 'title') startGame(null, !localStorage.getItem(TUT));
  }
  if (screen === 'play' && game.phase === 'play') {
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
    if (Math.hypot(lx, ly) > 0.22) {
      game.wish.x = lx; game.wish.z = ly; game.wish.kill = true;
      game.target = null;
      if (!game.firing) game.aim = { x: lx, z: ly };
    }
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.hypot(rx, ry) > 0.35) {
      game.firing = true;
      game.aim = { x: rx, z: ry };
    } else if (pressed(0) || pressed(7)) {
      game.firing = true;
      if (!game.aim) game.aim = { x: game.player.faceX, z: game.player.faceZ };
    }
  }
  for (let i = 0; i < gp.buttons.length; i++) gpWas[i] = pressed(i);
}

function driveDemo() {
  if (screen !== 'title' || !game.demo) return;
  game.firing = false;
  game.wish.x = Math.sin(game.time * 0.7);
  game.wish.z = Math.cos(game.time * 0.5) * 0.65;
  game.wish.kill = false;
  game.target = null;
  const bot = game.robots[0];
  if (bot && Math.sin(game.time * 3) > 0.65) {
    game.firing = true;
    game.aim = { x: bot.x - game.player.x, z: bot.z - game.player.z };
  }
}

function playFx() {
  for (const ev of game.fx) {
    if (ev.k === 'shot') audio.playFx('shot');
    else if (ev.k === 'boom') audio.playFx('boom');
    else if (ev.k === 'hurt') audio.playFx('hurt');
    else if (ev.k === 'gleam') audio.playFx('gleam');
    else if (ev.k === 'clear') audio.playFx('clear');
    else if (ev.k === 'power' || ev.k === 'shield' || ev.k === 'life') audio.playFx('power');
  }
}

function drawMap() {
  const c = $('map');
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  ctx.clearRect(0, 0, w, h);
  const s = 12;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const key = (game.rx + dx) + ',' + (game.ry + dy);
      const here = dx === 0 && dy === 0;
      if (!here && !game.visited[key]) continue;
      ctx.fillStyle = here ? '#7ef6ff' : 'rgba(90,140,160,0.85)';
      ctx.fillRect(w / 2 + dx * s - 4, h / 2 + dy * s - 4, 8, 8);
    }
  }
}

function updateHud() {
  $('score').textContent = String(game.score).padStart(6, '0');
  $('combo').textContent = game.combo > 1 ? ' x' + game.combo + ' ' : '';
  $('stage').textContent = 'SECTOR ' + game.visits;
  const hearts = Math.max(0, game.player.lives);
  $('lives').textContent = hearts ? '♥'.repeat(Math.min(6, hearts)) : '—';
  const b = $('banner');
  if (game.bannerT > 0) { b.textContent = game.banner; b.classList.add('on'); }
  else b.classList.remove('on');
  $('gleamwarn').hidden = !(game.gleamIn < 2.2 && game.gleamIn > 0 && !game.gleam);
  drawMap();
  const box = $('pops');
  while (box.children.length < game.pops.length) box.appendChild(document.createElement('div'));
  while (box.children.length > game.pops.length) box.removeChild(box.lastChild);
  game.pops.forEach((pop, i) => {
    const el = box.children[i];
    const s = view.project(pop.x, pop.z);
    el.className = 'pop';
    el.style.left = s.x + 'px';
    el.style.top = s.y + 'px';
    el.style.opacity = String(Math.max(0, 1 - pop.age / pop.life));
    el.style.color = pop.tint;
    el.textContent = pop.text;
  });
  $('flash').style.opacity = game.shake > 0.35 ? String(Math.min(0.4, game.shake * 0.45)) : '0';
}

function paintLetters() {
  document.querySelectorAll('[data-li]').forEach((b) => {
    const i = Number(b.getAttribute('data-li'));
    b.textContent = letters[i];
    b.style.borderColor = i === letterAt ? '#3ee7ff' : '';
  });
}
function openOver() {
  overOpened = true;
  show('over');
  $('overscore').textContent = 'SCORE ' + game.score + '   ·   SECTOR ' + game.visits;
  const list = loadScores();
  const qualify = game.score > 0 && (list.length < 8 || game.score > list[list.length - 1].score);
  $('initials').hidden = !qualify;
  letters = ['A', 'A', 'A']; letterAt = 0; paintLetters();
}
function commitScore() {
  const list = loadScores();
  list.push({ name: letters.join(''), score: game.score, sector: game.visits });
  list.sort((a, b) => b.score - a.score);
  saveScores(list);
  $('initials').hidden = true;
}
function toTitle() {
  game = createGame({ seed: (Math.random() * 1e9) | 0, demo: true });
  overOpened = false;
  show('title');
}

document.body.addEventListener('click', (e) => {
  const go = e.target && e.target.getAttribute && e.target.getAttribute('data-go');
  if (go) {
    unlock();
    if (go === 'play') { startGame(null, !localStorage.getItem(TUT)); return; }
    returnScreen = screen === 'pause' ? 'pause' : 'title';
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
$('btn-sticks').addEventListener('click', () => { sticksOn = !sticksOn; saveCfg(); syncOptions(); applySticks(); });
$('opt-aim').addEventListener('click', () => { autoAim = !autoAim; saveCfg(); syncOptions(); });
$('opt-sticks').addEventListener('click', () => { sticksOn = !sticksOn; saveCfg(); syncOptions(); applySticks(); });
$('opt-voices').addEventListener('click', () => { audio.voices = !audio.voices; saveCfg(); syncOptions(); });
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

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  try {
    if (screen === 'title') driveDemo();
    else if (screen === 'play' && game.phase !== 'over') applyInput();
    else { game.firing = false; game.wish.x = 0; game.wish.z = 0; }
    if (screen === 'play' || screen === 'title') {
      if (screen === 'play' && game.phase !== 'over') pollPad();
      const touching = [...pointers.values()].some(r => r.type === 'touch');
      if (autoAim && game.firing && game.aim && !touching) game.aim = game.autoAim(game.aim.x, game.aim.z);
      const serial = game.roomSerial;
      game.step(dt);
      if (screen === 'play' && serial !== game.roomSerial && audio.voices) audio.speak(game.rx * 13 + game.ry + game.visits);
    }
    if (game.phase === 'over' && screen === 'play' && !overOpened) openOver();
    playFx();
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
