/* ==========================================================================
   RILEY'S RUN — main.js   menus, input (keys / touch / gamepad), race flow,
   HUD, medal ceremony, medal case, online two-player glue.
   ========================================================================== */
import { TRACKS, trackById, LANES } from './tracks.js';
import { Race, DT, KIDS, ITEMS, DIFF, autopilot } from './sim.js';
import { World } from './world.js';
import { Audio } from './audio.js';

const $ = id => document.getElementById(id);
const qs = new URLSearchParams(location.search);
const TEST = qs.has('test');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const MS = window.MoodSticker || { event() { }, screen() { }, game() { }, bindPause() { } };
MS.game && MS.game('rileys-run');

/* ------------------------------- settings ------------------------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('rr.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rr.' + k, JSON.stringify(v)); } catch (e) { } },
};
const S = { diff: store.get('diff', 'varsity'), quality: store.get('quality', TEST ? 'low' : (isTouch ? 'med' : 'high')), kid: store.get('kid', 'riley'), track: store.get('track', 'sunny') };

const world = new World($('gl'), S.quality);
const fx = $('fx'), fxg = fx.getContext('2d');
function resize() { world.resize(); fx.width = innerWidth; fx.height = innerHeight; }
addEventListener('resize', resize); resize();

/* ------------------------------- game state ------------------------------- */
const G = {
  mode: 'menu',          // menu | intro | race | post | podium
  race: null, course: null, track: null, me: null, myIdx: 0, online: false, host: false,
  introT: 0, postT: 0, timeScale: 1, acc: 0, paused: false, auto: TEST && qs.has('auto'), speed: +(qs.get('speed') || 1),
  banners: [], tauntT: 0, lastPlace: 0, lastJaxRel: 0, heartT: 0, results: null, podium: null, attract: true,
  net: { lastSend: 0, snaps: 0 },
};
window.RR = G; // test hook

const FIELD_OTHERS = ['maya', 'leo', 'sofia', 'theo', 'ava', 'nico'];
function makeField(myKid, online, amHost) {
  const rival = myKid === 'riley' ? 'jaxon' : 'riley';
  const f = [];
  if (online) {
    const hostKid = amHost ? myKid : rival, guestKid = amHost ? rival : myKid;
    f.push({ kid: hostKid, lane: 3, human: true, local: amHost, remote: !amHost });
    f.push({ kid: guestKid, lane: 4, human: true, local: !amHost, remote: amHost });
  } else {
    f.push({ kid: myKid, lane: 3, human: true, local: true });
    f.push({ kid: rival, lane: 4 });
  }
  const lanes = [2, 5, 1, 6, 0, 7];
  FIELD_OTHERS.forEach((k, i) => f.push({ kid: k, lane: lanes[i], remote: online && !amHost }));
  return f;
}

