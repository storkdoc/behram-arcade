/* NEURO ARENA simulation core: runs duels headlessly (Turbo) or one live match in small time slices (Watch / Play).
   Used by worker.js inside a Web Worker, or directly on the main thread when workers are unavailable. */
import { Brain, mulberry32, L, N, AREA_DEF } from './brain.js';
import { Match } from './arena.js';
import { runDuel, benchmark } from './evo.js';
import { CONTEST, ChoiceMatch, makeBrain, choiceBenchmark } from './contests.js';

// choice brains can be larger than the 2,800-cell display: map every real cell onto the display cell of its area
// (a display cell lights if any of the real cells it stands for spiked)
const DISP = { TH_E: 'TH_E', TH_I: 'TH_I', S_E: 'S_E', S_I: 'S_I', A_E: 'A_E', A_I: 'A_I', M_I: 'M_I' };
function dispMap(b) {
  const m = new Int32Array(b.N), ar = new Uint8Array(b.N);
  for (const [k] of b.L.def) {
    const a = b.L[k]; let ds, dn;
    if (k === 'M_E') { ds = L.M_UP.s; dn = L.M_UP.n + L.M_DN.n; } else { ds = L[DISP[k]].s; dn = L[DISP[k]].n; }
    for (let i = a.s; i < a.e; i++) m[i] = ds + Math.floor((i - a.s) * dn / a.n);
  }
  return m;
}
const AIDX = Object.fromEntries(AREA_DEF.map(([k], i) => [k, i]));
function choiceAreas(b, prev) {   // per-display-area spike counts since the last frame
  const out = new Array(NA_).fill(0);
  b.L.def.forEach(([k], i) => { const v = b.areaSpk[i] - prev[i]; if (k === 'M_E') { out[AIDX.M_UP] += v / 2; out[AIDX.M_DN] += v / 2; } else out[AIDX[k]] += v; });
  prev.set(b.areaSpk); return out;
}

const NA_ = AREA_DEF.length;

