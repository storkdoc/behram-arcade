/* NEURO ARENA: UI controller. Evolution state lives here; spiking brains run in Web Workers. */
import { Evolution, quant, dequant, BENCH_N } from './evo.js';
import { GENES, GENE, fmtGene, gen0Genome } from './genome.js';
import { N, L } from './brain.js';
import { COURT } from './pong.js';
import { Render3D, REGION_LABELS } from './render3d.js';
import { Render2D } from './render2d.js';
import { makeHandler } from './simcore.js';

const $ = id => document.getElementById(id);
const KEY = 'neuroArena.v2';          // v2: benchmark selection + fixed learner; v1 saves (buggy learner) are discarded
try { localStorage.removeItem('neuroArena.v1'); } catch (e) { /* storage disabled */ }
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
let evo = load() || new Evolution({ lamarck: true });
const ui = { mode: 'watch', speed: 1, K: Math.max(1, Math.min(coarse ? 3 : 6, HC - 1)), epoch: 0, live: null, lastSave: 0, turboGen0: 0, turboT0: 0, gps: 0, tip: null, tab: 'chart', polMaps: [null, null] };
window.NA = { get evo() { return evo; }, ui, errs, get R() { return R; }, get noWorkers() { return noWorkers; }, courtPoint: (x, y) => R ? R.courtAnchor(x, y) : null, restart: () => { ui.started = false; setMode('watch'); } };   // for tests / console tinkering

function load() {
  try { const s = localStorage.getItem(KEY); if (!s) return null; return Evolution.restore(JSON.parse(s)); } catch (e) { console.warn('could not restore', e); return null; }
}
function save(force) {
  const now = performance.now(); if (!force && now - ui.lastSave < 8000) return; ui.lastSave = now;
  try { localStorage.setItem(KEY, JSON.stringify(evo.serialize(true))); }
  catch (e) { try { localStorage.setItem(KEY, JSON.stringify(evo.serialize(false))); } catch (e2) { /* storage full or disabled */ } }
}

// ------------------------------------------------------------------ renderer + layout
let canvas = $('gl');
if (/[?&]thumb/.test(location.search)) document.body.classList.add('thumb');
let R = null;
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
  let top = 50 + sat + 46, bottom = H - 10 - sab, right = W, left = 0;
  if (side) { panel.style.cssText = `top:${56 + sat}px;bottom:${8 + sab}px;height:auto;left:auto;width:${Math.round(W * 0.36)}px`; right = W - Math.round(W * 0.36) - 18; top = 50 + sat + 36; }
  else {
    const ph = compact ? Math.round(Math.max(150, Math.min(250, H * (W < H ? 0.3 : 0.28)))) : 236;
    panel.style.cssText = ''; document.documentElement.style.setProperty('--ph', ph + 'px'); bottom = H - ph - 18 - sab;
    if (b.contains('dockctl')) right = W - 300;
  }
  if (b.contains('thumb')) { top = 70; bottom = H - 10; right = W; }
  rect = { x: left + 6, y: top, w: Math.max(50, right - left - 12), h: Math.max(50, bottom - top - (compact ? 40 : 66)) };
  if (R) R.resize(W, H, rect);
  document.querySelectorAll('.card').forEach(c => c.classList.toggle('on', c.dataset.card === ui.tab));
  drawChart();
}
addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 60); });
addEventListener('orientationchange', () => setTimeout(layout, 250));

