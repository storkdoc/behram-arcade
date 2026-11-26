/* ==========================================================================
   LIVING CHESS — cine-detect.js : which emotional scene fits the move just
   played. Pure chess facts only (public: anyone looking at the board sees
   them), so it never reads a piece's private thoughts and never changes the
   game. Returns ranked candidates; the director (cine.js) throttles them.
     fear     — the King in check · a piece newly attacked and losing material
                (FORKED when two hang) · a piece newly pinned to its King
     sadness  — a friend of the fallen piece, nobody can avenge it
     dismay   — the Queen falls: her King cannot believe it
     rage     — a friend that can strike back at the capturer right now
     triumph  — the capturer · ASCENSION for a pawn that promotes
     hope     — a pawn reaching its 6th / 7th rank (more if it is passed)
     relief   — a hanging piece that escaped · the King out of check
   ========================================================================== */
(function (root) {
  'use strict';
  const LC = root.LC || (typeof require !== 'undefined' ? require('./chess.js') : null);
  const W = { 1: 6, 2: 20, 3: 20, 4: 28, 5: 45, 6: 0 }; // dramatic weight per type
  const cheb = (a, b) => Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)));
  const relRank = (sq, side) => side ? 7 - (sq >> 3) : (sq >> 3);
  function passed(ch, sq, side) {
    const f = sq & 7, r = sq >> 3, enemyPawn = LC.P | (side ? 0 : LC.BLACK);
    for (let df = -1; df <= 1; df++) { const F = f + df; if (F < 0 || F > 7) continue;
      for (let R = side ? r - 1 : r + 1; side ? R >= 0 : R < 8; side ? R-- : R++) if (ch.board[R * 8 + F] === enemyPawn) return false; }
    return true;
  }
  /**
   * @param before Chess before the move, rec = record from Chess.play, after = Chess after it
   * @param memo   object kept per game (one hope scene per pawn per rank)
   */
  function detect(before, rec, after, memo = {}) {
    const out = [], mover = LC.colOf(rec.piece), them = 1 - mover;
    const add = (c) => { const sq = c.sq; c.side = LC.colOf(after.board[sq]); c.type = after.board[sq] & 7; c.id = after.ids[sq]; out.push(c); };
    // 1. check
    if (after.inCheck(them)) {
      const ks = after.kings[them], ck = after.attackers(ks, mover);
      add({ emo: 'fear', tag: 'check', sq: ks, threat: ck[0], prio: ck.length > 1 ? 86 : 78, word: ck.length > 1 ? 'DOUBLE CHECK' : 'CHECK' });
    }
    // 2. promotion
    if (rec.promo) add({ emo: 'triumph', tag: 'promo', sq: rec.to, prio: 88, word: 'ASCENSION' });
    // 3. capture
    if (rec.captured) {
      const vt = rec.captured & 7;
      if (!rec.promo) add({ emo: 'triumph', tag: 'capture', sq: rec.to, threat: rec.capSq, prio: 30 + W[vt] + ((rec.piece & 7) === LC.P && vt >= 2 ? 5 : 0), word: 'TRIUMPH', victim: vt });
      if (vt === LC.Q) add({ emo: 'dismay', tag: 'queenLost', sq: after.kings[them], threat: rec.to, prio: 82, word: 'DISMAY', victim: vt });
      else {
        const avengers = after.attackers(rec.to, them).filter(s => (after.board[s] & 7) !== LC.K || !after.attacked(rec.to, mover));
        if (avengers.length && vt >= 2) {
          avengers.sort((a, b) => LC.VAL[after.board[a] & 7] - LC.VAL[after.board[b] & 7]);
          add({ emo: 'rage', tag: 'avenge', sq: avengers[0], threat: rec.to, prio: 30 + W[vt], word: 'RAGE', victim: vt });
        } else {
          let best = -1, bd = 99;
          for (const pc of after.pieceList(them)) { const d = cheb(pc.sq, rec.capSq) + (pc.t === LC.P ? 0.4 : 0); if (d < bd) { bd = d; best = pc.sq; } }
          if (best >= 0) add({ emo: 'sadness', tag: 'grief', sq: best, threat: rec.capSq, prio: 26 + W[vt], word: 'SORROW', victim: vt });
        }
      }
    }
    // 4. hope: a pawn marching toward the last rank
    if ((rec.piece & 7) === LC.P && !rec.promo) {
      const rr = relRank(rec.to, mover), key = rec.id + ':' + rr;
      if (rr >= 5 && !memo[key]) { memo[key] = 1; const pas = passed(after, rec.to, mover); add({ emo: 'hope', tag: 'march', sq: rec.to, goal: mover ? (rec.to & 7) : 56 + (rec.to & 7), prio: (rr === 6 ? 60 : 44) + (pas ? 8 : 0), word: 'HOPE' }); }
    }
    // 5. fear: newly hanging pieces of the side to move (forks, attacks)
    const hang = [];
    for (const pc of after.pieceList(them)) {
      if (pc.t === LC.K || pc.t === LC.P) continue;
      const hv = after.hangValue(pc.sq); if (hv <= 0) continue;
      const bsq = before.ids.indexOf(pc.id); if (bsq >= 0 && before.hangValue(bsq) > 0) continue;
      hang.push({ pc, hv });
    }
    if (hang.length) {
      hang.sort((a, b) => b.hv - a.hv); const h = hang[0], atk = after.attackers(h.pc.sq, mover);
      add({ emo: 'fear', tag: hang.length > 1 ? 'fork' : 'attacked', sq: h.pc.sq, threat: atk[0], prio: 30 + Math.min(40, h.hv / 900 * 40) + (hang.length > 1 ? 10 : 0), word: hang.length > 1 ? 'FORKED' : 'FEAR' });
    }
    // 6. fear: newly pinned to the King
    const pinsA = after.pins(them), pinsB = before.pins(them);
    for (const s in pinsA) {
      const sq = +s, t = after.board[sq] & 7; if (t === LC.P) continue;
      const id = after.ids[sq], bsq = before.ids.indexOf(id); if (bsq >= 0 && pinsB[bsq] != null) continue;
      add({ emo: 'fear', tag: 'pin', sq, threat: pinsA[s], prio: 48 + (t === LC.Q ? 16 : t === LC.R ? 6 : 0), word: 'PINNED' });
    }
    // 7. relief: escaped check, or a hanging piece of the mover is safe now
    if (before.inCheck(mover)) add({ emo: 'relief', tag: 'escape', sq: after.kings[mover], prio: 50, word: 'RELIEF' });
    let rel = null;
    for (const pc of before.pieceList(mover)) {
      if (pc.t === LC.K || pc.t === LC.P) continue; const hv = before.hangValue(pc.sq); if (hv < 250) continue;
      const nsq = after.ids.indexOf(pc.id); if (nsq < 0 || after.hangValue(nsq) > 0) continue;
      if (!rel || hv > rel.hv) rel = { sq: nsq, hv };
    }
    if (rel) add({ emo: 'relief', tag: 'saved', sq: rel.sq, prio: 28 + Math.min(26, rel.hv / 900 * 26), word: 'RELIEF' });
    out.sort((a, b) => b.prio - a.prio);
    return out;
  }
  const API = { detect };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.LCCineDetect = API;
})(typeof window !== 'undefined' ? window : globalThis);
