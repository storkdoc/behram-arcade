// NEURO ARENA audit: unit tests for sensing, motor, capacity, plasticity, evolution and fitness noise.
// usage: node tests/audit.mjs [--quick]
import { Brain, mulberry32, L, N, fovea, DT } from '../js/brain.js';
import { Match } from '../js/arena.js';
import { Pong, COURT } from '../js/pong.js';
import { gen0Genome, NGB, copyGenome } from '../js/genome.js';
import { Evolution, benchmark, runDuel, quant, dequant, BENCH, clearlyBetter } from '../js/evo.js';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (!isMainThread) { parentPort.postMessage(runDuel(workerData).stats); }
else {
const quick = process.argv.includes('--quick');
let fails = 0; const T = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); if (!ok) fails++; };
const NM = L.M_UP.n + L.M_DN.n, NUP = L.M_UP.n, A0 = L.A_E.s, M0 = L.M_UP.s;
const ideal = () => { const g = gen0Genome(); for (let k = 0; k < NGB; k++) g['gb' + k] = Math.sign(-1 + (k + 0.5) * 2 / NGB); return g; };
const polScore = b => { let s = 0; for (let a = 0; a < 784; a++) { let u = 0, d = 0, nu = 0, nd = 0; for (let q = b.rowS[a]; q < b.rowS[a + 1]; q++) { if (b.rowM[q] < NUP) { u += b.W[q]; nu++; } else { d += b.W[q]; nd++; } } s += (u / nu - d / nd) / b.g.wMax * Math.sign(b.c1[A0 + a] * 2 - 1); } return s / 784; };
const hitIn = (m, side, ms) => { const h0 = m.pong.hits[side], m0 = m.pong.miss[side]; m.stepMs(ms); const h = m.pong.hits[side] - h0, n = h + m.pong.miss[side] - m0; return [h, n]; };

