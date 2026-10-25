/* MUSHROOM CLOUD — main.js: menus, HUD, input (mouse/trackpad, touch, keyboard, gamepad), game loop, online glue. */
import { Globe } from './render.js';
const S = window.MCSim, W = window.MCWorld, AU = window.MCAudio, Net = window.Net, BL = S.BLOCS, UNIT = S.UNIT;
const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtM = m => m >= 1000 ? (m / 1000).toFixed(2) + ' billion' : m >= 1 ? (m >= 10 ? Math.round(m) : m.toFixed(1)) + ' million' : Math.round(m * 1000) ? Math.round(m * 1000) + ',000' : 'no one';
const shortM = m => m >= 1000 ? (m / 1000).toFixed(1) + 'B' : m >= 10 ? Math.round(m) + 'M' : m.toFixed(1) + 'M';
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TYPES = ['silo', 'radar', 'sam', 'airbase', 'sub', 'carrier'];
const NICE = { silo: 'ICBM Silo', radar: 'Radar', sam: 'Air Defense', airbase: 'Airbase', sub: 'Missile Sub', carrier: 'Carrier Group', fighter: 'Fighter wing', bomber: 'Bomber' };
const CITIES = W.cities.map(c => ({ name: c[0], lat: c[1], lon: c[2], bloc: c[3], pop0: c[4] }));
const SVG = {
  silo: '<path d="M16 3 L22 22 L10 22 Z" fill="currentColor"/><rect x="7" y="23" width="18" height="4" rx="1" fill="currentColor" opacity=".6"/>',
  radar: '<path d="M6 20 A12 12 0 0 1 26 8" stroke="currentColor" stroke-width="3" fill="none"/><circle cx="16" cy="16" r="3" fill="currentColor"/><path d="M16 16 L12 28 M16 16 L20 28" stroke="currentColor" stroke-width="2"/>',
  sam: '<path d="M8 26 L16 6 L24 26" stroke="currentColor" stroke-width="3" fill="none"/><path d="M11 26 L16 14 L21 26" stroke="currentColor" stroke-width="2" fill="none" opacity=".6"/>',
  airbase: '<path d="M16 4 L18 13 L28 18 L28 20 L18 18 L17 25 L21 28 L11 28 L15 25 L14 18 L4 20 L4 18 L14 13 Z" fill="currentColor"/>',
  sub: '<ellipse cx="16" cy="18" rx="13" ry="4.5" fill="currentColor"/><rect x="13" y="9" width="5" height="7" rx="1.5" fill="currentColor"/>',
  carrier: '<path d="M3 17 L29 17 L26 23 L6 23 Z" fill="currentColor"/><rect x="19" y="11" width="4" height="6" fill="currentColor"/><path d="M5 15 L27 15" stroke="currentColor" stroke-width="2"/>',
};
const icon = (t, col) => '<svg viewBox="0 0 32 32" style="color:' + (col || '#cfe') + '">' + SVG[t] + '</svg>';

/* ============================== state ============================== */
const app = {
  screen: 'loading', mode: 'sp', cfg: { scenario: 'brink', bloc: 0, opp: 1, cpus: 3, diff: 'veteran' }, me: 0, game: null, view: null, simT: 0,
  speed: 1, paused: false, sel: null, place: null, mode2: null, target: null, warRoom: false, mouse: { x: -1, y: -1, ll: null }, hints: localStorage.getItem('mc-hints') !== 'off',
  slow: 1, slowUntil: 0, sawDet: false, ticker: [], online: null, ff: 0, lastDefcon: 5, focusT: 0, pendQ: {}, q: 1, briefStart: false, gp: { on: false, x: 0, y: 0 },
  lastIncoming: 0, rt: 0, role: 'sp',
};
let globe = null, acc = 0, last = performance.now(), hudT = 0;

/* ============================== screens ============================== */
function go(name) {
  app.screen = name;
  for (const id of ['loading', 'title', 'select', 'brief', 'online', 'modal', 'end']) $(id).classList.toggle('show', id === name || (name === 'play-modal' && id === 'modal'));
  document.body.classList.toggle('playing', name === 'play' || name === 'play-modal' || name === 'end');
  focusFirst();
}
let usingKeys = false;
function focusables() { const scr = app.screen === 'play-modal' ? $('modal') : $(app.screen); return scr ? [...scr.querySelectorAll('.btn:not([disabled])')].filter(b => b.offsetParent) : []; }
function focusFirst() { document.querySelectorAll('.btn.focus').forEach(b => b.classList.remove('focus')); if (!usingKeys) return; const f = focusables(); const pref = f.find(b => b.classList.contains('go')) || f[0]; if (pref) pref.classList.add('focus'); }
function moveFocus(dx, dy) {
  const f = focusables(); if (!f.length) return; const cur = f.find(b => b.classList.contains('focus'));
  if (!cur) { usingKeys = true; focusFirst(); return; }
  const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2; let best = null, bd = 1e9;
  for (const b of f) { if (b === cur) continue; const r = b.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
    const along = x * dx + y * dy; if (along <= 4) continue; const perp = Math.abs(x * dy - y * dx); const d = along + perp * 2.5; if (d < bd) { bd = d; best = b; } }
  if (best) { cur.classList.remove('focus'); best.classList.add('focus'); best.scrollIntoView({ block: 'nearest' }); AU.S.tick(); }
}
function pressFocus() { const b = focusables().find(b => b.classList.contains('focus')); if (b) { b.click(); return true; } return false; }

/* ============================== title / select ============================== */
function toTitle() { if (app.online) { Net.leave(); app.online = null; } app.game = null; app.view = null; app.gview = null; app.role = 'sp'; AU.siren(false); AU.setLevel(5); if (globe && globe.ready) globe.resetFx(); go('title'); }
$('title').addEventListener('click', e => { const b = e.target.closest('.btn'); if (!b) return; AU.init(); AU.S.select();
  const a = b.dataset.act; if (a === 'sp') { app.mode = 'sp'; openSelect(); } else if (a === 'host') { app.mode = 'host'; openSelect(); } else if (a === 'join') joinOnline(); else if (a === 'how') openBrief(false);
  else if (a === 'sound') { AU.setOn(!AU.on); b.textContent = 'SOUND: ' + (AU.on ? 'ON' : 'OFF'); } });
function openSelect() {
  const c = app.cfg; if (app.mode === 'host' && c.scenario === 'second') c.scenario = 'brink';
  $('seltitle').textContent = app.mode === 'host' ? 'TWO-PLAYER GAME (ONLINE) — SET UP' : 'SELECT SCENARIO';
  renderSelect(); go('select');
}
function scenBlocs() {
  const c = app.cfg, host = app.mode === 'host';
  if (c.opp === c.bloc) c.opp = (c.bloc + 1) % 6;
  if (c.scenario === 'six') { const list = host ? [c.bloc, c.opp] : [c.bloc]; const n = host ? Math.min(c.cpus, 4) : Math.max(1, Math.min(5, c.cpus));
    for (const b of [0, 1, 2, 3, 4, 5]) if (!list.includes(b) && list.length < n + (host ? 2 : 1)) list.push(b); return list.sort((a, b) => a - b); }
  if (c.scenario === 'pacific') { const list = [c.bloc, c.opp]; for (const b of [0, 1, 2, 3, 4, 5]) if (list.length < 3 && !list.includes(b)) list.push(b); return list.sort((a, b) => a - b); }
  return [c.bloc, c.opp].sort((a, b) => a - b);
}
function renderSelect() {
  const c = app.cfg, host = app.mode === 'host', six = c.scenario === 'six';
  if (six && !host && c.cpus < 1) c.cpus = 1;
  $('scen').innerHTML = Object.entries(S.SCENARIOS).filter(([k]) => !(host && k === 'second')).map(([k, s]) => '<button class="btn card' + (c.scenario === k ? ' on' : '') + '" data-scen="' + k + '"><b>' + s.name + '</b><span>' + esc(s.sub) + '</span><span>' + esc(s.blurb) + '</span></button>').join('');
  $('blocs').innerHTML = BL.map(b => '<button class="btn chip' + (c.bloc === b.id ? ' on' : '') + '" data-bloc="' + b.id + '"><i style="color:' + b.color + ';background:' + b.color + '"></i>' + b.short + '</button>').join('');
  $('opplabel').textContent = host ? (six ? "YOUR BUDDY'S BLOC  ·  EXTRA CPU BLOCS" : "YOUR BUDDY'S BLOC") : six ? 'CPU BLOCS IN THE WAR' : 'OPPONENT';
  let o = '';
  if (!six || host) o += BL.filter(b => b.id !== c.bloc).map(b => '<button class="btn chip' + (c.opp === b.id ? ' on' : '') + '" data-opp="' + b.id + '"><i style="color:' + b.color + ';background:' + b.color + '"></i>' + b.short + '</button>').join('');
  if (six) o += (host ? '<span style="width:100%"></span>' : '') + (host ? [0, 1, 2, 3, 4] : [1, 2, 3, 4, 5]).map(n => '<button class="btn chip' + (c.cpus === n ? ' on' : '') + '" data-cpus="' + n + '">' + n + ' CPU</button>').join('');
  $('opps').innerHTML = o;
  const needCpu = !host || scenBlocs().length > 2;
  $('difflabel').style.display = $('diffs').style.display = needCpu ? '' : 'none';
  $('diffs').innerHTML = Object.entries(S.DIFF).map(([k, d]) => '<button class="btn chip' + (c.diff === k ? ' on' : '') + '" data-diff="' + k + '">' + d.name + '</button>').join('');
  const list = scenBlocs(), sc = S.SCENARIOS[c.scenario];
  $('selsum').innerHTML = '<b>' + sc.name + '</b> — ' + list.map(b => '<span style="color:' + BL[b].color + '">' + BL[b].name + (b === c.bloc ? ' (you)' : host && b === c.opp ? ' (buddy)' : '') + '</span>').join(' · ') + (needCpu ? '. CPU: ' + S.DIFF[c.diff].name.toLowerCase() + '.' : '.');
  $('bstart').textContent = host ? 'OPEN GAME ▶' : 'BRIEFING ▶';
}
$('select').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; AU.S.click(); const c = app.cfg, d = b.dataset;
  if (d.act === 'back') { toTitle(); return; }
  if (d.act === 'start') { if (app.mode === 'host') hostOnline(); else openBrief(true); return; }
  const f = d.scen ? 'scen' : d.bloc ? 'bloc' : d.opp ? 'opp' : d.cpus ? 'cpus' : d.diff ? 'diff' : null; if (!f) return;
  if (d.scen) { c.scenario = d.scen; if (d.scen === 'six' && app.mode === 'host' && c.cpus > 4) c.cpus = 4; }
  else if (d.bloc) c.bloc = +d.bloc; else if (d.opp) c.opp = +d.opp; else if (d.cpus) c.cpus = +d.cpus; else if (d.diff) c.diff = d.diff;
  const had = b.classList.contains('focus'), key = d[f];
  renderSelect(); if (had) { const nb = document.querySelector('#select [data-' + f + '="' + key + '"]'); nb && nb.classList.add('focus'); }
});

