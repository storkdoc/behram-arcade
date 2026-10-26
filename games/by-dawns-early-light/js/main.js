/* BY DAWN'S EARLY LIGHT — main.js: boot, game loop, stations UI, cinematics glue, cockpit glue, input, online two-player. */
import { Stage, PHONE, IOS } from './render.js';
import { Cinema } from './cinema.js';
import { Cockpit } from './cockpit.js';
const S = window.BDSim, AU = window.BDAudio, $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const Q = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; if (TOUCH) document.body.classList.add('touch');
const RATE = 0.16; // game minutes per real second at 1× — the full night (300 min) is ~31 real minutes
const store = { get(k, d) { try { const v = localStorage.getItem('bdel.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('bdel.' + k, JSON.stringify(v)); } catch (e) { } } };
const app = window.BDEL = {
  screen: 'boot', diff: store.get('diff', 1), cineOn: store.get('cine', true), sound: store.get('sound', true), speed: 1, paused: false,
  game: null, view: null, role: 'sp', side: 0, station: 'post', selW: null, seen: 0, tick: [], online: null, q: 1, pendQ: {}, cp: null, busy: false, flags: {}, timeline: [],
};
let st = null, cin = null;

/* ------------------------------ boot ------------------------------ */
async function boot() {
  $('bootbar').style.width = '20%';
  st = new Stage($('gl'), $('labels'), {}); app.st = st;
  st.onSound = (k, v) => { if (k === 'rumble') AU.S.rumble(v); };
  await st.load(); $('bootbar').style.width = '80%';
  const R = $('cin'); cin = new Cinema(st, AU, { root: R, title: R.querySelector('.ctitle'), sub: R.querySelector('.csub'), fade: R.querySelector('.cfade') }); app.cin = cin;
  addEventListener('resize', () => { st._sized = false; });
  last = performance.now(); requestAnimationFrame(loop);
  // keep the loading screen until the renderer has proven itself (self-check ran)
  const t0 = performance.now(); while ((st.time < 1.2 || st.selfChecks < 1) && performance.now() - t0 < 6000) await new Promise(r => setTimeout(r, 100));
  $('bootbar').style.width = '100%'; AU.setOn(app.sound);
  if (Q.get('auto') === 'chapter') return startSP(Q.get('ch') || 'ch1', { skipIntro: true });
  go('title');
}
function go(name) {
  app.screen = name; document.querySelectorAll('.screen').forEach(s => s.classList.toggle('show', s.id === name));
  $('hud').hidden = !(name === 'play' || name === 'pause'); if (name === 'title') renderTitle();
  setTimeout(focusFirst, 30);
}
function focusFirst() { const sc = document.querySelector('.screen.show'); const b = sc && sc.querySelector('.btn:not([disabled])'); if (b && !TOUCH) b.focus({ preventScroll: true }); }
function toast(text, bad) { const d = document.createElement('div'); d.textContent = text; if (bad) d.className = 'bad'; $('toast').appendChild(d); setTimeout(() => d.remove(), 3200); while ($('toast').children.length > 3) $('toast').firstChild.remove(); }

/* ------------------------------ game control ------------------------------ */
function startSP(chapter, o = {}) {
  leaveOnline(); AU.init(); AU.setOn(app.sound);
  newGame({ seed: (Math.random() * 1e9) | 0, chapter, diff: app.diff, two: false }, 0, 'sp', o);
}
function newGame(cfg, side, role, o = {}) {
  app.cfg = cfg; app.side = side; app.role = role; app.seen = 0; app.tick = []; app.selW = null; app.flags = {}; app.timeline = []; app.cp = null; app.paused = false; app.speed = 1; app.endShown = false;
  app.game = role === 'guest' ? null : new S.Sim(cfg); app.view = app.game ? app.game.viewFor(side) : null;
  st.resetFx(); st.nStrikes = app.view ? app.view.strikes.length : 0; for (const n of st.nukes) n.dispose(); st.nukes = [];
  $('ticker').innerHTML = ''; app.station = 'post'; setStation('post');
  go('play'); renderAll(true);
  const ch = S.CHAPTERS.find(c => c.key === cfg.chapter) || S.CHAPTERS[0];
  const intro = o.skipIntro || !app.cineOn ? null : cfg.chapter === 'campaign' ? 'coldopen' : 'chapter';
  if (intro) playFilm(intro, { name: ch.name, sub: ch.sub, side, lon0: side ? 40 : -90 });
  else toast(ch.name);
  for (const h of (app.game ? app.game.history : [])) if (h.t < 0) app.timeline.push({ clock: S.clock(h.t), text: h.text });
}
function playFilm(key, ctx = {}) {
  if (!cin) return Promise.resolve(); app.busy = true; AU.init(); document.body.classList.add('cine');
  return cin.play(key, Object.assign({ side: app.side, dawn: dawnK() }, ctx)).then(() => { app.busy = false; document.body.classList.remove('cine'); AU.klaxon(false); AU.setMode(stationMode()); setStation(app.station); });
}
function dawnK() { const t = app.view ? app.view.t : 0; return Math.max(0, Math.min(1, (t - 200) / 100)); }
function stationMode() { return app.station === 'map' ? 'globe' : 'cabin'; }
function setStation(s) {
  app.station = s; document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.st === s));
  if (s === 'post') st.cabView('post'); else if (s === 'hotline') { st.cabView('hotline'); $('hlbadge').classList.remove('on'); }
  if (s === 'map' && app.view) { const me = app.view.me; st.focus(app.side ? 60 : 50, app.side ? 50 : -60, 3.0); }
  AU.setMode && AU.setMode(stationMode()); renderAll(true);
  $('hint').textContent = s === 'map' ? (TOUCH ? 'Drag to turn the globe · pinch to zoom · tap a wing' : 'Drag to turn · wheel to zoom · click a wing · ENTER transmits RECALL to the selected wing') : s === 'hotline' ? 'The direct line to the other side. What you say is remembered.' : (TOUCH ? '' : 'SPACE confirms · ENTER transmits recall · 1 2 3 switch stations · P pauses');
}
function cmd(c) {
  if (app.role === 'guest') { const q = app.q++; app.pendQ[q] = c; Net.send({ t: 'c', q, c }); AU.S.send(); return true; }
  if (!app.game) return false; const ok = app.game.cmd(app.side, c); if (ok) AU.S.send(); else AU.S.deny();
  pump(); return ok;
}

/* ------------------------------ loop ------------------------------ */
let last = 0, uiT = 0, demo = null, titleLon = -80;
function viewShift() { const P = $('panel'); if (!P || P.hidden || !P.offsetWidth) return {}; const r = P.getBoundingClientRect(); if (r.width < innerWidth * 0.8) return { shiftX: (r.left > innerWidth / 2 ? 1 : -1) * r.width / innerWidth / 2 }; return { shiftY: (r.top > innerHeight / 3 ? 1 : 0) * (innerHeight - r.top) / innerHeight / 2 * 0.8 }; }
function baseUI() { const t = app.view ? app.view.t : 20; return { SIDES: S.SIDES, LADDER: S.LADDER, sunLon: 75 - t / 4, dawn: dawnK(), tac: 1 }; }
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  try {
    pollPad(dt);
    const g = app.game, inPlay = app.screen === 'play';
    const hold = app.role === 'sp' && (app.busy || app.cp || app.paused);
    if (g && inPlay && !g.over && !hold) { g.step(dt * RATE * app.speed); pump(); }
    if (app.role === 'host' && g) hostSend(dt);
    let ui, V = app.view;
    if (cin && cin.active) { cin.update(dt); ui = Object.assign(baseUI(), { mode: 'cabin' }, cin.ui); }
    else if (app.cp) { app.cp.update(dt, cpInput()); ui = Object.assign(baseUI(), { mode: 'sky', skyFx: app.cp.fx, cover: 0.3 }); }
    else if (V && (inPlay || app.screen === 'pause' || app.screen === 'end')) ui = Object.assign(baseUI(), viewShift(), { mode: stationMode(), alert: V.me.inbox.some(i => i.kind === 'auth' || (i.left !== null && i.left < 1.2)) && V.ladder >= 4 });
    else { if (!demo) demo = new S.Sim({ seed: 11 }).viewFor(0); V = demo; titleLon += dt * 2.2; st.focus(42, titleLon, 3.3); ui = Object.assign(baseUI(), { mode: 'globe', noLabels: true, tac: 0.35, sunLon: titleLon + 70 }); }
    st.frame(dt, V, ui);
    uiT -= dt; if (uiT <= 0) { uiT = 0.25; if (app.screen === 'play' || app.screen === 'pause') renderAll(); onlineTick(); }
  } catch (e) { console.error(e); showErr(e); }
}
function showErr(e) { const b = $('err'); if (!b.hidden) return; b.hidden = false; b.textContent = 'Something went wrong: ' + (e && e.message || e) + ' — tap to reload.'; b.onclick = () => location.reload(); }

/* ------------------------------ events ------------------------------ */
function pump() {
  const g = app.game; if (!g) return;
  const ev = g.events(app.side, app.seen); if (ev.length) app.seen = ev[ev.length - 1].id;
  app.view = g.viewFor(app.side); handleEvents(ev);
  if (app.role === 'host' && app.online && app.online.evq) { const e2 = g.events(1, app.online.seen || 0); if (e2.length) { app.online.seen = e2[e2.length - 1].id; app.online.evq.push(...e2); } }
}
const LV = { bad: 'bad', warn: 'warn', good: 'good' };
function ticker(text, lvl) { if (!text) return; const d = document.createElement('div'); d.className = LV[lvl] || ''; d.textContent = (app.view ? app.view.clock + '  ' : '') + text; const T = $('ticker'); T.insertBefore(d, T.firstChild); while (T.children.length > 5) T.lastChild.remove(); setTimeout(() => d.remove(), 16000); }
function handleEvents(evs) {
  for (const e of evs) {
    const mine = e.side === -1 || e.side === app.side, clk = app.view ? app.view.clock : '';
    switch (e.type) {
      case 'item': AU.S.alert(); if (e.kind === 'hotline') { if (app.station !== 'hotline') $('hlbadge').classList.add('on'); if (!app.flags.hlFilm && app.cineOn && app.role !== 'guest' && !app.busy) { app.flags.hlFilm = 1; playFilm('hotline').then(() => setStation('hotline')); } } break;
      case 'hl': AU.S.teletype(6); if (app.station !== 'hotline') $('hlbadge').classList.add('on'); break;
      case 'ladder': AU.S.ladder(e.up); AU.setLevel(app.view.ladder); ticker(e.text, e.up ? 'bad' : 'good'); app.timeline.push({ clock: clk, text: e.text }); if (e.up) st.shake = Math.max(st.shake, 0.4); break;
      case 'strike': ticker(e.text, 'bad'); app.timeline.push({ clock: clk, text: e.text }); AU.S.rumble(0.8); flashScreen(0.35);
        if (app.cineOn && !app.busy && !app.cp && (app.flags.strikeFilms || 0) < 2 && app.role !== 'guest') { app.flags.strikeFilms = (app.flags.strikeFilms || 0) + 1; playFilm('strike', { text: e.text, on: e.on, side: app.side }); }
        break;
      case 'cease': AU.S.cease(); ticker(e.text, 'good'); toast('CEASEFIRE'); app.timeline.push({ clock: clk, text: e.text }); break;
      case 'crisis': AU.S.alert(); ticker(e.text, 'warn'); if (e.k === 'enemy' || e.k === 'radio') app.timeline.push({ clock: clk, text: e.text }); break;
      case 'hit': AU.S.hit(); st.shake = 1.2; ticker(e.text, 'bad'); break;
      case 'lost': ticker(e.text, 'bad'); app.timeline.push({ clock: clk, text: e.text }); break;
      case 'authres': ticker(e.text, e.lvl || (e.ok ? 'good' : 'bad')); break;
      case 'cockpit': if (e.side === app.side || mine) startCockpit(e.w, e.name); break;
      case 'end': onEnd(e.ending); break;
      default: if (e.text) ticker(e.text, e.lvl);
    }
  }
}
function flashScreen(k) { const f = $('fxflash'); f.style.transition = 'none'; f.style.opacity = k; requestAnimationFrame(() => { f.style.transition = 'opacity 1.4s'; f.style.opacity = 0; }); }

/* ------------------------------ HUD + panel ------------------------------ */
const STATE_TXT = { outbound: 'OUTBOUND', orbit: 'HOLDING', penetrate: 'BEYOND THE LINE', refuel: 'REFUELLING', recall: 'RECALLED — HOMEBOUND', home: 'HOME', lost: 'LOST', struck: 'STRUCK TARGET' };
let lastPanel = '', lastInbox = '';
function setHTML(el, h) { if (el.__h !== h) { el.__h = h; el.innerHTML = h; } }
function renderAll(force) {
  const V = app.view; if (!V) return; const me = V.me, SD = S.SIDES[app.side];
  $('clock').textContent = V.clock; const left = Math.max(0, V.t1 - V.t); $('todawn').textContent = (V.chapter === 'campaign' ? '' : 'CHAPTER · ') + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') + (V.t1 >= S.DAWN ? ' TO DAWN' : ' LEFT');
  $('ladder').textContent = S.LADDER[V.ladder]; $('ladderbar').style.clipPath = 'inset(0 ' + (100 - (V.ladder + 1) / S.LADDER.length * 100) + '% 0 0)';
  const stat = (l, v, lo, ok) => '<div class="stat"><span class="lbl">' + l + '</span><b class="' + (lo ? 'lo' : ok ? 'ok' : '') + '">' + v + '</b></div>';
  setHTML($('stats'), stat('LEGITIMACY', me.legit, me.legit < 40, me.legit >= 65) + stat('FUEL', me.fuel + 'm', me.fuel < 45) + stat('COMMS', me.comms + '%', me.comms < 40) + stat('TRUST', V.rel.trust, V.rel.trust < 30, V.rel.trust >= 55) + (V.cease.agreed ? stat('CEASEFIRE', 'HOLDING', 0, 1) : ''));
  setHTML($('speed'), app.role === 'sp' ? [['‖', 0], ['1×', 1], ['2×', 2], ['4×', 4]].map(([l, s]) => '<button class="btn chip' + ((s === 0 ? app.paused : !app.paused && app.speed === s) ? ' on' : '') + '" data-speed="' + s + '">' + l + '</button>').join('') : '');
  $('link').textContent = app.online && app.role !== 'sp' ? 'LINK ' + (Net.st.ping == null ? '--' : Math.round(Net.st.ping)) + ' MS' : '';
  // inbox
  let ib = '';
  for (const it of me.inbox) {
    ib += '<div class="card item ' + it.kind + '" data-item="' + it.id + '"><span class="tm" data-left="' + it.id + '"></span><div class="tt">' + esc(it.title) + '</div><div class="fr">' + esc(it.from) + '</div><div class="tx">' + esc(it.text) + '</div>';
    if (it.kind === 'auth') ib += '<div class="codes"><span>RECEIVED</span><b>' + esc(it.code.join(' ')) + '</b><span>YOUR CARD</span><b class="m">' + esc(me.card) + '</b></div>' + (it.queried ? '<div class="fr">Queried once. The sender repeated the same group.</div>' : '');
    ib += '<div class="choices">' + it.choices.map((c, i) => '<button class="btn' + (i === 0 && it.kind === 'auth' ? ' good' : c.k === 'reject' ? ' crit' : '') + '" data-ans="' + it.id + '" data-k="' + esc(c.k) + '">' + esc(c.label) + (c.hint ? '<span class="hint">' + esc(c.hint) + '</span>' : '') + '</button>').join('') + '</div></div>';
  }
  if (!me.inbox.length) ib = '<div class="card"><h3>INCOMING<span>' + esc(SD.post) + '</span></h3><div class="fr">No traffic waiting. ' + (V.cease.agreed ? 'Bring every aircraft home and keep the ceasefire.' : 'Watch the wings beyond the line, keep the post fuelled, keep talking.') + '</div></div>';
  const kf = document.activeElement && document.activeElement.dataset ? Object.assign({}, document.activeElement.dataset) : null;
  setHTML($('inbox'), ib);
  for (const it of me.inbox) { const el = document.querySelector('[data-left="' + it.id + '"]'); if (el && it.left !== null) { const s = Math.ceil(it.left / RATE / app.speed); el.textContent = s + 's'; el.className = 'tm' + (s < 12 ? ' lo' : ''); } }
  setHTML($('station'), app.station === 'post' ? postHTML(V) : app.station === 'hotline' ? hotHTML(V) : mapHTML(V));
  if (kf && document.activeElement === document.body) refocus(kf);
  const hb = $('hlbox'); if (hb && hb.__n !== V.hl.length) { hb.__n = V.hl.length; hb.scrollTop = 1e6; }
}
function refocus(kf) { const sel = Object.keys(kf).map(k => '[data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + '="' + CSS.escape(kf[k]) + '"]').join(''); const el = sel && document.querySelector('#panel ' + sel); if (el) el.focus({ preventScroll: true }); }
function meter(l, v, col) { return '<div class="meter"><span class="lbl">' + l + '</span><i><b style="width:' + Math.max(0, Math.min(100, v)) + '%;background:' + (col || '') + '"></b></i><span>' + Math.round(v) + '</span></div>'; }
function postHTML(V) {
  const me = V.me, SD = S.SIDES[app.side];
  let h = '<div class="card"><h3>' + esc(SD.post) + ' · AIRBORNE COMMAND POST<span>' + (me.succession === 'self' ? 'IN COMMAND' : me.succession === 'contested' ? 'COMMAND CONTESTED' : 'ANSWERING TO ' + esc(me.succession.toUpperCase())) + '</span></h3>'
    + meter('LEGITIMACY', me.legit, me.legit < 40 ? '#ff5f4f' : '') + meter('FUEL (MIN)', me.fuel / 2.3, me.fuel < 45 ? '#ff5f4f' : '#ffbf5a') + meter('COMMS', me.comms, me.comms < 40 ? '#ff5f4f' : '#7dffb0') + meter('JAMMING', me.jam, '#ff8a6a')
    + '<div class="sys">'
    + '<button class="btn' + (me.alt === 'low' ? ' on' : '') + '" data-c="alt">' + (me.alt === 'low' ? 'CLIMB TO CRUISE' : 'DESCEND · TRAILING WIRE') + '</button>'
    + '<button class="btn" data-c="relay">RELAY: ' + me.relay + (me.satDown ? ' (SAT DOWN)' : '') + '</button>'
    + '<button class="btn" data-c="cjam"' + (me.cjReady ? '' : ' disabled') + '>COUNTER-JAM' + (me.cjReady ? '' : ' · ' + me.cjIn + 'm') + '</button>'
    + '<button class="btn" data-c="tanker"' + (me.refuel || !me.tankerOk ? ' disabled' : '') + '>' + (me.refuel ? 'TANKER ' + me.refuel.phase.toUpperCase() + ' · ' + me.refuel.eta + 'm' : me.tankerOk ? 'CALL TANKER ' + esc(SD.tanker.name) : 'NO TANKER') + '</button>'
    + '<button class="btn" data-c="escort"' + (me.escort >= 2 ? ' disabled' : '') + '>FIGHTER ESCORT ×' + me.escort + '</button>'
    + '<button class="btn crit" data-c="recallall">RECALL ALL BEYOND LINE</button></div></div>';
  h += '<div class="card"><h3>AUTHENTICATION CARD<span>' + esc(me.cardHour) + '</span></h3><div class="cardline">' + esc(me.card) + '</div><div class="fr">Orders are genuine only if their code group matches this card exactly.</div></div>';
  h += '<div class="card"><h3>SUBMARINES<span>' + (me.alt === 'low' ? 'WIRE OUT — IN CONTACT' : 'REACHABLE ONLY WHEN LOW') + '</span></h3>' + me.subs.map(b => '<div class="fr"><b>' + esc(b.name) + '</b> · ' + esc(b.order.toUpperCase()) + ' · last contact ' + b.contact + ' min</div>').join('') + '</div>';
  return h;
}
function hotHTML(V) {
  const me = V.me, two = V.two, cd = me.hlIn > 0, d = cd ? ' disabled' : '';
  let h = '<div class="card"><h3>HOTLINE<span>' + (two ? 'YOUR BUDDY IS ON THE OTHER END' : 'PREMIER ILSE DAROVA · KESTREL') + '</span></h3><div class="hl" id="hlbox">' + V.hl.map(l => '<div class="' + (l.from === app.side ? 'me' : '') + '"><span class="t">' + S.clock(l.t) + '</span>' + esc(l.text) + '</div>').join('') + '</div>';
  if (two) h += '<div class="say"><input id="sayin" maxlength="160" placeholder="Type to the other commander…" enterkeyhint="send"><button class="btn" data-hl="say">SEND</button></div>';
  h += '<div class="btnrow" style="margin-top:6px">' + (two ? [['ceasefire', 'PROPOSE CEASEFIRE'], ['prop', 'PROPOSE ONE MATCHING STRIKE'], ['verify', 'OFFER VERIFICATION'], ['warn', 'WARN'], ['ask', 'ASK: ARE YOU LAUNCHING?']] : [['ceasefire', 'PROPOSE CEASEFIRE'], ['verify', 'OFFER VERIFICATION (15 MIN)'], ['warn', 'WARN THEM'], ['intel', 'SHARE: WHO SENT THE GO-CODES']]).map(([k, l]) => '<button class="btn' + (k === 'ceasefire' ? ' good' : k === 'warn' ? ' warnb' : '') + '" data-hl="' + k + '"' + d + '>' + l + '</button>').join('') + '</div>' + (cd ? '<div class="fr">Line busy · ' + me.hlIn + ' min</div>' : '') + '</div>';
  h += '<div class="card"><h3>THE OTHER SIDE</h3>' + meter('TRUST IN YOU', V.rel.trust, '#7dffb0') + meter('SUSPICION', V.rel.susp, '#ff8a6a') + meter('THEIR HAWKS', V.rel.hard, '#ff5f4f') + (me.promise ? '<div class="fr">Your promise: ' + (me.promise.kind === 'noPen' ? 'nothing beyond the line' : 'that wing turns') + ' · ' + me.promise.left + ' min left</div>' : '') + '</div>';
  return h;
}
function mapHTML(V) {
  const me = V.me; let h = '<div class="card"><h3>BOMBER WINGS<span>FAIL-SAFE LINE ┃</span></h3>';
  for (const w of me.wings) {
    const gone = w.state === 'lost' || w.state === 'home' || w.state === 'struck';
    h += '<div class="wing' + (app.selW === w.i ? ' sel' : '') + '"><button class="btn chip" data-selw="' + w.i + '" style="justify-self:start"><span class="nm">' + esc(w.name) + '</span></button><span class="stt">' + STATE_TXT[w.state] + (w.radio !== 'ok' ? ' · RADIO ' + esc(String(w.radio).toUpperCase()) : '') + (w.pend ? ' · SENDING ' + w.pend.toUpperCase() : '') + '</span>'
      + '<div class="prog"><i class="' + (w.state === 'penetrate' ? 'pen' : '') + '" style="width:' + Math.round(w.prog * 100) + '%"></i><b></b></div>'
      + (gone ? '' : '<div class="btnrow">' + [['recall', 'RECALL', ' crit'], ['hold', 'HOLD', ''], ['proceed', 'PROCEED', ' warnb'], ['refuel', 'REFUEL', '']].map(([k, l, c]) => '<button class="btn' + c + '" data-w="' + w.i + '" data-cmd="' + k + '">' + l + '</button>').join('') + '</div>') + '</div>';
  }
  h += '</div><div class="card"><h3>THEIR AIRCRAFT (RADAR)</h3><div class="fr">' + (V.them.wings.length ? V.them.wings.map(w => esc(w.name) + ' · ' + w.state).join('<br>') : 'No hostile wings tracked.') + (V.them.ghosts.length ? '<br><b style="color:#ffbf5a">' + V.them.ghosts.length + ' unconfirmed tracks — could be a radar fault.</b>' : '') + '</div></div>';
  return h;
}

/* ------------------------------ bomber cockpit ------------------------------ */
const cpIn = { x: 0, y: 0, kx: 0, ky: 0, tx: 0, ty: 0, px: 0, py: 0 };
function cpInput() { return { x: Math.max(-1, Math.min(1, cpIn.kx + cpIn.tx + cpIn.px)), y: Math.max(-1, Math.min(1, cpIn.ky + cpIn.ty + cpIn.py)) }; }
async function startCockpit(w, name) {
  if (app.cp) return; const V = app.view;
  if (app.cineOn) await playFilm('bomber', { name, dawn: dawnK() });
  for (const n of st.nukes) n.dispose(); st.nukes = [];
  $('cockpit').hidden = false; $('hud').hidden = true; $('cpname').textContent = name; $('cpdec').hidden = true;
  const el = { prompt: $('cpprompt'), dec: $('cpdec'), msgs: $('cpmsgs'), hud: true, agl: $('cpagl'), aglBar: $('cpaglbar'), det: $('cpdet'), hits: $('cphits'), relay: { style: { set width(v) { $('cprelay').style.setProperty('--w', v); } } }, relayBox: $('cprelay'), mw: $('cpmw') };
  app.cp = new Cockpit(st, AU, el, { name, card: (app.view || V).me.card, clock: (app.view || V).clock, hard: [0.8, 1, 1.25][app.cfg.diff] || 1 }, async res => {
    setTimeout(async () => {
      $('cockpit').hidden = true; app.cp = null;
      if (app.cineOn) await playFilm('aftercockpit', { name, result: res, dawn: dawnK() });
      $('hud').hidden = app.screen !== 'play'; cmd({ t: 'cockpit', w, result: res }); AU.setMode(stationMode());
      app.timeline.push({ clock: app.view.clock, text: name + ': ' + ({ turned: 'the crew trusted the recall and turned for home.', held: 'the crew held and asked again.', lost: 'shot down.', continued: 'pressed on to the target.' }[res]) });
    }, 900);
  });
  setTimeout(focusFirst, 50);
}
$('cockpit').addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (!b || !app.cp) return; AU.S.click(); if (b.dataset.cp === 'flare') app.cp.flare(); else app.cp.choose(b.dataset.cp); });
{ const stick = $('cpstick'), knob = stick.querySelector('i'); let id = null;
  const mv = e => { const r = stick.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1, m = Math.min(1, Math.hypot(x, y)) / (Math.hypot(x, y) || 1); cpIn.tx = x * m; cpIn.ty = -y * m; knob.style.transform = 'translate(' + cpIn.tx * 40 + 'px,' + (-cpIn.ty * 40) + 'px)'; };
  stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); mv(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === id) mv(e); });
  const up = e => { if (e.pointerId !== id) return; id = null; cpIn.tx = cpIn.ty = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up); }

