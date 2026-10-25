/* NEURO STORM: spiking cortical network.
   Conductance-based leaky integrate-and-fire neurons with
   - an explicit action-potential waveform (upstroke to ~+35 mV, repolarisation),
   - an AHP potassium conductance (E_K = -90 mV) giving the -77 mV undershoot,
   - a dynamic threshold that jumps after every spike and relaxes back,
   - an absolute refractory period (no firing at any input) followed by a relative one
     (raised threshold + AHP: only stronger input fires the cell),
   - slow spike-frequency adaptation (pyramidal cells only),
   - AMPA (E_rev 0 mV) / GABA-A (E_rev -80 mV) exponential conductance synapses (Dale's law),
   - distance-dependent connectivity and axonal conduction delays.
   Units: mV, ms, mS/cm^2, uA/cm^2, C = 1 uF/cm^2. */
import { genNeurons, mulberry32 } from './brain.js';

export const DT = 0.05;                 // ms, fixed step
export const MAX_DELAY = 25;            // ms
export const PHYS = {
  EL: -70, EK: -90, EE: 0, EI: -80,
  tauE: 3.0, tauI: 7.0,                 // AMPA, GABA-A decay (ms)
  E: { gL: 0.1, th0: -55, thSd: 1.2, dTh: 22, tauTh: 5.0, gAHP: 0.35, tauAHP: 5, gAdapt: 0.012, tauAdapt: 180,
       tAbs: 2.0, tRise: 0.35, tFall: 1.0, Vpk: 35, Vend: -68 },
  I: { gL: 0.16, th0: -55, thSd: 1.2, dTh: 12, tauTh: 3.0, gAHP: 0.4, tauAHP: 3, gAdapt: 0, tauAdapt: 180,
       tAbs: 1.2, tRise: 0.2, tFall: 0.55, Vpk: 28, Vend: -67 },
};
// relative refractory window = until threshold elevation has decayed below 1 mV
export const relEnd = t => t.tAbs + t.tauTh * Math.log(t.dTh / 1.0);

export const DEFAULTS = {
  wE: 1.0,        // excitation (AMPA weight scale)
  wI: 1.0,        // inhibition (GABA-A weight scale)
  stim: 1.0,      // stimulus strength scale
  noise: 1.0,     // background noise scale
};
// connectivity / weight constants (tuned for balance; see tests/balance.test.mjs)
export const NET = {
  KE: 60, KI: 30,           // in-degree from E and I cells
  sigE: 0.1, sigI: 0.08,  // Gaussian connection length (units) at N=4000
  cutE: 3, cutI: 3,     // cut-off in sigmas
  gEE: 0.0350, gEI: 0.0544,  // AMPA increments onto E / onto I  (mS/cm^2)
  gIE: 0.2, gII: 0.16,     // GABA-A increments onto E / onto I
  wSd: 0.35,                // log-normal spread
  callosal: 2, gCall: 0.02, // callosal inputs per E cell (myelinated, fast)
  vLocal: 0.05, vCall: 0.15, synDelay: 0.6, // conduction velocity (units/ms), synaptic delay (ms)
  noiseSd: 0.8,             // mV per sqrt(ms) membrane noise at noise=1
  extRate: 4, gExt: 0.045,  // background (thalamocortical) Poisson AMPA input per cell, Hz, mS/cm^2 at noise=1
  stimAmp: 90, stimSig: 0.08, stimDur: 1.0, // uA/cm^2 at centre, spread (units), pulse (ms)
};

