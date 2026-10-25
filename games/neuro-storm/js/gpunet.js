/* NEURO STORM, dense mode: the layered cortex simulated on the GPU (WebGL2 + float render targets).
   Every neuron is one texel of three ping-ponged RGBA32F state textures:
     A = (V, gE, gI_fast, gAHP)   B = (threshold, gAdapt, steps since spike, V at spike onset)   C = (gI_slow, wave flag, -, -)
   Per 0.2 ms block: conv (per-patch presynaptic firing fractions through axonal delays) -> probe (selected cell,
   every 0.05 ms) -> neuron (4 x 0.05 ms substeps) -> reduce (per-patch spike counts per population into a delay ring)
   -> summary (sampled neurons + population totals, read back once per frame). */
import { DT, PHYS, NET } from './sim.js';
import { BLK, RING, RTX, RTY, CP, K, KI, KC, GS, REACH, CLASSES, DTUNE, nSeed, hash32, u01 } from './dense.js';

const NG = 1024, NCOL = 512, NSAMP = NG + NCOL, PROBE0 = NSAMP, TOT0 = NSAMP + 4, SW = NSAMP + 4 + 32, MAXB = 48;
export { NG, NCOL };
const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const arr = (t, a) => `${t}[${a.length}](${a.map(f).join(',')})`;

