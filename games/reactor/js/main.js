/* ==========================================================================
   MELTDOWN — main.js : game modes (shift / drills / training / neutron lab),
   input (keyboard, mouse, touch, gamepad), HUD + console wiring.
   ========================================================================== */
import { Render } from './render.js';
import { Gauge, Annunciator, Chart, fmt } from './ui.js';

const S = window.RXSim, C = window.RXContent, AU = window.RXAudio;
const $ = id => document.getElementById(id);
const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem('meltdown.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('meltdown.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const params = new URLSearchParams(location.search);

/* ---------- no zoom / no rubber-band on iOS ---------- */
document.addEventListener('touchmove', e => { if (!e.target.closest || !e.target.closest('.panel, #console, .scroll')) e.preventDefault(); }, { passive: false });
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });

/* ---------- persistent prefs ---------- */
const prefs = { diff: LS.get('diff', 0), muted: LS.get('muted', false), labels: LS.get('labels', true), xp: LS.get('xp', 0), seen: LS.get('seen', {}), drills: LS.get('drills', {}), best: LS.get('best', 0), tutDone: LS.get('tutDone', false) };
const savePrefs = () => { for (const k of Object.keys(prefs)) LS.set(k, prefs[k]); };
const rankOf = xp => { let r = C.RANKS[0]; for (const k of C.RANKS) if (xp >= k.xp) r = k; return r; };

/* ---------- renderer ---------- */
const canvas = $('gl');
let R;
try { R = new Render(canvas, { msaa: false, q: params.get('q'), preserve: params.has('preserve') }); }
catch (e) { window.RXFatal('WebGL could not start: ' + (e && e.message || e)); throw e; }

/* ---------- layout ---------- */
function layout() {
  const w = innerWidth, h = innerHeight, compact = w < 900 || h < 560, portrait = h > w;
  document.body.classList.toggle('compact', compact);
  document.body.classList.toggle('portrait', compact && portrait);
  document.body.classList.toggle('land', compact && !portrait);
  R.resize();
}
addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 200));
if (window.ResizeObserver) new ResizeObserver(() => R.resize()).observe(canvas);

/* ---------- console: gauges ---------- */
const G = {};
const mk = (where, key, o) => { G[key] = new Gauge($(where), o); if (o.cls) G[key].el.classList.add(o.cls); };
mk('g-core', 'pow', { label: 'REACTOR POWER', unit: '% FP', min: 0, max: 120, ticks: [0, 20, 40, 60, 80, 100, 120], zones: [[100, 109, '#e0a020'], [109, 120, '#d02010']], fmt: v => fmt.power(v / 100) });
mk('g-core', 'logp', { label: 'LOG POWER', unit: 'decades', min: 1e-6, max: 2, log: true, ticks: [1e-6, 1e-4, 1e-2, 1], tl: v => '1e' + Math.round(Math.log10(v)), fmt: v => v.toExponential(1) });
mk('g-core', 'sur', { label: 'STARTUP RATE', unit: 'DPM', min: -1, max: 5, ticks: [-1, 0, 1, 2, 3, 4, 5], zones: [[1, 2.6, '#e0a020'], [2.6, 5, '#d02010']], fmt: v => v.toFixed(2) + ' DPM' });
mk('g-core', 'tavg', { label: 'Tavg', unit: '°C', min: 260, max: 350, ticks: [260, 280, 300, 320, 340], zones: [[320, 335, '#e0a020'], [335, 350, '#d02010']], fmt: v => v.toFixed(1) + ' °C', cls: 'pwr' });
mk('g-cool', 'press', { label: 'RCS PRESSURE', unit: 'MPa', min: 0, max: 18, ticks: [0, 3, 6, 9, 12, 15, 18], zones: [[0, 12.8, '#d02010'], [12.8, 14.5, '#e0a020'], [16.2, 18, '#d02010']], fmt: v => v.toFixed(2) + ' MPa', cls: 'pwr' });
mk('g-cool', 'pzr', { label: 'PZR LEVEL', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [[0, 15, '#d02010'], [85, 100, '#e0a020']], fmt: v => v.toFixed(0) + ' %', cls: 'pwr' });
mk('g-cool', 'orm', { label: 'ORM (rods in core)', unit: 'rods', min: 0, max: 60, ticks: [0, 15, 30, 45, 60], zones: [[0, 15, '#d02010'], [15, 26, '#e0a020']], fmt: v => v.toFixed(1), cls: 'rbmk' });
mk('g-cool', 'flow', { label: 'CORE FLOW', unit: '%', min: 0, max: 120, ticks: [0, 30, 60, 90, 120], zones: [[0, 62, '#d02010'], [62, 90, '#e0a020']], fmt: v => v.toFixed(0) + ' %' });
mk('g-cool', 'dnbr', { label: 'DNB RATIO', unit: '', min: 0, max: 4, ticks: [0, 1, 2, 3, 4], zones: [[0, 1, '#d02010'], [1, 1.3, '#e0a020']], fmt: v => v.toFixed(2) });
mk('g-cool', 'sm', { label: 'SUBCOOLING', unit: '°C', min: -10, max: 50, ticks: [-10, 0, 10, 20, 30, 40, 50], zones: [[-10, 0, '#d02010'], [0, 10, '#e0a020']], fmt: v => v.toFixed(1) + ' °C', cls: 'pwr' });
mk('g-cool', 'void', { label: 'CORE STEAM VOID', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [[40, 100, '#d02010']], fmt: v => v.toFixed(0) + ' %', cls: 'rbmk' });
mk('g-steam', 'mwe', { label: 'GENERATOR', unit: 'MWe', min: 0, max: 1200, ticks: [0, 300, 600, 900, 1200], fmt: v => v.toFixed(0) + ' MWe' });
mk('g-steam', 'sg', { label: 'SG LEVEL', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [[0, 12, '#d02010'], [12, 25, '#e0a020'], [85, 100, '#e0a020']], fmt: v => v.toFixed(0) + ' %', cls: 'pwr' });
mk('g-steam', 'ps', { label: 'STEAM PRESSURE', unit: 'MPa', min: 0, max: 10, ticks: [0, 2, 4, 6, 8, 10], zones: [[8.3, 10, '#e0a020']], fmt: v => v.toFixed(2) + ' MPa' });
mk('g-safe', 'decay', { label: 'DECAY HEAT', unit: '% FP', min: 0, max: 8, ticks: [0, 2, 4, 6, 8], fmt: v => v.toFixed(2) + ' %' });
mk('g-safe', 'clad', { label: 'PEAK CLAD TEMP', unit: '°C', min: 200, max: 1400, ticks: [200, 500, 800, 1100, 1400], zones: [[800, 1204, '#e0a020'], [1204, 1400, '#d02010']], fmt: v => v.toFixed(0) + ' °C' });
mk('g-safe', 'cov', { label: 'CORE WATER LEVEL', unit: '% covered', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [[0, 98, '#d02010']], fmt: v => v.toFixed(0) + ' %' });
mk('g-safe', 'bat', { label: 'DC BATTERY', unit: '%', min: 0, max: 100, ticks: [0, 25, 50, 75, 100], zones: [[0, 25, '#d02010']], fmt: v => v.toFixed(0) + ' %' });

