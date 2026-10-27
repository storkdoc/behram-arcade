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
  function make() {
    const st = { fireT: 0, plan: null, chartT: 0 };
    return function auto(G, p, dt) {
      const inp = { yaw: 0, pitch: 0, thr: null, fire: 0, shields: true, comp: true, view: 'fore' };
      if (!p || !p.alive) return inp;
      if (p.warp) { if (p.warp.phase === 'tunnel') { inp.yaw = Math.max(-1, Math.min(1, p.warp.m[0] * 3)); inp.pitch = Math.max(-1, Math.min(1, p.warp.m[1] * 3)); } return inp; }
      if (p.dock && p.dock.phase !== 'done') { inp.thr = 0; return inp; }
      const sk = S.key(p.sx, p.sy), foes = G.ships.filter(s => s.sk === sk);
      const base = S.baseAt(G, p.sx, p.sy), bases = G.bases.filter(b => b.alive);
      const needDock = p.energy < 3000 || Object.values(p.dmg).reduce((a, b) => a + b, 0) >= 2;
      if (foes.length && !(needDock && p.energy < 1200)) {
        let t = foes.find(s => s.id === p.targetId) || foes[0];
        for (const s of foes) if (V.dist(s.pos, p.pos) < V.dist(t.pos, p.pos) - 30) t = s;
        const d = V.dist(t.pos, p.pos), s = steerTo(p, t.pos);
        inp.yaw = s.yaw; inp.pitch = s.pitch; inp.thr = d > 250 ? 6 : d < 60 ? 2 : 4;
        st.fireT -= dt; if (s.ang < 0.05 && d < 230 && st.fireT <= 0) { inp.fire = 1; st.fireT = 0.3; }
        return inp;
      }
      if (base && (needDock || (p.dock && p.dock.phase !== 'done'))) {
        const s = steerTo(p, S.BASE_POS), d = V.dist(S.BASE_POS, p.pos);
        inp.yaw = s.yaw; inp.pitch = s.pitch; inp.thr = d > 160 ? 5 : d > 75 ? 2 : 0; if (s.ang > 0.3 && d < 75) inp.thr = 1;
        return inp;
      }
      // plan a hyperwarp
      st.chartT -= dt; if (st.chartT > 0) { inp.thr = 0; return inp; }
      st.chartT = 1.5;
      let tgt = null;
      if (needDock && bases.length) { let bd = 1e9; for (const b of bases) { const dd = Math.hypot(b.x - p.sx, b.y - p.sy); if (dd < bd) { bd = dd; tgt = [b.x, b.y]; } } if (base) tgt = null; }
      if (!tgt && G.fleets.length) {
        let bc = 1e9;
        for (const f of G.fleets) { let c = Math.hypot(f.x - p.sx, f.y - p.sy); for (const b of bases) if (S.cheb(b.x, b.y, f.x, f.y) <= 1) c -= 3 + b.siege / 10; if (c < bc) { bc = c; tgt = [f.x, f.y]; } }
      }
      if (tgt && (tgt[0] !== p.sx || tgt[1] !== p.sy)) inp.warpTo = tgt;
      inp.thr = 0;
      return inp;
    };
  }
  root.SRAuto = { make, steerTo };
  if (typeof module !== 'undefined') module.exports = root.SRAuto;
})(typeof window !== 'undefined' ? window : globalThis);
