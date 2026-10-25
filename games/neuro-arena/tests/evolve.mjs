// Headless evolution test: runs the same Evolution + runDuel (+ benchmark) code as the browser's Turbo mode,
// with K parallel arenas (worker_threads).
// usage: node tests/evolve.mjs [rounds=12] [K=6] [rate=0.02] [lamarck=1] [matchSec=30] [tag] [rngSeed=12345]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const here = fileURLToPath(import.meta.url);
if (!isMainThread) {
  const { runDuel } = await import('../js/evo.js');
  const { evalVsWall } = await import('./evalutil.mjs');
  parentPort.on('message', j => parentPort.postMessage(j.evalOnly ? evalVsWall(j) : runDuel(j)));
} else {
  const { Evolution } = await import('../js/evo.js');
  const { mulberry32 } = await import('../js/brain.js');
  const [rounds = 12, K = 6, rate = 0.02, lam = 1, matchSec = 30, tag = 'run', rs = 12345] = process.argv.slice(2);
  const evo = new Evolution({ rate: +rate, lamarck: !!+lam, matchSec: +matchSec }); evo.rnd = mulberry32(+rs);
  const pool = Array.from({ length: +K }, () => new Worker(here));
  const run = (w, j) => new Promise(r => { w.once('message', r); w.postMessage(j); });
  const heldOut = async (n = 4) => {   // held-out test: champion vs a perfect wall-tracker, 45 s x n seeds, frozen synapses
    const c = evo.champ, rs = [];
    await Promise.all(pool.map(async (w, wi) => { for (let i = wi; i < n; i += pool.length) rs.push(await run(w, { evalOnly: 1, g: c.genome, w: c.weights, seed: 1000 + i, sec: 45 })); }));
    return rs.reduce((a, r) => a + r.hit * r.n, 0) / rs.reduce((a, r) => a + r.n, 0);
  };
  const t0 = Date.now(), rows = [];
  const h0 = await heldOut(); rows.push({ round: 0, gen: 0, t: 0, bench: null, test: h0 });
  console.log(`round 0  gen 0  held-out ${h0.toFixed(3)}`);
  for (let r = 1; r <= +rounds; r++) {
    const kids = pool.map(() => evo.spawn()), jobs = kids.map(k => evo.job(k));
    const tr = Date.now(); const res = await Promise.all(pool.map((w, i) => run(w, jobs[i]))); const dt = (Date.now() - tr) / 1000;
    const out = evo.record(kids, jobs, res);
    const nc = out.filter(e => e.newChamp).length, test = (r % 3 === 0 || r === +rounds) ? await heldOut() : null;
    const rally = out.reduce((a, e) => a + e.rally, 0) / out.length;
    rows.push({ round: r, gen: evo.gen, t: (Date.now() - t0) / 1000, roundSec: dt, bench: evo.champ.fit, best: evo.best.fit, kids: out.map(e => e.childBench), rally, test, newChamp: nc });
    console.log(`round ${r}  gen ${evo.gen}  t ${((Date.now() - t0) / 1000).toFixed(0)}s (${dt.toFixed(1)}s/round)  champion bench ${(evo.champ.fit * 100).toFixed(0)}%  kids ${out.map(e => Math.round(e.childBench * 100)).join(',')}  rally ${rally.toFixed(1)}${nc ? '  NEW CHAMP #' + evo.champ.id : ''}${test != null ? '  held-out ' + test.toFixed(3) : ''}`);
  }
  const g = evo.champ.genome;
  console.log('champion genes:', Object.entries(g).map(([k, v]) => `${k}=${(+v).toFixed(3)}`).join(' '));
  fs.mkdirSync('/tmp/na', { recursive: true });
  fs.writeFileSync(`/tmp/na/${tag}.json`, JSON.stringify({ rows, champ: g, history: evo.history.map(h => ({ gen: h.gen, cb: h.champBench, kb: h.childBench, r: h.rally, n: h.newChamp, b: h.beneficial, e: h.errors.length, seg: h.seg })) }));
  pool.forEach(w => w.terminate());
}
