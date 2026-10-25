/* NEURO STORM: main loop, input, UI, demo */
import { Net, DT, PHYS, NET, DEFAULTS, relEnd } from './sim.js';
import { OrbitCam } from './cam.js';
import { Render2D } from './render2d.js';
import { Scope, Raster } from './scope.js';

const Q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const small = Math.min(screen.width, screen.height) < 600 || Math.min(innerWidth, innerHeight) < 500;
const N = Math.max(400, Math.min(6000, +Q.get('n') || (small || (isTouch && Math.min(screen.width, screen.height) < 900) ? 2400 : 4000)));
const net = new Net(N, +Q.get('seed') || 7);
$('ncount').textContent = N.toLocaleString();
const cam = new OrbitCam();
let R = null;
const canvas = $('gl');

async function makeRenderer() {
  if (Q.get('gl') !== '0') {
    try { const { Render3D } = await import('./render3d.js'); return new Render3D(canvas, net, cam); }
    catch (e) { console.warn('WebGL unavailable, using Canvas2D fallback:', e && e.message); }
  }
  const c2 = canvas.cloneNode(); canvas.replaceWith(c2); return new Render2D(c2, net, cam);
}

// ------------------------------------------------------------------ state
const S = { paused: false, speed: 12, mode: 'tap', inspectOnce: false, demo: null, waveMark: new Uint8Array(N), wave: 0, waveT0: -1, quietSince: 0, lastQuietMsg: '', hold: null, cpuLimited: false, hidden: false };
const flash = new Float32Array(N), since = new Float32Array(N);
const proj = new Float32Array(N * 3);
const scope = new Scope($('scope'));
const raster = new Raster($('raster'), net);

// ------------------------------------------------------------------ layout
function layout() {
  const w = innerWidth, h = innerHeight, mob = w < 820 || (isTouch && Math.min(w, h) < 620);
  document.body.classList.toggle('mobile', mob);
  document.body.classList.toggle('portrait', mob && h >= w);
  document.body.classList.toggle('landscape', mob && w > h);
  if (R) R.resize(w, h);
  const b = document.body.classList;
  if (b.contains('portrait')) { const free = h - 70 - $('rast').offsetHeight - $('insp').offsetHeight - 30; cam.setFit(w / h, Math.max(0.35, free / h)); }
  else if (b.contains('landscape')) cam.setFit(w / h, Math.max(0.4, (h - $('rast').offsetHeight - 70) / h));
  else { const fw = w - $('panel').offsetWidth - 40, fh = h - $('rast').offsetHeight - 40; cam.setFit(fw / h, Math.min(1, fh / h)); }
}
function viewOffset() {
  const w = innerWidth, h = innerHeight, b = document.body.classList;
  if (S.hidden) return { x: 0, y: 0 };
  if (b.contains('portrait')) { const bot = $('rast').offsetHeight + $('insp').offsetHeight + 24, top = 80; return { x: 0, y: Math.round((bot - top) / 2) }; }
  if (b.contains('landscape')) return { x: 0, y: Math.round(($('rast').offsetHeight + 8) / 2) };
  const pw = $('panel').offsetWidth + 14; return { x: Math.round(pw / 2), y: Math.round(($('rast').offsetHeight + 8) * 0.5) };
}

