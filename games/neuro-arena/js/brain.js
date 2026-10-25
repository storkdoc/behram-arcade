/* NEURO ARENA: one spiking brain.
   Same neuron physiology as NEURO STORM: conductance-based integrate-and-fire,
   rest -70 mV, threshold ~-55 mV, spike to +35 mV, AHP (E_K -90) undershoot to ~-79 mV,
   2 ms absolute refractory period, relative refractoriness from a decaying threshold jump,
   AMPA EPSPs (E_rev 0 mV, tau 3 ms) and GABA-A IPSPs (E_rev -80 mV, tau 7 ms), 80/20 E/I, Dale's law.
   Integration: semi-implicit (backward) Euler, DT = 0.5 ms, so a 2,800-cell brain runs much faster than real time.
   Pathway: receptors (Poisson, tuned) -> Thalamus relay (+TRN) -> Sensory cortex -> Association
   (parietal-like gain fields) -> Motor L5 (UP group vs DOWN group, lateral inhibition).
   Assoc -> Motor synapses learn by reward-modulated STDP (three-factor rule). */
export const DT = 0.5;
export const PH = { EL: -70, EK: -90, EE: 0, EI: -80, tauE: 3, tauI: 7 };
export const TYPES = [
  { gL: 0.1, th0: -55, thSd: 1.2, dTh: 22, tauTh: 5, gAHP: 0.35, tauAHP: 5, abs: 2.0 },   // pyramidal / relay
  { gL: 0.16, th0: -55, thSd: 1.2, dTh: 12, tauTh: 3, gAHP: 0.4, tauAHP: 3, abs: 1.5 },   // fast-spiking interneuron
];
// spike waveform samples at DT=0.5 ms: upstroke peak +35, repolarisation, then the AHP takes over
const TPL = [[35, -12, -66], [28, -30, -67]];
const ABS = TYPES.map(t => Math.round(t.abs / DT));
const TPLF = new Float32Array(TPL.flat());

// --- layout (indices per brain) ---
export const AREA_DEF = [
  ['TH_E', 320, 0], ['TH_I', 80, 1], ['S_E', 640, 0], ['S_I', 160, 1],
  ['A_E', 960, 0], ['A_I', 240, 1], ['M_UP', 160, 0], ['M_DN', 160, 0], ['M_I', 80, 1],
];
export const L = {}; { let o = 0; for (const [k, n, t] of AREA_DEF) { L[k] = { s: o, n, e: o + n, t }; o += n; } L.N = o; }
export const N = L.N;
const NA = L.A_E.n, NM = L.M_UP.n + L.M_DN.n, M0 = L.M_UP.s;
// sensory channels: 0 ball height relative to the own paddle (foveal, magnified near 0), 1 own paddle y,
// 2 ball distance (x, egocentric), 3 ball vertical velocity
export const CH = ['ball − paddle', 'paddle y', 'ball x', 'ball vy'];
export const FOV = 0.22;   // foveal magnification: channel 0 = 0.5 + 0.5 tanh((ball y - paddle y) / FOV)
export const fovea = d => 0.5 + 0.5 * Math.tanh(d / FOV);
const TH_SPLIT = [112, 112, 48, 48];
const GF = [28, 28];            // gain-field grid: 28 ball-y x 28 paddle-y = 784 cells
const CTX = [16, 11];           // context grid: 16 ball-y x 11 vy = 176 cells

import { NGB, NGV } from './genome.js';
// piecewise-linear interpolation of band genes over x in [-1, 1]
function band(g, pre, n, x) { const f = Math.max(0, Math.min(n - 1, (x + 1) / 2 * n - 0.5)), k = Math.min(n - 2, Math.floor(f)), t = f - k; return g[pre + k] * (1 - t) + g[pre + (k + 1)] * t; }
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gaussR = r => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return (u - 3) * 1.4142; };