function glslConsts() {
  const P = k => arr('float', CP.map(c => c[k]));
  const tplN = CP.map(c => Math.round((c.tRise + c.tFall) / DT)), absN = CP.map(c => Math.round(c.tAbs / DT));
  const KE4 = [0, 1, 2, 3].map(c => `vec4(${K[c].slice(0, 4).map(f).join(',')})`);
  const KIn = CLASSES.map(c => c.id < 4 ? `vec3(${K[c.id].slice(4).map(f).join(',')})` : `vec3(${f(KI[c.id].pv)},${f(KI[c.id].sst)},${f(KI[c.id].vip)})`);
  const KO = CLASSES.map(c => c.id < 4 ? 'vec2(0.0,0.0)' : `vec2(${f(KI[c.id].own)},${f(KI[c.id].oth)})`);
  return `
const float C_gL[7] = ${P('gL')}; const float C_th0[7] = ${P('th0')}; const float C_thSd[7] = ${P('thSd')};
const float C_dTh[7] = ${P('dTh')}; const float C_tauTh[7] = ${P('tauTh')}; const float C_gAHP[7] = ${P('gAHP')}; const float C_tauAHP[7] = ${P('tauAHP')};
const float C_gAd[7] = ${P('gAdapt')}; const float C_tauAd[7] = ${P('tauAdapt')}; const float C_tR[7] = ${P('tRise')}; const float C_tF[7] = ${P('tFall')};
const float C_Vpk[7] = ${P('Vpk')}; const float C_Vend[7] = ${P('Vend')};
const int C_tplN[7] = int[7](${tplN.join(',')}); const int C_absN[7] = int[7](${absN.join(',')});
const vec4 KE4[4] = vec4[4](${KE4.join(',')});
const vec3 KIN[7] = vec3[7](${KIn.join(',')});
const vec2 KOWN[7] = vec2[7](${KO.join(',')});
const float KCALL = ${f(KC)};
#define DT ${f(DT)}
#define EL ${f(PHYS.EL)}
#define EK ${f(PHYS.EK)}
#define EE ${f(PHYS.EE)}
#define EI ${f(PHYS.EI)}
`;
}
const HDR = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uint hsh(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float u01(uint h){ return float(h >> 8u) / 16777216.0; }
float rnd(inout uint s){ s ^= s << 13u; s ^= s >> 17u; s ^= s << 5u; return float(s >> 8u) / 16777216.0; }
float gau(inout uint s){ return (rnd(s) + rnd(s) + rnd(s) + rnd(s) - 2.0) * 1.7320508; }
float pois(float lam, inout uint s){
  if (lam <= 1e-7) return 0.0;
  if (lam < 15.0) { float L = exp(-lam), p = 1.0, k = 0.0; for (int i = 0; i < 48; i++) { p *= rnd(s); if (p <= L) break; k += 1.0; } return k; }
  return max(0.0, floor(lam + sqrt(lam) * gau(s) + 0.5));
}
float wsum(float m, inout uint s){ return m <= 0.0 ? 0.0 : max(0.0, m + sqrt(m) * 0.36 * gau(s)); }
`;
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const CONV_FS = (g) => HDR + `
uniform sampler2D uR0, uR1, uCP, uN0, uN1; uniform int uBlk; uniform float uV, uVC, uSyn, uBM;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
#define C ${g.C}
#define RH ${g.R}
#define WIN ${g.win}
#define RING ${RING}
#define RTX ${RTX}
const float SIG[7] = ${arr('float', REACH.map(r => r[0]))}; const float CUT[7] = ${arr('float', REACH.map(r => r[1]))};
float gw(float d, int p){ return d < CUT[p] ? exp(-d * d / (2.0 * SIG[p] * SIG[p])) : 0.0; }
ivec2 tile(int b, ivec2 q){ int t = ((b % RING) + RING) % RING; return ivec2((t % RTX) * C + q.x, (t / RTX) * (2 * RH) + q.y); }
void main(){
  ivec2 q = ivec2(gl_FragCoord.xy); int h = q.y / RH, r = q.y - h * RH;
  vec3 P = texelFetch(uCP, q, 0).xyz;
  vec4 nu0 = vec4(0.0), de0 = vec4(0.0), nu1 = vec4(0.0), de1 = vec4(0.0);
  for (int dy = -WIN; dy <= WIN; dy++) {
    int rr = r + dy; if (rr < 0 || rr >= RH) continue; int y = h * RH + rr;
    for (int dx = -WIN; dx <= WIN; dx++) {
      int x = (q.x + dx + C) % C; ivec2 c2 = ivec2(x, y);
      float d = distance(P, texelFetch(uCP, c2, 0).xyz); if (d > CUT[0]) continue;
      int del = clamp(int(floor((uSyn + d / uV) / uBM + 0.5)), 3, RING - 1);
      ivec2 tp = tile(uBlk - del, c2);
      vec4 s0 = texelFetch(uR0, tp, 0), s1 = texelFetch(uR1, tp, 0), n0 = texelFetch(uN0, c2, 0), n1 = texelFetch(uN1, c2, 0);
      vec4 w0 = vec4(gw(d,0), gw(d,1), gw(d,2), gw(d,3)), w1 = vec4(gw(d,4), gw(d,5), gw(d,6), 0.0);
      nu0 += w0 * s0; de0 += w0 * n0; nu1 += w1 * s1; de1 += w1 * n1;
    }
  }
  // callosal: homotopic patches of the other hemisphere (L2/3 pyramids), fast myelinated axons
  float cn = 0.0, cd = 0.0; int h2 = 1 - h; vec3 M = vec3(-P.x, P.y, P.z);
  for (int dy = -1; dy <= 1; dy++) { int rr = r + dy; if (rr < 0 || rr >= RH) continue;
    for (int dx = -1; dx <= 1; dx++) { ivec2 c2 = ivec2((q.x + dx + C) % C, h2 * RH + rr); vec3 P2 = texelFetch(uCP, c2, 0).xyz;
      float dm = distance(M, P2), w = exp(-dm * dm / (2.0 * 0.06 * 0.06));
      int del = clamp(int(floor((uSyn + distance(P, P2) / uVC) / uBM + 0.5)), 3, RING - 1);
      cn += w * texelFetch(uR0, tile(uBlk - del, c2), 0).x; cd += w * texelFetch(uN0, c2, 0).x; } }
  o0 = nu0 / max(de0, vec4(1e-6));
  o1 = vec4(nu1.xyz / max(de1.xyz, vec3(1e-6)), cn / max(cd, 1e-6));
}`;

// neuron update; PROBE variant re-runs one neuron and outputs the state after substep (gl_FragCoord.x)
const NEURON_FS = (g, probe) => HDR + glslConsts() + `
uniform sampler2D uA, uB, uC, uPos, uD0, uD1; uniform int uBlk, uStep, uClearWave, uProbe;
uniform float uWE, uWI, uNoise, uExtP, uGExt;
uniform vec4 uSA[4], uSB[4], uSD[4]; uniform int uSN; uniform vec4 uInj;
#define W ${g.W}
#define BX ${g.bx}
#define BY ${g.by}
${probe ? 'out vec4 o0;' : 'layout(location=0) out vec4 oA; layout(location=1) out vec4 oB; layout(location=2) out vec4 oC;'}
void main(){
  ${probe ? 'int n = uProbe; ivec2 p = ivec2(n % W, n / W); int upto = int(gl_FragCoord.x);' : 'ivec2 p = ivec2(gl_FragCoord.xy); int n = p.y * W + p.x; int upto = 3;'}
  vec4 A = texelFetch(uA, p, 0), B = texelFetch(uB, p, 0), Cs = texelFetch(uC, p, 0), P = texelFetch(uPos, p, 0);
  int code = int(P.w + 0.5), cls = code & 7, lay = code >> 3;
  ivec2 cell = ivec2(p.x / BX, p.y / BY);
  vec4 d0 = texelFetch(uD0, cell, 0), d1 = texelFetch(uD1, cell, 0);
  uint seed = hsh(uint(n) ^ 0xA511E9B3u);
  float th0 = C_th0[cls] + C_thSd[cls] * (u01(hsh(seed + 0x10u)) + u01(hsh(seed + 0x11u)) + u01(hsh(seed + 0x12u)) + u01(hsh(seed + 0x13u)) - 2.0) * 1.73;
  bool exc = cls < 4;
  // ---- synaptic arrivals for this block (Poisson, from the canonical-microcircuit in-degrees)
  float lamE, lamP, lamS;
  vec3 ki = KIN[cls];
  if (exc) { lamE = dot(KE4[cls], d0) + ((cls == 0 || cls == 2) ? KCALL * d1.w : 0.0); }
  else { int own = lay <= 1 ? 0 : lay - 1; float fo = d0[own]; lamE = KOWN[cls].x * fo + KOWN[cls].y * (d0.x + d0.y + d0.z + d0.w - fo); }
  lamP = ki.x * d1.x; lamS = ki.y * d1.y + ki.z * d1.z;
  uint st = hsh(seed ^ hsh(uint(uBlk) + 0x51ED27u)) | 1u;
  float nE = pois(lamE, st), nP = pois(lamP, st), nS = pois(lamS, st);
  float ext = rnd(st) < uExtP * ((lay == 2 || lay == 4) ? 1.5 : 1.0) ? 1.0 : 0.0;
  float V = A.x, gE = A.y, gI = A.z, gA = A.w, th = B.x, gS = B.y, ks = B.z, V0 = B.w, gIs = Cs.x, wave = uClearWave == 1 ? 0.0 : Cs.y;
  float addE = (exc ? ${f(GS.eE)} : ${f(GS.eI)}) * ${f(DTUNE.gE)} * uWE * wsum(nE, st) + ext * uGExt * uWE;
  float addP = ${f(GS.pv)} * ${f(DTUNE.gI)} * uWI * wsum(nP, st), addS = ${f(GS.sst)} * ${f(DTUNE.gI)} * uWI * wsum(nS, st);
  float arrive = (nE + ext > 0.0 ? 1.0 : 0.0) + (nP + nS > 0.0 ? 2.0 : 0.0);
  float gL = C_gL[cls], dE = exp(-DT / ${f(PHYS.tauE)}), dI = exp(-DT / ${f(GS.tauIf)}), dIs = exp(-DT / ${f(GS.tauIs)});
  float dTh = exp(-DT / C_tauTh[cls]), dA = exp(-DT / C_tauAHP[cls]), dS = exp(-DT / C_tauAd[cls]);
  float nAmp = ${f(NET.noiseSd)} * uNoise * sqrt(DT) * 1.732 * 2.0;
  int tplN = C_tplN[cls], absN = C_absN[cls];
  for (int k = 0; k < 4; k++) {
    if (k > upto) break;
    int step = uStep + k;
    gE = gE * dE + (k == 0 ? addE : 0.0); gI = gI * dI + (k == 0 ? addP : 0.0); gIs = gIs * dIs + (k == 0 ? addS : 0.0);
    gA *= dA; gS *= dS; th = th0 + (th - th0) * dTh;
    ks = min(ks + 1.0, 1e5); int kk = int(ks);
    if (kk < tplN) {
      float s = ks * DT, tr = C_tR[cls];
      if (s < tr) { float x = s / tr, rr = pow(x, 1.6) * (2.2 - 1.2 * x); V = V0 * (1.0 - rr) + C_Vpk[cls] * rr; }
      else { float x = (s - tr) / C_tF[cls], rr = 0.5 - 0.5 * cos(3.14159265 * min(1.0, x * 1.05)); V = C_Vpk[cls] + (C_Vend[cls] - C_Vpk[cls]) * rr; }
      continue;
    }
    if (kk < absN) { V += DT * (gL * (EL - V) + (gA + gS) * (EK - V)); continue; }
    float Iext = 0.0;
    for (int s = 0; s < 4; s++) { if (s >= uSN) break;
      if (float(step) < uSB[s].z || float(step) >= uSB[s].w) continue;
      if ((P.x < 0.0) != (uSA[s].x < 0.0)) continue;
      vec3 dd = P.xyz - uSA[s].xyz; float a = uSB[s].x * exp(-dot(dd, dd) / (2.0 * uSB[s].y * uSB[s].y));
      if (uSD[s].y > 0.5) a *= lay == 2 ? 1.0 : lay == 4 ? 0.4 : lay == 3 ? 0.2 : 0.0;   // thalamic volley: layer IV (+ VI, V)
      if (n == int(uSA[s].w)) a = max(a, uSD[s].x);
      if (a > 1.0) Iext += a; }
    if (n == int(uInj.x) && float(step) >= uInj.z && float(step) < uInj.w) Iext += uInj.y;
    uint st2 = hsh(seed + uint(step) * 0x9E3779B9u) | 1u;
    float I = gL * (EL - V) + gE * (EE - V) + (gI + gIs) * (EI - V) + (gA + gS) * (EK - V) + Iext;
    V += DT * I + nAmp * (rnd(st2) - 0.5); V = max(V, -95.0);
    if (V >= th) { ks = 0.0; V0 = V; th += C_dTh[cls]; gA += C_gAHP[cls]; gS += C_gAd[cls]; wave = 1.0; }
  }
  ${probe ? 'o0 = vec4(V, th, ks, arrive);' : 'oA = vec4(V, gE, gI, gA); oB = vec4(th, gS, ks, V0); oC = vec4(gIs, wave, 0.0, 0.0);'}
}`;

const REDUCE_FS = g => HDR + `
uniform sampler2D uB, uC, uPos; uniform ivec2 uOff;
layout(location=0) out vec4 o0; layout(location=1) out vec4 o1;
void main(){
  ivec2 c = ivec2(gl_FragCoord.xy) - uOff; vec4 a = vec4(0.0), b = vec4(0.0);
  for (int sy = 0; sy < ${g.by}; sy++) for (int sx = 0; sx < ${g.bx}; sx++) {
    ivec2 p = ivec2(c.x * ${g.bx} + sx, c.y * ${g.by} + sy);
    int cls = int(texelFetch(uPos, p, 0).w + 0.5) & 7;
    float sp = texelFetch(uB, p, 0).z < ${f(BLK)} ? 1.0 : 0.0;
    if (cls < 4) a[cls] += sp; else b[cls - 4] += sp;
    b.w += texelFetch(uC, p, 0).y;
  }
  o0 = a; o1 = b;
}`;

const SUM_FS = g => HDR + `
uniform sampler2D uA, uB, uC, uSamp, uR0, uR1; uniform ivec2 uTile;
out vec4 o0;
void main(){
  int j = int(gl_FragCoord.x);
  if (j < ${NSAMP}) { int n = int(texelFetch(uSamp, ivec2(j, 0), 0).x + 0.5); ivec2 p = ivec2(n % ${g.W}, n / ${g.W});
    o0 = vec4(texelFetch(uB, p, 0).z, texelFetch(uA, p, 0).x, texelFetch(uB, p, 0).x, texelFetch(uC, p, 0).y); return; }
  int t = j - ${TOT0}; bool second = t >= 16; int part = t & 15; vec4 s = vec4(0.0);
  int rows = ${2 * g.R} / 16;
  for (int y = part * rows; y < (part + 1) * rows; y++) for (int x = 0; x < ${g.C}; x++) {
    ivec2 q = uTile + ivec2(x, y); s += second ? texelFetch(uR1, q, 0) : texelFetch(uR0, q, 0); }
  o0 = s;
}`;

export class GpuNet {
  constructor(gl, g) {
    this.gl = gl; this.g = g; this.N = g.N; Object.assign(this, { pos: g.pos, cls: g.cls, layer: g.layer, type: g.type, hemi: g.hemi, depth: g.depth });
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float unavailable');
    this.p = { wE: 1, wI: 1, stim: 1, noise: 1 };
    this.vao = gl.createVertexArray();
    const mk = (fs, name) => this.prog(VS, fs, name);
    this.pConv = mk(CONV_FS(g), 'conv'); this.pNeu = mk(NEURON_FS(g, false), 'neuron'); this.pProbe = mk(NEURON_FS(g, true), 'probe');
    this.pRed = mk(REDUCE_FS(g), 'reduce'); this.pSum = mk(SUM_FS(g), 'summary');
    const { W, H, C, R } = g;
    this.tPos = this.tex(W, H, g.posTex); g.posTex = null;   // only needed on the GPU
    this.tCP = this.tex(C, 2 * R, g.cellPos); this.tN0 = this.tex(C, 2 * R, g.cellN0); this.tN1 = this.tex(C, 2 * R, g.cellN1);
    this.S = [0, 1].map(() => [this.tex(W, H), this.tex(W, H), this.tex(W, H)]);
    this.fS = this.S.map(t => this.fbo(t));
    this.tD = [this.tex(C, 2 * R), this.tex(C, 2 * R)]; this.fD = this.fbo(this.tD);
    this.tR = [this.tex(C * RTX, 2 * R * RTY), this.tex(C * RTX, 2 * R * RTY)]; this.fR = this.fbo(this.tR);
    this.tSum = this.tex(SW, MAXB); this.fSum = this.fbo([this.tSum]);
    this.sampIdx = new Float32Array(NSAMP); this.tSamp = this.tex(NSAMP, 1, null, true);
    this.readBuf = new Float32Array(SW * MAXB * 4);
    this.th0 = (n) => { const c = CP[g.cls[n]], s = nSeed(n); let u = 0; for (let k = 0; k < 4; k++) u += u01(hash32((s + 0x10 + k) >>> 0)); return c.th0 + c.thSd * (u - 2) * 1.73; };
    this.chooseGlobalSample();
    this.cur = 0; this.reset();
  }
  prog(vs, fs, name) {
    const gl = this.gl, sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(o)); return o; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  }
  tex(w, h, data = null, r32 = false) {
    const gl = this.gl, t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (r32) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
    t.w = w; t.h = h; return t;
  }
  fbo(texs) {
    const gl = this.gl, f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
    gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const s = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (s !== gl.FRAMEBUFFER_COMPLETE) throw new Error('framebuffer incomplete ' + s);
    f.n = texs.length; return f;
  }
  upload(t, data) { const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, t.w, t.h, t.w === NSAMP && t.h === 1 ? gl.RED : gl.RGBA, gl.FLOAT, data); }
  // ---------------------------------------------------------------- samples (raster + column view)
  chooseGlobalSample() {
    const N = this.N, ids = []; for (let k = 0; k < NG; k++) ids.push(Math.floor((k + u01(hash32(k * 7919 + 3))) / NG * N));
    ids.sort((a, b) => (this.hemi[a] - this.hemi[b]) || (this.pos[b * 3 + 2] - this.pos[a * 3 + 2]));
    this.gSamp = Int32Array.from(ids); for (let k = 0; k < NG; k++) this.sampIdx[k] = ids[k];
    this.colSamp = new Int32Array(NCOL).fill(ids[0]); this.setColumn(ids[0]);
  }
  setColumn(i) {   // the neurons of the patch around neuron i (for the layer / column view)
    const g = this.g, { W, bx, by, C, R } = g, x0 = (i % W) / bx | 0, y0 = (i / W | 0) / by | 0, h = y0 >= R ? 1 : 0, r0 = y0 - h * R;
    const cells = [];
    for (let dy = -12; dy <= 12; dy++) { const r = r0 + dy; if (r < 0 || r >= R) continue; for (let dx = -12; dx <= 12; dx++) cells.push([dx * dx + dy * dy, (x0 + dx + C) % C, h * R + r]); }
    cells.sort((a, b) => a[0] - b[0]);
    const out = []; for (const [, cx, cy] of cells) { for (let sy = 0; sy < by; sy++) for (let sx = 0; sx < bx; sx++) out.push((cy * by + sy) * W + cx * bx + sx); if (out.length >= NCOL) break; }
    // keep the neurons closest to i
    const p = this.pos, d = n => (p[n * 3] - p[i * 3]) ** 2 + (p[n * 3 + 1] - p[i * 3 + 1]) ** 2 + (p[n * 3 + 2] - p[i * 3 + 2]) ** 2;
    out.sort((a, b) => d(a) - d(b)); if (!out.includes(i)) out.unshift(i);
    for (let k = 0; k < NCOL; k++) { this.colSamp[k] = out[k % out.length]; this.sampIdx[NG + k] = this.colSamp[k]; }
    this.colCenter = i; this.sampDirty = true;
  }
  // ---------------------------------------------------------------- state
  reset() {
    // initial state, uploaded in row bands so the 10M tier does not need three full-size CPU copies
    const g = this.g, { W, H } = g, gl = this.gl, band = Math.max(1, Math.min(H, Math.floor(4194304 / W)));
    const A = new Float32Array(W * band * 4), B = new Float32Array(W * band * 4), Cz = new Float32Array(W * band * 4);
    for (let y0 = 0; y0 < H; y0 += band) {
      const rows = Math.min(band, H - y0), cnt = W * rows;
      for (let k = 0; k < cnt; k++) { const n = y0 * W + k, s = nSeed(n); A[k * 4] = PHYS.EL + (u01(hash32((s + 0x31) >>> 0)) - 0.5) * 2; A[k * 4 + 1] = A[k * 4 + 2] = A[k * 4 + 3] = 0; B[k * 4] = this.th0(n); B[k * 4 + 1] = 0; B[k * 4 + 2] = 1e5; B[k * 4 + 3] = PHYS.EL; }
      for (const kk of [0, 1]) for (const [t, d] of [[this.S[kk][0], A], [this.S[kk][1], B], [this.S[kk][2], Cz]]) {
        gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, W, rows, gl.RGBA, gl.FLOAT, d.subarray(0, cnt * 4));
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fR); gl.viewport(0, 0, this.tR[0].w, this.tR[0].h); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.blk = 0; this.step_ = 0; this.t = 0; this.stims = []; this.inj = null; this.clearWave = 1;
    this.lastV = new Float32Array(NSAMP).fill(PHYS.EL); this.lastKs = new Float32Array(NSAMP).fill(1e5); this.lastTh = new Float32Array(NSAMP);
    this.popTot = new Float64Array(7); this.waveCount = 0; this.spikesLast = 0;
    if (this.sel != null) this.select(this.sel);
  }
  stimulate(i, scale = 1, kind = 0) {
    const p = this.pos, thal = kind === 1;
    this.stims.push({ x: p[i * 3], y: p[i * 3 + 1], z: p[i * 3 + 2], c: i, amp: NET.stimAmp * this.p.stim * scale * (thal ? 1.1 : 1), sig: thal ? DTUNE.thalSig : DTUNE.stimSig,
      s0: this.step_, s1: this.step_ + Math.round(NET.stimDur / DT), cmin: thal ? 0 : NET.stimAmp * 0.6 * scale, kind });
    if (this.stims.length > 4) this.stims.shift();
    if (this.rec) this.rec.stims.push(this.t);
  }
  inject(i, amp, ms) { this.inj = { i, amp, s0: this.step_, s1: this.step_ + Math.round(ms / DT) }; if (this.rec) this.rec.stims.push(this.t); }
  resetWave() { this.clearWave = 1; this.waveCount = 0; }
  select(i) {
    this.sel = i; const n = Math.round(400 / DT);
    this.rec = { i, n, V: new Float32Array(n).fill(this.lastProbeV ?? PHYS.EL), th: new Float32Array(n).fill(this.th0(i)), head: 0, ev: [], spikes: [], stims: [] };
    this.probeV = PHYS.EL; this.probeTh = this.th0(i); this.probeKs = 1e5;
  }
  paramsOf(i) { return CP[this.cls[i]]; }
  vOf(i) { return i === this.sel ? this.probeV : PHYS.EL; }
  thOf(i) { return i === this.sel ? this.probeTh : this.th0(i); }
  phase(i) {
    const T = CP[this.cls[i]], s = this.probeKs * DT, rel = T.tAbs + T.tauTh * Math.log(T.dTh);
    if (s < T.tRise + T.tFall) return 'spike'; if (s < T.tAbs) return 'abs'; if (s < rel) return 'rel';
    if (this.probeV < PHYS.EL - 1.5) return 'hyper'; if (this.probeV > PHYS.EL + 2) return 'depol'; return 'rest';
  }
  // ---------------------------------------------------------------- run
  bindTex(prog, list) { const gl = this.gl; list.forEach(([name, t], k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(prog.u[name], k); }); }
  run(nb) {
    const gl = this.gl, g = this.g; nb = Math.max(1, Math.min(MAXB, nb));
    if (this.sampDirty) { this.upload(this.tSamp, this.sampIdx); this.sampDirty = false; }
    gl.bindVertexArray(this.vao); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true); gl.depthMask(false);
    const p = this.p, extP = NET.extRate * p.noise * DTUNE.ext * BLK * DT * 1e-3;
    const bm = BLK * DT;
    for (let b = 0; b < nb; b++) {
      const blk = this.blk, step = this.step_, cur = this.S[this.cur], nxt = this.cur ^ 1;
      // 1) conv
      let P = this.pConv; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fD); gl.viewport(0, 0, g.C, 2 * g.R);
      this.bindTex(P, [['uR0', this.tR[0]], ['uR1', this.tR[1]], ['uCP', this.tCP], ['uN0', this.tN0], ['uN1', this.tN1]]);
      gl.uniform1i(P.u.uBlk, blk); gl.uniform1f(P.u.uV, NET.vLocal); gl.uniform1f(P.u.uVC, NET.vCall); gl.uniform1f(P.u.uSyn, NET.synDelay); gl.uniform1f(P.u.uBM, bm);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) probe + 3) neuron share uniforms
      const set = (Q) => {
        gl.useProgram(Q.p);
        this.bindTex(Q, [['uA', cur[0]], ['uB', cur[1]], ['uC', cur[2]], ['uPos', this.tPos], ['uD0', this.tD[0]], ['uD1', this.tD[1]]]);
        gl.uniform1i(Q.u.uBlk, blk); gl.uniform1i(Q.u.uStep, step); gl.uniform1i(Q.u.uClearWave, this.clearWave); gl.uniform1i(Q.u.uProbe, this.sel ?? 0);
        gl.uniform1f(Q.u.uWE, p.wE); gl.uniform1f(Q.u.uWI, p.wI); gl.uniform1f(Q.u.uNoise, p.noise); gl.uniform1f(Q.u.uExtP, extP); gl.uniform1f(Q.u.uGExt, NET.gExt);
        const st = this.stims.filter(s => s.s1 > step), SA = new Float32Array(16), SB = new Float32Array(16), SD = new Float32Array(16);
        st.forEach((s, k) => { SA.set([s.x, s.y, s.z, s.c], k * 4); SB.set([s.amp, s.sig, s.s0, s.s1], k * 4); SD.set([s.cmin, s.kind, 0, 0], k * 4); });
        gl.uniform4fv(Q.u.uSA, SA); gl.uniform4fv(Q.u.uSB, SB); gl.uniform4fv(Q.u.uSD, SD); gl.uniform1i(Q.u.uSN, st.length);
        const ij = this.inj && this.inj.s1 > step ? this.inj : null;
        gl.uniform4f(Q.u.uInj, ij ? ij.i : -1, ij ? ij.amp : 0, ij ? ij.s0 : 0, ij ? ij.s1 : 0);
      };
      if (this.sel != null) { set(this.pProbe); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fSum); gl.viewport(PROBE0, b, 4, 1); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      set(this.pNeu); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fS[nxt]); gl.viewport(0, 0, g.W, g.H); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const S2 = this.S[nxt];
      // 4) reduce into ring tile
      const t = blk % RING, ox = (t % RTX) * g.C, oy = Math.floor(t / RTX) * 2 * g.R;
      P = this.pRed; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fR); gl.viewport(ox, oy, g.C, 2 * g.R);
      this.bindTex(P, [['uB', S2[1]], ['uC', S2[2]], ['uPos', this.tPos]]); gl.uniform2i(P.u.uOff, ox, oy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 5) summary row
      P = this.pSum; gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fSum);
      this.bindTex(P, [['uA', S2[0]], ['uB', S2[1]], ['uC', S2[2]], ['uSamp', this.tSamp], ['uR0', this.tR[0]], ['uR1', this.tR[1]]]); gl.uniform2i(P.u.uTile, ox, oy);
      gl.viewport(0, b, NSAMP, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.viewport(TOT0, b, 32, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.cur = nxt; this.blk++; this.step_ += BLK; this.clearWave = 0;
    }
    this.t = this.step_ * DT;
    if (this.inj && this.inj.s1 <= this.step_) this.inj = null;
    this.stims = this.stims.filter(s => s.s1 > this.step_);
    // read back
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fSum); gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, SW, nb, gl.RGBA, gl.FLOAT, this.readBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null);
    return this.parse(nb);
  }
  parse(nb) {
    const R = this.readBuf, out = { nb, t0: this.t - nb * BLK * DT, spikes: [], pop: new Float64Array(nb * 7), wave: 0, total: 0 };
    for (let b = 0; b < nb; b++) {
      const row = b * SW * 4, tb = out.t0 + b * BLK * DT;
      for (let j = 0; j < NSAMP; j++) {
        const ks = R[row + j * 4]; if (ks < BLK) out.spikes.push(tb + (BLK - 1 - ks) * DT, j);
        if (b === nb - 1) { this.lastKs[j] = ks; this.lastV[j] = R[row + j * 4 + 1]; this.lastTh[j] = R[row + j * 4 + 2]; }
      }
      let tot = 0, wave = 0;
      for (let q = 0; q < 16; q++) { const o = row + (TOT0 + q) * 4, o2 = row + (TOT0 + 16 + q) * 4;
        for (let c = 0; c < 4; c++) out.pop[b * 7 + c] += R[o + c]; for (let c = 0; c < 3; c++) out.pop[b * 7 + 4 + c] += R[o2 + c]; wave += R[o2 + 3]; }
      for (let c = 0; c < 7; c++) { tot += out.pop[b * 7 + c]; this.popTot[c] += out.pop[b * 7 + c]; }
      out.total += tot; out.wave = wave;
      if (this.rec && this.sel != null) {
        const rec = this.rec;
        for (let k = 0; k < BLK; k++) {
          const o = row + (PROBE0 + k) * 4, V = R[o], th = R[o + 1], ks = R[o + 2], arr = R[o + 3], h = rec.head;
          rec.V[h] = V; rec.th[h] = th; rec.head = (h + 1) % rec.n;
          const tt = tb + k * DT;
          if (ks === 0) rec.spikes.push(tt);
          if (k === 0 && arr > 0) { if (arr === 1 || arr === 3) rec.ev.push(tt, 1); if (arr >= 2) rec.ev.push(tt, -1); }
          this.probeV = V; this.probeTh = th; this.probeKs = ks;
        }
      }
    }
    this.waveCount = out.wave; this.spikesLast = out.total;
    if (this.rec) { const rec = this.rec, cut = this.t - 420; while (rec.ev.length && rec.ev[0] < cut) rec.ev.splice(0, 2); while (rec.spikes.length && rec.spikes[0] < cut - 40) rec.spikes.shift(); while (rec.stims.length && rec.stims[0] < cut) rec.stims.shift(); }
    return out;
  }
  // texture handles for the renderer (current state)
  get stateA() { return this.S[this.cur][0]; }
  get stateB() { return this.S[this.cur][1]; }
}
export const SAMPLES = { NG, NCOL, NSAMP };
