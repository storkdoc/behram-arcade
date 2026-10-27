/* ==========================================================================
   LIVING CHESS — render.js   (three.js r169, vendored)
   A candle-lit study: marble board in a carved walnut frame with crisp
   coordinates, soft shadows, warm key + cool rim lights, drifting dust.
   Characters from chars.js. Cinematic move/capture/promotion/check/mate
   sequences with camera moves, sword sparks, shattering deaths, soul
   wisps, grief and cheering. Ghost lines of foreseen moves on the board.
   Post: HDR bloom + focus blur (depth-of-field look for close-ups) + FXAA
   through an EffectComposer whose offscreen targets have NO MSAA (MSAA
   only with ?msaa=1, and only on the no-post tiers). iOS: no float render
   targets at all (post off, no PMREM). Phones start one tier lower.
   A pixel read-back self-check steps quality down if the board renders black.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/postprocessing/ShaderPass.js';
import { Char, makeMaterials } from './chars.js';
import { EMO_COLORS } from './faces.js';

const LC = window.LC;
const sqX = s => (s & 7) - 3.5, sqZ = s => 3.5 - (s >> 3);
export const sqPos = (s, y = 0, out = new THREE.Vector3()) => out.set(sqX(s), y, sqZ(s));
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
// focus blur: blur grows with distance from the focus point (screen space); a depth-of-field look for close-ups, plus vignette, flash and tint
const FOCUS = { uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, focus: { value: new THREE.Vector2(0.5, 0.5) }, amt: { value: 0 }, rad: { value: 0.18 }, vig: { value: 0.35 }, flash: { value: 0 }, flashC: { value: new THREE.Color(1, 1, 1) }, tint: { value: new THREE.Color(1, 1, 1) } }, vertexShader: FXAA.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res, focus; uniform float amt, rad, vig, flash; uniform vec3 flashC, tint; varying vec2 vUv;
  void main(){ vec2 asp = vec2(res.x / res.y, 1.0); float d = length((vUv - focus) * asp); float b = amt * smoothstep(rad, rad + 0.35, d) * 6.0;
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    if (b > 0.05) { vec2 px = b / res; vec3 s = c * 0.2;
      s += 0.1 * (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb);
      s += 0.1 * (texture2D(tDiffuse, vUv + px * 0.7).rgb + texture2D(tDiffuse, vUv - px * 0.7).rgb + texture2D(tDiffuse, vUv + vec2(px.x, -px.y) * 0.7).rgb + texture2D(tDiffuse, vUv + vec2(-px.x, px.y) * 0.7).rgb);
      c = s; }
    c *= tint; vec2 v = vUv - 0.5; c *= 1.0 - vig * dot(v, v) * 2.0; c = mix(c, flashC, flash); gl_FragColor = vec4(c, 1.0); }` };

/* ---------- canvas textures ---------- */
function canvasTex(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }
function marble(x, w, h, base, vein, seed) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    x.strokeStyle = vein.replace('A', (0.05 + r() * 0.18).toFixed(2)); x.lineWidth = 0.5 + r() * 2.2; x.beginPath();
    let px = r() * w, py = r() * h; x.moveTo(px, py);
    for (let k = 0; k < 18; k++) { px += (r() - 0.3) * w * 0.12; py += (r() - 0.5) * h * 0.12; x.lineTo(px, py); } x.stroke();
  }
  const g = x.getImageData(0, 0, w, h); for (let i = 0; i < g.data.length; i += 4) { const n = (r() - 0.5) * 10; g.data[i] += n; g.data[i + 1] += n; g.data[i + 2] += n; } x.putImageData(g, 0, 0);
}

/* ---------- particles (points with a soft sprite) ---------- */
class Sparks {
  constructor(max, tex, blending = THREE.AdditiveBlending) {
    this.max = max; this.p = []; const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3)); g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, scale: { value: 300 } }, transparent: true, depthWrite: false, blending, vertexColors: true,
      vertexShader: `attribute float size; varying vec3 vC; uniform float scale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ float a = texture2D(map, gl_PointCoord).a; if (a < 0.01) discard; gl_FragColor = vec4(vC * a, a); }` });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.g = g;
  }
  add(o) { if (this.p.length >= this.max) this.p.shift(); this.p.push(Object.assign({ t: 0, life: 1, g: -3, drag: 1, s: 0.08 }, o)); }
  update(dt) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) { const p = this.p[i]; p.t += dt; if (p.t >= p.life) { this.p.splice(i, 1); continue; } }
    for (const p of this.p) {
      p.vy += p.g * dt; const d = Math.pow(p.drag, dt); p.vx *= d; p.vy *= d; p.vz *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.01 && p.g < 0) { p.y = 0.01; p.vy *= -0.3; }
      const k = 1 - p.t / p.life, f = p.fade === 'in' ? Math.sin(Math.PI * p.t / p.life) : k;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r * f; this.col[n * 3 + 1] = p.gC * f; this.col[n * 3 + 2] = p.b * f; this.size[n] = p.s * (p.grow ? 1 + p.t * p.grow : 1); n++;
    }
    this.g.setDrawRange(0, n); for (const k of ['position', 'color', 'size']) this.g.attributes[k].needsUpdate = true;
  }
}

