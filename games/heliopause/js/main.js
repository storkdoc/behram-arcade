/* HELIOPAUSE — screens, HUD, input (mouse, touch, keyboard, gamepad), save, and the main loop. */
(function () {
'use strict';
var D = window.HPD, Sim = window.HPSim, T = D.TOWERS, A = D.ALIENS, TAU = D.TAU;
var $ = function (id) { return document.getElementById(id); };
var cv = $('cv'), R = new window.HPRender(cv), AU = new window.HPAudio();
var MS = window.MoodSticker || { screen: function () {}, event: function () {}, bindPause: function () {} };
var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
var DT = 1 / 30;

/* ---------------- save ---------------- */
var KEY = 'heliopause.v1';
function defSave() { return { stars: {}, unlocked: 0, endlessBest: 0, perks: {}, diff: 'commander', run: null, seenIntro: false,
  set: { master: 80, music: 70, sfx: 75, qual: 'high', paths: '1', labels: '1', mus: '1' } }; }
var save = defSave();
try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); for (var k in o) save[k] = o[k]; save.set = Object.assign(defSave().set, o.set || {}); } } catch (e) { /* private mode */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
function bestStars(i) { var s = save.stars[i] || {}, m = 0; for (var d in s) m = Math.max(m, s[d]); return m; }
function totalStars() { var n = 0; for (var i = 0; i < D.SECTORS.length; i++) n += bestStars(i); return n; }
function spentStars() { var n = 0; D.PERKS.forEach(function (p) { for (var r = 0; r < (save.perks[p.id] || 0); r++) n += p.cost[r]; }); return n; }
function endlessOpen() { return save.unlocked >= 3; }
function applySettings() {
  AU.toggleMusic(save.set.mus !== '0'); AU.setVol('master', save.set.master / 100); AU.setVol('music', save.set.music / 100); AU.setVol('sfx', save.set.sfx / 100);
  if ($('bMus')) $('bMus').classList.toggle('off', save.set.mus === '0');
  if (R.quality !== save.set.qual) { R.quality = save.set.qual; R.resize(); }
}

/* ---------------- state ---------------- */
var state = 'begin', prevState = null, sim = null, ui = { sel: null, hover: null, previewType: null, ghost: null, opts: [], optFocus: -1, sellArm: 0 };
var speed = 1, quick = false, acc = 0, titleT = 0, cardTimer = 0, camFocus = null, userCam = false, chapSel = 0, backTo = 'menu';
var navIdx = 0;
function screen(id) {
  ['begin', 'titleText', 'menu', 'chapters', 'legacy', 'settings', 'howto', 'credits', 'research', 'pause', 'end'].forEach(function (s) { $(s).classList.toggle('show', s === id); });
  navIdx = 0; setTimeout(function () { focusNav(0); }, 0);
}
function setState(s) { prevState = state; state = s; var game = s === 'game' || s === 'research' || s === 'pause' || s === 'end';
  document.body.classList.toggle('ingame', game);
  ['hud', 'tools', 'panel'].forEach(function (id) { $(id).classList.toggle('hide', !game || s === 'end'); });
  $('launch').classList.toggle('hide', !(s === 'game' && sim && sim.mode === 'build'));
  if (s === 'menu') { screen('menu'); buildMenu(); }
  else if (s === 'game') screen(null);
  else if (['chapters', 'legacy', 'settings', 'howto', 'credits', 'research', 'pause', 'end'].indexOf(s) >= 0) screen(s);
}

/* ---------------- toasts & cards ---------------- */
function toast(msg, cls) { var d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.textContent = msg; $('toasts').appendChild(d); while ($('toasts').children.length > 4) $('toasts').removeChild($('toasts').firstChild); setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 3300); }
function card(a, b, c, boss) { $('c1').textContent = a; $('c2').textContent = b; $('c3').textContent = c || ''; var el = $('card'); el.className = ''; void el.offsetWidth; el.className = 'on' + (boss ? ' boss' : ''); cardTimer = 6; }