/* ============================== briefing ============================== */
const BRIEF = [
  ['YOU HAVE THE CODES', '<p>You command the strategic forces of a bloc. The crisis runs on a clock: <b>DEFCON 5 → 1</b>. Each step unlocks more of the war, and more ways to end the world.</p><p class="note">Score: <b>2 points per million enemy dead, minus 1 per million of your own.</b> If nobody ever launches, the bloc with the strongest posture wins by <b>deterrence</b>.</p>'],
  ['DEFCON 5–4 · DEPLOY', '<p>Pick a unit (<kbd>1</kbd>–<kbd>6</kbd> or the palette) and click inside your glowing territory. Subs and carriers go in your coastal waters. You have a budget of 120.</p><p><b>Silos</b> fire ICBMs or shoot down warheads. <b>Radar</b> sees missiles and aircraft. <b>Air defense</b> intercepts. <b>Airbases</b> launch fighters and bombers. <b>Subs</b> hide and launch fast. <b>Carriers</b> project air power.</p><p class="note">The enemy cannot see your units, and you cannot see theirs, until something finds them. No time? Press <b>AUTO-DEPLOY</b>.</p>'],
  ['DEFCON 3–2 · POSITION', '<p><b>DEFCON 3:</b> fleets move (select a ship, click the sea). Launch fighters (<kbd>F</kbd>) to scout and intercept bombers. Skirmishes reveal positions.</p><p><b>DEFCON 2:</b> task spy satellites (<kbd>T</kbd>) to find silos. Open the hotline (<kbd>D</kbd>) for alliances, ceasefires, a show of force, or a bluff.</p>'],
  ['DEFCON 1 · RELEASE', '<p>A silo is either in <b>DEFENSE</b> mode (it shoots down incoming warheads) or <b>LAUNCH</b> mode. Switching takes 20 seconds (<kbd>M</kbd>). Launching reveals the silo for good; subs are revealed for two minutes.</p><p>Select a launcher, click a target, press <kbd>SPACE</kbd> to fire. <kbd>ENTER</kbd> opens the <b>strike package</b> panel: counterforce, defense suppression, countervalue or all-out, with simultaneous impact to saturate defenses.</p><p class="note">Launch on warning (<kbd>L</kbd>) retaliates automatically if missiles come in. Bombers can be recalled (<kbd>R</kbd>). Second-strike forces decide who scores last.</p>'],
  ['CONTROLS', '<div class="two"><div><b>Mac · keyboard / mouse / trackpad</b><br>Drag: rotate the globe · Scroll or pinch: zoom<br>Click: select / place / target<br><kbd>SPACE</kbd> launch / confirm · <kbd>ENTER</kbd> strike package<br><kbd>ESC</kbd> cancel · <kbd>1</kbd>–<kbd>6</kbd> unit types<br><kbd>M</kbd> silo mode · <kbd>F</kbd>/<kbd>B</kbd> fighter / bomber · <kbd>R</kbd> recall<br><kbd>T</kbd> satellite · <kbd>D</kbd> hotline · <kbd>V</kbd> war-room view<br><kbd>P</kbd> pause · <kbd>[</kbd> <kbd>]</kbd> speed · arrows rotate · <kbd>+</kbd>/<kbd>-</kbd> zoom</div><div><b>iPhone / iPad</b><br>One finger: rotate · pinch: zoom · tap: select / place / target<br>The bottom panels hold every command: FIRE, MODE, FIGHTER, STRIKE PACKAGE, HOTLINE.<br><br><b>Gamepad</b><br>Left stick: cursor · right stick: rotate · triggers: zoom<br>A select · X launch · Y strike package · B cancel · LB/RB unit types · Start: menu</div></div>'],
];
let bp = 0;
function openBrief(start) { app.briefStart = start; bp = start && app.cfg.scenario === 'second' ? 3 : 0; renderBrief(); go('brief'); }
function renderBrief() {
  const [t, h] = BRIEF[bp]; let extra = '';
  if (bp === BRIEF.length - 1 && app.briefStart) { const sc = S.SCENARIOS[app.cfg.scenario]; extra = '<p class="note" style="margin-top:14px">' + sc.name + ': ' + esc(sc.blurb) + '</p>'; }
  $('btitle').textContent = app.briefStart ? 'BRIEFING' : 'HOW TO PLAY'; $('bpage').textContent = (bp + 1) + ' / ' + BRIEF.length;
  $('bbody').innerHTML = '<h3>' + t + '</h3>' + h + extra;
  $('bnext').textContent = bp < BRIEF.length - 1 ? 'NEXT ▶' : app.briefStart ? 'BEGIN ▶' : 'DONE';
  focusFirst();
}
const briefExit = () => go(app.game || app.gview ? 'play' : 'title');
$('brief').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; AU.S.click(); const a = b.dataset.act;
  if (a === 'bprev') { if (bp > 0) { bp--; renderBrief(); } else if (app.briefStart) go('select'); else briefExit(); }
  else if (a === 'bnext') { if (bp < BRIEF.length - 1) { bp++; renderBrief(); } else if (app.briefStart) startSP(); else briefExit(); }
  else if (a === 'bskip') { if (app.briefStart) startSP(); else briefExit(); }
});

/* ============================== starting a war ============================== */
function makeCfg(humans) {
  const c = app.cfg, blocs = scenBlocs(), seed = Q.get('seed') ? +Q.get('seed') : (Math.random() * 1e9) | 0;
  const pers = {}; const r = S.RNG(seed ^ 0x5bd1e995); for (const b of blocs) pers[b] = S.PERS[Math.floor(r() * 3)];
  return { scenario: c.scenario, blocs, humans, seed, difficulty: c.diff, pers };
}
function startSP() { app.mode = 'sp'; startGame(makeCfg([app.cfg.bloc]), app.cfg.bloc, 'sp'); }
function startGame(cfg, me, role) {
  AU.init();
  app.game = role === 'guest' ? null : new S.Game(cfg); app.cfgRun = cfg; app.me = me; app.role = role;
  app.view = app.game ? app.game.viewFor(me) : null; app.simT = 0; app.sel = null; app.mode2 = null; app.target = null; app.paused = false; app.speed = 1; app.ff = 0;
  app.slow = 1; app.sawDet = false; app.ticker = []; app.lastDefcon = cfg.scenario === 'second' ? 1 : 5; app.lastIncoming = 0; app.endLook = false;
  app.gview = null; app.recvAt = 0; app.warRoom = false;
  $('tickin').innerHTML = ''; acc = 0; lastHud = {};
  globe.resetFx(); globe.setBlocs(BL.map(b => ({ active: cfg.blocs.includes(b.id) })), BL); globe.U.meBloc.value = me;
  const cen = S.AI.centroid(me); globe.focus(cen[0], cen[1], 2.7); globe.opts.sunStart = cen[1] + 50;
  AU.setLevel(app.lastDefcon); AU.siren(false);
  app.place = app.lastDefcon >= 4 ? 'silo' : null;
  go('play');
  pushNews(cfg.scenario === 'second' ? 'FLASH: DEFCON 1 declared. Multiple launches detected.' : 'DEFCON 5: Global tensions rise. Strategic forces begin deployment.', 'alert');
  showHint(app.lastDefcon);
  if (app.lastDefcon === 1) bigMsg('DEFCON 1', 'LAUNCHES DETECTED', true); else bigMsg('DEFCON 5', S.SCENARIOS[cfg.scenario].name);
}

/* ============================== orders ============================== */
function order(c, quiet) {
  if (app.role === 'guest') { const q = app.q++; app.pendQ[q] = { c, quiet }; Net.send({ t: 'c', q, c }); return { ok: true, pending: true }; }
  if (!app.game) return { ok: false };
  const r = app.game.command(app.me, c); afterOrder(c, r, quiet); return r;
}
function afterOrder(c, r, quiet) {
  if (!r.ok) { if (!quiet) toast(r.msg || 'Not possible', true); AU.S.deny(); return; }
  if (c.op === 'place') AU.S.place(); else if (c.op !== 'launch' && c.op !== 'salvo') AU.S.select();
  if (r.msg && !quiet) toast(r.msg);
  if (c.op === 'remove' && app.sel === c.id) app.sel = null;
}

