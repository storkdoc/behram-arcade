/* ==========================================================================
   MELTDOWN — sim.js : the reactor physics (a TEACHING MODEL, not an
   engineering simulator). Pure JS, no DOM: runs in the browser (window.RXSim)
   and in node for the tests (module.exports).

   What is modelled (all lumped / zero-dimensional, simplified on purpose):
   • Point kinetics with six delayed-neutron groups (Keepin U-235 data,
     beta = 0.0065, PWR generation time 2e-5 s), solved implicitly with
     adaptive sub-steps, so prompt jumps, the ~80 s negative period after a
     SCRAM and prompt-critical runaways are all reproduced.
     Reactivity in pcm (1e-5 dk/k) and dollars (rho / beta).
   • Control-rod integral worth S-curve  W(x) = x - sin(2 pi x)/(2 pi)
     (the classic sine-squared differential worth); shutdown bank; stuck rod;
     RBMK graphite-displacer "positive scram" when fully-withdrawn rods drop.
   • Feedback: fuel Doppler (always negative), moderator temperature
     coefficient that turns less negative with boron, void coefficient
     (PWR strongly negative, RBMK positive and larger at low ORM), boron.
   • I-135 / Xe-135 with burn-out (half-lives 6.57 h / 9.14 h), on a plant
     clock accelerated x120 so the iodine pit happens in minutes.
   • Decay heat as 7 fission-product groups fitted to Way-Wigner
     (6.9 % at shutdown, 2.5 % at 100 s, 1.2 % at 1 h), plant clock x4.
   • Fuel -> clad -> coolant heat transfer (implicit), DNB ratio, film
     boiling, core uncovery, Zr-steam oxidation heat + hydrogen, fuel melt.
   • Primary loop: 4 coolant pumps with coast-down, natural circulation,
     pressurizer level / pressure with heaters, sprays, PORV (+ block valve),
     safety valves, saturation/flashing and steam voids, inventory, ECCS
     (HPI, accumulators, LPI) with borated cold water, charging/letdown.
   • Secondary: steam generator level and pressure, main / auxiliary
     feedwater, MSIVs, steam dumps, steam-line break, turbine + generator.
   • Electrical: offsite power, two diesel generators, batteries.
   • Reactor protection system trips and safety injection.
   ========================================================================== */