/* ---------------- menus ---------------- */
function mkBtn(label, sub, fn, dis) { var b = document.createElement('button'); b.innerHTML = label + (sub ? '<small>' + sub + '</small>' : ''); b.setAttribute('data-nav', ''); if (dis) b.disabled = true; b.onclick = function () { AU.sfxEvent({ k: 'ui' }); fn(); }; return b; }
function buildMenu() {
  var l = $('mlist'); l.innerHTML = '';
  if (save.run) { var r = save.run, nm = r.sector === 'endless' ? 'ENDLESS NIGHT' : 'CHAPTER ' + ROMAN[r.sector]; l.appendChild(mkBtn('CONTINUE', nm + ' · WAVE ' + (r.w + 1) + ' · ' + D.DIFF[r.diff].name, function () { startGame(null, null, r); })); }
  l.appendChild(mkBtn('CAMPAIGN', totalStars() + ' / 36 ★', function () { chapSel = Math.min(save.unlocked, 11); setState('chapters'); buildChapters(); }));
  l.appendChild(mkBtn('ENDLESS NIGHT', endlessOpen() ? 'BEST: WAVE ' + save.endlessBest : 'COMPLETE CHAPTER III', function () { startGame('endless', save.diff); }, !endlessOpen()));
  l.appendChild(mkBtn('LEGACY', (totalStars() - spentStars()) + ' ★ TO SPEND', function () { setState('legacy'); buildLegacy(); }));
  l.appendChild(mkBtn('HOW TO PLAY', '', function () { backTo = 'menu'; setState('howto'); buildHow(); }));
  l.appendChild(mkBtn('SETTINGS', '', function () { backTo = 'menu'; setState('settings'); buildSettings(); }));
  l.appendChild(mkBtn('CREDITS', 'MUSIC', function () { backTo = 'menu'; setState('credits'); buildCredits(); }));
  $('mfoot').innerHTML = 'MOUSE · TOUCH · KEYBOARD · GAMEPAD &nbsp;&nbsp; SPACE launches the wave · ENTER fires the super-weapon';
  MS.screen('title');
}
function buildChapters() {
  var dl = $('diffs'); dl.innerHTML = '';
  Object.keys(D.DIFF).forEach(function (id) { var b = document.createElement('button'); b.textContent = D.DIFF[id].name; b.setAttribute('data-nav', ''); b.className = save.diff === id ? 'on' : ''; b.onclick = function () { save.diff = id; persist(); AU.sfxEvent({ k: 'ui' }); buildChapters(); }; dl.appendChild(b); });
  var g = $('chgrid'); g.innerHTML = '';
  D.SECTORS.forEach(function (s, i) {
    var b = document.createElement('button'), lock = i > save.unlocked, st = (save.stars[i] || {})[save.diff] || 0;
    b.className = 'ch' + (lock ? ' locked' : '') + (i === chapSel ? ' sel' : ''); b.setAttribute('data-nav', '');
    b.innerHTML = '<div class="n">' + ROMAN[i] + '</div><div>' + (lock ? 'LOCKED' : s.waves + ' WAVES') + '</div><div class="st">' + (lock ? '' : '★★★'.slice(0, st) + '<span style="opacity:.2">' + '★★★'.slice(st) + '</span>') + '</div>';
    b.onclick = function () { if (lock) { AU.sfxEvent({ k: 'deny' }); return; } if (chapSel === i) { $('chGo').click(); return; } chapSel = i; AU.sfxEvent({ k: 'ui', m: 81 }); buildChapters(); focusEl(b); };
    b.onmouseenter = function () { showChInfo(i); };
    g.appendChild(b);
  });
  showChInfo(chapSel);
  $('chGo').onclick = function () { if (chapSel > save.unlocked) return; AU.sfxEvent({ k: 'ui' }); startGame(chapSel, save.diff); };
}
function showChInfo(i) { var s = D.SECTORS[i], lock = i > save.unlocked; $('chinfo').innerHTML = lock ? '<b>CHAPTER ' + ROMAN[i] + '</b>Complete the previous chapter to continue the odyssey.' : '<b>' + s.sub + ' · ' + s.title + '</b>' + s.story + (s.boss ? '<br><span style="color:#ffb0a0">Something enormous approaches.</span>' : ''); }
function buildLegacy() {
  var free = totalStars() - spentStars(); $('legStars').textContent = totalStars() + ' ★ EARNED · ' + free + ' ★ TO SPEND';
  var l = $('leglist'); l.innerHTML = '';
  D.PERKS.forEach(function (p) {
    var r = save.perks[p.id] || 0, d = document.createElement('div'); d.className = 'perk';
    d.innerHTML = '<b>' + p.name.toUpperCase() + '</b><div class="pips">' + '◆'.repeat(r) + '<span style="opacity:.25">' + '◇'.repeat(p.max - r) + '</span></div>' + p.txt;
    var b = document.createElement('button'); b.className = 'ghost'; b.setAttribute('data-nav', '');
    if (r >= p.max) { b.textContent = 'MASTERED'; b.disabled = true; } else { b.textContent = 'ACQUIRE · ' + p.cost[r] + ' ★'; b.disabled = free < p.cost[r]; b.onclick = function () { save.perks[p.id] = r + 1; persist(); AU.sfxEvent({ k: 'research' }); buildLegacy(); }; }
    d.appendChild(b); l.appendChild(d);
  });
}
function buildSettings() {
  [['vMaster', 'master'], ['vMusic', 'music'], ['vSfx', 'sfx']].forEach(function (p) { var el = $(p[0]); el.value = save.set[p[1]]; el.setAttribute('data-nav', ''); el.oninput = function () { save.set[p[1]] = +el.value; applySettings(); persist(); }; el.onchange = function () { AU.sfxEvent({ k: 'ui' }); }; });
  [['sQual', 'qual'], ['sPaths', 'paths'], ['sLabels', 'labels'], ['sMusic', 'mus']].forEach(function (p) { var el = $(p[0]); el.value = save.set[p[1]]; el.setAttribute('data-nav', ''); el.onchange = function () { save.set[p[1]] = el.value; applySettings(); persist(); }; });
  $('musNext').setAttribute('data-nav', ''); $('musNext').onclick = function () { musicNext(); this.blur(); };
  $('resetSave').onclick = function () { if (!confirm('Erase all chapters, stars and legacy?')) return; var st = save.set; save = defSave(); save.set = st; persist(); toast('PROGRESS ERASED'); };
}
function buildCredits() {
  var T = window.HPAudio.TRACKS;
  $('credtxt').innerHTML = '<b>MUSIC</b> — real performances, freely licensed. Thank you to the musicians.<br><br>' + Object.keys(T).map(function (k) { var t = T[k];
    return '<b>' + t.t + '</b> · ' + t.c + '<br>Performed by ' + t.p + ' · <i>' + t.l + '</i>' + (t.l.indexOf('CC') === 0 ? ' (creativecommons.org/licenses/by/3.0) — via Wikimedia Commons, “Ride of the Valkyries.ogg”; recording trimmed and re-encoded' : ' — via Wikimedia Commons');
  }).join('<br><br>') + '<br><br>Full sources in <i>music/CREDITS.md</i>. If the recordings cannot play, an original synthesized score takes over.<br><br><b>GAME</b> — design, code, art and sound effects made for the Behram Arcade. All sound effects are synthesized live.';
}
function musicToggle() { save.set.mus = save.set.mus === '0' ? '1' : '0'; persist(); applySettings(); toast(save.set.mus === '0' ? 'MUSIC MUTED · M' : 'MUSIC ON · M'); if ($('sMusic')) $('sMusic').value = save.set.mus; }
/* skip to the next piece; also the cure-all if the music has stopped (fresh audio elements, context resumed) */
function musicNext() { if (save.set.mus === '0') { musicToggle(); return; } AU.restartMusic(true); toast('♪ NEXT PIECE · N'); }
var blockedToastT = 0; AU.onBlocked = function () { var n = Date.now(); if (n - blockedToastT < 15000) return; blockedToastT = n; toast('SOUND PAUSED BY THE DEVICE · TAP TO RESUME'); };
AU.onTrack = function (t) { var el = $('nowPlaying'); el.innerHTML = '♪ <b>' + t.t + '</b> — ' + t.c + '<small>' + t.p + '</small>'; el.className = ''; void el.offsetWidth; el.className = 'on'; };
function buildHow() {
  $('howtxt').innerHTML = [
    '<b>EARTH IS THE BASE.</b> Invaders cross the heliopause and spiral toward Earth along named approach vectors. Every ship that reaches Earth costs integrity. Lose it all and the odyssey ends.',
    '<b>THE PLANETS MOVE.</b> Structures ride their worlds. Between waves the system is still and you see the projected approach paths; during a wave everything orbits, so coverage shifts. Inner worlds are fast, outer worlds slow.',
    '<b>BUILD.</b> Select a ◇ site (click, tap, arrows or d-pad). Earth orbit, the Moon, Venus, Mars and the Lagrange points are open from the start; Mercury and the asteroid belt, the Jovian and Saturnian moons, and the ice giants need propulsion research. Orange dots mark economy-only sites.',
    '<b>THREE RESOURCES.</b> <i>Metals</i> build and upgrade (mines produce them during waves). <i>Energy</i> is a grid: every tower draws power; if use exceeds capacity, all towers slow down. Solar arrays generate far more close to the Sun. <i>Science</i> buys research; stations on the ocean moons are best.',
    '<b>RESEARCH</b> unlocks lasers, gravity wells, EMP, the solar lance, shields, carriers, radar, propulsion to the outer worlds, a doctrine and a super-weapon (choose one of each). Xenobiology needs specimens: kill enough of a species first. Open the tree with R: arrows lead from each prerequisite, amber OR lines mark either-or choices, and you can drag, pinch or use + / − to zoom.',
    '<b>UPGRADES.</b> Each structure has three levels, then a branching fourth: choose A or B. Read the invaders: lasers melt shields but bounce off Prisms; slugs crack Dreadnought armour; splash clears swarms; radar reveals Phantoms; Menders must die first.',
    '<b>SUPER-WEAPON.</b> Charges with time and kills. Press ENTER (gamepad Y) during a wave.',
    '<b>KEYBOARD</b> Space launch wave / quick pause · Enter super-weapon · arrows / Tab select site · 1–9 build or choose · U upgrade · A / B branch · X sell · T targeting · R research · F speed · H recentre · M music on / off · N next music piece (restarts music if it stopped) · + / − zoom · Esc pause',
    '<b>MOUSE &amp; TOUCH</b> click / tap to select · drag to pan · wheel / pinch to zoom',
    '<b>GAMEPAD</b> stick / d-pad select site · LB / RB choose option · A confirm · B back · X launch wave · Y super-weapon · right stick pan · LT / RT zoom · Start pause · Select research'
  ].map(function (p) { return '<p>' + p + '</p>'; }).join('');
}

