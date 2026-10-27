/* ==========================================================================
   LIVING CHESS — mind.js : what every piece sees, fears and wants.
   Pure + synchronous (Node-testable). Inputs come from engine.js:
     an     : analysis of the position with the player to move, MultiPV over
              (almost) every legal move -> lines [{uci, score, pv}]
     threat : analysis of the same position with the OPPONENT to move (null
              move) -> what they would do to us if we passed
     mem    : Memory (events each piece lived through)
   Each friendly piece walks every likely future (the principal variation
   plus the other good lines and the threat line) from its own point of
   view: does it survive, die on move N and to whom, deliver mate, win the
   queen, promote, or die for a decisive gain? Its emotion, gesture, point
   target and words all come from that, so its pleas carry real engine
   truth (or, for selfish temperaments, tagged self-interest).
   ========================================================================== */
(function () {
  'use strict';
  const L = (typeof LC !== 'undefined') ? LC : require('./chess.js');
  const { P, N, B, R, Q, K, VAL, sqName } = L;
  const TNAME = ['', 'Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King'];
  const MATE_T = 15000;
  const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const EMOTIONS = ['terror', 'pain', 'anxiety', 'calm', 'pride', 'thrill', 'longing', 'resolve', 'grief', 'joy'];

  /* ---------- temperaments (subtle; names are only the piece type) ---------- */
  // trust: honest pieces always give the engine's truth; selfish ones plead for their own skin; reckless ones want glory
  function temperament(type, id, startSq) {
    const h = ((id * 2654435761) >>> 0) % 100;
    switch (type) {
      case K: return { key: 'fearful', trust: 'selfish', voice: 'king' };
      case Q: return { key: 'proud', trust: 'honest', voice: 'queen' };
      case R: return { key: 'weary', trust: 'honest', voice: 'rook' };
      case B: return ((startSq & 7) === 2) ? { key: 'nervous', trust: 'selfish', voice: 'bishop' } : { key: 'devout', trust: 'honest', voice: 'bishop' };
      case N: return ((startSq & 7) === 6) ? { key: 'brave', trust: 'reckless', voice: 'knight' } : { key: 'steady', trust: 'honest', voice: 'knight' };
      default: return h < 22 ? { key: 'timid', trust: 'selfish', voice: 'pawn' } : h < 60 ? { key: 'ambitious', trust: 'honest', voice: 'pawn' } : { key: 'dutiful', trust: 'honest', voice: 'pawn' };
    }
  }

  /* ---------- memory ---------- */
  class Memory {
    constructor() { this.ev = {}; this.dead = {}; this.start = {}; this.ply = 0; this.used = {}; }
    init(chess) { for (let s = 0; s < 64; s++) if (chess.board[s]) this.start[chess.ids[s]] = s; }
    add(id, e) { (this.ev[id] = this.ev[id] || []).push(Object.assign({ ply: this.ply }, e)); }
    recent(id, maxAge = 2) { return (this.ev[id] || []).filter(e => this.ply - e.ply <= maxAge); }
    last(id, t) { const a = this.ev[id] || []; for (let i = a.length - 1; i >= 0; i--) if (!t || a[i].t === t) return a[i]; return null; }
    /** call with the position BEFORE the move and the move record (from Chess.play) */
    observe(before, rec) {
      const mover = L.colOf(rec.piece), them = 1 - mover;
      const after = before.clone(); after.play(rec.uci);
      this.ply++;
      // hanging status before/after for the mover's own pieces -> "saved"
      for (const pc of before.pieceList(mover)) {
        if (pc.id === rec.id && rec.captured === 0) { /* moved itself */ }
        const hb = before.hangValue(pc.sq); if (hb <= 0) continue;
        const sqA = after.ids.indexOf(pc.id); if (sqA < 0) continue;
        if (after.hangValue(sqA) <= 0) this.add(pc.id, { t: 'saved', by: rec.id === pc.id ? 'self' : TNAME[rec.piece & 7], san: rec.san });
      }
      if (rec.captured) {
        const vt = rec.captured & 7; this.dead[rec.capId] = { ply: this.ply, sq: sqName(rec.capSq), type: vt, by: TNAME[rec.piece & 7] };
        this.add(rec.id, { t: 'killed', victim: TNAME[vt], sq: sqName(rec.capSq) });
        for (const pc of after.pieceList(them)) this.add(pc.id, { t: 'friendDied', friend: TNAME[vt], sq: sqName(rec.capSq), by: TNAME[rec.piece & 7], dist: Math.max(Math.abs((pc.sq & 7) - (rec.capSq & 7)), Math.abs((pc.sq >> 3) - (rec.capSq >> 3))) });
        for (const pc of after.pieceList(mover)) if (pc.id !== rec.id) this.add(pc.id, { t: 'comradeKilled', victim: TNAME[vt], by: TNAME[rec.piece & 7] });
      }
      if (rec.promo) this.add(rec.id, { t: 'promoted', to: TNAME[rec.promo] });
      if (rec.check) this.add(rec.id, { t: 'gaveCheck' });
      // pieces of the other side newly attacked by this move
      for (const pc of after.pieceList(them)) {
        const nowA = after.attackers(pc.sq, mover).length; const sqB = before.ids.indexOf(pc.id); const wasA = sqB >= 0 ? before.attackers(sqB, mover).length : 0;
        if (nowA > wasA) this.add(pc.id, { t: 'attacked', by: TNAME[rec.piece & 7], from: sqName(rec.to) });
      }
      if (rec.check) this.add(after.ids[after.kings[them]], { t: 'checked', by: TNAME[rec.piece & 7] });
      return after;
    }
    unobserve() { this.ply = Math.max(0, this.ply - 1); for (const k in this.ev) this.ev[k] = this.ev[k].filter(e => e.ply <= this.ply); for (const k in this.dead) if (this.dead[k].ply > this.ply) delete this.dead[k]; }
    toJSON() { return { ev: this.ev, dead: this.dead, start: this.start, ply: this.ply }; }
  }

  /* ---------- lookahead: walk a PV and record each piece's fate ---------- */
  function walk(chess, pv, maxPly = 12) {
    const c = chess.clone(), S = chess.turn, fate = {}, sans = [], steps = [];
    const F = id => fate[id] || (fate[id] = { moves: [], captures: [], diedAt: -1, killer: null, killerSq: -1, killSq: -1, checks: [], mateAt: -1, promoAt: -1 });
    const mat0 = c.material(S) - c.material(1 - S);
    let n = 0;
    for (const u of pv) {
      if (n >= maxPly) break;
      const m0 = c.parse(u); if (!m0) break;
      const legal = c.moves().find(x => x.from === m0.from && x.to === m0.to && (x.promo || 0) === (m0.promo || 0)); if (!legal) break;
      const san = c.san(legal), id = c.ids[legal.from], capSq = legal.flags === 'e' ? legal.to + (c.turn ? 8 : -8) : legal.to, capId = legal.captured ? c.ids[capSq] : -1, side = c.turn;
      c.make(legal); c.keys.push(c.key());
      const f = F(id); f.moves.push(n);
      if (capId >= 0) { const v = F(capId); if (v.diedAt < 0) { v.diedAt = n; v.killer = legal.piece & 7; v.killerSq = legal.to; v.killerId = id; v.killSan = san; } f.captures.push({ ply: n, type: legal.captured & 7, id: capId, sq: capSq }); }
      if (legal.promo) f.promoAt = n;
      const chk = c.inCheck(); if (chk) { f.checks.push(n); if (!c.moves().length) f.mateAt = n; }
      sans.push(san); steps.push({ from: legal.from, to: legal.to, side, type: legal.piece & 7, cap: !!legal.captured, san });
      n++;
    }
    const mat1 = c.material(S) - c.material(1 - S);
    return { fate, sans, steps, matGain: mat1 - mat0, end: c, plies: n };
  }
  const movesWord = k => { const n = Math.max(1, Math.ceil((k + 1) / 2)); return n === 1 ? 'next move' : (NUMW[n] || n) + ' moves'; };
  const scoreTxt = s => Math.abs(s) >= MATE_T ? (s > 0 ? 'mate for us' : 'mate for them') : (s >= 0 ? '+' : '') + (s / 100).toFixed(1);
  const lineTxt = (sans, n = 5) => sans.slice(0, n).join(' ');

  /* ---------- dialogue ---------- */
  const T = {
    terror: [
      "Please, I'm hanging on {sq}, {atk} sees me!", "{atk} on {atksq} is staring right at me. Get me out of {sq}!", "I can't breathe, {atk} is aimed at {sq}! Do something!",
      "Nobody guards me here. One more second on {sq} and I'm gone!", "Look at {atk} on {atksq}. Look at it! It wants me.", "I'm worth more than {atkt} and it's coming for me. Please!",
      "If you leave me on {sq}, {atk} eats me. That is not a metaphor.", "My knees are shaking. {atk}. {atksq}. Me. Now. Help!",
    ],
    terrorKing: [
      "I'm in check! {atk} on {atksq}, get me out of here!", "Check! They have me in their sights. Protect me, please!", "The whole board can see me. Hide me, I beg you!",
      "Check from {atksq}! I'm not built for this, save me!",
    ],
    anxiety: [
      "I've looked ahead. {foresee} I don't like where this goes.", "I keep seeing it: {foresee}", "Something's wrong. {foresee} Please think about me.",
      "Count it out with me: {line}. I'm not in that picture at the end.", "{foresee} Maybe it's nothing. Maybe it's everything.", "I see a shadow on {ksq}. {foresee}",
    ],
    pain: [
      "{atk} just moved to {atksq} and now it's looking at me. That hurt.", "Ow. {atk} on {atksq} has me under attack. I'm defended, but still.", "That last move stung. I'm attacked on {sq}.",
      "They brought {atk} to {atksq} just to frighten me. It worked a little.",
    ],
    grief: [
      "They took our {friend} on {fsq}... I can still hear it.", "Our {friend} fell on {fsq}. I promised we'd both see the endgame.", "Gone. The {friend} on {fsq}. Make it mean something.",
      "I saw the {friend} go down on {fsq}. Let me avenge it.", "The {friend}... {fby} took it on {fsq}. I'll remember.",
    ],
    joy: [
      "Did you see that? I took their {victim} on {vsq}!", "Ha! Their {victim} is gone and I'm still standing!", "That's one {victim} fewer. What's next?",
      "I'm alive, and they're not. Best day of my life.", "You saved me last turn. I won't forget it.", "I wasn't sure you'd rescue me. Thank you.",
    ],
    joyPromo: ["I was a Pawn. Now look at me, a {to}!", "I made it to the end of the board! A {to}! Me!", "All those squares... and now I'm a {to}."],
    calm: [
      "All quiet on {sq}. I've looked {depthW} moves ahead and nothing touches me.", "I'm safe here. Watch the others.", "Steady. I'm guarded and patient.",
      "I like {sq}. Give me a reason to leave and I'll go.", "Nothing threatens me, but if you want my opinion: {move} is our best.", "I'm fine. Spend your worry on someone else.",
      "Calm as a stone. {move} is what I'd play.",
    ],
    pride: [
      "Look at me on {sq}. I hold this whole sector together.", "I defend {ndef} of our pieces from here. You're welcome.", "From {sq} I see {mob} squares. Don't move me without a reason.",
      "I've earned my square. {move} is the strongest move, if you want my counsel.",
    ],
    thrill: [
      "Send me forward! {move}, and {gain}!", "{move}! I've seen it: {line}. Trust me!", "Now! {move} and {target} on {tsq} falls!",
      "My blood is up. {move} and their position cracks: {line}", "I can fork their {forkA} and {forkB}! {move}!", "Give me {move}. I can taste it: {gain}.",
      "Send me forward, I can fork their {forkA} and {forkB}! {move}, then {line}.", "I've looked ahead: {move}, and {gain}. Let me go!",
    ],
    thrillMate: ["{move}! I see mate: {line}. Let me finish this!", "This is my dream: the King in a net. {move}! {line}", "Checkmate is right there. {move}, then {line}."],
    thrillAlly: ["{foresee} Play {move}!", "Do you see it? {foresee}", "{move} first. {foresee} I've waited my whole life for this.", "Trust the line: {line}. {foresee}"],
    longing: [
      "{promo} is {dist} steps away. I can see it from here.", "Just let me run. {promo}. A crown is waiting.", "Every night I dream of {promo}. Push me!",
      "I won't stay a Pawn forever. {move} and I'm closer to {promo}.", "Look how close the last rank is. {dist} more squares.",
    ],
    resolve: [
      "Let me die on {to}. Their {target} falls with me.", "{move}. I won't come back, and that's fine. {line}", "I've seen how this ends: I'm taken, but {foresee2} Do it.",
      "My dream is to give my life for the King's mate. {move} is how.", "Sacrifice me. {move}. I've done the arithmetic: {line}.",
    ],
    selfish: [
      "Forget the others, move ME. {move}!", "I don't care what the engine says, {move} keeps me alive!", "Them? They'll manage. I need {move}, now.",
      "Please, {move}. I'm too important to lose. (I think.)",
    ],
    reckless: ["Charge! {move}! Who needs safety?", "Let me at them! {move}! Glory favors the bold!", "{move}! Let's see if they flinch."],
    selfless: ["Don't worry about me. {best} is stronger, play it.", "I'll take my chances. {best} first.", "If I fall, I fall. {best} is the right move."],
  };
  function fill(tpl, ctx) { return tpl.replace(/\{(\w+)\}/g, (_, k) => ctx[k] != null ? ctx[k] : ''); }
  function pick(arr, id, mem, key) {
    mem = mem || { used: {} }; mem.used = mem.used || {}; const u = mem.used[id] = mem.used[id] || {};
    const h = (((id + 7) * 2654435761) ^ ((mem.ply || 0) * 40503)) >>> 0;
    let best = -1, bi = 0;
    for (let i = 0; i < arr.length; i++) { const last = u[key + i]; const age = last == null ? 999 : (mem.ply || 0) - last; const s = age * 10 + ((h >>> (i % 24)) & 7); if (s > best) { best = s; bi = i; } }
    return { text: arr[bi], commit: () => { u[key + bi] = mem.ply || 0; } };
  }

  /* ---------- main analysis ---------- */
  /**
   * think(chess, an, threat, mem, opts) -> { pieces: {id: thought}, army, bestUci }
   * opts.honest (default true): honest counsel vs raw emotions
   */
  function think(chess, an, threat, mem, opts = {}) {
    const S = chess.turn, them = 1 - S, honest = opts.honest !== false;
    const legal = chess.moves();
    const lines = (an && an.lines || []).filter(l => legal.some(m => L.uci(m) === l.uci)).sort((a, b) => b.score - a.score);
    const best = lines[0] || null, bestScore = best ? best.score : 0;
    const bestWalk = best ? walk(chess, best.pv) : null;
    const goodLines = lines.slice(0, 4).filter((l, i) => i === 0 || l.score >= bestScore - 60);
    const goodWalks = goodLines.map(l => (l === best ? bestWalk : walk(chess, l.pv)));
    const thr = threat && threat.lines && threat.lines[0] && !chess.inCheck() ? threat.lines[0] : null;
    let thrWalk = null;
    if (thr) { const nc = nullMove(chess); if (nc) thrWalk = walk(nc, thr.pv, 6); }
    const pins = chess.pins(S);
    const byFrom = {}; for (const l of lines) { const f = L.sqIdx(l.uci.slice(0, 2)); (byFrom[f] = byFrom[f] || []).push(l); }
    const sanOf = u => { const m = chess.parse(u); return m ? chess.san(chess.moves().find(x => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0)) || m) : u; };
    const bestSan = best ? sanOf(best.uci) : '';
    const out = {};
    const enemyQ = chess.pieceList(them).find(p => p.t === Q), enemyK = chess.kings[them];
    const depthW = an && an.depth ? Math.min(an.depth, 12) : 6;

    for (const pc of chess.pieceList(S)) {
      const id = pc.id, sq = pc.sq, t = pc.t, tm = temperament(t, id, mem && mem.start[id] != null ? mem.start[id] : sq);
      const atks = chess.attackers(sq, them), defs = chess.attackers(sq, S);
      const hang = t === K ? 0 : chess.hangValue(sq);
      let lowAtk = null; for (const a of atks) { const at = chess.board[a] & 7; if (VAL[at] < VAL[t] && (!lowAtk || VAL[at] < VAL[chess.board[lowAtk] & 7])) lowAtk = a; }
      const mainAtk = lowAtk != null ? lowAtk : atks.length ? atks.reduce((x, y) => VAL[chess.board[x] & 7] <= VAL[chess.board[y] & 7] ? x : y) : -1;
      const myLines = byFrom[sq] || [];
      const myBest = myLines[0] || null; const delta = myBest ? myBest.score - bestScore : -9999;
      const isBest = !!(best && L.sqIdx(best.uci.slice(0, 2)) === sq);
      const fB = bestWalk && bestWalk.fate[id];
      const fT = thrWalk && thrWalk.fate[id];
      // fate across the good futures
      let diesIn = 0, diesMin = 99, killer = null, killerSq = -1, killSan = '';
      goodWalks.forEach(w => { const f = w.fate[id]; if (f && f.diedAt >= 0) { diesIn++; if (f.diedAt < diesMin) { diesMin = f.diedAt; killer = f.killer; killerSq = f.killerSq; killSan = f.killSan; } } });
      const diesBest = fB && fB.diedAt >= 0 ? fB.diedAt : -1;
      const threatDie = fT && fT.diedAt >= 0 ? fT.diedAt : -1;
      const matesInBest = fB && fB.mateAt >= 0; const takesQueenBest = fB && fB.captures.find(c => c.type === Q);
      const bigCapBest = fB && fB.captures.slice().sort((a, b) => VAL[b.type] - VAL[a.type])[0];
      // forks & checks among this piece's own moves
      let fork = null, check = null;
      for (const m of legal) {
        if (m.from !== sq) continue;
        chess.make(m);
        const chk = chess.inCheck(them);
        const safe = t === K || chess.hangValue(m.to) <= 0;
        if (chk && safe && !check) check = m;
        if (safe) { const hits = []; for (const e of chess.pieceList(them)) if (chess.attackers(e.sq, S).includes(m.to) && (e.t === K || VAL[e.t] > VAL[t] || chess.attackers(e.sq, them).length === 0) && e.t !== P) hits.push(e); if (hits.length >= 2 && (!fork || hits.length > fork.hits.length)) fork = { m, hits }; }
        chess.unmake();
      }
      const relRank = S ? 7 - (sq >> 3) : (sq >> 3), promoSq = t === P ? sqName((sq & 7) + (S ? 0 : 56)) : '';
      // save move: the best-scoring root move after which this piece survives the next 4 plies of its line
      let save = null;
      if (hang > 0 || threatDie === 0 || (t === K && chess.inCheck())) {
        for (const l of lines) { const w = l === best ? bestWalk : walk(chess, l.pv, 4); const f = w.fate[id]; if (!f || f.diedAt < 0 || f.diedAt > 4) { save = l; break; } }
      }
      // ---- emotion ----
      let emo = 'calm', inten = 0.25, gesture = 'idle', point = null, ctx = {}, tone = 'honest', advice = null, foresee = [], why = '';
      const mmem = mem ? mem.recent(id, 2) : [];
      const memDied = mmem.filter(e => e.t === 'friendDied').sort((a, b) => a.dist - b.dist)[0];
      const memKill = mmem.find(e => e.t === 'killed' && mem.ply - e.ply <= 1), memSaved = mmem.find(e => e.t === 'saved' && mem.ply - e.ply <= 2), memPromo = mmem.find(e => e.t === 'promoted');
      const memAtk = mmem.find(e => e.t === 'attacked' && mem.ply - e.ply <= 1);
      ctx.sq = sqName(sq); ctx.move = bestSan; ctx.best = bestSan; ctx.depthW = NUMW[Math.min(10, Math.ceil(depthW / 2))] || 'a few';
      if (mainAtk >= 0) { ctx.atk = 'their ' + TNAME[chess.board[mainAtk] & 7]; ctx.atkt = 'a ' + TNAME[chess.board[mainAtk] & 7]; ctx.atksq = sqName(mainAtk); }
      // foreseen events (concrete moves and squares)
      if (diesBest > 0 && fB) foresee.push({ ply: diesBest, txt: `If we play ${bestSan}, in ${movesWord(diesBest)} their ${TNAME[fB.killer]} takes me with ${fB.killSan}.`, kind: 'die' });
      if (threatDie >= 0 && fT) foresee.push({ ply: threatDie, txt: threatDie === 0 ? `If we ignore it, ${fT.killSan} and I'm dead.` : `If we do nothing, they play ${thrWalk.sans[0]} and in ${movesWord(threatDie)} ${fT.killSan} kills me.`, kind: 'threat' });
      if (fB && takesQueenBest && !isBest) foresee.push({ ply: takesQueenBest.ply, txt: `If you play ${bestSan}, I take their Queen ${takesQueenBest.ply <= 1 ? 'right after' : Math.ceil(takesQueenBest.ply / 2) + ' moves later'}.`, kind: 'queen' });
      if (fB && matesInBest) foresee.push({ ply: fB.mateAt, txt: `In ${movesWord(fB.mateAt)} I deliver mate: ${lineTxt(bestWalk.sans, fB.mateAt + 1)}.`, kind: 'mate' });
      if (fB && fB.promoAt >= 0) foresee.push({ ply: fB.promoAt, txt: `In ${movesWord(fB.promoAt)} I reach the last rank.`, kind: 'promo' });
      foresee.sort((a, b) => a.ply - b.ply);
      ctx.foresee = foresee.length ? foresee[0].txt : ''; ctx.line = bestWalk ? lineTxt(bestWalk.sans) : ''; ctx.ksq = killerSq >= 0 ? sqName(killerSq) : (mainAtk >= 0 ? sqName(mainAtk) : ctx.sq);
      const inCheckK = t === K && chess.inCheck();
      const sacDecisive = isBest && diesBest >= 0 && diesBest <= 4 && (bestScore >= MATE_T || (bestWalk.matGain >= 250) || (bestWalk.fate && Object.values(bestWalk.fate).some(f => f.captures.some(c => c.type === Q && c.ply > diesBest - 2))));
      const winning = isBest && (bestScore >= MATE_T || (bestWalk && bestWalk.matGain >= (hang > 0 ? 300 : 200)) || (hang <= 0 && bigCapBest && bigCapBest.ply === 0 && chess.see(sq, bigCapBest.sq) > 0));
      // what our side gains in the best line, in words
      if (bestWalk) { let g = null; for (const f of Object.values(bestWalk.fate)) for (const c of f.captures) { const vs = chess.ids.indexOf(c.id); if (vs >= 0 && L.colOf(chess.board[vs]) === them && (!g || VAL[c.type] > VAL[g.type])) g = c; }
        ctx.gain = bestScore >= MATE_T ? `their King is mated in ${movesWord(bestWalk.plies - 1)}` : g ? `their ${TNAME[g.type]} on ${sqName(g.sq)} falls ${g.ply <= 0 ? 'at once' : 'in ' + movesWord(g.ply)}` : 'we take over the board'; }

      if (inCheckK) { emo = 'terror'; inten = 1; gesture = 'cower'; point = mainAtk; }
      else if (sacDecisive && t !== K) { emo = 'resolve'; inten = 0.95; gesture = 'salute'; const tq = Object.values(bestWalk.fate).flatMap(f => f.captures).find(c => c.type === Q); point = bestScore >= MATE_T ? enemyK : tq ? tq.sq : L.sqIdx(best.uci.slice(2, 4)); ctx.to = sqName(L.sqIdx(best.uci.slice(2, 4))); ctx.target = bestScore >= MATE_T ? 'King' : tq ? 'Queen' : 'army'; ctx.foresee2 = bestScore >= MATE_T ? 'their King is mated.' : tq ? 'their Queen falls.' : 'we come out ahead.'; why = 'sacrifice'; }
      else if (winning) { emo = 'thrill'; inten = bestScore >= MATE_T ? 1 : Math.min(1, 0.6 + bestWalk.matGain / 1200); gesture = 'point'; const tgt = bigCapBest || (fB && fB.captures[0]); point = bestScore >= MATE_T ? enemyK : tgt ? tgt.sq : L.sqIdx(best.uci.slice(2, 4)); ctx.target = tgt ? 'their ' + TNAME[tgt.type] : 'their position'; ctx.tsq = tgt ? sqName(tgt.sq) : ''; if (fork && L.uci(fork.m) === best.uci) { ctx.forkA = TNAME[fork.hits[0].t]; ctx.forkB = TNAME[fork.hits[1].t]; why = 'fork'; } }
      else if (fB && !isBest && (matesInBest || (takesQueenBest && hang <= 0))) { emo = 'thrill'; inten = matesInBest ? 0.95 : 0.8; gesture = 'point'; point = matesInBest ? enemyK : takesQueenBest.sq; why = 'ally'; const pos = foresee.find(f => f.kind === 'mate' || f.kind === 'queen'); if (pos) ctx.foresee = pos.txt; }
      else if (hang > 0 || (lowAtk != null && t !== P) || threatDie === 0) { emo = 'terror'; inten = Math.min(1, 0.55 + Math.max(hang, 100) / 900); gesture = 'cower'; point = mainAtk >= 0 ? mainAtk : (fT ? fT.killerSq : null); if (mainAtk < 0 && fT) { ctx.atk = 'their ' + TNAME[fT.killer]; ctx.atksq = sqName(fT.killerSq); } }
      else if ((diesBest >= 0 && diesBest <= 8) || (threatDie > 0 && threatDie <= 5)) { emo = 'anxiety'; inten = 0.5 + 0.4 / (1 + Math.min(diesBest >= 0 ? diesBest : 9, threatDie > 0 ? threatDie : 9)); gesture = 'glance'; point = diesBest >= 0 ? fB.killerSq : fT.killerSq; }
      else if (memPromo) { emo = 'joy'; inten = 0.9; gesture = 'cheer'; ctx.to = memPromo.to; why = 'promo'; }
      else if (memKill) { emo = 'joy'; inten = 0.8; gesture = 'cheer'; ctx.victim = memKill.victim; ctx.vsq = memKill.sq; why = 'kill'; }
      else if (memDied && memDied.dist <= 3) { emo = 'grief'; inten = 0.7; gesture = 'mourn'; ctx.friend = memDied.friend; ctx.fsq = memDied.sq; ctx.fby = 'their ' + memDied.by; point = L.sqIdx(memDied.sq); }
      else if (t === P && (relRank >= 5 || (fB && fB.promoAt >= 0))) { emo = 'longing'; inten = relRank >= 6 ? 0.9 : 0.65; gesture = 'gaze'; point = L.sqIdx(promoSq); ctx.promo = promoSq; ctx.dist = NUMW[7 - relRank]; }
      else if (memAtk && atks.length) { emo = 'pain'; inten = 0.55; gesture = 'flinch'; ctx.atk = 'their ' + memAtk.by; ctx.atksq = memAtk.from; point = L.sqIdx(memAtk.from); }
      else if (memSaved) { emo = 'joy'; inten = 0.6; gesture = 'salute'; why = 'saved'; }
      else if (memDied) { emo = 'grief'; inten = 0.45; gesture = 'mourn'; ctx.friend = memDied.friend; ctx.fsq = memDied.sq; ctx.fby = 'their ' + memDied.by; }
      else {
        const nd = chess.pieceList(S).filter(o => o.sq !== sq && chess.attackers(o.sq, S).includes(sq)).length;
        const mob = legal.filter(m => m.from === sq).length;
        if ((nd >= 2 || mob >= 10) && t !== P && t !== K) { emo = 'pride'; inten = 0.4; gesture = 'chest'; ctx.ndef = NUMW[nd] || nd; ctx.mob = mob; }
        else { emo = 'calm'; inten = 0.2; gesture = 'idle'; }
        if (isBest) { gesture = 'beckon'; inten = Math.max(inten, 0.45); point = L.sqIdx(best.uci.slice(2, 4)); }
      }
      // ---- advice (truthful, from the engine) ----
      if (best) {
        if (emo === 'terror' && save) {
          const sv = save, sSan = sanOf(sv.uci), cost = bestScore - sv.score;
          if (cost <= 30) { advice = { uci: sv.uci, san: sSan, score: sv.score, cost: 0 }; ctx.move = sSan; }
          else if (tm.trust === 'selfish' || t === K) { advice = { uci: sv.uci, san: sSan, score: sv.score, cost }; ctx.move = sSan; tone = 'selfish'; }
          else { advice = { uci: best.uci, san: bestSan, score: bestScore, cost: 0 }; tone = 'selfless'; }
        } else if (emo === 'terror' && !save) { advice = { uci: best.uci, san: bestSan, score: bestScore, cost: 0 }; tone = 'doomed'; }
        else if (tm.trust === 'reckless' && myBest && !isBest && emo !== 'grief') {
          // brave knight wants its own most aggressive move (a capture or check), even if worse
          const agg = myLines.find(l => { const m = chess.parse(l.uci); return m && (chess.board[m.to] || l.pv.length); });
          const a = agg || myBest; const cost = bestScore - a.score;
          if (cost > 60) { advice = { uci: a.uci, san: sanOf(a.uci), score: a.score, cost }; ctx.move = advice.san; tone = 'reckless'; }
          else advice = { uci: best.uci, san: bestSan, score: bestScore, cost: 0 };
        }
        else advice = { uci: best.uci, san: bestSan, score: bestScore, cost: 0 };
        if (tone === 'honest' && advice.uci !== best.uci) tone = 'honest';
      }
      // ---- words ----
      let bank;
      if (inCheckK) bank = T.terrorKing;
      else if (emo === 'terror') bank = tone === 'selfish' ? T.terror.concat(T.selfish) : tone === 'selfless' ? T.selfless : T.terror;
      else if (emo === 'thrill' && why === 'ally') bank = T.thrillAlly;
      else if (emo === 'thrill') bank = bestScore >= MATE_T ? T.thrillMate : why === 'fork' ? T.thrill.filter(s => s.includes('fork')).concat(T.thrill.slice(0, 2)) : T.thrill.filter(s => !s.includes('fork'));
      else if (emo === 'joy') bank = why === 'promo' ? T.joyPromo : why === 'saved' ? T.joy.slice(4) : T.joy.slice(0, 4);
      else if (tone === 'reckless') bank = T.reckless;
      else bank = T[emo];
      if (emo === 'anxiety' && !ctx.foresee) bank = T.terror.slice(4, 5);
      const pk = pick(bank, id, mem, emo + tone);
      let text = fill(pk.text, ctx).replace(/\s+/g, ' ').trim();
      // weave in memory now and then
      const lastSaved = mem && mem.last(id, 'saved');
      if (emo === 'terror' && lastSaved && mem.ply - lastSaved.ply <= 6 && mem.ply - lastSaved.ply > 0) text += ' You saved me once already. Again?';
      if (emo === 'anxiety' && foresee.length > 1) text += ' ' + foresee[1].txt;
      // honest counsel: truthful note on advice that isn't the best move
      if (honest && advice && advice.cost > 0) text += ` (Counsel: that costs about ${(advice.cost / 100).toFixed(1)}. ${bestSan} is stronger.)`;
      if (!honest && advice) { /* raw emotions: no tags, no numbers */ }
      // urgency: who calls out before you move
      const urg = { terror: 0.9, resolve: 0.95, thrill: 0.85, anxiety: 0.55, longing: 0.45, grief: 0.4, joy: 0.35, pain: 0.4, pride: 0.15, calm: 0.05 }[emo] * inten + (isBest ? 0.1 : 0);
      out[id] = {
        id, sq, type: t, side: S, name: TNAME[t], temperament: tm.key, voice: tm.voice, trust: tm.trust,
        emotion: emo, intensity: +inten.toFixed(2), gesture, point: point != null && point >= 0 ? point : null,
        text, commit: pk.commit, tone: honest ? tone : null, advice, foresee, urgency: +urg.toFixed(3),
        facts: { attackedBy: atks.length, defendedBy: defs.length, hang, pinned: pins[sq] != null, see: hang ? -hang : 0, canCheck: !!check, fork: fork ? { uci: L.uci(fork.m), hits: fork.hits.map(h => TNAME[h.t]) } : null, delta, isBest, diesBest, threatDie, relRank: t === P ? relRank : null, reachesQueen: !!(enemyQ && legal.some(m => m.from === sq && (m.to === enemyQ.sq))) },
      };
    }
    const army = best ? { uci: best.uci, san: bestSan, score: bestScore, line: bestWalk.sans.slice(0, 6), steps: bestWalk.steps.slice(0, 6) } : null;
    return { pieces: out, army, bestUci: best && best.uci, side: S, evalTxt: best ? scoreTxt(bestScore) : '' };
  }

  function nullMove(chess) {
    if (chess.inCheck()) return null;
    const parts = chess.fen().split(' '); parts[1] = chess.turn ? 'w' : 'b'; parts[3] = '-';
    try { const c = new L.Chess(parts.join(' ')); c.ids = chess.ids.slice(); return c; } catch (_) { return null; }
  }

  /**
   * React to a previewed move (hover/drag target). Every friendly piece looks at that move's foreseen line.
   * returns { uci, san, delta, verdict, line:[steps], pieces:{id:{react, txt}} }
   */
  function preview(chess, an, uci, think0) {
    const S = chess.turn, lines = (an && an.lines) || [], best = lines[0];
    const line = lines.find(l => l.uci === uci);
    const m = chess.parse(uci); if (!m) return null;
    const legalM = chess.moves().find(x => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0)); if (!legalM) return null;
    let score, pv;
    if (line) { score = line.score; pv = line.pv; }
    else { // not covered by MultiPV: estimate (SEE + whether it hangs) - always below the analysed ones
      chess.make(legalM); const hv = chess.hangValue(legalM.to); chess.unmake();
      score = (best ? best.score : 0) - 50 - hv + (legalM.captured ? VAL[legalM.captured & 7] : 0) * 0.2; pv = [uci];
    }
    const delta = best ? score - best.score : 0, w = walk(chess, pv, 8), out = {};
    const verdict = score >= MATE_T ? 'mate' : delta >= -15 ? 'best' : delta >= -70 ? 'ok' : delta >= -200 ? 'dubious' : 'blunder';
    for (const pc of chess.pieceList(S)) {
      const f = w.fate[pc.id]; let react = 'watch', txt = '';
      if (f && f.diedAt >= 0 && f.diedAt <= 6) { react = (verdict === 'best' || verdict === 'mate') && pc.id === chess.ids[legalM.from] ? 'brave' : 'horror'; txt = `${w.sans[f.diedAt]} — I die in ${movesWord(f.diedAt)}.`; }
      else if (f && (f.mateAt >= 0 || f.captures.some(c => c.type === Q))) { react = 'cheer'; txt = f.mateAt >= 0 ? 'That leads to mate!' : 'I get their Queen in that line!'; }
      else if (verdict === 'blunder') { react = 'headshake'; txt = `No! ${w.sans.slice(0, 3).join(' ')} and we're losing.`; }
      else if (verdict === 'dubious') { react = 'doubt'; txt = 'Hmm. There is better.'; }
      else if (verdict === 'mate' || (verdict === 'best' && w.matGain >= 200)) { react = 'cheer'; txt = 'Yes! That one!'; }
      else if (verdict === 'best') { react = 'nod'; txt = 'Good move.'; }
      out[pc.id] = { react, txt };
    }
    return { uci, san: chess.san(legalM), score, delta, verdict, line: w.steps, sans: w.sans, pieces: out };
  }

  const API = { think, preview, walk, Memory, temperament, TNAME, EMOTIONS, nullMove, scoreTxt, MATE_T, TEMPLATES: T };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else window.LCMind = API;
})();
