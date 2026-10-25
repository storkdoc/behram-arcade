/* NEURO STORM: WebGL2 renderer (three.js r169, vendored). HDR + 4x MSAA + bloom. */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { hemiMesh, cerebellumMesh, stemMesh, HEMI_CX } from './brain.js';
import { PHYS, relEnd } from './sim.js';

const TW = 64;
const STATE_GLSL = /* glsl */`
#define HEMI_CX 0.56
uniform sampler2D uState;
vec4 stateOf(float idx) { int i = int(idx + 0.5); return texelFetch(uState, ivec2(i % ${TW}, i / ${TW}), 0); }
`;

const callCtrl = (a, b) => [0, 0.02, (a[2] + b[2]) * 0.32];
export class Render3D {
  constructor(canvas, net, cam) {
    this.kind = '3d'; this.net = net; this.cam = cam; this.canvas = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false, depth: true });
    if (!r.capabilities.isWebGL2) throw new Error('WebGL2 required');
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.setClearColor(0x03050b, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50);
    this.pr = Math.min(window.devicePixelRatio || 1, 3);
    this.clip = { value: 99 }; this.lobeMix = { value: 0 };
    this.buildBackdrop(); this.buildBrain(); this.buildNeurons(); this.buildLines(); this.buildPulses(); this.buildFx();
    this.composer = null; this.resize(window.innerWidth, window.innerHeight);
  }
  // ---------------------------------------------------------------- scene
  buildBackdrop() {
    const g = new THREE.SphereGeometry(30, 32, 16);
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: {},
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ float y = vP.y*0.5+0.5; vec3 c = mix(vec3(0.006,0.008,0.02), vec3(0.018,0.026,0.06), smoothstep(0.0,1.0,y));
        c += vec3(0.02,0.012,0.04) * pow(max(0.0, 1.0 - abs(vP.y)), 6.0); gl_FragColor = vec4(c,1.0); }` });
    this.scene.add(new THREE.Mesh(g, m));
  }
  buildBrain() {
    const mk = (d, tint, strength, side = 0) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(d.verts, 3)); g.setIndex(d.idx); g.computeVertexNormals();
      g.setAttribute('aSulc', new THREE.BufferAttribute(d.sulc || new Float32Array(d.verts.length / 3), 1));
      g.setAttribute('aLobe', new THREE.BufferAttribute(d.lobe || new Float32Array(d.verts.length / 3).fill(-1), 1));
      // dark translucent body: gives the brain mass against the backdrop
      const body = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.FrontSide, uniforms: { uClip: this.clip },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vZ = position.z; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform float uClip; varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ if (vZ > uClip) discard; float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(0.004,0.006,0.016, 0.42*f); }` }));
      body.renderOrder = -2; this.scene.add(body);
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
        uniforms: { uTint: { value: new THREE.Color(...tint) }, uStr: { value: strength }, uSide: { value: side }, uClip: this.clip, uLobe: this.lobeMix },
        vertexShader: `attribute float aSulc; attribute float aLobe; uniform float uSide; varying vec3 vN; varying vec3 vV; varying float vS; varying float vMed; varying float vZ; varying vec3 vL;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vS = aSulc; vZ = position.z;
            vL = aLobe < -0.5 ? vec3(0.0) : aLobe < 0.5 ? vec3(0.25,0.45,1.0) : aLobe < 1.5 ? vec3(0.3,0.95,0.55) : aLobe < 2.5 ? vec3(1.0,0.7,0.25) : vec3(0.75,0.4,1.0);
            vMed = uSide == 0.0 ? 0.0 : smoothstep(0.15, 0.75, -normal.x * uSide); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uTint; uniform float uStr; uniform float uClip; uniform float uLobe; varying vec3 vN; varying vec3 vV; varying float vS; varying float vMed; varying float vZ; varying vec3 vL;
          void main(){ if (vZ > uClip) discard; vec3 n = normalize(vN); float ndv = abs(dot(n, normalize(vV))); float f = 1.0 - ndv; float rim = pow(f, 3.0) * (1.0 - 0.8*vMed);
            float key = max(0.0, dot(n, normalize(vec3(-0.35,0.75,0.55)))); float fill = max(0.0, dot(n, normalize(vec3(0.6,-0.2,-0.4))));
            float sul = smoothstep(0.2, 0.9, vS) * (0.35 + 0.65*ndv) * (1.0 - 0.6*vMed);
            vec3 tint = mix(uTint, vL * 0.8, uLobe * step(0.01, dot(vL, vL)));
            vec3 c = tint * (0.025 + 0.4*rim + 0.07*key*key + 0.025*fill) + vec3(0.42,0.5,1.0) * sul * 0.42 + vL * uLobe * 0.05;
            gl_FragColor = vec4(c*uStr, 1.0); }` });
      const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -1; this.scene.add(mesh); mesh.body = body; return mesh;
    };
    // opaque inner core (white matter): occludes the far side so the near cortex reads clearly
    const core = side => {
      const d = hemiMesh(side, 128, 80), v = d.verts.slice(), cx = side * HEMI_CX;
      for (let i = 0; i < v.length; i += 3) { v[i] = cx + (v[i] - cx) * 0.8; v[i + 1] = 0.08 + (v[i + 1] - 0.08) * 0.8; v[i + 2] *= 0.8; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v, 3)); g.setIndex(d.idx); g.computeVertexNormals();
      const m = new THREE.ShaderMaterial({ side: THREE.FrontSide,
        vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(0.010,0.013,0.032) + vec3(0.03,0.04,0.11)*pow(f,2.0), 1.0); }` });
      const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -3; this.scene.add(mesh); return mesh;
    };
    void core;
    this.hemiL = mk(hemiMesh(-1), [0.34, 0.44, 0.9], 0.6, -1);
    this.hemiR = mk(hemiMesh(1), [0.34, 0.44, 0.9], 0.6, 1);
    this.cereb = mk(cerebellumMesh(), [0.38, 0.32, 0.8], 0.36);
    this.stem = mk(stemMesh(), [0.3, 0.3, 0.7], 0.28);
  }
  buildNeurons() {
    const net = this.net, N = net.N, H = Math.ceil(N / TW);
    this.stateData = new Float32Array(TW * H * 4);
    const tex = this.stateTex = new THREE.DataTexture(this.stateData, TW, H, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(net.pos, 3));
    const idx = new Float32Array(N), typ = new Float32Array(N);
    for (let i = 0; i < N; i++) { idx[i] = i; typ[i] = net.type[i]; }
    g.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1)); g.setAttribute('aType', new THREE.BufferAttribute(typ, 1));
    this.uni = { uState: { value: tex }, uScale: { value: 500 }, uPR: { value: 1 }, uSize: { value: 0.03 * Math.pow(4000 / net.N, 0.3) }, uRelE: { value: relEnd(PHYS.E) }, uRelI: { value: relEnd(PHYS.I) }, uSel: { value: -1 }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: this.uni,
      vertexShader: STATE_GLSL + /* glsl */`
        uniform float uScale, uPR, uSize, uRelE, uRelI, uSel, uTime;
        attribute float aIdx; attribute float aType;
        varying vec3 vCol; varying float vCore; varying float vHalo;
        void main(){
          vec4 s = stateOf(aIdx); float V = s.x, flash = s.y, since = s.z;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 hc = vec3(position.x < 0.0 ? -HEMI_CX : HEMI_CX, 0.08, 0.0);
          float facing = dot(normalize(position - hc), normalize(cameraPosition - position));
          float depthFade = clamp(1.25 - (-mv.z - 3.2) * 0.32, 0.35, 1.15) * mix(0.3, 1.0, smoothstep(-0.35, 0.25, facing));
          vec3 base = aType > 0.5 ? vec3(1.0, 0.24, 0.82) : vec3(0.18, 0.78, 1.0);
          float dep = smoothstep(-70.0, -54.0, V);          // EPSP / approaching threshold
          float hyp = smoothstep(-70.5, -79.0, V);          // IPSP / AHP
          float relW = aType > 0.5 ? uRelI : uRelE;
          float refr = (since >= 0.0 && since < relW) ? (1.0 - since / relW) : 0.0;
          vec3 c = base * (0.42 + 1.2 * dep);
          c = mix(c, vec3(0.22, 0.26, 0.95) * 0.32, hyp * 0.85);              // hyperpolarised: deep blue, dim
          c += vec3(1.0, 0.45, 0.12) * refr * 0.45 * (1.0 - flash);           // refractory ember
          vec3 hot = aType > 0.5 ? vec3(1.0, 0.75, 0.97) : vec3(0.85, 0.97, 1.0);
          c = mix(c, hot * 5.0, flash);                                        // spike flash (HDR -> bloom)
          bool sel = abs(aIdx - uSel) < 0.5;
          if (sel) c += vec3(0.6, 0.6, 0.6) * (0.6 + 0.4 * sin(uTime * 5.0));
          vCol = c * depthFade; vCore = 0.55 + 0.45 * flash; vHalo = 0.25 + 0.75 * flash;
          float sz = uSize * (1.0 + 1.3 * flash + 0.35 * dep + (sel ? 1.2 : 0.0));
          gl_PointSize = max(2.0 * uPR, sz * uScale / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vCore; varying float vHalo;
        void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p); if (r2 > 1.0) discard;
          float core = smoothstep(0.30, 0.0, r2) ; float halo = exp(-r2 * 5.0) * vHalo;
          float a = core * vCore + halo * 0.6;
          gl_FragColor = vec4(vCol * a, 1.0); }` });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.scene.add(this.points);
  }
  buildLines() {
    const net = this.net, N = net.N, pos = net.pos, segs = [];
    this.drawn = new Array(N);
    for (let i = 0; i < N; i++) {
      const s = net.oStart[i], e = net.oStart[i + 1], cand = [];
      for (let k = s; k < e; k++) { const j = net.oPost[k]; const d = (pos[j * 3] - pos[i * 3]) ** 2 + (pos[j * 3 + 1] - pos[i * 3 + 1]) ** 2 + (pos[j * 3 + 2] - pos[i * 3 + 2]) ** 2; cand.push([d, k]); }
      cand.sort((a, b) => a[0] - b[0]);
      const pick = []; for (let q = 0; q < cand.length && pick.length < 2; q++) pick.push(cand[q][1]);
      // one longer "axon collateral" for the network look
      if (cand.length > 6) pick.push(cand[Math.floor(cand.length * (0.55 + 0.4 * ((i * 2654435761 >>> 0) % 1000) / 1000))][1]);
      // callosal fibre (drawn for a subset so the corpus callosum reads as a bundle, not a wall)
      let call = -1; for (let k = s; k < e; k++) if (net.hemi[net.oPost[k]] !== net.hemi[i]) { call = k; break; }
      this.drawn[i] = pick.slice();
      if (call >= 0) { this.drawn[i].push(call); if (i % 7 === 0) pick.push(call); }
      for (const k of pick) segs.push(i, net.oPost[k]);
    }
    // straight segments within a hemisphere; callosal fibres arc down through the corpus callosum
    const P = [], A = [], T = [], Y = [];
    const bez = (a, b, c, u, o) => { for (let d = 0; d < 3; d++) o[d] = (1 - u) * (1 - u) * a[d] + 2 * u * (1 - u) * c[d] + u * u * b[d]; return o; };
    const pa = [0, 0, 0], pb = [0, 0, 0], q0 = [0, 0, 0], q1 = [0, 0, 0];
    for (let q = 0; q < segs.length; q += 2) {
      const a = segs[q], b = segs[q + 1], ty = net.type[a];
      for (let d = 0; d < 3; d++) { pa[d] = pos[a * 3 + d]; pb[d] = pos[b * 3 + d]; }
      if (net.hemi[a] === net.hemi[b]) { P.push(...pa, ...pb); A.push(a, a); T.push(0, 1); Y.push(ty, ty); continue; }
      const c = callCtrl(pa, pb), n = 8;
      for (let k = 0; k < n; k++) { bez(pa, pb, c, k / n, q0); bez(pa, pb, c, (k + 1) / n, q1); P.push(...q0, ...q1); A.push(a, a); T.push(k / n, (k + 1) / n); Y.push(ty, ty); }
    }
    const M = A.length / 2;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); void M;
    g.setAttribute('aPre', new THREE.BufferAttribute(new Float32Array(A), 1)); g.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(T), 1)); g.setAttribute('aType', new THREE.BufferAttribute(new Float32Array(Y), 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uState: this.uni.uState, uBase: { value: 0.07 } },
      vertexShader: STATE_GLSL + `attribute float aPre; attribute float aEnd; attribute float aType; uniform float uBase; varying vec3 vC;
        void main(){ vec4 s = stateOf(aPre); vec4 mv = modelViewMatrix*vec4(position,1.0);
          vec3 base = aType > 0.5 ? vec3(0.8,0.25,0.75) : vec3(0.25,0.55,0.9);
          vec3 hc = vec3(position.x < 0.0 ? -HEMI_CX : HEMI_CX, 0.08, 0.0);
          float fade = clamp(1.2 - (-mv.z - 3.2) * 0.3, 0.3, 1.1) * mix(0.25, 1.0, smoothstep(-0.35, 0.25, dot(normalize(position - hc), normalize(cameraPosition - position))));
          vC = base * (uBase + 0.9 * s.y * (1.0 - 0.6*aEnd)) * fade; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC,1.0); }` });
    this.lines = new THREE.LineSegments(g, m); this.lines.frustumCulled = false; this.scene.add(this.lines);
    // selected-neuron connections
    this.selGeo = new THREE.BufferGeometry();
    this.selLines = new THREE.LineSegments(this.selGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vC; void main(){ gl_FragColor = vec4(vC,1.0); }` }));
    this.selLines.frustumCulled = false; this.scene.add(this.selLines);
  }
  setSelected(i) {
    const net = this.net, pos = net.pos; this.uni.uSel.value = i == null ? -1 : i;
    if (i == null) { this.selGeo.setDrawRange(0, 0); return; }
    const P = [], C = [];
    const outC = net.type[i] ? [0.9, 0.25, 0.8] : [0.3, 0.75, 1.0];
    for (let k = net.oStart[i]; k < net.oStart[i + 1]; k++) { const j = net.oPost[k]; P.push(...pos.subarray(i * 3, i * 3 + 3), ...pos.subarray(j * 3, j * 3 + 3)); C.push(...outC.map(v => v * 0.55), ...outC.map(v => v * 0.12)); }
    // inputs (search CSR for synapses onto i)
    for (let p = 0; p < net.N; p++) for (let k = net.oStart[p]; k < net.oStart[p + 1]; k++) if (net.oPost[k] === i) {
      const c = net.type[p] ? [0.9, 0.25, 0.8] : [0.3, 0.75, 1.0];
      P.push(...pos.subarray(p * 3, p * 3 + 3), ...pos.subarray(i * 3, i * 3 + 3)); C.push(...c.map(v => v * 0.06), ...c.map(v => v * 0.3));
    }
    this.selGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    this.selGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3));
    this.selGeo.setDrawRange(0, P.length / 3);
  }
  buildPulses() {
    const CAP = this.pCap = 12000;
    const g = new THREE.BufferGeometry();
    this.pA = new Float32Array(CAP * 3); this.pB = new Float32Array(CAP * 3); this.pT = new Float32Array(CAP * 2).fill(-1e9); this.pK = new Float32Array(CAP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pA, 3)); g.setAttribute('aB', new THREE.BufferAttribute(this.pB, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(this.pT, 2)); g.setAttribute('aK', new THREE.BufferAttribute(this.pK, 1));
    for (const k of ['position', 'aB', 'aT', 'aK']) g.getAttribute(k).setUsage(THREE.DynamicDrawUsage);
    this.pHead = 0; this.pGeo = g;
    this.pUni = { uSim: { value: 0 }, uScale: this.uni.uScale, uPR: this.uni.uPR };
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.pUni,
      vertexShader: `#define CALL_Y 0.02
#define CALL_Z 0.32
uniform float uSim, uScale, uPR; attribute vec3 aB; attribute vec2 aT; attribute float aK; varying vec3 vC; varying float vA;
        void main(){ float u = (uSim - aT.x) / max(0.001, aT.y - aT.x);
          if (u < 0.0 || u > 1.15) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          float uc = clamp(u, 0.0, 1.0); vec3 p = mix(position, aB, uc);
          if (position.x * aB.x < 0.0) { vec3 c = vec3(0.0, CALL_Y, (position.z + aB.z) * CALL_Z); p = (1.0-uc)*(1.0-uc)*position + 2.0*uc*(1.0-uc)*c + uc*uc*aB; }
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          vA = u > 1.0 ? (1.15 - u) / 0.15 : smoothstep(0.0, 0.12, u);
          vC = aK > 0.5 ? vec3(1.6, 0.35, 1.3) : vec3(0.9, 1.5, 1.9);
          gl_PointSize = max(1.5*uPR, 0.022 * uScale / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r2 = dot(p,p); if (r2>1.0) discard; gl_FragColor = vec4(vC * vA * exp(-r2*3.5), 1.0); }` });
    this.pulsePts = new THREE.Points(g, m); this.pulsePts.frustumCulled = false; this.scene.add(this.pulsePts);
    this.pDirty = false;
  }
  addPulse(a, b, t0, t1, kind) {
    const h = this.pHead, pos = this.net.pos; this.pHead = (h + 1) % this.pCap;
    this.pA[h * 3] = pos[a * 3]; this.pA[h * 3 + 1] = pos[a * 3 + 1]; this.pA[h * 3 + 2] = pos[a * 3 + 2];
    this.pB[h * 3] = pos[b * 3]; this.pB[h * 3 + 1] = pos[b * 3 + 1]; this.pB[h * 3 + 2] = pos[b * 3 + 2];
    this.pT[h * 2] = t0; this.pT[h * 2 + 1] = t1; this.pK[h] = kind; this.pDirty = true;
  }
  clearPulses() { this.pT.fill(-1e9); this.pDirty = true; this.ripples.forEach(r => (r.mesh.visible = false)); }
  buildFx() {
    // stimulus ripples: camera-facing expanding rings
    this.ripples = [];
    const g = new THREE.PlaneGeometry(1, 1);
    for (let k = 0; k < 8; k++) {
      const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(1, 0.85, 0.4) } },
        vertexShader: `varying vec2 vU; void main(){ vU = uv*2.0-1.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform float uA; uniform vec3 uC; varying vec2 vU; void main(){ float r = length(vU); float ring = exp(-pow((r-0.82)/0.06,2.0)) + 0.35*exp(-pow((r-0.55)/0.05,2.0)); gl_FragColor = vec4(uC*ring*uA*2.0,1.0); }` });
      const mesh = new THREE.Mesh(g, m); mesh.visible = false; this.scene.add(mesh); this.ripples.push({ mesh, t: 1e9 });
    }
    this.rIdx = 0;
  }
  ripple(i, color) {
    const r = this.ripples[this.rIdx++ % this.ripples.length]; const p = this.net.pos;
    r.mesh.position.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); r.t = 0; r.mesh.visible = true;
    r.mesh.material.uniforms.uC.value.set(color || 0xffd36a);
  }
  // ---------------------------------------------------------------- frame
  resize(w, h) {
    this.w = w; this.h = h;
    this.r.setPixelRatio(this.pr); this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    const sz = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: 4 });
    if (this.composer) this.composer.dispose();
    this.composer = new EffectComposer(this.r, rt);
    this.composer.setPixelRatio(this.pr); this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.55, 0.42);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.uni.uPR.value = this.pr;
  }
  setPixelRatio(pr) { if (Math.abs(pr - this.pr) < 0.01) return; this.pr = pr; this.resize(this.w, this.h); }
  updateState(V, flash, since) {
    const d = this.stateData, N = this.net.N;
    for (let i = 0; i < N; i++) { d[i * 4] = V[i]; d[i * 4 + 1] = flash[i]; d[i * 4 + 2] = since[i]; }
    this.stateTex.needsUpdate = true;
  }
  render(view, simT, realT, dtReal) {
    const c = this.camera; this.cam.apply(c, this.w, this.h, view);
    this.uni.uScale.value = this.h * this.pr / (2 * Math.tan(c.fov * Math.PI / 360));
    this.uni.uTime.value = realT; this.pUni.uSim.value = simT;
    if (this.pDirty) { for (const k of ['position', 'aB', 'aT', 'aK']) this.pGeo.getAttribute(k).needsUpdate = true; this.pDirty = false; }
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue; r.t += dtReal; const u = r.t / 0.9;
      if (u >= 1) { r.mesh.visible = false; continue; }
      const s = 0.05 + 0.5 * Math.pow(u, 0.6); r.mesh.scale.set(s, s, s); r.mesh.quaternion.copy(c.quaternion); r.mesh.material.uniforms.uA.value = (1 - u) * (1 - u);
    }
    this.composer.render();
  }
  project(out) { // screen coords (css px) and depth for picking
    const c = this.camera, pos = this.net.pos, N = this.net.N, m = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).elements;
    for (let i = 0; i < N; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      out[i * 3] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.w;
      out[i * 3 + 1] = (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5)) * this.h;
      out[i * 3 + 2] = w;
    }
  }
}