/* ---------- annunciators ---------- */
const PWR = s => s.type.name === 'PWR';
const ANN = [
  { t: 'HIGH FLUX', sev: 2, c: s => s.n > 1.03 },
  { t: 'STARTUP RATE', sev: 2, c: s => s.period > 0 && s.period < 20 && s.n > 1e-5 },
  { t: 'PROMPT CRITICAL', sev: 3, c: s => s.rho.dollars >= 1 },
  { t: 'REACTOR TRIP', sev: 2, c: s => s.scram },
  { t: 'RCS PRESS HIGH', sev: 2, c: s => PWR(s) && s.P > 16.2 },
  { t: 'RCS PRESS LOW', sev: 2, c: s => PWR(s) && s.P < 14.5 },
  { t: 'PZR LEVEL HIGH', sev: 1, c: s => PWR(s) && s.Lpzr > 0.85 },
  { t: 'PZR LEVEL LOW', sev: 1, c: s => PWR(s) && s.Lpzr < 0.2 },
  { t: 'PORV OPEN', sev: 1, c: (s, g) => PWR(s) && (g.tmi ? (s.porvCmd || s.porvAuto) : s.porv > 0.1 && s.block > 0.1) },
  { t: 'RELIEF LINE HOT', sev: 1, c: s => PWR(s) && s.tailT > 120 },
  { t: 'LOW COOLANT FLOW', sev: 2, c: s => s.W < 0.9 },
  { t: 'RCP TRIPPED', sev: 1, c: s => s.pumps.some(p => p.failed || !p.on) },
  { t: 'DNBR LOW', sev: 2, c: s => s.dnbr < 1.3 && s.n > 0.05 },
  { t: 'SUBCOOLING LOW', sev: 2, c: s => PWR(s) && s.SM < 10 },
  { t: 'SG LEVEL LOW', sev: 2, c: s => PWR(s) && s.Lsg < 0.25 },
  { t: 'FEEDWATER LOST', sev: 1, c: s => PWR(s) && !s.mainFW },
  { t: 'TURBINE TRIP', sev: 1, c: s => s.turb.tripped && s.n > 0.02 && !s.scram },
  { t: 'GRID LOST', sev: 2, c: s => !s.offsite },
  { t: 'DIESEL FAILED', sev: 2, c: s => s.dg.some(d => d.st === 'failed') },
  { t: 'DC BATTERY LOW', sev: 3, c: s => s.battery < 0.4 && !S.acPower(s) },
  { t: 'SAFETY INJECTION', sev: 2, c: s => s.si && !s.siBlocked },
  { t: 'STEAM FLOW HIGH', sev: 2, c: s => s.slb > 0 && s.msiv > 0.1 },
  { t: 'MAKEUP FLOW HIGH', sev: 1, c: s => s.dilutionLeak > 0 },
  { t: 'ROD DEVIATION', sev: 1, c: s => s.stuck.some(x => x) || s.runaway },
  { t: 'XENON HIGH', sev: 1, c: s => s.X / S.X_EQ1 > 1.25 },
  { t: 'ORM BELOW 15', sev: 3, c: s => !PWR(s) && s.ORM < 15 },
  { t: 'CORE UNCOVERED', sev: 3, c: s => s.coverage < 0.98 },
  { t: 'CLAD TEMP HIGH', sev: 3, c: s => s.TclPk > 800 },
  { t: 'HYDROGEN', sev: 3, c: s => s.h2 > 20 },
  { t: 'CORE DAMAGE', sev: 3, c: s => s.damage > 0.001 },
];
const ann = new Annunciator($('annun'), ANN);

/* reactivity bars + rods */
const RX = [['rods', 'CONTROL RODS'], ['boron', 'FUEL + BORON'], ['doppler', 'DOPPLER (FUEL T)'], ['mod', 'MODERATOR T'], ['void', 'STEAM VOIDS'], ['xenon', 'XENON'], ['tip', 'GRAPHITE TIPS'], ['ext', 'LAB STEP']];
$('rxbars').innerHTML = RX.map(([k, t]) => `<div class="rxr" data-k="${k}"><span>${t}</span><b><i></i></b><em></em></div>`).join('');
const rxEls = RX.map(([k]) => { const r = $('rxbars').querySelector(`[data-k="${k}"]`); return { k, r, i: r.querySelector('i'), em: r.querySelector('em') }; });
$('rodbars').innerHTML = Array.from({ length: S.NR }, (_, i) => `<div class="rb"><i></i><span>${i + 1}</span></div>`).join('') + '<div class="rb sd"><i></i><span>SD</span></div>';
const rodEls = qsa('#rodbars .rb i');
const labChart = new Chart($('labchart'), { log: true, lo: -6, hi: 3, span: 30, lab: k => (k >= 0 ? '' : '') + '1e' + k });

/* ---------- game state ---------- */
let s = S.create(); s.rodAuto = true;
let g = null, mode = 'title', drill = null, lab = null;
let warpIdx = 0; const WARPS = [1, 2, 4, 8];
const held = new Set();
let screen = 'loading';

function baseG(m) {
  return {
    mode: m, diff: prefs.diff, D: C.DIFFS[prefs.diff], t: 0, score: 0, faults: [], frozen: {}, demand: s.turb.load, demandTarget: s.turb.load, demandPlan: null,
    nextDispatch: rnd(50, 80), nextFault: prefs.diff === 0 ? 45 : 30, level: 0, trips: 0, sis: 0, resolved: 0, accSum: 0, accN: 0, timers: [], flags: {},
    drillActs: [], tut: {}, refused: false, testStarted: false, testT: 0, porvStuckSet: false, tmi: false, recent: [], evIdx: 0, over: false, len: 480, shiftNo: 1,
    at(t, fn) { this.timers.push({ t, fn }); }, alarm(text) { toast(text, 'red'); AU.sfx('warn'); }, cine(text, col) { cine(text, '', col); },
    flag(k) { this.flags[k] = true; }, acc() { return this.accN > 0 ? this.accSum / this.accN : 1; },
  };
}

/* ---------- screens ---------- */
function show(id) {
  screen = id;
  for (const el of qsa('.screen')) el.classList.toggle('show', el.id === id);
  document.body.classList.toggle('playing', !id);
}
function setMode(m) {
  window.MoodSticker && window.MoodSticker.screen(m);
  mode = m; document.body.dataset.mode = m; $('toasts').innerHTML = '';
  document.body.classList.toggle('lab', m === 'lab');
  document.body.classList.toggle('rbmk', s.type.name === 'RBMK');
  if (m === 'lab') selectTab('lab'); else if (curTab === 'lab') selectTab('core');
  $('faults').innerHTML = ''; $('drillbar').innerHTML = ''; $('tutbox').classList.remove('show'); $('cine').className = '';
  R.setMode(s.type.name); evSeen = s.events.length; resetHud();
}
let evSeen = 0;

/* ---------- tabs ---------- */
let curTab = 'core';
function selectTab(t) { curTab = t; for (const b of qsa('#tabs .tab')) b.classList.toggle('on', b.dataset.tab === t); for (const sec of qsa('#console .sec')) sec.classList.toggle('on', sec.dataset.tab === t); }
for (const b of qsa('#tabs .tab')) b.addEventListener('click', () => { selectTab(b.dataset.tab); AU.sfx('relay'); });

/* ---------- toasts / cine / cards ---------- */
function toast(html, cls, ms, btn) {
  const d = document.createElement('div'); d.className = 'toast ' + (cls || ''); d.innerHTML = html;
  if (btn) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = btn.label; b.onclick = e => { e.stopPropagation(); btn.fn(); d.remove(); }; d.appendChild(b); }
  d.onclick = () => d.remove();
  const box = $('toasts'); box.prepend(d); const maxT = document.body.classList.contains('compact') ? 2 : 4; while (box.children.length > maxT) box.lastChild.remove();
  setTimeout(() => d.classList.add('out'), (ms || 6000)); setTimeout(() => d.remove(), (ms || 6000) + 600);
}
let cineT = 0;
function cine(t, sub, col) { const c = $('cine'); c.innerHTML = `<div class="ct">${esc(t)}</div>${sub ? `<div class="cs">${esc(sub)}</div>` : ''}`; c.className = 'show ' + (col || 'red'); cineT = 3.5; }

let card = null;
function openCard(o) {
  card = o; $('ctag').textContent = o.tag || ''; $('ch').textContent = o.title; $('cbody').innerHTML = o.body;
  $('cmore').style.display = o.history ? '' : 'none'; show('card'); AU.sfx('card');
}
function closeCard() { if (!card) return; const cb = card.after; card = null; show(null); if (cb) cb(); }
function conceptHTML(k) { const c = C.CONCEPTS[k]; return c ? c.b.map(p => `<p>${p}</p>`).join('') : ''; }
function historyHTML(k) { const h = C.HISTORY[k]; return h ? `<h4>${h.t}</h4>` + h.b.map(p => `<p>${p}</p>`).join('') : ''; }

/* ---------- starting modes ---------- */
function startAttract() {
  s = S.create(); s.rodAuto = true; g = baseG('title'); g.demand = 1; setMode('title'); warpIdx = 0;
}
function startShift(keep) {
  const prev = g;
  if (!keep) { s = S.create(); s.rodAuto = true; }
  g = baseG('shift'); g.demand = g.demandTarget = Math.min(1, s.turb.load || 1);
  if (keep && prev) { g.level = prev.level + 1; g.shiftNo = prev.shiftNo + 1; g.nextFault = 20; }
  setMode('shift'); show(null); warpIdx = 0;
  toast(`<b>SHIFT ${g.shiftNo} · ${g.D.t}</b><br>Match generator output to grid demand. Faults will strike. Space acknowledges alarms.`, 'blue', 7000);
}
function startDrill(d) {
  drill = d; const opts = d.init ? d.init() : {}; s = S.create(opts); if (s.type.name === 'PWR') s.rodAuto = true; if (d.post) d.post(s);
  g = baseG('drill'); g.diff = Math.max(prefs.diff, d.diff || 0); g.demand = g.demandTarget = s.turb.load; g.len = d.len;
  d.setup(s, g); setMode('drill'); show(null); warpIdx = 0; buildDrillBar();
  toast(`<b>${d.name}</b><br>${d.goal}`, 'blue', 9000);
}
function startTutorial() {
  s = S.create({ power: 1e-3 }); s.rodAuto = false; g = baseG('tutorial'); g.step = -1; g.demand = 0; setMode('tutorial'); show(null); warpIdx = 0; nextTut();
}
function startLab() {
  s = S.create({ power: 1e-3 }); s.noFeedback = true; s.tripsBypassed = true; s.rodAuto = false; S.computeRho(s); s.rho0 -= s.rho.total; S.computeRho(s);
  g = baseG('lab'); lab = { speed: 1, set: 0, boomT: 0 }; labChart.clear(); setMode('lab'); show(null); labUI();
  if (!prefs.seen.lab) { prefs.seen.lab = 1; savePrefs(); openCard({ tag: 'NEUTRON LAB', title: C.CONCEPTS.delayed.t, body: conceptHTML('delayed') + '<p>Use the buttons to step reactivity in <b>dollars</b> (1 $ = β, the delayed-neutron fraction). Try +0.5 $, then +1.2 $. Then turn delayed neutrons OFF and try +0.1 $ in slow motion.</p>' }); }
}

