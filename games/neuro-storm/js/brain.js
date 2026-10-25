/* NEURO STORM: brain geometry. Two cerebral hemispheres with gyri/sulci,
   a cortical shell of neurons, plus cerebellum/brainstem surfaces (anatomy only).
   Units: 1 unit ~ 6 cm. +x = right, +y = up, +z = anterior (frontal pole). */
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const HEMI_CX = 0.56;           // hemisphere centres at x = +-0.56
// Lobes as ellipsoids in hemisphere-local coords (x lateral, y up, z anterior), smoothly unioned.
const LOBES = [
  { c: [0.02, 0.12, -0.15], s: [0.58, 0.68, 0.95] },   // parietal / body
  { c: [0.0, 0.10, 0.45], s: [0.56, 0.62, 0.86] },     // frontal
  { c: [0.0, -0.02, -0.75], s: [0.5, 0.52, 0.62] },    // occipital
];
const TEMP = { c: [0.17, -0.37, 0.0], s: [0.43, 0.31, 0.72] }; // temporal lobe (sharper crease = Sylvian fissure)
const MEDIAL = -0.53;                  // flat medial wall (interhemispheric fissure)
function sdEll(x, y, z, L) { const s = L.s, X = (x - L.c[0]) / s[0], Y = (y - L.c[1]) / s[1], Z = (z - L.c[2]) / s[2]; return (Math.sqrt(X * X + Y * Y + Z * Z) - 1) * Math.min(s[0], s[1], s[2]); }
function smin(a, b, k) { const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (b - a) / k)); return b + (a - b) * h - k * h * (1 - h); }
const SD = { body: 0, temp: 0 };
function sdBrain(x, y, z) {
  let d = sdEll(x, y, z, LOBES[0]);
  for (let k = 1; k < LOBES.length; k++) d = smin(d, sdEll(x, y, z, LOBES[k]), 0.16);
  const t = sdEll(x, y, z, TEMP); SD.body = d; SD.temp = t;
  d = smin(d, t, 0.045);
  d = -smin(-d, x - MEDIAL, 0.06);                  // smooth intersection with the medial plane
  d = -smin(-d, y + 0.66, 0.08);                  // flatten the base
  return d;
}
function baseRadius(ux, uy, uz) {
  let t0 = 0.15, t1 = 0.15;
  while (t1 < 2 && sdBrain(ux * t1, uy * t1, uz * t1) < 0) { t0 = t1; t1 += 0.06; }
  for (let k = 0; k < 14; k++) { const m = (t0 + t1) / 2; if (sdBrain(ux * m, uy * m, uz * m) < 0) t0 = m; else t1 = m; }
  return (t0 + t1) / 2;
}

// gyral pattern: sulci are the zero-crossings of smooth 3D gradient noise, which gives
// the winding, maze-like folds of a real cortex (a different noise offset per hemisphere)
const PERM = new Uint8Array(512);
{ const r = mulberry32(1234), p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; }
const G3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
function grad(h, x, y, z) { const g = G3[h % 12]; return g[0] * x + g[1] * y + g[2] * z; }
export function perlin(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(lerp(lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u), lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u), lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w);
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// u = unit direction in hemisphere-local frame (x>0 = lateral/outward). Returns radius.
// Also leaves the local sulcus intensity (0..1) in SULC.v for the renderer.
export const SULC = { v: 0, lobe: 0 };
export function hemiRadius(ux, uy, uz, side) {
  let r = baseRadius(ux, uy, uz);
  const syl = Math.exp(-((SD.body - SD.temp) ** 2) / 0.0012) * sstep(-0.1, 0.25, ux + 0.2); // Sylvian crease
  // central sulcus: from vertex down laterally, slightly tilted forward
  const cs = uz + 0.02 - 0.22 * (1 - uy) + 0.05 * Math.sin(uy * 9);
  const csI = Math.exp(-(cs * cs) / 0.0016) * sstep(-0.05, 0.3, uy);
  r -= 0.04 * csI;
  // general gyri/sulci (zero-crossings of warped noise; folds elongated front-back a little)
  const o = side > 0 ? 17.3 : 3.1, F = 6.5;
  const wx = 0.35 * perlin(ux * 1.7 + o, uy * 1.7, uz * 1.7), wy = 0.35 * perlin(ux * 1.7, uy * 1.7 + o, uz * 1.7 + 5);
  const nz = perlin(ux * F * 1.15 + wx + o, uy * F * 1.1 + wy, uz * F * 0.8 + 7.7);
  const g = Math.exp(-(nz * nz) / 0.004), gm = Math.exp(-(nz * nz) / 0.0022);
  const med = sstep(-0.6, -0.85, ux);               // medial wall: shallower folds
  r -= 0.035 * g * (1 - 0.6 * med);
  SULC.v = Math.min(1, gm * (1 - 0.65 * med) + 0.9 * csI + 0.9 * syl);
  // lobe (for the optional lobe tint): temporal below the Sylvian fissure, occipital behind the
  // parieto-occipital line, frontal in front of the central sulcus, parietal in between
  SULC.lobe = (SD.temp < SD.body + 0.01 && uy < 0.12 && uz > -0.62) ? 2 : (uz < -0.68 + 0.12 * uy) ? 3 : cs > 0 ? 0 : 1;
  return r;
}

