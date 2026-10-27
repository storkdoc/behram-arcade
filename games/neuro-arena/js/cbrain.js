/* NEURO ARENA: the choice brain used by every non-Pong contest.
   Same neurons, synapses, delays and three-factor learning rule as the Pong brain (brain.js), but:
   - the input is two symbol "slots" (e.g. the two operands of 3 + 4, or the two letters of CA_). Each slot is a
     line of receptor-driven thalamic relay cells; symbol k of n sits at position (k + 0.5) / n on its line;
   - association cells form a gain-field grid over (slot 0 x slot 1), so each cell responds to a conjunction
     of two symbols (an AND, made sharp by feedforward inhibition) - the substrate for a lookup table;
   - the motor layer has K choice populations (one per possible answer) that compete through shared
     interneurons (winner-take-all). An answer is given when one population leads the others by a margin;
     if none does before the deadline the brain abstains;
   - the whole brain scales: size = total neurons (2,800 = the Pong brain's layout; every area scales). */
import { DT, PH, TYPES, mulberry32 } from './brain.js';
import { UX_SRC, REFLEX_CAP, REFLEX_DECAY, unitKey } from './understand.js';
const TPL = [[35, -12, -66], [28, -30, -67]];
const ABS = TYPES.map(t => Math.round(t.abs / DT));
const TPLF = new Float32Array(TPL.flat());
const gaussR = r => { let u = 0; for (let k = 0; k < 6; k++) u += r(); return (u - 3) * 1.4142; };
export const BASE = [['TH_E', 320, 0], ['TH_I', 80, 1], ['S_E', 640, 0], ['S_I', 160, 1], ['A_E', 960, 0], ['A_I', 240, 1], ['M_E', 320, 0], ['M_I', 80, 1]];
// tunables of the choice-brain template (not genes): background drive onto association cells (Hz)
export const CB = { aBg: 0, snap: 1, wSA: 0.5, thG: 1.3, gw: 0.32, lr: 6, homeo: 0, preNorm: 0, fullBase: 1,
  // explicit-trial learning: the eligibility trace spans the whole thinking window (tauTrial ms) and the dopamine
  // pulse is delivered once, AFTER the answer is accepted and judged (see accept()). alpha = step size per trial
  tauTrial: 1500, chosenOnly: 1, xThr: 0.25, margW: 2, alpha: 150, eMin: 2, mRecN: 6, ouTau: 300, ouX: 1.36, mRecW: 0.012, wtaX: 1, aInh: 1, rfX: 1, aBias: -2, pAMx: 4 };
export const CAREAS = BASE.map(a => a[0]);
// understanding-layer unit wiring: per-input weight scale (1-input units are stronger so one cue fires them; 3-input
// units weaker so two of three cues are not enough), the AND bias of 2- and 3-input units, hidden-to-hidden weight
export const UXP = { wSA: 0.35, w1: 1.5, w3: 0.8, bias: -4, bias3: -5, wRec: 0.03 };

/* ux (the evolvable understanding layer, understand.js): nU units of cpu cells each are ADDED to the association
   area after the designed cells (uOnly: no designed cells at all), and nCx context symbols get cxPer extra relay
   and sensory cells each at the end of TH_E / S_E (KNOW YOURSELF / KNOW YOUR ENEMY inputs) */
export function cLayout(size, K, marg = 0, ux = null) {
  const s = Math.max(0.5, size / 2800), L = { def: [] };
  const cpu = ux ? Math.max(1, Math.round(2 * s)) : 0, nUc = ux ? ux.nU * cpu : 0, cx = ux && ux.nCx ? ux.nCx * (ux.cxPer || 6) : 0;
  let o = 0;
  for (const [k, n0, t] of BASE) {
    let n = Math.round(n0 * s);
    if (k === 'TH_E' || k === 'S_E') n = 2 * Math.round(n / 2);
    if (k === 'A_E') { L.nDes = ux && ux.uOnly ? 0 : n; n = L.nDes + nUc; }
    if (k === 'TH_E' || k === 'S_E') { L['h' + k] = n / 2; n += cx; }
    if (k === 'M_E') { const gs = Math.max(8, Math.round(n / K)); n = gs * K; L.gs = gs; }
    L[k] = { s: o, n, e: o + n, t }; L.def.push([k, n, t]); o += n;
  }
  L.N = o; L.K = K; L.scale = s; L.nMarg = Math.round(marg * L.nDes); L.G = Math.floor(Math.sqrt(Math.max(0, L.nDes - L.nMarg)));
  L.cpu = cpu; L.nU = ux ? ux.nU : 0; L.cx = cx; L.cxPer = ux ? (ux.cxPer || 6) : 0;
  return L;
}