// ------------------------------------------------------------------ sim helpers
function stimulate(i, opts = {}) {
  if (i == null) return;
  if (S.quiet) { S.waveMark.fill(0); S.wave = 0; S.waveT0 = net.t; S.quiet = false; S.lastQuietMsg = ''; }
  S.quietSince = net.t;
  net.stimulate(i, opts.scale || 1);
  if (net.rec) net.rec.stims.push(net.t);
  R.ripple(i, opts.color);
  if (opts.select !== false) select(i);
}
function select(i) {
  if (net.sel !== i || !net.rec) { net.select(i); R.setSelected(i); }
  const t = net.type[i] ? 'Interneuron' : 'Pyramidal';
  $('iName').textContent = innerWidth < 520 ? `${net.type[i] ? 'I' : 'E'}-cell #${i}` : `${t} #${i} · ${net.hemi[i] < 0 ? 'L' : 'R'}`; $('iName').title = `${t} #${i}, ${net.hemi[i] < 0 ? 'left' : 'right'} hemisphere`;
  $('iName').style.color = net.type[i] ? '#ff8fe4' : '#8fe6ff';
}
function inject(i, amp, ms) { net.Iext[i] += amp; net.pulses.push({ idx: [i], amps: [amp], end: net.step_ + Math.round(ms / DT) }); if (net.rec) net.rec.stims.push(net.t); }
const PHASE = { spike: ['ACTION POTENTIAL', '#ffffff', 'rgba(255,255,255,0.18)'], abs: ['ABSOLUTE REFRACTORY', '#ff8a8a', 'rgba(255,60,60,0.18)'], rel: ['RELATIVE REFRACTORY', '#ffc070', 'rgba(255,160,60,0.16)'],
  hyper: ['HYPERPOLARISED (IPSP / AHP)', '#a9a2ff', 'rgba(90,90,255,0.18)'], depol: ['DEPOLARISED (EPSP)', '#8fe6ff', 'rgba(60,200,255,0.16)'], rest: ['AT REST', '#8fa3c4', 'rgba(255,255,255,0.07)'] };

let lastSteps = 0;
function advance(simMs) {
  const t0 = performance.now(); let steps = Math.round(simMs / DT + (S.carry || 0)); S.carry = simMs / DT + (S.carry || 0) - steps;
  let done = 0;
  for (; done < steps; done++) {
    if (S.hold && net.t >= S.hold.next) { stimulate(S.hold.i, { select: false }); S.hold.next += 20; }
    if (S.demo && S.demo.onStep) S.demo.onStep();
    net.step();
    if ((done & 31) === 31 && performance.now() - t0 > 14) { done++; break; }
  }
  S.cpuLimited = done < steps - 1; if (S.cpuLimited) S.carry = 0;
  lastSteps = done;
  return done;
}
function harvest(dtReal) {
  const L = net.spikeLog, n = L.length / 2, dpos = net.pos;
  raster.tick(net.t);
  const kp = Math.exp(-dtReal / 0.30); for (let i = 0; i < N; i++) flash[i] *= kp;
  const budget = n > 360 ? 360 / n : 1;
  for (let k = 0; k < L.length; k += 2) {
    const t = L[k], i = L[k + 1];
    flash[i] = 1; raster.push(t, i);
    if (!S.waveMark[i]) { S.waveMark[i] = 1; S.wave++; }
    if (R.kind === '3d' && Math.random() < budget) {
      const dr = R.drawn[i]; for (const s of dr) R.addPulse(i, net.oPost[s], t, t + net.oD[s] * DT, net.type[i]);
    }
  }
  L.length = 0;
  const step = net.step_;
  for (let i = 0; i < N; i++) { const s = (step - net.last[i]) * DT; since[i] = s < 60 ? s : -1; }
  // prune inspector history
  const rec = net.rec; if (rec) { const cut = net.t - 420; while (rec.ev.length && rec.ev[0] < cut) rec.ev.splice(0, 2); while (rec.spikes.length && rec.spikes[0] < cut - 40) rec.spikes.shift(); while (rec.stims.length && rec.stims[0] < cut) rec.stims.shift(); }
  // quiet / wave tracking
  let recent = 0; for (let b = 0; b < 10; b++) recent += raster.rateBins[(Math.floor(net.t) - b + 4000) % 4000];
  const thr = Math.max(4, N * 0.003);
  if (recent > thr) { S.quietSince = net.t; if (S.waveT0 < 0) { S.waveT0 = net.t; } S.quiet = false; }
  else if (!S.quiet && net.t - S.quietSince > 40 && S.waveT0 >= 0) { S.quiet = true; S.lastQuietMsg = `back to baseline ${Math.max(0, S.quietSince - S.waveT0).toFixed(0)} ms after the pulse`; }
  if (S.quiet === undefined) S.quiet = true;
}