function placeOverlays() {
  if (!R) return;
  for (let k = 0; k < 2; k++) {
    const short = R.ppu < 75, AB = ['Sens.', 'Thal.', 'Assoc.', 'Motor ▲', 'Motor ▼'];
    REGION_LABELS.forEach(([t, x, y], j) => { const p = R.anchor(k, x, y); const el = regionEls[k][j]; const txt = short ? AB[j] : t; if (el.textContent !== txt) el.textContent = txt; el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.opacity = ui.mode === 'play' && k === 1 ? 0.25 : 1; });
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
  sc.style.top = Math.max(52, c.y - sc.offsetHeight - 6) + 'px'; sc.style.left = c.x + 'px';
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
const copyJob = j => ({ ...j, wA: j.wA ? new Float32Array(j.wA) : null, wB: j.wB ? new Float32Array(j.wB) : null });

// ------------------------------------------------------------------ modes
function setMode(m) {
  if (m === ui.mode && ui.started) return;
  ui.started = true; ui.mode = m; ui.epoch++;
  document.querySelectorAll('.mode').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.body.dataset.mode = m;
  $('turboBox').classList.toggle('hidden', m !== 'turbo');
  $('serveHint').classList.add('hidden');
  if (liveW) liveW.postMessage({ t: 'stop' });
  ui.live = null;
  if (m === 'watch') startWatch();
  else if (m === 'turbo') startTurbo();
  else startPlay();
  updateNames(); updateStatus();
}
function startWatch() {
  const child = evo.spawn(), job = evo.job(child), ep = ui.epoch;
  ui.live = { kind: 'watch', child, job, ep, pending: false, champSide: job.side };
  ui.genome = { child };
  lastTickT = performance.now(); getLive().postMessage({ t: 'live', job: copyJob(job), mode: 'watch' });
  ui.live.pending = true;
  renderGenome();
}
function startPlay() {
  const c = evo.champ, ep = ui.epoch;
  const job = { gA: c.genome, wA: c.weights, gB: c.genome, wB: null, seed: (Math.random() * 1e9) >>> 0, matchSec: 1e6, lamarck: false, side: 0 };
  ui.live = { kind: 'play', job, ep, pending: true, champSide: 0 };
  lastTickT = performance.now(); getLive().postMessage({ t: 'live', job: copyJob(job), mode: 'play' });
  $('serveHint').classList.remove('hidden');
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
  save(); drawChart(); renderLog(); renderGenome(); updateStatus(); updateNames();
  const nc = out.find(e => e.newChamp);
  if (nc && ui.mode !== 'turbo') toast(nc.beneficial ? `New champion #${nc.childId}: ${nc.errors.length} copy error${nc.errors.length === 1 ? '' : 's'} paid off` : `New champion #${nc.childId}`);
  if (ui.mode === 'turbo') {
    $('tGen').textContent = evo.gen; $('tRate').textContent = ui.gps.toFixed(2);
    $('tChamp').textContent = `champion #${evo.champ.id} · benchmark ${pct(evo.champ.fit)} · best ever ${pct(evo.best ? evo.best.fit : 0)} · random ${pct(RANDOM_HIT)}`;
    ui.polMaps = [evo.champ.weights ? polFromWeights(evo.champ.weights) : null, null]; drawMaps();
  }
}

// ------------------------------------------------------------------ live frames (watch / play)
let lastFrame = null, lastTickT = performance.now();
function onLive(e) {
  const f = e.data, lv = ui.live;
  if (!lv || f.t !== 'frame') return;
  ui.lastLiveMsg = performance.now(); lv.pending = false; lastFrame = f; ui.frame = { time: f.time, pad: f.pad, bx: f.bx, by: f.by, stats: f.stats, hold: f.hold };
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
  $('clock').textContent = `benchmarking ${BENCH_N} serves…`;
  ensurePool(Math.max(2, pool.length));
  const [bA, bB] = await Promise.all([runOn(pool[0], { t: 'bench', g: job.gA, w: r.wA }), runOn(pool[1], { t: 'bench', g: job.gB, w: r.wB })]);
  if (evo !== ev0 || lv.ep !== ui.epoch || ui.mode !== 'watch') return;
  const out = evo.record([lv.child], [job], [{ stats: r.stats, wA: lam ? r.wA : null, wB: lam ? r.wB : null, bench: [bA, bB] }]);
  onGenerations(out, lv.child);
  const e = out[0];
  toast(e.newChamp ? `Spawn #${e.childId} scored ${pct(e.childBench)} on the benchmark → new champion` : `Benchmark: spawn ${pct(e.childBench)} · champion ${pct(e.champBench)} (champion stays)`);
  setTimeout(() => { if (ui.mode === 'watch' && lv.ep === ui.epoch) startWatch(); }, 1400);
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
  if (lv.kind === 'play') {
    msg.humanCmd = input.cmd(); msg.humanY = input.y != null && !msg.humanCmd ? input.y : null;
    if (input.serve) { msg.serve = true; input.serve = false; }
    if (lv.reset) { msg.reset = true; lv.reset = false; lv.over = false; }
  }
  lv.pending = true; liveW.postMessage(msg);
}
// ------------------------------------------------------------------ input (play mode)
const input = {
  keys: new Set(), y: null, serve: false, gp: 0,
  cmd() { let c = 0; if (this.keys.has('up')) c += 1; if (this.keys.has('down')) c -= 1; if (!c && Math.abs(this.gp) > 0.18) c = this.gp; return Math.max(-1, Math.min(1, c)); },
};
const KMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  if (KMAP[e.code]) { input.keys.add(KMAP[e.code]); input.y = null; e.preventDefault(); }
  else if (e.code === 'Space') { input.serve = true; e.preventDefault(); }
  else if (e.code === 'Digit1') setMode('watch'); else if (e.code === 'Digit2') setMode('turbo'); else if (e.code === 'Digit3') setMode('play');
  else if (e.code === 'KeyI') toggleInfo(); else if (e.code === 'Escape') { toggleInfo(false); document.body.classList.remove('ctl'); }
});
addEventListener('keyup', e => { if (KMAP[e.code]) input.keys.delete(KMAP[e.code]); });
const onCanvas = (type, fn) => document.addEventListener(type, e => { if (e.target === canvas) fn(e); });
function pointerCourt(e) {
  if (!R || ui.mode !== 'play') return null;
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
    $(k ? 'mtB' : 'mtA').textContent = n;
  }
  $('metB').classList.toggle('hidden', ui.mode === 'play');
  $('genLbl').textContent = 'GENERATION ' + evo.gen;
  $('benchLbl').textContent = evo.champ.bench ? `champion benchmark ${pct(evo.champ.fit)}` : 'champion not yet benchmarked';
}
function updateMeters(f) {
  $('scA').textContent = f.stats.score[0]; $('scB').textContent = f.stats.score[1];
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
  const c = evo.champ, h = evo.history, nb = h.filter(e => e.beneficial).length, nc = h.filter(e => e.newChamp).length;
  $('stat').innerHTML = `<b>Generation ${evo.gen}</b><br>Champion #${c.id} · born gen ${c.born} · defended ${Math.max(0, c.n - 1)}×<br>` +
    `Benchmark ${pct(c.fit)} of ${BENCH_N} standard serves · best ever ${pct(evo.best ? evo.best.fit : 0)} · random ${pct(RANDOM_HIT)}<br>Mean rally (20 duels) ${recentRally().toFixed(1)} hits<br>Throne changes ${nc} · from copy errors ${nb}<br>` +
    `Hall of Fame ${evo.hof.map(x => '#' + x.id + ' ' + Math.round(x.fit * 100) + '%').join(', ') || '–'}<br>Inheritance <b>${evo.opts.lamarck ? 'Lamarckian' : 'Darwinian'}</b> · copy errors <b>${(evo.opts.rate * 100).toFixed(1)}%</b>`;
}
function renderLog() {
  const items = evo.log.slice(0, 40).map(e => {
    const er = e.errors || [], duel = `duel ${e.score[1]}–${e.score[0]}`, bm = `bench ${pct(e.childBench)} vs ${pct(e.champBench)}`;
    const res = e.newChamp ? `${duel} · ${bm} → champion` : `${duel} · ${bm}${e.childBench > e.champBench ? ' (not clearly better)' : ''}`;
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
function drawMaps() {
  [0, 1].forEach(k => {
    const c = $(k ? 'polB' : 'polA'), x = c.getContext('2d'), m = ui.polMaps[k];
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
  const H = evo.history, G = Math.max(10, evo.gen), pl = 30, pr = 22, pt = 6, pb = 16, iw = w - pl - pr, ih = h - pt - pb;
  const RM = Math.max(10, Math.ceil(Math.max(0, ...H.map(e => e.rally)) / 5) * 5);
  const X = g => pl + (g / G) * iw, Y = v => pt + (1 - v) * ih, YR = v => pt + (1 - Math.min(1, v / RM)) * ih;
  x.font = '10px -apple-system, system-ui, sans-serif'; x.fillStyle = '#7f93b8'; x.strokeStyle = 'rgba(120,160,255,.12)'; x.lineWidth = 1;
  for (let v = 0; v <= 1.001; v += 0.25) { x.beginPath(); x.moveTo(pl, Y(v)); x.lineTo(w - pr, Y(v)); x.stroke(); x.fillText(Math.round(v * 100) + '%', 2, Y(v) + 3); }
  x.fillStyle = 'rgba(80,220,255,.75)'; x.fillText(String(RM), w - pr + 3, Y(1) + 3); x.fillText('0', w - pr + 3, Y(0) + 3); x.fillStyle = '#7f93b8';
  const step = Math.pow(10, Math.floor(Math.log10(G / 4))), st = G / step > 8 ? step * 2 : step;
  for (let g = 0; g <= G; g += st) x.fillText(String(g), X(g) - 6, h - 3);
  x.setLineDash([3, 3]); x.strokeStyle = 'rgba(140,170,170,.7)'; x.beginPath(); x.moveTo(pl, Y(RANDOM_HIT)); x.lineTo(w - pr, Y(RANDOM_HIT)); x.stroke(); x.setLineDash([]);
  const dotR = H.length > 400 ? 1 : 1.6;
  x.fillStyle = 'rgba(185,139,255,.5)'; for (const e of H) { x.beginPath(); x.arc(X(e.gen), Y(e.childBench), dotR, 0, 7); x.fill(); }
  // mean rally length in the duels (right axis), rolling mean
  const win = Math.max(3, Math.round(H.length / 30)); let s = 0; const q = [];
  x.strokeStyle = 'rgba(80,220,255,.8)'; x.lineWidth = 1.4; x.beginPath();
  H.forEach((e, i) => { q.push(e.rally); s += e.rally; if (q.length > win) s -= q.shift(); const m = s / q.length; if (i === 0) x.moveTo(X(e.gen), YR(m)); else x.lineTo(X(e.gen), YR(m)); }); x.stroke();
  // best ever (thin) and the champion's benchmark score (bold step line)
  const stepLine = (key, style, lw, glow) => { x.strokeStyle = style; x.lineWidth = lw; x.shadowColor = style; x.shadowBlur = glow; x.beginPath(); let prev = null;
    H.forEach((e, i) => { const v = e[key]; if (i === 0) x.moveTo(X(e.gen - 1), Y(v)); else x.lineTo(X(e.gen), Y(prev)); x.lineTo(X(e.gen), Y(v)); prev = v; }); x.stroke(); x.shadowBlur = 0; };
  if (H.length) { x.setLineDash([4, 3]); stepLine('bestFit', 'rgba(255,255,255,.55)', 1, 0); x.setLineDash([]); stepLine('champFit', '#ffd25a', 2.2, 6); }
  ui.marks = [];
  for (const e of H) if (e.newChamp && e.beneficial) { const px = X(e.gen), py = Y(e.champFit); ui.marks.push({ px, py, e }); x.fillStyle = '#5cff9d'; x.beginPath(); x.moveTo(px, py - 4.5); x.lineTo(px + 3.5, py); x.lineTo(px, py + 4.5); x.lineTo(px - 3.5, py); x.closePath(); x.fill(); }
  else if (e.newChamp && e.hof) { x.fillStyle = '#ffd25a'; x.fillText('♛', X(e.gen) - 4, Y(e.champFit) + 4); }
  drawLife();
}
// lifetime learning: hit rate in each 5 s of a duel, pooled over the last 20 duels (champion vs challengers)
function drawLife() {
  const c = $('life'); if (!c) return;
  const dpr = Math.min(3, devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight; if (!w || !h) return;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const H = evo.history.slice(-20).filter(e => e.seg && e.seg.length), pl = 4, pr = 4, pt = 14, pb = 14, iw = w - pl - pr, ih = h - pt - pb;
  x.font = '10px -apple-system, system-ui, sans-serif'; x.fillStyle = '#7f93b8'; x.fillText('lifetime learning (last 20 duels)', pl, 10);
  x.strokeStyle = 'rgba(120,160,255,.12)'; for (let v = 0; v <= 1.001; v += 0.5) { x.beginPath(); x.moveTo(pl, pt + (1 - v) * ih); x.lineTo(w - pr, pt + (1 - v) * ih); x.stroke(); }
  if (!H.length) { x.fillText('waiting for the first duel…', pl, pt + ih / 2); return; }
  const S = Math.max(...H.map(e => e.seg.length)), acc = [0, 1].map(() => Array.from({ length: S }, () => [0, 0]));
  for (const e of H) e.seg.forEach((sg, i) => { const cs = e.cs ?? 0; for (const [r, side] of [[0, cs], [1, 1 - cs]]) { acc[r][i][0] += sg[side * 2]; acc[r][i][1] += sg[side * 2] + sg[side * 2 + 1]; } });
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
  tip.innerHTML = `<b>Gen ${ev.gen}: spawn #${ev.childId} dethroned #${ev.champId}</b><br>${er.map(x => `${GENE[x.key]?.label || x.key} ${fmtGene(x.key, x.from)}→${fmtGene(x.key, x.to)} (${x.kind})`).join('<br>') || 'synapse copy errors only'}${ev.wErrors ? `<br>+${ev.wErrors} synapse copy errors` : ''}<br>benchmark ${pct(ev.childBench)} (champion before: ${pct(ev.prevBench ?? ev.champBench)})`;
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
}
$('sRate').oninput = e => { evo.opts.rate = +e.target.value / 100; syncControls(); updateStatus(); save(true); };
$('sLen').oninput = e => { evo.opts.matchSec = +e.target.value; syncControls(); save(true); };
$('iDar').onclick = () => { evo.opts.lamarck = false; syncControls(); updateStatus(); save(true); };
$('iLam').onclick = () => { evo.opts.lamarck = true; syncControls(); updateStatus(); save(true); };
$('sSpd').oninput = e => { ui.speed = SPEEDS[+e.target.value]; syncControls(); };
$('sK').oninput = e => { ui.K = +e.target.value; syncControls(); };
$('bReset').onclick = () => {
  if (!confirm('Reset evolution to generation 0? The champion and history will be erased.')) return;
  const o = { ...evo.opts }; evo = new Evolution(o); localStorage.removeItem(KEY); ui.started = false; ui.polMaps = [null, null];
  drawChart(); renderLog(); renderGenome(); updateStatus(); drawMaps(); setMode(ui.mode === 'turbo' ? 'watch' : ui.mode); toast('Evolution reset to generation 0');
};
$('bExport').onclick = () => {
  const c = evo.champ;
  const data = { app: 'neuro-arena', v: 1, exported: new Date().toISOString(), generation: evo.gen, opts: evo.opts,
    champion: { id: c.id, fit: c.fit, n: c.n, born: c.born, bench: c.bench, genome: c.genome, weights: c.weights ? quant(c.weights, c.genome.wMax) : null },
    fitness: evo.history.map(e => [e.gen, +e.champFit.toFixed(3), +e.childBench.toFixed(3), +e.rally.toFixed(2), e.newChamp ? 1 : 0, e.beneficial ? 1 : 0]) };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `neuro-arena-champion-gen${evo.gen}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast('Champion exported');
};
$('bImport').onclick = () => $('fImport').click();
$('fImport').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const d = JSON.parse(await file.text()); if (d.app !== 'neuro-arena' || !d.champion?.genome) throw new Error('not a Neuro Arena champion file');
    const g = { ...gen0Genome() }; for (const s of GENES) if (typeof d.champion.genome[s.key] === 'number') g[s.key] = Math.max(s.min, Math.min(s.max, d.champion.genome[s.key]));
    const w = d.champion.weights ? dequant(d.champion.weights) : null;
    if (w && w.length !== L.A_E.n * (L.M_UP.n + L.M_DN.n)) throw new Error('weight matrix has the wrong size');
    evo.toHof(evo.champ);
    evo.champ = { id: evo.nextId++, genome: g, weights: w, born: evo.gen, n: 0, fit: 0, bench: null, scores: [], imported: true };   // re-benchmarked next round
    if (w && !evo.opts.lamarck) toast('Imported. Its learned synapses are kept only in Lamarckian mode.'); else toast(`Imported champion from generation ${d.generation ?? '?'}`);
    save(true); updateStatus(); renderGenome(); ui.started = false; setMode(ui.mode);
  } catch (err) { toast('Import failed: ' + err.message); }
};

// ------------------------------------------------------------------ main loop
let prevT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - prevT) / 1000); prevT = now;
  if (ui.mode === 'play') pollGamepad();
  if (R && R.failed && !R.is2D) use2D(R.failed);
  if (R) { try { R.render(dt, ui.mode !== 'turbo'); } catch (e) { if (!R.is2D) use2D(e.message); else throw e; } placeOverlays(); }
  // watchdog: a live match that produces no frames for 8 s means the worker never started
  if (ui.live && ui.mode !== 'turbo' && !noWorkers && !document.hidden && now - Math.max(ui.liveT0 || 0, ui.lastLiveMsg || 0, ui.visT || 0) > 8000) workersFailed('no response from worker');
}
document.addEventListener('visibilitychange', () => { ui.visT = performance.now(); });
syncControls(); layout(); renderLog(); renderGenome(); updateStatus(); drawMaps();
if (evo.champ.weights) ui.polMaps = [polFromWeights(evo.champ.weights), null];
setMode('watch');
requestAnimationFrame(frame);
// the live duel starts immediately; first-time visitors get a hint instead of a modal over the arena
if (!localStorage.getItem('neuroArena.seenInfo')) { setTimeout(() => toast('Live duel running · press i or ⓘ for how it works'), 1200); try { localStorage.setItem('neuroArena.seenInfo', '1'); } catch (e) { /* private mode */ } }
window.NA_started = true;