console.log('— 1. Sensing');
{ // egocentric views are mirror-symmetric, use the OWN paddle, and the same vertical velocity sign
  const P = new Pong(mulberry32(1)), Q = new Pong(mulberry32(1)); let ok = true, own = true, vs = true;
  for (let i = 0; i < 200; i++) {
    const r = mulberry32(i + 5); P.bx = 0.1 + 1.4 * r(); P.by = r(); P.vy = (r() - 0.5) * 4e-3; P.pad = [0.1 + 0.8 * r(), 0.1 + 0.8 * r()];
    Q.bx = COURT.W - P.bx; Q.by = P.by; Q.vy = P.vy; Q.pad = [P.pad[1], P.pad[0]];
    const a = P.view(0), b = Q.view(1); if (a.some((v, k) => Math.abs(v - b[k]) > 1e-9)) ok = false;
    if (P.view(0)[1] !== P.pad[0] || P.view(1)[1] !== P.pad[1]) own = false;
    if (Math.sign(P.view(0)[3] - 0.5) !== Math.sign(P.vy) || Math.sign(P.view(1)[3] - 0.5) !== Math.sign(P.vy)) vs = false;
  }
  T('left/right views are exact mirror images (x flipped, y and vy not)', ok);
  T('channel "paddle y" is the brain\'s own paddle on both sides', own);
  T('vy channel: ball moving up (+y) reads > 0.5 on both sides', vs);
  P.bx = COURT.padX[0] + 0.02; const near0 = P.view(0)[2], far1 = P.view(1)[2];
  T('ball-distance channel is egocentric (near own paddle → ~1, far → ~0)', near0 > 0.95 && far1 < 0.1, `left ${near0.toFixed(2)} right ${far1.toFixed(2)}`);
}
{ // the population code peaks at the encoded value, and the spiking relay/sensory cells carry it
  const b = new Brain(gen0Genome()); let worst = 0;
  for (const [by, py, bx, vy] of [[0.8, 0.3, 0.7, 0.2], [0.2, 0.7, 0.1, 0.9], [0.55, 0.5, 0.5, 0.5]]) {
    b.sense(by, py, bx, vy); const x = [fovea(by - py), py, bx, vy];
    for (let c = 0; c < 4; c++) { let best = -1, arg = 0; for (let k = 0; k < L.TH_E.n; k++) if (b.ch[L.TH_E.s + k] === c && b.drive[k] > best) { best = b.drive[k]; arg = b.c1[L.TH_E.s + k]; } worst = Math.max(worst, Math.abs(arg - x[c])); }
  }
  T('receptor drive peaks at the encoded value in all 4 channels', worst < 0.02, `max error ${worst.toFixed(3)}`);
  // spike centroids in sensory cortex (cells near the ends of the code are biased inward, so test mid-range inputs
  // and check that each channel moves the right way when its input changes)
  const cents = (by, py, bx, vy) => { const c2 = new Brain(gen0Genome()); c2.sense(by, py, bx, vy); c2.run(600); c2.spk.fill(0); c2.run(600);
    return [0, 1, 2, 3].map(c => { let s = 0, n = 0; for (let i = L.S_E.s; i < L.S_E.e; i++) if (c2.ch[i] === c && c2.spk[i]) { s += c2.c1[i]; n++; } return s / n; }); };
  const inA = [0.55, 0.5, 0.35, 0.35], inB = [0.45, 0.5, 0.65, 0.65], wA = [fovea(0.05), 0.5, 0.35, 0.35], wB = [fovea(-0.05), 0.5, 0.65, 0.65];
  const gA = cents(...inA), gB = cents(...inB), err = Math.max(...gA.map((v, k) => Math.abs(v - wA[k])), ...gB.map((v, k) => Math.abs(v - wB[k])));
  const dirOk = [0, 2, 3].every(k => Math.sign(gB[k] - gA[k]) === Math.sign(wB[k] - wA[k]));
  T('sensory-cortex spikes encode the inputs (spike centroid within 0.12, moves the right way)', err < 0.12 && dirOk, gA.map((v, k) => `${v.toFixed(2)}/${wA[k].toFixed(2)}`).join(' ') + ' | ' + gB.map((v, k) => `${v.toFixed(2)}/${wB[k].toFixed(2)}`).join(' '));
  T('foveal code: ball 0.1 above the paddle is well separated from 0.1 below', fovea(0.1) - fovea(-0.1) > 0.35, `${fovea(-0.1).toFixed(2)} vs ${fovea(0.1).toFixed(2)}`);
}

console.log('— 2. Motor');
{ const run = up => { const b = new Brain(gen0Genome()); for (let s = 0; s < b.W.length; s++) b.W[s] = (b.rowM[s] < NUP) === up ? b.g.wMax : 0;
    b.sense(0.5, 0.5, 0.5, 0.5); let o = 0; for (let k = 0; k < 400; k++) { b.run(2); if (k > 100) o += b.out; } return o / 299; };
  const up = run(true), dn = run(false);
  T('UP group drives the command up, DOWN group drives it down', up > 0.5 && dn < -0.5, `UP-wired ${up.toFixed(2)}, DOWN-wired ${dn.toFixed(2)}`);
  let mv = true; for (const p of [0, 1]) { const P = new Pong(mulberry32(3)); P.wait = 1e9; P.pad = [0.5, 0.5]; const c = [0, 0]; c[p] = up; P.step(c, 100); if (!(P.pad[p] > 0.5)) mv = false; c[p] = dn; P.step(c, 200); if (!(P.pad[p] < 0.5)) mv = false; }
  T('a positive command moves the paddle up (+y, toward the top of the screen) on both sides', mv);
  const vPad = COURT.padV * Math.min(up, -dn), worst = Math.min(...BENCH.map(s => (s.x - COURT.padX[0] - COURT.r) / (s.sp * Math.cos(s.a)) + 120));
  const need = 0.8 - COURT.padH / 2, t = need / vPad;
  T('paddle can cross the court (0.71) before the fastest/closest benchmark ball arrives', t < worst, `max paddle speed ${(vPad * 1000).toFixed(2)}/s → ${t.toFixed(0)} ms vs shortest ball flight ${worst.toFixed(0)} ms`);
}

