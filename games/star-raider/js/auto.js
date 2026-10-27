/* STAR RAIDER — auto.js : a competent autopilot (attract mode demo + tests).
   Returns the same input object a human produces. */
(function (root) {
  'use strict';
  const S = root.SRSim, V = S.V;
  const conj = q => [-q[0], -q[1], -q[2], q[3]];
  function steerTo(p, target, aft) {
    let l = S.Q.rot(conj(p.q), V.sub(target, p.pos)); if (aft) l = [-l[0], l[1], -l[2]];
    const d = V.len(l) || 1, x = l[0] / d, y = l[1] / d, z = l[2] / d;
    if (z > 0) return { yaw: x >= 0 ? 1 : -1, pitch: y * 2, ang: Math.PI };
    return { yaw: Math.max(-1, Math.min(1, x * 4)), pitch: Math.max(-1, Math.min(1, y * 4)), ang: Math.acos(Math.max(-1, Math.min(1, -z))) };
  }
  // skill 1 = sharp pilot; lower = slower hands, sloppier aim, later decisions (used to playtest a novice)
  function make(skill = 1) {
    const st = { fireT: 0, plan: null, chartT: 0, wob: 0 };
    const auto = function (G, p, dt) { st.goal = auto.goal;
      const inp = { yaw: 0, pitch: 0, thr: null, fire: 0, shields: true, comp: true, view: 'fore' };
      if (!p || !p.alive) return inp;
      if (p.warp) { if (p.warp.phase === 'tunnel') { inp.yaw = Math.max(-1, Math.min(1, p.warp.m[0] * 3)); inp.pitch = Math.max(-1, Math.min(1, p.warp.m[1] * 3)); } return inp; }
      if (p.dock && p.dock.phase !== 'done') { inp.thr = 0; return inp; }
      const foes = S.hostiles(G, p);
      const own = b => !G.war || b.team === p.team;
      let base = S.baseAt(G, p.sx, p.sy); if (base && !own(base)) base = null;
      const bases = G.bases.filter(b => b.alive && own(b));
      const needDock = p.energy < 3000 || Object.values(p.dmg).reduce((a, b) => a + b, 0) >= 2;
      if (foes.length && !(needDock && p.energy < 1200)) {
        let t = foes.find(s => s.id === p.targetId) || foes[0];
        for (const s of foes) if (V.dist(s.pos, p.pos) < V.dist(t.pos, p.pos) - 30) t = s;
        const d = V.dist(t.pos, p.pos), s = steerTo(p, t.pos);
        st.wob += dt * (1.3 + Math.random());
        const hand = 0.45 + 0.55 * skill, err = (1 - skill) * 0.5;
        inp.yaw = Math.max(-1, Math.min(1, s.yaw * hand + Math.sin(st.wob * 2.1) * err)); inp.pitch = Math.max(-1, Math.min(1, s.pitch * hand + Math.cos(st.wob * 1.7) * err)); inp.thr = d > 250 ? 6 : d < 60 ? 2 : 4;
        st.fireT -= dt; if (s.ang < 0.05 + (1 - skill) * 0.08 && d < 230 && st.fireT <= 0) { inp.fire = 1; st.fireT = 0.3 + (1 - skill) * 0.4; }
        return inp;
      }
      if (base && (needDock || (p.dock && p.dock.phase !== 'done'))) {
        const s = steerTo(p, S.BASE_POS), d = V.dist(S.BASE_POS, p.pos);
        inp.yaw = s.yaw; inp.pitch = s.pitch; inp.thr = d > 170 ? 5 : d > 80 ? 2 : 0; if (s.ang > 0.3 && d < 80) inp.thr = 1;
        return inp;
      }
      // WAR: shoot up an enemy starbase we are sitting on
      const eb = G.war && G.bases.find(b => b.alive && !own(b) && b.x === p.sx && b.y === p.sy);
      if (eb && !needDock) {
        const s = steerTo(p, S.BASE_POS), d = V.dist(S.BASE_POS, p.pos);
        inp.yaw = s.yaw; inp.pitch = s.pitch; inp.thr = d > 200 ? 4 : d < 110 ? 0 : 2;
        st.fireT -= dt; if (s.ang < 0.06 && st.fireT <= 0) { inp.fire = 1; st.fireT = 0.45; }
        return inp;
      }
      // plan a hyperwarp
      st.chartT -= dt; if (st.chartT > 0) { inp.thr = 0; return inp; }
      st.chartT = 1.5 + (1 - skill) * 6;
      let tgt = null;
      if (needDock && bases.length) { let bd = 1e9; for (const b of bases) { const dd = Math.hypot(b.x - p.sx, b.y - p.sy); if (dd < bd) { bd = dd; tgt = [b.x, b.y]; } } if (base) tgt = null; }
      if (G.war) { if (!tgt && st.goal) tgt = st.goal; }
      else if (!tgt && G.fleets.length) {
        let bc = 1e9;
        for (const f of G.fleets) { let c = Math.hypot(f.x - p.sx, f.y - p.sy); for (const b of bases) if (S.cheb(b.x, b.y, f.x, f.y) <= 1) c -= 3 + b.siege / 10; if (c < bc) { bc = c; tgt = [f.x, f.y]; } }
      }
      if (tgt && (tgt[0] !== p.sx || tgt[1] !== p.sy) && (!G.war || p.energy > S.warpCost(G, p, tgt[0], tgt[1]).e + 1500 || needDock)) inp.warpTo = tgt;
      inp.thr = 0;
      return inp;
    };
    return auto;
  }
  /* WAR strategist: reads only viewFor(G, team), exactly what a human sees on the chart */
  function makeWar(skill = 1, style = 'balanced') {
    const pilot = make(skill), st = { t: 2, n: 0 };
    return function (G, p, dt) {
      const inp = pilot(G, p, dt);
      if (!p) return inp;
      st.t -= dt; if (st.t > 0) return inp;
      st.t = (style === 'rush' ? 4 : 7) + (1 - skill) * 6; st.n++;
      const v = S.viewFor(G, p.team), mine = v.fleets.filter(f => f.own && !f.decoy), foes = v.fleets.filter(f => !f.own);
      const myBases = v.bases.filter(b => b.own && b.alive), theirs = v.bases.filter(b => !b.own && b.alive);
      const L = S.LAYOUTS[v.layout], guess = L.bases.map(([x, y]) => p.team ? [x, y] : [S.W - 1 - x, S.H - 1 - y]);
      const known = theirs.length ? theirs : guess.filter(g => !v.bases.some(b => !b.own && !b.alive && b.x === g[0] && b.y === g[1])).map(([x, y]) => ({ x, y }));
      const near = (a, list) => list.slice().sort((u, w) => Math.hypot(u.x - a[0], u.y - a[1]) - Math.hypot(w.x - a[0], w.y - a[1]))[0];
      const home = myBases[0] ? [myBases[0].x, myBases[0].y] : [p.sx, p.sy];
      const target = near(home, known);
      const act = [];
      // defend a besieged base first
      const hurt = myBases.find(b => b.siege);
      const defenders = Math.max(1, Math.round(mine.length * (style === 'rush' ? 0.2 : 0.4)));
      mine.sort((a, b) => a.id - b.id).forEach((f, i) => {
        let goal;
        if (hurt && i < defenders + 1) goal = [hurt.x, hurt.y];
        else if (i < defenders) { const b = myBases[i % Math.max(1, myBases.length)]; goal = b ? [b.x, b.y] : home; }
        else if (target) goal = [target.x, target.y];
        if (goal && (!f.order || f.order[0] !== goal[0] || f.order[1] !== goal[1]) && (f.x !== goal[0] || f.y !== goal[1])) act.push({ a: 'order', f: f.id, x: goal[0], y: goal[1] });
      });
      if (v.jam && v.res > 400) act.push({ a: 'eccm' });
      else if (v.res > S.WAR.cost.build + 200 && mine.length < 7) act.push({ a: 'build', b: (myBases.find(b => b.home) || myBases[0] || {}).id });
      else if (target && target.hp === undefined && v.res > 500 && st.n % 3 === 0) act.push({ a: 'probe', x: target.x, y: target.y });
      else if (v.res > 900 && st.n % 5 === 2 && !v.jamming) act.push({ a: 'jam' });
      else if (v.res > 700 && st.n % 6 === 4 && target) act.push({ a: 'decoy', x: target.x, y: (target.y + 3) % S.H });
      else if (v.res > 600 && st.n % 7 === 3 && myBases.some(b => b.x === p.sx && b.y === p.sy)) act.push({ a: 'mines' });
      inp.acts = act;
      // flagship: help a hurt base, else follow the strike force, else sit at home
      const strike = mine.filter(f => target && f.x === target.x && f.y === target.y);
      pilot.goal = hurt ? [hurt.x, hurt.y] : strike.length && target ? [target.x, target.y] : (v.foe && style === 'hunter' ? v.foe : (foes.find(f => f.live && myBases.some(b => Math.max(Math.abs(b.x - f.x), Math.abs(b.y - f.y)) <= 1)) ? [foes[0].x, foes[0].y] : home));
      return inp;
    };
  }
  root.SRAuto = { make, makeWar, steerTo };
  if (typeof module !== 'undefined') module.exports = root.SRAuto;
})(typeof window !== 'undefined' ? window : globalThis);