/* ------------------------------- screens ------------------------------- */
const screens = ['title', 'help', 'pick', 'tracks', 'lobby', 'case', 'pause', 'results'];
let screenStack = [];
function show(id) { for (const s of screens) $(s).classList.toggle('on', s === id); if (id) MS.screen(id); }
function go(id) { screenStack.push(id); show(id); }
function back() { screenStack.pop(); const id = screenStack[screenStack.length - 1] || 'title'; if (id === 'lobby' || screenStack.length === 0) { /* leaving lobby */ } show(id); if (screens.indexOf(id) < 0) show('title'); }
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { Audio.play('click'); if ($('lobby').classList.contains('on')) { Net.leave(); G.online = false; } back(); }));
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { Audio.play('click'); back(); }));
function chip(id, key, onSet) {
  const el = $(id); const upd = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S[key]));
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; store.set(key, S[key]); upd(); Audio.play('click'); onSet && onSet(); });
  upd();
}
chip('diffChip', 'diff'); chip('qChip', 'quality', () => { world.setQuality(S.quality); });
const updSoundBtn = () => { $('bSound').textContent = Audio.muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'; $('bMute').textContent = Audio.muted ? '🔇' : '🔊'; };
$('bSound').onclick = () => { Audio.init(); Audio.setMuted(!Audio.muted); updSoundBtn(); }; $('bMute').onclick = $('bSound').onclick; updSoundBtn();
$('bHelp').onclick = () => { Audio.play('click'); go('help'); };
const firstTouch = () => { Audio.init(); if (G.mode === 'menu') Audio.startMusic('menu'); };
addEventListener('pointerdown', firstTouch, { once: false }); addEventListener('keydown', firstTouch);

$('bPlay').onclick = () => { Audio.play('click'); G.online = false; screenStack = ['title']; go('pick'); };
$('bOnline').onclick = () => { Audio.play('click'); G.online = true; screenStack = ['title']; go('pick'); };
$('bCase').onclick = () => { Audio.play('click'); screenStack = ['title']; renderCase(); go('case'); };
document.querySelectorAll('#pick .card').forEach(c => c.addEventListener('click', () => {
  S.kid = c.dataset.kid; store.set('kid', S.kid); Audio.play('pickup');
  if (G.online) { openLobby(); } else { renderTracks(); go('tracks'); }
}));
function medalsData() { return store.get('medals', {}); }
function renderTracks() {
  const md = medalsData();
  $('trackCards').innerHTML = TRACKS.map(t => {
    const m = md[t.id] || {}; const best = m.best ? `<span class="medal-mini m${Math.min(3, m.bestPlace || 3)}">${m.bestPlace <= 3 ? m.bestPlace : ''}</span> BEST ${fmt(m.best)}` : '<span style="opacity:.6">NO MEDAL YET</span>';
    return `<button class="card tcard ${t.id}" data-t="${t.id}"><div class="ticon">${t.icon}</div><div class="cb"><div class="tag">${t.tag}</div><h3>${t.name}</h3><p>${t.blurb}</p><div class="best">${best}</div></div></button>`;
  }).join('');
  $('trackCards').querySelectorAll('.card').forEach(c => c.addEventListener('click', () => { S.track = c.dataset.t; store.set('track', S.track); Audio.play('pickup'); startRace({ track: S.track }); }));
}
function renderCase() {
  const md = medalsData(); let tot = { 1: 0, 2: 0, 3: 0 };
  $('caseGrid').innerHTML = TRACKS.map(t => {
    const m = md[t.id] || {}; tot[1] += m.gold || 0; tot[2] += m.silver || 0; tot[3] += m.bronze || 0;
    return `<div class="shelf"><h3>${t.icon} ${t.name}</h3><div class="meds"><div><span class="medal-mini m1">1</span><br>${m.gold || 0}</div><div><span class="medal-mini m2">2</span><br>${m.silver || 0}</div><div><span class="medal-mini m3">3</span><br>${m.bronze || 0}</div></div>
      <small>${m.best ? 'Personal best ' + fmt(m.best) + ' · best finish ' + ord(m.bestPlace) : 'Race here to win your first medal!'}${m.races ? ' · ' + m.races + ' race' + (m.races > 1 ? 's' : '') : ''}</small></div>`;
  }).join('');
  $('caseTotal').textContent = `${tot[1]} GOLD · ${tot[2]} SILVER · ${tot[3]} BRONZE`;
}
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const fmt = t => { if (!isFinite(t)) return '--'; const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };

/* ------------------------------- online lobby ------------------------------- */
function openLobby() { $('lobbyMain').classList.remove('hide'); $('lobbyWait').classList.add('hide'); $('netStatus').textContent = ''; go('lobby'); }
$('bHost').onclick = () => { Audio.play('click'); G.host = true; Net.host(); $('lobbyMain').classList.add('hide'); $('lobbyWait').classList.remove('hide'); };
$('bJoin').onclick = () => { Audio.play('click'); G.host = false; Net.joinAny(); };
$('bJoinCode').onclick = () => { const c = $('codeIn').value.trim(); if (c.length < 4) return; Audio.play('click'); G.host = false; Net.join(c); };
setInterval(() => {
  if (!$('lobby').classList.contains('on')) return;
  const st = Net.st; $('roomCode').textContent = st.code || '-----';
  const msg = { idle: '', opening: 'Opening a game…', waiting: 'Waiting for a buddy…', scanning: 'Looking for a game in progress…', connecting: 'Connecting…', connected: 'Connected! Starting…', nogame: 'No two-player game is waiting right now. Ask your buddy to tap Start a Two-Player Race.', error: st.error };
  $('netStatus').textContent = msg[st.status] || '';
}, 250);
Net.onMessage = m => {
  if (m.t === 'hello') {
    if (G.host) { // host picks the track: use the last one, rotate on rematch
      setTimeout(() => hostGo(S.track), 400);
    }
    return;
  }
  if (m.t === 'go' && !G.host) { S.track = m.trk; startRace({ track: m.trk, seed: m.seed, online: true, hostKid: m.hc, setDur: m.sd, diff: m.diff }); return; }
  if (m.t === 'again' && G.host) { hostGo(m.next ? nextTrack(S.track) : S.track); return; }
  const R = G.race; if (!R || !G.online) return;
  if (m.t === 'sn' && !G.host) {
    m.r.forEach((st, i) => { const r = R.runners[i]; if (!r || r.local || !st) return; netApply(R, r, st); });
    if (m.fo) applyOrder(R, m.fo, m.tm);
    if (m.ph && m.ph !== 'marks' && G.mode === 'intro') { G.introT = 5; G.mode = 'race'; G.marksShown = false; $('vs').classList.remove('on'); } // host is already racing: skip the rest of our intro
    if (m.ph && R.phase !== m.ph && m.ph !== 'done') { if (m.ph === 'go' && R.phase !== 'go') { R.phase = 'go'; R.phaseT = 0; R.goT = R.t; R.emit('go'); } }
  } else if (m.t === 'me' && G.host) { const r = R.runners[1]; if (r) netApply(R, r, m.c); }
  else if (m.t === 'fx') {
    if (m.k === 'gust') for (const id of m.ids) { const r = R.runners[id]; if (r && !r.remote) R.hitGust(r, m.by); }
    if (m.k === 'trap') { R.traps.push(m.trap); world.addTrap(m.trap); Audio.play('mud'); }
    if (m.k === 'trapgone') { R.traps = R.traps.filter(t => t.id !== m.id); world.removeTrap(m.id); }
  } else if (m.t === 'fin' && G.host) { const r = R.runners[1]; if (r && !r.finished) { r.s = R.c.start + R.c.dist; R.finish(r, m.tm); } }
};
function netApply(R, r, st) {
  const ds = st[0] - r.s; if (Math.abs(ds) > 6) r.s = st[0]; else r.s += ds * 0.35;
  r.x += (st[1] - r.x) * 0.5; r.v = st[2]; r.y = st[3]; const fl = st[4] | 0;
  r.shield = fl & 1 ? 1 : 0; r.cleats = fl & 2 ? 1 : 0; r.boost = fl & 4 ? 1 : 0; r.stumble = fl & 8 ? 0.3 : 0; r.launched = !!(fl & 16); r.netFin = !!(fl & 32);
}
function applyOrder(R, fo, tm) {
  fo.forEach((id, i) => { const r = R.runners[id]; if (!r) return; if (!r.finished) { r.finished = true; R.emit('finish', r, { place: i + 1, time: tm[i] }); } r.place = i + 1; r.time = tm[i]; });
  R.finishOrder = fo.slice(); for (const r of R.runners) if (r.local && r.finished && !fo.includes(r.id)) R.finishOrder.push(r.id);
}
function hostGo(trk) {
  S.track = trk; const seed = (Math.random() * 1e9) | 0;
  const sd = 1.1 + Math.random() * 1.1;
  Net.send({ t: 'go', seed, trk, hc: S.kid, sd, diff: S.diff });
  startRace({ track: trk, seed, online: true, hostKid: S.kid, setDur: sd });
}
function nextTrack(id) { const i = TRACKS.findIndex(t => t.id === id); return TRACKS[(i + 1) % TRACKS.length].id; }

/* ------------------------------- race setup ------------------------------- */
const TAUNTS = {
  jaxon: { pre: ['Hope you like the view of my back, Riley!', 'Twin speed? More like twin SLOW speed!', "That medal's already got my name on it!", 'Try to keep up, sis!', "I've been practicing. You're toast!"],
    pass: ['See ya, Riley!', 'Beep beep! Coming through!', 'Too slow, sis!', 'Zoom zoom!'], passed: ['Hey! No fair!', 'Lucky break!', "I'm just warming up!", 'Not for long!'],
    hit: ['Hah! Gotcha!', 'Watch your step!', 'Oops, my bad. Not really!'], got: ['Ow! Rematch!', 'Hey, quit it!'], win: ['Told ya! Gold is MY color!'], lose: ['Okay, okay… rematch tomorrow!'] },
  riley: { pre: ['Catch me if you can, Jaxon!', "Pink cleats are faster. It's science!", "Hope you brought your tissues, Jax!", "I'll save you a spot on the podium. Third place!"],
    pass: ['Bye, Jax!', 'Ponytail power!', 'Eat my dust!'], passed: ['No way!', "You're going down, Jaxon!", "That's it, I'm turning it on!"],
    hit: ['Splat! Sorry, not sorry!', 'Ha! Got you!'], got: ['JAXON!', "I'm telling Mom!"], win: ['Gold looks good on me!'], lose: ['Next time, Jaxon. Next time.'] },
};
const pick = a => a[(Math.random() * a.length) | 0];
function rivalOf(kid) { return kid === 'riley' ? 'jaxon' : 'riley'; }

function startRace(o) {
  Audio.init();
  const trk = trackById(o.track || S.track); G.track = trk;
  const course = trk.make(); G.course = course;
  G.online = !!o.online;
  const myKid = o.online && !G.host ? rivalOf(o.hostKid) : S.kid;
  const field = makeField(o.online ? (G.host ? S.kid : myKid) : S.kid, G.online, G.host);
  const seed = o.seed || ((Math.random() * 1e9) | 0);
  const race = new Race(course, { seed, diff: o.diff || S.diff, laps: trk.laps, field, follow: G.online && !G.host });
  if (o.setDur) race.setDur = o.setDur;
  G.race = race; G.myIdx = field.findIndex(f => f.local); G.me = race.runners[G.myIdx];
  G.rivalIdx = field.findIndex((f, i) => i !== G.myIdx && (f.kid === 'riley' || f.kid === 'jaxon'));
  world.build(course, trk.theme, field); world.setBoxes(race.boxes); world.setStars(race.stars);
  G.mode = 'intro'; G.introT = 0; G.postT = 0; G.acc = 0; G.results = null; G.paused = false; G.attract = false; G.photoWas = false;
  world.camT = 0; world.camPos = null;
  screenStack = []; show(null); document.body.classList.add('racing');
  $('count').textContent = ''; $('photo').classList.remove('on'); $('vig').classList.remove('on');
  buildProgress();
  // VS callout
  const rk = race.runners[G.rivalIdx].kid, mk = G.me.kid;
  $('vsA').src = `img/${mk}-face.webp`; $('vsAn').textContent = KIDS[mk].name + (G.online ? '' : ' (YOU)');
  $('vsB').src = `img/${rk}-face.webp`; $('vsBn').textContent = KIDS[rk].name;
  $('vsTrack').textContent = trk.name + (trk.laps > 1 ? ` · ${trk.laps} LAPS` : '') + (G.online ? ' · ONLINE' : ' · ' + DIFF[o.diff || S.diff].name);
  $('vsSay').textContent = `${KIDS[rk].name}: “${pick(TAUNTS[rk].pre)}”`;
  $('vs').classList.add('on');
  Audio.startMusic('race'); Audio.setMood('menu'); Audio.crowd(0.25);
  MS.screen('play'); MS.event('start');
  if (TEST && G.auto) G.introT = 4.5;
}
function buildProgress() {
  const p = $('prog'); p.querySelectorAll('.dot').forEach(d => d.remove());
  G.dots = G.race.runners.map((r, i) => {
    const d = document.createElement('div'); d.className = 'dot';
    if (r.kid === 'riley' || r.kid === 'jaxon') { d.classList.add('face'); d.style.backgroundImage = `url(img/${r.kid}-face.webp)`; }
    else d.style.background = KIDS[r.kid].color;
    if (i === G.myIdx) d.classList.add('me');
    p.appendChild(d); return d;
  });
}
function quitToMenu() {
  if (G.online) { Net.leave(); G.online = false; }
  G.mode = 'menu'; document.body.classList.remove('racing'); $('vs').classList.remove('on'); $('vig').classList.remove('on');
  screenStack = ['title']; show('title'); Audio.setMood('menu'); Audio.crowd(0.08); startAttract();
}

/* ------------------------------- input ------------------------------- */
const keys = {}; const I = { left: 0, right: 0, jump: 0, turbo: 0, conserve: 0, use: 0, launch: 0, steerHeld: 0, steerDir: 0, swipe: 0 };
const heldSince = { l: 0, r: 0 };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  const k = e.key; if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(k)) e.preventDefault();
  if (e.repeat) return;
  keys[k.toLowerCase()] = true;
  if (G.mode === 'race' && G.me) {
    if ((k === 'ArrowUp' || k === 'w' || k === 'W') && G.race.phase === 'go') I.jumpLatch = true;
    if (k === 'Shift' || k === 'e' || k === 'E' || k === 'x' || k === 'X') useNow();
    if ((k === ' ' || k === 'Enter') && G.race.phase !== 'marks') I.launchLatch = true;
  }
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') tapSteer(-1);
  if (k === 'ArrowRight' || k === 'd' || k === 'D') tapSteer(1);
  if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
  if (k === 'm' || k === 'M') $('bSound').onclick();
  if (k === 'Enter' && G.mode === 'menu' && $('title').classList.contains('on')) $('bPlay').click();
});
addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; if (['arrowleft', 'a', 'arrowright', 'd'].includes(k)) releaseSteer(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
function useNow() { if (G.race && G.me && G.mode === 'race' && !G.auto) G.race.useItem(G.me); }
function tapSteer(dir) { const me = G.me; if (!me || G.mode !== 'race') return; // quick double taps stack from the lane already targeted
  const tgt = me.autoLane !== null && Math.abs(me.autoLane - me.x) > 0.03 ? me.autoLane + dir : Math.round(me.x + dir * 0.55) === Math.round(me.x) ? Math.round(me.x) + dir : Math.round(me.x + dir * 0.55);
  me.autoLane = Math.max(0, Math.min(LANES - 1, tgt)); I.steerDir = dir; I.steerT = performance.now(); }
function releaseSteer() { const me = G.me; if (!me) return; if (I.steerT && performance.now() - I.steerT > 220) me.autoLane = Math.max(0, Math.min(LANES - 1, Math.round(me.x + me.vx * 0.08))); }
// touch buttons
const tb = { tL: 0, tR: 0, tJump: 0, tTurbo: 0, tItem: 0 };
for (const id of Object.keys(tb)) {
  const el = $(id);
  const on = e => { e.preventDefault(); tb[id] = 1; el.classList.add('on'); Audio.init(); if (id === 'tL') tapSteer(-1); if (id === 'tR') tapSteer(1); const ph = G.race && G.race.phase; if (id === 'tJump' && ph === 'go') I.jumpLatch = true; if (id === 'tItem') useNow(); if (id === 'tTurbo' && G.mode === 'race' && ph !== 'marks') I.launchLatch = true; if (navigator.vibrate) try { navigator.vibrate(8); } catch (_) { } };
  const off = e => { e.preventDefault(); tb[id] = 0; el.classList.remove('on'); if (id === 'tL' || id === 'tR') releaseSteer(); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
// swipes on the game view
let sw = null;
$('gl').addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') sw = { x: e.clientX, y: e.clientY, t: performance.now() }; });
$('gl').addEventListener('pointerup', e => {
  if (!sw) return; const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
  if (G.mode !== 'race') return;
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) { const n = Math.abs(dx) > 160 ? 2 : 1; for (let i = 0; i < n; i++) { const me = G.me; me.autoLane = Math.max(0, Math.min(7, (me.autoLane ?? Math.round(me.x)) + Math.sign(dx))); } }
  else if (dy < -30) I.swipeJump = 3;
  else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && G.race && G.race.phase !== 'go') I.tapLaunch = 3;
});
// gamepad
function pad() {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null; if (!gp) return null;
  const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
  const ax = Math.abs(gp.axes[0]) > 0.25 ? gp.axes[0] : 0;
  return { steer: (b(14) ? -1 : 0) + (b(15) ? 1 : 0) + ax, jump: b(0) || b(12), turbo: b(7) || b(2), use: b(1) || b(5) || b(4), conserve: b(6) || b(13), start: b(9) };
}
let padStartWas = false, padSteerWas = 0;
function readInput(me) {
  const p = pad();
  if (p && p.start && !padStartWas) togglePause(); padStartWas = p && p.start;
  if (p) { const ds = Math.round(p.steer); if (ds && ds !== padSteerWas && Math.abs(p.steer) < 0.95) tapSteer(ds); padSteerWas = ds; }
  const L = keys['arrowleft'] || keys['a'] || tb.tL, R = keys['arrowright'] || keys['d'] || tb.tR;
  let steer = 0; const held = I.steerT && performance.now() - I.steerT > 200;
  if (held) steer = (R ? 1 : 0) - (L ? 1 : 0);
  if (p && Math.abs(p.steer) > 0.95) steer = Math.sign(p.steer);
  const inp = me.input;
  inp.steer = steer;
  inp.jump = !!(keys['arrowup'] || keys['w'] || tb.tJump || (p && p.jump) || I.swipeJump > 0 || I.jumpLatch); if (I.swipeJump > 0) I.swipeJump--;
  inp.turbo = !!(keys[' '] || tb.tTurbo || (p && p.turbo));
  inp.conserve = !!(keys['arrowdown'] || keys['s'] || (p && p.conserve));
  const use = !!(p && p.use);   // keyboard / touch item presses fire immediately (useNow)
  if (use && !I.useWas && G.race) G.race.useItem(me); I.useWas = use;
  inp.launch = inp.turbo || inp.jump || !!keys['enter'] || I.tapLaunch > 0 || I.launchLatch; if (I.tapLaunch > 0) I.tapLaunch--;
}
function togglePause() {
  if (G.mode !== 'race' && G.mode !== 'intro') return;
  if (G.online) return; // a live online race can't be paused
  G.paused = !G.paused; show(G.paused ? 'pause' : null); if (!G.paused) screenStack = [];
}
$('bPause').onclick = togglePause; $('bResume').onclick = togglePause;
$('bRestart').onclick = () => { G.paused = false; startRace({ track: G.track.id }); };
$('bQuit').onclick = () => { G.paused = false; quitToMenu(); };
MS.bindPause && MS.bindPause({ pause() { if (G.mode === 'race' && !G.paused && !G.online) togglePause(); }, resume() { } });

/* ------------------------------- HUD & events ------------------------------- */
let bannerT = 0, hintT = 0;
function banner(txt, small, dur = 1.1, color) { const b = $('banner'); b.textContent = txt; b.classList.toggle('sm', !!small); b.style.color = color || ''; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); bannerT = dur; }
function hint(txt, dur = 2.5) { $('hint').textContent = txt; $('hint').classList.add('on'); hintT = dur; }
function taunt(kid, line) {
  if (G.tauntT > 0 && !line.force) return; const t = $('taunt');
  t.querySelector('img').src = `img/${kid}-face.webp`; t.querySelector('b').textContent = KIDS[kid].name; t.querySelector('span').textContent = line.text || line;
  t.style.boxShadow = `0 0 0 3px ${kid === 'riley' ? 'var(--pink)' : 'var(--red)'}, 0 8px 20px rgba(0,0,0,.5)`;
  t.classList.add('on'); G.tauntT = 2.6;
}
function handleEvents(R) {
  const me = G.me, rival = R.runners[G.rivalIdx];
  for (const e of R.events) {
    const r = e.id >= 0 ? R.runners[e.id] : null, mine = r === me;
    const p = r ? world.course.path.pos(r.s, r.x, 0.8, {}) : null;
    switch (e.type) {
      case 'set': $('count').textContent = 'SET…'; Audio.play('marks'); Audio.crowd(0.05); break;
      case 'go': $('count').textContent = 'GO!'; Audio.play('pistol'); Audio.setMood('race'); Audio.crowd(0.35); world.shake = 0.5; setTimeout(() => { if ($('count').textContent === 'GO!') $('count').textContent = ''; }, 700); break;
      case 'false': if (mine) { banner('FALSE START!', false, 1.2, '#ff6060'); Audio.play('false'); } break;
      case 'rocket': if (mine) { banner('ROCKET START!', false, 1.2, '#ffd23a'); Audio.play('boost'); world.shake = 0.6; hint(`Reaction ${(e.rt * 1000) | 0} ms`, 1.6); } break;
      case 'goodstart': if (mine) { banner('GOOD START', true, 0.9); hint(`Reaction ${(e.rt * 1000) | 0} ms`, 1.6); } break;
      case 'stumble': if (mine) banner(e.why || 'STUMBLE!', true, 1, '#ff8080'); break;
      case 'perfect': if (mine) { banner('PERFECT!', false, 0.7, '#7dff8a'); Audio.play('perfect'); } if (p) world.burst(p.wx, 0.9, p.wz, '#7dff8a', 10, 2, 0.4, 2); break;
      case 'clear': if (mine) Audio.play('whoosh'); break;
      case 'clip': if (mine) { banner('CLIPPED IT!', true, 0.8, '#ff8080'); Audio.play('clip'); world.shake = 0.5; } world.knockHurdle(e.h, e.l); break;
      case 'smash': if (mine) { banner('SMASH!', true, 0.6, '#7fe8ff'); Audio.play('smash'); } world.knockHurdle(e.h, e.l); if (p) world.burst(p.wx, 0.6, p.wz, '#7fe8ff', 24, 4, 0.6); break;
      case 'jump': if (mine) Audio.play('jump'); break;
      case 'land': if (mine) Audio.play('land'); break;
      case 'pad': if (mine) { Audio.play('boost'); banner('BOOST!', true, 0.5, '#3cf0ff'); } break;
      case 'splash': if (mine) { Audio.play('splash'); banner('SLIPPERY!', true, 0.6, '#7fd0ff'); } if (p) world.burst(p.wx, 0.2, p.wz, '#9fe0ff', 26, 3.2, 0.6, 9); break;
      case 'ramp': if (mine) { Audio.play('ramp'); banner('BIG AIR!', false, 0.8, '#ffd23a'); } break;
      case 'star': if (mine) Audio.play('star'); if (p) world.burst(p.wx, 0.6, p.wz, '#ffd23a', 6, 1.5, 0.35, 0); break;
      case 'box': if (p) world.burst(p.wx, 0.8, p.wz, '#ff9af0', 14, 2.5, 0.45, 2); break;
      case 'item': if (mine) { Audio.play('pickup'); hint(`${ITEMS[e.item].icon} ${ITEMS[e.item].name}: ${ITEMS[e.item].desc}. ${isTouch ? 'Tap ITEM' : 'Press SHIFT / E'}`, 2.2); } break;
      case 'use':
        if (mine || (p && Math.hypot(p.wx - world.camera.position.x, p.wz - world.camera.position.z) < 30)) Audio.play(e.item);
        if (mine) banner(ITEMS[e.item].name + '!', true, 0.9, ITEMS[e.item].color);
        if (e.item === 'shield' && p) world.burst(p.wx, 1, p.wz, '#7fe8ff', 30, 3, 0.6, 0);
        break;
      case 'gustfx': if (p) { world.ring(p.wx, 0.5, p.wz, '#b7a6ff'); world.burst(p.wx, 0.8, p.wz, '#d7c6ff', 40, 6, 0.5, 0); } break;
      case 'gusthit':
        if (mine) { banner('BLOWN BACK!', true, 0.8, '#b7a6ff'); world.shake = 0.7; Audio.play('hit'); if (R.runners[e.by] === rival) taunt(rival.kid, pick(TAUNTS[rival.kid].hit)); }
        else if (r === rival && R.runners[e.by] === me) taunt(rival.kid, pick(TAUNTS[rival.kid].got));
        break;
      case 'netgust': if (G.online) Net.send({ t: 'fx', k: 'gust', ids: [e.id], by: G.myIdx }); break;
      case 'trap': world.addTrap(e.trap); if (G.online && r && !r.remote && (G.host || mine)) Net.send({ t: 'fx', k: 'trap', trap: e.trap }); break;
      case 'trapgone': world.removeTrap(e.tid); if (G.online) Net.send({ t: 'fx', k: 'trapgone', id: e.tid }); break;
      case 'mudhit':
        if (mine) { banner('MUD!', true, 0.8, '#d0a070'); Audio.play('mud'); world.shake = 0.4; if (R.runners[e.by] === rival) taunt(rival.kid, pick(TAUNTS[rival.kid].hit)); }
        else if (r === rival && R.runners[e.by] === me) taunt(rival.kid, pick(TAUNTS[rival.kid].got));
        if (p) world.burst(p.wx, 0.3, p.wz, '#7a5230', 22, 2.5, 0.6, 8); break;
      case 'laneblocked': if (mine) hint('Lane taken!', 0.8); break;
      case 'shieldblock': if (mine) { banner('BLOCKED!', true, 0.7, '#7fe8ff'); Audio.play('shield'); } break;
      case 'slingready': if (mine) { Audio.play('ready'); hint('Draft charged! Pull out of the slipstream to SLINGSHOT', 1.6); } break;
      case 'sling': if (mine) { banner('SLINGSHOT!', false, 0.8, '#7fd4ff'); Audio.play('sling'); world.shake = 0.3; } break;
      case 'gassed': if (mine) { banner('GASSED!', true, 1, '#ff9a30'); hint('Out of stamina: ease off (↓ / S) to recover', 2); } break;
      case 'finish':
        if (e.place === 1) { world.breakTape(r); Audio.play('cheer'); if (p) world.confetti(p.wx, 2, p.wz, 80); }
        if (mine) onMyFinish(e);
        break;
    }
  }
  R.events.length = 0;
}
function onMyFinish(e) {
  G.mode = 'post'; G.postT = 0;
  const pl = e.place; banner(pl === 1 ? 'YOU WIN!' : ord(pl).toUpperCase() + '!', false, 2.5, pl === 1 ? '#ffd23a' : pl <= 3 ? '#fff' : '#cfd3ff');
  if (G.photoWas) setTimeout(() => hint(`PHOTO FINISH! ${ord(pl)} by a whisker`, 2.4), 300);
  Audio.setMood('menu'); Audio.crowd(0.5); MS.event(pl <= 3 ? 'win' : 'lose');
  if (G.online) Net.send({ t: 'fin', tm: e.time });
}