/* ============================== helpers on the current view ============================== */
const V = () => app.view;
const myUnits = () => (V() ? V().units.filter(u => u.bloc === app.me && u.alive) : []);
const findSel = () => { const v = V(); if (!v || app.sel == null) return null; return v.units.find(u => u.id === app.sel) || v.air.find(a => a.id === app.sel) || null; };
function unitAt(x, y) {
  const v = V(); if (!v) return null; let best = null, bd = TOUCH ? 30 : 18;
  const test = (o, isAir) => { const p = globe.project(o.lat, o.lon, isAir ? 0.006 : 0.0025); if (!p.front) return; const d = Math.hypot(p.x - x, p.y - y) - (o.bloc === app.me ? 3 : 0); if (d < bd) { bd = d; best = o; } };
  for (const u of v.units) if (u.alive) test(u, false); for (const a of v.air) test(a, true);
  return best;
}
const isLauncher = u => !!u && !u.kind && (u.type === 'silo' || u.type === 'sub') && u.bloc === app.me;
function canPlaceHere(type, ll) {
  if (!ll) return false; const U = UNIT[type];
  if (U.land ? S.landBloc(ll[0], ll[1]) !== app.me : S.waterOwner(ll[0], ll[1]) !== app.me) return false;
  return !myUnits().some(u => S.gc(u.lat, u.lon, ll[0], ll[1]) < 1.2);
}
function targetOk(ll) { if (!ll) return false; const v = V(), lb = S.landBloc(ll[0], ll[1]); if (lb === 6 || lb === app.me) return false; if (lb >= 0 && lb < 6) { const b = v.blocs[lb]; if (!b.active || v.blocs[app.me].allies.includes(lb)) return false; } return true; }

/* ============================== click / select ============================== */
function clickAt(x, y) {
  const v = V(); if (!v || v.over) return; const ll = globe.pick(x, y), hit = unitAt(x, y);
  if (app.mode2 === 'air' || app.mode2 === 'sat') {
    if (!ll) return;
    if (app.mode2 === 'sat') order({ op: 'sat', lat: ll[0], lon: ll[1] }); else { const u = findSel(); if (u) order({ op: 'air', id: u.id, kind: app.airKind, lat: ll[0], lon: ll[1] }); }
    app.mode2 = null; return;
  }
  if (app.place && v.defcon >= 4) {
    if (hit && hit.bloc === app.me) { select(hit); return; }
    if (ll) order({ op: 'place', type: app.place, lat: ll[0], lon: ll[1] }); return;
  }
  const s = findSel(), aiming = s && isLauncher(s) && v.defcon === 1;
  if (hit && (hit.bloc === app.me || !aiming)) { select(hit); return; }
  if (aiming && (ll || hit)) { app.target = hit ? [hit.lat, hit.lon] : ll; AU.S.click(); if (!targetOk(app.target)) toast('Off-limits target: own, allied or non-aligned territory', true); else toast((TOUCH ? 'Tap FIRE' : 'SPACE to launch') + ' · target set'); return; }
  if (s && !s.kind && s.bloc === app.me && UNIT[s.type] && !UNIT[s.type].land && ll && v.defcon <= 3) { if (S.isWater(ll[0], ll[1])) order({ op: 'move', id: s.id, lat: ll[0], lon: ll[1] }); else toast('Ships need open water', true); return; }
  app.sel = null; app.target = null;
}
function select(u) { app.sel = u.id; app.target = null; app.mode2 = null; AU.S.select(); }
function cycleType(t) {
  const v = V(); if (!v) return;
  if (v.defcon >= 4) { app.place = app.place === t ? null : t; app.sel = null; AU.S.click(); return; }
  const list = myUnits().filter(u => u.type === t); if (!list.length) { toast('No ' + NICE[t] + ' left', true); return; }
  const i = list.findIndex(u => u.id === app.sel); const u = list[(i + 1) % list.length]; select(u); globe.focus(u.lat, u.lon);
}
function fire(all) {
  const s = findSel(), v = V(); if (!v) return;
  if (!isLauncher(s)) { // Space with nothing selected: pick the next ready launcher (or place, while deploying)
    const l = myUnits().filter(u => (u.type === 'sub' || (u.type === 'silo' && u.mode === 'launch')) && u.wh > 0);
    if (v.defcon === 1 && l.length) { const i = l.findIndex(u => u.id === app.sel); select(l[(i + 1) % l.length]); toast('Launcher selected: choose a target'); }
    else if (app.place && v.defcon >= 4 && app.mouse.ll) order({ op: 'place', type: app.place, lat: app.mouse.ll[0], lon: app.mouse.ll[1] });
    else if (v.defcon === 1) toast('No launcher ready: switch a silo to LAUNCH mode (M)', true);
    return;
  }
  if (v.defcon > 1) { toast('Launches are authorised only at DEFCON 1', true); AU.S.deny(); return; }
  if (s.type === 'silo' && (s.mode !== 'launch' || s.pend)) { toast(s.pend === 'launch' ? 'Silo is switching to LAUNCH mode…' : 'Silo is in DEFENSE mode: press M to switch', true); AU.S.deny(); return; }
  const t = app.target || (app.mouse.ll && !TOUCH ? app.mouse.ll : null);
  if (!t) { toast('Choose a target first', true); return; }
  order({ op: all ? 'salvo' : 'launch', id: s.id, lat: t[0], lon: t[1] });
}

