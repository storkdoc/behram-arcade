/* SUTURE SELF! — vitals physiology model (pure logic; no DOM). Used by main.js, unit-tested by tests/vitals.test.js.
   Time: the game compresses the operation, so the model runs in "physiologic seconds": TS = 6 physiologic s per real s
   (a ~6-minute game case ≈ a 35–45-minute operation; the decision-to-incision clock runs ×20 and is separate).
   - Baselines per case type: term pregnant under spinal ~110–125/65–80, HR 80–100; GYN under GA ~110–130/70–85, HR 65–85.
   - Noise: slow Ornstein–Uhlenbeck drift (SBP sd ~3, HR sd ~2.5, SpO2 sd ~0.4), so no jumps.
   - Hemorrhage: ATLS-style classes on net loss (EBL − effective replacement) / estimated blood volume
     (pregnant 100 mL/kg, non-pregnant 70 mL/kg), lagged ~50 s (30–90 s): <15% normal; 15–30% HR 100–120, narrow pulse
     pressure, SBP held; 30–40% SBP ~85–90, HR 120–140; >40% severe. Pregnant patients hold SBP ~4% EBV longer.
   - Spinal: SBP dips 15–25% over 2–5 min; phenylephrine corrects it in ~1–2 min with a slight reflex HR drop.
   - Events (effects): smooth onset/offset with their own time constants; may be held until the team treats them.
   MAP = DBP + (SBP − DBP)/3. SpO2 stays 97–100 unless an event (e.g. desaturation) or severe shock. */
