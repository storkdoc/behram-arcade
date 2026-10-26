/* ==========================================================================
   TANK DUEL — render.js   (three.js r169, vendored)
   Slightly tilted top-down camera over a PBR arena: procedural ground with
   track marks and scorch decals, beveled concrete blocks, destructible brick,
   sliding steel blocks, detailed tanks (scrolling treads, recoiling barrel,
   swaying antenna), soft shadows, billboard smoke/fire/sparks, debris,
   shockwaves, headlights, rain/snow, night fog-of-war, screen shake.
   Post: HDR bloom + FXAA through an EffectComposer whose offscreen targets
   have NO MSAA (MSAA on offscreen bloom targets draws black rectangles on
   Mac Safari/Chrome). ?msaa=1 opts into canvas MSAA for the no-post tiers.
   A pixel read-back self-check steps effects down if black holes appear.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/postprocessing/ShaderPass.js';
import * as TX from './textures.js';

const S = window.TDSim;
const CX = S.COLS / 2, CY = S.ROWS / 2;
const W = (x, y, h = 0, out = new THREE.Vector3()) => out.set(x - CX, h, y - CY);
const TEAM = [new THREE.Color('#62ff7a'), new THREE.Color('#ffa336')];
const TEAMHEX = ['#62ff7a', '#ffa336'];
const TAIL = '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

const FXAA = { uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) } }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
  float lu(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  void main(){ vec2 px = 1.0 / res; vec3 m = texture2D(tDiffuse, vUv).rgb;
    float lM = lu(m), lNW = lu(texture2D(tDiffuse, vUv + vec2(-1.,-1.)*px).rgb), lNE = lu(texture2D(tDiffuse, vUv + vec2(1.,-1.)*px).rgb), lSW = lu(texture2D(tDiffuse, vUv + vec2(-1.,1.)*px).rgb), lSE = lu(texture2D(tDiffuse, vUv + vec2(1.,1.)*px).rgb);
    float mn = min(lM, min(min(lNW, lNE), min(lSW, lSE))), mx = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    if (mx - mn < max(0.0312, mx * 0.125)) { gl_FragColor = vec4(m, 1.0); return; }
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
    float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0/128.0); float rc = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
    dir = clamp(dir * rc, vec2(-8.0), vec2(8.0)) * px;
    vec3 a = 0.5 * (texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
    vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv + dir * -0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
    float lb = lu(b); gl_FragColor = vec4((lb < mn || lb > mx) ? a : b, 1.0); }` };
const GRADE = { uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 }, flash: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) } }, vertexShader: FXAA.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig, flash; uniform vec3 tint; varying vec2 vUv;
  void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * tint; vec2 d = vUv - 0.5; float v = 1.0 - vig * dot(d, d) * 2.2; c *= v; c = mix(c, vec3(1.0), flash); gl_FragColor = vec4(c, 1.0); }` };

/* ---------- billboard particles (instanced quads: no point-size limits) ---------- */
const BB_VS = `attribute vec3 iPos; attribute vec4 iCol; attribute float iSize; attribute float iRot; attribute vec3 iVel;
varying vec2 vUv; varying vec4 vCol;
void main(){ vUv = uv; vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos, 1.0); vec2 c = position.xy;
  if (dot(iVel, iVel) > 0.0) { vec3 v2 = (modelViewMatrix * vec4(iPos + iVel, 1.0)).xyz - mv.xyz; float L = length(v2.xy); vec2 d = L > 1e-5 ? v2.xy / L : vec2(1.0, 0.0); vec2 n = vec2(-d.y, d.x); mv.xy += d * c.x * (iSize + L) + n * c.y * iSize * 0.4; }
  else { float s = sin(iRot), co = cos(iRot); mv.xy += vec2(co * c.x - s * c.y, s * c.x + co * c.y) * iSize; }
  gl_Position = projectionMatrix * mv; }`;
const SMOKE_FS = `uniform sampler2D map; uniform vec3 light; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb * light, t.a * vCol.a); if (gl_FragColor.a < 0.004) discard;` + TAIL + `}`;
const ADD_FS = `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ float a = texture2D(map, vUv).a * vCol.a; gl_FragColor = vec4(vCol.rgb * a, a);` + TAIL + `}`;
class Particles {
  constructor(max, mat) {
    this.max = max; this.p = [];
    const g = new THREE.InstancedBufferGeometry(); const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.attrs = [this.aPos, this.aCol, this.aSize, this.aRot, this.aVel];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0; this.geo = g;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false;
  }
  add(o) {
    if (this.p.length >= this.max) this.p.shift();
    o.age = 0; if (o.size1 == null) o.size1 = o.size; o.drag = o.drag || 0; o.grav = o.grav || 0; if (o.rot == null) o.rot = Math.random() * 6.28; o.vr = o.vr || 0; if (o.a == null) o.a = 1;
    this.p.push(o); return o;
  }
  update(dt) {
    const P = this.p; let w = 0;
    const pos = this.aPos.array, col = this.aCol.array, sz = this.aSize.array, rot = this.aRot.array, vel = this.aVel.array;
    for (let i = 0; i < P.length; i++) {
      const o = P[i]; o.age += dt; if (o.age >= o.life) continue;
      const k = Math.pow(1 - Math.min(0.99, o.drag), dt * 60); o.vx *= k; o.vy *= k; o.vz *= k; o.vy -= o.grav * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rot += o.vr * dt;
      if (o.y < 0.02 && o.grav) { o.y = 0.02; o.vy *= -0.3; o.vx *= 0.6; o.vz *= 0.6; }
      const u = o.age / o.life, fade = o.fade === 'in' ? Math.sin(u * Math.PI) : o.fade === 'late' ? (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4) : 1 - u;
      const j = w; P[w++] = o;
      pos[j * 3] = o.x; pos[j * 3 + 1] = o.y; pos[j * 3 + 2] = o.z;
      col[j * 4] = o.r1 != null ? o.r + (o.r1 - o.r) * u : o.r; col[j * 4 + 1] = o.g1 != null ? o.g + (o.g1 - o.g) * u : o.g; col[j * 4 + 2] = o.b1 != null ? o.b + (o.b1 - o.b) * u : o.b; col[j * 4 + 3] = o.a * fade;
      sz[j] = o.size + (o.size1 - o.size) * Math.sqrt(u); rot[j] = o.rot;
      const st = o.streak || 0; vel[j * 3] = o.vx * st; vel[j * 3 + 1] = o.vy * st; vel[j * 3 + 2] = o.vz * st;
    }
    P.length = w; this.geo.instanceCount = w;
    for (const a of this.attrs) a.needsUpdate = true;
  }
  clear() { this.p.length = 0; this.geo.instanceCount = 0; }
}

/* ---------- geometry helpers ---------- */
function bevelBox(w, h, d, r = 0.06) {
  const sh = new THREE.Shape(), x0 = -w / 2 + r, y0 = -d / 2 + r, x1 = w / 2 - r, y1 = d / 2 - r, c = 0.02;
  sh.moveTo(x0 + c, y0); sh.lineTo(x1 - c, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + c); sh.lineTo(x1, y1 - c); sh.quadraticCurveTo(x1, y1, x1 - c, y1); sh.lineTo(x0 + c, y1); sh.quadraticCurveTo(x0, y1, x0, y1 - c); sh.lineTo(x0, y0 + c); sh.quadraticCurveTo(x0, y0, x0 + c, y0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.01, h - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2 });
  g.rotateX(-Math.PI / 2); g.translate(0, r, 0); g.computeVertexNormals(); return g;
}
function extrudeTop(pts, h, bevel = 0.025) {
  const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], -p[1]) : sh.moveTo(p[0], -p[1]));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0); g.computeVertexNormals(); return g;
}