/* ------------------------------ ending + after-action report ------------------------------ */
const END_FILM = { dawn: 'end_dawn', partial: 'end_partial', catastrophe: 'end_catastrophe', relieved: 'end_relieved', cleared: 'end_dawn', failed: 'end_partial' };
const END_TITLE = { dawn: 'CEASEFIRE AT DAWN', partial: 'PARTIAL EXCHANGE', catastrophe: 'CATASTROPHE', relieved: 'RELIEVED OF COMMAND', cleared: 'CHAPTER CLEARED', failed: 'CHAPTER FAILED' };
async function onEnd(E) {
  if (app.endShown) return; app.endShown = true; AU.klaxon(false); AU.warn(false);
  if (app.cp) { $('cockpit').hidden = true; app.cp = null; }
  app.timeline.push({ clock: E.clock, text: E.text });
  if (app.cineOn && !(app.cfg.chapter !== 'campaign' && (E.kind === 'cleared' || E.kind === 'failed'))) await playFilm(END_FILM[E.kind] || 'end_partial', { why: E.text, side: app.side });
  showEnd(E);
}
function showEnd(E) {
  const V = app.view, me = V.me, sc = E.score[app.side], gr = E.grade[app.side], key = app.cfg.chapter + '.' + app.cfg.diff + (app.role === 'sp' ? '' : '.2p');
  const best = store.get('best', {}); const prev = best[key] || 0; if (sc > prev) { best[key] = sc; store.set('best', best); }
  const relievedMe = E.kind === 'relieved' && E.side === app.side;
  const home = me.wings.filter(w => w.state === 'recall' || w.state === 'home').length, lost = me.wings.filter(w => w.state === 'lost').length, struck = me.wings.filter(w => w.state === 'struck').length;
  const tl = app.timeline.slice(-30).map(x => '<div><b>' + esc(x.clock) + '</b> ' + esc(x.text) + '</div>').join('');
  $('endp').innerHTML = '<div class="endt">' + (END_TITLE[E.kind] || E.kind.toUpperCase()) + (E.kind === 'relieved' && !relievedMe && app.cfg.two ? ' (THE OTHER SIDE)' : '') + '</div><div class="endsub">' + esc(E.text) + '</div>'
    + '<div class="grade">' + gr + '</div><div class="endsub">AFTER-ACTION REPORT · ' + esc(S.SIDES[app.side].post) + ' · ' + S.DIFF[app.cfg.diff].name + ' · SCORE <b>' + sc + '</b>' + (sc > prev && prev ? ' · NEW BEST' : prev ? ' · BEST ' + Math.max(prev, sc) : '') + '</div>'
    + '<div class="aar"><div><span class="lbl">ENDED</span><b>' + esc(E.clock) + '</b></div><div><span class="lbl">LADDER PEAK</span><b>' + esc(S.LADDER[E.ladderPeak]) + '</b></div><div><span class="lbl">WINGS HOME / LOST / STRUCK</span><b>' + home + ' / ' + lost + ' / ' + struck + '</b></div>'
    + '<div><span class="lbl">CASUALTIES (M) US / THEM</span><b>' + E.cas[app.side].toFixed(1) + ' / ' + E.cas[1 - app.side].toFixed(1) + '</b></div><div><span class="lbl">AUTHENTICATIONS RIGHT / WRONG</span><b>' + me.stats.authRight + ' / ' + me.stats.authWrong + '</b></div>'
    + '<div><span class="lbl">PROMISES KEPT / BROKEN</span><b>' + me.stats.promisesKept + ' / ' + me.stats.promisesBroken + '</b></div><div><span class="lbl">LEGITIMACY · TRUST</span><b>' + me.legit + ' · ' + V.rel.trust + '</b></div><div><span class="lbl">COCKPIT CALLS</span><b>' + me.stats.cockpit + '</b></div></div>'
    + '<div class="tl">' + tl + '</div><div class="bfoot">' + (app.role === 'sp' ? '<button class="btn big" data-e="again">PLAY AGAIN</button>' : '<button class="btn big" data-e="rematch">REMATCH</button>') + '<button class="btn" data-e="title">MAIN MENU</button></div>';
  go('end');
}
$('endp').addEventListener('click', e => { const b = e.target.closest('[data-e]'); if (!b) return; AU.S.click(); const a = b.dataset.e;
  if (a === 'again') startSP(app.cfg.chapter); else if (a === 'title') toTitle();
  else if (a === 'rematch') { if (!app.online) return toTitle(); app.online.mineAgain = true; Net.send({ t: 'again' }); b.textContent = app.online.theirAgain ? 'STARTING…' : 'WAITING FOR YOUR BUDDY…'; maybeRematch(); } });
