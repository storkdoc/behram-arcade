/* ==========================================================================
   MUSHROOM CLOUD — render.js  (three.js r169, vendored)
   Photoreal Earth (NASA Blue/Black Marble, clouds, ocean glint, atmosphere),
   tactical overlays, missile ribbons, detonations with flash, shockwave and a
   billowing particle mushroom cloud. Postprocess: HDR bloom (no MSAA on any
   offscreen target) + FXAA, or direct MSAA canvas rendering on lower tiers.
   Adaptive quality never drops below native devicePixelRatio, and a pixel
   read-back self-check steps effects down if black holes ever appear.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/three/postprocessing/ShaderPass.js';

const D2R = Math.PI / 180;
export function llv(lat, lon, r = 1, out = new THREE.Vector3()) { const la = lat * D2R, lo = lon * D2R, c = Math.cos(la); return out.set(c * Math.cos(lo) * r, Math.sin(la) * r, -c * Math.sin(lo) * r); }
export function vll(v) { const n = v.clone().normalize(); return [Math.asin(Math.max(-1, Math.min(1, n.y))) / D2R, Math.atan2(-n.z, n.x) / D2R]; }
function slerpV(a, b, u, out) { const d = Math.acos(Math.max(-1, Math.min(1, a.dot(b)))); if (d < 1e-6) return out.copy(a); const s = Math.sin(d); return out.copy(a).multiplyScalar(Math.sin((1 - u) * d) / s).addScaledVector(b, Math.sin(u * d) / s); }
const hex = h => new THREE.Color(h);
const TAIL = `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

/* ---------- shaders ---------- */
const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FS = `
uniform sampler2D dayMap, nightMap, cloudMap, terrMap, dmgMap;
uniform vec3 sunDir, camPos; uniform float cloudOff, warRoom, showTerr, time, cloudsOn;
uniform vec3 blocCol[7]; uniform float blocOn[7]; uniform float meBloc;
uniform vec4 rings[24]; uniform vec4 ringCol[24]; uniform int nRings;
uniform vec4 flashes[8]; uniform vec3 flashCol[8];
uniform vec4 cursor; uniform vec3 cursorCol;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
float idAt(vec2 uv){ return floor(texture2D(terrMap, uv).r * 255.0 / 30.0 + 0.5) - 1.0; }
void main(){
  vec3 n = normalize(vN), L = normalize(sunDir), V = normalize(camPos - vW);
  float NdL = dot(n, L);
  vec4 terr = texture2D(terrMap, vUv);
  float water = smoothstep(0.35, 0.75, terr.g), border = terr.b;
  vec4 dmg = texture2D(dmgMap, vUv);
  vec3 day = texture2D(dayMap, vUv).rgb;
  day = mix(day, vec3(0.045, 0.035, 0.03), dmg.g * 0.85);
  float cl = cloudsOn * texture2D(cloudMap, vUv + vec2(cloudOff, 0.0)).r;
  vec2 sh = vec2(dot(L, vec3(0.0,0.0,-1.0)), dot(L, vec3(0.0,1.0,0.0))) * 0.0025;
  float clSh = cloudsOn * texture2D(cloudMap, vUv + vec2(cloudOff, 0.0) - sh).r;
  float lit = max(NdL, 0.0);
  float dayAmt = smoothstep(-0.12, 0.22, NdL);
  vec3 sun = vec3(1.0, 0.96, 0.9) * 2.6;
  // warm the light near the terminator
  sun *= mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.35, NdL));
  vec3 col = day * (lit * sun * (1.0 - 0.55 * clSh) + vec3(0.012, 0.016, 0.03));
  // ocean: deep tint + glint
  vec3 H = normalize(L + V); float nh = max(dot(n, H), 0.0);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
  col = mix(col, col * vec3(0.55, 0.75, 1.0), water * 0.35);
  col += water * (1.0 - cl) * (pow(nh, 180.0) * 5.0 + pow(nh, 22.0) * 0.18) * sun * dayAmt;
  col += water * fres * vec3(0.25, 0.4, 0.7) * 0.25 * dayAmt;
  // night lights (cities go dark where the damage mask says so)
  float lights = pow(texture2D(nightMap, vUv).r, 1.7) * dmg.r * (1.0 - 0.6 * cl);
  col += lights * vec3(1.0, 0.68, 0.36) * 2.4 * (1.0 - dayAmt);
  // nuclear flashes light the ground around them
  for (int i = 0; i < 8; i++) { float k = flashes[i].w; if (k <= 0.0) continue; float d = 1.0 - dot(n, flashes[i].xyz); col += flashCol[i] * k * exp(-d * 9000.0) * 6.0 + flashCol[i] * k * exp(-d * 600.0) * 0.6; }
  // atmosphere in-scatter on the disc
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  vec3 atm = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.55, 1.0), smoothstep(-0.05, 0.35, NdL));
  col = mix(col, atm * 1.6 * smoothstep(-0.25, 0.4, NdL), rim * 0.55);
  col += vec3(0.0035, 0.0045, 0.009);
  // tactical overlay: territories, edges, borders
  float id = idAt(vUv);
  vec2 px = vec2(1.0/4096.0, 1.0/2048.0) * 2.5;
  float e = 0.0; e += step(0.5, abs(idAt(vUv + vec2(px.x,0.0)) - id)); e += step(0.5, abs(idAt(vUv - vec2(px.x,0.0)) - id)); e += step(0.5, abs(idAt(vUv + vec2(0.0,px.y)) - id)); e += step(0.5, abs(idAt(vUv - vec2(0.0,px.y)) - id));
  e = min(e, 1.0);
  vec3 tint = vec3(0.0); float on = 0.0;
  for (int i = 0; i < 7; i++) { if (abs(id - float(i)) < 0.5) { tint = blocCol[i]; on = blocOn[i]; } }
  float wr = warRoom;
  vec3 vec = vec3(0.004, 0.012, 0.02) + water * vec3(0.0, 0.006, 0.014);
  float coast = clamp(1.0 - abs(terr.g - 0.5) * 3.0, 0.0, 1.0);
  vec += coast * vec3(0.05, 0.4, 0.5) * 0.6 + border * vec3(0.1, 0.3, 0.35) * 0.5;
  vec += tint * on * (0.06 + e * 1.4);
  col = mix(col, vec, wr);
  col += showTerr * (1.0 - wr) * (tint * on * (0.022 * (1.0 - water) + e * (0.5 + 0.25 * sin(time * 1.5))) + border * vec3(0.5, 0.65, 0.8) * 0.05 * (1.0 - water));
  // sensor coverage rings (radar / satellite)
  for (int i = 0; i < 24; i++) { if (i >= nRings) break; float c = dot(n, rings[i].xyz); float edge = rings[i].w; float w = 0.0012;
    float ring = smoothstep(w, 0.0, abs(c - edge)); float inside = step(edge, c);
    col += ringCol[i].rgb * (ring * 0.9 + inside * ringCol[i].a); }
  // placement / targeting cursor
  if (cursor.w > 0.0) { float c = dot(n, cursor.xyz); float r = cursor.w; float ring = smoothstep(0.0009, 0.0, abs(c - r)); float inside = step(r, c) * 0.15; float dot2 = smoothstep(0.99999, 1.0, c);
    col += cursorCol * (ring * 1.5 + inside + dot2 * 2.0); }
  gl_FragColor = vec4(col, 1.0);
  ${TAIL}
}`;
const CLOUD_FS = `
uniform sampler2D cloudMap; uniform vec3 sunDir, camPos; uniform float cloudOff; uniform vec4 flashes[8]; uniform vec3 flashCol[8]; uniform float warRoom;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vec3 n = normalize(vN), L = normalize(sunDir), V = normalize(camPos - vW);
  float a = texture2D(cloudMap, vUv + vec2(cloudOff, 0.0)).r; a = smoothstep(0.08, 0.9, a);
  float NdL = dot(n, L); float lit = smoothstep(-0.15, 0.35, NdL);
  vec3 c = mix(vec3(1.0, 0.55, 0.35), vec3(1.0), smoothstep(0.0, 0.3, NdL)) * 2.2 * lit + vec3(0.006, 0.008, 0.015);
  for (int i = 0; i < 8; i++) { float k = flashes[i].w; if (k <= 0.0) continue; float d = 1.0 - dot(n, flashes[i].xyz); c += flashCol[i] * k * exp(-d * 2500.0) * 4.0; }
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  gl_FragColor = vec4(c, a * (0.92 - rim * 0.4) * (1.0 - warRoom)); ${TAIL} }`;
const ATMO_VS = `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FS = `
uniform vec3 sunDir, camPos; uniform float warRoom; varying vec3 vN; varying vec3 vW;
void main(){ vec3 n = normalize(vN), V = normalize(camPos - vW), L = normalize(sunDir);
  float vd = dot(-V, n);                       // back-face shell: brightest just outside the limb
  float glow = pow(clamp(vd, 0.0, 1.0), 5.0) * 1.1 + pow(clamp(vd, 0.0, 1.0), 1.5) * 0.08;
  float day = smoothstep(-0.35, 0.45, dot(n, L));
  vec3 c = mix(vec3(1.0, 0.4, 0.15), vec3(0.32, 0.6, 1.0), smoothstep(0.0, 0.5, dot(n, L)));
  vec3 col = c * glow * (0.04 + day * 2.2);
  col = mix(col, vec3(0.1, 0.6, 0.7) * glow * 0.6, warRoom);
  gl_FragColor = vec4(col, 1.0); ${TAIL} }`;
const PTS_VS = `
attribute vec3 color; attribute float size; attribute float icon; attribute float rot; attribute float alpha;
varying vec3 vC; varying float vI; varying float vR; varying float vA; uniform float dpr;
void main(){ vC = color; vI = icon; vR = rot; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * dpr; }`;
const ICON_FS = `
uniform sampler2D atlas; varying vec3 vC; varying float vI; varying float vR; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) discard;
  vec4 t = texture2D(atlas, vec2((vI + p.x) / 12.0, 1.0 - p.y));
  vec3 col = mix(vC * 0.25, vC, t.g) + t.r * vC * 0.6 + vec3(t.b);   // atlas: g = body, r = glow, b = white detail
  float a = max(t.a, 0.0) * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(col, a); ${TAIL} }`;
const GLOW_FS = `
varying vec3 vC; varying float vI; varying float vR; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard;
  float core = exp(-d * d * 18.0), halo = exp(-d * d * 3.5) * 0.35; float a = (core + halo) * vA;
  gl_FragColor = vec4(vC * a, a); ${TAIL} }`;
const SMOKE_FS = `
uniform sampler2D smoke; varying vec3 vC; varying float vI; varying float vR; varying float vA;
void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
  vec4 t = texture2D(smoke, p); float a = t.a * vA; if (a < 0.004) discard;
  // vI carries heat: emissive fire inside young clouds
  vec3 col = vC * (0.55 + 0.45 * t.r) + vec3(2.6, 1.0, 0.3) * vI * t.r * t.r;
  gl_FragColor = vec4(col * a, a); ${TAIL} }`;
const RIB_VS = `attribute vec4 col; attribute float side; varying vec4 vC; varying float vS; void main(){ vC = col; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FS = `varying vec4 vC; varying float vS; void main(){ float k = 1.0 - vS * vS; k = k * k; gl_FragColor = vec4(vC.rgb * vC.a * k, vC.a * k); ${TAIL} }`;
const RING_FS = `uniform float r, w, a; uniform vec3 c; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float k = exp(-pow((d - r) / w, 2.0)) * a + exp(-d * d * 8.0) * a * 0.15 * (1.0 - r); gl_FragColor = vec4(c * k, k); ${TAIL} }`;
const RING_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
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

/* ---------- procedural textures ---------- */
function iconAtlas() {
  // 12 icons x 128px. channels: a = coverage, g = body, r = outer glow, b = white detail
  const S = 128, cv = document.createElement('canvas'); cv.width = S * 12; cv.height = S; const x = cv.getContext('2d');
  const names = ['silo', 'radar', 'sam', 'airbase', 'sub', 'carrier', 'fighter', 'bomber', 'silo-launch', 'target', 'ghost', 'city'];
  names.forEach((n, i) => {
    x.save(); x.translate(i * S + S / 2, S / 2);
    const body = (draw, lw = 9) => { // glow (red), body (green), detail(blue) via separate strokes
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.globalCompositeOperation = 'lighter';
      x.shadowColor = 'rgba(255,0,0,1)'; x.shadowBlur = 18; x.strokeStyle = 'rgba(255,0,0,0.9)'; x.lineWidth = lw + 6; draw(); x.stroke();
      x.shadowBlur = 0; x.strokeStyle = 'rgb(0,255,0)'; x.lineWidth = lw; draw(); x.stroke();
      x.fillStyle = 'rgba(0,140,0,0.55)'; draw(); x.fill();
    };
    const P = (pts) => () => { x.beginPath(); pts.forEach((p, k) => k ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); };
    if (n === 'silo' || n === 'silo-launch') { body(P([[0, -40], [36, 30], [-36, 30]])); x.fillStyle = n === 'silo' ? 'rgb(0,0,255)' : 'rgb(255,0,255)'; x.beginPath(); x.arc(0, 8, n === 'silo' ? 9 : 13, 0, 7); x.fill(); }
    if (n === 'radar') { body(() => { x.beginPath(); x.arc(0, 0, 34, 0, 7); }); x.strokeStyle = 'rgb(0,0,255)'; x.lineWidth = 5; for (const r of [12, 22]) { x.beginPath(); x.arc(0, 0, r, -2.3, -0.8); x.stroke(); } x.beginPath(); x.moveTo(0, 0); x.lineTo(22, -24); x.stroke(); }
    if (n === 'sam') { body(() => { x.beginPath(); x.moveTo(0, -40); x.lineTo(34, -18); x.lineTo(28, 22); x.lineTo(0, 40); x.lineTo(-28, 22); x.lineTo(-34, -18); x.closePath(); }); x.strokeStyle = 'rgb(0,0,255)'; x.lineWidth = 6; x.beginPath(); x.moveTo(-14, 8); x.lineTo(0, -10); x.lineTo(14, 8); x.stroke(); }
    if (n === 'airbase') { body(() => { x.beginPath(); x.rect(-36, -36, 72, 72); }); x.strokeStyle = 'rgb(0,0,255)'; x.lineWidth = 7; x.beginPath(); x.moveTo(-22, 22); x.lineTo(22, -22); x.stroke(); x.beginPath(); x.moveTo(-10, -18); x.lineTo(18, 10); x.stroke(); }
    if (n === 'sub') { body(() => { x.beginPath(); x.ellipse(0, 6, 46, 15, 0, 0, 7); }); x.fillStyle = 'rgb(0,0,255)'; x.fillRect(-8, -20, 16, 18); }
    if (n === 'carrier') { body(P([[-48, -10], [40, -10], [50, 0], [40, 14], [-48, 14]])); x.fillStyle = 'rgb(0,0,255)'; x.fillRect(16, -26, 10, 16); }
    if (n === 'fighter') { body(P([[0, -46], [10, -8], [40, 18], [10, 16], [6, 38], [-6, 38], [-10, 16], [-40, 18], [-10, -8]]), 6); }
    if (n === 'bomber') { body(P([[0, -40], [8, -10], [58, 12], [56, 22], [8, 12], [6, 36], [-6, 36], [-8, 12], [-56, 22], [-58, 12], [-8, -10]]), 6); }
    if (n === 'target') { x.strokeStyle = 'rgb(0,255,0)'; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 38, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 18, 0, 7); x.stroke(); for (let k = 0; k < 4; k++) { x.rotate(Math.PI / 2); x.beginPath(); x.moveTo(0, 26); x.lineTo(0, 52); x.stroke(); } }
    if (n === 'ghost') { x.setLineDash([10, 8]); x.strokeStyle = 'rgb(0,255,0)'; x.lineWidth = 6; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.stroke(); x.fillStyle = 'rgb(0,0,255)'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 0, 2); }
    if (n === 'city') { x.fillStyle = 'rgb(0,255,0)'; x.beginPath(); x.arc(0, 0, 18, 0, 7); x.fill(); }
    x.restore();
  });
  // compose alpha = max channel
  const d = x.getImageData(0, 0, cv.width, cv.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) { const m = Math.max(a[i], a[i + 1], a[i + 2]); a[i + 3] = Math.min(255, m * 1.2); }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; t.premultiplyAlpha = false; t.needsUpdate = true;
  return { tex: t, names };
}
function smokeTex() {
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
  // soft billow: many overlapping soft puffs, brighter on top (r = density highlight)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 46; i++) { const r = 10 + rnd() * 24, a = rnd() * 6.283, d = rnd() * (S * 0.3 - r * 0.4); const cx = S / 2 + Math.cos(a) * d, cy = S / 2 + Math.sin(a) * d;
    const g = x.createRadialGradient(cx, cy - r * 0.2, 0, cx, cy, r); const v = 150 + rnd() * 105; g.addColorStop(0, `rgba(${v},${v},${v},0.32)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); }
  const d = x.getImageData(0, 0, S, S), a = d.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const k = (j * S + i) * 4, dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2), fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)); const v = a[k] / 255;
    a[k + 3] = Math.min(255, 255 * Math.min(1, v * 2.2) * Math.pow(fall, 0.6)); a[k] = Math.min(255, 80 + v * 200 * (1 - dy * 0.3)); a[k + 1] = a[k + 2] = a[k]; }
  x.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
}

/* ---------- a dynamic Points cloud ---------- */
class PointBuf {
  constructor(n, mat) {
    this.n = n; const g = this.g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.icon = new Float32Array(n); this.rot = new Float32Array(n); this.alpha = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('icon', new THREE.BufferAttribute(this.icon, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('rot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.obj = new THREE.Points(g, mat); this.obj.frustumCulled = false; this.k = 0;
  }
  begin() { this.k = 0; }
  add(p, c, size, icon = 0, rot = 0, alpha = 1) { if (this.k >= this.n) return; const k = this.k++; this.pos[k * 3] = p.x; this.pos[k * 3 + 1] = p.y; this.pos[k * 3 + 2] = p.z; this.col[k * 3] = c.r; this.col[k * 3 + 1] = c.g; this.col[k * 3 + 2] = c.b; this.size[k] = size; this.icon[k] = icon; this.rot[k] = rot; this.alpha[k] = alpha; }
  end() { const g = this.g; for (const a of ['position', 'color', 'size', 'icon', 'rot', 'alpha']) g.attributes[a].needsUpdate = true; g.setDrawRange(0, this.k); }
}
/* ---------- camera-facing ribbons (missile / interceptor trails, arcs) ---------- */
class Ribbons {
  constructor(maxV) {
    this.max = maxV; const g = this.g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxV * 3); this.col = new Float32Array(maxV * 4); this.side = new Float32Array(maxV); this.idx = new Uint32Array(maxV * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('side', new THREE.BufferAttribute(this.side, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(this.idx, 1).setUsage(THREE.DynamicDrawUsage));
    this.obj = new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.obj.frustumCulled = false; this.v = 0; this.i = 0; this._t = new THREE.Vector3(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3();
  }
  begin(cam, pxScale) { this.v = 0; this.i = 0; this.cam = cam.position; this.px = pxScale; }
  /** pts: Vector3[]; colAt(k) -> [r,g,b,a]; widthPx */
  strip(pts, colAt, wpx) {
    const n = pts.length; if (n < 2 || this.v + n * 2 >= this.max) return;
    const v0 = this.v;
    for (let k = 0; k < n; k++) {
      const p = pts[k], t = this._t.copy(pts[Math.min(n - 1, k + 1)]).sub(pts[Math.max(0, k - 1)]).normalize();
      const d = this._d.copy(p).sub(this.cam); const dist = d.length(); const s = this._s.copy(t).cross(d).normalize().multiplyScalar(wpx * this.px * dist * 0.5);
      const c = colAt(k / (n - 1));
      for (let sd = -1; sd <= 1; sd += 2) { const v = this.v++; this.pos[v * 3] = p.x + s.x * sd; this.pos[v * 3 + 1] = p.y + s.y * sd; this.pos[v * 3 + 2] = p.z + s.z * sd; this.col.set(c, v * 4); this.side[v] = sd; }
      if (k < n - 1) { const a = v0 + k * 2; this.idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], this.i); this.i += 6; }
    }
  }
  end() { const g = this.g; g.attributes.position.needsUpdate = g.attributes.col.needsUpdate = g.attributes.side.needsUpdate = true; g.index.needsUpdate = true; g.setDrawRange(0, this.i); }
}

/* ======================================================================== */
export class Globe {
  constructor(canvas, labels, opts = {}) {
    this.canvas = canvas; this.lab = labels; this.lx = labels.getContext('2d'); this.opts = opts;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0; this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.setClearColor(0x000000, 1);
    this.isGL2 = this.r.capabilities.isWebGL2;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(36, 1, 0.01, 200);
    this.camState = { lat: 30, lon: -40, dist: 3.6, tlat: 30, tlon: -40, tdist: 3.6, vlat: 0, vlon: 0 };
    this.shake = 0; this.time = 0; this.sunLon = -30; this.warRoom = 0; this.warRoomT = 0; this.view = null; this.sel = null; this.hover = null; this.blocCols = [];
    this.tier = 3; this.maxTier = 3; this.fx = { dets: [], flashes: [], rings: [], embers: [], sparks: [] }; this.ft = []; this.lastCheck = 0; this.blackHoles = 0; this.selfChecks = 0;
    this.cursor = null; this.arcs = []; this.cityLabels = true; this.ready = false;
  }
  async load(onProgress) {
    const L = new THREE.TextureLoader(); let done = 0; const tot = 4;
    const get = (url, srgb) => new Promise((res, rej) => L.load(url, t => { done++; onProgress && onProgress(done / tot); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Math.min(8, this.r.capabilities.getMaxAnisotropy()); res(t); }, undefined, e => rej(new Error('texture ' + url))));
    const [day, night, clouds, terr] = await Promise.all([get('tex/day.jpg', true), get('tex/night.jpg', false), get('tex/clouds.jpg', false), get('tex/terr.png', false)]);
    clouds.wrapS = THREE.RepeatWrapping;
    this.dmgCanvas = document.createElement('canvas'); this.dmgCanvas.width = 2048; this.dmgCanvas.height = 1024;
    const dx = this.dmgX = this.dmgCanvas.getContext('2d'); dx.fillStyle = 'rgb(255,0,0)'; dx.fillRect(0, 0, 2048, 1024);
    this.dmgTex = new THREE.CanvasTexture(this.dmgCanvas); this.dmgTex.colorSpace = THREE.NoColorSpace;
    const U = this.U = {
      dayMap: { value: day }, nightMap: { value: night }, cloudMap: { value: clouds }, terrMap: { value: terr }, dmgMap: { value: this.dmgTex },
      sunDir: { value: new THREE.Vector3(1, 0.2, 0.3).normalize() }, camPos: { value: new THREE.Vector3() }, cloudOff: { value: 0 }, warRoom: { value: 0 }, showTerr: { value: 1 }, time: { value: 0 }, cloudsOn: { value: 1 },
      blocCol: { value: Array.from({ length: 7 }, () => new THREE.Color(0.5, 0.5, 0.5)) }, blocOn: { value: new Array(7).fill(0) }, meBloc: { value: 0 },
      rings: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, ringCol: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, nRings: { value: 0 },
      flashes: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, flashCol: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
      cursor: { value: new THREE.Vector4() }, cursorCol: { value: new THREE.Color(0.3, 1, 0.6) },
    };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), new THREE.ShaderMaterial({ uniforms: U, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }));
    this.scene.add(this.earth);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 160, 80), new THREE.ShaderMaterial({ uniforms: U, vertexShader: EARTH_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
    this.scene.add(this.clouds);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 128, 64), new THREE.ShaderMaterial({ uniforms: U, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.atmo);
    this.makeStars();
    // overlays
    this.atlas = iconAtlas(); this.smoke = smokeTex();
    const dprU = { value: this.dpr };
    this.dprU = dprU;
    const mk = (fs, extra, blend) => new THREE.ShaderMaterial({ uniforms: Object.assign({ dpr: dprU }, extra), vertexShader: PTS_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend || THREE.NormalBlending });
    this.icons = new PointBuf(1500, mk(ICON_FS, { atlas: { value: this.atlas.tex } })); this.icons.obj.renderOrder = 5;
    this.glows = new PointBuf(4000, mk(GLOW_FS, {}, THREE.AdditiveBlending)); this.glows.obj.renderOrder = 6;
    const smokeMat = mk(SMOKE_FS, { smoke: { value: this.smoke } }); smokeMat.blending = THREE.CustomBlending; smokeMat.blendSrc = THREE.OneFactor; smokeMat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.smokeP = new PointBuf(9000, smokeMat); this.smokeP.obj.renderOrder = 4;
    this.ribs = new Ribbons(60000); this.ribs.obj.renderOrder = 3;
    this.scene.add(this.ribs.obj, this.smokeP.obj, this.glows.obj, this.icons.obj);
    this.ringGeo = new THREE.PlaneGeometry(1, 1); this.ringPool = [];
    this.setupPost();
    this.ready = true;
  }
  makeStars() {
    const n = 9000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), al = new Float32Array(n), ic = new Float32Array(n), rot = new Float32Array(n);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const gal = new THREE.Vector3(0.3, 0.85, 0.4).normalize();
    for (let i = 0; i < n; i++) {
      let v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      if (i < n * 0.45) { // milky way band
        const a = rnd() * 6.283, u = new THREE.Vector3(1, 0, 0).cross(gal).normalize(), w = gal.clone().cross(u); v = u.multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(gal, (rnd() - 0.5) * 0.25 * (rnd() * rnd())).normalize(); }
      v.multiplyScalar(80); pos.set([v.x, v.y, v.z], i * 3);
      const t = rnd(), b = Math.pow(rnd(), 6) * 2.2 + 0.05 + (i < n * 0.45 ? 0 : 0.05);
      col.set(t < 0.15 ? [b * 0.8, b * 0.85, b * 1.25] : t < 0.3 ? [b * 1.2, b, b * 0.75] : [b, b, b], i * 3);
      size[i] = 1.2 + Math.pow(rnd(), 8) * 3.5; al[i] = 1;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('icon', new THREE.BufferAttribute(ic, 1)); g.setAttribute('rot', new THREE.BufferAttribute(rot, 1));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { dpr: { value: this.dpr } }, vertexShader: PTS_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.stars.renderOrder = -1; this.scene.add(this.stars);
    // the sun: a hot glow plus soft halo, far away along the sun direction
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([6, 5.4, 4.6, 0.9, 0.7, 0.5]), 3)); sg.setAttribute('size', new THREE.BufferAttribute(new Float32Array([60, 420]), 1)); sg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array([1, 0.5]), 1)); sg.setAttribute('icon', new THREE.BufferAttribute(new Float32Array(2), 1)); sg.setAttribute('rot', new THREE.BufferAttribute(new Float32Array(2), 1));
    this.sun = new THREE.Points(sg, this.stars.material); this.sun.frustumCulled = false; this.scene.add(this.sun);
  }
  setupPost() {
    const r = this.r;
    this.composer = new EffectComposer(r); // default target: HalfFloat, samples 0 (no MSAA offscreen on purpose)
    this.composer.addPass(new RenderPass(this.scene, this.cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.82); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAA); this.composer.addPass(this.fxaa);
  }
  /** quality tiers: 3 = supersampled + bloom, 2 = native + bloom + FXAA, 1 = native MSAA canvas (no post), 0 = also no clouds/fewer particles */
  setTier(t) { t = Math.max(0, Math.min(this.maxTier, t)); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.resize(); this.lastCheck = this.time - 999; }
  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    let pr = this.dpr;
    if (this.tier >= 3) { const ss = Math.sqrt(Math.min(2.25, 9.5e6 / (w * h * this.dpr * this.dpr))); if (ss > 1.12) pr = this.dpr * ss; else if (this.maxTier === 3 && !this._noSS) { this._noSS = true; } }
    this.pr = pr;
    this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.lab.width = Math.round(w * this.dpr); this.lab.height = Math.round(h * this.dpr); this.lab.style.width = w + 'px'; this.lab.style.height = h + 'px';
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.W = w; this.H = h;
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.bloom.resolution.set(w * pr, h * pr); this.fxaa.uniforms.res.value.set(w * pr, h * pr); this.fxaa.enabled = this.tier < 3; }
    this.dprU && (this.dprU.value = pr); if (this.stars) this.stars.material.uniforms.dpr.value = pr;
    this._sized = true;
  }

  /* ---------- camera ---------- */
  rotate(dx, dy) { const c = this.camState, k = c.dist * 0.12; c.tlon -= dx * k; c.tlat = Math.max(-80, Math.min(80, c.tlat + dy * k)); this.userCam = this.time; }
  zoom(f) { const c = this.camState; c.tdist = Math.max(1.12, Math.min(6, c.tdist * f)); this.userCam = this.time; }
  focus(lat, lon, dist) { const c = this.camState; c.tlat = lat; let d = lon - c.tlon; d -= 360 * Math.round(d / 360); c.tlon += d; if (dist) c.tdist = dist; }
  updateCam(dt) {
    const c = this.camState, k = 1 - Math.exp(-dt * 5);
    c.lat += (c.tlat - c.lat) * k; c.lon += (c.tlon - c.lon) * k; c.dist += (c.tdist - c.dist) * (1 - Math.exp(-dt * 4));
    const p = llv(c.lat, c.lon, c.dist, this.cam.position);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0) { const s = this.shake * this.shake * 0.025 * Math.min(1, c.dist - 1); p.x += (Math.random() - 0.5) * s; p.y += (Math.random() - 0.5) * s; p.z += (Math.random() - 0.5) * s; }
    // look slightly above the centre when close, so the horizon and rising clouds frame nicely
    const look = llv(c.lat, c.lon, Math.max(0, 1 - (c.dist - 1) * 1.2) * 0.85);
    this.cam.up.set(0, 1, 0); this.cam.lookAt(look);
    this.cam.near = Math.max(0.002, (c.dist - 1.06) * 0.5); this.cam.far = 200; this.cam.updateProjectionMatrix();
  }

  /* ---------- picking / projection ---------- */
  pick(x, y) {
    const ndc = new THREE.Vector2(x / this.W * 2 - 1, -(y / this.H) * 2 + 1); const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.cam);
    const o = rc.ray.origin, d = rc.ray.direction, b = o.dot(d), c = o.dot(o) - 1, disc = b * b - c; if (disc < 0) return null;
    const t = -b - Math.sqrt(disc); if (t < 0) return null; return vll(o.clone().addScaledVector(d, t));
  }
  project(lat, lon, alt = 0) {
    const p = llv(lat, lon, 1 + alt); const front = p.clone().normalize().dot(this.cam.position.clone().sub(p).normalize()) > 0.02 || alt > 0.02 && p.clone().sub(this.cam.position).length() < this.cam.position.length();
    const v = p.project(this.cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, front, z: v.z };
  }
  visibleFrom(p3) { const n = p3.clone().normalize(); const toCam = this.cam.position.clone().sub(p3); if (n.dot(toCam) > 0) return true; const r = p3.length(); const cl = this.cam.position.length(); return r > 1.0 && Math.sqrt(cl * cl - 1) > toCam.length(); }

  /* ---------- per-frame inputs ---------- */
  setBlocs(blocs, BL) { this.BL = BL; this.blocCols = BL.map(b => hex(b.color)); for (let i = 0; i < 6; i++) { this.U.blocCol.value[i].copy(this.blocCols[i]); this.U.blocOn.value[i] = blocs[i] && blocs[i].active ? 1 : 0.25; } this.U.blocCol.value[6].setRGB(0.4, 0.4, 0.4); this.U.blocOn.value[6] = 0.2; }
  setCursor(c) { this.cursor = c; }
  /** big one-off effects, driven by sim events (with real-time animation) */
  event(e) {
    if (!this.ready) return;
    if (e.type === 'det') this.detonation(e.lat, e.lon);
    if (e.type === 'intercept') { this.fx.sparks.push({ p: null, lat: e.lat, lon: e.lon, alt: e.alt || 0.03, t: 0, life: 1.1, big: 1 }); }
    if (e.type === 'downed') this.fx.sparks.push({ lat: e.lat, lon: e.lon, alt: 0.006, t: 0, life: 0.9, big: 0.6 });
    if (e.type === 'destroyed' && e.why !== 'nuclear strike') this.fx.sparks.push({ lat: e.lat, lon: e.lon, alt: 0.002, t: 0, life: 1.4, big: 0.8 });
    if (e.type === 'skirmish') this.fx.sparks.push({ lat: e.lat, lon: e.lon, alt: 0.002, t: 0, life: 0.7, big: 0.5 });
  }
  detonation(lat, lon) {
    const n = llv(lat, lon, 1).normalize(); const e1 = new THREE.Vector3(0, 1, 0).cross(n); if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0); e1.normalize(); const e2 = n.clone().cross(e1).normalize();
    const parts = []; let s = (Math.abs(lat * 1000 + lon * 7) | 0) + 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const big = this.tier >= 1 ? 1 : 0.5;
    for (let i = 0; i < 70 * big; i++) parts.push({ k: 'stem', h: rnd(), a: rnd() * 6.283, r: rnd(), sz: 0.8 + rnd() * 0.6, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.4 });
    for (let i = 0; i < 150 * big; i++) parts.push({ k: 'cap', a: rnd() * 6.283, b: rnd() * 6.283, r: Math.sqrt(rnd()), sz: 0.9 + rnd() * 0.9, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.6 });
    for (let i = 0; i < 50 * big; i++) parts.push({ k: 'skirt', a: rnd() * 6.283, r: 0.6 + rnd() * 0.5, sz: 0.7 + rnd() * 0.5, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.3 });
    this.fx.dets.push({ lat, lon, n, e1, e2, t: 0, parts, life: 75 });
    if (this.fx.dets.length > 26) this.fx.dets.shift();
    this.fx.flashes.push({ n, t: 0 });
    this.fx.rings.push({ n, e1, e2, t: 0 });
    this.fx.embers.push({ lat, lon, n, t: 0, seed: rnd() });
    if (this.fx.embers.length > 220) this.fx.embers.shift();
    // permanent scars: city lights out + scorched ground
    const x = (lon + 180) / 360 * 2048, y = (90 - lat) / 180 * 1024, dx = this.dmgX;
    for (const ox of [-2048, 0, 2048]) {
      const r = 26 / Math.max(0.3, Math.cos(lat * D2R));
      dx.save(); dx.translate(x + ox, y); dx.scale(1 / Math.max(0.3, Math.cos(lat * D2R)), 1);
      let g = dx.createRadialGradient(0, 0, 0, 0, 0, 26); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dx.globalCompositeOperation = 'source-over'; dx.fillStyle = g; // kill lights: write red=0 via multiply
      dx.globalCompositeOperation = 'multiply'; const g2 = dx.createRadialGradient(0, 0, 0, 0, 0, 26); g2.addColorStop(0, 'rgb(0,255,255)'); g2.addColorStop(0.6, 'rgb(40,255,255)'); g2.addColorStop(1, 'rgb(255,255,255)'); dx.fillStyle = g2; dx.beginPath(); dx.arc(0, 0, 26, 0, 7); dx.fill();
      dx.globalCompositeOperation = 'lighter'; const g3 = dx.createRadialGradient(0, 0, 0, 0, 0, 9); g3.addColorStop(0, 'rgba(0,200,0,1)'); g3.addColorStop(1, 'rgba(0,0,0,0)'); dx.fillStyle = g3; dx.beginPath(); dx.arc(0, 0, 9, 0, 7); dx.fill();
      dx.restore(); void r;
    }
    this.dmgTex.needsUpdate = true;
    // camera shake if it is on our side of the planet
    const toCam = this.cam.position.clone().normalize(); const facing = n.dot(toCam);
    if (facing > 0.3) this.shake = Math.min(1.6, this.shake + 0.5 + (2.2 - Math.min(2.2, this.camState.dist)) * 0.6);
  }

  /* ---------- frame ---------- */
  frame(dt, view, simT, ui) {
    if (!this.ready) return;
    this.time += dt; this.view = view; const U = this.U;
    if (!this._sized) this.resize();
    this.updateCam(dt);
    // sun sweeps around the planet as game time passes (the terminator crawls over the blocs)
    const sl = (ui && ui.sunLon !== undefined) ? ui.sunLon : (-simT * 0.35 + (this.opts.sunStart || -20));
    this.sunLon = sl; const sd = llv(14, sl, 1).normalize(); U.sunDir.value.copy(sd);
    this.sun.geometry.attributes.position.array.set([sd.x * 90, sd.y * 90, sd.z * 90, sd.x * 90, sd.y * 90, sd.z * 90]); this.sun.geometry.attributes.position.needsUpdate = true;
    U.camPos.value.copy(this.cam.position); U.time.value = this.time; U.cloudOff.value = (this.time * 0.0008 + simT * 0.00005) % 1;
    this.warRoom += ((ui && ui.warRoom ? 1 : 0) - this.warRoom) * (1 - Math.exp(-dt * 4)); U.warRoom.value = this.warRoom;
    U.cloudsOn.value = this.tier >= 1 ? 1 : 0; this.clouds.visible = this.tier >= 1 && this.warRoom < 0.99;
    // flashes
    this.fx.flashes = this.fx.flashes.filter(f => (f.t += dt) < 2.2);
    for (let i = 0; i < 8; i++) { const f = this.fx.flashes[this.fx.flashes.length - 1 - i]; if (f) { const k = f.t < 0.08 ? f.t / 0.08 : Math.exp(-(f.t - 0.08) * 2.4); U.flashes.value[i].set(f.n.x, f.n.y, f.n.z, k * 3); U.flashCol.value[i].setRGB(1, 0.75 + 0.25 * Math.exp(-f.t * 3), 0.5 + 0.5 * Math.exp(-f.t * 4)); } else U.flashes.value[i].w = 0; }
    this.drawOverlays(dt, view, simT, ui || {});
    this.render();
    this.drawLabels(view, simT, ui || {});
    this.adapt(dt);
  }
  render() {
    if (this.tier >= 2) this.composer.render(); else this.r.render(this.scene, this.cam);
    // self-check: read back pixels on the sunlit disc right after rendering, same task (no preserveDrawingBuffer needed)
    if (this.time - this.lastCheck > (this.selfChecks < 3 ? 1.5 : 8) && this.time > 1.2) { this.lastCheck = this.time; this.selfCheck(); }
  }
  selfCheck() {
    const gl = this.r.getContext(); const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; let black = 0, n = 0; const px = new Uint8Array(4);
    const L = this.U.sunDir.value, toCam = this.cam.position.clone().normalize();
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996, rr = Math.sqrt((i + 0.5) / 28) * 0.9; const u = new THREE.Vector3(1, 0, 0).cross(toCam); if (u.lengthSq() < 1e-4) u.set(0, 0, 1); u.normalize(); const v = toCam.clone().cross(u);
      const p = toCam.clone().multiplyScalar(Math.sqrt(1 - rr * rr)).addScaledVector(u, Math.cos(a) * rr).addScaledVector(v, Math.sin(a) * rr);
      if (p.dot(L) < 0.15) continue; // only sunlit ground is guaranteed bright
      const s = p.clone().project(this.cam); if (Math.abs(s.x) > 0.97 || Math.abs(s.y) > 0.97) continue;
      const X = Math.round((s.x + 1) / 2 * W), Y = Math.round((s.y + 1) / 2 * H);
      gl.readPixels(X, Y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 4) black++;
    }
    this.selfChecks++; this.lastSelf = { n, black, tier: this.tier };
    if (n >= 4 && black >= Math.max(2, n * 0.15)) { this.blackHoles++; console.warn('[mushroom-cloud] black regions detected at quality tier ' + this.tier + '; stepping effects down'); this.maxTier = Math.max(1, this.tier - 1); this.setTier(this.maxTier); }
  }
  adapt(dt) {
    this.ft.push(dt); if (this.ft.length < 90) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length; this.ft = [];
    if (document.hidden) return;
    if (avg > 1 / 40 && this.tier > 0) { this.setTier(this.tier - 1); this.goodRuns = 0; }
    else if (avg < 1 / 75 && this.tier < this.maxTier) { this.goodRuns = (this.goodRuns || 0) + 1; if (this.goodRuns > 3) { this.setTier(this.tier + 1); this.goodRuns = 0; } }
  }

  /* ---------- overlays from the bloc view ---------- */
  drawOverlays(dt, V, simT, ui) {
    const I = this.icons, G = this.glows, S = this.smokeP, R = this.ribs; I.begin(); G.begin(); S.begin();
    const pxs = 2 * Math.tan(this.cam.fov * D2R / 2) / this.H; R.begin(this.cam, pxs);
    const BC = this.blocCols, white = new THREE.Color(1, 1, 1), tmp = new THREE.Vector3(), c = new THREE.Color();
    const U = this.U; let nr = 0;
    if (V) {
      const me = V.me;
      // sensor coverage rings (own + allied)
      if (ui.showSensors !== false) for (const s of V.sensors) { if (nr >= 24) break; const p = llv(s[0], s[1], 1).normalize(); U.rings.value[nr].set(p.x, p.y, p.z, Math.cos(s[2] * D2R)); const col = s[3] === 'sat' ? [0.9, 0.9, 1, 0.05] : [0.2, 0.9, 1, 0.012]; U.ringCol.value[nr].set(col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, col[3]); nr++; }
      // cities: warm glows that die when they're hit
      if (V.cities && this.BL) {
        const C = ui.cities || [];
        for (let i = 0; i < C.length; i++) { const ct = C[i], pop = V.cities[i], f = pop / ct.pop0; llv(ct.lat, ct.lon, 1.0015, tmp);
          if (f < 0.35) { c.setRGB(0.5, 0.08, 0.03); G.add(tmp, c, 9, 0, 0, 0.6 + 0.2 * Math.sin(this.time * 3 + i)); }
          else { c.setRGB(1.0, 0.75, 0.45).multiplyScalar(0.6 + f * 0.8); G.add(tmp, c, 5 + Math.sqrt(ct.pop0) * 1.8, 0, 0, 0.55 * f + 0.2); } }
      }
      // units
      const iconIx = { silo: 0, radar: 1, sam: 2, airbase: 3, sub: 4, carrier: 5, fighter: 6, bomber: 7 };
      for (const u of V.units) {
        llv(u.lat, u.lon, 1.0025, tmp);
        const col = BC[u.bloc] || white; const mine = u.bloc === me;
        let a = u.alive ? (u.stale ? 0.45 : 1) : 0.25, ic = iconIx[u.type];
        if (u.type === 'silo' && u.mode === 'launch') ic = 8;
        const sel = this.sel && this.sel.id === u.id, hov = this.hover && this.hover.id === u.id;
        const sz = (mine ? 22 : 20) * (sel ? 1.35 : hov ? 1.15 : 1) * (ui.iconScale || 1);
        c.copy(col); if (mine) c.lerp(white, 0.15); if (!u.alive) c.setRGB(0.4, 0.4, 0.4);
        I.add(tmp, c, sz, u.stale ? 10 : ic, 0, a);
        if (sel) { const k = 0.6 + 0.4 * Math.sin(this.time * 6); I.add(tmp, white, sz * 1.9, 9, this.time * 0.6, k); }
        if (u.path && u.path.length && mine) { const pts = [llv(u.lat, u.lon, 1.002)]; for (const p of u.path) { const a0 = pts[pts.length - 1].clone().normalize(), b0 = llv(p[0], p[1], 1).normalize(); const d = Math.acos(Math.max(-1, Math.min(1, a0.dot(b0)))); const steps = Math.max(2, Math.ceil(d / 0.02)); for (let k = 1; k <= steps; k++) pts.push(slerpV(a0, b0, k / steps, new THREE.Vector3()).multiplyScalar(1.002)); }
          R.strip(pts, f => [col.r * 0.8, col.g * 0.8, col.b * 0.8, 0.35 + 0.3 * Math.sin(f * 40 - this.time * 4) * 0.5], 1.6); }
      }
      // aircraft
      for (const a of V.air) { llv(a.lat, a.lon, 1.006, tmp); const col = BC[a.bloc] || white; const p2 = this.project(a.lat, a.lon, 0.006); const ah = this.project(a.lat + Math.cos(a.hdg || 0) * 0.3, a.lon + Math.sin(a.hdg || 0) * 0.3, 0.006); const rot = Math.atan2(ah.x - p2.x, -(ah.y - p2.y));
        I.add(tmp, col, a.kind === 'bomber' ? 22 : 17, iconIx[a.kind], -rot, 1); }
      // missiles: ballistic ribbons with a white-hot head
      const A = new THREE.Vector3(), B = new THREE.Vector3();
      for (const m of V.missiles) {
        const u = Math.max(0, Math.min(1, (simT - m.t0) / m.dur)); llv(m.from[0], m.from[1], 1, A).normalize(); llv(m.to[0], m.to[1], 1, B).normalize();
        const col = BC[m.bloc] || white, n = 44, pts = [];
        for (let k = 0; k <= n; k++) { const f = u * k / n; pts.push(slerpV(A, B, f, new THREE.Vector3()).multiplyScalar(1.001 + m.alt * Math.sin(Math.PI * f))); }
        R.strip(pts, f => { const h = Math.pow(f, 3); return [col.r * 0.9 + h * 2.5, col.g * 0.9 + h * 2.0, col.b * 0.9 + h * 1.4, 0.12 + 0.75 * Math.pow(f, 1.4)]; }, m.kind === 'cruise' ? 1.6 : 2.4);
        const head = pts[pts.length - 1]; c.setRGB(3.5, 2.6, 1.8); G.add(head, c, 13 + 3 * Math.sin(this.time * 30 + m.id), 0, 0, 1); c.copy(col).multiplyScalar(2); G.add(head, c, 30, 0, 0, 0.45);
        // projected impact point for warheads aimed at us (or ours)
        if (m.tb === me || m.bloc === me) { llv(m.to[0], m.to[1], 1.002, tmp); const k = 0.5 + 0.5 * Math.sin(this.time * 8); c.set(m.bloc === me ? col : new THREE.Color(1, 0.2, 0.15)); I.add(tmp, c, 26 + k * 6, 9, this.time, 0.55 + 0.4 * k); }
      }
      // interceptors: quick white streaks
      for (const it of V.ints) { const u = Math.max(0, Math.min(1, (simT - it.t0) / it.dur)); llv(it.from[0], it.from[1], 1, A).normalize(); llv(it.to[0], it.to[1], 1, B).normalize(); const pts = []; for (let k = 0; k <= 10; k++) { const f = u * k / 10; pts.push(slerpV(A, B, f, new THREE.Vector3()).multiplyScalar(1.001 + 0.03 * Math.sin(Math.PI * f * 0.5) * 1.6)); }
        R.strip(pts, f => [1.5, 1.8, 2.2, f * 0.9], 1.4); c.setRGB(2.5, 3, 3.5); G.add(pts[pts.length - 1], c, 8, 0, 0, 1); }
      // targeting arcs requested by the UI (selected launcher → cursor)
      for (const arc of (ui.arcs || [])) { llv(arc.from[0], arc.from[1], 1, A).normalize(); llv(arc.to[0], arc.to[1], 1, B).normalize(); const d = Math.acos(Math.max(-1, Math.min(1, A.dot(B)))), alt = 0.05 + 0.22 * d / Math.PI; const pts = []; for (let k = 0; k <= 48; k++) { const f = k / 48; pts.push(slerpV(A, B, f, new THREE.Vector3()).multiplyScalar(1.001 + alt * Math.sin(Math.PI * f))); }
        const ok = arc.ok; R.strip(pts, f => ok ? [1.2, 0.35, 0.2, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(f * 30 - this.time * 6))] : [0.5, 0.5, 0.5, 0.25], 1.8); }
    }
    U.nRings.value = nr;
    // cursor ring
    if (this.cursor) { const p = llv(this.cursor.lat, this.cursor.lon, 1).normalize(); U.cursor.value.set(p.x, p.y, p.z, Math.cos((this.cursor.r || 0.8) * D2R)); U.cursorCol.value.set(this.cursor.color || '#48ff9a'); } else U.cursor.value.w = 0;
    // detonation effects
    const L = U.sunDir.value;
    for (const s of this.fx.sparks) { s.t += dt; const p = llv(s.lat, s.lon, 1 + (s.alt || 0)); const k = 1 - s.t / s.life; if (k <= 0) continue; c.setRGB(3, 2.6, 2.2); G.add(p, c, (18 + 50 * (1 - k)) * s.big, 0, 0, k); c.setRGB(1.5, 0.8, 0.3); G.add(p, c, 70 * s.big * (1 - k * 0.5), 0, 0, k * 0.4); }
    this.fx.sparks = this.fx.sparks.filter(s => s.t < s.life);
    for (const e of this.fx.embers) { e.t += dt; const p = llv(e.lat, e.lon, 1.0012); const k = Math.max(0, 1 - e.t / 140) * (0.7 + 0.3 * Math.sin(this.time * 7 + e.seed * 40)); if (k <= 0) continue; c.setRGB(2.2, 0.6, 0.12); G.add(p, c, 11, 0, 0, k * 0.8); }
    const smokeList = [];
    for (const d of this.fx.dets) {
      d.t += dt; const t = d.t; if (t > d.life) continue;
      // fireball + flash
      const ft = Math.max(0, 1 - t / 2.0); if (ft > 0) { const p = d.n.clone().multiplyScalar(1.003 + Math.min(1, t / 6) * 0.01); c.setRGB(6, 5, 4); G.add(p, c, 30 + 140 * Math.min(1, t * 3) * ft, 0, 0, ft); c.setRGB(3, 1.4, 0.4); G.add(p, c, 260 * Math.min(1, t * 4) * ft, 0, 0, ft * 0.55); }
      const H = 0.032 * (1 - Math.exp(-t / 3.2)), Rc = 0.011 * (1 - Math.exp(-t / 4.5)) + 0.001, rc = Rc * 0.5, stemR = 0.0022 + 0.0016 * Math.min(1, t / 8);
      const fade = t < 45 ? 1 : Math.max(0, 1 - (t - 45) / 30), heat = Math.exp(-t / 3.5);
      const lit = Math.max(0, d.n.dot(L)); const sh = 0.18 + 0.82 * Math.max(0, Math.min(1, lit * 1.4 + 0.1));
      for (const q of d.parts) {
        let p, sz, a, ht;
        if (q.k === 'stem') { const h = q.h * H * 0.92; const rr = stemR * (0.6 + q.r * 0.6) * (1 + q.h * 0.4); const ang = q.a + t * 0.25 * q.sp;
          p = d.n.clone().multiplyScalar(1 + h).addScaledVector(d.e1, Math.cos(ang) * rr).addScaledVector(d.e2, Math.sin(ang) * rr); sz = 0.0045 * q.sz; a = 0.55 * fade; ht = heat * (0.4 + q.h * 0.6) * 0.8; }
        else if (q.k === 'cap') { const b = q.b + t * 0.55; const r1 = Rc + rc * Math.cos(b) * q.r, z = H + rc * Math.sin(b) * q.r * 0.75 + rc * 0.2;
          p = d.n.clone().multiplyScalar(1 + z).addScaledVector(d.e1, Math.cos(q.a) * r1).addScaledVector(d.e2, Math.sin(q.a) * r1); sz = (0.0065 + Rc * 0.35) * q.sz; a = 0.75 * fade; ht = heat * 1.3 * (1 - q.r * 0.4); }
        else { const rr = Rc * 1.6 * q.r * (1 - Math.exp(-t / 2.5)); p = d.n.clone().multiplyScalar(1.0008).addScaledVector(d.e1, Math.cos(q.a) * rr).addScaledVector(d.e2, Math.sin(q.a) * rr); sz = 0.004 * q.sz * (1 + t / 20); a = 0.45 * fade * Math.max(0, 1 - t / 40); ht = heat * 0.6; }
        const dist = p.distanceTo(this.cam.position); const pix = sz / (dist * pxs);
        if (a <= 0.01 || pix < 0.6) continue;
        const shade = sh * (0.75 + 0.25 * (p.length() - 1) / Math.max(0.001, H));
        smokeList.push([p, shade, Math.min(pix, 400 / this.pr * 2), q.rot + t * q.sp * 0.3, a, ht, dist]);
      }
    }
    smokeList.sort((x, y) => y[6] - x[6]);
    for (const s of smokeList) { const v = s[1]; c.setRGB(0.62 * v + 0.02, 0.58 * v + 0.02, 0.54 * v + 0.02); S.add(s[0], c, s[2], s[5], s[3], s[4]); }
    for (const r of this.fx.rings) { r.t += dt; }
    this.fx.rings = this.fx.rings.filter(r => r.t < 5);
    this.fx.dets = this.fx.dets.filter(d => d.t < d.life);
    // shockwave rings: tangent quads
    while (this.ringPool.length < this.fx.rings.length) { const m = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({ uniforms: { r: { value: 0 }, w: { value: 0.05 }, a: { value: 0 }, c: { value: new THREE.Color(1.6, 1.4, 1.2) } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 2; this.scene.add(m); this.ringPool.push(m); }
    this.ringPool.forEach((m, i) => { const r = this.fx.rings[i]; m.visible = !!r; if (!r) return; const sz = 0.09; m.position.copy(r.n).multiplyScalar(1.0016); m.lookAt(r.n.clone().multiplyScalar(2)); m.scale.set(sz, sz, 1); const k = r.t / 5; m.material.uniforms.r.value = Math.pow(k, 0.55) * 0.95; m.material.uniforms.w.value = 0.03 + k * 0.05; m.material.uniforms.a.value = 1.6 * (1 - k) * (1 - k); });
    I.end(); G.end(); S.end(); R.end();
  }

  /* ---------- crisp 2D labels (native DPR canvas) ---------- */
  drawLabels(V, simT, ui) {
    const x = this.lx, d = this.dpr; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.lab.width, this.lab.height); if (!V) return; x.setTransform(d, 0, 0, d, 0, 0);
    const dist = this.camState.dist, font = '600 11px -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif';
    x.font = font; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (this.warRoom > 0.5 || dist < 2.7) {
      const C = ui.cities || [];
      for (let i = 0; i < C.length; i++) { const ct = C[i]; if (dist > 2.1 && ct.pop0 < (dist > 2.4 ? 25 : 12)) continue; const p = this.project(ct.lat, ct.lon); if (!p.front) continue;
        const f = V.cities[i] / ct.pop0; const dead = f < 0.35;
        x.globalAlpha = Math.min(1, (2.75 - dist) * 2) * (this.warRoom > 0.5 ? 1 : 0.85);
        const label = ct.name.toUpperCase() + (f < 0.98 ? '  ' + (dead ? '✕ ' : '') + Math.round(f * 100) + '%' : '');
        x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.75)'; x.strokeText(label, p.x + 8, p.y); x.fillStyle = dead ? '#ff6a50' : 'rgba(255,236,210,0.92)'; x.fillText(label, p.x + 8, p.y); }
      x.globalAlpha = 1;
    }
    // incoming warhead countdowns
    x.font = '700 11px ui-monospace, "SF Mono", Menlo, monospace';
    for (const m of V.missiles) { if (m.tb !== V.me || m.bloc === V.me) continue; const left = m.t0 + m.dur - simT; if (left < 0) continue; const p = this.project(m.to[0], m.to[1]); if (!p.front) continue; const s = Math.ceil(left) + 's';
      x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.strokeText(s, p.x + 16, p.y - 12); x.fillStyle = '#ff5b4a'; x.fillText(s, p.x + 16, p.y - 12); }
    if (ui.labelFn) ui.labelFn(x, this);
  }
}
