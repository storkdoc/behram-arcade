/* ==========================================================================
   SKY SHIELD — render.js   (three.js r169, vendored)
   The gameplay plane is z = 0 (world x-80, y). The camera looks straight at
   it, so the 2D rules map 1:1 to the screen, while everything around it is
   real 3D: procedural skyline cities with lit windows that collapse and burn,
   three missile bases with visible interceptor racks, terrain, layered
   mountains, a per-wave sky dome (dusk, midnight, aurora, storm, blood moon…),
   glowing warhead trails with smoke, fireballs, shockwaves, debris, flashes.

   Post-processing: our own bloom chain on 8-bit (UnsignedByte) render targets
   with samples = 0. No MSAA on any offscreen target (black rectangles on Mac
   Safari/Chrome) and no float targets (unreliable on iOS). The scene target is
   sRGB-encoded (SRGB8_ALPHA8) so dark skies don't band. Canvas MSAA only with
   ?msaa=1. A pixel read-back self-check steps effects down if black appears.
   Tiers: 3 bloom + DPR 2 · 2 bloom (lighter) + DPR 1.5 · 1 no post · 0 minimal.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';

const S = window.SSSim;
const OX = S.W / 2;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const C = h => new THREE.Color(h);

/* ---------------- per-wave skies ---------------- */
export const SKIES = [
  { name: 'DUSK', top: '#0b1236', mid: '#36265a', hor: '#e8743c', glow: '#ff9a52', sunX: -0.55, stars: 0.35, moon: 0, clouds: 0.55, cloudCol: '#c86a6a', aur: 0, light: '#ffb98a', hemi: ['#6a5a9a', '#3a2418'], mount: '#1c1430', accent: '#ffb347' },
  { name: 'MIDNIGHT', top: '#02040e', mid: '#08122e', hor: '#22365e', glow: '#3d5d9e', sunX: 0.4, stars: 1, moon: 1, moonCol: '#e8eeff', clouds: 0.25, cloudCol: '#2c3a5c', aur: 0, light: '#9fb6ff', hemi: ['#30406a', '#141820'], mount: '#0a0e1c', accent: '#7fd4ff' },
  { name: 'CRIMSON', top: '#12040c', mid: '#3e0c1c', hor: '#c03a2a', glow: '#ff6040', sunX: 0.6, stars: 0.45, moon: 0, clouds: 0.65, cloudCol: '#5a1a22', aur: 0, light: '#ff9070', hemi: ['#5a2030', '#200a08'], mount: '#1a060c', accent: '#ff6a4a' },
  { name: 'AURORA', top: '#020814', mid: '#05202e', hor: '#164c5e', glow: '#2affa0', sunX: -0.3, stars: 1, moon: 0, clouds: 0.15, cloudCol: '#1a3a40', aur: 1, light: '#9affd8', hemi: ['#1a5050', '#0a1414'], mount: '#04121a', accent: '#5affc0' },
  { name: 'STORM', top: '#06070e', mid: '#1a1a30', hor: '#4e4060', glow: '#9a80ff', sunX: 0.1, stars: 0.1, moon: 0, clouds: 1, cloudCol: '#2a2a40', aur: 0, light: '#b0a8ff', hemi: ['#3a3a5a', '#121218'], mount: '#0c0c16', accent: '#b8a0ff', storm: 1 },
  { name: 'BLUE HOUR', top: '#030b22', mid: '#0d2c5e', hor: '#5482b8', glow: '#ffd2a2', sunX: 0.7, stars: 0.6, moon: 0.7, moonCol: '#fff4e0', clouds: 0.4, cloudCol: '#3a5a8a', aur: 0, light: '#c8d8ff', hemi: ['#3a5a8a', '#141a24'], mount: '#0a1630', accent: '#ffd28a' },
  { name: 'TOXIC DAWN', top: '#060b04', mid: '#1c2c0a', hor: '#7a8a24', glow: '#d2ff48', sunX: -0.7, stars: 0.2, moon: 0, clouds: 0.75, cloudCol: '#3a4a14', aur: 0, light: '#e0ff9a', hemi: ['#3a4a1a', '#141808'], mount: '#0e1606', accent: '#c8ff40' },
  { name: 'BLOOD MOON', top: '#0b0206', mid: '#2c0612', hor: '#621426', glow: '#ff3a3a', sunX: -0.2, stars: 0.75, moon: 1.3, moonCol: '#ff5a3a', clouds: 0.35, cloudCol: '#3a0a14', aur: 0, light: '#ff8a7a', hemi: ['#4a1420', '#14060a'], mount: '#14040a', accent: '#ff5050' },
];
export const skyFor = wave => SKIES[(wave - 1) % SKIES.length];

/* ---------------- shared shader bits ---------------- */
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
`;
const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* ---------------- billboard sprites / particles (instanced quads) ---------------- */
const BB_VS = `attribute vec3 iPos; attribute vec4 iCol; attribute float iSize; attribute float iRot; attribute vec3 iVel;
varying vec2 vUv; varying vec4 vCol;
void main(){ vUv = uv; vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos, 1.0); vec2 c = position.xy;
  if (dot(iVel, iVel) > 0.0) { vec3 v2 = (modelViewMatrix * vec4(iPos + iVel, 1.0)).xyz - mv.xyz; float L = length(v2.xy); vec2 d = L > 1e-5 ? v2.xy / L : vec2(1.0, 0.0); vec2 n = vec2(-d.y, d.x); mv.xy += d * c.x * (iSize + L) + n * c.y * iSize * 0.35; }
  else { float s = sin(iRot), co = cos(iRot); mv.xy += vec2(co * c.x - s * c.y, s * c.x + co * c.y) * iSize; }
  gl_Position = projectionMatrix * mv; }`;
const SMOKE_FS = `uniform sampler2D map; uniform vec3 light; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb * light, t.a * vCol.a); if (gl_FragColor.a < 0.004) discard;
#include <colorspace_fragment>
}`;
const ADD_FS = `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main(){ float a = texture2D(map, vUv).a * vCol.a; gl_FragColor = vec4(vCol.rgb * a, a);
#include <colorspace_fragment>
}`;
class Particles {
  constructor(max, mat) {
    this.max = max; this.p = [];
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    const A = (n, k) => new THREE.InstancedBufferAttribute(new Float32Array(n * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = A(max, 3); this.aCol = A(max, 4); this.aSize = A(max, 1); this.aRot = A(max, 1); this.aVel = A(max, 3);
    this.attrs = [this.aPos, this.aCol, this.aSize, this.aRot, this.aVel];
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot); g.setAttribute('iVel', this.aVel);
    g.instanceCount = 0; this.geo = g; this.n = 0;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false;
  }
  add(o) {
    if (this.p.length >= this.max) this.p.shift();
    o.age = 0; if (o.size1 == null) o.size1 = o.size; o.drag = o.drag || 0; o.grav = o.grav || 0; if (o.rot == null) o.rot = Math.random() * 6.28; o.vr = o.vr || 0; if (o.a == null) o.a = 1; o.vx = o.vx || 0; o.vy = o.vy || 0; o.vz = o.vz || 0; o.z = o.z || 0;
    this.p.push(o); return o;
  }
  /** one-frame sprite (heads, flares): drawn this frame only */
  put(x, y, z, size, r, g, b, a, rot = 0) { if (this.n >= this.max) return; const j = this.n++; this.aPos.array.set([x, y, z], j * 3); this.aCol.array.set([r, g, b, a], j * 4); this.aSize.array[j] = size; this.aRot.array[j] = rot; this.aVel.array.set([0, 0, 0], j * 3); }
  begin() { this.n = 0; }
  update(dt) {
    const P = this.p; let w = 0, j = this.n;
    const pos = this.aPos.array, col = this.aCol.array, sz = this.aSize.array, rot = this.aRot.array, vel = this.aVel.array;
    for (let i = 0; i < P.length; i++) {
      const o = P[i]; o.age += dt; if (o.age >= o.life) continue;
      const k = Math.pow(1 - Math.min(0.99, o.drag), dt * 60); o.vx *= k; o.vy *= k; o.vz *= k; o.vy -= o.grav * dt; if (o.wind) o.vx += o.wind * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt; o.rot += o.vr * dt;
      P[w++] = o; if (j >= this.max) continue;
      const u = o.age / o.life, fade = o.fade === 'in' ? Math.sin(u * Math.PI) : o.fade === 'late' ? (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4) : 1 - u;
      pos[j * 3] = o.x; pos[j * 3 + 1] = o.y; pos[j * 3 + 2] = o.z;
      col[j * 4] = o.r; col[j * 4 + 1] = o.g; col[j * 4 + 2] = o.b; col[j * 4 + 3] = o.a * fade;
      sz[j] = o.size + (o.size1 - o.size) * Math.sqrt(u); rot[j] = o.rot;
      const st = o.streak || 0; vel[j * 3] = o.vx * st; vel[j * 3 + 1] = o.vy * st; vel[j * 3 + 2] = o.vz * st;
      j++;
    }
    P.length = w; this.geo.instanceCount = j;
    for (const a of this.attrs) a.needsUpdate = true;
  }
  clear() { this.p.length = 0; this.geo.instanceCount = 0; this.n = 0; }
}

/* ---------------- glowing ribbons: warhead and interceptor trails ---------------- */
const RIB_VS = `attribute vec3 iA; attribute vec3 iB; attribute float iW; attribute vec4 iC0; attribute vec4 iC1; attribute float iHot;
varying vec2 vUv; varying vec4 vC0; varying vec4 vC1; varying float vD; varying float vHot;
void main(){ float t = position.x + 0.5; vec3 p = mix(iA, iB, t); vec2 d = iB.xy - iA.xy; float L = max(1e-4, length(d)); d /= L;
  vec2 n = vec2(-d.y, d.x); p.xy += n * position.y * iW + d * position.x * iW;
  vUv = vec2(t, position.y * 2.0); vC0 = iC0; vC1 = iC1; vD = (1.0 - t) * L; vHot = iHot;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const RIB_FS = `varying vec2 vUv; varying vec4 vC0; varying vec4 vC1; varying float vD; varying float vHot;
void main(){ float y = vUv.y; float core = exp(-y * y * 28.0), glow = exp(-y * y * 3.2) * 0.42;
  float hot = exp(-vD / max(0.01, vHot)); vec3 col = mix(vC0.rgb, vC1.rgb, hot); float a = mix(vC0.a, vC1.a, hot);
  float far = 1.0 - smoothstep(55.0, 140.0, vD) * 0.55;
  float f = (core * (0.55 + 0.45 * hot) + glow) * a * far; gl_FragColor = vec4(col * f, f);
#include <colorspace_fragment>
}`;
class Ribbons {
  constructor(max) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    const A = k => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.a = { iA: A(3), iB: A(3), iW: A(1), iC0: A(4), iC1: A(4), iHot: A(1) };
    for (const k in this.a) g.setAttribute(k, this.a[k]);
    g.instanceCount = 0; this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
  }
  begin() { this.n = 0; }
  seg(ax, ay, bx, by, w, c0, c1, hot, z = 0.2) {
    if (this.n >= this.max) return; const j = this.n++, a = this.a;
    a.iA.array.set([ax, ay, z], j * 3); a.iB.array.set([bx, by, z], j * 3); a.iW.array[j] = w;
    a.iC0.array.set(c0, j * 4); a.iC1.array.set(c1, j * 4); a.iHot.array[j] = hot;
  }
  end() { this.geo.instanceCount = this.n; for (const k in this.a) this.a[k].needsUpdate = true; }
}