/* ---------- tutorial ---------- */
function nextTut() {
  g.step++; const st = C.TUTORIAL[g.step];
  if (!st) { endTutorial(); return; }
  g.stepOK = 0; const box = $('tutbox');
  box.innerHTML = `<div class="tn">TRAINING ${g.step + 1}/${C.TUTORIAL.length}</div><div class="tt2">${st.t}</div><div class="tb">${st.b}</div>` +
    `<div class="tf">${st.wait === 'space' ? '<button class="cb" data-act="tutnext">CONTINUE (Space)</button>' : '<span class="tw">⟳ waiting for you…</span>'}${st.concept ? ' <button class="cb" data-act="tutlearn">LEARN MORE</button>' : ''}</div>`;
  box.classList.add('show'); AU.sfx('card');
}
function endTutorial() { $('tutbox').classList.remove('show'); if (!prefs.tutDone) { prefs.tutDone = true; prefs.xp += 300; savePrefs(); } endScreen('TRAINING COMPLETE', '✓', `<p>You have taken a reactor critical, synchronised a turbine, seen feedback, and scrammed. +300 XP.</p><p>Next: try the <b>NEUTRON LAB</b> or start a <b>SHIFT</b>.</p>`, false); }

/* ---------- drill bar ---------- */
function buildDrillBar() {
  const bar = $('drillbar'); bar.innerHTML = '';
  const L = { shed: 'SHED DC LOADS', sgdump: 'OPEN ATM DUMPS', truck: 'FIRE TRUCK → SG', test: 'START TURBINE TEST', refuse: 'REFUSE THE TEST' };
  for (const a of g.drillActs) { const b = document.createElement('button'); b.className = 'cb da'; b.dataset.da = a; b.textContent = L[a] || a; bar.appendChild(b); }
}
function drillAct(a) {
  AU.sfx('relay');
  if (a === 'shed') { s.dcLoadShed = true; toast('DC loads shed: batteries last twice as long', 'blue'); }
  if (a === 'sgdump') { s.sgDump = s.sgDump ? 0 : 1; toast(s.sgDump ? 'Atmospheric dumps OPEN: cooling and depressurising' : 'Atmospheric dumps closed', 'blue'); }
  if (a === 'truck') { s.fireTruck = 1; toast(s.Ps < 1 ? 'Fire truck connected: injecting into the SG' : 'Fire truck connected. It can only inject when SG pressure is below 1 MPa', 'blue'); }
  if (a === 'test' && !g.testStarted && !g.refused) { g.testStarted = true; g.testT = s.t; s.testRundown = 0.01; s.pumps.forEach((p, i) => { if (i < 2) p.rundown = true; }); S.tripTurbine(s); cine('TEST STARTED', 'turbine coasting down · pumps slowing', 'amber'); }
  if (a === 'refuse' && !g.testStarted) { g.refused = true; toast('You refused the test.', 'blue'); }
  updateDrillBar();
}
function updateDrillBar() { for (const b of qsa('#drillbar .da')) { const a = b.dataset.da; b.classList.toggle('on', (a === 'shed' && s.dcLoadShed) || (a === 'sgdump' && s.sgDump > 0) || (a === 'truck' && s.fireTruck > 0) || (a === 'test' && g.testStarted)); } }

/* ---------- faults ---------- */
function faultWeights() {
  const eff = g.diff + Math.floor(g.level / 2);
  return C.FAULTS.filter(f => f.min <= eff && !g.faults.some(x => x.def.id === f.id) && !g.recent.includes(f.id));
}
function startFault(def) {
  const f = { def, t: 0, repaired: false, repairAt: def.repair ? def.repair * g.D.repair * rnd(0.8, 1.2) : 0 };
  def.start(s, g, f); g.faults.push(f); g.recent.push(def.id); if (g.recent.length > 3) g.recent.shift();
  renderFaults();
  const first = !prefs.seen[def.id];
  if (first || g.diff === 0) {
    prefs.seen[def.id] = 1; savePrefs();
    const c = C.CONCEPTS[def.concept];
    openCard({ tag: 'FAULT · ' + (c ? c.t : ''), title: def.name, history: def.history, body: `<p class="hintp">▶ ${def.hint}</p>` + conceptHTML(def.concept) });
  } else { cine(def.name, def.hint.split('. ')[0], 'amber'); }
  AU.sfx('warn');
}
function endFault(f, ok) {
  g.faults.splice(g.faults.indexOf(f), 1);
  const d = f.def;
  if (d.id === 'porv') s.porvStuck = false; if (d.id === 'loca') s.leak = 0; if (d.id === 'slb') s.slb = 0; if (d.id === 'dilution') s.dilutionLeak = 0; if (d.id === 'runaway') s.runaway = 0;
  if (d.id === 'instr') for (const k of Object.keys(g.frozen)) delete g.frozen[k];
  if (d.id === 'xenon') g.demandPlan = null;
  if (ok && g.mode === 'shift') { const b = Math.round(300 * g.D.mult * (1 + g.level * 0.25)); g.score += b; g.resolved++; AU.sfx('good'); }
  toast(`<b>${ok ? '✓ RESOLVED' : 'CLEARED'}: ${d.name}</b><br><i>Why this happened:</i> ${d.why}`, ok ? 'green' : '', 11000, d.history ? { label: 'HISTORY', fn: () => openCard({ tag: 'HISTORY', title: C.HISTORY[d.history].t, body: historyHTML(d.history) }) } : null);
  renderFaults();
}
function renderFaults() {
  const box = $('faults');
  box.innerHTML = g.faults.map((f, i) => `<div class="fault"><b>⚠ ${f.def.name}</b><span>${f.def.hint}</span>${f.def.act ? `<button class="cb" data-fact="${i}">${f.def.act.label}</button>` : ''}${f.def.repair ? `<em data-fr="${i}"></em>` : ''}</div>`).join('');
}
function tickFaults(h) {
  for (const f of g.faults.slice()) {
    f.t += h;
    if (f.def.repair && !f.repaired && f.t >= f.repairAt) { f.repaired = true; if (f.def.repairFn) f.def.repairFn(s, f); toast(`CREW: ${f.def.name.toLowerCase()} repaired${f.def.id === 'rcp' ? ' — restart the pump (' + (f.k + 1) + ')' : f.def.id === 'turb' ? ' — latch the turbine (T)' : ''}`, 'blue'); }
    let done = false; try { done = f.def.done(s, g, f); } catch (e) { done = false; }
    if (done) endFault(f, true); else if (f.t > 330) endFault(f, false);
  }
  if (g.mode !== 'shift') return;
  if (g.t >= g.nextFault) {
    const maxN = g.diff >= 2 ? 2 : 1;
    if (s.scram || s.n < 0.3 || g.faults.length >= maxN) g.nextFault = g.t + 12;
    else {
      const pool = faultWeights(); let tot = pool.reduce((a, f) => a + f.w, 0), r = Math.random() * tot, pick = pool[0];
      for (const f of pool) { r -= f.w; if (r <= 0) { pick = f; break; } }
      if (pick) startFault(pick);
      const [a, b] = g.D.faultGap; g.nextFault = g.t + rnd(a, b) * Math.pow(0.88, g.level) * (1 - 0.3 * clamp(g.t / g.len, 0, 1));
    }
  }
}