(function (root) {
  var TS = 6;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function interp(x, pts) { if (x <= pts[0][0]) return pts[0][1]; for (var i = 1; i < pts.length; i++) if (x <= pts[i][0]) { var a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); } return pts[pts.length - 1][1]; }
  function approach(cur, target, dt, tau) { return cur + (target - cur) * (1 - Math.exp(-dt / Math.max(0.01, tau))); }
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  /* Hemorrhage targets for a lagged net-loss fraction f of EBV. */
  function hemo(f, b, preg) {
    var s = preg ? 0.04 : 0, h1 = Math.max(b.hr + 8, 98), h2 = Math.max(h1 + 6, 110), h3 = Math.max(h2 + 6, 120), h4 = Math.max(h3 + 8, 136), h5 = Math.max(h4 + 6, 148);
    var hr = interp(f, [[0, b.hr], [0.08, b.hr + 2], [0.15, h1], [0.22, h2], [0.30, h3], [0.40, h4], [0.50, h5]]);
    var sbp = interp(f, [[0, b.sbp], [0.15, b.sbp], [0.28 + s, b.sbp - 5], [0.34 + s, Math.min(b.sbp - 18, 92)], [0.40 + s, Math.min(b.sbp - 26, 84)], [0.50 + s, Math.min(b.sbp - 42, 68)], [0.60 + s, 58]]);
    var pp = interp(f, [[0, 1], [0.15, 1], [0.30, 0.68], [0.40, 0.6], [0.50, 0.55]]);
    return { hr: hr, sbp: sbp, pp: pp };
  }
  function ebvClass(f) { return f < 0.15 ? 1 : f < 0.30 ? 2 : f < 0.40 ? 3 : 4; }

  function create(cfg) {
    cfg = cfg || {}; var r = cfg.rand || (cfg.seed != null ? rng(cfg.seed) : Math.random);
    var preg = !!cfg.preg, ga = !!cfg.ga, kg = cfg.kg || (preg ? 78 : 70);
    var b = preg ? { sbp: 112 + r() * 12, dbp: 66 + r() * 10, hr: 84 + r() * 12 } : { sbp: 114 + r() * 14, dbp: 70 + r() * 10, hr: 68 + r() * 14 };
    if (cfg.abruption) { b.sbp = 136; b.dbp = 86; b.hr = 102; } // abruption: often hypertensive, already tachycardic
    b.spo2 = 99; b.etco2 = ga ? 34 + r() * 2 : 0;
    var M = { TS: TS, preg: preg, ebv: (preg ? 100 : 70) * kg, base: b, t: 0, warp: 1, hold: false, ebl: 0, repl: 0, crystal: 0, fLag: 0, mtp: false,
      hr: b.hr, sbp: b.sbp, dbp: b.dbp, map: 0, spo2: b.spo2, etco2: b.etco2,
      n: { sbp: 0, hr: 0, spo2: 0, co: 0 }, fx: [], spinal: null, pe: 0, peT: 0, autoPressor: true, fluidQ: 0, log: [] };
    M.map = M.dbp + (M.sbp - M.dbp) / 3;

    /* Generic effect: delta {sbp, dbp, hr, spo2, etco2}; on/off time constants (physiologic s); hold = seconds before it
       starts to resolve on its own (Infinity = until treated). */
    M.effect = function (delta, o) {
      o = o || {}; var e = { d: delta, a: 0, tgt: 1, on: o.on || 20, off: o.off || 60, hold: o.hold == null ? 40 : o.hold, age: 0, name: o.name || 'effect', ev: !!o.event };
      if (e.d.dbp == null && e.d.sbp) e.d.dbp = e.d.sbp * 0.65; M.fx.push(e); return e;
    };
    M.release = function (e, off) { if (!e) return; e.hold = 0; if (off) e.off = off; };
    M.progress = function (e) { return e ? e.a : 1; };
    /* Spinal: dip of `drop` (fraction of SBP) developing over 2–5 min. */
    M.startSpinal = function (drop) { M.spinal = { drop: drop || (0.15 + r() * 0.07), a: 0, tau: 100 }; return M.spinal; };
    M.deepenSpinal = function (drop) { if (!M.spinal) M.startSpinal(drop); M.spinal.drop = Math.max(M.spinal.drop, drop); M.spinal.tau = 45; return M.spinal; };
    /* Phenylephrine infusion / boluses: corrects spinal vasodilation in ~1–2 min (tau 40 s). */
    M.pressor = function () { M.peT = 1; };
    M.fluids = function (ml) { M.fluidQ += ml || 500; };
    M.blood = function (ml) { M.repl += ml; };
    M.addEBL = function (ml) { M.ebl += ml; };
    M.netFrac = function () { return Math.max(0, M.ebl - M.repl - M.crystal / 3) / M.ebv; };
    M.ebvClass = function () { return ebvClass(M.fLag); };

    M.tick = function (dtReal) {
      var dt = dtReal * TS * M.warp; if (dt <= 0) return M; M.t += dt;
      // replacement: crystalloid bolus runs ~1 L / 10 min; MTP blood ~400 mL/min until the deficit is under ~500 mL
      if (M.fluidQ > 0) { var g = Math.min(M.fluidQ, 1.7 * dt); M.fluidQ -= g; M.crystal += g; }
      if (M.mtp && M.ebl - M.repl > 500) M.repl += 6.7 * dt;
      // lagged loss fraction (rises over ~50 s, recovers over ~90 s)
      var f = M.netFrac(); M.fLag = approach(M.fLag, f, dt, f > M.fLag ? 50 : 90);
      var h = hemo(M.fLag, b, preg);
      // spinal + phenylephrine
      var sp = 0, spHr = 0;
      if (M.spinal) { M.spinal.a = approach(M.spinal.a, 1, dt, M.spinal.tau); sp = M.spinal.drop * M.spinal.a; }
      if (M.spinal && M.autoPressor && !M.hold && M.peT === 0 && M.spinal.a > 0.85) { M.peT = 1; M.log.push({ t: M.t, ev: 'auto-phenylephrine' }); }
      M.pe = approach(M.pe, M.peT, dt, 40);
      var spEff = sp * (1 - 0.92 * M.pe); spHr = 30 * spEff - 5 * M.pe; // mild reflex tachycardia with the dip, slight drop on phenylephrine
      // hemorrhage: pressor buys a few mmHg only
      var hSbp = h.sbp + (b.sbp - h.sbp) * 0.12 * M.pe;
      // effects
      var d = { sbp: 0, dbp: 0, hr: 0, spo2: 0, etco2: 0 };
      M.fx = M.fx.filter(function (e) {
        e.age += dt; if (e.age > e.hold && e.tgt === 1) e.tgt = 0;
        e.a = approach(e.a, e.tgt, dt, e.tgt ? e.on : e.off);
        for (var k in e.d) d[k] = (d[k] || 0) + e.d[k] * e.a;
        return !(e.tgt === 0 && e.a < 0.01);
      });
      // noise (Ornstein–Uhlenbeck, tau 30 s)
      var nt = 30, q = Math.sqrt(2 * Math.min(dt, nt) / nt);
      M.n.sbp += -M.n.sbp * Math.min(1, dt / nt) + 3.2 * q * gauss(r); M.n.hr += -M.n.hr * Math.min(1, dt / nt) + 2.6 * q * gauss(r);
      M.n.spo2 += -M.n.spo2 * Math.min(1, dt / nt) + 0.4 * q * gauss(r); M.n.co += -M.n.co * Math.min(1, dt / nt) + 0.8 * q * gauss(r);
      // targets, smoothed (tau 12 s) so the display never jumps
      var pp0 = b.sbp - b.dbp;
      var tS = hSbp * (1 - spEff) + d.sbp + M.n.sbp;
      var tD = (hSbp - pp0 * h.pp) * (1 - spEff * 1.1) + d.dbp + M.n.sbp * 0.6;
      var tH = h.hr + spHr + d.hr + M.n.hr;
      var shock = clamp((M.fLag - 0.40) / 0.15, 0, 1);
      var tSp = clamp(b.spo2 + M.n.spo2, 97, 100) + d.spo2 - 3 * shock;
      var tCo = b.etco2 ? b.etco2 + d.etco2 + M.n.co - 6 * shock : 0;
      M.sbp = approach(M.sbp, clamp(tS, 40, 220), dt, 12); M.dbp = approach(M.dbp, clamp(tD, 20, M.sbp - 12), dt, 12);
      M.hr = approach(M.hr, clamp(tH, 30, 185), dt, 10); M.spo2 = approach(M.spo2, clamp(tSp, 60, 100), dt, 8); M.etco2 = approach(M.etco2, Math.max(0, tCo), dt, 15);
      M.map = M.dbp + (M.sbp - M.dbp) / 3;
      return M;
    };
    M.vals = function () { return { hr: M.hr, sbp: M.sbp, dbp: M.dbp, map: M.map, spo2: M.spo2, etco2: M.etco2, ebl: M.ebl, cls: M.ebvClass() }; };
    return M;
  }
  var api = { create: create, hemo: hemo, ebvClass: ebvClass, rng: rng, TS: TS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SVITALS = api;
})(this);
