/* NEURO ARENA renderer: two glowing 3D brains (Thalamus, Sensory, Association, Motor UP/DOWN), spike traffic
   along the sensorimotor pathway, and a neon Pong court between them. three.js r169 (vendored), HDR + bloom. */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { Brain, L, N, AREA_DEF } from './brain.js';
import { COURT } from './pong.js';

const S = 2;                       // court scale: world units per court unit
const CW = COURT.W * S, CH = COURT.H * S;
const hash = (i, k) => { let x = Math.imul(i + 1, 0x9E3779B1) ^ Math.imul(k + 7, 0x85EBCA77); x ^= x >>> 15; x = Math.imul(x, 0x2C1B3C6D); x ^= x >>> 12; return (x >>> 0) / 4294967296; };
const AREA_COL = { TH_E: [1.0, 0.68, 0.25], TH_I: [1.0, 0.35, 0.75], S_E: [0.2, 0.95, 0.82], S_I: [1.0, 0.32, 0.8], A_E: [0.6, 0.48, 1.0], A_I: [1.0, 0.3, 0.85], M_UP: [0.36, 1.0, 0.6], M_DN: [1.0, 0.55, 0.22], M_I: [1.0, 0.3, 0.8] };
export const REGION_LABELS = [
  ['Sensory', -0.56, 0.74], ['Thalamus', -0.12, -0.84], ['Association', 0.06, 0.8], ['Motor UP', 0.66, 0.52], ['Motor DOWN', 0.66, -0.36],
];

// neuron positions in brain-local coordinates: x toward the court, y up, z toward the viewer
function layout() {
  const f = { ch: new Int8Array(N).fill(-1), c1: new Float32Array(N), c2: new Float32Array(N) };
  Brain.prototype.labelFeatures.call(f);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), typ = new Float32Array(N);
  const set = (i, x, y, z) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; };
  const dome = (x, y) => 0.22 * Math.cos(x * 1.5) * Math.cos(y * 1.2);
  AREA_DEF.forEach(([k, n, t], ai) => {
    const a = L[k], c = AREA_COL[k];
    for (let i = a.s; i < a.e; i++) {
      const j = hash(i, 1) - 0.5, j2 = hash(i, 2) - 0.5, j3 = hash(i, 3) - 0.5, ch = f.ch[i], u = f.c1[i], v = f.c2[i];
      let x = 0, y = 0, z = 0;
      if (k === 'TH_E') { x = -0.24 + ch * 0.075 + j * 0.03; y = -0.66 + u * 0.34; z = 0.05 + j2 * 0.1; }
      else if (k === 'TH_I') { const th = hash(i, 4) * Math.PI * 2, ph = Math.acos(2 * hash(i, 5) - 1); x = -0.12 + 0.2 * Math.sin(ph) * Math.cos(th); y = -0.49 + 0.24 * Math.cos(ph); z = 0.05 + 0.12 * Math.sin(ph) * Math.sin(th); }
      else if (k === 'S_E') { x = -0.8 + ch * 0.1 + j * 0.045; y = -0.08 + u * 0.72; z = dome(x, y) + j2 * 0.05; }
      else if (k === 'S_I') { x = -0.8 + hash(i, 6) * 0.4; y = -0.08 + hash(i, 7) * 0.72; z = dome(x, y) - 0.04 + j2 * 0.06; }
      else if (k === 'A_E') {
        if (ch === 4) { x = -0.24 + v * 0.6 + j * 0.012; y = 0.06 + u * 0.62 + j2 * 0.012; }
        else { x = -0.16 + v * 0.44 + j * 0.02; y = -0.3 + u * 0.28 + j2 * 0.02; }
        z = dome(x, y) + 0.06 + j3 * 0.03;
      }
      else if (k === 'A_I') { x = -0.24 + hash(i, 6) * 0.6; y = -0.3 + hash(i, 7) * 0.98; z = dome(x, y) + j3 * 0.05; }
      else if (k === 'M_UP' || k === 'M_DN') { const r = Math.sqrt(hash(i, 8)) * 0.13, th = hash(i, 9) * Math.PI * 2; x = 0.66 + r * Math.cos(th); y = (k === 'M_UP' ? 0.3 : -0.14) + r * Math.sin(th) * 0.95; z = 0.1 + j3 * 0.1; }
      else { x = 0.66 + j * 0.2; y = 0.08 + j2 * 0.12; z = 0.1 + j3 * 0.1; }
      set(i, x, y, z); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; typ[i] = t;
    }
  });
  return { pos, col, typ };
}