// world position on a hemisphere surface for direction u (local) scaled by fraction f
export function hemiPoint(side, ux, uy, uz, f, out) {
  const r = hemiRadius(ux, uy, uz, side) * f;
  out[0] = side * (HEMI_CX + ux * r); out[1] = 0.08 + uy * r; out[2] = uz * r;
  return out;
}

// Neuron positions in the cortical grey-matter shell (outer ~15% of each hemisphere)
export function genNeurons(N, seed = 7, iFrac = 0.2) {
  const rnd = mulberry32(seed);
  const pos = new Float32Array(N * 3), hemi = new Int8Array(N), depth = new Float32Array(N), type = new Uint8Array(N);
  const tmp = [0, 0, 0];
  let i = 0;
  while (i < N) {
    const z = 2 * rnd() - 1, t = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    const ux = s * Math.cos(t), uy = z, uz = s * Math.sin(t);
    const side = rnd() < 0.5 ? -1 : 1;
    const r = hemiRadius(ux, uy, uz, side);
    if (rnd() > (r * r) / 1.9) continue;              // area weighting (direction sampling -> surface)
    const f = 0.83 + 0.14 * rnd();                      // layers II-VI
    hemiPoint(side, ux, uy, uz, f, tmp);
    pos[i * 3] = tmp[0]; pos[i * 3 + 1] = tmp[1]; pos[i * 3 + 2] = tmp[2];
    hemi[i] = side; depth[i] = f; i++;
  }
  // exactly round(iFrac*N) inhibitory interneurons, spread randomly
  const idx = Array.from({ length: N }, (_, k) => k);
  for (let k = N - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]]; }
  const nI = Math.round(iFrac * N);
  for (let k = 0; k < nI; k++) type[idx[k]] = 1;
  return { pos, hemi, depth, type };
}

// Surface meshes as plain arrays (renderer turns them into geometry)
export function hemiMesh(side, segU = 256, segV = 160) {
  const verts = [], idx = [], tmp = [0, 0, 0], sulc = [], lobe = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV, ph = v * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const u = i / segU, th = u * Math.PI * 2;
      const ux = Math.sin(ph) * Math.cos(th), uy = Math.cos(ph), uz = Math.sin(ph) * Math.sin(th);
      hemiPoint(side, ux, uy, uz, 1.0, tmp); verts.push(tmp[0], tmp[1], tmp[2]); sulc.push(SULC.v); lobe.push(SULC.lobe);
    }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * (segU + 1) + i, b = a + segU + 1;
    if (side > 0) idx.push(a, b, a + 1, b, b + 1, a + 1); else idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return { verts: new Float32Array(verts), idx, sulc: new Float32Array(sulc), lobe: new Float32Array(lobe) };
}
export function cerebellumMesh(segU = 160, segV = 96) {
  const verts = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const ph = j / segV * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const th = i / segU * Math.PI * 2;
      const ux = Math.sin(ph) * Math.cos(th), uy = Math.cos(ph), uz = Math.sin(ph) * Math.sin(th);
      // two lobes, horizontal folia
      const lobe = 1 + 0.12 * Math.abs(ux) - 0.18 * Math.exp(-(ux * ux) / 0.02) * (uz < 0 ? 1 : 0.3);
      const fol = 1 - 0.035 * Math.pow(Math.abs(Math.sin(uy * 22 + uz * 3)), 0.5);
      const r = lobe * fol;
      verts.push(ux * 0.7 * r, -0.66 + uy * 0.28 * r, -0.86 + uz * 0.4 * r);
    }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) { const a = j * (segU + 1) + i, b = a + segU + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  return { verts: new Float32Array(verts), idx };
}
export function stemMesh(segU = 48, segV = 24) {
  const verts = [], idx = [];
  for (let j = 0; j <= segV; j++) {
    const v = j / segV; const y = -0.15 - v * 1.15, z = -0.32 - v * 0.32;
    const rad = 0.2 - 0.05 * v + 0.05 * Math.exp(-((v - 0.35) ** 2) / 0.01); // pons bulge
    for (let i = 0; i <= segU; i++) { const th = i / segU * Math.PI * 2; verts.push(Math.cos(th) * rad * 1.1, y, z + Math.sin(th) * rad); }
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) { const a = j * (segU + 1) + i, b = a + segU + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  return { verts: new Float32Array(verts), idx };
}

// corpus callosum: the arched commissural band in the floor of the longitudinal fissure
// (genu in front, body, splenium behind), as a flattened, tapered tube along a sagittal arc
export function callosumMesh(segS = 64, segT = 24) {
  const verts = [], idx = [];
  for (let j = 0; j <= segS; j++) {
    const s = j / segS, a = Math.PI * (0.06 + 0.88 * s);
    const z = 0.47 * Math.cos(a) - 0.04, y = 0.06 + 0.17 * Math.sin(a);
    const thick = 0.035 + 0.03 * Math.exp(-((s - 0.95) ** 2) / 0.004) + 0.02 * Math.exp(-((s - 0.04) ** 2) / 0.004); // splenium + genu bulges
    const half = 0.5 * (0.55 + 0.35 * Math.sin(Math.PI * s));
    for (let i = 0; i <= segT; i++) {
      const t = i / segT * Math.PI * 2, cx = Math.cos(t), cy = Math.sin(t);
      verts.push(cx * half, y + cy * thick * (1 - 0.6 * cx * cx), z);
    }
  }
  for (let j = 0; j < segS; j++) for (let i = 0; i < segT; i++) { const a = j * (segT + 1) + i, b = a + segT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  return { verts: new Float32Array(verts), idx };
}