/* ============================== HUD rendering ============================== */
let lastHud = {};
const setHTML = (id, h) => { if (lastHud[id] !== h) { lastHud[id] = h; $(id).innerHTML = h; } };
const phaseName = d => ['', 'NUCLEAR RELEASE', 'CRISIS', 'MOBILIZATION', 'DEPLOYMENT', 'DEPLOYMENT'][d];
function updateHUD() {
  const v = V(); if (!v) return; const t = app.simT;
  document.querySelectorAll('#defcon i').forEach((el, i) => { const d = 5 - i; el.className = d === v.defcon ? 'cur' + (d === 1 ? ' d1' : '') : ''; });
  let a = 'DEFCON ' + v.defcon + ' · ' + phaseName(v.defcon), b;
  if (v.over) b = 'THE WAR IS OVER'; else if (v.endAt) { a = 'VICTORY TIMER'; b = 'WAR ENDS IN ' + fmt(v.endAt - t); }
  else if (v.defcon > 1) b = 'DEFCON ' + (v.defcon - 1) + ' IN ' + fmt(v.phaseEnd - t); else b = 'TIME LEFT ' + fmt((v.d1At || 0) + S.D1_LEN - t);
  setHTML('phasea', esc(a)); setHTML('phaseb', esc(b) + (app.paused ? ' · PAUSED' : ''));
  const canSpeed = app.role !== 'guest';
  setHTML('speed', canSpeed ? [['‖', 0], ['1×', 1], ['2×', 2], ['4×', 4], ['8×', 8]].map(([l, s]) => '<button class="btn' + ((s === 0 ? app.paused : !app.paused && app.speed === s && !app.ff) ? ' on' : '') + (s === 2 || s === 4 ? ' opt' : '') + '" data-speed="' + s + '">' + l + '</button>').join('') + (v.defcon > 1 && !v.over ? '<button class="btn' + (app.ff ? ' on' : '') + '" data-speed="ff" title="Fast-forward to the next DEFCON">▶▶</button>' : '') : '<span style="font:600 11px var(--mono);color:var(--dim)">SPEED ' + (v.speed || 1) + '×</span>');
  setHTML('link', app.online ? 'LINK ' + (Net.st.ping == null ? '--' : Math.round(Net.st.ping)) + ' MS' : '');
  const act = v.blocs.filter(b => b.active), foe = act.filter(b => b.id !== app.me).sort((x, y) => y.score - x.score)[0];
  setHTML('score', act.map(b => '<div class="sb' + (b.id === app.me ? ' me' : foe && b.id === foe.id ? ' foe' : '') + '" style="color:' + BL[b.id].color + '"><b>' + BL[b.id].key + ' ' + (b.score > 0 ? '+' : '') + b.score + '</b><small>' + shortM(b.pop) + (b.cf ? ' · CF' : '') + (v.blocs[app.me].allies.includes(b.id) ? ' · ALLY' : '') + '</small></div>').join(''));
  const placing = v.defcon >= 4 && !v.over; document.body.classList.toggle('placing', placing && app.sel == null);
  $('budget').style.display = placing ? '' : 'none';
  const mine = myUnits(), col = BL[app.me].color;
  if (placing) {
    $('budgetv').textContent = v.my.budget; $('budgetbar').style.width = (v.my.budget / S.BUDGET * 100) + '%';
    setHTML('lefth', 'DEPLOY FORCES');
    setHTML('palette', TYPES.map((tp, i) => { const n = mine.filter(u => u.type === tp).length, U = UNIT[tp], dis = n >= U.max || v.my.budget < U.cost;
      return '<button class="btn pal' + (app.place === tp ? ' on' : '') + '" data-type="' + tp + '"' + (dis && app.place !== tp ? ' style="opacity:.45"' : '') + '><span class="k">' + (i + 1) + '</span>' + icon(tp, col) + '<span class="nm">' + NICE[tp] + '</span><span class="c">' + U.cost + '<br>' + n + '/' + U.max + '</span></button>'; }).join(''));
    setHTML('leftx', '<button class="btn" data-cmd="auto">AUTO-DEPLOY</button>');
  } else {
    setHTML('lefth', 'FORCES');
    const sum = (l, k) => l.reduce((s, u) => s + (u[k] || 0), 0);
    setHTML('palette', TYPES.map((tp, i) => { const l = mine.filter(u => u.type === tp); if (!l.length) return '';
      const extra = tp === 'silo' ? sum(l, 'wh') + ' wh · ' + l.filter(u => u.mode === 'launch').length + 'L' : tp === 'sub' ? sum(l, 'wh') + ' wh' : tp === 'sam' ? sum(l, 'abm') + ' int' : tp === 'airbase' ? sum(l, 'fi') + 'F ' + sum(l, 'bo') + 'B' : tp === 'carrier' ? sum(l, 'fi') + 'F' : '';
      return '<button class="btn pal" data-type="' + tp + '"><span class="k">' + (i + 1) + '</span>' + icon(tp, col) + '<span class="nm">' + NICE[tp] + ' ×' + l.length + '</span><span class="c">' + extra + '</span></button>'; }).join('') || '<div style="color:var(--dim);font-size:12px">No forces left.</div>');
    setHTML('leftx', v.defcon <= 3 && !v.over ? '<button class="btn' + (v.my.low ? ' on' : '') + '" data-cmd="low">LAUNCH ON WARNING: ' + (v.my.low ? 'ARMED' : 'OFF') + '</button>' : '');
  }
  renderSel(v);
  const inc = v.missiles.filter(m => m.tb === app.me && m.bloc !== app.me && !v.blocs[app.me].allies.includes(m.bloc));
  if (inc.length) { const first = Math.min(...inc.map(m => m.t0 + m.dur - t)); setHTML('banner', 'INCOMING · ' + inc.length + ' WARHEAD' + (inc.length > 1 ? 'S' : '') + '<small>FIRST IMPACT ' + fmt(first) + '</small>'); $('banner').classList.add('show'); }
  else $('banner').classList.remove('show');
  if (inc.length && !app.lastIncoming) { AU.siren(true); AU.S.alert(); } if (!inc.length && app.lastIncoming) AU.siren(false);
  app.lastIncoming = inc.length;
  setHTML('offers', (v.offers || []).map(o => '<div class="offer"><span style="color:' + BL[o.from].color + '">' + BL[o.from].name + '</span> proposes ' + (o.kind === 'alliance' ? 'an ALLIANCE' : 'a CEASEFIRE') + ' (' + o.left + 's)<button class="btn" data-offer="' + o.id + '" data-acc="1">ACCEPT</button><button class="btn" data-offer="' + o.id + '" data-acc="0">DECLINE</button></div>').join(''));
}
function renderSel(v) {
  const s = findSel(); let h = '', c = '';
  const B = (cmd, label, cls) => '<button class="btn' + (cls ? ' ' + cls : '') + '" data-cmd="' + cmd + '">' + (TOUCH ? label.replace(/ \((?:[A-Z⇧]+|DEL|ESC|SPACE|ENTER|⇧SPACE)\)$/, '') : label) + '</button>';
  const tap = TOUCH ? 'Tap' : 'Click';
  if (app.mode2 === 'sat') { h = '<h4>SPY SATELLITE</h4><div class="tip">' + tap + ' anywhere on the globe to task a reconnaissance pass. ' + v.my.sats + ' left.</div>'; c = B('cancel', 'CANCEL (ESC)'); }
  else if (app.mode2 === 'air') { h = '<h4>' + (app.airKind === 'bomber' ? 'BOMBER SORTIE' : 'FIGHTER SORTIE') + '</h4><div class="tip">' + tap + ' a destination. ' + (app.airKind === 'bomber' ? 'Bombers release a cruise weapon near their target at DEFCON 1, and can be recalled.' : 'Fighters scout, shoot down bombers and fight enemy fighters, then return to refuel.') + '</div>'; c = B('cancel', 'CANCEL (ESC)'); }
  else if (!s) {
    if (v.defcon >= 4) h = '<h4>DEPLOYMENT</h4><div class="tip">' + (app.place ? 'Placing <b>' + NICE[app.place] + '</b>: ' + tap.toLowerCase() + (UNIT[app.place].land ? ' inside your territory.' : ' your coastal waters.') : (TOUCH ? 'Pick a unit type below.' : 'Pick a unit type (1–6).')) + ' Units must be at least 1.2° apart.</div>';
    else h = '<h4>COMMAND</h4><div class="tip">' + (v.defcon === 1 ? 'Select a launcher' + (TOUCH ? '' : ' (SPACE cycles)') + ', ' + tap.toLowerCase() + ' a target, then FIRE. ' + (TOUCH ? '' : 'ENTER for a strike package.') : v.defcon === 2 ? 'Task satellites and work the hotline. Decide which silos will launch.' : 'Move fleets, scout with fighters, set silo modes.') + '</div>';
    if (!v.over) { if (v.defcon === 1) c += B('strike', 'STRIKE PACKAGE (ENTER)', 'fire'); if (v.defcon <= 2) c += B('sat', 'SATELLITE (' + v.my.sats + ')'); c += B('diplo', 'HOTLINE (D)'); c += B('war', app.warRoom ? 'GLOBE VIEW (V)' : 'WAR ROOM (V)'); if (v.my.orders) c += B('cancelorders', 'CANCEL ORDERS (' + v.my.orders + ')'); }
  } else if (s.kind) {
    const mine = s.bloc === app.me; h = '<h4 style="color:' + BL[s.bloc].color + '">' + (mine ? '' : BL[s.bloc].key + ' ') + NICE[s.kind].toUpperCase() + '</h4>' + (mine ? '<div class="kv"><span>STATE</span><b>' + String(s.state || '').toUpperCase() + '</b></div><div class="kv"><span>FUEL</span><b>' + s.fuel + '</b></div>' + (s.kind === 'bomber' ? '<div class="kv"><span>WEAPON</span><b>' + (s.wh ? 'ARMED' : 'RELEASED') + '</b></div>' : '') : '<div class="tip">Hostile aircraft.</div>');
    if (mine && s.state !== 'return') c = B('recall', 'RECALL (R)');
    c += B('desel', 'DESELECT (ESC)');
  } else {
    const mine = s.bloc === app.me, U = UNIT[s.type];
    h = '<h4 style="color:' + BL[s.bloc].color + '">' + icon(s.type, BL[s.bloc].color).replace('<svg ', '<svg width="18" height="18" ') + (mine ? '' : BL[s.bloc].key + ' ') + NICE[s.type].toUpperCase() + '</h4>';
    if (!s.alive) h += '<div class="tip">Destroyed.</div>';
    else if (!mine) h += '<div class="tip">' + (s.stale ? 'Last known position. It may have moved.' : 'Hostile unit in sensor range.') + (s.mode ? ' Observed in ' + (s.mode === 'launch' ? 'LAUNCH' : 'DEFENSE') + ' mode.' : '') + '</div>' + (v.defcon === 1 ? '<div class="tip">Select one of your launchers, then ' + tap.toLowerCase() + ' this unit to target it.</div>' : '');
    else {
      if (s.type === 'silo') h += '<div class="kv"><span>MODE</span><b style="color:' + (s.mode === 'launch' ? '#ff6a50' : '#48ff9a') + '">' + (s.mode === 'launch' ? 'LAUNCH' : 'DEFENSE') + (s.pend ? ' → ' + (s.pend === 'launch' ? 'LAUNCH' : 'DEFENSE') + ' ' + Math.ceil(s.modeIn) + 's' : '') + '</b></div>';
      if (s.type === 'silo' || s.type === 'sub') h += '<div class="kv"><span>WARHEADS</span><b>' + s.wh + '</b></div>';
      if (U.abm) h += '<div class="kv"><span>INTERCEPTORS</span><b>' + s.abm + '</b></div>';
      if (U.fi) h += '<div class="kv"><span>FIGHTERS</span><b>' + s.fi + '</b></div>';
      if (U.bo) h += '<div class="kv"><span>BOMBERS</span><b>' + s.bo + '</b></div>';
      if (s.cd > 0) h += '<div class="kv"><span>READY IN</span><b>' + Math.ceil(s.cd) + 's</b></div>';
      const tips = { silo: 'DEFENSE mode intercepts warheads near it. LAUNCH mode fires ICBMs but cannot intercept. Switching takes 20 s.', radar: 'Tracks missiles, aircraft and ships within 30°. Interceptors need a radar track.', sam: 'Shoots down warheads in their final descent, and aircraft nearby.', airbase: 'Fighters scout and intercept; bombers carry one cruise weapon and can be recalled.', sub: 'Invisible unless sonar finds it. Launching reveals it for two minutes.', carrier: 'Carries fighters, hunts subs with sonar, light missile defense.' };
      h += '<div class="tip">' + tips[s.type] + '</div>';
      if (!U.land && v.defcon <= 3) h += '<div class="tip">' + tap + ' open sea to set a course.</div>';
      if (v.defcon >= 4) c += B('remove', 'REMOVE (DEL)');
      if (s.type === 'silo' && v.defcon <= 3) c += B('mode', s.mode === 'launch' || s.pend === 'launch' ? 'SET DEFENSE (M)' : 'SET LAUNCH (M)');
      if ((s.type === 'silo' || s.type === 'sub') && v.defcon === 1 && s.wh > 0) { c += B('fire', app.target ? 'FIRE (SPACE)' : tap.toUpperCase() + ' A TARGET', 'fire'); if (app.target && s.wh > 1) c += B('salvo', 'FIRE ALL ' + s.wh + (TOUCH ? '' : ' (⇧SPACE)')); if (app.target) c += B('cleartarget', 'CLEAR TARGET'); }
      if (U.fi && v.defcon <= 3) c += B('fighter', 'FIGHTER (F)'); if (U.bo && v.defcon <= 3) c += B('bomber', 'BOMBER (B)');
    }
    c += B('desel', 'DESELECT (ESC)');
  }
  setHTML('selp', h); setHTML('cmds', c);
}
$('hud').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; const d = b.dataset; AU.init();
  if (d.type) { cycleType(d.type); return; }
  if (d.speed !== undefined) { if (d.speed === 'ff') { app.ff = app.ff ? 0 : 1; app.paused = false; } else if (+d.speed === 0) app.paused = !app.paused; else { app.speed = +d.speed; app.paused = false; app.ff = 0; } AU.S.click(); syncSpeed(); return; }
  if (d.offer) { order({ op: 'respond', id: +d.offer, accept: d.acc === '1' }); return; }
  if (d.act === 'menu') { openPause(); return; }
  if (d.cmd) cmd(d.cmd);
});
function cmd(k) {
  const s = findSel(), v = V(); if (!v) return;
  switch (k) {
    case 'auto': order({ op: 'auto' }); app.place = null; break;
    case 'low': order({ op: 'low', on: !v.my.low }); break;
    case 'remove': if (s && !s.kind) order({ op: 'remove', id: s.id }); break;
    case 'mode': if (s && s.type === 'silo' && s.bloc === app.me) order({ op: 'mode', id: s.id, mode: s.mode === 'launch' || s.pend === 'launch' ? 'def' : 'launch' }); else toast('Select one of your silos first', true); break;
    case 'fire': fire(false); break;
    case 'salvo': fire(true); break;
    case 'cleartarget': app.target = null; break;
    case 'fighter': case 'bomber': if (s && !s.kind && s.bloc === app.me && UNIT[s.type][k === 'fighter' ? 'fi' : 'bo']) { if (v.defcon > 3) { toast('Air operations start at DEFCON 3', true); break; } app.mode2 = 'air'; app.airKind = k; toast('Choose a destination for the ' + k); } else toast('Select an airbase' + (k === 'fighter' ? ' or carrier' : '') + ' first', true); break;
    case 'recall': if (s && s.kind) order({ op: 'recall', id: s.id }); break;
    case 'sat': if (v.defcon > 2) toast('Satellites can be tasked from DEFCON 2', true); else if (!v.my.sats) toast('No satellite passes left', true); else { app.mode2 = 'sat'; app.sel = null; toast('Choose where to look'); } break;
    case 'diplo': openDiplo(); break;
    case 'strike': openStrike(); break;
    case 'war': app.warRoom = !app.warRoom; break;
    case 'cancel': app.mode2 = null; break;
    case 'cancelorders': order({ op: 'cancel' }); break;
    case 'desel': app.sel = null; app.target = null; break;
  }
}
function syncSpeed() { if (app.game) app.game.speed = app.paused ? 0 : app.ff ? 16 : app.speed; }