/* ---------------- game lifecycle ---------------- */
function startGame(sector, diff, run) {
  AU.init();
  sim = run ? Sim.load(run, true) : new Sim({ sector: sector, diff: diff, perks: save.perks });
  ui = { sel: null, hover: null, previewType: null, ghost: sim.ghostPaths(), opts: [], optFocus: -1, sellArm: 0 };
  speed = 1; quick = false; acc = 0; userCam = false; camFocus = null; R.parts.length = 0; R.beams.length = 0; R.rings.length = 0; R.home(true); R.letterbox = 1;
  setState('game'); var s = sim.sector;
  card(s.sub + (run ? ' · WAVE ' + (sim.w + 1) : ''), s.title, run ? '' : s.story);
  AU.setMode('build'); MS.screen('play'); MS.event('start');
  if (!run) saveRun();
  panelDirty = true; $('bSpeed').textContent = '1×';
  if (sim.sectorIdx === 0 && sim.w === 0 && !run) setTimeout(function () { if (sim && sim.w === 0 && !Object.keys(sim.structs).length) toast('SELECT A ◇ SITE NEAR EARTH AND BUILD A RAILGUN', 'good'); }, 6500);
}
function saveRun() { if (!sim || sim.mode !== 'build') return; save.run = sim.serialize(); persist(); }
function endGame(won) {
  var s = sim, si = s.sectorIdx, st = s.stars();
  save.run = null;
  if (won && si >= 0) { save.stars[si] = save.stars[si] || {}; save.stars[si][s.diffId] = Math.max(save.stars[si][s.diffId] || 0, st); save.unlocked = Math.max(save.unlocked, Math.min(11, si + 1)); if (si === 11) save.unlocked = 12; }
  if (si < 0) save.endlessBest = Math.max(save.endlessBest, s.w);
  persist();
  setTimeout(function () {
    setState('end');
    $('eTitle').textContent = won ? (si === 11 ? 'BEYOND THE INFINITE' : 'THE EARTH ENDURES') : 'SILENCE';
    $('eSub').textContent = si < 0 ? 'ENDLESS NIGHT · ' + s.w + ' WAVES HELD' + (s.w >= save.endlessBest ? ' · NEW RECORD' : '') : s.sector.sub + ' · ' + s.sector.title + ' · ' + s.diff.name;
    $('eStars').innerHTML = won ? '★★★'.slice(0, st) + '<span class="off">' + '★★★'.slice(st) + '</span>' : '';
    $('eStats').innerHTML = 'SCORE ' + s.score.toLocaleString() + '<br>INVADERS DESTROYED ' + s.stats.kills + ' · LEAKED ' + s.stats.leaked + ' · STRUCTURES BUILT ' + s.stats.built + '<br>EARTH INTEGRITY ' + Math.round(s.earthHp) + ' / ' + s.earthMax + (won && si === 11 ? '<br><br>The Choir is gone. Something remains: a single black slab, waiting, as it always has.' : '');
    var l = $('elist'); l.innerHTML = '';
    if (won && si >= 0 && si < 11) l.appendChild(mkBtn('NEXT CHAPTER', D.SECTORS[si + 1].title, function () { startGame(si + 1, s.diffId); }));
    if (won && si === 11 && endlessOpen()) l.appendChild(mkBtn('ENDLESS NIGHT', '', function () { startGame('endless', s.diffId); }));
    l.appendChild(mkBtn(won ? 'REPLAY' : 'TRY AGAIN', '', function () { startGame(si < 0 ? 'endless' : si, s.diffId); }));
    l.appendChild(mkBtn('CHAPTERS', '', function () { sim = null; chapSel = Math.min(save.unlocked, 11); setState('chapters'); buildChapters(); AU.setMode('menu'); }));
    l.appendChild(mkBtn('MAIN MENU', '', function () { toMenu(); }));
    MS.screen('game-over');
  }, won ? 2600 : 2200);
  AU.setMode(won ? 'victory' : 'defeat'); MS.event(won ? 'win' : 'lose');
}
function toMenu() { sim = null; setState('menu'); AU.setMode('menu'); }
function openPause() { if (state !== 'game') return; setState('pause'); var l = $('plist'); l.innerHTML = '';
  l.appendChild(mkBtn('RESUME', '', resume));
  l.appendChild(mkBtn('RESTART CHAPTER', '', function () { var si = sim.sectorIdx; startGame(si < 0 ? 'endless' : si, sim.diffId); }));
  l.appendChild(mkBtn('HOW TO PLAY', '', function () { backTo = 'pause'; setState('howto'); buildHow(); }));
  l.appendChild(mkBtn('SETTINGS', '', function () { backTo = 'pause'; setState('settings'); buildSettings(); }));
  l.appendChild(mkBtn('NEXT MUSIC PIECE', 'restarts the music if it stopped · N', function () { musicNext(); }));
  l.appendChild(mkBtn('SAVE &amp; QUIT', sim.mode === 'wave' ? 'resumes from the start of this wave' : '', function () { toMenu(); }));
}
function resume() { setState('game'); }
function back() { AU.sfxEvent({ k: 'ui', m: 74 }); if (state === 'research') { setState('game'); return; }
  if (state === 'howto' || state === 'settings' || state === 'credits') { if (backTo === 'pause') { setState('pause'); openPause(); } else setState('menu'); return; }
  if (state === 'pause') { resume(); return; }
  if (state === 'chapters' || state === 'legacy') setState('menu'); }
document.querySelectorAll('[data-back]').forEach(function (b) { b.setAttribute('data-nav', ''); b.onclick = back; });
$('chGo').setAttribute('data-nav', ''); $('rsClose').onclick = function () { setState('game'); };

/* ---------------- game actions ---------------- */
function launch() { if (!sim || sim.mode !== 'build') return; if (sim.startWave()) { ui.sellArm = 0; panelDirty = true; $('launch').classList.add('hide'); var b = sim.cur.boss; AU.setMode(b ? 'boss' : 'wave', intensity()); if (b) R.letterbox = 1; } }
function fireSuper() { if (!sim) return; if (sim.fireSuper()) MS.event('big'); else { AU.sfxEvent({ k: 'deny' }); if (sim.mode === 'wave') toast('SUPER-WEAPON CHARGING · ' + Math.floor(sim.superCharge) + '%'); } }
function cycleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('bSpeed').textContent = speed + '×'; AU.sfxEvent({ k: 'ui' }); }
function intensity() { if (!sim) return 0; var sec = sim.sector, f = sec.endless ? Math.min(1, sim.w / 30) : (sim.w + 1) / sec.waves; return Math.min(1, 0.15 + 0.6 * f + sim.aliens.length / 140); }
function doAct(act, arg) {
  if (!sim) return; var sid = ui.sel, ok = false;
  if (act === 'build') { ok = sim.build(sid, arg); if (!ok) why(sid, arg); else { ui.previewType = null; if (T[arg].cls === 'eco' && sim.sectorIdx === 0 && sim.w < 2) toast(arg === 'mine' ? 'MINES EARN METALS WHILE A WAVE IS UNDER WAY' : arg === 'solar' ? 'THE GRID CAN NOW POWER MORE TOWERS' : 'SCIENCE FLOWS DURING WAVES'); } }
  else if (act === 'up') { ok = sim.upgrade(sid); if (!ok) { AU.sfxEvent({ k: 'deny' }); toast('NOT ENOUGH METALS', 'bad'); } }
  else if (act === 'br') { ok = sim.upgrade(sid, arg); if (!ok) { AU.sfxEvent({ k: 'deny' }); toast('NOT ENOUGH METALS', 'bad'); } }
  else if (act === 'sell') { if (ui.sellArm > 0) { ok = sim.sell(sid); ui.sellArm = 0; } else { ui.sellArm = 3; AU.sfxEvent({ k: 'ui', m: 79 }); } }
  else if (act === 'prio') { var st = sim.structs[sid]; if (st) { var P = ['first', 'strong', 'near']; sim.setPrio(sid, P[(P.indexOf(st.prio) + 1) % 3]); AU.sfxEvent({ k: 'ui' }); } }
  else if (act === 'research') { openResearch(arg); }
  panelDirty = true; if (ok && sim.mode === 'build') saveRun();
}
function why(sid, type) {
  AU.sfxEvent({ k: 'deny' }); var d = T[type];
  if (!sim.towerUnlocked(type)) toast('REQUIRES RESEARCH: ' + D.RES[d.req].name.toUpperCase(), 'bad');
  else if (sim.metals < sim.buildCost(type)) toast('NOT ENOUGH METALS', 'bad');
}

