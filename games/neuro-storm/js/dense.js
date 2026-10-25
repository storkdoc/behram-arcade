/* NEURO STORM, dense mode: a layered cortical sheet for the GPU model (js/gpunet.js).
   - Each hemisphere's cortical sheet is cut into C x R equal-area patches ("cells", ~3 mm
     across, about one cortical column patch). Every cell holds the same number of neurons
     (bx*by), stored as a bx*by block of texels, so a single texture holds the whole brain.
   - Neurons sit in a 2.5 mm grey-matter sheet under the pial surface, in six layers
     (I, II/III, IV, V, VI) with realistic relative thickness and cell density.
   - Seven populations: L2/3 pyramidal, L4 spiny stellate, L5 pyramidal, L6 pyramidal,
     PV basket (fast-spiking), SST/Martinotti (low-threshold, adapting), VIP (disinhibitory).
   - Synapses are implicit: every block (0.2 ms) a neuron receives a Poisson number of
     EPSPs/IPSPs whose mean is (effective in-degree K[post][pre]) x (fraction of that
     presynaptic population in the surrounding patches that fired, Gaussian in 3D distance,
     read through a distance-dependent axonal delay). */
import { PHYS, NET, DT } from './sim.js';
import { hemiRadius, HEMI_CX } from './brain.js';

export const BLK = 4;                         // substeps per block (0.2 ms); the minimum synaptic delay is 3 blocks
export const BLOCK_MS = BLK * DT;
export const RING = 96, RTX = 12, RTY = 8;    // delay ring: 96 blocks = 19.2 ms, stored as a 12x8 atlas
export const GRID = { C: 96, R: 48, NA: 192, NT: 384 };
export const TIERS = [
  { id: '55k', bx: 3, by: 2, label: '55K' },
  { id: '147k', bx: 4, by: 4, label: '147K' },
  { id: '276k', bx: 6, by: 5, label: '276K' },
  { id: '1m', bx: 11, by: 10, label: '1M' },
  { id: '10m', bx: 35, by: 31, label: '10M', experimental: true },   // ~1.2 GB of GPU memory: desktop GPUs only
];
export const tierN = t => 2 * GRID.C * GRID.R * t.bx * t.by;
export const SHEET = 0.042;                   // grey-matter thickness in scene units (1 unit ~ 6 cm -> 2.5 mm)

// six layers (II and III merged): top..bottom as fractions of cortical depth, relative cell density
export const LAYERS = [
  { name: 'I', top: 0.00, bot: 0.10, dens: 0.10, mix: null },
  { name: 'II/III', top: 0.10, bot: 0.45, dens: 1.00, mix: [0.35, 0.25, 0.40] },
  { name: 'IV', top: 0.45, bot: 0.55, dens: 1.60, mix: [0.60, 0.25, 0.15] },
  { name: 'V', top: 0.55, bot: 0.77, dens: 0.70, mix: [0.45, 0.40, 0.15] },
  { name: 'VI', top: 0.77, bot: 1.00, dens: 1.00, mix: [0.45, 0.40, 0.15] },
];
{ let s = 0; for (const L of LAYERS) { L.share = (L.bot - L.top) * L.dens; s += L.share; } let c = 0; for (const L of LAYERS) { L.share /= s; L.cum0 = c; c += L.share; L.cum1 = c; } }
export const I_FRAC_IN_LAYER = 0.19;          // + layer I (all inhibitory) -> ~20% inhibitory overall

