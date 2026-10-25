// Headless evolution test: runs the same Evolution + runDuel code as the browser, with K parallel arenas (worker_threads).
// usage: node tests/evolve.mjs [gens=200] [K=6] [rate=0.02] [lamarck=0] [matchSec=30] [tag]
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
  const [gens = 200, K = 6, rate = 0.02, lam = 0, matchSec = 30, tag = 'run'] = process.argv.slice(2);
  const evo = new Evolution({ rate: +rate, lamarck: !!+lam, matchSec: +matchSec });
  const pool = Array.from({ length: +K }, () => new Worker(here));
  const run = (w, j) => new Promise(r => { w.once('message', r); w.postMessage(j); });
  const evalChamp = async (n = 3) => {   // standardised test: champion vs a perfect wall-tracker, 60 s, n seeds in parallel
    const c = evo.champ;
    const rs = await Promise.all(pool.slice(0, n).map((w, i) => run(w, { evalOnly: 1, g: c.genome, w: c.weights, seed: 1000 + i, sec: 60 })));
    return rs.reduce((a, r) => a + r.hit, 0) / rs.length;
  };
  const t0 = Date.now(), rows = [];
  rows.push({ gen: 0, t: 0, test: await evalChamp() });
  console.log(`gen 0  test hit ${rows[0].test.toFixed(3)}`);
  let lastEval = 0;
  while (evo.gen < +gens) {
    const kids = pool.map(() => evo.spawn()), jobs = kids.map(k => evo.job(k));
    const res = await Promise.all(pool.map((w, i) => run(w, jobs[i])));
    evo.record(kids, jobs, res);
    if (evo.gen - lastEval >= 30 || evo.gen >= +gens) {
      lastEval = evo.gen;
      const recent = evo.history.slice(-30), duelHit = recent.reduce((a, h) => a + (h.champHit + h.childHit) / 2, 0) / recent.length, rally = recent.reduce((a, h) => a + h.rally, 0) / recent.length;
      const nb = evo.history.filter(h => h.beneficial).length;
      const test = await evalChamp();
      rows.push({ gen: evo.gen, t: (Date.now() - t0) / 1000, test, duelHit, rally, champs: nb });
      console.log(`gen ${evo.gen}  t ${((Date.now() - t0) / 1000).toFixed(0)}s  test hit ${test.toFixed(3)}  duel hit ${duelHit.toFixed(3)}  rally ${rally.toFixed(2)}  beneficial ${nb}  champ#${evo.champ.id} fit ${evo.champ.fit.toFixed(3)}`);
    }
  }
  const g = evo.champ.genome;
  console.log('champion genes:', Object.entries(g).map(([k, v]) => `${k}=${(+v).toFixed(3)}`).join(' '));
  fs.mkdirSync('/tmp/na', { recursive: true });
  fs.writeFileSync(`/tmp/na/${tag}.json`, JSON.stringify({ rows, champ: g, history: evo.history.map(h => ({ gen: h.gen, c: h.champHit, k: h.childHit, r: h.rally, n: h.newChamp, b: h.beneficial, e: h.errors.length })) }));
  pool.forEach(w => w.terminate());
}
