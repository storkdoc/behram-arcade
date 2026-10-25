/* NEURO ARENA: the genome and its copy errors.
   Every gene has a range. A spawn copies the parent's genome gene by gene; each copy has a small
   probability (the copy-error rate) of being miscopied, like a DNA replication error:
     ~85% small error (Gaussian, 12% of the gene's range), ~13% larger point error (Gaussian, 40% of range),
     ~2% structural error (a pathway switched on/off, or the wiring seed re-rolled). */
// innate axon-guidance cues: one gene per band of (ball y - paddle y) offset, and per band of ball vertical velocity.
// + biases that band's association cells to wire onto the UP motor group, - onto the DOWN group. Gen 0: all 0 (no innate map).
export const NGB = 12, NGV = 4;
const BANDS = [
  ...Array.from({ length: NGB }, (_, k) => [`gb${k}`, `Guidance Δy ${(-1 + (k + 0.5) * 2 / NGB).toFixed(2)}`, 'Guidance', -1, 1, 0, 2, '']),
  ...Array.from({ length: NGV }, (_, k) => [`gv${k}`, `Guidance vy ${(-1 + (k + 0.5) * 2 / NGV).toFixed(2)}`, 'Guidance', -1, 1, 0, 2, '']),
];
export const GENES = [
  // key, label, group, min, max, gen-0 value, decimals, unit, structural?
  ['thGain', 'Thalamic drive', 'Sensory', 100, 700, 260, 0, 'Hz'],
  ['rfW', 'Receptive-field width', 'Sensory', 0.02, 0.25, 0.14, 3, ''],
  ['anticip', 'Motion anticipation', 'Sensory', 0, 500, 0, 0, 'ms'],
  ['pTS', 'Thalamus→Sensory p', 'Sensory', 0.05, 0.8, 0.3, 2, ''],
  ['wTS', 'Thalamus→Sensory w', 'Sensory', 0.01, 0.15, 0.08, 3, 'mS'],
  ['pSA', 'Sensory→Assoc p', 'Assoc', 0.05, 0.8, 0.5, 2, ''],
  ['wSA', 'Sensory→Assoc w', 'Assoc', 0.005, 0.1, 0.06, 3, 'mS'],
  ['gfW', 'Gain-field width', 'Assoc', 0.02, 0.3, 0.12, 3, ''],
  ['wEE', 'Recurrent E→E w', 'Assoc', 0, 0.03, 0.008, 3, 'mS'],
  ['wEI', 'E→I w', 'Balance', 0.01, 0.1, 0.04, 3, 'mS'],
  ['wIE', 'I→E w (inhibition)', 'Balance', 0.02, 0.5, 0.15, 3, 'mS'],
  ['pAM', 'Assoc→Motor p', 'Motor', 0.05, 0.6, 0.25, 2, ''],
  ['wAM0', 'Assoc→Motor initial w', 'Motor', 0.005, 0.08, 0.04, 3, 'mS'],
  'BANDS',
  ['wta', 'Motor lateral inhibition', 'Motor', 0.01, 0.4, 0.1, 3, 'mS'],
  ['motorBg', 'Motor background drive', 'Motor', 50, 2000, 300, 0, 'Hz'],
  ['explore', 'Exploration drive', 'Motor', 0, 4, 1.5, 2, 'µA'],
  ['kDec', 'Decoder gain', 'Motor', 0.3, 6, 1.5, 2, ''],
  ['eta', 'Learning rate η', 'Learning', 0, 0.03, 0.002, 4, ''],
  ['ltd', 'LTD/LTP ratio', 'Learning', 0.1, 1.5, 0.7, 2, ''],
  ['tauElig', 'Eligibility τ', 'Learning', 10, 800, 150, 0, 'ms'],
  ['tauDA', 'Dopamine τ', 'Learning', 10, 400, 150, 0, 'ms'],
  ['critic', 'Approach reward (critic)', 'Learning', 0, 3, 0.5, 2, ''],
  ['hitR', 'Hit reward', 'Learning', 0, 3, 1, 2, ''],
  ['missR', 'Miss punishment', 'Learning', 0, 3, 1, 2, ''],
  ['wMax', 'Max synaptic w', 'Learning', 0.02, 0.2, 0.1, 3, 'mS'],
  ['homeo', 'Synaptic scaling rate', 'Homeostasis', 0, 1, 0.2, 2, ''],
  ['rateT', 'Target motor rate', 'Homeostasis', 2, 60, 20, 0, 'Hz'],
  ['noise', 'Membrane noise', 'Homeostasis', 0, 2.5, 1, 2, ''],
  ['sCtx', 'Velocity-context pathway', 'Structure', 0, 1, 1, 0, '', 1],
  ['sTRN', 'Reticular (TRN) inhibition', 'Structure', 0, 1, 1, 0, '', 1],
  ['sRec', 'Assoc recurrence', 'Structure', 0, 1, 1, 0, '', 1],
  ['sMRec', 'Motor self-excitation', 'Structure', 0, 1, 0, 0, '', 1],
  ['seed', 'Wiring seed', 'Structure', 1, 99999, 1234, 0, '', 2],
].flatMap(r => r === 'BANDS' ? BANDS : [r]).map(([key, label, group, min, max, init, dec, unit, struct]) => ({ key, label, group, min, max, init, dec, unit, struct: struct || 0 }));
export const GENE = Object.fromEntries(GENES.map(g => [g.key, g]));