function hud(R) {
  const me = G.me;
  const order = R.runners.slice().sort((a, b) => (a.finished && b.finished) ? a.place - b.place : a.finished ? -1 : b.finished ? 1 : b.s - a.s);
  const place = order.indexOf(me) + 1;
  $('pos').innerHTML = `${place}<sup>${ord(place).slice(-2)}</sup><small>/${R.runners.length}</small>`;
  $('lap').textContent = R.opt.laps > 1 ? `LAP ${Math.min(R.opt.laps, me.lap)}/${R.opt.laps}` : G.track.short.toUpperCase();
  const t = R.phase === 'go' ? (me.finished ? me.time : R.t - R.goT) : 0; $('time').textContent = fmt(t);
  $('spd').innerHTML = `${Math.round(me.v * 3.6)} <small>KM/H</small>`;
  $('stam').querySelector('b').style.width = me.stamina + '%'; $('stam').classList.toggle('low', me.stamina < 22 || me.gassed);
  $('draftM').querySelector('b').style.width = me.draft + '%'; $('draftM').classList.toggle('full', me.draft >= 99);
  const it = $('itemSlot'); const has = me.item; it.classList.toggle('has', !!has);
  it.firstChild.textContent = has ? ITEMS[has].icon : '·'; it.querySelector('span').textContent = has ? ITEMS[has].name : '';
  R.runners.forEach((r, i) => { const f = Math.max(0, Math.min(1, R.progress(r) / R.c.dist)); G.dots[i].style.left = (f * 100) + '%'; });
  // rivalry chatter
  if (R.phase === 'go' && !me.finished) {
    const rival = R.runners[G.rivalIdx];
    if (place !== G.lastPlace && G.lastPlace) { if (place < G.lastPlace) Audio.crowd(0.45); }
    G.lastPlace = place;
    const rel = Math.sign(rival.s - me.s);
    if (rel !== G.lastJaxRel && G.lastJaxRel !== 0 && Math.abs(rival.s - me.s) < 3 && R.t - R.goT > 2 && !G.online) {
      taunt(rival.kid, pick(rel > 0 ? TAUNTS[rival.kid].pass : TAUNTS[rival.kid].passed));
    }
    if (rel) G.lastJaxRel = rel;
    // music intensity rises for the final stretch
    const rem = R.remaining(me); Audio.setIntensity(rem < 120 ? 1 : place <= 3 ? 0.6 : 0.4); if (rem < 120) Audio.crowd(0.4 + (1 - rem / 120) * 0.4);
  }
  return place;
}