export class Board3D {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts; this.msaa = !!opts.msaa;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; opts.onLost && opts.onLost(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; opts.onRestored && opts.onRestored(); }, false);
    const ua = navigator.userAgent;
    this.ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    this.mobile = this.ios || /Android/i.test(ua);
    this.phone = this.mobile && Math.min(screen.width, screen.height) < 600;
    { const gl = this.r.getContext(); this.hfOK = !this.ios && !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')); }
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
    this.maxTier = this.hfOK ? 3 : 1;
    this.tier = opts.q != null ? Math.min(+opts.q, this.maxTier) : Math.min(this.maxTier, this.mobile ? 2 : 3);
    if (this.mobile && opts.q == null) this.tier = Math.max(0, Math.min(this.tier, this.maxTier - 1, 2)); // phones/tablets start one tier lower
    this.lockTier = opts.q != null; this.ft = []; this.time = 0; this.lastCheck = -999; this.selfChecks = 0; this.blackHoles = 0; this.lastSelf = null;
    this.chars = new Map(); this.orient = 0; this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.camCur = { pos: new THREE.Vector3(0, 9, 9), look: new THREE.Vector3() }; this.camShot = null; this.shake = 0; this.flash = 0; this.focusAmt = 0; this.focusPt = new THREE.Vector2(0.5, 0.5);
    this.drift = { x: 0, y: 0 }; this.ghosts = []; this.dots = []; this.busy = 0; this.speed = 1;
  }
  async init(progress) {
    const p = f => progress && progress(f), y = () => new Promise(r => setTimeout(r, 0));
    const S = this.scene;
    S.background = new THREE.Color(0x0b0807); S.fog = new THREE.Fog(0x0b0807, 18, 40);
    // lights: warm key (shadows), cool rims behind, candle points, hemisphere fill
    this.hemi = new THREE.HemisphereLight(0xffe9cc, 0x2a1c14, this.ios ? 1.2 : 0.55); S.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe3b8, 2.6); this.key.position.set(-5, 11, 6); this.key.castShadow = true;
    const sc = this.key.shadow.camera; sc.left = -6.5; sc.right = 6.5; sc.top = 6.5; sc.bottom = -6.5; sc.near = 2; sc.far = 30; this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.bias = -0.0003; this.key.shadow.normalBias = 0.02; this.key.shadow.radius = 4;
    S.add(this.key, this.key.target);
    this.rimA = new THREE.DirectionalLight(0x7fb4ff, 1.5); this.rimA.position.set(7, 5, -8); S.add(this.rimA);
    this.rimB = new THREE.DirectionalLight(0xff9a6a, 0.9); this.rimB.position.set(-8, 4, -6); S.add(this.rimB);
    this.front = new THREE.DirectionalLight(0xfff2e0, 0.5); this.front.position.set(0, 4, 12); S.add(this.front);
    this.candles = []; for (const [x, z] of [[-6.2, -4.5], [6.3, 4.2]]) { const l = new THREE.PointLight(0xff9a40, 6, 9, 1.8); l.position.set(x, 1.6, z); S.add(l); this.candles.push(l); }
    this.fxLight = new THREE.PointLight(0xffd080, 0, 5, 2); S.add(this.fxLight);
    if (!this.ios) { try { S.environment = this.makeEnv(); } catch (e) { console.warn(e); } }
    p(0.25); await y();
    this.buildBoard(); p(0.55); await y();
    this.glowT = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
    this.sparks = new Sparks(1200, this.glowT); S.add(this.sparks.mesh);
    this.dust = new Sparks(220, this.glowT); S.add(this.dust.mesh);
    for (let i = 0; i < 160; i++) this.dust.add({ x: rnd(-8, 8), y: rnd(0.2, 6), z: rnd(-8, 8), vx: rnd(-0.03, 0.03), vy: rnd(-0.02, 0.03), vz: rnd(-0.03, 0.03), g: 0, life: 1e9, r: 0.5, gC: 0.4, b: 0.28, s: rnd(0.02, 0.05), drag: 1 });
    // shards for deaths
    this.shardGeo = new THREE.TetrahedronGeometry(0.06, 0);
    this.shards = []; this.shardMesh = [0, 1].map(side => { const m = new THREE.InstancedMesh(this.shardGeo, makeMaterials(side).body, 160); m.count = 0; m.castShadow = true; m.frustumCulled = false; S.add(m); return m; });
    this.mats = [makeMaterials(0), makeMaterials(1)];
    // highlights
    this.hlGeo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    const mk = (c, o) => { const m = new THREE.Mesh(this.hlGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.y = 0.012; m.visible = false; m.renderOrder = 1; S.add(m); return m; };
    this.hlSel = mk(0x3fa9ff, 0.45); this.hlLast = [mk(0xffc23a, 0.22), mk(0xffc23a, 0.3)]; this.hlCursor = mk(0x9cff6a, 0.4); this.hlCheck = mk(0xff2a2a, 0.0); this.hlCounsel = [mk(0x6fffd2, 0.0), mk(0x6fffd2, 0.0)];
    this.dotGeo = new THREE.CircleGeometry(0.12, 24).rotateX(-Math.PI / 2); this.ringGeo = new THREE.RingGeometry(0.36, 0.45, 32).rotateX(-Math.PI / 2);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x9fe7ff, transparent: true, opacity: 0.55, depthWrite: false });
    for (let i = 0; i < 32; i++) { const d = new THREE.Mesh(this.dotGeo, this.dotMat); d.visible = false; d.position.y = 0.015; d.renderOrder = 1; S.add(d); this.dots.push(d); }
    // aura disc under each emotional piece
    this.auraT = canvasTex(64, 64, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, w * 0.15, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false);
    this.auraGeo = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
    // ghost path arrows
    this.arrowMats = [new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }), new THREE.MeshBasicMaterial({ color: 0x6fffd2, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })];
    this.setupPost(); p(0.9); await y();
    this.resize(); this.setOrientation(0, true);
    p(1); this.ready = true;
  }
  makeEnv() {
    const pm = new THREE.PMREMGenerator(this.r), sc = new THREE.Scene();
    sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vP; void main(){ vec3 n = normalize(vP); vec3 c = mix(vec3(0.05,0.04,0.035), vec3(0.35,0.27,0.2), smoothstep(-0.2, 0.7, n.y));
        c += vec3(3.0,2.3,1.6) * pow(max(dot(n, normalize(vec3(-0.5,0.8,0.4))), 0.0), 40.0); c += vec3(0.6,0.9,1.6) * pow(max(dot(n, normalize(vec3(0.7,0.4,-0.6))), 0.0), 30.0); gl_FragColor = vec4(c, 1.0); }` })));
    const rt = pm.fromScene(sc, 0.04); pm.dispose(); return rt.texture;
  }
  buildBoard() {
    const S = this.scene, g = this.boardG = new THREE.Group(); S.add(g);
    const light = canvasTex(256, 256, (x, w, h) => marble(x, w, h, '#e9dcc3', 'rgba(120,100,80,A)', 7));
    const dark = canvasTex(256, 256, (x, w, h) => marble(x, w, h, '#4a5a4c', 'rgba(220,230,210,A)', 11));
    const lm = new THREE.MeshPhysicalMaterial({ map: light, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const dm = new THREE.MeshPhysicalMaterial({ map: dark, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.2 });
    const tile = new THREE.BoxGeometry(1, 0.1, 1);
    for (let s = 0; s < 64; s++) {
      const isLight = ((s & 7) + (s >> 3)) % 2 === 1; const m = new THREE.Mesh(tile, isLight ? lm : dm); m.position.set(sqX(s), -0.05, sqZ(s)); m.receiveShadow = true;
      if (isLight) { m.rotation.y = (s % 4) * Math.PI / 2; } g.add(m);
    }
    // frame with coordinates (drawn crisp on canvas), separate textures per orientation side handled by text both ways
    const wood = canvasTex(1024, 1024, (x, w, h) => {
      x.fillStyle = '#3a2214'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${20 + Math.random() * 40},${10 + Math.random() * 20},5,${0.15 + Math.random() * 0.25})`; x.lineWidth = 1 + Math.random() * 3; x.beginPath(); const yy = Math.random() * h; x.moveTo(0, yy); for (let k = 0; k <= 10; k++) x.lineTo(k * w / 10, yy + Math.sin(k * 0.8 + i) * 6); x.stroke(); }
      // coordinates (frame inner margin at 0.55 units around an 8-unit board: 9.1 units -> 1024px)
      const u = w / 9.1, o = u * 0.55; x.font = `700 ${Math.round(u * 0.3)}px Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#e8c27a';
      for (let i = 0; i < 8; i++) { const c = o + (i + 0.5) * u; const f = 'abcdefgh'[i], r = String(8 - i);
        x.fillText(f, c, h - o / 2); x.save(); x.translate(c, o / 2); x.rotate(Math.PI); x.fillText(f, 0, 0); x.restore();
        x.fillText(r, o / 2, c); x.save(); x.translate(w - o / 2, c); x.rotate(Math.PI); x.fillText(r, 0, 0); x.restore(); }
    });
    const fm = new THREE.MeshPhysicalMaterial({ map: wood, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.3 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.3, 9.1), [new THREE.MeshPhysicalMaterial({ color: 0x2a170d, roughness: 0.5, clearcoat: 0.6 }), new THREE.MeshPhysicalMaterial({ color: 0x2a170d, roughness: 0.5, clearcoat: 0.6 }), fm, fm, new THREE.MeshPhysicalMaterial({ color: 0x2a170d, roughness: 0.5, clearcoat: 0.6 }), new THREE.MeshPhysicalMaterial({ color: 0x2a170d, roughness: 0.5, clearcoat: 0.6 })]);
    frame.position.y = -0.2; frame.receiveShadow = true; frame.castShadow = true; g.add(frame);
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(8.12, 0.02, 8.12), new THREE.MeshStandardMaterial({ color: 0xc9a050, metalness: 0.9, roughness: 0.3 })); inlay.position.y = -0.055; g.add(inlay);
    // table
    const tableT = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#1c120c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { x.strokeStyle = `rgba(60,35,20,${Math.random() * 0.3})`; x.lineWidth = Math.random() * 4; x.beginPath(); const yy = Math.random() * h; x.moveTo(0, yy); x.bezierCurveTo(w / 3, yy + 10, 2 * w / 3, yy - 10, w, yy); x.stroke(); } });
    tableT.wrapS = tableT.wrapT = THREE.RepeatWrapping; tableT.repeat.set(4, 4);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: tableT, roughness: 0.6 })); table.rotation.x = -Math.PI / 2; table.position.y = -0.35; table.receiveShadow = true; S.add(table);
    // candles
    for (const c of this.candles) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 16), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.6 })); stick.position.set(c.position.x, 0.2, c.position.z); stick.castShadow = true; S.add(stick);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.8) })); fl.scale.y = 1.8; fl.position.set(c.position.x, 0.86, c.position.z); S.add(fl); c.userData.flame = fl;
    }
    // invisible pick plane
    this.pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false })); S.add(this.pickPlane);
    this.ray = new THREE.Raycaster();
  }
  setupPost() {
    this.composer = new EffectComposer(this.r); // default targets: HalfFloat, samples 0 (never MSAA offscreen)
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 0.9); this.composer.addPass(this.bloom);
    this.focusPass = new ShaderPass(FOCUS); this.composer.addPass(this.focusPass);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAA); this.composer.addPass(this.fxaa);
  }
  /** 3 = bloom + focus blur + FXAA, 2048 shadows, DPR<=2 · 2 = same, DPR<=1.5 · 1 = no post (MSAA only with ?msaa=1) · 0 = also no shadows */
  setTier(t) { t = Math.max(0, Math.min(this.maxTier, t)); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 999; this.selfChecks = 0; }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = Math.min(devicePixelRatio || 1, 3);
    const cap = this.tier >= 3 ? 2 : this.tier >= 1 ? 1.5 : 1;
    let pr = Math.min(dpr, cap); const maxPx = this.phone ? 2.2e6 : this.mobile ? 3.2e6 : 5.2e6; if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    this.pr = pr; this.W = w; this.H = h;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.fxaa.uniforms.res.value.set(w * pr, h * pr); this.focusPass.uniforms.res.value.set(w * pr, h * pr);
    const shadowOn = this.tier >= 1;
    if (this.r.shadowMap.enabled !== shadowOn) { this.r.shadowMap.enabled = shadowOn; this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
    const sm = this.tier >= 3 && !this.phone ? 2048 : 1024; if (this.key.shadow.mapSize.x !== sm) { this.key.shadow.mapSize.set(sm, sm); if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; } }
    this._sized = true; this.fit();
  }
  /** frame the board inside the free area (insets are the UI panels) */
  fit() {
    const w = this.W, h = this.H, I = this.insets, aw = Math.max(80, w - I.left - I.right), ah = Math.max(80, h - I.top - I.bottom);
    this.cam.aspect = w / h;
    const cx = I.left + aw / 2, cy = I.top + ah / 2; this.cam.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h); this.cam.updateProjectionMatrix();
    // distance so a 9.4-unit board (seen at ~52 degrees) fits the free area
    const tanV = Math.tan(this.cam.fov * Math.PI / 360), portrait = ah > aw * 1.05;
    const ext = 9.6, dV = (ext * 0.62) / tanV * (h / ah), dH = (ext / 2) / (tanV * w / h) * (w / aw) * 1.02;
    this.baseDist = Math.max(dV, dH) * (portrait ? 0.98 : 1.0); this.portrait = portrait;
  }
  setInsets(i) { this.insets = i; this.fit(); }
  setOrientation(side, snap) { this.orient = side; if (snap) { const s = this.homeShot(); this.camCur.pos.copy(s.pos); this.camCur.look.copy(s.look); } }
  homeShot() {
    const d = this.baseDist || 13, el = this.portrait ? 0.98 : 0.9, sgn = this.orient ? -1 : 1;
    const pos = new THREE.Vector3(this.drift.x * 0.6 * sgn, Math.sin(el) * d, Math.cos(el) * d * sgn - this.drift.y * 0.3 * sgn), look = new THREE.Vector3(0, -0.2, 0.35 * sgn);
    return { pos, look };
  }
  /** cinematic shot: look at a world point from close range, held for `hold` seconds */
  shot(target, o = {}) {
    const sgn = this.orient ? -1 : 1, d = o.dist || 4.2, el = o.el || 0.62, yaw = (o.yaw || 0);
    const pos = new THREE.Vector3(target.x + Math.sin(yaw) * d * Math.cos(el) * sgn, target.y + Math.sin(el) * d, target.z + Math.cos(yaw) * d * Math.cos(el) * sgn);
    this.camShot = { pos, look: target.clone().add(new THREE.Vector3(0, o.lookY || 0.4, 0)), t: 0, hold: o.hold || 1.5, k: o.k || 2.6, orbit: o.orbit || 0, focus: o.focus != null ? o.focus : 1 };
  }
  endShot() { this.camShot = null; }

  /* ---------- pieces ---------- */
  sync(chess) {
    const seen = new Set();
    for (let s = 0; s < 64; s++) {
      const p = chess.board[s]; if (!p) continue; const id = chess.ids[s], t = p & 7, side = (p & 8) ? 1 : 0; seen.add(id);
      let c = this.chars.get(id);
      if (c && (c.type !== t || c.side !== side)) { if (c.side !== side) { this.removeChar(id); c = null; } else c.retype(t); }
      if (!c) { c = new Char(t, side, id, this.mats[side]); this.chars.set(id, c); this.scene.add(c.root); c.aura = new THREE.Mesh(this.auraGeo, new THREE.MeshBasicMaterial({ map: this.auraT, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); c.aura.position.y = 0.02; c.root.add(c.aura); c.yaw = this.orient ? Math.PI : 0; }
      c.alive = true; c.dying = false; c.root.visible = true; c.root.scale.setScalar(1); c.body.rotation.set(0, 0, 0); c.dieTilt = 0; c.sq = s;
      sqPos(s, 0, c.root.position);
    }
    for (const [id] of this.chars) if (!seen.has(id)) this.removeChar(id);
  }
  removeChar(id) { const c = this.chars.get(id); if (!c) return; this.scene.remove(c.root); c.dispose(); this.chars.delete(id); }
  charAt(sq) { for (const c of this.chars.values()) if (c.alive && c.sq === sq) return c; return null; }

  /* ---------- highlights ---------- */
  setSel(sq) { this.hlSel.visible = sq != null; if (sq != null) sqPos(sq, 0.012, this.hlSel.position); for (const c of this.chars.values()) c.selT = c.sq === sq ? 1 : 0; }
  setLast(m) { this.hlLast.forEach((h, i) => { h.visible = !!m; if (m) sqPos(i ? m.to : m.from, 0.011, h.position); }); }
  setCursor(sq) { this.hlCursor.visible = sq != null; if (sq != null) sqPos(sq, 0.013, this.hlCursor.position); }
  setCheck(sq) { this.checkSq = sq; this.hlCheck.visible = sq != null; if (sq != null) sqPos(sq, 0.014, this.hlCheck.position); }
  setDots(list, occupied) { this.dots.forEach((d, i) => { const s = list[i]; d.visible = s != null; if (s != null) { d.geometry = occupied && occupied(s) ? this.ringGeo : this.dotGeo; sqPos(s, 0.016, d.position); } }); }
  setCounsel(uci) {
    this.counselT = uci ? 4 : 0; this.hlCounsel.forEach((h, i) => { h.visible = !!uci; if (uci) sqPos(LC.sqIdx(uci.slice(i * 2, i * 2 + 2)), 0.017, h.position); });
    this.setGhost(uci ? [{ from: LC.sqIdx(uci.slice(0, 2)), to: LC.sqIdx(uci.slice(2, 4)), side: -1 }] : null, 'counsel');
  }
  /** faint ghost path of a foreseen line: [{from,to,side}] (side relative: our = me) */
  setGhost(steps, key = 'preview', me = 0) {
    this.ghosts = this.ghosts.filter(gh => { if (gh.key === key) { this.scene.remove(gh.m); gh.m.geometry.dispose(); return false; } return true; });
    if (!steps) return;
    steps.slice(0, 6).forEach((st, i) => {
      const a = sqPos(st.from, 0), b = sqPos(st.to, 0), dir = b.clone().sub(a), len = dir.length(); if (len < 0.01) return;
      const w = 0.13, head = 0.32, sh = new THREE.Shape();
      sh.moveTo(-w / 2, 0.25); sh.lineTo(w / 2, 0.25); sh.lineTo(w / 2, len - head); sh.lineTo(w * 1.6, len - head); sh.lineTo(0, len - 0.12); sh.lineTo(-w * 1.6, len - head); sh.lineTo(-w / 2, len - head); sh.closePath();
      const mat = (st.side === -1 ? this.arrowMats[2] : st.side === me ? this.arrowMats[0] : this.arrowMats[1]).clone(); mat.opacity *= Math.pow(0.78, i);
      const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2); // shape +y -> world -z; yaw it along dir
      const m = new THREE.Mesh(geo, mat); m.position.copy(a); m.position.y = 0.03 + i * 0.004; m.renderOrder = 3; m.rotation.y = Math.atan2(-dir.x, -dir.z);
      this.scene.add(m); this.ghosts.push({ key, m, i, t: 0 });
    });
  }
  /* ---------- picking ---------- */
  pick(cx, cy) {
    const v = new THREE.Vector2(cx / this.W * 2 - 1, -(cy / this.H) * 2 + 1); this.ray.setFromCamera(v, this.cam);
    const proxies = []; for (const c of this.chars.values()) if (c.alive) proxies.push(c.proxy);
    const hit = this.ray.intersectObjects(proxies, false)[0];
    const ph = this.ray.intersectObject(this.pickPlane, false)[0];
    let sq = null; if (ph) { const f = Math.floor(ph.point.x + 4), r = Math.floor(4 - ph.point.z); if (f >= 0 && f < 8 && r >= 0 && r < 8) sq = r * 8 + f; }
    const c = hit ? this.chars.get(hit.object.userData.charId) : null;
    return { sq: c ? c.sq : sq, boardSq: sq, id: c ? c.id : null };
  }
  project(w) { const v = w.clone().project(this.cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, z: v.z }; }
  sqScreen(sq, y = 0.5) { return this.project(sqPos(sq, y)); }

  /* ---------- thoughts -> body language ---------- */
  applyThought(id, th) {
    const c = this.chars.get(id); if (!c) return;
    c.setState(th.emotion, th.intensity, th.gesture, th.point != null ? sqPos(th.point, 0.3) : null);
    c.auraColor = new THREE.Color(EMO_COLORS[th.emotion] || '#888'); c.auraK = ['calm', 'pride'].includes(th.emotion) ? 0 : th.intensity;
  }
  /** opponent pieces: visible body language only from public facts (attacked / just lost a friend), never their thoughts */
  applyPublic(id, emo, inten, pointSq) { const c = this.chars.get(id); if (!c) return; c.setState(emo, inten, emo === 'terror' ? 'cower' : emo === 'grief' ? 'mourn' : 'idle', pointSq != null ? sqPos(pointSq, 0.3) : null); c.auraK = 0; }
  clearThoughts(side) { for (const c of this.chars.values()) if (side == null || c.side === side) { c.setState('calm', 0.25, 'idle', null); c.auraK = 0; } }

  /* ---------- sequences ---------- */
  hooks(h) { this.h = h || {}; }
  sfx(n, o) { this.h && this.h.sfx && this.h.sfx(n, o); }
  async tween(dur, f) { dur /= this.speed; const t0 = performance.now(); return new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / (dur * 1000)); f(k); if (k < 1) this._tw.push(step); else res(); }; this._tw = this._tw || []; this._tw.push(step); }); }
  async moveChar(c, to, o = {}) {
    const from = c.root.position.clone(), dest = sqPos(to, 0), t = c.type, dist = from.distanceTo(dest);
    c.moving = true; c.moveYaw = Math.atan2(dest.x - from.x, dest.z - from.z); c.moveLean = t === 2 ? 1.2 : t === 1 ? 0.5 : 1;
    const stopAt = o.stopShort ? Math.max(0, 1 - 0.62 / Math.max(dist, 0.01)) : 1;
    const dur = (t === 2 ? 0.75 : t === 1 ? 0.3 + 0.28 * dist : t === 6 ? 0.55 + 0.3 * dist : 0.35 + 0.17 * dist) * (o.slow || 1);
    let lastStep = -1;
    await this.tween(dur, k => {
      const e = t === 2 ? k : ease(k), kk = e * stopAt;
      c.root.position.lerpVectors(from, dest, kk);
      if (t === 2) { c.hopY = Math.sin(Math.PI * k) * (0.6 + dist * 0.1); c.body.rotation.x = -0.35 * Math.sin(Math.PI * 2 * k); if (k > 0.98 && lastStep < 1) { lastStep = 1; this.sfx('step', { type: t }); } }
      else if (t === 1) { const steps = Math.max(1, Math.round(dist)); const ph = k * steps; c.hopY = Math.abs(Math.sin(Math.PI * ph)) * 0.18; const st = Math.floor(ph); if (st !== lastStep) { lastStep = st; this.sfx('step', { type: t }); } }
      else if (t === 6) { const ph = k * Math.max(2, dist * 2.2); c.hopY = Math.abs(Math.sin(Math.PI * ph)) * 0.06; c.wobble = Math.sin(Math.PI * ph) * 0.12; const st = Math.floor(ph); if (st !== lastStep) { lastStep = st; this.sfx('step', { type: t }); } }
      else { c.hopY = Math.sin(Math.PI * k) * (t === 5 ? 0.18 : 0.06); const st = Math.floor(k * 3); if (st !== lastStep) { lastStep = st; this.sfx('step', { type: t }); } }
    });
    c.hopY = 0; c.wobble = 0; c.moving = false; c.moveYaw = null;
    if (!o.stopShort) { c.sq = to; this.dust4(dest); }
  }
  dust4(p) { for (let i = 0; i < 10; i++) { const a = rnd(0, 6.28); this.sparks.add({ x: p.x, y: 0.03, z: p.z, vx: Math.cos(a) * rnd(0.3, 0.8), vy: rnd(0.1, 0.4), vz: Math.sin(a) * rnd(0.3, 0.8), g: -0.5, drag: 0.1, life: 0.6, r: 0.35, gC: 0.3, b: 0.25, s: 0.12, grow: 2 }); } }
  burst(p, col, n = 40, sp = 2.5, life = 0.7, s = 0.07) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), b = rnd(-1, 1); this.sparks.add({ x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp * rnd(0.3, 1), vy: rnd(0.2, 1.2) * sp, vz: Math.sin(a) * sp * rnd(0.3, 1), g: -6, drag: 0.4, life: life * rnd(0.6, 1.2), r: col[0], gC: col[1], b: col[2], s }); } }
  /** animate a played move record (from Chess.play). `after` = position after the move. */
  async playMove(rec, after, o = {}) {
    this.busy++;
    try {
      const mover = this.chars.get(rec.id); if (!mover) { this.sync(after); return; }
      const side = mover.side, cinematic = o.cinematic !== false;
      const victim = rec.captured ? this.chars.get(rec.capId) : null;
      if (victim) await this.captureSeq(mover, victim, rec, cinematic);
      else {
        if (rec.flags === 'k' || rec.flags === 'q') { // castling: king steps, rook hurries round
          const base = side ? 56 : 0, rf = rec.flags === 'k' ? base + 7 : base, rt = rec.flags === 'k' ? base + 5 : base + 3; const rook = this.charAt(rf);
          await Promise.all([this.moveChar(mover, rec.to), rook ? (async () => { await sleep(150); await this.moveChar(rook, rt); })() : null]);
          if (rook) rook.sq = rt;
        } else await this.moveChar(mover, rec.to);
      }
      if (rec.promo) await this.promoteSeq(mover, rec.promo);
      this.setLast(rec);
      this.sync(after);
    } finally { this.busy--; }
  }
  async captureSeq(att, vic, rec, cinematic) {
    const vp = vic.root.position.clone();
    if (cinematic) this.shot(vp.clone().lerp(att.root.position, 0.35), { dist: 4.6, el: 0.55, yaw: rnd(-0.5, 0.5), hold: 3, k: 3 });
    vic.doReact(vic.type === 2 || vic.type === 4 ? 'defy' : 'alarm', 3, att.root.position.clone().setY(0.6));
    this.sfx('gasp', { type: vic.type, side: vic.side });
    await this.moveChar(att, rec.capSq, { stopShort: true, slow: 1.1 });
    // duel: two exchanges of blows
    att.doReact('duel', 1.6, vp.clone().setY(0.6));
    for (let i = 0; i < 2; i++) {
      await this.tween(0.16, k => { att.lunge = Math.sin(Math.PI * k); att.root.position.lerp(vp, 0.06 * Math.sin(Math.PI * k)); });
      const mid = att.root.position.clone().lerp(vp, 0.5).setY(0.55);
      this.burst(mid, [3, 2.4, 1.2], 26, 2.2, 0.45, 0.06); this.flashLight(mid, 0xffe0a0, 6, 0.15); this.sfx('clash', { i });
      vic.doReact('flinch', 0.4); this.shake = Math.max(this.shake, 0.06);
      await sleep(140 / this.speed);
    }
    // death: knocked back, shatter, soul wisp
    this.sfx('cry', { type: vic.type, side: vic.side });
    vic.dying = true; vic.face.set('dead', 1);
    const back = vp.clone().sub(att.root.position).setY(0).normalize();
    await this.tween(0.35, k => { vic.dieTilt = k * 1.1 * (back.x >= 0 ? -1 : 1); vic.root.position.copy(vp).addScaledVector(back, k * 0.25); });
    this.shatter(vic); this.sfx('death', { type: vic.type });
    this.flash = 0.25; this.flashColor = new THREE.Color(1, 0.85, 0.7);
    for (let i = 0; i < 22; i++) this.sparks.add({ x: vp.x + rnd(-0.1, 0.1), y: 0.5 + rnd(0, 0.4), z: vp.z + rnd(-0.1, 0.1), vx: rnd(-0.1, 0.1), vy: rnd(0.4, 0.9), vz: rnd(-0.1, 0.1), g: 0.1, drag: 0.6, life: rnd(1.4, 2.4), r: 0.6, gC: 0.8, b: 1.6, s: rnd(0.08, 0.16), fade: 'in' });
    vic.alive = false; vic.root.visible = false;
    // survivors react: friends of the victim grieve, the attacker's side cheers
    for (const c of this.chars.values()) { if (!c.alive || c === att) continue; const d = c.root.position.distanceTo(vp); if (c.side === vic.side) { if (d < 3.2) c.doReact(d < 1.8 ? 'mourn' : 'horror', 2.6, vp.clone().setY(0.3)); } else if (d < 4) c.doReact('cheer', 1.8); }
    await sleep(250 / this.speed);
    await this.moveChar(att, rec.to, {});
    att.doReact('joy', 1.6);
    if (cinematic) await sleep(450 / this.speed);
    this.endShot();
  }
  shatter(c) {
    const p = c.root.position, h = c.height, col = c.side;
    for (let i = 0; i < 48; i++) { const a = rnd(0, 6.28); this.shards.push({ side: col, x: p.x + rnd(-0.15, 0.15), y: rnd(0.05, h), z: p.z + rnd(-0.15, 0.15), vx: Math.cos(a) * rnd(0.5, 2), vy: rnd(1, 3.2), vz: Math.sin(a) * rnd(0.5, 2), rx: rnd(0, 6), ry: rnd(0, 6), wx: rnd(-10, 10), wy: rnd(-10, 10), s: rnd(0.6, 1.5), t: 0, life: rnd(1.4, 2.2) }); }
  }
  flashLight(p, col, inten, dur) { this.fxLight.position.copy(p); this.fxLight.color.set(col); this.fxLight.intensity = inten; this.fxLightT = dur; this.fxLightI = inten; }
  async promoteSeq(c, promo) {
    const p = c.root.position.clone(); this.shot(p, { dist: 3.6, el: 0.5, hold: 2.2, k: 3 });
    this.sfx('promo');
    await this.tween(0.9, k => { c.hopY = Math.sin(Math.PI * k) * 0.7; c.root.rotation.y += 0.4; for (let i = 0; i < 3; i++) this.sparks.add({ x: p.x + rnd(-0.3, 0.3), y: rnd(0, 1.5), z: p.z + rnd(-0.3, 0.3), vx: 0, vy: rnd(1, 2.5), vz: 0, g: 0, drag: 0.8, life: 0.8, r: 2.4, gC: 2.0, b: 0.8, s: 0.09 }); });
    this.flash = 0.6; this.flashColor = new THREE.Color(1, 0.95, 0.8); this.flashLight(p.clone().setY(1), 0xfff0c0, 12, 0.6);
    c.retype(promo); this.burst(p.clone().setY(0.8), [2.6, 2.2, 1.0], 70, 2.4, 1.0, 0.09);
    await this.tween(0.45, k => { c.root.scale.setScalar(0.3 + 0.7 * ease(k)); }); c.root.scale.setScalar(1); c.hopY = 0;
    c.doReact('joy', 2.4); this.endShot();
  }
  checkAlarm(kingSq, side) {
    const k = this.charAt(kingSq); this.setCheck(kingSq); this.sfx('check');
    for (const c of this.chars.values()) if (c.alive && c.side === side) { c.alarm = 1.2; if (c !== k) c.doReact('alarm', 1.0, sqPos(kingSq, 0.8)); }
    if (k) k.doReact('alarm', 2.2);
    this.flash = 0.18; this.flashColor = new THREE.Color(1, 0.2, 0.15); this.shake = 0.08;
  }
  async mateSeq(kingSq, loser, winnerSide) {
    const k = this.charAt(kingSq); if (!k) return; const p = k.root.position.clone();
    this.shot(p, { dist: 5, el: 0.5, hold: 99, k: 1.4, orbit: 0.25 });
    this.sfx('mate', { win: winnerSide });
    k.doReact('alarm', 1.2); await sleep(900);
    k.dying = true; k.face.set('dead', 1);
    await this.tween(1.6, e => { k.dieTilt = ease(e) * 1.45; k.wobble = Math.sin(e * 20) * 0.08 * (1 - e); });
    this.burst(p.clone().setY(0.2), [0.6, 0.5, 0.45], 40, 1.4, 1.2, 0.12); this.shake = 0.12;
    for (const c of this.chars.values()) { if (!c.alive || c === k) continue; if (c.side === winnerSide) c.doReact('cheer', 9999); else c.doReact('mourn', 9999, p.clone().setY(0.3)); }
    for (let i = 0; i < 6; i++) setTimeout(() => this.burst(new THREE.Vector3(rnd(-3, 3), rnd(2, 3.5), rnd(-3, 3)), [rnd(1, 3), rnd(1, 3), rnd(0.5, 2)], 60, 2.4, 1.4, 0.08), 400 + i * 450);
  }
  /** a stalemate / draw: everybody slumps, shrugs */
  drawSeq() { for (const c of this.chars.values()) if (c.alive) c.doReact('doubt', 9999); }
  resetReactions() { for (const c of this.chars.values()) { c.react = null; c.reactT = 0; c.dying = false; c.dieTilt = 0; c.wobble = 0; } this.endShot(); this.setCheck(null); }

  /* ---------- per-frame ---------- */
  frame(dt, ctx = {}) {
    if (!this.ready || this.lost) return;
    this.time += dt; const T = this.time;
    if (!this._sized) this.resize();
    if (this._tw && this._tw.length) { const tw = this._tw; this._tw = []; for (const f of tw) f(); }
    // camera
    const home = this.homeShot(); let tp = home.pos, tl = home.look, k = 2.2, focusT = 0;
    if (this.camShot) { const s = this.camShot; s.t += dt; if (s.orbit) { const a = s.orbit * dt, c = Math.cos(a), sn = Math.sin(a), dx = s.pos.x - s.look.x, dz = s.pos.z - s.look.z; s.pos.x = s.look.x + dx * c - dz * sn; s.pos.z = s.look.z + dx * sn + dz * c; } tp = s.pos; tl = s.look; k = s.k; focusT = s.focus; if (s.t > s.hold && s.hold < 90) this.camShot = null; }
    else if (this.focusChar && this.tier >= 2) { // gentle push toward the hovered piece (close-up feel) with focus blur
      const c = this.focusChar; const fp = c.root.position; tp = home.pos.clone().lerp(new THREE.Vector3(fp.x, fp.y + 4.5, fp.z + (this.orient ? -5.2 : 5.2)), 0.18); tl = home.look.clone().lerp(fp, 0.25); focusT = 0.35;
    }
    const kk = 1 - Math.exp(-k * dt);
    this.camCur.pos.lerp(tp, kk); this.camCur.look.lerp(tl, kk);
    this.cam.position.copy(this.camCur.pos); if (this.shake > 0) { this.cam.position.x += rnd(-1, 1) * this.shake; this.cam.position.y += rnd(-1, 1) * this.shake; this.shake = Math.max(0, this.shake - dt * 0.4); }
    this.cam.lookAt(this.camCur.look);
    // focus point (screen) follows the shot target / hovered piece
    const fpW = this.camShot ? this.camShot.look : this.focusChar ? this.focusChar.root.position.clone().setY(0.6) : null;
    if (fpW) { const pp = this.project(fpW); this.focusPt.set(pp.x / this.W, 1 - pp.y / this.H); }
    this.focusAmt += (focusT - this.focusAmt) * Math.min(1, dt * 3);
    // characters
    const cctx = { camPos: this.cam.position, lowFace: this.tier <= 1 };
    for (const c of this.chars.values()) {
      c.hover += ((this.hoverId === c.id ? 1 : 0) - c.hover) * Math.min(1, dt * 8); c.sel += ((c.selT || 0) - c.sel) * Math.min(1, dt * 8);
      c.update(dt, cctx);
      if (c.aura) { const tk = (c.auraK || 0) * (0.35 + 0.25 * Math.sin(T * (c.emo === 'terror' ? 9 : 3))) + c.hover * 0.25; c.aura.material.opacity += (tk - c.aura.material.opacity) * Math.min(1, dt * 5); if (c.auraColor) c.aura.material.color.copy(c.auraColor); }
    }
    // shards
    let n0 = 0, n1 = 0; const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let i = this.shards.length - 1; i >= 0; i--) { const s = this.shards[i]; s.t += dt; if (s.t > s.life) { this.shards.splice(i, 1); continue; } s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.y < 0.03) { s.y = 0.03; s.vy *= -0.3; s.vx *= 0.6; s.vz *= 0.6; s.wx *= 0.6; } s.rx += s.wx * dt; s.ry += s.wy * dt; }
    for (const s of this.shards) { const m = this.shardMesh[s.side], idx = s.side ? n1++ : n0++; if (idx >= 160) continue; const f = Math.min(1, (s.life - s.t) * 2); q.setFromEuler(e.set(s.rx, s.ry, 0)); sc.setScalar(s.s * f); ps.set(s.x, s.y, s.z); mtx.compose(ps, q, sc); m.setMatrixAt(idx, mtx); }
    this.shardMesh[0].count = Math.min(160, n0); this.shardMesh[1].count = Math.min(160, n1); this.shardMesh[0].instanceMatrix.needsUpdate = this.shardMesh[1].instanceMatrix.needsUpdate = true;
    this.sparks.update(dt); this.dust.update(dt);
    for (const c of this.candles) { const f = 0.85 + 0.15 * Math.sin(T * 13 + c.position.x) * Math.sin(T * 7.3); c.intensity = 6 * f; if (c.userData.flame) c.userData.flame.scale.set(1, 1.8 * f, 1); }
    if (this.fxLightT > 0) { this.fxLightT -= dt; this.fxLight.intensity = Math.max(0, this.fxLightI * this.fxLightT * 4); } else this.fxLight.intensity = 0;
    this.hlCheck.material.opacity = this.checkSq != null ? 0.35 + 0.3 * Math.sin(T * 8) : 0;
    if (this.counselT > 0) { this.counselT -= dt; for (const h of this.hlCounsel) h.material.opacity = 0.25 + 0.25 * Math.sin(T * 6); if (this.counselT <= 0) this.setCounsel(null); }
    this.hlCursor.material.opacity = 0.3 + 0.15 * Math.sin(T * 5);
    for (const gh of this.ghosts) { gh.t += dt; gh.m.position.y = 0.03 + gh.i * 0.004 + Math.sin(T * 3 + gh.i) * 0.004; }
    // post
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const U = this.focusPass.uniforms; U.flash.value = this.flash * this.flash; if (this.flashColor) U.flashC.value.copy(this.flashColor); U.amt.value = this.focusAmt; U.focus.value.copy(this.focusPt);
    if (this.tier >= 2) this.composer.render(dt); else this.r.render(this.scene, this.cam);
    if (T - this.lastCheck > (this.selfChecks < 2 ? 1.2 : 20) && T > 1) { this.lastCheck = T; this.selfCheck(); }
    this.adapt(dt);
  }
  adapt(dt) {
    if (this.lockTier) return; this.ft.push(dt); if (this.ft.length < 90) return;
    const sorted = this.ft.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1]; this.ft.length = 0;
    if (med > 1 / 40 && this.tier > 0) { this.setTier(this.tier - 1); this.goodRuns = 0; console.info('[living-chess] quality ->', this.tier); }
    else if (med < 1 / 58) { this.goodRuns = (this.goodRuns || 0) + 1; if (this.goodRuns >= 6 && this.tier < this.maxTier && !this.raisedOnce) { this.raisedOnce = true; this.setTier(this.tier + 1); } }
  }
  /** read back board pixels right after rendering; black means a broken offscreen target -> step effects down */
  selfCheck() {
    this.selfChecks++;
    const gl = this.r.getContext(), pr = this.pr, H = this.H * pr, px = new Uint8Array(4); let black = 0, n = 0;
    for (let i = 0; i < 24; i++) { const s = (i * 37 + this.selfChecks * 11) % 64; if (this.charAt(s)) continue; const p = this.sqScreen(s, 0); if (p.x < 2 || p.y < 2 || p.x > this.W - 2 || p.y > this.H - 2) continue; gl.readPixels(Math.round(p.x * pr), Math.round(H - p.y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 6) black++; }
    this.lastSelf = { n, black, tier: this.tier };
    if (n >= 6 && black / n >= 0.25) {
      if (this.tier > 0) { console.warn(`[living-chess] black board pixels (${black}/${n}) at quality ${this.tier}; stepping down`); this.maxTier = this.tier - 1; this.setTier(this.maxTier); }
      else { this.blackHoles++; if (this.blackHoles === 3 && this.opts.onFatal) this.opts.onFatal('The 3D view renders black on this GPU even at the lowest quality.'); }
    }
  }
  stats() { return { tier: this.tier, maxTier: this.maxTier, lastSelf: this.lastSelf, pr: this.pr, ios: this.ios, hf: this.hfOK, chars: this.chars.size }; }
}