function toTitle() { leaveOnline(); app.game = null; app.view = null; app.role = 'sp'; app.cp = null; $('cockpit').hidden = true; if (cin && cin.active) cin.skip(); AU.klaxon(false); AU.warn(false); st.resetFx(); go('title'); }

/* ------------------------------ menus ------------------------------ */
function renderTitle() {
  $('diffs').innerHTML = S.DIFF.map((d, i) => '<button class="btn chip' + (app.diff === i ? ' on' : '') + '" data-diff="' + i + '">' + d.name + '</button>').join('');
  $('sndb').textContent = app.sound ? 'ON' : 'OFF'; $('cineb').textContent = app.cineOn ? 'ON' : 'OFF';
  const best = store.get('best', {});
  $('chlist').innerHTML = S.CHAPTERS.map(c => '<button class="btn chap" data-ch="' + c.key + '"><b>' + esc(c.name) + '</b><span>' + esc(c.sub) + '</span><em>' + (c.goal ? 'GOAL: ' + esc(c.goal) : 'THE WHOLE NIGHT · 01:00 TO 06:00') + (best[c.key + '.' + app.diff] ? ' · BEST ' + best[c.key + '.' + app.diff] : '') + '</em></button>').join('');
  $('howtext').innerHTML = `<p>A rogue launch. An answer. The head of state is missing — and you are the senior official aboard <b>LANTERN</b>, the airborne command post. Hold the line until <b>dawn</b> and bring the bombers home.</p>
  <p><b>1 · COMMAND POST</b> — Authenticate orders: a message is genuine only if its code group matches your card <i>exactly</i>. Reject forgeries; query when unsure. Keep the post flying: call the tanker before fuel runs out, descend to reach the submarines on the trailing wire, counter-jam when the noise floor rises. Rival claimants on the ground will try to take command — your <b>legitimacy</b> decides who the forces obey.</p>
  <p><b>2 · HOTLINE</b> — The rival Premier wants to believe you. Every promise is checked against her radar. Trust lets you propose a ceasefire; broken promises and threats feed her hawks.</p>
  <p><b>3 · STRATEGIC MAP</b> — Wings past the <b>fail-safe line</b> attack unless recalled. Orders travel by radio and can fail under jamming. When a crew's radio is damaged you may have to fly the bomber's last minutes yourself: stay low, flare late, climb briefly to catch the relay — then decide whether the recall is real.</p>
  <p><b>ENDINGS</b> — Ceasefire at dawn · partial exchange · catastrophe · relieved of command.</p>
  <p><b>CONTROLS</b> — Mouse/touch on every button. <b>Space</b> confirms, <b>Enter</b> transmits RECALL (selected wing, or all beyond the line), <b>1 2 3</b> stations, <b>↑↓</b> or Tab move between buttons, <b>P/Esc</b> pause. Cockpit: arrows/WASD fly, Space flares. Gamepad: d-pad/stick move, A confirm, X recall, LB/RB stations, Start pause.</p>`;
}
$('screens').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b) return; AU.init(); AU.S.click(); const a = b.dataset.a;
  if (b.dataset.diff !== undefined) { app.diff = +b.dataset.diff; store.set('diff', app.diff); renderTitle(); return; }
  if (b.dataset.ch) return startSP(b.dataset.ch);
  if (a === 'campaign') startSP('campaign');
  else if (a === 'chapters') { renderTitle(); go('chapters'); }
  else if (a === 'howto') { renderTitle(); go('howto'); }
  else if (a === 'back') go('title');
  else if (a === 'sound') { app.sound = !app.sound; store.set('sound', app.sound); AU.setOn(app.sound); renderTitle(); }
  else if (a === 'cine') { app.cineOn = !app.cineOn; store.set('cine', app.cineOn); renderTitle(); }
  else if (a === 'host') hostOnline();
  else if (a === 'join') joinOnline();
  else if (a === 'solo') { const o = app.online; startSP('campaign'); app.online = o; app.waitingSolo = true; toast('Playing solo while your buddy is on the way'); }
  else if (a === 'ocancel') toTitle();
  else if (a === 'oretry') { onlineSearching(); Net.joinAny(); }
  else if (a === 'ocodeask') { $('oentry').classList.add('show'); $('omsg').textContent = 'Type the backup code shown on your buddy’s screen.'; $('ocodein').focus(); }
  else if (a === 'ojoincode') { const c = $('ocodein').value.trim().toUpperCase(); if (c.length === 5) { onlineSearching(); Net.join(c); } else toast('The code has 5 characters', true); }
  else if (a === 'resume') { app.paused = false; go('play'); }
  else if (a === 'quit') toTitle();
  else if (a === 'restart') startSP(app.cfg.chapter);
  else if (a === 'skipcine') { app.cineOn = !app.cineOn; store.set('cine', app.cineOn); openPause(); }
  else if (a === 'snd2') { app.sound = !app.sound; store.set('sound', app.sound); AU.setOn(app.sound); openPause(); }
});
function openPause() {
  if (app.role === 'sp') app.paused = true;
  $('pmenu').innerHTML = '<button class="btn big" data-a="resume">RESUME</button>' + (app.role === 'sp' ? '<button class="btn" data-a="restart">RESTART CHAPTER</button>' : '<div class="fr" style="text-align:center;color:var(--dim)">Online: the night keeps running.</div>') + '<button class="btn" data-a="snd2">SOUND: ' + (app.sound ? 'ON' : 'OFF') + '</button><button class="btn" data-a="skipcine">CINEMATICS: ' + (app.cineOn ? 'ON' : 'OFF') + '</button><button class="btn" data-a="quit">QUIT TO MENU</button>';
  go('pause');
}

