/* ==========================================================================
   MELTDOWN — render.js  (three.js r169, vendored)
   A cutaway CROSS-SECTION of a PWR (or RBMK) unit: the vessel is cut in half
   along z = 0 so we look straight into the core. Fuel rods glow with the local
   flux (cosine shape, depressed under inserted control rods), Cherenkov blue
   in the water, coolant particles travel the loop coloured by temperature,
   steam generator, pressurizer, coolant pump, turbine-generator, beacons.
   Post: 8-bit bloom chain (UnsignedByte targets, samples = 0: no float RTs,
   no MSAA on offscreen targets) + heat shimmer + alarm tint in the composite.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';

const S = window.RXSim;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

// geometry constants (world units ~ metres)
const CORE_B = -2.4, CORE_T = 1.4, CORE_H = CORE_T - CORE_B, CORE_R = 1.62;
const V_RI = 2.2, V_RO = 2.42, V_YB = -3.0, V_YT = 3.2;
const ROD_X = S.RODX.map(x => x * 1.62);
const HOT_Y = 2.6, COLD_Y = 2.0;

/* ---------------- shaders ---------------- */
const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT_FS = `uniform sampler2D tDiffuse; uniform float th; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float w = smoothstep(th, min(1.0, th + 0.3), l); gl_FragColor = vec4(c * w, 1.0); }`;
const BLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0); }`;
const COMP_FS = `uniform sampler2D tScene; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform float str; uniform float flash; uniform vec3 flashCol; uniform float vig; uniform float time; uniform float grain;
uniform vec2 t1; uniform vec2 t2; uniform vec2 t3; uniform vec4 shim; uniform float shimA; uniform float aspect; uniform float alarm; uniform float scan;
varying vec2 vUv;
vec3 up(sampler2D s, vec2 t, vec2 uv){ vec2 o = t * 0.85; return texture2D(s, uv).rgb * 0.36 + (texture2D(s, uv + vec2(o.x, o.y)).rgb + texture2D(s, uv + vec2(-o.x, o.y)).rgb + texture2D(s, uv + vec2(o.x, -o.y)).rgb + texture2D(s, uv - o).rgb) * 0.16; }
void main(){
  vec2 uv = vUv;
  // heat shimmer: wavy refraction over the hot region (shim = centre xy, radius xy in uv)
  vec2 q = (uv - shim.xy) / max(shim.zw, vec2(0.001)); float m = exp(-dot(q, q) * 1.6) * shimA;
  uv += m * vec2(sin(uv.y * 90.0 + time * 7.0) + sin(uv.y * 47.0 - time * 5.0), cos(uv.x * 70.0 + time * 6.0)) * 0.0022;
  vec3 c = texture2D(tScene, uv).rgb;
  vec3 b = texture2D(b0, uv).rgb * 0.8 + up(b1, t1, uv) * 0.9 + up(b2, t2, uv) * 1.0 + up(b3, t3, uv) * 1.2;
  c += b * str;
  c = c / (1.0 + max(vec3(0.0), c - 0.85) * 0.9);
  vec2 d = vUv - 0.5; float vg = dot(d, d);
  c *= 1.0 - vig * vg * 1.8;
  c += vec3(0.9, 0.05, 0.02) * alarm * (0.25 + vg * 1.6);
  c *= 1.0 - scan * 0.06 * step(0.5, fract(gl_FragCoord.y * 0.5));
  c = mix(c, flashCol, flash);
  float n = fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453); c += (n - 0.5) * grain;
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
#include <colorspace_fragment>
}`;

const FUEL_VS = `uniform float uMelt; uniform float uTime; uniform float uScatter;
varying vec3 vW; varying vec3 vN; varying float vFront; varying float vLocalY;
void main(){
  vec4 lp = instanceMatrix * vec4(position, 1.0);
  vec3 p = lp.xyz;
  float ml = ${CORE_T.toFixed(2)} - uMelt * ${CORE_H.toFixed(2)} * 1.3;
  if (uMelt > 0.0 && p.y > ml) { float k = p.y - ml; p.y = ml + k * max(0.05, 1.0 - uMelt * 2.2); p.x += sin(p.y * 3.0 + p.z * 7.0 + uTime) * 0.05 * uMelt; }
  if (uScatter > 0.0) { float h = fract(sin(dot(lp.xz, vec2(12.9, 78.2))) * 43758.5); p += vec3(h - 0.5, h * 1.5, fract(h * 7.3) - 0.5) * uScatter * 6.0; }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz; vLocalY = p.y; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vFront = step(-0.3, lp.z);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FLUX_GLSL = `uniform float uRodY[9]; uniform float uRodX[9]; uniform float uTilt;
float flux(vec3 p){
  float fx = cos(clamp(p.x / 1.95, -1.0, 1.0) * 1.5708);
  float fy = cos(clamp((p.y - ${((CORE_B + CORE_T) / 2).toFixed(2)}) / 2.3, -1.0, 1.0) * 1.5708);
  float f = fx * fy * (1.0 + uTilt * p.x * 0.3);
  for (int i = 0; i < 9; i++) { float d = (p.x - uRodX[i]) / 0.34; float ins = smoothstep(uRodY[i] - 0.25, uRodY[i] + 0.25, p.y); f *= 1.0 - 0.6 * exp(-d * d) * ins; }
  return max(f, 0.0);
}`;
const FUEL_FS = FLUX_GLSL + `uniform float uGlow, uHeat, uCher, uLevel, uTime, uDamage, uRbmk;
varying vec3 vW; varying vec3 vN; varying float vFront; varying float vLocalY;
void main(){
  vec3 n = normalize(vN); vec3 L = normalize(vec3(0.35, 0.6, 0.75));
  float dif = 0.35 + 0.65 * max(0.0, dot(n, L)); float rim = pow(1.0 - abs(n.z), 3.0);
  vec3 base = mix(vec3(0.075, 0.08, 0.09), vec3(0.06, 0.06, 0.065), uRbmk) * dif + rim * 0.03;
  float f = flux(vW);
  float pel = 0.55 + 0.45 * step(0.1, fract(vW.y * 8.0));
  float g = clamp(uGlow * f, 0.0, 3.0);
  vec3 glowC = mix(vec3(1.0, 0.32, 0.06), vec3(1.0, 0.82, 0.5), clamp(g * 0.35, 0.0, 1.0));
  vec3 c = base * (1.0 - 0.5 * vFront * min(1.0, g)) + glowC * g * (0.22 + 0.9 * pel * vFront);
  float above = smoothstep(uLevel - 0.05, uLevel + 0.05, vW.y);
  float th = uHeat * (0.35 + 0.65 * above) * (0.5 + 0.5 * f);
  c += mix(vec3(0.7, 0.1, 0.0), vec3(1.0, 0.92, 0.75), clamp(th, 0.0, 1.0)) * th * 1.6;
  c += vec3(0.06, 0.25, 1.0) * uCher * f * (1.0 - above) * 0.22;
  c *= 1.0 - 0.45 * uDamage * (1.0 - clamp(th, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;
const ROD_VS = `attribute vec3 iEm; varying vec3 vN; varying vec3 vEm; varying float vY;
void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vEm = iEm; vY = position.y; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const ROD_FS = `uniform vec3 uBase; varying vec3 vN; varying vec3 vEm; varying float vY;
void main(){ vec3 n = normalize(vN); float d = 0.3 + 0.7 * max(0.0, dot(n, normalize(vec3(0.3, 0.6, 0.8)))); float sp = pow(max(0.0, dot(reflect(-normalize(vec3(0.3,0.6,0.8)), n), vec3(0,0,1))), 18.0);
  vec3 c = uBase * d + sp * 0.35 + vEm; gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;
const CHER_VS = `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const CHER_FS = FLUX_GLSL + `uniform float uI, uLevel, uTime, uVoid; varying vec3 vW;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float f = flux(vW); float w = 1.0 - smoothstep(uLevel - 0.1, uLevel + 0.1, vW.y);
  float nz = vn(vW.xy * 3.0 + vec2(0.0, -uTime * 0.6)) * 0.6 + vn(vW.xy * 9.0 + vec2(uTime * 0.3, -uTime * 1.4)) * 0.4;
  float edge = smoothstep(${(CORE_R + 0.3).toFixed(2)}, ${(CORE_R - 0.4).toFixed(2)}, abs(vW.x)) * smoothstep(${(CORE_B - 0.6).toFixed(2)}, ${CORE_B.toFixed(2)}, vW.y) * smoothstep(${(CORE_T + 0.9).toFixed(2)}, ${CORE_T.toFixed(2)}, vW.y);
  float a = uI * (0.2 + f) * w * edge * (0.6 + 0.8 * nz) * (1.0 - 0.6 * uVoid);
  a = a / (1.0 + a);
  vec3 c = mix(vec3(0.02, 0.16, 0.95), vec3(0.35, 0.7, 1.0), clamp(a * 0.8, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
#include <colorspace_fragment>
}`;
const WATER_FS = `uniform float uLevel, uTime, uA; uniform vec3 uCol; varying vec3 vW;
void main(){ if (vW.y > uLevel) discard; float surf = exp(-abs(vW.y - uLevel) * 30.0);
  float r = 0.5 + 0.5 * sin(vW.x * 5.0 + uTime * 1.5 + sin(vW.y * 3.0));
  vec3 c = uCol * (0.8 + 0.2 * r) + vec3(0.5, 0.8, 1.0) * surf * 0.6; gl_FragColor = vec4(c, uA + surf * 0.3);
#include <colorspace_fragment>
}`;
const PT_VS = `attribute vec3 color; attribute float size; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, size * uScale / -mv.z); gl_Position = projectionMatrix * mv; }`;
const PT_ADD_FS = `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * (1.0 - r) * vA; gl_FragColor = vec4(vC * a, a);
#include <colorspace_fragment>
}`;
const PT_SMOKE_FS = `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = (1.0 - r) * vA * 0.6; gl_FragColor = vec4(vC, a);
#include <colorspace_fragment>
}`;
const TUBE_VS = `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TUBE_FS = `uniform vec3 uHot, uCold; uniform float uI, uTime; varying vec2 vUv; varying vec3 vN;
void main(){ float d = 0.45 + 0.55 * abs(vN.z); vec3 c = mix(uHot, uCold, smoothstep(0.15, 0.85, vUv.x)); float pulse = 0.85 + 0.15 * sin(vUv.x * 40.0 - uTime * 6.0);
  gl_FragColor = vec4(c * d * uI * pulse, 1.0);
#include <colorspace_fragment>
}`;
const BACK_FS = `uniform float uTime, uRed; varying vec3 vW;
float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){ vec2 p = vW.xy; float panel = step(0.97, fract(p.x / 3.0)) + step(0.98, fract(p.y / 2.0)) * 0.6;
  float n = hh(floor(p * 6.0)) * 0.04; vec3 c = vec3(0.045, 0.05, 0.065) + n - panel * 0.02;
  float glow = exp(-pow((p.x - 2.0) / 9.0, 2.0) - pow((p.y - 1.5) / 7.0, 2.0)); c += vec3(0.02, 0.04, 0.08) * glow;
  c = mix(c, c + vec3(0.25, 0.0, 0.0) * glow, uRed);
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;
const FLOOR_FS = `uniform float uRed; varying vec3 vW; void main(){ vec2 g = abs(fract(vW.xz * 0.5) - 0.5); float l = smoothstep(0.48, 0.5, max(g.x, g.y));
  float fade = exp(-length(vW.xz - vec2(2.0, -1.0)) * 0.12); vec3 c = vec3(0.05, 0.055, 0.06) + l * vec3(0.05, 0.09, 0.1) * fade;
  float stripe = step(0.5, fract((vW.x + vW.z) * 1.2)) * step(abs(vW.z - 3.0), 0.12); c += stripe * vec3(0.25, 0.18, 0.0) * fade;
  c += vec3(0.2, 0.0, 0.0) * uRed * fade; gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;
const BEAM_FS = `uniform float uA; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y) * uA * (0.6 + 0.4 * sin(vUv.x * 6.283)); gl_FragColor = vec4(vec3(1.0, 0.12, 0.05) * a, a);
#include <colorspace_fragment>
}`;

/* ---------------- post (same 8-bit chain as SKY SHIELD) ---------------- */
class Post {
  constructor(r) {
    this.r = r; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.quad);
    const o8 = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0, generateMipmaps: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, o8, { depthBuffer: true, colorSpace: THREE.SRGBColorSpace }));
    this.lv = []; for (let i = 0; i < 4; i++) this.lv.push([new THREE.WebGLRenderTarget(4, 4, o8), new THREE.WebGLRenderTarget(4, 4, o8)]);
    const M = (u, fs) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.mBright = M({ tDiffuse: { value: null }, th: { value: 0.62 } }, BRIGHT_FS);
    this.mBlur = M({ tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, BLUR_FS);
    this.mComp = M({ tScene: { value: this.scene.texture }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, str: { value: 0.9 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, vig: { value: 0.4 }, time: { value: 0 }, grain: { value: 0.012 },
      t1: { value: new THREE.Vector2() }, t2: { value: new THREE.Vector2() }, t3: { value: new THREE.Vector2() }, shim: { value: new THREE.Vector4(0.5, 0.5, 0.2, 0.2) }, shimA: { value: 0 }, aspect: { value: 1 }, alarm: { value: 0 }, scan: { value: 1 } }, COMP_FS);
    for (let i = 0; i < 4; i++) this.mComp.uniforms['b' + i].value = this.lv[i][1].texture;
  }
  setSize(w, h, first) {
    this.scene.setSize(w, h);
    let d = first; for (const [a, b] of this.lv) { const lw = Math.max(2, Math.round(w / d)), lh = Math.max(2, Math.round(h / d)); a.setSize(lw, lh); b.setSize(lw, lh); d *= 2; }
    for (let i = 1; i < 4; i++) this.mComp.uniforms['t' + i].value.set(1 / this.lv[i][0].width, 1 / this.lv[i][0].height);
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

/* ---------------- point systems ---------------- */
class Points {
  constructor(max, fs, blending) {
    this.max = max; const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0); this.geo = g;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: PT_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.n = 0;
  }
  begin() { this.n = 0; }
  put(x, y, z, s, r, g, b, a) { if (this.n >= this.max) return; const i = this.n++; this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.size[i] = s; this.alpha[i] = a; }
  end() { this.geo.setDrawRange(0, this.n); for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true; }
}
class Sprites {   // simple CPU particle list feeding a Points system
  constructor(pts) { this.pts = pts; this.p = []; }
  add(o) { if (this.p.length > this.pts.max) this.p.shift(); o.age = 0; this.p.push(o); }
  update(dt) {
    const P = this.p; let w = 0;
    for (let i = 0; i < P.length; i++) { const o = P[i]; o.age += dt; if (o.age >= o.life) continue; o.x += o.vx * dt; o.y += o.vy * dt; o.z += (o.vz || 0) * dt; const dr = Math.exp(-(o.drag || 0) * dt); o.vx *= dr; o.vy = o.vy * dr + (o.g || 0) * dt; P[w++] = o; }
    P.length = w;
    for (const o of P) { const t = o.age / o.life, s = lerp(o.s0, o.s1, t), a = o.a * (t < 0.15 ? t / 0.15 : 1) * (1 - t); this.pts.put(o.x, o.y, o.z, s, o.r, o.g2, o.b, a); }
  }
}

/* ---------------- helpers ---------------- */
const half = (pts, segs = 40, mat) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs, Math.PI / 2, Math.PI); return new THREE.Mesh(g, mat); };
function capsuleProfile(R, yb, yt, capB = true, capT = true, n = 10) {
  const p = [];
  if (capB) for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / n * Math.PI / 2; p.push([Math.max(0.001, R * Math.cos(a)), yb + R * Math.sin(a)]); } else p.push([R, yb]);
  if (capT) for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; p.push([Math.max(0.001, R * Math.cos(a)), yt + R * Math.sin(a)]); } else p.push([R, yt]);
  return p;
}
function cutFace(inner, outer, mat) {   // ring cross-section in the z = 0 plane for x>0 and mirrored x<0
  const sh = new THREE.Shape(); outer.forEach(([r, y], i) => i ? sh.lineTo(r, y) : sh.moveTo(r, y)); for (let i = inner.length - 1; i >= 0; i--) sh.lineTo(inner[i][0], inner[i][1]);
  const g = new THREE.ShapeGeometry(sh); const grp = new THREE.Group(); const a = new THREE.Mesh(g, mat), b = new THREE.Mesh(g, mat); b.scale.x = -1; grp.add(a, b); return grp;
}
function pipe(points, r, mat, smooth = 0.3) {
  const P = []; for (let i = 0; i < points.length; i++) {
    const p = new THREE.Vector3(...points[i]);
    if (i > 0 && i < points.length - 1) { const a = new THREE.Vector3(...points[i - 1]), b = new THREE.Vector3(...points[i + 1]);
      const da = a.clone().sub(p), db = b.clone().sub(p); const ka = Math.min(smooth, da.length() / 2), kb = Math.min(smooth, db.length() / 2);
      P.push(p.clone().add(da.normalize().multiplyScalar(ka)), p.clone().add(db.normalize().multiplyScalar(kb))); }
    else P.push(p);
  }
  const path = new THREE.CurvePath(); for (let i = 1; i < P.length; i++) {
    if (i % 2 === 0 && i < P.length - 1 && points.length > 2) { const c = new THREE.Vector3(...points[i / 2]); path.add(new THREE.QuadraticBezierCurve3(P[i - 1], c, P[i])); }
    else path.add(new THREE.LineCurve3(P[i - 1], P[i]));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(16, points.length * 12), r, 12, false), mat);
}
// polyline sampler
class Poly {
  constructor(pts, temps) { this.p = pts; this.t = temps; this.c = [0]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; this.c.push(this.c[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); } this.L = this.c[this.c.length - 1]; this.zone = []; }
  at(u, out) { let d = (u % 1 + 1) % 1 * this.L, i = 1; while (i < this.c.length - 1 && this.c[i] < d) i++; const a = this.p[i - 1], b = this.p[i], k = (d - this.c[i - 1]) / Math.max(1e-6, this.c[i] - this.c[i - 1]);
    out[0] = lerp(a[0], b[0], k); out[1] = lerp(a[1], b[1], k); out[2] = lerp(a[2], b[2], k); out[3] = lerp(this.t[i - 1], this.t[i], k); out[4] = i - 1; return out; }
}

/* ======================================================================== */
export class Render {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts;
    this.mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform || ''));
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: !!opts.msaa, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x05070b, 1);
    this.lockTier = opts.q != null && opts.q !== '';
    this.tier = this.lockTier ? clamp(+opts.q, 0, 3) : (this.mobile ? 2 : 3); this.maxTier = 3;
    this.post = new Post(r); this.time = 0; this.ft = []; this.lastCheck = -99; this.selfChecks = 0; this.lastSelf = null;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    this.mode = 'PWR'; this.focus = 'plant'; this.camZoom = 0; this.shake = 0; this.flash = 0; this.flashCol = new THREE.Color(1, 1, 1); this.yaw = -0.2;
    this.view = { x: 0, y: 0, w: 1, h: 1 };
    this.build();
    this.resize();
  }
  /* ---------------- scene ---------------- */
  build() {
    const sc = this.scene, U = (v) => ({ value: v });
    this.hemi = new THREE.HemisphereLight(0x8fa3c8, 0x1a1c20, 1.1); sc.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xdfe8ff, 1.6); this.sun.position.set(6, 12, 14); sc.add(this.sun);
    this.coreLight = new THREE.PointLight(0x4a8cff, 0, 14, 1.6); this.coreLight.position.set(0, -0.5, 1.0); sc.add(this.coreLight);
    this.heatLight = new THREE.PointLight(0xff6a20, 0, 12, 1.6); this.heatLight.position.set(0, 0, 0.8); sc.add(this.heatLight);
    this.alarmLight = new THREE.PointLight(0xff2010, 0, 30, 1.2); this.alarmLight.position.set(2, 8, 6); sc.add(this.alarmLight);

    const steel = new THREE.MeshStandardMaterial({ color: 0x8995a6, metalness: 0.65, roughness: 0.38, side: THREE.DoubleSide });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x4a525e, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide });
    const cutMat = new THREE.MeshStandardMaterial({ color: 0xc9b9a0, metalness: 0.3, roughness: 0.5, emissive: 0x2a1408, side: THREE.DoubleSide });
    const glassPipe = new THREE.MeshStandardMaterial({ color: 0x9fb0c6, metalness: 0.5, roughness: 0.25, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
    const paint = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.3, roughness: 0.55 });
    this.mats = { steel, steelDark, cutMat, glassPipe };

    // backdrop + floor
    this.backU = { uTime: U(0), uRed: U(0) };
    const wallVS = `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.ShaderMaterial({ uniforms: this.backU, vertexShader: wallVS, fragmentShader: BACK_FS }));
    back.position.set(3, 6, -9); sc.add(back);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.ShaderMaterial({ uniforms: this.backU, vertexShader: wallVS, fragmentShader: FLOOR_FS }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(3, -3.75, 6); sc.add(floor);

    /* ---- PWR plant group ---- */
    const pwr = this.pwr = new THREE.Group(); sc.add(pwr);
    const inner = capsuleProfile(V_RI, V_YB, V_YT), outer = capsuleProfile(V_RO, V_YB, V_YT);
    pwr.add(half(inner, 48, steelDark)); pwr.add(half(outer, 48, steel)); pwr.add(cutFace(inner, outer, cutMat));
    // head flange + CRDM housings
    const fl = half([[V_RO, V_YT - 0.15], [V_RO + 0.22, V_YT - 0.15], [V_RO + 0.22, V_YT + 0.15], [V_RO, V_YT + 0.15]], 40, steel); pwr.add(fl);
    for (let i = 0; i < S.NR; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.1, 10), steel); h.position.set(ROD_X[i], V_YT + 2.2 + 0.2, -0.35); pwr.add(h);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.35, 10), paint(0x3a4452)); cap.position.set(ROD_X[i], V_YT + 3.35, -0.35); pwr.add(cap); }
    // core barrel
    const barrelP = [[1.86, -2.75], [1.86, 2.9]], barrelO = [[1.92, -2.75], [1.92, 2.9]];
    pwr.add(half(barrelP, 40, steelDark)); pwr.add(cutFace(barrelP, barrelO, cutMat));
    // lower / upper core plates
    for (const y of [CORE_B - 0.12, CORE_T + 0.15]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.1, 1.9), steelDark); pl.position.set(0, y, -0.95); pwr.add(pl); }
    // nozzles
    const noz = (y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.5, 16), steel); m.rotation.z = Math.PI / 2; m.position.set(V_RO + 0.15, y, z); pwr.add(m); };
    noz(HOT_Y, -0.05); noz(COLD_Y, -0.6);

    // water inside the vessel (back half volume, clipped at the level)
    this.waterU = { uLevel: U(5), uTime: U(0), uA: U(0.22), uCol: U(new THREE.Color(0.03, 0.13, 0.3)) };
    const wMat = new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: CHER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const wIn = capsuleProfile(V_RI - 0.02, V_YB, V_YT); this.water = new THREE.Group();
    this.water.add(half(wIn, 40, wMat)); const wf = new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); wIn.forEach(([r, y], i) => i ? s.lineTo(r, y) : s.moveTo(r, y)); for (let i = wIn.length - 1; i >= 0; i--) s.lineTo(-wIn[i][0], wIn[i][1]); return s; })()), wMat);
    wf.position.z = 0.01; this.water.add(wf); this.water.renderOrder = 2; pwr.add(this.water);

    /* ---- core (shared by PWR and RBMK) ---- */
    const core = this.core = new THREE.Group(); sc.add(core);
    const fuelU = this.fuelU = { uGlow: U(1), uHeat: U(0), uCher: U(1), uLevel: U(9), uTime: U(0), uDamage: U(0), uMelt: U(0), uScatter: U(0), uRbmk: U(0), uTilt: U(0),
      uRodY: U(new Array(9).fill(CORE_T)), uRodX: U(ROD_X.slice()) };
    const rodsPos = [];
    for (let row = 0; row < 6; row++) { const z = -0.12 - row * 0.27; for (let col = 0; col < 34; col++) { const x = -1.65 + col * 0.1 + (col >> 2) * 0.0; if (x * x + z * z > CORE_R * CORE_R) continue; if (col % 4 === 3 && row % 2) continue; rodsPos.push([x + (Math.floor(col / 4)) * 0.004, z]); } }
    const fg = new THREE.CylinderGeometry(0.036, 0.036, CORE_H, 8, 1);
    this.fuel = new THREE.InstancedMesh(fg, new THREE.ShaderMaterial({ uniforms: fuelU, vertexShader: FUEL_VS, fragmentShader: FUEL_FS }), rodsPos.length);
    const m4 = new THREE.Matrix4(); rodsPos.forEach(([x, z], i) => { m4.makeTranslation(x, (CORE_B + CORE_T) / 2, z); this.fuel.setMatrixAt(i, m4); });
    this.fuel.frustumCulled = false; core.add(this.fuel);
    // spacer grids
    const gridMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.55 });
    for (let k = 0; k < 6; k++) { const g = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.04, 0.02), gridMat); g.position.set(0, CORE_B + 0.25 + k * (CORE_H - 0.5) / 5, -0.08); core.add(g); }
    // assembly separators (thin vertical lines every 4 rods)
    for (let a = 1; a < 8; a++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.012, CORE_H, 0.012), gridMat); s.position.set(-1.65 + a * 0.4 - 0.05, (CORE_B + CORE_T) / 2, -0.07); core.add(s); }
    // control rods: 9 clusters x 3 absorber rods + spider + drive shaft
    this.rodU = { uBase: U(new THREE.Color(0.16, 0.17, 0.2)) };
    const rodMat = new THREE.ShaderMaterial({ uniforms: this.rodU, vertexShader: ROD_VS, fragmentShader: ROD_FS });
    const rg = new THREE.CylinderGeometry(0.03, 0.03, CORE_H, 8); rg.translate(0, CORE_H / 2, 0);   // origin at rod bottom
    this.rodMesh = new THREE.InstancedMesh(rg, rodMat, S.NR * 3); this.rodEm = new THREE.InstancedBufferAttribute(new Float32Array(S.NR * 3 * 3), 3); rg.setAttribute('iEm', this.rodEm); this.rodMesh.frustumCulled = false; core.add(this.rodMesh);
    const sg = new THREE.BoxGeometry(0.26, 0.05, 0.05); sg.translate(0, CORE_H + 0.02, 0); this.spider = new THREE.InstancedMesh(sg, steel, S.NR); this.spider.frustumCulled = false; core.add(this.spider);
    const dg = new THREE.CylinderGeometry(0.018, 0.018, 4.5, 6); dg.translate(0, CORE_H + 2.25, 0); this.shaft = new THREE.InstancedMesh(dg, steel, S.NR); this.shaft.frustumCulled = false; core.add(this.shaft);
    // RBMK graphite displacers (shown only in RBMK mode)
    const tg = new THREE.CylinderGeometry(0.034, 0.034, 1.9, 8); tg.translate(0, -1.9 / 2 - 0.25, 0);
    this.tips = new THREE.InstancedMesh(tg, new THREE.ShaderMaterial({ uniforms: { uBase: U(new THREE.Color(0.55, 0.55, 0.52)) }, vertexShader: ROD_VS, fragmentShader: ROD_FS }), S.NR * 3);
    this.tipEm = new THREE.InstancedBufferAttribute(new Float32Array(S.NR * 3 * 3), 3); tg.setAttribute('iEm', this.tipEm); this.tips.frustumCulled = false; this.tips.visible = false; core.add(this.tips);
    // Cherenkov glow plane
    this.cherU = Object.assign({ uI: U(1), uLevel: U(9), uTime: U(0), uVoid: U(0) }, { uRodY: fuelU.uRodY, uRodX: fuelU.uRodX, uTilt: fuelU.uTilt });
    const cher = new THREE.Mesh(new THREE.PlaneGeometry(4.6, CORE_H + 2), new THREE.ShaderMaterial({ uniforms: this.cherU, vertexShader: CHER_VS, fragmentShader: CHER_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    cher.position.set(0, (CORE_B + CORE_T) / 2 + 0.2, 0.05); cher.renderOrder = 5; core.add(cher);
    const cher2 = cher.clone(); cher2.position.z = -0.9; core.add(cher2);
    this.cherFU = Object.assign({}, this.cherU, { uI: U(0.3) }); cher.material = cher.material.clone(); cher.material.uniforms = this.cherFU;
    // corium pool
    this.corium = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
    this.corium.position.set(0, V_YB - 0.2, -0.3); this.corium.scale.set(0.01, 0.01, 0.01); this.corium.visible = false; sc.add(this.corium);

    /* ---- loop: hot leg, SG, pump, cold leg, pressurizer ---- */
    const SGX = 6.6;
    this.hotLeg = pipe([[2.4, HOT_Y, -0.05], [6.0, HOT_Y, -0.05], [6.2, 1.9, -0.05]], 0.3, glassPipe, 0.5); pwr.add(this.hotLeg);
    pwr.add(pipe([[7.0, 1.9, -0.05], [7.2, -0.5, -0.05], [5.0, -0.5, -0.05]], 0.28, glassPipe, 0.5));
    pwr.add(pipe([[4.2, -0.5, -0.6], [3.1, -0.5, -0.6], [3.1, COLD_Y, -0.6], [2.4, COLD_Y, -0.6]], 0.28, glassPipe, 0.4));
    // steam generator (cutaway)
    const sgI = [...capsuleProfile(0.95, 2.1, 5.2, true, false), [1.3, 5.9], ...capsuleProfile(1.3, 6.0, 7.4, false, true).slice(1)];
    const sgO = sgI.map(([r, y]) => [r + 0.1, y]);
    const sgG = new THREE.Group(); sgG.position.x = SGX; sgG.add(half(sgI, 40, steelDark)); sgG.add(half(sgO, 40, steel)); sgG.add(cutFace(sgI, sgO, cutMat)); pwr.add(sgG);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.9), steel); plate.position.set(SGX, 2.35, -0.45); pwr.add(plate);
    this.tubeU = { uHot: U(new THREE.Color(1, 0.35, 0.1)), uCold: U(new THREE.Color(0.2, 0.5, 1)), uI: U(1), uTime: U(0) };
    const tubeMat = new THREE.ShaderMaterial({ uniforms: this.tubeU, vertexShader: TUBE_VS, fragmentShader: TUBE_FS });
    for (let k = 0; k < 6; k++) { const w = 0.15 + k * 0.12, top = 4.2 + k * 0.17, z = -0.25 - (k % 3) * 0.2;
      const c = new THREE.CurvePath(); c.add(new THREE.LineCurve3(new THREE.Vector3(-w, 2.4, z), new THREE.Vector3(-w, top, z)));
      c.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w, top, z), new THREE.Vector3(0, top + w * 1.2, z), new THREE.Vector3(w, top, z))); c.add(new THREE.LineCurve3(new THREE.Vector3(w, top, z), new THREE.Vector3(w, 2.4, z)));
      const t = new THREE.Mesh(new THREE.TubeGeometry(c, 48, 0.035, 6, false), tubeMat); t.position.x = SGX; pwr.add(t); }
    this.sgWaterU = { uLevel: U(4), uTime: U(0), uA: U(0.3), uCol: U(new THREE.Color(0.05, 0.2, 0.38)) };
    const sgW = half(capsuleProfile(0.93, 2.42, 7.3, false, false), 30, new THREE.ShaderMaterial({ uniforms: this.sgWaterU, vertexShader: CHER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    sgW.position.x = SGX; sgW.renderOrder = 2; pwr.add(sgW);
    // reactor coolant pump with motor + fan
    const pumpG = new THREE.Group(); pumpG.position.set(4.6, -0.5, -0.3);
    const casing = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), paint(0x5a6472)); pumpG.add(casing);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 20), paint(0x2c5a8a)); motor.position.y = 1.0; pumpG.add(motor);
    this.fan = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.12), steel); b.rotation.y = i * Math.PI / 4; this.fan.add(b); } this.fan.position.y = 1.65; pumpG.add(this.fan);
    this.pumpLamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x30ff60 })); this.pumpLamp.position.set(0.3, 1.45, 0.3); pumpG.add(this.pumpLamp);
    pwr.add(pumpG);
    // pressurizer
    const PZX = 3.95, pzI = capsuleProfile(0.5, 3.6, 6.8), pzO = pzI.map(([r, y]) => [r + 0.08, y]);
    const pz = new THREE.Group(); pz.position.x = PZX; pz.add(half(pzI, 32, steelDark)); pz.add(half(pzO, 32, steel)); pz.add(cutFace(pzI, pzO, cutMat)); pwr.add(pz);
    this.pzWaterU = { uLevel: U(5), uTime: U(0), uA: U(0.38), uCol: U(new THREE.Color(0.05, 0.2, 0.42)) };
    const pzW = half(capsuleProfile(0.48, 3.6, 6.8), 24, new THREE.ShaderMaterial({ uniforms: this.pzWaterU, vertexShader: CHER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    pzW.position.x = PZX; pzW.renderOrder = 2; pwr.add(pzW);
    pwr.add(pipe([[PZX, 3.1, -0.2], [PZX, HOT_Y + 0.2, -0.2]], 0.09, steel));
    this.heaterMat = new THREE.MeshBasicMaterial({ color: 0x401008 });
    for (let i = 0; i < 5; i++) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), this.heaterMat); h.position.set(PZX - 0.3 + i * 0.15, 3.55, -0.15); pwr.add(h); }
    // PORV + block valve + discharge line (tail pipe) to the quench tank
    this.porvBody = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.24), paint(0x8a2a2a)); this.porvBody.position.set(PZX + 0.2, 7.55, -0.1); pwr.add(this.porvBody);
    this.porvStem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 6), steel); this.porvStem.position.set(PZX + 0.2, 7.8, -0.1); pwr.add(this.porvStem);
    this.blockBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.22), paint(0x2a5a8a)); this.blockBody.position.set(PZX + 0.75, 7.55, -0.1); pwr.add(this.blockBody);
    pwr.add(pipe([[PZX, 7.3, -0.1], [PZX, 7.55, -0.1], [PZX + 1.2, 7.55, -0.1]], 0.05, steel, 0.1));
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x7a8494, metalness: 0.6, roughness: 0.4, emissive: 0x000000 });
    pwr.add(pipe([[PZX + 1.2, 7.55, -0.1], [PZX + 1.5, 7.55, -1.4], [PZX + 1.5, -2.6, -1.4], [PZX + 1.0, -2.95, -1.4]], 0.05, this.tailMat, 0.25));
    const qt = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 6, 14), paint(0x55606e)); qt.rotation.z = Math.PI / 2; qt.position.set(PZX + 0.6, -3.1, -1.4); pwr.add(qt);
    // steam line to the turbine (background) + MSIV
    pwr.add(pipe([[SGX, 7.9, -0.3], [SGX, 8.6, -0.3], [SGX + 1.6, 8.6, -3.5], [9.6, 7.0, -6]], 0.17, steel, 0.6));
    this.msivBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), paint(0x2a6a3a)); this.msivBody.position.set(SGX + 0.6, 8.6, -1.2); pwr.add(this.msivBody);
    // turbine-generator (background)
    const tgG = this.turbG = new THREE.Group(); tgG.position.set(11.3, 7.0, -6.5);
    const tcase = half([[0.9, -1.6], [1.4, -0.6], [1.4, 0.8], [0.9, 1.6]], 30, steelDark); tcase.rotation.z = Math.PI / 2; tgG.add(tcase);
    this.rotor = new THREE.Group(); for (let k = 0; k < 5; k++) { const r = 0.6 + k * 0.17; const d = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.08, 18, 1), new THREE.MeshStandardMaterial({ color: 0xb0b8c4, metalness: 0.8, roughness: 0.3, wireframe: k % 2 === 1 })); d.position.y = -1.0 + k * 0.45; this.rotor.add(d); }
    const shaftT = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 10), steel); shaftT.position.y = 1.0; this.rotor.add(shaftT); this.rotor.rotation.z = Math.PI / 2; tgG.add(this.rotor);
    const gen = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.8, 24), paint(0x2a4a6a)); gen.rotation.z = Math.PI / 2; gen.position.x = -2.8; tgG.add(gen);
    this.genRing = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color: 0x40ff90 })); this.genRing.rotation.y = Math.PI / 2; this.genRing.position.x = -1.85; tgG.add(this.genRing);
    const cond = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 2), paint(0x3a4450)); cond.position.set(0, -2.2, 0); tgG.add(cond);
    pwr.add(tgG);

    /* ---- RBMK group ---- */
    const rb = this.rbmk = new THREE.Group(); rb.visible = false; sc.add(rb);
    const graphite = new THREE.Mesh(new THREE.BoxGeometry(4.2, CORE_H + 0.4, 0.2), new THREE.ShaderMaterial({ vertexShader: CHER_VS, fragmentShader: `varying vec3 vW; void main(){ vec2 g = abs(fract(vW.xy * vec2(4.0, 2.0)) - 0.5); float l = smoothstep(0.46, 0.5, max(g.x, g.y)); vec3 c = vec3(0.16, 0.16, 0.17) - l * 0.06; gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}` }));
    graphite.position.set(0, (CORE_B + CORE_T) / 2, -1.75); rb.add(graphite);
    const sideG = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, CORE_H + 0.4, 1.8), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.9 })); m.position.set(x, (CORE_B + CORE_T) / 2, -0.9); rb.add(m); }; sideG(-2.3); sideG(2.3);
    const elena = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.7, 2.2), new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: 0.4, roughness: 0.6 })); elena.position.set(0, CORE_T + 1.3, -1.0); rb.add(elena); this.elena = elena;
    const lower = elena.clone(); lower.position.y = CORE_B - 0.9; rb.add(lower);
    for (const sx of [-1, 1]) { const drum = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2.4, 6, 16), new THREE.MeshStandardMaterial({ color: 0x8a96a6, metalness: 0.6, roughness: 0.4 })); drum.rotation.z = Math.PI / 2; drum.position.set(sx * 3.6, 5.3, -1.2); rb.add(drum);
      rb.add(pipe([[sx * 4.6, 5.0, -1.2], [sx * 4.6, -3.3, -1.2], [sx * 2.6, -3.3, -1.0]], 0.18, glassPipe, 0.5));
      const mcp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 16), paint(0x2c5a8a)); mcp.position.set(sx * 4.6, -2.6, -0.3); rb.add(mcp); }
    for (let i = 0; i < 7; i++) { const x = -1.5 + i * 0.5; rb.add(pipe([[x, CORE_T + 1.7, -0.9], [x * 0.6 + Math.sign(x || 1) * 2.4, 5.2, -1.2]], 0.04, steel, 0.2)); }

    // particle systems
    this.cool = new Points(this.mobile ? 520 : 760, PT_ADD_FS, THREE.AdditiveBlending); this.cool.mesh.renderOrder = 6; sc.add(this.cool.mesh);
    this.bub = new Points(500, PT_ADD_FS, THREE.AdditiveBlending); this.bub.mesh.renderOrder = 7; sc.add(this.bub.mesh); this.bubbles = new Sprites(this.bub);
    this.smk = new Points(600, PT_SMOKE_FS, THREE.NormalBlending); this.smk.mesh.renderOrder = 8; sc.add(this.smk.mesh); this.smoke = new Sprites(this.smk);
    this.fire = new Points(400, PT_ADD_FS, THREE.AdditiveBlending); this.fire.mesh.renderOrder = 9; sc.add(this.fire.mesh); this.fires = new Sprites(this.fire);
    this.buildLanes();

    // beacons
    this.beacons = [];
    for (const [x, y] of [[-3.0, 8.4], [8.6, 9.4]]) {
      const g = new THREE.Group(); g.position.set(x, y, -1.5);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: 0x401010 })); g.add(dome);
      const beamU = { uA: { value: 0 } }; const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 7, 20, 1, true), new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: TUBE_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      cone.geometry.translate(0, -3.5, 0); cone.rotation.z = Math.PI / 2; const piv = new THREE.Group(); piv.add(cone); g.add(piv); sc.add(g);
      this.beacons.push({ g, dome, piv, beamU });
    }
    this.lanesTmp = new Float32Array(5);
  }
  buildLanes() {
    // polylines through the loop; temps: 0 = cold leg, 1 = hot leg
    const L = this.lanes = [], R = this.rbLanes = [];
    for (let k = 0; k < 16; k++) {
      const side = k % 2 ? -1 : 1, xc = -1.45 + (k / 15) * 2.9, zc = -0.15 - (k % 4) * 0.33, dz = (k % 3) * 0.08;
      const down = side > 0 ? [[2.05, COLD_Y, -0.6], [2.05, -2.8, -0.4]] : [[2.05, COLD_Y, -0.6], [1.2, COLD_Y - 0.1, -1.7], [-1.2, COLD_Y - 0.2, -1.7], [-2.05, COLD_Y - 0.3, -0.5], [-2.05, -2.8, -0.4]];
      const pts = [[6.25, 2.3, -0.3 - dz], [6.25 - 0.1 * (k % 3), 4.4, -0.3 - dz], [6.6, 5.1, -0.3 - dz], [6.95 + 0.1 * (k % 3), 4.4, -0.3 - dz], [6.95, 2.2, -0.3 - dz], [7.0, 1.6, -0.05], [7.15, -0.5, -0.05 + dz], [5.0, -0.5, -0.05], [4.2, -0.5, -0.6], [3.1, -0.5, -0.6 + dz], [3.1, COLD_Y, -0.6], [2.45, COLD_Y, -0.6],
        ...down, [side * 1.3, -3.45, -0.5], [xc, CORE_B - 0.35, zc], [xc, CORE_B, zc], [xc, CORE_T, zc], [xc * 0.8, CORE_T + 0.7, zc], [1.9, HOT_Y, -0.1], [2.5, HOT_Y, -0.05 + dz], [6.0, HOT_Y, -0.05 - dz], [6.2, 2.0, -0.2]];
      const nd = down.length, coreIdx = 12 + nd + 2;
      const t = pts.map((p, i) => i < 4 ? 1 - i * 0.22 : i < coreIdx ? 0 : i === coreIdx ? 0 : i === coreIdx + 1 ? 1 : 1);
      t[1] = 0.85; t[2] = 0.6; t[3] = 0.35; t[4] = 0.1;
      const P = new Poly(pts, t); P.coreSeg = coreIdx; L.push(P);
      const rs = side;
      const rp = [[rs * 3.6, 5.0, -1.2], [rs * 4.6, 4.8, -1.2], [rs * 4.6, -3.3, -1.2], [rs * 2.6, -3.3, -1.0], [xc, CORE_B - 0.5, zc], [xc, CORE_B, zc], [xc, CORE_T, zc], [xc, CORE_T + 1.7, -0.9], [rs * 2.6, 5.2, -1.2]];
      const RP = new Poly(rp, [0, 0, 0, 0, 0, 0, 1, 1, 1]); RP.coreSeg = 5; R.push(RP);
    }
    this.cp = []; const N = this.cool.max; for (let i = 0; i < N; i++) this.cp.push({ lane: i % 16, u: Math.random(), j: [rnd(-0.06, 0.06), rnd(-0.06, 0.06), rnd(-0.06, 0.06)], s: rnd(0.8, 1.25) });
  }
  setMode(m) {
    this.mode = m; const rb = m === 'RBMK';
    this.pwr.visible = !rb; this.rbmk.visible = rb; this.tips.visible = rb; this.fuelU.uRbmk.value = rb ? 1 : 0;
  }
  setFocus(f) { this.focus = f; }
  setView(x, y, w, h) { this.view = { x, y, w, h }; this.resize(); }
  /* ---------------- sizing ---------------- */
  setTier(t) { t = clamp(t, 0, this.maxTier); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 99; this.resize(); }
  resize() {
    const w = Math.max(16, this.canvas.clientWidth || innerWidth), h = Math.max(16, this.canvas.clientHeight || innerHeight);
    const cap = this.tier >= 3 ? 2 : this.tier >= 1 ? 1.5 : 1, pr = Math.min(devicePixelRatio || 1, cap);
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false); this.pr = pr; this.W = w; this.H = h;
    this.post.setSize(Math.round(w * pr), Math.round(h * pr), this.tier >= 3 ? 2 : 4); this._sized = true;
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const sc = h * pr / (2 * Math.tan(this.cam.fov * Math.PI / 360)); for (const p of [this.cool, this.bub, this.smk, this.fire]) p.mat.uniforms.uScale.value = sc;
  }
  frame() {
    // fit a box (centre cx,cy, half-extents hx,hy) into the camera; focus = whole plant or the core
    const rb = this.mode === 'RBMK';
    const plant = rb ? [0, 1.4, 5.6, 5.4] : [3.0, 2.8, 5.9, 6.6], core = [0, -0.3, 2.6, 3.3];
    const z = clamp(this.camZoom, 0, 1), f = this.focus === 'core' ? 1 : z;
    const b = plant.map((v, i) => lerp(v, core[i], f));
    const t = Math.tan(this.cam.fov * Math.PI / 360);
    const d = Math.max(b[3] / t, b[2] / (t * this.cam.aspect)) * 1.04 + 1.5;
    return { cx: b[0], cy: b[1], d };
  }
  /* ---------------- effects ---------------- */
  fx(kind) {
    if (kind === 'scram') { this.shake = Math.max(this.shake, 0.35); this.flash = 0.25; this.flashCol.setRGB(0.6, 0.8, 1); this.camZoom = 1; this.zoomT = 3; }
    if (kind === 'boom') { this.shake = 2.5; this.flash = 1; this.flashCol.setRGB(1, 0.95, 0.85); this.exploded = true;
      for (let i = 0; i < 260; i++) { const a = rnd(0, 6.283), sp = rnd(2, 14); this.fires.add({ x: rnd(-1.5, 1.5), y: rnd(-1, 3), z: rnd(-1, 0.5), vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 3, vz: rnd(-2, 2), g: -6, drag: 0.6, life: rnd(1, 3.5), s0: rnd(0.3, 0.8), s1: 0.1, a: 1, r: 1, g2: rnd(0.4, 0.8), b: 0.15 }); } }
    if (kind === 'alarm') { this.flash = Math.max(this.flash, 0.12); this.flashCol.setRGB(1, 0.1, 0.05); }
    if (kind === 'quench') for (let i = 0; i < 40; i++) this.smoke.add({ x: 4.6 + rnd(-0.3, 0.3), y: -2.9, z: -1.4, vx: rnd(-1, 1), vy: rnd(1, 3), vz: rnd(0, 1), drag: 0.8, life: rnd(2, 4), s0: 0.4, s1: 2.2, a: 0.6, r: 0.85, g2: 0.88, b: 0.9 });
  }
  /* ---------------- per-frame update ---------------- */
  update(dt, s, v) {
    this.time += dt; const T = this.time; v = v || {};
    if (s.type.name !== this.mode) this.setMode(s.type.name);
    const rb = this.mode === 'RBMK';
    const n = clamp(s.n, 0, 50), Q = clamp(s.Q, 0, 50);
    // core visuals
    const F = this.fuelU, glow = n < 0.01 ? 0.03 + 4 * n : 0.07 + 0.38 * Math.sqrt(Math.min(Q, 9)) + 0.5 * Math.max(0, Math.min(Q, 9) - 1.1); F.uGlow.value = lerp(F.uGlow.value, glow, 1 - Math.exp(-dt * 8));
    const heat = clamp((Math.max(s.TclPk, s.Tup || 0) - 650) / 1500, 0, 1.4); F.uHeat.value = heat;
    const cher = clamp((n < 0.02 ? (Math.log10(Math.max(n, 1e-6)) + 6) / 4 * 0.35 : 0.35 + 0.65 * Math.sqrt(Math.min(n, 4))) + 0.25 * Math.sqrt(s.decay || 0), 0, 2.2);
    F.uCher.value = cher; this.cherU.uI.value = lerp(this.cherU.uI.value, cher * 1.0, 1 - Math.exp(-dt * 6)); this.cherFU.uI.value = this.cherU.uI.value * 0.25; this.cherU.uVoid.value = s.voidCore;
    F.uDamage.value = clamp(s.damage * 2 + s.ox, 0, 1); F.uMelt.value = clamp(s.melt * 1.6, 0, 1); F.uScatter.value = this.exploded ? Math.min(1, (F.uScatter.value || 0) + dt * 2) : 0;
    let tilt = 0; for (let i = 0; i < S.NR; i++) tilt += (s.rods[i] - 0.5) * S.RODX[i]; F.uTilt.value = -tilt * 1.2;
    for (const u of [F.uTime, this.cherU.uTime, this.waterU.uTime, this.tubeU.uTime, this.sgWaterU.uTime, this.pzWaterU.uTime, this.backU.uTime]) u.value = T;
    // water level in the vessel
    let level = V_YT + V_RI; if (!rb) { if (s.coverage < 1) level = CORE_B + s.coverage * CORE_H; else level = V_YT + V_RI - clamp(s.voidLoops * 1.6, 0, 1) * (V_YT + V_RI - CORE_T - 0.2); }
    this.level = lerp(this.level == null ? level : this.level, level, 1 - Math.exp(-dt * 3));
    F.uLevel.value = this.level; this.cherU.uLevel.value = this.level; this.waterU.uLevel.value = this.level;
    // control rods
    const rodY = F.uRodY.value, m4 = new THREE.Matrix4(), em = this.rodEm.array, tem = this.tipEm.array;
    for (let i = 0; i < S.NR; i++) {
      const bottom = CORE_T - s.rods[i] * CORE_H; rodY[i] = bottom;
      const stuck = s.stuck[i], moving = s.rodMoving && !stuck && !s.scram;
      for (let k = 0; k < 3; k++) { const j = i * 3 + k, x = ROD_X[i] + (k - 1) * 0.07, z = -0.3 - (k % 2) * 0.12; m4.makeTranslation(x, bottom, z); this.rodMesh.setMatrixAt(j, m4); this.tips.setMatrixAt(j, m4);
        const p = 0.5 + 0.5 * Math.sin(T * 8); const e = stuck ? [0.9 * p + 0.2, 0.05, 0.02] : moving ? [0.05, 0.18, 0.3] : s.scram && s.rods[i] < 0.99 ? [0.35, 0.3, 0.05] : [0, 0, 0];
        em.set(e, j * 3); const tipHot = rb && s.rho.tip > 50 ? Math.min(1, s.rho.tip / 400) : 0; tem.set([tipHot, tipHot * 0.5, tipHot * 0.1], j * 3); }
      m4.makeTranslation(ROD_X[i], bottom, -0.36); this.spider.setMatrixAt(i, m4); this.shaft.setMatrixAt(i, m4);
    }
    for (const m of [this.rodMesh, this.spider, this.shaft, this.tips]) m.instanceMatrix.needsUpdate = true; this.rodEm.needsUpdate = true; this.tipEm.needsUpdate = true;
    // lights
    this.coreLight.intensity = 3 * cher * (this.level > CORE_B ? 1 : 0.2); this.heatLight.intensity = 10 * heat + 1.5 * Math.min(1, glow);
    const blackout = !S.acPower(s);
    this.hemi.intensity = lerp(this.hemi.intensity, blackout ? 0.35 : 1.1, 1 - Math.exp(-dt * 2)); this.sun.intensity = lerp(this.sun.intensity, blackout ? 0.25 : 1.6, 1 - Math.exp(-dt * 2));
    this.hemi.color.setHex(blackout ? 0xc08060 : 0x8fa3c8);
    // alarms / beacons
    const al = v.alarm || 0; const pulse = al >= 2 ? 0.5 + 0.5 * Math.sin(T * 6) : 0;
    this.alarmLight.intensity = al >= 2 ? 25 * pulse : 0; this.backU.uRed.value = al >= 2 ? 0.5 * pulse : 0;
    for (const b of this.beacons) { b.piv.rotation.y = T * 4; b.beamU.uA.value = al >= 2 ? 0.35 : al === 1 ? 0.08 : 0; b.dome.material.color.setHex(al >= 1 ? (pulse > 0.5 || al === 1 ? 0xff3020 : 0x801010) : 0x401010); }
    // plant parts
    if (!rb) {
      const dT = clamp((s.Thot - s.Tcold) / 33, 0.05, 1.3), sgAct = clamp(s.Qsg, 0, 1.5);
      this.tubeU.uI.value = 0.35 + 0.65 * Math.min(1, sgAct + 0.1); this.tubeU.uHot.value.setRGB(1, 0.3 + 0.2 * (1 - dT), 0.1 + 0.3 * (1 - dT)); this.tubeU.uCold.value.setRGB(0.2 + 0.4 * (1 - dT), 0.5, 1);
      this.sgWaterU.uLevel.value = 2.45 + s.Lsg * 4.4; this.pzWaterU.uLevel.value = 3.1 + clamp(s.Lpzr, 0, 1.02) * 4.1;
      this.heaterMat.color.setRGB(0.25 + 0.75 * s.heaters, 0.06 + 0.3 * s.heaters, 0.03);
      const pw = s.pumps.reduce((a, p) => a + p.w, 0) / 4; this.fan.rotation.y += dt * 30 * s.pumps[0].w; this.pumpLamp.material.color.setHex(s.pumps[0].failed ? 0xff3020 : s.pumps[0].w > 0.5 ? 0x30ff60 : 0x806020);
      this.porvStem.position.y = 7.8 + s.porv * 0.15; this.blockBody.material.color.setHex(s.block > 0.5 ? 0x2a5a8a : 0x205030);
      const tail = clamp((s.tailT - 60) / 200, 0, 1); this.tailMat.emissive.setRGB(tail * 0.8, tail * 0.25, 0.02);
      this.msivBody.material.color.setHex(s.msiv > 0.5 ? 0x2a6a3a : 0x8a2a2a);
      this.rotor.rotation.x += dt * (s.turb.rpm / 1800) * 25; this.genRing.material.color.setRGB(0.1, 0.3 + 0.7 * clamp(s.MWe / 1000, 0, 1), 0.2 + 0.4 * clamp(s.MWe / 1000, 0, 1));
      this.water.visible = true;
    }
    // coolant particles
    const W = clamp(s.W, 0, 1.2), lanes = rb ? this.rbLanes : this.lanes, o = this.lanesTmp, C = this.cool;
    const sp = 0.035 * (0.15 + W) * (this.exploded ? 0 : 1);
    C.begin();
    const tc = s.Tcold, th = s.Thot, warm = clamp((th - tc) / 33, 0.1, 1.2), hot = clamp((s.Tavg - 200) / 140, 0, 1);
    for (const p of this.cp) {
      const L = lanes[p.lane]; p.u += sp * p.s * dt * 40 / L.L; L.at(p.u, o);
      const x = o[0] + p.j[0], y = o[1] + p.j[1], z = o[2] + p.j[2], tt = o[3] * warm;
      const inVessel = Math.abs(x) < V_RI && y < V_YT + V_RI; if (inVessel && y > this.level && !rb) continue;
      const r = lerp(0.15, 1.0, tt) * (0.6 + 0.4 * hot), g = lerp(0.45, 0.35, tt), b = lerp(1.0, 0.15, tt);
      const boil = (o[4] >= L.coreSeg && o[4] <= L.coreSeg + 1) ? s.voidCore : 0;
      C.put(x, y, z, 0.11 + boil * 0.08, lerp(r, 0.9, boil), lerp(g, 0.95, boil), lerp(b, 1, boil), 0.55);
    }
    C.end();
    // bubbles: boiling in the core, secondary boiling in the SG
    const boil = rb ? s.voidCore * 2 + 0.2 : s.voidCore * 2 + (s.regime === 'BOILING' || s.regime === 'FILM' ? 0.4 : 0);
    if (boil > 0.02 && !this.exploded) { let k = boil * 120 * dt; while (k > 0 && Math.random() < k) { k -= 1; const x = rnd(-1.5, 1.5); this.bubbles.add({ x, y: rnd(CORE_B, CORE_T), z: rnd(-1.4, -0.1), vx: rnd(-0.1, 0.1), vy: rnd(0.8, 2), life: rnd(0.6, 1.4), s0: 0.06, s1: 0.12, a: 0.5, r: 0.8, g2: 0.9, b: 1 }); } }
    if (!rb && s.Qsg > 0.02) { let k = Math.min(1.2, s.Qsg) * 50 * dt; while (k > 0 && Math.random() < k) { k -= 1; this.bubbles.add({ x: 6.6 + rnd(-0.8, 0.8), y: rnd(2.6, 2.45 + s.Lsg * 4.4), z: rnd(-0.8, -0.1), vx: 0, vy: rnd(0.8, 1.6), life: 0.8, s0: 0.05, s1: 0.1, a: 0.4, r: 0.8, g2: 0.9, b: 1 }); } }
    this.bub.begin(); this.bubbles.update(dt); this.bub.end();
    // steam plumes: SLB, atmospheric dumps, SG safeties, quench tank, PORV in RBMK? hydrogen haze
    const plume = (x, y, z, rate, vx, vy, big) => { let k = rate * dt; while (k > 0 && Math.random() < k) { k -= 1; this.smoke.add({ x: x + rnd(-0.1, 0.1), y, z, vx: vx + rnd(-0.5, 0.5), vy: vy + rnd(-0.5, 0.5), vz: rnd(-0.3, 0.3), drag: 1.2, g: 0.6, life: rnd(1.5, 3), s0: big ? 0.5 : 0.25, s1: big ? 3.2 : 1.6, a: 0.55, r: 0.86, g2: 0.89, b: 0.93 }); } };
    if (!rb) {
      if (s.slb > 0 && s.Ps > 0.3) plume(7.8, 8.6, -1.6, 60 * s.slb * clamp(s.Ps / 6.9, 0.2, 1), 6, 1, true);
      if (s.sgDump > 0 || s.Ps > 8.3) plume(6.6, 8.3, -0.3, 25 * Math.max(s.sgDump, (s.Ps - 8.3)), 0, 6, false);
      if (s.leak > 0 && s.P > 1) plume(2.6, COLD_Y, 0.2, 25 * s.leak, 3, 0.5, false);
      if (s.quenchBurst) plume(4.6, -2.9, -1.0, 12 * clamp(s.porv * s.block, 0, 1), 0, 3, false);
    }
    if (s.h2 > 50) plume(rnd(-1, 1), 3.5, 0, Math.min(15, s.h2 / 40), 0, 1.5, false);
    if (this.exploded) plume(rnd(-2, 2), 3 + rnd(0, 2), 0, 40, rnd(-1, 1), 3, true);
    this.smk.begin(); this.smoke.update(dt); this.smk.end();
    this.fire.begin(); this.fires.update(dt);
    if (s.melt > 0.02 || (this.exploded)) { for (let i = 0; i < 6; i++) this.fire.put(rnd(-1.4, 1.4), rnd(CORE_B, CORE_B + 1), rnd(-1, 0), rnd(0.2, 0.5), 1, rnd(0.4, 0.7), 0.1, 0.3); }
    this.fire.end();
    // corium
    if (s.melt > 0.01) { this.corium.visible = true; const k = clamp(s.melt, 0, 1); this.corium.scale.set(0.6 + 1.4 * k, 0.3 + 0.6 * k, 0.6 + 0.9 * k); this.corium.position.y = V_YB - 0.15 + 0.4 * k; this.corium.material.color.setRGB(1, 0.45 + 0.2 * Math.sin(T * 3), 0.12); }
    else this.corium.visible = false;
    // camera
    if (this.zoomT > 0) { this.zoomT -= dt; if (this.zoomT <= 0) this.camZoom = 0; }
    this.camZoomS = lerp(this.camZoomS || 0, this.focus === 'core' ? 1 : this.camZoom, 1 - Math.exp(-dt * 2));
    const fr = (() => { const z = this.camZoom; this.camZoom = this.camZoomS; const r = this.frame(); this.camZoom = z; return r; })();
    const yaw = this.yaw + Math.sin(T * 0.07) * 0.05, pitch = 0.05 + Math.sin(T * 0.05) * 0.02;
    this.shake = Math.max(0, this.shake - dt * 1.2); const sh = this.shake * this.shake;
    this.cam.position.set(fr.cx + Math.sin(yaw) * fr.d + rnd(-sh, sh) * 0.3, fr.cy + Math.sin(pitch) * fr.d + rnd(-sh, sh) * 0.3, Math.cos(yaw) * fr.d);
    this.cam.lookAt(fr.cx, fr.cy, -0.4);
    // shimmer region: project the core centre
    const pc = new THREE.Vector3(0, -0.3, 0).project(this.cam), pe = new THREE.Vector3(2.0, 2.0, 0).project(this.cam);
    const P = this.post.mComp.uniforms; P.shim.value.set(pc.x * 0.5 + 0.5, pc.y * 0.5 + 0.5, Math.abs(pe.x - pc.x) * 0.5 + 0.02, Math.abs(pe.y - pc.y) * 0.5 + 0.02);
    P.shimA.value = clamp((s.Tavg - 296) / 30, 0, 1) * 0.5 + heat * 1.2 + (n > 1.05 ? 0.5 : 0);
    P.alarm.value = al >= 3 ? 0.12 * pulse : al >= 2 ? 0.05 * pulse : 0;
    this.flash = Math.max(0, this.flash - dt * 1.2);
  }
  render() {
    const t0 = performance.now(), T = this.time;
    const post = this.tier >= 2;
    if (post) { const P = this.post.mComp.uniforms; P.flash.value = Math.min(0.95, this.flash); P.flashCol.value.copy(this.flashCol); P.time.value = T % 100; P.str.value = this.tier >= 3 ? 0.95 : 0.8; P.grain.value = this.tier >= 3 ? 0.012 : 0;
      this.post.render(this.scene, this.cam); }
    else { this.r.setRenderTarget(null); this.r.render(this.scene, this.cam); }
    if ((this.selfChecks < 3 && T - this.lastCheck > 1.2) || T - this.lastCheck > 20) { this.lastCheck = T; this.selfCheck(); }
    if (!this.lockTier) { this.ft.push(performance.now() - t0); if (this.ft.length > 90) { const a = this.ft.slice().sort((x, y) => x - y), med = a[45] / 1000; this.ft.length = 0;
      if (med > 1 / 40 && this.tier > 0 && !document.hidden) { this.setTier(this.tier - 1); console.info('[meltdown] quality ->', this.tier); } } }
  }
  selfCheck() {
    this.selfChecks++;
    const gl = this.r.getContext(), Hh = gl.drawingBufferHeight, Ww = gl.drawingBufferWidth, px = new Uint8Array(4); let n = 0, black = 0;
    const pts = [[0, -0.5, 0], [0.8, 0.5, -0.5], [-0.8, -1.2, -0.5], [0, 2.5, -1], [2.3, 0, -0.5], [-2.3, 0, -0.5]];
    for (const p of pts) { const v = new THREE.Vector3(...p).project(this.cam); if (Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.95) continue; const x = Math.round((v.x * 0.5 + 0.5) * Ww), y = Math.round((v.y * 0.5 + 0.5) * Hh);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 4) black++; }
    this.lastSelf = { n, black, tier: this.tier };
    if (n >= 4 && black / n >= 0.5 && this.tier > 0) { console.warn(`[meltdown] black regions (${black}/${n}) at quality ${this.tier}; stepping effects down`); this.maxTier = this.tier - 1; this.setTier(this.maxTier); this.selfChecks = 0; }
  }
  /** screen-space positions of labelled parts (css px relative to the canvas) */
  anchors() {
    const rb = this.mode === 'RBMK';
    const list = rb ? [['CORE', 0, CORE_B + 0.2, 0], ['GRAPHITE', -1.9, CORE_T - 0.4, -1.7], ['DRUM SEPARATOR', -3.6, 6.1, -1.2], ['CONTROL RODS', ROD_X[7], CORE_T + 2.4, -0.3], ['MAIN PUMP', 4.6, -2.0, -0.3]]
      : [['CORE', 0, CORE_B + 0.15, 0], ['CONTROL RODS', ROD_X[1], V_YT + 3.8, -0.35], ['PRESSURIZER', 3.95, 7.95, 0], ['STEAM GENERATOR', 6.6, 9.0, 0], ['COOLANT PUMP', 4.6, -1.3, 0], ['TURBINE', 11.3, 9.0, -6.5]];
    return list.map(([t, x, y, z]) => { const v = new THREE.Vector3(x, y, z).project(this.cam); return { t, x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, ok: v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05 }; });
  }
}