// populations / cell classes. ePop: which excitatory population (0..3) shares the layer
export const CLASSES = [
  { id: 0, key: 'L23', name: 'L2/3 pyramidal', short: 'L2/3 Pyr', exc: true, color: '#45d0ff' },
  { id: 1, key: 'L4', name: 'L4 spiny stellate', short: 'L4 SS', exc: true, color: '#62f5a0' },
  { id: 2, key: 'L5', name: 'L5 pyramidal (thick-tufted)', short: 'L5 Pyr', exc: true, color: '#7a9cff' },
  { id: 3, key: 'L6', name: 'L6 corticothalamic pyramidal', short: 'L6 Pyr', exc: true, color: '#3fb8c8' },
  { id: 4, key: 'PV', name: 'PV basket cell (fast-spiking)', short: 'PV', exc: false, color: '#ff4fd8' },
  { id: 5, key: 'SST', name: 'SST Martinotti cell (adapting)', short: 'SST', exc: false, color: '#ff9a3c' },
  { id: 6, key: 'VIP', name: 'VIP interneuron (disinhibitory)', short: 'VIP', exc: false, color: '#ffe45a' },
];
// single-neuron parameters per class (same model as js/sim.js, different constants)
const RS = PHYS.E, FS = PHYS.I;
export const CP = [
  { ...RS },                                                     // L2/3 regular-spiking, adapting
  { ...RS, gAdapt: 0.006 },                                      // L4 spiny stellate: weaker adaptation
  { ...RS, gL: 0.08, gAdapt: 0.010, Vpk: 38 },                   // L5 thick-tufted: large soma (lower leak density), bigger spike
  { ...RS },                                                     // L6
  { ...FS },                                                     // PV fast-spiking: narrow spike, 1.2 ms absolute refractory, no adaptation
  { gL: 0.1, th0: -58, thSd: 1.2, dTh: 16, tauTh: 4, gAHP: 0.25, tauAHP: 6, gAdapt: 0.025, tauAdapt: 200, tAbs: 1.6, tRise: 0.3, tFall: 0.8, Vpk: 32, Vend: -66 }, // SST low-threshold, strongly adapting
  { gL: 0.06, th0: -56, thSd: 1.5, dTh: 18, tauTh: 4, gAHP: 0.3, tauAHP: 5, gAdapt: 0.012, tauAdapt: 150, tAbs: 1.5, tRise: 0.3, tFall: 0.8, Vpk: 30, Vend: -66 },  // VIP high input resistance, adapting
];
export const relEndC = c => CP[c].tAbs + CP[c].tauTh * Math.log(CP[c].dTh / 1.0);

// canonical microcircuit: effective in-degrees (synapses per neuron) K[post][pre]
// pre order: L23E, L4E, L5E, L6E (excitatory, AMPA) | PV (fast GABA-A, perisomatic) | SST, VIP (slow dendritic GABA-A)
export const K = [
  /* L2/3 Pyr */ [900, 500, 150, 0, 260, 200, 10],
  /* L4 SS    */ [80, 700, 80, 500, 260, 80, 10],
  /* L5 Pyr   */ [800, 250, 550, 100, 260, 200, 10],
  /* L6 Pyr   */ [80, 150, 500, 650, 220, 120, 10],
  /* PV       */ null, /* SST */ null, /* VIP */ null,   // interneurons: from the E population of their own layer + others, below
];
export const KI = {          // interneuron in-degrees: own-layer E, other-layer E (each), PV, SST, VIP
  4: { own: 800, oth: 120, pv: 150, sst: 60, vip: 10 },
  5: { own: 700, oth: 60, pv: 40, sst: 0, vip: 260 },     // VIP -> SST disinhibition
  6: { own: 400, oth: 80, pv: 40, sst: 40, vip: 0 },
};
export const KC = 60;        // callosal (homotopic L2/3 -> L2/3 and L5 pyramids)
// per-synapse conductances (mS/cm^2); unitary PSPs ~0.2-1 mV
export const GS = { eE: 0.0016, eI: 0.0024, pv: 0.0070, sst: 0.0040, vip: 0.0040, call: 0.0016, tauIs: 15, tauIf: 6 };
// presynaptic spatial reach (Gaussian sigma / cut-off in scene units; 0.05 ~ 3 mm)
export const REACH = [[0.15, 0.30], [0.07, 0.15], [0.10, 0.22], [0.07, 0.15], [0.06, 0.13], [0.08, 0.18], [0.05, 0.11]];
export const DTUNE = { gE: 1.0, gI: 1.0, ext: 1.0, stimSig: 0.08, thalSig: 0.10 };
export const synPerNeuron = () => {
  const n = []; for (let c = 0; c < 4; c++) n.push(K[c].reduce((a, b) => a + b, 0) + (c === 0 || c === 2 ? KC : 0));
  for (const c of [4, 5, 6]) { const k = KI[c]; n.push(k.own + 3 * k.oth + k.pv + k.sst + k.vip); }
  return n;
};

// ---------------------------------------------------------------- hashing (identical in GLSL)
export function hash32(x) {
  x >>>= 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0; x ^= x >>> 16; return x >>> 0;
}
export const u01 = h => (h >>> 8) / 16777216;
export const nSeed = n => hash32((n ^ 0xA511E9B3) >>> 0);

