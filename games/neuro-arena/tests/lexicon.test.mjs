// Headless test of the growing lexicon (js/lexicon.js) for Word completion.
// 1. Simulated cycles (no brain): a fake learner that gets a word right more often the more it has seen it.
//    Checks: the pool grows, new words arrive every cycle, held-out words are never drawn, the share of repeat
//    trials (words already shown >= 20 times) stays far below the old fixed-list curriculum's.
// 2. A real Evolution (3 short Word-completion generations through runDuel): per-word counts come back from the
//    duels, the lexicon grows, the new-vs-familiar test runs, and serialize/restore keeps the lexicon.
// usage: node tests/lexicon.test.mjs
import { lexNew, lexJob, lexDraw, lexUpdate, lexSummary, HELD, LEX, SRC, ADMIT, TXL } from '../js/lexicon.js';
import { mulberry32 } from '../js/brain.js';
import { Evolution, runDuel } from '../js/evo.js';
import { CONTEST, itemsAt } from '../js/contests.js';
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const HS = new Set(HELD.map(k => SRC[k]));
ok(SRC.length > 2600 && HELD.length === 300 && ADMIT.length === SRC.length - 300, `source ${SRC.length} words, ${HELD.length} held out, ${ADMIT.length} admissible`);
function sim(grow, cycles, perCycle = 33, levelAt = c => (c < 60 ? 0 : c < 120 ? 2 : c < 200 ? 3 : 4)) {
  const lx = lexNew(0), r = mulberry32(5), seenN = {}; let heldHits = 0; const rows = [];
  for (let c = 0; c < cycles; c++) { const lv = levelAt(c), wd = {};
    const J = lexJob(lx), fixed = itemsAt(CONTEST.text, lv);
    for (let t = 0; t < perCycle; t++) { const it = grow ? lexDraw(J, lv, r) : fixed[Math.floor(r() * fixed.length)], w = it[4];
      if (HS.has(w)) heldHits++; const n = seenN[w] || 0, right = r() < Math.min(0.9, 0.15 + 0.03 * n) ? 1 : 0; seenN[w] = n + 1;
      const a = wd[w] || (wd[w] = [0, 0]); a[0]++; a[1] += right; }
    rows.push(lexUpdate(lx, [wd], lv, c + 1)); }
  return { lx, rows, heldHits };
}
const G = sim(true, 300), S = sim(false, 300);
const seen = G.rows.map(r => r.seen), mono = seen.every((v, i) => !i || v >= seen[i - 1] + LEX.admit);
ok(mono, `pool grows: >= ${LEX.admit} never-seen words admitted every cycle (seen ${seen[0]} → ${seen[49]} → ${seen[149]} → ${seen[299]})`);
ok(G.rows.every(r => r.newN >= LEX.admit), 'new words every cycle');
ok(G.rows.every((r, i) => r.act <= LEX.cap[i < 60 ? 0 : i < 120 ? 2 : i < 200 ? 3 : 4]), 'active pool stays within the level cap');
ok(G.heldHits === 0, `held-out words never drawn (${G.heldHits})`);
const rep = rows => rows.slice(-100).reduce((a, r) => a + r.rep * r.trials, 0) / rows.slice(-100).reduce((a, r) => a + r.trials, 0);
const rG = rep(G.rows), rS = rep(S.rows);
ok(rG < rS * 0.6, `repeat share (trials on words already shown >= ${LEX.famN}×), last 100 cycles: growing ${(rG * 100).toFixed(1)}% vs fixed list ${(rS * 100).toFixed(1)}%`);
const sG = lexSummary(G.lx); console.log('  growing after 300 cycles:', JSON.stringify(sG));
const early = G.rows.slice(20, 60).reduce((a, r) => a + r.rep, 0) / 40, late = G.rows.slice(-40).reduce((a, r) => a + r.rep, 0) / 40;
console.log(`  repeat share growing: cycles 20-60 ${(early * 100).toFixed(1)}%, last 40 ${(late * 100).toFixed(1)}%; fixed list: ${(S.rows.slice(20, 60).reduce((a, r) => a + r.rep, 0) / 0.4).toFixed(1)}% → ${(S.rows.slice(-40).reduce((a, r) => a + r.rep, 0) / 0.4).toFixed(1)}%`);
// 2. real evolution
const evo = new Evolution({ contest: 'text', matchSec: 8, size: 1400, lamarck: true });
const s0 = lexSummary(evo.lex).seen;
for (let g = 0; g < 3; g++) { const k = evo.spawn(), j = evo.job(k); const res = runDuel(JSON.parse(JSON.stringify(j, (key, v) => v instanceof Float32Array ? Array.from(v) : v)));
  ok(res.wd && Object.keys(res.wd).length > 0, `gen ${g + 1}: the duel returned per-word counts for ${Object.keys(res.wd || {}).length} words`);
  if (g === 0) ok(res.lexT && res.lexT.newAcc != null && res.lexT.n[0] === LEX.testN, `gen 1: held-out test ran (${res.lexT && res.lexT.n})`);
  ok(Object.keys(res.wd).every(w => !HS.has(w)), 'no held-out word in the duel');
  evo.record([k], [j], [res]); }
const s1 = lexSummary(evo.lex); ok(s1.seen >= s0 + 3 * LEX.admit, `evolution: seen ${s0} → ${s1.seen}, active ${s1.active}`);
ok(evo.lexAcc && evo.lexAcc.newAcc != null, `new vs familiar recorded: ${JSON.stringify(evo.lexAcc)}`);
const R = Evolution.restore(JSON.parse(JSON.stringify(evo.serialize(true))));
ok(R && R.lex && lexSummary(R.lex).seen === s1.seen && R.lex.next === evo.lex.next, 'serialize/restore keeps the lexicon');
const old = evo.serialize(true); delete old.lex; const R2 = Evolution.restore(JSON.parse(JSON.stringify(old)));
ok(R2 && R2.lex && R2.lex.act.length === LEX.start, 'a save from before the lexicon gets a fresh one at its level');
console.log(fail ? `${fail} FAILED` : 'ALL PASS'); process.exit(fail ? 1 : 0);