/* ============================== modals: strike package, hotline, pause ============================== */
let modalKind = null; const strike = { target: null, pkg: 'counterforce', count: 6, sync: true };
function openModal(kind, html) { modalKind = kind; $('mpanel').innerHTML = html; go('play-modal'); }
function closeModal() { modalKind = null; go('play'); }
function openStrike() {
  const v = V(); if (!v || v.over) return;
  const foes = v.blocs.filter(b => b.active && b.id !== app.me && !v.blocs[app.me].allies.includes(b.id));
  if (strike.target == null || !foes.some(f => f.id === strike.target)) strike.target = foes[0] ? foes[0].id : null;
  const wh = myUnits().filter(u => u.type === 'silo' || u.type === 'sub').reduce((s, u) => s + (u.wh || 0), 0);
  strike.count = Math.max(1, Math.min(strike.count, wh || 1));
  const known = v.units.filter(u => u.bloc === strike.target && u.alive), kn = t => known.filter(u => u.type === t).length;
  const P = { counterforce: ['COUNTERFORCE', 'Known silos, radars and airbases (' + (kn('silo') + kn('radar') + kn('airbase')) + ' known). Disarms them, if you know where they are.'], defense: ['DEFENSE SUPPRESSION', 'Known air-defense sites (' + kn('sam') + ') and the cities they shield. Opens the way for what follows.'], countervalue: ['COUNTERVALUE', 'Cities. Maximum casualties. It ends the argument, and everything else.'], full: ['ALL-OUT', 'Everything known, then cities.'] };
  let h = '<div class="ph"><span>STRATEGIC STRIKE PACKAGE</span><button class="btn x" data-m="close">✕</button></div>';
  if (v.defcon > 1) h += '<div class="mtext" style="color:#ffb3a8">Nuclear release is only authorised at DEFCON 1. You can plan, but not execute.</div>';
  h += '<div class="mrow"><span class="lbl">TARGET BLOC</span>' + foes.map(b => '<button class="btn chip' + (strike.target === b.id ? ' on' : '') + '" data-st="' + b.id + '"><i style="background:' + BL[b.id].color + ';color:' + BL[b.id].color + '"></i>' + BL[b.id].short + '</button>').join('') + '</div>';
  h += '<div class="mrow"><span class="lbl">PACKAGE</span>' + Object.entries(P).map(([k, p]) => '<button class="btn chip' + (strike.pkg === k ? ' on' : '') + '" data-pkg="' + k + '">' + p[0] + '</button>').join('') + '</div><div class="mtext">' + P[strike.pkg][1] + '</div>';
  h += '<div class="mrow"><span class="lbl">WARHEADS: <b id="scount" style="color:#fff">' + strike.count + '</b> OF ' + wh + ' AVAILABLE</span><input type="range" id="srange" min="1" max="' + Math.max(1, wh) + '" value="' + strike.count + '"></div>';
  h += '<div class="mrow"><button class="btn chip' + (strike.sync ? ' on' : '') + '" data-sync="1">SIMULTANEOUS IMPACT: ' + (strike.sync ? 'ON' : 'OFF') + '</button></div><div class="mtext">Silos used are switched to LAUNCH mode and stop intercepting. Every launch is seen by the world.</div>';
  h += '<div class="bfoot"><button class="btn" data-m="close">' + (TOUCH ? 'CANCEL' : 'CANCEL (ESC)') + '</button><button class="btn go" data-m="exec"' + (v.defcon > 1 || !wh || strike.target == null ? ' disabled' : '') + '>' + (TOUCH ? 'AUTHORISE' : 'AUTHORISE (SPACE)') + '</button></div>';
  openModal('strike', h);
  $('srange').addEventListener('input', e => { strike.count = +e.target.value; $('scount').textContent = strike.count; });
}
function openDiplo() {
  const v = V(); if (!v || v.over) return; const me = v.blocs[app.me];
  let h = '<div class="ph"><span>THE HOTLINE</span><button class="btn x" data-m="close">✕</button></div><div class="mtext">Diplomacy happens in real time. CPU blocs answer by personality, and by how much they fear and trust you.</div>';
  for (const b of v.blocs.filter(b => b.active && b.id !== app.me)) {
    const ally = me.allies.includes(b.id), st = ally ? 'ALLIED' : b.cf ? 'CEASEFIRE ' + b.cf + 's' : 'HOSTILE';
    const pers = b.pers === 'human' ? 'human commander' : b.pers ? 'analysts assess: ' + ({ hawk: 'hawkish', cautious: 'cautious', opportunist: 'opportunistic' }[b.pers]) : '';
    h += '<div class="drow"><div><div class="nm"><i style="background:' + BL[b.id].color + '"></i>' + BL[b.id].name + '</div><div class="st">' + st + ' · ' + shortM(b.pop) + ' alive · ' + pers + '</div></div><div class="acts">' +
      (ally ? '' : '<button class="btn" data-dip="alliance" data-tg="' + b.id + '">ALLIANCE</button>') + (ally || b.cf ? '' : '<button class="btn" data-dip="ceasefire" data-tg="' + b.id + '">CEASEFIRE</button>') +
      (ally ? '' : '<button class="btn" data-dip="force" data-tg="' + b.id + '">SHOW OF FORCE</button><button class="btn" data-dip="bluff" data-tg="' + b.id + '">BLUFF</button>') + '</div></div>';
  }
  h += '<div class="mrow" style="margin-top:12px"><button class="btn" data-dip="standdown">STAND DOWN (90 s)</button><span class="mtext">Locks your silos in defense and lowers everyone’s tension.</span></div>';
  h += '<div class="bfoot"><span></span><button class="btn" data-m="close">' + (TOUCH ? 'CLOSE' : 'CLOSE (ESC)') + '</button></div>';
  openModal('diplo', h);
}
function openPause() {
  if (app.role === 'sp') { app.paused = true; syncSpeed(); }
  openModal('pause', '<div class="ph"><span>' + (app.role === 'sp' ? 'PAUSED' : 'MENU') + '</span></div><div class="menu" style="width:100%"><button class="btn go" data-m="resume">RESUME</button><button class="btn" data-m="how">HOW TO PLAY</button><button class="btn" data-m="hints">TIPS: ' + (app.hints ? 'ON' : 'OFF') + '</button><button class="btn" data-m="sound">SOUND: ' + (AU.on ? 'ON' : 'OFF') + '</button><button class="btn" data-m="quit">QUIT TO TITLE</button><a class="btn" href="../../" style="text-decoration:none">BACK TO ARCADE</a></div>');
}
function resume() { if (modalKind === 'pause' && app.role === 'sp') { app.paused = false; syncSpeed(); } closeModal(); }
$('modal').addEventListener('click', e => {
  if (e.target === $('modal')) { resume(); return; }
  const b = e.target.closest('.btn'); if (!b) return; const d = b.dataset; AU.S.click();
  if (d.m === 'close' || d.m === 'resume') resume();
  else if (d.m === 'how') { closeModal(); openBrief(false); }
  else if (d.m === 'hints') { app.hints = !app.hints; localStorage.setItem('mc-hints', app.hints ? 'on' : 'off'); b.textContent = 'TIPS: ' + (app.hints ? 'ON' : 'OFF'); if (!app.hints) $('hint').classList.remove('show'); }
  else if (d.m === 'sound') { AU.setOn(!AU.on); b.textContent = 'SOUND: ' + (AU.on ? 'ON' : 'OFF'); }
  else if (d.m === 'quit') { closeModal(); toTitle(); }
  else if (d.m === 'exec') { const r = order({ op: 'strike', target: strike.target, pkg: strike.pkg, count: strike.count, sync: strike.sync }); if (r.ok) { closeModal(); toast(r.pending ? 'Strike package sent' : r.msg || 'Strike package authorised'); } }
  else if (d.st) { strike.target = +d.st; openStrike(); } else if (d.pkg) { strike.pkg = d.pkg; openStrike(); } else if (d.sync) { strike.sync = !strike.sync; openStrike(); }
  else if (d.dip) { order({ op: 'diplo', act: d.dip, target: d.tg !== undefined ? +d.tg : app.me }); closeModal(); }
});

