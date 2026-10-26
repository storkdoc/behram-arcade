/* NEURO ARENA: UI controller. Evolution state lives here; spiking brains run in Web Workers. */
import { Evolution, quantW, dequantW, BENCH_N } from './evo.js';
import { CONTESTS, CONTEST, benchSet as benchSet_, chanceAt, levelName } from './contests.js';
import { cLayout } from './cbrain.js';
import { Stage } from './stage.js';
import * as LAB from './lab.js';
import { GENES, GENE, fmtGene, gen0Genome } from './genome.js';
import { N, L } from './brain.js';
import { COURT } from './pong.js';
import { Render3D, REGION_LABELS } from './render3d.js';
import { Render2D } from './render2d.js';
import { makeHandler } from './simcore.js';

const $ = id => document.getElementById(id);
const KEY = 'neuroArena.v3';          // v3: one evolution per contest (KEY + '.' + contest id); the v2 Pong save is migrated
const KEY_V2 = 'neuroArena.v2';
try { localStorage.removeItem('neuroArena.v1'); } catch (e) { /* storage disabled */ }
// brain sizes offered by the slider (total neurons per brain; the Pong brain is fixed at 2,800)
const SIZES = [1400, 2800, 5600, 11200, 22400];
const DEFAULT_SIZE = 2800;
const VISIBLE = CONTESTS.filter(c => !c.hidden);
let meta = (() => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } })();
meta.sum = meta.sum || {};
if (!CONTEST[meta.cur] || CONTEST[meta.cur].hidden) meta.cur = 'pong';
const fromURL = (location.search.match(/[?&]contest=(\w+)/) || [])[1]; if (fromURL && CONTEST[fromURL]) meta.cur = fromURL;
function saveMeta() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch (e) { /* storage full or disabled */ } }
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const RANDOM_HIT = 0.24;              // measured: a random paddle on the benchmark serves (see README)
const coarse = matchMedia('(pointer: coarse)').matches;
const HC = navigator.hardwareConcurrency || 4;
const errs = [];
// visible error banner instead of a silently blank page
function banner(msg, level = 'err') {
  const el = $('banner'); if (!el) return;
  el.className = level; el.querySelector('span').textContent = msg;
  clearTimeout(banner.t); if (level === 'info') banner.t = setTimeout(() => { el.className = 'hidden'; }, 9000);
}
window.NA_banner = banner;
window.addEventListener('error', e => { errs.push(String(e.message)); banner('Something went wrong: ' + e.message); });
window.addEventListener('unhandledrejection', e => { const m = String(e.reason && e.reason.message || e.reason); errs.push(m); banner('Something went wrong: ' + m); });

// ------------------------------------------------------------------ state
const evos = {};
function newEvo(id) { return new Evolution({ lamarck: true, contest: id, size: id === 'pong' ? 2800 : (meta.size || DEFAULT_SIZE) }); }
function getEvo(id) { if (!evos[id]) { evos[id] = load(id) || newEvo(id); evos[id].opts.contest = id; if (id === 'pong') evos[id].opts.size = 2800; } return evos[id]; }
const ui = { mode: 'watch', speed: 1, K: Math.max(1, Math.min(coarse ? 3 : 6, HC - 1)), epoch: 0, live: null, lastSave: 0, turboGen0: 0, turboT0: 0, gps: 0, tip: null, tab: 'chart', polMaps: [null, null] };
let evo = getEvo(meta.cur), C = CONTEST[meta.cur];
window.NA = { get evo() { return evo; }, get contest() { return C; }, select: id => selectContest(id), evos, ui, errs, get R() { return R; }, get noWorkers() { return noWorkers; }, courtPoint: (x, y) => R ? R.courtAnchor(x, y) : null, restart: () => { ui.started = false; setMode('watch'); } };   // for tests / console tinkering

function load(id) {
  try { const s = localStorage.getItem(KEY + '.' + id); if (s) { const e = Evolution.restore(JSON.parse(s)); if (e) return e; } } catch (e) { console.warn('could not restore', e); }
  if (id === 'pong') try { const s = localStorage.getItem(KEY_V2); if (s) { const e = Evolution.restore(JSON.parse(s)); if (e) { ui.migrated = true; return e; } } } catch (e) { console.warn('could not migrate the v2 save', e); }
  return null;
}
function save(force) {
  const now = performance.now(); if (!force && now - ui.lastSave < 8000) return; ui.lastSave = now;
  const id = evo.opts.contest, k = KEY + '.' + id;
  meta.sum[id] = { gen: evo.gen, acc: champAcc(evo), size: evo.opts.size, level: evo.level || 0 }; meta.cur = C.id; saveMeta();
  try { localStorage.setItem(k, JSON.stringify(evo.serialize(true))); if (id === 'pong') localStorage.removeItem(KEY_V2); }
  catch (e) { try { localStorage.setItem(k, JSON.stringify(evo.serialize(false))); } catch (e2) { /* storage full or disabled */ } }
  renderCarousel();
}
const isChoice = () => C.kind === 'choice';
// the champion's benchmark accuracy (Pong: hit rate) - the number the charts and cards show
function champAcc(e) { const b = e.champ.bench; return b ? (b.acc ?? e.champ.fit) : 0; }
const lvOf = c => c === C ? (evo.level || 0) : ((meta.sum[c.id] && meta.sum[c.id].level) || 0);
const chanceOf = (c, lv) => c.kind === 'choice' ? chanceAt(c, lv ?? lvOf(c)) : RANDOM_HIT;
const benchSet = c => benchSet_(c, lvOf(c));
const lvTxt = c => c.levels ? ' · ' + levelName(c, lvOf(c)) : '';
const neuronsOf = (c, size) => c.kind === 'choice' ? cLayout(size, c.K).N : N;

// ------------------------------------------------------------------ renderer + layout
let canvas = $('gl');
if (/[?&]thumb/.test(location.search)) document.body.classList.add('thumb');
let R = null;
const stage = new Stage($('stage'));
const lab = { tr: null, ras: null, rates: new Float32Array(9), cells: null };
// renderer: WebGL (three.js) first; Canvas 2D if WebGL is missing, throws, loses its context, or draws a blank frame
function use2D(why) {
  console.warn('NEURO ARENA: using the 2D renderer:', why);
  const c = document.createElement('canvas'); c.id = 'gl'; c.setAttribute('aria-label', canvas.getAttribute('aria-label') || '');
  canvas.replaceWith(c); canvas = c;
  try { R = new Render2D(c); ui.renderer = '2d'; if (rect.w > 1) layout(); if (lastFrame) R.setFrame(lastFrame); banner('3D view unavailable here (' + why + '), showing the 2D view.', 'info'); }
  catch (e) { R = null; ui.renderer = 'none'; banner('Could not draw the arena: ' + e.message); }
}
if (/[?&]r2d/.test(location.search)) queueMicrotask(() => use2D('requested'));
else { try { R = new Render3D(canvas); ui.renderer = 'webgl'; } catch (e) { const m = e.message || 'WebGL unavailable'; queueMicrotask(() => use2D(m)); } }
const labelsEl = $('labels'), labelEls = [];
function mkLabel(cls, txt) { const d = document.createElement('div'); d.className = 'lbl ' + cls; d.textContent = txt; labelsEl.appendChild(d); labelEls.push(d); return d; }
const regionEls = [0, 1].map(k => REGION_LABELS.map(([t]) => mkLabel(k ? 'b' : 'a', t)));
const nameEls = [mkLabel('big a', 'BRAIN A'), mkLabel('big b', 'BRAIN B')];
let rect = { x: 0, y: 0, w: 1, h: 1 };
function layout() {
  const W = innerWidth, H = innerHeight, b = document.body.classList;
  const compact = W < 980 || H < 600, phone = W < 640 || H < 480, side = compact && W > H * 1.25 && H < 560;
  b.toggle('compact', compact); b.toggle('phone', phone); b.toggle('side', side);
  b.toggle('dockctl', !compact && W >= 1300 && H >= 720);
  const cs = getComputedStyle(document.documentElement), sat = parseFloat(cs.getPropertyValue('--sat')) || 0, sab = parseFloat(cs.getPropertyValue('--sab')) || 0;
  const panel = $('panel');
  const carh = ui.carh = b.contains('thumb') ? 0 : phone ? 46 : compact ? 52 : 62;
  document.documentElement.style.setProperty('--carh', carh + 'px');
  document.documentElement.style.setProperty('--ccw', (phone ? 118 : compact ? 136 : 160) + 'px');
  let top = 50 + sat + 46 + carh, bottom = H - 10 - sab, right = W, left = 0;
  $('carousel').style.right = '';
  if (side) { panel.style.cssText = `top:${56 + sat}px;bottom:${8 + sab}px;height:auto;left:auto;width:${Math.round(W * 0.36)}px`; right = W - Math.round(W * 0.36) - 18; top = 50 + sat + 36 + carh; $('carousel').style.right = (W - right + 6) + 'px'; }
  else {
    const ph = compact ? Math.round(Math.max(150, Math.min(250, H * (W < H ? 0.3 : 0.28)))) : 236;
    panel.style.cssText = ''; document.documentElement.style.setProperty('--ph', ph + 'px'); bottom = H - ph - 18 - sab;
    if (b.contains('dockctl')) { right = W - 300; $('carousel').style.right = '306px'; }
  }
  if (b.contains('thumb')) { top = 70; bottom = H - 10; right = W; }
  rect = { x: left + 6, y: top, w: Math.max(50, right - left - 12), h: Math.max(50, bottom - top - (compact ? 40 : 66)) };
  if (R) R.resize(W, H, rect);
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('on', c.dataset.card === ui.tab));
  ui.stageR = null; renderCarousel(); drawChart();
}
addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 60); });
addEventListener('orientationchange', () => setTimeout(layout, 250));

