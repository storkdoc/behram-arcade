/* OB TRIAGE — CTG / EFM strip engine.
 * A small physiological model that generates a fetal heart rate (FHR, bpm) and uterine activity (UC/toco, mmHg) signal at 4 Hz,
 * plus the ground truth of every contraction, acceleration and deceleration, and an independent analyzer that reads only the
 * raw samples back (baseline, variability, accels, decel types, contraction frequency, NICHD category).
 * Definitions: 2008 NICHD workshop (Macones et al.), ACOG Practice Bulletins 106 and 116 (now ACOG Clinical Practice Guideline
 * No. 10, 2025). Teaching model, not a medical device. Works in the browser (window.CTG) and in node (module.exports). */
(function (root) {
  'use strict';
  var HZ = 4, DT = 1 / HZ;
  var CTG = { HZ: HZ, DT: DT };
  function rng(seed) { var a = (seed >>> 0) || 1; return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var clamp = function (x, a, b) { return x < a ? a : x > b ? b : x; };
  var lerp = function (a, b, t) { return a + (b - a) * clamp(t, 0, 1); };
  CTG.rng = rng; CTG.clamp = clamp;

  /* default physiology. Every case overrides a few of these. */
  var DEF = {
    base: 140,        // intrinsic FHR baseline (bpm)
    ga: 39,           // gestational age, weeks (accel criteria 15x15 at >=32 wk, 10x10 below)
    varTarget: 12,    // intrinsic variability amplitude (peak-to-trough, bpm) when well oxygenated
    marked: 0,        // 1 = marked variability (>25 bpm)
    mag: 0,           // magnesium sulfate effect 0..1 (dampens variability and accels)
    opioid: 0,        // IV opioid effect 0..1 (transient minimal variability)
    accRate: 0.22,    // spontaneous accelerations per minute when reactive
    ucInt: 4,         // spontaneous mean contraction interval (min); 0 = no contractions
    ucSens: 0.1,      // oxytocin sensitivity: interval = ucInt / (1 + ucSens * oxytocin effect)
    misoK: 1.2,       // misoprostol sensitivity
    ucAmp: 50, ucDur: 86, tone: 12, ucJit: 0.14,
    oxy: 0, oxyEff: 0, miso: 0, terb: 0, terbEff: 0,
    head: 0,          // head compression -> early decels (probability per contraction)
    cord: 0,          // cord compression 0..1 -> variable decels
    cordPos: 0.5,     // fraction of the cord compression relieved by a position change
    upi: 0.1,         // uteroplacental insufficiency 0..1 -> late decels
    tachyLate: 1,     // how much tachysystole (short rest) adds to the uteroplacental insult
    hypo: 0,          // maternal hypotension 0..1 (e.g. after epidural)
    fever: 0,         // maternal temperature above 37.0 C
    feverK: 13,       // FHR rise per degree of fever
    sinus: 0,         // sinusoidal pattern (fetal anemia) 0..1
    abrupt: 0,        // placental abruption 0..1
    prolapse: 0,      // cord prolapse compression 0..1
    relief: 0,        // manual elevation of the presenting part 0..1
    rupture: 0,       // uterine rupture 0/1
    tetanic: 0,       // tetanic contraction / hypertonus 0..1
    push: 0,          // second-stage pushing 0..1 (adds head and cord compression)
    reserve: 1,       // fetal acid-base reserve 1 (healthy) .. 0 (acidemic)
    reserveRec: 0.00035, // recovery per second when not insulted
    signal: 1,        // signal quality 1 = clean external
    rom: 0, iupc: 0, fse: 0
  };
  CTG.DEF = DEF;

  /* ---------- simulator ---------- */
  function Sim(params, seed) {
    this.r = rng(seed || 1);
    this.p = {}; for (var k in DEF) this.p[k] = DEF[k]; for (var k2 in params || {}) this.p[k2] = params[k2];
    this.t = 0; this.n = 0;
    this.fhr = []; this.uc = []; this.bl = []; this.vt = []; // samples + truth baseline + true variability amplitude
    this.ucs = []; this.decels = []; this.accels = []; this.drops = []; this.marks = [];
    this.ramps = {}; this.timers = [];
    this.baseNow = this.p.base; this.vtCur = this.varTarget(); this.drop = 0; this.dropEp = null;
    this.nextUC = this.p.ucInt > 0 ? this.r() * this.p.ucInt * 60 : 1e9; this.nextAcc = 20 + this.r() * 60; this.lastEvt = -999;
    // variability oscillators (irregular in amplitude and frequency)
    this.osc = []; for (var i = 0; i < 4; i++) this.osc.push({ ph: this.r() * 6.283, f: (2 + this.r() * 4) / 60, a: 0.5 + this.r() * 0.5, fT: (2 + this.r() * 4) / 60, aT: 0.5 + this.r() * 0.5 });
    this.stv = 0; this.sinPh = this.r() * 6.283; this.lp = 0; this.dropout = 0;
    this.maternal = { hr: 84, sbp: 118, dbp: 72, spo2: 98, temp: 37.0 };
  }
  CTG.Sim = Sim;
  var SP = Sim.prototype;
  SP.set = function (o) { for (var k in o) { this.p[k] = o[k]; delete this.ramps[k]; } };
  /* approach a value exponentially with time constant tau (seconds) */
  SP.ramp = function (k, to, tau) { this.ramps[k] = { to: to, tau: Math.max(1, tau || 60) }; };
  SP.after = function (sec, fn) { this.timers.push({ t: this.t + sec, fn: fn }); };
  SP.mark = function (label, kind) { this.marks.push({ t: this.t, label: label, kind: kind || 'act' }); };
  SP.interval = function () { // current mean contraction interval in minutes
    var p = this.p; if (!(p.ucInt > 0) || p.rupture) return 0;
    var iv = p.ucInt / (1 + p.ucSens * p.oxyEff + p.misoK * p.miso) * (1 + 1.3 * p.terbEff);
    if (p.abrupt > 0) iv = lerp(iv, 1.05, p.abrupt);
    return Math.max(1.05, iv);
  };
  SP.varTarget = function () {
    var p = this.p, v = p.marked ? 32 : p.varTarget, R = p.reserve;
    if (R < 0.6) v = R >= 0.35 ? lerp(3.4, v, (R - 0.35) / 0.25) : lerp(0.6, 3.4, (R - 0.12) / 0.23);
    if (p.mag > 0) v = lerp(v, Math.min(v, 3.8), p.mag);
    if (p.opioid > 0) v = lerp(v, Math.min(v, 3.5), p.opioid);
    if (p.sinus > 0) v = lerp(v, 0.6, p.sinus);
    return v;
  };
  SP.uteroplacental = function () {
    var p = this.p, iv = this.interval();
    var load = iv > 0 ? clamp((2.2 - iv) / 0.8, 0, 1) : 0;
    return clamp(p.upi + 0.75 * p.hypo + 0.45 * p.abrupt + 0.32 * load * p.tachyLate - 0.1 * p.terbEff * load, 0, 1);
  };
  /* gradual decel / contraction shape on 0..1 */
  function bell(x, e) { return x <= 0 || x >= 1 ? 0 : Math.pow(Math.sin(Math.PI * x), e); }
  CTG.bell = bell;
  SP.newContraction = function () {
    var p = this.p, r = this.r, t = this.t, iv = this.interval();
    var dur = p.ucDur * (1 - p.ucJit * 0.75 + r() * p.ucJit * 1.5), amp = p.ucAmp * (0.82 + r() * 0.36);
    if (p.abrupt > 0) { dur = lerp(dur, 48 + r() * 12, p.abrupt); amp = lerp(amp, 16 + r() * 8, p.abrupt); }
    if (p.terbEff > 0) amp *= 1 - 0.35 * p.terbEff;
    var c = { t0: t, dur: dur, tp: t + dur / 2, t1: t + dur, amp: amp, i: this.ucs.length };
    this.ucs.push(c);
    this.nextUC = t + Math.max(dur + 12, iv * 60 * (1 - p.ucJit + r() * 2 * p.ucJit));
    // which deceleration (if any) rides on this contraction? one mechanism per contraction
    var u = this.uteroplacental(), cord = clamp(p.cord + 0.35 * p.push * (p.cord > 0 ? 1 : 0), 0, 1), d = null;
    var pLate = clamp((u - 0.24) * 3.2, 0, 1), pVar = clamp(cord * 1.15, 0, 1), pEarly = clamp(p.head + 0.4 * p.push * (p.head > 0 ? 1 : 0), 0, 1);
    if (this.drop > 12) return c; // already in a prolonged decel
    if (pVar > 0 && r() < pVar) d = this.variable(c, cord);
    else if (pLate > 0 && r() < pLate) {
      var D = dur * 1.02, lag = 20 + r() * 12, depth = clamp(15 + 34 * (u - 0.24) * (amp / 50) + r() * 5, 15, 45);
      d = { type: 'late', t0: t + lag, dur: D, t1: t + lag + D, tn: t + lag + D / 2, depth: depth, uc: c.i, e: 1.1 };
    } else if (pEarly > 0 && r() < pEarly) {
      var de = clamp(11 + 10 * p.head + r() * 6, 11, 26), le = r() * 3;
      d = { type: 'early', t0: t + le, dur: dur, t1: t + le + dur, tn: t + le + dur / 2, depth: de, uc: c.i, e: 1.1 };
    }
    if (d) this.decels.push(d);
    return c;
  };
  SP.variable = function (c, cord) {
    var r = this.r, p = this.p, t0 = c.t0 + 8 + r() * c.dur * 0.35;
    var depth = clamp(28 + 52 * cord + r() * 14, 22, Math.max(25, this.baseNow - 62));
    var fall = 5 + r() * 9, shape = r() < 0.25 + 0.3 * cord ? 'U' : r() < 0.2 ? 'W' : 'V', hold = shape === 'U' ? 14 + r() * 22 : shape === 'W' ? 18 + r() * 10 : r() * 4;
    var slow = p.reserve < 0.62 || cord > 0.78, rec = slow ? 34 + r() * 22 : 7 + r() * 9;
    var shoulders = !slow && p.reserve > 0.6 && cord < 0.6 && r() < 0.6;
    var D = fall + hold + rec;
    return { type: 'variable', t0: t0, dur: D, t1: t0 + D, tn: t0 + fall + hold * 0.5, depth: depth, uc: c.i, fall: fall, hold: hold, rec: rec, shape: shape, slow: slow, shoulders: shoulders };
  };
  function decelAt(d, t) {
    var x = t - d.t0;
    if (d.type !== 'variable') return d.depth * bell(x / d.dur, d.e || 1.1);
    var v = 0, sh = d.shoulders ? -11 : 0; // negative = acceleration ("shoulder")
    if (x < -12 || x > d.dur + 14) return 0;
    if (x < 0) return sh * bell((x + 12) / 12, 1.5);
    if (x > d.dur) return sh * bell((x - d.dur) / 14, 1.5);
    if (x < d.fall) v = d.depth * Math.pow(Math.sin(Math.PI / 2 * x / d.fall), 1.3);
    else if (x < d.fall + d.hold) { v = d.depth; if (d.shape === 'W') v = d.depth * (1 - 0.45 * Math.sin(Math.PI * (x - d.fall) / d.hold)); else if (d.shape === 'U') v = d.depth * (0.96 + 0.04 * Math.cos(x)); }
    else v = d.depth * (1 - Math.pow((x - d.fall - d.hold) / d.rec, d.slow ? 1.4 : 1.1));
    return Math.max(0, v);
  }
  CTG.decelAt = decelAt;
  function accelAt(a, t) { var x = t - a.t0; if (x <= 0 || x >= a.dur) return 0; if (x < a.rise) return a.amp * Math.sin(Math.PI / 2 * x / a.rise); if (x < a.rise + a.plat) return a.amp; return a.amp * (1 - (x - a.rise - a.plat) / a.fallT); }
  SP.accel = function (induced) {
    var r = this.r, big = this.p.ga >= 32, amp = (big ? 17 : 12) + r() * 10, rise = 7 + r() * 10, plat = 6 + r() * 18, fallT = 9 + r() * 14;
    var a = { type: 'accel', t0: this.t, rise: rise, plat: plat, fallT: fallT, dur: rise + plat + fallT, amp: amp, induced: !!induced };
    a.t1 = a.t0 + a.dur; a.tn = a.t0 + rise + plat / 2; this.accels.push(a); this.lastEvt = a.t1; return a;
  };
  SP.dropTarget = function () {
    var p = this.p, d = 0;
    if (p.prolapse > 0) d = Math.max(d, p.prolapse * (1 - 0.6 * p.relief) * 78);
    if (p.hypo > 0.45) d = Math.max(d, (p.hypo - 0.45) * 120);
    if (p.tetanic > 0) d = Math.max(d, p.tetanic * 60);
    if (p.rupture) d = Math.max(d, 72);
    if (p.reserve < 0.05) d = Math.max(d, 45); // terminal bradycardia
    return Math.min(d, this.baseNow - 58);
  };
  SP.stepOne = function () {
    var p = this.p, r = this.r, t = this.t, k;
    for (k in this.ramps) { var R = this.ramps[k]; p[k] += (R.to - p[k]) * (1 - Math.exp(-DT / R.tau)); if (Math.abs(R.to - p[k]) < 1e-4) { p[k] = R.to; delete this.ramps[k]; } }
    for (var ti = this.timers.length - 1; ti >= 0; ti--) if (this.timers[ti].t <= t) { var fn = this.timers[ti].fn; this.timers.splice(ti, 1); fn(this); }
    p.oxyEff += (p.oxy - p.oxyEff) * (1 - Math.exp(-DT / 330));
    p.terbEff += (p.terb - p.terbEff) * (1 - Math.exp(-DT / 80)); p.terb *= Math.exp(-DT / 2400);
    p.miso *= Math.exp(-DT / 5400);
    // contractions
    if (t >= this.nextUC) { if (this.interval() > 0) this.newContraction(); else this.nextUC = t + 30; }
    var uc = p.tone + (p.abrupt > 0 ? 16 * p.abrupt : 0) + (p.rupture ? -5 : 0);
    for (var ci = this.ucs.length - 1; ci >= 0 && ci >= this.ucs.length - 4; ci--) { var c = this.ucs[ci]; if (t >= c.t0 && t <= c.t1) uc += c.amp * bell((t - c.t0) / c.dur, 1.6); }
    if (p.tetanic > 0) uc += p.tetanic * 55;
    this.lp += (r() - 0.5) * 0.6 - this.lp * 0.08; uc += this.lp + 1.2 * Math.sin(t * 2 * Math.PI / 4.2) * 0.4; // breathing + noise
    // baseline (slow), variability
    var bT = p.base + p.feverK * Math.max(0, p.fever) + (p.reserve < 0.4 ? 9 * (0.4 - p.reserve) / 0.4 : 0) + 6 * p.abrupt;
    this.baseNow += (bT - this.baseNow) * (1 - Math.exp(-DT / 150));
    var vT = this.varTarget(); this.vtCur += (vT - this.vtCur) * (1 - Math.exp(-DT / 90));
    var lv = 0, o;
    for (var i = 0; i < this.osc.length; i++) { o = this.osc[i]; if (r() < DT / 25) { o.fT = (1.8 + r() * 4.5) / 60; o.aT = 0.35 + r() * 0.65; } o.f += (o.fT - o.f) * 0.02; o.a += (o.aT - o.a) * 0.01; o.ph += 2 * Math.PI * o.f * DT; lv += o.a * Math.sin(o.ph); }
    lv *= this.vtCur * 0.27;
    this.stv = this.stv * 0.35 + (r() - 0.5) * (0.5 + 0.035 * this.vtCur);
    var sin = 0; if (p.sinus > 0) { this.sinPh += 2 * Math.PI * (3.6 / 60) * DT; sin = p.sinus * 8 * Math.sin(this.sinPh); }
    // prolonged decelerations / bradycardia (sustained drop)
    var dT = this.dropTarget(), tau = dT > this.drop ? (p.prolapse > 0.3 || p.rupture ? 12 : 35) : 45;
    this.drop += (dT - this.drop) * (1 - Math.exp(-DT / tau));
    if (this.drop >= 15 && !this.dropEp) { this.dropEp = { type: 'prolonged', t0: t, t1: t, tn: t, depth: 0 }; this.drops.push(this.dropEp); }
    if (this.dropEp) { this.dropEp.t1 = t; if (this.drop > this.dropEp.depth) { this.dropEp.depth = this.drop; this.dropEp.tn = t; } this.dropEp.dur = t - this.dropEp.t0; if (this.drop < 15) this.dropEp = null; }
    // spontaneous accelerations
    var reactive = p.reserve > 0.55 && p.sinus < 0.3 && this.drop < 5;
    if (t >= this.nextAcc) { this.nextAcc = t + 15 + r() * 40; if (reactive && t > this.lastEvt + 40 && !this.inDecel(t, 20) && r() < p.accRate * (1 - 0.8 * p.mag) * (1 - 0.7 * Math.min(1, p.fever)) * 0.9) this.accel(false); }
    var f = this.baseNow - this.drop + lv + this.stv + sin, j;
    for (j = this.decels.length - 1; j >= 0 && j >= this.decels.length - 4; j--) { var d = this.decels[j]; if (t >= d.t0 - 13 && t <= d.t1 + 15) f -= decelAt(d, t); }
    for (j = this.accels.length - 1; j >= 0 && j >= this.accels.length - 2; j--) f += accelAt(this.accels[j], t);
    // reserve: insults while the FHR is down, slow recovery otherwise
    var depthNow = this.baseNow - (f - lv - this.stv - sin);
    if (depthNow > 10) p.reserve -= (depthNow - 8) * 0.0000068 * (this.decelType(t) === 'late' ? 2.4 : 1);
    else p.reserve += p.reserveRec * (p.reserve < 0.95 ? 1 : 0.3);
    if (p.sinus > 0.5) p.reserve -= 0.000012;
    p.reserve = clamp(p.reserve, p.rMin || 0, p.rMax == null ? 1 : p.rMax);
    // signal dropout (external transducer)
    if (p.fse) this.dropout = 0; else if (p.signal < 1) { if (this.dropout > 0) this.dropout -= DT; else if (r() < (1 - p.signal) * DT / 20) this.dropout = 3 + r() * 10; }
    this.fhr.push(this.dropout > 0 ? NaN : Math.round(clamp(f, 50, 240) * 4) / 4);
    this.uc.push(Math.round(clamp(uc, 0, 100) * 4) / 4);
    this.bl.push(this.baseNow - this.drop); this.vt.push(this.vtCur);
    // maternal numbers (display)
    var M = this.maternal; M.temp = 37 + p.fever; M.sbp = Math.round(118 - 50 * p.hypo - 30 * p.abrupt * 0.3); M.dbp = Math.round(72 - 30 * p.hypo); M.hr = Math.round(82 + 14 * p.fever + 28 * p.hypo + 18 * p.terbEff + 10 * p.abrupt + (p.rupture ? 30 : 0));
    this.n++; this.t = this.n * DT;
  };
  SP.inDecel = function (t, pad) { pad = pad || 0; for (var j = this.decels.length - 1; j >= 0 && j >= this.decels.length - 3; j--) { var d = this.decels[j]; if (t >= d.t0 - pad && t <= d.t1 + pad) return true; } return this.drop > 8; };
  SP.decelType = function (t) { for (var j = this.decels.length - 1; j >= 0 && j >= this.decels.length - 3; j--) { var d = this.decels[j]; if (t >= d.t0 && t <= d.t1) return d.type; } return this.drop > 10 ? 'prolonged' : null; };
  SP.run = function (sec) { var n = Math.round(sec * HZ); for (var i = 0; i < n; i++) this.stepOne(); };
  SP.scalpStim = function () { // fetal scalp stimulation: an acceleration is reassuring (pH > 7.20 likely)
    var ok = this.p.reserve > 0.5 && this.p.sinus < 0.3 && this.drop < 10;
    if (ok) this.accel(true); return ok;
  };
  SP.cordGas = function () { // estimated umbilical artery pH / base deficit from the remaining reserve
    var R = this.p.reserve, pH = 7.29 - (1 - R) * 0.36 - (this.drop > 30 ? 0.04 : 0), bd = 3 + (1 - R) * 13;
    return { pH: Math.round(pH * 100) / 100, bd: Math.round(bd) };
  };

  /* ---------- ground truth over a window (what the answer key uses) ---------- */
  function round5(x) { return Math.round(x / 5) * 5; }
  CTG.round5 = round5;
  SP.truth = function (t1, win, vwin) {
    t1 = t1 == null ? this.t : t1; win = win || 1200;
    var t0 = Math.max(0, t1 - win), i0 = Math.floor(Math.max(0, t1 - 600) * HZ), iv0 = Math.floor(Math.max(0, t1 - (vwin || 600)) * HZ), i1 = Math.min(this.bl.length, Math.floor(t1 * HZ));
    var sb = 0, nb = 0, sv = 0, nv = 0, i;
    for (i = i0; i < i1; i++) { var tt = i * DT; if (!this.inAnyDecel(tt) || this.dropFor(tt) >= 600) { sb += this.bl[i]; nb++; } if (i >= iv0) { sv += this.vt[i]; nv++; } }
    var baseline = round5(nb ? sb / nb : this.bl[i1 - 1]);
    var vtm = nv ? sv / nv : 10, sinus = this.p.sinus > 0.5;
    var variability = sinus ? 'sinusoidal' : vtm < 1.6 ? 'absent' : vtm <= 5.2 ? 'minimal' : vtm <= 25 ? 'moderate' : 'marked';
    var inW = function (e) { return e.t0 >= t0 && e.t0 < t1; };
    var ucs = this.ucs.filter(inW), dec = this.decels.filter(function (d) { return d.t0 >= t0 && d.t1 <= t1; });
    var drops = this.drops.filter(function (d) { return d.t1 >= t0 && d.t0 < t1; });
    var prolonged = drops.filter(function (d) { return d.dur >= 120 && d.dur < 600; }).length, brady = baseline < 110;
    var by = function (ty) { return dec.filter(function (d) { return d.type === ty; }).length; };
    var nC = ucs.length || 1, late = by('late'), vari = by('variable'), early = by('early');
    var u30 = this.ucs.filter(function (c) { return c.t0 >= Math.max(0, t1 - 1800) && c.t0 < t1; }).length, mins = Math.min(1800, t1) / 600;
    var f = {
      baseline: baseline, variability: variability, accels: this.accels.filter(function (a) { return a.t0 >= t0 && a.t1 <= t1 && !a.induced; }).length,
      early: early, late: late, variable: vari, prolonged: prolonged, contractions: ucs.length,
      lateRecurrent: late / nC >= 0.5 && late >= 2, varRecurrent: vari / nC >= 0.5 && vari >= 2,
      ucPer10: Math.round(u30 / mins * 10) / 10, brady: brady, tachy: baseline > 160, sinus: sinus,
      dropping: this.drop >= 15
    };
    f.tachysystole = f.ucPer10 > 5;
    f.decels = dec.concat(drops.filter(function (d) { return d.dur >= 120 && d.dur < 600; }));
    f.category = CTG.category(f);
    f.predominant = CTG.predominant(f);
    return f;
  };
  SP.inAnyDecel = function (t) {
    for (var j = 0; j < this.decels.length; j++) { var d = this.decels[j]; if (t >= d.t0 - 12 && t <= d.t1 + 14) return true; }
    for (var a = 0; a < this.accels.length; a++) { var x = this.accels[a]; if (t >= x.t0 && t <= x.t1) return true; }
    return this.dropFor(t) > 0;
  };
  SP.dropFor = function (t) { for (var j = 0; j < this.drops.length; j++) { var d = this.drops[j]; if (t >= d.t0 - 20 && t <= d.t1 + 30) return d.dur || 1; } return 0; };

  /* ---------- NICHD three-tier category ---------- */
  CTG.category = function (f) {
    if (f.sinus || f.variability === 'sinusoidal') return 3;
    if (f.variability === 'absent' && (f.lateRecurrent || f.varRecurrent || f.brady)) return 3;
    if (f.baseline >= 110 && f.baseline <= 160 && f.variability === 'moderate' && !f.late && !f.variable && !f.prolonged) return 1;
    return 2;
  };
  CTG.predominant = function (f) {
    if (f.brady && f.baseline < 110) return 'brady';
    if (f.prolonged) return 'prolonged';
    if (f.lateRecurrent) return 'late-rec';
    if (f.varRecurrent) return 'var-rec';
    if (f.late) return 'late-int';
    if (f.variable) return 'var-int';
    if (f.early) return 'early';
    return 'none';
  };
  CTG.DECEL_LABEL = { none: 'No decelerations', early: 'Early decelerations', 'late-rec': 'Recurrent late decelerations', 'late-int': 'Intermittent late decelerations', 'var-rec': 'Recurrent variable decelerations', 'var-int': 'Intermittent variable decelerations', prolonged: 'Prolonged deceleration', brady: 'Bradycardia (sustained, ≥10 min)' };

  /* ---------- independent analyzer: reads only the raw samples ---------- */
  function ma(a, i0, i1, w) { // centered moving average ignoring NaN
    var out = new Float64Array(i1 - i0), h = Math.floor(w / 2);
    for (var i = i0; i < i1; i++) { var s = 0, n = 0; for (var j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j++) { var v = a[j]; if (v === v) { s += v; n++; } } out[i - i0] = n ? s / n : NaN; }
    return out;
  }
  function median(xs) { var a = xs.filter(function (x) { return x === x; }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : NaN; }
  function pct(xs, q) { var a = xs.filter(function (x) { return x === x; }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : NaN; }
  /* shape test: least-squares fit of a gradual (smooth bell) template vs an abrupt (fast fall, hold, recovery) template,
   * on the 5-s average at 1 Hz. Returns the ratio SSE(abrupt)/SSE(gradual): < 1 means the abrupt shape explains it better. */
  function shapeFit(s5, I0, B, d) {
    var a = Math.max(0, Math.round((d.t0 - 25) * HZ) - I0), b = Math.min(s5.length, Math.round((d.t1 + 25) * HZ) - I0), y = [], tt = [];
    for (var i = a; i < b; i += HZ) { if (s5[i] === s5[i]) { y.push(Math.max(-8, B - s5[i])); tt.push((I0 + i) / HZ); } }
    var yy = 0; y.forEach(function (v) { yy += v * v; });
    function sse(fn) { var sb = 0, bb = 0; for (var k = 0; k < y.length; k++) { var v = fn(tt[k]); sb += y[k] * v; bb += v * v; } if (bb <= 0) return yy; var A = Math.max(0, sb / bb); return yy - A * sb; }
    var g = 1e18, ab = 1e18, W, c, o, F, H, R;
    for (W = 50; W <= 140; W += 6) for (c = d.tn20 - 24; c <= d.tn20 + 24; c += 3) { var cw = c, ww = W; g = Math.min(g, sse(function (t) { return bell((t - cw) / ww + 0.5, 1.1); })); }
    var Fs = [3, 6, 9, 13], Hs = [0, 6, 14, 24, 36], Rs = [6, 12, 20, 32, 48];
    for (o = d.t0 - 14; o <= d.t0 + 20; o += 2) for (var fi = 0; fi < Fs.length; fi++) for (var hi = 0; hi < Hs.length; hi++) for (var ri = 0; ri < Rs.length; ri++) {
      F = Fs[fi]; H = Hs[hi]; R = Rs[ri]; var oo = o, FF = F, HH = H, RR = R;
      ab = Math.min(ab, sse(function (t) { var x = t - oo; return x <= 0 ? 0 : x < FF ? x / FF : x < FF + HH ? 1 : x < FF + HH + RR ? 1 - (x - FF - HH) / RR : 0; }));
    }
    return g > 0 ? ab / g : 1;
  }
  CTG.analyze = function (fhr, uc, t1, opts) {
    opts = opts || {}; var win = opts.win || 1200;
    var I1 = Math.min(fhr.length, Math.round(t1 * HZ)), I0 = Math.max(0, I1 - Math.round(win * HZ)), I30 = Math.max(0, I1 - 1800 * HZ);
    var s5 = ma(fhr, I0, I1, 5 * HZ + 1), s10 = ma(fhr, I0, I1, 10 * HZ + 1), s20 = ma(fhr, I0, I1, 20 * HZ + 1), s2 = ma(fhr, I0, I1, 2 * HZ + 1);
    // baseline per 10-min block: iterative robust mean, rounded to 5
    function blockBase(a, b) { var xs = Array.prototype.slice.call(s5, a, b), m = pct(xs, 0.7); for (var it = 0; it < 4; it++) { var k = xs.filter(function (x) { return Math.abs(x - m) < 10; }); if (k.length < 2 * 60 * HZ) break; m = k.reduce(function (p, q) { return p + q; }, 0) / k.length; } return m; }
    var N = I1 - I0, half = Math.max(0, N - 600 * HZ), B2 = blockBase(half, N), B1 = half > 120 * HZ ? blockBase(0, half) : B2;
    var Bat = function (i) { return i < half ? B1 : B2; };
    // UC: contractions (peaks above resting tone)
    var u5 = ma(uc, I30, I1, 5 * HZ + 1), tone = pct(Array.prototype.slice.call(u5), 0.1), top = pct(Array.prototype.slice.call(u5), 0.98), thr = tone + Math.max(7, 0.38 * (top - tone));
    var ucs = [], inU = false, st = 0;
    for (var i = 0; i < u5.length; i++) { var on = u5[i] > thr; if (on && !inU) { inU = true; st = i; } if (!on && inU) { inU = false; if ((i - st) > 15 * HZ) ucs.push([st, i]); } }
    if (inU && u5.length - st > 15 * HZ) ucs.push([st, u5.length]);
    var C = ucs.map(function (c) { var pk = c[0], pv = -1; for (var k = c[0]; k < c[1]; k++) if (u5[k] > pv) { pv = u5[k]; pk = k; } return { t0: (I30 + c[0]) / HZ, t1: (I30 + c[1]) / HZ, tp: (I30 + pk) / HZ, amp: pv - tone }; });
    // decelerations and accelerations
    var ev = [], j, Bk;
    for (j = 0; j < N;) {
      Bk = Bat(j);
      if (s5[j] < Bk - 9) { var a = j; while (j < N && !(s5[j] >= Bk - 9)) j++; var b = j, mn = 1e9, mi = a; for (var q = a; q < b; q++) if (s5[q] < mn) { mn = s5[q]; mi = q; }
        if (Bk - mn >= 13 && (b - a) >= 12 * HZ) {
          var dep = Bk - mn, rq = a; while (rq < b && s5[rq] > mn + 0.12 * dep + 1) rq++;
          var o = rq; while (o > 0 && s10[o] < Bk - Math.max(3, 0.1 * dep)) o--; var e = mi; while (e < N - 1 && s10[e] < Bk - 3) e++;
          // nadir time of a gradual shape: heavier smoothing
          var mn20 = 1e9, mi20 = mi; for (q = o; q <= e; q++) if (s20[q] < mn20) { mn20 = s20[q]; mi20 = q; }
          // abruptness: the largest 10-s fall (5-s average) as a fraction of depth. Abrupt (<30 s to nadir) decels fall most of the way in 10 s.
          var f10 = 0, f15 = 0; for (q = Math.max(0, o - 5 * HZ); q + 10 * HZ <= mi; q++) f10 = Math.max(f10, s5[q] - s5[q + 10 * HZ]);
          var mi10 = mi, mn10 = 1e9; for (q = a; q < b; q++) if (s10[q] < mn10) { mn10 = s10[q]; mi10 = q; }
          for (q = Math.max(0, o - 8 * HZ); q + 15 * HZ <= mi10 + 4 * HZ && q + 15 * HZ < N; q++) f15 = Math.max(f15, s10[q] - s10[q + 15 * HZ]);
          f15 /= Math.max(1, Bk - mn10);
          ev.push({ k: 'dec', t0: (I0 + o) / HZ, t1: (I0 + e) / HZ, tn: (I0 + mi) / HZ, treach: (I0 + rq) / HZ, tn20: (I0 + mi20) / HZ, depth: dep, fall10: f10 / dep, f15: f15 }); }
        continue; }
      if (s5[j] > Bk + 9) { var a2 = j; while (j < N && s5[j] > Bk + 9) j++; var mx = -1; for (var q2 = a2; q2 < j; q2++) mx = Math.max(mx, s5[q2]); var above = 0; for (q2 = a2; q2 < j; q2++) if (s5[q2] > Bk + 13) above++;
        if (mx - Bk >= 14 && above >= 11 * HZ && (j - a2) < 120 * HZ) ev.push({ k: 'acc', t0: (I0 + a2) / HZ, t1: (I0 + j) / HZ, amp: mx - Bk }); continue; }
      j++;
    }
    // merge decels separated by short gaps (W-shaped variables)
    var D = []; ev.filter(function (x) { return x.k === 'dec'; }).forEach(function (d) { var L = D[D.length - 1]; if (L && d.t0 - L.t1 < 6) { L.t1 = d.t1; L.fall10 = Math.max(L.fall10, d.fall10); if (d.depth > L.depth) { L.depth = d.depth; L.tn = d.tn; L.tn20 = d.tn20; } } else D.push(d); });
    D.forEach(function (d) {
      d.dur = d.t1 - d.t0; d.onset = d.treach - d.t0;
      var c = null; C.forEach(function (x) { if (x.tp >= d.t0 - 40 && x.tp <= d.t1) { if (!c || Math.abs(x.tp - d.tn20) < Math.abs(c.tp - d.tn20)) c = x; } });
      d.uc = c; d.lag = c ? d.tn20 - c.tp : null;
      if (d.dur >= 600) d.type = 'brady'; else if (d.dur >= 120) d.type = 'prolonged';
      else if ((d.fit = shapeFit(s5, I0, Bat(Math.round(d.t0 * HZ) - I0), d)) < 0.8) d.type = 'variable';
      else if (c && d.lag > 14) d.type = 'late';
      else if (c) d.type = 'early';
      else d.type = 'variable';
    });
    // variability: median 1-min range of the 2-s average outside periodic/episodic changes
    var bad = new Uint8Array(N); ev.concat(D).forEach(function (x) { var a = Math.max(0, Math.round((x.t0 - 15) * HZ) - I0), b = Math.min(N, Math.round((x.t1 + 15) * HZ) - I0); for (var k = a; k < b; k++) bad[k] = 1; });
    var ranges = [];
    for (var m0 = half; m0 + 60 * HZ <= N; m0 += 60 * HZ) { var lo = 1e9, hi = -1e9, cnt = 0; for (var k2 = m0; k2 < m0 + 60 * HZ; k2++) if (!bad[k2] && s2[k2] === s2[k2]) { lo = Math.min(lo, s2[k2]); hi = Math.max(hi, s2[k2]); cnt++; } if (cnt >= 30 * HZ) ranges.push(hi - lo); }
    // no clean minute (decels with every contraction): variability is reported 'indeterminate' by the analyzer
    var vr = ranges.length ? median(ranges) : NaN;
    // sinusoidal: strong periodicity at 3-5 cycles/min
    var x = [], mean = 0; for (k2 = half; k2 < N; k2++) { x.push(s2[k2] === s2[k2] && s20[k2] === s20[k2] && !bad[k2] ? s2[k2] - s20[k2] : 0); } mean = x.reduce(function (p, q) { return p + q; }, 0) / (x.length || 1); x = x.map(function (v) { return v - mean; });
    var ac = function (L) { var s = 0, s0 = 0; for (var k = 0; k + L < x.length; k++) { s += x[k] * x[k + L]; s0 += x[k] * x[k]; } return s0 ? s / s0 : 0; };
    var best = 0, nGood = 0; for (k2 = half; k2 < N; k2++) if (!bad[k2]) nGood++; if (nGood > 6 * 60 * HZ) for (var L = 12 * HZ; L <= 20 * HZ; L += 2) best = Math.max(best, ac(L));
    var sinus = best > 0.92 && vr > 6;
    var baselineDrop = D.some(function (d) { return d.type === 'brady' && d.t1 >= t1 - 30; });
    var baseline = round5(baselineDrop ? median(Array.prototype.slice.call(s5, N - 120 * HZ, N)) : B2);
    var variability = sinus ? 'sinusoidal' : !(vr === vr) ? 'indeterminate' : vr <= 2 ? 'absent' : vr <= 5.5 ? 'minimal' : vr <= 25 ? 'moderate' : 'marked';
    var nC = C.filter(function (c) { return c.t0 >= (t1 - win); }).length || 1;
    var cnt2 = function (ty) { return D.filter(function (d) { return d.type === ty; }).length; };
    var f = { baseline: baseline, variability: variability, varRange: vr, sinusScore: best, accels: ev.filter(function (e) { return e.k === 'acc'; }).length,
      early: cnt2('early'), late: cnt2('late'), variable: cnt2('variable'), prolonged: cnt2('prolonged'), contractions: C.filter(function (c) { return c.t0 >= (t1 - win); }).length,
      ucPer10: Math.round(C.length / (Math.min(1800, t1) / 600) * 10) / 10, brady: baseline < 110, tachy: baseline > 160, sinus: sinus, decels: D, ucList: C };
    f.lateRecurrent = f.late / nC >= 0.5 && f.late >= 2; f.varRecurrent = f.variable / nC >= 0.5 && f.variable >= 2;
    f.tachysystole = f.ucPer10 > 5; f.category = CTG.category(f); f.predominant = CTG.predominant(f);
    return f;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CTG; else root.CTG = CTG;
})(typeof window !== 'undefined' ? window : this);
