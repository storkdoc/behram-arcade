// Headless evolution for any contest, through the same worker core (simcore) and Evolution code as Turbo mode.
// usage: node tests/evochoice.mjs <contest> [rounds=10] [K=6] [lamarck=1] [matchSec=30] [size=2800] [seed=12345]
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(import.meta.url);
if (!isMainThread) {
  const { makeHandler } = await import('../js/simcore.js');
  const h = makeHandler(m => parentPort.postMessage(m));
  parentPort.on('message', m => h({ data: m }));
} else {
  const { Evolution } = await import('../js/evo.js');
  const { mulberry32 } = await import('../js/brain.js');
  const { CONTEST } = await import('../js/contests.js');
  const [id = 'add', rounds = 10, K = 6, lam = 1, matchSec = 30, size = 2800, rs = 12345] = process.argv.slice(2);
  const C = CONTEST[id];
  const evo = new Evolution({ contest: id, size: +size, lamarck: !!+lam, matchSec: +matchSec }); evo.rnd = mulberry32(+rs);
  const pool = Array.from({ length: +K }, () => new Worker(here));
  let rid = 0; const run = (w, m) => new Promise(r => { const id = ++rid; const f = d => { if (d.rid === id) { w.off('message', f); r(d.res); } }; w.on('message', f); w.postMessage({ ...m, rid: id }); });
  const acc = () => evo.champAccNow ?? (evo.champ.bench && evo.champ.bench.acc) ?? 0;
  const t0 = Date.now();
  console.log(JSON.stringify({ contest: id, chance: C ? C.chance : 0.24, K: +K, lamarck: !!+lam, matchSec: +matchSec, size: +size }));
  for (let r = 1; r <= +rounds; r++) {
    const kids = pool.map(() => evo.spawn()), jobs = kids.map(k => evo.job(k));
    const res = await Promise.all(pool.map((w, i) => run(w, { t: 'duel', job: jobs[i] })));
    const out = evo.record(kids, jobs, res);
    const last = out[out.length - 1];
    console.log(JSON.stringify({ round: r, gen: evo.gen, wallS: Math.round((Date.now() - t0) / 1000), champAcc: last.champAccNow, best: evo.bestAcc, kids: out.map(e => e.childAcc), reaped: out.filter(e => e.newChamp).length }));
  }
  pool.forEach(w => w.terminate());
}