function placeOverlays() {
  if (!R) return;
  for (let k = 0; k < 2; k++) {
    const short = R.ppu < 75, AB = ['Sens.', 'Thal.', 'Assoc.', 'Motor ▲', 'Motor ▼'], ch = isChoice();
    REGION_LABELS.forEach(([t, x, y], j) => { const p = R.anchor(k, x, y); const el = regionEls[k][j]; let txt = short ? AB[j] : t; if (ch && j === 3) txt = short ? 'Choices' : `${C.K} choice pops`; if (ch && j === 4) txt = ''; if (el.textContent !== txt) el.textContent = txt; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.opacity = ui.mode === 'play' && k === 1 ? 0.25 : 1; });
    const p = R.anchor(k, 0, 1.06); nameEls[k].style.left = p.x + 'px'; nameEls[k].style.top = p.y + 'px';
    const m = $(k ? 'metB' : 'metA'), q = R.anchor(k, 0, -1.0), w = m.offsetWidth, h = m.offsetHeight;
    let x = q.x - w / 2, y = q.y + 4;
    const maxY = rect.y + rect.h + (document.body.classList.contains('compact') ? 40 : 60) - h;
    x = Math.max(6, Math.min(innerWidth - w - 6, x)); y = Math.min(y, maxY);
    m.style.left = x + 'px'; m.style.top = y + 'px';
    // when the card has to sit up inside the brain (short screens), keep the region labels clear of it
    if (!m.classList.contains('hidden')) regionEls[k].forEach(el => {
      const ly = parseFloat(el.style.top), lx = parseFloat(el.style.left), hw = el.offsetWidth / 2 + 4;
      if (ly > y - 9 && ly < y + h + 9 && lx + hw > x && lx - hw < x + w) el.style.top = (y - 10) + 'px';
    });
  }
  const c = R.courtAnchor(COURT.W / 2, 1.0), sc = $('score');
  sc.style.top = Math.max(52 + ui.carh, c.y - sc.offsetHeight - 6) + 'px'; sc.style.left = c.x + 'px';
  if (isChoice()) {
    // the stage takes the court's place (a little larger), clamped to the arena rectangle
    const a = R.courtAnchor(0, 1), b = R.courtAnchor(COURT.W, 0), cw = b.x - a.x, chh = b.y - a.y;
    let w = Math.max(cw * 1.08, Math.min(rect.w, 280)), h = Math.max(chh * 1.12, Math.min(rect.h * 0.62, 250));
    w = Math.min(w, rect.w); const cx = (a.x + b.x) / 2; let y = a.y - (h - chh) / 2;
    y = Math.max(rect.y - 8, Math.min(y, rect.y + rect.h + 30 - h));
    const r = { x: Math.round(Math.max(rect.x, Math.min(cx - w / 2, rect.x + rect.w - w))), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
    if (!ui.stageR || r.x !== ui.stageR.x || r.y !== ui.stageR.y || r.w !== ui.stageR.w || r.h !== ui.stageR.h) { ui.stageR = r; stage.place(r); placeAnswers(); }
    sc.style.top = Math.max(52 + ui.carh, r.y - sc.offsetHeight - 4) + 'px';
    // labels that would sit on top of the stage are hidden (small screens)
    for (const el of [...regionEls[0], ...regionEls[1], ...nameEls]) { const lx = parseFloat(el.style.left), ly = parseFloat(el.style.top); el.style.visibility = lx > r.x - 4 && lx < r.x + r.w + 4 && ly > r.y - 6 && ly < r.y + r.h + 6 ? 'hidden' : ''; }
  } else for (const el of [...regionEls[0], ...regionEls[1], ...nameEls]) el.style.visibility = '';
  const rp = $('reaper'); if (!rp.classList.contains('hidden')) rp.style.top = Math.round((ui.stageR && isChoice() ? ui.stageR.y + 30 : rect.y + rect.h * 0.25)) + 'px';
}

// ------------------------------------------------------------------ workers
const WURL = new URL('./worker.js', import.meta.url);
// main-thread stand-in with the Worker interface, for browsers where module workers fail
class LocalWorker {
  constructor() { this.local = true; this.onmessage = null; this.dead = false; this.h = makeHandler(m => setTimeout(() => { if (!this.dead && this.onmessage) this.onmessage({ data: m }); }, 0)); }
  postMessage(m) { setTimeout(() => { if (!this.dead) this.h({ data: m }); }, 0); }
  terminate() { this.dead = true; }
}
let noWorkers = /[?&]noworker/.test(location.search);
function workersFailed(why) {
  if (noWorkers) return; noWorkers = true; ui.workerMode = 'main thread';
  console.warn('NEURO ARENA: workers unavailable, running on the main thread:', why);
  banner('Background workers unavailable (' + why + '); simulating on the main thread, so it may be slower.', 'info');
  if (liveW) { liveW.terminate(); liveW = null; }
  pool.forEach(w => w.terminate()); pool = [];
  ui.started = false; setMode(ui.mode);
}
const mkWorker = () => {
  if (noWorkers) return new LocalWorker();
  try {
    const w = new Worker(WURL, { type: 'module' });
    w.onerror = e => { const m = e.message || 'worker failed to load'; errs.push('worker: ' + m); console.error('worker error', m); workersFailed(m); };
    return w;
  } catch (e) { noWorkers = true; ui.workerMode = 'main thread'; return new LocalWorker(); }
};
let liveW = null, pool = [];
function getLive() { if (!liveW) { liveW = mkWorker(); liveW.onmessage = onLive; } ui.liveT0 = performance.now(); ui.lastLiveMsg = 0; return liveW; }
function ensurePool(K) {
  while (pool.length < K) { const w = mkWorker(); w.busy = null; w.onmessage = e => { const b = w.busy; if (!b || e.data.rid !== b.rid) return; w.busy = null; b.r(e.data.res); }; pool.push(w); }
  while (pool.length > K) pool.pop().terminate();
}
let ridC = 0;
const runOn = (w, job) => new Promise(r => { const rid = ++ridC; w.busy = { rid, r }; w.postMessage(job.t === 'bench' ? { ...job, rid } : { t: 'duel', job, rid }); });
const cloneW = w => w ? (w.W ? { ...w, W: new Float32Array(w.W) } : new Float32Array(w)) : null;
const copyJob = j => ({ ...j, wA: cloneW(j.wA), wB: cloneW(j.wB) });

// ------------------------------------------------------------------ modes
function setMode(m) {
  if (m === ui.mode && ui.started) return;
  ui.started = true; ui.mode = m; ui.epoch++;
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.body.dataset.mode = m;
  $('turboBox').classList.toggle('hidden', m !== 'turbo');
  $('serveHint').classList.add('hidden'); $('answers').classList.toggle('hidden', !(m === 'play' && isChoice()));
  document.body.classList.toggle('choice', isChoice());
  $('stage').classList.toggle('hidden', !isChoice() || m === 'turbo');
  if (liveW) liveW.postMessage({ t: 'stop' });
  ui.live = null;
  if (m === 'watch') startWatch();
  else if (m === 'turbo') startTurbo();
  else startPlay();
  updateNames(); updateStatus();
}
function startWatch() {
  const child = evo.spawn(), job = evo.job(child), ep = ui.epoch;
  ui.live = { kind: 'watch', child, job, ep, pending: false, champSide: job.side, contest: C.id };
  ui.genome = { child }; stage.setContest(C); stage.names = [roleName(0), roleName(1)];
  lastTickT = performance.now(); getLive().postMessage({ t: 'live', job: copyJob(job), mode: 'watch' });
  ui.live.pending = true;
  renderGenome();
}
function startPlay() {
  const c = evo.champ, ep = ui.epoch;
  const job = { gA: c.genome, wA: c.weights, gB: c.genome, wB: null, seed: (Math.random() * 1e9) >>> 0, matchSec: 1e6, lamarck: false, side: 0, contest: C.id, size: evo.opts.size };
  ui.live = { kind: 'play', job, ep, pending: true, champSide: 0, contest: C.id };
  lastTickT = performance.now(); getLive().postMessage({ t: 'live', job: copyJob(job), mode: 'play' });
  if (isChoice()) { stage.setContest(C); stage.names = [roleName(0), 'YOU']; buildAnswers(); }
  else $('serveHint').classList.remove('hidden');
}
async function startTurbo() {
  const ep = ui.epoch; ensurePool(ui.K);
  ui.turboGen0 = evo.gen; ui.turboT0 = performance.now(); ui.gps = 0;
  $('tWorkers').textContent = pool.length;
  while (ui.mode === 'turbo' && ui.epoch === ep) {
    ensurePool(ui.K); const ws = pool.slice();
    const kids = ws.map(() => evo.spawn()), jobs = kids.map(k => evo.job(k)), ev0 = evo;
    const res = await Promise.all(ws.map((w, i) => runOn(w, copyJob(jobs[i]))));
    if (evo !== ev0) return;                       // evolution was reset meanwhile
    const out = evo.record(kids, jobs, res);
    const dt = (performance.now() - ui.turboT0) / 1000; ui.gps = (evo.gen - ui.turboGen0) / Math.max(0.001, dt);
    onGenerations(out, kids[0]);
    $('tWorkers').textContent = ws.length;
    if (ui.mode !== 'turbo' || ui.epoch !== ep) { save(true); return; }
  }
}
function onGenerations(out, child) {
  trackWeights(out); save(); drawChart(); renderLog(); renderGenome(); updateStatus(); updateNames();
  const nc = out.find(e => e.newChamp), lu = out.find(e => e.levelUp);
  if (lu && C.levels) toast(`Curriculum: the champion passed 80% → ${levelName(C, lu.levelUp)}`);
  if (nc && ui.mode !== 'turbo') toast(nc.beneficial ? `New champion #${nc.childId}: ${nc.errors.length} copy error${nc.errors.length === 1 ? '' : 's'} paid off` : `New champion #${nc.childId}`);
  if (ui.mode === 'turbo') {
    $('tGen').textContent = evo.gen; $('tRate').textContent = ui.gps.toFixed(2);
    const v = out[out.length - 1] && out[out.length - 1].reaper;
    $('tChamp').innerHTML = `${C.icon} ${C.name} · champion #${evo.champ.id}${lvTxt(C)} · benchmark ${pct(champAcc(evo))} right · chance ${pct(chanceOf(C))}` +
      (v ? `<br>THE REAPER, last verdict: #${v.childId} ${v.score[1]} vs #${v.champId} ${v.score[0]} pts → ${v.reaped ? '<b style="color:#5cff9d">reaped</b>' : 'champion stays'}` : '');
    if (!isChoice()) { ui.polMaps = [evo.champ.weights ? polFromWeights(evo.champ.weights) : null, null]; drawMaps(); }
  } else if (out.length) showVerdict(out[0]);
}

// ------------------------------------------------------------------ live frames (watch / play)
let lastFrame = null, lastTickT = performance.now();
function onLive(e) {
  const f = e.data, lv = ui.live;
  if (!lv || f.t !== 'frame') return;
  if ((f.kind === 'choice') !== isChoice() || (lv.contest && lv.contest !== C.id) || (f.contest && f.contest !== C.id)) return; // a frame from a match of the previous contest
  ui.lastLiveMsg = performance.now(); lv.pending = false; lastFrame = f; ui.frame = { time: f.time, pad: f.pad, bx: f.bx, by: f.by, stats: f.stats, hold: f.hold, kind: f.kind, phase: f.phase };
  labCollect(f);
  if (f.kind === 'choice') {
    if (R) { R.setFrame(f); f.br.forEach((b, k) => { if (b) { R.spikes(k, f.spk, k * N, f); R.setDopamine(k, b.rpe * 1.2); } }); }
    stage.setFrame(f);
    f.br.forEach((b, k) => { if (b && b.pol) ui.polMaps[k] = { pol: b.pol, G: b.G, K: C.K }; }); if (f.br.some(b => b && b.pol)) drawMaps();
    if (performance.now() - (ui.lastMeters || 0) > 50) { ui.lastMeters = performance.now(); updateMeters(f); }
    if (f.result && lv.kind === 'watch') { benchWatch(lv, f.result); return; }
    tickLive(); return;
  }
  if (R) {
    R.setFrame(f);
    f.br.forEach((b, k) => { if (b) { R.spikes(k, f.spk, k * N, f); R.setDopamine(k, b.rpe * 1.2); } });
    for (const ev of f.ev) {
      if (ev.t === 'hit') R.ringAt(COURT.padX[ev.p] + (ev.p ? -0.02 : 0.02), f.pad[ev.p], ev.p ? [3, 0.6, 2.4] : [0.6, 2.6, 3]);
      else R.goal(ev.p);
    }
  }
  f.br.forEach((b, k) => { if (b && b.pol) ui.polMaps[k] = b.pol; }); if (f.br.some(b => b && b.pol)) drawMaps();
  if (performance.now() - (ui.lastMeters || 0) > 50) { ui.lastMeters = performance.now(); updateMeters(f); }
  if (f.result && lv.kind === 'watch') { benchWatch(lv, f.result); return; }
  if (lv.kind === 'play') {
    const s = f.stats.score;
    $('serveHint').classList.toggle('hidden', !f.hold);
    if (Math.max(s[0], s[1]) >= 11 && !lv.over) { lv.over = true; toast(s[1] > s[0] ? `You beat the champion ${s[1]}–${s[0]}!` : `The champion wins ${s[0]}–${s[1]}`); lv.reset = true; }
  }
  tickLive();
}
// after a watched duel: score both brains on the benchmark serves (in two background workers), then select
async function benchWatch(lv, r) {
  const job = lv.job, ev0 = evo, lam = !!job.lamarck; lv.benching = true;
  $('clock').textContent = `THE REAPER is judging: ${isChoice() ? benchSet(C).length + ' frozen items' : BENCH_N + ' benchmark serves'}…`;
  ensurePool(Math.max(2, pool.length));
  const bm = w => ({ t: 'bench', g: w === r.wA ? job.gA : job.gB, w, contest: job.contest, size: job.size, level: job.level || 0 });
  const [bA, bB] = await Promise.all([runOn(pool[0], bm(r.wA)), runOn(pool[1], bm(r.wB))]);
  if (evo !== ev0 || lv.ep !== ui.epoch || ui.mode !== 'watch') return;
  const out = evo.record([lv.child], [job], [{ stats: r.stats, wA: lam ? r.wA : null, wB: lam ? r.wB : null, bench: [bA, bB] }]);
  onGenerations(out, lv.child);
  setTimeout(() => { if (ui.mode === 'watch' && lv.ep === ui.epoch) startWatch(); }, 2600);
}
const pct = v => Math.round(v * 100) + '%';
// the simulation is paced by wall-clock time, independent of the render frame rate
function tickLive() {
  const lv = ui.live; if (!lv || lv.pending || !liveW) return;
  if (document.hidden) { setTimeout(tickLive, 250); return; }
  const now = performance.now(), el = now - lastTickT;
  if (el < 12) { if (!lv.tq) lv.tq = setTimeout(() => { lv.tq = 0; tickLive(); }, 12 - el); return; }
  lastTickT = now;
  const sp = lv.kind === 'play' ? 1 : ui.speed;
  const msg = { t: 'tick', ms: Math.max(1, Math.round(Math.min(250, el) * sp)), budget: 30 };
  if (lv.kind === 'play' && isChoice()) { if (input.answer != null) { msg.answer = input.answer; input.answer = null; } }
  else if (lv.kind === 'play') {
    msg.humanCmd = input.cmd(); msg.humanY = input.y != null && !msg.humanCmd ? input.y : null;
    if (input.serve) { msg.serve = true; input.serve = false; }
    if (lv.reset) { msg.reset = true; lv.reset = false; lv.over = false; }
  }
  lv.pending = true; liveW.postMessage(msg);
}
// ------------------------------------------------------------------ input (play mode)
const input = {
  keys: new Set(), y: null, serve: false, gp: 0, answer: null, typed: '',
  cmd() { let c = 0; if (this.keys.has('up')) c += 1; if (this.keys.has('down')) c -= 1; if (!c && Math.abs(this.gp) > 0.18) c = this.gp; return Math.max(-1, Math.min(1, c)); },
};
const KMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
// choice contests in Play: type the answer (or press its button). "1" waits briefly in case "12" follows.
function typeAnswer(ch) {
  const L = C.labels, t = (input.typed + ch).toUpperCase();
  const exact = L.indexOf(t), longer = L.some(l => l.length > t.length && l.startsWith(t));
  clearTimeout(input.typeT);
  if (exact >= 0 && !longer) { input.typed = ''; pressAnswer(exact); return true; }
  if (exact >= 0 || longer) { input.typed = t; input.typeT = setTimeout(() => { const k = L.indexOf(input.typed); input.typed = ''; if (k >= 0) pressAnswer(k); }, 450); return true; }
  input.typed = ''; return false;
}
function pressAnswer(k) { input.answer = k; const b = $('answers').children[k]; if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 180); } }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (!$('lab').classList.contains('hidden')) { if (e.code === 'Escape' || e.code === 'KeyL') toggleLab(false); return; }
  if (ui.mode === 'play' && isChoice() && !e.metaKey && !e.ctrlKey) {
    if (C.race && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { pressAnswer(e.code === 'ArrowLeft' ? 0 : 1); e.preventDefault(); return; }
    if (e.key && e.key.length === 1 && e.key !== ' ' && typeAnswer(e.key)) { e.preventDefault(); return; }
  }
  if (e.code === 'BracketLeft' || (e.code === 'ArrowLeft' && !e.repeat)) { stepContest(-1); e.preventDefault(); return; }
  if (e.code === 'BracketRight' || (e.code === 'ArrowRight' && !e.repeat)) { stepContest(1); e.preventDefault(); return; }
  if (e.code === 'KeyL') { toggleLab(true); return; }
  if (KMAP[e.code]) { input.keys.add(KMAP[e.code]); input.y = null; e.preventDefault(); }
  else if (e.code === 'Space') { input.serve = true; e.preventDefault(); }
  else if (e.code === 'Digit1') setMode('watch'); else if (e.code === 'Digit2') setMode('turbo'); else if (e.code === 'Digit3') setMode('play');
  else if (e.code === 'KeyI') toggleInfo(); else if (e.code === 'Escape') { toggleInfo(false); document.body.classList.remove('ctl'); }
});
addEventListener('keyup', e => { if (KMAP[e.code]) input.keys.delete(KMAP[e.code]); });
const onCanvas = (type, fn) => document.addEventListener(type, e => { if (e.target === canvas) fn(e); });
function pointerCourt(e) {
  if (!R || ui.mode !== 'play' || isChoice()) return null;
  const c = R.toCourt(e.clientX, e.clientY);
  if (c.x < -0.2 || c.x > COURT.W + 0.2 || c.y < -0.25 || c.y > 1.25) return null;
  return c;
}
onCanvas('pointerdown', e => { const c = pointerCourt(e); if (c) { input.y = Math.max(0, Math.min(1, c.y)); input.serve = true; input.drag = e.pointerId; } });
onCanvas('pointermove', e => { if (ui.mode !== 'play') return; if (e.pointerType === 'mouse' || input.drag === e.pointerId) { const c = pointerCourt(e); if (c) input.y = Math.max(0, Math.min(1, c.y)); } });
addEventListener('pointerup', e => { if (input.drag === e.pointerId) input.drag = null; });
function pollGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : []; let v = 0;
  for (const g of gps) { if (!g) continue; v = -(g.axes[1] || 0); if (g.buttons[12]?.pressed) v = 1; if (g.buttons[13]?.pressed) v = -1; if (g.buttons[0]?.pressed && !input.gpA) input.serve = true; input.gpA = g.buttons[0]?.pressed; break; }
  input.gp = v;
}