/* ------------------------------ HUD clicks ------------------------------ */
$('hud').addEventListener('click', e => {
  const b = e.target.closest('.btn'); if (!b || b.disabled) return; AU.init(); const d = b.dataset;
  if (d.a === 'menu') return openPause();
  if (d.st) { AU.S.select(); return setStation(d.st); }
  if (d.speed !== undefined) { const s = +d.speed; if (s === 0) app.paused = !app.paused; else { app.paused = false; app.speed = s; } AU.S.click(); return renderAll(); }
  if (d.ans) { const it = app.view.me.inbox.find(i => i.id === +d.ans); cmd({ t: 'answer', id: +d.ans, k: d.k }); if (it) app.timeline.push({ clock: app.view.clock, text: it.title + ' → ' + b.textContent.split('\n')[0].slice(0, 60) }); return renderAll(); }
  if (d.cmd) { cmd({ t: 'wing', w: +d.w, cmd: d.cmd }); app.selW = +d.w; return renderAll(); }
  if (d.selw !== undefined) { app.selW = +d.selw; st.sel = app.selW; const w = app.view.me.wings[app.selW]; if (w) st.focus(w.pos[0], w.pos[1], 2.4); AU.S.select(); if (app.station !== 'map') setStation('map'); return renderAll(); }
  if (d.c) { const me = app.view.me;
    if (d.c === 'alt') cmd({ t: 'alt', v: me.alt === 'low' ? 'high' : 'low' });
    else if (d.c === 'relay') cmd({ t: 'relay', v: me.relay === 'SATCOM' ? 'HF' : 'SATCOM' });
    else if (d.c === 'recallall') recallCritical(true);
    else cmd({ t: d.c }); return renderAll(); }
  if (d.hl) { if (d.hl === 'say') { const i = $('sayin'); const t = i.value.trim(); if (!t) return; cmd({ t: 'hl', a: 'say', text: t }); i.value = ''; } else cmd({ t: 'hl', a: d.hl }); return renderAll(); }
});
function recallCritical(all) { // ENTER: transmit recall — selected wing, else every wing beyond the line / still outbound
  const V = app.view; if (!V) return; const ws = V.me.wings.filter(w => (all || app.selW === null ? ['penetrate', 'outbound', 'orbit', 'refuel'].includes(w.state) : w.i === app.selW) && w.state !== 'recall' && w.state !== 'lost' && w.state !== 'home' && w.state !== 'struck');
  const pen = ws.filter(w => w.state === 'penetrate'); const list = all || app.selW !== null ? ws : (pen.length ? pen : ws);
  if (!list.length) { AU.S.deny(); return toast('No wing to recall'); }
  for (const w of list) cmd({ t: 'wing', w: w.i, cmd: 'recall' }); toast('RECALL TRANSMITTED: ' + list.map(w => w.name).join(', ')); flashScreen(0.08);
}