/* ---------- demand ---------- */
function tickDemand(h) {
  if (g.demandPlan && g.demandPlan.length) { if (g.t >= g.demandPlan[0].at) { g.demandTarget = g.demandPlan[0].v; g.demandPlan.shift(); toast(`GRID DISPATCH: ${Math.round(g.demandTarget * 100)} % (${Math.round(g.demandTarget * 1000)} MWe)`, 'blue'); } }
  else if (g.mode === 'shift' && g.t >= g.nextDispatch) {
    const opts = [0.6, 0.7, 0.8, 0.9, 1.0].filter(v => Math.abs(v - g.demandTarget) > 0.05 && Math.abs(v - g.demandTarget) <= 0.3 + 0.05 * g.level);
    g.demandTarget = opts[Math.floor(Math.random() * opts.length)] || 1; g.nextDispatch = g.t + rnd(60, 110) * Math.pow(0.9, g.level);
    toast(`GRID DISPATCH: ${Math.round(g.demandTarget * 100)} % (${Math.round(g.demandTarget * 1000)} MWe). Ramp with ← / →.`, 'blue'); AU.sfx('chime');
  }
  const rate = 0.006 * h; g.demand += clamp(g.demandTarget - g.demand, -rate, rate);
}

/* ---------- per-step game logic ---------- */
const SD_RATE = 0.08, SD_HOLD_PERIOD = 20;
function controls(h) {
  let rc = 0; if (held.has('out')) rc += 1; if (held.has('in')) rc -= 1; s.rodCmd = rc;
  if (rc && s.runaway && rc < 0) s.runaway = 0;
  s.borCmd = held.has('borate') ? 1 : held.has('dilute') ? -1 : 0;
  if (s.type.name === 'PWR' && !s.turb.tripped && s.turb.synced) {
    const dl = (held.has('loadUp') ? 1 : 0) - (held.has('loadDn') ? 1 : 0);
    if (dl) s.turb.load = clamp(s.turb.load + dl * 0.03 * h, 0.05, 1.0);
  }
  // Shutdown bank withdrawal after a trip reset. At the old 0.25/s the subcritical power rose on a <10 s period and
  // re-tripped the plant on HIGH STARTUP RATE within ~1.3 s, every time, so no shift could recover from a trip
  // (Day 2 eval). Withdraw more slowly and hold while the startup period is short, as an operator would.
  if (g.sdWithdraw && !s.scram) { if (!(s.period > 0 && s.period < SD_HOLD_PERIOD)) s.sd = Math.max(0, s.sd - SD_RATE * h); if (s.sd <= 0) g.sdWithdraw = false; }
  if (s.type.name === 'RBMK' && held.size && (rc)) s.powerSet = s.n;   // manual rod motion moves the regulator set point
}
function gameStep(h) {
  if (!g) return;
  g.t += h;
  for (const tm of g.timers.slice()) if (s.t >= tm.t) { g.timers.splice(g.timers.indexOf(tm), 1); tm.fn(); }
  if (mode === 'shift' || mode === 'drill' || mode === 'title') tickDemand(h);
  if (mode === 'shift' || mode === 'drill') tickFaults(h);
  if (mode === 'drill' && drill) { if (drill.tick) drill.tick(s, g); }
  if (mode === 'shift' || mode === 'drill') {
    const mw = s.MWe / 1000, acc = clamp(1 - Math.abs(mw - g.demand) * 5, 0, 1);
    // Fairness (Day 2 eval): a fault that forces an automatic trip (loss of feed, offsite power, turbine)
    // used to wreck the grade by luck of the draw. While the crew is still repairing it and the unit is
    // off the grid, grid accuracy is not scored; the clock restarts once the crew finishes.
    const excused = mode === 'shift' && (s.scram || s.turb.tripped || !s.turb.synced) && g.faults.some(f => f.def.repair && !f.repaired);
    if (excused !== !!g.excused) { g.excused = excused; if (excused) toast('Unit off the grid while the crew repairs: grid accuracy is paused, not scored. Restart when they finish.', 'blue', 7000); }
    if (excused) g.excusedT = (g.excusedT || 0) + h;
    else { g.accSum += acc * h; g.accN += h; }
    if (mode === 'shift' && s.turb.synced) g.score += 10 * acc * h * g.D.mult * (1 + g.level * 0.25);
  }
  if (mode === 'title' && s.scram) startAttract();
}
function checkEnd() {
  if (!g || g.over) return;
  if (mode === 'drill' && drill) {
    let r; try { r = drill.check(s, g); } catch (e) { r = null; }
    if (s.meltdown || s.exploded) r = 'fail';
    if (r) { g.over = true; setTimeout(() => drillEnd(r === 'pass'), s.exploded || s.meltdown ? 5000 : 900); }
  }
  if (mode === 'shift') {
    if (s.damage > 0.002 || s.meltdown || s.exploded) { g.over = true; setTimeout(() => shiftEnd(true), 5000); }
    else if (g.t >= g.len) { g.over = true; shiftEnd(false); }
  }
  if (mode === 'tutorial') {
    const st = C.TUTORIAL[g.step];
    if (st && st.check) { let ok = false; try { ok = st.check(s, g); } catch (e) { ok = false; } if (ok) { g.stepOK += 1; if (g.stepOK === 1) { AU.sfx('good'); setTimeout(nextTut, 900); } } }
  }
}
function events() {
  while (evSeen < s.events.length) {
    const e = s.events[evSeen++];
    switch (e.k) {
      case 'scram':
        AU.sfx('scram'); R.fx('scram'); cine('REACTOR TRIP', e.cause, 'red'); if (g) { g.trips++; if (mode === 'shift') g.score = Math.max(0, g.score - 150 * g.D.mult); }
        if (mode !== 'title' && mode !== 'lab' && !prefs.seen.scram) { prefs.seen.scram = 1; savePrefs(); setTimeout(() => { if (mode !== 'title' && !card && !g.over) openCard({ tag: 'CONCEPT', title: C.CONCEPTS.decay.t, body: `<p class="hintp">▶ The reactor tripped (${esc(e.cause)}). The chain reaction is over but the core is still hot. Keep feedwater going. When power is below 2 %, R resets the trip and you can restart.</p>` + conceptHTML('decay') }); }, 2200); }
        break;
      case 'si': cine('SAFETY INJECTION', 'emergency pumps injecting borated water', 'amber'); AU.sfx('warn'); if (g) g.sis++; break;
      case 'turbine-trip': AU.sfx('relay'); if (mode !== 'title') toast('TURBINE TRIPPED', 'red', 4000); break;
      case 'turbine-latch': AU.sfx('on'); toast('Turbine latched: synchronising to the grid', 'blue', 4000); break;
      case 'dg-run': AU.sfx('on'); toast('EMERGENCY DIESEL RUNNING', 'green', 4000); break;
      case 'dg-fail': AU.sfx('bad'); toast('EMERGENCY DIESEL FAILED TO START (G retries)', 'red', 6000); break;
      case 'afw-auto': if (mode !== 'title') toast('AUX FEEDWATER auto-started', 'blue', 4000); break;
      case 'scram-reset': AU.sfx('relay'); break;
      case 'quench-burst': R.fx('quench'); AU.sfx('steam'); toast('QUENCH TANK RUPTURE DISK BURST: coolant is now in containment', 'red', 8000); break;
      case 'meltdown': cine('CORE MELT', 'the fuel has slumped', 'red'); AU.sfx('bad'); break;
      case 'explosion': case 'excursion': R.fx('boom'); AU.sfx('boom'); cine(e.k === 'explosion' ? 'STEAM EXPLOSION' : 'POWER EXCURSION', 'prompt critical: the core destroyed itself', 'red'); break;
    }
  }
}

/* ---------- endings ---------- */
function endScreen(title, grade, body, next, nextLabel) {
  $('endt').textContent = title; $('endg').textContent = grade; $('endg').className = 'grade g' + grade.replace(/[^A-Z]/g, ''); $('endb').innerHTML = body;
  $('bnext').style.display = next ? '' : 'none'; if (nextLabel) $('bnext').textContent = nextLabel; show('end');
}
function shiftEnd(damaged) {
  const acc = g.acc(), rank0 = rankOf(prefs.xp);
  let grade = damaged ? 'F' : acc >= 0.9 && g.trips === 0 ? 'S' : acc >= 0.8 && g.trips <= 1 ? 'A' : acc >= 0.65 ? 'B' : acc >= 0.5 ? 'C' : 'D';
  const xp = damaged ? 50 : Math.round(g.score / 3 + g.resolved * 50); prefs.xp += xp; prefs.best = Math.max(prefs.best, Math.round(g.score)); savePrefs();
  const rank1 = rankOf(prefs.xp);
  AU.sfx(damaged ? 'bad' : 'good');
  endScreen(damaged ? 'CORE DAMAGE — SHIFT OVER' : `SHIFT ${g.shiftNo} COMPLETE`, grade,
    `<table class="keys"><tr><td>Grid accuracy</td><td>${Math.round(acc * 100)} %</td></tr>${g.excusedT > 1 ? `<tr><td>Off grid for crew repairs (not scored)</td><td>${Math.round(g.excusedT)} s</td></tr>` : ''}<tr><td>Faults resolved</td><td>${g.resolved}</td></tr><tr><td>Reactor trips</td><td>${g.trips}</td></tr><tr><td>Safety injections</td><td>${g.sis}</td></tr><tr><td>Score</td><td>${Math.round(g.score)}</td></tr><tr><td>XP</td><td>+${xp} → ${prefs.xp} (${rank1.t})</td></tr></table>` +
    (rank1 !== rank0 ? `<p class="hintp">PROMOTED: ${rank1.t}</p>` : '') + (damaged ? `<p>${C.CONCEPTS.eccs.b[0]}</p>` : '<p>The next shift starts from this plant state, faults come faster and harder.</p>'), !damaged, 'NEXT SHIFT');
}
function drillEnd(pass) {
  const d = drill; prefs.drills[d.id] = prefs.drills[d.id] || pass; if (pass) prefs.xp += 250; savePrefs();
  AU.sfx(pass ? 'good' : 'bad');
  endScreen(d.name + (pass ? ' — PASSED' : ' — FAILED'), pass ? 'PASS' : 'FAIL', `<p><b>Goal:</b> ${d.goal}</p>` + (d.history ? historyHTML(d.history) : conceptHTML(d.concept)), true, 'RETRY');
}