// ------------------------------------------------------------------ panels
function roleName(k) {
  const lv = ui.live;
  if (ui.mode === 'play') return k === 0 ? `CHAMPION #${evo.champ.id}` : 'YOU';
  if (ui.mode === 'turbo') return k === 0 ? `CHAMPION #${evo.champ.id}` : 'SPAWNS';
  if (!lv) return '';
  return (k === lv.champSide) ? `CHAMPION #${evo.champ.id}` : `SPAWN #${lv.child.id}${lv.child.hof ? ' (Hall of Fame)' : ''}`;
}
function updateNames() {
  for (let k = 0; k < 2; k++) {
    const n = roleName(k); nameEls[k].textContent = n; $(k ? 'nmB' : 'nmA').textContent = n.split(' ')[0];
    $(k ? 'mtB' : 'mtA').textContent = n; stage.names[k] = n;
  }
  $('metB').classList.toggle('hidden', ui.mode === 'play');
  $('genLbl').textContent = 'GENERATION ' + evo.gen;
  $('benchLbl').textContent = evo.champ.bench ? `${C.name} · champion benchmark ${pct(champAcc(evo))}${isChoice() ? ' right' : ''}` : `${C.name} · champion not yet benchmarked`;
}
function updateMeters(f) {
  $('scA').textContent = f.stats.score[0]; $('scB').textContent = f.stats.score[1];
  if (f.kind === 'choice') {
    if (!(ui.live && ui.live.benching)) $('clock').textContent = ui.mode === 'play' ? `trial ${f.stats.trials + 1} · Reaper points` : `${(f.time / 1000).toFixed(1)} / ${evo.opts.matchSec} s · trial ${f.stats.trials + 1} · Reaper points`;
    const gs = ui.lay ? ui.lay.gs : 32;
    f.br.forEach((b, k) => {
      if (!b) return; const s = k ? 'B' : 'A', gr = b.gr; let i1 = 0, i2 = -1; gr.forEach((v, i) => { if (v > gr[i1]) i1 = i; }); gr.forEach((v, i) => { if (i !== i1 && (i2 < 0 || v > gr[i2])) i2 = i; });
      const hz = v => v / 0.025 / gs;
      $('lu' + s).textContent = `Leader “${C.labels[i1]}”`; $('ld' + s).textContent = i2 >= 0 ? `Next “${C.labels[i2]}”` : 'Next';
      $('up' + s).style.width = Math.min(100, hz(gr[i1]) / 60 * 100) + '%'; $('dn' + s).style.width = Math.min(100, hz(i2 >= 0 ? gr[i2] : 0) / 60 * 100) + '%';
      const d = $('da' + s), v = Math.max(-1, Math.min(1, b.rpe * 0.8));
      d.style.width = Math.abs(v) * 50 + '%'; d.style.left = v < 0 ? (50 + v * 50) + '%' : '50%'; d.classList.toggle('neg', v < 0);
      const st = f.stats, n = Math.max(1, st.trials);
      $('hr' + s).textContent = `✓${st.ok[k]} ✗${st.bad[k]} –${st.abst[k]} · ${Math.round(100 * st.right[k] / n)}% right (chance ${pct(chanceOf(C))})`;
    });
    return;
  }
  ['A', 'B'].forEach(s => { $('lu' + s).textContent = 'Motor UP'; $('ld' + s).textContent = 'Motor DOWN'; });
  if (!(ui.live && ui.live.benching)) $('clock').textContent = ui.mode === 'play' ? 'first to 11' : `${(f.time / 1000).toFixed(1)} / ${evo.opts.matchSec} s`;
  f.br.forEach((b, k) => {
    if (!b) return; const s = k ? 'B' : 'A';
    $('up' + s).style.width = Math.min(100, b.rU / 50 * 100) + '%'; $('dn' + s).style.width = Math.min(100, b.rD / 50 * 100) + '%';
    const d = $('da' + s), v = Math.max(-1, Math.min(1, b.rpe * 0.8));
    d.style.width = Math.abs(v) * 50 + '%'; d.style.left = v < 0 ? (50 + v * 50) + '%' : '50%'; d.classList.toggle('neg', v < 0);
    const h = f.stats.hits[k], m = f.stats.miss[k];
    $('hr' + s).textContent = `returned ${h}/${h + m}${h + m ? ` · ${Math.round(100 * h / (h + m))}%` : ''} · ${b.out > 0.15 ? '▲ UP' : b.out < -0.15 ? '▼ DOWN' : '• hold'}`;
  });
}
function recentRally(n = 20) { const h = evo.history.slice(-n); return h.length ? h.reduce((a, e) => a + e.rally, 0) / h.length : 0; }
function updateStatus() {
  const c = evo.champ, h = evo.history, nb = h.filter(e => e.beneficial).length, nc = h.filter(e => e.newChamp).length, b = c.bench;
  const nn = neuronsOf(C, evo.opts.size).toLocaleString();
  const bl = isChoice()
    ? `Benchmark ${pct(champAcc(evo))} right${b ? ` · Reaper ${b.score} of ${b.max} pts (✓${b.correct} ✗${b.wrong} –${b.abstain})` : ''} on ${benchSet(C).length} frozen items · best ever ${pct(evo.bestAcc || 0)} · chance ${pct(chanceOf(C))}${lvTxt(C)}`
    : `Benchmark ${pct(c.fit)} of ${BENCH_N} standard serves · best ever ${pct(evo.best ? evo.best.fit : 0)} · random ${pct(RANDOM_HIT)}<br>Mean rally (20 duels) ${recentRally().toFixed(1)} hits`;
  $('stat').innerHTML = `<b>${C.icon} ${C.name} · generation ${evo.gen}</b><br>${nn} neurons per brain<br>Champion #${c.id} · born gen ${c.born} · defended ${Math.max(0, c.n - 1)}×<br>` +
    `${bl}<br>Throne changes ${nc} · from copy errors ${nb}<br>` +
    `Hall of Fame ${evo.hof.map(x => '#' + x.id + ' ' + Math.round((x.bench ? (x.bench.acc ?? x.fit) : x.fit) * 100) + '%').join(', ') || '–'}<br>Inheritance <b>${evo.opts.lamarck ? 'Lamarckian' : 'Darwinian'}</b> · copy errors <b>${(evo.opts.rate * 100).toFixed(1)}%</b>`;
}
function renderLog() {
  const items = evo.log.slice(0, 40).map(e => {
    const er = e.errors || [], v = e.reaper, duel = `duel ${e.score[1]}–${e.score[0]}`;
    const bm = v ? `Reaper ${v.score[1]} vs ${v.score[0]} pts (${pct(e.childAcc ?? e.childBench)} vs ${pct(e.champAcc ?? e.champBench)})` : `bench ${pct(e.childBench)} vs ${pct(e.champBench)}`;
    const res = e.newChamp ? `${duel} · ${bm} → reaped, champion` : `${duel} · ${bm}${v && v.margin > 0 ? ' (not significant)' : ''}`;
    const genes = er.map(x => `<span class="gn ${x.kind}" title="${x.kind} copy error">${GENE[x.key]?.label || x.key}: ${fmtGene(x.key, x.from)}→${fmtGene(x.key, x.to)}</span>`).join('');
    const w = e.wErrors ? ` · ${e.wErrors.toLocaleString()} synapse copy errors` : '';
    const head = e.hof ? 'Hall of Fame rematch' : `<span class="ce">${er.length} copy error${er.length === 1 ? '' : 's'}</span>${w}`;
    return `<li class="${e.newChamp ? 'win' : ''}"><span class="g">G${e.gen}</span>#${e.childId} ← #${e.champId} · ${head}<span class="res">${res}</span><div>${genes}</div></li>`;
  });
  $('log').innerHTML = items.join('') || '<li>No spawns yet.</li>';
  const h = evo.history, tot = h.reduce((a, e) => a + (e.errors?.length || 0), 0);
  $('logSum').textContent = h.length ? `· ${(tot / h.length).toFixed(2)} gene errors per spawn on average` : '';
}
function renderGenome() {
  const A = evo.champ.genome, ch = ui.live && ui.live.child, B = ch ? ch.genome : null, changed = new Set((ch?.errors || []).map(e => e.key));
  let html = '', grp = '';
  const bandStrip = g => GENES.filter(s => s.group === 'Guidance').map(s => { const v = g[s.key]; const c = v >= 0 ? `rgba(92,255,157,${Math.min(1, Math.abs(v)) * 0.9 + 0.08})` : `rgba(255,143,69,${Math.min(1, Math.abs(v)) * 0.9 + 0.08})`; return `<i style="background:${c}" title="${s.label}: ${v.toFixed(2)}"></i>`; }).join('');
  for (const s of GENES) {
    if (s.group !== grp) { grp = s.group; html += `<div class="grp">${grp}</div>`; if (grp === 'Guidance') { html += `<div class="bands">${bandStrip(A)}</div>` + (B ? `<div class="bands">${bandStrip(B)}</div>` : ''); } }
    if (s.group === 'Guidance' && !changed.has(s.key)) continue;
    html += `<div class="gr${changed.has(s.key) ? ' diff' : ''}"><span>${s.label}</span><span>${fmtGene(s.key, A[s.key])}</span><span>${B ? fmtGene(s.key, B[s.key]) : ''}</span></div>`;
  }
  $('genome').innerHTML = html;
}
function polFromWeights(w) {
  const NA = L.A_E.n, NM = L.M_UP.n + L.M_DN.n, nUp = L.M_UP.n, out = new Float32Array(784);
  for (let a = 0; a < 784; a++) { let u = 0, d = 0, nu = 0, nd = 0; const o = a * NM; for (let m = 0; m < NM; m++) { const v = w[o + m]; if (v < 0) continue; if (m < nUp) { u += v; nu++; } else { d += v; nd++; } } out[a] = (nu ? u / nu : 0) - (nd ? d / nd : 0); }
  return out;
}
// choice brains: each pixel is one association cell of the G x G gain-field grid (rows = first symbol, columns =
// second). Green = its strongest learned synapses go to the CORRECT answer's population, red = to a wrong one;
// brightness = how strongly it prefers that answer over the average. Dark = no such item.
function drawChoiceMap(c, m) {
  const G = m.G, K = m.K, x = c.getContext('2d'), img = x.createImageData(G, G), n0 = C.n[0], n1 = C.n[1];
  const ans = new Int16Array(n0 * n1).fill(-1); for (const it of C.items) ans[it[0] * n1 + it[1]] = it[2];
  let gmax = 1e-9; const best = new Int16Array(G * G), gap = new Float32Array(G * G);
  for (let a = 0; a < G * G; a++) { let bi = 0, mean = 0; for (let q = 0; q < K; q++) { const v = m.pol[a * K + q]; mean += v; if (v > m.pol[a * K + bi]) bi = q; } mean /= K; best[a] = bi; gap[a] = m.pol[a * K + bi] - mean; if (gap[a] > gmax) gmax = gap[a]; }
  for (let r = 0; r < G; r++) for (let q = 0; q < G; q++) {
    const a = r * G + q, s0 = Math.min(n0 - 1, Math.floor((r + 0.5) / G * n0)), s1 = Math.min(n1 - 1, Math.floor((q + 0.5) / G * n1)), w = ans[s0 * n1 + s1], v = Math.min(1, gap[a] / gmax), p = ((G - 1 - r) * G + q) * 4;
    if (w < 0) { img.data[p] = img.data[p + 1] = img.data[p + 2] = 14; }
    else if (best[a] === w) { img.data[p] = 30 * v; img.data[p + 1] = 60 + 195 * v; img.data[p + 2] = 40 + 100 * v; }
    else { img.data[p] = 60 + 195 * v; img.data[p + 1] = 40 * v; img.data[p + 2] = 50 * v; }
    img.data[p + 3] = 255;
  }
  if (c.width !== G) { c.width = G; c.height = G; }
  x.putImageData(img, 0, 0);
}
function drawMaps() {
  $('mapNote').textContent = isChoice() ? `Each pixel is one association cell: rows = first symbol, columns = second (a ${C.n[0]}×${C.n[1]} grid of tiles). Green = it votes for the correct answer, red = for a wrong one; brighter = stronger preference.` : 'Each pixel is one association cell (ball relative to paddle ↑ vs paddle height →). Green drives UP, orange drives DOWN. A good player learns a horizontal split: green above the middle, orange below.';
  [0, 1].forEach(k => {
    const c = $(k ? 'polB' : 'polA'), x = c.getContext('2d'), m = ui.polMaps[k];
    if (m && m.G) { drawChoiceMap(c, m); return; }
    const img = x.createImageData(28, 28);
    if (m) { let mx = 1e-6; for (const v of m) mx = Math.max(mx, Math.abs(v)); for (let a = 0; a < 28; a++) for (let b = 0; b < 28; b++) { const v = m[a * 28 + b] / mx, p = ((27 - a) * 28 + b) * 4; img.data[p] = v < 0 ? 255 * -v : 40 * v; img.data[p + 1] = v > 0 ? 255 * v : 140 * -v; img.data[p + 2] = v > 0 ? 160 * v : 60 * -v; img.data[p + 3] = 255; } }
    else for (let p = 0; p < img.data.length; p += 4) { img.data[p] = img.data[p + 1] = img.data[p + 2] = 18; img.data[p + 3] = 255; }
    if (c.width !== 28) { c.width = 28; c.height = 28; }
    x.putImageData(img, 0, 0);
  });
}