console.log('— 3. Capacity (hand-wired ideal brain, no learning)');
{ const g = { ...ideal(), eta: 0 }; const bm = benchmark(g, null);
  T('ideal wiring: benchmark ≥ 90%', bm.hit >= 0.9, `${(bm.hit * 100).toFixed(0)}% of ${bm.n} serves`);
  for (const side of [0, 1]) { const b = new Brain(g), m = new Match(side ? [{ track: true }, { brain: b }] : [{ brain: b }, { track: true }], mulberry32(9 + side)); const [h, n] = hitIn(m, side, quick ? 20000 : 40000);
    T(`ideal wiring: live rallies vs a perfect wall, side ${side ? 'right' : 'left'} ≥ 90%`, h / n >= 0.9, `${h}/${n}`); }
}

console.log('— 4. Plasticity');
{ const g = gen0Genome(); const b = new Brain(g);
  const syn = (a, m) => { for (let s = b.rowS[a]; s < b.rowS[a + 1]; s++) if (b.rowM[s] === m) return s; return -1; };
  let a = 0, m = 0, s = -1; for (a = 10; a < 784 && s < 0; a++) s = syn(a, 3); a--; m = 3;
  const fire = i => { b.V[i] = 10; b.last[i] = -1e6; b.th[i] = b.th0[i]; };
  // pre then post
  b.E.fill(0); b.xPre.fill(0); b.yPost.fill(0); fire(A0 + a); b.run(1); b.run(4); fire(M0 + m); b.run(1); const ePP = b.E[s];
  b.reset(); b.E.fill(0); fire(M0 + m); b.run(1); b.run(4); fire(A0 + a); b.run(1); const ePo = b.E[s];
  T('pre-before-post → positive eligibility', ePP > 0.5, ePP.toFixed(3));
  T('post-before-pre → negative eligibility (LTD)', ePo < 0, ePo.toFixed(3));
  const dw = r => { const c = new Brain(g); c.xPre.fill(0); c.E[s] = 1; const w0 = c.W[s]; c.da = r; c.learn(10); return c.W[s] - w0; };
  const dP = dw(1), dN = dw(-1), d0 = dw(0);
  T('dopamine + strengthens an eligible synapse, dopamine − weakens it, none leaves it', dP > 0 && dN < 0 && d0 === 0, `+${dP.toExponential(2)} / ${dN.toExponential(2)} / ${d0}`);
  // uncorrelated firing leaves no net eligibility (covariance rule): random input, no reward
  const cm = base => { const c = new Brain({ ...g, base }), r = mulberry32(3); let me = 0, n = 0;
    for (let t = 0; t < 40; t++) { c.sense(r(), r(), r(), r()); c.run(100); if (t >= 10) { let s = 0; for (let q = 0; q < c.E.length; q++) s += c.E[q]; me += s / c.E.length; n++; } } return me / n; };
  const cm0 = cm(0), cm1 = cm(1);
  T('covariance baseline cuts the common-mode (all-synapse) eligibility by ≥ 40%', cm1 < 0.6 * cm0, `mean eligibility ${cm0.toFixed(3)} without → ${cm1.toFixed(3)} with (partial: causal pre→post co-firing remains)`);
  { const c = new Brain(g), s0 = s; c.xPre.fill(0); const step = () => { c.E[s0] = 1; c.da = 0.3; const w = c.W[s0]; c.learn(10); return c.W[s0] - w; };
    const early = step(); for (let k = 0; k < 600; k++) step(); const late = step();
    T('tonic (constant) dopamine stops changing weights once expected (reward-prediction error → 0)', early > 0 && Math.abs(late) < 0.05 * early, `Δw per 10 ms: first ${early.toExponential(2)}, after 6 s ${late.toExponential(2)}`); }
  // credit-assignment windows
  const left = d => Math.exp(-d / g.tauElig);
  console.log(`      note: eligibility τ ${g.tauElig} ms, dopamine τ ${g.tauDA} ms; a hit/miss arrives 300–800 ms after the movement that caused it → ${(left(300) * 100).toFixed(1)}–${(left(800) * 100).toFixed(3)}% of the trace is left.`);
  console.log('      so terminal hit/miss dopamine alone cannot assign credit; the dense approach critic (every 5 ms) does. Tested below.');
  // critic sign, both sides
  let crit = true; for (const p of [0, 1]) for (const [by, cmd, want] of [[0.8, 1, 1], [0.8, -1, -1], [0.2, -1, 1], [0.2, 1, -1]]) {
    const A = new Brain(g), B = new Brain(g), m2 = new Match([{ brain: A }, { brain: B }], mulberry32(1)); const me2 = [A, B][p]; let got = 0;
    A.run = B.run = () => {}; A.out = B.out = 0; me2.out = cmd; me2.reward = r => { got += r; }; [A, B][1 - p].reward = () => {};
    m2.pong.wait = 0; m2.pong.pad = [0.5, 0.5]; m2.pong.by = by; m2.pong.bx = 0.8; m2.pong.vx = 1e-9; m2.pong.vy = 0; m2.stepMs(5);
    if (Math.sign(got) !== want) crit = false; }
  T('approach critic: + for moving toward the ball, − for moving away (both sides, both directions)', crit);
  // lifetime learning (with the critic) vs without
  const life = (gg, sec, seed) => { const br = new Brain(gg), mm = new Match([{ brain: br }, { track: true }], mulberry32(seed)); const segs = []; for (let t = 0; t < sec; t += 30) segs.push(hitIn(mm, 0, 30000)); return { segs, br }; };
  const sec = quick ? 120 : 180, L1 = life(g, sec, 1), L0 = life({ ...g, critic: 0 }, quick ? 60 : 120, 1);
  const r = ([h, n]) => h / n, f = r(L1.segs[0]), l = r(L1.segs.at(-1));
  T(`lifetime learning: a fresh gen-0 brain improves within one life (first 30 s → last 30 s of ${sec} s)`, l >= 0.6 && l > f + 0.2, L1.segs.map(x => `${x[0]}/${x[1]}`).join(' '));
  T('without the approach critic (hit/miss dopamine only) it does not learn much', r(L0.segs.at(-1)) < l, L0.segs.map(x => `${x[0]}/${x[1]}`).join(' '));
  // weights change, persist, are not stuck at bounds, and homeostasis does not undo learning
  const br = L1.br, p1 = polScore(br); let z = 0, mx = 0; for (const w of br.W) { if (w <= 1e-5) z++; if (w >= br.g.wMax * 0.999) mx++; }
  T('learned policy is in the synapses (UP>DOWN for ball-above cells)', p1 > 0.03, `policy index ${p1.toFixed(3)}`);
  T('weights are not clamped to 0 or wMax', z / br.W.length < 0.2 && mx / br.W.length < 0.2, `${(100 * z / br.W.length).toFixed(1)}% at 0, ${(100 * mx / br.W.length).toFixed(1)}% at max`);
  const w = br.exportWeights(), b2 = new Brain(br.g, w); let same = true; for (let q = 0; q < b2.W.length; q++) if (Math.abs(b2.W[q] - br.W[q]) > 1e-7) same = false;
  T('learned weights survive export → a new brain (carried into the next match)', same);
  const b3 = new Brain({ ...br.g, eta: 0 }, w); b3.sense(0.5, 0.5, 0.5, 0.5); const m3 = new Match([{ brain: b3 }, { track: true }], mulberry32(5)); m3.stepMs(20000); const p3 = polScore(b3);
  T('homeostatic scaling does not undo learning (20 s, learning off, scaling on)', p3 > 0.7 * p1, `policy index ${p1.toFixed(3)} → ${p3.toFixed(3)}`);
  const q = dequant(quant(w, br.g.wMax)); let qe = 0; for (let k = 0; k < w.length; k++) if (w[k] >= 0) qe = Math.max(qe, Math.abs(q[k] - w[k]));
  const bA = benchmark(br.g, w), bB = benchmark(br.g, q), rr = mulberry32(5), pert = [];
  for (let k = 0; k < (quick ? 4 : 8); k++) pert.push(benchmark(br.g, Float32Array.from(w, x => x < 0 ? x : x * (1 + 1e-3 * (rr() - 0.5)))).hits);
  const lo = Math.min(bA.hits, ...pert), hi = Math.max(bA.hits, ...pert);
  console.log(`      chaos: the spiking net is deterministic but chaotic — ±0.05% weight jitter moves the benchmark ${lo}…${hi} of 50 (exact ${bA.hits}).`);
  T('8-bit storage keeps learned weights (max error ≤ 0.5/254 wMax; benchmark inside the ±0.05%-jitter range)', qe <= br.g.wMax / 254 * 0.51 && bB.hits >= lo - 1 && bB.hits <= hi + 1, `max err ${qe.toExponential(2)}, bench ${bA.hits} → ${bB.hits} (jitter range ${lo}…${hi})`);
  globalThis.__range = [lo, hi];
  globalThis.__trained = { g: br.g, w };
}