/* ---------- actions ---------- */
let turbArm = 0, scramArm = 0, scramHold = 0;
function scram(by) { if (s.scram) return; S.doScram(s, by || 'MANUAL'); }
function act(a, el) {
  AU.unlock();
  switch (a) {
    case 'shift': startShift(false); break;
    case 'tutorial': startTutorial(); break;
    case 'drills': drillList(); show('drills'); break;
    case 'lab': startLab(); break;
    case 'handbook': handbook('rods'); show('handbook'); break;
    case 'help': show('help'); break;
    case 'back': if (mode === 'title') show('title'); else if (g && g.paused) show('pause'); else show(null); break;
    case 'sound': prefs.muted = !prefs.muted; AU.setMuted(prefs.muted); savePrefs(); soundLabel(); break;
    case 'pause': togglePause(); break;
    case 'resume': togglePause(false); break;
    case 'quit': quit(); break;
    case 'next': if (mode === 'shift') startShift(true); else if (mode === 'drill') startDrill(drill); else quit(); break;
    case 'godrill': startDrill(pendingDrill); break;
    case 'cardok': closeCard(); break;
    case 'cardmore': if (card && card.history) { $('cbody').innerHTML = historyHTML(card.history); $('cmore').style.display = 'none'; } break;
    case 'tutnext': { const st = C.TUTORIAL[g.step]; if (st && st.wait === 'space') nextTut(); } break;
    case 'tutlearn': { const st = C.TUTORIAL[g.step]; if (st && st.concept) openCard({ tag: 'CONCEPT', title: C.CONCEPTS[st.concept].t, body: conceptHTML(st.concept) }); } break;
    case 'ack': if (ann.ack()) AU.sfx('relay'); break;
    case 'warp': warpIdx = (warpIdx + 1) % WARPS.length; AU.sfx('relay'); break;
    case 'auto': if (s.scram) { AU.sfx('deny'); break; } s.rodAuto = !s.rodAuto; if (s.runaway) s.runaway = 0; if (s.type.name === 'RBMK') s.powerSet = s.n; AU.sfx(s.rodAuto ? 'on' : 'off'); break;
    case 'reset': if (S.resetScram(s)) { g.sdWithdraw = true; toast('Trip reset: shutdown bank withdrawing. Pull rods (↑) to restart. If it stays subcritical with the rods out, xenon is building after the trip: dilute boron (N).', 'blue', 9000); } else { AU.sfx('deny'); toast(s.scram ? 'Trip reset needs power below 2 % (wait for it to fall)' : 'Reactor is not tripped', '', 3000); } break;
    case 'porv': s.porvCmd = !s.porvCmd; if (s.porvCmd) g.tut.porvOpened = true; else if (g.tut.porvOpened) g.tut.porvCycled = true; AU.sfx(s.porvCmd ? 'on' : 'off'); break;
    case 'block': s.blockCmd = s.blockCmd > 0.5 ? 0 : 1; AU.sfx(s.blockCmd ? 'on' : 'off'); break;
    case 'si': if (!s.si || s.siBlocked) { s.si = true; s.siBlocked = false; s.events.push({ k: 'si', t: s.t }); scram('MANUAL SAFETY INJECTION'); }
      else if (s.P > 13.5) { s.si = false; s.siBlocked = true; toast('SI reset and blocked (I re-actuates). Make sure subcooling stays healthy!', '', 5000); AU.sfx('off'); }
      else { AU.sfx('deny'); toast('SI cannot be reset below 13.5 MPa', '', 3000); } break;
    case 'hpi': s.hpiThrottle = s.hpiThrottle > 0.9 ? 0.5 : s.hpiThrottle > 0.4 ? 0.1 : 1; AU.sfx('relay'); break;
    case 'turb':
      if (s.turb.tripped) { if (S.latchTurbine(s)) break; AU.sfx('deny'); toast(s.n < 0.08 ? 'Latch needs reactor power ≥ 8 %' : s.msiv < 0.9 ? 'Open the MSIVs first (M)' : 'Steam pressure too low to roll the turbine', '', 3500); }
      else if (performance.now() - turbArm < 1500) { S.tripTurbine(s); turbArm = 0; }
      else { turbArm = performance.now(); toast('Press TURBINE (T) again to trip it', '', 1500); AU.sfx('arm'); } break;
    case 'msiv': s.msivCmd = s.msivCmd > 0.5 ? 0 : 1; AU.sfx(s.msivCmd ? 'on' : 'off'); if (!s.msivCmd && !s.turb.tripped) S.tripTurbine(s); break;
    case 'afw': s.afw = !s.afw; s.afwAuto = s.afw; AU.sfx(s.afw ? 'on' : 'off'); break;
    case 'dump': s.sgDump = s.sgDump > 0 ? 0 : 1; AU.sfx(s.sgDump ? 'on' : 'off'); break;
    case 'dg': { let any = false; for (const d of s.dg) if ((d.st === 'off' || d.st === 'failed') && !d.flooded) { d.st = 'starting'; d.t = 0; d.failP = 0.25; any = true; } AU.sfx(any ? 'on' : 'deny'); if (!any) toast(s.dg.some(d => d.flooded) ? 'The diesels are flooded' : 'Diesels already running or starting', '', 3000); } break;
    case 'focus': R.setFocus(R.focus === 'core' ? 'plant' : 'core'); AU.sfx('relay'); break;
    case 'labels': prefs.labels = !prefs.labels; savePrefs(); AU.sfx('relay'); break;
    default:
      if (/^pump\d$/.test(a)) { const k = +a[4], p = s.pumps[k]; p.on = !p.on; if (k === 3 && !p.on) g.tut.p4off = true; AU.sfx(p.on ? 'on' : 'off'); if (p.on && p.failed) toast(`RCP ${k + 1} is failed; wait for the crew`, '', 3000); }
  }
}
function soundLabel() { for (const id of ['bsound', 'bsound2']) $(id).textContent = 'SOUND: ' + (prefs.muted ? 'OFF' : 'ON'); }
function togglePause(v) {
  if (!g || mode === 'title') return;
  g.paused = v == null ? !g.paused : v; show(g.paused ? 'pause' : null); AU.sfx('relay');
}
function quit() { card = null; startAttract(); show('title'); titleRank(); }