export class Brain {
  constructor(genome, weights = null) {
    this.g = { ...genome };
    this.type = new Uint8Array(N); this.ch = new Int8Array(N).fill(-1); this.c1 = new Float32Array(N); this.c2 = new Float32Array(N);
    this.area = new Uint8Array(N);
    AREA_DEF.forEach(([k, n, t], ai) => { for (let i = L[k].s; i < L[k].e; i++) { this.type[i] = t; this.area[i] = ai; } });
    this.labelFeatures();
    this.D = 16;   // delay ring (8 ms)
    this.V = new Float32Array(N); this.gE = new Float32Array(N); this.gI = new Float32Array(N); this.gA = new Float32Array(N);
    this.th = new Float32Array(N); this.th0 = new Float32Array(N); this.last = new Int32Array(N);
    this.ringE = new Float32Array(this.D * N); this.ringI = new Float32Array(this.D * N);
    this.flash = new Float32Array(N);          // for rendering (1 on spike, decays)
    this.spk = new Uint8Array(N);              // spiked since last render read
    this.drive = new Float32Array(L.TH_E.n);   // receptor rate (Hz) for each relay cell
    this.Iext = new Float32Array(N);           // injected current (uA/cm2): shared exploratory drive to the motor groups
    this.build();
    // plastic Assoc -> Motor weights: dense NA x NM matrix with a structural mask
        this.initPlastic(weights);
    this.xPre = new Float32Array(NA); this.yPost = new Float32Array(NM);
    this.rateM = new Float32Array(NM); this.rExp = new Float32Array(NM); this.cntM = new Uint16Array(NM);
    this.reset();
  }
  labelFeatures() {
    let i = L.TH_E.s;
    TH_SPLIT.forEach((n, c) => { for (let k = 0; k < n; k++, i++) { this.ch[i] = c; this.c1[i] = (k + 0.5) / n; } });
    i = L.S_E.s;
    TH_SPLIT.forEach((n, c) => { for (let k = 0; k < 2 * n; k++, i++) { this.ch[i] = c; this.c1[i] = (k + 0.5) / (2 * n); } });
    i = L.A_E.s;
    for (let a = 0; a < GF[0]; a++) for (let b = 0; b < GF[1]; b++, i++) { this.ch[i] = 4; this.c1[i] = (a + 0.5) / GF[0]; this.c2[i] = (b + 0.5) / GF[1]; }
    for (let a = 0; a < CTX[0]; a++) for (let b = 0; b < CTX[1]; b++, i++) { this.ch[i] = 5; this.c1[i] = (a + 0.5) / CTX[0]; this.c2[i] = (b + 0.5) / CTX[1]; }
    for (let k = L.M_UP.s; k < L.M_UP.e; k++) this.ch[k] = 6;
    for (let k = L.M_DN.s; k < L.M_DN.e; k++) this.ch[k] = 7;
  }
  build() {
    const g = this.g, rnd = mulberry32(g.seed | 0), ch = this.ch, c1 = this.c1, c2 = this.c2;
    const pre = [], post = [], w = [], del = [];
    const lg = s => Math.exp(0.3 * gaussR(rnd) - 0.045) * s;
    const add = (j, i, wt, d) => { if (wt <= 0) return; pre.push(j); post.push(i); w.push(lg(wt)); del.push(d); };
    const rng = A => [L[A].s, L[A].e];
    const randIn = (A, i, p, wt, d) => { const [s, e] = rng(A); for (let j = s; j < e; j++) if (j !== i && rnd() < p) add(j, i, wt, d); };
    const sig = 0.035;
    // thalamus: relay cells get receptor drive (external); TRN gives feedback inhibition
    for (let i = L.TH_I.s; i < L.TH_I.e; i++) randIn('TH_E', i, 0.12, 0.012, 2);
    if (g.sTRN >= 0.5) for (let i = L.TH_E.s; i < L.TH_E.e; i++) randIn("TH_I", i, 0.15, 0.025, 2);
    // sensory cortex: topographic thalamocortical input, local E/I
    for (let i = L.S_E.s; i < L.S_E.e; i++) {
      for (let j = L.TH_E.s; j < L.TH_E.e; j++) if (ch[j] === ch[i]) { const d = c1[j] - c1[i]; const p = g.pTS * Math.exp(-d * d / (2 * sig * sig)); if (rnd() < p) add(j, i, g.wTS, 4); }
      for (let j = L.S_E.s; j < L.S_E.e; j++) if (j !== i && ch[j] === ch[i]) { const d = c1[j] - c1[i]; if (Math.abs(d) < 0.06 && rnd() < 0.15) add(j, i, g.wEE, 2); }
      randIn('S_I', i, 0.2, g.wIE, 2);
    }
    for (let i = L.S_I.s; i < L.S_I.e; i++) { randIn('S_E', i, 0.08, g.wEI, 2); randIn('S_I', i, 0.1, g.wIE * 0.8, 2); }
    // association: conjunctive gain-field cells (ball y x paddle y) and context cells (ball y x vy)
    const gw = g.gfW, sE = rng('S_E');
    for (let i = L.A_E.s; i < L.A_E.e; i++) {
      const conj = ch[i] === 4, chB = conj ? 1 : 3;
      for (let j = sE[0]; j < sE[1]; j++) {
        let d;
        if (ch[j] === 0) d = c1[j] - c1[i]; else if (ch[j] === chB) d = c1[j] - c2[i]; else if (ch[j] === 2) { if (rnd() < 0.01) add(j, i, g.wSA * 0.5, 4); continue; } else continue;
        const p = g.pSA * Math.exp(-d * d / (2 * gw * gw)); if (rnd() < p) add(j, i, g.wSA, 4);
      }
      if (g.sRec >= 0.5) for (let t = 0; t < 12; t++) { const j = L.A_E.s + Math.floor(rnd() * NA); if (j !== i && ch[j] === ch[i] && Math.abs(c1[j] - c1[i]) + Math.abs(c2[j] - c2[i]) < 0.25) add(j, i, g.wEE, 2); }
      randIn('A_I', i, 0.2, g.wIE, 2);
    }
    for (let i = L.A_I.s; i < L.A_I.e; i++) { randIn('S_E', i, 0.06, g.wEI, 3); randIn('A_E', i, 0.05, g.wEI, 2);   // feedforward + feedback inhibition: an AND-threshold for gain fields
      randIn('A_I', i, 0.1, g.wIE * 0.8, 2); }
    // motor: UP/DOWN pyramidal groups compete through shared interneurons
    for (let i = L.M_UP.s; i < L.M_DN.e; i++) {
      randIn('M_I', i, 0.5, g.wta, 2);
      if (g.sMRec >= 0.5) { const grp = i < L.M_DN.s ? 'M_UP' : 'M_DN'; randIn(grp, i, 0.08, 0.012, 2); }
    }
    for (let i = L.M_I.s; i < L.M_I.e; i++) randIn('M_UP', i, 0.25, 0.018, 2), randIn('M_DN', i, 0.25, 0.018, 2);
    // CSR by presynaptic cell
    const Mn = pre.length; this.nSyn = Mn;
    const st = new Int32Array(N + 1); for (let k = 0; k < Mn; k++) st[pre[k] + 1]++;
    for (let i = 0; i < N; i++) st[i + 1] += st[i];
    const fill = st.slice(0, N), oP = new Int32Array(Mn), oW = new Float32Array(Mn), oD = new Uint8Array(Mn);
    for (let k = 0; k < Mn; k++) { const s = fill[pre[k]]++; oP[s] = post[k]; oW[s] = w[k]; oD[s] = Math.round(del[k] / DT); }
    this.oS = st; this.oP = oP; this.oW = oW; this.oD = oD;
    // background Poisson rates (Hz) per cell
    this.bg = new Float32Array(N);
    for (let i = 0; i < N; i++) this.bg[i] = (i >= L.M_UP.s && i < L.M_DN.e ? g.motorBg : i >= L.TH_E.e ? 500 : 0) * DT * 1e-3;
  }
  initPlastic(weights) {
    const g = this.g, rnd = mulberry32((g.seed | 0) * 7 + 3);
    const ks = [], ws = [], rowS = new Int32Array(NA + 1), cnt = new Int32Array(NM);
    for (let a = 0; a < NA; a++) {
      const i = L.A_E.s + a;
      // innate guidance cue: + when the ball is above the paddle (gain-field cells) or moving up (context cells)
      const bias = this.ch[i] === 4 ? band(g, 'gb', NGB, this.c1[i] * 2 - 1) : band(g, 'gv', NGV, this.c2[i] * 2 - 1);
      for (let m = 0; m < NM; m++) {
        if (rnd() >= g.pAM) continue;
        const k = a * NM + m, up = m < L.M_UP.n ? 1 : -1, w0 = Math.max(0, g.wAM0 * (1 + up * bias) * Math.exp(0.3 * gaussR(rnd)));
        ks.push(k); ws.push(weights && weights[k] >= 0 ? Math.min(g.wMax, weights[k]) : Math.min(g.wMax, w0)); cnt[m]++;
      }
      rowS[a + 1] = ks.length;
    }
    const n = ks.length;
    this.syn = Int32Array.from(ks); this.W = Float32Array.from(ws); this.E = new Float32Array(n);
    this.rowS = rowS; this.rowM = new Uint16Array(n); for (let s = 0; s < n; s++) this.rowM[s] = ks[s] % NM;
    this.colS = new Int32Array(NM + 1); for (let m = 0; m < NM; m++) this.colS[m + 1] = this.colS[m] + cnt[m];
    this.colA = new Uint16Array(n); this.colQ = new Int32Array(n);
    const f = this.colS.slice(0, NM);
    for (let s = 0; s < n; s++) { const m = ks[s] % NM, q = f[m]++; this.colA[q] = (ks[s] / NM) | 0; this.colQ[q] = s; }
  }
  reset() {
    const rnd = mulberry32((this.g.seed | 0) + 99);
    this.step_ = 0; this.slot = 0; this.t = 0;
    for (let i = 0; i < N; i++) { const T = TYPES[this.type[i]]; this.th0[i] = T.th0 + T.thSd * gaussR(rnd) * 0.7; this.th[i] = this.th0[i]; this.V[i] = -70 + (rnd() - 0.5) * 4; this.last[i] = -1e6; }
    this.gE.fill(0); this.gI.fill(0); this.gA.fill(0); this.ringE.fill(0); this.ringI.fill(0); this.E.fill(0);
    this.xPre.fill(0); this.yPost.fill(0); this.rateM.fill(this.g.rateT); this.cntM.fill(0);
    this.rs = ((this.g.seed | 0) * 2654435761 >>> 0) || 7;
    this.da = 0; this.daBar = 0; this.rpe = 0; this.ouU = 0; this.ouD = 0; this.rU = 0; this.rD = 0; this.out = 0; this.areaSpk = new Uint32Array(AREA_DEF.length); this.totalSpk = 0;
    this.daLog = 0;
  }
  // set receptor drive from the egocentric game state (all in 0..1)
  sense(by, py, bx, vy) {
    const g = this.g, w2 = 2 * g.rfW * g.rfW, x = [fovea(by - py), py, bx, vy], d = this.drive;
    for (let k = 0; k < L.TH_E.n; k++) { const i = L.TH_E.s + k, v = x[this.ch[i]] - this.c1[i]; d[k] = 3 + g.thGain * Math.exp(-v * v / w2); }
  }
  reward(r) { this.da += r; this.daLog += r; }
  // advance n steps of DT
  run(nSteps) {
    const V = this.V, gE = this.gE, gI = this.gI, gA = this.gA, th = this.th, th0 = this.th0, last = this.last, type = this.type;
    const ringE = this.ringE, ringI = this.ringI, oS = this.oS, oP = this.oP, oW = this.oW, oD = this.oD, D = this.D, bg = this.bg, drive = this.drive;
    const W = this.W, Eg = this.E, rowS = this.rowS, rowM = this.rowM, colS = this.colS, colA = this.colA, xPre = this.xPre, yPost = this.yPost;
    const g = this.g, flash = this.flash, spkF = this.spk, areaOf = this.area, aSpk = this.areaSpk;
    const dE = Math.exp(-DT / PH.tauE), dI = Math.exp(-DT / PH.tauI);
    const T0 = TYPES[0], T1 = TYPES[1];
    const dTh0 = Math.exp(-DT / T0.tauTh), dTh1 = Math.exp(-DT / T1.tauTh), dA0 = Math.exp(-DT / T0.tauAHP), dA1 = Math.exp(-DT / T1.tauAHP);
    const gL0 = T0.gL, gL1 = T1.gL, jTh0 = T0.dTh, jTh1 = T1.dTh, jA0 = T0.gAHP, jA1 = T1.gAHP, abs0 = ABS[0], abs1 = ABS[1], tpl = TPLF;
    const colQ = this.colQ, cntM = this.cntM, NUP = L.M_UP.n, Iext = this.Iext; let rU = this.rU, rD = this.rD;
    const ouA = Math.exp(-DT / 60), ouB = Math.sqrt(1 - ouA * ouA) * g.explore; let ouU = this.ouU, ouD = this.ouD;
    const fr = Math.exp(-DT / 25);
    const dTr = Math.exp(-DT / 20), nAmp = 1.0 * g.noise * Math.sqrt(DT) * 3.46;
    const gIn = 0.1, gBg = 0.02, pDT = DT * 1e-3;
    const ltd = g.ltd, A0 = L.A_E.s, A1 = L.A_E.e, Ms = M0, Me = L.M_DN.e;
    let rs = this.rs;
    for (let n = 0; n < nSteps; n++) {
      const slot = this.slot, base = slot * N, step = this.step_;
      // receptor (retinal / proprioceptive) Poisson spikes onto thalamic relay cells
      for (let k = 0; k < drive.length; k++) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; if ((rs >>> 0) * 2.3283064e-10 < drive[k] * pDT) ringE[base + L.TH_E.s + k] += gIn; }
      // exploration: slow shared fluctuation (OU, tau 60 ms) in each motor group's drive (basal-ganglia-like)
      { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; const r1 = (rs >>> 0) * 2.3283064e-10; rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; const r2 = (rs >>> 0) * 2.3283064e-10;
        ouU = ouU * ouA + ouB * (r1 - 0.5) * 3.46; ouD = ouD * ouA + ouB * (r2 - 0.5) * 3.46;
        for (let m = Ms; m < Ms + NUP; m++) Iext[m] = ouU; for (let m = Ms + NUP; m < Me; m++) Iext[m] = ouD; }
      // decay plasticity traces
      for (let a = 0; a < NA; a++) xPre[a] *= dTr;
      for (let m = 0; m < NM; m++) yPost[m] *= dTr;
      for (let i = 0; i < N; i++) {
        const ti = type[i];
        let ge = gE[i] * dE + ringE[base + i]; ringE[base + i] = 0;
        const gi = gI[i] * dI + ringI[base + i]; ringI[base + i] = 0;
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        const u = (rs >>> 0) * 2.3283064e-10;
        if (u < bg[i]) ge += gBg;
        gE[i] = ge; gI[i] = gi;
        const ga = gA[i] * (ti ? dA1 : dA0); gA[i] = ga;
        const t0 = th0[i], thv = t0 + (th[i] - t0) * (ti ? dTh1 : dTh0); th[i] = thv;
        const k = step - last[i];
        if (k < 3) { V[i] = tpl[ti * 3 + k]; continue; }
        let v = V[i];
        const gl = ti ? gL1 : gL0;
        if (k < (ti ? abs1 : abs0)) { V[i] = (v + DT * (gl * -70 + ga * -90)) / (1 + DT * (gl + ga)); continue; }
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        v = (v + DT * (gl * -70 + gi * -80 + ga * -90 + Iext[i]) + nAmp * ((rs >>> 0) * 2.3283064e-10 - 0.5)) / (1 + DT * (gl + ge + gi + ga));
        if (v >= thv) {
          last[i] = step; V[i] = tpl[ti * 3]; th[i] = thv + (ti ? jTh1 : jTh0); gA[i] = ga + (ti ? jA1 : jA0);
          flash[i] = 1; spkF[i] = 1; aSpk[areaOf[i]]++;
          const ring = ti ? ringI : ringE;
          for (let s = oS[i], e = oS[i + 1]; s < e; s++) { let sl = slot + oD[s]; if (sl >= D) sl -= D; ring[sl * N + oP[s]] += oW[s]; }
          if (i >= A0 && i < A1) {           // plastic Assoc -> Motor: deliver + pre-before-post bookkeeping (LTD side)
            const a = i - A0; let sl = slot + 4; if (sl >= D) sl -= D; const rb = sl * N + Ms;
            for (let s = rowS[a], e = rowS[a + 1]; s < e; s++) { const m = rowM[s]; ringE[rb + m] += W[s]; Eg[s] -= ltd * yPost[m]; }
            xPre[a] += 1;
          } else if (i >= Ms && i < Me) {     // motor spike: LTP side of STDP on its plastic inputs
            const m = i - Ms;
            for (let s = colS[m], e = colS[m + 1]; s < e; s++) { const q = colQ[s]; Eg[q] += xPre[colA[s]]; }
            yPost[m] += 1; cntM[m]++;
            if (m < NUP) rU += 1; else rD += 1;
          }
          continue;
        }
        V[i] = v < -95 ? -95 : v;
      }
      this.step_++; this.t += DT; this.slot = slot + 1 === D ? 0 : slot + 1;
      // motor rate filters (tau 25 ms), in spikes per group-ms
      rU *= fr; rD *= fr;
      // three-factor update every 5 ms: e decays (tau_e), dw = eta * DA * e, DA decays (tau_DA)
      if ((this.step_ % 20) === 0) this.learn(10);
      if ((this.step_ % 200) === 0) this.homeostasis(100);
    }
    this.rs = rs; this.rU = rU; this.rD = rD; this.ouU = ouU; this.ouD = ouD;
    // decode: rate competition between UP and DOWN groups -> paddle command in [-1, 1]
    const u = this.rU, d = this.rD;
    this.out = Math.tanh(g.kDec * (u - d) / (u + d + 4));
  }
  learn(ms) {
    const g = this.g, W = this.W, Eg = this.E, n = W.length, wMax = g.wMax;
    // dopamine as a reward-prediction error: phasic DA minus its slow running expectation (tau 2 s)
    this.daBar += (this.da - this.daBar) * (ms / 2000);
    this.rpe = this.da - this.daBar;
    const de = Math.exp(-ms / g.tauElig), lr = g.eta * this.rpe * wMax;
    // eligibility is pre x (post - its expected rate): uncorrelated firing leaves no trace, so only
    // pre/post co-activity above baseline is credited (no common-mode drift of all weights)
    const xPre = this.xPre, rowS = this.rowS, rowM = this.rowM, rE = this.rExp, rateM = this.rateM, k = ms * 1e-3 * (this.g.base ?? 1);
    for (let m = 0; m < rE.length; m++) rE[m] = rateM[m] * k;
    for (let a = 0, NA_ = xPre.length; a < NA_; a++) {
      const x = xPre[a];
      for (let s = rowS[a], e1 = rowS[a + 1]; s < e1; s++) { const e = Eg[s] - x * rE[rowM[s]]; const w = W[s] + lr * e; W[s] = w < 0 ? 0 : w > wMax ? wMax : w; Eg[s] = e * de; }
    }
    this.da *= Math.exp(-ms / g.tauDA);
  }
  homeostasis(ms) {   // synaptic scaling of each motor cell's plastic inputs toward a target rate
    const g = this.g, W = this.W, colS = this.colS, colQ = this.colQ, wMax = g.wMax;
    for (let m = 0; m < NM; m++) {
      const r = this.cntM[m] * 1000 / ms; this.cntM[m] = 0;
      this.rateM[m] += (r - this.rateM[m]) * 0.2;
      const f = Math.exp(g.homeo * Math.max(-1, Math.min(1, (g.rateT - this.rateM[m]) / g.rateT)) * ms * 1e-3);
      if (Math.abs(f - 1) < 1e-5) continue;
      for (let s = colS[m], e = colS[m + 1]; s < e; s++) { const q = colQ[s]; const w = W[q] * f; W[q] = w > wMax ? wMax : w; }
    }
  }
  exportWeights() { const d = new Float32Array(NA * NM).fill(-1), syn = this.syn, W = this.W; for (let s = 0; s < syn.length; s++) d[syn[s]] = W[s]; return d; }
  // mean plastic weight onto UP vs DOWN from each gain-field cell, as a (ball-y x paddle-y) map: + = drives UP
  policyMap() {
    const out = new Float32Array(GF[0] * GF[1]), W = this.W, rowS = this.rowS, rowM = this.rowM, nUp = L.M_UP.n;
    for (let a = 0; a < GF[0] * GF[1]; a++) { let u = 0, d = 0, nu = 0, nd = 0; for (let s = rowS[a]; s < rowS[a + 1]; s++) { if (rowM[s] < nUp) { u += W[s]; nu++; } else { d += W[s]; nd++; } } out[a] = (nu ? u / nu : 0) - (nd ? d / nd : 0); }
    return out;
  }
}
export const GRID = { GF, CTX };
export const PLASTIC = { NA, NM, M0 };