/* ---------- the tank model ---------- */
function buildTank(team, shared) {
  const G = new THREE.Group(), mats = [];
  const M = (o) => { const m = new THREE.MeshStandardMaterial(o); mats.push(m); return m; };
  const camoM = M({ map: shared.camo[team], normalMap: shared.panel, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.62, metalness: 0.38 });
  const darkM = M({ color: 0x2b2d2c, roughness: 0.45, metalness: 0.75 });
  const rubberM = M({ color: 0x1a1a19, roughness: 0.9, metalness: 0.1 });
  const treadL = M({ map: shared.tread.clone(), roughness: 0.85, metalness: 0.35 }), treadR = M({ map: shared.tread.clone(), roughness: 0.85, metalness: 0.35 });
  for (const t of [treadL.map, treadR.map]) { t.repeat.set(2, 1); t.needsUpdate = true; }
  const stripeM = M({ color: TEAM[team], emissive: TEAM[team], emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.1 });
  const lightM = M({ color: 0xfff3d0, emissive: 0xfff0c0, emissiveIntensity: 2.2 });
  const add = (geo, mat, x, y, z, shadow = true, parent = G) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m; };
  const tg = new THREE.BoxGeometry(1.0, 0.24, 0.2);
  add(tg, treadL, 0, 0.12, -0.35); add(tg, treadR, 0, 0.12, 0.35);
  const wg = new THREE.CylinderGeometry(0.085, 0.085, 0.215, 14); wg.rotateX(Math.PI / 2);
  for (const z of [-0.35, 0.35]) for (let i = 0; i < 5; i++) add(wg, darkM, -0.36 + i * 0.18, 0.1, z, false);
  const fg = new THREE.BoxGeometry(1.04, 0.035, 0.23);
  add(fg, camoM, 0.0, 0.26, -0.35); add(fg, camoM, 0.0, 0.26, 0.35);
  add(new THREE.BoxGeometry(0.86, 0.16, 0.5), darkM, 0, 0.15, 0);
  add(extrudeTop([[-0.48, -0.3], [0.3, -0.3], [0.5, -0.17], [0.5, 0.17], [0.3, 0.3], [-0.48, 0.3]], 0.13), camoM, 0, 0.2, 0);
  add(new THREE.BoxGeometry(0.2, 0.02, 0.34), darkM, -0.34, 0.335, 0, false);
  for (const z of [-0.16, 0.16]) add(new THREE.CylinderGeometry(0.03, 0.035, 0.08, 10).rotateZ(Math.PI / 2), darkM, -0.52, 0.27, z, false);
  add(new THREE.BoxGeometry(0.16, 0.06, 0.08), camoM, 0.1, 0.355, 0.24); add(new THREE.BoxGeometry(0.22, 0.05, 0.07), darkM, -0.2, 0.355, -0.25);
  const hl = new THREE.BoxGeometry(0.04, 0.04, 0.06);
  add(hl, lightM, 0.5, 0.29, -0.2, false); add(hl, lightM, 0.5, 0.29, 0.2, false);
  const T = new THREE.Group(); T.position.set(-0.04, 0.33, 0); G.add(T);
  add(extrudeTop([[-0.26, -0.15], [-0.12, -0.22], [0.12, -0.21], [0.24, -0.1], [0.24, 0.1], [0.12, 0.21], [-0.12, 0.22], [-0.26, 0.15]], 0.15, 0.03), camoM, 0, 0, 0, true, T);
  add(new THREE.BoxGeometry(0.4, 0.025, 0.44), stripeM, -0.01, 0.06, 0, false, T);
  add(new THREE.CylinderGeometry(0.075, 0.08, 0.06, 14), camoM, -0.1, 0.18, -0.08, true, T);
  add(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 14), darkM, -0.1, 0.215, -0.08, false, T);
  add(new THREE.BoxGeometry(0.1, 0.03, 0.1), darkM, 0.02, 0.165, 0.09, false, T);
  const chev = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ map: shared.chev[team], transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
  mats.push(chev.material); chev.rotation.x = -Math.PI / 2; chev.position.set(0.1, 0.152, -0.02); T.add(chev);
  add(new THREE.BoxGeometry(0.08, 0.1, 0.17), darkM, 0.25, 0.075, 0, true, T);
  const B = new THREE.Group(); B.position.set(0.27, 0.075, 0); T.add(B);
  const bg = new THREE.CylinderGeometry(0.032, 0.04, 0.58, 14); bg.rotateZ(-Math.PI / 2); add(bg, darkM, 0.29, 0, 0, true, B);
  const fe = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 14); fe.rotateZ(-Math.PI / 2); add(fe, darkM, 0.3, 0, 0, true, B);
  const mb = new THREE.CylinderGeometry(0.052, 0.048, 0.08, 10); mb.rotateZ(-Math.PI / 2); add(mb, darkM, 0.6, 0, 0, true, B);
  const ant = new THREE.Group(); ant.position.set(-0.2, 0.15, 0.12); T.add(ant);
  add(new THREE.CylinderGeometry(0.006, 0.008, 0.55, 5), rubberM, 0, 0.27, 0, false, ant);
  add(new THREE.SphereGeometry(0.018, 8, 6), stripeM, 0, 0.55, 0, false, ant);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.72, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.4), transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  shield.scale.y = 0.6; shield.position.y = 0.2; shield.visible = false; G.add(shield); mats.push(shield.material);
  G.traverse(o => { if (o.isMesh) o.userData.baseShadow = o.castShadow; });
  for (const m of mats) { m.userData.baseOp = m.opacity; m.userData.baseTr = m.transparent; }
  return { G, T, B, ant, treadL, treadR, stripeM, lightM, mats, shield, recoil: 0, antV: 0, antA: 0, opacity: 1, team, wasTr: false };
}