/* ============================== messages ============================== */
let toastT = 0, bigT = 0, hintT = 0;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function bigMsg(a, b, red) { const m = $('bigmsg'); m.innerHTML = '<b class="' + (red ? 'd1' : '') + '">' + esc(a) + '</b><span>' + esc(b || '') + '</span>'; m.classList.add('show'); clearTimeout(bigT); bigT = setTimeout(() => m.classList.remove('show'), 3200); }
const tapW = TOUCH ? 'tap' : 'click';
const HINTS = {
  5: 'DEFCON 5 · Deploy. Pick a unit' + (TOUCH ? '' : ' (1–6)') + ' and ' + tapW + ' inside your glowing territory; subs and carriers go in your coastal waters. Short on time? AUTO-DEPLOY.',
  4: 'DEFCON 4 · Last chance to deploy. Enemy forces stay hidden until radar, ships or aircraft find them.',
  3: 'DEFCON 3 · Fleets may move: select a ship, then ' + tapW + ' the sea. Launch fighters (F) to scout. Switch some silos to LAUNCH (M), or keep them defending.',
  2: 'DEFCON 2 · Task spy satellites (T) to find enemy silos. Work the hotline (D): alliances, ceasefires, bluffs.',
  1: 'DEFCON 1 · Release authorised. Select a launcher → ' + tapW + ' a target → ' + (TOUCH ? 'FIRE' : 'SPACE') + '. ' + (TOUCH ? 'STRIKE PACKAGE' : 'ENTER') + ' plans a coordinated strike. Or hold, and let deterrence decide.',
};
function showHint(d) { if (!app.hints || !HINTS[d]) return; const h = $('hint'); h.textContent = HINTS[d]; h.classList.add('show'); clearTimeout(hintT); hintT = setTimeout(() => h.classList.remove('show'), 15000); }
function pushNews(text, kind) {
  app.ticker.unshift({ text, kind }); app.ticker.length = Math.min(app.ticker.length, 8);
  $('tickin').innerHTML = app.ticker.map(n => '<span class="' + (n.kind || '') + '">' + esc(n.text) + '</span>').join('');
  AU.S.teletype();
}

/* ============================== events from the war ============================== */
const cinematic = () => !globe.userCam || globe.time - globe.userCam > 4;
function distTo(lat, lon) { const c = globe.camState; const d = S.gc(lat, lon, c.lat, c.lon); return Math.max(0, Math.min(1, 1 - d / 100)) * Math.max(0.25, Math.min(1, 2.2 / c.dist)); }
function flash(a) { const f = $('flashfx'); f.style.transition = 'none'; f.style.opacity = a; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity 1.8s ease-out'; f.style.opacity = 0; })); }
function handleEvents(list) {
  for (const e of list) {
    globe.event(e);
    switch (e.type) {
      case 'news': pushNews(e.text, e.kind); break;
      case 'defcon': app.lastDefcon = e.defcon; AU.S.defcon(e.defcon); AU.setLevel(e.defcon); bigMsg('DEFCON ' + e.defcon, ['', 'NUCLEAR RELEASE AUTHORISED', 'SATELLITES AND HOTLINE ACTIVE', 'FLEETS AND AIRCRAFT MAY MOVE', 'FINAL DEPLOYMENT', ''][e.defcon], e.defcon === 1); showHint(e.defcon);
        if (e.defcon === 3) app.place = null; if (app.ff) { app.ff = 0; syncSpeed(); } break;
      case 'launch': AU.S.launch(distTo(e.lat, e.lon)); break;
      case 'ifire': AU.S.ifire(); break;
      case 'intercept': if (distTo(e.lat, e.lon) > 0.3) AU.S.intercept(); break;
      case 'det': {
        const d = distTo(e.lat, e.lon); AU.S.boom(d, 1);
        if (!app.sawDet) { app.sawDet = true; app.slow = 0.25; app.slowUntil = performance.now() + 4500; if (cinematic()) globe.focus(e.lat, e.lon, 1.8); flash(0.8); }
        else { if (e.tb === app.me && cinematic() && performance.now() - app.focusT > 7000) { app.focusT = performance.now(); globe.focus(e.lat, e.lon, Math.max(1.7, Math.min(2.4, globe.camState.tdist))); } if (d > 0.7) flash(0.22 * d); }
        break; }
      case 'first': if (e.bloc !== app.me) bigMsg('LAUNCH DETECTED', BL[e.bloc].name.toUpperCase(), true); break;
      case 'offer': AU.S.radio(); toast(BL[e.from].name + ' proposes ' + (e.kind === 'alliance' ? 'an alliance' : 'a ceasefire')); break;
      case 'mode': AU.S.click(); break;
      case 'final': AU.S.alert(); break;
      case 'over': setTimeout(() => showEnd(e.result), 3500); break;
    }
  }
}

/* ============================== end screen ============================== */
const EPI = ['Every bloc lost something today. In this game, as in the real one, the only strategy that never fails is the one where nobody begins.', 'Scores are a convenience. The dead do not count them.', 'There was a winner on the scoreboard. There was no winner anywhere else.'];
function showEnd(r) {
  if (!r || (app.screen === 'end' && !app.endLook)) return; app.endLook = false; AU.siren(false); AU.setLevel(5); app.lastResult = r;
  const rows = r.blocs.slice().sort((a, b) => b.score - a.score), me = r.blocs.find(b => b.id === app.me) || { deaths: 0, kills: 0, score: 0 };
  const win = BL[r.winner], iWon = r.winner === app.me;
  let h = '';
  if (r.deterrence) h += '<div class="endt" style="color:#48ff9a">DETERRENCE HELD</div><div class="endsub">No warhead was ever fired. The ' + win.name + ' prevails on posture alone' + (iWon ? ' (that is you)' : '') + '. The only kind of victory that leaves anyone to celebrate it.</div>';
  else h += '<div class="endt">' + (iWon ? 'YOU “WIN”' : win.short + ' SCORES HIGHEST') + '</div><div class="endsub"><b>' + fmtM(r.total) + '</b> people are dead. ' + r.dark + ' cities are dark.<br>Your bloc lost <b>' + fmtM(me.deaths) + '</b>. Your weapons killed <b>' + fmtM(me.kills) + '</b>.</div>';
  h += '<table class="endtable"><tr><th>BLOC</th><th>POPULATION LOST</th><th>CASUALTIES CAUSED</th><th>SCORE</th></tr>' + rows.map(b => '<tr class="' + (b.id === app.me ? 'me' : '') + '"><td style="color:' + BL[b.id].color + '">' + BL[b.id].name + (b.id === app.me ? ' (you)' : '') + '</td><td>' + shortM(b.deaths) + ' · ' + Math.round(b.deaths / b.pop0 * 100) + '%</td><td>' + shortM(b.kills) + '</td><td><b>' + b.score + '</b></td></tr>').join('') + '</table>';
  h += '<div class="epi">' + EPI[r.deterrence ? 0 : (Math.floor(r.total) % EPI.length)] + '</div>';
  h += '<div class="bfoot">' + (app.online ? '<button class="btn go" data-e="again">REMATCH</button><button class="btn" data-e="title">MAIN MENU</button>' : '<button class="btn go" data-e="again">PLAY AGAIN</button><button class="btn" data-e="select">LEVEL SELECT</button><button class="btn" data-e="title">MAIN MENU</button>') + '<button class="btn" data-e="look">VIEW THE WORLD</button></div>';
  $('endp').innerHTML = h; go('end');
}
$('end').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; AU.S.click(); const a = b.dataset.e;
  if (a === 'again') { if (app.online) { app.online.mineAgain = true; Net.send({ t: 'again' }); b.textContent = app.online.theirAgain ? 'STARTING…' : 'WAITING FOR BUDDY…'; maybeRematch(); } else startSP(); }
  else if (a === 'select') { app.game = null; app.view = null; app.mode = 'sp'; openSelect(); } else if (a === 'title') toTitle();
  else if (a === 'look') { app.endLook = true; go('play'); toast('ESC (or the ≡ menu) returns to the results'); }
});