export function makeHandler(postMessage) {
let live = null;
function startChoiceLive(m) {
  const job = m.job, C = CONTEST[job.contest], size = job.size || 2800;
  const A = makeBrain(C, job.gA, job.wA, size), B = m.mode === 'play' ? null : makeBrain(C, job.gB, job.wB, size);
  let rs = job.seed >>> 0 || 7; const rnd = () => { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; return (rs >>> 0) / 4294967296; };
  const match = new ChoiceMatch(C, m.mode === 'play' ? [{ brain: A }, { human: true }] : [{ brain: A }, { brain: B }], () => C.items[Math.floor(rnd() * C.items.length)],
    m.mode === 'play' ? { maxMs: 3000, iti: 700 } : { iti: Math.round(TRIAL_VIEW_ITI * (m.slow || 1)) });
  live = { m, job, A, B, match, choice: true, C, lastPol: -1e9, done: false, limit: m.mode === 'play' ? Infinity : job.matchSec * 1000, aPrev: [new Uint32Array(8), new Uint32Array(8)], maps: [dispMap(A), B ? dispMap(B) : null], evN: 0 };
}
const TRIAL_VIEW_ITI = 80;
function choiceFrame(withPol) {
  const { A, B, match } = live, brains = [A, B];
  const spk = new Uint8Array(2 * N);
  const br = brains.map((b, k) => {
    if (!b) return null;
    const mp = live.maps[k], o = k * N; for (let i = 0; i < b.N; i++) if (b.spk[i]) spk[o + mp[i]] = 1; b.spk.fill(0);
    const dl = b.daLog; b.daLog = 0;
    return { gr: Array.from(b.grate), gc: Array.from(b.gcnt), margin: b.margin, rpe: b.rpe, da: b.da, daPulse: dl, areas: choiceAreas(b, live.aPrev[k]), pol: withPol ? Array.from(b.policy()) : null, G: b.L.G, N: b.N };
  });
  const ev = match.events.slice(live.evN); live.evN = match.events.length; if (live.evN > 48) { match.events.splice(0, 32); live.evN = match.events.length; }
  return { t: 'frame', kind: 'choice', contest: live.C.id, time: match.t, phase: match.phase, pt: match.pt, item: match.item, out: match.out, stats: match.stats(), ev, br, spk };
}
function startLive(m) {
  if (m.job.contest && m.job.contest !== 'pong') return startChoiceLive(m);
  const job = m.job;
  const A = new Brain(job.gA, job.wA), B = m.mode === 'play' ? null : new Brain(job.gB, job.wB);
  const players = m.mode === 'play' ? [{ brain: A }, { human: true }] : [{ brain: A }, { brain: B }];
  const match = new Match(players, mulberry32(job.seed), { manualServe: m.mode === 'play' });
  const ev = []; match.onEvent = e => ev.push({ t: e.t, p: e.p });
  live = { m, job, A, B, match, ev, lastPol: -1e9, done: false, limit: m.mode === 'play' ? Infinity : job.matchSec * 1000, aPrev: [new Uint32Array(NA_), new Uint32Array(NA_)] };
}

function frame(withPol) {
  const { A, B, match, ev } = live, pg = match.pong, brains = [A, B];
  const spk = new Uint8Array(2 * N);
  const br = brains.map((b, k) => {
    if (!b) return null;
    spk.set(b.spk, k * N); b.spk.fill(0);
    const prev = live.aPrev[k], areas = Array.from(b.areaSpk, (v, i) => v - prev[i]); prev.set(b.areaSpk);
    const dl = b.daLog; b.daLog = 0;
    return { out: b.out, rU: b.rU, rD: b.rD, rpe: b.rpe, da: b.da, daPulse: dl, areas, pol: withPol ? b.policyMap() : null };
  });
  const f = { t: 'frame', time: match.t, bx: pg.bx, by: pg.by, vx: pg.vx, vy: pg.vy, pad: [...pg.pad], hold: !!pg.hold, wait: pg.wait,
    stats: match.stats(), ev: ev.splice(0), br, spk };
  return f;
}

return e => {
  const m = e.data;
  if (m.t === 'duel') {
    const res = runDuel(m.job);
    const buf = w => w.W ? w.W.buffer : w.buffer;
    const tr = []; if (res.wA) tr.push(buf(res.wA)); if (res.wB) tr.push(buf(res.wB));
    postMessage({ t: 'duel', rid: m.rid, res }, tr);
  } else if (m.t === 'bench') {
    postMessage({ t: 'bench', rid: m.rid, res: m.contest && m.contest !== 'pong' ? choiceBenchmark(CONTEST[m.contest], m.g, m.w, m.size) : benchmark(m.g, m.w) });
  } else if (m.t === 'live') {
    startLive(m);
    postMessage(live.choice ? choiceFrame(true) : frame(true));
  } else if (m.t === 'tick' && live && live.choice) {
    if (live.done) return;
    const mt = live.match;
    if (m.answer != null) mt.answer(1, m.answer);
    const t0 = performance.now(), budget = m.budget || 30;
    let ms = Math.min(m.ms, live.limit - mt.t), done = 0;
    while (done < ms) { const k = Math.min(5, ms - done); mt.stepMs(k); done += k; if (performance.now() - t0 > budget) break; }
    const withPol = mt.t - live.lastPol > 1000; if (withPol) live.lastPol = mt.t;
    const f = choiceFrame(withPol); f.simMs = done; f.wall = performance.now() - t0;
    if (mt.t >= live.limit) { live.done = true; f.result = { stats: mt.stats(), wA: live.A.exportWeights(), wB: live.B ? live.B.exportWeights() : null }; }
    const tr = [f.spk.buffer]; if (f.result) { if (f.result.wA) tr.push(f.result.wA.W.buffer); if (f.result.wB) tr.push(f.result.wB.W.buffer); }
    postMessage(f, tr);
  } else if (m.t === 'tick') {
    if (!live || live.done) return;
    const mt = live.match;
    if (m.humanY != null) mt.humanY = m.humanY;
    mt.humanCmd = m.humanCmd || 0;
    if (m.serve) mt.pong.hold = false;
    if (m.reset && live.m.mode === 'play') { const p = mt.pong; p.score = [0, 0]; p.hits = [0, 0]; p.miss = [0, 0]; p.rallies = []; p.hold = true; p.serve(p.rnd() < 0.5 ? 0 : 1); }   // a new game: first serve to a random side
    const t0 = performance.now(), budget = m.budget || 30;
    let ms = Math.min(m.ms, live.limit - mt.t), done = 0;
    while (done < ms) { const k = Math.min(10, ms - done); mt.stepMs(k); done += k; if (performance.now() - t0 > budget) break; }
    const withPol = mt.t - live.lastPol > 1000; if (withPol) live.lastPol = mt.t;
    const f = frame(withPol); f.simMs = done; f.wall = performance.now() - t0;
    if (mt.t >= live.limit) {
      live.done = true;
      // post-duel synapses are always returned: the benchmark scores the trained brains (inheritance is decided by the caller)
      f.result = { stats: mt.stats(), wA: live.A.exportWeights(), wB: live.B ? live.B.exportWeights() : null };
    }
    const tr = [f.spk.buffer]; if (f.result) { if (f.result.wA) tr.push(f.result.wA.buffer); if (f.result.wB) tr.push(f.result.wB.buffer); }
    postMessage(f, tr);
  } else if (m.t === 'stop') { live = null; }
};
}