export class ChoiceBrain {
  /* spec: { K, n: [n0, n1], rf: [r0, r1] (fraction of symbol spacing), size }
     weights: null or { W: Float32Array, seed, pAM, size } (synapses inherited from a parent) */
  constructor(genome, spec, weights = null) {
    this.g = { ...genome }; this.spec = spec; this.disc = !!spec.tiles;
    const ux = this.ux = spec.ux || null;
    const L = this.L = cLayout(spec.size || 2800, spec.K, spec.marg || 0, ux ? { nU: ux.units.length, nCx: spec.nCx || 0, uOnly: spec.uOnly, cxPer: spec.cxPer } : null), N = this.N = L.N;
    this.K = spec.K; this.NA = L.A_E.n; this.NM = L.M_E.n; this.M0 = L.M_E.s;
    this.type = new Uint8Array(N); this.area = new Uint8Array(N); this.ch = new Int8Array(N).fill(-1); this.c1 = new Float32Array(N); this.c2 = new Float32Array(N);
    L.def.forEach(([k, n, t], ai) => { for (let i = L[k].s; i < L[k].e; i++) { this.type[i] = t; this.area[i] = ai; } });
    this.grp = new Uint8Array(this.NM); for (let m = 0; m < this.NM; m++) this.grp[m] = Math.floor(m / L.gs);
    this.label();
    this.D = 16;
    this.V = new Float32Array(N); this.gE = new Float32Array(N); this.gI = new Float32Array(N); this.gA = new Float32Array(N);
    this.th = new Float32Array(N); this.th0 = new Float32Array(N); this.last = new Int32Array(N);
    this.ringE = new Float32Array(this.D * N); this.ringI = new Float32Array(this.D * N);
    this.spk = new Uint8Array(N);
    this.drive = new Float32Array(L.TH_E.n).fill(3);
    this.Iext = new Float32Array(N);
    this.build(); this.initPlastic(weights);
    // a hyperpolarising bias on the association cells: one matching slot alone stays below threshold (a sharper AND)
    for (let i = L.A_E.s; i < L.A_E.s + L.nDes; i++) this.Iext[i] = (this.spec.aBias ?? CB.aBias) * ((this.c1[i] < 0 || this.c2[i] < 0) ? 0 : 1);
    if (ux) for (let k = L.nDes; k < this.NA; k++) { const u = ux.units[this.unitOf[k]], n = u.i.length, sil = this.silenced(this.unitOf[k]);
      this.Iext[L.A_E.s + k] = sil || !n ? -40 : n === 1 ? 0 : n === 2 ? UXP.bias : UXP.bias3; }
    this.xPre = new Float32Array(this.NA); this.yPost = new Float32Array(this.NM);
    this.rateM = new Float32Array(this.NM); this.rExp = new Float32Array(this.NM); this.cntM = new Uint16Array(this.NM);
    this.gcnt = new Float32Array(this.K); this.tcnt = new Float32Array(this.K); this.cntA = new Uint16Array(this.NA); this.grate = new Float32Array(this.K); this.ou = new Float32Array(this.K); this.bias = new Float32Array(this.K);
    this.reset();
    // the expected reward is part of what a brain has learned: inherited synapses come with it, otherwise every new
    // lifetime starts at rBar = 0 and its first ~20 answers on a hard level give a falsely negative dopamine signal
    if (weights && weights.rBar != null) this.rBar = weights.rBar;
  }
  label() {
    this.symOf = new Int16Array(this.N).fill(-1);
    if (this.disc) this.labelDisc(); else this.labelCont();
    this.labelUX();
  }
  // context relay / sensory cells (ch 2, cxPer cells per symbol) and the unit cells of the understanding layer
  labelUX() {
    const L = this.L; this.unitOf = new Int32Array(this.NA).fill(-1);
    if (!this.ux) return;
    for (const A of ['TH_E', 'S_E']) { const h2 = 2 * L['h' + A]; for (let k = h2; k < L[A].n; k++) { const i = L[A].s + k; this.ch[i] = 2; this.symOf[i] = Math.floor((k - h2) / L.cxPer); this.c1[i] = (k - h2 + 0.5) / (L[A].n - h2); } }
    const NU = L.nU;
    for (let k = L.nDes; k < this.NA; k++) { const i = L.A_E.s + k, u = (k - L.nDes) % NU; this.unitOf[k] = u; this.ch[i] = 4; this.c1[i] = ((u * 0.618034) % 1); this.c2[i] = ((u * 0.414214) % 1); }
  }
  labelCont() {
    const L = this.L, h = L.hTH_E, hs = L.hS_E, G = L.G;
    for (let k = 0; k < 2 * h; k++) { const i = L.TH_E.s + k, c = k < h ? 0 : 1, r = k % h; this.ch[i] = c; this.c1[i] = (r + 0.5) / h; }
    for (let k = 0; k < 2 * hs; k++) { const i = L.S_E.s + k, c = k < hs ? 0 : 1, r = k % hs; this.ch[i] = c; this.c1[i] = (r + 0.5) / hs; this.symOf[i] = Math.min(this.spec.n[c] - 1, Math.floor(this.c1[i] * this.spec.n[c])); }
    const rnd = mulberry32(31337);
    for (let k = 0; k < L.nDes; k++) {
      const i = L.A_E.s + k; this.ch[i] = 4;
      if (k < G * G) { this.c1[i] = (Math.floor(k / G) + 0.5) / G; this.c2[i] = (k % G + 0.5) / G; }
      else { this.c1[i] = rnd(); this.c2[i] = rnd(); }
      // snap each association cell to the centre of its symbol tile: a pure conjunction of one symbol per slot
      if (CB.snap) { const n0 = this.spec.n[0], n1 = this.spec.n[1]; this.c1[i] = (Math.min(n0 - 1, Math.floor(this.c1[i] * n0)) + 0.5) / n0; this.c2[i] = (Math.min(n1 - 1, Math.floor(this.c2[i] * n1)) + 0.5) / n1; }
      // single-slot ("marginal") cells: tuned to one symbol of one slot only (-1 = deaf to the other slot)
      const km = k - (L.nDes - L.nMarg);
      if (km >= 0) { const sl = km % 2, n = this.spec.n[sl], v = ((Math.floor(km / 2) % n) + 0.5) / n; this.c1[i] = sl === 0 ? v : -1; this.c2[i] = sl === 1 ? v : -1; }
    }
  }
  /* discrete ("feature") input mode, used by Word completion: each input line cell codes exactly one symbol of its slot
     (no Gaussian tuning: 130 position x letter symbols are too many for a topographic line), the two slots may get
     unequal shares of the thalamic / sensory cells (spec.split = slot 0's share), several symbols of a slot can be
     on at once (sense(x0, [list])) and each association cell is a given conjunction tile [slot-0 symbol, slot-1
     symbol] from spec.tiles (cell k gets tile k mod #tiles, so every tile has the same number of cells) */
  labelDisc() {
    const L = this.L, sp = this.spec, n = sp.n, f = sp.split || 0.5;
    const line = (A) => { const N = 2 * L['h' + A], h0 = Math.max(n[0], Math.round(N * f)); this['h0' + A] = h0;
      for (let k = 0; k < N; k++) { const i = L[A].s + k, c = k < h0 ? 0 : 1, r = c ? k - h0 : k, len = c ? N - h0 : h0; this.ch[i] = c; this.c1[i] = (r + 0.5) / len; this.symOf[i] = Math.min(n[c] - 1, Math.floor(this.c1[i] * n[c])); } };
    line('TH_E'); line('S_E');
    // optional single-slot tiles (spec.mtiles, e.g. [p, -1] = "the gap is at position p") get the last spec.mfrac of the cells
    const T = sp.tiles || [], nT = T.length, MT = sp.mtiles || [], nM = MT.length ? Math.round(L.nDes * (sp.mfrac ?? 0.1)) : 0;
    this.allT = T.concat(MT); this.tileOf = new Int32Array(L.A_E.n).fill(-1);
    for (let k = 0; k < L.nDes; k++) { const i = L.A_E.s + k, km = k - (L.nDes - nM), ti = km >= 0 ? nT + km % MT.length : k % nT, t = this.allT[ti]; this.ch[i] = 4; this.tileOf[k] = ti;
      this.c1[i] = t[0] < 0 ? -1 : (t[0] + 0.5) / n[0]; this.c2[i] = t[1] < 0 ? -1 : (t[1] + 0.5) / n[1]; }
  }
  build() {
    const g = this.g, L = this.L, N = this.N, rnd = mulberry32(g.seed | 0), ch = this.ch, c1 = this.c1, c2 = this.c2, sp = this.spec;
    const pre = [], post = [], w = [], del = [];
    const lg = s => Math.exp(0.3 * gaussR(rnd) - 0.045) * s;
    const add = (j, i, wt, d) => { if (wt <= 0) return; pre.push(j); post.push(i); w.push(lg(wt)); del.push(d); };
    // random afferents: fixed expected in-degree (p * n at the base size) so scaling the brain keeps the balance
    const randIn = (A, i, p, wt, d) => { const n = L[A].n, k = Math.max(1, Math.round(p * n / L.scale)), s = L[A].s;
      // sample k distinct-ish presynaptic cells
      for (let t = 0; t < k; t++) { const j = s + Math.floor(rnd() * n); if (j !== i) add(j, i, wt * Math.min(1, L.scale ** 0), d); } };
    const n0 = sp.n[0], n1 = sp.n[1];
    const sigS = [Math.min(0.035, 0.3 / n0), Math.min(0.035, 0.3 / n1)];
    const fw = g.gfW / 0.12, gw = [CB.gw / n0 * fw, CB.gw / n1 * fw];
    for (let i = L.TH_I.s; i < L.TH_I.e; i++) randIn('TH_E', i, 0.12, 0.012, 2);
    if (g.sTRN >= 0.5) for (let i = L.TH_E.s; i < L.TH_E.e; i++) randIn('TH_I', i, 0.15, 0.025, 2);
    // thalamus -> sensory (topographic within a slot). Candidates are restricted to a window for speed.
    const h = L.hTH_E, hs = L.hS_E;
    // discrete mode (and the context cells, ch 2): cells of each (slot, symbol) by area
    const bySym = A => { const m = new Map(); for (let i = L[A].s; i < L[A].e; i++) { const key = this.ch[i] * 4096 + this.symOf[i]; if (!m.has(key)) m.set(key, []); m.get(key).push(i); } return m; };
    const thSym = bySym('TH_E'), sSym = bySym('S_E'); this.sSym = sSym;
    for (let i = L.S_E.s; i < L.S_E.e; i++) {
      if (!this.disc && ch[i] !== 2) continue;
      // all relay cells of the same symbol, total drive matched to the topographic case (~pTS * sqrt(2pi) * 0.03 * 160 inputs)
      const src = thSym.get(ch[i] * 4096 + this.symOf[i]) || [], wt = g.wTS * g.pTS * 2.5066 * 0.03 * 160 / Math.max(1, src.length);
      for (const j of src) add(j, i, wt, 4);
      const sib = sSym.get(ch[i] * 4096 + this.symOf[i]) || []; for (const j of sib) if (j !== i && rnd() < 0.5) add(j, i, g.wEE, 2);
      randIn('S_I', i, 0.2, g.wIE, 2);
    }
    if (!this.disc) for (let i = L.S_E.s; i < L.S_E.s + 2 * hs; i++) {
      const c = ch[i], sg = sigS[c], off = L.TH_E.s + c * h, ctr = c1[i] * h, win = Math.ceil(4 * sg * h);
      for (let r = Math.max(0, Math.floor(ctr - win)); r < Math.min(h, Math.ceil(ctr + win)); r++) { const j = off + r, d = c1[j] - c1[i]; if (rnd() < g.pTS * Math.exp(-d * d / (2 * sg * sg))) add(j, i, g.wTS, 4); }
      const so = L.S_E.s + c * hs, sc = c1[i] * hs, sw = Math.ceil(0.06 * hs);
      for (let r = Math.max(0, Math.floor(sc - sw)); r < Math.min(hs, Math.ceil(sc + sw)); r++) { const j = so + r; if (j !== i && rnd() < 0.15 / Math.max(1, L.scale)) add(j, i, g.wEE, 2); }
      randIn('S_I', i, 0.2, g.wIE, 2);
    }
    for (let i = L.S_I.s; i < L.S_I.e; i++) { randIn('S_E', i, 0.08, g.wEI, 2); randIn('S_I', i, 0.1, g.wIE * 0.8, 2); }
    // association gain field: slot-0 sensory cells near c1, slot-1 sensory cells near c2.
    // in-degree is kept constant across sizes by thinning the connection probability with the scale
    // in-degree per slot matched to the Pong gain field (pSA * sqrt(2pi) * gfW * 224 cells); when the symbol tuning
    // is too narrow to supply that many inputs, the synapses are made proportionally stronger instead
    const pf = [0, 1].map(c => { const e = g.pSA * 2.5066 * gw[c] * hs, T = g.pSA * 2.5066 * g.gfW * 224, f = Math.min(0.95 / g.pSA, T / e); return { f, wm: T / (e * f) }; });
    const ADe = L.A_E.s + L.nDes;
    if (this.disc) for (let i = L.A_E.s; i < ADe; i++) {
      const t = this.allT[this.tileOf[i - L.A_E.s]], T = g.pSA * 2.5066 * g.gfW * 224, mw = (t[0] < 0 || t[1] < 0) ? (sp.mW ?? 1.5) : 1;
      const sw = sp.wSlot || [1, 1];
      for (let c = 0; c < 2; c++) { if (t[c] < 0) continue; const src = sSym.get(c * 4096 + t[c]) || [], wt = sw[c] * mw * g.wSA * (sp.wSA ?? CB.wSA) * T / Math.max(1, src.length); for (const j of src) add(j, i, wt, 4); }
      randIn('A_I', i, 0.2, g.wIE * CB.aInh, 2);
    }
    else for (let i = L.A_E.s; i < ADe; i++) {
      for (let c = 0; c < 2; c++) {
        const ctr = c === 0 ? c1[i] : c2[i]; if (ctr < 0) continue; const mw = (c1[i] < 0 || c2[i] < 0) ? CB.margW : 1, gwc = gw[c], so = L.S_E.s + c * hs, win = Math.ceil(4 * gwc * hs) + 1, cc = ctr * hs, P = g.pSA * pf[c].f, wt = g.wSA * CB.wSA * pf[c].wm * mw;
        for (let r = Math.max(0, Math.floor(cc - win)); r < Math.min(hs, Math.ceil(cc + win)); r++) { const j = so + r, d = c1[j] - ctr; if (rnd() < P * Math.exp(-d * d / (2 * gwc * gwc))) add(j, i, wt, 4); }
      }
      if (g.sRec >= 0.5) for (let t = 0; t < 12; t++) { const j = L.A_E.s + Math.floor(rnd() * this.NA); if (j !== i && Math.abs(c1[j] - c1[i]) < 0.6 / n0 && Math.abs(c2[j] - c2[i]) < 0.6 / n1) add(j, i, g.wEE, 2); }
      randIn('A_I', i, 0.2, g.wIE * CB.aInh, 2);
    }
    // the understanding layer: each unit cell is an AND of its genome inputs (task symbols or context symbols)
    if (this.ux) { const T = g.pSA * 2.5066 * g.gfW * 224, units = this.ux.units;
      for (let i = ADe; i < L.A_E.e; i++) { const u = units[this.unitOf[i - L.A_E.s]], n = u.i.length; if (!n) continue;
        const mw = n === 1 ? UXP.w1 : n === 2 ? 1 : UXP.w3;
        for (const code of u.i) { const src = Math.floor(code / UX_SRC), sy = code % UX_SRC, cells = sSym.get(src * 4096 + sy) || []; const wt = mw * g.wSA * UXP.wSA * T / Math.max(1, cells.length); for (const j of cells) add(j, i, wt, 4); }
        randIn('A_I', i, 0.2, g.wIE * CB.aInh, 2); }
      // hidden-to-hidden links (genome.ux.rec): every cell of unit a excites every cell of unit b
      const cellsOf = Array.from({ length: L.nU }, () => []); for (let k = L.nDes; k < this.NA; k++) cellsOf[this.unitOf[k]].push(L.A_E.s + k);
      for (const [a, b] of this.ux.rec || []) if (cellsOf[a] && cellsOf[b]) for (const j of cellsOf[a]) for (const i of cellsOf[b]) add(j, i, UXP.wRec, 3);
    }
    for (let i = L.A_I.s; i < L.A_I.e; i++) { randIn('S_E', i, 0.06, g.wEI, 3); randIn('A_E', i, 0.05, g.wEI, 2); randIn('A_I', i, 0.1, g.wIE * 0.8, 2); }
    // motor: K choice populations share interneurons (winner-take-all)
    for (let i = L.M_E.s; i < L.M_E.e; i++) {
      randIn('M_I', i, 0.5, g.wta * CB.wtaX, 2);
      if (g.sMRec >= 0.5) { const gi = this.grp[i - L.M_E.s], s0 = L.M_E.s + gi * L.gs; for (let t = 0; t < CB.mRecN; t++) { const j = s0 + Math.floor(rnd() * L.gs); if (j !== i) add(j, i, CB.mRecW, 2); } }
    }
    for (let i = L.M_I.s; i < L.M_I.e; i++) randIn('M_E', i, 0.25, 0.018, 2);
    const Mn = pre.length; this.nSyn = Mn;
    const st = new Int32Array(N + 1); for (let k = 0; k < Mn; k++) st[pre[k] + 1]++;
    for (let i = 0; i < N; i++) st[i + 1] += st[i];
    const fill = st.slice(0, N), oP = new Int32Array(Mn), oW = new Float32Array(Mn), oD = new Uint8Array(Mn);
    for (let k = 0; k < Mn; k++) { const s = fill[pre[k]]++; oP[s] = post[k]; oW[s] = w[k]; oD[s] = Math.round(del[k] / DT); }
    this.oS = st; this.oP = oP; this.oW = oW; this.oD = oD;
    this.bg = new Float32Array(N);
    for (let i = 0; i < N; i++) this.bg[i] = (i >= L.M_E.s && i < L.M_E.e ? g.motorBg : i >= L.A_E.s && i < L.A_E.e ? CB.aBg : i >= L.TH_E.e ? 500 : 0) * DT * 1e-3;
  }
  initPlastic(weights) {
    const g = this.g, NA = this.NA, NM = this.NM, rnd = mulberry32((g.seed | 0) * 7 + 3), size = this.spec.size || 2800;
    // plastic fan-in per motor cell is kept constant across sizes (p thinned by the scale)
    const p = Math.min(1, g.pAM * CB.pAMx / this.L.scale);
    const ks = [], ws = [], rowS = new Int32Array(NA + 1), cnt = new Int32Array(NM);
    for (let a = 0; a < NA; a++) {
      for (let m = 0; m < NM; m++) { const keep = rnd() < p, z = rnd(); if (!keep) continue; ks.push(a * NM + m); ws.push(Math.min(g.wMax, g.wAM0 * Math.exp(0.3 * (z * 3.46 - 1.73)))); cnt[m]++; }
      rowS[a + 1] = ks.length;
    }
    const n = ks.length; this.syn = Int32Array.from(ks); this.W = Float32Array.from(ws); this.E = new Float32Array(n);
    // understanding layer: per-row caps (reflex Full / Limited / None, unit output switched off, ablation) and the
    // rows whose unit changed since the parent (a rewired unit starts with fresh synapses)
    const ux = this.ux; this.rowCap = new Float32Array(NA).fill(1); this.reflexRows = [];
    const fresh = new Uint8Array(NA);
    if (ux) { const keys = ux.units.map(unitKey), old = weights && weights.uk;
      for (let a = this.L.nDes; a < NA; a++) { const u = this.unitOf[a], unit = ux.units[u];
        if (old && old[u] !== keys[u]) fresh[a] = 1;
        if (!unit.i.length || !unit.o || this.silenced(u)) this.rowCap[a] = 0;
        else if (this.isReflex(u)) { this.rowCap[a] = REFLEX_CAP[ux.reflex ?? 1]; this.reflexRows.push(a); } } }
    if (weights && weights.W && (weights.size || 2800) === size && weights.K === this.K) {
      if (weights.seed === (g.seed | 0) && weights.pAM === g.pAM && weights.W.length === n) { for (let a = 0; a < NA; a++) if (!fresh[a]) for (let s = rowS[a]; s < rowS[a + 1]; s++) this.W[s] = Math.min(g.wMax, weights.W[s]); }
      else {   // a copy error changed the wiring seed or the connection probability: carry over the synapses that still exist
        const src = plasticMaskP(weights.seed, Math.min(1, weights.pAM * CB.pAMx / this.L.scale), NA, NM), W2 = weights.W;
        if (src.length === W2.length) for (let s = 0, q = 0; s < n && q < src.length;) { if (src[q] === this.syn[s]) { this.W[s] = Math.min(g.wMax, W2[q]); s++; q++; } else if (src[q] < this.syn[s]) q++; else s++; }
      }
    }
    for (let a = 0; a < NA; a++) if (this.rowCap[a] < 1) { const cap = g.wMax * this.rowCap[a]; for (let s = rowS[a]; s < rowS[a + 1]; s++) if (this.W[s] > cap) this.W[s] = cap; }
    this.rowS = rowS; this.rowM = new Uint16Array(n); for (let s = 0; s < n; s++) this.rowM[s] = ks[s] % NM;
    this.colS = new Int32Array(NM + 1); for (let m = 0; m < NM; m++) this.colS[m + 1] = this.colS[m] + cnt[m];
    this.colA = new Uint16Array(n); this.colQ = new Int32Array(n);
    const f = this.colS.slice(0, NM);
    for (let s = 0; s < n; s++) { const m = ks[s] % NM, q = f[m]++; this.colA[q] = (ks[s] / NM) | 0; this.colQ[q] = s; }
  }
  exportWeights() { return { W: new Float32Array(this.W), seed: this.g.seed | 0, pAM: this.g.pAM, size: this.spec.size || 2800, K: this.K, rBar: this.rBar, uk: this.ux ? this.ux.units.map(unitKey) : null }; }
  // per evolved unit: the answer its learned synapses favour most, that mean weight, and the mean over all answers
  unitReadout() {
    if (!this.ux) return null; const K = this.K, NU = this.ux.units.length, sum = new Float64Array(NU * K), cnt = new Float64Array(NU * K);
    for (let a = this.L.nDes; a < this.NA; a++) { const u = this.unitOf[a]; for (let s = this.rowS[a]; s < this.rowS[a + 1]; s++) { const q = u * K + this.grp[this.rowM[s]]; sum[q] += this.W[s]; cnt[q]++; } }
    const out = []; for (let u = 0; u < NU; u++) { let bk = 0, bv = -1, tot = 0, tn = 0; for (let k = 0; k < K; k++) { const q = u * K + k, v = cnt[q] ? sum[q] / cnt[q] : 0; tot += sum[q]; tn += cnt[q]; if (v > bv) { bv = v; bk = k; } }
      out.push([bk, +(bv / this.g.wMax).toFixed(3), +(tn ? tot / tn / this.g.wMax : 0).toFixed(3)]); }
    return out;
  }
  // a reflex unit: one cue of the contest's reflex slot(s) alone (e.g. the gap position alone)
  isReflex(u) { const unit = this.ux.units[u]; return unit.i.length === 1 && (this.spec.reflexSrc || [0]).includes(Math.floor(unit.i[0] / UX_SRC)); }
  // ablation: spec.silence(u) -> true silences unit u (no spikes, no output)
  silenced(u) { return !!(this.spec.silence && this.spec.silence(u)); }
  // KNOW YOURSELF / KNOW YOUR ENEMY: the context symbols for this trial (list of indices), on with the stimulus
  senseCtx(list) {
    const L = this.L; if (!L.cx) return; const h2 = 2 * L.hTH_E, gain = this.g.thGain * CB.thG, on = new Set(list || []);
    for (let k = h2; k < L.TH_E.n; k++) this.drive[k] = on.has(this.symOf[L.TH_E.s + k]) ? 3 + gain : 3;
  }
  reset() {
    const rnd = mulberry32((this.g.seed | 0) + 99), N = this.N;
    this.step_ = 0; this.slot = 0; this.t = 0;
    for (let i = 0; i < N; i++) { const T = TYPES[this.type[i]]; this.th0[i] = T.th0 + T.thSd * gaussR(rnd) * 0.7; this.th[i] = this.th0[i]; this.V[i] = -70 + (rnd() - 0.5) * 4; this.last[i] = -1e6; }
    this.gE.fill(0); this.gI.fill(0); this.gA.fill(0); this.ringE.fill(0); this.ringI.fill(0); this.E.fill(0);
    this.xPre.fill(0); this.yPost.fill(0); this.rateM.fill(this.g.rateT); this.cntM.fill(0); this.gcnt.fill(0); this.grate.fill(0); this.ou.fill(0);
    this.rs = ((this.g.seed | 0) * 2654435761 >>> 0) || 7;
    this.da = 0; this.daBar = 0; this.rBar = 0; this.rpe = 0; this.areaSpk = new Uint32Array(BASE.length); this.totalSpk = 0; this.daLog = 0;
  }
  // present symbols (indices into each slot's alphabet; -1 = nothing). Drive in Hz per relay cell.
  sense(x0, x1) {
    const g = this.g, L = this.L, sp = this.spec, d = this.drive, h = L.hTH_E, gain = g.thGain * CB.thG;
    if (this.disc) {   // discrete mode: x0 / x1 are a symbol or a list of symbols (multi-hot)
      const on = [new Set([].concat(x0 ?? [])), new Set([].concat(x1 ?? []))];
      for (let k = 0; k < 2 * L.hTH_E; k++) { const i = L.TH_E.s + k; d[k] = on[this.ch[i]].has(this.symOf[i]) ? 3 + gain : 3; }
      return;
    }
    const rs = (sp.rf || [0.35, 0.35]).map((r, c) => r * CB.rfX / sp.n[c] * (g.rfW / 0.14));
    const v = [x0, x1];
    for (let k = 0; k < 2 * h; k++) {
      const c = k < h ? 0 : 1, x = v[c]; if (x == null || x < 0) { d[k] = 3; continue; }
      const pos = (x + 0.5) / sp.n[c], dd = this.c1[L.TH_E.s + k] - pos; d[k] = 3 + gain * Math.exp(-dd * dd / (2 * rs[c] * rs[c]));
    }
  }
  blank() { this.drive.fill(3); }
  // action commitment (basal-ganglia-like gating): after a decision the chosen population is driven and the others
  // are held down for a short time, so the eligibility traces clearly mark which population acted
  commit(q, amp) { this.bias.fill(q < 0 ? 0 : -amp); if (q >= 0) this.bias[q] = amp; }
  // phasic dopamine = reward prediction error at the moment of the answer: r minus the running mean of this brain's
  // answer rewards. (A tonic baseline, as in the Pong brain, would act on all eligibility between trials.)
  reward(r) { return this.accept(r); }
  rewardOld(r) { const d = r - (CB.fullBase ? this.rBar : Math.max(0, this.rBar)); this.rBar += (r - this.rBar) * 0.05; this.da += d; this.daLog += d; }
  run(nSteps) {
    const L = this.L, N = this.N, NA = this.NA, NM = this.NM, K = this.K;
    const V = this.V, gE = this.gE, gI = this.gI, gA = this.gA, th = this.th, th0 = this.th0, last = this.last, type = this.type;
    const ringE = this.ringE, ringI = this.ringI, oS = this.oS, oP = this.oP, oW = this.oW, oD = this.oD, D = this.D, bg = this.bg, drive = this.drive;
    const W = this.W, Eg = this.E, rowS = this.rowS, rowM = this.rowM, colS = this.colS, colA = this.colA, xPre = this.xPre, yPost = this.yPost;
    const g = this.g, spkF = this.spk, areaOf = this.area, aSpk = this.areaSpk, grp = this.grp, gcnt = this.gcnt, grate = this.grate, ou = this.ou, bias = this.bias;
    const dE = Math.exp(-DT / PH.tauE), dI = Math.exp(-DT / PH.tauI);
    const T0 = TYPES[0], T1 = TYPES[1];
    const dTh0 = Math.exp(-DT / T0.tauTh), dTh1 = Math.exp(-DT / T1.tauTh), dA0 = Math.exp(-DT / T0.tauAHP), dA1 = Math.exp(-DT / T1.tauAHP);
    const gL0 = T0.gL, gL1 = T1.gL, jTh0 = T0.dTh, jTh1 = T1.dTh, jA0 = T0.gAHP, jA1 = T1.gAHP, abs0 = ABS[0], abs1 = ABS[1], tpl = TPLF;
    const colQ = this.colQ, cntM = this.cntM, cntA = this.cntA, tcnt = this.tcnt, Iext = this.Iext, gs = L.gs;
    const ouA = Math.exp(-DT / CB.ouTau), ouB = Math.sqrt(1 - ouA * ouA) * g.explore * CB.ouX;
    const fr = Math.exp(-DT / 25), dTr = Math.exp(-DT / 20), nAmp = 1.0 * g.noise * Math.sqrt(DT) * 3.46;
    const gIn = 0.1, gBg = 0.02, pDT = DT * 1e-3;
    const ltd = g.ltd, A0 = L.A_E.s, A1 = L.A_E.e, Ms = L.M_E.s, Me = L.M_E.e, T0s = L.TH_E.s;
    let rs = this.rs;
    for (let n = 0; n < nSteps; n++) {
      const slot = this.slot, base = slot * N, step = this.step_;
      for (let k = 0; k < drive.length; k++) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; if ((rs >>> 0) * 2.3283064e-10 < drive[k] * pDT) ringE[base + T0s + k] += gIn; }
      for (let q = 0; q < K; q++) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; ou[q] = ou[q] * ouA + ouB * ((rs >>> 0) * 2.3283064e-10 - 0.5) * 3.46; }
      for (let m = 0; m < NM; m++) Iext[Ms + m] = ou[grp[m]] + bias[grp[m]];
      for (let a = 0; a < NA; a++) xPre[a] *= dTr;
      for (let m = 0; m < NM; m++) yPost[m] *= dTr;
      for (let i = 0; i < N; i++) {
        const ti = type[i];
        let ge = gE[i] * dE + ringE[base + i]; ringE[base + i] = 0;
        const gi = gI[i] * dI + ringI[base + i]; ringI[base + i] = 0;
        rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5;
        if ((rs >>> 0) * 2.3283064e-10 < bg[i]) ge += gBg;
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
          spkF[i] = 1; aSpk[areaOf[i]]++;
          const ring = ti ? ringI : ringE;
          for (let s = oS[i], e = oS[i + 1]; s < e; s++) { let sl = slot + oD[s]; if (sl >= D) sl -= D; ring[sl * N + oP[s]] += oW[s]; }
          if (i >= A0 && i < A1) {
            const a = i - A0; let sl = slot + 4; if (sl >= D) sl -= D; const rb = sl * N + Ms;
            for (let s = rowS[a], e = rowS[a + 1]; s < e; s++) { const m = rowM[s]; ringE[rb + m] += W[s]; Eg[s] -= ltd * yPost[m]; }
            xPre[a] += 1; cntA[a]++;
          } else if (i >= Ms && i < Me) {
            const m = i - Ms;
            for (let s = colS[m], e = colS[m + 1]; s < e; s++) Eg[colQ[s]] += xPre[colA[s]];
            yPost[m] += 1; cntM[m]++; const q = grp[m]; gcnt[q] += 1; tcnt[q] += 1; grate[q] += 1;
          }
          continue;
        }
        V[i] = v < -95 ? -95 : v;
      }
      this.step_++; this.t += DT; this.slot = slot + 1 === D ? 0 : slot + 1;
      for (let q = 0; q < K; q++) grate[q] *= fr;
      if ((this.step_ % 20) === 0) this.learn(10);   // (the dopamine display decays; weights change only in accept())
      if ((this.step_ % 200) === 0) this.homeostasis(100);
    }
    this.rs = rs; this.gsz = gs;
  }
  // eligibility bookkeeping every 10 ms: E(a->m) = sum of pre-before-post coincidences minus the chance level
  // (pre trace x expected post rate). It decays with tauTrial (>> the thinking window), so at acceptance it still
  // holds the full record of which association cells drove which answer population during the trial.
  learn(ms) { this.da *= Math.exp(-ms / this.g.tauDA); this.rpe = this.da; }
  /* the dopamine pulse after acceptance. The eligibility of synapse a -> m is the trial-long (PRESENT + THINKING +
     ANSWER) record of the presynaptic association cell's spikes times its answer population's spikes relative to
     the mean answer population: E = x_a * (n_q(m) - mean_q n_q), both normalised. So credit lands on the cells that
     were active for THIS problem and on the answer that won, against the answers that lost. Every plastic synapse
     then moves by alpha * eta * RPE * wMax * E (RPE = reward - running mean reward); the counts are cleared
     afterwards so nothing carries over to the next trial. */
  accept(r, abstained = false, chosen = -1) {
    // an abstention is not an answer: it gets a small fixed nudge and does not move the expected-reward baseline
    const g = this.g, W = this.W, wMax = g.wMax, d = abstained ? r : r - this.rBar, K = this.K, tc = this.tcnt, cA = this.cntA, grp = this.grp, rowS = this.rowS, rowM = this.rowM;
    if (!abstained) this.rBar += (r - this.rBar) * 0.05; this.da = d; this.rpe = d; this.daLog += d;
    let mean = 0; for (let q = 0; q < K; q++) mean += tc[q]; mean /= K;
    const dev = this.dev || (this.dev = new Float32Array(K)); let dn = 1; for (let q = 0; q < K; q++) { dev[q] = tc[q] - mean; dn = Math.max(dn, Math.abs(dev[q])); }
    if (CB.chosenOnly) { let c = chosen; if (c < 0) { c = 0; for (let q = 1; q < K; q++) if (tc[q] > tc[c]) c = q; } dev.fill(0); dev[c] = 1; dn = 1; }
    let mx = 1; for (let a = 0; a < cA.length; a++) if (cA[a] > mx) mx = cA[a];
    const k = g.eta * CB.alpha * d * wMax;
    const cap = this.rowCap;
    if (k !== 0) for (let a = 0; a < cA.length; a++) { const x = (cA[a] / mx - CB.xThr) / (1 - CB.xThr); if (x <= 0) continue; const kx = k * x / dn, wm = wMax * cap[a];
      for (let s = rowS[a], e = rowS[a + 1]; s < e; s++) { const w = W[s] + kx * dev[grp[rowM[s]]]; W[s] = w < 0 ? 0 : w > wm ? wm : w; } }
    // the metabolic cost of a Limited reflex: its synapses decay a little after every trial
    if (this.reflexRows.length && g.eta > 0) { const dc = REFLEX_DECAY[this.ux.reflex ?? 1]; if (dc < 1) for (const a of this.reflexRows) for (let s = rowS[a], e = rowS[a + 1]; s < e; s++) W[s] *= dc; }
    this.E.fill(0); cA.fill(0); tc.fill(0);
    return d;
  }
  // inter-trial reset: all fast state (membranes, conductances, spikes in flight, adaptation, traces) back to rest
  quiesce() {
    const N = this.N; let rs = this.rs;
    for (let i = 0; i < N; i++) { rs ^= rs << 13; rs ^= rs >>> 17; rs ^= rs << 5; this.V[i] = -70 + ((rs >>> 0) * 2.3283064e-10 - 0.5) * 4; this.th[i] = this.th0[i]; this.last[i] = -1e6; }
    this.rs = rs; this.gE.fill(0); this.gI.fill(0); this.gA.fill(0); this.ringE.fill(0); this.ringI.fill(0);
    this.xPre.fill(0); this.yPost.fill(0); this.E.fill(0); this.gcnt.fill(0); this.grate.fill(0); this.ou.fill(0); this.bias.fill(0); this.cntA.fill(0); this.tcnt.fill(0);
  }
  // synaptic scaling toward the motor layer's MEAN rate (not a fixed target): under winner-take-all most populations
  // are silent most of the time, so a fixed target would inflate every weight; this only evens out the populations
  homeostasis(ms) {
    const g = this.g, W = this.W, colS = this.colS, colQ = this.colQ, wMax = g.wMax;
    let mean = 0;
    for (let m = 0; m < this.NM; m++) { const r = this.cntM[m] * 1000 / ms; this.cntM[m] = 0; this.rateM[m] += (r - this.rateM[m]) * 0.2; mean += this.rateM[m]; }
    mean = Math.max(1, mean / this.NM);
    // heterosynaptic (presynaptic) normalisation: each association cell keeps a fixed total output weight, so
    // depressing its synapses onto a punished answer frees weight for the other answers (competitive elimination)
    if (CB.preNorm) { const tgt = g.wAM0, rowS = this.rowS;
      for (let a = 0; a < this.NA; a++) { const s0 = rowS[a], s1 = rowS[a + 1]; if (s1 === s0 || this.rowCap[a] < 1) continue;   // capped rows (a Limited reflex) are not topped back up let sum = 0; for (let s = s0; s < s1; s++) sum += W[s];
        const f = sum > 1e-9 ? tgt * (s1 - s0) / sum : 1; if (Math.abs(f - 1) < 1e-4) continue; for (let s = s0; s < s1; s++) { const w = W[s] * f; W[s] = w > wMax ? wMax : w; } } }
    for (let m = 0; m < this.NM; m++) {
      if (!g.homeo || !CB.homeo) continue;
      const f = Math.exp(g.homeo * CB.homeo * Math.max(-1, Math.min(1, (mean - this.rateM[m]) / mean)) * ms * 1e-3);
      if (Math.abs(f - 1) < 1e-5) continue;
      for (let s = colS[m], e = colS[m + 1]; s < e; s++) { const q = colQ[s]; const w = W[q] * f; W[q] = w > wMax ? wMax : w; }
    }
  }
  // mean plastic weight from each grid cell onto each choice population: [G*G][K] (for the Lab's policy view)
  policy() {
    const G = this.L.G, K = this.K, out = new Float32Array(G * G * K), cnt = new Float32Array(G * G * K);
    for (let a = 0; a < G * G; a++) for (let s = this.rowS[a]; s < this.rowS[a + 1]; s++) { const q = a * K + this.grp[this.rowM[s]]; out[q] += this.W[s]; cnt[q]++; }
    for (let i = 0; i < out.length; i++) out[i] = cnt[i] ? out[i] / cnt[i] : 0;
    return out;
  }
}
function plasticMaskP(seed, p, NA, NM) {
  const rnd = mulberry32((seed | 0) * 7 + 3), ks = [];
  for (let a = 0; a < NA; a++) for (let m = 0; m < NM; m++) { const keep = rnd() < p; rnd(); if (keep) ks.push(a * NM + m); }
  return Int32Array.from(ks);
}