// ------------------------------------------------------------------ input
const ptrs = new Map(); let gesture = null;
function pick(x, y, rad) {
  R.project(proj); let best = -1, bd = 1e9; const r2 = rad * rad; let minW = 1e9;
  for (let i = 0; i < N; i++) { const dx = proj[i * 3] - x, dy = proj[i * 3 + 1] - y, d = dx * dx + dy * dy; if (d < r2 && proj[i * 3 + 2] > 0) minW = Math.min(minW, proj[i * 3 + 2]); }
  for (let i = 0; i < N; i++) {
    const dx = proj[i * 3] - x, dy = proj[i * 3 + 1] - y, d = dx * dx + dy * dy, w = proj[i * 3 + 2];
    if (d > r2 || w <= 0) continue;
    const score = d / r2 + (w - minW) * 1.6;          // prefer the near (front) surface
    if (score < bd) { bd = score; best = i; }
  }
  return best < 0 ? null : best;
}
function onDown(e) {
  const c = e.currentTarget; c.setPointerCapture && c.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
  if (ptrs.size === 1) {
    gesture = { kind: 'maybe', moved: 0 };
    if (S.mode === 'train' && !e.shiftKey && !S.inspectOnce) {
      const i = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 26 : 16);
      if (i != null) { gesture.kind = 'train'; stopDemo(); select(i); S.hold = { i, next: net.t }; }
    }
  } else if (ptrs.size === 2) {
    S.hold = null; const [a, b] = [...ptrs.values()]; gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) };
  }
}
function onMove(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.kind === 'pinch' && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (gesture.d > 0) cam.zoom(gesture.d / d); gesture.d = d; return; }
  if (gesture.kind === 'train') return;
  gesture.moved += Math.abs(dx) + Math.abs(dy);
  if (gesture.kind === 'maybe' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > (e.pointerType === 'touch' ? 9 : 5)) gesture.kind = 'rotate';
  if (gesture.kind === 'rotate') cam.rotate(dx, dy);
}
function onUp(e) {
  const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.kind === 'train') { S.hold = null; }
  else if (gesture.kind === 'maybe' && p && performance.now() - p.t0 < 700 && e.type === 'pointerup') {
    const i = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 26 : 16);
    if (i != null) {
      if (e.shiftKey || S.inspectOnce) { select(i); S.inspectOnce = false; $('bPick').classList.remove('on'); }
      else { stopDemo(); stimulate(i); }
    }
  } else if (gesture.kind === 'rotate') cam.release();
  if (ptrs.size === 0) gesture = null; else if (gesture.kind === 'pinch') gesture = { kind: 'none' };
}
function bindCanvas(c) {
  c.addEventListener('pointerdown', onDown); c.addEventListener('pointermove', onMove);
  c.addEventListener('pointerup', onUp); c.addEventListener('pointercancel', onUp);
  c.addEventListener('wheel', e => { e.preventDefault(); const k = e.ctrlKey ? 0.012 : 0.0016; cam.zoom(Math.exp(e.deltaY * k)); }, { passive: false });
  c.addEventListener('contextmenu', e => e.preventDefault());
  // Safari trackpad pinch
  let gs = 1; c.addEventListener('gesturestart', e => { e.preventDefault(); gs = 1; }); c.addEventListener('gesturechange', e => { e.preventDefault(); cam.zoom(gs / e.scale); gs = e.scale; });
}