// ---------------------------------------------------------------- equal-area sheet
function surfaceTable(side) {
  const { NA, NT } = GRID, r = new Float32Array((NA + 1) * NT);
  for (let i = 0; i <= NA; i++) {
    const a = i / NA * Math.PI, sa = Math.sin(a), ca = Math.cos(a);
    for (let j = 0; j < NT; j++) { const t = j / NT * 2 * Math.PI; r[i * NT + j] = hemiRadius(sa * Math.cos(t), sa * Math.sin(t), ca, side); }
  }
  return r;
}
const dirOf = (a, t, o) => { const sa = Math.sin(a); o[0] = sa * Math.cos(t); o[1] = sa * Math.sin(t); o[2] = Math.cos(a); return o; };
function radiusAt(tab, a, t) {
  const { NA, NT } = GRID; let fi = a / Math.PI * NA, fj = t / (2 * Math.PI) * NT;
  fi = Math.max(0, Math.min(NA - 1e-6, fi)); fj = ((fj % NT) + NT) % NT;
  const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, j1 = (j + 1) % NT;
  return (tab[i * NT + j] * (1 - v) + tab[i * NT + j1] * v) * (1 - u) + (tab[(i + 1) * NT + j] * (1 - v) + tab[(i + 1) * NT + j1] * v) * u;
}
function equalArea(tab) {
  const { NA, NT, C, R } = GRID, d = [0, 0, 0];
  const P = new Float32Array((NA + 1) * NT * 3);
  for (let i = 0; i <= NA; i++) for (let j = 0; j < NT; j++) { dirOf(i / NA * Math.PI, j / NT * 2 * Math.PI, d); const r = tab[i * NT + j], k = (i * NT + j) * 3; P[k] = d[0] * r; P[k + 1] = d[1] * r; P[k + 2] = d[2] * r; }
  const area = new Float64Array(NA * NT);
  for (let i = 0; i < NA; i++) for (let j = 0; j < NT; j++) {
    const a = (i * NT + j) * 3, b = (i * NT + (j + 1) % NT) * 3, c = ((i + 1) * NT + j) * 3, e = ((i + 1) * NT + (j + 1) % NT) * 3;
    const ux = P[e] - P[a], uy = P[e + 1] - P[a + 1], uz = P[e + 2] - P[a + 2], vx = P[c] - P[b], vy = P[c + 1] - P[b + 1], vz = P[c + 2] - P[b + 2];
    area[i * NT + j] = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  const rowA = new Float64Array(NA); let tot = 0; for (let i = 0; i < NA; i++) { let s = 0; for (let j = 0; j < NT; j++) s += area[i * NT + j]; rowA[i] = s; tot += s; }
  const rowE = new Float64Array(R + 1); { let acc = 0, i = 0; for (let k = 1; k < R; k++) { const tgt = tot * k / R; while (acc + rowA[i] < tgt) { acc += rowA[i]; i++; } rowE[k] = i + (tgt - acc) / rowA[i]; } rowE[R] = NA; }
  const colE = new Float64Array(R * (C + 1));
  for (let k = 0; k < R; k++) {
    const r0 = rowE[k], r1 = rowE[k + 1], col = new Float64Array(NT); let ct = 0;
    for (let i = Math.floor(r0); i < Math.min(NA, Math.ceil(r1)); i++) { const w = Math.min(i + 1, r1) - Math.max(i, r0); if (w <= 0) continue; for (let j = 0; j < NT; j++) col[j] += area[i * NT + j] * w; }
    for (let j = 0; j < NT; j++) ct += col[j];
    let acc = 0, j = 0;
    for (let c = 1; c < C; c++) { const tgt = ct * c / C; while (acc + col[j] < tgt) { acc += col[j]; j++; } colE[k * (C + 1) + c] = j + (tgt - acc) / col[j]; }
    colE[k * (C + 1) + C] = NT;
  }
  return { rowE, colE, areaPerCell: tot / (R * C), total: tot };
}

// assign layer + class from the neuron's hash
function layerClass(s) {
  const u = u01(hash32((s + 0x01) >>> 0)), w = u01(hash32((s + 0x02) >>> 0)), q = u01(hash32((s + 0x03) >>> 0));
  let L = 0; while (L < 4 && u >= LAYERS[L].cum1) L++;
  const lay = LAYERS[L]; let cls;
  if (L === 0) cls = 6;                                               // layer I: sparse interneurons (VIP/neurogliaform-like)
  else if (w >= I_FRAC_IN_LAYER) cls = L - 1;                         // excitatory population of this layer
  else cls = q < lay.mix[0] ? 4 : q < lay.mix[0] + lay.mix[1] ? 5 : 6;
  const dz = lay.top + (lay.bot - lay.top) * u01(hash32((s + 0x04) >>> 0));
  return { L, cls, dz };
}

// build the dense brain for a tier
export function buildDense(tier) {
  const { C, R, NA, NT } = GRID, bx = tier.bx, by = tier.by, B = bx * by;
  const W = C * bx, H = 2 * R * by, N = W * H;
  const pos = new Float32Array(N * 3), posTex = new Float32Array(N * 4), cls = new Uint8Array(N), layer = new Uint8Array(N), hemi = new Int8Array(N), depth = new Float32Array(N), type = new Uint8Array(N);
  const cellPos = new Float32Array(2 * R * C * 4), cellN0 = new Float32Array(2 * R * C * 4), cellN1 = new Float32Array(2 * R * C * 4);
  const d = [0, 0, 0];
  let cellSide = 0, area = 0;
  for (let h = 0; h < 2; h++) {
    const side = h === 0 ? -1 : 1, tab = surfaceTable(side), ea = equalArea(tab);
    cellSide = Math.sqrt(ea.areaPerCell); area += ea.total;
    const aOf = fr => fr / NA * Math.PI, tOf = fc => fc / NT * 2 * Math.PI;
    for (let r = 0; r < R; r++) {
      const a0 = aOf(ea.rowE[r]), a1 = aOf(ea.rowE[r + 1]), c0 = Math.cos(a0), c1 = Math.cos(a1);
      for (let c = 0; c < C; c++) {
        const t0 = tOf(ea.colE[r * (C + 1) + c]), t1 = tOf(ea.colE[r * (C + 1) + c + 1]), ci = (h * R + r) * C + c;
        { const a = Math.acos((c0 + c1) / 2), t = (t0 + t1) / 2; dirOf(a, t, d); const rr = radiusAt(tab, a, t) - SHEET * 0.5;
          cellPos[ci * 4] = side * (HEMI_CX + d[0] * rr); cellPos[ci * 4 + 1] = 0.08 + d[1] * rr; cellPos[ci * 4 + 2] = d[2] * rr; }
        for (let sy = 0; sy < by; sy++) for (let sx = 0; sx < bx; sx++) {
          const x = c * bx + sx, y = (h * R + r) * by + sy, n = y * W + x, s = nSeed(n);
          const u = u01(hash32((s + 0x21) >>> 0)), v = u01(hash32((s + 0x22) >>> 0));
          const lc = layerClass(s);
          const a = Math.acos(c0 + (c1 - c0) * u), t = t0 + (t1 - t0) * v; dirOf(a, t, d);
          const rr = radiusAt(tab, a, t) - SHEET * (0.02 + 0.98 * lc.dz);
          const px = side * (HEMI_CX + d[0] * rr), py = 0.08 + d[1] * rr, pz = d[2] * rr;
          pos[n * 3] = px; pos[n * 3 + 1] = py; pos[n * 3 + 2] = pz;
          cls[n] = lc.cls; layer[n] = lc.L; hemi[n] = side; depth[n] = lc.dz; type[n] = CLASSES[lc.cls].exc ? 0 : 1;
          posTex[n * 4] = px; posTex[n * 4 + 1] = py; posTex[n * 4 + 2] = pz; posTex[n * 4 + 3] = lc.cls + 8 * lc.L;
          if (lc.cls < 4) cellN0[ci * 4 + lc.cls]++; else cellN1[ci * 4 + lc.cls - 4]++;
        }
      }
    }
  }
  const win = Math.min(12, Math.ceil(0.30 / cellSide));
  return { tier, N, W, H, bx, by, B, C, R, pos, posTex, cls, layer, type, hemi, depth, cellPos, cellN0, cellN1, cellSide, win, area };
}
export const delayBlocks = (d, v) => Math.max(3, Math.min(RING - 1, Math.round((NET.synDelay + d / v) / BLOCK_MS)));