export class Net {
  constructor(N = 4000, seed = 7) {
    this.N = N; this.seed = seed;
    const g = genNeurons(N, seed);
    Object.assign(this, g);
    this.p = { ...DEFAULTS };
    this.D = Math.ceil(MAX_DELAY / DT) + 1;
    const n = N;
    this.V = new Float32Array(n); this.gE = new Float32Array(n); this.gI = new Float32Array(n);
    this.gA = new Float32Array(n); this.gS = new Float32Array(n); this.th = new Float32Array(n); this.th0 = new Float32Array(n);
    this.V0 = new Float32Array(n); this.last = new Int32Array(n); this.Iext = new Float32Array(n);
    this.nSpk = new Uint32Array(n); this.flash = new Float32Array(n);
    this.ringE = new Float32Array(this.D * n); this.ringI = new Float32Array(this.D * n);
    this.build();
    this.buildTemplates();
    this.reset();
  }
  build() {
    const N = this.N, pos = this.pos, type = this.type, hemi = this.hemi;
    const rnd = mulberry32(this.seed * 31 + 5);
    const sc = Math.pow(4000 / N, 0.42);
    const sigE = NET.sigE * sc, sigI = NET.sigI * sc, cell = Math.max(sigE * NET.cutE, sigI * NET.cutI);
    this.lenScale = sc;
    // spatial hash
    const key = (x, y, z) => ((Math.floor(x / cell) + 64) * 4096 + (Math.floor(y / cell) + 64)) * 128 + (Math.floor(z / cell) + 64);
    const grid = new Map();
    for (let i = 0; i < N; i++) { const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
    const pre = [], post = [], w = [], del = [];
    const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return (u - 3) * 1.414; };
    const candE = [], candI = [], wtE = [], wtI = [];
    const pickK = (cand, wt, K, out) => {     // weighted sampling without replacement (Efraimidis-Spirakis)
      const keys = cand.map((c, j) => [Math.pow(rnd(), 1 / wt[j]), c]);
      keys.sort((a, b) => b[0] - a[0]);
      for (let j = 0; j < Math.min(K, keys.length); j++) out.push(keys[j][1]);
    };
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      candE.length = candI.length = wtE.length = wtI.length = 0;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        const L = grid.get(((cx + a + 64) * 4096 + (cy + b + 64)) * 128 + (cz + c + 64)); if (!L) continue;
        for (const j of L) {
          if (j === i || hemi[j] !== hemi[i]) continue;
          const dx = pos[j * 3] - x, dy = pos[j * 3 + 1] - y, dz = pos[j * 3 + 2] - z, d2 = dx * dx + dy * dy + dz * dz;
          if (type[j] === 0) { if (d2 < (sigE * NET.cutE) ** 2) { candE.push(j); wtE.push(Math.exp(-d2 / (2 * sigE * sigE))); } }
          else if (d2 < (sigI * NET.cutI) ** 2) { candI.push(j); wtI.push(Math.exp(-d2 / (2 * sigI * sigI))); }
        }
      }
      const chosenE = [], chosenI = [];
      pickK(candE, wtE, NET.KE, chosenE); pickK(candI, wtI, NET.KI, chosenI);
      const tPost = type[i];
      for (const j of chosenE) { pre.push(j); post.push(i); w.push((tPost ? NET.gEI : NET.gEE * Math.pow(4000 / N, 0.04)) * Math.exp(NET.wSd * gauss() - NET.wSd * NET.wSd / 2)); del.push(this.delayOf(j, i, NET.vLocal)); }
      for (const j of chosenI) { pre.push(j); post.push(i); w.push((tPost ? NET.gII : NET.gIE) * Math.exp(NET.wSd * gauss() - NET.wSd * NET.wSd / 2)); del.push(this.delayOf(j, i, NET.vLocal)); }
    }
    // callosal (homotopic, contralateral) excitatory inputs onto pyramidal cells
    const opp = [];
    for (let i = 0; i < N; i++) if (type[i] === 0) opp.push(i);
    for (let i = 0; i < N; i++) {
      if (type[i] !== 0) continue;
      const mx = -pos[i * 3], my = pos[i * 3 + 1], mz = pos[i * 3 + 2];
      for (let c = 0; c < NET.callosal; c++) {
        let best = -1, bd = 1e9;
        for (let t = 0; t < 40; t++) { const j = opp[Math.floor(rnd() * opp.length)]; if (hemi[j] === hemi[i]) continue; const d = (pos[j * 3] - mx) ** 2 + (pos[j * 3 + 1] - my) ** 2 + (pos[j * 3 + 2] - mz) ** 2; if (d < bd) { bd = d; best = j; } }
        if (best >= 0 && bd < 0.09) { pre.push(best); post.push(i); w.push(NET.gCall); del.push(this.delayOf(best, i, NET.vCall)); }
      }
    }
    // CSR by presynaptic neuron
    const M = pre.length; this.M = M;
    const start = new Int32Array(N + 1); for (let k = 0; k < M; k++) start[pre[k] + 1]++;
    for (let i = 0; i < N; i++) start[i + 1] += start[i];
    const fill = start.slice(0, N), oPost = new Int32Array(M), oW = new Float32Array(M), oD = new Uint16Array(M);
    for (let k = 0; k < M; k++) { const s = fill[pre[k]]++; oPost[s] = post[k]; oW[s] = w[k]; oD[s] = del[k]; }
    this.oStart = start; this.oPost = oPost; this.oW = oW; this.oD = oD;
  }
  delayOf(j, i, v) {
    const p = this.pos, d = Math.hypot(p[j * 3] - p[i * 3], p[j * 3 + 1] - p[i * 3 + 1], p[j * 3 + 2] - p[i * 3 + 2]);
    return Math.max(1, Math.min(this.D - 1, Math.round((NET.synDelay + d / v) / DT)));
  }
  buildTemplates() {
    // spike waveform tables: V(k) = V0 * A[k] + B[k] during the spike
    this.tpl = [PHYS.E, PHYS.I].map(t => {
      const n = Math.round((t.tRise + t.tFall) / DT), A = new Float32Array(n), B = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const s = k * DT;
        if (s < t.tRise) { const x = s / t.tRise, r = Math.pow(x, 1.6) * (2.2 - 1.2 * x); A[k] = 1 - r; B[k] = t.Vpk * r; }   // accelerating upstroke
        else { const x = (s - t.tRise) / t.tFall, r = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, x * 1.05)); A[k] = 0; B[k] = t.Vpk + (t.Vend - t.Vpk) * Math.min(1, r); }
      }
      return { n, A, B, abs: Math.round(t.tAbs / DT) };
    });
  }
  reset() {
    const N = this.N, rnd = mulberry32(this.seed * 7 + 1);
    this.step_ = 0; this.t = 0; this.slot = 0;
    this.ringE.fill(0); this.ringI.fill(0); this.gE.fill(0); this.gI.fill(0); this.gA.fill(0); this.gS.fill(0); this.Iext.fill(0); this.flash.fill(0); this.nSpk.fill(0);
    for (let i = 0; i < N; i++) {
      const t = this.type[i] ? PHYS.I : PHYS.E;
      let g = 0; for (let k = 0; k < 4; k++) g += rnd(); g = (g - 2) * 1.73;
      this.th0[i] = t.th0 + t.thSd * g; this.th[i] = this.th0[i];
      this.V[i] = PHYS.EL + (rnd() - 0.5) * 2; this.last[i] = -1e6;
    }
    this.pulses = []; this.spikeLog = []; this.extAcc = 0; this.rs = (this.seed * 2654435761) >>> 0 || 1;
    this.popRate = 0; this.lastSpikeCount = 0; this.spikesThisStep = 0;
    this.rec = null; if (this.sel != null) this.select(this.sel);
  }
  // ---- stimulation: brief current pulse with Gaussian spread from an electrode tip ----
  stimulate(i, scale = 1) {
    const pos = this.pos, x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const amp = NET.stimAmp * this.p.stim * scale, sig = NET.stimSig * this.lenScale;
    const idx = [], amps = [];
    for (let j = 0; j < this.N; j++) {
      if (this.hemi[j] !== this.hemi[i]) continue;
      const d2 = (pos[j * 3] - x) ** 2 + (pos[j * 3 + 1] - y) ** 2 + (pos[j * 3 + 2] - z) ** 2;
      const a = amp * Math.exp(-d2 / (2 * sig * sig));
      if (a > 1.0 || j === i) { idx.push(j); amps.push(j === i ? Math.max(a, NET.stimAmp * 0.6 * scale) : a); this.Iext[j] += amps[amps.length - 1]; }
    }
    this.pulses.push({ idx, amps, end: this.step_ + Math.round(NET.stimDur / DT) });
    if (this.rec && this.rec.i != null) { /* mark stim on trace */ this.rec.stims.push(this.t); }
    return idx.length;
  }
  select(i) {
    this.sel = i;
    const n = Math.round(400 / DT); // 400 ms of history
    this.rec = { i, n, V: new Float32Array(n).fill(this.V[i]), th: new Float32Array(n).fill(this.th[i]), head: 0, ev: [], spikes: [], stims: [] };
  }
  // ---- one fixed time step ----
  step() {
    const N = this.N, D = this.D, slot = this.slot, base = slot * N;
    const V = this.V, gE = this.gE, gI = this.gI, gA = this.gA, gS = this.gS, th = this.th, th0 = this.th0, last = this.last, V0 = this.V0, Iext = this.Iext, type = this.type;
    const ringE = this.ringE, ringI = this.ringI, oStart = this.oStart, oPost = this.oPost, oW = this.oW, oD = this.oD;
    const wE = this.p.wE, wI = this.p.wI;
    const { EL, EK, EE, EI } = PHYS;
    const dE = Math.exp(-DT / PHYS.tauE), dI = Math.exp(-DT / PHYS.tauI);
    const TE = PHYS.E, TI = PHYS.I;
    const dthE = Math.exp(-DT / TE.tauTh), dthI = Math.exp(-DT / TI.tauTh), daE = Math.exp(-DT / TE.tauAHP), daI = Math.exp(-DT / TI.tauAHP), dsE = Math.exp(-DT / TE.tauAdapt);
    const tplE = this.tpl[0], tplI = this.tpl[1];
    const nAmp = NET.noiseSd * this.p.noise * Math.sqrt(DT) * 1.732 * 2; // uniform(-.5,.5)*2*sqrt3 -> unit variance
    const step = this.step_;
    let rs = this.rs, spk = 0;
    // record synaptic arrivals onto the inspected neuron
    const rec = this.rec;
    if (rec) { const si = rec.i; if (ringE[base + si] > 0) rec.ev.push(this.t, 1); if (ringI[base + si] > 0) rec.ev.push(this.t, -1); }
    const log = this.spikeLog;
    // background Poisson synaptic input (spontaneous activity), scaled by the noise control
    this.extAcc += N * NET.extRate * this.p.noise * DT * 1e-3;
    while (this.extAcc >= 1) {
      this.extAcc -= 1;
      rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
      const j = (rs >>> 0) % N;
      ringE[base + j] += NET.gExt;
    }
    for (let i = 0; i < N; i++) {
      const isI = type[i];
      let ge = gE[i] * dE + ringE[base + i] * wE; ringE[base + i] = 0;
      let gi = gI[i] * dI + ringI[base + i] * wI; ringI[base + i] = 0;
      gE[i] = ge; gI[i] = gi;
      const T = isI ? TI : TE, tpl = isI ? tplI : tplE;
      const ga = gA[i] * (isI ? daI : daE); gA[i] = ga;
      const gs = isI ? 0 : gS[i] * dsE; if (!isI) gS[i] = gs;
      const t0 = th0[i]; const thv = t0 + (th[i] - t0) * (isI ? dthI : dthE); th[i] = thv;
      const k = step - last[i];
      if (k < tpl.n) { V[i] = V0[i] * tpl.A[k] + tpl.B[k]; continue; }
      let v = V[i];
      if (k < tpl.abs) {
        // absolute refractory tail: Na+ channels inactivated, K+ open -> membrane is not excitable;
        // synaptic/injected input cannot drive it (V follows leak + K+ only)
        V[i] = v + DT * (T.gL * (EL - v) + (ga + gs) * (EK - v));
        continue;
      }
      const I = T.gL * (EL - v) + ge * (EE - v) + gi * (EI - v) + (ga + gs) * (EK - v) + Iext[i];
      rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
      v += DT * I + nAmp * ((rs >>> 0) / 4294967296 - 0.5);
      if (v < -95) v = -95;
      if (v >= thv) {
        // ---- action potential ----
        last[i] = step; V0[i] = v; V[i] = v; th[i] = thv + T.dTh; gA[i] = ga + T.gAHP; if (!isI) gS[i] = gs + T.gAdapt;
        this.nSpk[i]++; this.flash[i] = 1; spk++;
        log.push(this.t, i);
        const ring = isI ? ringI : ringE;
        for (let s = oStart[i], e = oStart[i + 1]; s < e; s++) { let sl = slot + oD[s]; if (sl >= D) sl -= D; ring[sl * N + oPost[s]] += oW[s]; }
        continue;
      }
      V[i] = v;
    }
    this.rs = rs;
    // end stimulus pulses
    if (this.pulses.length) this.pulses = this.pulses.filter(p => { if (step + 1 >= p.end) { for (let k = 0; k < p.idx.length; k++) Iext[p.idx[k]] -= p.amps[k]; return false; } return true; });
    if (rec) { const h = rec.head; rec.V[h] = V[rec.i]; rec.th[h] = th[rec.i]; rec.head = (h + 1) % rec.n; if (last[rec.i] === step) rec.spikes.push(this.t); }
    this.spikesThisStep = spk;
    this.step_++; this.t = this.step_ * DT; this.slot = slot + 1 === D ? 0 : slot + 1;
    return spk;
  }
  // phase of a neuron for the UI
  phase(i) {
    const T = this.type[i] ? PHYS.I : PHYS.E, s = (this.step_ - this.last[i]) * DT;
    if (s < T.tRise + T.tFall) return 'spike';
    if (s < T.tAbs) return 'abs';
    if (s < relEnd(T)) return 'rel';
    if (this.V[i] < PHYS.EL - 1.5) return 'hyper';
    if (this.V[i] > PHYS.EL + 2) return 'depol';
    return 'rest';
  }
}
