/* NEURO STORM, dense mode: 55K-1M neuron layered cortex on the GPU. Main loop, input, UI, demo. */
import { DT, NET, DEFAULTS } from './sim.js';
import { OrbitCam } from './cam.js';
import { Scope, Raster } from './scope.js';
import { ColumnView } from './column.js';
import { buildDense, TIERS, BLOCK_MS, CLASSES, LAYERS, synPerNeuron, K } from './dense.js';
import { GpuNet, NG } from './gpunet.js';
import { DenseRender3D } from './renderdense.js';
import { installPadKeys } from './padkeys.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
export async function startDense(tierId, why) {
  document.body.classList.add('dense');
  const tier = TIERS.find(t => t.id === tierId);
  const g = buildDense(tier), N = g.N;
  $('ncount').textContent = N >= 1e6 ? (N / 1e6).toFixed(2) + ' million' : Math.round(N / 1000) + ',000';
  $('selN').value = tier.id;
  const cam = new OrbitCam();
  const SYN = synPerNeuron();
  { let tot = 0; for (let i = 0; i < N; i++) tot += SYN[g.cls[i]]; const mean = tot / N;
    $('synInfo').textContent = `Six layers · 7 cell types · ~${Math.round(mean).toLocaleString()} synapses per neuron (700–2,200) · ~${(tot / 1e9 >= 1 ? (tot / 1e9).toFixed(2) + ' billion' : Math.round(tot / 1e6) + ' million')} effective synapses`; }
  // a stand-in net for the renderer constructor (positions + classes)
  const proto = { N, g, pos: g.pos, cls: g.cls, type: g.type, hemi: g.hemi, depth: g.depth };
  const R = new DenseRender3D($('gl'), proto, cam);
  const gl = R.r.getContext();
  const net = new GpuNet(gl, g); R.r.resetState();
  net.colorOf = i => CLASSES[net.cls[i]].color;
  R.net = net;
  const S = { paused: false, speed: 12, mode: 'tap', inspectOnce: false, demo: null, wave: 0, waveT0: -1, quietSince: 0, lastQuietMsg: '', hold: null, gpuLimited: false, hidden: false, view: 'trace', quiet: true, tier: tier.id, why };
  const scope = new Scope($('scope')), column = new ColumnView($('scope')), raster = new Raster($('raster'), net);

  // ---------------------------------------------------------------- layout (same as classic)
  function layout() {
    const w = innerWidth, h = innerHeight, mob = w < 820 || (isTouch && Math.min(w, h) < 620);
    document.body.classList.toggle('mobile', mob); document.body.classList.toggle('portrait', mob && h >= w); document.body.classList.toggle('landscape', mob && w > h);
    R.resize(w, h);
    const b = document.body.classList;
    if (b.contains('portrait')) { const free = h - 70 - $('rast').offsetHeight - $('insp').offsetHeight - 30; cam.setFit(w / h, Math.max(0.35, free / h)); }
    else if (b.contains('landscape')) cam.setFit(w / h, Math.max(0.4, (h - $('rast').offsetHeight - 70) / h));
    else { const fw = w - $('panel').offsetWidth - 40, fh = h - $('rast').offsetHeight - 40; cam.setFit(fw / h, Math.min(1, fh / h)); }
  }
  function viewOffset() {
    const b = document.body.classList; if (S.hidden) return { x: 0, y: 0 };
    if (b.contains('portrait')) { const bot = $('rast').offsetHeight + $('insp').offsetHeight + 24, top = 80; return { x: 0, y: Math.round((bot - top) / 2) }; }
    if (b.contains('landscape')) return { x: 0, y: Math.round(($('rast').offsetHeight + 8) / 2) };
    const pw = $('panel').offsetWidth + 14; return { x: Math.round(pw / 2), y: Math.round(($('rast').offsetHeight + 8) * 0.5) };
  }
  // ---------------------------------------------------------------- sim helpers
  function stimulate(i, opts = {}) {
    if (i == null) return;
    if (S.quiet) { net.resetWave(); S.wave = 0; S.waveT0 = net.t; S.quiet = false; S.lastQuietMsg = ''; }
    S.quietSince = net.t;
    const kind = opts.kind ?? (S.mode === 'thal' ? 1 : 0);
    net.stimulate(i, opts.scale || 1, kind);
    R.ripple(i, opts.color || (kind === 1 ? 0x7fffb0 : undefined));
    if (opts.select !== false) select(i);
  }
  function select(i) {
    if (net.sel !== i) { net.select(i); R.setSelected(i); net.setColumn(i); }
    const c = CLASSES[net.cls[i]], L = LAYERS[net.layer[i]], side = net.hemi[i] < 0 ? 'L' : 'R';
    $('iName').textContent = innerWidth < 1200 ? `${c.short} · ${L.name} · #${i}` : `${c.name} · layer ${L.name} · #${i} · ${side}`;
    $('iName').title = `${c.name}, layer ${L.name}, neuron #${i}, ${side === 'L' ? 'left' : 'right'} hemisphere. ~${SYN[net.cls[i]].toLocaleString()} effective synapses`;
    $('iName').style.color = c.color;
    $('iSyn').textContent = `~${SYN[net.cls[i]].toLocaleString()} synapses`;
  }
  function inject(i, amp, ms) { net.inject(i, amp, ms); }
  const PHASE = { spike: ['ACTION POTENTIAL', '#ffffff', 'rgba(255,255,255,0.18)'], abs: ['ABSOLUTE REFRACTORY', '#ff8a8a', 'rgba(255,60,60,0.18)'], rel: ['RELATIVE REFRACTORY', '#ffc070', 'rgba(255,160,60,0.16)'],
    hyper: ['HYPERPOLARISED (IPSP / AHP)', '#a9a2ff', 'rgba(90,90,255,0.18)'], depol: ['DEPOLARISED (EPSP)', '#8fe6ff', 'rgba(60,200,255,0.16)'], rest: ['AT REST', '#8fa3c4', 'rgba(255,255,255,0.07)'] };
  // ---------------------------------------------------------------- run + harvest
  let msPerBlock = 2, carry = 0;
  function harvest(res) {
    for (let k = 0; k < res.spikes.length; k += 2) { const t = res.spikes[k], j = res.spikes[k + 1]; if (j < NG) raster.pushOnly(t, j); else column.spike(j - NG, t); }
    for (let b = 0; b < res.nb; b++) { let s = 0; for (let c = 0; c < 7; c++) s += res.pop[b * 7 + c]; raster.addRate(res.t0 + b * BLOCK_MS, s); }
    S.wave = res.wave;
  }
  function runBlocks(nb) {
    const t0 = performance.now(); let done = 0;
    while (done < nb) {
      let n = nb - done;
      if (S.hold) { if (net.t >= S.hold.next) { stimulate(S.hold.i, { select: false }); S.hold.next += 20; } n = Math.min(n, Math.max(1, Math.ceil((S.hold.next - net.t) / BLOCK_MS))); }
      n = Math.min(n, 48);
      raster.tick(net.t + n * BLOCK_MS); const res = net.run(n); harvest(res); done += n;
    }
    R.r.resetState();
    const ms = performance.now() - t0; if (nb > 0) msPerBlock = msPerBlock * 0.8 + (ms / nb) * 0.2;
    return done;
  }
  function advance(simMs) {
    const want = simMs / BLOCK_MS + carry; let nb = Math.floor(want); carry = want - nb;
    const cap = Math.max(1, Math.floor(14 / Math.max(0.05, msPerBlock)));
    S.gpuLimited = nb > cap; if (nb > cap) { nb = cap; carry = 0; }
    return runBlocks(nb);
  }
  function updateQuiet() {
    let recent = 0; for (let b = 0; b < 10; b++) recent += raster.rateBins[(Math.floor(net.t) - b + 4000) % 4000];
    const thr = Math.max(4, N * 0.003);
    if (recent > thr) { S.quietSince = net.t; if (S.waveT0 < 0) S.waveT0 = net.t; S.quiet = false; }
    else if (!S.quiet && net.t - S.quietSince > 40 && S.waveT0 >= 0) { S.quiet = true; S.lastQuietMsg = `back to baseline ${Math.max(0, S.quietSince - S.waveT0).toFixed(0)} ms after the pulse`; }
  }
  // ---------------------------------------------------------------- input
  const ptrs = new Map(); let gesture = null;
  function pick(x, y, rad) {
    // project (a stride-sampled subset at very large N) and pick the front-most neuron near the pointer
    const c = R.camera, m = new Float64Array(16), A = c.projectionMatrix.elements, Bm = c.matrixWorldInverse.elements;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 4; k++) v += A[k * 4 + i] * Bm[j * 4 + k]; m[j * 4 + i] = v; }
    const P = net.pos, clip = R.clip.value, r2 = rad * rad, st = Math.max(1, Math.floor(N / 1.2e6)), w2 = R.w, h2 = R.h;
    let best = -1, bd = 1e9, minW = 1e9; const hits = [];
    for (let i = 0; i < N; i += st) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2]; if (pz > clip) continue;
      const w = m[3] * px + m[7] * py + m[11] * pz + m[15]; if (w <= 0) continue;
      const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / w * 0.5 + 0.5) * w2 - x, sy = (1 - ((m[1] * px + m[5] * py + m[9] * pz + m[13]) / w * 0.5 + 0.5)) * h2 - y, d = sx * sx + sy * sy;
      if (d < r2) { hits.push(i, d, w); if (w < minW) minW = w; }
    }
    for (let k = 0; k < hits.length; k += 3) { const score = hits[k + 1] / r2 + (hits[k + 2] - minW) * 1.6; if (score < bd) { bd = score; best = hits[k]; } }
    return best < 0 ? null : best;
  }
  function onDown(e) {
    const c = e.currentTarget; c.setPointerCapture && c.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (ptrs.size === 1) {
      gesture = { kind: 'maybe', moved: 0 };
      if (S.mode === 'train' && !e.shiftKey && !S.inspectOnce) { const i = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 26 : 16); if (i != null) { gesture.kind = 'train'; stopDemo(); select(i); S.hold = { i, next: net.t }; } }
    } else if (ptrs.size === 2) { S.hold = null; const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) }; }
  }
  function onMove(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.kind === 'pinch' && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (gesture.d > 0) cam.zoom(gesture.d / d); gesture.d = d; return; }
    if (gesture.kind === 'train') return;
    if (gesture.kind === 'maybe' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > (e.pointerType === 'touch' ? 9 : 5)) gesture.kind = 'rotate';
    if (gesture.kind === 'rotate') cam.rotate(dx, dy);
  }
  function onUp(e) {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.kind === 'train') S.hold = null;
    else if (gesture.kind === 'maybe' && p && performance.now() - p.t0 < 700 && e.type === 'pointerup') {
      const i = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 26 : 16);
      if (i != null) { if (e.shiftKey || S.inspectOnce) { select(i); S.inspectOnce = false; $('bPick').classList.remove('on'); } else { stopDemo(); stimulate(i); } }
    } else if (gesture.kind === 'rotate') cam.release();
    if (ptrs.size === 0) gesture = null; else if (gesture.kind === 'pinch') gesture = { kind: 'none' };
  }
  const cv = R.canvas;
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove); cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
  cv.addEventListener('wheel', e => { e.preventDefault(); const k = e.ctrlKey ? 0.012 : 0.0016; cam.zoom(Math.exp(e.deltaY * k)); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  { let gs = 1; cv.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; }); cv.addEventListener('gesturechange', e => { e.preventDefault(); cam.zoom(gs / e.scale); gs = e.scale; }); }
  // ---------------------------------------------------------------- controls
  const speedFromS = s => Math.pow(10, s * 2), sFromSpeed = v => Math.log10(v) / 2;
  function syncUI() {
    const p = net.p;
    $('sStim').value = p.stim; $('oStim').textContent = `${Math.round(NET.stimAmp * p.stim)} µA/cm² · 1 ms`;
    $('sE').value = p.wE; $('oE').textContent = `${Math.round(p.wE * 100)}%`;
    $('sI').value = p.wI; $('oI').textContent = `${Math.round(p.wI * 100)}%`;
    $('sN').value = p.noise; $('oN').textContent = `${Math.round(p.noise * 100)}%`;
    $('sSp').value = sFromSpeed(S.speed); $('oSp').textContent = `${S.speed < 10 ? S.speed.toFixed(1) : Math.round(S.speed)} ms/s · ${Math.round(1000 / S.speed)}× slow motion`;
    const r = p.wI / Math.max(0.01, p.wE), m = Math.max(0, Math.min(1, (Math.log2(Math.max(0.01, r)) + 2) / 4));
    $('balMark').style.left = (m * 100) + '%';
    const txt = r < 0.35 ? 'RUNAWAY / seizure' : r < 0.7 ? 'hyperexcitable' : r <= 1.45 ? 'balanced' : r <= 2.4 ? 'inhibition-dominated' : 'spread blocked';
    $('balTxt').textContent = txt; $('balTxt').style.color = r < 0.35 ? '#ff6a5a' : r < 0.7 ? '#ffb85a' : r <= 1.45 ? '#7ff0a8' : '#8fa8ff';
    $('bPlay2').textContent = S.paused ? '▶ Play' : '❚❚ Pause'; $('bPlay').textContent = S.paused ? '▶' : '❚❚';
    for (const [id, m2] of [['mTap', 'tap'], ['mTrain', 'train'], ['mThal', 'thal']]) { $(id).classList.toggle('on', S.mode === m2); $(id).setAttribute('aria-checked', S.mode === m2); }
    $('bDemo').textContent = S.demo ? '■ Stop demo' : '★ Demo'; $('bDemo2').textContent = S.demo ? '■ Stop' : '★ Demo';
    $('hint').textContent = (isTouch ? 'Tap the cortex to stimulate · drag to rotate · pinch to zoom' : 'Click the cortex to stimulate · drag to rotate · scroll to zoom') + (S.mode === 'train' ? ' · hold for a 50 Hz train' : S.mode === 'thal' ? ' · thalamic volley into layer IV' : '');
    $('bView').textContent = S.view === 'trace' ? 'Layers' : 'Trace'; $('bView').classList.toggle('on', S.view === 'column');
  }
  const setP = (k, v) => { net.p[k] = v; syncUI(); };
  const setSpeed = v => { S.speed = Math.max(1, Math.min(100, v)); syncUI(); };
  const togglePause = v => { S.paused = v === undefined ? !S.paused : v; syncUI(); };
  function resetSim() { net.reset(); raster.clear(); raster.lastBin = undefined; R.clearPulses(); S.wave = 0; S.waveT0 = -1; S.quiet = true; S.lastQuietMsg = ''; column.lastSpk = null; if (net.sel != null) select(net.sel); }
  function defaults() { Object.assign(net.p, DEFAULTS); S.speed = 12; syncUI(); }
  function setCut(on) { $('cCut').checked = on; R.clip.value = on ? (net.sel != null ? net.pos[net.sel * 3 + 2] + 0.01 : 0.2) : 99; if (on) cam.goTo(0.35, 1.25, 0.85); }
  function setView(v) { S.view = v; syncUI(); }
  const on = (id, ev, f) => $(id).addEventListener(ev, f);
  on('sStim', 'input', e => setP('stim', +e.target.value)); on('sE', 'input', e => setP('wE', +e.target.value));
  on('sI', 'input', e => setP('wI', +e.target.value)); on('sN', 'input', e => setP('noise', +e.target.value));
  on('sSp', 'input', e => setSpeed(speedFromS(+e.target.value)));
  for (const id of ['bPlay', 'bPlay2']) on(id, 'click', () => togglePause());
  on('bStep', 'click', () => { togglePause(true); runBlocks(Math.round(0.5 / BLOCK_MS)); });
  on('bReset', 'click', () => { stopDemo(); resetSim(); });
  on('bDefaults', 'click', () => { stopDemo(); defaults(); });
  for (const id of ['bDemo', 'bDemo2']) on(id, 'click', () => (S.demo ? stopDemo() : runDemo()));
  for (const id of ['bInfo', 'bInfo2']) on(id, 'click', () => showInfo(true));
  on('bInfoX', 'click', () => showInfo(false)); on('info', 'click', e => { if (e.target.id === 'info') showInfo(false); });
  on('bCtl', 'click', () => document.body.classList.toggle('ctl')); on('bClose', 'click', () => document.body.classList.remove('ctl'));
  on('mTap', 'click', () => { S.mode = 'tap'; syncUI(); }); on('mTrain', 'click', () => { S.mode = 'train'; syncUI(); }); on('mThal', 'click', () => { S.mode = 'thal'; syncUI(); });
  on('cRot', 'change', e => { cam.auto = e.target.checked; });
  on('cTh', 'change', e => { scope.showTh = e.target.checked; });
  on('cCut', 'change', e => setCut(e.target.checked));
  on('cLobe', 'change', e => { R.lobeMix.value = e.target.checked ? 1 : 0; });
  on('bView', 'click', () => setView(S.view === 'trace' ? 'column' : 'trace'));
  const wins = [20, 60, 200]; on('bWin', 'click', () => { scope.win = wins[(wins.indexOf(scope.win) + 1) % wins.length]; $('bWin').textContent = scope.win + ' ms'; });
  on('bNext', 'click', () => { if (net.sel == null) return; const c = net.colSamp; select(c[1 + Math.floor(Math.random() * Math.min(60, c.length - 1))]); });
  on('bPick', 'click', () => { S.inspectOnce = !S.inspectOnce; $('bPick').classList.toggle('on', S.inspectOnce); });
  on('bMin', 'click', () => { $('insp').classList.toggle('min'); $('bMin').textContent = $('insp').classList.contains('min') ? '+' : '–'; });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    if (e.target.tagName === 'SELECT') return;
    const k = e.key;
    if (k === 'p' || k === 'P') togglePause();   // SPACE stimulates (js/padkeys.js)
    else if (k === '.') { togglePause(true); runBlocks(Math.round(0.5 / BLOCK_MS)); }
    else if (k === 'r' || k === 'R') { stopDemo(); resetSim(); }
    else if (k === 'd' || k === 'D') S.demo ? stopDemo() : runDemo();
    else if (k === 'e' || k === 'E') { S.mode = S.mode === 'tap' ? 'train' : S.mode === 'train' ? 'thal' : 'tap'; syncUI(); }
    else if (k === 'a' || k === 'A') { cam.auto = !cam.auto; $('cRot').checked = cam.auto; }
    else if (k === 't' || k === 'T') { scope.showTh = !scope.showTh; $('cTh').checked = scope.showTh; }
    else if (k === 'l' || k === 'L') setView(S.view === 'trace' ? 'column' : 'trace');
    else if (k === 'c' || k === 'C') setCut(!$('cCut').checked);
    else if (k === '[') setSpeed(S.speed / 1.4); else if (k === ']') setSpeed(S.speed * 1.4);
    else if (k === 'i' || k === 'I') showInfo($('info').hidden);
    else if (k === 'h' || k === 'H') { S.hidden = !S.hidden; document.body.classList.toggle('hideui', S.hidden); }
    else if (k === 'Escape') { showInfo(false); document.body.classList.remove('ctl'); }
  });
  addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120));
  document.addEventListener('gesturestart', e => e.preventDefault());
  function showInfo(v) { $('info').hidden = !v; }
  // ---------------------------------------------------------------- caption + demo
  let capTimer = 0;
  function caption(html, secs) { const c = $('caption'); c.innerHTML = html; c.classList.add('show'); clearTimeout(capTimer); if (secs) capTimer = setTimeout(() => c.classList.remove('show'), secs * 1000); }
  const hideCaption = () => $('caption').classList.remove('show');
  class Cancel extends Error {}
  function stopDemo() { if (!S.demo) return; S.demo.cancel = true; S.demo = null; hideCaption(); syncUI(); }
  function demoSite(x, y, z, cls = 0) { let best = 0, bd = 1e9; const P = net.pos; for (let i = 0; i < N; i++) { if (net.cls[i] !== cls) continue; const d = (P[i * 3] - x) ** 2 + (P[i * 3 + 1] - y) ** 2 + (P[i * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
  async function runDemo() {
    const D = S.demo = { cancel: false }; syncUI(); togglePause(false);
    const chk = () => { if (D.cancel) throw new Cancel(); };
    const real = s => new Promise((res, rej) => { const t = performance.now(); const f = () => { if (D.cancel) return rej(new Cancel()); if (performance.now() - t >= s * 1000) res(); else requestAnimationFrame(f); }; f(); });
    const sim = ms => new Promise((res, rej) => { const t = net.t + ms; const f = () => { if (D.cancel) return rej(new Cancel()); if (net.t >= t) res(); else requestAnimationFrame(f); }; f(); });
    const quiet = (maxS = 25) => new Promise((res, rej) => { const t = performance.now(); const f = () => { if (D.cancel) return rej(new Cancel()); if ((S.quiet && net.t - S.quietSince > 60) || performance.now() - t > maxS * 1000) res(); else requestAnimationFrame(f); }; setTimeout(f, 400); });
    const slide = (k, to, s = 1.2) => new Promise(res => { const from = net.p[k], t0 = performance.now(); const f = () => { const u = Math.min(1, (performance.now() - t0) / (s * 1000)); setP(k, from + (to - from) * (u * u * (3 - 2 * u))); if (u < 1 && !D.cancel) requestAnimationFrame(f); else res(); }; f(); });
    const nTxt = $('ncount').textContent;
    try {
      defaults(); resetSim(); cam.auto = false; $('cRot').checked = false; setCut(false);
      cam.goTo(-1.25, 1.18, 0.82); setSpeed(10); setView('trace');
      const site = demoSite(-1.05, 0.35, 0.45);
      caption(`<b>A layered cortex of ${nTxt} neurons.</b> They sit in a 2.5 mm grey-matter sheet in six layers (I–VI). Cyan/green/blue are pyramidal and stellate cells, magenta PV, orange SST and yellow VIP interneurons. All rest near <b>−70 mV</b>.`); await real(6);
      select(site); setView('column');
      caption('<b>The inspector now shows a slice</b> through the sheet under one L2/3 pyramidal cell: every simulated neuron in the patch at its true depth, layers I–VI labelled.'); await real(5);
      caption('<b>⚡ Stimulus:</b> a 1 ms electrode pulse fires a small patch. Each cell receives ~2,000 synapses, so many small EPSPs (≈0.2–1 mV each) summate…'); stimulate(site); await real(4); chk();
      caption('…the wave spreads <b>within the column</b> (L2/3 → L5 → L6) and <b>laterally</b> through L2/3 horizontal axons. PV basket cells fire fast and clamp it with perisomatic IPSPs.'); await real(5);
      caption('Refractoriness, PV and SST inhibition and spike-frequency adaptation make the wave <b>die out</b>.'); await quiet(30);
      caption(`<b>Back to baseline.</b> ${S.wave.toLocaleString()} neurons fired and the cortex is quiet again.`); await real(4);
      // thalamic input
      const s2 = demoSite(-1.0, 0.1, -0.15, 1); select(s2); cam.goTo(-1.45, 1.35, 0.8);
      caption('<b>Thalamic input:</b> a sensory volley arrives in <b>layer IV</b> (spiny stellate cells) of one patch. Watch the slice: IV fires first, then II/III above it, then V and VI below, then the activity spreads sideways.'); await real(2.5);
      stimulate(s2, { kind: 1, color: 0x7fffb0 }); await real(6); await quiet(25); chk();
      // single-cell refractoriness
      setView('trace');
      const beat = async (html, secs) => { togglePause(true); caption(html); await real(secs); togglePause(false); };
      setSpeed(2.5); scope.win = 60; $('bWin').textContent = '60 ms';
      const cell = demoSite(-1.0, 0.0, -0.45, 0); select(cell); await sim(40);
      await beat('<b>Refractoriness, in one cell.</b> Watch its membrane potential in the inspector. First, a small 1 ms current pulse (⚡) fires an action potential.', 4.5);
      inject(cell, 26, 1); await sim(1.6);
      await beat('<b>Absolute refractory period</b> (red band): a second pulse now, 8× stronger, does nothing at all. The Na⁺ channels are inactivated.', 4.5);
      inject(cell, 220, 0.3); await sim(6.5);
      await beat('<b>Relative refractory period</b> (amber band): 8 ms after the spike the threshold (orange line) is still raised and the AHP holds V down. The original pulse now fails…', 5);
      inject(cell, 26, 1); await sim(3);
      await beat('…but a <b>3× stronger</b> pulse overcomes the raised threshold, and the cell fires.', 3.5);
      inject(cell, 78, 1); await sim(25);
      caption('Over the next tens of milliseconds the threshold and membrane potential relax back to baseline…'); await sim(60);
      await beat('…and the original small pulse fires it again. The cell has fully recovered.', 2);
      inject(cell, 26, 1); await sim(25); await real(1.5);
      // E/I balance
      setSpeed(12); select(site); cam.goTo(-0.9, 1.0, 0.95);
      caption('Now turn <b>inhibition down to 25%</b> and give the same pulse…'); await slide('wI', 0.25); stimulate(site); await real(2);
      caption('<b>Runaway excitation:</b> without enough GABA-A inhibition, the activity sweeps both hemispheres again and again. This is a seizure-like storm.'); await real(7);
      caption('<b>Restore inhibition</b> → the storm is quenched and the network settles back to rest.'); await slide('wI', 1, 1.0); await quiet(20); await real(1.5);
      caption('<b>Inhibition 300%:</b> the same pulse barely spreads. The wave is choked off near the electrode.'); await slide('wI', 3); await real(0.5); net.resetWave(); S.quiet = true; stimulate(site); await quiet(15); await real(2);
      caption(`Only ${S.wave.toLocaleString()} neurons fired. Balance (the green zone) lets a signal travel without running away.`); await slide('wI', 1); await real(4);
      defaults(); cam.auto = true; $('cRot').checked = true;
      caption(`<b>Your turn:</b> ${isTouch ? 'tap' : 'click'} the cortex, try <b>Thalamic → L4</b>, the <b>Layers</b> view and the <b>Cutaway</b>.`, 7);
    } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
    if (S.demo === D) { S.demo = null; defaults(); }
    syncUI();
  }
  // ---------------------------------------------------------------- loop
  let lastT = performance.now(), fpsAvg = 60, lowFrames = 0, frame = 0, slowFrames = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now; frame++;
    if (!S.paused) advance(S.speed * dt);
    updateQuiet();
    cam.update(dt, ptrs.size > 0);
    R.bindGpu(net, S.speed);
    R.render(viewOffset(), net.t, now / 1000, dt);
    column.flashMs = Math.max(1.5, S.speed * 0.3);
    if (S.view === 'column' && net.sel != null) column.draw(net, net.t); else scope.draw(net);
    if (frame % 2 === 0 || dt > 0.025) raster.draw(net.t);
    if (frame % 4 === 0) {
      $('sT').textContent = `t = ${net.t.toFixed(1)} ms`;
      let rec = 0; for (let b = 0; b < 5; b++) rec += raster.rateBins[(Math.floor(net.t) - b + 4000) % 4000];
      $('sF').textContent = `firing ${(rec / N * 100).toFixed(2)}%/5 ms`;
      $('sR').textContent = S.waveT0 >= 0 ? `wave ${S.wave.toLocaleString()} cells${S.quiet && S.lastQuietMsg ? ' · ' + S.lastQuietMsg : ''}` : 'quiet';
      $('sS').textContent = S.paused ? 'PAUSED' : S.gpuLimited ? 'GPU-limited' : '';
      if (net.rec) { const [t, c, bg] = PHASE[net.phase(net.rec.i)]; const el = $('iPhase'); el.textContent = t; el.style.color = c; el.style.background = bg; }
    }
    fpsAvg = fpsAvg * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    if (frame > 90) { if (fpsAvg < 38) lowFrames++; else lowFrames = 0; if (lowFrames > 90 && R.pr > 1.25) { R.setPixelRatio(Math.max(1.25, R.pr - 0.5)); lowFrames = 0; } }
    // auto tier: if this tier was chosen automatically and the GPU cannot keep up, step down once per session
    if (S.why === 'auto' && frame > 120 && frame < 600) { if (msPerBlock > 9 || fpsAvg < 20) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames > 150) { const k = TIERS.findIndex(t => t.id === tier.id); if (k > 0) { sessionStorage.setItem('ns-tier', TIERS[k - 1].id); location.reload(); } S.why = 'kept'; } }
  }
  R.canvas.style.display = '';
  layout(); syncUI(); setTimeout(layout, 300);
  if (Q.has('thumb')) { document.body.classList.add('hideui', 'thumb'); S.hidden = true; }
  // warm-up: 100 ms so the resting state settles
  runBlocks(Math.round(100 / BLOCK_MS));
  raster.clear(); raster.lastBin = undefined; S.quiet = true; S.waveT0 = -1; net.resetWave();
  const pad = installPadKeys({ pick, select, stimulate: i => stimulate(i), special: i => stimulate(i, { kind: 1, color: 0x7fffb0 }), stopDemo,
    isTrain: () => S.mode === 'train', hold: i => { S.hold = i == null ? null : { i, next: net.t }; }, togglePause, reset: () => { stopDemo(); resetSim(); },
    demo: () => (S.demo ? stopDemo() : runDemo()), speed: f => setSpeed(S.speed * f), rotate: (dx, dy) => cam.rotate(dx, dy), zoom: f => cam.zoom(f), release: () => cam.release(),
    center: () => { const o = viewOffset(); return { x: innerWidth / 2 - o.x, y: innerHeight / 2 - o.y }; }, caption });
  window.NS = { pad, net, S, R, cam, stimulate, select, pick, resetSim, defaults, setP, setSpeed, runDemo, stopDemo, advance, runBlocks, raster, togglePause, inject, setCut, setView, ready: true, renderer: 'dense', N, tier: tier.id, msPerBlock: () => msPerBlock, column };
  requestAnimationFrame(t => { lastT = t; loop(t); });
  if (!Q.has('thumb')) caption(`${isTouch ? 'Tap' : 'Click'} the cortex to stimulate it, or press <b>★ Demo</b> for a guided tour.`, 7);
  void K;
}