/* speed lines overlay */
function drawFx(R) {
  fxg.clearRect(0, 0, fx.width, fx.height);
  const me = G.me; if (!me || G.mode !== 'race') return;
  const sf = me.v / me.top, b = (me.cleats > 0 || me.rocket > 0 || me.sling > 0 || me.boost > 0);
  const k = Math.max(0, sf - 0.95) * 3 + (b ? 0.8 : 0); if (k <= 0.02) return;
  const w = fx.width, h = fx.height, cx = w / 2, cy = h * 0.45, n = Math.min(70, 18 + k * 40) | 0;
  fxg.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r0 = Math.max(w, h) * (0.32 + Math.random() * 0.25), len = 40 + Math.random() * 160 * Math.min(1.5, k);
    const col = me.cleats > 0 ? '255,210,60' : me.sling > 0 ? '130,210,255' : '255,255,255';
    fxg.strokeStyle = `rgba(${col},${0.12 + Math.random() * 0.25 * Math.min(1, k)})`; fxg.lineWidth = 1 + Math.random() * 2.5;
    fxg.beginPath(); fxg.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); fxg.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); fxg.stroke();
  }
}

/* ------------------------------- medal ceremony ------------------------------- */
function saveMedal(place, time) {
  const md = medalsData(), m = md[G.track.id] || { gold: 0, silver: 0, bronze: 0, races: 0 };
  m.races = (m.races || 0) + 1;
  if (place === 1) m.gold = (m.gold || 0) + 1; else if (place === 2) m.silver = (m.silver || 0) + 1; else if (place === 3) m.bronze = (m.bronze || 0) + 1;
  const pb = !m.best || time < m.best; if (pb) m.best = time;
  m.bestPlace = Math.min(m.bestPlace || 99, place);
  md[G.track.id] = m; store.set('medals', md); return pb;
}
function toPodium() {
  const R = G.race, me = G.me;
  // anyone still running gets a projected time
  for (const r of R.runners) if (!r.finished) { const rem = R.remaining(r); R.finish(r, (R.t - R.goT) + rem / Math.max(5, r.v)); }
  R.events.length = 0;
  G.mode = 'podium'; world.camT = 0; G.fxCleared = false;
  const place = me.place, time = me.time;
  const pb = G.results ? G.results.pb : saveMedal(place, time);
  G.results = { place, time, pb };
  const cls = place === 1 ? 'g' : place === 2 ? 's' : place === 3 ? 'b' : 'n';
  const medal = $('medal'); medal.className = 'medal ' + cls; medal.querySelector('.face').textContent = place <= 3 ? place : ord(place);
  medal.querySelector('.backf').innerHTML = `${KIDS[me.kid].name}<br>${G.track.short.toUpperCase()}<br>${fmt(time)}`;
  $('resTitle').textContent = place === 1 ? 'GOLD MEDAL!' : place === 2 ? 'SILVER MEDAL!' : place === 3 ? 'BRONZE MEDAL!' : `${ord(place).toUpperCase()} PLACE`;
  const rival = R.runners[G.rivalIdx];
  const beatRival = me.place < rival.place;
  $('resSub').innerHTML = `${G.track.name} · ${fmt(time)}${pb ? '<span class="pb">NEW PERSONAL BEST</span>' : ''}<br>${beatRival ? `You beat ${rival.name}! ` : `${rival.name} got you this time. `}${G.online ? '' : '“' + pick(TAUNTS[rival.kid][beatRival ? 'lose' : 'win']) + '” – ' + rival.name}`;
  const st = me.stats, splits = st.splits.slice(0, 6).map((s, i, a) => (i ? (s - a[i - 1]) : s).toFixed(2)).join(' · ');
  $('resKpis').innerHTML = [
    [me.react ? (me.react * 1000 | 0) + ' ms' : '--', 'REACTION'], [Math.round(st.topV * 3.6) + ' km/h', 'TOP SPEED'], [st.perfect + (G.course.hurdles.length ? '/' + G.course.hurdles.length : ''), G.course.hurdles.length ? 'PERFECT HURDLES' : 'PERFECT JUMPS'],
    [st.items, 'POWER-UPS USED'], [st.drafted.toFixed(1) + ' s', 'DRAFTING'], [splits || '--', '100 M SPLITS'],
  ].map(([v, l]) => `<div class="kpi"><b>${v}</b><small>${l}</small></div>`).join('');
  const order = R.finishOrder.map(i => R.runners[i]);
  $('resList').innerHTML = order.map((r, i) => `<li class="${r === me ? 'me' : ''}"><span>${ord(i + 1)}</span><i style="${r.kid === 'riley' || r.kid === 'jaxon' ? `background-image:url(img/${r.kid}-face.webp)` : `background:${KIDS[r.kid].color}`}"></i><span>${KIDS[r.kid].full}${r === me ? ' (YOU)' : ''}</span><span>${fmt(r.time)}</span></li>`).join('');
  $('bNext').classList.toggle('hide', G.online && !G.host);
  $('bAgain').textContent = G.online ? '↻ Rematch' : '↻ Race Again';
  show('results'); document.body.classList.remove('racing');
  Audio.play('fanfare', place); Audio.play('cheer'); Audio.crowd(0.4);
  // podium placement
  const top3 = order.slice(0, 3); G.podium = { top3, t: 0 };
  const pos = world.podium.position, conf = new Float32Array(0);
  world.confetti(pos.x, 5, pos.z, 220);
  if (place <= 3) MS.event('win');
}
function podiumFrame(dt) {
  const R = G.race, P = G.podium; P.t += dt;
  const pg = world.podium; pg.updateMatrixWorld();
  R.runners.forEach((r, i) => {
    const m = world.runners[i], k = P.top3.indexOf(r);
    if (k >= 0) {
      const [x, y] = world.podiumSpots[k + 1]; const v = new world.tmpV.constructor(x, y, 0.1); pg.localToWorld(v);
      m.root.position.copy(v); m.root.rotation.set(0, pg.rotation.y, 0); m.root.visible = true;
      m.update(dt, null, { pose: k === 0 ? 'cheer' : 'pump' });
    } else if (r === G.me) {
      const v = new world.tmpV.constructor(3.6, 0, 1.2); pg.localToWorld(v); m.root.position.copy(v); m.root.rotation.set(0, pg.rotation.y - 0.4, 0); m.update(dt, null, { pose: 'sad' });
    } else m.root.visible = false;
    if (m.tag) m.tag.visible = r === G.me;
  });
  if (Math.random() < dt * 3) { const p = pg.position; world.confetti(p.x, 6, p.z, 25); }
}
$('bAgain').onclick = () => { Audio.play('click'); if (G.online) { if (G.host) hostGo(S.track); else Net.send({ t: 'again' }); $('bAgain').textContent = 'WAITING…'; return; } startRace({ track: G.track.id }); };
$('bNext').onclick = () => { Audio.play('click'); const n = nextTrack(G.track.id); S.track = n; store.set('track', n); if (G.online) { if (G.host) hostGo(n); else Net.send({ t: 'again', next: 1 }); return; } startRace({ track: n }); };
$('bCase2').onclick = () => { Audio.play('click'); screenStack = ['results']; renderCase(); go('case'); };
$('bMenu').onclick = () => { Audio.play('click'); quitToMenu(); };