/* ============================== online ============================== */
function hostOnline() {
  AU.init(); app.online = { role: 'host', mineAgain: false, theirAgain: false }; Net.host();
  $('otitle').textContent = 'TWO-PLAYER GAME (ONLINE)';
  $('omsg').textContent = 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.';
  $('oentry').classList.remove('show'); $('obtns').innerHTML = '<span class="mtext">They pick “JOIN TWO-PLAYER GAME IN PROGRESS” on their own device. No code needed.</span><button class="btn" data-act="ocancel">CANCEL</button>';
  go('online');
}
function joinOnline(code) {
  AU.init(); app.online = { role: 'guest', mineAgain: false, theirAgain: false }; if (code) Net.join(code); else Net.joinAny();
  $('otitle').textContent = 'JOIN TWO-PLAYER GAME'; $('omsg').textContent = ''; $('ocode').textContent = ''; $('oentry').classList.remove('show'); $('obtns').innerHTML = '<span></span><button class="btn" data-act="ocancel">CANCEL</button>';
  go('online');
}
function onlineTick() {
  if (!app.online) return; const st = Net.st, dots = '.'.repeat(1 + Math.floor(performance.now() / 400) % 3);
  if (app.screen === 'online') {
    if (app.online.role === 'host') { $('ostatus').textContent = st.status === 'error' ? st.error : st.status === 'waiting' ? 'WAITING FOR YOUR BUDDY' + dots : st.status === 'connected' ? 'CONNECTED! STARTING' + dots : 'OPENING THE GAME' + dots; setHTML('ocode', '<span style="font-size:11px;letter-spacing:3px;color:var(--dim);display:block">BACKUP CODE</span>' + (st.code || '-----')); }
    else if (st.status === 'nogame' || st.status === 'error') {
      $('ostatus').textContent = ''; const msg = st.error || 'Nobody has started a two-player game yet. Ask your buddy to pick “TWO-PLAYER GAME (ONLINE)” first.';
      if ($('omsg').textContent !== msg) { $('omsg').textContent = msg; $('obtns').innerHTML = '<button class="btn" data-act="oretry">RETRY</button><button class="btn" data-act="ocodeask">ENTER CODE INSTEAD</button><button class="btn" data-act="ocancel">CANCEL</button>'; focusFirst(); }
    } else $('ostatus').textContent = st.status === 'connected' ? 'CONNECTED! STARTING' + dots : st.via === 'code' ? 'LOOKING FOR GAME ' + st.code + dots : 'LOOKING FOR A GAME IN PROGRESS' + dots;
  }
  const inGame = app.screen === 'play' || app.screen === 'play-modal' || app.screen === 'end';
  if (inGame && st.status === 'error' && !app.online.lost) { app.online.lost = true; AU.siren(false); toast(st.error || 'CONNECTION LOST', true);
    if (!(V() && V().over)) { $('endp').innerHTML = '<div class="endt">LINK LOST</div><div class="endsub">' + esc(st.error || 'Your buddy disconnected.') + '</div><div class="bfoot"><span></span><button class="btn" data-e="title">MAIN MENU</button></div>'; go('end'); } }
}
$('online').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; AU.S.click(); const a = b.dataset.act;
  const searching = () => { $('omsg').textContent = ''; $('oentry').classList.remove('show'); $('obtns').innerHTML = '<span></span><button class="btn" data-act="ocancel">CANCEL</button>'; };
  if (a === 'ocancel') toTitle();
  else if (a === 'oretry') { searching(); Net.joinAny(); }
  else if (a === 'ocodeask') { $('oentry').classList.add('show'); $('omsg').textContent = 'Type the backup code shown on your buddy’s screen.'; $('obtns').innerHTML = '<span></span><button class="btn" data-act="ocancel">CANCEL</button>'; $('ocodein').focus(); }
  else if (a === 'ojoincode') { const c = $('ocodein').value.trim().toUpperCase(); if (c.length === 5) { searching(); Net.join(c); } else toast('The code has 5 characters', true); }
});
function maybeRematch() { const o = app.online; if (o && o.mineAgain && o.theirAgain && o.role === 'host') { o.mineAgain = o.theirAgain = false; hostStart(); } }
function hostStart() {
  const c = app.cfg, cfg = makeCfg([c.bloc, c.opp]); cfg.hostBloc = c.bloc; cfg.guestBloc = c.opp;
  Object.assign(app.online, { guestBloc: c.opp, evq: [], sendT: 0, lost: false });
  Net.send({ t: 'go', cfg }); startGame(cfg, c.bloc, 'host');
}
Net.onMessage = m => {
  const o = app.online; if (!o) return;
  switch (m.t) {
    case 'hello': if (o.role === 'host') hostStart(); break;
    case 'go': if (o.role === 'guest') { o.mineAgain = o.theirAgain = false; o.lost = false; startGame(m.cfg, m.cfg.guestBloc, 'guest'); } break;
    case 'v': if (o.role === 'guest' && app.role === 'guest') { app.gview = m.v; app.recvAt = performance.now(); app.view = m.v; if (m.ev && m.ev.length) handleEvents(m.ev); } break;
    case 'c': if (o.role === 'host' && app.game) { const r = app.game.command(o.guestBloc, m.c); Net.send({ t: 'r', q: m.q, ok: r.ok, msg: r.msg || '', busy: !!r.busy }); } break;
    case 'r': if (o.role === 'guest') { const p = app.pendQ[m.q]; delete app.pendQ[m.q]; if (p) afterOrder(p.c, { ok: m.ok, msg: m.msg, busy: m.busy }, p.quiet); } break;
    case 'again': o.theirAgain = true; maybeRematch(); break;
  }
};

/* ============================== input: pointer / touch / trackpad ============================== */
const ptrs = new Map(); let drag = null, pinch = null;
const gl = $('gl');
gl.addEventListener('pointerdown', e => { AU.init(); usingKeys = false; try { gl.setPointerCapture(e.pointerId); } catch (_) { } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; if (drag) drag.moved = true; } });
gl.addEventListener('pointermove', e => {
  app.mouse.x = e.clientX; app.mouse.y = e.clientY; if (globe && globe.ready) app.mouse.ll = globe.pick(e.clientX, e.clientY);
  const p = ptrs.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size >= 2 && pinch) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; globe.zoom(pinch.d / Math.max(1, d)); globe.rotate(cx - pinch.cx, cy - pinch.cy); pinch = { d, cx, cy }; return; }
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > (e.pointerType === 'mouse' ? 4 : 10)) drag.moved = true; if (drag.moved) globe.rotate(dx, dy); drag.x = e.clientX; drag.y = e.clientY; }
});
const endPtr = e => { const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (!had) return;
  if (ptrs.size === 0) { if (drag && !drag.moved && app.screen === 'play') clickAt(e.clientX, e.clientY); drag = null; pinch = null; }
  else if (ptrs.size === 1) { const [a] = [...ptrs.values()]; drag = { x: a.x, y: a.y, sx: a.x, sy: a.y, moved: true }; pinch = null; } };
gl.addEventListener('pointerup', endPtr); gl.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; pinch = null; });
gl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) app.mouse.ll = null; });
gl.addEventListener('wheel', e => { e.preventDefault(); if (globe) globe.zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0016) * (e.deltaMode === 1 ? 16 : 1))); }, { passive: false });
let gs = 1; document.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; }); document.addEventListener('gesturechange', e => { e.preventDefault(); if (globe && e.target === gl) globe.zoom(gs / e.scale); gs = e.scale; });
gl.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('.panel, .side, #palette')) e.preventDefault(); }, { passive: false });

/* ============================== input: keyboard ============================== */
function escape() {
  const sc = app.screen, v = V();
  if (sc === 'play-modal') resume();
  else if (sc === 'select' || sc === 'online') toTitle();
  else if (sc === 'brief') { if (app.briefStart) go('select'); else briefExit(); }
  else if (sc === 'end') { if (app.lastResult) { app.endLook = true; go('play'); } }
  else if (sc === 'play' && v) { if (app.endLook) showEnd(app.lastResult); else if (app.mode2) app.mode2 = null; else if (app.target) app.target = null; else if (app.sel != null) app.sel = null; else if (app.place && v.defcon >= 4) app.place = null; else openPause(); }
}
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') $('online').querySelector('[data-act=ojoincode]').click(); return; }
  if (e.metaKey || e.ctrlKey) return;
  AU.init(); const k = e.key, sc = app.screen;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab'].includes(k)) e.preventDefault();
  if (k === 'Escape') { escape(); return; }
  if (sc !== 'play') {
    if (k === 'ArrowUp') moveFocus(0, -1); else if (k === 'ArrowDown') moveFocus(0, 1); else if (k === 'ArrowLeft') moveFocus(-1, 0); else if (k === 'ArrowRight') moveFocus(1, 0);
    else if (k === 'Tab') moveFocus(e.shiftKey ? -1 : 1, 0);
    else if (k === 'Enter' || k === ' ') { if (sc === 'play-modal' && modalKind === 'strike' && !document.querySelector('#modal .btn.focus')) { const x = document.querySelector('[data-m=exec]'); if (x && !x.disabled) x.click(); } else if (!pressFocus()) { usingKeys = true; focusFirst(); } }
    if (k.startsWith('Arrow') || k === 'Tab') usingKeys = true;
    return;
  }
  const v = V(); if (!v) return;
  if (k >= '1' && k <= '6') { cycleType(TYPES[+k - 1]); return; }
  switch (k) {
    case ' ': fire(e.shiftKey); break;
    case 'Enter': openStrike(); break;
    case 'm': case 'M': cmd('mode'); break;
    case 'f': case 'F': cmd('fighter'); break;
    case 'b': case 'B': cmd('bomber'); break;
    case 'r': case 'R': cmd('recall'); break;
    case 't': case 'T': cmd('sat'); break;
    case 'd': case 'D': openDiplo(); break;
    case 'l': case 'L': if (v.defcon <= 3) cmd('low'); break;
    case 'v': case 'V': app.warRoom = !app.warRoom; break;
    case 'p': case 'P': if (app.role === 'sp') { app.paused = !app.paused; syncSpeed(); } break;
    case ']': if (app.role !== 'guest') { app.speed = Math.min(8, app.speed * 2); app.paused = false; app.ff = 0; syncSpeed(); } break;
    case '[': if (app.role !== 'guest') { app.speed = Math.max(1, app.speed / 2); app.ff = 0; syncSpeed(); } break;
    case 'Delete': case 'Backspace': cmd('remove'); break;
    case '+': case '=': globe.zoom(0.85); break; case '-': case '_': globe.zoom(1.18); break;
    case 'ArrowLeft': globe.rotate(-25, 0); break; case 'ArrowRight': globe.rotate(25, 0); break; case 'ArrowUp': globe.rotate(0, -25); break; case 'ArrowDown': globe.rotate(0, 25); break;
    case 'h': case 'H': openBrief(false); break;
    case 'n': case 'N': AU.setOn(!AU.on); toast('Sound ' + (AU.on ? 'on' : 'off')); break;
  }
});
$('hud').querySelector('[data-act=menu]').addEventListener('click', e => { if (app.endLook) { e.stopPropagation(); showEnd(app.lastResult); } }, true);

