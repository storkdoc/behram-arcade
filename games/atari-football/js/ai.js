/* ==========================================================================
   ATARI FOOTBALL — ai.js
   Computer brains used for every player the humans aren't steering:
   play calling (down & distance), quarterback reads, ball-carrier steering,
   pursuit, man / zone / deep coverage, blocking and kick coverage.
   Every steering function returns a desired velocity in yards/second.
   ========================================================================== */
const AI = (() => {
  const OL = { C: 1, LG: 1, RG: 1 };
  const P = (G, i) => G.players[i];
  const seek = (p, x, y, speed) => { const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy); if (d < 0.05) return { x: 0, y: 0 }; const s = speed == null ? p.spd : speed; return { x: dx / d * s, y: dy / d * s }; };
  const arrive = (p, x, y, slow = 2.5) => { const d = Math.hypot(x - p.x, y - p.y); return seek(p, x, y, p.spd * Math.min(1, d / slow)); };
  /** pursuit with lead: aim where the target will be */
  function pursue(p, t) {
    const d = Math.hypot(t.x - p.x, t.y - p.y), lead = clamp(d / p.spd * 0.75, 0, 1.1);
    return seek(p, t.x + t.vx * lead, t.y + t.vy * lead);
  }
  const alive = q => q.st !== 'down' && q.st !== 'kneel';

  /* ---------------- play calling ---------------- */
  function weighted(list, last) {
    let tot = 0; for (const [id, w] of list) tot += id === last ? w * 0.35 : w;
    let r = Math.random() * tot;
    for (const [id, w] of list) { r -= id === last ? w * 0.35 : w; if (r <= 0) return id; }
    return list[0][0];
  }
  function callOffense(G, t) {
    const ytg = (goalX(t) - G.los) * teamDir(t), dn = G.down, tg = G.togo;
    const diff = G.score[t] - G.score[1 - t], late = G.q === 4 && G.clock < 75, halfEnd = (G.q === 2 || G.q === 4) && G.clock < 14;
    if (halfEnd && ytg <= 36 && !(G.q === 4 && diff < -3)) return 'fg';
    if (dn === 4) {
      const goForIt = (tg <= 2 && ytg < 55) || (late && diff < 0 && !(diff >= -3 && ytg <= 36)) || (tg <= 1 && ytg <= 5);
      if (!goForIt && ytg <= 36) return 'fg';
      if (!goForIt) return 'punt';
      return tg <= 2 ? weighted([['runl', 3], ['runr', 3], ['qbkeep', 3], ['short', 2]], G.lastPlay[t]) : weighted([['short', 3], ['cross', 3], ['deep', 2], ['screen', 1]], G.lastPlay[t]);
    }
    if (late && diff < 0) return weighted([['deep', 3], ['cross', 3], ['short', 3], ['pa', 1], ['screen', 1]], G.lastPlay[t]);
    if (tg <= 3) return weighted([['runl', 3], ['runr', 3], ['qbkeep', 2], ['sweep', 2], ['draw', 1], ['short', 2], ['pa', 2]], G.lastPlay[t]);
    if (tg <= 7) return weighted([['runl', 2], ['runr', 2], ['sweep', 2], ['draw', 1], ['short', 3], ['cross', 2], ['screen', 1], ['pa', 1], ['deep', 1]], G.lastPlay[t]);
    return weighted([['short', 3], ['cross', 3], ['deep', 2], ['screen', 2], ['pa', 1], ['draw', 2], ['sweep', 1], ['runl', 1], ['runr', 1]], G.lastPlay[t]);
  }
  function callDefense(G, t) {
    const o = 1 - t, ytg = (goalX(o) - G.los) * teamDir(o), dn = G.down, tg = G.togo;
    const lateLead = G.q === 4 && G.clock < 75 && G.score[t] > G.score[o];
    if (dn === 4 && tg > 3 && ytg > 36) return weighted([['zone', 2], ['man', 2], ['prevent', 1]]); // probably a punt
    if (lateLead) return weighted([['prevent', 3], ['zone', 2], ['man', 1]]);
    if (tg <= 3) return weighted([['stuff', 3], ['blitz', 2], ['contain', 2], ['man', 1]], G.lastPlay[t]);
    if (tg <= 7) return weighted([['man', 3], ['zone', 3], ['blitz', 2], ['contain', 1], ['stuff', 1]], G.lastPlay[t]);
    return weighted([['zone', 3], ['man', 2], ['prevent', 1], ['blitz', 2], ['contain', 1]], G.lastPlay[t]);
  }

  /* ---------------- quarterback reads ---------------- */
  function openness(G, r) {
    let m = 99;
    for (const q of G.players) if (q.team !== r.team && alive(q) && q.st !== 'eng') {
      const fx = r.x + r.vx * 0.5 - (q.x + q.vx * 0.4), fy = r.y + r.vy * 0.5 - (q.y + q.vy * 0.4);
      m = Math.min(m, Math.hypot(fx, fy));
    }
    return m;
  }
  function laneBlocked(G, qb, r) {
    const ax = r.x - qb.x, ay = r.y - qb.y, L2 = ax * ax + ay * ay || 1;
    for (const q of G.players) {
      if (q.team === qb.team || !alive(q)) continue;
      const u = ((q.x - qb.x) * ax + (q.y - qb.y) * ay) / L2;
      if (u < 0.15 || u > 0.85) continue;
      if (Math.hypot(qb.x + ax * u - q.x, qb.y + ay * u - q.y) < 1.0) return true;
    }
    return false;
  }
  function qb(G, q) {
    const pl = G.play, t = pl.t, d = teamDir(q.team);
    if (pl.scramble) return null;
    const pressure = G.players.some(p => p.team !== q.team && alive(p) && p.st !== 'eng' && Math.hypot(p.x - q.x, p.y - q.y) < 2.6);
    if (t < 0.75 && !pressure) return null;
    const prim = OI[pl.o.primary] + q.team * 7;
    let best = null, bs = -99;
    for (const r of ['WR1', 'WR2', 'RB']) {
      const p = P(G, q.team * 7 + OI[r]); if (!alive(p)) continue;
      if (r === 'RB' && pl.o.rbBlock) continue;
      const open = openness(G, p), depth = (p.x - G.los) * d;
      if (p.y < 1 || p.y > FIELD_W - 1) continue;
      let s = open + clamp(depth, -3, 25) * 0.07 + (p.i === prim && t < 1.8 ? 0.9 : 0);
      if (laneBlocked(G, q, p)) s -= 2.5;
      if (s > bs) { bs = s; best = p; }
    }
    let th = 3.7 - Math.max(0, t - 0.9) * 0.85; if (pressure) th -= 1.3;
    if (best && bs >= th) return { throwTo: best.i };
    if (t > 4.6 || (pressure && t > 2.4 && bs < 0.6)) {
      if (best && bs > 1.2) return { throwTo: best.i };
      pl.scramble = true;
    }
    return null;
  }

  /* ---------------- ball carrier steering ---------------- */
  function runner(G, p) {
    if (p.ri < p.route.length) { // designed path first
      const w = p.route[p.ri];
      if (Math.hypot(w.x - p.x, w.y - p.y) < 1.3) p.ri++;
      else { // abandon the path if somebody is right in it
        const threat = G.players.some(q => q.team !== p.team && alive(q) && q.st !== 'eng' && Math.hypot(q.x - p.x, q.y - p.y) < 2.2 && ((q.x - p.x) * (w.x - p.x) + (q.y - p.y) * (w.y - p.y)) > 0);
        if (!threat) return seek(p, w.x, w.y);
        p.ri = p.route.length;
      }
    }
    const d = teamDir(p.team);
    let best = { x: d * p.spd, y: 0 }, bs = -1e9;
    for (let a = -1.45; a <= 1.451; a += 0.145) {
      const ux = Math.cos(a) * d, uy = Math.sin(a);
      const px = p.x + ux * 3, py = p.y + uy * 3;
      let s = ux * d * 3 * 1.0;                      // forward progress
      for (const q of G.players) {
        if (q.team === p.team || !alive(q) || q.st === 'stun') continue;
        const qx = q.x + q.vx * 0.35, qy = q.y + q.vy * 0.35;
        const dd = Math.hypot(px - qx, py - qy) * (q.st === 'eng' ? 1.8 : 1);
        if (dd < 4) s -= (4 - dd) * (4 - dd) * 0.9;
      }
      if (py < 2) s -= (2 - py) * 4; if (py > FIELD_W - 2) s -= (py - FIELD_W + 2) * 4;
      if (s > bs) { bs = s; best = { x: ux * p.spd, y: uy * p.spd }; }
    }
    return best;
  }

  /* ---------------- blocking ---------------- */
  function isBlocking(G, b, hasBallTeam) {
    const pl = G.play; if (!pl || b.team !== hasBallTeam) return false;
    if (pl.kind === 'kickoff') return b.role === 'KB';
    if (pl.kind === 'punt' || pl.kind === 'fg') { if (!pl.kicked) return b.role !== 'QB'; return b.team !== G.off && b.role !== 'S'; }
    if (pl.intercepted) return true;
    if (OL[b.role]) return true;
    if (G.ball.st === 'air') return false;
    if (b.role === 'RB') return !!pl.o.rbBlock || (pl.kind === 'run' && pl.o.carrier !== 'RB') || pl.completed;
    if (b.role === 'WR1' || b.role === 'WR2') return !!pl.o.wrBlock || pl.completed || (pl.kind === 'run' && pl.handed);
    return false;
  }
  /** pick the most dangerous unblocked defender for this blocker and get between him and the ball */
  function blockSteer(G, b, ref, maxRange = 12) {
    let best = null, bs = 1e9;
    for (const q of G.players) {
      if (q.team === b.team || !alive(q) || q.st === 'eng' || q.i === G.carrier) continue;
      const db = Math.hypot(q.x - b.x, q.y - b.y); if (db > maxRange) continue;
      const s = db + Math.hypot(q.x - ref.x, q.y - ref.y) * 0.8;
      if (s < bs) { bs = s; best = q; }
    }
    if (!best) return seek(b, ref.x + teamDir(b.team) * 4, ref.y, b.spd * 0.7);
    const ax = ref.x - best.x, ay = ref.y - best.y, am = Math.hypot(ax, ay) || 1;
    return seek(b, best.x + ax / am * 0.7, best.y + ay / am * 0.7);
  }

  /* ---------------- master steering ---------------- */
  function steer(G, p, dt) {
    const pl = G.play; if (!pl) return { x: 0, y: 0 };
    const c = G.carrier >= 0 ? P(G, G.carrier) : null, ball = G.ball, air = ball.st === 'air' ? ball.air : null;
    if (c === p) {
      if (p.role === 'QB' && pl.kind === 'pass' && !pl.thrown && !pl.scramble) return qbPocket(G, p);
      if (p.role === 'QB' && (pl.kind === 'punt' || pl.kind === 'fg') && !pl.kicked) return { x: 0, y: 0 };
      if (p.role === 'QB' && pl.o && pl.o.pitch && !pl.pitched) return seek(p, p.route[0] ? p.route[0].x : p.x, p.route[0] ? p.route[0].y : p.y, 4);
      if (p.role === 'QB' && pl.kind === 'run' && pl.o.carrier === 'RB' && !pl.handed) return followRoute(p, 0.75) || { x: 0, y: 0 };
      return runner(G, p);
    }
    if (pl.kind === 'kickoff') return kickoffSteer(G, p, c, air);
    if ((pl.kind === 'punt' || pl.kind === 'fg') && (pl.kicked || !c || c.role !== 'QB')) return kickPlaySteer(G, p, c, air);
    const off = G.off;
    // someone other than the offense has the ball (interception) -> everyone reacts
    if (c && c.team !== off) return p.team === c.team ? blockSteer(G, p, c) : pursue(p, c);
    if (p.team === off) return offenseSteer(G, p, c, air);
    return defenseSteer(G, p, c, air);
  }
  function followRoute(p, sf = 1) {
    if (p.ri < p.route.length) { const w = p.route[p.ri]; if (Math.hypot(w.x - p.x, w.y - p.y) < 0.9) p.ri++; else return seek(p, w.x, w.y, p.spd * sf); }
    return null;
  }
  function qbPocket(G, q) {
    const r = followRoute(q, 0.8); if (r) return r;
    let th = null, td = 99;
    for (const p of G.players) if (p.team !== q.team && alive(p) && p.st !== 'eng') { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d < td) { td = d; th = p; } }
    if (th && td < 3.2) { const ax = q.x - th.x, ay = q.y - th.y, m = Math.hypot(ax, ay) || 1; return { x: ax / m * q.spd * 0.7, y: ay / m * q.spd * 0.7 }; }
    return { x: 0, y: 0 };
  }

  function offenseSteer(G, p, c, air) {
    const pl = G.play, d = teamDir(p.team);
    if (air && air.kind === 'pass') {
      if (air.target === p.i) return arrive(p, air.tx, air.ty, 1.2);
      if (OL[p.role]) return blockSteer(G, p, P(G, p.team * 7 + OI.QB), 4);
      const r = followRoute(p); if (r) return r;
      return arrive(p, air.tx, air.ty, 6); // flow to the ball
    }
    const ref = c || ball(G);
    if (OL[p.role]) {
      if (pl.o.block === 'screen' && pl.t > 0.85) { // release & lead the screen
        const rb = P(G, p.team * 7 + OI.RB);
        if (!c || c.role === 'QB') return seek(p, G.los - d * 1, rb.y + (p.y - G.by) * 0.4, p.spd * 0.8);
        return blockSteer(G, p, c, 8);
      }
      if (pl.o.block === 'run' || (c && c.role !== 'QB') || (pl.o.runAfter && pl.t > pl.o.runAfter)) {
        let tgt;
        if (p.role === 'C' && pl.kind === 'run' && pl.t > 0.25) { // centre climbs to the second level to wall off the linebacker
          const lb = P(G, (1 - p.team) * 7 + DI.MLB);
          if (lb.st !== 'eng' && alive(lb)) { const rc = c || P(G, p.team * 7 + OI.RB); const ax = rc.x - lb.x, ay = rc.y - lb.y, am = Math.hypot(ax, ay) || 1; tgt = seek(p, lb.x + ax / am * 0.7, lb.y + ay / am * 0.7); }
        }
        if (!tgt) tgt = blockSteer(G, p, c || P(G, p.team * 7 + OI.QB), 5);
        if (pl.o.side && pl.t < 0.6) tgt.y -= pl.o.side * d * 1.5;
        return tgt;
      }
      // pass pro: stay between the nearest rusher and the QB, never drift upfield
      const qbp = P(G, p.team * 7 + OI.QB);
      const v = blockSteer(G, p, qbp, 5);
      if ((p.x - G.los) * d > -0.5 && v.x * d > 0) v.x *= 0.2;
      return v;
    }
    if (p.role === 'QB') { // after the handoff / pitch: carry out the fake, then watch
      const r = followRoute(p, 0.8); if (r) return r;
      if (c && c !== p) return blockSteer(G, p, c, 4);
      return { x: 0, y: 0 };
    }
    // receivers & backs
    if (c && c !== p && c.role !== 'QB') { // there is a runner: block for him
      const r = (pl.kind === 'run' && !pl.handed && !pl.pitched) ? followRoute(p) : null; if (r) return r;
      return blockSteer(G, p, c, 10);
    }
    if (p.role === 'RB' && pl.o.pitch && !pl.pitched) return followRoute(p) || { x: d * 3, y: 0 };
    if (p.role === 'RB' && pl.o.rbBlock && pl.kind === 'pass') { const r = followRoute(p, 0.8); if (r) return r; return blockSteer(G, p, P(G, p.team * 7 + OI.QB), 4); }
    const r = followRoute(p); if (r) return r;
    if (pl.kind === 'run' && (pl.o.wrBlock || pl.o.rbBlock)) return blockSteer(G, p, c || ref, 8);
    // route finished: find soft space away from the nearest defender
    let nq = null, nd = 99;
    for (const q of G.players) if (q.team !== p.team && alive(q)) { const dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < nd) { nd = dd; nq = q; } }
    if (nq && nd < 3) { const ax = p.x - nq.x, ay = p.y - nq.y, m = Math.hypot(ax, ay) || 1; let vy = ay / m * 3; if (p.y < 3) vy = Math.abs(vy); if (p.y > FIELD_W - 3) vy = -Math.abs(vy); return { x: ax / m * 2.5, y: vy }; }
    return { x: 0, y: 0 };
  }
  const ball = G => G.ball;

  function defenseSteer(G, p, c, air) {
    const pl = G.play, off = G.off, d = teamDir(off), as = p.as || { t: 'rush' };
    const qbp = P(G, off * 7 + OI.QB);
    const runnerOn = c && (c.role !== 'QB' || pl.kind === 'run' || pl.scramble || (c.x - G.los) * d > 0.5);
    if (air && air.kind === 'pass') {
      const dl = Math.hypot(air.tx - p.x, air.ty - p.y);
      if (as.t === 'rush' || as.t === 'contain') return pursue(p, qbp);
      if (dl < 16 && air.t > 0.12) return arrive(p, air.tx, air.ty, 0.6);
      return seek(p, air.tx, air.ty, p.spd * 0.8);
    }
    if (air && air.kind === 'pitch') return seek(p, air.tx, air.ty);
    if (runnerOn && pl.runT == null) pl.runT = pl.t;
    // read-and-react: rushers react fast, linebackers & safeties a beat later, corners peel off last
    const react = pl.kind !== 'run' ? 0.12 : as.t === 'rush' || as.t === 'contain' || as.t === 'fill' ? 0.2 : as.t === 'man' && (p.role === 'CB1' || p.role === 'CB2') ? 0.42 : 0.32;
    if (runnerOn && pl.t - pl.runT >= react) {
      if (as.t === 'contain' && (c.x - G.los) * d < 1.5) { // keep outside leverage
        const side = as.side, ty = c.y - side * d * 2.2;
        return seek(p, c.x + d * 1.2, ty);
      }
      if ((as.t === 'deep') && pl.t < 1.2 && pl.kind === 'pass') return pursue(p, c);
      return pursue(p, c);
    }
    // pre-handoff / QB holding the ball
    if (pl.o.fake && pl.t < 0.85 && (as.t === 'zone' || as.t === 'deep' || as.t === 'spy' || as.t === 'fill' || (as.t === 'man' && as.who === 'RB'))) {
      const rb = P(G, off * 7 + OI.RB); return seek(p, G.los + d * 1.5, rb.y, p.spd * 0.8); // bite!
    }
    switch (as.t) {
      case 'rush': {
        const tgt = c || qbp;
        if (pl.o.runAfter && pl.t > 0.6 && pl.t < 1.2) return seek(p, tgt.x, tgt.y, p.spd * 0.9);
        return pursue(p, tgt);
      }
      case 'contain': {
        const tgt = c || qbp, outY = G.by - as.side * d * 7;
        if (pl.t < 1.1) return seek(p, G.los - d * 2.5, outY);
        return seek(p, tgt.x, tgt.y - as.side * d * 1.6);
      }
      case 'spy': return arrive(p, G.los + d * 3.5, qbp.y, 1.5);
      case 'fill': { const rb = P(G, off * 7 + OI.RB); return arrive(p, G.los + d * 1.5, lerp(G.by, rb.y, 0.6), 1.5); }
      case 'return': return { x: 0, y: 0 };
      case 'man': {
        const r = P(G, as.target);
        if ((r.x - G.los) * d < 0.5 && r.role === 'RB') return arrive(p, G.los + d * 4, r.y, 1.5);
        const lead = 0.35;
        const tx = r.x + r.vx * lead + d * 1.1, ty = r.y + r.vy * lead;
        const v = seek(p, tx, ty, Math.min(p.spd, r.spd * 0.97) * (Math.hypot(tx - p.x, ty - p.y) > 0.6 ? 1 : 0.6));
        return v;
      }
      case 'zone': case 'deep': {
        let zx = as.x, zy = as.y, best = null, bd = 99;
        for (const k of ['WR1', 'WR2', 'RB']) {
          const r = P(G, off * 7 + OI[k]); if (!alive(r)) continue;
          const dz = Math.hypot(r.x - zx, r.y - zy);
          if (dz < as.r && dz < bd) { bd = dz; best = r; }
        }
        if (as.t === 'deep') {
          // never let anybody behind you
          let deepest = null, dd = -99;
          for (const k of ['WR1', 'WR2', 'RB']) { const r = P(G, off * 7 + OI[k]); const dep = (r.x - G.los) * d; if (Math.abs(r.y - zy) < as.r && dep > dd) { dd = dep; deepest = r; } }
          if (deepest) { const depth = Math.max((zx - G.los) * d, dd + 3.5); return arrive(p, G.los + d * depth, lerp(zy, deepest.y, 0.55), 1.5); }
          return arrive(p, zx, zy, 1.5);
        }
        if (best) return arrive(p, lerp(zx, best.x + d * 1, 0.75), lerp(zy, best.y, 0.75), 1.2);
        return arrive(p, zx, zy, 1.5);
      }
    }
    return { x: 0, y: 0 };
  }

  /* ---------------- kickoffs ---------------- */
  function kickoffSteer(G, p, c, air) {
    const pl = G.play, kt = pl.kickTeam, kd = teamDir(kt);
    if (!pl.kicked) {
      if (p.role === 'K') return seek(p, G.los, G.by, 6.5);
      if (p.role === 'COV') return { x: kd * 2.2, y: 0 };
      return { x: 0, y: 0 };
    }
    if (air) {
      if (p.role === 'KR') return arrive(p, air.tx, air.ty, 1);
      if (p.role === 'KB') return arrive(p, air.tx - kd * (8 + (p.i % 7) * 1.6), lerp(p.y, air.ty, 0.3), 3);
      const lane = lerp(p.y, air.ty, 0.25); return seek(p, air.tx, p.role === 'K' ? air.ty : lane + (air.ty - p.y) * 0.1);
    }
    if (c) return p.team === c.team ? blockSteer(G, p, c, 14) : pursue(p, c);
    return { x: 0, y: 0 };
  }
  /* ---------------- punts & field goals ---------------- */
  function kickPlaySteer(G, p, c, air) {
    const pl = G.play, off = G.off, d = teamDir(off);
    if (pl.kind === 'fg') { // everybody holds the line
      if (p.team === off) return OL[p.role] || p.role.startsWith('WR') ? blockSteer(G, p, P(G, off * 7 + OI.QB), 3) : { x: 0, y: 0 };
      return pursue(p, P(G, off * 7 + OI.QB));
    }
    if (!pl.kicked) { // punt protection
      if (p.team === off) return p.role === 'WR1' || p.role === 'WR2' ? { x: d * 3, y: 0 } : blockSteer(G, p, P(G, off * 7 + OI.QB), 3);
      if (p.role === 'S') return { x: 0, y: 0 };
      if (p.role === 'CB1' || p.role === 'CB2') return seek(p, p.x - d * 0, p.y, 0); // hold the gunners up
      return pursue(p, P(G, off * 7 + OI.QB));
    }
    if (air) {
      if (p.i === air.target) return arrive(p, air.tx, air.ty, 1);
      if (p.team === off) return seek(p, air.tx, lerp(p.y, air.ty, 0.5));                    // cover the punt
      return arrive(p, air.tx - d * 10, lerp(p.y, air.ty, 0.4), 3);                         // set up the return wall
    }
    if (c) return p.team === c.team ? blockSteer(G, p, c, 12) : pursue(p, c);
    return { x: 0, y: 0 };
  }

  return { callOffense, callDefense, qb, steer, isBlocking };
})();