/* ------------------------------ globe pointer ------------------------------ */
{ const gl = $('gl'), P = new Map(); let drag = null, pinch = null;
  gl.addEventListener('pointerdown', e => { AU.init(); P.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { gl.setPointerCapture(e.pointerId); } catch (_) { }
    if (cin && cin.active) { cin.skip(); return; }
    if (P.size === 1) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
    if (P.size === 2) { const [a, b] = [...P.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; } });
  gl.addEventListener('pointermove', e => { const p = P.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY; if (st.mode !== 'globe' || app.screen !== 'play') return;
    if (P.size >= 2 && pinch) { const [a, b] = [...P.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); st.zoom(pinch.d / Math.max(1, d)); pinch.d = d; return; }
    if (drag) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > (e.pointerType === 'mouse' ? 4 : 10)) drag.moved = true; if (drag.moved) st.rotate(e.clientX - drag.x, e.clientY - drag.y); drag.x = e.clientX; drag.y = e.clientY; } });
  const end = e => { if (!P.has(e.pointerId)) return; P.delete(e.pointerId); if (P.size === 0) { if (drag && !drag.moved && st.mode === 'globe' && app.screen === 'play') pickWing(e.clientX, e.clientY); drag = null; pinch = null; } };
  gl.addEventListener('pointerup', end); gl.addEventListener('pointercancel', e => { P.delete(e.pointerId); drag = null; pinch = null; });
  gl.addEventListener('wheel', e => { e.preventDefault(); if (st.mode === 'globe') st.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  $('cin').addEventListener('pointerdown', () => cin && cin.skip());
}
function pickWing(x, y) { const V = app.view; if (!V) return; let best = null, bd = 34;
  for (const w of V.me.wings) { const p = st.project(w.pos[0], w.pos[1], 0.02); if (!p.front) continue; const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = w; } }
  if (best) { app.selW = best.i; st.sel = best.i; AU.S.select(); renderAll(); } }

