/* AGE OF EMBERS — pathfinding: A* with string-pulling for single units, Dijkstra flow fields for groups */
(function (E) {
  'use strict';
  const U = E.U;
  const P = E.Path = {};
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];
  let cap = 0, gS, came, stamp, closed, gen = 1, heap;
  const ensure = (n) => { if (n > cap) { cap = n; gS = new Float32Array(n); came = new Int32Array(n); stamp = new Int32Array(n); closed = new Int32Array(n); heap = new U.Heap(4096); gen = 1; } };
  const rectDist = (x, y, r) => { const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0, dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0; return { dx, dy }; };
  const octile = (dx, dy) => dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx;
  P.stats = { astar: 0, nodes: 0, flow: 0 };
  // line of sight across passable tiles (thick enough for a unit: checks a supercover line)
  P.los = function (pass, w, x0, y0, x1, y1) {
    let x = Math.floor(x0), y = Math.floor(y0); const ex = Math.floor(x1), ey = Math.floor(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
    let n = 1 + Math.abs(ex - x) + Math.abs(ey - y);
    let tMaxX = dx === 0 ? Infinity : ((sx > 0 ? (x + 1 - x0) : (x0 - x)) / dx), tMaxY = dy === 0 ? Infinity : ((sy > 0 ? (y + 1 - y0) : (y0 - y)) / dy);
    const tdx = dx === 0 ? Infinity : 1 / dx, tdy = dy === 0 ? Infinity : 1 / dy;
    for (; n > 0; n--) {
      if (!pass[y * w + x]) return false;
      if (Math.abs(tMaxX - tMaxY) < 1e-9) { if (!pass[y * w + x + sx] || !pass[(y + sy) * w + x]) return false; x += sx; y += sy; n--; tMaxX += tdx; tMaxY += tdy; }
      else if (tMaxX < tMaxY) { x += sx; tMaxX += tdx; } else { y += sy; tMaxY += tdy; }
    }
    return true;
  };
  // goal: {x0,y0,x1,y1, adj}  adj=true: stand next to the rect (blocked target); false: reach a tile inside it
  P.astar = function (pass, w, h, sx, sy, goal, maxNodes) {
    ensure(w * h); P.stats.astar++;
    gen++; if (gen > 2e9) { stamp.fill(0); closed.fill(0); gen = 1; }
    sx = U.clamp(Math.floor(sx), 0, w - 1); sy = U.clamp(Math.floor(sy), 0, h - 1);
    const isGoal = (x, y) => { const d = rectDist(x, y, goal); return goal.adj ? (d.dx <= 1 && d.dy <= 1 && !(x >= goal.x0 && x <= goal.x1 && y >= goal.y0 && y <= goal.y1)) : (d.dx === 0 && d.dy === 0); };
    const hfun = (x, y) => { const d = rectDist(x, y, goal); return octile(goal.adj ? Math.max(0, d.dx - 1) : d.dx, goal.adj ? Math.max(0, d.dy - 1) : d.dy); };
    const s = sy * w + sx; heap.n = 0;
    gS[s] = 0; stamp[s] = gen; came[s] = -1; heap.push(s, hfun(sx, sy));
    let best = s, bestH = hfun(sx, sy), found = -1, nodes = 0; maxNodes = maxNodes || 9000;
    while (heap.n > 0) {
      const c = heap.pop(); if (closed[c] === gen) continue; closed[c] = gen;
      const cx = c % w, cy = (c / w) | 0;
      if (isGoal(cx, cy) && (pass[c] || c === s)) { found = c; break; }
      const hc = hfun(cx, cy); if (hc < bestH) { bestH = hc; best = c; }
      if (++nodes > maxNodes) break;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx; if (!pass[ni]) continue;
        if (k >= 4 && (!pass[cy * w + nx] || !pass[ny * w + cx])) continue;
        const g = gS[c] + DC[k];
        if (stamp[ni] !== gen || g < gS[ni]) { stamp[ni] = gen; gS[ni] = g; came[ni] = c; heap.push(ni, g + hfun(nx, ny) * 1.001); }
      }
    }
    P.stats.nodes += nodes;
    const end = found >= 0 ? found : best; const raw = [];
    for (let c = end; c !== -1 && c !== s; c = came[c]) raw.push(c);
    raw.reverse();
    // string pulling
    const out = []; let ax = sx + 0.5, ay = sy + 0.5, i = 0;
    while (i < raw.length) {
      let j = raw.length - 1;
      for (; j > i; j--) { const t = raw[j]; if (P.los(pass, w, ax, ay, (t % w) + 0.5, ((t / w) | 0) + 0.5)) break; }
      const t = raw[j]; ax = (t % w) + 0.5; ay = ((t / w) | 0) + 0.5; out.push([ax, ay]); i = j + 1;
    }
    return { path: out, reached: found >= 0 };
  };
  // flow field: Float32 distance to goal for every reachable tile (Infinity elsewhere)
  P.flow = function (pass, w, h, goal) {
    P.stats.flow++;
    const N = w * h, dist = new Float32Array(N).fill(Infinity); const hp = new U.Heap(2048);
    for (let y = Math.max(0, goal.y0 - (goal.adj ? 1 : 0)); y <= Math.min(h - 1, goal.y1 + (goal.adj ? 1 : 0)); y++)
      for (let x = Math.max(0, goal.x0 - (goal.adj ? 1 : 0)); x <= Math.min(w - 1, goal.x1 + (goal.adj ? 1 : 0)); x++) {
        const i = y * w + x; if (!pass[i]) continue; if (goal.adj && x >= goal.x0 && x <= goal.x1 && y >= goal.y0 && y <= goal.y1) continue;
        dist[i] = 0; hp.push(i, 0);
      }
    if (hp.n === 0) { // goal blocked: seed from the nearest passable ring
      const gx = (goal.x0 + goal.x1) >> 1, gy = (goal.y0 + goal.y1) >> 1;
      for (let r = 1; r < 12 && hp.n === 0; r++) for (let y = gy - r; y <= gy + r; y++) for (let x = gx - r; x <= gx + r; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = y * w + x; if (pass[i] && Math.max(Math.abs(x - gx), Math.abs(y - gy)) === r) { dist[i] = r; hp.push(i, r); }
      }
    }
    while (hp.n > 0) {
      const c = hp.pop(); const cx = c % w, cy = (c / w) | 0, dc = dist[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx; if (!pass[ni]) continue;
        if (k >= 4 && (!pass[cy * w + nx] || !pass[ny * w + cx])) continue;
        const d = dc + DC[k]; if (d < dist[ni]) { dist[ni] = d; hp.push(ni, d); }
      }
    }
    return dist;
  };
  // next point to steer toward when standing at (x,y) on a flow field
  P.flowStep = function (dist, pass, w, h, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y), i = ty * w + tx; let best = -1, bd = dist[i];
    if (!(bd < Infinity)) bd = Infinity;
    for (let k = 0; k < 8; k++) {
      const nx = tx + DX[k], ny = ty + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx; if (!pass[ni]) continue;
      if (k >= 4 && (!pass[ty * w + nx] || !pass[ny * w + tx])) continue;
      if (dist[ni] < bd) { bd = dist[ni]; best = ni; }
    }
    if (best < 0) return null;
    // look two steps ahead for smoother motion
    const bx = best % w, by = (best / w) | 0; let b2 = -1, bd2 = bd;
    for (let k = 0; k < 8; k++) {
      const nx = bx + DX[k], ny = by + DY[k]; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx; if (!pass[ni]) continue; if (k >= 4 && (!pass[by * w + nx] || !pass[ny * w + bx])) continue;
      if (dist[ni] < bd2) { bd2 = dist[ni]; b2 = ni; }
    }
    if (b2 >= 0 && P.los(pass, w, x, y, (b2 % w) + 0.5, ((b2 / w) | 0) + 0.5)) return [(b2 % w) + 0.5, ((b2 / w) | 0) + 0.5, bd2];
    return [bx + 0.5, by + 0.5, bd];
  };
})(typeof window !== 'undefined' ? (window.EMB = window.EMB || {}) : (global.EMB = global.EMB || {}));
