/* SKY SHIELD — auto.js : an autopilot gunner for the title-screen demo and the tests.
   Picks the most urgent warhead nobody is already covering, leads it (solves the
   intercept time against the chosen base's interceptor speed) and fires. */
(function (root) {
  'use strict';
  const S = root.SSSim || (typeof require !== 'undefined' ? require('./sim.js') : null);
  function createAuto(skill = 0.8, seed = 7) {
    const R = S.rng(seed); let cool = 0; const covered = new Map();
    return {
      /** returns {cx, cy, fire:[base]} for this step; smooth=true -> crosshair eases toward the aim point (demo) */
      think(g, cur) {
        cool -= S.DT; const out = { cx: cur ? cur.cx : g.cx, cy: cur ? cur.cy : g.cy, fire: [] };
        if (g.phase !== 'play') return out;
        for (const [id, t] of covered) if (g.t > t) covered.delete(id);
        let best = null, bt = 1e9;
        for (const f of g.foes) {
          if (covered.has(f.id) || f.y > S.H - 4) continue;
          const tti = (f.y - f.ty) / Math.max(1, -f.vy) + (f.kind === 'smart' ? -3 : 0) + (f.splitY ? -2 : 0);
          if (tti < bt) { bt = tti; best = f; }
        }
        for (const fl of g.flyers) if (!covered.has(fl.id) && fl.x > 8 && fl.x < S.W - 8 && 6 < bt) { best = fl; bt = 6; }
        if (!best) return out;
        // lead: iterate intercept time
        let px = best.x, py = best.y, base = -1;
        for (let k = 0; k < 4; k++) {
          base = S.bestBase(g, px, py); if (base < 0) return out;
          const b = g.bases[base], t = Math.hypot(px - b.x, py - b.y - 2) / S.ABM_SPD[base] + S.BLAST.abm[1] * 0.45;
          px = best.x + (best.vx || 0) * t; py = best.y + (best.vy || 0) * t;
        }
        py = Math.max(S.CROSS.y0 + 2, py); px = Math.max(2, Math.min(S.W - 2, px));
        const err = (1 - skill) * 6;
        const ax = px + (R() - 0.5) * err, ay = py + (R() - 0.5) * err;
        if (cur && cur.smooth) { const dx = ax - out.cx, dy = ay - out.cy, d = Math.hypot(dx, dy), step = 220 * S.DT; if (d > step) { out.cx += dx / d * step; out.cy += dy / d * step; return out; } }
        out.cx = ax; out.cy = ay;
        if (cool <= 0) { out.fire.push(base); cool = 0.12 + (1 - skill) * 0.5; covered.set(best.id, g.t + 2.2); }
        return out;
      },
    };
  }
  const SSAuto = { createAuto };
  if (typeof module !== 'undefined' && module.exports) module.exports = SSAuto; else root.SSAuto = SSAuto;
})(typeof window !== 'undefined' ? window : globalThis);