/* ------------------------------ keyboard ------------------------------ */
function navButtons() { const root = app.cp ? $('cockpit') : app.screen === 'play' ? $('hud') : document.querySelector('.screen.show'); return root ? [...root.querySelectorAll('.btn:not([disabled])')].filter(b => b.offsetParent !== null) : []; }
function moveFocus(d) { const bs = navButtons(); if (!bs.length) return; let i = bs.indexOf(document.activeElement); i = i < 0 ? (d > 0 ? 0 : bs.length - 1) : (i + d + bs.length) % bs.length; bs[i].focus(); bs[i].scrollIntoView({ block: 'nearest' }); AU.S.click(); }
function confirmKey() {
  if (cin && cin.active) return cin.skip();
  if (app.cp) { if (app.cp.decision) { const f = document.activeElement; if (f && f.dataset && f.dataset.cp) f.click(); else { const b = $('cpdec').querySelector('.btn'); b && b.focus(); } } else app.cp.flare(); return; }
  const f = document.activeElement; if (f && f.classList && f.classList.contains('btn') && f.offsetParent) return f.click();
  if (app.screen === 'play') { const b = $('inbox').querySelector('.btn') || $('station').querySelector('.btn:not([disabled])'); if (b) { b.focus(); b.scrollIntoView({ block: 'nearest' }); } return; }
  focusFirst();
}
const KEYS = {};
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') { if (e.key === 'Enter') { e.preventDefault(); const a = e.target.id === 'sayin' ? $('hud').querySelector('[data-hl=say]') : $('screens').querySelector('[data-a=ojoincode]'); a && a.click(); } if (e.key === 'Escape') e.target.blur(); return; }
  AU.init(); KEYS[e.code] = true; const k = e.key;
  if (app.cp && !app.cp.decision) { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); cpKeys(); return; } }
  if (k === ' ' || e.code === 'Space') { e.preventDefault(); confirmKey(); return; }
  if (k === 'Enter') { e.preventDefault(); if (cin && cin.active) return cin.skip(); if (app.cp && app.cp.decision) return app.cp.choose('turn'); if (app.screen === 'play') return recallCritical(false); const f = document.activeElement; if (f && f.classList.contains('btn')) f.click(); return; }
  if (k === 'Escape' || k === 'p' || k === 'P') { if (cin && cin.active) return cin.skip(); if (app.screen === 'play' && !app.cp) return openPause(); if (app.screen === 'pause') { app.paused = false; return go('play'); } if (['chapters', 'howto'].includes(app.screen)) return go('title'); return; }
  if (app.screen === 'play' && !app.cp) { if (k === '1') return setStation('post'); if (k === '2') return setStation('hotline'); if (k === '3') return setStation('map');
    if (k === 'q' || k === 'Q' || k === '[') return cycleWing(-1); if (k === 'e' || k === 'E' || k === ']') return cycleWing(1); if (k === 'f' || k === 'F') { app.speed = app.speed >= 4 ? 1 : app.speed * 2; app.paused = false; toast('SPEED ' + app.speed + '×'); return; } }
  if (k === 'ArrowDown' || k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); moveFocus(1); }
  else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'Tab') { e.preventDefault(); moveFocus(-1); }
});
addEventListener('keyup', e => { KEYS[e.code] = false; cpKeys(); });
function cpKeys() { cpIn.kx = (KEYS.ArrowRight || KEYS.KeyD ? 1 : 0) - (KEYS.ArrowLeft || KEYS.KeyA ? 1 : 0); cpIn.ky = (KEYS.ArrowUp || KEYS.KeyW ? 1 : 0) - (KEYS.ArrowDown || KEYS.KeyS ? 1 : 0); }
function cycleWing(d) { const ws = app.view.me.wings.filter(w => !['lost', 'home', 'struck'].includes(w.state)); if (!ws.length) return; let i = ws.findIndex(w => w.i === app.selW); i = (i + d + ws.length) % ws.length; app.selW = ws[i].i; st.sel = app.selW; st.focus(ws[i].pos[0], ws[i].pos[1], 2.6); if (app.station !== 'map') setStation('map'); AU.S.select(); renderAll(); }