/* ---------------- research: a visual technology tree ---------------- */
var resFocus = null, TL = null, rScale = 0, rConfirm = null;
var ST_TXT = { done: 'RESEARCHED', locked: 'NOT IN THIS CHAPTER', excluded: '✕ LOCKED OUT', prereq: '', specimen: '', ready: '', poor: '' };
function openResearch(focus) { if (!sim || (state !== 'game')) return; resFocus = focus || null; rConfirm = null; setState('research'); buildResearch(true); AU.sfxEvent({ k: 'ui', m: 81 }); }
function resStatus(r, st) {
  if (st === 'ready') return '✦ ' + r.cost + ' · READY';
  if (st === 'poor') return '✦ ' + r.cost + ' · NEED ' + Math.ceil(r.cost - sim.science) + ' MORE';
  if (st === 'prereq') return '🔒 NEEDS ' + (r.req || []).filter(function (q) { return !sim.research[q]; }).map(function (q) { return D.RES[q].name.toUpperCase(); }).join(' + ');
  if (st === 'specimen') return '◉ ' + Object.keys(r.spec).map(function (s) { return s === 'boss' ? 'DEFEAT A BOSS' : Math.min(sim.kills[s] || 0, r.spec[s]) + '/' + r.spec[s] + ' ' + A[s].name; }).join(', ');
  return ST_TXT[st] || '';
}
function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
function buildResearch(first) {
  if (!TL) TL = window.HPTree.layout();
  var L = TL, plane = $('rplane'); $('rsSci').textContent = '✦ ' + Math.floor(sim.science) + ' SCIENCE';
  plane.innerHTML = ''; plane.style.width = L.W + 'px'; plane.style.height = L.H + 'px';
  L.lanes.forEach(function (ln) { var d = document.createElement('div'); d.className = 'rlane'; d.style.cssText = 'left:' + ln.x + 'px;top:' + ln.y + 'px;width:' + ln.w + 'px;height:' + ln.h + 'px';
    d.innerHTML = '<span class="lt">' + ln.title + '</span>' + (ln.note ? '<span class="ln ' + (ln.cat === 'B' ? 'spec' : 'or') + '">' + (ln.cat === 'B' ? '◉ ' : '◆ ') + ln.note + '</span>' : ''); plane.appendChild(d); });
  var svg = svgEl('svg', { class: 'redges', width: L.W, height: L.H, viewBox: '0 0 ' + L.W + ' ' + L.H }), defs = svgEl('defs', {});
  [['done', '#9fffc8'], ['open', '#9cc8ff'], ['shut', 'rgba(200,210,235,.35)']].forEach(function (m) { var mk = svgEl('marker', { id: 'ar-' + m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }); mk.appendChild(svgEl('path', { d: 'M0,1 L10,5 L0,9 z', fill: m[1] })); defs.appendChild(mk); });
  svg.appendChild(defs);
  L.edges.forEach(function (e) { var a = L.nodes[e.from], b = L.nodes[e.to]; if (!a || !b) return;
    var x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x - 2, y2 = b.y + b.h / 2, mx = (x1 + x2) / 2;
    var cls = sim.research[e.to] ? 'done' : sim.research[e.from] ? 'open' : 'shut';
    svg.appendChild(svgEl('path', { d: 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2, class: 'ed ' + cls + (e.cross ? ' cross' : ''), 'marker-end': 'url(#ar-' + cls + ')', 'data-from': e.from, 'data-to': e.to })); });
  L.excl.forEach(function (e) { var a = L.nodes[e.a], b = L.nodes[e.b], y = a.y + a.h / 2, x1 = a.x + a.w + 4, x2 = b.x - 4, chosen = sim.research[e.a] ? e.a : sim.research[e.b] ? e.b : null;
    svg.appendChild(svgEl('path', { d: 'M' + x1 + ',' + y + ' L' + x2 + ',' + y, class: 'ex' + (chosen ? ' chosen' : '') }));
    var pill = document.createElement('div'); pill.className = 'ror' + (chosen ? ' chosen' : ''); pill.style.left = ((x1 + x2) / 2) + 'px'; pill.style.top = y + 'px';
    pill.innerHTML = '<b>OR</b><small>' + (chosen ? D.RES[chosen].name.replace(/^Doctrine: /, '').toUpperCase() + ' CHOSEN' : 'ONLY ONE') + '</small>'; plane.appendChild(pill); });
  plane.appendChild(svg);
  D.RESEARCH.forEach(function (r) { var n = L.nodes[r.id]; if (!n) return;
    var st = sim.researchState(r.id), b = document.createElement('button'); b.className = 'rn ' + st + (r.excl ? ' xor' : '') + (r.spec ? ' bio' : '');
    b.style.cssText = 'left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px';
    b.setAttribute('data-nav', ''); b.setAttribute('data-id', r.id);
    b.innerHTML = '<span class="nm">' + r.name.replace(/^Doctrine: /, '') + '</span><span class="c">' + resStatus(r, st) + '</span>' + (st === 'done' ? '<i class="bd ok">✓</i>' : st === 'excluded' ? '<i class="bd no">✕</i>' : r.excl ? '<i class="bd or" title="Mutually exclusive">◆</i>' : '');
    b.onmouseenter = b.onfocus = function () { resInfo(r.id); hiEdges(r.id); };
    b.onclick = function () { tryResearch(r.id); };
    plane.appendChild(b); });
  legend();
  if (first) { fitTree(true); var g = $('rtree'); g.scrollLeft = 0; g.scrollTop = 0; }
  var f = resFocus && plane.querySelector('[data-id="' + resFocus + '"]');
  if (f) setTimeout(function () { focusEl(f); }, 0); else if (first) resInfo(null);
}
function tryResearch(id) {
  var r = D.RES[id], st = sim.researchState(id), riv = window.HPTree.rivals(id);
  if (st === 'ready' && riv.length && rConfirm !== id) { rConfirm = id; resInfo(id); AU.sfxEvent({ k: 'ui', m: 79 }); return; }
  rConfirm = null;
  if (sim.doResearch(id)) { panelDirty = true; saveRun(); toast('RESEARCH COMPLETE · ' + r.name.toUpperCase(), 'good'); resFocus = id; buildResearch(false); resInfo(id); }
  else { AU.sfxEvent({ k: 'deny' }); resInfo(id); }
}
function hiEdges(id) { document.querySelectorAll('#rplane .ed').forEach(function (p) { p.classList.toggle('hi', p.getAttribute('data-from') === id || p.getAttribute('data-to') === id); }); }
function legend() {
  $('rlegend').innerHTML = [['done', '✓ RESEARCHED'], ['ready', 'AVAILABLE'], ['poor', 'NEED SCIENCE'], ['prereq', '🔒 NEEDS PREREQUISITE'], ['specimen', '◉ NEEDS SPECIMENS'], ['xor', '◆ CHOOSE ONE OF TWO'], ['excluded', '✕ LOCKED OUT']]
    .map(function (x) { return '<span class="lg ' + x[0] + '"><i></i>' + x[1] + '</span>'; }).join('');
}
function resInfo(id) {
  if (!id) { $('rinfo').innerHTML = 'Arrows show what each project unlocks. Research is permanent for this chapter. <b class="orc">◆</b> Doctrine and Super-weapon are <b class="orc">either / or</b>: choosing one locks out its rival.<br><span class="kh">ARROWS / D-PAD move · SPACE / ENTER / A research · + / − / LT / RT zoom · drag or swipe to pan · R / ESC / B close</span>'; return; }
  var r = D.RES[id], st = sim.researchState(id), T2 = window.HPTree, riv = T2.rivals(id), nx = T2.leadsTo(id);
  var why = { done: 'Researched.', locked: 'Not available in this chapter.', excluded: 'Locked out: you chose <b class="orc">' + riv.filter(function (q) { return sim.research[q]; }).map(function (q) { return D.RES[q].name; }).join('') + '</b> instead.', prereq: 'Research its prerequisite first.', poor: 'Needs ' + r.cost + ' science (you have ' + Math.floor(sim.science) + ').', ready: 'Ready — click, tap, Space or A to research for ✦ ' + r.cost + '.' }[st];
  if (st === 'specimen') why = 'Needs specimens: ' + Object.keys(r.spec).map(function (s) { return s === 'boss' ? 'defeat a boss' : (sim.kills[s] || 0) + ' / ' + r.spec[s] + ' ' + A[s].name + ' destroyed'; }).join(', ') + '.';
  var h = '<b>' + r.name.toUpperCase() + '</b> — ' + r.txt + '<br>' + why;
  if (r.req) h += ' <span class="dim">Requires ' + r.req.map(function (q) { return D.RES[q].name + (sim.research[q] ? ' ✓' : ''); }).join(', ') + '.</span>';
  if (nx.length) h += ' <span class="dim">Leads to ' + nx.map(function (q) { return D.RES[q].name; }).join(', ') + '.</span>';
  if (riv.length && st !== 'excluded' && st !== 'done') h += '<br><b class="orc">◆ EITHER / OR</b> — choosing this permanently locks out <b class="orc">' + riv.map(function (q) { return D.RES[q].name; }).join(', ') + '</b> for this chapter.' + (rConfirm === id ? ' <b class="cf">PRESS AGAIN TO CONFIRM</b>' : '');
  if (riv.length && st === 'done') h += '<br><span class="dim">You chose this over ' + riv.map(function (q) { return D.RES[q].name; }).join(', ') + '.</span>';
  $('rinfo').innerHTML = h;
}
function setTreeScale(s, ax, ay) {
  var g = $('rtree'), L = TL; s = Math.max(0.35, Math.min(1.6, s)); if (ax === undefined) { ax = g.clientWidth / 2; ay = g.clientHeight / 2; }
  var old = rScale || s, px = (g.scrollLeft + ax) / old, py = (g.scrollTop + ay) / old;
  rScale = s; $('rplane').style.transform = 'scale(' + s + ')'; $('rsize').style.width = Math.ceil(L.W * s) + 'px'; $('rsize').style.height = Math.ceil(L.H * s) + 'px';
  g.scrollLeft = px * s - ax; g.scrollTop = py * s - ay;
}
function fitTree(initial) {
  var g = $('rtree'), L = TL, fw = g.clientWidth / L.W, fh = g.clientHeight / L.H;
  // first open: fill the width (legible on phones; pan vertically). FIT button: show everything.
  setTreeScale(initial ? Math.min(1.25, Math.max(0.62, fw)) : Math.min(fw, fh));
}
function treeMove(dx, dy) {
  var a = document.activeElement, id = a && a.getAttribute && a.getAttribute('data-id');
  if (!id) { focusNav(0); return; }
  var to = window.HPTree.nav(TL, id, dx, dy), el = $('rplane').querySelector('[data-id="' + to + '"]'); if (el) { focusEl(el); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
(function () {
  var g = $('rtree'), pin = null, drag = null;
  g.addEventListener('touchstart', function (e) { if (e.touches.length === 2) { var a = e.touches[0], b = e.touches[1], r = g.getBoundingClientRect(); pin = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: rScale, x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top }; } }, { passive: true });
  g.addEventListener('touchmove', function (e) { if (pin && e.touches.length === 2) { e.preventDefault(); var a = e.touches[0], b = e.touches[1]; setTreeScale(pin.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pin.d, pin.x, pin.y); } }, { passive: false });
  g.addEventListener('touchend', function (e) { if (e.touches.length < 2) pin = null; });
  g.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) { e.preventDefault(); var r = g.getBoundingClientRect(); setTreeScale(rScale * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); } }, { passive: false });
  g.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.rn')) return; drag = { x: e.clientX, y: e.clientY, sl: g.scrollLeft, st: g.scrollTop }; g.classList.add('grab'); });
  window.addEventListener('pointermove', function (e) { if (!drag) return; g.scrollLeft = drag.sl - (e.clientX - drag.x); g.scrollTop = drag.st - (e.clientY - drag.y); });
  window.addEventListener('pointerup', function () { drag = null; g.classList.remove('grab'); });
  $('rzIn').onclick = function () { setTreeScale(rScale * 1.2); }; $('rzOut').onclick = function () { setTreeScale(rScale / 1.2); }; $('rzFit').onclick = function () { fitTree(false); };
  window.addEventListener('resize', function () { if (state === 'research') fitTree(true); });
})();

