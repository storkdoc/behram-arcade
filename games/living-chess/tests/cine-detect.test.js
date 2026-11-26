/* node games/living-chess/tests/cine-detect.test.js — every emotion trigger from a real position */
const LC = require('../js/chess.js'); global.LC = LC; const D = require('../js/cine-detect.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
function run(fen, uci, memo = {}) { const c = new LC.Chess(fen), b = c.clone(), rec = c.play(uci); if (!rec) throw new Error('illegal ' + uci + ' in ' + fen); return D.detect(b, rec, c, memo); }
const has = (cs, emo, tag, extra = {}) => cs.find(c => c.emo === emo && (!tag || c.tag === tag) && Object.entries(extra).every(([k, v]) => c[k] === v));
// check
let cs = run('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8'); check(has(cs, 'fear', 'check', { type: 6, side: 1 }), 'check -> enemy King fear', cs[0]);
// double check
// knight fork of king + rook: Nc7+ forking Ke8 and Ra8
cs = run('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7'); check(has(cs, 'fear', 'check') && cs[0].emo === 'fear', 'fork with check -> fear leads', cs.slice(0, 2));
// fork without check: knight attacks queen and rook
cs = run('1q3r2/8/8/4N3/8/8/8/K6k w - - 0 1', 'e5d7'); check(has(cs, 'fear', 'fork', { type: 5 }), 'knight forks queen+rook -> FORKED fear on the queen', cs[0]);
// attacked queen
cs = run('4k3/8/8/3q4/8/8/8/2B1K3 w - - 0 1', 'c1b2'); check(!has(cs, 'fear', 'attacked'), 'bishop b2 does not attack d5 queen (sanity)', cs);
cs = run('4k3/8/8/3q4/8/8/2P5/4K3 w - - 0 1', 'c2c4'); check(has(cs, 'fear', 'attacked', { type: 5 }), 'pawn attacks the queen -> queen fear', cs[0]);
// pin
cs = run('4k3/3n4/8/8/8/8/8/4KB2 w - - 0 1', 'f1b5'); check(has(cs, 'fear', 'pin', { type: 2, side: 1 }), 'Bb5 pins the knight to the king -> fear PINNED', cs.find(c => c.tag === 'pin'));
// capture: triumph + sadness (no avenger)
cs = run('4k3/8/8/8/8/8/r7/R3K3 w - - 0 1', 'a1a2'); check(has(cs, 'triumph', 'capture', { type: 4, side: 0 }), 'rook takes rook -> triumph', cs[0]);
check(has(cs, 'sadness', 'grief', { side: 1 }), '... the fallen side grieves (no avenger)', cs.find(c => c.emo === 'sadness'));
// capture with avenger: rage
cs = run('4k3/8/8/8/8/2n5/r7/R3K3 w - - 0 1', 'a1a2'); check(has(cs, 'rage', 'avenge', { type: 2, side: 1 }), 'knight can strike back -> rage', cs.find(c => c.emo === 'rage'));
// queen captured: dismay for the king
cs = run('4k3/8/8/8/8/8/q7/R3K3 w - - 0 1', 'a1a2'); check(has(cs, 'dismay', 'queenLost', { type: 6, side: 1 }), 'queen falls -> her King in dismay', cs.find(c => c.emo === 'dismay'));
// promotion
cs = run('8/P6k/8/8/8/8/8/4K3 w - - 0 1', 'a7a8q'); check(cs[0].emo === 'triumph' && cs[0].tag === 'promo' && cs[0].type === 5, 'promotion -> ASCENSION triumph', cs[0]);
// hope
const memo = {}; cs = run('7k/8/8/P7/8/8/8/4K3 w - - 0 1', 'a5a6', memo); check(has(cs, 'hope', 'march', { type: 1 }), 'pawn reaches 6th -> hope', cs[0]);
cs = run('7k/8/P7/8/8/8/8/4K3 w - - 0 1', 'a6a7', memo); check(has(cs, 'hope') && cs.find(c => c.emo === 'hope').prio >= 60, 'pawn reaches 7th -> stronger hope', cs.find(c => c.emo === 'hope'));
cs = run('7k/8/8/8/8/p7/8/4K3 b - - 0 1', 'a3a2'); check(has(cs, 'hope', 'march', { side: 1 }), 'black pawn reaches its 7th -> hope (both sides)', cs[0]);
// relief: escape check
cs = run('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'e1e2'); check(has(cs, 'relief', 'escape', { type: 6, side: 0 }), 'King steps out of check -> relief', cs.find(c => c.emo === 'relief'));
// relief: a hanging queen escapes
cs = run('4k3/8/8/8/1p6/Q7/8/4K3 w - - 0 1', 'a3h3'); check(has(cs, 'relief', 'saved', { type: 5 }), 'hanging queen escapes -> relief', cs.find(c => c.emo === 'relief'));
// quiet move: nothing
cs = run(LC.START, 'e2e4'); check(cs.length === 0, 'quiet opening move -> no scene', cs);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