export function gen0Genome(seed = 1234) {
  const g = {}; for (const s of GENES) g[s.key] = s.init; g.seed = seed; return g;
}
export function fmtGene(key, v) {
  const s = GENE[key]; if (!s) return String(v);
  if (s.struct === 1) return v >= 0.5 ? 'on' : 'off';
  return (+v).toFixed(s.dec) + (s.unit ? ' ' + s.unit : '');
}
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export function gauss(rnd) { let u = 0; for (let k = 0; k < 6; k++) u += rnd(); return (u - 3) * 1.4142; }

/* copy a genome with replication errors. returns { genome, errors: [{key, kind, from, to}] } */
export function copyGenome(parent, rate, rnd) {
  const g = { ...parent }, errors = [];
  for (const s of GENES) {
    if (rnd() >= rate) continue;
    const from = g[s.key], u = rnd();
    let kind, to;
    if (u < 0.02 || s.struct) {
      kind = 'structural';
      if (s.struct === 1) to = from >= 0.5 ? 0 : 1;
      else if (s.struct === 2) to = 1 + Math.floor(rnd() * 99998);
      else {   // a rare structural error: a whole pathway is switched on/off, or the wiring is re-rolled
        const S = GENES.filter(x => x.struct), t = S[Math.floor(rnd() * S.length)], f = g[t.key];
        const v = t.struct === 1 ? (f >= 0.5 ? 0 : 1) : 1 + Math.floor(rnd() * 99998);
        g[t.key] = v; errors.push({ key: t.key, kind, from: f, to: v }); continue;
      }
    } else if (u < 0.15) { kind = 'point'; to = clamp(from + gauss(rnd) * 0.4 * (s.max - s.min), s.min, s.max); }
    else { kind = 'small'; to = clamp(from + gauss(rnd) * 0.12 * (s.max - s.min), s.min, s.max); }
    g[s.key] = to; errors.push({ key: s.key, kind, from, to });
  }
  return { genome: g, errors };
}
/* copy learned weights (Lamarckian) with per-weight copy errors. returns number of errors */
export function copyWeights(src, rate, rnd, wMax) {
  const w = new Float32Array(src);
  if (rate <= 0) return { w, n: 0 };
  // geometric skipping: visit only miscopied weights
  let n = 0, i = -1; const lq = Math.log(1 - Math.min(rate, 0.999));
  for (;;) {
    i += 1 + Math.floor(Math.log(1 - rnd()) / lq); if (i >= w.length) break;
    if (w[i] < 0) continue;
    w[i] = clamp(w[i] + gauss(rnd) * 0.15 * wMax, 0, wMax); n++;
  }
  return { w, n };
}