/* ---------------- side panel ---------------- */
var panelDirty = true, panelHtml = '', panelT = 0;
function esc(s) { return String(s); }
function stat(k, v) { return '<span>' + k + '</span><span>' + v + '</span>'; }
function renderPanel() {
  if (!sim) return; var h = '', opts = [], s = sim, sid = ui.sel;
  var opt = function (act, arg, inner, cls, title) { opts.push({ act: act, arg: arg }); var i = opts.length - 1; return '<button class="opt ' + (cls || '') + (i === ui.optFocus ? ' focus' : '') + '" data-i="' + i + '"' + (title ? ' title="' + title + '"' : '') + '><span class="k">' + (i < 9 ? i + 1 : '') + '</span>' + inner + '</button>'; };
  if (sid) {
    var site = D.SITE[sid], stc = s.structs[sid];
    h += '<h3>' + site.name + '</h3>';
    if (stc) {
      var d = T[stc.type], st = s.towerStats(stc), u = s.upgradeInfo(sid);
      h += '<div class="sub">' + (stc.br ? d.br[stc.br].name : d.name) + ' &nbsp;<span class="pips">' + '◆'.repeat(stc.lv + 1 + (stc.br ? 1 : 0)) + '</span></div>';
      h += '<p>' + (stc.br ? d.br[stc.br].blurb : d.blurb) + '</p><div class="stats">';
      if (st.dmg) h += stat('DAMAGE', Math.round(st.dmg) + (st.n ? ' × ' + st.n : ''));
      if (st.dps) h += stat('DAMAGE/S', Math.round(st.dps) + (stc.type === 'lance' ? ' × sun ' + Sim.sunFactor(s.sitePos(sid).x, s.sitePos(sid).y).toFixed(1) : ''));
      if (st.rate) h += stat('RATE', st.rate + '/s');
      if (st.rng) h += stat('RANGE', st.rng);
      if (st.slow) h += stat('SLOW', Math.round(st.slow * 100) + '%');
      if (st.sh) h += stat('SHIELD', st.sh);
      if (st.y) h += stat('METALS/S', (st.y * ((site.y || {}).M || 1)).toFixed(2));
      if (st.s) h += stat('SCIENCE/S', (st.s * ((site.y || {}).L || 1)).toFixed(2));
      if (st.e) h += stat('ENERGY', '+' + (st.e * Sim.sunFactor(s.sitePos(sid).x, s.sitePos(sid).y)).toFixed(1));
      h += stat('POWER', d.pw ? '−' + d.pw : '0') + stat('HULL', Math.round(stc.hp) + ' / ' + stc.hpMax) + '</div>';
      if (u && u.kind === 'lv') h += opt('up', null, '<span class="nm">UPGRADE TO LEVEL ' + (stc.lv + 2) + ' <small style="opacity:.5">U</small></span><span class="c">◆ ' + u.cost + '</span>', s.metals < u.cost ? 'no' : '');
      else if (u && u.kind === 'br') ['A', 'B'].forEach(function (b) { var bb = d.br[b]; h += opt('br', b, '<span class="nm">' + b + ' · ' + bb.name + ' <span class="c">◆ ' + u[b] + '</span><span class="why">' + bb.blurb + '</span></span>', 'br' + (s.metals < u[b] ? ' no' : '')); });
      else h += '<p style="color:#ffd9a0">FULLY DEVELOPED</p>';
      if (d.cls !== 'eco' && stc.type !== 'aegis' && stc.type !== 'radar') h += opt('prio', null, '<span class="nm">TARGET: ' + { first: 'CLOSEST TO EARTH', strong: 'STRONGEST', near: 'NEAREST' }[stc.prio] + ' <small style="opacity:.5">T</small></span>');
      h += opt('sell', null, '<span class="nm">' + (ui.sellArm > 0 ? 'CONFIRM — SELL' : 'DECOMMISSION') + ' <small style="opacity:.5">X</small></span><span class="c">+◆ ' + s.sellValue(sid) + '</span>', ui.sellArm > 0 ? 'focus' : '');
    } else if (!s.siteReachable(sid)) {
      var rr = D.RES[site.reach]; h += '<div class="sub">BEYOND OUR REACH</div><p>Requires the research <b>' + rr.name + '</b>.</p>';
      h += opt('research', site.reach, '<span class="nm">OPEN RESEARCH</span><span style="color:#9cf">✦ ' + rr.cost + '</span>');
    } else {
      var kinds = site.kinds, yv = site.y || {};
      h += '<div class="sub">' + (kinds.indexOf('T') >= 0 ? 'WEAPONS' : '') + (kinds.indexOf('M') >= 0 ? ' · MINING ×' + (yv.M || 1) : '') + (kinds.indexOf('S') >= 0 ? ' · SOLAR ×' + Sim.sunFactor(s.sitePos(sid).x, s.sitePos(sid).y).toFixed(1) : '') + (kinds.indexOf('L') >= 0 ? ' · SCIENCE ×' + (yv.L || 1) : '') + '</div>';
      D.TOWER_ORDER.forEach(function (ty) {
        var d = T[ty]; if (kinds.indexOf(d.kind) < 0) return; var unl = s.towerUnlocked(ty), cost = s.buildCost(ty), can = unl && s.metals >= cost;
        if (!unl && s.researchState(d.req) === 'locked') return;
        h += opt('build', ty, '<span class="nm" data-pt="' + ty + '">' + d.name + (unl ? '' : '<span class="why">needs ' + D.RES[d.req].name + '</span>') + '</span>' + (d.pw ? '<span class="pw">⚡︎' + d.pw + '</span>' : '') + '<span class="c">◆ ' + cost + '</span>', can ? '' : 'no', d.blurb);
      });
      if (s.euse >= s.ecap && kinds.indexOf('T') >= 0) h += '<p style="color:#ff9a8a">The grid is at capacity: new towers will slow every tower. Build solar arrays.</p>';
    }
    h += '<p style="opacity:.5;font-size:10px">ESC / B to deselect</p>';
  } else {
    var wv = s.mode === 'wave' ? s.cur : s.preview, left = s.mode === 'wave' ? s.spawnQ.length + s.aliens.length : 0;
    h += '<h3>' + (s.mode === 'wave' ? 'WAVE ' + wv.w + ' UNDER WAY' : 'INCOMING · WAVE ' + wv.w) + '</h3><div class="sub">' + (s.mode === 'wave' ? left + ' CONTACTS REMAIN' : 'HP ×' + wv.hpMul.toFixed(2) + (wv.last ? ' · FINAL WAVE' : '')) + '</div>';
    wv.groups.forEach(function (g) { var a = A[g.type]; h += '<div class="grp"><span class="dot" style="color:' + a.col + ';background:' + a.col + '"></span><span class="nm">' + a.name + (a.boss ? '<span class="tag boss">COLOSSUS</span>' : g.isNew ? '<span class="tag">NEW CONTACT</span>' : '') + '</span><span class="ct">×' + g.n + ' · ' + g.vec + '</span></div>'; if (g.isNew || a.boss) h += '<div class="info">' + a.info + '</div>'; });
    if (s.mode === 'build') {
      var adv = advice(); if (adv) h += '<p style="color:#ffd9a0;margin-top:10px">' + adv + '</p>';
      h += '<p style="opacity:.6;font-size:10.5px">Select a ◇ site to build. Dashed lines are the projected approach paths.</p>';
    }
  }
  ui.opts = opts; if (ui.optFocus >= opts.length) ui.optFocus = opts.length - 1;
  if (h !== panelHtml) { $('pBody').innerHTML = h; panelHtml = h; }
}
function advice() {
  var s = sim, n = 0, eco = 0; for (var k in s.structs) { if (T[s.structs[k].type].cls === 'eco') eco++; else n++; }
  if (!n) return 'Earth has no defences. Build a RAILGUN in Earth orbit or on the Moon.';
  if (s.pf < 1) return 'Grid overloaded (' + s.euse + ' / ' + s.ecap + '): your towers fire at ' + Math.round(s.pf * 100) + '%. Build or upgrade SOLAR ARRAYS — Venus and Mercury are best.';
  var ready = D.RESEARCH.filter(function (r) { return s.researchState(r.id) === 'ready'; }); if (ready.length && s.w >= 1) return ready.length + ' research project' + (ready.length > 1 ? 's' : '') + ' ready. Press R.';
  if (!eco && s.w >= 1) return 'Mines on the Moon and Mars earn metals during waves. Labs earn science.';
  var free = D.SITES.filter(function (x) { return !s.structs[x.id] && s.siteReachable(x.id) && x.kinds.indexOf('T') >= 0; }).length; if (free < 3 && s.researchState('P1') !== 'done') return 'Running out of room. Research ION DRIVES to reach Mercury and the asteroid belt.';
  return '';
}
$('pBody').addEventListener('click', function (e) { var b = e.target.closest('.opt'); if (!b) return; var o = ui.opts[+b.getAttribute('data-i')]; if (o) { ui.optFocus = -1; doAct(o.act, o.arg); } if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
$('pBody').addEventListener('mouseover', function (e) { var b = e.target.closest('.opt'); var o = b && ui.opts[+b.getAttribute('data-i')]; ui.previewType = o && o.act === 'build' ? o.arg : null; });
$('pBody').addEventListener('mouseleave', function () { ui.previewType = null; });
$('pToggle').onclick = function () { $('panel').classList.toggle('closed'); $('pToggle').textContent = $('panel').classList.contains('closed') ? '◂' : '▸'; };
$('launch').onclick = function () { launch(); this.blur(); };
$('bMenu').onclick = function () { openPause(); this.blur(); };
$('bSpeed').onclick = function () { cycleSpeed(); this.blur(); };
$('bRes').onclick = function () { openResearch(); this.blur(); };
$('bMus').onclick = function () { musicToggle(); this.blur(); };
$('bSuper').onclick = function () { fireSuper(); this.blur(); };
$('bCam').onclick = function () { R.home(); userCam = false; this.blur(); };

/* ---------------- HUD ---------------- */
var hudT = 0;
function hud(dt) {
  hudT -= dt; if (hudT > 0 || !sim) return; hudT = 0.1; var s = sim;
  $('eFill').style.width = Math.max(0, s.earthHp / s.earthMax * 100) + '%'; $('sFill').style.width = (s.eshMax ? s.esh / s.earthMax * 100 : 0) + '%';
  $('eNum').textContent = Math.ceil(s.earthHp); document.querySelector('.ebar').classList.toggle('hurt', s.earthHp / s.earthMax < 0.35);
  $('hChap').textContent = s.sector.sub + ' · ' + s.sector.title; $('hWave').textContent = 'WAVE ' + Math.min(s.w + 1, s.sector.waves) + (s.sector.endless ? '' : ' / ' + s.sector.waves) + (quick ? ' · PAUSED' : '');
  var inc = s.income(); $('rM').textContent = Math.floor(s.metals); $('rMr').textContent = '+' + inc.m.toFixed(1) + '/s';
  $('rE').textContent = s.euse + ' / ' + Math.floor(s.ecap); $('rE').parentNode.classList.toggle('warn', s.euse > s.ecap);
  $('rS').textContent = Math.floor(s.science);
  $('supName').textContent = { barrage: 'BARRAGE', sunfire: 'SUNFIRE', collapse: 'COLLAPSE' }[s.superKind()]; $('supFill').style.width = s.superCharge + '%'; $('bSuper').classList.toggle('ready', s.superCharge >= 100 && s.mode === 'wave');
  $('bRes').classList.toggle('ready', D.RESEARCH.some(function (r) { return s.researchState(r.id) === 'ready'; }));
  $('launch').classList.toggle('hide', !(state === 'game' && s.mode === 'build'));
  $('launch').firstChild.textContent = s.w === 0 ? 'LAUNCH FIRST WAVE ' : 'LAUNCH WAVE ' + (s.w + 1) + ' ';
}

/* ---------------- sim events ---------------- */
function siteName(id) { return (D.SITE[id] || {}).name || id; }
function handleEvents() {
  var ev = sim.ev; sim.ev = [];
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i]; R.event(e, sim); AU.sfxEvent(e);
    switch (e.k) {
      case 'waveStart': if (!e.boss) toast('WAVE ' + e.w + ' · CONTACT'); panelDirty = true; break;
      case 'boss': var a = A[e.type]; card('A COLOSSUS APPROACHES', a.name, a.info, true); R.letterbox = 1; MS.event('big');
        var bo = sim.aliens.filter(function (x) { return x.type === e.type; })[0]; if (bo && !userCam) camFocus = { x: (bo.x + sim.bp.earth.x) / 2, y: (bo.y + sim.bp.earth.y) / 2, until: 4.5 }; break;
      case 'phase': card('THE FIRST CHOIR', e.p === 1 ? 'IT SINGS' : 'IT OPENS', e.p === 1 ? 'Phantoms pour from the ring.' : 'Prisms. Our light is turned against us.', true); break;
      case 'waveEnd': toast('WAVE ' + e.w + ' HELD', 'good'); AU.setMode('build'); ui.ghost = sim.ghostPaths(); panelDirty = true; saveRun(); R.letterbox = 0; quick = false;
        if (sim.preview.boss) toast('SOMETHING VAST IS COMING', 'bad'); break;
      case 'raid': toast('RAIDERS STRUCK ' + siteName(e.site), 'bad'); break;
      case 'destroyed': toast(T[e.type].name + ' LOST · ' + siteName(e.site), 'bad'); if (ui.sel === e.site) panelDirty = true; if (e.type === 'solar') toast('THE GRID IS WEAKER', 'bad'); MS.event('hit'); break;
      case 'kill': if (e.boss) { R.letterbox = 0; toast(A[e.type].name + ' DESTROYED', 'good'); MS.event('big'); } break;
      case 'won': endGame(true); break;
      case 'lost': endGame(false); break;
    }
  }
}

