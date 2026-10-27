/* LIVING CHESS rules tests: perft on standard positions + draw/mate rules.  node games/living-chess/tests/rules.test.js */
const L = require('../js/chess.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
const PERFT = [
  ['startpos', L.START, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos4 mirrored', 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['pos6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];
for (const [name, fen, counts] of PERFT) {
  const c = new L.Chess(fen); const t0 = Date.now();
  counts.forEach((n, i) => { const got = c.perft(i + 1); check(got === n, `perft ${name} d${i + 1} = ${n}`, got === n ? undefined : got); });
  check(c.fen() === new L.Chess(fen).fen(), `${name}: make/unmake restores the position`);
  console.log('    (' + (Date.now() - t0) + ' ms)');
}
// mate, stalemate, repetition, 50-move, insufficient, ep, promotion, castling through check
{ const c = new L.Chess(); for (const m of ['f3', 'e5', 'g4', 'Qh4#']) c.play(m); const s = c.status(); check(s.over && s.reason === 'checkmate' && s.winner === 1, "fool's mate is checkmate for black", s); check(c.played[3].san === 'Qh4#', 'SAN shows #', c.played[3].san); }
{ const c = new L.Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); const s = c.status(); check(s.over && s.reason === 'stalemate', 'stalemate', s.reason); }
{ const c = new L.Chess(); for (let i = 0; i < 2; i++) for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8']) c.play(m); const s = c.status(); check(s.over && s.reason === 'threefold repetition', 'threefold repetition', s.reason); }
{ const c = new L.Chess('8/8/4k3/8/8/4K3/4R3/8 w - - 99 80'); check(!c.status().over, 'not over at 99 half-moves'); c.play('Ra2'); check(c.status().reason === 'fifty-move rule', '50-move rule at 100 half-moves', c.status().reason); }
{ check(new L.Chess('8/8/4k3/8/8/4K3/4B3/8 w - - 0 1').status().reason === 'insufficient material', 'K+B vs K is a draw'); check(!new L.Chess('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1').status().over, 'K+P vs K plays on'); }
{ const c = new L.Chess(); for (const m of ['e4', 'a6', 'e5', 'd5']) c.play(m); const ep = c.play('exd6'); check(ep && ep.flags === 'e' && !c.board[L.sqIdx('d5')], 'en passant removes the pawn', ep && ep.san); }
{ const c = new L.Chess('8/P6k/8/8/8/8/8/K7 w - - 0 1'); const ms = c.moves().filter(m => m.from === L.sqIdx('a7')); check(ms.length === 4, 'four promotion choices', ms.length); const r = c.play('a7a8n'); check(r && (c.board[L.sqIdx('a8')] & 7) === L.N && r.san === 'a8=N', 'underpromotion to knight', r && r.san); check(c.ids[L.sqIdx('a8')] === r.id, 'promoted piece keeps its identity'); }
{ const c = new L.Chess('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1'); check(!c.moves().some(m => m.flags === 'k'), 'no castling through an attacked square'); check(c.moves().some(m => m.flags === 'q'), 'long castling still allowed'); }
{ const c = new L.Chess(); const rid = c.ids[L.sqIdx('h1')]; for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'O-O']) c.play(m); check((c.board[L.sqIdx('f1')] & 7) === L.R && c.ids[L.sqIdx('f1')] === rid, 'castling moves the rook and keeps its id', c.ids[L.sqIdx('f1')]); c.undo(); check((c.board[L.sqIdx('h1')] & 7) === L.R && c.ids[L.sqIdx('h1')] === rid, 'undo restores the rook'); }
// SEE + pins
{ const c = new L.Chess('1k1r4/1pp4p/p7/4p3/8/P5P1/1PP4P/2K1R3 w - - 0 1'); check(c.see(L.sqIdx('e1'), L.sqIdx('e5')) === 100, 'SEE Rxe5 wins a pawn', c.see(L.sqIdx('e1'), L.sqIdx('e5'))); }
{ const c = new L.Chess('1k1r3q/1ppn3p/p4b2/4p3/8/P2N2P1/1PP1R1BP/2K1Q3 w - - 0 1'); check(c.see(L.sqIdx('d3'), L.sqIdx('e5')) < 0, 'SEE Nxe5 loses material', c.see(L.sqIdx('d3'), L.sqIdx('e5'))); }
{ const c = new L.Chess('4k3/8/8/1b6/8/8/4N3/4K3 w - - 0 1'); c.play('Kd1'); c.play('Kd8'); const pins = c.pins(0); check(Object.keys(pins).length === 0, 'no pin after king steps off', pins); }
{ const c = new L.Chess('4k3/8/8/1b6/8/3N4/8/5K2 w - - 0 1'); const pins = c.pins(0); check(pins[L.sqIdx('d3')] === L.sqIdx('b5'), 'knight on d3 pinned by b5 bishop', pins); }
console.log(fails ? `\n${fails} FAILED` : '\nALL RULES TESTS PASSED'); process.exit(fails ? 1 : 0);