console.log('— 5. Evolution');
{ const { g: tg, w: tw } = globalThis.__trained;
  const bench = (hits, n = 50) => ({ hits, n, hit: hits / n, vec: '1'.repeat(hits) + '0'.repeat(n - hits) });
  const fake = (side, champHits, childHits, tag) => { const wC = new Float32Array([1, 2, tag]), wK = new Float32Array([3, 4, tag]);
    const b = [null, null]; b[side] = bench(champHits); b[1 - side] = bench(childHits);
    return { stats: { score: [0, 0], hits: [0, 0], miss: [0, 0], hitRate: [0, 0], rally: 1, seg: [] }, wA: side === 0 ? wC : wK, wB: side === 0 ? wK : wC, bench: b }; };
  for (const side of [0, 1]) {
    const ev = new Evolution({ lamarck: true }); const g0 = JSON.stringify(ev.champ.genome); const kid = ev.spawn();
    T(`spawn: copy errors go to the child, the parent genome is untouched`, JSON.stringify(ev.champ.genome) === g0 && kid.errors.every(e => kid.genome[e.key] === e.to));
    const job = ev.job(kid); job.side = side; const oldId = ev.champ.id;
    ev.record([kid], [job], [fake(side, 20, 40, 7)]);
    T(`challenger on the ${side ? 'left' : 'right'} that is clearly better replaces the champion (genome + its own weights)`, ev.champ.id === kid.id && ev.champ.genome === kid.genome && ev.champ.weights[0] === 3 && ev.champ.fit === 0.8);
    T(`old champion goes to the Hall of Fame with its own synapses`, ev.hof[0] && ev.hof[0].id === oldId && ev.hof[0].weights[0] === 1);
  }
  { const ev = new Evolution({ lamarck: true }); const kids = [ev.spawn(), ev.spawn(), ev.spawn()], jobs = kids.map(k => ev.job(k));
    const res = jobs.map((j, k) => fake(j.side, [30, 35, 28][k], [25, 20, 22][k], k));
    ev.record(kids, jobs, res);
    T('parallel arenas: gen advances by K, K history entries', ev.gen === 3 && ev.history.length === 3);
    T('parallel arenas: the champion keeps its BEST benchmarked copy of the K', ev.champ.id === 1 && ev.champ.weights[2] === 1 && ev.champ.fit === 0.7);
    const k2 = [ev.spawn()], j2 = k2.map(k => ev.job(k)); ev.record(k2, j2, [fake(j2[0].side, 20, 30, 9)]);
    T('elitism: a worse champion copy never replaces the kept synapses (score cannot drop)', ev.champ.weights[2] === 1 && ev.champ.fit === 0.7);
    const k3 = [ev.spawn()], j3 = k3.map(k => ev.job(k)); ev.record(k3, j3, [fake(j3[0].side, 30, 36, 9)]);
    T('a challenger only 1 serve better than the champion does not take the throne', ev.champ.id === 1, `36 vs 35`);
    const c1 = bench(35), c2 = { ...bench(38), vec: '0'.repeat(10) + '1'.repeat(38) + '00' };
    T('paired test: 38 vs 35 with many discordant serves is not "clearly better"', !clearlyBetter(c1, c2));
  }
  { const ev = new Evolution({ lamarck: false }); ev.champ.weights = null; const kid = ev.spawn(), job = ev.job(kid);
    T('Darwinian: children and champion start each duel with innate (gene-built) synapses', kid.weights === null && job.wA === null && job.wB === null);
    ev.record([kid], [job], [fake(job.side, 30, 31, 1)]);
    T('Darwinian: no learned weights are kept after a duel', ev.champ.weights === null); }
  { const ev = new Evolution({ lamarck: true }); ev.champ.weights = tw; ev.champ.genome = tg; ev.champ.bench = benchmark(tg, tw); ev.champ.fit = ev.champ.bench.hit; ev.gen = 7;
    ev.hof = [{ id: 99, genome: { ...tg }, weights: tw, bench: ev.champ.bench, fit: 0.9, n: 3, born: 2 }];
    const ser = JSON.parse(JSON.stringify(ev.serialize(true))), back = Evolution.restore(ser);
    let e = 0; for (let k = 0; k < tw.length; k++) e = Math.max(e, Math.abs(back.champ.weights[k] - tw[k]));
    const rb = benchmark(back.champ.genome, back.champ.weights);
    T('save → reload restores the champion (genome, weights, generation; benchmark inside the jitter range)', back.gen === 7 && JSON.stringify(back.champ.genome) === JSON.stringify(tg) && e < tg.wMax / 250 && rb.hits >= globalThis.__range[0] - 1 && rb.hits <= globalThis.__range[1] + 1, `bench ${ev.champ.bench.hits} → ${rb.hits}`);
    let he = 0; for (let k = 0; k < tw.length; k++) he = Math.max(he, Math.abs(back.hof[0].weights[k] - tw[k]));
    T('Hall of Fame survives save → reload with its synapses', back.hof.length === 1 && back.hof[0].id === 99 && back.hof[0].fit === 0.9 && he < tg.wMax / 250);
    back.gen = 25; back.champ.fit = 0.5; back.champ.n = 5; const rm = back.spawn();
    T('Hall of Fame rematch: the stored champion comes back with its own genome and synapses', rm.hof && rm.id === 99 && rm.weights && Math.abs(rm.weights[5] - back.hof[0].weights[5]) < 1e-9);
    T('old v1 saves (from the buggy learner) are discarded, not restored', Evolution.restore({ ...ser, v: 1 }) === null); }
}