/* ---------------- picking ---------------- */
function pickSite(sx, sy, rad) {
  if (!sim) return null; var best = null, bd = rad * rad;
  D.SITES.forEach(function (s) { if (!sim.structs[s.id] && !sim.siteReachable(s.id) && sim.mode !== 'build') return; var p = sim.sitePos(s.id), q = R.toScreen(p.x, p.y), d = (q.x - sx) * (q.x - sx) + (q.y - sy) * (q.y - sy); if (!sim.siteReachable(s.id) && !sim.structs[s.id]) d *= 2.2; if (d < bd) { bd = d; best = s.id; } });
  return best;
}
function select(id) { if (id === ui.sel) return; ui.sel = id; ui.optFocus = -1; ui.sellArm = 0; ui.previewType = null; panelDirty = true; if (id) { AU.sfxEvent({ k: 'ui', m: 88 }); $('panel').classList.remove('closed'); } }
function snapDir(dx, dy) {
  if (!sim) return; var from = ui.sel ? (function () { var p = sim.sitePos(ui.sel); return R.toScreen(p.x, p.y); })() : { x: R.W / 2, y: R.H / 2 }, best = null, bs = 1e9;
  D.SITES.forEach(function (s) { if (s.id === ui.sel) return; if (!sim.structs[s.id] && !sim.siteReachable(s.id) && sim.mode !== 'build') return; var p = sim.sitePos(s.id), q = R.toScreen(p.x, p.y), vx = q.x - from.x, vy = q.y - from.y, d = Math.hypot(vx, vy) || 1, dot = (vx * dx + vy * dy) / d;
    if (dot < 0.35 || q.x < 0 || q.y < 0 || q.x > R.W || q.y > R.H) return; var sc = d * (2.2 - dot * 1.2); if (sc < bs) { bs = sc; best = s.id; } });
  if (best) select(best); else if (!ui.sel) select('eo1');
}
function cycleSite(dir) { var list = D.SITES.filter(function (s) { return sim.structs[s.id] || sim.siteReachable(s.id); }).map(function (s) { return s.id; }); var i = list.indexOf(ui.sel); select(list[(i + dir + list.length) % list.length]); }
function focusOpt(dir) { if (!ui.opts.length) return; ui.optFocus = (ui.optFocus + dir + ui.opts.length) % ui.opts.length; var o = ui.opts[ui.optFocus]; ui.previewType = o.act === 'build' ? o.arg : null; panelDirty = true; AU.sfxEvent({ k: 'ui', m: 93 }); }