/* ---------------- canvas textures ---------------- */
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }
function glowTex() { return canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }); }
function smokeTex() {
  return canvasTex(128, 128, (x) => {
    for (let i = 0; i < 26; i++) { const r = rnd(14, 34), px = 64 + rnd(-24, 24), py = 64 + rnd(-24, 24), g = x.createRadialGradient(px, py, 0, px, py, r); const v = Math.floor(rnd(170, 235)); g.addColorStop(0, `rgba(${v},${v},${v},0.32)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
    const m = x.getImageData(0, 0, 128, 128); for (let i = 0; i < m.data.length; i += 4) { const p = i / 4, X = p % 128 - 64, Y = Math.floor(p / 128) - 64, d = Math.hypot(X, Y) / 64; m.data[i + 3] *= Math.max(0, 1 - d * d); } x.putImageData(m, 0, 0);
  });
}
function sparkTex() { return canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }); }
function dirtTex() {
  return canvasTex(256, 256, (x) => {
    x.fillStyle = '#6e6660'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { const v = Math.floor(rnd(60, 150)); x.fillStyle = `rgba(${v},${v - 6},${v - 12},${rnd(0.1, 0.4)})`; x.fillRect(rnd(0, 256), rnd(0, 256), rnd(1, 4), rnd(1, 3)); }
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(30,26,22,${rnd(0.1, 0.3)})`; x.lineWidth = rnd(0.5, 2); x.beginPath(); let px = rnd(0, 256), py = rnd(0, 256); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-20, 20); py += rnd(-8, 8); x.lineTo(px, py); } x.stroke(); }
  });
}