const PTS_V = /* glsl */`
  uniform float uScale, uSize; attribute vec3 aCol; attribute float aAct; attribute float aType;
  varying vec3 vC; varying float vA;
  void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float a = aAct; vec3 base = aCol * (aType > 0.5 ? 0.10 : 0.16);
    vC = mix(base, mix(aCol, vec3(1.0), 0.45) * 3.2, a * a); vA = a;
    gl_PointSize = max(1.5, uSize * (aType > 0.5 ? 0.8 : 1.0) * (1.0 + 1.4 * a) * uScale / -mv.z);
    gl_Position = projectionMatrix * mv; }`;
const PTS_F = /* glsl */`
  varying vec3 vC; varying float vA;
  void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard;
    float core = smoothstep(0.35, 0.0, r2), halo = exp(-r2 * 4.0) * (0.25 + 0.75 * vA);
    gl_FragColor = vec4(vC * (core * 0.8 + halo * 0.6), 1.0); }`;

export class Render3D {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.setClearColor(0x03050b, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    this.pr = Math.min(window.devicePixelRatio || 1, 2);
    this.L = layout();
    this.uPts = { uScale: { value: 600 }, uSize: { value: 0.019 } };
    this.time = 0; this.dopa = [0, 0];
    this.buildBackdrop(); this.buildCourt();
    this.brains = [this.buildBrain(0), this.buildBrain(1)];
    this.buildTraffic();
    this.composer = null; this.rect = null; this.mode = 'wide';
    this.v3 = new THREE.Vector3();
  }
  buildBackdrop() {
    const g = new THREE.PlaneGeometry(60, 40);
    const m = new THREE.ShaderMaterial({ depthWrite: false, uniforms: { uT: { value: 0 } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vU; uniform float uT; void main(){ vec2 p = vU - 0.5; float v = 1.0 - smoothstep(0.0, 0.6, length(p * vec2(1.0, 1.4)));
        vec3 c = mix(vec3(0.004, 0.006, 0.016), vec3(0.02, 0.03, 0.075), v); c += vec3(0.03, 0.0, 0.04) * smoothstep(0.2, 0.0, abs(p.y + 0.05)) * 0.4; gl_FragColor = vec4(c, 1.0); }` });
    const b = new THREE.Mesh(g, m); b.position.z = -6; this.scene.add(b);
  }
  buildCourt() {
    const g = this.court = new THREE.Group(); this.scene.add(g);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.3, CH + 0.3), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uFlash: { value: new THREE.Vector4(0, 0, 0, 0) } },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vU; uniform vec4 uFlash; void main(){ vec2 g = abs(fract(vU * vec2(${(CW + 0.3) / 0.2}, ${(CH + 0.3) / 0.2})) - 0.5);
        float line = smoothstep(0.47, 0.5, max(g.x, g.y)); vec3 c = vec3(0.01, 0.018, 0.045) + vec3(0.04, 0.08, 0.2) * line * 0.5;
        c += vec3(0.0, 0.5, 0.6) * uFlash.x * smoothstep(0.35, 0.0, vU.x); c += vec3(0.6, 0.0, 0.5) * uFlash.y * smoothstep(0.65, 1.0, vU.x);
        gl_FragColor = vec4(c, 0.92); }` }));
    floor.position.z = -0.02; g.add(floor); this.floor = floor;
    const hw = CW / 2, hh = CH / 2, seg = [];
    seg.push(-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0);
    const lines = new Float32Array([-hw, -hh, 0, hw, -hh, 0, -hw, hh, 0, hw, hh, 0]);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.55, 1.6) })));
    const ends = new Float32Array([-hw, -hh, 0, -hw, hh, 0, hw, -hh, 0, hw, hh, 0]);
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ends, 3));
    const ecol = new Float32Array([0.1, 0.7, 0.9, 0.1, 0.7, 0.9, 0.9, 0.15, 0.75, 0.9, 0.15, 0.75]); eg.setAttribute('color', new THREE.BufferAttribute(ecol, 3));
    g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 })));
    const dash = []; for (let y = -hh + 0.04; y < hh; y += 0.12) dash.push(0, y, 0, 0, Math.min(hh, y + 0.06), 0);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dash), 3));
    g.add(new THREE.LineSegments(dg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.3, 0.4, 0.9), transparent: true, opacity: 0.6 })));
    const pg = new THREE.BoxGeometry(0.035, COURT.padH * S, 0.05);
    this.pads = [new THREE.Color(0.25, 2.4, 3.0), new THREE.Color(3.0, 0.35, 2.3)].map(c => { const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: c })); g.add(m); return m; });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.r * S * 1.25, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 4.4) })); g.add(this.ball);
    // trail
    this.trailN = 24; this.trail = new Float32Array(this.trailN * 3); this.trailA = new Float32Array(this.trailN);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.trail, 3)); tg.setAttribute('aA', new THREE.BufferAttribute(this.trailA, 1));
    this.trailPts = new THREE.Points(tg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.uPts,
      vertexShader: 'uniform float uScale; attribute float aA; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = max(1.0, 0.05 * aA * uScale / -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r = dot(p,p); if (r>1.0) discard; gl_FragColor = vec4(vec3(1.2,1.1,2.0) * vA * exp(-r*3.0), 1.0); }' }));
    this.trailPts.frustumCulled = false; g.add(this.trailPts);
    // hit rings
    this.rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); m.visible = false; m.t = 0; g.add(m); return m; });
    this.flash = [0, 0];
  }
  buildBrain(side) {
    const grp = new THREE.Group(); this.scene.add(grp);
    const Lb = this.L, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Lb.pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(Lb.col, 3));
    geo.setAttribute('aType', new THREE.BufferAttribute(Lb.typ, 1));
    const act = new Float32Array(N); const aAct = new THREE.BufferAttribute(act, 1); aAct.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aAct', aAct);
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.uPts, vertexShader: PTS_V, fragmentShader: PTS_F }));
    pts.frustumCulled = false; grp.add(pts);
    // translucent cortex shell with a fresnel rim (rim colour pulses with dopamine)
    const shellU = { uRim: { value: new THREE.Color(side ? 0.9 : 0.15, side ? 0.2 : 0.75, side ? 0.75 : 1.0) }, uDA: { value: 0 } };
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, uniforms: shellU,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform vec3 uRim; uniform float uDA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6);
        vec3 c = uRim * 0.55; c = mix(c, vec3(1.0, 0.8, 0.25) * 2.0, clamp(uDA, 0.0, 1.0)); c = mix(c, vec3(0.3, 0.4, 1.6), clamp(-uDA, 0.0, 1.0));
        gl_FragColor = vec4(c * f * 0.5, 1.0); }` }));
    shell.scale.set(1.05, 0.95, 0.42); shell.position.set(-0.02, 0.0, 0.02); grp.add(shell);
    // fibre bundles between regions
    const fib = [], pathC = [[-0.12, -0.5, -0.6, 0.25], [-0.55, 0.3, 0.05, 0.4], [0.2, 0.35, 0.66, 0.3], [0.2, 0.25, 0.66, -0.14], [-0.12, -0.5, 0.0, -0.18]];
    for (const [x0, y0, x1, y1] of pathC) for (let q = 0; q < 10; q++) {
      const o = (q - 4.5) * 0.012, mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 0.12, mz = 0.28 + o * 2;
      let px = x0 + o, py = y0, pz = 0.08;
      for (let s = 1; s <= 16; s++) { const t = s / 16, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; const nx = a * (x0 + o) + b * mx + c * (x1 + o), ny = a * y0 + b * (my + o) + c * y1, nz = a * 0.08 + b * mz + c * 0.1; fib.push(px, py, pz, nx, ny, nz); px = nx; py = ny; pz = nz; }
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fib), 3));
    grp.add(new THREE.LineSegments(fg, new THREE.LineBasicMaterial({ color: new THREE.Color(0.22, 0.3, 0.7), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })));
    return { grp, pts, act, aAct, shellU, side };
  }
  buildTraffic() {
    const M = this.tN = 3000;
    this.tP = new Float32Array(M * 3); this.tA = new Float32Array(M); this.tC = new Float32Array(M * 3);
    this.tS = new Float32Array(M * 3); this.tE = new Float32Array(M * 3); this.tT = new Float32Array(M).fill(1); this.tD = new Float32Array(M); this.tHead = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.tP, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aA', new THREE.BufferAttribute(this.tA, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aC', new THREE.BufferAttribute(this.tC, 3).setUsage(THREE.DynamicDrawUsage));
    this.tGeo = g;
    const p = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.uPts,
      vertexShader: 'uniform float uScale; attribute float aA; attribute vec3 aC; varying float vA; varying vec3 vC; void main(){ vA = aA; vC = aC; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aA > 0.0 ? max(1.5, 0.028 * uScale / -mv.z) : 0.0; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r = dot(p,p); if (r>1.0) discard; gl_FragColor = vec4(vC * 3.0 * vA * exp(-r*3.5), 1.0); }' }));
    p.frustumCulled = false; this.scene.add(p);
  }
  // world position of neuron i of brain k
  nWorld(k, i, out) { const P = this.L.pos; out.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); return this.brains[k].grp.localToWorld(out); }
  courtWorld(x, y, out) { out.set(x * S - CW / 2, y * S - CH / 2, 0.02); return this.court.localToWorld(out); }
  emit(sx, sy, sz, ex, ey, ez, c, dur) {
    const h = this.tHead; this.tHead = (h + 1) % this.tN;
    this.tS[h * 3] = sx; this.tS[h * 3 + 1] = sy; this.tS[h * 3 + 2] = sz; this.tE[h * 3] = ex; this.tE[h * 3 + 1] = ey; this.tE[h * 3 + 2] = ez;
    this.tC[h * 3] = c[0]; this.tC[h * 3 + 1] = c[1]; this.tC[h * 3 + 2] = c[2]; this.tT[h] = 0; this.tD[h] = dur;
  }
  // spike flags from a frame -> neuron glow + spike traffic along the pathway
  spikes(k, spk, off, f) {
    const b = this.brains[k], act = b.act, a = new THREE.Vector3(), e = new THREE.Vector3();
    for (let i = 0; i < N; i++) if (spk[off + i]) act[i] = 1;
    const scale = Math.min(1, 40 / Math.max(1, f.simMs || 16));
    const send = (src, pick, prob, col, dur, cap) => {
      let n = 0; for (let i = src.s; i < src.e && n < cap; i++) if (spk[off + i] && Math.random() < prob * scale) { const j = pick(i); if (j < 0) continue; this.nWorld(k, i, a); if (j >= 1e6) { this.courtWorld(COURT.padX[k], f.pad[k], e); } else this.nWorld(k, j, e); this.emit(a.x, a.y, a.z, e.x, e.y, e.z, col, dur); n++; }
    };
    const rI = (s) => s.s + Math.floor(Math.random() * s.n);
    send(L.TH_E, i => { const r = (i - L.TH_E.s); return L.S_E.s + Math.min(L.S_E.n - 1, r * 2 + (Math.random() < 0.5 ? 0 : 1)); }, 0.25, [1, 0.7, 0.3], 0.35, 40);
    send(L.S_E, () => rI({ s: L.A_E.s, n: 784 }), 0.25, [0.3, 1, 0.85], 0.4, 40);
    send(L.A_E, () => Math.random() < 0.5 ? rI(L.M_UP) : rI(L.M_DN), 0.12, [0.65, 0.5, 1], 0.4, 40);
    send(L.M_UP, () => 1e6, 0.18, [0.4, 1, 0.6], 0.45, 14);
    send(L.M_DN, () => 1e6, 0.18, [1, 0.6, 0.25], 0.45, 14);
    // receptors: the ball's position streams into the thalamus
    if (f.bx != null) { this.courtWorld(f.bx, f.by, a); let n = 0; for (let i = L.TH_E.s; i < L.TH_E.s + 112 && n < 6; i++) if (spk[off + i] && Math.random() < 0.15 * scale) { this.nWorld(k, i, e); this.emit(a.x, a.y, a.z, e.x, e.y, e.z, [0.9, 0.9, 1.0], 0.55); n++; } }
  }
  setDopamine(k, v) { this.dopa[k] = v; }
  setFrame(f) { this.f = f; }
  ringAt(x, y, c) { const r = this.rings.find(m => !m.visible) || this.rings[0]; r.visible = true; r.t = 0; r.position.set(x * S - CW / 2, y * S - CH / 2, 0.03); r.material.color.setRGB(c[0], c[1], c[2]); }
  goal(p) { this.flash[p] = 1; }
  // ---------------------------------------------------------------- layout & camera
  setLayout(rect, W, H) {
    this.rect = rect; const asp = rect.w / Math.max(1, rect.h);
    const tall = asp < 1.15; this.mode = tall ? 'tall' : 'wide';
    const A = this.brains[0].grp, B = this.brains[1].grp;
    let bw, bh;
    if (!tall) {
      const s = 1.2, X = CW / 2 + 0.25 + 1.0 * s;
      this.court.position.set(0, 0, 0); A.position.set(-X, 0.05, 0); B.position.set(X, 0.05, 0); A.scale.set(s, s, s); B.scale.set(-s, s, s);
      A.rotation.y = 0.28; B.rotation.y = -0.28; bw = 2 * (X + 1.05 * s); bh = Math.max(CH + 0.2, 2.0 * s);
      this.center = new THREE.Vector3(0, -0.02, 0);
    } else {
      const s = 1.02, gap = 0.25;
      this.court.position.set(0, CH / 2 + gap, 0);
      A.position.set(-1.08, -0.95 * s - 0.05, 0); B.position.set(1.08, -0.95 * s - 0.05, 0); A.scale.set(s, s, s); B.scale.set(-s, s, s);
      A.rotation.y = 0.16; B.rotation.y = -0.16; bw = Math.max(CW + 0.2, 2 * (1.08 + 1.08 * s)); bh = CH + gap + 2.0 * s + 0.2;
      this.center = new THREE.Vector3(0, (CH + gap - 1.95 * s) / 2 - 0.02, 0);
    }
    const cam = this.camera, f = Math.tan(cam.fov * Math.PI / 360);
    const ppu = Math.min(rect.w / (bw * 1.1), rect.h / (bh * 1.06)), d = H / (2 * f * ppu);
    cam.position.set(this.center.x, this.center.y - d * 0.05, d); cam.lookAt(this.center);
    cam.aspect = W / H; cam.near = d * 0.2; cam.far = d * 4;
    cam.setViewOffset(W, H, W / 2 - (rect.x + rect.w / 2), H / 2 - (rect.y + rect.h / 2), W, H);
    cam.updateProjectionMatrix();
    this.ppu = ppu;
  }
  resize(W, H, rect) {
    this.W = W; this.H = H;
    this.r.setPixelRatio(this.pr); this.r.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const sz = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(this.r, rt);
    this.composer.setPixelRatio(this.pr); this.composer.setSize(W, H);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.45, 0.72);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.setLayout(rect, W, H);
  }
  // screen (css px) -> court coordinates, or null
  toCourt(sx, sy) {
    const ndc = new THREE.Vector3(sx / this.W * 2 - 1, -(sy / this.H) * 2 + 1, 0.5).unproject(this.camera);
    const o = this.camera.position, dir = ndc.sub(o).normalize(), zc = this.court.position.z;
    const t = (zc - o.z) / dir.z, p = o.clone().addScaledVector(dir, t);
    return { x: (p.x - this.court.position.x + CW / 2) / S, y: (p.y - this.court.position.y + CH / 2) / S };
  }
  project(v) { const p = v.clone().project(this.camera); return { x: (p.x + 1) / 2 * this.W, y: (1 - p.y) / 2 * this.H, ok: p.z < 1 }; }
  anchor(k, x, y, z = 0.1) { return this.project(this.brains[k].grp.localToWorld(this.v3.set(x, y, z))); }
  courtAnchor(x, y) { return this.project(this.courtWorld(x, y, new THREE.Vector3())); }
  render(dt, live) {
    this.time += dt;
    const f = this.f, decay = Math.exp(-dt / 0.11);
    for (const b of this.brains) {
      const act = b.act;
      if (live) for (let i = 0; i < N; i++) act[i] *= decay;
      else for (let i = 0; i < N; i++) { act[i] *= decay; if (Math.random() < 0.0025) act[i] = 0.5; }   // idle shimmer (turbo)
      b.aAct.needsUpdate = true;
      const d = this.dopa[b.side]; b.shellU.uDA.value += (Math.max(-1, Math.min(1, d)) - b.shellU.uDA.value) * Math.min(1, dt * 8);
    }
    if (f) {
      for (let p = 0; p < 2; p++) this.pads[p].position.set(COURT.padX[p] * S - CW / 2 + (p ? 0.02 : -0.02), f.pad[p] * S - CH / 2, 0.02);
      const bx = f.bx * S - CW / 2, by = f.by * S - CH / 2; this.ball.position.set(bx, by, 0.03);
      this.trail.copyWithin(3, 0, (this.trailN - 1) * 3); this.trail[0] = bx; this.trail[1] = by; this.trail[2] = 0.03;
      for (let i = 0; i < this.trailN; i++) this.trailA[i] = live ? (1 - i / this.trailN) * 0.8 : 0;
      this.trailPts.geometry.attributes.position.needsUpdate = true; this.trailPts.geometry.attributes.aA.needsUpdate = true;
      this.ball.visible = true;
    }
    this.flash[0] *= Math.exp(-dt / 0.25); this.flash[1] *= Math.exp(-dt / 0.25);
    this.floor.material.uniforms.uFlash.value.set(this.flash[0], this.flash[1], 0, 0);
    for (const r of this.rings) { if (!r.visible) continue; r.t += dt; const u = r.t / 0.5; if (u >= 1) { r.visible = false; continue; } const s = 0.03 + 0.22 * u; r.scale.set(s, s, s); r.material.opacity = (1 - u) * (1 - u); }
    // traffic
    const tN = this.tN, P = this.tP, A_ = this.tA, Ss = this.tS, E = this.tE, T = this.tT, D = this.tD;
    for (let i = 0; i < tN; i++) {
      if (T[i] >= 1) { if (A_[i] !== 0) A_[i] = 0; continue; }
      T[i] = Math.min(1, T[i] + dt / D[i]); const t = T[i], a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      const sx = Ss[i * 3], sy = Ss[i * 3 + 1], sz = Ss[i * 3 + 2], ex = E[i * 3], ey = E[i * 3 + 1], ez = E[i * 3 + 2];
      P[i * 3] = a * sx + b * (sx + ex) / 2 + c * ex; P[i * 3 + 1] = a * sy + b * ((sy + ey) / 2 + 0.1) + c * ey; P[i * 3 + 2] = a * sz + b * ((sz + ez) / 2 + 0.25) + c * ez;
      A_[i] = Math.sin(Math.PI * t) * 0.9;
    }
    this.tGeo.attributes.position.needsUpdate = true; this.tGeo.attributes.aA.needsUpdate = true; this.tGeo.attributes.aC.needsUpdate = true;
    this.uPts.uScale.value = this.H * this.pr / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.composer.render();
  }
}