/* ========================================================================== */
export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts; this.msaa = !!opts.msaa;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, alpha: false, stencil: false, powerPreference: 'high-performance' });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; opts.onLost && opts.onLost(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; opts.onRestored && opts.onRestored(); }, false);
    { // post FX needs a renderable half-float target (bloom uses HalfFloat internally). Without it: no composer -> never black
      const gl = this.r.getContext(); this.hfOK = !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float'));
      if (!this.hfOK) console.info('[tank-duel] no half-float color buffers; post effects off'); }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
    // phones/tablets (incl. iPadOS, which reports as Mac) start one tier lower with a smaller pixel budget
    this.mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    this.phone = this.mobile && Math.min(screen.width, screen.height) < 600;
    this.tier = opts.q != null ? +opts.q : (this.mobile ? 2 : 3); this.maxTier = 3;
    if (!this.hfOK) { this.maxTier = 1; this.tier = Math.min(this.tier, 1); } this.lockTier = opts.q != null; this.ft = []; this.time = 0; this.lastCheck = 0; this.selfChecks = 0; this.blackHoles = 0; this.lastSelf = null;
    this.shake = 0; this.flash = 0; this.insets = { top: 0, bottom: 0, left: 0, right: 0 }; this.rotated = false; this.viewer = 0; this.ready = false; this.attract = false; this._tmpPts = []; this.fowPts = [];
  }
  async init(progress) {
    const p = f => progress && progress(f), yieldF = () => new Promise(r => setTimeout(r, 0));
    const shared = this.shared = {};
    shared.camo = [TX.camo(0), TX.camo(1)]; shared.panel = TX.panelNormal(); shared.tread = TX.tread(); shared.chev = [TX.chevron(TEAMHEX[0]), TX.chevron(TEAMHEX[1])]; p(0.2); await yieldF();
    this.concrete = TX.concrete(); this.brickT = TX.brick(); this.steelT = TX.steel(); p(0.4); await yieldF();
    TX.ground('desert'); p(0.6); await yieldF();
    this.smokeT = TX.smoke(); this.glowT = TX.glow(); this.ringT = TX.ring(); this.hillT = TX.hillTex();
    this.puT = {}; for (const t of S.PU_TYPES) this.puT[t] = TX.puIcon(t);
    // lights: fixed count so shaders never recompile mid-game
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a38, 0.9); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.0); this.sun.position.set(-9, 26, 12); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -19; sc.right = 19; sc.top = 13; sc.bottom = -13; sc.near = 5; sc.far = 60; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);
    this.plights = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffaa55, 0, 9, 1.6); l.userData = { t: 1, life: 1, i0: 0 }; this.plights.push(l); this.scene.add(l); }
    this.spots = []; for (let i = 0; i < 2; i++) { const s = new THREE.SpotLight(0xfff2d6, 0, 15, 0.5, 0.55, 1.1); this.scene.add(s, s.target); this.spots.push(s); }
    this.scene.environment = this.makeEnv(new THREE.Color('#9cc2ff'), new THREE.Color('#e8d3b0'), new THREE.Color('#5a4a3a'));
    p(0.75);
    this.arena = new THREE.Group(); this.scene.add(this.arena);
    this.tanks = [buildTank(0, shared), buildTank(1, shared)]; for (const t of this.tanks) this.scene.add(t.G);
    this.shellGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.26, 10).rotateZ(-Math.PI / 2);
    this.shellM = [new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 6, 3.2) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.4) })];
    this.missGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10).rotateZ(-Math.PI / 2);
    this.megaGeo = new THREE.SphereGeometry(0.16, 16, 12);
    this.shellPool = []; for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(this.shellGeo, this.shellM[0]); m.visible = false; m.castShadow = true; this.scene.add(m); this.shellPool.push(m); }
    const mineGeo = new THREE.CylinderGeometry(0.2, 0.24, 0.07, 16), mineM = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: 0.6, metalness: 0.6 }), led = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.6, 0.4) });
    this.minePool = []; for (let i = 0; i < 10; i++) { const g = new THREE.Group(); const b = new THREE.Mesh(mineGeo, mineM); b.position.y = 0.035; b.castShadow = true; const l = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), led); l.position.y = 0.08; g.add(b, l); g.userData.led = l; g.visible = false; this.scene.add(g); this.minePool.push(g); }
    this.puPool = []; for (let i = 0; i < 3; i++) { const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.4, metalness: 0.8 })); base.position.y = 0.03; base.receiveShadow = true;
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: new THREE.Color(1.5, 1.5, 1.5) })); icon.position.y = 0.6;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 1.0, 16, 1, true), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = 0.5;
      g.add(base, icon, beam); g.userData = { icon, beam }; g.visible = false; this.scene.add(g); this.puPool.push(g); }
    this.smokeMat = new THREE.ShaderMaterial({ uniforms: { map: { value: this.smokeT }, light: { value: new THREE.Color(1, 1, 1) } }, vertexShader: BB_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false });
    this.addMat = new THREE.ShaderMaterial({ uniforms: { map: { value: this.glowT } }, vertexShader: BB_VS, fragmentShader: ADD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.smoke = new Particles(2600, this.smokeMat); this.smoke.mesh.renderOrder = 5;
    this.fire = new Particles(2600, this.addMat); this.fire.mesh.renderOrder = 6;
    this.scene.add(this.smoke.mesh, this.fire.mesh);
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.3 }), 260); this.deb.castShadow = true; this.deb.count = 0; this.deb.frustumCulled = false;
    this.deb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3), 3); this.debris = []; this.scene.add(this.deb);
    this.rings = []; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.ringT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2, 1.5, 1) })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData = { t: 0, life: 1, s: 1 }; this.scene.add(m); this.rings.push(m); }
    this.beams = []; for (let i = 0; i < 2; i++) { const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, 0, 0); const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { k: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float k; varying vec2 vUv; void main(){ float w = abs(vUv.y - 0.5) * 2.0; float cone = smoothstep(0.0, 1.0, 1.0 - w / max(0.08, vUv.x)); float f = cone * smoothstep(0.0, 0.08, vUv.x) * (1.0 - vUv.x); gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * f * k, 1.0);` + TAIL + `}` }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.scale.set(10, 6, 1); m.visible = false; this.scene.add(m); this.beams.push(m); }
    // night fog of war: a dark sheet above the arena; each fragment is projected down to the ground and revealed by what the viewer can see
    this.fowU = { camPos: { value: new THREE.Vector3() }, me: { value: new THREE.Vector4() }, them: { value: new THREE.Vector4() }, pts: { value: Array.from({ length: 12 }, () => new THREE.Vector4()) }, dark: { value: 0.93 }, col: { value: new THREE.Color(0.004, 0.007, 0.018) } };
    this.fow = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.ShaderMaterial({ uniforms: this.fowU, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 camPos; uniform vec4 me, them; uniform vec4 pts[12]; uniform float dark; uniform vec3 col; varying vec3 vW;
      void main(){ float t = (camPos.y - 0.3) / (camPos.y - vW.y); vec2 p = camPos.xz + (vW.xz - camPos.xz) * t;
        vec2 d = p - me.xy; float vis = 1.0 - smoothstep(2.0, 3.4, length(d));
        vec2 f = vec2(cos(me.z), sin(me.z)); float along = dot(d, f); float ang = abs(atan(f.x * d.y - f.y * d.x, along));
        vis = max(vis, me.w * (1.0 - smoothstep(0.32, 0.55, ang)) * (1.0 - smoothstep(9.0, 12.5, along)) * step(0.0, along));
        vec2 d2 = p - them.xy; vec2 f2 = vec2(cos(them.z), sin(them.z)); float al2 = dot(d2, f2); float an2 = abs(atan(f2.x * d2.y - f2.y * d2.x, al2));
        vis = max(vis, them.w * 0.32 * (1.0 - smoothstep(0.3, 0.5, an2)) * (1.0 - smoothstep(6.0, 11.0, al2)) * smoothstep(1.2, 2.2, al2));
        for (int i = 0; i < 12; i++) { vec4 q = pts[i]; if (q.w > 0.0) vis = max(vis, q.w * (1.0 - smoothstep(q.z * 0.45, q.z, length(p - q.xy)))); }
        gl_FragColor = vec4(col, dark * (1.0 - clamp(vis, 0.0, 1.0))); }` }));
    this.fow.rotation.x = -Math.PI / 2; this.fow.position.y = 2.4; this.fow.renderOrder = 20; this.fow.visible = false; this.fow.frustumCulled = false; this.scene.add(this.fow);
    this.rain = this.makeRain(); this.snow = new Particles(1500, this.addMat); this.snow.mesh.visible = false; this.scene.add(this.snow.mesh);
    this.trk = document.createElement('canvas'); this.trk.width = 1024; this.trk.height = 640; this.trkX = this.trk.getContext('2d');
    this.trkTex = new THREE.CanvasTexture(this.trk); this.trkTex.colorSpace = THREE.SRGBColorSpace; this.trkTex.anisotropy = 4; this.trkDirty = false; this.trkT = 0;
    this.setupPost();
    p(1); this.ready = true;
  }
  makeEnv(sky, hor, gnd) {
    const pm = new THREE.PMREMGenerator(this.r), sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { a: { value: sky }, b: { value: hor }, c: { value: gnd } },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 a,b,c; varying vec3 vP; void main(){ vec3 n = normalize(vP); float y = n.y; vec3 col = y > 0.0 ? mix(b, a, pow(y, 0.6)) : mix(b, c, pow(-y, 0.4)); vec3 s = normalize(vec3(-0.4, 0.8, 0.45)); col += vec3(6.0, 5.4, 4.6) * pow(max(dot(n, s), 0.0), 220.0); gl_FragColor = vec4(col, 1.0); }` })));
    const rt = pm.fromScene(sc, 0.02); pm.dispose(); return rt.texture;
  }
  makeRain() {
    const n = 1400, g = new THREE.BufferGeometry(), pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const x = rnd(-20, 20), y = rnd(0, 14), z = rnd(-14, 14); pos.set([x, y, z, x + 0.05, y + 0.5, z + 0.03], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0.55, 0.62, 0.75), transparent: true, opacity: 0.45, depthWrite: false })); m.frustumCulled = false; m.visible = false; this.scene.add(m); return m;
  }
  setupPost() {
    // composer default target: HalfFloat, samples 0. Never MSAA offscreen (black-rectangle bug on Mac Safari/Chrome).
    this.composer = new EffectComposer(this.r);
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.42, 0.88); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE); this.composer.addPass(this.grade);
    this.fxaa = new ShaderPass(FXAA); this.composer.addPass(this.fxaa);
  }
  /** 3 = bloom + FXAA + 2048 shadows (DPR cap 2), 2 = same at ≤1.5x, 1 = no post, direct (MSAA only with ?msaa=1), 0 = also no shadows */
  setTier(t) { t = Math.max(0, Math.min(this.maxTier, t)); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 999; }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = Math.min(devicePixelRatio || 1, 3);
    const cap = this.tier >= 3 ? 2 : this.tier >= 1 ? 1.5 : 1;
    let pr = Math.min(dpr, cap); const maxPx = this.phone ? 2.2e6 : this.mobile ? 3.2e6 : 5.2e6; if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    this.pr = pr; this.W = w; this.H = h;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.fxaa.uniforms.res.value.set(w * pr, h * pr);
    const shadowOn = this.tier >= 1;
    if (this.r.shadowMap.enabled !== shadowOn) { this.r.shadowMap.enabled = shadowOn; this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
    const sm = this.tier >= 3 && !this.phone ? 2048 : this.tier >= 2 ? 1536 : 1024; if (this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.fitCamera(); this._sized = true;
  }
  fitCamera() {
    const w = this.W, h = this.H, I = this.insets;
    this.rotated = h > w * 1.05; // phone portrait: the arena's long axis runs up the screen
    const aw = Math.max(50, w - I.left - I.right), ah = Math.max(50, h - I.top - I.bottom);
    const ex = this.rotated ? 21.2 : 33.2, ey = this.rotated ? 33.2 : 21.2;
    const tanV = Math.tan(this.cam.fov * Math.PI / 360);
    const dV = (ey / 2) / tanV * (h / ah), dH = (ex / 2) / (tanV * w / h) * (w / aw);
    this.dist = Math.max(dV, dH) * 1.05;
    this.cam.aspect = w / h;
    const cx = I.left + aw / 2, cy = I.top + ah / 2;
    this.cam.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    this.cam.updateProjectionMatrix();
  }
  /** screen stick vector (x right, y down) -> sim world vector */
  screenDir(sx, sy) { return this.rotated ? { x: -sy, y: sx } : { x: sx, y: sy }; }
  project(x, y, h) { const v = W(x, y, h).project(this.cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, z: v.z }; }

  /* ---------- per-game arena ---------- */
  build(g, viewer) {
    this.g = g; this.viewer = viewer; const v = g.v;
    for (const c of this.arena.children.slice()) { this.arena.remove(c); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m.map && m.map !== this.trkTex && m.map !== this.hillT) m.map.dispose(); if (m.normalMap) m.normalMap.dispose(); m.dispose(); }); } }); }
    this.theme = v.weather === 'snow' ? 'snow' : v.weather === 'rain' ? 'mud' : (v.map === 'city' || v.map === 'chaos' || v.map === 'yard') ? 'urban' : (v.map === 'hill' || v.map === 'pinball' || v.map === 'portal') ? 'grass' : 'desert';
    const gt = TX.ground(this.theme);
    const gm = (rep, tint) => { const m = gt.map.clone(), n = gt.normal.clone(); m.repeat.set(rep[0], rep[1]); n.repeat.set(rep[0], rep[1]); m.needsUpdate = n.needsUpdate = true;
      return new THREE.MeshStandardMaterial({ map: m, normalMap: n, normalScale: new THREE.Vector2(0.9, 0.9), roughness: v.weather === 'rain' ? 0.32 : gt.rough, metalness: 0, color: tint || 0xffffff }); };
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(S.COLS, S.ROWS), gm([S.COLS / 6, S.ROWS / 6])); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.arena.add(floor); this.floor = floor;
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), gm([140 / 6, 100 / 6], new THREE.Color(0.6, 0.58, 0.56))); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.03; outer.receiveShadow = true; this.arena.add(outer);
    this.trkX.clearRect(0, 0, 1024, 640); this.trkTex.needsUpdate = true;
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(S.COLS, S.ROWS), new THREE.MeshStandardMaterial({ map: this.trkTex, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
    ov.rotation.x = -Math.PI / 2; ov.position.y = 0.006; ov.receiveShadow = true; ov.renderOrder = 1; this.arena.add(ov);
    const wallIdx = [], brickIdx = [];
    for (let i = 0; i < g.tiles.length; i++) { if (g.tiles[i] === S.WALL) wallIdx.push(i); else if (g.tiles[i] === S.BRICK) brickIdx.push(i); }
    const cm = t => { const m = t.map.clone(), n = t.normal.clone(); m.needsUpdate = n.needsUpdate = true; return [m, n]; };
    const [cmap, cnor] = cm(this.concrete);
    const wallM = new THREE.MeshStandardMaterial({ map: cmap, normalMap: cnor, roughness: 0.82, metalness: 0.05, color: this.theme === 'snow' ? 0xe8eef8 : 0xffffff });
    const walls = new THREE.InstancedMesh(bevelBox(0.98, 1.0, 0.98, 0.07), wallM, Math.max(1, wallIdx.length)); walls.castShadow = walls.receiveShadow = true; walls.count = wallIdx.length;
    const M4 = new THREE.Matrix4(), col = new THREE.Color(), isB = (x, y) => x === 0 || y === 0 || x === S.COLS - 1 || y === S.ROWS - 1;
    wallIdx.forEach((k, j) => { const x = k % S.COLS, y = (k / S.COLS) | 0, b = isB(x, y); M4.makeScale(1, b ? 1.15 : 1, 1); M4.setPosition(x + 0.5 - CX, 0, y + 0.5 - CY); walls.setMatrixAt(j, M4); const s = 0.8 + Math.random() * 0.24; col.setRGB(s, s, s * (b ? 0.95 : 1)); walls.setColorAt(j, col); });
    this.arena.add(walls);
    if (this.theme === 'snow') { const caps = new THREE.InstancedMesh(bevelBox(1.0, 0.08, 1.0, 0.035), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.6 }), wallIdx.length); wallIdx.forEach((k, j) => { const x = k % S.COLS, y = (k / S.COLS) | 0; M4.makeTranslation(x + 0.5 - CX, isB(x, y) ? 1.15 : 1.0, y + 0.5 - CY); caps.setMatrixAt(j, M4); }); caps.castShadow = true; this.arena.add(caps); }
    this.brickMesh = null;
    if (brickIdx.length) {
      const [bmap, bnor] = cm(this.brickT);
      const bm = new THREE.InstancedMesh(bevelBox(0.97, 0.9, 0.97, 0.03), new THREE.MeshStandardMaterial({ map: bmap, normalMap: bnor, roughness: 0.9 }), brickIdx.length);
      bm.castShadow = bm.receiveShadow = true; this.brickMesh = bm; this.brickIdx = brickIdx; this.arena.add(bm); this.syncBricks(g);
    }
    this.moverMeshes = [];
    if (g.movers.length) {
      const [smap, snor] = cm(this.steelT); const stM = new THREE.MeshStandardMaterial({ map: smap, normalMap: snor, roughness: 0.38, metalness: 0.85 });
      for (const m of g.movers) { const mesh = new THREE.Mesh(bevelBox(m.w - 0.04, 0.9, m.h - 0.04, 0.06), stM); mesh.castShadow = mesh.receiveShadow = true; this.arena.add(mesh); this.moverMeshes.push(mesh);
        const rx0 = Math.min(m.ax, m.bx), rx1 = Math.max(m.ax, m.bx) + m.w, ry0 = Math.min(m.ay, m.by), ry1 = Math.max(m.ay, m.by) + m.h;
        const rail = new THREE.Mesh(new THREE.PlaneGeometry(rx1 - rx0, ry1 - ry0), new THREE.MeshStandardMaterial({ color: 0x1c1c1c, transparent: true, opacity: 0.4, roughness: 0.4, metalness: 0.8, depthWrite: false }));
        rail.rotation.x = -Math.PI / 2; rail.position.set((rx0 + rx1) / 2 - CX, 0.008, (ry0 + ry1) / 2 - CY); this.arena.add(rail); }
    }
    this.portalMeshes = [];
    g.portals.forEach((p, i) => { const grp = new THREE.Group(); const hue = (i >> 1) ? new THREE.Color(2.2, 0.6, 3.2) : new THREE.Color(0.4, 2.2, 3.2);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.06, 10, 40), new THREE.MeshBasicMaterial({ color: hue })); tor.rotation.x = -Math.PI / 2; tor.position.y = 0.06;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.46, 40), new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, c: { value: hue } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float t; uniform vec3 c; varying vec2 vUv; void main(){ vec2 d = vUv - 0.5; float r = length(d) * 2.0; float a = atan(d.y, d.x); float s = 0.5 + 0.5 * sin(a * 3.0 + r * 10.0 - t * 5.0); float f = (1.0 - r) * (0.35 + 0.65 * s); gl_FragColor = vec4(c * f * 0.5, 1.0);` + TAIL + `}` }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; grp.add(tor, disc); grp.position.copy(W(p.x, p.y)); this.arena.add(grp); this.portalMeshes.push(disc); });
    this.hillMesh = null;
    if (g.hill) { const h = g.hill; const m = new THREE.Mesh(new THREE.CircleGeometry(h.r, 64), new THREE.MeshBasicMaterial({ map: this.hillT, transparent: true, depthWrite: false, opacity: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.copy(W(h.x, h.y, 0.012)); this.arena.add(m); this.hillMesh = m;
      const pr = new THREE.Mesh(new THREE.RingGeometry(h.r - 0.2, h.r, 64, 1, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide })); pr.rotation.x = -Math.PI / 2; pr.position.copy(W(h.x, h.y, 0.02)); this.arena.add(pr); this.hillProg = pr; this.hillProgA = -1; }
    this.addScenery();
    this.setMood(v);
    for (const t of this.tanks) { t.lastTrk = null; t.dustT = 0; t.burn = 0; t.opacity = 1; }
    this.smoke.clear(); this.fire.clear(); this.debris.length = 0; this.deb.count = 0; this.shake = 0; this.fowPts.length = 0; this.builtT = this.time; this.tilesVer = g.tilesVer; this.selfChecks = 0;
    for (const r of this.rings) r.visible = false; for (const l of this.plights) l.intensity = 0;
  }
  addScenery() {
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: this.theme === 'snow' ? 0xdfe6f0 : 0x8a7f72, roughness: 0.95, flatShading: true }), 70);
    const drums = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 14), new THREE.MeshStandardMaterial({ color: 0x6a2a1e, roughness: 0.5, metalness: 0.6 }), 24);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3();
    let n = 0, m = 0;
    for (let i = 0; i < 600 && (n < 70 || m < 24); i++) {
      const x = rnd(-30, 30), z = rnd(-21, 21); if (Math.abs(x) < 17 && Math.abs(z) < 11) continue;
      if (Math.random() < 0.75 && n < 70) { const s = rnd(0.3, 1.2); E.set(rnd(0, 6), rnd(0, 6), rnd(0, 6)); Q.setFromEuler(E); P.set(x, s * 0.2, z); Sc.set(s, s * rnd(0.5, 0.9), s * rnd(0.8, 1.2)); M4.compose(P, Q, Sc); rocks.setMatrixAt(n++, M4); }
      else if (m < 24) { E.set(Math.random() < 0.3 ? Math.PI / 2 : 0, rnd(0, 6), 0); Q.setFromEuler(E); P.set(x, 0.3, z); Sc.set(1, 1, 1); M4.compose(P, Q, Sc); drums.setMatrixAt(m++, M4); }
    }
    rocks.count = n; drums.count = m; rocks.castShadow = rocks.receiveShadow = drums.castShadow = true; this.arena.add(rocks, drums);
  }
  setMood(v) {
    const night = v.night, rain = v.weather === 'rain', snow = v.weather === 'snow';
    this.night = night; this.baseHemi = night ? 0.5 : rain ? 1.15 : snow ? 1.1 : 0.85;
    this.hemi.intensity = this.baseHemi;
    this.hemi.color.set(night ? 0x6f86c8 : rain ? 0xa9b4c4 : 0xbfd8ff); this.hemi.groundColor.set(night ? 0x141824 : 0x5a4a38);
    this.sun.intensity = night ? 0.55 : rain ? 1.0 : snow ? 2.4 : 3.0; this.sun.color.set(night ? 0x8fa8ff : snow ? 0xeef4ff : 0xfff1dc);
    this.scene.environmentIntensity = night ? 0.15 : rain ? 0.55 : 0.8;
    const bg = night ? 0x05070d : rain ? 0x40464e : snow ? 0xc8d2de : 0xb9a37f;
    this.scene.background = new THREE.Color(bg); this.scene.fog = new THREE.Fog(bg, night ? 30 : 45, night ? 60 : 110); this.fogBase = [this.scene.fog.near, this.scene.fog.far];
    this.smokeMat.uniforms.light.value.setRGB(night ? 0.28 : rain ? 0.7 : 1, night ? 0.3 : rain ? 0.72 : 1, night ? 0.38 : rain ? 0.76 : 1);
    this.rain.visible = rain; this.snow.mesh.visible = snow; this.snow.clear();
    this.fow.visible = night; this.fowU.dark.value = 0.93;
    this.grade.uniforms.tint.value.setRGB(night ? 0.92 : snow ? 1.0 : rain ? 0.96 : 1.03, night ? 0.96 : rain ? 0.99 : 1.0, night ? 1.1 : snow ? 1.05 : rain ? 1.04 : 0.96);
    this.lightning = 0; this.lightT = rnd(3, 8);
  }
  syncBricks(g) {
    if (!this.brickMesh) return; const M4 = new THREE.Matrix4(), col = new THREE.Color();
    this.brickIdx.forEach((k, j) => { const x = k % S.COLS, y = (k / S.COLS) | 0, hp = g.tiles[k] === S.BRICK ? g.hp[k] : 0;
      const h = hp === 0 ? 0.001 : hp === 1 ? 0.42 : hp === 2 ? 0.7 : 1; M4.makeScale(hp ? 1 : 0.001, h, hp ? 1 : 0.001); M4.setPosition(x + 0.5 - CX, 0, y + 0.5 - CY); this.brickMesh.setMatrixAt(j, M4);
      const s = hp >= 3 ? 1 : hp === 2 ? 0.8 : 0.6; col.setRGB(s, s * 0.95, s * 0.92); this.brickMesh.setColorAt(j, col); });
    this.brickMesh.instanceMatrix.needsUpdate = true; if (this.brickMesh.instanceColor) this.brickMesh.instanceColor.needsUpdate = true;
  }

  /* ---------- effects ---------- */
  light(x, y, h, color, i0, life) {
    let best = this.plights[0]; for (const l of this.plights) if (l.userData.t / l.userData.life > best.userData.t / best.userData.life || l.intensity === 0) { best = l; if (l.intensity === 0) break; }
    best.position.copy(W(x, y, h)); best.color.set(color); best.userData = { t: 0, life, i0 }; best.intensity = i0;
  }
  fowFlash(x, y, r, life) { this.fowPts.push({ x, y, r, life, t: 0 }); if (this.fowPts.length > 8) this.fowPts.shift(); }
  ring(x, y, s, life, color) { const m = this.rings.find(r => !r.visible) || this.rings[0]; m.visible = true; m.position.copy(W(x, y, 0.05)); m.userData = { t: 0, life, s }; m.material.color.copy(color || new THREE.Color(2, 1.5, 1)); m.scale.set(0.1, 0.1, 1); }
  sparks(x, y, h, n, col, spd = 5, life = 0.35) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), u = rnd(0.2, 1), s = spd * u;
      this.fire.add({ x: x - CX, y: h, z: y - CY, vx: Math.cos(a) * s, vy: rnd(0.5, 3), vz: Math.sin(a) * s, grav: 9, drag: 0.04, life: life * rnd(0.6, 1.3), size: 0.035, size1: 0.02, streak: 0.045, r: col[0], g: col[1], b: col[2], r1: col[0] * 0.8, g1: col[1] * 0.35, b1: col[2] * 0.1 }); }
  }
  puff(x, y, h, n, o = {}) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(0.2, 1) * (o.spd || 1); const c = o.c || 0.55;
      this.smoke.add({ x: x - CX + rnd(-0.1, 0.1), y: h + rnd(0, 0.1), z: y - CY + rnd(-0.1, 0.1), vx: Math.cos(a) * s, vy: rnd(0.3, 1.0) * (o.up || 1), vz: Math.sin(a) * s, drag: 0.04, life: (o.life || 1.4) * rnd(0.7, 1.3), size: (o.size || 0.25) * rnd(0.7, 1.2), size1: (o.size1 || 0.9) * rnd(0.8, 1.3), vr: rnd(-1, 1), r: c * (o.tr || 1), g: c * (o.tg || 1), b: c * (o.tb || 1), a: o.a || 0.6, fade: 'late' }); }
  }
  fireball(x, y, s) {
    for (let i = 0; i < 26 * s; i++) { const a = rnd(0, 6.283), sp = rnd(0.5, 3.2) * s;
      this.fire.add({ x: x - CX, y: 0.3, z: y - CY, vx: Math.cos(a) * sp, vy: rnd(0.5, 2.6) * s, vz: Math.sin(a) * sp, drag: 0.09, life: rnd(0.35, 0.8), size: rnd(0.25, 0.5) * s, size1: rnd(0.6, 1.1) * s, r: 4, g: 2.4, b: 0.9, r1: 1.4, g1: 0.25, b1: 0.05, a: 0.9 }); }
    this.fire.add({ x: x - CX, y: 0.4, z: y - CY, vx: 0, vy: 0.3, vz: 0, life: 0.22, size: 1.4 * s, size1: 2.4 * s, r: 6, g: 5, b: 3.6, a: 1 });
    this.puff(x, y, 0.4, 18 * s, { c: 0.16, spd: 1.6 * s, size: 0.5 * s, size1: 1.9 * s, life: 2.6, a: 0.8, up: 1.4 });
  }
  debrisBurst(x, y, n, col, s = 1) {
    for (let i = 0; i < n; i++) { if (this.debris.length >= 260) this.debris.shift(); const a = rnd(0, 6.283), sp = rnd(1, 5) * s;
      this.debris.push({ x: x - CX, y: rnd(0.2, 0.5), z: y - CY, vx: Math.cos(a) * sp, vy: rnd(2, 6) * s, vz: Math.sin(a) * sp, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-12, 12), wy: rnd(-12, 12), wz: rnd(-12, 12), s: rnd(0.04, 0.13) * s, age: 0, life: rnd(2.5, 4.5), col: col[(Math.random() * col.length) | 0], hot: Math.random() < 0.35 }); }
  }
  scorch(x, y, r, a = 0.6) { const X = this.trkX, px = x * 32, py = y * 32, R = r * 32; const gr = X.createRadialGradient(px, py, 0, px, py, R); gr.addColorStop(0, `rgba(12,9,6,${a})`); gr.addColorStop(0.6, `rgba(20,14,8,${a * 0.6})`); gr.addColorStop(1, 'rgba(20,14,8,0)'); X.fillStyle = gr; X.beginPath(); X.arc(px, py, R, 0, 6.283); X.fill(); this.trkDirty = true; }
  fx(events) {
    const g = this.g; if (!g) return;
    for (const e of events) {
      switch (e.e) {
        case 'fire': { const tk = g.tanks[e.tank], c = e.tank ? [6, 3.4, 1.2] : [3.4, 6, 2.6], m = e.mega ? 1.8 : 1;
          const fx = Math.cos(e.a), fy = Math.sin(e.a);
          for (let i = 0; i < 9 * m; i++) { const s = rnd(0.5, 3) * m, sp = rnd(-0.5, 0.5); this.fire.add({ x: e.x - CX, y: 0.42, z: e.y - CY, vx: (fx + -fy * sp) * s, vy: rnd(0, 0.4), vz: (fy + fx * sp) * s, drag: 0.2, life: rnd(0.06, 0.14), size: 0.22 * m, size1: 0.05, r: 6, g: 4.2, b: 2 }); }
          this.fire.add({ x: e.x - CX, y: 0.42, z: e.y - CY, vx: 0, vy: 0, vz: 0, life: 0.07, size: 0.55 * m, size1: 0.3, r: c[0], g: c[1], b: c[2] });
          this.puff(e.x + fx * 0.1, e.y + fy * 0.1, 0.4, 6 * m, { c: 0.7, spd: 0.6, size: 0.12, size1: 0.6 * m, life: 1.1, a: 0.45 });
          this.light(e.x, e.y, 0.8, e.tank ? 0xffb050 : 0xc8ff70, 14 * m, 0.12); this.fowFlash(e.x, e.y, 2.6 * m, 0.25);
          this.shake = Math.max(this.shake, e.mega ? 0.25 : 0.07); if (tk && tk.id === this.viewer) this.kick = 1;
          break; }
        case 'ric': this.sparks(e.x, e.y, 0.35, 12, [5, 4, 2.5], 4.5); this.light(e.x, e.y, 0.5, 0xffe0a0, 4, 0.08); this.puff(e.x, e.y, 0.3, 2, { c: 0.7, size: 0.08, size1: 0.35, life: 0.6, a: 0.35 }); this.fowFlash(e.x, e.y, 1.2, 0.15); break;
        case 'thud': this.sparks(e.x, e.y, 0.35, e.mega ? 30 : 8, [5, 3.6, 1.6], e.mega ? 7 : 3.5); this.puff(e.x, e.y, 0.3, e.mega ? 12 : 4, { c: 0.6, size: 0.1, size1: e.mega ? 1.4 : 0.5, life: 1, a: 0.5 });
          if (e.mega) { this.fireball(e.x, e.y, 0.8); this.shake = Math.max(this.shake, 0.4); this.scorch(e.x, e.y, 0.9); this.light(e.x, e.y, 1, 0xff9040, 20, 0.4); } this.fowFlash(e.x, e.y, 1.2, 0.2); break;
        case 'fizzle': this.puff(e.x, e.y, 0.3, 4, { c: 0.75, size: 0.06, size1: 0.4, life: 0.8, a: 0.4 }); this.sparks(e.x, e.y, 0.3, 3, [3, 2, 1], 1.5); break;
        case 'deflect': this.sparks(e.x, e.y, 0.4, 16, [2, 4, 6], 5); this.ring(e.x, e.y, 1.3, 0.3, new THREE.Color(1, 2, 3)); break;
        case 'clash': this.sparks(e.x, e.y, 0.4, 26, [6, 5, 3], 6); this.ring(e.x, e.y, 2.2, 0.4, new THREE.Color(3, 2.5, 1.5)); this.light(e.x, e.y, 0.8, 0xffffff, 12, 0.18); this.fowFlash(e.x, e.y, 2, 0.3); break;
        case 'hit': {
          const s = e.cause === 'mega' ? 1.5 : 1.15; this.fireball(e.x, e.y, s); this.ring(e.x, e.y, 4.5 * s, 0.55);
          this.debrisBurst(e.x, e.y, 34, [TEAM[e.tank].clone().multiplyScalar(0.6), new THREE.Color(0.15, 0.15, 0.14), new THREE.Color(0.3, 0.28, 0.24)], s);
          this.sparks(e.x, e.y, 0.4, 40, [6, 3.2, 1], 7, 0.6); this.light(e.x, e.y, 1.2, 0xff8a3a, 34, 0.6); this.fowFlash(e.x, e.y, 4.5, 1.2);
          this.scorch(e.x, e.y, 1.2, 0.75); this.shake = Math.max(this.shake, 0.6 * s); this.flash = Math.max(this.flash, e.tank === this.viewer ? 0.28 : 0.14);
          this.tanks[e.tank].burn = 2.6; break; }
        case 'shield': this.ring(e.x, e.y, 2.4, 0.4, new THREE.Color(0.6, 2, 3.6)); this.sparks(e.x, e.y, 0.4, 24, [1.5, 3.5, 6], 5); this.light(e.x, e.y, 0.8, 0x60c0ff, 14, 0.3); break;
        case 'brick': { const bc = [new THREE.Color(0.55, 0.24, 0.16), new THREE.Color(0.42, 0.18, 0.12), new THREE.Color(0.62, 0.58, 0.52)];
          this.debrisBurst(e.x, e.y, e.hp ? 7 : 20, bc, e.hp ? 0.7 : 1); this.puff(e.x, e.y, 0.4, e.hp ? 5 : 14, { c: 0.62, tr: 1.12, tg: 0.98, tb: 0.85, size: 0.2, size1: e.hp ? 0.7 : 1.4, life: 1.6, a: 0.6 });
          if (!e.hp) this.shake = Math.max(this.shake, 0.18); break; }
        case 'mine': this.fireball(e.x, e.y, 1); this.ring(e.x, e.y, 3.6, 0.5); this.scorch(e.x, e.y, 1.1); this.light(e.x, e.y, 1, 0xff9040, 26, 0.5); this.shake = Math.max(this.shake, 0.45); this.fowFlash(e.x, e.y, 3.5, 1); break;
        case 'nitro': { const tk = g.tanks[e.tank]; for (let i = 0; i < 20; i++) this.fire.add({ x: e.x - CX, y: 0.3, z: e.y - CY, vx: -Math.cos(tk.a) * rnd(1, 4), vy: rnd(0, 1), vz: -Math.sin(tk.a) * rnd(1, 4), drag: 0.1, life: rnd(0.2, 0.4), size: 0.2, size1: 0.05, r: 1.5, g: 3, b: 6 }); break; }
        case 'bump': this.puff(e.x, e.y, 0.2, 5, { c: this.dustC(), tr: 1.08, tg: 1, tb: 0.88, size: 0.12, size1: 0.6, life: 1.2, a: 0.45 }); this.sparks(e.x, e.y, 0.3, 4, [4, 3, 2], 2.5); break;
        case 'portal': this.ring(e.x, e.y, 1.8, 0.35, new THREE.Color(2, 1, 3.4)); this.ring(e.x2, e.y2, 1.8, 0.35, new THREE.Color(1, 2.6, 3.4)); this.sparks(e.x2, e.y2, 0.3, 12, [2.4, 1.6, 6], 3); break;
        case 'puspawn': this.ring(e.x, e.y, 2, 0.5, new THREE.Color(2.5, 2.5, 1)); this.sparks(e.x, e.y, 0.5, 14, [5, 5, 2], 2.5); break;
        case 'pickup': this.ring(e.x, e.y, 2.2, 0.4, new THREE.Color(1.5, 3, 1.5)); this.sparks(e.x, e.y, 0.5, 22, [3, 6, 3], 4); this.light(e.x, e.y, 0.8, 0xa0ffa0, 10, 0.3); break;
        case 'puexpire': this.puff(e.x, e.y, 0.3, 5, { c: 0.8, size: 0.1, size1: 0.6, life: 0.9, a: 0.4 }); break;
        case 'hill': if (g.hill) { this.ring(g.hill.x, g.hill.y, g.hill.r * 2.4, 0.6, TEAM[e.tank].clone().multiplyScalar(2.5)); } break;
        case 'round': case 'go': for (const t of this.tanks) t.burn = 0; break;
      }
    }
  }
  dustC() { return this.theme === 'snow' ? 0.95 : this.theme === 'mud' ? 0.32 : this.theme === 'grass' ? 0.5 : this.theme === 'urban' ? 0.6 : 0.72; }
  setOpacity(t, op) {
    if (Math.abs(op - t.opacity) < 0.004 && (op >= 0.999) === !t.wasTr) return;
    t.opacity = op; const tr = op < 0.999; t.wasTr = tr;
    for (const m of t.mats) { if (m === t.shield.material) continue; m.opacity = m.userData.baseOp * op; if (m.transparent !== (tr || m.userData.baseTr)) { m.transparent = tr || m.userData.baseTr; m.depthWrite = !tr; } }
    t.G.traverse(o => { if (o.isMesh && o !== t.shield) o.castShadow = o.userData.baseShadow && op > 0.5; });
    t.G.visible = op > 0.01;
  }

  /* ---------- per frame ---------- */
  frame(dt, g, viewer, opts = {}) {
    if (!this.ready || !g || this.lost) return;
    if (g !== this.g) this.build(g, viewer);
    this.viewer = viewer; dt = Math.min(dt, 0.1); this.time += dt; const T = this.time, v = g.v;
    this.adapt(dt);
    if (!this._sized) this.resize();
    if (g.tilesVer !== this.tilesVer) { this.tilesVer = g.tilesVer; this.syncBricks(g); }
    // camera
    const tilt = 0.36 + (opts.attract ? Math.sin(T * 0.13) * 0.08 : 0), d = this.dist || 40;
    if (this.fogBase && this.scene.fog) { const k = Math.max(1, d / 40); this.scene.fog.near = this.fogBase[0] * k; this.scene.fog.far = this.fogBase[1] * k; } // far portrait camera must not drown in fog
    const sh = this.shake * this.shake * 0.9; this.shake = Math.max(0, this.shake - dt * 1.6);
    const ox = (Math.random() - 0.5) * sh, oz = (Math.random() - 0.5) * sh;
    const sway = opts.attract ? Math.sin(T * 0.21) * 1.5 : 0;
    if (this.rotated) { this.cam.up.set(1, 0, 0); this.cam.position.set(-d * Math.sin(tilt) + ox, d * Math.cos(tilt), sway + oz); this.cam.lookAt(ox * 0.5, 0, oz * 0.5 + sway * 0.3); }
    else { this.cam.up.set(0, 1, 0); this.cam.position.set(ox + sway, d * Math.cos(tilt), d * Math.sin(tilt) + oz); this.cam.lookAt(ox * 0.5 + sway * 0.3, 0, oz * 0.5); }
    // tanks
    const night = this.night;
    g.tanks.forEach((tk, i) => {
      const t = this.tanks[i], x = tk.rx != null ? tk.rx : tk.x, y = tk.ry != null ? tk.ry : tk.y, a = tk.ra != null ? tk.ra : tk.a;
      t.G.position.copy(W(x, y, 0)); t.G.rotation.y = -a;
      const vis = !tk.hidden && S.isVisible(g, tk);
      let op = 1;
      if (v.invisible || tk.hidden) { const mine = i === viewer; op = mine ? (vis ? 1 : 0.32) : (vis ? Math.min(1, tk.visT * 3 + (tk.spin > 0 ? 1 : 0)) : 0); if (viewer < 0) op = vis ? 1 : 0.25; }
      if (tk.inv > 0 && tk.spin <= 0) op *= 0.55 + 0.45 * (Math.sin(T * 40) > 0 ? 1 : 0);
      this.setOpacity(t, op);
      t.B.position.x = 0.27 - tk.recoil * tk.recoil * 0.14;
      const tl = tk.tread ? tk.tread[1] : 0, trr = tk.tread ? tk.tread[0] : 0;
      t.treadL.map.offset.x = -tl * 0.9; t.treadR.map.offset.x = -trr * 0.9;
      const acc = (tk.fwd || 0) - (t.lastFwd || 0); t.lastFwd = tk.fwd || 0;
      t.antV += (-acc * 6 - t.antA * 40 - t.antV * 4) * dt; t.antA += t.antV * dt; t.antA = Math.max(-0.5, Math.min(0.5, t.antA)); t.ant.rotation.z = t.antA + (tk.recoil * 0.2);
      t.shield.visible = tk.shield > 0 && op > 0.2; if (t.shield.visible) { t.shield.material.opacity = 0.18 + 0.08 * Math.sin(T * 8); t.shield.rotation.y = T; }
      t.stripeM.emissiveIntensity = 1.2 + (tk.speedT > 0 || tk.nitro > 0 ? 1.4 * (0.5 + 0.5 * Math.sin(T * 20)) : 0) + (tk.triple > 0 ? 0.8 : 0);
      t.lightM.emissiveIntensity = night ? 4 : 1.6;
      // track marks, dust, exhaust
      if (op > 0.05 || viewer < 0 || i === viewer || !(v.invisible || tk.hidden)) {
        if (!t.lastTrk) t.lastTrk = { x, y };
        const md = Math.hypot(x - t.lastTrk.x, y - t.lastTrk.y);
        if (md > 0.09 && md < 2) { this.drawTrack(t.lastTrk.x, t.lastTrk.y, x, y, a); t.lastTrk.x = x; t.lastTrk.y = y; }
        else if (md >= 2) { t.lastTrk.x = x; t.lastTrk.y = y; }
      }
      const spd = tk.moving || 0;
      if (op > 0.3) {
        t.dustT -= dt * (0.4 + spd * 1.6);
        if (t.dustT <= 0 && spd > 0.8) { t.dustT = 0.1; const bx = x - Math.cos(a) * 0.45, by = y - Math.sin(a) * 0.45, px = -Math.sin(a) * 0.36, py = Math.cos(a) * 0.36, c = this.dustC();
          for (const sgn of [-1, 1]) this.smoke.add({ x: bx + px * sgn - CX, y: 0.08, z: by + py * sgn - CY, vx: rnd(-0.3, 0.3), vy: rnd(0.1, 0.4), vz: rnd(-0.3, 0.3), drag: 0.05, life: rnd(0.8, 1.5), size: 0.15, size1: rnd(0.5, 0.9), r: c * 1.08, g: c, b: c * 0.86, a: this.theme === 'mud' ? 0.25 : 0.32, vr: rnd(-1, 1), fade: 'late' }); }
        if (Math.random() < dt * (3 + spd * 3)) { const ex = x - Math.cos(a) * 0.55, ey = y - Math.sin(a) * 0.55; this.smoke.add({ x: ex - CX, y: 0.3, z: ey - CY, vx: -Math.cos(a) * 0.3, vy: 0.5, vz: -Math.sin(a) * 0.3, drag: 0.03, life: 1.2, size: 0.06, size1: 0.35, r: 0.35, g: 0.35, b: 0.36, a: 0.25, fade: 'late' }); }
      }
      if (t.burn > 0) { t.burn -= dt; if (Math.random() < 0.7) { this.smoke.add({ x: x - CX + rnd(-0.2, 0.2), y: 0.4, z: y - CY + rnd(-0.2, 0.2), vx: rnd(-0.2, 0.2), vy: rnd(0.8, 1.4), vz: rnd(-0.2, 0.2), drag: 0.02, life: 2, size: 0.2, size1: 1.1, r: 0.12, g: 0.11, b: 0.1, a: 0.55 * Math.min(1, t.burn), fade: 'late' }); if (Math.random() < 0.5) this.fire.add({ x: x - CX + rnd(-0.2, 0.2), y: 0.4, z: y - CY + rnd(-0.2, 0.2), vx: 0, vy: rnd(0.5, 1.2), vz: 0, life: 0.35, size: 0.18, size1: 0.05, r: 4, g: 1.8, b: 0.5 }); } }
      // headlights (night / storm)
      const sp = this.spots[i], bm = this.beams[i], lightsOn = night && op > 0.05;
      const showBeam = lightsOn && (viewer < 0 || i === viewer || S.isVisible(g, tk));
      sp.intensity = lightsOn ? (i === viewer || viewer < 0 ? 26 : 10) : 0;
      if (lightsOn) { sp.position.copy(W(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, 0.45)); sp.target.position.copy(W(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 0)); sp.target.updateMatrixWorld(); }
      bm.visible = showBeam; if (showBeam) { bm.position.copy(W(x + Math.cos(a) * 0.45, y + Math.sin(a) * 0.45, 0.03)); bm.rotation.set(-Math.PI / 2, 0, -a); bm.material.uniforms.k.value = i === viewer || viewer < 0 ? 0.32 : 0.14; }
    });
    // shells
    let k = 0;
    for (const s of g.shells) { if (k >= this.shellPool.length) break; const m = this.shellPool[k++]; const x = s.rx != null ? s.rx : s.x, y = s.ry != null ? s.ry : s.y;
      m.visible = true; m.geometry = s.mega ? this.megaGeo : (s.guided || s.seeker) ? this.missGeo : this.shellGeo; m.material = this.shellM[s.owner];
      m.position.copy(W(x, y, 0.42)); m.rotation.y = -Math.atan2(s.vy, s.vx);
      const c = s.owner ? [4, 2, 0.6] : [2, 4.5, 1.2];
      this.fire.add({ x: x - CX, y: 0.42, z: y - CY, vx: 0, vy: 0, vz: 0, life: s.mega ? 0.3 : 0.16, size: s.mega ? 0.4 : 0.16, size1: 0.03, r: c[0], g: c[1], b: c[2], a: 0.8 });
      if (s.guided || s.seeker || s.mega) this.smoke.add({ x: x - CX, y: 0.42, z: y - CY, vx: rnd(-0.1, 0.1), vy: 0.2, vz: rnd(-0.1, 0.1), drag: 0.03, life: 1.4, size: 0.08, size1: 0.45, r: 0.8, g: 0.8, b: 0.8, a: 0.4, fade: 'late' });
    }
    for (; k < this.shellPool.length; k++) this.shellPool[k].visible = false;
    // mines (only your own are shown to you)
    k = 0; for (const m of g.mines) { if (k >= this.minePool.length) break; if (viewer >= 0 && m.owner !== viewer) continue; const o = this.minePool[k++]; o.visible = true; o.position.copy(W(m.x, m.y, 0)); o.userData.led.visible = m.arm > 0 ? Math.sin(T * 20) > 0 : Math.sin(T * 5) > 0.3; }
    for (; k < this.minePool.length; k++) this.minePool[k].visible = false;
    // power-ups
    k = 0; for (const p of g.pups) { if (k >= this.puPool.length) break; const o = this.puPool[k++]; o.visible = true; o.position.copy(W(p.x, p.y, 0)); const u = o.userData; if (u.type !== p.type) { u.type = p.type; u.icon.material.map = this.puT[p.type]; u.icon.material.needsUpdate = true; }
      u.icon.position.y = 0.55 + Math.sin(T * 3 + p.id) * 0.08; u.icon.quaternion.copy(this.cam.quaternion); const blink = p.t > 12 ? (Math.sin(T * 18) > 0 ? 1 : 0.2) : 1; u.icon.material.opacity = blink; u.beam.material.opacity = 0.14 * blink; u.beam.material.color.setHSL((T * 0.2) % 1, 0.8, 0.6); }
    for (; k < this.puPool.length; k++) this.puPool[k].visible = false;
    // movers / portals / hill
    g.movers.forEach((m, i) => { const me = this.moverMeshes[i]; if (me) me.position.set(m.x + m.w / 2 - CX, 0, m.y + m.h / 2 - CY); });
    for (const p of this.portalMeshes) p.material.uniforms.t.value = T;
    if (g.hill && this.hillProg) { const h = g.hill, pr = Math.round(h.prog * 100) / 100; if (pr !== this.hillProgA || h.owner !== this.hillOwn) { this.hillProgA = pr; this.hillOwn = h.owner; this.hillProg.geometry.dispose(); this.hillProg.geometry = new THREE.RingGeometry(h.r - 0.2, h.r, 64, 1, Math.PI / 2, Math.max(0.001, pr * Math.PI * 2)); this.hillProg.material.color.copy(h.owner >= 0 ? TEAM[h.owner] : new THREE.Color(1, 1, 1)); }
      this.hillMesh.material.opacity = 0.7 + 0.15 * Math.sin(T * 3); }
    // weather
    if (this.rain.visible) { this.rain.position.y = -((T * 16) % 7); this.rain.position.x = -((T * 1.5) % 3);
      if (Math.random() < 0.6) { const x = rnd(1, 31), y = rnd(1, 19); this.fire.add({ x: x - CX, y: 0.03, z: y - CY, vx: 0, vy: 0, vz: 0, life: 0.25, size: 0.04, size1: 0.18, r: 0.25, g: 0.28, b: 0.33, a: 0.8 }); }
      this.lightT -= dt; if (this.lightT <= 0) { this.lightT = rnd(5, 13); this.lightning = 1; this.opts.onThunder && this.opts.onThunder(rnd(0.3, 1.4)); }
    }
    if (this.lightning > 0) { this.lightning = Math.max(0, this.lightning - dt * 2.5); const f = this.lightning * (Math.sin(T * 60) > -0.3 ? 1 : 0.3); this.hemi.intensity = this.baseHemi + f * 3.5; this.fowU.dark.value = 0.93 - f * 0.55; } else if (night) this.fowU.dark.value = 0.93;
    if (this.snow.mesh.visible) { for (let i = 0; i < 5; i++) this.snow.add({ x: rnd(-18, 18), y: rnd(5, 8), z: rnd(-12, 12), vx: rnd(0.2, 0.6), vy: -rnd(0.9, 1.5), vz: rnd(-0.2, 0.2), life: 6, size: rnd(0.03, 0.06), size1: 0.04, r: 0.9, g: 0.92, b: 1, a: 0.8, fade: 'in' }); this.snow.update(dt); }
    // particles, debris, rings, lights
    this.smoke.update(dt); this.fire.update(dt);
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), C = new THREE.Color();
    let dn = 0; const D = this.debris;
    for (let i = 0; i < D.length; i++) { const o = D[i]; o.age += dt; if (o.age > o.life) continue; D[dn] = o;
      if (o.y > o.s * 0.5 || o.vy > 0) { o.vy -= 14 * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rx += o.wx * dt; o.ry += o.wy * dt; o.rz += o.wz * dt; const tx = Math.floor(o.x + CX), ty = Math.floor(o.z + CY); if (o.y < 1 && S.solidAt(g, o.x + CX, o.z + CY) && tx > 0) { o.vx *= -0.4; o.vz *= -0.4; o.x += o.vx * dt * 2; o.z += o.vz * dt * 2; } if (o.hot && Math.random() < 0.3) this.smoke.add({ x: o.x, y: o.y, z: o.z, vx: 0, vy: 0.3, vz: 0, life: 0.8, size: 0.05, size1: 0.25, r: 0.2, g: 0.2, b: 0.2, a: 0.4, fade: 'late' }); }
      if (o.y < o.s * 0.5 && o.vy < 0) { o.y = o.s * 0.5; o.vy = Math.abs(o.vy) > 1.5 ? -o.vy * 0.35 : 0; o.vx *= 0.55; o.vz *= 0.55; o.wx *= 0.5; o.wy *= 0.5; o.wz *= 0.5; }
      const fade = o.age > o.life - 0.5 ? (o.life - o.age) / 0.5 : 1;
      E.set(o.rx, o.ry, o.rz); Q.setFromEuler(E); P.set(o.x, o.y, o.z); Sc.set(o.s * 1.4 * fade, o.s * 0.6 * fade, o.s * fade); M4.compose(P, Q, Sc); this.deb.setMatrixAt(dn, M4);
      C.copy(o.col); if (o.hot && o.age < 1.2) C.lerp(new THREE.Color(3, 1, 0.2), 1 - o.age / 1.2); this.deb.setColorAt(dn, C); dn++; }
    D.length = dn; this.deb.count = dn; this.deb.instanceMatrix.needsUpdate = true; this.deb.instanceColor.needsUpdate = true;
    for (const r of this.rings) if (r.visible) { const u = r.userData; u.t += dt; const f = u.t / u.life; if (f >= 1) { r.visible = false; continue; } const s = u.s * (0.2 + 0.8 * Math.sqrt(f)); r.scale.set(s, s, 1); r.material.opacity = 1 - f; }
    for (const l of this.plights) if (l.intensity > 0) { const u = l.userData; u.t += dt; l.intensity = u.t >= u.life ? 0 : u.i0 * (1 - u.t / u.life) * (1 - u.t / u.life); }
    // tracks texture upload (~12 Hz)
    this.trkT += dt; if (this.trkT > 1.5) { this.trkT = 0; const X = this.trkX; X.globalCompositeOperation = 'destination-out'; X.fillStyle = 'rgba(0,0,0,0.035)'; X.fillRect(0, 0, 1024, 640); X.globalCompositeOperation = 'source-over'; this.trkDirty = true; }
    if (this.trkDirty && (T - (this.trkUp || 0)) > 0.08) { this.trkUp = T; this.trkDirty = false; this.trkTex.needsUpdate = true; }
    // night fog of war
    if (night) {
      this.fowU.camPos.value.copy(this.cam.position);
      const me = viewer >= 0 ? g.tanks[viewer] : g.tanks[0], th = viewer >= 0 ? g.tanks[1 - viewer] : g.tanks[1];
      const P2 = tk => [(tk.rx != null ? tk.rx : tk.x) - CX, (tk.ry != null ? tk.ry : tk.y) - CY, tk.ra != null ? tk.ra : tk.a];
      const a1 = P2(me), a2 = P2(th);
      this.fowU.me.value.set(a1[0], a1[1], a1[2], 1);
      const thVis = !th.hidden; this.fowU.them.value.set(a2[0], a2[1], a2[2], thVis ? 1 : 0);
      const pts = this.fowU.pts.value; let n = 0;
      if (viewer < 0) pts[n++].set(a2[0], a2[1], 3.2, 1);
      for (let i = this.fowPts.length - 1; i >= 0; i--) { const p = this.fowPts[i]; p.t += dt; if (p.t >= p.life) { this.fowPts.splice(i, 1); continue; } if (n < 12) pts[n++].set(p.x - CX, p.y - CY, p.r, 1 - p.t / p.life); }
      for (const s of g.shells) { if (n >= 12) break; pts[n++].set((s.rx != null ? s.rx : s.x) - CX, (s.ry != null ? s.ry : s.y) - CY, s.mega ? 1.8 : 1.1, 0.9); }
      for (; n < 12; n++) pts[n].w = 0;
    }
    // post
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.grade.uniforms.flash.value = this.flash * this.flash;
    if (this.tier >= 2) this.composer.render(dt); else this.r.render(this.scene, this.cam);
    // self check: shortly after a new arena, after tier changes, then every 20 s
    if (T - this.lastCheck > (this.selfChecks < 2 ? 1.2 : 20) && T - (this.builtT || 0) > 0.8) { this.lastCheck = T; this.selfCheck(g); }
  }
  drawTrack(x0, y0, x1, y1, a) {
    const X = this.trkX, px = -Math.sin(a), py = Math.cos(a), c = this.theme === 'snow' ? 'rgba(90,100,120,0.32)' : this.theme === 'mud' ? 'rgba(20,14,8,0.42)' : 'rgba(30,22,12,0.30)';
    X.strokeStyle = c; X.lineWidth = 0.17 * 32; X.lineCap = 'butt'; X.setLineDash([2.5, 2]);
    for (const s of [-0.35, 0.35]) { X.beginPath(); X.moveTo((x0 + px * s) * 32, (y0 + py * s) * 32); X.lineTo((x1 + px * s) * 32, (y1 + py * s) * 32); X.stroke(); }
    X.setLineDash([]); this.trkDirty = true;
  }
  adapt(dt) {
    if (this.lockTier) return; this.ft.push(dt); if (this.ft.length < 90) return;
    const sorted = this.ft.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1]; this.ft.length = 0;
    if (med > 1 / 47 && this.tier > 0) { this.setTier(this.tier - 1); this.goodRuns = 0; console.info('[tank-duel] quality ->', this.tier); }
    else if (med < 1 / 58) { this.goodRuns = (this.goodRuns || 0) + 1; if (this.goodRuns >= 6 && this.tier < this.maxTier && !this.raisedOnce) { this.raisedOnce = true; this.setTier(this.tier + 1); } }
  }
  /** read back floor pixels right after rendering; a black floor means a broken offscreen target -> step effects down */
  selfCheck(g) {
    this.selfChecks++;
    const gl = this.r.getContext(), pr = this.pr, H = this.H * pr, cand = [];
    const me = this.viewer >= 0 ? g.tanks[this.viewer] : g.tanks[0];
    if (this.night) { for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, x = me.x + Math.cos(a) * 1.3, y = me.y + Math.sin(a) * 1.3; if (!S.solidAt(g, x, y)) cand.push([x, y]); } }
    else for (let i = 0; i < 80 && cand.length < 24; i++) { const x = rnd(1.2, S.COLS - 1.2), y = rnd(1.2, S.ROWS - 1.2); if (S.solidAt(g, x, y) || S.solidAt(g, x, y - 0.6) || g.tanks.some(t => Math.hypot(t.x - x, t.y - y) < 1)) continue; cand.push([x, y]); }
    if (!cand.length) return;
    const px = new Uint8Array(4); let black = 0, n = 0;
    for (const [x, y] of cand) { const p = this.project(x, y, 0); if (p.x < 2 || p.y < 2 || p.x > this.W - 2 || p.y > this.H - 2) continue; gl.readPixels(Math.round(p.x * pr), Math.round(H - p.y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 6) black++; }
    this.lastSelf = { n, black, tier: this.tier };
    if (n >= 6 && black / n >= 0.2 && this.tier === 0 && !this.night) { this.blackHoles++; if (this.blackHoles === 3 && this.opts.onFatal) this.opts.onFatal('The 3D view renders black on this GPU even at the lowest quality.'); }
    if (n >= 6 && black / n >= 0.2 && this.tier > 0) { console.warn(`[tank-duel] black regions detected (${black}/${n}) at quality ${this.tier}; stepping effects down`); this.maxTier = this.tier - 1; this.setTier(this.maxTier); this.selfChecks = 0; }
  }
  stats() { return { tier: this.tier, maxTier: this.maxTier, lastSelf: this.lastSelf, rotated: this.rotated, pr: this.pr }; }
}
