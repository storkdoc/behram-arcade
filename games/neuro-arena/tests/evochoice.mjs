// Headless evolution for any contest, through the same worker core (simcore) and Evolution code as Turbo mode.
// usage: node tests/evochoice.mjs <contest> [rounds=10] [K=6] [lamarck=1] [matchSec=30] [size=2800] [seed=12345] [reflex=1 (0 Full, 1 Limited, 2 None)] [wiring=evolved|designed]
// env PLAT=<gens> plateau rule (0 = off, default Evolution DEFAULTS.plateau); env ABL=<every> runs the understanding ablation every <every> rounds and at the end (logged as {abl})
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(import.meta.url);
if (!isMainThread) {
  const { makeHandler } = await import('../js/simcore.js');
  const h = makeHandler(m => parentPort.postMessage(m));
  parentPort.on('message', m => h({ data: m }));
} else {
  const { Evolution, uxC } = await import('../js/evo.js');
  const { mulberry32 } = await import('../js/brain.js');
  const { CONTEST } = await import('../js/contests.js');
  const [id = 'add', rounds = 10, K = 6, lam = 1, matchSec = 30, size = 2800, rs = 12345, reflex = 1, wiring = 'evolved'] = process.argv.slice(2);
  const C = uxC(id);
  // env FIX=nbr,mix,rate,aim,statue switches on the understanding fixes (bigram stage for NBRG generations, probe-style
  // puzzles in the benchmark, 3x unit-wiring mutation, aimed-winner reward, statue curriculum for STG generations)
  const FX = (process.env.FIX || '').split(',');
  const evo = new Evolution({ contest: id, size: +size, lamarck: !!+lam, matchSec: +matchSec, reflex: +reflex, wiring, uxSeed: +rs,
    nbrStage: FX.includes('nbr'), nbrGens: +(process.env.NBRG || 40), probeMix: FX.includes('mix'), uxRate: FX.includes('rate') ? 3 : 1, aimR: FX.includes('aim') ? 1.5 : 0, statue: FX.includes('statue'), statueGens: +(process.env.STG || 1e9), lexicon: process.env.LEX || 'grow', ...(process.env.PLAT != null ? { plateau: +process.env.PLAT } : {}) }); evo.rnd = mulberry32(+rs);
  const ABL = +(process.env.ABL || 0); const { classCounts, unitName, unitClass } = await import('../js/understand.js');
  const pool = Array.from({ length: +K }, () => new Worker(here));
  let rid = 0; const run = (w, m) => new Promise(r => { const id = ++rid; const f = d => { if (d.rid === id) { w.off('message', f); r(d.res); } }; w.on('message', f); w.postMessage({ ...m, rid: id }); });
  const acc = () => evo.champAccNow ?? (evo.champ.bench && evo.champ.bench.acc) ?? 0;
  const t0 = Date.now();
  console.log(JSON.stringify({ fix: FX, contest: id, chance: C.chance ?? null, K: +K, lamarck: !!+lam, matchSec: +matchSec, size: +size, reflex: +reflex, wiring, seed: +rs }));
  const ablate = async tag => { const r = await run(pool[0], { t: 'ablate', contest: id, g: evo.champ.genome, w: evo.champ.weights, size: +size });
    const ux = evo.champ.genome.ux, top = ux && r.readout ? ux.units.map((u, i) => ({ n: unitName(C, u), c: unitClass(C, u), to: C.labels[r.readout[i][0]], sel: +(r.readout[i][1] - r.readout[i][2]).toFixed(3) })).filter(o => o.c !== 'empty').sort((a, b) => b.sel - a.sel).slice(0, 25) : null;
    console.log(JSON.stringify({ abl: tag, gen: evo.gen, probe: r.acc, prior: r.prior, openSide: r.openSide, fullPrior: r.fullPrior, ablate: r.ablate, cls: ux ? classCounts(C, ux) : null, top })); };
  for (let r = 1; r <= +rounds; r++) {
    const kids = pool.map(() => evo.spawn()), jobs = kids.map(k => evo.job(k));
    const res = await Promise.all(pool.map((w, i) => run(w, { t: 'duel', job: jobs[i] })));
    const out = evo.record(kids, jobs, res);
    const last = out[out.length - 1];
    console.log(JSON.stringify({ round: r, gen: evo.gen, wallS: Math.round((Date.now() - t0) / 1000), champAcc: last.champAccNow, best: evo.bestAcc, kids: out.map(e => e.childAcc), reaped: out.filter(e => e.newChamp).length, plateau: out.some(e => e.plateau), champPost: out.map(e => e.champPost), level: last.level, fullAcc: last.fullAcc, uAcc: last.uAcc, beyond: last.beyond, cls: last.cls, ...(last.lexSeen != null ? { lex: { act: last.lexAct, seen: last.lexSeen, ret: last.lexRet, new: last.lexNew, rep: last.lexRep, fresh: last.freshAcc, famLive: last.famLive }, newAcc: last.newAcc, famAcc: last.famAcc, lexAcc: evo.lexAcc } : {}), ...(id === 'pong' ? { hit: evo.champ.bench && evo.champ.bench.hit, openSide: last.openSide, uHit: last.uHit, duelWinners: last.duelWinners } : {}) }));
    if (ABL && r % ABL === 0 && r < +rounds) await ablate(r);
  }
  if (ABL) await ablate('end');
  pool.forEach(w => w.terminate());
}