/* ---------------- post-processing: 8-bit bloom chain, no MSAA, no float ---------------- */
const BRIGHT_FS = `uniform sampler2D tDiffuse; uniform float th; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float w = smoothstep(th, min(1.0, th + 0.3), l); gl_FragColor = vec4(c * w, 1.0); }`;
const BLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0); }`;
const COMP_FS = `uniform sampler2D tScene; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform float str; uniform float flash; uniform vec3 flashCol; uniform float vig; uniform float time; uniform float grain;
varying vec2 vUv;
void main(){ vec3 c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(b0, vUv).rgb * 0.8 + texture2D(b1, vUv).rgb * 0.9 + texture2D(b2, vUv).rgb * 1.0 + texture2D(b3, vUv).rgb * 1.2;
  c += b * str;
  c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.9);
  vec2 d = vUv - 0.5; c *= 1.0 - vig * dot(d, d) * 1.8;
  c = mix(c, flashCol, flash);
  float n = fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453); c += (n - 0.5) * grain;
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
#include <colorspace_fragment>
}`;
class Post {
  constructor(r) {
    this.r = r; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.quad);
    const o8 = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0, generateMipmaps: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, o8, { depthBuffer: true, colorSpace: THREE.SRGBColorSpace }));
    this.lv = []; for (let i = 0; i < 4; i++) this.lv.push([new THREE.WebGLRenderTarget(4, 4, o8), new THREE.WebGLRenderTarget(4, 4, o8)]);
    const M = (u, fs) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.mBright = M({ tDiffuse: { value: null }, th: { value: 0.7 } }, BRIGHT_FS);
    this.mBlur = M({ tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, BLUR_FS);
    this.mComp = M({ tScene: { value: this.scene.texture }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, str: { value: 0.9 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, vig: { value: 0.35 }, time: { value: 0 }, grain: { value: 0.012 } }, COMP_FS);
    for (let i = 0; i < 4; i++) this.mComp.uniforms['b' + i].value = this.lv[i][1].texture;
  }
  setSize(w, h, first) {
    this.scene.setSize(w, h);
    let d = first; for (const [a, b] of this.lv) { const lw = Math.max(2, Math.round(w / d)), lh = Math.max(2, Math.round(h / d)); a.setSize(lw, lh); b.setSize(lw, lh); d *= 2; }
  }
  pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.cam); }
  render(scene, camera) {
    const r = this.r; r.setRenderTarget(this.scene); r.render(scene, camera);
    let src = this.scene.texture;
    for (let i = 0; i < 4; i++) {
      const [a, b] = this.lv[i], B = this.mBlur.uniforms;
      if (i === 0) { this.mBright.uniforms.tDiffuse.value = src; this.pass(this.mBright, a); }
      else { B.tDiffuse.value = src; B.dir.value.set(0.5 / a.width, 0.5 / a.height); this.pass(this.mBlur, a); }
      B.tDiffuse.value = a.texture; B.dir.value.set(1 / a.width, 0); this.pass(this.mBlur, b);
      B.tDiffuse.value = b.texture; B.dir.value.set(0, 1 / a.height); this.pass(this.mBlur, a);
      B.tDiffuse.value = a.texture; B.dir.value.set(1.6 / a.width, 0); this.pass(this.mBlur, b);
      src = b.texture;
    }
    this.pass(this.mComp, null);
  }
}

/* ---------------- sky dome ---------------- */
const SKY_VS = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`;
const SKY_FS = NOISE + `uniform vec3 top, mid, hor, glow, cloudCol, moonCol, flashCol; uniform float sunX, stars, moon, clouds, aur, time, flash, fade; uniform vec3 moonDir;
varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float e = d.y;
  float t1 = smoothstep(-0.08, 0.17, e), t2 = smoothstep(0.18, 0.75, e);
  vec3 c = mix(hor, mid, t1); c = mix(c, top, t2);
  float az = d.x - sunX; float g = exp(-az * az * 4.0) * exp(-max(0.0, e) * 9.0); c += glow * g * 0.4;
  c += hor * exp(-abs(e) * 30.0) * 0.25;
  if (stars > 0.0 && e > 0.02) { vec3 sp = d * 260.0; vec3 ip = floor(sp); float h = h31(ip); if (h > 0.986) { vec3 f = fract(sp) - 0.5; float s = exp(-dot(f, f) * 40.0) * (0.5 + 0.5 * sin(time * (2.0 + h * 6.0) + h * 50.0)); c += vec3(0.9, 0.95, 1.0) * s * stars * smoothstep(0.02, 0.3, e) * (h - 0.986) * 70.0; } }
  if (aur > 0.0 && e > 0.05) { float x = d.x * 3.0 + time * 0.03; float band = fbm(vec3(x * 2.0, e * 3.0, time * 0.05)); float curtain = smoothstep(0.45, 0.9, fbm(vec3(x * 6.0, 0.0, time * 0.08))) * exp(-pow((e - 0.32) * 4.0, 2.0)); c += mix(vec3(0.1, 1.0, 0.55), vec3(0.6, 0.2, 1.0), smoothstep(0.25, 0.6, e)) * curtain * band * aur * 0.9; }
  if (moon > 0.0) { float md = distance(d, normalize(moonDir)); float rr = 0.03 * (0.8 + moon * 0.25); float disc = smoothstep(rr * 1.12, rr, md); float crat = 0.82 + 0.18 * vn(d * 140.0); c = mix(c, moonCol * crat, disc * min(1.0, moon)); c += moonCol * exp(-md * 18.0) * 0.16 * moon; }
  if (clouds > 0.0 && e > -0.02) { vec2 uv = d.xz / (e + 0.18); float n = fbm(vec3(uv * 1.4 + vec2(time * 0.008, 0.0), time * 0.01)); float cov = smoothstep(0.62 - clouds * 0.25, 0.95, n) * clouds; float lit = exp(-az * az * 2.0) * 0.6 + 0.25;
    vec3 cc = cloudCol * (0.35 + lit) + glow * g * 0.4; c = mix(c, cc, cov * smoothstep(-0.02, 0.12, e) * 0.85); }
  c = mix(c, flashCol, flash);
  c = max(c * fade, vec3(0.02, 0.022, 0.045));
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;

/* ---------------- fireballs, rings, crosshair ---------------- */
const FB_VS = NOISE + `uniform float uT, uSeed; varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){ vec3 p = position; float n = vn(p * 2.2 + uSeed + uT * 1.5); p *= 1.0 + (n - 0.5) * 0.28;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vP = position * 1.7 + uSeed; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FB_FS = NOISE + `uniform float uT, uHeat, uA, uTime; uniform vec3 uTint; varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){ float f = clamp(dot(normalize(vN), vV), 0.0, 1.0); float n = fbm(vP + vec3(0.0, uTime * 0.7, uTime * 0.4));
  float heat = pow(f, 1.3) * (1.25 - uT * 0.95) * uHeat + (n - 0.5) * 0.55;
  vec3 c = mix(vec3(0.35, 0.03, 0.01), vec3(1.0, 0.35, 0.05), smoothstep(0.05, 0.45, heat));
  c = mix(c, vec3(1.0, 0.82, 0.38), smoothstep(0.4, 0.8, heat)); c = mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.8, 1.15, heat));
  c = mix(c, uTint, (1.0 - f) * 0.35);
  float a = smoothstep(-0.1, 0.35, heat) * uA * (0.55 + 0.45 * f);
  gl_FragColor = vec4(c * a, a);
#include <colorspace_fragment>
}`;
const RING_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = `uniform float uR, uW, uA; uniform vec3 uC; varying vec2 vUv;
void main(){ float d = length(vUv - 0.5) * 2.0; float r = exp(-pow((d - uR) / max(0.005, uW), 2.0)); float a = r * uA; gl_FragColor = vec4(uC * a, a);
#include <colorspace_fragment>
}`;
const CROSS_FS = `uniform float uT, uFire; uniform vec3 uC; varying vec2 vUv;
void main(){ vec2 p = (vUv - 0.5) * 2.0; float d = length(p); float a = 0.0;
  float ang = atan(p.y, p.x) + uT * 0.8; float gaps = step(0.3, abs(sin(ang * 2.0)));
  a += exp(-pow((d - 0.62) / 0.045, 2.0)) * gaps;
  float ax = min(abs(p.x), abs(p.y)); a += exp(-ax * ax * 900.0) * step(0.18, d) * step(d, 0.42);
  a += exp(-d * d * 400.0) * 0.9 + exp(-pow((d - 0.62) / 0.2, 2.0)) * 0.12;
  a *= 1.0 + uFire * 1.5;
  vec3 c = mix(uC, vec3(1.0), uFire * 0.6);
  gl_FragColor = vec4(c * a, a);
#include <colorspace_fragment>
}`;

/* ---------------- building window shader (patched MeshStandardMaterial) ---------------- */
function cityMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.15 });
  m.userData.u = { uCol: { value: 0 }, uDead: { value: 0 }, uTime: { value: 0 }, uLit: { value: 1 }, uEmber: { value: 0 } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 aB; attribute vec2 aF; varying vec4 vB; varying vec2 vF; varying vec3 vNo; uniform float uCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vB = aB; vF = aF; vNo = normal;
      { float k = clamp(uCol * 1.7 - aB.w * 0.7, 0.0, 1.0); k = k * k * (3.0 - 2.0 * k); float rub = 0.12 + aB.z * 0.22;
        float hy = transformed.y + 1.0; transformed.y = hy * mix(1.0, rub, k) - 1.0; transformed.x += hy * 0.12 * k * (aB.w - 0.5); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 vB; varying vec2 vF; varying vec3 vNo; uniform float uDead, uTime, uLit, uEmber;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= mix(1.0, 0.18, uDead);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float side = 1.0 - step(0.5, abs(vNo.y));
        vec2 q = vF / vec2(0.62, 0.78); vec2 id = floor(q); vec2 f = fract(q);
        float win = step(0.18, f.x) * step(f.x, 0.78) * step(0.22, f.y) * step(f.y, 0.8) * step(2.0, id.y) * step(vF.y, vB.y + 0.6) * step(0.01, vB.y);
        float hsh = hh(id + vB.x * 17.0); float lit = step(hsh, vB.z * 0.6 + 0.25 * uLit);
        float flick = 0.88 + 0.12 * sin(uTime * (1.0 + hsh * 3.0) + hsh * 40.0);
        vec3 wc = mix(vec3(1.0, 0.72, 0.38), vec3(0.62, 0.8, 1.0), step(0.72, hh(id * 1.3 + vB.x)));
        wc = mix(wc, vec3(1.0, 0.92, 0.72), step(0.9, hh(id * 2.1 + vB.x)));
        float store = step(vF.y, 1.6) * step(1.05, vF.y) * step(0.15, fract(vF.x / 1.6)) * step(0.01, vB.y) * 0.5;
        totalEmissiveRadiance += side * (1.0 - uDead) * (win * (lit * wc * 0.95 * flick + vec3(0.03, 0.035, 0.05)) + store * vec3(1.0, 0.75, 0.45));
        float emb = uEmber * uDead * smoothstep(2.6, 0.6, vF.y) * (0.5 + 0.5 * sin(uTime * 3.0 + vF.x * 2.0 + hsh * 6.0));
        totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * emb * 0.8; }`);
  };
  m.customProgramCacheKey = () => 'ss-city-v1';
  return m;
}
/* boxes with per-vertex building data: aB = (seed, height, litFrac/rubble, stagger), aF = facade coords (u along face, v height) */
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.b = []; this.f = []; this.i = []; }
  box(x0, x1, y0, y1, z0, z1, col, bd) {
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], 'z'], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], 'z'],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], 'x'], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], 'x'],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], 'r'],
    ];
    for (const [a, b, c, d, nn, ax] of faces) {
      const base = this.p.length / 3;
      for (const v of [a, b, c, d]) { this.p.push(...v); this.n.push(...nn); this.c.push(col.r, col.g, col.b); this.b.push(...bd); const u = ax === 'z' ? (nn[0] > 0 ? z1 - v[2] : v[2] - z0) : ax === 'x' ? (nn[2] > 0 ? v[0] - x0 : x1 - v[0]) : 0; this.f.push(u, ax === 'r' ? 0 : v[1] - y0); }
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('aB', new THREE.Float32BufferAttribute(this.b, 4)); g.setAttribute('aF', new THREE.Float32BufferAttribute(this.f, 2)); g.setIndex(this.i); return g; }
}
/* terrain height (gameplay x; z = depth) */
export function groundH(x, z = 0) {
  let h = 0.15 * Math.sin(x * 0.21) + 0.12 * Math.sin(x * 0.53 + 1.3);
  for (const b of S.BASES) { const d = Math.abs(x - b.x), top = b.y - 1.0; h = Math.max(h, d < 4.2 ? top : d < 10 ? top * Math.pow(1 - (d - 4.2) / 5.8, 1.6) : 0); }
  if (x < 2) h += (2 - x) * 0.16; if (x > S.W - 2) h += (x - S.W + 2) * 0.16;
  const fz = Math.exp(-Math.pow(Math.max(0, Math.abs(z) - 3) / 9, 2));
  return h * fz + (z < -10 ? (-z - 10) * 0.18 : 0);
}

/* ---------------- the renderer ---------------- */
const FIELD = { x0: -84, x1: 84, y0: -5, y1: 130 };   // world area that must always be visible
const WC = (x, y, z = 0) => new THREE.Vector3(x - OX, y, z);
const RGBA = (hex, a = 1) => { const c = C(hex); return [c.r, c.g, c.b, a]; };
const FOE_COL = { icbm: ['#ff3d1f', '#fff2c0'], mirv: ['#ff2d55', '#ffe0f0'], bomb: ['#ffa21f', '#fff4c8'], buddy: ['#ff2dd2', '#ffe0ff'], smart: ['#ffe600', '#ffffff'] };

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts; this.msaa = !!opts.msaa;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; opts.onLost && opts.onLost(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; opts.onRestored && opts.onRestored(); }, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.NoToneMapping;
    this.mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    this.phone = this.mobile && Math.min(screen.width, screen.height) < 600;
    this.lockTier = opts.q != null; this.maxTier = 3;
    this.tier = this.lockTier ? clamp(+opts.q, 0, 3) : (this.mobile ? 2 : 3);
    this.ft = []; this.time = 0; this.lastCheck = -99; this.selfChecks = 0; this.lastSelf = null;
    this.shake = 0; this.flash = 0; this.flashCol = new THREE.Color(1, 1, 1); this.insets = { top: 0, bottom: 0, left: 0, right: 0 };
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(36, 1, 1, 4000);
    this.camBase = new THREE.Vector3(0, 62, 300); this.upp = 0.3; this.W = 1; this.H = 1; this.pr = 1;
    this.endT = -1; this.push = 0; this.fadeK = 1;
    this.build();
  }

  build() {
    const sc = this.scene;
    this.glowT = glowTex(); this.smokeT = smokeTex(); this.sparkT = sparkTex();
    /* lights (fixed count: shaders never recompile mid-game) */
    this.hemi = new THREE.HemisphereLight(0x6a5a9a, 0x3a2418, 1.3); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb98a, 1.4); this.sun.position.set(-60, 40, 80); sc.add(this.sun, this.sun.target);
    this.nPL = this.phone ? 3 : 5; this.plights = [];
    for (let i = 0; i < this.nPL; i++) { const l = new THREE.PointLight(0xffaa55, 0, 60, 1.2); l.userData = { t: 9, life: 1, i0: 0 }; sc.add(l); this.plights.push(l); }
    /* sky dome follows the camera */
    this.skyU = { top: { value: C('#000') }, mid: { value: C('#000') }, hor: { value: C('#000') }, glow: { value: C('#000') }, cloudCol: { value: C('#000') }, moonCol: { value: C('#fff') }, flashCol: { value: C('#fff') },
      sunX: { value: 0 }, stars: { value: 0 }, moon: { value: 0 }, clouds: { value: 0 }, aur: { value: 0 }, time: { value: 0 }, flash: { value: 0 }, fade: { value: 1 }, moonDir: { value: new THREE.Vector3(0.42, 0.2, -1) }, hz: { value: 0 } };
    const skyFS = SKY_FS.replace('void main(){ vec3 d = normalize(vDir); float e = d.y;', 'uniform float hz; void main(){ vec3 d = normalize(vDir); float e = (d.y - hz) * 2.4;');
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: skyFS, side: THREE.BackSide, depthWrite: false }));
    this.sky.frustumCulled = false; this.sky.renderOrder = -10; sc.add(this.sky);
    this.pal = null; this.palT = 1; this.setSky(1, true);
    /* mountains: three silhouette layers, scaled each fit so ridges sit at fixed screen heights */
    this.mounts = [];
    const lay = [{ z: -900, h: 30, rough: 0.6, seed: 3, lights: 0 }, { z: -420, h: 20, rough: 1, seed: 9, lights: 0 }, { z: -160, h: 11, rough: 1.4, seed: 17, lights: 1 }];
    for (const L of lay) {
      const pts = [], R = S.rng(L.seed); let y = L.h * 0.6;
      const N = 160; const sh = new THREE.Shape(); sh.moveTo(-700, -400);
      for (let i = 0; i <= N; i++) { const x = -700 + i / N * 1400; y += (R() - 0.5) * L.h * 0.22 * L.rough; y = clamp(y + (L.h * 0.6 - y) * 0.06, L.h * 0.15, L.h); const yy = y + Math.sin(i * 0.37 + L.seed) * L.h * 0.12; sh.lineTo(x, yy); pts.push([x, yy]); }
      sh.lineTo(700, -400); sh.lineTo(-700, -400);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: 0x111, fog: false }));
      m.userData = L; m.renderOrder = -5; sc.add(m); this.mounts.push(m);
      if (L.lights) { // distant town lights on the near range
        const g = new THREE.BufferGeometry(), P = [], Cc = [];
        for (let i = 0; i < 260; i++) { const k = Math.floor(R() * pts.length), [x, yy] = pts[k]; const yl = yy - 1 - R() * R() * 9; if (yl < 0.5) continue; P.push(x + (R() - 0.5) * 6, yl, 1); const w = R(); Cc.push(1, 0.62 + w * 0.3, 0.32 + w * 0.4); }
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
        const pm = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
        m.add(pm); m.userData.pts = pm;
      }
    }
    /* terrain: heightfield (near the field it follows the base mounds) */
    {
      const gw = 1400, zn = -14, zf = 520, nx = 420, nz = 60;
      const g = new THREE.PlaneGeometry(gw, zf - zn, nx, nz); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i) + (zn + zf) / 2; const gx = x + OX;
        const h = (gx > -20 && gx < S.W + 20) ? groundH(gx, z) : 0.25 * Math.sin(x * 0.11) + 0.3 * Math.sin(x * 0.031 + z * 0.02);
        p.setXYZ(i, x, h - 0.05 + (z > 6 ? -(z - 6) * 0.02 : 0), z);
        const d = Math.min(1, Math.abs(z) / 60); col.push(0.42 - d * 0.18, 0.38 - d * 0.16, 0.36 - d * 0.14);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const t = dirtTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(70, 26); t.anisotropy = 4;
      this.ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, vertexColors: true, roughness: 0.95, metalness: 0 })); sc.add(this.ground);
    }
    /* cities */
    this.cities = S.CITY_X.map((x, i) => this.buildCity(x, i));
    /* bases */
    this.bases = S.BASES.map((b, i) => this.buildBase(b, i));
    /* flyers, smart bombs */
    this.flyPool = []; this.smartPool = [];
    /* fireballs, rings, debris */
    this.fbGeo = new THREE.IcosahedronGeometry(1, this.phone ? 3 : 4);
    this.fbMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: 0 }, uHeat: { value: 1 }, uA: { value: 1 }, uTime: { value: 0 }, uTint: { value: C('#ff5020') } }, vertexShader: FB_VS, fragmentShader: FB_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.fbPool = []; this.fbLive = new Map();
    this.ringMat = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0.5 }, uW: { value: 0.05 }, uA: { value: 1 }, uC: { value: C('#fff') } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    this.ringGeo = new THREE.PlaneGeometry(2, 2); this.rings = [];
    { const dg = new THREE.BoxGeometry(1, 1, 1); this.debris = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 260); this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.debris.setColorAt(0, new THREE.Color()); this.debris.count = 0; this.debris.frustumCulled = false; sc.add(this.debris); this.deb = []; }
    /* particles */
    this.smoke = new Particles(this.phone ? 900 : 1500, new THREE.ShaderMaterial({ uniforms: { map: { value: this.smokeT }, light: { value: new THREE.Color(1, 1, 1) } }, vertexShader: BB_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false }));
    this.smoke.mesh.renderOrder = 2; sc.add(this.smoke.mesh);
    this.add = new Particles(this.phone ? 1100 : 1800, new THREE.ShaderMaterial({ uniforms: { map: { value: this.glowT } }, vertexShader: BB_VS, fragmentShader: ADD_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.add.mesh.renderOrder = 8; sc.add(this.add.mesh);
    this.rib = new Ribbons(700); sc.add(this.rib.mesh);
    /* crosshair */
    this.crossU = { uT: { value: 0 }, uFire: { value: 0 }, uC: { value: C('#7fffd4') } };
    this.cross = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: this.crossU, vertexShader: RING_VS, fragmentShader: CROSS_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.cross.renderOrder = 20; this.cross.scale.set(7.5, 7.5, 1); sc.add(this.cross);
    this.foeSt = new Map(); this.post = new Post(this.r);
  }

  buildCity(cx, i) {
    const R = S.rng(101 + i * 7919), gb = new GB(), spires = [];
    const tint = [C('#7d8696'), C('#8a8174'), C('#6f7c88'), C('#8b8f98'), C('#77706a'), C('#828a8c')];
    // back row: towers; front row: low blocks — staggered so every one shows its lit face
    const rows = [{ z0: -5.5, z1: -2.2, h: [6, 15], n: 6 }, { z0: -2.6, z1: 0.2, h: [3.5, 9], n: 7 }, { z0: 0, z1: 2.6, h: [1.6, 4.2], n: 6 }];
    let k = 0;
    for (const row of rows) {
      let x = -5.8 + R() * 0.4;
      while (x < 5.4) {
        const w = 1.0 + R() * 1.3, x1 = Math.min(5.9, x + w), h = row.h[0] + R() * R() * (row.h[1] - row.h[0]) * (1.25 - Math.abs(x + w / 2) / 8);
        const d = (row.z1 - row.z0) * (0.6 + R() * 0.4), z0 = row.z0 + R() * (row.z1 - row.z0 - d);
        const c = tint[Math.floor(R() * tint.length)].clone().multiplyScalar(0.55 + R() * 0.35);
        const bd = [R(), h, 0.35 + R() * 0.55, R()];
        gb.box(x, x1, -1, h, z0, z0 + d, c, bd);
        if (h > 6 && R() < 0.7) { const sx = (x + x1) / 2, sw = (x1 - x) * (0.3 + R() * 0.3); gb.box(sx - sw / 2, sx + sw / 2, h, h + 0.6 + R() * 1.4, z0 + d * 0.3, z0 + d * 0.7, c.clone().multiplyScalar(0.8), [bd[0], 0, 0, bd[3]]); }
        if (h > 9 && R() < 0.8) { const sx = (x + x1) / 2 + (R() - 0.5) * 0.3, sh = 1.5 + R() * 3; const top = h + sh + 1.2; gb.box(sx - 0.06, sx + 0.06, h, top, z0 + d / 2 - 0.06, z0 + d / 2 + 0.06, C('#555'), [bd[0], 0, 0, bd[3]]); spires.push({ x: sx, y: top, z: z0 + d / 2, ph: R() * 6, h: top }); }
        if (R() < 0.5) { const ax = x + R() * (x1 - x - 0.5); gb.box(ax, ax + 0.4, h, h + 0.35, z0 + 0.2, z0 + 0.6, C('#444'), [bd[0], 0, 0, bd[3]]); }
        x = x1 + 0.08 + R() * 0.35; k++;
      }
    }
    gb.box(-6.4, 6.4, -1, 0.15, -6, 3, C('#3a3a40'), [0, 0, 0, 0]); // slab
    const mat = cityMaterial(), mesh = new THREE.Mesh(gb.geo(), mat);
    const G = new THREE.Group(); G.position.set(cx - OX, groundH(cx) + 0.05, 0); G.add(mesh); this.scene.add(G);
    return { G, mesh, mat, u: mat.userData.u, spires, x: cx, alive: true, col: 0, colV: 0, burn: 0, fireT: 0 };
  }

  buildBase(b, i) {
    const G = new THREE.Group(), top = b.y - 1.0; G.position.set(b.x - OX, top, 0);
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a919c, roughness: 0.5, metalness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a3f48, roughness: 0.8, metalness: 0.3 });
    const conc = new THREE.MeshStandardMaterial({ color: 0x777068, roughness: 0.95 });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 0.7, 28), conc); pad.position.y = 0.0; G.add(pad);
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 2.2), dark); bunker.position.set(0, 0.9, -1.8); G.add(bunker);
    const slit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.35) })); slit.position.set(0, 1.2, -0.68); G.add(slit);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.6, 0.35), steel); rail.position.set(0, 1.8, -0.4); G.add(rail);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), steel); dish.position.set(i === 2 ? -2.6 : 2.6, 2.4, -2.2); dish.rotation.x = -0.9; G.add(dish);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.6, 6), steel); mast.position.set(dish.position.x, 1.6, -2.2); G.add(mast);
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.0, 0.6) });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lampM); lamp.position.set(i === 2 ? 1.5 : -1.5, 1.95, -1.8); G.add(lamp);
    // ammo rack: a 4-3-2-1 pyramid of interceptors in front; instance order = bottom row first, so count = ammo
    const mg = new THREE.CylinderGeometry(0.16, 0.2, 0.95, 10); mg.translate(0, 0.475, 0);
    const cone = new THREE.ConeGeometry(0.16, 0.34, 10); cone.translate(0, 1.12, 0);
    const missile = mergeGeos([mg, cone]);
    const mm = new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.35, metalness: 0.4, emissive: new THREE.Color(0.05, 0.08, 0.12) });
    const rack = new THREE.InstancedMesh(missile, mm, S.AMMO); const M = new THREE.Matrix4(); let n = 0;
    for (let row = 0; row < 4; row++) for (let c = 0; c < 4 - row; c++) { const nn = 4 - row; M.makeTranslation((c - (nn - 1) / 2) * 0.62, 0.36 + row * 0.95, 2.4 - row * 0.5); rack.setMatrixAt(n++, M); }
    rack.instanceMatrix.needsUpdate = true; G.add(rack);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 2.4), dark); shelf.position.set(0, 0.36, 1.6); G.add(shelf);
    G.scale.setScalar(1.4); this.scene.add(G);
    return { G, rack, lamp, lampM, mats: [steel, dark, conc, mm], x: b.x, y: b.y, alive: true, ammo: S.AMMO };
  }

  /* ---------- flyers ---------- */
  makeFlyer(kind) {
    const G = new THREE.Group(), lights = [];
    const hull = new THREE.MeshStandardMaterial({ color: kind === 'sat' ? 0xb8c0cc : 0x4a5260, roughness: 0.45, metalness: 0.7, emissive: new THREE.Color(0.04, 0.04, 0.06) });
    if (kind === 'bomber') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 7, 12).rotateZ(Math.PI / 2), hull); G.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.4, 12).rotateZ(-Math.PI / 2), hull); nose.position.x = 4.2; G.add(nose);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 9), hull); wing.position.x = 0.2; wing.rotation.y = 0.15; G.add(wing);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.12), hull); tail.position.set(-3.2, 0.8, 0); G.add(tail);
      const stab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 3.2), hull); stab.position.set(-3.2, 0.2, 0); G.add(stab);
      for (const e of [-2.6, 2.6]) { const en = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.2, 8).rotateZ(Math.PI / 2), hull); en.position.set(0.4, -0.3, e); G.add(en); }
      lights.push({ p: new THREE.Vector3(0.2, 0, 4.5), c: [1, 0.15, 0.1] }, { p: new THREE.Vector3(0.2, 0, -4.5), c: [0.15, 1, 0.3] }, { p: new THREE.Vector3(-3.6, 1.6, 0), c: [1, 1, 1], strobe: 1 });
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xd4a63a, roughness: 0.3, metalness: 0.9 })); G.add(body);
      const pm = new THREE.MeshStandardMaterial({ color: 0x1c2a6a, roughness: 0.25, metalness: 0.5, emissive: new THREE.Color(0.05, 0.1, 0.35) });
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 1.4), pm); p.position.x = s * 3.0; G.add(p); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), hull); arm.position.x = s * 1.1; G.add(arm); }
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, 1.0), hull); dish.position.y = -1.1; dish.rotation.x = Math.PI; G.add(dish);
      lights.push({ p: new THREE.Vector3(0, 0.95, 0), c: [1, 0.2, 0.2], strobe: 1 });
    }
    G.scale.setScalar(kind === 'sat' ? 1.0 : 0.95); G.userData = { kind, lights, id: -1 }; G.visible = false; this.scene.add(G);
    return G;
  }
  makeSmart() {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x222, roughness: 0.3, metalness: 0.8, emissive: new THREE.Color(1, 0.8, 0), emissiveIntensity: 0.6, flatShading: true }));
    m.visible = false; m.userData = { id: -1 }; this.scene.add(m); return m;
  }

  /* ---------- sizing / camera ---------- */
  setTier(t) { t = clamp(t, 0, this.maxTier); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 99; }
  setInsets(I) { this.insets = Object.assign({ top: 0, bottom: 0, left: 0, right: 0 }, I); if (this._sized) this.fitCamera(); }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = Math.min(devicePixelRatio || 1, 3);
    const cap = this.tier >= 3 ? 2 : this.tier >= 2 ? 1.5 : this.tier >= 1 ? 1.5 : 1;
    let pr = Math.min(dpr, cap); const maxPx = this.phone ? 2.0e6 : this.mobile ? 3.4e6 : 5.6e6; if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    this.pr = pr; this.W = w; this.H = h;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.post.setSize(Math.round(w * pr), Math.round(h * pr), this.tier >= 3 ? 2 : 4);
    this.fitCamera(); this._sized = true;
  }
  fitCamera() {
    const w = this.W, h = this.H, I = this.insets;
    const aw = Math.max(60, w - I.left - I.right), ah = Math.max(60, h - I.top - I.bottom);
    const fw = FIELD.x1 - FIELD.x0, fh = FIELD.y1 - FIELD.y0;
    const upp = Math.max(fw / aw, fh / ah); this.upp = upp;
    const tanV = Math.tan(this.cam.fov * Math.PI / 360), D = (h * upp / 2) / tanV;
    const fcx = (FIELD.x0 + FIELD.x1) / 2, fcy = (FIELD.y0 + FIELD.y1) / 2;
    const cxp = I.left + aw / 2, cyp = I.top + ah / 2;
    // the field fills the inset area; when the screen is taller than the field, keep the ground at the field's bottom edge
    this.camBase.set(fcx - (cxp - w / 2) * upp, fcy + (cyp - h / 2) * upp, D);
    this.cam.aspect = w / h; this.cam.near = Math.max(1, D * 0.05); this.cam.far = D + 3500; this.cam.updateProjectionMatrix();
    this.fitLayers();
  }
  fitLayers() {
    const cb = this.camBase, D = cb.z;
    for (const m of this.mounts) { const zl = m.userData.z, k = D / (D - zl), s = 1 / k; m.scale.set(s * 1.0, s, 1); m.position.set(cb.x * (1 - s), cb.y * (1 - s), zl); if (m.userData.pts) m.userData.pts.material.size = clamp(2.2 * this.pr / 1.5, 1, 3); }
    // sky horizon (direction elevation of the far ground line)
    this.skyU.hz.value = Math.sin(Math.atan2(6 - cb.y, D + 600));
  }
  /** gameplay -> CSS px (z = 0 plane) */
  project(x, y, z = 0) { const v = WC(x, y, z).project(this.cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H }; }
  /** CSS px -> gameplay coordinates on the z = 0 plane (ignores screen shake) */
  unproject(px, py) { const cb = this.camBase; return { x: cb.x + (px - this.W / 2) * this.upp + OX, y: cb.y - (py - this.H / 2) * this.upp }; }

  /* ---------- skies ---------- */
  setSky(wave, instant) {
    const p = skyFor(wave); if (this.pal === p && !instant) return; this.pal = p;
    this.palFrom = { top: this.skyU.top.value.clone(), mid: this.skyU.mid.value.clone(), hor: this.skyU.hor.value.clone(), glow: this.skyU.glow.value.clone(), cloudCol: this.skyU.cloudCol.value.clone(), moonCol: this.skyU.moonCol.value.clone(), sunX: this.skyU.sunX.value, stars: this.skyU.stars.value, moon: this.skyU.moon.value, clouds: this.skyU.clouds.value, aur: this.skyU.aur.value,
      light: this.sun.color.clone(), h0: this.hemi.color.clone(), h1: this.hemi.groundColor.clone(), mount: this.mounts ? this.mounts[0].material.color.clone() : C(p.mount) };
    if (this.mounts) for (const m of this.mounts) m.userData.c0 = m.material.color.clone();
    this.palT = instant ? 1 : 0; this.applySky(instant ? 1 : 0);
  }
  applySky(t) {
    const p = this.pal, f = this.palFrom, U = this.skyU, e = t * t * (3 - 2 * t);
    for (const k of ['top', 'mid', 'hor', 'glow', 'cloudCol']) U[k].value.copy(f[k]).lerp(C(p[k]), e);
    U.moonCol.value.copy(f.moonCol).lerp(C(p.moonCol || '#ffffff'), e);
    for (const k of ['sunX', 'stars', 'moon', 'clouds', 'aur']) U[k].value = f[k] + ((p[k] || 0) - f[k]) * e;
    this.sun.color.copy(f.light).lerp(C(p.light), e); this.hemi.color.copy(f.h0).lerp(C(p.hemi[0]), e); this.hemi.groundColor.copy(f.h1).lerp(C(p.hemi[1]), e);
    this.sun.position.set(U.sunX.value * 120, 50, 90);
    if (this.mounts) { const m0 = C(p.mount), hz = C(p.hor);
      this.mounts.forEach((m, i) => { const tgt = m0.clone().lerp(hz, [0.45, 0.25, 0.06][i]).multiplyScalar([1.0, 0.8, 0.62][i]); m.material.color.copy(m.userData.c0 || tgt).lerp(tgt, e); }); }
  }

  /* ---------- effects spawners ---------- */
  light(x, y, col, i0, life, z = 6) {
    let best = this.plights[0]; for (const l of this.plights) if (l.userData.t / l.userData.life > best.userData.t / best.userData.life) best = l;
    best.position.set(x - OX, y, z); best.color.set(col); best.userData = { t: 0, life, i0: i0 * (this.tier === 0 ? 0 : 1) }; best.intensity = best.userData.i0;
  }
  ring(x, y, r0, r1, life, col, w = 0.06, a = 1) {
    let m = this.rings.find(m => !m.visible);
    if (!m) { if (this.rings.length > 40) return; m = new THREE.Mesh(this.ringGeo, this.ringMat.clone()); m.renderOrder = 7; m.frustumCulled = false; this.scene.add(m); this.rings.push(m); }
    m.visible = true; m.position.set(x - OX, y, 0.6); m.userData = { t: 0, life, r0, r1, a, w }; m.material.uniforms.uC.value.set(col);
  }
  fireball(id, x, y, kind) {
    let m = this.fbPool.find(m => !m.visible);
    if (!m) { m = new THREE.Mesh(this.fbGeo, this.fbMat.clone()); m.renderOrder = 6; m.frustumCulled = false; this.scene.add(m); this.fbPool.push(m); }
    const U = m.material.uniforms; U.uSeed.value = Math.random() * 50; U.uT.value = 0; U.uA.value = 1;
    U.uHeat.value = kind === 'abm' ? 0.85 : kind === 'ground' ? 0.8 : 0.78;
    U.uTint.value.set(kind === 'abm' ? '#5aa0ff' : kind === 'ground' ? '#ff4010' : kind === 'air' ? '#ff8040' : '#ff5020');
    m.visible = true; m.position.set(x - OX, y, 0.3); m.scale.setScalar(0.01); m.userData = { id, kind, gone: 0, born: this.time };
    this.fbLive.set(id, m);
  }
  sparks(x, y, n, spd, col, life = 0.8, size = 0.45, grav = 18) {
    if (this.tier === 0) n = Math.ceil(n / 2);
    const c = C(col);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = spd * (0.3 + Math.random() * 0.7);
      this.add.add({ x: x - OX, y, z: 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(-3, 3), life: life * rnd(0.5, 1.2), size, size1: size * 0.3, r: c.r * 1.6, g: c.g * 1.6, b: c.b * 1.6, a: 1, drag: 0.04, grav, streak: 0.05 }); }
  }
  puffs(x, y, n, size, life, dark = 0.3, spread = 2, rise = 3) {
    if (this.tier === 0) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) { const v = dark * rnd(0.7, 1.1);
      this.smoke.add({ x: x - OX + rnd(-spread, spread), y: y + rnd(-spread, spread) * 0.6, z: rnd(-1, 1), vx: rnd(-1.5, 1.5), vy: rise * rnd(0.5, 1.2), life: life * rnd(0.7, 1.2), size: size * rnd(0.6, 1), size1: size * rnd(2, 3), r: v, g: v * 0.95, b: v * 0.92, a: rnd(0.45, 0.75), drag: 0.02, vr: rnd(-0.6, 0.6), wind: 0.8 }); }
  }
  shards(x, y, n, spd, hot = 1, size = 0.5) {
    for (let i = 0; i < n; i++) { if (this.deb.length >= 260) this.deb.shift(); const a = rnd(0.2, Math.PI - 0.2), v = spd * rnd(0.4, 1);
      this.deb.push({ x: x - OX, y, z: rnd(-1, 2), vx: Math.cos(a) * v * (Math.random() < 0.5 ? -1 : 1), vy: Math.sin(a) * v * 0.8 + rnd(-3, 3), vz: rnd(-4, 4), rx: rnd(0, 6), ry: rnd(0, 6), vrx: rnd(-9, 9), vry: rnd(-9, 9), s: size * rnd(0.4, 1.2), t: 0, life: rnd(1.4, 2.6), hot }); }
  }
  kick(s) { this.shake = Math.min(3.2, this.shake + s); }
  flashOn(a, col = '#ffffff') { this.flash = Math.max(this.flash, a); this.flashCol.set(col); }

  /** sim events -> visuals */
  fx(evs, g) {
    for (const e of evs) {
      switch (e.e) {
        case 'blast': {
          if (e.kind === 'emp') { this.empFx(e.x, e.y); break; }
          this.fireball(e.id, e.x, e.y, e.kind);
          const big = e.kind === 'ground' ? 1.4 : e.kind === 'abm' ? 1 : 0.8;
          this.ring(e.x, e.y, 0.2, e.r * 2.3 * big, 0.55, e.kind === 'abm' ? '#a8d0ff' : '#ffd0a0', 0.05, e.kind === 'abm' ? 0.45 : 0.6);
          this.sparks(e.x, e.y, e.kind === 'abm' ? 14 : 20, 26 * big, e.kind === 'abm' ? '#9cd0ff' : '#ffb050');
          this.light(e.x, e.y, e.kind === 'abm' ? '#a0c8ff' : '#ff9a40', 900 * big, 0.9);
          this.add.add({ x: e.x - OX, y: e.y, z: 1, life: 0.22, size: e.r * 2.2, size1: e.r * 4, r: 1.4, g: 1.2, b: 1.0, a: 0.9 });
          this.kick(e.kind === 'ground' ? 0.9 : e.kind === 'abm' ? 0.12 : 0.25);
          if (e.kind === 'ground') { this.puffs(e.x, e.y + 2, 10, 2.4, 3.6, 0.22, 3, 5); this.shards(e.x, e.y + 1, 10, 26, 1, 0.55); this.flashOn(0.12, '#ffb070'); }
          if (e.kind === 'abm' || e.kind === 'air') this.puffs(e.x, e.y, 3, 2.2, 2.6, 0.35, 2.5, 1.2);
          break; }
        case 'launch': { const b = S.BASES[e.base];
          this.add.add({ x: b.x - OX, y: b.y + 2.2, z: 1, life: 0.18, size: 3.5, size1: 6, r: 1.2, g: 1.3, b: 1.6, a: 1 });
          this.puffs(b.x, b.y + 1.2, 3, 1.4, 1.6, 0.55, 1.2, 2); this.light(b.x, b.y + 3, '#a8c8ff', 220, 0.25); this.kick(0.05); break; }
        case 'kill': {
          const air = e.kind === 'bomber' || e.kind === 'sat';
          this.shards(e.x, e.y, air ? 22 : 5, air ? 30 : 18, 1, air ? 0.7 : 0.35);
          this.sparks(e.x, e.y, air ? 30 : 8, air ? 34 : 20, e.kind === 'smart' ? '#fff080' : '#ffa050', 1.0);
          if (air) { this.puffs(e.x, e.y, 8, 2.6, 3.2, 0.2, 3, 1.5); this.kick(0.4); this.light(e.x, e.y, '#ffa050', 1300, 1.2); }
          break; }
        case 'split': this.sparks(e.x, e.y, 16, 18, '#ff80b0', 0.6); this.ring(e.x, e.y, 0.2, 9, 0.4, '#ff80c0', 0.08, 0.9); this.add.add({ x: e.x - OX, y: e.y, z: 1, life: 0.25, size: 3, size1: 7, r: 1.6, g: 0.7, b: 1.0, a: 1 }); break;
        case 'drop': this.add.add({ x: e.x - OX, y: e.y - 1, z: 1, life: 0.2, size: 2, size1: 3, r: 1.5, g: 1.1, b: 0.6, a: 1 }); break;
        case 'chain': this.ring(e.x, e.y, 0.5, 14, 0.5, '#ff60e0', 0.07, 1); break;
        case 'city': { const c = this.cities[e.i]; c.alive = false; c.colV = 1; c.burn = 1;
          this.shards(c.x, 6, 40, 30, 1, 0.8); this.puffs(c.x, 5, 18, 3.2, 5.5, 0.18, 5, 4); this.sparks(c.x, 6, 50, 40, '#ffa040', 1.3);
          this.light(c.x, 8, '#ff7020', 2600, 2.2); this.kick(1.6); this.flashOn(0.25, '#ff9050');
          this.ring(c.x, 3, 1, 46, 0.9, '#ffb070', 0.04, 0.9); break; }
        case 'cityback': { const c = this.cities[e.i]; c.alive = true; c.colV = -1; c.burn = 0; this.sparks(c.x, 4, 30, 18, '#80ffd0', 1.0, 0.4, -4); break; }
        case 'base': { const b = this.bases[e.i]; b.alive = false; this.shards(b.x, b.y, 30, 30, 1, 0.7); this.puffs(b.x, b.y + 2, 14, 3, 5, 0.18, 4, 4); this.kick(1.2); this.light(b.x, b.y + 3, '#ff8030', 2000, 1.6); this.setBaseDead(b, true); break; }
        case 'baseback': { const b = this.bases[e.i]; b.alive = true; this.setBaseDead(b, false); break; }
        case 'wave': this.setSky(e.n, !!e.first); this.endT = -1; this.push = 0; this.fadeK = 1; break;
        case 'end': this.endT = 0; this.flashOn(1, '#ffffff'); this.kick(3.2); this.fireball(-777, 80, 20, 'ground'); this.fbLive.get(-777).userData.big = true;
          this.puffs(80, 10, 40, 6, 9, 0.12, 50, 6); this.shards(80, 10, 60, 50, 1, 1.0); this.sparks(80, 15, 80, 60, '#ffb050', 2.2); this.ring(80, 10, 2, 200, 2.2, '#ffd0a0', 0.03, 1); this.light(80, 40, '#ffffff', 9000, 4); break;
        case 'emp': break;
      }
    }
  }
  empFx(x, y) {
    this.ring(x, y, 0.2, 90, 0.8, '#a0e0ff', 0.03, 1.2); this.ring(x, y, 0.1, 70, 1.1, '#6080ff', 0.06, 0.8); this.ring(x, y, 0.1, 40, 0.6, '#ffffff', 0.05, 1);
    this.flashOn(0.45, '#a8d8ff'); this.kick(0.8); this.light(x, y, '#a0d0ff', 4000, 1.2);
    this.arcs = { x, y, t: 0 };
    for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283, v = rnd(30, 70); this.add.add({ x: x - OX, y, z: 1, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.8), size: 0.6, size1: 0.2, r: 0.7, g: 1.2, b: 2, a: 1, drag: 0.03, streak: 0.06 }); }
  }
  setBaseDead(b, dead) {
    b.mats[0].color.set(dead ? 0x221c18 : 0x8a919c); b.mats[1].color.set(dead ? 0x16120f : 0x3a3f48); b.mats[2].color.set(dead ? 0x2a2420 : 0x777068);
    b.rack.visible = !dead; b.lamp.visible = !dead;
  }
  /** start-of-game reset (new game / attract switch) */
  reset(g) {
    for (const m of this.fbPool) m.visible = false; this.fbLive.clear(); for (const m of this.rings) m.visible = false;
    this.smoke.clear(); this.add.clear(); this.deb.length = 0; this.foeSt.clear(); this.endT = -1; this.push = 0; this.fadeK = 1; this.shake = 0; this.flash = 0; this.arcs = null;
    for (const f of this.flyPool) f.visible = false; for (const s of this.smartPool) s.visible = false;
    if (g) { g.cities.forEach((c, i) => { const R = this.cities[i]; R.alive = c.alive; R.col = c.alive ? 0 : 1; R.colV = 0; R.burn = c.alive ? 0 : 0.6; });
      g.bases.forEach((b, i) => { const B = this.bases[i]; B.alive = b.alive; this.setBaseDead(B, !b.alive); }); this.setSky(g.wave, true); }
  }

  /* ---------- per frame ---------- */
  frame(dtIn, g, o = {}) {
    if (this.lost) return;
    if (!this._sized) this.resize();
    const dt = Math.min(0.05, Math.max(0, dtIn)); this.time += dt; const T = this.time;
    this.rib.begin(); this.add.begin(); this.smoke.begin();
    const U = this.skyU; U.time.value = T;
    if (this.palT < 1) { this.palT = Math.min(1, this.palT + dt / 2.5); this.applySky(this.palT); }
    // storm lightning
    let sflash = 0;
    if (this.pal.storm && this.endT < 0) { this.bolt = (this.bolt || 0) - dt; if (this.bolt <= 0) { this.bolt = rnd(2.5, 7); this.boltT = 0.35; this.boltX = rnd(-0.6, 0.6); this.opts.onThunder && this.opts.onThunder(); }
      if (this.boltT > 0) { this.boltT -= dt; sflash = (Math.random() < 0.6 ? 1 : 0.3) * this.boltT * 1.4; } }
    U.flashCol.value.set('#c8c8ff'); U.flash.value = Math.min(0.55, sflash);
    // THE END: slow push in, sky dims to ember red
    if (this.endT >= 0) { this.endT += dt; this.push = Math.min(1, this.endT / 7); this.fadeK = 1 - 0.55 * Math.min(1, this.endT / 5); if (this.endT < 4 && Math.random() < dt * 6) this.kick(0.25); }
    U.fade.value = this.fadeK;
    // camera
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const sh = this.shake * this.shake * 0.6, cb = this.camBase, ease = this.push * this.push * (3 - 2 * this.push);
    this.cam.position.set(cb.x + (Math.random() - 0.5) * sh, cb.y + (Math.random() - 0.5) * sh - ease * cb.y * 0.25, cb.z * (1 - ease * 0.32));
    this.cam.lookAt(cb.x, cb.y - ease * cb.y * 0.32, 0);
    this.cam.rotation.z += (Math.random() - 0.5) * sh * 0.002;
    this.sky.position.copy(this.cam.position);
    if (g) this.drawGame(dt, g, o);
    // particles & debris
    this.smoke.mesh.material.uniforms.light.value.copy(this.hemi.color).lerp(new THREE.Color(1, 1, 1), 0.45).multiplyScalar(this.fadeK * (1 + sflash));
    this.smoke.update(dt); this.add.update(dt); this.rib.end();
    { const D = this.deb, M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(); let w = 0;
      for (let i = 0; i < D.length; i++) { const d = D[i]; d.t += dt; if (d.t > d.life) continue; d.vy -= 38 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += d.vrx * dt; d.ry += d.vry * dt;
        const gh = groundH(d.x + OX, d.z) + d.s * 0.3; if (d.y < gh) { d.y = gh; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.vrx *= 0.6; d.vry *= 0.6; }
        if (Math.random() < dt * 14 * d.hot && d.t < 1) this.smoke.add({ x: d.x, y: d.y, z: d.z, vy: 1, life: 0.9, size: 0.5, size1: 1.6, r: 0.25, g: 0.24, b: 0.23, a: 0.5 });
        D[w++] = d; const u = d.t / d.life, k = Math.max(0, 1 - d.t * 1.3);
        e.set(d.rx, d.ry, 0); q.setFromEuler(e); s.setScalar(d.s * (u > 0.8 ? (1 - u) * 5 : 1)); p.set(d.x, d.y, d.z); M.compose(p, q, s); this.debris.setMatrixAt(w - 1, M);
        c.setRGB(0.12 + 2.2 * k * d.hot, 0.1 + 0.9 * k * k * d.hot, 0.09 + 0.2 * k * k * k * d.hot); this.debris.setColorAt(w - 1, c); }
      D.length = w; this.debris.count = w; this.debris.instanceMatrix.needsUpdate = true; if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true; }
    for (const l of this.plights) { const u = l.userData; u.t += dt; const k = Math.max(0, 1 - u.t / u.life); l.intensity = u.i0 * k * k; }
    for (const m of this.rings) if (m.visible) { const u = m.userData; u.t += dt; const k = u.t / u.life; if (k >= 1) { m.visible = false; continue; } const r = u.r0 + (u.r1 - u.r0) * (1 - Math.pow(1 - k, 2.4)); m.scale.setScalar(Math.max(0.1, r)); const Uu = m.material.uniforms; Uu.uR.value = 0.9; Uu.uW.value = u.w * (1 + k); Uu.uA.value = u.a * (1 - k) * (1 - k); }
    // post
    const post = this.tier >= 2;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (post) { const P = this.post.mComp.uniforms; P.flash.value = Math.min(0.9, this.flash); P.flashCol.value.copy(this.flashCol); P.time.value = T % 100; P.str.value = this.tier >= 3 ? 0.95 : 0.8; P.grain.value = this.tier >= 3 ? 0.012 : 0; P.vig.value = 0.38 + (this.endT >= 0 ? 0.5 * Math.min(1, this.endT / 4) : 0);
      this.post.render(this.scene, this.cam); }
    else { U.flash.value = Math.max(U.flash.value, this.flash * 0.6); U.flashCol.value.copy(this.flashCol); this.r.setRenderTarget(null); this.r.render(this.scene, this.cam); }
    // self-check shortly after start / tier change, then every 20 s
    if ((this.selfChecks < 3 && T - this.lastCheck > 1.2) || T - this.lastCheck > 20) { this.lastCheck = T; this.selfCheck(); }
    // adaptive quality
    if (!this.lockTier) { this.ft.push(dtIn); if (this.ft.length >= 90) { const s = this.ft.slice().sort((a, b) => a - b), med = s[45]; this.ft.length = 0;
      if (med > 1 / 48 && this.tier > 0 && !document.hidden) { this.setTier(this.tier - 1); console.info('[sky-shield] quality ->', this.tier); } } }
  }

  drawGame(dt, g, o) {
    const T = this.time;
    // cities: collapse / rebuild animation, fires, spire beacons
    for (let i = 0; i < 6; i++) { const c = this.cities[i], u = c.u; u.uTime.value = T;
      if (c.colV) { c.col = clamp(c.col + c.colV * dt * (c.colV > 0 ? 0.9 : 0.6), 0, 1); if (c.col === 0 || c.col === 1) c.colV = 0; }
      u.uCol.value = c.col; u.uDead.value = clamp(c.col * 1.6, 0, 1); u.uEmber.value = c.burn;
      if (!c.alive) { c.burn = Math.max(0.25, c.burn - dt * 0.03); c.fireT -= dt;
        if (c.fireT <= 0) { c.fireT = this.tier === 0 ? 0.16 : 0.07; const x = c.x + rnd(-5, 5);
          this.add.add({ x: x - OX, y: rnd(0.5, 3), z: rnd(-2, 2.5), vx: rnd(-0.5, 0.5), vy: rnd(3, 7), life: rnd(0.5, 1.1), size: rnd(1.2, 2.4) * c.burn * 1.5, size1: 0.3, r: 1.5, g: 0.55, b: 0.12, a: 0.9, fade: 'in' });
          if (Math.random() < 0.5) this.smoke.add({ x: x - OX, y: rnd(3, 5), z: rnd(-2, 1), vx: rnd(0, 1), vy: rnd(3, 6), life: rnd(4, 7), size: 1.8, size1: rnd(6, 10), r: 0.1, g: 0.09, b: 0.09, a: 0.55 * c.burn + 0.15, wind: 1.2, vr: rnd(-0.3, 0.3), fade: 'late' }); } }
      else if (c.col < 0.3) for (const s of c.spires) { const on = Math.sin(T * 2.4 + s.ph) > 0.55; if (on) this.add.put(c.x - OX + s.x, s.y + c.G.position.y, s.z, 1.2, 1.6, 0.15, 0.1, 1); } }
    // bases: visible ammo stock, warning lamp
    g.bases.forEach((b, i) => { const B = this.bases[i]; if (B.alive !== b.alive) { B.alive = b.alive; this.setBaseDead(B, !b.alive); }
      B.rack.count = b.alive ? b.ammo : 0;
      const low = b.alive && b.ammo <= 3, on = !low || Math.sin(T * 10) > 0;
      B.lampM.color.setRGB(low ? (on ? 3 : 0.3) : 0.3, low ? 0.15 : 1.4, low ? 0.1 : 0.6);
      if (b.alive && low && on) this.add.put(b.x - OX + (i === 2 ? 2.1 : -2.1), B.G.position.y + 2.7, -1.4, 2.2, 1.6, 0.2, 0.1, 0.9);
      if (!b.alive && Math.random() < dt * 8) this.smoke.add({ x: b.x - OX + rnd(-2, 2), y: b.y + 1, z: rnd(-1, 1), vx: rnd(0, 1), vy: rnd(3, 5), life: rnd(3, 5), size: 1.5, size1: 7, r: 0.12, g: 0.11, b: 0.1, a: 0.5, wind: 1.2, fade: 'late' }); });
    // warheads
    const seen = new Set(); let si = 0;
    for (const f of g.foes) {
      seen.add(f.id); let st = this.foeSt.get(f.id); if (!st) { st = { puff: 0, hist: [[f.x0, f.y0]], ht: 0 }; this.foeSt.set(f.id, st); }
      const cols = FOE_COL[f.kind] || FOE_COL.icbm, c0 = RGBA(cols[0], 0.9), c1 = RGBA(cols[1], 1);
      if (f.kind === 'smart') {
        st.ht -= dt; if (st.ht <= 0) { st.ht = 0.08; st.hist.push([f.x, f.y]); if (st.hist.length > 40) st.hist.shift(); }
        const H = st.hist; for (let k = 1; k < H.length; k++) this.rib.seg(H[k - 1][0] - OX, H[k - 1][1], H[k][0] - OX, H[k][1], 0.8, RGBA('#ffb000', 0.25 + 0.5 * k / H.length), RGBA('#ffe000', 0.8), 2);
        const L = H[H.length - 1]; this.rib.seg(L[0] - OX, L[1], f.x - OX, f.y, 0.9, c0, c1, 3);
        let m = this.smartPool[si++]; if (!m) { m = this.makeSmart(); this.smartPool.push(m); }
        m.visible = true; m.position.set(f.x - OX, f.y, 0.4); m.rotation.set(T * 2.1, T * 3.3, 0); m.material.emissiveIntensity = 0.6 + 0.5 * Math.sin(T * 14);
        this.add.put(f.x - OX, f.y, 1, 5 + Math.sin(T * 14) * 1.2, 1.4, 1.2, 0.2, 0.8);
      } else {
        const w = f.kind === 'buddy' ? 1.1 : 0.95;
        this.rib.seg(f.x0 - OX, f.y0, f.x - OX, f.y, w, c0, c1, 9);
        const fl = 0.85 + 0.3 * Math.random();
        this.add.put(f.x - OX, f.y, 1, 2.6 * fl, c1[0] * 1.6, c1[1] * 1.5, c1[2] * 1.3, 1);
        this.add.put(f.x - OX, f.y, 1, 6 * fl, c0[0] * 0.8, c0[1] * 0.6, c0[2] * 0.6, 0.6);
      }
      st.puff -= dt; if (st.puff <= 0 && this.tier > 0) { st.puff = this.tier >= 3 ? 0.045 : 0.08;
        this.smoke.add({ x: f.x - OX + rnd(-0.3, 0.3), y: f.y + 0.6, z: rnd(-0.5, 0.5), vx: rnd(-0.4, 0.4), vy: rnd(-0.2, 0.6), life: rnd(1.8, 3), size: 0.8, size1: rnd(3.2, 4.6), r: 0.55, g: 0.52, b: 0.56, a: 0.32, wind: 0.6, vr: rnd(-0.5, 0.5) }); }
    }
    for (const id of this.foeSt.keys()) if (!seen.has(id)) this.foeSt.delete(id);
    for (; si < this.smartPool.length; si++) this.smartPool[si].visible = false;
    // interceptors
    for (const a of g.abms) {
      this.rib.seg(a.x0 - OX, a.y0, a.x - OX, a.y, 0.85, [0.2, 0.45, 1.0, 0.8], [0.85, 0.95, 1.0, 1], 6);
      this.add.put(a.x - OX, a.y, 1, 2.4, 1.4, 1.6, 2.0, 1);
      if (Math.random() < 0.5) this.add.add({ x: a.x - OX, y: a.y, z: 1, vx: -a.vx * 0.05 + rnd(-2, 2), vy: -a.vy * 0.05 + rnd(-2, 2), life: 0.35, size: 0.9, size1: 0.2, r: 1.2, g: 1.3, b: 1.8, a: 0.9 });
      const on = Math.sin(T * 20) > -0.3, X = a.tx - OX, Y = a.ty, s = 1.3;
      if (on) { const cc = [0.5, 0.8, 1.2, 1]; this.rib.seg(X - s, Y - s, X + s, Y + s, 0.35, cc, cc, 1); this.rib.seg(X - s, Y + s, X + s, Y - s, 0.35, cc, cc, 1); }
    }
    // fireballs follow the sim blasts
    const live = new Set(g.blasts.map(b => b.id));
    for (const b of g.blasts) { if (b.kind === 'emp') continue; const m = this.fbLive.get(b.id); if (!m) continue; m.scale.setScalar(Math.max(0.05, b.r)); m.userData.r = b.r;
      const Uf = m.material.uniforms; Uf.uT.value = clamp((T - m.userData.born) / 1.4, 0, 1); Uf.uTime.value = T; Uf.uA.value = 1; }
    for (const [id, m] of this.fbLive) {
      if (m.userData.big) { const t = T - m.userData.born, k = Math.min(1, t / 1.2); m.scale.setScalar(5 + k * 40 + t * 2); const Uf = m.material.uniforms; Uf.uT.value = clamp(t / 6, 0, 1); Uf.uTime.value = T; Uf.uA.value = Math.max(0, 1 - t / 7.5); if (t > 7.5) { m.visible = false; this.fbLive.delete(id); } continue; }
      if (!live.has(id)) { m.userData.gone += dt; const k = 1 - m.userData.gone / 0.25; if (k <= 0) { m.visible = false; this.fbLive.delete(id); } else { m.material.uniforms.uA.value = k; m.material.uniforms.uTime.value = T; } }
    }
    // EMP lightning arcs
    if (this.arcs) { const A = this.arcs; A.t += dt; if (A.t > 0.9) this.arcs = null; else { const b = g.blasts.find(b => b.kind === 'emp'), R = b ? b.r : 42 * Math.min(1, A.t / 0.75);
      for (let k = 0; k < 9; k++) { let a = Math.random() * 6.283, px = A.x, py = A.y; const n = 6; for (let j = 1; j <= n; j++) { const rr = R * j / n; a += rnd(-0.35, 0.35); const nx = A.x + Math.cos(a) * rr, ny = A.y + Math.sin(a) * rr; this.rib.seg(px - OX, py, nx - OX, ny, 0.5, [0.5, 0.8, 1.6, 0.9], [1, 1, 1.4, 1], 2); px = nx; py = ny; } }
      this.add.put(A.x - OX, A.y, 0.5, R * 2.4, 0.15, 0.35, 0.9, 0.7 * (1 - A.t / 0.9)); } }
    // bombers & satellites
    const flSeen = new Set();
    for (const f of g.flyers) { flSeen.add(f.id); let m = this.flyPool.find(m => m.userData.id === f.id);
      if (!m) { m = this.flyPool.find(m => m.userData.id === -1 && m.userData.kind === f.kind) || (this.flyPool.push(this.makeFlyer(f.kind)), this.flyPool[this.flyPool.length - 1]); m.userData.id = f.id; }
      m.visible = true; m.position.set(f.x - OX, f.y, -0.5);
      if (f.kind === 'bomber') { m.rotation.set(0.25 + Math.sin(T * 1.3 + f.id) * 0.06, f.vx > 0 ? 0 : Math.PI, Math.sin(T * 0.9 + f.id) * 0.04); }
      else { m.rotation.set(0.3, T * 0.8, Math.sin(T * 0.7) * 0.2); }
      for (const L of m.userData.lights) { const on = L.strobe ? (T * 1.6 + f.id) % 1 < 0.12 : true; if (!on) continue; const p = L.p.clone().applyMatrix4(m.matrixWorld); this.add.put(p.x, p.y, p.z + 1, L.strobe ? 3 : 1.6, L.c[0] * 1.6, L.c[1] * 1.6, L.c[2] * 1.6, 1); }
      if (f.kind === 'bomber' && Math.random() < dt * 20) { const bx = f.x - OX - Math.sign(f.vx) * 3.5; this.smoke.add({ x: bx, y: f.y - 0.2, z: rnd(-2.6, 2.6), vx: -f.vx * 0.2, life: 1.4, size: 0.6, size1: 2.4, r: 0.4, g: 0.4, b: 0.42, a: 0.25 }); }
    }
    for (const m of this.flyPool) if (m.userData.id !== -1 && !flSeen.has(m.userData.id)) { m.userData.id = -1; m.visible = false; }
    // crosshair
    const showX = o.cross !== false && (g.phase === 'play' || g.phase === 'intro') && !g.ended;
    this.cross.visible = showX; if (showX) { this.cross.position.set(g.cx - OX, g.cy, 1); this.crossU.uT.value = T; this.crossU.uFire.value = Math.max(0, (this._fireK || 0) - dt * 6); this._fireK = this.crossU.uFire.value; if (o.fired) this._fireK = 1;
      const s = (o.crossScale || 1) * clamp(7.5 * Math.max(1, this.upp / 0.35), 6, 12); this.cross.scale.set(s, s, 1); }
  }

  /** read back sky pixels right after rendering; black means a broken offscreen target -> step effects down */
  selfCheck() {
    this.selfChecks++;
    const gl = this.r.getContext(), pr = this.pr, Hh = Math.round(this.H * pr), px = new Uint8Array(4); let black = 0, n = 0;
    for (let i = 0; i < 40 && n < 24; i++) { const x = rnd(0.04, 0.96) * this.W, y = rnd(0.03, 0.5) * this.H; if (this.opts.covered && this.opts.covered(x, y)) continue;
      gl.readPixels(Math.round(x * pr), Math.round(Hh - y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 6) black++; }
    this.lastSelf = { n, black, tier: this.tier };
    if (n >= 6 && black / n >= 0.25 && this.tier > 0) { console.warn(`[sky-shield] black regions (${black}/${n}) at quality ${this.tier}; stepping effects down`); this.maxTier = this.tier - 1; this.setTier(this.maxTier); this.selfChecks = 0; }
  }
  stats() { return { tier: this.tier, maxTier: this.maxTier, lastSelf: this.lastSelf, pr: this.pr, upp: this.upp, particles: this.smoke.p.length + this.add.p.length }; }
}

/* merge indexed geometries (position + normal) */
function mergeGeos(list) {
  const P = [], N = [], I = []; let off = 0;
  for (const g0 of list) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) I.push(i + off);
    off += p.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setIndex(I); return g;
}