// ------------------------------------------------------------------ fitness chart (2D canvas at native DPR)
const chart = $('chart');
function drawChart() {
  const dpr = Math.min(3, devicePixelRatio || 1), w = chart.clientWidth, h = chart.clientHeight; if (!w || !h) { drawLife(); return; }
  if (chart.width !== Math.round(w * dpr) || chart.height !== Math.round(h * dpr)) { chart.width = Math.round(w * dpr); chart.height = Math.round(h * dpr); }
  const x = chart.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const H = evo.history, G = Math.max(10, evo.gen), ch = isChoice(), pl = 30, pr = ch ? 8 : 22, pt = 6, pb = 16, iw = w - pl - pr, ih = h - pt - pb;
  const RM = Math.max(10, Math.ceil(Math.max(0, ...H.map(e => e.rally)) / 5) * 5);
  const KC = ch ? 'champAccNow' : 'champFit', KB = ch ? 'bestAcc' : 'bestFit', kid = e => ch ? (e.childAcc ?? 0) : e.childBench;
  const X = g => pl + (g / G) * iw, Y = v => pt + (1 - v) * ih, YR = v => pt + (1 - Math.min(1, v / RM)) * ih;
  x.font = '10px -apple-system, system-ui, sans-serif'; x.fillStyle = '#7f93b8'; x.strokeStyle = 'rgba(120,160,255,.12)'; x.lineWidth = 1;
  for (let v = 0; v <= 1.001; v += 0.25) { x.beginPath(); x.moveTo(pl, Y(v)); x.lineTo(w - pr, Y(v)); x.stroke(); x.fillText(Math.round(v * 100) + '%', 2, Y(v) + 3); }
  if (!ch) { x.fillStyle = 'rgba(80,220,255,.75)'; x.fillText(String(RM), w - pr + 3, Y(1) + 3); x.fillText('0', w - pr + 3, Y(0) + 3); } x.fillStyle = '#7f93b8';
  const step = Math.pow(10, Math.floor(Math.log10(G / 4))), st = G / step > 8 ? step * 2 : step;
  for (let g = 0; g <= G; g += st) x.fillText(String(g), X(g) - 6, h - 3);
  x.setLineDash([3, 3]); x.strokeStyle = 'rgba(140,170,170,.7)'; x.beginPath(); x.moveTo(pl, Y(chanceOf(C))); x.lineTo(w - pr, Y(chanceOf(C))); x.stroke(); x.setLineDash([]);
  const dotR = H.length > 400 ? 1 : 1.6;
  x.fillStyle = 'rgba(185,139,255,.5)'; for (const e of H) { x.beginPath(); x.arc(X(e.gen), Y(kid(e)), dotR, 0, 7); x.fill(); }
  // mean rally length in the duels (right axis), rolling mean
  const win = Math.max(3, Math.round(H.length / 30)); let s = 0; const q = [];
  x.strokeStyle = 'rgba(80,220,255,.8)'; x.lineWidth = 1.4; x.beginPath();
  if (!ch) H.forEach((e, i) => { q.push(e.rally); s += e.rally; if (q.length > win) s -= q.shift(); const m = s / q.length; if (i === 0) x.moveTo(X(e.gen), YR(m)); else x.lineTo(X(e.gen), YR(m)); }); x.stroke();
  // best ever (thin) and the champion's benchmark score (bold step line)
  const stepLine = (key, style, lw, glow) => { x.strokeStyle = style; x.lineWidth = lw; x.shadowColor = style; x.shadowBlur = glow; x.beginPath(); let prev = null;
    H.forEach((e, i) => { const v = e[key] ?? (key === 'champAccNow' ? e.champFit : key === 'bestAcc' ? e.bestFit : 0); if (i === 0) x.moveTo(X(e.gen - 1), Y(v)); else x.lineTo(X(e.gen), Y(prev)); x.lineTo(X(e.gen), Y(v)); prev = v; }); x.stroke(); x.shadowBlur = 0; };
  if (H.length) { x.setLineDash([4, 3]); stepLine(KB, 'rgba(255,255,255,.55)', 1, 0); x.setLineDash([]); stepLine(KC, '#ffd25a', 2.2, 6); }
  ui.marks = [];
  for (const e of H) if (e.newChamp && e.beneficial) { const px = X(e.gen), py = Y(e[KC] ?? e.champFit); ui.marks.push({ px, py, e }); x.fillStyle = '#5cff9d'; x.beginPath(); x.moveTo(px, py - 4.5); x.lineTo(px + 3.5, py); x.lineTo(px, py + 4.5); x.lineTo(px - 3.5, py); x.closePath(); x.fill(); }
  else if (e.newChamp && e.hof) { x.fillStyle = '#ffd25a'; x.fillText('♛', X(e.gen) - 4, Y(e[KC] ?? e.champFit) + 4); }
  drawLife();
}
// lifetime learning: hit rate in each 5 s of a duel, pooled over the last 20 duels (champion vs challengers)
function drawLife() {
  const c = $('life'); if (!c) return;
  const dpr = Math.min(3, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const H = evo.history.slice(-20).filter(e => e.seg && e.seg.length), pl = 4, pr = 4, pt = 14, pb = 14, iw = w - pl - pr, ih = h - pt - pb;
  x.font = '10px -apple-system, system-ui, sans-serif'; x.fillStyle = '#7f93b8'; x.fillText(isChoice() ? 'lifetime learning: % right per 5 s (last 20 duels)' : 'lifetime learning (last 20 duels)', pl, 10);
  x.strokeStyle = 'rgba(120,160,255,.12)'; for (let v = 0; v <= 1.001; v += 0.5) { x.beginPath(); x.moveTo(pl, pt + (1 - v) * ih); x.lineTo(w - pr, pt + (1 - v) * ih); x.stroke(); }
  if (!H.length) { x.fillText('waiting for the first duel…', pl, pt + ih / 2); return; }
  const S = Math.max(...H.map(e => e.seg.length)), acc = [0, 1].map(() => Array.from({ length: S }, () => [0, 0]));
  for (const e of H) e.seg.forEach((sg, i) => { const cs = e.cs ?? 0; for (const [r, side] of [[0, cs], [1, 1 - cs]]) { if (sg.length === 2) { acc[r][i][0] += sg[side]; acc[r][i][1] += 1; } else { acc[r][i][0] += sg[side * 2]; acc[r][i][1] += sg[side * 2] + sg[side * 2 + 1]; } } });
  if (isChoice()) { const yc = pt + (1 - chanceOf(C)) * ih; x.setLineDash([3, 3]); x.strokeStyle = 'rgba(140,170,170,.7)'; x.beginPath(); x.moveTo(pl, yc); x.lineTo(w - pr, yc); x.stroke(); x.setLineDash([]); }
  const X = i => pl + (S > 1 ? i / (S - 1) : 0.5) * iw, Y = v => pt + (1 - v) * ih;
  [['#ffd25a', 0], ['rgba(185,139,255,.95)', 1]].forEach(([col, r]) => { x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1.8; x.beginPath(); let first = true;
    acc[r].forEach(([hh, n], i) => { if (!n) return; const v = hh / n; if (first) { x.moveTo(X(i), Y(v)); first = false; } else x.lineTo(X(i), Y(v)); }); x.stroke(); });
  x.fillStyle = '#7f93b8'; x.fillText('0 s', pl, h - 3); const lbl = S * 5 + ' s'; x.fillText(lbl, w - pr - x.measureText(lbl).width, h - 3);
}
function chartTip(e) {
  const r = chart.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, tip = $('tip');
  let best = null, bd = 12; for (const m of ui.marks || []) { const d = Math.hypot(m.px - mx, m.py - my); if (d < bd) { bd = d; best = m; } }
  if (!best) { tip.classList.add('hidden'); return; }
  const ev = best.e, er = ev.errors || [];
  tip.innerHTML = `<b>Gen ${ev.gen}: spawn #${ev.childId} dethroned #${ev.champId}</b><br>${er.map(x => `${GENE[x.key]?.label || x.key} ${fmtGene(x.key, x.from)}→${fmtGene(x.key, x.to)} (${x.kind})`).join('<br>') || 'synapse copy errors only'}${ev.wErrors ? `<br>+${ev.wErrors} synapse copy errors` : ''}<br>benchmark ${pct(ev.childAcc ?? ev.childBench)} (champion before: ${pct(ev.champAcc ?? ev.prevBench ?? ev.champBench)})${ev.reaper ? `<br>THE REAPER: ${ev.reaper.score[1]} vs ${ev.reaper.score[0]} pts, margin +${ev.reaper.margin}` : ''}`;
  tip.classList.remove('hidden'); tip.style.left = Math.min(r.width - 200, Math.max(0, mx + 8)) + 'px'; tip.style.top = Math.max(0, my - 10) + 'px';
}
chart.addEventListener('pointermove', chartTip); chart.addEventListener('pointerdown', chartTip); chart.addEventListener('pointerleave', () => $('tip').classList.add('hidden'));

// ------------------------------------------------------------------ controls
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hidden'), 2600); }
function toggleInfo(v) { $('info').classList.toggle('hidden', v === undefined ? !$('info').classList.contains('hidden') ? true : false : !v); }
document.querySelectorAll('.mode').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('bInfo').onclick = () => toggleInfo(true); $('infoX').onclick = () => toggleInfo(false);
$('info').addEventListener('click', e => { if (e.target.id === 'info') toggleInfo(false); });
$('bCtl').onclick = () => { if (document.body.classList.contains('dockctl')) document.body.classList.toggle('noctl'); document.body.classList.toggle('ctl'); };
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => { ui.tab = b.dataset.tab; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); layout(); }));
function syncControls() {
  const o = evo.opts;
  $('sRate').value = o.rate * 100; $('vRate').textContent = (o.rate * 100).toFixed(1) + '%';
  $('sLen').value = o.matchSec; $('vLen').textContent = o.matchSec + ' s';
  $('iDar').classList.toggle('on', !o.lamarck); $('iLam').classList.toggle('on', !!o.lamarck);
  $('inhNote').textContent = o.lamarck ? 'Lamarckian: children inherit the learned synapses too (with copy errors), so skill accumulates across generations.' : 'Darwinian: children inherit genes only and must relearn from scratch, as in nature. Expect slow progress.';
  const si = SPEEDS.indexOf(ui.speed); $('sSpd').value = si < 0 ? 2 : si; $('vSpd').textContent = ui.speed + '×';
  $('sK').max = Math.max(2, Math.min(8, HC)); $('sK').value = ui.K; $('vK').textContent = ui.K;
  const ch = isChoice(), sz = ch ? o.size : 2800, si2 = SIZES.indexOf(sz);
  $('sSize').max = SIZES.length - 1; $('sSize').value = si2 < 0 ? 1 : si2; $('sSize').disabled = !ch;
  $('vSize').textContent = neuronsOf(C, sz).toLocaleString();
  $('sizeNote').textContent = ch ? `Neurons per brain in ${C.name} (every area scales; ${(cLayout(sz, C.K).gs)} cells per answer population). Changing it keeps the champion's genes but its synapses must be relearned. Larger brains run slower than real time (measured on one core: 2,800 ≈ 2× real time, 5,600 ≈ 0.6×, 11,200 ≈ 0.2×, 22,400 ≈ 0.1×); Watch then plays in slow motion and Turbo takes longer.` : 'The Pong brain has a fixed 2,800-neuron layout. Pick a quiz contest in the carousel to change the brain size.';
}
$('sRate').oninput = e => { evo.opts.rate = +e.target.value / 100; syncControls(); updateStatus(); save(true); };
$('sLen').oninput = e => { evo.opts.matchSec = +e.target.value; syncControls(); save(true); };
$('iDar').onclick = () => { evo.opts.lamarck = false; syncControls(); updateStatus(); save(true); };
$('iLam').onclick = () => { evo.opts.lamarck = true; syncControls(); updateStatus(); save(true); };
$('sSpd').oninput = e => { ui.speed = SPEEDS[+e.target.value]; syncControls(); };
$('sK').oninput = e => { ui.K = +e.target.value; syncControls(); };
$('sSize').oninput = e => { $('vSize').textContent = neuronsOf(C, SIZES[+e.target.value]).toLocaleString(); };
$('sSize').onchange = e => {
  if (!isChoice()) return; const v = SIZES[+e.target.value]; if (v === evo.opts.size) return;
  evo.opts.size = v; meta.size = v; const c = evo.champ; c.weights = null; c.bench = null; c.fit = 0; c.scores = []; evo.hof = [];
  ui.lay = cLayout(v, C.K); save(true); syncControls(); updateStatus(); ui.started = false; ui.polMaps = [null, null]; drawMaps(); setMode(ui.mode === 'turbo' ? 'turbo' : ui.mode);
  toast(`${C.name}: ${neuronsOf(C, v).toLocaleString()} neurons per brain · the champion relearns its synapses`);
};
$('bReset').onclick = () => {
  if (!confirm(`Reset the ${C.name} evolution to generation 0? Its champion and history will be erased (other contests are kept).`)) return;
  const o = { ...evo.opts }; evo = evos[C.id] = new Evolution(o); localStorage.removeItem(KEY + '.' + C.id); if (C.id === 'pong') localStorage.removeItem(KEY_V2); ui.started = false; ui.polMaps = [null, null];
  drawChart(); renderLog(); renderGenome(); updateStatus(); drawMaps(); setMode(ui.mode === 'turbo' ? 'watch' : ui.mode); toast('Evolution reset to generation 0');
};
$('bExport').onclick = () => {
  const c = evo.champ;
  const data = { app: 'neuro-arena', v: 2, contest: C.id, size: evo.opts.size, neurons: neuronsOf(C, evo.opts.size), exported: new Date().toISOString(), generation: evo.gen, opts: evo.opts,
    champion: { id: c.id, fit: c.fit, n: c.n, born: c.born, bench: c.bench, genome: c.genome, weights: c.weights ? quantW(c.weights, c.genome.wMax) : null },
    fitness: evo.history.map(e => [e.gen, +(e.champAccNow ?? e.champFit).toFixed(3), +(e.childAcc ?? e.childBench).toFixed(3), +e.rally.toFixed(2), e.newChamp ? 1 : 0, e.beneficial ? 1 : 0]) };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `neuro-arena-${C.id}-champion-gen${evo.gen}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Champion exported');
};
$('bImport').onclick = () => $('fImport').click();
$('fImport').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text()); if (d.app !== 'neuro-arena' || !d.champion?.genome) throw new Error('not a Neuro Arena champion file');
    const cid = d.contest || 'pong'; if (!CONTEST[cid]) throw new Error('unknown contest ' + cid);
    if (cid !== C.id) selectContest(cid);
    const g = { ...gen0Genome() }; for (const s of GENES) if (typeof d.champion.genome[s.key] === 'number') g[s.key] = Math.max(s.min, Math.min(s.max, d.champion.genome[s.key]));
    let w = d.champion.weights ? dequantW(d.champion.weights) : null;
    if (w && !w.W && w.length !== L.A_E.n * (L.M_UP.n + L.M_DN.n)) throw new Error('weight matrix has the wrong size');
    if (w && w.W) { if (w.K !== C.K) throw new Error('weights are for a different answer set'); if (w.size !== evo.opts.size) { evo.opts.size = w.size; ui.lay = cLayout(w.size, C.K); syncControls(); } }
    evo.toHof(evo.champ);
    evo.champ = { id: evo.nextId++, genome: g, weights: w, born: evo.gen, n: 0, fit: 0, bench: null, scores: [], imported: true };   // re-benchmarked next round
    if (w && !evo.opts.lamarck) toast('Imported. Its learned synapses are kept only in Lamarckian mode.'); else toast(`Imported champion from generation ${d.generation ?? '?'}`);
    save(true); updateStatus(); renderGenome(); ui.started = false; setMode(ui.mode);
  } catch (err) { toast('Import failed: ' + err.message); }
};


// ------------------------------------------------------------------ contest carousel
function renderCarousel() {
  const tr = $('cTrack'); if (!tr) return;
  if (tr.children.length !== VISIBLE.length) {
    tr.innerHTML = VISIBLE.map(c => `<button class="cc" data-id="${c.id}" title="${c.blurb.replace(/"/g, '&quot;')}"><span class="ci">${c.icon}</span><span><span class="cn">${c.name}</span><span class="cs"></span></span></button>`).join('');
    tr.querySelectorAll('.cc').forEach(b => b.addEventListener('click', () => { if (ui.swiped) return; selectContest(b.dataset.id); }));
  }
  const idx = VISIBLE.findIndex(c => c.id === C.id);
  [...tr.children].forEach((b, i) => {
    const c = VISIBLE[i], sm = c.id === C.id ? { gen: evo.gen, acc: champAcc(evo), size: evo.opts.size, level: evo.level || 0 } : meta.sum[c.id];
    b.classList.toggle('on', i === idx);
    b.querySelector('.cs').textContent = sm && sm.gen ? `gen ${sm.gen}${c.levels ? ' · L' + ((sm.level || 0) + 1) : ''} · ${pct(sm.acc || 0)} · chance ${pct(chanceOf(c))}` : `chance ${pct(chanceOf(c))} · new`;
  });
  const view = $('cView'), cw = tr.children[0] ? tr.children[0].offsetWidth + 8 : 168;
  tr.style.transform = `translateX(${Math.round(view.clientWidth / 2 - cw * idx - (cw - 8) / 2)}px)`;
}
function stepContest(d) { const i = VISIBLE.findIndex(c => c.id === C.id); selectContest(VISIBLE[(i + d + VISIBLE.length) % VISIBLE.length].id); }
function selectContest(id) {
  if (!CONTEST[id] || id === C.id) return;
  save(true);
  if (liveW) liveW.postMessage({ t: 'stop' });
  C = CONTEST[id]; evo = getEvo(id); meta.cur = id; saveMeta();
  ui.lay = isChoice() ? cLayout(evo.opts.size, C.K) : null; ui.polMaps = [null, null]; ui.stageR = null; lastFrame = null;
  stage.setContest(C); labReset();
  if (R) R.setFrame(null);
  $('reaper').classList.add('hidden');
  const wasTurbo = ui.mode === 'turbo';
  ui.started = false; setMode(ui.mode);
  syncControls(); chartLegend(); drawChart(); renderLog(); renderGenome(); updateStatus(); updateNames(); drawMaps(); renderCarousel();
  if (!wasTurbo) toast(`${C.icon} ${C.name}: ${C.blurb}`);
}
$('cPrev').onclick = () => stepContest(-1); $('cNext').onclick = () => stepContest(1);
{ // swipe on the carousel
  const v = $('carousel'); let x0 = null, id0 = null;
  v.addEventListener('pointerdown', e => { x0 = e.clientX; id0 = e.pointerId; ui.swiped = false; });
  v.addEventListener('pointermove', e => { if (x0 == null || e.pointerId !== id0) return; const dx = e.clientX - x0; if (Math.abs(dx) > 44) { ui.swiped = true; stepContest(dx < 0 ? 1 : -1); x0 = e.clientX; } });
  const end = () => { x0 = null; setTimeout(() => { ui.swiped = false; }, 0); };
  v.addEventListener('pointerup', end); v.addEventListener('pointercancel', end);
  v.addEventListener('wheel', e => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 20) { clearTimeout(v.wt); v.wt = setTimeout(() => stepContest(e.deltaX > 0 ? 1 : -1), 40); } }, { passive: true });
}
function chartLegend() {
  if (isChoice()) {
    $('chTitle').textContent = `${C.name}: benchmark accuracy over generations`;
    $('chLegend').innerHTML = `<i class="l1"></i>champion <i class="l5"></i>best ever <i class="l2"></i>challenger <i class="l3"></i>chance ${pct(chanceOf(C))} <i class="l4">◆</i>copy error → reaped`;
  } else {
    $('chTitle').textContent = 'Benchmark score over generations';
    $('chLegend').innerHTML = '<i class="l1"></i>champion <i class="l5"></i>best ever <i class="l2"></i>challenger <i class="l6"></i>rally length (right axis) <i class="l3"></i>random paddle <i class="l4">◆</i>beneficial copy error → new champion';
  }
}
// ------------------------------------------------------------------ answers (Play, choice contests)
function buildAnswers() {
  const el = $('answers'); el.innerHTML = C.labels.map((l, k) => `<button data-k="${k}" aria-label="answer ${l}">${l}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); pressAnswer(+b.dataset.k); }));
  placeAnswers();
}
function placeAnswers() {
  const el = $('answers'); if (el.classList.contains('hidden') || !ui.stageR) return;
  const r = ui.stageR; el.style.left = Math.round(r.x + r.w / 2) + 'px'; el.style.transform = 'translateX(-50%)';
  el.style.top = Math.round(Math.min(innerHeight - el.offsetHeight - 8, r.y + r.h + 6)) + 'px';
}
// ------------------------------------------------------------------ THE REAPER verdict
function showVerdict(e) {
  const v = e.reaper; if (!v) return;
  const el = $('reaper'), lv = ui.live, cs = lv ? lv.champSide : 0, cc = cs ? 'b' : 'a', kc = cs ? 'a' : 'b', mx = Math.max(1, v.max || 1);
  const bar = s => { const f = Math.max(-1, Math.min(1, s / mx)); return `<div class="sb"><i style="left:${f >= 0 ? 50 : 50 + f * 50}%;width:${Math.abs(f) * 50}%;background:${f >= 0 ? '#5cff9d' : '#ff5a5a'}"></i><i style="left:50%;width:1px;background:rgba(255,255,255,.5)"></i></div>`; };
  const side = (k, cls, who) => `<div class="${cls}"><b>${who}</b>${v.lead === k ? ' <span class="lead">◀ leads</span>' : ''}<br>${v.score[k]} pts of ${mx}${bar(v.score[k])}✓ ${v.ok[k]} right · ✗ ${v.bad[k]} wrong · – ${v.abst[k]} abstain${v.lat && v.lat[k] != null ? ` · ${Math.round(v.lat[k])} ms` : ''}</div>`;
  el.innerHTML = `<div class="rt">THE REAPER</div><div class="rv ${v.reaped ? 'ok' : 'no'}">${v.reaped ? `Challenger #${v.childId} reaps champion #${v.champId}` : `Champion #${v.champId} survives`}</div>
    <div class="rs">${side(0, cc, 'CHAMPION #' + v.champId)}${side(1, kc, 'CHALLENGER #' + v.childId)}</div>
    <div class="rn">same frozen items for both · +1 per right character, −2 per wrong one, 0 for abstaining<br>margin ${v.margin >= 0 ? '+' : ''}${v.margin} (needs ≥ ${v.need}) · items better ${v.b} vs worse ${v.c} → sign test ${v.sig ? 'passed' : 'not passed'}${e.childWon ? ' · challenger also won the duel' : ''}</div>`;
  el.classList.remove('hidden'); placeOverlays();
  clearTimeout(showVerdict.t); showVerdict.t = setTimeout(() => el.classList.add('hidden'), 4200);
}
// ------------------------------------------------------------------ Lab
function labReset() {
  const cap = 600; lab.tr = { cap, i: 0, n: 0, lvl: [new Float32Array(cap), new Float32Array(cap)], pul: [new Float32Array(cap), new Float32Array(cap)] };
  const rows = LAB.AREA_NAMES.length * LAB.RASTER_ROWS; lab.ras = { i: 0, d: new Uint8Array(rows * LAB.RASTER_COLS) }; lab.rates.fill(0);
  // RASTER_ROWS display cells per area, evenly spaced
  const AR = ['TH_E', 'TH_I', 'S_E', 'S_I', 'A_E', 'A_I', 'M_UP', 'M_DN', 'M_I']; lab.cells = new Int32Array(rows);
  AR.forEach((k, a) => { for (let j = 0; j < LAB.RASTER_ROWS; j++) lab.cells[a * LAB.RASTER_ROWS + j] = L[k].s + Math.floor((j + 0.5) * L[k].n / LAB.RASTER_ROWS); });
  // real cells per display area (choice brains scale; their motor pool is split over the two motor rows)
  if (isChoice()) { const q = ui.lay || cLayout(evo.opts.size, C.K); lab.nReal = [q.TH_E.n, q.TH_I.n, q.S_E.n, q.S_I.n, q.A_E.n, q.A_I.n, q.M_E.n / 2, q.M_E.n / 2, q.M_I.n]; }
  else lab.nReal = AR.map(k => L[k].n);
}
function labCollect(f) {
  if (!lab.tr) labReset();
  const tr = lab.tr; for (let k = 0; k < 2; k++) { const b = f.br[k]; tr.lvl[k][tr.i] = b ? b.da : 0; tr.pul[k][tr.i] = b ? b.daPulse : 0; }
  tr.i = (tr.i + 1) % tr.cap; tr.n++;
  const rows = lab.cells.length, col = lab.ras.i, d = lab.ras.d; for (let r = 0; r < rows; r++) d[col * rows + r] = f.spk[lab.cells[r]];
  lab.ras.i = (col + 1) % LAB.RASTER_COLS;
  const b = f.br[0], ms = f.simMs || 16; if (b && b.areas) for (let a = 0; a < 9; a++) { const hz = b.areas[a] / lab.nReal[a] / (ms / 1000); lab.rates[a] += (hz - lab.rates[a]) * 0.1; }
}
// the champion's synapse statistics and drift between successive champion snapshots (per generation)
function trackWeights(out) {
  const w = evo.champ.weights, W = w ? (w.W || w) : null; if (!W) return;
  let n = 0, s = 0, s2 = 0, dr = 0, dn = 0; const P = ui.prevW && ui.prevW.length === W.length ? ui.prevW : null;
  for (let i = 0; i < W.length; i++) { const v = W[i]; if (v < 0) continue; n++; s += v; s2 += v * v; if (P && P[i] >= 0) { dr += Math.abs(v - P[i]); dn++; } }
  const m = s / Math.max(1, n); evo.lab = evo.lab || [];
  evo.lab.push({ gen: evo.gen, mean: +m.toFixed(5), sd: +Math.sqrt(Math.max(0, s2 / Math.max(1, n) - m * m)).toFixed(5), drift: P ? +(dr / Math.max(1, dn)).toExponential(3) : null, newChamp: out.some(e => e.newChamp) });
  if (evo.lab.length > 1500) evo.lab.splice(0, evo.lab.length - 1500);
  ui.prevW = new Float32Array(W);
}
function toggleLab(v) { const el = $('lab'); el.classList.toggle('hidden', !v); if (v) { $('labTitle').textContent = `${C.icon} ${C.name} · ${neuronsOf(C, evo.opts.size).toLocaleString()} neurons per brain · generation ${evo.gen} · ${evo.opts.lamarck ? 'Lamarckian' : 'Darwinian'}`; drawLab(true); } }
function drawLab(full) {
  if ($('lab').classList.contains('hidden')) return;
  if (full) {
    LAB.drawCurve($('lCurve'), evo.history, chanceOf(C), !isChoice());
    const w = evo.champ.weights; LAB.drawWeights($('lW'), w ? (w.W || w) : null, evo.champ.genome.wMax, evo.lab);
    $('lReaper').innerHTML = LAB.reaperHTML(evo); $('lLine').innerHTML = LAB.lineageHTML(evo, !isChoice()); $('lLD').innerHTML = LAB.lamDarHTML(evo, chanceOf(C));
  }
  LAB.drawLive($('lLive'), isChoice() ? stage.hist : [[], []], chanceOf(C));
  LAB.drawDA($('lDA'), lab.tr); LAB.drawRaster($('lRas'), lab.ras, lab.rates);
}
$('bLab').onclick = () => toggleLab(true); $('labX').onclick = () => toggleLab(false);
$('lab').addEventListener('click', e => { if (e.target.id === 'lab') toggleLab(false); });
const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); };
$('labCSV').onclick = () => { download(`neuro-arena-${C.id}-history.csv`, LAB.toCSV(evo, C.id), 'text/csv'); toast('History exported as CSV'); };
$('labJSON').onclick = () => {
  const tr = lab.tr, ord = a => { const o = []; const cnt = Math.min(tr.n, tr.cap); for (let j = 0; j < cnt; j++) o.push(+a[(tr.i - cnt + j + tr.cap) % tr.cap].toFixed(4)); return o; };
  const data = { app: 'neuro-arena', kind: 'lab', contest: C.id, neurons: neuronsOf(C, evo.opts.size), size: evo.opts.size, chance: chanceOf(C), exported: new Date().toISOString(), opts: evo.opts,
    reaperRule: { correct: 1, incorrect: -2, abstain: 0, margin: 'max(3, 5% of max) points (Pong: 2) and a paired sign test', benchmark: isChoice() ? benchSet(C).length + ' frozen items' : BENCH_N + ' serves' },
    history: evo.history.map(e => ({ gen: e.gen, lam: e.lam !== false, champId: e.champId, childId: e.childId, champAccNow: e.champAccNow, childAcc: e.childAcc ?? e.childBench, reaper: e.reaper, newChamp: e.newChamp, errors: e.errors, wErrors: e.wErrors, duel: e.score, seg: e.seg })),
    weights: evo.lab || [], dopamine: tr ? { A: { level: ord(tr.lvl[0]), pulses: ord(tr.pul[0]) }, B: { level: ord(tr.lvl[1]), pulses: ord(tr.pul[1]) } } : null,
    ratesHz: Object.fromEntries(LAB.AREA_NAMES.map((n, i) => [n, +lab.rates[i].toFixed(2)])), champion: { id: evo.champ.id, genome: evo.champ.genome, bench: evo.champ.bench } };
  download(`neuro-arena-${C.id}-lab.json`, JSON.stringify(data), 'application/json'); toast('Lab data exported as JSON');
};

// ------------------------------------------------------------------ main loop
let prevT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prevT) / 1000); prevT = now;
  if (ui.mode === 'play') pollGamepad();
  if (R && R.failed && !R.is2D) use2D(R.failed);
  if (R) { try { R.render(dt, ui.mode !== 'turbo'); } catch (e) { if (!R.is2D) use2D(e.message); else throw e; } placeOverlays(); }
  if (isChoice() && ui.mode !== 'turbo') stage.draw(dt);
  if (now - (ui.labT || 0) > 250) { const full = now - (ui.labFull || 0) > 2000; ui.labT = now; if (full) ui.labFull = now; drawLab(full); }
  // watchdog: a live match that produces no frames for 8 s means the worker never started
  if (ui.live && !ui.live.benching && ui.mode !== 'turbo' && !noWorkers && !document.hidden && now - Math.max(ui.liveT0 || 0, ui.lastLiveMsg || 0, ui.visT || 0) > 8000) workersFailed('no response from worker');
}
document.addEventListener('visibilitychange', () => { ui.visT = performance.now(); });
ui.lay = isChoice() ? cLayout(evo.opts.size, C.K) : null; stage.setContest(C); labReset();
syncControls(); chartLegend(); layout(); renderLog(); renderGenome(); updateStatus(); drawMaps();
if (evo.champ.weights && !isChoice()) ui.polMaps = [polFromWeights(evo.champ.weights), null];
if (ui.migrated) setTimeout(() => toast('Your Pong evolution was kept; new contests are in the carousel'), 1500);
setMode('watch');
requestAnimationFrame(frame);
// the live duel starts immediately; first-time visitors get a hint instead of a modal over the arena
if (!localStorage.getItem('neuroArena.seenInfo')) { setTimeout(() => toast('Live duel running · press i or ⓘ for how it works'), 1200); try { localStorage.setItem('neuroArena.seenInfo', '1'); } catch (e) { /* private mode */ } }
window.NA_started = true;