/* ---------- lab ---------- */
function labAct(k) {
  AU.unlock(); AU.sfx('relay');
  const beta = s.type.beta * 1e5;
  if (k === 'delayed') { s.noDelayed = !s.noDelayed; if (s.noDelayed) { lab.speed = 0.01; } }
  else if (k === 'fb') { const before = s.rho.total; s.noFeedback = !s.noFeedback; S.computeRho(s); s.rho0 += before - s.rho.total; S.computeRho(s); }
  else if (k === 'slow') lab.speed = lab.speed === 1 ? 0.1 : lab.speed === 0.1 ? 0.01 : 1;
  else if (k === 'reset') { startLab(); return; }
  else if (k === 'zero') s.extRho = 0;
  else s.extRho = parseFloat(k) * beta;
  labUI();
}
function labUI() {
  $('labdel').textContent = 'DELAYED: ' + (s.noDelayed ? 'OFF' : 'ON'); $('labdel').classList.toggle('hot', s.noDelayed);
  $('labfb').textContent = 'FEEDBACK: ' + (s.noFeedback ? 'OFF' : 'ON'); $('labslow').textContent = 'SPEED ×' + lab.speed;
  labChart.o.span = 30 * lab.speed; labChart.clear();
}
function labText() {
  const T = s.type, $d = s.rho.total / (T.beta * 1e5), L = T.gen * 1e3;
  let t;
  if (lab.boomT > 0) t = '<b class="red">PROMPT-CRITICAL EXCURSION.</b> In a real core the fuel would vaporise before any rod could move. Resetting…';
  else if (s.noDelayed) t = $d > 0.001 ? `<b>No delayed neutrons</b> (thought experiment). Every neutron is prompt, so the period is Λ/ρ ≈ <b>${(L / (s.rho.total * 1e-5)).toFixed(1)} ms</b>. Power multiplies ${Math.exp(1000 / (L / (s.rho.total * 1e-5))).toExponential(0)}× per second. No machine could control that, so delayed neutrons are what make reactors possible.` : 'No delayed neutrons. Add a tiny step (+0.1 $) and watch the speed (slow motion is on).';
  else if ($d >= 1) t = `<b class="red">PROMPT CRITICAL</b> (ρ ≥ 1 $). Prompt neutrons alone sustain the chain: period ≈ Λ/(ρ−β) = <b>${(L / ((s.rho.total * 1e-5) - T.beta)).toFixed(1)} ms</b>. This is what happened at Chernobyl.`;
  else if ($d > 0.002) { const P = S.inhourPeriod('PWR', s.rho.total * 1e-5); t = `<b>Supercritical, delayed-controlled.</b> First a <i>prompt jump</i> of about ×${(1 / (1 - $d)).toFixed(2)}, then a stable period of <b>${P < 1 ? P.toFixed(2) : P.toFixed(1)} s</b> (inhour equation). The delayed neutrons set the pace, slow enough for rods to respond.`; }
  else if ($d < -0.002) t = `<b>Subcritical.</b> Power drops promptly (prompt drop), then falls no faster than the longest-lived precursor allows: a period of about <b>−80 s</b>. That is why shutdown takes minutes to reach very low power.`;
  else t = '<b>Critical</b> (k = 1): each generation exactly replaces itself, so power holds steady at any level.';
  $('labtxt').innerHTML = t;
  $('labro').innerHTML = `<span>ρ <b>${s.rho.total.toFixed(0)} pcm</b> = <b>${$d.toFixed(2)} $</b></span><span>POWER <b>${fmt.power(s.n)}</b></span><span>PERIOD <b>${fmt.period(s.period)}</b></span><span>Λ <b>${(T.gen * 1e6).toFixed(0)} µs</b> · β <b>${(T.beta * 100).toFixed(2)} %</b></span>`;
}

/* ---------- drills list / handbook ---------- */
let pendingDrill = null;
function drillList() {
  $('drilllist').innerHTML = C.DRILLS.map((d, i) => `<button class="drill" data-drill="${i}"><b>${d.name}${prefs.drills[d.id] ? ' <span class="ok">✓</span>' : ''}</b><span>${d.sub}</span></button>`).join('');
}
function briefDrill(i) {
  const d = C.DRILLS[i]; pendingDrill = d; $('brt').textContent = d.name;
  $('brb').innerHTML = `<p>${d.brief}</p><p><b>GOAL:</b> ${d.goal}</p>` + (C.CONCEPTS[d.concept] ? `<details><summary>${C.CONCEPTS[d.concept].t}</summary>${conceptHTML(d.concept)}</details>` : '');
  show('brief');
}
function handbook(k) {
  const keys = Object.keys(C.CONCEPTS), hk = Object.keys(C.HISTORY).filter(x => x !== 'generic');
  $('hbtabs').innerHTML = keys.map(x => `<button class="chip${x === k ? ' on' : ''}" data-hb="${x}">${C.CONCEPTS[x].t}</button>`).join('') + hk.map(x => `<button class="chip hist${x === k ? ' on' : ''}" data-hb="${x}">${C.HISTORY[x].t.split(' — ')[0]}</button>`).join('');
  $('hbbody').innerHTML = C.CONCEPTS[k] ? `<h4>${C.CONCEPTS[k].t}</h4>` + conceptHTML(k) : historyHTML(k);
}

/* ---------- title ---------- */
function titleRank() {
  const r = rankOf(prefs.xp), nx = C.RANKS.find(x => x.xp > prefs.xp);
  $('trank').innerHTML = `RANK: <b>${r.t}</b> · ${prefs.xp} XP${nx ? ` · next: ${nx.t} at ${nx.xp}` : ''}${prefs.best ? ` · best shift ${prefs.best}` : ''}`;
  $('diffs').innerHTML = C.DIFFS.map((d, i) => `<button class="chip${i === prefs.diff ? ' on' : ''}" data-diff="${i}" title="${d.sub}">${d.t}</button>`).join('') + `<div class="dsub">${C.DIFFS[prefs.diff].sub}</div>`;
}

/* ---------- clicks (event delegation) ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-drill],[data-hb],[data-diff],[data-lab],[data-da],[data-fact]'); if (!t) return;
  AU.unlock();
  if (t.dataset.act) { if (t.dataset.act === 'ack' || !t.classList.contains('hold')) act(t.dataset.act, t); }
  else if (t.dataset.drill) { AU.sfx('relay'); briefDrill(+t.dataset.drill); }
  else if (t.dataset.hb) { AU.sfx('relay'); handbook(t.dataset.hb); }
  else if (t.dataset.diff) { prefs.diff = +t.dataset.diff; savePrefs(); titleRank(); AU.sfx('relay'); }
  else if (t.dataset.lab) labAct(t.dataset.lab);
  else if (t.dataset.da) drillAct(t.dataset.da);
  else if (t.dataset.fact) { const f = g.faults[+t.dataset.fact]; if (f && f.def.act) { f.def.act.fn(s, g, f); AU.sfx('on'); t.disabled = true; } }
});
/* hold buttons (pointer events so touch, mouse and pen all work) */
for (const b of qsa('[data-hold]')) {
  const k = b.dataset.hold;
  const down = e => { e.preventDefault(); AU.unlock(); held.add(k); b.classList.add('down'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } if (k === 'in' || k === 'out') AU.sfx('relay'); };
  const up = () => { held.delete(k); b.classList.remove('down'); };
  b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  b.addEventListener('contextmenu', e => e.preventDefault());
}
/* guarded SCRAM button: hold 0.6 s */
const qscram = $('qscram');
qscram.addEventListener('pointerdown', e => { e.preventDefault(); AU.unlock(); scramHold = performance.now(); AU.sfx('arm'); try { qscram.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } });
function scramRelease() { if (scramHold > 0 && performance.now() - scramHold >= 600 && !s.scram) scram('MANUAL'); scramHold = 0; }
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) qscram.addEventListener(ev, scramRelease);
qscram.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- keyboard ---------- */
const KHOLD = { ArrowUp: 'out', KeyW: 'out', ArrowDown: 'in', KeyS: 'in', ArrowLeft: 'loadDn', ArrowRight: 'loadUp', KeyB: 'borate', KeyN: 'dilute' };
const KACT = { KeyC: 'auto', KeyR: 'reset', KeyO: 'porv', KeyK: 'block', KeyI: 'si', KeyJ: 'hpi', KeyT: 'turb', KeyM: 'msiv', KeyU: 'afw', KeyF: 'dump', KeyG: 'dg', KeyX: 'warp', KeyV: 'focus', KeyL: 'labels', Digit1: 'pump0', Digit2: 'pump1', Digit3: 'pump2', Digit4: 'pump3' };
let enterDown = false;
addEventListener('keydown', e => {
  AU.unlock();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const c = e.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(c)) e.preventDefault();
  if (c === 'Space') { if (e.repeat) return; if (screen === 'card') closeCard(); else if (screen === 'title') act('shift'); else if (screen === 'end') act('next'); else if (screen === 'brief') act('godrill'); else if (mode === 'tutorial' && !screen && C.TUTORIAL[g.step] && C.TUTORIAL[g.step].wait === 'space' && !ann.unacked) act('tutnext'); else act('ack'); return; }
  if (c === 'Escape' || c === 'KeyP') { if (screen === 'card') closeCard(); else if (['help', 'handbook', 'drills', 'brief'].includes(screen)) act('back'); else togglePause(); return; }
  if (c === 'KeyH') { if (screen === 'help') act('back'); else show('help'); return; }
  if (screen && screen !== null) return;
  if (c === 'Enter') { if (e.repeat) return; enterDown = true; const now = performance.now(); if (now - scramArm < 800) { scram('MANUAL'); scramArm = 0; } else { scramArm = now; scramHold = performance.now(); AU.sfx('arm'); } return; }
  if (mode === 'lab') { const L = { Digit1: '0.1', Digit2: '0.5', Digit3: '0.9', Digit4: '1.0', Digit5: '1.2', Digit0: 'zero', KeyD: 'delayed', KeyX: 'slow', KeyR: 'reset' }; if (L[c] && !e.repeat) { labAct(L[c]); return; } }
  if (KHOLD[c]) { if (!held.has(KHOLD[c]) && (KHOLD[c] === 'in' || KHOLD[c] === 'out')) AU.sfx('relay'); held.add(KHOLD[c]); return; }
  if (KACT[c] && !e.repeat) act(KACT[c]);
});
addEventListener('keyup', e => { const c = e.code; if (KHOLD[c]) held.delete(KHOLD[c]); if (c === 'Enter') { enterDown = false; scramRelease(); } });
addEventListener('blur', () => { held.clear(); scramHold = 0; });