(function (root) {
'use strict';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- water saturation (IAPWS-IF97 table, T degC -> P MPa) ---------- */
const SAT = [[20, .00234], [50, .0124], [100, .1014], [120, .1985], [150, .4762], [180, 1.0028], [200, 1.5549], [220, 2.3196],
  [240, 3.3469], [260, 4.6923], [280, 6.4166], [290, 7.4418], [300, 8.5879], [310, 9.8651], [320, 11.284], [330, 12.858],
  [340, 14.601], [350, 16.529], [360, 18.666], [370, 21.044], [374, 22.064]];
function psat(T) {
  if (T <= 20) return 0.00234; if (T >= 374) return 22.064 + (T - 374) * 0.3;
  for (let i = 1; i < SAT.length; i++) if (T <= SAT[i][0]) {
    const [t0, p0] = SAT[i - 1], [t1, p1] = SAT[i], f = (T - t0) / (t1 - t0);
    return Math.exp(lerp(Math.log(p0), Math.log(p1), f));
  }
  return 22.064;
}
function tsat(P) {
  if (P <= 0.00234) return 20; if (P >= 22.064) return 374;
  for (let i = 1; i < SAT.length; i++) if (P <= SAT[i][1]) {
    const [t0, p0] = SAT[i - 1], [t1, p1] = SAT[i], f = (Math.log(P) - Math.log(p0)) / (Math.log(p1) - Math.log(p0));
    return lerp(t0, t1, f);
  }
  return 374;
}

/* ---------- reactor types ---------- */
const TYPES = {
  PWR: {
    name: 'PWR', label: 'Pressurized water reactor (4-loop)', mwt: 3000, mwe: 1000,
    beta: 0.0065, lam: 0.0767, gen: 2e-5,
    alphaD: -2.6,           // pcm/degC fuel (Doppler) -- typical -2..-4
    mtc0: -40, mtcB: 0.02,  // MTC = -40 + 0.02*ppm  pcm/degC  (-22 at 900 ppm, ~0 at 2000 ppm)
    voidCoef: -120,         // pcm per % core void (strongly negative: water is the moderator)
    xeWorth: 2700,          // pcm, equilibrium xenon at 100 % (typical 2500-3000)
    rodWorth: 3000, sdWorth: 5000, boronWorth: -10,  // pcm, pcm, pcm/ppm
    scramTime: 2.2, rodSpeed: 0.04, boron: true, nomP: 15.5, tip: false
  },
  RBMK: {
    name: 'RBMK', label: 'RBMK-style graphite-moderated boiling-water reactor', mwt: 3200, mwe: 1000,
    beta: 0.005, lam: 0.0767, gen: 6e-4,
    alphaD: -1.2, mtc0: 0, mtcB: 0,
    voidCoef: 25,           // pcm per % void (INSAG-7: +2.0-2.5e-4 per % void in the 1986 core)
    xeWorth: 2700,
    rodWorth: 8000, sdWorth: 0, boronWorth: 0,
    scramTime: 18, rodSpeed: 0.025, boron: false, nomP: 6.9, tip: true
  }
};

const NR = 9;                     // control-rod clusters shown in the cross-section
const RODX = [];                  // their horizontal position -1..1 across the core
for (let i = 0; i < NR; i++) RODX.push(-0.84 + i * 0.21);
const RODW = RODX.map(x => 0.45 + Math.cos(x * 1.25) ** 2);   // centre rods sit in higher flux = more worth
const RODWS = RODW.reduce((a, b) => a + b, 0);
const S_CURVE = x => { x = clamp(x, 0, 1); return x - Math.sin(2 * Math.PI * x) / (2 * Math.PI); };

const DH_A = [0.01761, 0.02030, 0.01140, 0.00647, 0.00608, 0.00004, 0.00677];  // fitted to Way-Wigner (see NOTES.md)
const DH_TAU = [1.5, 15, 150, 1500, 15000, 150000, 1.5e6];
const DH_SUM = DH_A.reduce((a, b) => a + b, 0);
const DH_ACCEL = 4;               // decay-heat plant clock
const XE_ACCEL = 120;             // xenon / iodine plant clock
const LAM_I = Math.log(2) / (6.57 * 3600), LAM_X = Math.log(2) / (9.14 * 3600);
const XE_K = 3.8;                 // sigma_X * phi_0 / lambda_X at full power (phi ~ 3e13 n/cm2/s)
const XE_Y = 0.0024 / 0.0639;     // direct Xe yield / I yield
const X_EQ1 = LAM_I * (1 + XE_Y) / (LAM_X * (1 + XE_K));

// geometry of the primary loop (normalised volumes)
const VL = 0.85, VP = 0.15;       // loops+vessel, pressurizer
const CC = 0.55;                  // primary heat capacity (full-power-seconds per degC)
const CF = 0.0045, CCL = 0.0008;  // fuel, clad heat capacity
const RG = 380;                   // fuel -> clad resistance (degC per unit power)
const H_NB = 0.04, H_FB = 0.004, H_ST = 0.00001;  // clad -> coolant: nucleate, film, steam

// RBMK rods are withdrawn in a sequence: at a low ORM most rods are fully out, a few are deep in
const RB_ORDER = [4, 0, 8, 2, 6, 1, 7, 3, 5];   // insertion order (first = withdrawn last)
function setBank(s) { for (let k = 0; k < NR; k++) { const i = RB_ORDER[k]; if (!s.stuck[i]) s.rods[i] = clamp(s.bank * NR - k, 0, 1); } }
function xenonEq(n) { const I = n; const X = LAM_I * (I + XE_Y * n) / (LAM_X + XE_K * LAM_X * n); return { I, X }; }

/* ---------- create ---------- */
function create(opt) {
  opt = opt || {};
  const type = TYPES[opt.type || 'PWR'];
  const s = {
    type, t: 0, plantH: 0,
    n: opt.power != null ? opt.power : 1, c: 0, cg: [0, 0, 0, 0, 0, 0],
    rods: new Array(NR).fill(0), stuck: new Array(NR).fill(false), sd: 0, rodCmd: 0, rodAuto: false, runaway: 0,
    scram: false, scramT: 0, scramCause: '', scramIns0: null, tripsBypassed: !!opt.tripsBypassed,
    B: 900, borCmd: 0, dilutionLeak: 0,
    Tf: 800, Tcl: 332, Tup: 340, Tavg: 307, Thot: 323.5, Tcold: 290.5, M: 1, Vv: 0, P: 15.5, Lpzr: 0.6, dP: 0,
    heaters: 0, spray: 0, pzrAuto: true,
    Ts2: 285, Ps: 6.9, Lsg: 0.5, Fsteam: 1, Ffw: 1, fwAuto: true, fwMan: 1, mainFW: true, afw: false, afwFlow: 0,
    afwAuto: true, afwBlockedT: 0, msiv: 1, msivCmd: 1, bank: 0, noFeedback: false, noTurbineTripScram: false, dumpCap: 0.4, dump: 0, slb: 0, sgDump: 0,
    pumps: [0, 1, 2, 3].map(() => ({ on: true, set: 1, w: 1, failed: false })), W: 1, pumpSpeed: 1,
    turb: { tripped: false, load: 1, rpm: 1800, synced: true, latchT: 0 }, MWe: 1000,
    porvCmd: false, porvAuto: false, porvStuck: false, porv: 0, block: 1, blockCmd: 1, safety: 0, quenchP: 0.1, tailT: 60,
    leak: 0, si: false, siBlocked: false, hpiThrottle: 1, acc: 0.25, lpi: 0, charging: 0.0004, letdown: 0.0004, makeupAuto: true,
    offsite: true, dg: [{ st: 'off', t: 0, failP: 0 }, { st: 'off', t: 0, failP: 0 }], battery: 1, dcLoadShed: false, fireTruck: 0,
    D: DH_A.map(a => a), I: 1, X: X_EQ1,
    rho: { rods: 0, boron: 0, doppler: 0, mod: 0, void: 0, xenon: 0, tip: 0, ext: 0, total: 0 }, rho0: 0,
    period: Infinity, dlogn: 0, voidCore: 0, coverage: 1, dnbr: 2, regime: 'NUCLEATE', SM: 20,
    TfPk: 1800, TclPk: 345, h2: 0, ox: 0, melt: 0, damage: 0, released: 0, exploded: false, meltdown: false,
    ORM: 30, noDelayed: false, voidCoefOverride: null, extRho: 0,
    trip: { cause: '' }, events: [], alarms: {}, decay: 0, Q: 1, Qcc: 1, Qsg: 1,
    eccsFlow: 0, ventFlow: 0, testRundown: 0, rbmkSub: 10,
  };
  if (type.name === 'RBMK') {
    s.P = 6.9; s.Tavg = tsat(6.9); s.Thot = s.Tavg; s.Tcold = s.Tavg - 10; s.Tcl = s.Tavg + 20; s.Tf = 700;
    s.pumps = [0, 1, 2, 3].map(() => ({ on: true, set: 1, w: 1, failed: false }));
  }
  const n = s.n;
  // initial thermal state consistent with the power level
  if (type.name === 'PWR') {
    s.Tavg = 292 + 15 * Math.min(1, n); s.Tcl = s.Tavg + n / H_NB; s.Tf = s.Tcl + n * RG;
    s.Ts2 = s.Tavg - 22 * n; s.Ps = psat(s.Ts2); s.Lpzr = 0; s.turb.load = n; s.Fsteam = n; s.Ffw = n;
    if (n < 0.02) { s.turb.tripped = true; s.turb.synced = false; s.turb.rpm = 0; s.turb.load = 0; s.Fsteam = 0; s.Ffw = 0; s.Ts2 = s.Tavg; s.Ps = psat(s.Ts2); }
  } else {
    s.Tcl = s.Tavg + n / H_NB; s.Tf = s.Tcl + n * RG * 0.9;
  }
  s.c = s.n; s.cg.fill(s.n);
  s.D = DH_A.map(a => a * n);
  const xe = opt.xe || xenonEq(n); s.I = xe.I; s.X = xe.X;
  if (opt.boron != null) s.B = opt.boron;
  if (type.name === 'RBMK') { s.bank = opt.rods != null ? opt.rods : 0.5; setBank(s); }
  else if (opt.rods != null) s.rods.fill(opt.rods);
  else s.rods.fill(0.12);
  if (opt.sd != null) s.sd = opt.sd;
  derive(s, 0);
  computeRho(s);
  // excess reactivity of the fuel: chosen so the starting state is exactly critical
  s.rho0 = -s.rho.total + (opt.rhoBias || 0);
  computeRho(s);
  return s;
}

/* ---------- reactivity ---------- */
function voidCoef(s) {
  if (s.voidCoefOverride != null) return s.voidCoefOverride;
  if (s.type.name === 'RBMK') return s.type.voidCoef * (1 + 1.0 * clamp((26 - s.ORM) / 26, 0, 1));
  return s.type.voidCoef;
}
function computeRho(s) {
  const T = s.type, r = s.rho;
  let rodsIns = 0, lin = 0; for (let i = 0; i < NR; i++) { rodsIns += RODW[i] / RODWS * S_CURVE(s.rods[i]); lin += s.rods[i] / NR; }
  r.rods = -T.rodWorth * rodsIns - T.sdWorth * S_CURVE(s.sd);
  if (T.name === 'RBMK') s.ORM = 54 * lin;
  r.boron = T.boron ? T.boronWorth * s.B : 0;
  const fb = s.noFeedback ? 0 : 1;
  r.doppler = fb * T.alphaD * (s.Tf - 292);
  const mtc = T.mtc0 + T.mtcB * s.B;
  r.mod = fb * (T.name === 'PWR' ? mtc * (s.Tavg - 292) : 0);
  r.void = fb * voidCoef(s) * s.voidCore * 100;
  r.xenon = fb * -T.xeWorth * s.X / X_EQ1;
  // RBMK positive scram: graphite displacers push water out of the bottom of the channels
  r.tip = 0;
  if (T.tip && s.scram && s.scramIns0) {
    let tip = 0;
    for (let i = 0; i < NR; i++) if (s.scramIns0[i] < 0.06) { const x = s.rods[i]; if (x < 0.3) tip += RODW[i] / RODWS * Math.sin(Math.PI * x / 0.3); }
    r.tip = 1e5 * T.beta * (1.0 + 1.2 * clamp((26 - s.ORM0) / 26, 0, 1)) * tip;
  }
  r.ext = s.extRho;
  r.total = s.rho0 + r.rods + r.boron + r.doppler + r.mod + r.void + r.xenon + r.tip + r.ext;
  r.dollars = r.total / (T.beta * 1e5);
  r.mtc = mtc;
  return r.total;
}

/* ---------- kinetics: six delayed groups, implicit (stable for the stiff prompt mode) ----------
   normalised precursors c_i = lambda_i * Lambda * C_i / beta_i  (c_i = n at equilibrium)
     dn/dt  = (rho - beta)/Lambda * n + sum(beta_i/Lambda * c_i) + q
     dc_i/dt = lambda_i * (n - c_i)                                                       */
const BETA_F = [0.000215, 0.001424, 0.001274, 0.002568, 0.000748, 0.000273].map(b => b / 0.0065);   // Keepin U-235 group fractions
const LAMS = [0.0124, 0.0305, 0.111, 0.301, 1.14, 3.01];
function kinetics(s, h) {
  const T = s.type, rho = s.rho.total * 1e-5, L = T.gen, q = 2e-5;
  if (s.noDelayed) {   // the thought experiment: every neutron prompt
    s.n = clamp(s.n * Math.exp(Math.min(50, rho / L * h)) + q * h, 0, 1e5); for (let i = 0; i < 6; i++) s.cg[i] = s.n; s.c = s.n; return;
  }
  const beta = T.beta, a = (rho - beta) / L;
  let left = h;
  while (left > 1e-12) {
    const k = a > 0 ? Math.min(left, 0.25 / a) : left;
    let den = 1 - k * a, rhs = s.n + k * q;
    for (let i = 0; i < 6; i++) { const bi = beta * BETA_F[i] / L, li = LAMS[i], f = 1 / (1 + k * li); den -= k * bi * k * li * f; rhs += k * bi * s.cg[i] * f; }
    const nn = clamp(rhs / den, 0, 1e5);
    for (let i = 0; i < 6; i++) { const li = LAMS[i]; s.cg[i] = (s.cg[i] + k * li * nn) / (1 + k * li); }
    s.n = nn; left -= k;
  }
  let c = 0; for (let i = 0; i < 6; i++) c += BETA_F[i] * s.cg[i]; s.c = c;
}

/* ---------- thermal-hydraulics + plant ---------- */
// specific volume of water relative to 307 C (steam-table values, compressed liquid ~15 MPa)
const VT = [[20, 1.001], [100, 1.040], [150, 1.085], [200, 1.150], [250, 1.240], [280, 1.320], [300, 1.395], [320, 1.490], [340, 1.630], [360, 1.900]];
function vrel(T) {
  if (T <= VT[0][0]) return VT[0][1] / 1.42;
  for (let i = 1; i < VT.length; i++) if (T <= VT[i][0]) { const [a, va] = VT[i - 1], [b, vb] = VT[i]; return (va + (vb - va) * (T - a) / (b - a)) / 1.42; }
  return VT[VT.length - 1][1] / 1.42;
}
function derive(s) {
  const T = s.type;
  // flow
  let W = 0; for (const p of s.pumps) W += p.w * 0.25;
  if (T.name === 'RBMK') W *= 1.1;
  const nat = (s.Lsg > 0.1 || T.name === 'RBMK') ? 0.045 * Math.cbrt(Math.max(0, s.Q)) : 0.01;
  s.W = Math.max(W, nat);
  if (T.name === 'PWR') {
    const Vw = s.M * 0.94 * vrel(s.Tavg);
    s.Vv = clamp(s.Vv, 0, Math.max(0, VL + VP * 1.02 - Vw));   // steam can only occupy space the water leaves
    const liquid = Math.min(Vw, VL - s.Vv);
    s.Lpzr = clamp((Vw + s.Vv - VL) / VP, 0, 1.02);
    s.voidLoops = clamp((VL - liquid) / VL, 0, 1);
    const f = liquid / VL;
    if (s.W > 0.3 && f > 0.45) s.coverage = 1;
    else s.coverage = clamp((f - 0.35) / 0.3, 0, 1);
    s.voidCore = clamp(s.voidLoops * 1.2 + (1 - s.coverage) * 0.8, 0, 1);
    const dT = clamp(s.Qcc / Math.max(0.02, s.W) * 33, 0, 160);
    s.Thot = s.Tavg + dT / 2; s.Tcold = s.Tavg - dT / 2;
    s.SM = tsat(s.P) - s.Thot;
  } else {
    // RBMK boiling channel: inlet subcooling depends on feedwater vs recirculation flow
    s.rbmkSub = 10 * s.Ffw / Math.max(0.05, s.W) + 0.5 + s.testRundown * 0;
    const qw = s.Qcc / Math.max(0.05, s.W);
    const sub = s.rbmkSub / 60;
    const xout = Math.max(0, qw - sub) / 5.75;
    const boilFrac = qw > 1e-6 ? clamp(1 - sub / qw, 0, 1) : 0;
    const xa = xout * 0.5;
    const alpha = xa > 0 ? xa / (xa + (1 - xa) * 0.05 * 2) : 0;
    s.voidTarget = clamp(alpha * boilFrac, 0, 0.95);
    s.coverage = 1; s.Lpzr = 0; s.voidLoops = s.voidCore;
    s.Thot = tsat(s.P); s.Tavg = s.Thot; s.Tcold = s.Thot - s.rbmkSub; s.SM = 0;
  }
}

function acPower(s) { return s.offsite || s.dg.some(d => d.st === 'run'); }

function step(s, dt) {
  // keep sub-steps small; finer when near / past prompt critical
  let left = dt;
  while (left > 1e-9) {
    const pc = s.rho.dollars > 0.75 || s.n > 2;
    const h = Math.min(left, pc ? 0.0005 : 0.02);
    sub(s, h); left -= h;
    if (s.exploded) break;
  }
  return s;
}

function sub(s, h) {
  const T = s.type, PWR = T.name === 'PWR';
  s.t += h;
  const ac = acPower(s);
  /* ---- electrical ---- */
  for (const d of s.dg) {
    if (d.st === 'starting') { d.t += h; if (d.t > 10) { d.st = Math.random() < d.failP ? 'failed' : 'run'; s.events.push({ k: d.st === 'run' ? 'dg-run' : 'dg-fail', t: s.t }); } }
    if (d.st === 'run' && d.flooded) d.st = 'failed';
  }
  if (!s.offsite && s.dg.every(d => d.st === 'off')) for (const d of s.dg) if (!d.flooded) { d.st = 'starting'; d.t = 0; }
  if (!ac) s.battery = Math.max(0, s.battery - h / (s.dcLoadShed ? 1200 : 600));
  else s.battery = Math.min(1, s.battery + h / 600);
  if (!ac) s.sboT = (s.sboT || 0) + h; else s.sboT = 0;
  s.sealLeak = s.type.name === 'PWR' && s.sboT > 90 ? 0.12 : 0;
  const dc = s.battery > 0;
  /* ---- pumps ---- */
  for (const p of s.pumps) {
    const run = p.on && !p.failed && (PWR ? ac : (s.testRundown > 0 && p.rundown ? true : ac));
    let target = run ? p.set * s.pumpSpeed : 0;
    if (p.rundown && s.testRundown > 0) target = Math.min(target, Math.max(0.55, 1 - s.testRundown / 200));
    if (p.w < target) p.w = Math.min(target, p.w + h / 8); else p.w += (target - p.w) * (1 - Math.exp(-h / 12));
  }
  if (s.testRundown > 0) s.testRundown += h;
  /* ---- rods ---- */
  if (s.scram) {
    s.scramT += h;
    const sp = T.name === 'PWR' ? Math.min(1, 0.15 + s.scramT * 0.9) / T.scramTime * 1.6 : 1 / T.scramTime;
    for (let i = 0; i < NR; i++) if (!s.stuck[i]) s.rods[i] = Math.min(1, s.rods[i] + sp * h);
    s.sd = Math.min(1, s.sd + sp * h);
  } else {
    let cmd = s.rodCmd;
    if (s.rodAuto && PWR && cmd === 0 && !s.turb.tripped) {
      const tref = 292 + 15 * Math.min(1, s.turb.load);
      // Tavg error plus a power-mismatch lead term (nuclear power vs turbine load), proportional speed
      const err = (s.Tavg - tref) + 40 * (s.n - s.turb.load);
      cmd = Math.abs(err) < 0.6 ? 0 : -clamp(err / 5, -1, 1) * 0.45;   // rodCmd convention: +1 = withdraw
    }
    if (s.rodAuto && !PWR && cmd === 0) {
      // RBMK automatic regulator (LAR): holds thermal power at the set point with the regulating group
      const err = s.n / Math.max(0.01, s.powerSet || 1) - 1;
      cmd = err > 0.015 ? -1 : err < -0.015 ? 1 : 0;
    }
    if (s.runaway) cmd = 1;
    if (cmd && T.name === 'RBMK') { s.bank = clamp(s.bank - cmd * T.rodSpeed * h, 0, 1); setBank(s); }
    else if (cmd) for (let i = 0; i < NR; i++) if (!s.stuck[i]) s.rods[i] = clamp(s.rods[i] - cmd * T.rodSpeed * h, 0, 1);
    s.rodMoving = cmd;
  }
  /* ---- boron ---- */
  if (T.boron) {
    let dB = s.borCmd * 4 * h;     // borate / dilute about 4 ppm per second (game speed)
    dB -= s.dilutionLeak * h;
    s.B = clamp(s.B + dB, 0, 3000);
  }
  /* ---- fission products ---- */
  const hx = h * XE_ACCEL, hd = h * DH_ACCEL;
  const nn = Math.min(s.n, 3);
  if (!s.xeFrozen) {
  s.I += LAM_I * (nn - s.I) * hx;
  s.X += (LAM_I * (s.I + XE_Y * nn) - LAM_X * s.X - XE_K * LAM_X * nn * s.X) * hx;
  }
  s.X = Math.max(0, s.X);
  let decay = 0;
  for (let i = 0; i < DH_A.length; i++) { s.D[i] += (DH_A[i] * nn - s.D[i]) * (1 - Math.exp(-hd / DH_TAU[i])); decay += s.D[i]; }
  s.decay = decay;
  s.plantH += hx / 3600;
  /* ---- reactivity + kinetics ---- */
  computeRho(s);
  const n0 = s.n;
  kinetics(s, h);
  const g = Math.log(Math.max(1e-12, s.n) / Math.max(1e-12, n0)) / h;
  s.dlogn += (g - s.dlogn) * Math.min(1, h / 0.6);
  s.period = Math.abs(s.dlogn) < 1e-4 ? Infinity : 1 / s.dlogn;
  /* ---- heat: fission (prompt part) + decay ---- */
  const Q = s.n * (1 - DH_SUM) + decay;
  s.Q = Q;
  // Zr-steam reaction (exothermic, makes hydrogen) when hot clad meets steam
  const steamy = (1 - s.coverage) + (s.regime === 'FILM' ? 0.4 : 0) + (s.voidCore > 0.6 ? 0.3 : 0);
  let zr = 0;
  if (s.TclPk > 900 && steamy > 0 && s.ox < 1) {
    zr = 2.2e-5 * Math.exp((s.TclPk - 1200) / 115) * Math.min(1, steamy) * (1 - s.ox);
    zr = Math.min(zr, 0.02);
    s.ox = Math.min(1, s.ox + zr * h); s.h2 += zr * h * 1100;
  }
  const Qzr = zr * 54;
  // heat transfer clad -> coolant
  let hwet = H_NB;
  if (s.regime === 'FILM') hwet = H_FB;
  if (PWR) hwet *= 1 - 0.6 * s.voidLoops;
  const hc = s.coverage * hwet + (1 - s.coverage) * H_ST;
  const Tcool = s.Tavg;
  // implicit fuel, then clad
  s.Tf = (CF / h * s.Tf + Q + s.Tcl / RG) / (CF / h + 1 / RG);
  s.Tcl = (CCL / h * s.Tcl + s.Tf / RG + hc * Tcool + Qzr) / (CCL / h + 1 / RG + hc);
  const Qcc = hc * (s.Tcl - Tcool);
  s.Qcc = Qcc;
  // peaking (hot channel)
  const cool = PWR ? s.Thot : s.Tavg;
  s.TclPk = cool + (s.Tcl - Tcool) * 1.7;
  s.TfPk = s.TclPk + (s.Tf - s.Tcl) * 3.6;
  // uncovered upper core: fuel + clad heat up almost adiabatically on decay heat (+ Zr-steam heat)
  if (s.coverage < 0.985) {
    const qUp = Q * 1.4 + Qzr * 1.5;
    s.Tup += (qUp - H_ST * (s.Tup - tsat(s.P))) / (CF + CCL) * h;
  } else s.Tup += (s.TclPk - s.Tup) * Math.min(1, h * 0.5);   // quench / reflood
  s.Tup = Math.min(s.Tup, 2950);   // beyond this the fuel melts and slumps (latent heat): temperature plateaus, melt fraction grows
  if (s.Tup > s.TclPk) { s.TclPk = s.Tup; s.TfPk = Math.max(s.TfPk, s.Tup + Q * 60); }
  s.TclPk = Math.min(s.TclPk, 3000); s.TfPk = Math.min(s.TfPk, 3100);   // displayed hot spot plateaus at melting; melt fraction carries the damage
  // DNB ratio (critical heat flux / heat flux at the hot spot)
  const W = Math.max(0.01, s.W);
  if (PWR) {
    const chf = 1.613 * (0.3 + 0.7 * Math.pow(W, 0.8)) * (1 + 0.012 * clamp(s.SM, -10, 40)) * clamp(1 - 0.02 * (s.P - 15.5), 0.5, 1.3) * (1 - 0.7 * s.voidLoops);
    s.dnbr = clamp(chf / Math.max(1e-4, Qcc * 1.0), 0, 9.99);
  } else {
    const chf = 2.2 * (0.25 + 0.75 * Math.pow(W, 0.8));
    s.dnbr = clamp(chf / Math.max(1e-4, Qcc), 0, 9.99);
  }
  if (s.coverage < 0.98) s.regime = 'UNCOVERED';
  else if (s.dnbr < 1.0) s.regime = 'FILM';
  else if (s.regime === 'FILM' && s.dnbr < 1.15) s.regime = 'FILM';    // rewetting needs margin
  else s.regime = (PWR && s.SM > 2) ? 'NUCLEATE' : 'BOILING';
  /* ---- primary / secondary ---- */
  if (PWR) pwrLoop(s, h, ac, dc); else rbmkLoop(s, h);
  derive(s);
  /* ---- damage ---- */
  if (s.TclPk > 1204) s.damage = Math.min(1, s.damage + h * (s.TclPk - 1204) / 40000);
  if (s.TclPk > 1850) s.released = Math.min(1, s.released + h * 0.01);
  if (s.TfPk > 2840) s.melt = Math.min(1, s.melt + h * (s.TfPk - 2840) / (s.n > 5 ? 300 : 2500));
  if (s.melt > 0.25 && !s.meltdown) { s.meltdown = true; s.events.push({ k: 'meltdown', t: s.t }); }
  if (!PWR && !s.exploded && (s.n > 30 || (s.n > 6 && s.TfPk > 2400))) { s.exploded = true; s.meltdown = true; s.events.push({ k: 'explosion', t: s.t }); }
  if (PWR && !s.exploded && s.n > 40 && s.TfPk > 2840) { s.exploded = true; s.meltdown = true; s.events.push({ k: 'excursion', t: s.t }); }
  /* ---- protection ---- */
  protection(s);
}

function pwrLoop(s, h, ac, dc) {
  const T = s.type;
  /* --- secondary side --- */
  const msivOpen = s.msiv;
  s.msiv += clamp(s.msivCmd - s.msiv, -h / 4, h / 4);
  // turbine
  const tb = s.turb;
  if (!tb.tripped && msivOpen > 0.2) tb.rpm += (1800 - tb.rpm) * (1 - Math.exp(-h / 6));
  else tb.rpm *= Math.exp(-h / 70);
  if (tb.latchT > 0) { tb.latchT -= h; if (tb.latchT <= 0) { tb.synced = true; } }
  const pr = s.Ps / 6.9;
  const turbFlow = (!tb.tripped && tb.synced) ? tb.load * pr * msivOpen : 0;
  // steam dumps (condenser) hold no-load Tavg after a turbine trip; atmospheric dumps (operator)
  const autoDump = clamp((s.Ts2 - 287) * 0.05, 0, s.dumpCap) * msivOpen * (s.offsite ? 1 : 0);
  s.dump = autoDump;
  const sgDump = s.sgDump * 0.12 * pr;                         // atmospheric relief valves (operator)
  const safetyV = s.Ps > 8.3 ? (s.Ps - 8.3) * 2 : 0;
  const slb = s.slb * 2.2 * pr * (s.slbUpstream ? 1 : msivOpen); // steam line break
  // turbine-driven aux feed uses a little steam
  s.Fsteam = turbFlow + autoDump + sgDump + safetyV + slb + (s.afwTD ? 0.01 * pr : 0);
  s.MWe = turbFlow * 1000 * clamp(0.7 + 0.3 * pr, 0, 1.02);
  // feedwater
  if (!s.mainFW && !tb.tripped && s.n > 0.15) tripTurbine(s);   // loss of both main feed pumps trips the turbine
  const mainAvail = s.mainFW && ac && s.offsite && !tb.tripped;
  let fw = 0;
  if (mainAvail) fw = s.fwAuto ? clamp(s.Fsteam + (0.5 - s.Lsg) * 2.5, 0, 1.25) : s.fwMan * 1.2;
  // auxiliary feedwater: motor-driven needs AC, turbine-driven needs steam + DC
  if (s.afwAuto && !s.afw && (s.scram || s.Lsg < 0.3 || !s.mainFW)) { s.afw = true; s.events.push({ k: 'afw-auto', t: s.t }); }
  const afwOK = !(s.afwBlockedT > 0); if (s.afwBlockedT > 0) s.afwBlockedT -= h;
  const afwMotor = s.afw && ac && afwOK;
  s.afwTD = s.afw && dc && s.Ps > 0.8 && afwOK;
  let afw = (afwMotor ? 0.06 : 0) + (s.afwTD ? 0.05 : 0);
  if (s.fireTruck && s.Ps < 1.0) afw += 0.06;
  if (s.Lsg > 0.8) afw *= 0.2;
  s.afwFlow = afw;
  fw += afw;
  s.Ffw = fw;
  s.Lsg = clamp(s.Lsg + (fw - s.Fsteam) * (s.otsg ? 0.06 : 0.008) * h, 0, 1);   // once-through SG (B&W, TMI-2) holds far less water
  // SG heat transfer
  const fW = 0.3 + 0.7 * Math.pow(Math.max(0, s.W), 0.8);
  const fL = clamp(s.Lsg / 0.3, 0, 1);
  const UA = (1 / 22) * fW * fL;
  const Qsg = UA * (s.Tavg - s.Ts2);
  s.Qsg = Qsg;
  const fwCool = Math.max(0, fw - s.Fsteam) * 0.15;
  s.Ts2 += (Qsg - s.Fsteam - fwCool) / (s.otsg ? 0.15 : 0.45) * h;
  s.Ts2 = clamp(s.Ts2, 30, 360);
  s.Ps = psat(s.Ts2);
  /* --- primary inventory --- */
  const P = s.P;
  // PORV: auto opens at 16.2 MPa (pressure relief), or by operator command; may stick open
  if (s.porvAuto && P < 15.9) s.porvAuto = false;
  if (P > 16.2) s.porvAuto = true;
  const porvWant = (s.porvCmd || s.porvAuto) && dc;
  if (s.porvStuck) s.porv = Math.min(1, s.porv + h * 4); else s.porv += ((porvWant ? 1 : 0) - s.porv) * Math.min(1, h * 4);
  s.block += clamp(s.blockCmd - s.block, -h / 8, h / 8);
  const porvFlowPath = s.porv * s.block;
  s.safety = P > 17.2 ? clamp((P - 17.2) * 2, 0, 1) : 0;
  const solid = s.Lpzr >= 0.995;
  const steamVent = solid ? 0 : (porvFlowPath * 0.0006 + s.safety * 0.004) * P / 15.5;      // steam: carries latent heat away
  const ventMass = steamVent + (solid ? (porvFlowPath * 0.0018 + s.safety * 0.008) * P / 15.5 : 0);   // solid pressurizer: water through the valve
  const leakMass = (s.leak + s.sealLeak) * 0.004 * Math.sqrt(Math.max(0, P - 0.15) / 15.5);
  s.ventFlow = ventMass + leakMass;
  // quench tank / tailpipe (the clues TMI operators had)
  s.tailT += ((porvFlowPath > 0.05 ? 140 + 120 * porvFlowPath : 60) - s.tailT) * Math.min(1, h / 6);
  s.quenchP = clamp(s.quenchP + (porvFlowPath * 0.004 + s.safety * 0.02) * h - (s.quenchP > 0.86 ? 0.03 * h : 0), 0.1, 0.9);
  if (s.quenchP > 0.85 && !s.quenchBurst) { s.quenchBurst = true; s.events.push({ k: 'quench-burst', t: s.t }); }
  // ECCS
  if (s.si && !s.siBlocked) {
    const hpi = ac ? 0.0038 * clamp((18.5 - P) / 10, 0.25, 1) * s.hpiThrottle : 0;
    let accF = 0; if (P < 4.2 && s.acc > 0) { accF = Math.min(s.acc / h, 0.03 * (4.2 - P) / 4.2 + 0.004); s.acc -= accF * h; }
    const lpi = (ac && P < 1.4) ? 0.02 * (1.4 - P) / 1.4 + 0.003 : 0;
    s.eccsFlow = hpi + accF + lpi;
  } else s.eccsFlow = 0;
  // normal charging / letdown (makeup system auto-controls pressurizer level)
  let charge = 0;
  if (ac) charge = s.makeupAuto ? clamp(0.0004 + (0.55 - s.Lpzr) * 0.006, 0, 0.0016) : 0.0004;
  const letdown = (s.si || !ac) ? 0 : 0.0004;
  const inflow = charge + s.eccsFlow;
  s.M = clamp(s.M + (inflow - letdown - ventMass - leakMass) * h, 0, (VL + VP) / (0.94 * vrel(s.Tavg)));
  // TMI: steam leaving the TOP of the pressurizer while the loops sit at saturation -> loop water flashes,
  // the bubbles push water UP into the pressurizer, so the level rises while inventory is being lost.
  if (porvFlowPath > 0.05 && s.SM < 3 && s.Lpzr < 0.97) s.Vv = clamp(s.Vv + ventMass * 1.5 * h, 0, VL * 0.8);
  // borated cold water mixes in
  if (s.eccsFlow > 0) { const f = s.eccsFlow * h / Math.max(0.2, s.M); s.B += (2300 - s.B) * f; }
  /* --- primary energy --- */
  const pumpHeat = s.pumps.reduce((a, p) => a + p.w, 0) * 0.0012;
  let dE = (s.Qcc + pumpHeat - Qsg - steamVent * CC * 180) * h;   // vented steam carries latent heat; liquid leaks only leave mass
  const mixE = s.eccsFlow * h / Math.max(0.2, s.M), mixC = charge * h / Math.max(0.2, s.M);
  let Tnew = s.Tavg + dE / (CC * Math.max(0.3, s.M)) + (40 - s.Tavg) * mixE + (Math.min(s.Tavg, 270) - s.Tavg) * mixC;
  // saturation: heat beyond boiling makes steam voids instead of temperature
  const Ts = tsat(s.P), dTh = s.Thot - s.Tavg;
  const Tcap = Ts - dTh;
  if (Tnew > Tcap && s.P < 21) {
    const excess = (Tnew - Tcap) * CC * Math.max(0.3, s.M);
    const kvap = 0.09 * Math.pow(15.5 / Math.max(0.3, s.P), 0.9);
    s.Vv = clamp(s.Vv + Math.min(excess, 2) * Math.min(kvap, 2) * 0.5, 0, VL);
    Tnew = Math.max(Tcap + (Tnew - Tcap) * 0.15, Math.min(Tnew, s.Tavg) - 1.5 * h);   // flashing cools gradually
  }
  const dTavg = Tnew - s.Tavg;
  s.Tavg = Tnew;
  // condensation when subcooled
  if (s.SM > 2 && s.Vv > 0) s.Vv = Math.max(0, s.Vv - s.Vv * Math.min(1, 0.02 * Math.min(s.SM, 40) * h));
  /* --- pressure --- */
  const Lold = s.Lpzr;
  derive(s);
  const dL = s.Lpzr - Lold;
  s.heaters = s.pzrAuto && ac && s.Lpzr > 0.12 ? clamp((15.5 - P) / 0.15, 0, 1) : 0;
  const sprayAvail = s.pumps[0].w + s.pumps[1].w > 0.6;
  s.spray = s.pzrAuto && sprayAvail ? clamp((P - 15.6) / 0.3, 0, 1) : 0;
  let dP = 0;
  if (s.Lpzr > 0.002 && s.Lpzr < 0.995) {
    dP += dL * 18;                          // insurge compresses the steam bubble (~0.3 MPa per degC of coolant swell)
    dP += s.heaters * 0.03 * h - s.spray * 0.12 * h;
    dP -= (porvFlowPath * 0.26 * P / 15.5 + s.safety * 1.2) * h;
    if (dP < 0) dP *= 0.55;                 // outsurge: pressurizer water flashes and props pressure up
  } else if (s.Lpzr >= 0.995) {
    dP += Math.max(0, dTavg) * 1.8 + (inflow - ventMass - leakMass - letdown) * 900 * h - s.safety * 1.5 * h - porvFlowPath * 0.6 * h;
  } else {
    // pressurizer empty: pressure is set by the boiling water in the loops
    dP += (psat(s.Thot) - P) * Math.min(1, h * 0.8);
  }
  if (s.leak > 0 && s.Lpzr > 0.002) dP -= s.leak * 0.06 * h;
  s.P = clamp(P + dP, 0.1, 22);
  // saturation floor: if pressure falls below the boiling pressure of the hottest water it flashes to steam
  const psH = psat(s.Thot);
  if (s.P < psH && s.M > 0.05) {
    const gap = psH - s.P;
    s.Vv = clamp(s.Vv + gap * 0.4 * h * Math.pow(15.5 / Math.max(0.5, s.P), 0.6), 0, VL);
    s.P += gap * Math.min(1, h * 15);
    s.Tavg -= gap * 0.25 * h;
  }
  // a two-phase system (steam voids in the loops, or a water-solid pressurizer) is pinned near saturation
  if ((s.Lpzr >= 0.995 || s.Vv > 0.01) && s.M > 0.05) s.P = Math.max(s.P, psH);
  s.dP = (s.P - P) / h;
}

function rbmkLoop(s, h) {
  // Direct cycle: steam goes from the drum separators to the turbine; drum pressure held ~6.9 MPa.
  s.voidCore += ((s.voidTarget || 0) - s.voidCore) * Math.min(1, h / 0.8);
  const tb = s.turb;
  const steam = Math.max(0, s.Qcc);
  if (!tb.tripped) tb.rpm += (1800 - tb.rpm) * (1 - Math.exp(-h / 6)); else tb.rpm *= Math.exp(-h / 70);
  const toTurb = tb.tripped ? 0 : Math.min(steam, tb.load);
  s.MWe = toTurb * 1000;
  s.Fsteam = steam;
  s.Ffw += (Math.min(steam, 1.2) - s.Ffw) * Math.min(1, h / 20);
  const excess = steam - Math.min(steam, 1.1) - 0;
  s.P = clamp(s.P + (excess * 0.8 - (s.P - 6.9) * 0.2) * h, 6, 30);
  s.Qsg = steam;
}

function protection(s) {
  const PWR = s.type.name === 'PWR';
  // safety injection signal (independent of the reactor trip)
  if (PWR && !s.si && !s.siBlocked && s.P < 12.4) { s.si = true; s.events.push({ k: 'si', t: s.t }); if (!s.scram) doScram(s, 'SAFETY INJECTION'); }
  if (s.scram) return;
  let cause = '';
  if (!s.tripsBypassed) {
    if (s.n > 1.09) cause = 'HIGH NEUTRON FLUX';
    else if (s.n < 0.25 && s.n > 1e-6 && s.period > 0 && s.period < 10) cause = 'HIGH STARTUP RATE';
    else if (PWR && s.P > 16.6) cause = 'HIGH PRESSURIZER PRESSURE';
    else if (PWR && s.P < 12.8 && s.n > 0.1) cause = 'LOW PRESSURIZER PRESSURE';
    else if (PWR && s.n > 0.1 && s.W < 0.62) cause = 'LOW REACTOR COOLANT FLOW';
    else if (PWR && s.n > 0.05 && s.Lsg < 0.12) cause = 'LOW STEAM GENERATOR LEVEL';
    else if (PWR && s.n > 0.5 && !s.noTurbineTripScram && s.turb.tripped && !s.turb.latchT && s.turbTripT && s.t - s.turbTripT < 3) cause = 'TURBINE TRIP';
    else if (PWR && !s.offsite && s.n > 0.05) cause = 'RCP BUS UNDERVOLTAGE';
    else if (PWR && s.Thot > 340 && s.n > 0.05) cause = 'OVERTEMPERATURE dT';
  }
  if (cause) doScram(s, cause);
}

function doScram(s, cause) {
  if (s.scram) return;
  s.scram = true; s.scramT = 0; s.scramCause = cause || 'MANUAL';
  s.scramIns0 = s.rods.slice(); s.ORM0 = s.ORM;
  s.rodAuto = false; s.runaway = 0;
  s.events.push({ k: 'scram', t: s.t, cause: s.scramCause });
  if (s.type.name === 'PWR' && !s.turb.tripped) tripTurbine(s);
}
function resetScram(s) {
  // reset only when the reactor is shut down (operator then withdraws the shutdown bank)
  if (!s.scram) return false;
  if (s.n > 0.02) return false;
  s.scram = false; s.scramT = 0; s.scramIns0 = null; s.events.push({ k: 'scram-reset', t: s.t });
  return true;
}
function tripTurbine(s) { if (s.turb.tripped) return; s.turb.tripped = true; s.turb.synced = false; s.turbTripT = s.t; s.events.push({ k: 'turbine-trip', t: s.t }); }
function latchTurbine(s) {
  const tb = s.turb;
  if (!tb.tripped) return false;
  if (s.n < 0.08 || s.msiv < 0.9 || s.Ps < 5) return false;
  tb.tripped = false; tb.load = Math.min(0.05, s.n); tb.latchT = 8; tb.synced = false;
  s.events.push({ k: 'turbine-latch', t: s.t });
  return true;
}

/* ---------- helpers for the UI / tests ---------- */
function rodAvg(s) { let a = 0; for (let i = 0; i < NR; i++) a += s.rods[i]; return a / NR; }
// stable period from the six-group inhour equation  rho = w*Lambda + sum(beta_i * w / (w + lambda_i))
function inhourPeriod(type, rho) {
  const T = TYPES[type] || type, f = w => w * T.gen + BETA_F.reduce((a, bf, i) => a + T.beta * bf * w / (w + LAMS[i]), 0) - rho;
  let lo = rho > 0 ? 1e-9 : -LAMS[0] + 1e-9, hi = rho > 0 ? 1e4 : -1e-9;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  return 1 / ((lo + hi) / 2);
}
function xenonRun(Ihist, Xhist, nOf, seconds, step) {
  // integrate iodine / xenon in REAL plant seconds (used to build scenario histories)
  let I = Ihist, X = Xhist, t = 0; step = step || 60;
  while (t < seconds) { const n = nOf(t); I += LAM_I * (n - I) * step; X += (LAM_I * (I + XE_Y * n) - LAM_X * X - XE_K * LAM_X * n * X) * step; t += step; }
  return { I, X };
}

const api = { BETA_F, LAMS, create, step, computeRho, doScram, resetScram, tripTurbine, latchTurbine, psat, tsat, TYPES, NR, RODX, RODW, S_CURVE, rodAvg,
  inhourPeriod, xenonEq, xenonRun, X_EQ1, XE_ACCEL, DH_ACCEL, DH_A, DH_TAU, DH_SUM, LAM_I, LAM_X, acPower, derive, clamp };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.RXSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