/* ------------------------------ gamepad ------------------------------ */
const pad = { prev: [], rep: 0 };
function pollPad(dt) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null; if (!gp) return;
  const B = i => !!(gp.buttons[i] && gp.buttons[i].pressed), was = i => !!pad.prev[i], hit = i => B(i) && !was(i);
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (app.cp) { cpIn.px = Math.abs(ax) > 0.15 ? ax : (B(15) ? 1 : 0) - (B(14) ? 1 : 0); cpIn.py = Math.abs(ay) > 0.15 ? -ay : (B(12) ? 1 : 0) - (B(13) ? 1 : 0); if (hit(0) || hit(7)) confirmKey(); if (app.cp && app.cp.decision) { if (hit(13) || hit(12)) moveFocus(hit(13) ? 1 : -1); } }
  else {
    pad.rep -= dt; const dn = B(13) || ay > 0.5 || B(15) || ax > 0.5, upk = B(12) || ay < -0.5 || B(14) || ax < -0.5;
    if ((dn || upk) && pad.rep <= 0) { moveFocus(dn ? 1 : -1); pad.rep = pad.rep < -0.1 ? 0.35 : 0.14; } if (!dn && !upk) pad.rep = 0;
    if (hit(0)) confirmKey(); if (hit(1)) { if (cin && cin.active) cin.skip(); else if (app.screen === 'pause') { app.paused = false; go('play'); } else if (['chapters', 'howto', 'online'].includes(app.screen)) toTitle(); }
    if (hit(2) && app.screen === 'play') recallCritical(false);
    if (hit(9)) { if (cin && cin.active) cin.skip(); else if (app.screen === 'play') openPause(); else if (app.screen === 'pause') { app.paused = false; go('play'); } }
    if (app.screen === 'play') { const order = ['post', 'hotline', 'map']; if (hit(4) || hit(5)) setStation(order[(order.indexOf(app.station) + (hit(5) ? 1 : 2)) % 3]); if (st.mode === 'globe') { const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0; if (Math.abs(rx) > 0.2 || Math.abs(ry) > 0.2) st.rotate(rx * 9, ry * 9); if (B(6)) st.zoom(1.02); if (B(7)) st.zoom(0.98); } }
  }
  pad.prev = gp.buttons.map(b => b.pressed);
}

