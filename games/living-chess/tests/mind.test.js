/* LIVING CHESS: emotion/advice model vs the real engine (vendored Stockfish WASM in Node).
   node games/living-chess/tests/mind.test.js */
const L = require('../js/chess.js'), M = require('../js/mind.js'), Engine = require('../js/engine.js');
let fails = 0; const check = (ok, msg, x) => { if (!ok) fails++; console.log(ok ? '  PASS' : '  FAIL', msg, x === undefined ? '' : JSON.stringify(x)); };
function nodeEngine(kind) {
  if (kind === 'js') { const t = { kind: 'js', onLine: null }; const E = require('../js/jsengine.js').Engine(l => setTimeout(() => t.onLine && t.onLine(l), 0)); t.post = c => setTimeout(() => E.cmd(c), 0); return new Engine(t); }
  const sf = require('../vendor/stockfish/stockfish-19-lite-single.js'); const t = { kind: 'stockfish', onLine: null };
  const p = sf(); let eng = null, q = []; t.post = c => eng ? eng.processCommand(c) : q.push(c);
  Promise.resolve(p).then(e => { eng = e; e.listener = l => t.onLine && t.onLine(l); for (const c of q) e.processCommand(c); q = []; });
  const E = new Engine(t); E._sf = p; return E;
}
async function analyse(E, chess, depth = 12) {
  const n = chess.moves().length;
  const an = await E.analyse(chess.fen(), { multipv: Math.min(n, 60), depth });
  let threat = null; const nc = M.nullMove(chess); if (nc) threat = await E.analyse(nc.fen(), { multipv: 2, depth: Math.max(6, depth - 4) });
  return { an, threat };
}
(async () => {
  for (const kind of process.argv[2] === 'js' ? ['js'] : ['stockfish', 'js']) {
    console.log('== engine:', kind);
    const E = nodeEngine(kind); await E.init(20000);
    const D = kind === 'js' ? 4 : 12;
    // 1) hanging piece: Bc4 attacked by the b5 pawn
    { const c = new L.Chess('rnbqkbnr/p1pp1ppp/8/1p2p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3'); const mem = new M.Memory(); mem.init(new L.Chess());
      const { an, threat } = await analyse(E, c, D); const th = M.think(c, an, threat, mem, { honest: true });
      const bi = th.pieces[c.ids[L.sqIdx('c4')]];
      check(bi.emotion === 'terror' && bi.facts.hang > 0, 'hanging bishop on c4 is terrified', { emo: bi.emotion, hang: bi.facts.hang, text: bi.text });
      check(bi.advice.uci === an.bestmove || bi.tone === 'selfish', 'its advice is the engine best move (or tagged selfish)', { adv: bi.advice.uci, best: an.bestmove, tone: bi.tone });
      check(th.army.uci === an.bestmove, 'army counsel = engine best move', [th.army.uci, an.bestmove]);
      check(bi.point === L.sqIdx('b5'), 'bishop points/cowers at the b5 pawn', bi.point);
      check(/b5|Pawn/.test(bi.text), 'plea names the attacker', bi.text);
      // preview: leaving the bishop en prise -> horror
      const pv = M.preview(c, an, 'a2a3'); check(pv && pv.pieces[bi.id].react === 'horror' && (pv.verdict === 'blunder' || pv.verdict === 'dubious'), 'preview of a2a3: bishop reacts with horror', pv && { r: pv.pieces[bi.id], v: pv.verdict, d: pv.delta });
    }
    // 2) fork available: Ne7+ forks Kg8 and Rc8
    { const c = new L.Chess('2r3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1'); const mem = new M.Memory(); mem.init(c);
      const { an, threat } = await analyse(E, c, D); const th = M.think(c, an, threat, mem, { honest: true });
      const kn = th.pieces[c.ids[L.sqIdx('d5')]];
      check(an.bestmove === 'd5e7', 'engine: Ne7+ is best', an.bestmove);
      check(kn.emotion === 'thrill' && kn.advice.uci === 'd5e7', 'knight is thrilled and asks for Ne7+', { emo: kn.emotion, adv: kn.advice && kn.advice.uci, text: kn.text });
      check(kn.facts.fork && kn.facts.fork.hits.includes('King') && kn.facts.fork.hits.includes('Rook'), 'fork of King and Rook detected', kn.facts.fork);
      check(/fork|Ne7/.test(kn.text), 'plea mentions the fork / the move', kn.text);
      check(kn.point === L.sqIdx('c8'), 'knight points at the rook it will win', kn.point);
    }
    // 3) queen sacrifice that mates: Qg8+ Rxg8 Nf7#
    { const c = new L.Chess('r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1'); const mem = new M.Memory(); mem.init(c);
      const { an, threat } = await analyse(E, c, D); const th = M.think(c, an, threat, mem, { honest: true });
      const q = th.pieces[c.ids[L.sqIdx('b3')]], kn = th.pieces[c.ids[L.sqIdx('h6')]];
      check(an.bestmove === 'b3g8', 'engine: Qg8+ is best', an.bestmove);
      check(q.emotion === 'resolve' && q.advice.uci === 'b3g8', 'queen resolves to martyr herself (Qg8+)', { emo: q.emotion, text: q.text });
      check(kn.emotion === 'thrill' && /mate/i.test(kn.text) && /Nf7#|g8/.test(kn.text + kn.foresee.map(f => f.txt).join(' ')), 'knight foresees delivering mate', { emo: kn.emotion, text: kn.text });
      const pv = M.preview(c, an, 'b3g8'); check(pv.verdict === 'mate' && pv.pieces[kn.id].react === 'cheer', 'preview Qg8+: knight cheers', pv.pieces[kn.id]);
    }
    // 4) threat lookahead: knight on f6 attacked in 2 moves (their Nd5... ) - we just check anxiety/terror is grounded in a line
    { const c = new L.Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4'); const mem = new M.Memory(); mem.init(new L.Chess());
      const { an, threat } = await analyse(E, c, D); const th = M.think(c, an, threat, mem, { honest: true });
      const all = Object.values(th.pieces); check(all.length === 16, 'one thought per black piece', all.length);
      check(all.every(p => p.text && p.text.length > 8 && !/\{|\}|undefined|NaN/.test(p.text)), 'every plea is filled in', all.filter(p => /\{|\}|undefined|NaN/.test(p.text)).map(p => p.text));
      const f7 = th.pieces[c.ids[L.sqIdx('f7')]]; console.log('    f7 pawn:', f7.emotion, '|', f7.text);
      check(['Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'].includes(th.pieces[c.ids[L.sqIdx('e8')]].name), 'pieces are named by type only');
      for (const p of all.sort((a, b) => b.urgency - a.urgency).slice(0, 4)) console.log('    ', p.name, L.sqName(p.sq), p.emotion, p.tone, '|', p.text);
    }
    // 5) variety: same piece, many turns -> no immediate template repeats
    { const c = new L.Chess('rnbqkbnr/p1pp1ppp/8/1p2p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 3'); const mem = new M.Memory(); mem.init(new L.Chess());
      const { an, threat } = await analyse(E, c, D); const seen = [];
      for (let i = 0; i < 6; i++) { mem.ply = i * 2; const th = M.think(c, an, threat, mem, {}); const p = th.pieces[c.ids[L.sqIdx('c4')]]; p.commit(); seen.push(p.text.replace(/ \(Counsel.*$/, '')); }
      check(new Set(seen).size >= 5, 'terror pleas vary across turns', new Set(seen).size);
    }
    if (E._sf) { const e = await E._sf; e.terminate && e.terminate(); }
  }
  console.log(fails ? `\n${fails} FAILED` : '\nALL MIND TESTS PASSED'); process.exit(fails ? 1 : 0);
})();