/* ---------------- pointer input ---------------- */
var ptrs = {}, drag = null, pinch = null;
cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, type: e.pointerType };
  var ids = Object.keys(ptrs); if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; } else drag = { moved: false };
  if (state === 'begin') begin(); else if (state === 'title') skipTitle(); });
cv.addEventListener('pointermove', function (e) {
  var p = ptrs[e.pointerId];
  if (!p) { if (e.pointerType === 'mouse' && state === 'game' && sim) { var h = pickSite(e.clientX, e.clientY, 16); if (h !== ui.hover) ui.hover = h; cv.style.cursor = h ? 'pointer' : 'default'; } return; }
  var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  var ids = Object.keys(ptrs);
  if (ids.length === 2 && pinch) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch.d > 0) R.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d; userCam = true; return; }
  if (drag && state === 'game') { if (!drag.moved && Math.hypot(p.x - p.x0, p.y - p.y0) > 7) drag.moved = true; if (drag.moved) { R.pan(dx, dy); userCam = true; camFocus = null; } }
});
function ptrUp(e) { var p = ptrs[e.pointerId]; delete ptrs[e.pointerId]; if (!p) return; if (Object.keys(ptrs).length < 2) pinch = null;
  if (drag && !drag.moved && state === 'game' && sim && Object.keys(ptrs).length === 0) { var id = pickSite(e.clientX, e.clientY, p.type === 'touch' ? 28 : 18); select(id); }
  if (!Object.keys(ptrs).length) drag = null; }
cv.addEventListener('pointerup', ptrUp); cv.addEventListener('pointercancel', function (e) { delete ptrs[e.pointerId]; drag = null; pinch = null; });
cv.addEventListener('wheel', function (e) { e.preventDefault(); if (state !== 'game') return; R.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); userCam = true; camFocus = null; }, { passive: false });
document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
$('beginBtn').onclick = function (e) { e.stopPropagation(); begin(); };
$('begin').addEventListener('pointerdown', function () { begin(); });
$('titleText').style.pointerEvents = 'none';

/* ---------------- menu navigation (keyboard / gamepad) ---------------- */
function navItems() { var scr = document.querySelector('.screen.show'); if (!scr) return []; return Array.prototype.filter.call(scr.querySelectorAll('[data-nav]'), function (el) { return !el.disabled && el.offsetParent !== null; }); }
function focusEl(el) { document.querySelectorAll('.focus').forEach(function (x) { if (!x.classList.contains('opt')) x.classList.remove('focus'); }); if (el) { el.classList.add('focus'); if (el.focus) el.focus({ preventScroll: false }); var it = navItems(); navIdx = Math.max(0, it.indexOf(el)); if (state === 'chapters' && el.classList.contains('ch')) { var i = Array.prototype.indexOf.call($('chgrid').children, el); if (i >= 0) showChInfo(i); } } }
function focusNav(d) { var it = navItems(); if (!it.length) return; var cur = it.indexOf(document.activeElement); if (cur < 0) cur = d > 0 ? -1 : d < 0 ? it.length : 0; navIdx = d === 0 ? 0 : (cur + d + it.length) % it.length; if (state === 'research' && d === 0) { var r = it.filter(function (x) { return x.classList.contains('ready'); })[0]; if (r) navIdx = it.indexOf(r); } focusEl(it[navIdx]); }
function activateNav() { var a = document.activeElement; if (a && a.hasAttribute && a.hasAttribute('data-nav') && a.tagName === 'BUTTON') { a.click(); return true; } var it = navItems(); if (it[navIdx]) { it[navIdx].click(); return true; } return false; }
function adjustNav(d) { var a = document.activeElement; if (a && a.type === 'range') { a.value = +a.value + d * 5; a.oninput(); return true; } if (a && a.tagName === 'SELECT') { a.selectedIndex = (a.selectedIndex + (d > 0 ? 1 : a.options.length - 1)) % a.options.length; a.onchange(); return true; } return false; }

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', function (e) {
  var k = e.key, code = e.code;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if ((k === 'm' || k === 'M') && state !== 'begin') { musicToggle(); return; }
  if ((k === 'n' || k === 'N') && state !== 'begin' && state !== 'title') { musicNext(); return; }
  if (state === 'begin') { e.preventDefault(); begin(); return; }
  if (state === 'title') { e.preventDefault(); skipTitle(); return; }
  if (state === 'game') {
    if (code === 'Space' || k === 'Enter' || /^Arrow/.test(k) || k === 'Tab') e.preventDefault();
    if (e.repeat && (code === 'Space' || k === 'Enter')) return;
    if (code === 'Space') { if (sim.mode === 'build') launch(); else if (sim.mode === 'wave') { quick = !quick; AU.sfxEvent({ k: 'ui', m: quick ? 74 : 81 }); toast(quick ? 'PAUSED · SPACE TO RESUME' : 'RESUMED'); } return; }
    if (k === 'Enter') { fireSuper(); return; }
    if (k === 'Escape') { if (ui.sel) select(null); else openPause(); return; }
    if (k === 'p' || k === 'P') { openPause(); return; }
    if (k === 'r' || k === 'R') { openResearch(); return; }
    if (k === 'f' || k === 'F') { cycleSpeed(); return; }
    if (k === 'h' || k === 'H') { R.home(); userCam = false; return; }
    if (k === '+' || k === '=') { R.zoomAt(R.W / 2, R.H / 2, 1.25); userCam = true; return; }
    if (k === '-' || k === '_') { R.zoomAt(R.W / 2, R.H / 2, 0.8); userCam = true; return; }
    if (k === 'ArrowLeft') return snapDir(-1, 0); if (k === 'ArrowRight') return snapDir(1, 0); if (k === 'ArrowUp') return snapDir(0, -1); if (k === 'ArrowDown') return snapDir(0, 1);
    if (k === 'Tab') return cycleSite(e.shiftKey ? -1 : 1);
    if (/^[1-9]$/.test(k) && ui.sel) { var o = ui.opts[+k - 1]; if (o) doAct(o.act, o.arg); return; }
    if (!ui.sel) return; var kk = k.toLowerCase();
    if (kk === 'u') doAct('up'); else if (kk === 'a' || kk === 'b') { var u = sim.upgradeInfo(ui.sel); if (u && u.kind === 'br') doAct('br', kk.toUpperCase()); } else if (kk === 'x') doAct('sell'); else if (kk === 't') doAct('prio');
    return;
  }
  // menus & overlays
  if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); if (state === 'end') toMenu(); else back(); return; }
  if ((k === 'r' || k === 'R') && state === 'research') { e.preventDefault(); setState('game'); return; }
  if (state === 'research') {
    var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[k]) { e.preventDefault(); treeMove(dirs[k][0], dirs[k][1]); return; }
    if (k === '+' || k === '=') { setTreeScale(rScale * 1.2); return; } if (k === '-' || k === '_') { setTreeScale(rScale / 1.2); return; } if (k === '0') { fitTree(false); return; }
  }
  if ((k === 'p' || k === 'P') && state === 'pause') { resume(); return; }
  if (k === 'ArrowDown' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); focusNav(1); return; }
  if (k === 'ArrowUp' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); focusNav(-1); return; }
  if (k === 'ArrowRight') { e.preventDefault(); if (!adjustNav(1)) focusNav(1); return; }
  if (k === 'ArrowLeft') { e.preventDefault(); if (!adjustNav(-1)) focusNav(-1); return; }
  if (code === 'Space' || k === 'Enter') { var a = document.activeElement; if (a && (a.type === 'range' || a.tagName === 'SELECT')) return; e.preventDefault(); activateNav(); }
});

