/* NEURO ARENA simulation core: runs duels headlessly (Turbo) or one live match in small time slices (Watch / Play).
   Used by worker.js inside a Web Worker, or directly on the main thread when workers are unavailable. */
import { Brain, mulberry32, L, N, AREA_DEF } from './brain.js';
import { Match } from './arena.js';
import { runDuel } from './evo.js';

const NA_ = AREA_DEF.length;

export function makeHandler(postMessage) {
let live = null;
function startLive(m) {
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
    const tr = []; if (res.wA) tr.push(res.wA.buffer); if (res.wB) tr.push(res.wB.buffer);
    postMessage({ t: 'duel', rid: m.rid, res }, tr);
  } else if (m.t === 'live') {
    startLive(m);
    postMessage(frame(true));
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
      const lam = live.job.lamarck;
      f.result = { stats: mt.stats(), wA: lam ? live.A.exportWeights() : null, wB: lam && live.B ? live.B.exportWeights() : null };
    }
    const tr = [f.spk.buffer]; if (f.result) { if (f.result.wA) tr.push(f.result.wA.buffer); if (f.result.wB) tr.push(f.result.wB.buffer); }
    postMessage(f, tr);
  } else if (m.t === 'stop') { live = null; }
};
}