console.log('— 6. Fitness noise');
{ const g = gen0Genome(); const b1 = benchmark(g, null), b2 = benchmark(g, null);
  T('the benchmark is deterministic (same brain → same score, common random numbers)', b1.vec === b2.vec);
  const n = quick ? 8 : 16, here = fileURLToPath(import.meta.url);
  const st = await Promise.all(Array.from({ length: n }, (_, i) => new Promise(r => { const w = new Worker(here, { workerData: { gA: g, gB: g, wA: null, wB: null, seed: 7919 * i + 13, matchSec: 30, lamarck: false, bench: false } }); w.on('message', r); })));
  const d = st.map(s => s.hitRate[1] - s.hitRate[0]), mean = a => a.reduce((x, y) => x + y, 0) / a.length, sd = Math.sqrt(mean(d.map(x => (x - mean(d)) ** 2)));
  const flukes = st.filter(s => { const lead = s.score[1] - s.score[0]; return lead >= 2 || (lead === 1 && s.hitRate[1] > s.hitRate[0] + 0.05); }).length;
  console.log(`      identical twins in ${n} × 30 s duels: hit-rate difference SD ${sd.toFixed(3)}; the twin "clearly won" ${flukes}/${n} times (old selection rule) — duels are far too noisy to select on.`);
  const p = 0.8, se = Math.sqrt(p * (1 - p) / BENCH.length);
  console.log(`      benchmark: ${BENCH.length} fixed serves, SE ±${(se * 100).toFixed(1)} pts at 80%; selection also needs ≥2 net serves and a paired sign test.`);
  T('twin duels are noisy (motivates the benchmark)', sd > 0.05, `SD ${sd.toFixed(3)}`);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
}