/* ============================== input: gamepad ============================== */
const gpPrev = {};
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = [...pads].find(x => x && x.connected); if (!p) return;
  const btn = i => !!(p.buttons[i] && p.buttons[i].pressed), edge = i => { const b = btn(i), was = gpPrev[i]; gpPrev[i] = b; return b && !was; };
  const dz = v => Math.abs(v) < 0.15 ? 0 : v; const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
  if ((lx || ly || rx || ry || p.buttons.some(b => b.pressed)) && !app.gp.on) { app.gp.on = true; app.gp.x = innerWidth / 2; app.gp.y = innerHeight / 2; usingKeys = true; AU.init(); focusFirst(); }
  const E = {}; for (const i of [0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15]) E[i] = edge(i);
  if (app.screen !== 'play') {
    if (E[12]) moveFocus(0, -1); if (E[13]) moveFocus(0, 1); if (E[14]) moveFocus(-1, 0); if (E[15]) moveFocus(1, 0);
    app.gp.nt = (app.gp.nt || 0) - dt; if ((Math.abs(lx) > 0.6 || Math.abs(ly) > 0.6) && app.gp.nt <= 0) { app.gp.nt = 0.22; Math.abs(lx) > Math.abs(ly) ? moveFocus(Math.sign(lx), 0) : moveFocus(0, Math.sign(ly)); }
    if (E[0]) { if (!pressFocus()) focusFirst(); } if (E[1] || E[9]) escape(); return;
  }
  app.gp.x = Math.max(0, Math.min(innerWidth, app.gp.x + lx * 520 * dt)); app.gp.y = Math.max(0, Math.min(innerHeight, app.gp.y + ly * 520 * dt));
  if (lx || ly) { app.mouse.x = app.gp.x; app.mouse.y = app.gp.y; app.mouse.ll = globe.pick(app.gp.x, app.gp.y); }
  if (rx || ry) globe.rotate(rx * 600 * dt, ry * 600 * dt);
  const lt = p.buttons[6] ? p.buttons[6].value : 0, rt = p.buttons[7] ? p.buttons[7].value : 0; if (lt > 0.1 || rt > 0.1) globe.zoom(Math.exp((lt - rt) * dt * 1.6));
  if (E[0]) clickAt(app.gp.x, app.gp.y); if (E[1]) escape(); if (E[2]) fire(false); if (E[3]) openStrike();
  if (E[4] || E[5]) { const s = findSel(); const i = Math.max(0, TYPES.indexOf(app.place || (s && s.type) || 'silo')); cycleType(TYPES[(i + (E[5] ? 1 : TYPES.length - 1)) % TYPES.length]); }
  if (E[9]) openPause(); if (E[8]) app.warRoom = !app.warRoom;
  if (app.role !== 'guest') { if (E[12]) { app.speed = Math.min(8, app.speed * 2); syncSpeed(); } if (E[13]) { app.speed = Math.max(1, app.speed / 2); syncSpeed(); } }
}

/* ============================== main loop ============================== */
function labelFn(x) {
  const v = V(); if (!v) return;
  if (app.gp.on && app.screen === 'play') { const { x: cx, y: cy } = app.gp; x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.moveTo(cx - 16, cy); x.lineTo(cx - 5, cy); x.moveTo(cx + 5, cy); x.lineTo(cx + 16, cy); x.moveTo(cx, cy - 16); x.lineTo(cx, cy - 5); x.moveTo(cx, cy + 5); x.lineTo(cx, cy + 16); x.stroke(); }
  if (app.place && v.defcon >= 4 && app.mouse.ll && !TOUCH) { x.font = '600 11px -apple-system, sans-serif'; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.7)'; const ok = canPlaceHere(app.place, app.mouse.ll), s = NICE[app.place] + ' · ' + UNIT[app.place].cost; x.strokeText(s, app.mouse.x + 16, app.mouse.y + 18); x.fillStyle = ok ? '#9dffc8' : '#ff8a78'; x.fillText(s, app.mouse.x + 16, app.mouse.y + 18); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.max(0, (now - last) / 1000), dt = Math.min(0.1, rawDt), simDt = Math.min(0.25, rawDt); last = now; app.rt += dt;
  if (!globe || !globe.ready) return;
  if (app.slow < 1 && now > app.slowUntil) app.slow = Math.min(1, app.slow + dt * 0.5);
  pollPad(dt);
  const playing = app.screen === 'play' || app.screen === 'play-modal' || app.screen === 'end';
  if (playing && app.game) {
    const g = app.game; syncSpeed();
    if (!app.paused) { acc += simDt * g.speed * app.slow; let n = 0; while (acc >= 0.1 && n++ < 240) { g.step(0.1); acc -= 0.1; } if (n >= 240) acc = 0; }
    app.simT = g.t + (app.paused ? 0 : acc);
    if (g.events.length) { const evs = g.events.splice(0); handleEvents(g.eventsFor(app.me, evs)); if (app.online && app.online.role === 'host' && app.online.evq) app.online.evq.push(...g.eventsFor(app.online.guestBloc, evs)); }
    app.view = g.viewFor(app.me);
    if (app.online && app.online.role === 'host' && app.online.evq) { app.online.sendT -= dt; if (app.online.sendT <= 0 || app.online.evq.length > 40) { app.online.sendT = 0.2; Net.send({ t: 'v', v: g.viewFor(app.online.guestBloc), ev: app.online.evq.splice(0) }); } }
  } else if (playing && app.role === 'guest' && app.gview) {
    app.simT = app.gview.t + Math.min(1.5, (now - app.recvAt) / 1000) * (app.gview.speed || 0) * app.slow;
  }
  onlineTick();
  const v = playing ? app.view : null;
  if (!playing) { globe.camState.tlon += dt * 2.2; globe.camState.tlat += (24 - globe.camState.tlat) * dt * 0.2; globe.camState.tdist += (3.3 - globe.camState.tdist) * dt * 0.3; }
  globe.sel = app.sel != null ? { id: app.sel } : null;
  const hv = playing && !TOUCH && app.mouse.x >= 0 ? unitAt(app.mouse.x, app.mouse.y) : null; globe.hover = hv ? { id: hv.id } : null;
  gl.style.cursor = hv ? 'pointer' : (app.place && v && v.defcon >= 4) || app.mode2 ? 'crosshair' : 'grab';
  let cursor = null; const arcs = [];
  if (v && !v.over) {
    const ll = app.mouse.ll;
    if (app.place && v.defcon >= 4 && ll && !TOUCH) cursor = { lat: ll[0], lon: ll[1], r: 1.2, color: canPlaceHere(app.place, ll) ? '#48ff9a' : '#ff4b3a' };
    if (app.mode2 === 'sat' && ll) cursor = { lat: ll[0], lon: ll[1], r: 16, color: '#cfd8ff' };
    if (app.mode2 === 'air' && ll) cursor = { lat: ll[0], lon: ll[1], r: 1.5, color: '#4fd6ff' };
    const s = findSel();
    if (isLauncher(s) && v.defcon === 1) { const t = app.target || (!TOUCH ? ll : null); if (t) { const ok = targetOk(t); arcs.push({ from: [s.lat, s.lon], to: t, ok: ok && (s.type === 'sub' || s.mode === 'launch') }); cursor = { lat: t[0], lon: t[1], r: 1.6, color: ok ? '#ff4b3a' : '#888888' }; } }
  }
  globe.setCursor(cursor);
  globe.frame(dt, v, app.simT, { sunLon: playing ? undefined : globe.camState.lon + 70, warRoom: app.warRoom && playing, cities: CITIES, arcs, labelFn });
  hudT -= dt; if (playing && hudT <= 0) { hudT = 0.1; updateHUD(); }
}

/* ============================== boot ============================== */
async function boot() {
  globe = new Globe($('gl'), $('lab'), { sunStart: -20 });
  if (Q.get('q')) { globe.maxTier = +Q.get('q'); globe.tier = +Q.get('q'); globe.lockTier = true; }
  window.addEventListener('resize', () => { globe._sized = false; });
  try { await globe.load(f => { $('lprog').style.width = Math.round(f * 100) + '%'; }); }
  catch (err) { $('lmsg').textContent = 'COULD NOT LOAD: ' + err.message; console.error(err); return; }
  globe.setBlocs(BL.map(() => ({ active: true })), BL); globe.U.meBloc.value = -1;
  requestAnimationFrame(frame);
  // keep the loading screen up until the globe has really been drawn for a moment (WebKit can composite a big canvas tile-by-tile on its first frames)
  const t0 = performance.now(), ready = () => { if ((globe.time > 1.2 && globe.selfChecks > 0) || performance.now() - t0 > 6000) go('title'); else setTimeout(ready, 100); }; ready();
}
window.MC = { app, get globe() { return globe; }, get game() { return app.game; }, get view() { return app.view; }, get screen() { return app.screen; }, net: Net, go, startGame, startSP, makeCfg, order, clickAt, cmd, fire, select, openStrike, openDiplo, toTitle, sim: S, showEnd, escape };
boot();