/* ------------------------------ online two-player ------------------------------ */
function leaveOnline() { if (app.online) { try { Net.leave(); } catch (e) { } app.online = null; } app.waitingSolo = false; }
function hostOnline() {
  AU.init(); leaveOnline(); app.online = { role: 'host', mineAgain: false, theirAgain: false }; Net.host();
  $('otitle').textContent = 'TWO-PLAYER GAME (ONLINE)';
  $('omsg').textContent = 'Call your buddy and tell them to hop on their bike and head over. The game is loading… just like the old days.';
  $('oentry').classList.remove('show');
  $('obtns').innerHTML = '<span class="fr" style="text-align:center;color:var(--dim)">They pick “JOIN TWO-PLAYER GAME IN PROGRESS” on their own device. You command the Commonwealth; they command the Federation.</span><button class="btn" data-a="solo">START SOLO WHILE YOU WAIT</button><button class="btn" data-a="ocancel">CANCEL</button>';
  go('online');
}
function joinOnline(code) {
  AU.init(); leaveOnline(); app.online = { role: 'guest', mineAgain: false, theirAgain: false }; if (code) Net.join(code); else Net.joinAny();
  $('otitle').textContent = 'JOIN TWO-PLAYER GAME'; $('omsg').textContent = ''; $('ocode').textContent = ''; $('oentry').classList.remove('show'); $('obtns').innerHTML = '<button class="btn" data-a="ocancel">CANCEL</button>';
  go('online');
}
function onlineSearching() { $('omsg').textContent = ''; $('oentry').classList.remove('show'); $('obtns').innerHTML = '<button class="btn" data-a="ocancel">CANCEL</button>'; }
function onlineTick() {
  const o = app.online; if (!o) return; const ns = Net.st, dots = '.'.repeat(1 + Math.floor(performance.now() / 400) % 3);
  if (app.screen === 'online') {
    if (o.role === 'host') { $('ostatus').textContent = ns.status === 'error' ? ns.error : ns.status === 'waiting' ? 'WAITING FOR YOUR BUDDY' + dots : ns.status === 'connected' ? 'CONNECTED! STARTING' + dots : 'OPENING THE GAME' + dots; setHTML($('ocode'), ns.code ? '<span class="lbl" style="display:block">BACKUP CODE</span>' + ns.code : ''); }
    else if (ns.status === 'nogame' || ns.status === 'error') { $('ostatus').textContent = ''; const msg = ns.error || 'Nobody has started a two-player game yet. Ask your buddy to pick “TWO-PLAYER GAME (ONLINE)” first.';
      if ($('omsg').textContent !== msg) { $('omsg').textContent = msg; $('obtns').innerHTML = '<button class="btn" data-a="oretry">RETRY</button><button class="btn" data-a="ocodeask">ENTER CODE INSTEAD</button><button class="btn" data-a="ocancel">CANCEL</button>'; focusFirst(); } }
    else $('ostatus').textContent = ns.status === 'connected' ? 'CONNECTED! STARTING' + dots : ns.via === 'code' ? 'LOOKING FOR GAME ' + ns.code + dots : 'LOOKING FOR A GAME IN PROGRESS' + dots;
  }
  const inGame = ['play', 'pause', 'end'].includes(app.screen) && app.role !== 'sp';
  if (inGame && ns.status === 'error' && !o.lost) { o.lost = true; toast(ns.error || 'CONNECTION LOST', true);
    if (app.role === 'host' && app.game && !app.game.over) { const g = app.game; g.sides[1].human = false; g.o.two = false; app.role = 'sp'; ticker('Your buddy dropped off the line. The Federation is now run by the computer.', 'warn'); }
    else if (app.role === 'guest' && !(app.view && app.view.over)) { $('endp').innerHTML = '<div class="endt">LINK LOST</div><div class="endsub">' + esc(ns.error || 'Your buddy disconnected.') + '</div><div class="bfoot"><button class="btn big" data-e="title">MAIN MENU</button></div>'; go('end'); } }
}
function maybeRematch() { const o = app.online; if (o && o.mineAgain && o.theirAgain && o.role === 'host') { o.mineAgain = o.theirAgain = false; hostStart(); } }
function hostStart() {
  const cfg = { seed: (Math.random() * 1e9) | 0, chapter: 'campaign', diff: app.diff, two: true };
  Object.assign(app.online, { evq: [], sendT: 0, seen: 0, lost: false }); app.waitingSolo = false;
  Net.send({ t: 'go', cfg }); newGame(cfg, 0, 'host');
}
function hostSend(dt) { const o = app.online; if (!o || !o.evq || Net.st.status !== 'connected') return; o.sendT -= dt; if (o.sendT <= 0 || o.evq.length > 30) { o.sendT = 0.2; Net.send({ t: 'v', v: app.game.viewFor(1), ev: o.evq.splice(0) }); } }
Net.onMessage = m => {
  const o = app.online; if (!o) return;
  switch (m.t) {
    case 'hello': if (o.role === 'host') { if (app.waitingSolo && app.screen !== 'online') { toast('YOUR BUDDY IS HERE — starting the two-player night'); } hostStart(); } break;
    case 'go': if (o.role === 'guest') { o.mineAgain = o.theirAgain = false; o.lost = false; app.diff = m.cfg.diff; newGame(m.cfg, 1, 'guest'); } break;
    case 'v': if (o.role === 'guest' && app.role === 'guest') { const first = !app.view; app.view = m.v; if (first) st.nStrikes = m.v.strikes.length; if (m.ev && m.ev.length) handleEvents(m.ev); if (m.v.over && m.v.ending) onEnd(m.v.ending); } break;
    case 'c': if (o.role === 'host' && app.game) { const ok = app.game.cmd(1, m.c); Net.send({ t: 'r', q: m.q, ok }); pump(); } break;
    case 'r': if (o.role === 'guest') { delete app.pendQ[m.q]; if (!m.ok) AU.S.deny(); } break;
    case 'again': o.theirAgain = true; maybeRematch(); break;
  }
};

window.addEventListener('pagehide', () => leaveOnline());
window.BDEL_T = { setStation, startCockpit, playFilm, recallCritical, onEnd, cmd, renderAll, hostOnline, joinOnline, toTitle, startSP };
boot().catch(e => { console.error(e); showErr(e); });
