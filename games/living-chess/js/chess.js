/* ==========================================================================
   LIVING CHESS — chess.js : full rules (castling, en passant, promotion,
   check, mate, stalemate, threefold repetition, 50-move, insufficient
   material), SAN/UCI/FEN, perft, attack maps, pins, static exchange eval.
   Squares: 0..63, sq = rank*8 + file (a1 = 0, h8 = 63).
   Pieces: type 1..6 = P N B R Q K, colour bit 8 (0 white, 8 black).
   Every piece also carries a persistent id (ids[sq]) so the characters
   keep their names and memories as they move around the board.
   Works in the browser (window.LC) and in Node (module.exports).
   ========================================================================== */
(function (root) {
  'use strict';
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6, BLACK = 8;
  const VAL = [0, 100, 320, 330, 500, 900, 20000];
  const TYPES = ' pnbrqk';
  const NAMES = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const fileOf = s => s & 7, rankOf = s => s >> 3;
  const sqName = s => 'abcdefgh'[s & 7] + (1 + (s >> 3));
  const sqIdx = n => (n.charCodeAt(0) - 97) + 8 * (n.charCodeAt(1) - 49);
  const typeOf = p => p & 7, colOf = p => (p & 8) ? 1 : 0;
  // precomputed tables
  const KN = [], KG = [], RAYS = []; // RAYS[sq][dir] = list of squares
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0-3 rook, 4-7 bishop
  for (let s = 0; s < 64; s++) {
    const f = s & 7, r = s >> 3; KN[s] = []; KG[s] = []; RAYS[s] = [];
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) { const F = f + df, Rr = r + dr; if (F >= 0 && F < 8 && Rr >= 0 && Rr < 8) KN[s].push(Rr * 8 + F); }
    for (const [df, dr] of DIRS) { const F = f + df, Rr = r + dr; if (F >= 0 && F < 8 && Rr >= 0 && Rr < 8) KG[s].push(Rr * 8 + F); }
    for (const [df, dr] of DIRS) { const ray = []; let F = f + df, Rr = r + dr; while (F >= 0 && F < 8 && Rr >= 0 && Rr < 8) { ray.push(Rr * 8 + F); F += df; Rr += dr; } RAYS[s].push(ray); }
  }
  // zobrist (two 32-bit halves for a low-collision key)
  let seed = 0x9e3779b9; const rnd32 = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  const ZP = [], ZP2 = []; for (let i = 0; i < 16 * 64; i++) { ZP.push(rnd32()); ZP2.push(rnd32()); }
  const ZC = [], ZC2 = []; for (let i = 0; i < 16; i++) { ZC.push(rnd32()); ZC2.push(rnd32()); }
  const ZE = [], ZE2 = []; for (let i = 0; i < 8; i++) { ZE.push(rnd32()); ZE2.push(rnd32()); }
  const ZT = rnd32(), ZT2 = rnd32();
  const CASTLE_MASK = new Array(64).fill(15); CASTLE_MASK[0] = 15 & ~2; CASTLE_MASK[7] = 15 & ~1; CASTLE_MASK[4] = 15 & ~3; CASTLE_MASK[56] = 15 & ~8; CASTLE_MASK[63] = 15 & ~4; CASTLE_MASK[60] = 15 & ~12;
  // castling bits: 1 = K (white short), 2 = Q, 4 = k, 8 = q
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  class Chess {
    constructor(fen) { this.load(fen || START); }
    load(fen) {
      const parts = fen.trim().split(/\s+/);
      this.board = new Array(64).fill(0); this.ids = new Array(64).fill(-1);
      let r = 7, f = 0, nid = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; continue; }
        if (/\d/.test(ch)) { f += +ch; continue; }
        const t = TYPES.indexOf(ch.toLowerCase()); if (t < 1) throw new Error('bad fen ' + fen);
        const s = r * 8 + f; this.board[s] = t | (ch === ch.toLowerCase() ? BLACK : 0); this.ids[s] = nid++; f++;
      }
      this.nextId = nid;
      this.turn = (parts[1] || 'w') === 'w' ? 0 : 1;
      const c = parts[2] || '-'; this.castle = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
      this.ep = parts[3] && parts[3] !== '-' ? sqIdx(parts[3]) : -1;
      this.half = +(parts[4] || 0); this.full = +(parts[5] || 1);
      this.kings = [-1, -1]; for (let s = 0; s < 64; s++) if (typeOf(this.board[s]) === K) this.kings[colOf(this.board[s])] = s;
      this.stack = []; this.played = []; this.startFen = this.fen();
      this.computeHash(); this.keys = [this.key()];
      return this;
    }
    computeHash() {
      let h = 0, h2 = 0; for (let s = 0; s < 64; s++) if (this.board[s]) { h ^= ZP[this.board[s] * 64 + s]; h2 ^= ZP2[this.board[s] * 64 + s]; }
      h ^= ZC[this.castle]; h2 ^= ZC2[this.castle]; if (this.ep >= 0) { h ^= ZE[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; } if (this.turn) { h ^= ZT; h2 ^= ZT2; }
      this.h = h >>> 0; this.h2 = h2 >>> 0;
    }
    key() { return this.h.toString(36) + ':' + this.h2.toString(36); }
    clone() { const c = Object.create(Chess.prototype); Object.assign(c, this); c.board = this.board.slice(); c.ids = this.ids.slice(); c.kings = this.kings.slice(); c.stack = this.stack.slice(); c.played = this.played.slice(); c.keys = this.keys.slice(); return c; }
    fen() {
      let out = '';
      for (let r = 7; r >= 0; r--) { let e = 0; for (let f = 0; f < 8; f++) { const p = this.board[r * 8 + f]; if (!p) { e++; continue; } if (e) { out += e; e = 0; } const ch = TYPES[typeOf(p)]; out += colOf(p) ? ch : ch.toUpperCase(); } if (e) out += e; if (r) out += '/'; }
      let c = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : ''); if (!c) c = '-';
      // only print the ep square when a capture there is actually possible (standard practice, makes repetition keys honest)
      let ep = '-'; if (this.ep >= 0 && this.epCapturable()) ep = sqName(this.ep);
      return `${out} ${this.turn ? 'b' : 'w'} ${c} ${ep} ${this.half} ${this.full}`;
    }
    epCapturable() {
      const us = this.turn, pawn = P | (us ? BLACK : 0), ep = this.ep, f = ep & 7, r = ep >> 3, fromR = us ? r + 1 : r - 1;
      for (const df of [-1, 1]) { const F = f + df; if (F < 0 || F > 7) continue; if (this.board[fromR * 8 + F] === pawn) return true; }
      return false;
    }
    /* ----- attacks ----- */
    attacked(sq, by) { // is sq attacked by colour `by`
      const b = this.board, c8 = by ? BLACK : 0;
      for (const s of KN[sq]) if (b[s] === (N | c8)) return true;
      for (const s of KG[sq]) if (b[s] === (K | c8)) return true;
      const f = sq & 7, pr = by ? (sq >> 3) + 1 : (sq >> 3) - 1;
      if (pr >= 0 && pr < 8) { if (f > 0 && b[pr * 8 + f - 1] === (P | c8)) return true; if (f < 7 && b[pr * 8 + f + 1] === (P | c8)) return true; }
      const rays = RAYS[sq];
      for (let d = 0; d < 8; d++) { const ray = rays[d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (!p) continue; if ((p & 8) === c8) { const t = p & 7; if (t === Q || (d < 4 ? t === R : t === B)) return true; } break; } }
      return false;
    }
    /** every piece of colour `by` attacking sq (x-ray free), as squares */
    attackers(sq, by, board) {
      const b = board || this.board, c8 = by ? BLACK : 0, out = [];
      for (const s of KN[sq]) if (b[s] === (N | c8)) out.push(s);
      for (const s of KG[sq]) if (b[s] === (K | c8)) out.push(s);
      const f = sq & 7, pr = by ? (sq >> 3) + 1 : (sq >> 3) - 1;
      if (pr >= 0 && pr < 8) { if (f > 0 && b[pr * 8 + f - 1] === (P | c8)) out.push(pr * 8 + f - 1); if (f < 7 && b[pr * 8 + f + 1] === (P | c8)) out.push(pr * 8 + f + 1); }
      const rays = RAYS[sq];
      for (let d = 0; d < 8; d++) { const ray = rays[d]; for (let i = 0; i < ray.length; i++) { const p = b[ray[i]]; if (!p) continue; if ((p & 8) === c8) { const t = p & 7; if (t === Q || (d < 4 ? t === R : t === B)) out.push(ray[i]); } break; } }
      return out;
    }
    inCheck(c = this.turn) { return this.attacked(this.kings[c], 1 - c); }
    /* ----- move generation ----- */
    pseudo(capsOnly) {
      const b = this.board, us = this.turn, c8 = us ? BLACK : 0, out = [];
      const add = (from, to, flags, promo) => { const cap = flags === 'e' ? (P | (us ? 0 : BLACK)) : b[to]; out.push({ from, to, piece: b[from], captured: cap, promo: promo || 0, flags }); };
      for (let s = 0; s < 64; s++) {
        const p = b[s]; if (!p || (p & 8) !== c8) continue; const t = p & 7;
        if (t === P) {
          const dir = us ? -8 : 8, r = s >> 3, f = s & 7, last = us ? 0 : 7, startR = us ? 6 : 1, one = s + dir;
          const promoAdd = (to, fl) => { if ((to >> 3) === last) { for (const pp of [Q, R, B, N]) add(s, to, fl, pp); } else add(s, to, fl); };
          if (!capsOnly || ((one >> 3) === last)) {
            if (!b[one]) { promoAdd(one, 'n'); if (r === startR && !b[one + dir] && !capsOnly) add(s, one + dir, 'p'); }
          }
          for (const df of [-1, 1]) {
            const F = f + df; if (F < 0 || F > 7) continue; const to = one + df;
            if (b[to] && (b[to] & 8) !== c8) promoAdd(to, 'c');
            else if (to === this.ep) add(s, to, 'e');
          }
          continue;
        }
        if (t === N || t === K) {
          for (const to of (t === N ? KN[s] : KG[s])) { const q = b[to]; if (!q) { if (!capsOnly) add(s, to, 'n'); } else if ((q & 8) !== c8) add(s, to, 'c'); }
          if (t === K && !capsOnly) {
            const base = us ? 56 : 0, them = 1 - us;
            if (s === base + 4) {
              if ((this.castle & (us ? 4 : 1)) && !b[base + 5] && !b[base + 6] && b[base + 7] === (R | c8) && !this.attacked(base + 4, them) && !this.attacked(base + 5, them) && !this.attacked(base + 6, them)) add(s, base + 6, 'k');
              if ((this.castle & (us ? 8 : 2)) && !b[base + 3] && !b[base + 2] && !b[base + 1] && b[base] === (R | c8) && !this.attacked(base + 4, them) && !this.attacked(base + 3, them) && !this.attacked(base + 2, them)) add(s, base + 2, 'q');
            }
          }
          continue;
        }
        const d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
        for (let d = d0; d < d1; d++) { for (const to of RAYS[s][d]) { const q = b[to]; if (!q) { if (!capsOnly) add(s, to, 'n'); continue; } if ((q & 8) !== c8) add(s, to, 'c'); break; } }
      }
      return out;
    }
    moves(opts) {
      const ps = this.pseudo(opts && opts.capsOnly), out = [], us = this.turn;
      for (const m of ps) { this.make(m); if (!this.attacked(this.kings[us], 1 - us)) out.push(m); this.unmake(); }
      if (opts && opts.from != null) return out.filter(m => m.from === opts.from);
      return out;
    }
    make(m) {
      const b = this.board, ids = this.ids, us = this.turn;
      this.stack.push({ m, castle: this.castle, ep: this.ep, half: this.half, h: this.h, h2: this.h2, capId: -1, kings: this.kings[0] + this.kings[1] * 64 });
      const st = this.stack[this.stack.length - 1];
      let h = this.h, h2 = this.h2;
      const zp = (pc, s) => { h ^= ZP[pc * 64 + s]; h2 ^= ZP2[pc * 64 + s]; };
      h ^= ZC[this.castle]; h2 ^= ZC2[this.castle]; if (this.ep >= 0) { h ^= ZE[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; }
      const piece = b[m.from], id = ids[m.from];
      if (m.flags === 'e') { const cs = m.to + (us ? 8 : -8); st.capId = ids[cs]; zp(b[cs], cs); b[cs] = 0; ids[cs] = -1; }
      else if (b[m.to]) { st.capId = ids[m.to]; zp(b[m.to], m.to); }
      zp(piece, m.from); b[m.from] = 0; ids[m.from] = -1;
      const np = m.promo ? (m.promo | (us ? BLACK : 0)) : piece; b[m.to] = np; ids[m.to] = id; zp(np, m.to);
      if (m.flags === 'k' || m.flags === 'q') { const base = us ? 56 : 0, rf = m.flags === 'k' ? base + 7 : base, rt = m.flags === 'k' ? base + 5 : base + 3; const rp = b[rf]; zp(rp, rf); zp(rp, rt); b[rt] = rp; ids[rt] = ids[rf]; b[rf] = 0; ids[rf] = -1; }
      if ((piece & 7) === K) this.kings[us] = m.to;
      this.castle &= CASTLE_MASK[m.from] & CASTLE_MASK[m.to];
      this.ep = m.flags === 'p' ? (m.from + m.to) >> 1 : -1;
      this.half = ((piece & 7) === P || m.captured) ? 0 : this.half + 1;
      if (us) this.full++;
      this.turn = 1 - us;
      h ^= ZC[this.castle]; h2 ^= ZC2[this.castle]; if (this.ep >= 0) { h ^= ZE[this.ep & 7]; h2 ^= ZE2[this.ep & 7]; } h ^= ZT; h2 ^= ZT2;
      this.h = h >>> 0; this.h2 = h2 >>> 0;
    }
    unmake() {
      const st = this.stack.pop(), m = st.m, b = this.board, ids = this.ids; this.turn = 1 - this.turn; const us = this.turn;
      const id = ids[m.to];
      b[m.from] = m.piece; ids[m.from] = id;
      if (m.flags === 'e') { b[m.to] = 0; ids[m.to] = -1; const cs = m.to + (us ? 8 : -8); b[cs] = m.captured; ids[cs] = st.capId; }
      else { b[m.to] = m.captured; ids[m.to] = m.captured ? st.capId : -1; }
      if (m.flags === 'k' || m.flags === 'q') { const base = us ? 56 : 0, rf = m.flags === 'k' ? base + 7 : base, rt = m.flags === 'k' ? base + 5 : base + 3; b[rf] = b[rt]; ids[rf] = ids[rt]; b[rt] = 0; ids[rt] = -1; }
      this.castle = st.castle; this.ep = st.ep; this.half = st.half; this.h = st.h; this.h2 = st.h2; if (us) this.full--;
      this.kings[0] = st.kings % 64; this.kings[1] = (st.kings / 64) | 0;
    }
    /* ----- game-level moves (record history for repetition / undo) ----- */
    play(m) {
      if (typeof m === 'string') m = this.parse(m); if (!m) return null;
      const legal = this.moves().find(x => x.from === m.from && x.to === m.to && (x.promo || 0) === (m.promo || 0) || (x.from === m.from && x.to === m.to && !x.promo && !m.promo));
      if (!legal) return null;
      const san = this.san(legal), movedId = this.ids[legal.from], capSq = legal.flags === 'e' ? legal.to + (this.turn ? 8 : -8) : legal.to, capId = legal.captured ? this.ids[capSq] : -1;
      this.make(legal); const rec = Object.assign({}, legal, { san, uci: uci(legal), id: movedId, capId, capSq, check: this.inCheck(), fenAfter: null });
      this.played.push(rec); this.keys.push(this.key());
      return rec;
    }
    undo() { if (!this.played.length) return null; this.unmake(); this.keys.pop(); return this.played.pop(); }
    parse(s) {
      s = s.trim();
      if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(s)) return { from: sqIdx(s.slice(0, 2)), to: sqIdx(s.slice(2, 4)), promo: s[4] ? TYPES.indexOf(s[4]) : 0 };
      const clean = s.replace(/[+#!?]/g, '');
      return this.moves().find(m => this.san(m).replace(/[+#]/g, '') === clean) || null;
    }
    san(m) {
      if (m.flags === 'k') return this._sfx(m, 'O-O'); if (m.flags === 'q') return this._sfx(m, 'O-O-O');
      const t = m.piece & 7; let s = '';
      if (t === P) { if (m.captured) s = 'abcdefgh'[m.from & 7] + 'x'; s += sqName(m.to); if (m.promo) s += '=' + TYPES[m.promo].toUpperCase(); }
      else {
        s = TYPES[t].toUpperCase();
        const others = this.moves().filter(o => o.to === m.to && o.from !== m.from && o.piece === m.piece);
        if (others.length) { const sameF = others.some(o => (o.from & 7) === (m.from & 7)), sameR = others.some(o => (o.from >> 3) === (m.from >> 3)); if (!sameF) s += 'abcdefgh'[m.from & 7]; else if (!sameR) s += (1 + (m.from >> 3)); else s += sqName(m.from); }
        if (m.captured) s += 'x'; s += sqName(m.to);
      }
      return this._sfx(m, s);
    }
    _sfx(m, s) { this.make(m); const chk = this.inCheck(); let mate = false; if (chk) mate = this.moves().length === 0; this.unmake(); return s + (mate ? '#' : chk ? '+' : ''); }
    /* ----- results ----- */
    insufficient() {
      const minors = [[], []]; for (let s = 0; s < 64; s++) { const p = this.board[s]; if (!p) continue; const t = p & 7; if (t === K) continue; if (t === P || t === R || t === Q) return false; minors[colOf(p)].push({ t, c: ((s & 7) + (s >> 3)) & 1 }); }
      const all = minors[0].concat(minors[1]); if (all.length <= 1) return true;
      if (all.every(x => x.t === B)) return all.every(x => x.c === all[0].c); // bishops all on one colour
      return false;
    }
    repetitions() { const k = this.key(); let n = 0; for (const x of this.keys) if (x === k) n++; return n; }
    status() {
      const legal = this.moves();
      if (!legal.length) return this.inCheck() ? { over: true, result: this.turn ? '1-0' : '0-1', reason: 'checkmate', winner: 1 - this.turn } : { over: true, result: '1/2-1/2', reason: 'stalemate', winner: -1 };
      if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule', winner: -1 };
      if (this.repetitions() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition', winner: -1 };
      if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material', winner: -1 };
      return { over: false, check: this.inCheck(), legal };
    }
    perft(d) { if (d === 0) return 1; const ms = this.moves(); if (d === 1) return ms.length; let n = 0; for (const m of ms) { this.make(m); n += this.perft(d - 1); this.unmake(); } return n; }
    /* ----- analysis helpers ----- */
    /** squares of pieces of colour c that are absolutely pinned to their king, with pinner square */
    pins(c) {
      const out = {}, ks = this.kings[c], b = this.board, c8 = c ? BLACK : 0;
      for (let d = 0; d < 8; d++) {
        let own = -1;
        for (const s of RAYS[ks][d]) { const p = b[s]; if (!p) continue; if ((p & 8) === c8) { if (own >= 0) break; own = s; continue; } const t = p & 7; if (own >= 0 && (t === Q || (d < 4 ? t === R : t === B))) out[own] = s; break; }
      }
      return out;
    }
    /** static exchange evaluation of capturing on `to` with the piece on `from` (centipawns, from the mover's view) */
    see(from, to) {
      const b = this.board.slice(); const gain = []; let d = 0, side = colOf(b[from]), att = from;
      gain[0] = VAL[b[to] & 7] || 0; let onSq = b[from];
      b[to] = onSq; b[from] = 0; side = 1 - side;
      for (; ;) {
        d++; gain[d] = VAL[onSq & 7] - gain[d - 1];
        if (Math.max(-gain[d - 1], gain[d]) < 0) break;
        const atks = this.attackers(to, side, b); if (!atks.length) break;
        let best = atks[0]; for (const a of atks) if (VAL[b[a] & 7] < VAL[b[best] & 7]) best = a;
        onSq = b[best]; b[best] = 0; b[to] = onSq; side = 1 - side; if ((onSq & 7) === K && this.attackers(to, side, b).length) { break; }
      }
      while (--d) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
      return gain[0];
    }
    /** value at risk for the piece on sq if the opponent captures it now (0 if safe) */
    hangValue(sq) {
      const p = this.board[sq]; if (!p) return 0; const c = colOf(p), atks = this.attackers(sq, 1 - c); if (!atks.length) return 0;
      let best = 0; for (const a of atks) { const v = this.see(a, sq); if (v > best) best = v; }
      return best;
    }
    pieceList(c) { const out = []; for (let s = 0; s < 64; s++) { const p = this.board[s]; if (p && colOf(p) === c) out.push({ sq: s, p, t: p & 7, id: this.ids[s] }); } return out; }
    material(c) { let v = 0; for (let s = 0; s < 64; s++) { const p = this.board[s]; if (p && colOf(p) === c && (p & 7) !== K) v += VAL[p & 7]; } return v; }
  }
  const uci = m => sqName(m.from) + sqName(m.to) + (m.promo ? TYPES[m.promo] : '');
  const API = { Chess, P, N, B, R, Q, K, BLACK, VAL, NAMES, TYPES, START, KN, KG, RAYS, sqName, sqIdx, typeOf, colOf, fileOf, rankOf, uci };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.LC = API;
})(typeof window !== 'undefined' ? window : globalThis);