/* ---------------- gamepad ---------------- */
var padPrev = [], padRep = 0, padUsed = false;
function pollPad(dt) {
  var gp = navigator.getGamepads ? navigator.getGamepads() : [], p = null; for (var i = 0; i < gp.length; i++) if (gp[i] && gp[i].connected) { p = gp[i]; break; } if (!p) return;
  var b = p.buttons.map(function (x) { return x.pressed || x.value > 0.5; }), ax = p.axes;
  var hit = function (i) { return b[i] && !padPrev[i]; };
  var sx = (b[15] ? 1 : 0) - (b[14] ? 1 : 0) + (Math.abs(ax[0]) > 0.5 ? Math.sign(ax[0]) : 0), sy = (b[13] ? 1 : 0) - (b[12] ? 1 : 0) + (Math.abs(ax[1]) > 0.5 ? Math.sign(ax[1]) : 0);
  padRep -= dt; var dirHit = false; if (sx || sy) { if (padRep <= 0) { dirHit = true; padRep = padUsed ? 0.18 : 0.35; padUsed = true; } } else { padRep = 0; padUsed = false; }
  if (b.some(function (x) { return x; }) && state === 'begin') { begin(); padPrev = b; return; }
  if (hit(0) && state === 'title') skipTitle();
  if (state === 'game') {
    if (dirHit) snapDir(Math.sign(sx), Math.sign(sy));
    if (Math.abs(ax[2]) > 0.2 || Math.abs(ax[3]) > 0.2) { R.pan(-ax[2] * 600 * dt, -ax[3] * 600 * dt); userCam = true; }
    if (b[7]) { R.zoomAt(R.W / 2, R.H / 2, 1 + dt * 1.5); userCam = true; } if (b[6]) { R.zoomAt(R.W / 2, R.H / 2, 1 - dt * 1.3); userCam = true; }
    if (hit(4)) focusOpt(-1); if (hit(5)) focusOpt(1);
    if (hit(0)) { if (!ui.sel) snapDir(0, 0.0001) || select(ui.sel || 'eo1'); else if (ui.optFocus >= 0 && ui.opts[ui.optFocus]) doAct(ui.opts[ui.optFocus].act, ui.opts[ui.optFocus].arg); else focusOpt(1); }
    if (hit(1)) { if (ui.sel) select(null); }
    if (hit(2)) { if (sim.mode === 'build') launch(); else { quick = !quick; } }
    if (hit(3)) fireSuper(); if (hit(9)) openPause(); if (hit(8)) openResearch();
  } else if (state !== 'begin' && state !== 'title') {
    if (state === 'research') {
      if (dirHit) { if (Math.abs(sx) >= Math.abs(sy) && sx) treeMove(Math.sign(sx), 0); else treeMove(0, Math.sign(sy)); }
      if (Math.abs(ax[2]) > 0.2 || Math.abs(ax[3]) > 0.2) { $('rtree').scrollLeft += ax[2] * 700 * dt; $('rtree').scrollTop += ax[3] * 700 * dt; }
      if (b[7]) setTreeScale(rScale * (1 + dt * 1.2)); if (b[6]) setTreeScale(rScale * (1 - dt * 1.1));
    } else if (dirHit) { if (sx && adjustNav(Math.sign(sx))) { /* slider */ } else focusNav(sy ? Math.sign(sy) : Math.sign(sx)); }
    if (hit(0)) activateNav(); if (hit(1)) { if (state === 'end') toMenu(); else back(); }
    if (hit(9) && state === 'pause') resume(); if (hit(8) && state === 'research') setState('game');
  }
  padPrev = b;
}

/* ---------------- intro ---------------- */
function begin() { if (state !== 'begin') return; AU.init(); applySettings(); AU.setMode('dawn'); titleT = 0; state = 'title'; screen('titleText'); MS.screen('title'); }
function skipTitle() { if (state !== 'title') return; if (titleT < 26) { AU.setMode('menu'); } titleT = 30; $('titleText').classList.remove('on'); setState('menu'); }
function easeIO(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function titleK(t) { return { black: 1 - easeIO(t / 3), stars: easeIO((t - 0.5) / 6), rise: easeIO((t - 4) / 11), moon: easeIO((t - 5) / 7), mono: easeIO((t - 9) / 5) }; }

/* ---------------- main loop ---------------- */
var last = performance.now(), fpsAcc = 0, menuK = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (now - last) / 1000); last = now;
  pollPad(dt);
  if (state === 'begin') { R.title(dt, { black: 1, stars: 0, rise: 0, moon: 0, mono: 0 }); return; }
  if (state === 'title' || (!sim && state !== 'game')) {
    titleT += dt; menuK = state === 'title' ? 0 : Math.min(1, menuK + dt * 1.5); var tk = titleK(titleT); tk.menu = menuK; R.title(dt, tk);
    if (state === 'title' && titleT > 14.5) $('titleText').classList.add('on');
    if (state === 'title' && titleT > 27) { $('titleText').classList.remove('on'); setState('menu'); }
    return;
  }
  if (!sim) return;
  var running = state === 'game' && !quick && sim.mode === 'wave';
  if (running) { acc += dt * speed; var n = 0; while (acc >= DT && n++ < 14) { sim.step(DT); acc -= DT; if (sim.mode !== 'wave') { acc = 0; break; } } if (acc > DT * 4) acc = 0; }
  if (sim.ev.length) handleEvents();
  if (ui.sellArm > 0) { ui.sellArm -= dt; if (ui.sellArm <= 0) panelDirty = true; }
  if (cardTimer > 0) { cardTimer -= dt; if (cardTimer <= 0) $('card').className = 'hide'; }
  if (R.letterbox > 0 && (!sim.cur || sim.mode !== 'wave' || !sim.cur.boss) && cardTimer <= 0) R.letterbox = Math.max(0, R.letterbox - dt * 0.6);
  if (camFocus) { camFocus.until -= dt; R.cam.tx = camFocus.x; R.cam.ty = camFocus.y; R.cam.tz = R.fitZ * 1.25; if (camFocus.until <= 0) { camFocus = null; R.home(); } }
  if (sim.mode === 'wave') { AU.intensity = intensity(); var nb = 0, nl = 0; for (var k in sim.structs) { var st = sim.structs[k]; if (st.beam) { if (st.type === 'lance') nl++; else nb++; } } AU.beams = running ? nb : 0; AU.lances = running ? nl : 0; } else { AU.beams = 0; AU.lances = 0; }
  panelT -= dt; if (panelDirty || panelT <= 0) { renderPanel(); panelDirty = false; panelT = 0.25; }
  hud(dt);
  R.frame(sim, running ? dt * speed : dt * (sim.mode === 'build' ? 1 : 0.0001), { sel: ui.sel, hover: ui.hover, previewType: ui.previewType, paths: save.set.paths === '1', ghost: ui.ghost, labels: save.set.labels === '1', showLocked: sim.mode === 'build' });
}
window.addEventListener('resize', function () { R.resize(); if (!userCam) R.home(true); });
window.addEventListener('blur', function () { if (state === 'game' && sim && sim.mode === 'wave') openPause(); });
MS.bindPause({ pause: function () { if (state === 'game' && sim && sim.mode === 'wave') openPause(); }, resume: function () {} });
R.quality = save.set.qual; R.resize(); R.home(true);
window.HP = { booted: true, get sim() { return sim; }, get state() { return state; }, ui: function () { return ui; }, R: R, AU: AU, startGame: startGame, launch: launch, select: select, doAct: doAct, save: function () { return save; } };
requestAnimationFrame(frame);
})();