// ------------------------------------------------------------------ controls
const speedFromS = s => Math.pow(10, s * 2);           // 1 .. 100 ms of simulated time per real second
const sFromSpeed = v => Math.log10(v) / 2;
function syncUI() {
  const p = net.p;
  $('sStim').value = p.stim; $('oStim').textContent = `${Math.round(NET.stimAmp * p.stim)} µA/cm² · 1 ms`;
  $('sE').value = p.wE; $('oE').textContent = `${Math.round(p.wE * 100)}%`;
  $('sI').value = p.wI; $('oI').textContent = `${Math.round(p.wI * 100)}%`;
  $('sN').value = p.noise; $('oN').textContent = `${Math.round(p.noise * 100)}%`;
  $('sSp').value = sFromSpeed(S.speed); $('oSp').textContent = `${S.speed < 10 ? S.speed.toFixed(1) : Math.round(S.speed)} ms/s · ${Math.round(1000 / S.speed)}× slow motion`;
  const r = p.wI / Math.max(0.01, p.wE); // effective E/I
  const m = Math.max(0, Math.min(1, (Math.log2(Math.max(0.01, r)) + 2) / 4));
  $('balMark').style.left = (m * 100) + '%';
  const txt = r < 0.35 ? 'RUNAWAY / seizure' : r < 0.7 ? 'hyperexcitable' : r <= 1.45 ? 'balanced' : r <= 2.4 ? 'inhibition-dominated' : 'spread blocked';
  $('balTxt').textContent = txt; $('balTxt').style.color = r < 0.35 ? '#ff6a5a' : r < 0.7 ? '#ffb85a' : r <= 1.45 ? '#7ff0a8' : '#8fa8ff';
  const pl = S.paused ? '▶ Play' : '❚❚ Pause'; $('bPlay2').textContent = pl; $('bPlay').textContent = S.paused ? '▶' : '❚❚';
  $('mTap').classList.toggle('on', S.mode === 'tap'); $('mTrain').classList.toggle('on', S.mode === 'train');
  $('mTap').setAttribute('aria-checked', S.mode === 'tap'); $('mTrain').setAttribute('aria-checked', S.mode === 'train');
  $('bDemo').textContent = S.demo ? '■ Stop demo' : '★ Demo'; $('bDemo2').textContent = S.demo ? '■ Stop' : '★ Demo';
  $('hint').textContent = (isTouch ? 'Tap a neuron to stimulate it · drag to rotate · pinch to zoom' : 'Click a neuron to stimulate it · drag to rotate · scroll to zoom') + (S.mode === 'train' ? ' · hold for a 50 Hz train' : '');
}
function setP(k, v) { net.p[k] = v; syncUI(); }
function setSpeed(v) { S.speed = Math.max(1, Math.min(100, v)); syncUI(); }
function togglePause(v) { S.paused = v === undefined ? !S.paused : v; syncUI(); }
function resetSim() { net.reset(); raster.clear(); raster.lastBin = undefined; R.clearPulses(); flash.fill(0); S.waveMark.fill(0); S.wave = 0; S.waveT0 = -1; S.quiet = true; S.lastQuietMsg = ''; if (net.sel != null) select(net.sel); }
function defaults() { Object.assign(net.p, DEFAULTS); S.speed = 12; syncUI(); }
function bindUI() {
  const on = (id, ev, f) => $(id).addEventListener(ev, f);
  on('sStim', 'input', e => setP('stim', +e.target.value)); on('sE', 'input', e => setP('wE', +e.target.value));
  on('sI', 'input', e => setP('wI', +e.target.value)); on('sN', 'input', e => setP('noise', +e.target.value));
  on('sSp', 'input', e => setSpeed(speedFromS(+e.target.value)));
  for (const id of ['bPlay', 'bPlay2']) on(id, 'click', () => togglePause());
  on('bStep', 'click', () => { togglePause(true); advance(0.5); harvest(0.05); });
  on('bReset', 'click', () => { stopDemo(); resetSim(); });
  on('bDefaults', 'click', () => { stopDemo(); defaults(); });
  for (const id of ['bDemo', 'bDemo2']) on(id, 'click', () => (S.demo ? stopDemo() : runDemo()));
  for (const id of ['bInfo', 'bInfo2']) on(id, 'click', () => showInfo(true));
  on('bInfoX', 'click', () => showInfo(false)); on('info', 'click', e => { if (e.target.id === 'info') showInfo(false); });
  on('bCtl', 'click', () => document.body.classList.toggle('ctl')); on('bClose', 'click', () => document.body.classList.remove('ctl'));
  on('mTap', 'click', () => { S.mode = 'tap'; syncUI(); }); on('mTrain', 'click', () => { S.mode = 'train'; syncUI(); });
  on('cRot', 'change', e => { cam.auto = e.target.checked; });
  on('cTh', 'change', e => { scope.showTh = e.target.checked; });
  on('cAx', 'change', e => { if (R.lines) R.lines.visible = e.target.checked; if (R.pulsePts) R.pulsePts.visible = e.target.checked; });
  const wins = [20, 60, 200]; on('bWin', 'click', () => { scope.win = wins[(wins.indexOf(scope.win) + 1) % wins.length]; $('bWin').textContent = scope.win + ' ms'; });
  on('bNext', 'click', () => { const i = net.sel; if (i == null) return; const a = net.oStart[i], b = net.oStart[i + 1]; if (b <= a) return; const cand = []; for (let k = a; k < b; k++) if (net.hemi[net.oPost[k]] === net.hemi[i]) cand.push(net.oPost[k]); if (cand.length) select(cand[Math.floor(Math.random() * cand.length)]); });
  on('bPick', 'click', () => { S.inspectOnce = !S.inspectOnce; $('bPick').classList.toggle('on', S.inspectOnce); });
  on('bMin', 'click', () => { $('insp').classList.toggle('min'); $('bMin').textContent = $('insp').classList.contains('min') ? '+' : '–'; });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePause(); }
    else if (k === '.' || k === 'ArrowRight' && e.target.type !== 'range') { togglePause(true); advance(0.5); harvest(0.05); }
    else if (k === 'r' || k === 'R') { stopDemo(); resetSim(); }
    else if (k === 'd' || k === 'D') S.demo ? stopDemo() : runDemo();
    else if (k === 'e' || k === 'E') { S.mode = S.mode === 'tap' ? 'train' : 'tap'; syncUI(); }
    else if (k === 'a' || k === 'A') { cam.auto = !cam.auto; $('cRot').checked = cam.auto; }
    else if (k === 't' || k === 'T') { scope.showTh = !scope.showTh; $('cTh').checked = scope.showTh; }
    else if (k === '[') setSpeed(S.speed / 1.4); else if (k === ']') setSpeed(S.speed * 1.4);
    else if (k === 'i' || k === 'I') showInfo($('info').hidden);
    else if (k === 'h' || k === 'H') { S.hidden = !S.hidden; document.body.classList.toggle('hideui', S.hidden); }
    else if (k === 'Escape') { showInfo(false); document.body.classList.remove('ctl'); }
  });
  addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120));
  // block page zoom gestures on iOS outside the canvas
  document.addEventListener('gesturestart', e => e.preventDefault());
}
function showInfo(v) { $('info').hidden = !v; }

