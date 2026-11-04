// Headless Pong learning benchmark: does ONE brain's lifetime learning (reward-modulated STDP) raise its hit rate?
// Every seed gets a fresh generation-0 brain (the same genome and wiring the game starts with) and plays a perfect
// tracking opponent for SEC simulated seconds in three conditions that start from IDENTICAL synapses:
//   learn  = plasticity on (the game's rule), frozen = the same brain with plasticity off (eta 0, no scaling),
//   random = a random paddle (new random command every 100 ms).
// Reported per seed: live hit rate (returned / balls that reached the paddle) in each CHK-second window, and the
// frozen 50-serve benchmark (evo.js `benchmark`, plasticity off) of the brain's synapses at the end.
// usage: node tests/pong-learn.mjs [seeds=5] [sec=180] [chk=30]   env: S0 (first seed, default 1), REFLEX 0/1/2,
//        WIRING evolved|designed (default: the game's default), extra args gene=value
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
const here = fileURLToPath(import.meta.url);
if (!isMainThread) {
  const { Brain, mulberry32 } = await import('../js/brain.js');
  const { Match } = await import('../js/arena.js');
  const { benchmark, newPongGenome } = await import('../js/evo.js');
  const { seed, sec, chk, cond, over, reflex, wiring } = workerData;
  const g = { ...newPongGenome(seed, { reflex, wiring }), ...over };
  if (cond === 'frozen') { g.eta = 0; g.homeo = 0; }
  const brain = cond === 'random' ? null : new Brain(g, null);
  const m = new Match([brain ? { brain } : { random: true }, { track: true }], mulberry32(seed * 101 + 7));
  const win = []; let ph = 0, pm = 0; const t0 = Date.now();
  for (let t = 0; t < sec; t += chk) { m.stepMs(chk * 1000); const p = m.pong, h = p.hits[0] - ph, mi = p.miss[0] - pm; ph = p.hits[0]; pm = p.miss[0]; win.push([h, h + mi]); }
  const bench = brain ? benchmark(g, brain.exportWeights()).hit : benchmark(null, null, undefined, { random: true }).hit;
  parentPort.postMessage({ seed, cond, win, bench, wall: (Date.now() - t0) / 1000 });
} else {
  const [seeds = 5, sec = 180, chk = 30, ...kv] = process.argv.slice(2);
  const over = Object.fromEntries(kv.map(s => s.split('=')).map(([k, v]) => [k, +v]));
  const S0 = +(process.env.S0 || 1), reflex = process.env.REFLEX != null ? +process.env.REFLEX : undefined, wiring = process.env.WIRING;
  const CONDS = (process.env.CONDS || 'learn,frozen,random').split(','), jobs = []; for (let s = S0; s < S0 + +seeds; s++) for (const cond of CONDS) jobs.push({ seed: s, sec: +sec, chk: +chk, cond, over, reflex, wiring });
  const P = Math.max(1, Math.min(os.cpus().length, +(process.env.P || 8))), res = []; let next = 0;
  await Promise.all(Array.from({ length: P }, async () => { while (next < jobs.length) { const j = jobs[next++]; res.push(await new Promise((ok, no) => { const w = new Worker(here, { workerData: j }); w.once('message', ok); w.once('error', no); })); } }));
  const pc = ([h, n]) => n ? Math.round(100 * h / n) : 0, sum = w => w.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
  console.log(`Pong lifetime learning · ${seeds} seeds · ${sec} s simulated vs a perfect tracker · windows of ${chk} s · reflex ${reflex ?? 'default'} · wiring ${wiring || 'default'} ${kv.join(' ')}`);
  console.log('seed  cond    live hit % per window                     last window  benchmark(50 serves, frozen)');
  const agg = { learn: [], frozen: [], random: [] };
  for (let s = S0; s < S0 + +seeds; s++) for (const cond of CONDS) {
    const r = res.find(x => x.seed === s && x.cond === cond); agg[cond].push(r);
    console.log(`${String(s).padEnd(5)} ${cond.padEnd(7)} ${r.win.map(pc).map(v => String(v).padStart(3)).join(' ').padEnd(42)} ${String(pc(r.win[r.win.length - 1])).padStart(5)}%      ${Math.round(r.bench * 100)}%`);
  }
  for (const cond of CONDS) { const A = agg[cond], first = sum(A.map(r => r.win[0])), last = sum(A.map(r => r.win[r.win.length - 1])), b = A.reduce((a, r) => a + r.bench, 0) / A.length;
    console.log(`mean  ${cond.padEnd(7)} first window ${pc(first)}% → last window ${pc(last)}% · benchmark ${Math.round(b * 100)}% (min ${Math.round(Math.min(...A.map(r => r.bench)) * 100)}%)`); }
  const ok = agg.frozen.length && agg.learn.every((r, i) => r.bench >= agg.frozen[i].bench + 0.2 && pc(r.win[r.win.length - 1]) >= pc(agg.frozen[i].win[agg.frozen[i].win.length - 1]) + 20);
  console.log(ok ? 'PASS: learning beats its own frozen copy by ≥ 20 points (benchmark and last window) in every seed' : 'FAIL: learning did not beat the frozen baseline by ≥ 20 points in every seed');
  process.exitCode = ok ? 0 : 1;
}