/* ---------- gamepad ---------- */
let padPrev = [];
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = pads && Array.from(pads).find(x => x);
  if (!p) return;
  const b = i => p.buttons[i] && p.buttons[i].pressed, edge = i => b(i) && !padPrev[i];
  const ax = p.axes[1] || 0, lx = p.axes[0] || 0;
  const setH = (k, on) => { if (on) held.add(k); else if (padHeld.has(k)) held.delete(k); if (on) padHeld.add(k); else padHeld.delete(k); };
  setH('out', b(12) || ax < -0.5); setH('in', b(13) || ax > 0.5); setH('loadDn', b(14) || lx < -0.5); setH('loadUp', b(15) || lx > 0.5); setH('borate', b(4)); setH('dilute', b(5));
  if (edge(0)) { AU.unlock(); if (screen === 'card') closeCard(); else if (screen === 'title') act('shift'); else if (screen === 'end') act('next'); else if (screen === 'brief') act('godrill'); else if (mode === 'tutorial' && C.TUTORIAL[g.step] && C.TUTORIAL[g.step].wait === 'space') act('tutnext'); else act('ack'); }
  if (edge(9)) togglePause(); if (edge(2)) act('warp'); if (edge(3)) act('auto'); if (edge(8)) show(screen === 'help' ? null : 'help');
  if (b(1) && !screen) { if (!padPrev[1]) { scramHold = performance.now(); AU.sfx('arm'); } } else if (padPrev[1]) scramRelease();
  padPrev = p.buttons.map(x => x.pressed);
}
const padHeld = new Set();

/* ---------- HUD + console refresh ---------- */
function resetHud() { for (const k in G) G[k].shown = G[k].frac(G[k].v); }
const disp = k => g && g.frozen[k] != null ? g.frozen[k] : s[k];
let uiT = 0, labelT = 0;
function hud(dt) {
  const n = s.n, rb = s.type.name === 'RBMK';
  $('hpow').textContent = fmt.power(n); $('hpow').className = n > 1.03 ? 'red' : '';
  $('mwe').textContent = Math.round(s.MWe); $('dem').textContent = mode === 'shift' || mode === 'drill' ? Math.round(g.demand * 1000) : '—';
  $('dbarv').style.width = clamp(s.MWe / 12, 0, 100) + '%'; $('dbard').style.left = clamp(g.demand * 100 / 1.2, 0, 100) + '%';
  const m = mode === 'shift' ? `SHIFT ${g.shiftNo} · ${g.D.t}` : mode === 'drill' ? 'DRILL · ' + drill.name : mode === 'tutorial' ? 'TRAINING' : mode === 'lab' ? 'NEUTRON LAB' : 'DEMO';
  $('hmode').textContent = m + (WARPS[warpIdx] > 1 ? ` · ×${WARPS[warpIdx]}` : '') + (mode === 'drill' && drill.warp ? ` · plant clock ×${drill.warp}` : '');
  $('hclock').textContent = mode === 'shift' ? `${fmt.t(g.t)} / ${fmt.t(g.len)}` : mode === 'drill' ? `${fmt.t(s.t)} / ${fmt.t(drill.len)}` : fmt.t(s.t);
  $('hscore').textContent = mode === 'shift' ? `SCORE ${Math.round(g.score)}` : '';
  $('qwarp').textContent = '×' + WARPS[warpIdx];
  for (const id of ['qauto', 'bauto']) $(id).classList.toggle('on', s.rodAuto);
  // gauges
  G.pow.set(n * 100); G.pow.bad = n > 1.03; G.logp.set(Math.max(1e-6, n));
  G.sur.set(clamp(isFinite(s.period) ? 26.06 / s.period : 0, -1, 5)); G.sur.bad = s.period > 0 && s.period < 20;
  G.tavg.set(disp('Tavg')); G.press.set(disp('P')); G.pzr.set(disp('Lpzr') * 100); G.orm.set(s.ORM); G.flow.set(s.W * 100); G.dnbr.set(s.dnbr); G.sm.set(s.SM); G.void.set(s.voidCore * 100);
  G.mwe.set(s.MWe, mode === 'shift' || mode === 'drill' ? g.demand * 1000 : null); G.sg.set(s.Lsg * 100); G.ps.set(s.Ps);
  G.decay.set(s.decay * 100); G.clad.set(s.TclPk); G.cov.set(s.coverage * 100); G.bat.set(s.battery * 100);
  for (const k in G) G[k].draw(dt);
  // reactivity bars
  const sc = 2500;
  for (const e of rxEls) {
    let v = e.k === 'boron' ? s.rho.boron + s.rho0 : s.rho[e.k];
    const vis = !(e.k === 'tip' && !rb) && !(e.k === 'ext' && mode !== 'lab') && !(e.k === 'void' && !rb && Math.abs(v) < 1);
    e.r.style.display = vis ? '' : 'none'; if (!vis) continue;
    const w = clamp(Math.abs(v) / sc * 50, 0, 50); e.i.style.width = w + '%'; e.i.style.left = (v < 0 ? 50 - w : 50) + '%'; e.i.className = v < 0 ? 'neg' : 'pos'; e.em.textContent = (v > 0 ? '+' : '') + v.toFixed(0);
  }
  $('rxtot').innerHTML = `total <b class="${s.rho.dollars > 0.5 ? 'red' : ''}">${s.rho.total >= 0 ? '+' : ''}${s.rho.total.toFixed(0)} pcm = ${s.rho.dollars.toFixed(3)} $</b>`;
  for (let i = 0; i < S.NR; i++) { rodEls[i].style.height = (s.rods[i] * 100) + '%'; rodEls[i].parentNode.classList.toggle('stuck', s.stuck[i]); }
  rodEls[S.NR].style.height = (s.sd * 100) + '%';
  $('rodtxt').textContent = `${rb ? 'ORM ' + s.ORM.toFixed(1) : 'avg ' + Math.round(S.rodAvg(s) * 100) + ' % in'} · ${s.rodAuto ? 'AUTO' : 'MANUAL'}${s.runaway ? ' · RUNAWAY!' : ''}`;
  // button states
  const on = (id, v, txt) => { const e = $(id); e.classList.toggle('on', !!v); if (txt) e.textContent = txt; };
  on('bporv', s.porvCmd, g && g.tmi ? 'PORV ' + (s.porvCmd || s.porvAuto ? 'OPEN' : 'CLOSED') : 'PORV ' + (s.porv > 0.5 ? 'OPEN' : 'SHUT'));
  on('bblock', s.blockCmd < 0.5, 'BLOCK ' + (s.block < 0.05 ? 'SHUT' : s.block > 0.95 ? 'OPEN' : 'MOVING'));
  on('bsi', s.si && !s.siBlocked, s.si && !s.siBlocked ? 'SI ACTIVE' : 'SAFETY INJ');
  $('bhpi').textContent = 'HPI ' + Math.round(s.hpiThrottle * 100) + '%';
  on('bturb', !s.turb.tripped, s.turb.tripped ? 'TURBINE: LATCH' : s.turb.synced ? 'TURBINE: ON LINE' : 'TURBINE: SYNC…');
  on('bmsiv', s.msivCmd > 0.5, 'MSIV ' + (s.msiv > 0.95 ? 'OPEN' : s.msiv < 0.05 ? 'SHUT' : 'MOVING'));
  on('bafw', s.afw, 'AUX FEED ' + (s.afw ? 'ON' : 'OFF'));
  on('bdump', s.sgDump > 0, 'ATM DUMP ' + (s.sgDump > 0 ? 'OPEN' : 'SHUT'));
  on('breset', s.scram && s.n < 0.02);
  $('bdg').textContent = 'DIESELS: ' + s.dg.map(d => d.st.toUpperCase()).join(' / ');
  $('bfocus').textContent = 'VIEW: ' + (R.focus === 'core' ? 'CORE' : 'PLANT'); $('blabels').textContent = 'LABELS: ' + (prefs.labels ? 'ON' : 'OFF');
  qsa('#console .pump').forEach((b, i) => { const p = s.pumps[i]; b.classList.toggle('on', p.on && !p.failed); b.classList.toggle('bad', p.failed); b.textContent = `RCP ${i + 1} ${p.failed ? 'FAIL' : p.on ? Math.round(p.w * 100) + '%' : 'OFF'}`; });
  // readouts
  const row = (k, v, c) => `<div${c ? ` class="${c}"` : ''}><span>${k}</span><b>${v}</b></div>`;
  $('ro-core').innerHTML = row('Neutron power', fmt.power(n)) + row('Period', fmt.period(s.period)) + row('Boron', s.B.toFixed(0) + ' ppm' + (s.borCmd > 0 ? ' ▲' : s.borCmd < 0 ? ' ▼' : '')) + row('Xenon', Math.round(s.X / S.X_EQ1 * 100) + ' % of eq.') + row('MTC', (s.rho.mtc || 0).toFixed(1) + ' pcm/°C') + row('Fuel temp (avg)', s.Tf.toFixed(0) + ' °C');
  $('ro-cool').innerHTML = row('T hot / T cold', `${s.Thot.toFixed(1)} / ${s.Tcold.toFixed(1)} °C`) + row('Boiling regime', s.regime, s.regime === 'NUCLEATE' ? '' : 'warn') + row('PORV tail-pipe', s.tailT.toFixed(0) + ' °C', s.tailT > 120 ? 'warn' : '') + row('Quench tank', s.quenchP.toFixed(2) + ' MPa' + (s.quenchBurst ? ' BURST' : '')) + row('ECCS flow', (s.eccsFlow * 1000).toFixed(2)) + row('Coolant inventory', Math.round(s.M * 100) + ' %', s.M < 0.85 ? 'warn' : '');
  $('ro-steam').innerHTML = row('Turbine load', Math.round(s.turb.load * 100) + ' %') + row('Steam flow', Math.round(s.Fsteam * 100) + ' %') + row('Feed flow', Math.round(s.Ffw * 100) + ' %' + (s.mainFW ? '' : ' (main FW lost)')) + row('Aux feed', (s.afwFlow * 100).toFixed(1) + ' %') + row('Turbine speed', Math.round(s.turb.rpm) + ' rpm') + row('Grid demand', mode === 'shift' || mode === 'drill' ? Math.round(g.demand * 100) + ' %' : '—');
  $('ro-safe').innerHTML = row('AC power', s.offsite ? 'GRID' : S.acPower(s) ? 'DIESELS' : 'NONE — BLACKOUT', S.acPower(s) ? '' : 'warn') + row('Fuel centre peak', s.TfPk.toFixed(0) + ' °C') + row('Hydrogen', s.h2.toFixed(0) + ' kg', s.h2 > 20 ? 'warn' : '') + row('Clad oxidised', (s.ox * 100).toFixed(1) + ' %') + row('Core damage', (s.damage * 100).toFixed(1) + ' %', s.damage > 0 ? 'warn' : '') + row('Release', (s.released * 100).toFixed(1) + ' %', s.released > 0 ? 'warn' : '');
  // faults: crew timers
  if (g) for (const em of qsa('#faults [data-fr]')) { const f = g.faults[+em.dataset.fr]; if (f) em.textContent = f.repaired ? 'crew: repaired' : `crew repair in ${fmt.t(f.repairAt - f.t)}`; }
  updateDrillBar();
  // contextual hint
  let h = '';
  if (mode !== 'title' && mode !== 'lab') {
    if (s.scram && s.n < 0.02) h = 'Reactor shut down. <b>R</b> resets the trip; then withdraw rods (↑) to restart.';
    else if (s.scram) h = `Decay heat ${(s.decay * 100).toFixed(1)} %: keep feedwater going (AUX FEED).`;
    else if (s.turb.tripped && s.n >= 0.08) h = '<b>T</b> latches the turbine.';
    else if (s.type.name === 'PWR' && S.rodAvg(s) < 0.03 && s.n < g.demand - 0.05) h = 'Rods are fully out (no worth left at the ends of travel). <b>Dilute boron (N)</b>.';
    else if (s.type.name === 'PWR' && S.rodAvg(s) > 0.5 && !s.scram && s.n > 0.2) h = 'Rods deep in the core: <b>borate (B)</b> to bring them back to mid-range.';
  }
  $('hint').innerHTML = h; $('hint').classList.toggle('show', !!h);
}
function labels() {
  const box = $('labels');
  if (!prefs.labels || mode === 'title') { box.innerHTML = ''; return; }
  box.innerHTML = R.anchors().filter(a => a.ok && a.y > (document.body.classList.contains('compact') ? 78 : 56)).map(a => `<div class="lbl" style="transform:translate(${a.x.toFixed(0)}px,${a.y.toFixed(0)}px)">${a.t}</div>`).join('');
}

