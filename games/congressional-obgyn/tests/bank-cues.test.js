// Bank lint: the right answer must not be given away by length. node games/congressional-obgyn/tests/bank-cues.test.js
const fs = require('fs'), path = require('path');
global.window = global; global.COB_BANK = []; require(path.join(__dirname, '..', 'js', 'bank.js'));
let n = 0, longest = 0, fail = 0; const bad = [];
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
// bank source lists the correct option first (it is shuffled at play time)
for (const t of COB_BANK) for (const c of t.cases) for (const q of c.q) { const o = q[2], L = o.map(s => s.length), d = Math.max(...L.slice(1)); n++;
  if (L[0] >= d) longest++; if (L[0] > 2.5 * d) bad.push(t.id + ': ' + o[0].slice(0, 50)); }
ok(n > 100, n + ' questions scanned');
ok(bad.length === 0, 'no correct answer over 2.5x the longest distractor ' + JSON.stringify(bad.slice(0, 5)));
ok(longest / n < 0.75, 'correct option longest in ' + (100 * longest / n).toFixed(1) + '% (cap 75%)');
console.log(fail ? fail + ' FAILED' : 'ALL PASS'); process.exit(fail ? 1 : 0);
