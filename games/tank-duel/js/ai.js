/* ==========================================================================
   TANK DUEL — ai.js   CPU opponent
   A* pathfinding on the tile grid (wall clearance + mover costs), delayed and
   noisy perception (it only knows what it could see: invisible tanks, night),
   lead aiming, a bank-shot search that traces real bounces with the game's
   own shell code, guided-missile steering, dodging and power-up greed.
   Four levels: ROOKIE, SERGEANT, VETERAN, ACE. None of them is perfect.
   ========================================================================== */
(function (root) {
  'use strict';
  const S = root.TDSim || (typeof require !== 'undefined' ? require('./sim.js') : null);
  const { COLS, ROWS, TANK_R, SHELL_R, wrapA, clamp } = S;
  const LEVELS = [
    { name: 'ROOKIE', react: 0.55, aimErr: 0.16, lead: 0.25, angles: 0, dodge: 0.08, hes: 0.55, turnSkill: 0.7, guide: 0.4, greed: 0.3, think: 0.35 },
    { name: 'SERGEANT', react: 0.35, aimErr: 0.09, lead: 0.6, angles: 24, dodge: 0.3, hes: 0.3, turnSkill: 0.85, guide: 0.65, greed: 0.6, think: 0.25 },
    { name: 'VETERAN', react: 0.22, aimErr: 0.05, lead: 0.85, angles: 48, dodge: 0.55, hes: 0.15, turnSkill: 1, guide: 0.85, greed: 0.8, think: 0.18 },
    { name: 'ACE', react: 0.14, aimErr: 0.028, lead: 1, angles: 72, dodge: 0.75, hes: 0.06, turnSkill: 1, guide: 1, greed: 1, think: 0.12 },
  ];
  function createAI(id, level, seed) {
    level = clamp(level | 0, 0, 3);
    const P = LEVELS[clamp(level | 0, 0, 3)], R = S.rng(seed || (1234 + id * 99 + level * 7));
    const gauss = () => (R() + R() + R() - 1.5) * 1.15;
    const ai = { id, P, hist: [], known: null, path: [], pathT: 0, goal: null, thinkT: 0, sol: null, errA: 0, stuckT: 0, revT: 0, revTurn: 1, dodgeIds: {}, dodgeT: 0, dodgeA: 0, fireN: 0, specN: 0, hesT: 0, strafeT: 0, strafeS: 1, goalIsPU: false, wander: null, lastSpec: 0, mines: [] };

    function sees(g, me, tgt) {
      if (tgt.spin > 0 && !g.v.invisible) return true;
      if (!S.isVisible(g, tgt)) return false;
      const d = Math.hypot(tgt.x - me.x, tgt.y - me.y);
      if (g.v.night) {
        if (tgt.visT > 0.2) return true; // muzzle flash
        if (d < 5.5) return true;
        const ang = Math.abs(wrapA(Math.atan2(tgt.y - me.y, tgt.x - me.x) - me.a));
        return ang < 0.6 && d < 13 && S.los(g, me.x, me.y, tgt.x, tgt.y);
      }
      if (g.v.weather === 'snow' && d > 16) return false;
      return true;
    }
    /* ---------- A* ---------- */
    function passable(g, x, y) { return x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1 && g.tiles[y * COLS + x] === S.EMPTY; }
    function cellCost(g, x, y) {
      let c = 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && !passable(g, x + dx, y + dy)) { c += 1.6; }
      for (const m of g.movers) { const minx = Math.min(m.ax, m.bx) - 1, maxx = Math.max(m.ax, m.bx) + m.w + 1, miny = Math.min(m.ay, m.by) - 1, maxy = Math.max(m.ay, m.by) + m.h + 1; if (x + 0.5 > minx && x + 0.5 < maxx && y + 0.5 > miny && y + 0.5 < maxy) c += 2.5; }
      for (const mn of ai.mines) if (Math.abs(mn.x - x - 0.5) < 1.5 && Math.abs(mn.y - y - 0.5) < 1.5) c += 40;
      return c;
    }
    function astar(g, sx, sy, gx, gy) {
      sx = clamp(Math.floor(sx), 1, COLS - 2); sy = clamp(Math.floor(sy), 1, ROWS - 2); gx = clamp(Math.floor(gx), 1, COLS - 2); gy = clamp(Math.floor(gy), 1, ROWS - 2);
      if (!passable(g, gx, gy)) { // nearest open cell to the goal
        let best = null, bd = 1e9; for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (passable(g, x, y)) { const d = (x - gx) ** 2 + (y - gy) ** 2; if (d < bd) { bd = d; best = [x, y]; } }
        if (!best) return []; [gx, gy] = best;
      }
      const N = COLS * ROWS, gs = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), open = [];
      const k0 = sy * COLS + sx, kg = gy * COLS + gx; gs[k0] = 0; open.push([Math.hypot(gx - sx, gy - sy), k0]);
      const costs = new Float32Array(N); for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) costs[y * COLS + x] = passable(g, x, y) ? cellCost(g, x, y) : 0;
      let it = 0;
      while (open.length && it++ < 4000) {
        let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        const [, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (closed[k]) continue; closed[k] = 1; if (k === kg) break;
        const x = k % COLS, y = (k / COLS) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (!passable(g, nx, ny)) continue;
          if (dx && dy && (!passable(g, x + dx, y) || !passable(g, x, y + dy))) continue;
          const nk = ny * COLS + nx; if (closed[nk]) continue;
          const ng = gs[k] + (dx && dy ? 1.414 : 1) * costs[nk];
          if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; open.push([ng + Math.hypot(gx - nx, gy - ny), nk]); }
        }
      }
      if (from[kg] < 0 && kg !== k0) return [];
      const path = []; for (let k = kg; k !== k0 && k >= 0; k = from[k]) path.push([k % COLS + 0.5, ((k / COLS) | 0) + 0.5]);
      return path.reverse();
    }
    function clearLine(g, x0, y0, x1, y1) { // wide enough for the hull
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, px = -dy / d * 0.42, py = dx / d * 0.42;
      return S.los(g, x0 + px, y0 + py, x1 + px, y1 + py) && S.los(g, x0 - px, y0 - py, x1 - px, y1 - py);
    }
    /* ---------- shooting ---------- */
    function predict(tg, t) { return [tg.x + tg.vx * t * P.lead, tg.y + tg.vy * t * P.lead]; }
    function findShot(g, me, tg) {
      const v = g.v, sp = (v.shell === 'guided' ? 8.5 : v.shell === 'seeker' ? 9.5 : 11.5) * (v.speed > 1 ? 1.1 : 1);
      const dist = Math.hypot(tg.x - me.x, tg.y - me.y);
      // intercept time for a direct shot
      let t = dist / sp; for (let k = 0; k < 3; k++) { const [px, py] = predict(tg, t); t = Math.hypot(px - me.x, py - me.y) / sp; }
      const [px, py] = predict(tg, t); const direct = Math.atan2(py - me.y, px - me.x);
      const cands = [];
      const test = (a, needBounce) => {
        const tr = S.traceShot(g, me.x, me.y, a); let best = null;
        for (const [x, y, tt, b] of tr.pts) {
          if (b > 0 && Math.hypot(x - me.x, y - me.y) < TANK_R + 0.3 && tt > 0.1) return null; // would hit ourselves
          const [qx, qy] = predict(tg, tt + 0.03); const d = Math.hypot(x - qx, y - qy);
          if (d < TANK_R + SHELL_R - 0.08) { if (needBounce && b === 0) return null; best = { a, t: tt, b }; break; }
        }
        return best;
      };
      if (!v.bank) { for (const off of [0, 0.06, -0.06, 0.12, -0.12]) { const r = test(direct + off, false); if (r) { cands.push(r); break; } } }
      if ((v.bounces > 0) && P.angles && (!cands.length || v.bank)) {
        const n = P.angles; for (let i = 0; i < n; i++) { const a = me.a + (i / n) * Math.PI * 2; const r = test(a, v.bank); if (r) cands.push(r); }
      }
      if (v.shell === 'guided' && !cands.length && P.angles && dist < 16) cands.push({ a: direct, t: dist / sp, b: 0, guided: 1 }); // we'll steer it in
      if (!cands.length) return null;
      cands.sort((A, B) => (Math.abs(wrapA(A.a - me.a)) + A.t * 0.35 + A.b * 0.15) - (Math.abs(wrapA(B.a - me.a)) + B.t * 0.35 + B.b * 0.15));
      return cands[0];
    }

    function think(g) {
      const me = g.tanks[id], tgt = g.tanks[1 - id], now = g.t;
      const inp = { turn: 0, thrust: 0, fire: false, fireN: ai.fireN, specN: ai.specN };
      if (g.phase !== 'play' || me.spin > 0) { ai.path = []; return inp; }
      // perception (delayed by reaction time)
      if (sees(g, me, tgt)) ai.hist.push({ t: now, x: tgt.x, y: tgt.y, vx: tgt.vx, vy: tgt.vy, spin: tgt.spin });
      while (ai.hist.length > 2 && ai.hist[1].t < now - P.react) ai.hist.shift();
      const obs = ai.hist.length && ai.hist[0].t <= now - P.react + 0.02 ? ai.hist[0] : null;
      if (obs) { const age = now - obs.t; ai.known = { x: obs.x + obs.vx * age * P.lead, y: obs.y + obs.vy * age * P.lead, vx: obs.vx, vy: obs.vy, t: obs.t, spin: obs.spin }; }
      const K = ai.known && now - ai.known.t < 6 ? ai.known : null;
      ai.mines = g.mines.filter(m => m.owner === id);
      const myShells = g.shells.filter(s => s.owner === id);
      // ---- dodge incoming shells (theirs, or our own ricochet) ----
      if (ai.dodgeT > 0) ai.dodgeT -= 1 / 60;
      for (const s of g.shells) {
        if (s.owner === id && s.bounce === 0) continue;
        if (ai.dodgeIds[s.id] === undefined) ai.dodgeIds[s.id] = R() < P.dodge * (s.owner === id ? 1.2 : 1);
        if (!ai.dodgeIds[s.id]) continue;
        const rx = me.x - s.x, ry = me.y - s.y, vv = s.vx * s.vx + s.vy * s.vy, tc = (rx * s.vx + ry * s.vy) / vv;
        if (tc < 0 || tc > 0.75) continue;
        const cx = s.x + s.vx * tc - me.x, cy = s.y + s.vy * tc - me.y;
        if (Math.hypot(cx, cy) < TANK_R + 0.45) { const away = Math.atan2(-cy || 0.01, -cx || 0.01); ai.dodgeT = 0.35; ai.dodgeA = away; }
      }
      // ---- choose a goal ----
      ai.thinkT -= 1 / 60;
      if (ai.thinkT <= 0) {
        ai.thinkT = P.think * (0.7 + R() * 0.6);
        let goal = null; ai.goalIsPU = false;
        const pu = g.pups.length ? g.pups.slice().sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0] : null;
        if (pu && R() < P.greed && Math.hypot(pu.x - me.x, pu.y - me.y) < 11 && (!K || Math.hypot(pu.x - me.x, pu.y - me.y) < Math.hypot(pu.x - K.x, pu.y - K.y) + 2)) { goal = [pu.x, pu.y]; ai.goalIsPU = true; }
        else if (g.hill && (R() < 0.5 + P.greed * 0.4)) goal = [g.hill.x + (R() - 0.5), g.hill.y + (R() - 0.5)];
        else if (K) goal = [K.x, K.y];
        else { if (!ai.wander || Math.hypot(ai.wander[0] - me.x, ai.wander[1] - me.y) < 1.5) ai.wander = [2 + R() * (COLS - 4), 2 + R() * (ROWS - 4)]; goal = ai.wander; }
        ai.goal = goal;
        ai.path = astar(g, me.x, me.y, goal[0], goal[1]);
        // the shot search
        const prev = ai.sol;
        ai.sol = K && (K.spin || 0) <= 0 ? findShot(g, me, K) : null;
        if (ai.sol && (!prev || Math.abs(wrapA(prev.a - ai.sol.a)) > 0.15)) ai.errA = gauss() * P.aimErr * clamp(Math.hypot(K.x - me.x, K.y - me.y) / 9, 0.5, 1.6);
      }
      // ---- guided: steer our missile at the target ----
      if (g.v.shell === 'guided' && myShells.length && K) {
        const s = myShells[0]; const want = Math.atan2(K.y - s.y, K.x - s.x); let d = wrapA(want - s.a);
        if (S.los(g, s.x, s.y, K.x, K.y)) { inp.turn = clamp(d * 3 * P.guide, -1, 1) * (R() < P.guide ? 1 : 0.3); inp.thrust = 0; return inp; }
      }
      // ---- aim & fire ----
      const canFire = me.reload <= 0 && myShells.length === 0;
      let aiming = false;
      if (ai.sol && K && ai.dodgeT <= 0) {
        const want = ai.sol.a + ai.errA, d = wrapA(want - me.a);
        const dist = Math.hypot(K.x - me.x, K.y - me.y);
        if (canFire || Math.abs(d) < 0.6) {
          aiming = true;
          inp.turn = clamp(d * 4 * P.turnSkill, -1, 1); inp.thrust = Math.abs(d) < 0.3 && dist > 7 && !g.v.bank ? 0.35 : 0;
          const tol = Math.max(0.025, Math.atan2(TANK_R * 0.6, Math.max(2, ai.sol.t * 11)));
          if (canFire && Math.abs(d) < tol + P.aimErr * 0.3) {
            if (ai.hesT <= 0) { ai.hesT = R() < P.hes ? 0.15 + R() * 0.35 : 0; }
            ai.hesT -= 1 / 60;
            if (ai.hesT <= 0) { ai.fireN++; inp.fireN = ai.fireN; ai.sol = null; ai.thinkT = Math.min(ai.thinkT, 0.25); ai.hesT = 0; }
          }
        }
      }
      // rookie wild shots
      if (!aiming && canFire && K && P.angles === 0 && R() < 0.004) { ai.fireN++; inp.fireN = ai.fireN; }
      // ---- specials ----
      if (me.sp.type && me.sp.n > 0 && now - ai.lastSpec > 2.5) {
        const t = me.sp.type, dK = K ? Math.hypot(K.x - me.x, K.y - me.y) : 99;
        if (t === 'mine' && K && dK < 9 && R() < 0.02 + P.greed * 0.02) { ai.specN++; ai.lastSpec = now; }
        else if (t === 'nitro' && ai.path.length > 8 && !aiming && R() < 0.02) { ai.specN++; ai.lastSpec = now; }
        else if (t === 'mega' && K && canFire) { const a = Math.atan2(K.y - me.y, K.x - me.x); if (Math.abs(wrapA(a - me.a)) < 0.05 && S.los(g, me.x, me.y, K.x, K.y, true) && !S.los(g, me.x, me.y, K.x, K.y)) { ai.specN++; ai.lastSpec = now; } else if (!aiming && dK < 14 && S.los(g, me.x, me.y, K.x, K.y, true) && !S.los(g, me.x, me.y, K.x, K.y)) { inp.turn = clamp(wrapA(a - me.a) * 4, -1, 1); aiming = true; } }
      }
      inp.specN = ai.specN;
      if (aiming) return inp;
      // ---- dodge / move ----
      if (ai.dodgeT > 0) {
        const d = wrapA(ai.dodgeA - me.a), back = Math.abs(d) > Math.PI / 2;
        const dd = back ? wrapA(d + Math.PI) : d; inp.turn = clamp(dd * 3, -1, 1); inp.thrust = back ? -1 : 1; return inp;
      }
      if (ai.revT > 0) { ai.revT -= 1 / 60; inp.thrust = -1; inp.turn = ai.revTurn; return inp; }
      // follow the path (skip ahead to the farthest waypoint in clear view)
      while (ai.path.length && Math.hypot(ai.path[0][0] - me.x, ai.path[0][1] - me.y) < 0.6) ai.path.shift();
      let wp = null; for (let i = Math.min(ai.path.length - 1, 6); i >= 0; i--) if (clearLine(g, me.x, me.y, ai.path[i][0], ai.path[i][1])) { wp = ai.path[i]; break; }
      if (!wp && ai.path.length) wp = ai.path[0];
      // keep a fighting range: no nose-to-nose brawls. With a clear line, hold off, sidestep while reloading, back off if crowded.
      if (K && !ai.goalIsPU && !g.hill) {
        const dK = Math.hypot(K.x - me.x, K.y - me.y), pd = 5.5 + level * 1.2;
        if (dK < pd && S.los(g, me.x, me.y, K.x, K.y)) {
          const toK = Math.atan2(K.y - me.y, K.x - me.x);
          if (ai.strafeT <= 0) { ai.strafeT = 0.6 + R() * 0.9; ai.strafeS = R() < 0.5 ? 1 : -1; }
          ai.strafeT -= 1 / 60;
          let want = toK + ai.strafeS * Math.PI / 2; if (dK < pd * 0.6) want = toK + Math.PI + ai.strafeS * 0.6;
          const px = me.x + Math.cos(want) * 1.2, py = me.y + Math.sin(want) * 1.2;
          if (level >= 1 && clearLine(g, me.x, me.y, px, py)) { const d = wrapA(want - me.a), back = Math.abs(d) > Math.PI / 2, dd = back ? wrapA(d + Math.PI) : d; inp.turn = clamp(dd * 3, -1, 1); inp.thrust = (back ? -1 : 1) * (Math.abs(dd) < 0.7 ? 0.9 : 0.2); return inp; }
          ai.strafeS = -ai.strafeS; wp = null;
        }
      }
      if (wp) {
        const want = Math.atan2(wp[1] - me.y, wp[0] - me.x), d = wrapA(want - me.a);
        inp.turn = clamp(d * 3, -1, 1); inp.thrust = Math.abs(d) < 0.45 ? 1 : Math.abs(d) < 1.1 ? 0.45 : 0;
        // stuck?
        if (inp.thrust > 0.3 && me.moving < 0.4) { ai.stuckT += 1 / 60; if (ai.stuckT > 0.7) { ai.stuckT = 0; ai.revT = 0.45; ai.revTurn = R() < 0.5 ? -1 : 1; ai.thinkT = 0; } } else ai.stuckT = Math.max(0, ai.stuckT - 1 / 60);
      } else if (K) { const d = wrapA(Math.atan2(K.y - me.y, K.x - me.x) - me.a); inp.turn = clamp(d * 3, -1, 1); }
      return inp;
    }
    ai.think = think;
    return ai;
  }
  const API = { createAI, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.TDAI = API;
})(typeof window !== 'undefined' ? window : globalThis);