// ------------------------------------------------------------------ caption + demo
let capTimer = 0;
function caption(html, secs) { const c = $('caption'); c.innerHTML = html; c.classList.add('show'); clearTimeout(capTimer); if (secs) capTimer = setTimeout(() => c.classList.remove('show'), secs * 1000); }
function hideCaption() { $('caption').classList.remove('show'); }
class Cancel extends Error {}
function stopDemo() { if (!S.demo) return; S.demo.cancel = true; S.demo = null; hideCaption(); syncUI(); }
function demoSite(x, y, z) { let best = 0, bd = 1e9; for (let i = 0; i < N; i++) { if (net.type[i]) continue; const d = (net.pos[i * 3] - x) ** 2 + (net.pos[i * 3 + 1] - y) ** 2 + (net.pos[i * 3 + 2] - z) ** 2 + (1 - net.depth[i]) * 0.02; if (d < bd) { bd = d; best = i; } } return best; }
async function runDemo() {
  const D = S.demo = { cancel: false }; syncUI(); togglePause(false);
  const chk = () => { if (D.cancel) throw new Cancel(); };
  const real = s => new Promise((res, rej) => { const t = performance.now(); const f = () => { if (D.cancel) return rej(new Cancel()); if (performance.now() - t >= s * 1000) res(); else requestAnimationFrame(f); }; f(); });
  const sim = ms => new Promise((res, rej) => { const t = net.t + ms; const f = () => { if (D.cancel) return rej(new Cancel()); if (net.t >= t) res(); else requestAnimationFrame(f); }; f(); });
  const quiet = (maxS = 25) => new Promise((res, rej) => { const t = performance.now(); const f = () => { if (D.cancel) return rej(new Cancel()); if ((S.quiet && net.t - S.quietSince > 60) || performance.now() - t > maxS * 1000) res(); else requestAnimationFrame(f); }; setTimeout(f, 400); });
  const slide = (k, to, s = 1.2) => new Promise(res => { const from = net.p[k], t0 = performance.now(); const f = () => { const u = Math.min(1, (performance.now() - t0) / (s * 1000)); setP(k, from + (to - from) * (u * u * (3 - 2 * u))); if (u < 1 && !D.cancel) requestAnimationFrame(f); else res(); }; f(); });
  try {
    defaults(); resetSim(); cam.auto = false; $('cRot').checked = false;
    cam.goTo(-1.25, 1.18, 0.82); setSpeed(10);
    const site = demoSite(-1.05, 0.35, 0.45);
    caption('<b>Resting cortex.</b> Every neuron sits near <b>−70 mV</b>. The faint flicker is background synaptic noise: small EPSPs that stay below threshold.'); await real(4.5);
    select(site);
    caption('<b>⚡ Stimulus:</b> a 1 ms electrode pulse depolarises a small patch of pyramidal cells past <b>−55 mV</b>, and they fire action potentials.'); stimulate(site); await real(3.2); chk();
    caption('<b>Chain reaction:</b> each spike travels down the axons (light pulses). In the neighbours, <b>EPSPs</b> summate to threshold, they fire, and the wave spreads.'); await real(5);
    caption('Magenta <b>interneurons</b> fire too. Their <b>IPSPs</b>, plus every cell\'s <b>refractoriness</b> (the orange wake), make the wave shrink and <b>die out</b>.'); await quiet(30);
    caption(`<b>Back to baseline.</b> ${S.wave} neurons fired and the cortex is quiet again. That is a balanced network.`); await real(4);
    // --- single-cell refractoriness, in the inspector
    caption('<b>Refractoriness</b>, in one cell (watch the trace). First, a pulse just above threshold strength fires it.'); setSpeed(2.5); scope.win = 60; $('bWin').textContent = '60 ms';
    const cell = demoSite(-1.0, 0.0, -0.4); select(cell); await real(1.2);
    inject(cell, 22, 1); await sim(1.6);
    caption('<b>Absolute refractory period:</b> a pulse 1.6 ms later, even at 10× strength, does nothing, because the Na⁺ channels are inactivated.'); inject(cell, 220, 0.3); await sim(6.5);
    caption('<b>Relative refractory period:</b> 8 ms after the spike the threshold is still raised and the AHP holds V down, so the same pulse fails…'); inject(cell, 22, 1); await sim(4); await real(1.2);
    caption('…but a <b>3× stronger</b> pulse overcomes it and the cell fires.'); inject(cell, 66, 1); await sim(40); await real(0.5);
    caption('After ~40 ms the threshold and potential have relaxed back to baseline, and the original pulse fires it again.'); inject(cell, 22, 1); await sim(25); await real(1.5);
    // --- low inhibition
    setSpeed(12); select(site); cam.goTo(-0.9, 1.0, 0.95);
    caption('Now turn <b>inhibition down to 25%</b> and give the same pulse…'); await slide('wI', 0.25); stimulate(site); await real(2);
    caption('<b>Runaway excitation:</b> without enough GABA-A inhibition, the activity sweeps both hemispheres again and again. This is a seizure-like storm.'); await real(7);
    caption('<b>Restore inhibition</b> → the storm is quenched and the network settles back to rest.'); await slide('wI', 1, 1.0); await quiet(20); await real(1.5);
    // --- high inhibition
    caption('<b>Inhibition 300%:</b> the same pulse barely spreads. The wave is choked off near the electrode.'); await slide('wI', 3); await real(0.5); S.waveMark.fill(0); S.wave = 0; stimulate(site); await quiet(15); await real(2);
    caption(`Only ${S.wave} neurons fired. Balance (the green zone) lets a signal travel without running away.`); await slide('wI', 1); await real(4);
    defaults(); cam.auto = true; $('cRot').checked = true;
    caption(`<b>Your turn:</b> ${isTouch ? 'tap' : 'click'} any neuron, then try the sliders. Hold in <b>Electrode</b> mode for a 50 Hz train.`, 7);
  } catch (e) { if (!(e instanceof Cancel)) console.error(e); }
  if (S.demo === D) { S.demo = null; defaults(); }
  syncUI();
}

