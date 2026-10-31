/* CHALICE — bot.js : a scripted player used for play-testing (every level must be winnable) and for
   the attract-mode demo behind the title screen. It only sends the same inputs a player can
   (move vector, SPACE = drop/swap, ENTER = flare) and re-plans from the live state every few frames,
   so the bat stealing things, dragons and gates all have to be handled for real. */
(function (root) {
  'use strict';
  const hyp = Math.hypot;
  function create(S, opts) {
    opts = opts || {};
    const w = S.w, W = w.W, H = w.H;
    const B = { goal: null, why: '', field: null, fieldKey: null, fieldT: 0, stuckT: 0, lastX: 0, lastY: 0, jig: 0, jx: 0, jy: 0, hunt: {}, log: [], t: 0, dropCD: 0 };
    function bfs(tx, ty) {
      const dist = new Int16Array(W * H).fill(-1), q = new Int32Array(W * H); let h = 0, t = 0;
      const s = Math.floor(ty) * W + Math.floor(tx); dist[s] = 0; q[t++] = s;
      while (h < t) { const i = q[h++], d = dist[i], x = i % W, y = (i - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (dist[j] >= 0) continue; if (S.solidP(nx, ny)) continue; dist[j] = d + 1; q[t++] = j; } }
      return dist;
    }
    const tileOf = (x, y) => Math.floor(y) * W + Math.floor(x);
    function reachFromPlayer() { return bfs(S.player.x, S.player.y); }
    function steer(tx, ty, dist) {
      // follow the BFS field toward the goal: look for the best tile within 2 steps that is straight-line reachable
      const P = S.player; const cx = Math.floor(P.x), cy = Math.floor(P.y);
      const cur = dist[cy * W + cx];
      if (cur < 0) return [tx - P.x, ty - P.y];
      if (cur <= 1) return [tx - P.x, ty - P.y];
      let best = null, bv = cur;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = dist[ny * W + nx]; if (v < 0 || v >= bv) continue;
        if (!clearLine(P.x, P.y, nx + 0.5, ny + 0.5)) continue; bv = v; best = [nx + 0.5, ny + 0.5];
      }
      if (!best) { // fall back to the lowest 4-neighbour, aiming at its centre
        let bv2 = cur; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const v = dist[(cy + dy) * W + cx + dx]; if (v >= 0 && v < bv2) { bv2 = v; best = [cx + dx + 0.5, cy + dy + 0.5]; } }
        if (!best) return [tx - P.x, ty - P.y];
        // first centre up on the axis we are not moving along, so the box slides into the gap
        const ex = best[0] - P.x, ey = best[1] - P.y;
        return Math.abs(ex) > Math.abs(ey) ? [ex, (cy + 0.5 - P.y) * 3] : [(cx + 0.5 - P.x) * 3, ey];
      }
      return [best[0] - P.x, best[1] - P.y];
    }
    function clearLine(x0, y0, x1, y1) {
      const n = Math.ceil(hyp(x1 - x0, y1 - y0) / 0.2);
      for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (!S.boxFree(x, y, 0.39, 0.39)) return false; }
      return true;
    }
    function goTo(x, y, key) {
      const k = key + ':' + Math.floor(x) + ',' + Math.floor(y);
      if (B.fieldKey !== k || B.fieldT <= 0) { B.field = bfs(x, y); B.fieldKey = k; B.fieldT = 20; }
      B.fieldT--;
      return steer(x, y, B.field);
    }
    function itemPos(it) { const P = S.player; return it.holder === 'player' ? [P.x, P.y] : [it.x, it.y]; }
    function plan() {
      const P = S.player, R = reachFromPlayer(), reach = (x, y) => R[tileOf(x, y)] >= 0;
      const held = P.held, sword = S.item('sword');
      const alive = S.dragons.filter(d => d.alive && reach(d.x, d.y));
      // hunting: with the sword in reach, clear the dragons that can reach us (each gets a time budget)
      const huntable = alive.filter(d => (B.hunt[d.id] || 0) < 45);
      if (huntable.length && sword && sword.holder !== 'bat' && (sword.holder === 'player' || reach(sword.x, sword.y))) {
        if (held !== sword) return { kind: 'fetch', item: sword, why: 'get the sword' };
        let best = null, bd = 1e9; for (const d of huntable) { const dd = hyp(d.x - P.x, d.y - P.y); if (dd < bd) { bd = dd; best = d; } }
        return { kind: 'hunt', dragon: best, why: 'hunt ' + best.id };
      }
      const ch = S.item('chalice');
      const chReach = ch && ch.holder !== 'bat' && (ch.holder === 'player' || reach(ch.x, ch.y));
      const jade = w.gates.find(g => g.key === 'jade');
      // open any gate whose key we can reach (gold last unless we hold the chalice)
      for (const g of w.gates) {
        if (g.open || g.key === 'jade') continue;
        const k = S.item(g.key); if (!k) continue;
        if (k.holder === 'bat') continue;
        if (k.holder === 'player' || reach(k.x, k.y)) {
          if (held === k) return { kind: 'gate', gate: g, why: 'open ' + g.key + ' gate' };
          if (onPedestal(k) && !(jade && jade.open)) continue;
          return { kind: 'fetch', item: k, why: 'fetch ' + g.key + ' key' };
        }
      }
      if (jade && !jade.open) {
        const keys = ['gold', 'black', 'white'].map(id => S.item(id));
        const free = w.pedestals.filter(p => !keys.some(k => !k.holder && hyp(k.x - p.x, k.y - p.y) < 1.0));
        for (const k of keys) {
          if (onPedestal(k) || k.holder === 'bat') continue;
          if (held === k) return { kind: 'pedestal', ped: free[0], why: 'lay ' + k.id + ' key' };
          if (reach(k.x, k.y)) return { kind: 'fetch', item: k, why: 'fetch ' + k.id + ' key for pedestal' };
        }
      }
      if (chReach) {
        if (held !== ch) return { kind: 'fetch', item: ch, why: 'fetch chalice' };
        return { kind: 'home', why: 'carry chalice home' };
      }
      // something we need is in the bat's claws: chase it down empty-handed
      if (S.bat && S.bat.held) return { kind: 'bat', why: 'chase the bat' };
      return { kind: 'wander', why: 'wander' };
    }
    function onPedestal(k) { return !k.holder && w.pedestals.some(p => hyp(k.x - p.x, k.y - p.y) < 1.0); }
    B.think = function () {
      const P = S.player; B.t++;
      const out = { mx: 0, my: 0, drop: false, flare: false };
      if (P.dead) { if (B.t % 40 === 0) out.drop = true; return out; }
      if (B.dropCD > 0) B.dropCD--;
      if (B.t % 6 === 1 || !B.goal) { const g = plan(); if (!B.goal || g.why !== B.goal.why) { B.log.push([+S.time.toFixed(1), g.why]); B.fieldT = 0; } B.goal = g; }
      const g = B.goal; let v = [0, 0];
      // danger: a chasing dragon close by and no sword in hand -> flare
      for (const d of S.dragons) { if (!d.alive) continue; const dd = hyp(d.x - P.x, d.y - P.y); if (dd < 3.2 && (d.state === 'chase' || d.state === 'bite') && P.held !== S.item('sword') && P.flareCD <= 0) out.flare = true; }
      if (g.kind === 'fetch') {
        const it = g.item; const [x, y] = itemPos(it);
        if (P.held && P.held !== it && S.touchable(it) && B.dropCD <= 0) { out.drop = true; B.dropCD = 20; }
        v = goTo(x, y, 'f' + it.id);
      } else if (g.kind === 'hunt') {
        const d = g.dragon; B.hunt[d.id] = (B.hunt[d.id] || 0) + 1 / 60;
        const dd = hyp(d.x - P.x, d.y - P.y);
        v = dd < 3.5 ? [d.x - P.x, d.y - P.y] : goTo(d.x, d.y, 'h' + d.id);
      } else if (g.kind === 'gate') {
        const c = g.gate.cells[0]; const gx = g.gate.x, gy = Math.floor(c / W) + 1.5;
        const dd = hyp(gx - P.x, gy - P.y);
        v = dd < 0.6 ? [0, -1] : goTo(gx, gy, 'g' + g.gate.key);
      } else if (g.kind === 'pedestal') {
        const p = g.ped; const dd = hyp(p.x - P.x, p.y + 0.8 - P.y);
        if (dd < 0.35) { out.drop = true; v = [0, -0.2]; } else v = dd < 1.2 ? [p.x - P.x, p.y + 0.8 - P.y] : goTo(p.x, p.y + 0.8, 'p' + p.x);
      } else if (g.kind === 'home') {
        const r = w.rooms.gold_inner; v = goTo(r.x0 + 10, r.y0 + 6, 'home');
      } else if (g.kind === 'bat') {
        if (P.held && B.dropCD <= 0) { out.drop = true; B.dropCD = 30; }
        v = goTo(S.bat.x, S.bat.y, 'bat');
        if (hyp(S.bat.x - P.x, S.bat.y - P.y) < 6 && P.flareCD <= 0) out.flare = true;
        if (B.t % 30 === 0) B.fieldT = 0;
      } else {
        const r = w.rooms.kingsroad; v = goTo(r.x0 + 10, r.y0 + 6, 'wander');
      }
      // un-stick
      if (B.t % 90 === 0) { if (hyp(P.x - B.lastX, P.y - B.lastY) < 0.4 && g.kind !== 'wander') { B.jig = 25; B.jx = Math.random() * 2 - 1; B.jy = Math.random() * 2 - 1; } B.lastX = P.x; B.lastY = P.y; }
      if (B.jig > 0) { B.jig--; v = [B.jx, B.jy]; }
      const m = hyp(v[0], v[1]); if (m > 1e-3) { out.mx = v[0] / m; out.my = v[1] / m; if (m < 0.25 && g.kind === 'fetch') { out.mx *= 0.6; out.my *= 0.6; } }
      return out;
    };
    return B;
  }
  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ChaliceBot = api;
})(this);
