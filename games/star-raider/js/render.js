/* ==========================================================================
   STAR RAIDER — render.js   (three.js r169, vendored)
   Camera-relative rendering: the camera sits at the origin with the pilot's
   orientation; everything is drawn at (worldPos - pilotPos) so huge sector
   coordinates never jitter on the GPU.
   Sky: a per-sector raymarched nebula baked into an 8-bit cube map (one face
   per frame while the hyperwarp tunnel hides it), far star points, a near dust
   field drawn as dots plus velocity streaks, sun glow + flare, sometimes a planet.
   Post-processing: an 8-bit bloom chain (samples 0, no float targets anywhere,
   no MSAA unless ?msaa=1). A pixel read-back self-check steps quality down if
   the frame comes out black. Tiers: 3 full · 2 lighter bloom · 1 no post · 0 minimal.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { makeDarter, makeLancer, makeHive, makeWingman, makeStarbase, makeDrone, makeCockpit, ENV, canvasTex } from './models.js';
const S = window.SRSim;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;
/* ---------------- nebula bake shader ---------------- */
const NEB_VS = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const NEB_FS = NOISE + `uniform vec3 c1, c2, c3, bg, sunDir, sunCol, axis, off; uniform float dens, steps, band;
varying vec3 vDir;
void main(){ vec3 d = normalize(vDir);
  float b = dot(d, axis); float m = exp(-b * b * band) * 0.85 + 0.15;
  m *= smoothstep(0.25, 0.65, fbm3(d * 1.3 + off * 0.37));
  vec3 col = bg * (0.6 + 0.4 * fbm3(d * 2.0 + off));
  // the milky band: unresolved stars
  col += vec3(0.55, 0.6, 0.75) * pow(fbm(d * 7.0 + off * 1.7), 3.0) * exp(-b * b * 6.0) * 0.35;
  float T = 1.0; vec3 acc = vec3(0.0); float j = h31(d * 431.0);
  for (int i = 0; i < 18; i++){ if (float(i) >= steps) break;
    float t = (float(i) + j) / steps; vec3 p = d * (1.6 + t * 2.2) * 1.4 + off;
    vec3 w = vec3(fbm3(p * 0.9), fbm3(p * 0.9 + 5.2), fbm3(p * 0.9 + 9.7));
    float n = fbm(p * 1.25 + w * 1.6);
    float de = smoothstep(0.42, 0.9, n) * m * dens;
    vec3 em = mix(c1, c2, smoothstep(0.25, 0.75, w.x)); em = mix(em, c3, smoothstep(0.55, 0.95, n) * 0.8);
    acc += T * em * de * (2.2 / steps) * 1.6;
    T *= exp(-de * (5.0 / steps) * (0.5 + 0.8 * smoothstep(0.5, 0.7, w.y)));
  }
  col = col * T + acc;
  float lane = smoothstep(0.55, 0.78, fbm(d * 3.1 + off * 2.3)) * m; col *= 1.0 - lane * 0.55;
  float sa = max(0.0, dot(d, sunDir)); col += sunCol * (pow(sa, 900.0) * 6.0 + pow(sa, 60.0) * 0.5 + pow(sa, 8.0) * 0.08);
  col = max(col, vec3(0.011, 0.013, 0.028));
  gl_FragColor = vec4(col, 1.0);
#include <colorspace_fragment>
}`;
const SKY_FS = `uniform samplerCube cube; uniform float fade; varying vec3 vDir; void main(){ vec3 c = textureCube(cube, normalize(vDir)).rgb * fade; gl_FragColor = vec4(max(c, vec3(0.011, 0.013, 0.028)), 1.0);
#include <colorspace_fragment>
}`;
/* ---------------- post: 8-bit bloom chain ---------------- */
const QUAD_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BRIGHT_FS = `uniform sampler2D tDiffuse; uniform float th; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float w = smoothstep(th, min(1.0, th + 0.3), l); gl_FragColor = vec4(c * w, 1.0); }`;
const BLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
  c += (texture2D(tDiffuse, vUv + dir * 1.3846153846).rgb + texture2D(tDiffuse, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tDiffuse, vUv + dir * 3.2307692308).rgb + texture2D(tDiffuse, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(c + (n - 0.5) / 255.0, 1.0); }`;
const COMP_FS = `uniform sampler2D tScene; uniform sampler2D b0; uniform sampler2D b1; uniform sampler2D b2; uniform sampler2D b3; uniform float str; uniform float flash; uniform vec3 flashCol; uniform float vig; uniform float time; uniform float grain; uniform float ca;
uniform vec2 t1; uniform vec2 t2; uniform vec2 t3;
varying vec2 vUv;
vec3 up(sampler2D s, vec2 t){ vec2 o = t * 0.85; return texture2D(s, vUv).rgb * 0.36 + (texture2D(s, vUv + vec2(o.x, o.y)).rgb + texture2D(s, vUv + vec2(-o.x, o.y)).rgb + texture2D(s, vUv + vec2(o.x, -o.y)).rgb + texture2D(s, vUv - o).rgb) * 0.16; }
void main(){ vec2 d = vUv - 0.5; vec3 c;
  if (ca > 0.0005) { vec2 o = d * ca; c = vec3(texture2D(tScene, vUv + o).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - o).b); } else c = texture2D(tScene, vUv).rgb;
  vec3 b = texture2D(b0, vUv).rgb * 0.7 + up(b1, t1) * 0.85 + up(b2, t2) * 1.0 + up(b3, t3) * 1.25;
  c += b * str;
  c = c / (1.0 + max(vec3(0.0), c - 0.8) * 0.85);
  c *= 1.0 - vig * dot(d, d) * 1.6;
  c = mix(c, flashCol, flash);
  float n = fract(sin(dot(vUv * 913.7 + time, vec2(12.9898, 78.233))) * 43758.5453); c += (n - 0.5) * grain;
  gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
#include <colorspace_fragment>
}`;
class Post {
  constructor(r, hdr) {
    this.r = r; this.hdr = !!hdr; this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); this.quad.frustumCulled = false; this.qs = new THREE.Scene(); this.qs.add(this.quad);
    // HDR: desktop WebGL2 with float colour buffers renders the scene + bloom chain in half-float so bright cores keep their energy;
    // iOS (and any failed self-check) stays on the 8-bit chain
    const o8 = { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, samples: 0, generateMipmaps: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, o8, { depthBuffer: true, colorSpace: hdr ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace }));
    this.lv = []; for (let i = 0; i < 4; i++) this.lv.push([new THREE.WebGLRenderTarget(4, 4, o8), new THREE.WebGLRenderTarget(4, 4, o8)]);
    const M = (u, fs) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QUAD_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    this.mBright = M({ tDiffuse: { value: null }, th: { value: 0.72 } }, BRIGHT_FS);
    this.mBlur = M({ tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } }, BLUR_FS);
    this.mComp = M({ tScene: { value: this.scene.texture }, b0: { value: null }, b1: { value: null }, b2: { value: null }, b3: { value: null }, str: { value: 0.9 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, vig: { value: 0.35 }, time: { value: 0 }, grain: { value: 0.012 }, ca: { value: 0 }, t1: { value: new THREE.Vector2() }, t2: { value: new THREE.Vector2() }, t3: { value: new THREE.Vector2() } }, COMP_FS);
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
/* ---------------- effect shaders ---------------- */
const FB_VS = NOISE + `uniform float uT, uSeed; varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){ vec3 p = position; float n = vn(p * 2.2 + uSeed + uT * 1.5); p *= 1.0 + (n - 0.5) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vP = position * 1.7 + uSeed; vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const FB_FS = NOISE + `uniform float uT, uHeat, uA, uTime; uniform vec3 uTint; varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){ float f = clamp(dot(normalize(vN), vV), 0.0, 1.0); float n = fbm3(vP + vec3(0.0, uTime * 0.7, uTime * 0.4));
  float heat = pow(f, 1.3) * (1.25 - uT * 0.95) * uHeat + (n - 0.5) * 0.6;
  vec3 c = mix(uTint * 0.4, vec3(1.0, 0.35, 0.05), smoothstep(0.05, 0.45, heat));
  c = mix(c, vec3(1.0, 0.82, 0.38), smoothstep(0.4, 0.8, heat)); c = mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.8, 1.15, heat));
  float a = smoothstep(-0.1, 0.35, heat) * uA * (0.55 + 0.45 * f);
  gl_FragColor = vec4(c * a * 1.6, a);
#include <colorspace_fragment>
}`;
const RING_FS = `uniform float uR, uW, uA; uniform vec3 uC; varying vec2 vUv;
void main(){ float d = length(vUv - 0.5) * 2.0; float r = exp(-pow((d - uR) / max(0.005, uW), 2.0)); float a = r * uA; gl_FragColor = vec4(uC * a, a);
#include <colorspace_fragment>
}`;
const UV_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PART_VS = `attribute float aSize; attribute vec4 aCol; varying vec4 vCol; uniform float uPr;
void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * uPr * 300.0 / max(0.5, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }`;
const PART_FS = `varying vec4 vCol; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard; float a = (exp(-d * 4.0) * 0.85 + (1.0 - d) * 0.15) * vCol.a; gl_FragColor = vec4(vCol.rgb * a, a);
#include <colorspace_fragment>
}`;
const STAR_VS = `attribute float aSize; attribute vec3 aCol; attribute float aPh; varying vec3 vCol; varying float vTw; uniform float uPr, uTime, uWarp;
void main(){ vCol = aCol; vTw = 0.75 + 0.25 * sin(uTime * (1.5 + aPh * 3.0) + aPh * 40.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPr * (1.0 + uWarp * 0.5); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99998; }`;
const STAR_FS = `varying vec3 vCol; varying float vTw; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p, p); if (d > 1.0) discard; float a = exp(-d * 5.0) * vTw; gl_FragColor = vec4(vCol * a, a);
#include <colorspace_fragment>
}`;
const DUST_VS = `attribute float aEnd; uniform vec3 uOff; uniform float uL; uniform vec3 uVel; uniform float uStreak; uniform float uPr; varying float vA;
void main(){ vec3 p = mod(position - uOff, uL) - uL * 0.5; float fade = 1.0 - smoothstep(uL * 0.28, uL * 0.5, length(p));
  p -= uVel * uStreak * aEnd; vA = fade * (1.0 - aEnd * 0.85);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(2.2 * uPr * 60.0 / max(1.0, -mv.z), 1.0, 5.0); gl_Position = projectionMatrix * mv; }`;
const DUST_FS = `uniform vec3 uC; uniform float uA; varying float vA; void main(){ float a = vA * uA; gl_FragColor = vec4(uC * a, a);
#include <colorspace_fragment>
}`;
const TUN_FS = NOISE + `uniform float uT, uA, uHue; varying vec2 vUv;
void main(){ float ang = vUv.x * 6.2831853; float z = vUv.y;
  float s1 = vn(vec3(cos(ang) * 9.0, sin(ang) * 9.0, z * 30.0 - uT * 40.0)); float s2 = vn(vec3(cos(ang) * 22.0, sin(ang) * 22.0, z * 70.0 - uT * 90.0));
  float streak = pow(s1, 6.0) * 2.4 + pow(s2, 10.0) * 3.0;
  float rings = pow(0.5 + 0.5 * sin(z * 140.0 - uT * 60.0), 24.0) * 0.6;
  vec3 c = mix(vec3(0.25, 0.55, 1.0), vec3(0.85, 0.35, 1.0), 0.5 + 0.5 * sin(ang * 3.0 + uT + uHue));
  c = mix(c, vec3(1.0), clamp(streak * 0.4, 0.0, 1.0));
  float ends = smoothstep(0.0, 0.25, z) * (1.0 - smoothstep(0.75, 1.0, z));
  float a = (streak + rings + 0.08) * uA * ends; gl_FragColor = vec4(c * a, a);
#include <colorspace_fragment>
}`;
const OVL_FS = NOISE + `uniform float uShield, uOn, uHit, uTime, uDmg, uWarp, uAsp; uniform vec2 uHitPt; varying vec2 vUv;
void main(){ vec2 p = (vUv - 0.5) * vec2(uAsp, 1.0) * 2.0; float r = length(p);
  vec2 h = p * 9.0; h.y *= 1.1547; h.x += floor(h.y) * 0.5; vec2 g = abs(fract(h) - 0.5); float hex = smoothstep(0.38, 0.5, max(g.x * 1.5 + g.y * 0.0, g.y));
  float edge = smoothstep(0.55, 1.5, r);
  float ripple = exp(-pow((distance(p, uHitPt) - (1.0 - uShield) * 2.5) * 3.0, 2.0)) * uShield;
  float a = (hex * (0.25 + edge) * 0.3 + edge * 0.4) * uShield + ripple * (0.4 + hex) * 0.8;
  a += uOn * (edge * 0.035 + hex * edge * 0.03 * (0.6 + 0.4 * sin(uTime * 2.0 + p.x * 3.0)));
  vec3 c = vec3(0.35, 0.75, 1.0) * a;
  float hit = uHit * (smoothstep(0.4, 1.6, r) + 0.15); c += vec3(1.0, 0.18, 0.05) * hit; a += hit;
  float n = vn(vec3(p * 40.0, uTime * 30.0)); c += vec3(0.6, 0.9, 1.0) * uDmg * step(0.93, n) * 0.6;
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0));
#include <colorspace_fragment>
}`;

/* ---------------- sector look (seeded) ---------------- */
const PALETTES = [
  [[0.9, 0.25, 0.55], [0.25, 0.35, 1.0], [1.0, 0.75, 0.5], [0.01, 0.012, 0.035]],
  [[0.2, 0.75, 0.9], [0.45, 0.2, 0.9], [0.9, 1.0, 1.0], [0.008, 0.016, 0.03]],
  [[1.0, 0.45, 0.15], [0.7, 0.1, 0.3], [1.0, 0.9, 0.6], [0.025, 0.01, 0.015]],
  [[0.3, 0.9, 0.55], [0.1, 0.35, 0.6], [0.85, 1.0, 0.8], [0.006, 0.02, 0.02]],
  [[0.75, 0.3, 1.0], [1.0, 0.35, 0.45], [1.0, 0.85, 1.0], [0.018, 0.008, 0.035]],
  [[0.95, 0.8, 0.35], [0.85, 0.35, 0.2], [1.0, 1.0, 0.85], [0.02, 0.015, 0.012]],
  [[0.3, 0.5, 1.0], [0.1, 0.9, 0.9], [0.85, 0.95, 1.0], [0.006, 0.01, 0.03]],
];
export function sectorLook(seed) {
  const R = S.rng(seed * 2654435761 >>> 0), pal = PALETTES[R.i(PALETTES.length)];
  const v3 = () => { const a = R() * Math.PI * 2, z = R() * 2 - 1, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; };
  const sun = v3(); sun[1] = sun[1] * 0.5;
  return { pal, axis: v3(), sun: S.V.norm(sun), sunCol: [[1, 0.9, 0.75], [0.75, 0.85, 1], [1, 0.6, 0.35], [1, 1, 0.95]][R.i(4)], off: [R() * 50, R() * 50, R() * 50], dens: 0.7 + R() * 0.7, band: 2 + R() * 6,
    planet: R() < 0.55 ? { dir: S.V.norm([R() * 2 - 1, (R() - 0.5) * 0.8, R() * 2 - 1]), size: 380 + R() * 520, c1: [R(), R() * 0.8, R()], c2: [R(), R(), R() * 0.6], ring: R() < 0.4, seed: R() * 100 } : null };
}
const PLANET_FS = NOISE + `uniform vec3 uSun, c1, c2, uAtm; uniform float uSeed; varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){ vec3 n = normalize(vN); vec3 p = normalize(vP);
  float bands = fbm(vec3(p.y * 6.0 + fbm(p * 3.0 + uSeed) * 2.0, uSeed, 0.0)); float cont = fbm(p * 2.5 + uSeed);
  vec3 col = mix(c1, c2, smoothstep(0.35, 0.7, mix(bands, cont, 0.5)));
  col *= 0.7 + 0.5 * fbm(p * 12.0 + uSeed);
  float l = max(0.0, dot(n, uSun)); float term = smoothstep(-0.05, 0.25, dot(n, uSun));
  float rim = pow(1.0 - max(0.0, dot(n, normalize(vV))), 3.0);
  vec3 c = col * (l * 1.1 + 0.015) + uAtm * rim * (0.2 + term * 1.4);
  gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}`;

/* ==========================================================================
   Renderer
   ========================================================================== */
export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas; this.opts = opts; this.msaa = !!opts.msaa;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; opts.onLost && opts.onLost(); }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; opts.onRestored && opts.onRestored(); }, false);
    this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.toneMapping = THREE.NoToneMapping;
    const ua = navigator.userAgent;
    this.ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    this.mobile = this.ios || /Android/i.test(ua);
    this.phone = this.mobile && Math.min(screen.width, screen.height) < 600;
    this.lockTier = opts.q != null; this.maxTier = 3;
    // desktop starts at the top tier, tablets one lower, phones one lower again (still with bloom)
    this.tier = this.lockTier ? clamp(+opts.q, 0, 3) : this.phone ? 2 : this.mobile ? 2 : 3;
    this.cubeSize = this.phone ? 512 : this.mobile ? 512 : 1024;
    if (this.lockTier && this.tier <= 1) this.cubeSize = 256;
    this.ft = []; this.time = 0; this.lastCheck = -99; this.selfChecks = 0; this.lastSelf = null;
    this.shake = 0; this.flash = 0; this.flashCol = new THREE.Color(1, 1, 1); this.W = 1; this.H = 1; this.pr = 1; this.fov = 70;
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(70, 1, 0.1, 9000); this.scene.add(this.cam);
    const gl = this.r.getContext();
    this.hdr = opts.hdr !== false && !this.ios && !this.mobile && this.r.capabilities.isWebGL2 && !!gl.getExtension('EXT_color_buffer_float') && (this.lockTier ? this.tier >= 2 : true);
    this.post = new Post(this.r, this.hdr);
    this.build();
  }
  build() {
    const sc = this.scene;
    // sky
    const mk = sz => new THREE.WebGLCubeRenderTarget(sz, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace });
    this.cubes = [mk(this.cubeSize), mk(this.cubeSize)]; this.cubeIdx = 0;
    this.nebMat = new THREE.ShaderMaterial({ uniforms: { c1: { value: new THREE.Vector3() }, c2: { value: new THREE.Vector3() }, c3: { value: new THREE.Vector3() }, bg: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Vector3() }, axis: { value: new THREE.Vector3() }, off: { value: new THREE.Vector3() }, dens: { value: 1 }, steps: { value: this.cubeSize >= 1024 ? 16 : this.cubeSize >= 512 ? 12 : 7 }, band: { value: 4 } }, vertexShader: NEB_VS, fragmentShader: NEB_FS, side: THREE.BackSide, depthWrite: false });
    this.nebScene = new THREE.Scene(); this.nebScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.nebMat));
    this.cubeCam = new THREE.CubeCamera(0.1, 100, this.cubes[0]); this.nebScene.add(this.cubeCam);
    this.skyMat = new THREE.ShaderMaterial({ uniforms: { cube: { value: this.cubes[0].texture }, fade: { value: 1 } }, vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat); this.sky.renderOrder = -10; this.sky.frustumCulled = false; sc.add(this.sky);
    ENV.cube.value = this.cubes[0].texture;
    // far stars
    const N = this.mobile ? 3000 : 5000, P = new Float32Array(N * 3), Sz = new Float32Array(N), Cl = new Float32Array(N * 3), Ph = new Float32Array(N);
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1, r = Math.sqrt(1 - z * z); P.set([r * Math.cos(a) * 4000, z * 4000, r * Math.sin(a) * 4000], i * 3);
      const m = Math.pow(Math.random(), 5); Sz[i] = 1.2 + m * 5; const t = Math.random(); const c = t < 0.15 ? [1, 0.75, 0.55] : t < 0.35 ? [0.7, 0.82, 1] : [1, 0.97, 0.92]; const b = 0.35 + m * 1.6; Cl.set([c[0] * b, c[1] * b, c[2] * b], i * 3); Ph[i] = Math.random(); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(P, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(Sz, 1)); sg.setAttribute('aCol', new THREE.BufferAttribute(Cl, 3)); sg.setAttribute('aPh', new THREE.BufferAttribute(Ph, 1));
    this.starMat = new THREE.ShaderMaterial({ uniforms: { uPr: { value: 1 }, uTime: { value: 0 }, uWarp: { value: 0 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -9; this.stars.frustumCulled = false; sc.add(this.stars);
    // near dust: dots + streak lines
    const DN = this.mobile ? 900 : 1600, L = 360; this.dustL = L;
    const dp = new Float32Array(DN * 3); for (let i = 0; i < DN * 3; i++) dp[i] = Math.random() * L;
    const lp = new Float32Array(DN * 6), le = new Float32Array(DN * 2); for (let i = 0; i < DN; i++) { lp.set([dp[i * 3], dp[i * 3 + 1], dp[i * 3 + 2], dp[i * 3], dp[i * 3 + 1], dp[i * 3 + 2]], i * 6); le[i * 2 + 1] = 1; }
    const du = { uOff: { value: new THREE.Vector3() }, uL: { value: L }, uVel: { value: new THREE.Vector3() }, uStreak: { value: 0 }, uPr: { value: 1 }, uC: { value: new THREE.Color(0.75, 0.85, 1) }, uA: { value: 0.9 } };
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dg.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(DN), 1));
    this.dustU = du; this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({ uniforms: du, vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); this.dust.frustumCulled = false; sc.add(this.dust);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aEnd', new THREE.BufferAttribute(le, 1));
    this.streakU = Object.assign({}, du, { uA: { value: 0 } });
    this.streaks = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: this.streakU, vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); this.streaks.frustumCulled = false; sc.add(this.streaks);
    // lights
    this.amb = new THREE.HemisphereLight(0x8090c0, 0x201820, 0.55); sc.add(this.amb);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.6); sc.add(this.sun); sc.add(this.sun.target);
    this.flashLights = []; for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffaa66, 0, 300, 1.6); l.userData = { t: 9, life: 1, i0: 0 }; sc.add(l); this.flashLights.push(l); }
    // sun glow + planet
    const T = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.8)'); g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, false);
    this.glowTex = T;
    this.sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: T, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); this.sunSpr.renderOrder = -8; sc.add(this.sunSpr);
    this.flares = []; for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T, color: [0x6080ff, 0xff8040, 0x40ffb0, 0xff60c0, 0xffffff][i], blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.25 })); s.renderOrder = 50; this.cam.add(s); this.flares.push(s); }
    this.planetMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3() }, c1: { value: new THREE.Vector3() }, c2: { value: new THREE.Vector3() }, uAtm: { value: new THREE.Vector3(0.4, 0.6, 1) }, uSeed: { value: 0 } }, vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`, fragmentShader: PLANET_FS });
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), this.planetMat); this.planet.renderOrder = -7; sc.add(this.planet);
    const ringM = new THREE.ShaderMaterial({ uniforms: { uR: { value: 0.75 }, uW: { value: 0.12 }, uA: { value: 0.5 }, uC: { value: new THREE.Color(0.8, 0.7, 0.55) } }, vertexShader: UV_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.pring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringM); this.pring.renderOrder = -6; this.planet.add(this.pring); this.pring.scale.setScalar(2.4); this.pring.rotation.x = -1.2;
    // ship pools
    this.pools = { darter: [], lancer: [], hive: [], wing: [], rival: [] }; this.shipObj = new Map();
    this.base = makeStarbase(); this.base.visible = false; sc.add(this.base);
    this.drone = makeDrone(); this.drone.visible = false; sc.add(this.drone);
    // shots
    this.torpPool = []; this.plasPool = [];
    // particles
    this.PN = this.mobile ? 1800 : 3200; this.parts = [];
    const pg = new THREE.BufferGeometry(); this.pPos = new Float32Array(this.PN * 3); this.pSize = new Float32Array(this.PN); this.pCol = new Float32Array(this.PN * 4);
    pg.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage)); pg.setAttribute('aCol', new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.partMat = new THREE.ShaderMaterial({ uniforms: { uPr: { value: 1 } }, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(pg, this.partMat); this.points.frustumCulled = false; this.points.renderOrder = 5; sc.add(this.points);
    // fireballs, rings, debris
    this.fbs = []; const fbg = new THREE.IcosahedronGeometry(1, 3);
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(fbg, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uSeed: { value: rnd(0, 50) }, uHeat: { value: 1 }, uA: { value: 1 }, uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 0.3, 0.5) } }, vertexShader: FB_VS, fragmentShader: FB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; m.userData = { t: 9, life: 1, pos: [0, 0, 0] }; m.renderOrder = 6; sc.add(m); this.fbs.push(m); }
    this.rings = []; for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { uR: { value: 0.9 }, uW: { value: 0.05 }, uA: { value: 0 }, uC: { value: new THREE.Color(0.6, 0.8, 1) } }, vertexShader: UV_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; m.userData = { t: 9, life: 1, pos: [0, 0, 0] }; m.renderOrder = 7; sc.add(m); this.rings.push(m); }
    const chunk = new THREE.TetrahedronGeometry(1, 0); chunk.scale(1, 0.4, 0.7);
    this.debris = new THREE.InstancedMesh(chunk, new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.5, metalness: 0.7, emissive: 0xffffff, emissiveIntensity: 0 }), 260);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.debris.count = 0; this.debris.frustumCulled = false; this.deb = [];
    this.debris.setColorAt(0, new THREE.Color()); sc.add(this.debris);
    // the debris material: instance colour drives emissive heat (hot chunks glow and cool)
    this.debris.material.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance = vColor * vec3(2.2, 0.9, 0.35) * max(0.0, vColor.r - 0.35);\n#endif'); };
    // hyperwarp tunnel
    this.tunMat = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 }, uHue: { value: 0 } }, vertexShader: UV_VS, fragmentShader: TUN_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
    const tg = new THREE.CylinderGeometry(14, 14, 1600, 48, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -700);
    this.tunnel = new THREE.Mesh(tg, this.tunMat); this.tunnel.visible = false; this.tunnel.renderOrder = 20; this.tunnel.frustumCulled = false; this.cam.add(this.tunnel);
    // cockpit + overlay (camera children)
    this.ckLight = new THREE.PointLight(0x5ad0ff, 0.6, 3, 2); this.ckLight.position.set(0, -0.3, -0.3); this.cam.add(this.ckLight);
    this.ckFlash = new THREE.PointLight(0xffffff, 0, 6, 2); this.ckFlash.position.set(0, 0.5, -1.6); this.cam.add(this.ckFlash);
    this.ovlU = { uShield: { value: 0 }, uOn: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 }, uDmg: { value: 0 }, uWarp: { value: 0 }, uAsp: { value: 1 }, uHitPt: { value: new THREE.Vector2() } };
    this.ovl = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: this.ovlU, vertexShader: UV_VS, fragmentShader: OVL_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    this.ovl.renderOrder = 40; this.ovl.frustumCulled = false; this.cam.add(this.ovl);
    this.cockpit = null; this.look = null; this.lookSeed = -1; this.bake = null;
  }
  /* ---------- sector sky ---------- */
  setSector(seed, now) {
    if (seed === this.lookSeed) return;
    this.lookSeed = seed; const L = sectorLook(seed); const U = this.nebMat.uniforms;
    U.c1.value.fromArray(L.pal[0]).multiplyScalar(L.dens); U.c2.value.fromArray(L.pal[1]).multiplyScalar(L.dens); U.c3.value.fromArray(L.pal[2]); U.bg.value.fromArray(L.pal[3]);
    U.sunDir.value.fromArray(L.sun); U.sunCol.value.fromArray(L.sunCol); U.axis.value.fromArray(L.axis); U.off.value.fromArray(L.off); U.band.value = L.band; U.dens.value = 1;
    this.pendingLook = L;
    const target = this.cubes[1 - this.cubeIdx];
    this.bake = { rt: target, face: 0, L };
    if (now) { while (this.bake) this.bakeStep(); }
  }
  bakeStep() {
    const b = this.bake; if (!b) return;
    const cc = this.cubeCam; cc.renderTarget = b.rt; if (cc.coordinateSystem !== this.r.coordinateSystem) { cc.coordinateSystem = this.r.coordinateSystem; cc.updateCoordinateSystem(); }
    const cams = cc.children, prevRT = this.r.getRenderTarget();
    this.r.setRenderTarget(b.rt, b.face); this.r.render(this.nebScene, cams[b.face]); this.r.setRenderTarget(prevRT);
    b.face++;
    if (b.face >= 6) { this.cubeIdx = 1 - this.cubeIdx; this.skyMat.uniforms.cube.value = b.rt.texture; ENV.cube.value = b.rt.texture; this.applyLook(b.L); this.bake = null; }
  }
  applyLook(L) {
    this.look = L;
    const sd = new THREE.Vector3().fromArray(L.sun);
    this.sun.position.copy(sd).multiplyScalar(100); this.sun.target.position.set(0, 0, 0); this.sun.color.setRGB(L.sunCol[0], L.sunCol[1], L.sunCol[2]);
    const c = L.pal[0]; this.amb.color.setRGB(0.35 + c[0] * 0.4, 0.35 + c[1] * 0.4, 0.4 + c[2] * 0.4); this.amb.groundColor.setRGB(L.pal[1][0] * 0.25, L.pal[1][1] * 0.25, L.pal[1][2] * 0.25);
    this.sunSpr.position.copy(sd).multiplyScalar(4200); this.sunSpr.scale.setScalar(900); this.sunSpr.material.color.setRGB(L.sunCol[0] * 1.2, L.sunCol[1] * 1.2, L.sunCol[2] * 1.2);
    this.planet.visible = !!L.planet;
    if (L.planet) { const P = L.planet, U = this.planetMat.uniforms; U.uSun.value.copy(sd); U.c1.value.fromArray(P.c1); U.c2.value.fromArray(P.c2); U.uSeed.value = P.seed; U.uAtm.value.set(0.3 + P.c2[0] * 0.5, 0.5 + P.c2[1] * 0.4, 1.0);
      this.planetBase = new THREE.Vector3().fromArray(P.dir).multiplyScalar(3600); this.planet.scale.setScalar(P.size); this.pring.visible = P.ring; }
  }
  /* ---------- sizing ---------- */
  setTier(t) { t = clamp(t, 0, this.maxTier); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 99; }
  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = Math.min(devicePixelRatio || 1, 3);
    const cap = this.tier >= 3 ? 2 : this.tier >= 2 ? 1.5 : this.tier >= 1 ? 1.25 : 1;
    let pr = Math.min(dpr, cap); const maxPx = this.phone ? 2.2e6 : this.mobile ? 3.2e6 : 5.2e6; if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    this.pr = pr; this.W = w; this.H = h;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.post.setSize(Math.round(w * pr), Math.round(h * pr), this.tier >= 3 ? 2 : 4);
    const asp = w / h; this.fov = asp < 1 ? clamp(2 * Math.atan(Math.tan(36 * Math.PI / 180) / asp) * 180 / Math.PI, 70, 100) : 68;
    this.cam.aspect = asp; this.cam.fov = this.fov; this.cam.updateProjectionMatrix();
    if (this.cockpit) { this.cam.remove(this.cockpit); this.cockpit.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.cockpit = makeCockpit(asp, this.fov); this.cam.add(this.cockpit); this.cockpitBuiltFov = this.fov;
    const hh = Math.tan(this.fov * Math.PI / 360) * 0.5; this.ovl.position.set(0, 0, -0.5); this.ovl.scale.set(hh * asp * 1.02, hh * 1.02, 1); this.ovlU.uAsp.value = asp;
    this._sized = true;
  }
  /** fraction of the screen height (from the top) where the console begins */
  consoleTop() { if (!this.cockpit) return 0.82; const u = this.cockpit.userData; return 0.5 - u.top / (2 * u.hh); }
  /* ---------- pools ---------- */
  getShip(kind) { const p = this.pools[kind]; let o = p.find(o => !o.userData.used); if (!o) { o = kind === 'darter' ? makeDarter() : kind === 'lancer' ? makeLancer() : kind === 'hive' ? makeHive() : makeWingman();
      if (kind === 'rival') o.traverse(c => { if (c.isMesh && c.material) { c.material = c.material.clone(); if (c.material.color) c.material.color.multiply(new THREE.Color(1.0, 0.62, 0.25)); if (c.material.emissive) c.material.emissive.setRGB(0.35, 0.12, 0.0); } if (c.isSprite && c.userData.engine) c.material = Object.assign(c.material.clone(), {}), c.material.color && c.material.color.setRGB(1, 0.55, 0.15); });
      o.userData.kind = kind; p.push(o); this.scene.add(o); } o.userData.used = true; o.visible = true; return o; }
  sprite(pool, col, s) { let o = pool.find(o => !o.userData.used); if (!o) { o = new THREE.Group(); const a = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); a.scale.setScalar(s); const b = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); b.scale.setScalar(s * 0.35); o.add(a, b); o.userData.a = a; o.userData.b = b; o.renderOrder = 8; pool.push(o); this.scene.add(o); } o.userData.used = true; o.visible = true; return o; }
  /* ---------- particles / effects ---------- */
  emit(pos, vel, n, o = {}) {
    const k = this.tier === 0 ? 0.5 : this.tier === 1 ? 0.75 : 1; n = Math.ceil(n * k);
    for (let i = 0; i < n && this.parts.length < this.PN; i++) {
      const d = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)], dl = Math.hypot(...d) || 1, sp = rnd(o.v0 || 2, o.v1 || 30);
      const c = o.col || [1, 0.6, 0.3];
      this.parts.push({ p: [pos[0], pos[1], pos[2]], v: [vel[0] + d[0] / dl * sp, vel[1] + d[1] / dl * sp, vel[2] + d[2] / dl * sp], t: 0, life: rnd(o.l0 || 0.4, o.l1 || 1.4), s0: o.s0 || 1.2, s1: o.s1 == null ? 0.2 : o.s1, c: [c[0] * rnd(0.8, 1.2), c[1] * rnd(0.8, 1.2), c[2] * rnd(0.8, 1.2)], drag: o.drag == null ? 0.6 : o.drag, a: o.a || 1 });
    }
  }
  fireball(pos, size, tint) { const m = this.fbs.find(m => m.userData.t >= m.userData.life) || this.fbs[0]; m.userData = { t: 0, life: 0.7 + size * 0.35, size, pos: pos.slice() }; m.material.uniforms.uSeed.value = rnd(0, 50); m.material.uniforms.uTint.value.setRGB(...(tint || [1, 0.3, 0.5])); m.visible = true; }
  ring(pos, r1, life, col, w = 0.06, a = 1) { const m = this.rings.find(m => m.userData.t >= m.userData.life) || this.rings[0]; m.userData = { t: 0, life, r1, pos: pos.slice(), w, a }; m.material.uniforms.uC.value.setRGB(...col); m.visible = true; }
  light(pos, col, i0, life, range = 300) { const l = this.flashLights.reduce((a, b) => (a.userData.t / a.userData.life > b.userData.t / b.userData.life ? a : b)); l.userData = { t: 0, life, i0, pos: pos.slice() }; l.color.setRGB(...col); l.distance = range; l.intensity = i0; }
  debrisBurst(pos, vel, n, size) { for (let i = 0; i < n; i++) { if (this.deb.length >= 260) this.deb.shift(); const d = [rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)], sp = rnd(5, 28) * Math.sqrt(size); this.deb.push({ p: pos.slice(), v: [vel[0] * 0.5 + d[0] * sp, vel[1] * 0.5 + d[1] * sp, vel[2] * 0.5 + d[2] * sp], r: [rnd(0, 6), rnd(0, 6), rnd(0, 6)], w: [rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)], s: rnd(0.25, 1.1) * Math.sqrt(size), t: 0, life: rnd(2, 4.5), hot: rnd(0.6, 1) }); } }
  explode(pos, size, vel = [0, 0, 0], tint) {
    const s = size;
    this.fireball(pos, 4 * s, tint); if (s > 1.2) setTimeout(() => this.fireball([pos[0] + rnd(-3, 3) * s, pos[1] + rnd(-3, 3) * s, pos[2] + rnd(-3, 3) * s], 3 * s, tint), 120);
    if (s > 2) setTimeout(() => this.fireball([pos[0] + rnd(-5, 5), pos[1] + rnd(-5, 5), pos[2] + rnd(-5, 5)], 5 * s, tint), 260);
    this.ring(pos, 22 * s, 0.9 + s * 0.2, [0.7, 0.85, 1], 0.04, 1);
    this.ring(pos, 12 * s, 0.6, [1, 0.6, 0.3], 0.1, 0.8);
    this.emit(pos, vel, 70 * s, { v0: 6, v1: 55 * Math.sqrt(s), l0: 0.4, l1: 1.6, s0: 0.9, s1: 0.1, col: [1, 0.65, 0.3] });
    this.emit(pos, vel, 30 * s, { v0: 2, v1: 12, l0: 0.6, l1: 1.4, s0: 3.5 * s, s1: 6 * s, col: [0.9, 0.35, 0.2], drag: 1.5, a: 0.45 });
    this.emit(pos, vel, 20 * s, { v0: 40, v1: 120, l0: 0.2, l1: 0.5, s0: 0.5, s1: 0.1, col: [1, 1, 0.9], drag: 0.2 });
    this.debrisBurst(pos, vel, Math.round(14 * s), s);
    this.light(pos, [1, 0.6, 0.35], 40 * s, 0.8 + s * 0.3, 250 * s);
  }
  /* ---------- per frame ---------- */
  frame(dtIn, V) {
    if (this.lost) return;
    const dt = Math.min(0.05, dtIn); this.time += dt; const T = this.time;
    if (!this._sized) this.resize();
    if (this.bake) this.bakeStep();
    const me = V.me, cp = me ? me.pos : [0, 0, 0];
    const rel = (p, o) => o.position.set(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]);
    // camera orientation (aft view looks backward), shake
    const q = me ? me.q : [0, 0, 0, 1];
    this.cam.quaternion.set(q[0], q[1], q[2], q[3]);
    if (me && me.view === 'aft') this.cam.rotateY(Math.PI);
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.shake > 0) { const k = this.shake * this.shake * 0.03; this.cam.rotateX(rnd(-k, k)); this.cam.rotateY(rnd(-k, k)); this.cam.rotateZ(rnd(-k, k) * 0.6); }
    this.cam.updateMatrixWorld(true);
    // warp
    const w = me && me.warp, inTunnel = w && w.phase === 'tunnel';
    let warpK = 0;
    if (w) warpK = w.phase === 'spool' ? clamp(w.t / w.spool, 0, 1) : w.phase === 'tunnel' ? 1 : clamp(1 - w.t / w.exit, 0, 1);
    const fovT = this.fov + (w ? (w.phase === 'spool' ? warpK * warpK * 25 : w.phase === 'tunnel' ? 22 : warpK * 25) : 0);
    if (Math.abs(this.cam.fov - fovT) > 0.05) { this.cam.fov += (fovT - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix(); }
    this.tunnel.visible = !!inTunnel || (w && w.phase === 'spool' && warpK > 0.85);
    this.tunMat.uniforms.uT.value = T; this.tunMat.uniforms.uA.value = inTunnel ? clamp(w.t * 2, 0, 1) * clamp((w.dur - w.t) * 2, 0, 1) * 1.2 : (w && w.phase === 'spool' ? (warpK - 0.85) * 6 : 0);
    if (inTunnel) { this.tunnel.rotation.z = T * 0.6; this.tunnel.position.x = -(w.m[0]) * 3; this.tunnel.position.y = -(w.m[1]) * 3; }
    // sky
    this.skyMat.uniforms.fade.value = inTunnel ? 0.15 : 1;
    this.starMat.uniforms.uPr.value = this.pr; this.starMat.uniforms.uTime.value = T; this.starMat.uniforms.uWarp.value = warpK;
    this.stars.visible = !inTunnel;
    if (this.look && this.look.planet) { const pp = this.planetBase.clone().sub(new THREE.Vector3(cp[0], cp[1], cp[2]).multiplyScalar(0.04)); this.planet.position.copy(pp); this.planet.visible = !inTunnel; }
    this.sunSpr.visible = !inTunnel;
    // lens flare
    if (this.look) { const sp = this.sunSpr.position.clone().project(this.cam); const on = sp.z < 1 && Math.abs(sp.x) < 1.2 && Math.abs(sp.y) < 1.2 && !inTunnel;
      this.flares.forEach((f, i) => { f.visible = on && this.tier >= 2; if (!on) return; const k = [0.4, -0.2, -0.6, -1.0, -1.5][i], hh = Math.tan(this.cam.fov * Math.PI / 360) * 2; f.position.set(sp.x * k * hh * this.cam.aspect, sp.y * k * hh, -2); f.scale.setScalar([0.18, 0.08, 0.3, 0.12, 0.45][i] * (1 - Math.min(1, Math.hypot(sp.x, sp.y)) * 0.6)); f.material.opacity = 0.18 * (1 - Math.min(1, Math.hypot(sp.x, sp.y))); }); }
    // dust
    const f = me ? S.fwdOf(me.q) : [0, 0, -1], spd = me ? me.speed : 0, L = this.dustL;
    const vel = [f[0] * spd, f[1] * spd, f[2] * spd];
    const ofs = [((cp[0] % L) + L) % L, ((cp[1] % L) + L) % L, ((cp[2] % L) + L) % L];
    for (const U of [this.dustU, this.streakU]) { U.uOff.value.set(ofs[0], ofs[1], ofs[2]); U.uVel.value.set(vel[0], vel[1], vel[2]); U.uPr.value = this.pr; }
    this.streakU.uStreak.value = 0.05 + warpK * 0.6; this.streakU.uA.value = clamp(spd / 40, 0, 1) * 0.9 + warpK;
    this.dustU.uA.value = inTunnel ? 0 : 0.85;
    this.dust.visible = !inTunnel; this.streaks.visible = !inTunnel;
    // ships
    for (const k in this.pools) for (const o of this.pools[k]) o.userData.used = false;
    const seen = new Set();
    for (const s of V.ships || []) {
      let o = this.shipObj.get(s.id);
      if (!o || o.userData.kind !== s.kind) { o = this.getShip(s.kind); this.shipObj.set(s.id, o); }
      o.userData.used = true; o.visible = true; seen.add(s.id);
      rel(s.pos, o); const fw = s.fwd; o.up.set(0, 1, 0); o.lookAt(o.position.x + fw[0], o.position.y + fw[1], o.position.z + fw[2]); o.rotateZ(s.bank || 0);
      o.traverse(c => { if (c.userData.engine) { const k = 0.85 + 0.3 * Math.random(); c.material.opacity = k; } });
      if (s.kind === 'hive') { const ring = o.getObjectByName('ring'); ring.rotation.y = T * 0.4; const shm = o.getObjectByName('shield').material.uniforms; shm.uTime.value = T; shm.uA.value = (s.sh || 0) / 4 * 0.35; shm.uHitT.value += dt; }
      const hit = s.hitT > 0; o.traverse(c => { if (c.isMesh && c.material.emissiveIntensity != null && c.material.map) c.material.emissiveIntensity = hit ? 4 : c.material.userData.ei || (c.material.userData.ei = c.material.emissiveIntensity); });
    }
    for (const [id, o] of this.shipObj) if (!seen.has(id)) { this.shipObj.delete(id); }
    // the co-op buddy
    if (V.buddy) { const b = V.buddy, bk = b.rival ? 'rival' : 'wing'; let o = this.shipObj.get('buddy'); if (!o || o.userData.kind !== bk) { o = this.getShip(bk); this.shipObj.set('buddy', o); } o.userData.used = true; o.visible = true; rel(b.pos, o); const bq = b.q; o.quaternion.set(bq[0], bq[1], bq[2], bq[3]); o.rotateY(Math.PI); }
    else this.shipObj.delete('buddy');
    for (const k in this.pools) for (const o of this.pools[k]) if (!o.userData.used) o.visible = false;
    // starbase + drone
    this.base.visible = !!V.base && !inTunnel;
    if (this.base.visible) { rel(S.BASE_POS, this.base); this.base.rotation.y = Math.PI; const spin = this.base.getObjectByName('spin'); spin.rotation.y = T * 0.08;
      this.base.traverse(c => { if (c.userData.blink != null) c.material.opacity = c.userData.blink === 99 ? (Math.sin(T * 3) > 0.6 ? 1 : 0.1) : (Math.sin(T * 2 + c.userData.blink) > 0 ? 1 : 0.25); if (c.userData.chase != null) c.material.opacity = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(T * 6 - c.userData.chase * 0.8), 4); }); }
    this.drone.visible = false;
    if (me && me.dock && V.base) {
      const D = me.dock, bay = [S.BASE_POS[0], S.BASE_POS[1], S.BASE_POS[2] + 24], u = S.upOf(me.q);
      const park = [me.pos[0] + f[0] * 7 - u[0] * 1.2, me.pos[1] + f[1] * 7 - u[1] * 1.2, me.pos[2] + f[2] * 7 - u[2] * 1.2];
      let k = -1; if (D.phase === 'drone') k = clamp(D.t / 1.8, 0, 1); else if (D.phase === 'done') k = 1 - clamp(D.t / 2, 0, 1);
      if (k >= 0) { const e = k * k * (3 - 2 * k), p = [bay[0] + (park[0] - bay[0]) * e, bay[1] + (park[1] - bay[1]) * e + Math.sin(e * Math.PI) * 8, bay[2] + (park[2] - bay[2]) * e];
        this.drone.visible = true; rel(p, this.drone); this.drone.lookAt(-0.0001, 0, 0); this.drone.position.x += Math.sin(T * 2.1) * 0.15; this.drone.position.y += Math.sin(T * 1.7) * 0.12;
        this.drone.traverse(c => { if (c.userData.blink != null) c.material.opacity = Math.sin(T * 8) > 0 ? 1 : 0.2; });
        const beam = this.drone.getObjectByName('beam'); const on = D.phase === 'drone' && D.t > 1.8 && D.t < 5.3; beam.material.uniforms.uA.value = on ? 0.9 : 0; beam.material.uniforms.uT.value = T; beam.scale.set(1, 1, Math.max(0.1, this.drone.position.length() - 2.5));
        if (on && Math.random() < dt * 30) { const sp = [me.pos[0] + f[0] * 2.2 + rnd(-1, 1), me.pos[1] + f[1] * 2.2 - 0.6 + rnd(-0.5, 0.5), me.pos[2] + f[2] * 2.2 + rnd(-1, 1)]; this.emit(sp, [0, 0, 0], 3, { v0: 1, v1: 4, l0: 0.2, l1: 0.5, s0: 0.05, s1: 0.01, col: [0.6, 1, 0.9] }); } }
    }
    // shots
    for (const o of this.torpPool) o.userData.used = false; for (const o of this.plasPool) o.userData.used = false;
    for (const s of V.shots || []) {
      if (s.kind === 'torp') { const o = this.sprite(this.torpPool, s.own === (me ? me.idx : 0) ? 0x60d8ff : 0x9affc8, 4.2); rel(s.pos, o); const k = 0.8 + Math.random() * 0.5; o.userData.a.scale.setScalar(4.2 * k); o.userData.b.scale.setScalar(1.5 * k);
        if (Math.random() < 0.9) this.emit(s.pos, [s.vel[0] * 0.05, s.vel[1] * 0.05, s.vel[2] * 0.05], 1, { v0: 0.5, v1: 2, l0: 0.15, l1: 0.35, s0: 0.7, s1: 0.05, col: [0.3, 0.7, 1] }); }
      else { const o = this.sprite(this.plasPool, 0xff2a80, 5.5); rel(s.pos, o); const k = 0.7 + Math.random() * 0.7; o.userData.a.scale.setScalar(5.5 * k); o.userData.b.scale.setScalar(1.6 * (1.4 - k * 0.5)); o.userData.b.material.color.setRGB(1, 0.8, 0.9);
        if (Math.random() < 0.7) this.emit(s.pos, [0, 0, 0], 1, { v0: 0.5, v1: 3, l0: 0.2, l1: 0.5, s0: 1.1, s1: 0.1, col: [1, 0.2, 0.55] }); }
    }
    for (const o of this.torpPool) if (!o.userData.used) o.visible = false; for (const o of this.plasPool) if (!o.userData.used) o.visible = false;
    // particles
    const P = this.parts; let n = 0;
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; p.t += dt; if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; } const dk = Math.exp(-p.drag * dt); p.v[0] *= dk; p.v[1] *= dk; p.v[2] *= dk; p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] += p.v[2] * dt; }
    for (const p of P) { const k = p.t / p.life; this.pPos[n * 3] = p.p[0] - cp[0]; this.pPos[n * 3 + 1] = p.p[1] - cp[1]; this.pPos[n * 3 + 2] = p.p[2] - cp[2]; this.pSize[n] = p.s0 + (p.s1 - p.s0) * k; const a = (1 - k) * (1 - k) * p.a; this.pCol[n * 4] = p.c[0]; this.pCol[n * 4 + 1] = p.c[1] * (1 - k * 0.5); this.pCol[n * 4 + 2] = p.c[2] * (1 - k * 0.7); this.pCol[n * 4 + 3] = a; n++; }
    const pg = this.points.geometry; pg.setDrawRange(0, n); pg.attributes.position.needsUpdate = true; pg.attributes.aSize.needsUpdate = true; pg.attributes.aCol.needsUpdate = true; this.partMat.uniforms.uPr.value = this.pr * (this.H / 800);
    // fireballs / rings / lights / debris
    for (const m of this.fbs) { const u = m.userData; if (u.t >= u.life) { m.visible = false; continue; } u.t += dt; const k = u.t / u.life; m.visible = true; rel(u.pos, m); m.scale.setScalar(u.size * (0.35 + 1.1 * (1 - Math.pow(1 - k, 2.2)))); const U = m.material.uniforms; U.uT.value = k; U.uTime.value = T; U.uA.value = 1 - k * k; U.uHeat.value = 1.2 - k * 0.5; }
    for (const m of this.rings) { const u = m.userData; if (u.t >= u.life) { m.visible = false; continue; } u.t += dt; const k = u.t / u.life; rel(u.pos, m); m.quaternion.copy(this.cam.quaternion); m.scale.setScalar(Math.max(0.1, u.r1 * (1 - Math.pow(1 - k, 2.4)))); const U = m.material.uniforms; U.uR.value = 0.9; U.uW.value = u.w * (1 + k); U.uA.value = u.a * (1 - k) * (1 - k); }
    for (const l of this.flashLights) { const u = l.userData; u.t += dt; const k = Math.max(0, 1 - u.t / u.life); l.intensity = u.i0 * k * k; if (u.pos) rel(u.pos, l); }
    { const D = this.deb, M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), E = new THREE.Euler(), Sv = new THREE.Vector3(), Pv = new THREE.Vector3(), c = new THREE.Color(); let w2 = 0;
      for (let i = 0; i < D.length; i++) { const d = D[i]; d.t += dt; if (d.t > d.life) continue; d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt; d.r[0] += d.w[0] * dt; d.r[1] += d.w[1] * dt; d.r[2] += d.w[2] * dt;
        const fade = Math.min(1, (d.life - d.t) * 2); E.set(d.r[0], d.r[1], d.r[2]); Qt.setFromEuler(E); Sv.setScalar(d.s * fade); Pv.set(d.p[0] - cp[0], d.p[1] - cp[1], d.p[2] - cp[2]); M.compose(Pv, Qt, Sv); this.debris.setMatrixAt(w2, M);
        const heat = Math.max(0, d.hot - d.t * 0.5); c.setRGB(0.3 + heat * 0.7, 0.28 + heat * 0.2, 0.3); this.debris.setColorAt(w2, c); D[w2++] = d; }
      D.length = w2; this.debris.count = w2; this.debris.instanceMatrix.needsUpdate = true; if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true; }
    // cockpit visibility, overlay
    if (this.cockpit) this.cockpit.visible = !!me && me.alive !== false && !V.noCockpit;
    const O = this.ovlU; O.uTime.value = T;
    O.uShield.value = me ? clamp((me.shieldT || 0) / 0.6, 0, 1) : 0; O.uOn.value = me && me.shields && me.dmg && me.dmg.S < 2 ? (me.dmg.S ? (Math.sin(T * 23) > 0.3 ? 1 : 0.2) : 1) : 0;
    O.uHit.value = Math.max(0, O.uHit.value - dt * 1.8); O.uDmg.value = me && me.dmg ? (me.dmg.C + me.dmg.L + me.dmg.R + me.dmg.P + me.dmg.E + me.dmg.S) / 12 * (Math.random() < 0.15 ? 1 : 0) : 0;
    this.ckFlash.intensity = Math.max(0, this.ckFlash.intensity - dt * 12);
    // flashes
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const post = this.tier >= 2;
    if (post) { const PU = this.post.mComp.uniforms; PU.flash.value = Math.min(0.95, this.flash); PU.flashCol.value.copy(this.flashCol); PU.time.value = T % 100; PU.str.value = this.tier >= 3 ? 1.0 : 0.85; PU.grain.value = this.tier >= 3 ? 0.01 : 0; PU.vig.value = 0.42; PU.ca.value = warpK * 0.025 + O.uHit.value * 0.012 + this.shake * 0.006;
      this.post.render(this.scene, this.cam); }
    else { O.uHit.value = Math.max(O.uHit.value, this.flash * 0.5); this.r.setRenderTarget(null); this.r.render(this.scene, this.cam); }
    if ((this.selfChecks < 3 && T - this.lastCheck > 1.2) || T - this.lastCheck > 20) { this.lastCheck = T; this.selfCheck(); }
    if (!this.lockTier) { this.ft.push(dtIn); if (this.ft.length >= 90) { const s = this.ft.slice().sort((a, b) => a - b), med = s[45]; this.ft.length = 0;
      if (med > 1 / 45 && this.hdr && !document.hidden) { this.hdr = false; this.post = new Post(this.r, false); this._sized = false; console.info('[star-raider] slow frames: HDR chain -> 8-bit'); }
      else if (med > 1 / 45 && this.tier > 0 && !document.hidden) { this.setTier(this.tier - 1); console.info('[star-raider] quality ->', this.tier); } } }
  }
  /** react to sim events */
  fx(list, me) {
    for (const e of list) {
      if (e.e === 'boom') { const tint = [1, 0.3, 0.5]; this.explode(e.pos, e.size, e.vel || [0, 0, 0], tint); if (me && S.V.dist(e.pos, me.pos) < 120) this.shake = Math.min(1.4, this.shake + 0.5 * e.size); this.flash = Math.max(this.flash, 0.06 * e.size); this.flashCol.setRGB(1, 0.8, 0.6); }
      else if (e.e === 'hullhit') { this.emit(e.pos, [0, 0, 0], 30, { v0: 8, v1: 40, l0: 0.2, l1: 0.6, s0: 0.5, s1: 0.05, col: [1, 0.7, 0.3] }); this.fireball(e.pos, 2.2); this.light(e.pos, [1, 0.6, 0.3], 15, 0.4); }
      else if (e.e === 'shieldhit') { this.emit(e.pos, [0, 0, 0], 26, { v0: 5, v1: 30, l0: 0.2, l1: 0.6, s0: 0.6, s1: 0.05, col: [1, 0.4, 0.8] }); this.ring(e.pos, 9, 0.5, [1, 0.4, 0.8], 0.08, 1);
        for (const [id, o] of this.shipObj) if (id === e.ship && o.userData.kind === 'hive') { const sh = o.getObjectByName('shield'); const lp = sh.worldToLocal(new THREE.Vector3(e.pos[0] - me.pos[0], e.pos[1] - me.pos[1], e.pos[2] - me.pos[2])); sh.material.uniforms.uHit.value.copy(lp.normalize()); sh.material.uniforms.uHitT.value = 0; } }
      else if (e.e === 'pop') { this.emit(e.pos, [0, 0, 0], 22, { v0: 4, v1: 26, l0: 0.2, l1: 0.5, s0: 0.6, s1: 0.05, col: [1, 0.5, 0.9] }); this.ring(e.pos, 6, 0.35, [0.6, 0.9, 1], 0.1, 0.9); }
      else if (e.e === 'launch') { this.emit(e.pos, [0, 0, 0], 20, { v0: 4, v1: 18, l0: 0.3, l1: 0.8, s0: 1.2, s1: 0.1, col: [1, 0.3, 0.5] }); }
      else if (me && e.p === me.idx) {
        if (e.e === 'phit') { this.shake = Math.min(1.6, this.shake + (e.shield ? 0.7 : 1.3)); this.ckFlash.intensity = 6; this.ckFlash.color.setRGB(e.shield ? 0.4 : 1, e.shield ? 0.8 : 0.3, 1);
          if (e.shield) { this.ovlU.uShield.value = 1; const lp = this.cam.worldToLocal(new THREE.Vector3(e.pos[0] - me.pos[0], e.pos[1] - me.pos[1], e.pos[2] - me.pos[2])); this.ovlU.uHitPt.value.set(clamp(lp.x / Math.max(0.1, -lp.z), -1.5, 1.5), clamp(lp.y / Math.max(0.1, -lp.z), -1, 1)); }
          else { this.ovlU.uHit.value = 1; this.flash = 0.35; this.flashCol.setRGB(1, 0.3, 0.1); } }
        else if (e.e === 'torp') { this.ckFlash.intensity = Math.max(this.ckFlash.intensity, 2.5); this.ckFlash.color.setRGB(0.4, 0.8, 1); }
        else if (e.e === 'pdead') { this.explode(V3add(me.pos, S.V.mul(S.fwdOf(me.q), 6)), 3, [0, 0, 0], [1, 0.5, 0.2]); this.flash = 0.9; this.flashCol.setRGB(1, 0.7, 0.4); this.shake = 2; }
        else if (e.e === 'arrive' || e.e === 'respawn') { this.flash = 0.75; this.flashCol.setRGB(0.8, 0.9, 1); }
        else if (e.e === 'docked') { this.flash = 0.25; this.flashCol.setRGB(0.5, 1, 0.85); }
      }
    }
  }
  /** world -> screen (CSS px). returns {x, y, on (in front & in view), z} */
  project(p, me) {
    const v = new THREE.Vector3(p[0] - me.pos[0], p[1] - me.pos[1], p[2] - me.pos[2]); const vc = v.clone().applyMatrix4(this.cam.matrixWorldInverse); v.project(this.cam);
    const behind = vc.z > 0; return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H, on: !behind && Math.abs(v.x) < 1 && Math.abs(v.y) < 1, behind, vx: vc.x, vy: vc.y, vz: vc.z };
  }
  selfCheck() {
    this.selfChecks++;
    const gl = this.r.getContext(), pr = this.pr, Hh = Math.round(this.H * pr), px = new Uint8Array(4); let black = 0, n = 0;
    for (let i = 0; i < 40 && n < 24; i++) { const x = rnd(0.04, 0.96) * this.W, y = rnd(0.05, 0.6) * this.H; if (this.opts.covered && this.opts.covered(x, y)) continue;
      gl.readPixels(Math.round(x * pr), Math.round(Hh - y * pr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 6) black++; }
    this.lastSelf = { n, black, tier: this.tier };
    if (n >= 6 && black / n >= 0.25) {
      if (this.hdr) { console.warn('[star-raider] black regions with the HDR chain; falling back to 8-bit'); this.hdr = false; this.post = new Post(this.r, false); this._sized = false; this.resize(); this.selfChecks = 0; }
      else if (this.tier > 0) { console.warn(`[star-raider] black regions (${black}/${n}) at quality ${this.tier}; stepping effects down`); this.maxTier = this.tier - 1; this.setTier(this.maxTier); this.selfChecks = 0; }
      else if (!this.reportedBlack && this.selfChecks > 2) { this.reportedBlack = true; this.opts.onBlack && this.opts.onBlack(); }
    }
  }
  stats() { return { hdr: this.hdr, tier: this.tier, maxTier: this.maxTier, lastSelf: this.lastSelf, pr: this.pr, parts: this.parts.length, cube: this.cubeSize }; }
}
const V3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
