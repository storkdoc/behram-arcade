/* ==========================================================================
   LIVING CHESS — jsengine.js : a small UCI-speaking alpha-beta engine used
   when Stockfish WASM can't load (old browser, no WebAssembly). It speaks
   the same subset of UCI that engine.js uses (position / go / setoption
   MultiPV / Skill Level / stop / isready), so the rest of the game never
   knows the difference. Runs as a Web Worker (importScripts chess.js) or
   in Node (require).
   Search: iterative deepening negamax, alpha-beta, quiescence, MVV-LVA,
   killers, transposition table, PeSTO-style middlegame/endgame tables.
   ========================================================================== */
(function () {
  'use strict';
  const L = (typeof LC !== 'undefined') ? LC : require('./chess.js');
  const { P, N, B, R, Q, K } = L;
  // PeSTO piece-square tables (white's view, a8 first as published)
  const MG = { 1: [0,0,0,0,0,0,0,0,98,134,61,95,68,126,34,-11,-6,7,26,31,65,56,25,-20,-14,13,6,21,23,12,17,-23,-27,-2,-5,12,17,6,10,-25,-26,-4,-4,-10,3,3,33,-12,-35,-1,-20,-23,-15,24,38,-22,0,0,0,0,0,0,0,0],
    2: [-167,-89,-34,-49,61,-97,-15,-107,-73,-41,72,36,23,62,7,-17,-47,60,37,65,84,129,73,44,-9,17,19,53,37,69,18,22,-13,4,16,13,28,19,21,-8,-23,-9,12,10,19,17,25,-16,-29,-53,-12,-3,-1,18,-14,-19,-105,-21,-58,-33,-17,-28,-19,-23],
    3: [-29,4,-82,-37,-25,-42,7,-8,-26,16,-18,-13,30,59,18,-47,-16,37,43,40,35,50,37,-2,-4,5,19,50,37,37,7,-2,-6,13,13,26,34,12,10,4,0,15,15,15,14,27,18,10,4,15,16,0,7,21,33,1,-33,-3,-14,-21,-13,-12,-39,-21],
    4: [32,42,32,51,63,9,31,43,27,32,58,62,80,67,26,44,-5,19,26,36,17,45,61,16,-24,-11,7,26,24,35,-8,-20,-36,-26,-12,-1,9,-7,6,-23,-45,-25,-16,-17,3,0,-5,-33,-44,-16,-20,-9,-1,11,-6,-71,-19,-13,1,17,16,7,-37,-26],
    5: [-28,0,29,12,59,44,43,45,-24,-39,-5,1,-16,57,28,54,-13,-17,7,8,29,56,47,57,-27,-27,-16,-16,-1,17,-2,1,-9,-26,-9,-10,-2,-4,3,-3,-14,2,-11,-2,-5,2,14,5,-35,-8,11,2,8,15,-3,1,-1,-18,-9,10,-15,-25,-31,-50],
    6: [-65,23,16,-15,-56,-34,2,13,29,-1,-20,-7,-8,-4,-38,-29,-9,24,2,-16,-20,6,22,-22,-17,-20,-12,-27,-30,-25,-14,-36,-49,-1,-27,-39,-46,-44,-33,-51,-14,-14,-22,-46,-44,-30,-15,-27,1,7,-8,-64,-43,-16,9,8,-15,36,12,-54,8,-28,24,14] };
  const EG = { 1: [0,0,0,0,0,0,0,0,178,173,158,134,147,132,165,187,94,100,85,67,56,53,82,84,32,24,13,5,-2,4,17,17,13,9,-3,-7,-7,-8,3,-1,4,7,-6,1,0,-5,-1,-8,13,8,8,10,13,0,2,-7,0,0,0,0,0,0,0,0],
    2: [-58,-38,-13,-28,-31,-27,-63,-99,-25,-8,-25,-2,-9,-25,-24,-52,-24,-20,10,9,-1,-9,-19,-41,-17,3,22,22,22,11,8,-18,-18,-6,16,25,16,17,4,-18,-23,-3,-1,15,10,-3,-20,-22,-42,-20,-10,-5,-2,-20,-23,-44,-29,-51,-23,-15,-22,-18,-50,-64],
    3: [-14,-21,-11,-8,-7,-9,-17,-24,-8,-4,7,-12,-3,-13,-4,-14,2,-8,0,-1,-2,6,0,4,-3,9,12,9,14,10,3,2,-6,3,13,19,7,10,-3,-9,-12,-3,8,10,13,3,-7,-15,-14,-18,-7,-1,4,-9,-15,-27,-23,-9,-23,-5,-9,-16,-5,-17],
    4: [13,10,18,15,12,12,8,5,11,13,13,11,-3,3,8,3,7,7,7,5,4,-3,-5,-3,4,3,13,1,2,1,-1,2,3,5,8,4,-5,-6,-8,-11,-4,0,-5,-1,-7,-12,-8,-16,-6,-6,0,2,-9,-9,-11,-3,-9,2,3,-1,-5,-13,4,-20],
    5: [-9,22,22,27,27,19,10,20,-17,20,32,41,58,25,30,0,-20,6,9,49,47,35,19,9,3,22,24,45,57,40,57,36,-18,28,19,47,31,34,39,23,-16,-27,15,6,9,17,10,5,-22,-23,-30,-16,-16,-23,-36,-32,-33,-28,-22,-43,-5,-32,-20,-41],
    6: [-74,-35,-18,-18,-11,15,4,-17,-12,17,14,17,17,38,23,11,10,17,23,15,20,45,44,13,-8,22,24,27,26,33,26,3,-18,-4,21,24,27,23,9,-11,-19,-3,11,21,23,16,7,-9,-27,-11,4,13,14,4,-5,-17,-53,-34,-21,-11,-28,-14,-24,-43] };
  const MGV = [0, 82, 337, 365, 477, 1025, 0], EGV = [0, 94, 281, 297, 512, 936, 0], PH = [0, 0, 1, 1, 2, 4, 0];
  // our square s (a1=0) for white -> table index (a8=0): ((7 - rank) * 8 + file); black mirrors rank
  function evaluate(c) {
    const b = c.board; let mg = 0, eg = 0, ph = 0;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (!p) continue; const t = p & 7, black = p & 8;
      const idx = black ? s : ((7 - (s >> 3)) * 8 + (s & 7));
      const m = MGV[t] + MG[t][idx], e = EGV[t] + EG[t][idx];
      if (black) { mg -= m; eg -= e; } else { mg += m; eg += e; } ph += PH[t];
    }
    ph = Math.min(24, ph); const v = (mg * ph + eg * (24 - ph)) / 24;
    return Math.round(c.turn ? -v : v) + 12; // tempo
  }
  const INF = 1e6, MATE = 30000;
  function Engine(out) {
    let pos = new L.Chess(), multipv = 1, skill = 20, stopFlag = false, nodes = 0, deadline = 0;
    const TT = new Map();
    let killers = [];
    function order(c, ms, ply, ttMove) {
      for (const m of ms) {
        let s = 0; if (ttMove && m.from === ttMove.from && m.to === ttMove.to && m.promo === ttMove.promo) s = 1e7;
        else if (m.captured) s = 1e6 + 10 * L.VAL[m.captured & 7] - L.VAL[m.piece & 7];
        else if (m.promo) s = 9e5;
        else if (killers[ply] && killers[ply].some(k => k && k.from === m.from && k.to === m.to)) s = 8e5;
        m._s = s;
      }
      ms.sort((a, b) => b._s - a._s);
    }
    function qs(c, a, b, ply) {
      nodes++; const stand = evaluate(c); if (stand >= b) return stand; if (stand > a) a = stand;
      if (ply > 30) return stand;
      const ms = c.pseudo(true); order(c, ms, ply, null);
      for (const m of ms) {
        if (m.captured && stand + L.VAL[m.captured & 7] + 200 < a && !m.promo) continue;
        c.make(m); if (c.attacked(c.kings[1 - c.turn], c.turn)) { c.unmake(); continue; }
        const v = -qs(c, -b, -a, ply + 1); c.unmake();
        if (v >= b) return v; if (v > a) a = v;
      }
      return a;
    }
    function search(c, depth, a, b, ply, pv) {
      if ((nodes & 1023) === 0 && Date.now() > deadline) stopFlag = true;
      if (stopFlag) return 0;
      pv.length = 0;
      if (ply > 0 && (c.half >= 100 || c.keys.lastIndexOf(c.key(), c.keys.length - 2) >= 0)) return 0;
      const inCheck = c.inCheck(); if (inCheck) depth++;
      if (depth <= 0) return qs(c, a, b, ply);
      nodes++;
      const key = c.key(), te = TT.get(key);
      if (te && te.d >= depth && ply > 0) { if (te.f === 0) return te.v; if (te.f === 1 && te.v >= b) return te.v; if (te.f === 2 && te.v <= a) return te.v; }
      const ms = c.pseudo(false); order(c, ms, ply, te && te.m);
      let best = -INF, bestM = null, legal = 0; const a0 = a, child = [];
      for (const m of ms) {
        c.make(m); if (c.attacked(c.kings[1 - c.turn], c.turn)) { c.unmake(); continue; }
        legal++; c.keys.push(c.key());
        let v;
        if (legal === 1) v = -search(c, depth - 1, -b, -a, ply + 1, child);
        else { v = -search(c, depth - 1, -a - 1, -a, ply + 1, child); if (v > a && v < b) v = -search(c, depth - 1, -b, -a, ply + 1, child); }
        c.keys.pop(); c.unmake();
        if (stopFlag) return 0;
        if (v > best) { best = v; bestM = m; pv.length = 0; pv.push(m); for (const x of child) pv.push(x); }
        if (v > a) a = v;
        if (a >= b) { if (!m.captured) { killers[ply] = killers[ply] || []; killers[ply].unshift(m); killers[ply].length = 2; } break; }
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      TT.set(key, { d: depth, v: best, f: best <= a0 ? 2 : best >= b ? 1 : 0, m: bestM });
      if (TT.size > 400000) TT.clear();
      return best;
    }
    function fmt(v) { if (Math.abs(v) > MATE - 500) { const plies = MATE - Math.abs(v), mv = Math.ceil(plies / 2); return 'mate ' + (v > 0 ? mv : -mv); } return 'cp ' + v; }
    function go(args) {
      const depthMax = +(args.match(/depth (\d+)/) || [0, 64])[1], movetime = +(args.match(/movetime (\d+)/) || [0, 0])[1];
      deadline = Date.now() + (movetime || (depthMax < 64 ? 60000 : 3000)); stopFlag = false; nodes = 0; killers = [];
      const c = pos.clone(), root = c.moves(); const t0 = Date.now();
      if (!root.length) { out('info depth 0 score ' + (c.inCheck() ? 'mate 0' : 'cp 0')); out('bestmove (none)'); return; }
      let results = root.map(m => ({ m, v: -INF, pv: [m] }));
      const k = Math.min(multipv, root.length);
      for (let d = 1; d <= depthMax; d++) {
        const next = [];
        // search the best known moves first; for MultiPV give each of the top k a full window, the rest a null window vs the k-th score
        results.sort((a, b) => b.v - a.v);
        let kth = -INF;
        for (let i = 0; i < results.length; i++) {
          const r = results[i], child = []; c.make(r.m); c.keys.push(c.key());
          let v;
          if (i < k) v = -search(c, d - 1, -INF, INF, 1, child);
          else { v = -search(c, d - 1, -kth - 1, -kth, 1, child); if (v > kth) v = -search(c, d - 1, -INF, INF, 1, child); }
          c.keys.pop(); c.unmake();
          if (stopFlag) break;
          next.push({ m: r.m, v, pv: [r.m].concat(child) });
          if (next.length >= k) { const s = next.map(x => x.v).sort((a, b) => b - a); kth = s[k - 1]; }
        }
        if (stopFlag && next.length < results.length) { // keep completed ones
          const done = new Set(next.map(x => x.m)); for (const r of results) if (!done.has(r.m)) next.push(r);
        }
        results = next.sort((a, b) => b.v - a.v);
        for (let i = 0; i < k; i++) { const r = results[i]; out(`info depth ${d} multipv ${i + 1} score ${fmt(r.v)} nodes ${nodes} time ${Date.now() - t0} pv ${r.pv.map(L.uci).join(' ')}`); }
        if (stopFlag) break;
        if (Math.abs(results[0].v) > MATE - 500 && d > 4) break;
      }
      let pick = results[0];
      if (skill < 20) { // weaker play: noise proportional to (20 - skill)
        const noise = (20 - skill) * 18; let bestS = -INF;
        for (const r of results) { if (r.v === -INF) continue; const s = r.v + (Math.random() - 0.5) * 2 * noise; if (s > bestS) { bestS = s; pick = r; } }
      }
      out('bestmove ' + L.uci(pick.m));
    }
    return {
      cmd(line) {
        line = String(line).trim();
        if (line === 'uci') { out('id name LivingChess JS'); out('uciok'); }
        else if (line === 'isready') out('readyok');
        else if (line.startsWith('setoption')) { const m = /name (.+?) value (.+)/.exec(line); if (m) { if (m[1] === 'MultiPV') multipv = +m[2]; if (m[1] === 'Skill Level') skill = +m[2]; } }
        else if (line === 'ucinewgame') TT.clear();
        else if (line.startsWith('position')) {
          const fm = /position (startpos|fen (.+?))(?: moves (.+))?$/.exec(line);
          pos = new L.Chess(fm[1] === 'startpos' ? L.START : fm[2]); if (fm[3]) for (const u of fm[3].split(' ')) pos.play(u);
        }
        else if (line.startsWith('go')) go(line);
        else if (line === 'stop') stopFlag = true;
      }
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Engine, evaluate };
  else if (typeof WorkerGlobalScope !== 'undefined') { const e = Engine(s => postMessage(s)); onmessage = ev => setTimeout(() => e.cmd(ev.data), 0); }
})();