// ------------------------------------------------------------------ loop
let lastT = performance.now(), fpsAvg = 60, lowFrames = 0, frame = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now; frame++;
  if (!S.paused) advance(S.speed * dt);
  harvest(dt);
  cam.update(dt, ptrs.size > 0);
  R.updateState(net.V, flash, since);
  R.render(viewOffset(), net.t, now / 1000, dt);
  scope.draw(net);
  if (frame % 2 === 0 || dt > 0.025) raster.draw(net.t);
  // stats
  const firing = raster.rateBins[(Math.floor(net.t) + 4000) % 4000] + raster.rateBins[(Math.floor(net.t) - 1 + 4000) % 4000];
  if (frame % 4 === 0) {
    $('sT').textContent = `t = ${net.t.toFixed(1)} ms`;
    let rec = 0; for (let b = 0; b < 5; b++) rec += raster.rateBins[(Math.floor(net.t) - b + 4000) % 4000];
    $('sF').textContent = `firing ${(rec / N * 100).toFixed(1)}%/5 ms`;
    $('sR').textContent = S.waveT0 >= 0 ? `wave ${S.wave} cells${S.quiet && S.lastQuietMsg ? ' · ' + S.lastQuietMsg : ''}` : 'quiet';
    $('sS').textContent = S.paused ? 'PAUSED' : S.cpuLimited ? 'CPU-limited' : '';
    if (net.rec) { const [t, c, bg] = PHASE[net.phase(net.rec.i)]; const el = $('iPhase'); el.textContent = t; el.style.color = c; el.style.background = bg; }
  }
  // adaptive resolution on slow devices
  fpsAvg = fpsAvg * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
  if (R.kind === '3d' && frame > 90) { if (fpsAvg < 38) lowFrames++; else lowFrames = 0; if (lowFrames > 90 && R.pr > 1.25) { R.setPixelRatio(Math.max(1.25, R.pr - 0.5)); lowFrames = 0; } }
  void firing;
}

(async () => {
  try {
    R = await makeRenderer();
    bindCanvas(R.canvas || canvas); bindUI(); layout(); syncUI(); S.quiet = true; setTimeout(layout, 300);
    if (Q.has('thumb')) { document.body.classList.add('hideui'); S.hidden = true; }
    // warm up 200 ms so the resting state is settled
    for (let k = 0; k < 200 / DT; k++) net.step(); net.spikeLog.length = 0;
    window.NS = { net, S, R, cam, stimulate, select, pick, resetSim, defaults, setP, setSpeed, runDemo, stopDemo, advance, harvest, raster, togglePause, inject, ready: true, renderer: R.kind, N };
    requestAnimationFrame(t => { lastT = t; loop(t); });
    if (!Q.has('thumb')) caption(`${isTouch ? 'Tap' : 'Click'} any neuron to stimulate it, or press <b>★ Demo</b> for a guided tour.`, 7);
  } catch (e) {
    console.error(e); const f = $('fatal'); f.hidden = false; f.textContent = 'Neuro Storm could not start: ' + (e && e.message);
    window.NS = { fatal: String(e && e.message) };
  }
})();