/* ------------------------------- attract mode ------------------------------- */
function startAttract() {
  const trk = TRACKS[(Math.random() * TRACKS.length) | 0], course = trk.make();
  const field = ['riley', 'jaxon', ...FIELD_OTHERS].map((k, i) => ({ kid: k, lane: [3, 4, 2, 5, 1, 6, 0, 7][i] }));
  const race = new Race(course, { seed: (Math.random() * 1e9) | 0, diff: 'varsity', laps: trk.laps, field });
  race.phase = 'go'; race.goT = 0; G.race = race; G.course = course; G.track = trk; G.me = null; G.attract = true;
  world.build(course, trk.theme, field); world.setBoxes(race.boxes); world.setStars(race.stars); world.camT = 0; world.camPos = null;
}

/* ------------------------------- main loop ------------------------------- */
let last = performance.now(), fpsN = 0, fpsT = 0; G.fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000; let dt = Math.min(0.1, rawDt); last = now; // slow devices (car browsers) still run in real time
  fpsN++; fpsT += rawDt; if (fpsT > 1) { G.fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  const R = G.race; if (!R) return;
  if (G.paused) { world.render(); return; }
  const portrait = innerHeight > innerWidth;
  if (bannerT > 0 && (bannerT -= dt) <= 0) $('banner').classList.remove('on');
  if (hintT > 0 && (hintT -= dt) <= 0) $('hint').classList.remove('on');
  if (G.tauntT > 0 && (G.tauntT -= dt) <= 0) $('taunt').classList.remove('on');
  const speed = TEST ? G.speed : 1;

  if (G.mode === 'menu') {
    const steps = Math.round(dt / DT); for (let i = 0; i < Math.max(1, steps); i++) R.step();
    R.events.length = 0;
    if (R.finishOrder.length >= 3 && R.runners.every(r => r.finished) || R.t > 200) startAttract();
    world.sync(R, dt, null); world.updateCamera(dt, R, null, { mode: 'attract', portrait }); world.render(); return;
  }
  if (G.mode === 'intro') {
    G.introT += dt * speed;
    world.sync(R, dt, G.me, { poses: R.runners.map(() => 'marks') });
    world.updateCamera(dt, R, G.me, { mode: 'intro', portrait }); world.render();
    if (G.introT > 3.2 && $('vs').classList.contains('on')) $('vs').classList.remove('on');
    if (G.introT > 3.4 && !G.marksShown) { G.marksShown = true; $('count').textContent = 'ON YOUR MARKS…'; Audio.play('marks'); }
    if (G.introT > 5) { G.mode = 'race'; G.marksShown = false; if (R.phase === 'marks') R.phaseT = 0; hint(isTouch ? 'Tap TURBO the moment you see GO!' : 'Press SPACE the moment you see GO!', 2.5); }
    return;
  }
  if (G.mode === 'race' || G.mode === 'post') {
    let ts = speed;
    if (R.photo && G.mode === 'race') { ts *= 0.38; G.photoWas = true; G.heartT -= dt; if (G.heartT <= 0) { Audio.play('heart'); G.heartT = 0.55; } }
    $('photo').classList.toggle('on', R.photo && G.mode === 'race'); $('vig').classList.toggle('on', R.photo && G.mode === 'race');
    if (G.mode === 'post') { G.postT += dt; ts = speed * (G.postT < 1.2 ? 0.35 : 2.5); }
    if (G.mode === 'race' && G.me && !G.me.finished) { if (G.auto) autopilot(R, G.me); else readInput(G.me); }
    G.acc += dt * ts; let n = 0;
    while (G.acc >= DT && n < 40) {
      // remote runners: dead reckoning between network snapshots
      if (G.online) for (const r of R.runners) if (r.remote && R.phase === 'go' && !r.finished) { r.s += r.v * DT; r.phase += r.v * DT * 0.62; }
      R.step(); G.acc -= DT; n++;
      if (G.me && G.me.input) { if (I.jumpLatch && G.me.input.jump) { I.jumpLatch = false; G.me.input.jump = !!(keys['arrowup'] || keys['w'] || tb.tJump); } if (I.launchLatch && (G.me.launched || G.race.phase === 'set')) { I.launchLatch = false; G.me.input.launch = false; } }
      if (R.events.length) handleEvents(R);
    }
    if (G.acc > DT * 40) G.acc = 0;
    if (G.online) netTick(R, now);
    hud(R);
    let camMode = G.mode === 'post' ? (G.postT < 2.6 ? 'finish' : 'chase') : 'chase';
    world.sync(R, dt * Math.min(1, ts), G.me); world.updateCamera(dt, R, G.me, { mode: camMode, portrait }); world.render(); drawFx(R);
    if (Math.floor(R.t * 2) !== G.jumboTick) { G.jumboTick = Math.floor(R.t * 2); const ordR = R.runners.slice().sort((a, b) => b.s - a.s).slice(0, 4); world.drawJumbo(['', ...ordR.map((r, i) => `${i + 1}. ${r.name}`)], R.phase === 'go' ? R.t - R.goT : 0); }
    if (G.mode === 'post' && (G.postT > 6 || (R.phase === 'done' && G.postT > 3.2)) && (!G.online || G.postT > 3.2)) toPodium();
    return;
  }
  if (G.mode === 'podium') {
    if (!G.fxCleared) { fxg.clearRect(0, 0, fx.width, fx.height); G.fxCleared = true; }
    podiumFrame(dt); world.sync(R, dt, null, { skipRunners: true });
    world.updateCamera(dt, R, null, { mode: 'podium', portrait }); world.render();
  }
}
function netTick(R, now) {
  if (now - G.net.lastSend < 66) return; G.net.lastSend = now;
  if (G.host) {
    const pk = R.runners.map((r, i) => i === 1 ? null : packNet(R, r));
    Net.sendFast({ t: 'sn', r: pk, ph: R.phase, fo: R.finishOrder, tm: R.finishOrder.map(i => R.runners[i].time) });
  } else Net.sendFast({ t: 'me', c: packNet(R, G.me) });
  if (Net.st.status === 'error' && !G.netErrShown) { G.netErrShown = true; hint(Net.st.error || 'Connection lost', 4); }
}
function packNet(R, r) { const p = R.packRunner(r); if (r.finished) p[4] |= 32; return p; }

// boot
G.startRace = startRace; G.world = world; G.store = store; G.TRACKS = TRACKS; G.Audio = Audio;
try { startAttract(); } catch (e) { console.error(e); }
Audio.setMood('menu');
requestAnimationFrame(frame);
G.startRace = startRace; G.toPodium = () => toPodium(); G.world = world; G.store = store; G.TRACKS = TRACKS; G.Audio = Audio;
