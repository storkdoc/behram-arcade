// Shared loader: every multiple-choice question in the cabinet, as { game, id, stem, opts (correct FIRST), why }.
// Clinic Day bank (office/js/bank.js), SUTURE SELF! cases + complications (surgery/js/cases.js) and the breech
// mini-quiz (surgery/js/mini.js). Feud & Delivery has no multiple-choice prompts (answers are typed).
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..');
function words(s) { return String(s).split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length; }
function load() {
  const out = [];
  const w1 = { COB_BANK: [] }; w1.window = w1;
  new Function('window', 'COB_BANK', fs.readFileSync(path.join(D, 'office', 'js', 'bank.js'), 'utf8'))(w1, w1.COB_BANK);
  for (const t of w1.COB_BANK) t.cases.forEach((c, ci) => c.q.forEach((q, qi) =>
    out.push({ game: 'clinic', id: t.id + '/' + ci + '/' + qi, stem: q[1], opts: q[2], why: q[3] })));
  const w2 = {};
  new Function('window', fs.readFileSync(path.join(D, 'surgery', 'js', 'cases.js'), 'utf8'))(w2);
  const S = w2.SS, seen = new Set();
  const addQ = (id, q) => { if (!q || !q.opts || seen.has(q)) return; seen.add(q); out.push({ game: 'surgery', id, stem: q.q, opts: q.opts, why: q.why }); };
  for (const c of S.CASES) for (const st of c.steps()) for (const q of [st.quiz].concat(st.quizzes || [])) addQ(c.id + '/' + st.id, q);
  for (const k of Object.keys(S.SURPRISES)) addQ('surprise/' + k, S.SURPRISES[k].quiz);
  const mini = fs.readFileSync(path.join(D, 'surgery', 'js', 'mini.js'), 'utf8');
  const m = mini.match(/SM\.breech = function[\s\S]*?steps = (\[[\s\S]*?\n\s*\]),/);
  if (m) new Function('return ' + m[1])().forEach((s, i) => out.push({ game: 'surgery', id: 'mini/breech/' + i, stem: s.q, opts: [s.a].concat(s.w), why: null }));
  // dedupe identical surgery questions (shared step builders return fresh objects per case)
  const key = new Set();
  return out.filter(q => { const k = q.game + '|' + q.stem + '|' + q.opts.join('|'); if (key.has(k)) return false; key.add(k); return true; });
}
const ABS = /\b(always|never|all|none|only|every(?! (\d|other|day|week|month|year))|must|cannot|completely|entirely|permanently)\b/i;
const HEDGE = /\b(may|might|usually|often|generally|typically|can|could|probably|likely|ideally|consider)\b/i;
// Per-question length stats. Ties for longest/shortest are shared fractionally (a 3-way tie for longest counts 1/3),
// so the chance level is mean(1/N) whatever the tie pattern.
function stats(qs) {
  let cLongest = 0, cShortest = 0, cRatio = 0, longest = 0, strictLongest = 0, shortest = 0, chance = 0, ratioSum = 0, absC = 0, absD = 0, hedC = 0, hedD = 0, nD = 0; const over30 = [], aota = [];
  const pos = {};
  const rows = qs.map(q => {
    const L = q.opts.map(words), c = L[0], d = L.slice(1), avg = d.reduce((a, b) => a + b, 0) / d.length, maxD = Math.max(...d), minD = Math.min(...d);
    chance += 1 / L.length;
    if (c >= maxD) longest += 1 / (1 + d.filter(x => x === c).length); if (c > maxD) strictLongest++;
    if (c <= minD) shortest += 1 / (1 + d.filter(x => x === c).length);
    ratioSum += c / avg; if (c > 1.3 * maxD) over30.push(q.id + ' (' + c + ' vs ' + maxD + ' words)');
    const C = q.opts.map(o => o.length), cc = C[0], cd = C.slice(1);
    if (cc >= Math.max(...cd)) cLongest += 1 / (1 + cd.filter(x => x === cc).length);
    if (cc <= Math.min(...cd)) cShortest += 1 / (1 + cd.filter(x => x === cc).length);
    cRatio += cc / (cd.reduce((a, b) => a + b, 0) / cd.length);
    if (q.opts.some(o => /\b(all|none|both) of the (above|these)\b/i.test(o))) aota.push(q.id);
    if (ABS.test(q.opts[0])) absC++; if (HEDGE.test(q.opts[0])) hedC++;
    q.opts.slice(1).forEach(o => { nD++; if (ABS.test(o)) absD++; if (HEDGE.test(o)) hedD++; });
    return { id: q.id, L, rank: 1 + d.filter(x => x > c).length, ratio: c / avg };
  });
  const n = qs.length;
  return { n, chancePct: 100 * chance / n, longestPct: 100 * longest / n, strictLongestPct: 100 * strictLongest / n, shortestPct: 100 * shortest / n,
    meanRatio: ratioSum / n, charLongestPct: 100 * cLongest / n, charShortestPct: 100 * cShortest / n, charRatio: cRatio / n, over30, aota, absCorrectPct: 100 * absC / n, absDistractorPct: 100 * absD / nD, hedgeCorrectPct: 100 * hedC / n,
    hedgeDistractorPct: 100 * hedD / nD, rows, nOpts: [...new Set(qs.map(q => q.opts.length))] };
}
module.exports = { load, stats, words };
if (require.main === module) {
  const all = load();
  for (const g of ['clinic', 'surgery']) {
    const s = stats(all.filter(q => q.game === g));
    const f = x => x.toFixed(1) + '%';
    console.log(g + ': n=' + s.n + ' (options ' + s.nOpts + ', chance ' + f(s.chancePct) + ') correct is longest ' + f(s.longestPct) + ' (strictly ' + f(s.strictLongestPct) +
      '), shortest ' + f(s.shortestPct) + '; mean correct/avg-distractor words ' + s.meanRatio.toFixed(2) + '; >30% over longest distractor: ' + s.over30.length +
      '; absolute words correct/distractor ' + f(s.absCorrectPct) + '/' + f(s.absDistractorPct) + '; hedges ' + f(s.hedgeCorrectPct) + '/' + f(s.hedgeDistractorPct) +
      '; by characters: longest ' + f(s.charLongestPct) + ', shortest ' + f(s.charShortestPct) + ', ratio ' + s.charRatio.toFixed(2));
    if (s.over30.length) console.log('  over: ' + s.over30.join(', '));
    if (process.argv[2] === '-v') s.rows.filter(r => r.rank === 1).forEach(r => console.log('  ' + r.id + ' ' + r.L.join(',') + ' ' + r.ratio.toFixed(2)));
  }
}