/* ---------- main loop ---------- */
let last = performance.now(), alarmLevel = 0, klaxon = false, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now; frames++;
  try {
    pollPad();
    // SCRAM hold
    const sh = scramHold > 0 ? (performance.now() - scramHold) / 1000 : 0; if (sh >= 0.6) { scram('MANUAL'); scramHold = 0; }
    $('scramfill').style.width = clamp(sh / 0.6 * 100, 0, 100) + '%';
    const running = !screen || screen === 'title' || screen === 'loading';
    const paused = g && (g.paused || screen === 'card' || screen === 'end' || screen === 'help' || screen === 'handbook' || screen === 'pause' || screen === 'drills' || screen === 'brief');
    if (g && running && !paused && !(mode !== 'title' && screen === 'title')) {
      let simDt;
      if (mode === 'lab') simDt = dt * lab.speed;
      else simDt = dt * WARPS[warpIdx] * (mode === 'drill' && drill.warp ? drill.warp : 1);
      const hs = mode === 'lab' ? Math.max(1e-4, simDt / 4) : 0.05, nSteps = Math.min(400, Math.ceil(simDt / hs - 1e-9));
      for (let i = 0; i < nSteps; i++) {
        const h = simDt / nSteps; controls(h); S.step(s, h); gameStep(h);
        if (s.exploded) break;
      }
      if (mode === 'lab') {
        labChart.push(s.t, Math.max(1e-7, s.n));
        if (s.n > 50 && lab.boomT <= 0) { lab.boomT = 3; R.fx('scram'); R.flash = 0.9; AU.sfx('boom'); cine('PROMPT CRITICAL', 'power ×' + Math.round(s.n * 1000), 'red'); }
        if (lab.boomT > 0) { lab.boomT -= dt; if (lab.boomT <= 0) { const d = s.noDelayed, sp = lab.speed; startLab(); s.noDelayed = d; lab.speed = sp; labUI(); R.exploded = false; } }
      }
      events(); checkEnd();
    }
    if (cineT > 0) { cineT -= dt; if (cineT <= 0) $('cine').classList.remove('show'); }
    // annunciators, alarm level
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 1 / 15;
      const a = ann.update(s, g || {});
      if (a.fresh.length && mode !== 'title' && mode !== 'lab') { AU.sfx('chime'); if (a.fresh.some(d => d.sev >= 2)) R.fx('alarm'); }
      alarmLevel = mode === 'title' ? 0 : a.maxOn; klaxon = mode !== 'title' && mode !== 'lab' && ann.unacked && ANN.some(d => d.sev >= 2 && ann.tiles.find(t => t.d === d && t.on && !t.ack));
      $('qack').classList.toggle('flash', !!ann.unacked);
      hud(1 / 15 * 1.0);
      if (mode === 'lab') { labChart.draw(); labText(); }
    }
    labelT -= dt; if (labelT <= 0) { labelT = 0.1; labels(); }
    // audio + render
    AU.update(dt, { n: mode === 'title' ? s.n * 0.6 : s.n, flow: s.W, rpm: s.turb.rpm, steam: clamp(s.slb + s.sgDump * 0.4 + (s.porv * s.block) * 0.5 + (s.Ps > 8.3 ? 0.4 : 0), 0, 1), rodMoving: !!s.rodMoving && !s.scram, klaxon: klaxon && !(g && g.paused), geiger: mode === 'title' ? 0.4 : 1 });
    R.update(dt, s, { alarm: alarmLevel });
    R.render();
  } catch (err) {
    console.error(err);
    if (!frame.errShown) { frame.errShown = true; window.RXFatal('runtime: ' + (err && err.message || err)); }
  }
}

/* ---------- boot ---------- */
layout(); soundLabel(); AU.setMuted(prefs.muted); titleRank(); handbook('rods');
startAttract();
$('lprog').style.width = '100%';
setTimeout(() => { show('title'); }, params.has('fast') ? 0 : 500);
requestAnimationFrame(t => { last = t; frame(t); });

window.RX = {
  booted: true, R, S, C, get s() { return s; }, get g() { return g; }, get mode() { return mode; }, get screen() { return screen; },
  act, show, startShift, startDrill: i => startDrill(C.DRILLS[i]), startTutorial, startLab, labAct, drillAct, closeCard, ann, G,
  sim(sec) { const h = 0.05; for (let t = 0; t < sec; t += h) { controls(h); S.step(s, h); gameStep(h); } events(); checkEnd(); },
  hold(k, on) { if (on) held.add(k); else held.delete(k); },
};
