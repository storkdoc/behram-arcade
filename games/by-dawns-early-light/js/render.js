/* ==========================================================================
   BY DAWN'S EARLY LIGHT — render.js  (three.js r169, vendored)
   One WebGL renderer, three in-engine sets:
     • GLOBE   photoreal night Earth (city lights, clouds, atmosphere) with the
               dawn terminator sweeping in as the clock runs; wings, tracks, rings.
     • CABIN   the airborne command post: fuselage interior, battle lighting,
               live CRT consoles (CanvasTextures), portholes onto the cloud deck.
     • SKY     cloud deck / terrain / aircraft for cutscenes and cockpit missions.
   Post: bloom + FXAA on non-MSAA targets (UnsignedByte targets on iOS),
   ?msaa=1 opt-in for the canvas, pixel read-back self-check steps quality down.
   Globe shaders and helpers adapted from Mushroom Cloud (same arcade).
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
uniform vec3 sunDir, camPos; uniform float cloudOff, warRoom, showTerr, time, cloudsOn, tac;
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
  col += showTerr * (1.0 - wr) * (tint * on * ((0.022 + 0.05 * tac + step(abs(id - meBloc), 0.5) * tac * (0.05 + 0.03 * sin(time * 2.0))) * (1.0 - water) + e * (0.5 + 0.25 * sin(time * 1.5))) + border * vec3(0.5, 0.65, 0.8) * 0.05 * (1.0 - water));
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
uniform sampler2D cloudMap; uniform vec3 sunDir, camPos; uniform float cloudOff, tac; uniform vec4 flashes[8]; uniform vec3 flashCol[8]; uniform float warRoom;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vec3 n = normalize(vN), L = normalize(sunDir), V = normalize(camPos - vW);
  float a = texture2D(cloudMap, vUv + vec2(cloudOff, 0.0)).r; a = smoothstep(0.08, 0.9, a);
  float NdL = dot(n, L); float lit = smoothstep(-0.15, 0.35, NdL);
  vec3 c = mix(vec3(1.0, 0.55, 0.35), vec3(1.0), smoothstep(0.0, 0.3, NdL)) * 2.2 * lit + vec3(0.006, 0.008, 0.015);
  for (int i = 0; i < 8; i++) { float k = flashes[i].w; if (k <= 0.0) continue; float d = 1.0 - dot(n, flashes[i].xyz); c += flashCol[i] * k * exp(-d * 2500.0) * 4.0; }
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  gl_FragColor = vec4(c, a * (0.92 - rim * 0.4) * (1.0 - warRoom) * (1.0 - 0.5 * tac)); ${TAIL} }`;
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
/*  Shared bits for the SKY and CABIN sets                                   */
/* ======================================================================== */
const UA = navigator.userAgent;
export const IOS = /iP(hone|ad|od)/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const PHONE = (matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window) && Math.min(screen.width, screen.height) < 600;
const NOISE = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }`;
// camera-facing instanced quads (no point-size limits, safe on every GPU)
const BB_VS = `
attribute vec3 off; attribute vec4 prm; attribute vec3 tint; // prm: size, rot, alpha, heat
varying vec2 vUv; varying vec4 vP; varying vec3 vT; varying float vD;
void main(){ vUv = uv; vP = prm; vT = tint; vec4 mv = viewMatrix * vec4(off, 1.0); float c = cos(prm.y), s = sin(prm.y);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * prm.x; mv.xy += q; vD = -mv.z; gl_Position = projectionMatrix * mv; }`;
const BB_SMOKE_FS = `
uniform sampler2D smoke; uniform float glob; varying vec2 vUv; varying vec4 vP; varying vec3 vT; varying float vD;
void main(){ vec4 t = texture2D(smoke, vUv); vec2 c2 = vUv - 0.5; float cr = cos(vP.y * 1.7 + 1.0), sr = sin(vP.y * 1.7 + 1.0); vec4 t2 = texture2D(smoke, vec2(cr * c2.x - sr * c2.y, sr * c2.x + cr * c2.y) * 1.35 + 0.5);
  float a = t.a * vP.z * glob * (0.55 + 0.75 * t2.a); if (a < 0.003) discard;
  float heat = vP.w; vec3 hot = mix(vec3(0.9, 0.12, 0.02), mix(vec3(3.2, 1.2, 0.25), vec3(6.0, 5.0, 3.6), smoothstep(0.6, 1.0, heat)), smoothstep(0.15, 0.6, heat));
  vec3 col = vT * (0.5 + 0.5 * t.r) + hot * heat * (0.35 + t.r * t.r);
  gl_FragColor = vec4(col * a, a); ${TAIL} }`;
const BB_GLOW_FS = `varying vec2 vUv; varying vec4 vP; varying vec3 vT; varying float vD;
void main(){ float d = length(vUv - 0.5) * 2.0; if (d > 1.0) discard; float k = (exp(-d * d * 14.0) + exp(-d * d * 3.5) * 0.3) * (1.0 - d * d) * (1.0 - d * d) * vP.z; gl_FragColor = vec4(vT * k, k); ${TAIL} }`;
class Billboards {
  constructor(n, fs, uniforms, blend) {
    this.n = n; const g = this.g = new THREE.InstancedBufferGeometry(); const b = new THREE.PlaneGeometry(1, 1);
    g.index = b.index; g.setAttribute('position', b.getAttribute('position')); g.setAttribute('uv', b.getAttribute('uv'));
    this.off = new Float32Array(n * 3); this.prm = new Float32Array(n * 4); this.tint = new Float32Array(n * 3);
    for (const [k, a, s] of [['off', this.off, 3], ['prm', this.prm, 4], ['tint', this.tint, 3]]) g.setAttribute(k, new THREE.InstancedBufferAttribute(a, s).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({ uniforms: uniforms || {}, vertexShader: BB_VS, fragmentShader: fs, transparent: true, depthWrite: false });
    if (blend === 'add') m.blending = THREE.AdditiveBlending; else { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; }
    this.obj = new THREE.Mesh(g, m); this.obj.frustumCulled = false; this.k = 0; g.instanceCount = 0;
  }
  begin() { this.k = 0; }
  add(p, size, rot, alpha, heat, r, gg, b) { if (this.k >= this.n) return; const k = this.k++; this.off[k * 3] = p.x; this.off[k * 3 + 1] = p.y; this.off[k * 3 + 2] = p.z; this.prm[k * 4] = size; this.prm[k * 4 + 1] = rot; this.prm[k * 4 + 2] = alpha; this.prm[k * 4 + 3] = heat; this.tint[k * 3] = r; this.tint[k * 3 + 1] = gg; this.tint[k * 3 + 2] = b; }
  end() { const g = this.g; for (const a of ['off', 'prm', 'tint']) g.attributes[a].needsUpdate = true; g.instanceCount = this.k; }
}
// sky dome: night gradient → dawn glow on the eastern horizon, stars, moon
const SKY_VS = `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform float dawn, flash, time; uniform vec3 moonDir, sunDir; varying vec3 vD; ${NOISE}
void main(){ vec3 d = normalize(vD); float h = d.y;
  vec3 night = mix(vec3(0.012, 0.018, 0.04), vec3(0.002, 0.004, 0.012), smoothstep(0.0, 0.6, h));
  float sd = max(dot(d, normalize(sunDir)), 0.0); float hz = exp(-max(h, 0.0) * 7.0);
  vec3 dawnC = mix(vec3(0.9, 0.32, 0.12), vec3(0.32, 0.42, 0.75), smoothstep(0.0, 0.35, h)) * (0.25 + 1.6 * pow(sd, 3.0)) * hz;
  vec3 col = night + dawnC * dawn * dawn + vec3(0.25, 0.32, 0.55) * smoothstep(0.0, 0.5, h) * dawn * dawn * dawn * 0.6;
  // stars fade with the dawn
  vec3 sp = floor(d * 380.0); float st = step(0.9965, h31(sp)) * (0.5 + 0.5 * sin(time * 3.0 + h31(sp + 3.0) * 40.0)); col += st * vec3(1.4) * (1.0 - dawn) * smoothstep(-0.02, 0.15, h);
  float md = dot(d, normalize(moonDir)); col += vec3(1.6, 1.55, 1.4) * smoothstep(0.9993, 0.9996, md) * (1.0 - dawn * 0.6) + vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 60.0) * 0.4;
  col += vec3(6.0, 4.0, 2.2) * smoothstep(0.9985, 0.9992, sd) * smoothstep(0.55, 0.9, dawn);
  col = mix(col, vec3(0.03, 0.03, 0.035), smoothstep(0.0, -0.25, h));
  col += vec3(1.2, 1.1, 1.0) * flash;
  gl_FragColor = vec4(col, 1.0); ${TAIL} }`;
// layered cloud deck: three stacked noise sheets read as a volume from above or below
const CLOUD_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUDL_FS = `uniform float time, layer, dawn, cover; uniform vec3 moonDir, sunDir, camPos; uniform vec4 nukes[2]; uniform float nukeA[2]; uniform vec4 shock[2]; varying vec3 vW; ${NOISE}
void main(){ vec3 p = vW * 0.00035 + vec3(time * 0.004, layer * 3.1, time * 0.0025);
  float n = fbm(p) * 1.15 + fbm(p * 3.1) * 0.25 - (0.62 - cover * 0.3) - layer * 0.07; float a = smoothstep(0.0, 0.35, n);
  float dist = length(vW.xz - camPos.xz); a *= 1.0 - smoothstep(18000.0, 32000.0, dist); if (a < 0.004) discard;
  float top = smoothstep(0.0, 0.5, n); vec3 moon = vec3(0.16, 0.2, 0.3) * (0.4 + 0.6 * top) * (1.0 - dawn);
  vec3 sun = mix(vec3(1.0, 0.45, 0.22), vec3(0.9, 0.85, 0.85), dawn * dawn) * (0.25 + 0.75 * top) * dawn * dawn * 1.4;
  vec3 col = vec3(0.012, 0.015, 0.025) + moon + sun;
  for (int i = 0; i < 2; i++) { float k = nukeA[i]; if (k > 0.0) { float d = length(vW - nukes[i].xyz); col += vec3(2.6, 1.3, 0.5) * k * exp(-d / max(1.0, nukes[i].w)) * (0.5 + top); }
    if (shock[i].w > 0.0) { float d = length(vW.xz - shock[i].xz); float r = shock[i].y; col += vec3(1.4, 1.3, 1.2) * shock[i].w * exp(-pow((d - r) / 220.0, 2.0)) * top; a = max(a, a * (1.0 + shock[i].w * exp(-pow((d - r) / 300.0, 2.0)))); } }
  gl_FragColor = vec4(col * a, a); ${TAIL} }`;
// procedural terrain (tundra, snow-dusted ridges under the moon)
const TERR_VS = `varying vec3 vW; varying vec3 vN; attribute float hgt; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const TERR_FS = `uniform vec3 moonDir, sunDir, camPos; uniform float dawn, time; uniform vec4 nukes[2]; uniform float nukeA[2]; uniform vec4 shock[2]; varying vec3 vW; varying vec3 vN; ${NOISE}
void main(){ vec3 n = normalize(vN); float snow = smoothstep(0.55, 0.85, n.y + fbm(vW * 0.004) * 0.3 - 0.1) * smoothstep(80.0, 400.0, vW.y + fbm(vW * 0.001) * 300.0);
  vec3 alb = mix(vec3(0.05, 0.055, 0.05) * (0.7 + 0.6 * fbm(vW * 0.01)), vec3(0.55, 0.6, 0.68), snow);
  float ml = max(dot(n, normalize(moonDir)), 0.0), sl = max(dot(n, normalize(sunDir)), 0.0);
  vec3 col = alb * (vec3(0.11, 0.14, 0.22) * ml * (1.0 - dawn) + vec3(1.0, 0.6, 0.35) * sl * dawn * dawn * 1.2 + vec3(0.01, 0.012, 0.02));
  for (int i = 0; i < 2; i++) { float k = nukeA[i]; if (k > 0.0) { vec3 L = nukes[i].xyz - vW; float d = length(L); col += alb * vec3(3.0, 1.6, 0.7) * k * max(dot(n, L / d), 0.0) * exp(-d / max(1.0, nukes[i].w * 2.0)) * 4.0; }
    if (shock[i].w > 0.0) { float d = length(vW.xz - shock[i].xz); float r = shock[i].y; float e = exp(-pow((d - r) / 160.0, 2.0)); col += vec3(0.5, 0.45, 0.4) * e * shock[i].w; col *= 1.0 - 0.25 * smoothstep(r, r - 600.0, d) * shock[i].w; } }
  float fog = 1.0 - exp(-length(vW - camPos) * 0.00011); vec3 fogC = mix(vec3(0.01, 0.014, 0.028), vec3(0.45, 0.3, 0.25), dawn * dawn);
  gl_FragColor = vec4(mix(col, fogC, fog), 1.0); ${TAIL} }`;
// fireball surface: boiling noise, temperature falls white → orange → dark red
const FIRE_VS = `varying vec3 vN; varying vec3 vP; varying vec3 vW; uniform float time; ${NOISE}
void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vec3 p = position * (1.0 + 0.12 * (fbm(position * 2.5 + time * 0.6) - 0.5)); vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FIRE_FS = `uniform float time, temp, alpha; uniform vec3 camPos; varying vec3 vN; varying vec3 vP; varying vec3 vW; ${NOISE}
void main(){ vec3 V = normalize(camPos - vW); float f = max(dot(normalize(vN), V), 0.0);
  float n = fbm(vP * 3.0 + vec3(0.0, -time * 0.8, 0.0)); float tt = clamp(temp * (0.75 + 0.5 * n) + f * 0.25 * temp, 0.0, 1.2);
  vec3 c = mix(vec3(0.25, 0.03, 0.01), vec3(1.6, 0.35, 0.06), smoothstep(0.0, 0.35, tt)); c = mix(c, vec3(4.0, 2.1, 0.7), smoothstep(0.35, 0.7, tt)); c = mix(c, vec3(9.0, 8.4, 7.4), smoothstep(0.7, 1.0, tt));
  float dark = smoothstep(0.55, 0.2, temp) * smoothstep(0.45, 0.75, n); c = mix(c, vec3(0.06, 0.04, 0.035), dark * 0.8);
  gl_FragColor = vec4(c * alpha, alpha); ${TAIL} }`;
// condensation (Wilson) shell
const WILSON_FS = `uniform float a; uniform vec3 camPos; varying vec3 vN; varying vec3 vW; ${NOISE}
void main(){ vec3 V = normalize(camPos - vW); float r = 1.0 - abs(dot(normalize(vN), V)); float n = fbm(vW * 0.004);
  float k = pow(r, 1.4) * (1.0 - pow(r, 10.0)) * a * (0.5 + 0.9 * n); gl_FragColor = vec4(vec3(0.75, 0.78, 0.82) * k, k); ${TAIL} }`;
const WILSON_VS = `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

/* ---------- terrain height (shared with the cockpit mission physics) ---------- */
function h2(x, z) { let n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function vn2(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h2(ix, iz), b = h2(ix + 1, iz), c = h2(ix, iz + 1), d = h2(ix + 1, iz + 1); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; }
export function valleyX(z) { return 700 * Math.sin(z * 0.00031) + 320 * Math.sin(z * 0.00093 + 1.3); }
export function terrainH(x, z) {
  let s = 0, a = 1, f = 0.00042; for (let i = 0; i < 5; i++) { const n = vn2(x * f, z * f); s += a * (i < 2 ? 1 - Math.abs(n * 2 - 1) : n); a *= 0.48; f *= 2.1; }
  const dv = Math.abs(x - valleyX(z)), valley = Math.min(1, Math.max(0, (dv - 260) / 900));
  return 40 + s * 820 * (0.18 + 0.82 * valley * valley * (3 - 2 * valley));
}
/* ---------- aircraft (procedural, generic silhouettes) ---------- */
function mat(c, r = 0.6, m = 0.4, e) { return new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || 0x000000 }); }
function wingGeo(span, root, tip, sweep, thick) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(span, sweep); s.lineTo(span, sweep + tip); s.lineTo(0, root); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false }); g.rotateX(Math.PI / 2); return g;
}
export function makeAircraft(kind) {
  const G = new THREE.Group(), skin = mat(kind === 'post' ? 0xc9ccd0 : 0x50565c, 0.55, 0.5), dark = mat(0x202326, 0.7, 0.3);
  const L = kind === 'post' ? 70 : 46, R = kind === 'post' ? 3.2 : 2.1;
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(R, L - 2 * R, 6, 16), skin); fus.rotation.x = Math.PI / 2; G.add(fus);
  if (kind === 'post') { const hump = new THREE.Mesh(new THREE.CapsuleGeometry(R * 0.7, 14, 6, 12), skin); hump.rotation.x = Math.PI / 2; hump.position.set(0, R * 0.8, -L * 0.3); G.add(hump); }
  const span = kind === 'post' ? 32 : 28, sw = kind === 'post' ? 14 : 18;
  for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo(span, kind === 'post' ? 16 : 14, 4, sw, 0.8), skin); w.scale.x = sd; w.position.set(0, -R * 0.3, kind === 'post' ? -4 : 0); G.add(w);
    const hs = new THREE.Mesh(wingGeo(span * 0.35, 7, 2.5, 6, 0.4), skin); hs.scale.x = sd; hs.position.set(0, 0.4, L / 2 - 8); G.add(hs);
    const ne = kind === 'post' ? [9, 18] : [6, 11];
    for (const x of ne) { const eng = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.1, 6, 12), dark); eng.rotation.x = Math.PI / 2; eng.position.set(sd * x, -R * 0.3 - 1.7, (kind === 'post' ? 2 : 4) + x * (sw / span) - 2.5); G.add(eng); }
  }
  const fin = new THREE.Mesh(wingGeo(kind === 'post' ? 12 : 9, 9, 3, 7, 0.5), skin); fin.rotation.z = Math.PI / 2; fin.position.set(0, R * 0.6, L / 2 - 10); G.add(fin);
  G.userData = { L, span, sw, lights: [[-span, -R * 0.3, (kind === 'post' ? -4 : 0) + sw + 2, 1, 0.1, 0.08], [span, -R * 0.3, (kind === 'post' ? -4 : 0) + sw + 2, 0.1, 1, 0.2], [0, R + (kind === 'post' ? 11 : 8), L / 2 - 3, 1.5, 1.5, 1.5]], engines: kind === 'post' ? [-18, -9, 9, 18] : [-11, -6, 6, 11] };
  return G;
}
/* ---------- a nuclear detonation, seen from far away (visual only) ---------- */
class Detonation {
  constructor(stage, pos, opt = {}) {
    this.s = stage; this.p = pos.clone(); this.t = 0; this.life = opt.life || 95; this.lite = !!opt.lite; this.scale = opt.scale || 1; this.air = !!opt.air;
    let sd = (Math.abs(Math.round(pos.x * 13 + pos.z * 7)) % 2147483000) + 7; const rnd = () => (sd = (sd * 16807 + 11) % 2147483647) / 2147483647; this.rnd = rnd;
    const k = this.lite ? 0.45 : 1; this.parts = [];
    for (let i = 0; i < 300 * k; i++) this.parts.push({ k: 'cap', a: rnd() * 6.283, b: rnd() * 6.283, r: Math.sqrt(rnd()), sz: 0.7 + rnd() * 0.8, rot: rnd() * 6.28, sp: (rnd() - 0.5) });
    for (let i = 0; i < 110 * k; i++) this.parts.push({ k: 'stem', h: Math.pow(rnd(), 0.8), a: rnd() * 6.283, r: rnd(), sz: 0.7 + rnd() * 0.6, rot: rnd() * 6.28, sp: (rnd() - 0.5) });
    for (let i = 0; i < 140 * k; i++) this.parts.push({ k: 'skirt', a: rnd() * 6.283, r: 0.4 + rnd() * 0.6, sz: 0.7 + rnd() * 0.6, rot: rnd() * 6.28, sp: (rnd() - 0.5), h: rnd() });
    this.fire = new THREE.Mesh(stage.fireGeo, new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, temp: { value: 1 }, alpha: { value: 1 }, camPos: { value: stage.scam.position } }, vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    this.wil = new THREE.Mesh(stage.fireGeo, new THREE.ShaderMaterial({ uniforms: { a: { value: 0 }, camPos: { value: stage.scam.position } }, vertexShader: WILSON_VS, fragmentShader: WILSON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.fire.renderOrder = 8; this.wil.renderOrder = 9; stage.sky.add(this.fire, this.wil);
    this.heard = false; this.dist = pos.distanceTo(stage.scam.position); this.ts = opt.tscale || 1;
  }
  get flash() { const t = this.t; return t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 3.2) * 0.9 + Math.exp(-(t - 0.05) * 0.45) * 0.1; }
  update(dt, B, G) {
    const t = (this.t += dt * (this.ts || 1)), S = this.scale, wind = new THREE.Vector3(14 * t, 0, -6 * t);
    const H = (500 + 7600 * (1 - Math.exp(-t / 20))) * S, Rc = (350 + 2600 * (1 - Math.exp(-t / 17))) * S, rc = Rc * 0.46, fade = t < this.life - 30 ? 1 : Math.max(0, (this.life - t) / 30);
    const temp = Math.exp(-t / 4.5), base = this.p;
    // fireball: rises, swells, cools from white to orange to dark red, then is swallowed by the cap
    const fr = (650 * (1 - Math.exp(-t / 0.5)) + 120 * t * 0.2) * S, fy = base.y + Math.min(H * 0.92, (fr * 0.8 + 900 * t * 0.25 * S));
    this.fire.position.set(base.x, fy, base.z).add(wind); this.fire.scale.setScalar(fr * (t > 10 ? Math.max(0.35, 1 - (t - 10) / 25) : 1));
    const fu = this.fire.material.uniforms; fu.time.value = t; fu.temp.value = Math.min(1.1, temp * 1.15); fu.alpha.value = Math.max(0, Math.min(1, t * 20)) * (t < 9 ? 1 : Math.max(0, 1 - (t - 9) / 12)); this.fire.visible = fu.alpha.value > 0.01;
    // condensation shell (Wilson cloud): a brief veil racing outward
    const wa = t < 0.7 ? 0 : t < 1.4 ? (t - 0.7) / 0.7 : Math.max(0, 1 - (t - 1.4) / 3.2);
    this.wil.visible = wa > 0.01 && !this.lite; this.wil.position.copy(base).add(new THREE.Vector3(0, fr * 0.6, 0)); this.wil.scale.set(1, 0.7, 1).multiplyScalar((1200 + 1500 * t) * S); this.wil.material.uniforms.a.value = wa * 0.55;
    // light thrown on terrain and clouds
    this.light = { pos: this.fire.position, range: 2600 * S * (0.4 + temp), k: this.flash * 3 + temp * 1.4 * (t < 30 ? 1 : 0) + 0.25 * Math.exp(-t / 20) };
    this.shock = { x: base.x, z: base.z, r: t * 1100 * S, k: t < 14 ? Math.max(0, 1 - t / 14) * Math.min(1, t * 3) : 0 };
    // smoke: rolling toroidal cap, stem and ground skirt
    const cam = this.s.scam.position, sh = this.s.moonShade, tmp = new THREE.Vector3();
    const showSmoke = t > 0.4;
    if (showSmoke) for (const q of this.parts) {
      let sz, a, ht, y;
      if (q.k === 'cap') { const b = q.b + t * 0.32 * (0.7 + q.sp * 0.2); const r1 = Rc + rc * Math.cos(b) * q.r; y = H + rc * Math.sin(b) * q.r * 0.72;
        tmp.set(base.x + Math.cos(q.a) * r1, base.y + y, base.z + Math.sin(q.a) * r1); sz = (rc * 0.95 + 220 * S) * q.sz; a = 0.72 * Math.min(1, (t - 0.4) * 0.6); ht = temp * 1.25 * (1 - q.r * 0.35) + 0.42 * Math.exp(-t / 35) * (Math.sin(b) < -0.2 ? 1 : 0.15) * (1 - q.r * 0.5); }
      else if (q.k === 'stem') { const hh = q.h * H * 0.9 * Math.min(1, t / 5); const rr = (180 + 260 * Math.min(1, t / 12)) * S * (0.5 + q.r * 0.7) * (1 + q.h * 0.6) + rc * 0.25 * q.h * q.h; const ang = q.a + t * 0.2 * q.sp;
        tmp.set(base.x + Math.cos(ang) * rr, base.y + hh, base.z + Math.sin(ang) * rr); sz = (640 + 520 * q.h) * S * q.sz * Math.min(1, 0.4 + t / 10); a = 0.5 * Math.min(1, t / 3); ht = temp * 0.9 * (0.3 + q.h * 0.7) + 0.18 * Math.exp(-t / 30) * q.h; }
      else { const rr = (500 + 3800 * (1 - Math.exp(-t / 6))) * S * q.r; const ang = q.a + t * 0.03 * q.sp;
        tmp.set(base.x + Math.cos(ang) * rr, base.y + 60 + q.h * 280 * S * Math.min(1, t / 8), base.z + Math.sin(ang) * rr); sz = (380 + t * 18) * S * q.sz; a = this.air ? 0 : 0.34 * Math.min(1, t / 2) * Math.max(0.15, 1 - t / 80); ht = temp * 0.35; }
      tmp.add(wind); a *= fade; if (a < 0.01) continue;
      const shade = 0.05 + sh * 0.3, br = 0.45 + 0.55 * Math.min(1, (tmp.y - base.y) / (H + rc));
      // inner glow: the cooling fireball lights the cloud around it from inside for a long time (what makes it read at night)
      const dF = tmp.distanceTo(this.fire.position) / (fr * 2.2 + rc * 1.2), gk = (0.1 + temp * 1.6) * Math.exp(-dF * dF * 1.5) * Math.exp(-t / 60) * (0.7 + 0.3 * this.flash);
      B.add(tmp.clone(), sz, q.rot + t * q.sp * 0.05, a, Math.min(1.2, ht), shade * br * 1.05 + gk * 0.55, shade * br + gk * 0.24, shade * br * 0.95 + gk * 0.1);
    }
    // core glow and dazzle
    if (this.flash > 0.02) { G.add(this.fire.position, fr * 7 * (0.4 + this.flash), 0, Math.min(1, this.flash * 1.4), 0, 6, 5.6, 5); }
    G.add(this.fire.position, fr * 3.2, 0, 0.4 * temp, 0, 3, 1.2, 0.3);
    // sound arrives after the light (shortened for the screen)
    if (!this.heard && t > Math.min(6, 1.2 + this.dist / 9000)) { this.heard = true; this.s.onSound && this.s.onSound('rumble', Math.max(0.25, 1 - this.dist / 80000)); }
    return t < this.life;
  }
  dispose() { this.s.sky.remove(this.fire, this.wil); this.fire.material.dispose(); this.wil.material.dispose(); }
}
const CINE = { uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, grain: { value: 0.05 }, vign: { value: 0.35 }, dof: { value: 0 }, focusY: { value: 0.5 }, flare: { value: new THREE.Vector3(0.5, 0.5, 0) }, blow: { value: 0 }, fxaa: { value: 1 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float time, grain, vign, dof, focusY, blow, fxaa; uniform vec3 flare; varying vec2 vUv;
  float hs(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){ vec2 px = 1.0 / res; vec3 c = texture2D(tDiffuse, vUv).rgb;
    // depth-of-field (focus band): a soft golden-angle disc blur away from the focal line
    float bl = dof * smoothstep(0.08, 0.45, abs(vUv.y - focusY) + 0.35 * length(vUv - vec2(0.5, focusY)) * 0.5);
    if (bl > 0.02) { vec3 s = c; float r = bl * 9.0; for (int i = 1; i < 13; i++) { float a = float(i) * 2.39996, rr = sqrt(float(i) / 12.0) * r; s += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr * px).rgb; } c = s / 13.0; }
    else if (fxaa > 0.5) { // light edge AA
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, so = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb, e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
      float l = dot(c, vec3(0.3, 0.59, 0.11)); float ed = abs(dot(n + so + e + w, vec3(0.3, 0.59, 0.11)) * 0.25 - l); c = mix(c, (n + so + e + w + c) * 0.2, smoothstep(0.04, 0.2, ed) * 0.6); }
    // lens flare from a bright source (streak + ghosts)
    if (flare.z > 0.0) { vec2 d = vUv - flare.xy; float asp = res.x / res.y; vec2 da = vec2(d.x * asp, d.y);
      c += vec3(1.0, 0.85, 0.7) * flare.z * (exp(-abs(da.y) * 160.0) * exp(-abs(da.x) * 2.5) * 0.9 + exp(-length(da) * 9.0) * 0.6);
      for (int i = 1; i < 4; i++) { vec2 g = flare.xy + (vec2(0.5) - flare.xy) * (0.6 * float(i)); float gd = length((vUv - g) * vec2(asp, 1.0)); c += vec3(0.5, 0.65, 1.0) * flare.z * 0.08 * smoothstep(0.06 * float(i), 0.04 * float(i), gd); } }
    // exposure blowout of a blinding flash
    c = mix(c, vec3(1.0), clamp(blow, 0.0, 1.0)) + c * blow * 2.0;
    vec2 q = vUv - 0.5; c *= 1.0 - vign * dot(q, q) * 2.2;
    c += (hs(vUv * res + fract(time * 7.13) * 100.0) - 0.5) * grain;
    gl_FragColor = vec4(max(c, vec3(0.006)), 1.0); }` };

const STATES_COL = { outbound: '#9fd0ff', orbit: '#ffd36b', penetrate: '#ff5a4a', recall: '#68f0a0', home: '#5c8a74', lost: '#666', struck: '#a33', refuel: '#b9a2ff' };
export class Stage {
  constructor(canvas, labels, opts = {}) {
    const q = new URLSearchParams(location.search);
    this.canvas = canvas; this.lab = labels; this.lx = labels.getContext('2d'); this.opts = opts;
    this.msaa = q.get('msaa') === '1';
    this.r = new THREE.WebGLRenderer({ canvas, antialias: this.msaa, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.0; this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.setClearColor(0x05080f, 1);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.maxTier = PHONE ? 2 : 3; this.tier = PHONE ? 1 : 2; if (q.has('q')) { this.tier = this.maxTier = Math.max(0, Math.min(3, +q.get('q'))); this.lockTier = true; }
    this.mode = 'cabin'; this.time = 0; this.ft = []; this.lastCheck = 0; this.selfChecks = 0; this.blackHoles = 0;
    this.cine = { letter: 0, dof: 0, focusY: 0.5, grain: 0.035, flareK: 0, flarePos: null }; this.flash = 0; this.shake = 0;
    this.gcam = new THREE.PerspectiveCamera(36, 1, 0.01, 200); this.ccam = new THREE.PerspectiveCamera(58, 1, 0.05, 80); this.scam = new THREE.PerspectiveCamera(50, 1, 5, 90000);
    this.camState = { lat: 50, lon: -60, dist: 3.4, tlat: 50, tlon: -60, tdist: 3.4 }; this.cam = this.gcam;
    this.fx = { dets: [], flashes: [], rings: [], embers: [], sparks: [] }; this.sel = null; this.nukes = []; this.sunLon = 75; this.dawn = 0;
  }
  async load(onProgress) {
    const L = new THREE.TextureLoader(); let done = 0; const tot = 4;
    const B = this.opts.base || ''; const get = (url, srgb) => new Promise((res, rej) => L.load(url, t => { done++; onProgress && onProgress(done / tot); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = Math.min(8, this.r.capabilities.getMaxAnisotropy()); res(t); }, undefined, () => rej(new Error('texture ' + url))));
    const [day, night, clouds, terr] = await Promise.all([get(B + 'tex/day.jpg', true), get(B + 'tex/night.jpg', false), get(B + 'tex/clouds.jpg', false), get(B + 'tex/terr.png', false)]);
    clouds.wrapS = THREE.RepeatWrapping;
    this.buildGlobe(day, night, clouds, terr); this.buildCabin(); this.buildSky(); this.setupPost();
    this.ready = true;
  }
  /* ---------------- GLOBE ---------------- */
  buildGlobe(day, night, clouds, terr) {
    const sc = this.gscene = new THREE.Scene(); this.scene = sc;
    this.dmgCanvas = document.createElement('canvas'); this.dmgCanvas.width = 2048; this.dmgCanvas.height = 1024;
    const dx = this.dmgX = this.dmgCanvas.getContext('2d'); dx.fillStyle = 'rgb(255,0,0)'; dx.fillRect(0, 0, 2048, 1024);
    this.dmgTex = new THREE.CanvasTexture(this.dmgCanvas); this.dmgTex.colorSpace = THREE.NoColorSpace;
    const U = this.U = {
      dayMap: { value: day }, nightMap: { value: night }, cloudMap: { value: clouds }, terrMap: { value: terr }, dmgMap: { value: this.dmgTex },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, camPos: { value: new THREE.Vector3() }, cloudOff: { value: 0 }, warRoom: { value: 0 }, showTerr: { value: 1 }, time: { value: 0 }, cloudsOn: { value: 1 },
      blocCol: { value: Array.from({ length: 7 }, () => new THREE.Color(0.5, 0.5, 0.5)) }, blocOn: { value: [1, 1, 0.12, 0.12, 0.12, 0.12, 0.1] }, meBloc: { value: 0 }, tac: { value: 0.6 },
      rings: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, ringCol: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) }, nRings: { value: 0 },
      flashes: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, flashCol: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
      cursor: { value: new THREE.Vector4() }, cursorCol: { value: new THREE.Color(0.3, 1, 0.6) },
    };
    U.blocCol.value[0].set('#62b6ff'); U.blocCol.value[1].set('#ff6b57');
    const seg = PHONE ? [160, 80] : [256, 128];
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, seg[0], seg[1]), new THREE.ShaderMaterial({ uniforms: U, vertexShader: EARTH_VS, fragmentShader: EARTH_FS })); sc.add(this.earth);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 160, 80), new THREE.ShaderMaterial({ uniforms: U, vertexShader: EARTH_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false })); sc.add(this.clouds);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 128, 64), new THREE.ShaderMaterial({ uniforms: U, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sc.add(this.atmo);
    const dprU = this.dprU = { value: this.dpr }; this.makeStars();
    this.atlas = iconAtlas(); this.smoke = smokeTex();
    const mk = (fs, extra, blend) => new THREE.ShaderMaterial({ uniforms: Object.assign({ dpr: dprU }, extra), vertexShader: PTS_VS, fragmentShader: fs, transparent: true, depthWrite: false, blending: blend || THREE.NormalBlending });
    this.icons = new PointBuf(600, mk(ICON_FS, { atlas: { value: this.atlas.tex } })); this.icons.obj.renderOrder = 5;
    this.glows = new PointBuf(2500, mk(GLOW_FS, {}, THREE.AdditiveBlending)); this.glows.obj.renderOrder = 6;
    const smokeMat = mk(SMOKE_FS, { smoke: { value: this.smoke } }); smokeMat.blending = THREE.CustomBlending; smokeMat.blendSrc = THREE.OneFactor; smokeMat.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.smokeP = new PointBuf(PHONE ? 2500 : 6000, smokeMat); this.smokeP.obj.renderOrder = 4;
    this.ribs = new Ribbons(40000); this.ribs.obj.renderOrder = 3;
    sc.add(this.ribs.obj, this.smokeP.obj, this.glows.obj, this.icons.obj);
    this.ringGeo = new THREE.PlaneGeometry(1, 1); this.ringPool = [];
  }
  makeStars() {
    const n = PHONE ? 4000 : 8000, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), al = new Float32Array(n).fill(1), z = new Float32Array(n);
    let s = 3; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize().multiplyScalar(80); pos.set([v.x, v.y, v.z], i * 3); const b = Math.pow(rnd(), 6) * 2.2 + 0.08; col.set([b, b, b * 1.1], i * 3); size[i] = 1.2 + Math.pow(rnd(), 8) * 3.5; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(al, 1)); g.setAttribute('icon', new THREE.BufferAttribute(z, 1)); g.setAttribute('rot', new THREE.BufferAttribute(z.slice(), 1));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { dpr: this.dprU }, vertexShader: PTS_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); this.stars.renderOrder = -1; this.gscene.add(this.stars);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array([6, 5.4, 4.6, 0.9, 0.7, 0.5]), 3)); sg.setAttribute('size', new THREE.BufferAttribute(new Float32Array([60, 420]), 1)); sg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array([1, 0.5]), 1)); sg.setAttribute('icon', new THREE.BufferAttribute(new Float32Array(2), 1)); sg.setAttribute('rot', new THREE.BufferAttribute(new Float32Array(2), 1));
    this.sun = new THREE.Points(sg, this.stars.material); this.sun.frustumCulled = false; this.gscene.add(this.sun);
  }
  setupPost() {
    const r = this.r, T = IOS ? THREE.UnsignedByteType : THREE.HalfFloatType;
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: T, samples: 0 });
    this.composer = new EffectComposer(r, rt); // never MSAA offscreen; no float targets on iOS
    this.rpass = new RenderPass(this.gscene, this.gcam); this.composer.addPass(this.rpass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.5);
    if (IOS) { for (const t of [this.bloom.renderTargetBright, ...this.bloom.renderTargetsHorizontal, ...this.bloom.renderTargetsVertical]) t.texture.type = THREE.UnsignedByteType; }
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.cpass = new ShaderPass(CINE); this.composer.addPass(this.cpass);
  }
  setTier(t) { t = Math.max(0, Math.min(this.maxTier, t)); if (t === this.tier && this._sized) return; this.tier = t; this._sized = false; this.lastCheck = this.time - 999; }
  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight); this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    let pr = this.tier >= 3 ? this.dpr * Math.sqrt(Math.min(2.0, 8e6 / (w * h * this.dpr * this.dpr))) : this.tier === 2 ? this.dpr : Math.min(this.dpr, PHONE ? 2 : 1.5);
    if (this.tier >= 3 && pr < this.dpr * 1.1) pr = this.dpr; if (this.tier <= 0) pr = Math.min(pr, 1.25);
    this.pr = pr; this.r.setPixelRatio(pr); this.r.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.lab.width = Math.round(w * this.dpr); this.lab.height = Math.round(h * this.dpr); this.lab.style.width = w + 'px'; this.lab.style.height = h + 'px';
    for (const c of [this.gcam, this.ccam, this.scam]) { c.aspect = w / h; c.updateProjectionMatrix(); } this.W = w; this.H = h;
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); this.bloom.resolution.set(w * pr, h * pr); this.cpass.uniforms.res.value.set(w * pr, h * pr); this.cpass.uniforms.fxaa.value = this.tier < 3 ? 1 : 0; }
    this.dprU && (this.dprU.value = pr);
    this._sized = true;
  }
  /* ---------- globe camera ---------- */
  rotate(dx, dy) { const c = this.camState, k = c.dist * 0.12; c.tlon -= dx * k; c.tlat = Math.max(-80, Math.min(85, c.tlat + dy * k)); this.userCam = this.time; }
  zoom(f) { const c = this.camState; c.tdist = Math.max(1.15, Math.min(6, c.tdist * f)); this.userCam = this.time; }
  focus(lat, lon, dist) { const c = this.camState; c.tlat = lat; let d = lon - c.tlon; d -= 360 * Math.round(d / 360); c.tlon += d; if (dist) c.tdist = dist; }
  updateGlobeCam(dt) {
    const c = this.camState, k = 1 - Math.exp(-dt * 4); c.lat += (c.tlat - c.lat) * k; c.lon += (c.tlon - c.lon) * k; c.dist += (c.tdist - c.dist) * (1 - Math.exp(-dt * 3.5));
    const cam = this.gcam, p = llv(c.lat, c.lon, c.dist, cam.position);
    if (this.shake > 0) { const s = this.shake * this.shake * 0.02 * Math.min(1, c.dist - 1); p.x += (Math.random() - 0.5) * s; p.y += (Math.random() - 0.5) * s; p.z += (Math.random() - 0.5) * s; }
    const look = llv(c.lat, c.lon, Math.max(0, 1 - (c.dist - 1) * 1.2) * 0.85); cam.up.set(0, 1, 0); cam.lookAt(look);
    cam.near = Math.max(0.002, (c.dist - 1.06) * 0.5); cam.far = 200; cam.updateProjectionMatrix();
  }
  pick(x, y) {
    const ndc = new THREE.Vector2(x / this.W * 2 - 1, -(y / this.H) * 2 + 1); const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, this.gcam);
    const o = rc.ray.origin, d = rc.ray.direction, b = o.dot(d), c = o.dot(o) - 1, disc = b * b - c; if (disc < 0) return null; const t = -b - Math.sqrt(disc); if (t < 0) return null; return vll(o.clone().addScaledVector(d, t));
  }
  project(lat, lon, alt = 0) {
    const cam = this.gcam, p = llv(lat, lon, 1 + alt); const front = p.clone().normalize().dot(cam.position.clone().sub(p).normalize()) > 0.02;
    const v = p.project(cam); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, front, z: v.z };
  }
  resetFx() { for (const k in this.fx) this.fx[k].length = 0; this.dmgX.fillStyle = 'rgb(255,0,0)'; this.dmgX.fillRect(0, 0, 2048, 1024); this.dmgTex.needsUpdate = true; this.shake = 0; this.nStrikes = 0; for (const n of this.nukes) n.dispose(); this.nukes = []; }
  /** orbit-view detonation: flash on the night side, rising cap, skirt, shock ring, a scar that kills the lights */
  globeDet(lat, lon, quiet) {
    const n = llv(lat, lon, 1).normalize(); const e1 = new THREE.Vector3(0, 1, 0).cross(n); if (e1.lengthSq() < 1e-4) e1.set(1, 0, 0); e1.normalize(); const e2 = n.clone().cross(e1).normalize();
    const parts = []; let s = (Math.abs(lat * 1000 + lon * 7) | 0) + 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; const big = this.tier >= 1 && !PHONE ? 1 : 0.5;
    for (let i = 0; i < 70 * big; i++) parts.push({ k: 'stem', h: rnd(), a: rnd() * 6.283, r: rnd(), sz: 0.8 + rnd() * 0.6, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.4 });
    for (let i = 0; i < 150 * big; i++) parts.push({ k: 'cap', a: rnd() * 6.283, b: rnd() * 6.283, r: Math.sqrt(rnd()), sz: 0.9 + rnd() * 0.9, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.6 });
    for (let i = 0; i < 50 * big; i++) parts.push({ k: 'skirt', a: rnd() * 6.283, r: 0.6 + rnd() * 0.5, sz: 0.7 + rnd() * 0.5, rot: rnd() * 6.283, sp: (rnd() - 0.5) * 0.3 });
    this.fx.dets.push({ lat, lon, n, e1, e2, t: 0, parts, life: 80 }); if (this.fx.dets.length > 12) this.fx.dets.shift();
    this.fx.flashes.push({ n, t: 0 }); this.fx.rings.push({ n, e1, e2, t: 0 }); this.fx.embers.push({ lat, lon, n, t: 0, seed: rnd() });
    const x = (lon + 180) / 360 * 2048, y = (90 - lat) / 180 * 1024, dx = this.dmgX;
    for (const ox of [-2048, 0, 2048]) { dx.save(); dx.translate(x + ox, y); dx.scale(1 / Math.max(0.3, Math.cos(lat * D2R)), 1);
      dx.globalCompositeOperation = 'multiply'; const g2 = dx.createRadialGradient(0, 0, 0, 0, 0, 26); g2.addColorStop(0, 'rgb(0,255,255)'); g2.addColorStop(0.6, 'rgb(40,255,255)'); g2.addColorStop(1, 'rgb(255,255,255)'); dx.fillStyle = g2; dx.beginPath(); dx.arc(0, 0, 26, 0, 7); dx.fill();
      dx.globalCompositeOperation = 'lighter'; const g3 = dx.createRadialGradient(0, 0, 0, 0, 0, 9); g3.addColorStop(0, 'rgba(0,200,0,1)'); g3.addColorStop(1, 'rgba(0,0,0,0)'); dx.fillStyle = g3; dx.beginPath(); dx.arc(0, 0, 9, 0, 7); dx.fill(); dx.restore(); }
    this.dmgTex.needsUpdate = true;
    if (this.mode === 'globe' && n.dot(this.gcam.position.clone().normalize()) > 0.3) this.shake = Math.min(1.2, this.shake + 0.5);
    if (!quiet && this.onSound) setTimeout(() => this.onSound('rumble', 0.35), 1600);
  }
  globeFrame(dt, V, ui) {
    const U = this.U; this.updateGlobeCam(dt);
    const sd = llv(-12, this.sunLon, 1).normalize(); U.sunDir.value.copy(sd);
    this.sun.geometry.attributes.position.array.set([sd.x * 90, sd.y * 90, sd.z * 90, sd.x * 90, sd.y * 90, sd.z * 90]); this.sun.geometry.attributes.position.needsUpdate = true;
    U.camPos.value.copy(this.gcam.position); U.time.value = this.time; U.cloudOff.value = (this.time * 0.0006) % 1; U.tac.value = ui.tac === undefined ? 0.6 : ui.tac;
    U.cloudsOn.value = this.tier >= 1 ? 0.7 : 0; this.clouds.visible = this.tier >= 1; U.meBloc.value = V ? V.side : 0;
    this.fx.flashes = this.fx.flashes.filter(f => (f.t += dt) < 2.4);
    for (let i = 0; i < 8; i++) { const f = this.fx.flashes[this.fx.flashes.length - 1 - i]; if (f) { const k = f.t < 0.08 ? f.t / 0.08 : Math.exp(-(f.t - 0.08) * 2.2); U.flashes.value[i].set(f.n.x, f.n.y, f.n.z, k * 3); U.flashCol.value[i].setRGB(1, 0.75 + 0.25 * Math.exp(-f.t * 3), 0.5 + 0.5 * Math.exp(-f.t * 4)); } else U.flashes.value[i].w = 0; }
    if (V && V.strikes) { if (this.nStrikes === undefined) this.nStrikes = 0; while (this.nStrikes < V.strikes.length) { const s = V.strikes[this.nStrikes++]; if (s.pos && !ui.noDet) this.globeDet(s.pos[0], s.pos[1], ui.quietDet); } }
    this.globeOverlays(dt, V, ui);
  }
  globeOverlays(dt, V, ui) {
    const I = this.icons, G = this.glows, S = this.smokeP, R = this.ribs, cam = this.gcam; I.begin(); G.begin(); S.begin();
    const pxs = 2 * Math.tan(cam.fov * D2R / 2) / this.H; R.begin(cam, pxs);
    const white = new THREE.Color(1, 1, 1), tmp = new THREE.Vector3(), c = new THREE.Color(), U = this.U; U.nRings.value = 0;
    const SD = ui.SIDES, gc = (a, b, alt, n) => { const A = llv(a[0], a[1], 1).normalize(), B = llv(b[0], b[1], 1).normalize(), pts = []; for (let k = 0; k <= n; k++) pts.push(slerpV(A, B, k / n, new THREE.Vector3()).multiplyScalar(1 + alt)); return pts; };
    if (V && SD) {
      const me = V.side, mc = new THREE.Color(SD[me].color), oc = new THREE.Color(SD[1 - me].color);
      // fail-safe line: a dashed ring of fail-safe points
      const fsl = SD[me].wings.map(w => w.fs); for (let i = 0; i < fsl.length - 1; i++) { /* drawn per wing below */ }
      for (const w of V.me.wings) {
        const d = SD[me].wings[w.i], col = new THREE.Color(STATES_COL[w.state] || '#fff'), sel = this.sel === w.i;
        if (w.state !== 'lost' && w.state !== 'home') {
          const a1 = gc(d.base, d.fs, 0.004, 40), a2 = gc(d.fs, d.tp, 0.004, 40);
          R.strip(a1, f => [mc.r * 0.6, mc.g * 0.6, mc.b * 0.6, sel ? 0.55 : 0.28], sel ? 2.2 : 1.4);
          R.strip(a2, f => [1.0, 0.3, 0.22, (sel ? 0.5 : 0.22) * (0.6 + 0.4 * Math.sin(f * 50 - this.time * 3))], sel ? 2.2 : 1.3);
          llv(d.fs[0], d.fs[1], 1.004, tmp); c.setRGB(1.4, 1.0, 0.3); G.add(tmp, c, sel ? 16 : 10, 0, 0, 0.8);
          llv(d.tp[0], d.tp[1], 1.002, tmp); c.setRGB(1, 0.25, 0.2); I.add(tmp, c, 16, 9, this.time * 0.4, sel ? 0.9 : 0.35);
        }
        llv(w.pos[0], w.pos[1], 1.008, tmp); const nx = w.prog <= 0.5 ? d.fs : d.tp, dir = w.state === 'recall' || w.state === 'home' ? d.base : nx;
        const p2 = this.project(w.pos[0], w.pos[1], 0.008), ah = this.project(dir[0], dir[1], 0.008), rot = Math.atan2(ah.x - p2.x, -(ah.y - p2.y));
        if (w.state === 'lost') { c.setRGB(0.4, 0.4, 0.4); I.add(tmp, c, 16, 7, -rot, 0.4); continue; }
        I.add(tmp, col, sel ? 30 : 22, 7, -rot, 1); if (sel) I.add(tmp, white, 44, 9, this.time * 0.6, 0.6 + 0.4 * Math.sin(this.time * 6));
        if (w.state === 'struck') { c.setRGB(2.4, 0.7, 0.2); G.add(tmp, c, 22, 0, 0, 0.5 + 0.3 * Math.sin(this.time * 5)); }
        if (w.radio !== 'ok') { c.setRGB(1.5, 0.3, 0.2); G.add(tmp, c, 30 + 8 * Math.sin(this.time * 4), 0, 0, 0.35); }
      }
      for (const b of V.me.subs) { llv(b.pos[0], b.pos[1], 1.003, tmp); I.add(tmp, mc, 18, 4, 0, b.state === 'lost' ? 0.35 : 0.9); }
      // own airborne post, orbiting slowly over the interior
      const pa = this.time * 0.05 + me * 3, pp = me === 0 ? [41 + Math.sin(pa) * 2.5, -96 + Math.cos(pa) * 4] : [57 + Math.sin(pa) * 2.5, 60 + Math.cos(pa) * 4];
      llv(pp[0], pp[1], 1.012, tmp); c.copy(mc).multiplyScalar(2.2); G.add(tmp, c, 14 + 3 * Math.sin(this.time * 3), 0, 0, 1); I.add(tmp, white, 26, 9, -this.time, 0.5); this.postLL = pp;
      for (const w of V.them.wings) { llv(w.pos[0], w.pos[1], 1.008, tmp); c.copy(oc); if (w.state === 'turning away') c.lerp(new THREE.Color('#68f0a0'), 0.4); I.add(tmp, c, 20, 7, 0, w.state === 'inbound' ? 0.95 : 0.6);
        if (w.state === 'inbound') { c.setRGB(1.6, 0.25, 0.15); G.add(tmp, c, 34 + 6 * Math.sin(this.time * 6), 0, 0, 0.35); } }
      for (const g of V.them.ghosts || []) { llv(g[0], g[1], 1.008, tmp); c.setRGB(1, 0.6, 0.3); I.add(tmp, c, 20, 10, 0, 0.35 + 0.35 * Math.abs(Math.sin(this.time * 2 + g[1]))); }
    }
    // cinematic ballistic arcs: ribbon with a white-hot head
    for (const a of ui.arcs || []) { const A = llv(a.from[0], a.from[1], 1).normalize(), B = llv(a.to[0], a.to[1], 1).normalize(), d = Math.acos(Math.max(-1, Math.min(1, A.dot(B)))), alt = 0.05 + 0.2 * d / Math.PI, u = Math.max(0, Math.min(1, a.u)), pts = [];
      for (let k = 0; k <= 48; k++) { const f = u * k / 48; pts.push(slerpV(A, B, f, new THREE.Vector3()).multiplyScalar(1.001 + alt * Math.sin(Math.PI * f))); }
      const col = new THREE.Color(a.col || '#ffffff'); R.strip(pts, f => { const h = Math.pow(f, 3); return [col.r * 0.8 + h * 2.4, col.g * 0.8 + h * 2, col.b * 0.8 + h * 1.4, 0.1 + 0.8 * Math.pow(f, 1.3)]; }, 2.2);
      if (u < 1) { const hd = pts[pts.length - 1]; c.setRGB(3.5, 2.8, 2); G.add(hd, c, 12 + 3 * Math.sin(this.time * 30), 0, 0, 1); } }
    // effects
    for (const e of this.fx.embers) { e.t += dt; const p = llv(e.lat, e.lon, 1.0012); const k = Math.max(0, 1 - e.t / 400) * (0.7 + 0.3 * Math.sin(this.time * 7 + e.seed * 40)); if (k <= 0) continue; c.setRGB(2.2, 0.6, 0.12); G.add(p, c, 11, 0, 0, k * 0.8); }
    const smokeList = [], L = U.sunDir.value;
    for (const d of this.fx.dets) {
      d.t += dt; const t = d.t; if (t > d.life) continue;
      const ft = Math.max(0, 1 - t / 2.0); if (ft > 0) { const p = d.n.clone().multiplyScalar(1.003 + Math.min(1, t / 6) * 0.01); c.setRGB(6, 5, 4); G.add(p, c, 30 + 140 * Math.min(1, t * 3) * ft, 0, 0, ft); c.setRGB(3, 1.4, 0.4); G.add(p, c, 260 * Math.min(1, t * 4) * ft, 0, 0, ft * 0.55); }
      const H = 0.032 * (1 - Math.exp(-t / 3.2)), Rc = 0.011 * (1 - Math.exp(-t / 4.5)) + 0.001, rc = Rc * 0.5, stemR = 0.0022 + 0.0016 * Math.min(1, t / 8);
      const fade = t < 50 ? 1 : Math.max(0, 1 - (t - 50) / 30), heat = Math.exp(-t / 3.5), lit = Math.max(0, d.n.dot(L)), sh = 0.14 + 0.86 * Math.max(0, Math.min(1, lit * 1.4 + 0.1));
      for (const q of d.parts) {
        let p, sz, a, ht;
        if (q.k === 'stem') { const h = q.h * H * 0.92, rr = stemR * (0.6 + q.r * 0.6) * (1 + q.h * 0.4), ang = q.a + t * 0.25 * q.sp; p = d.n.clone().multiplyScalar(1 + h).addScaledVector(d.e1, Math.cos(ang) * rr).addScaledVector(d.e2, Math.sin(ang) * rr); sz = 0.0045 * q.sz; a = 0.55 * fade; ht = heat * (0.4 + q.h * 0.6) * 0.8; }
        else if (q.k === 'cap') { const b = q.b + t * 0.55, r1 = Rc + rc * Math.cos(b) * q.r, z = H + rc * Math.sin(b) * q.r * 0.75 + rc * 0.2; p = d.n.clone().multiplyScalar(1 + z).addScaledVector(d.e1, Math.cos(q.a) * r1).addScaledVector(d.e2, Math.sin(q.a) * r1); sz = (0.0065 + Rc * 0.35) * q.sz; a = 0.75 * fade; ht = heat * 1.3 * (1 - q.r * 0.4); }
        else { const rr = Rc * 1.6 * q.r * (1 - Math.exp(-t / 2.5)); p = d.n.clone().multiplyScalar(1.0008).addScaledVector(d.e1, Math.cos(q.a) * rr).addScaledVector(d.e2, Math.sin(q.a) * rr); sz = 0.004 * q.sz * (1 + t / 20); a = 0.45 * fade * Math.max(0, 1 - t / 40); ht = heat * 0.6; }
        const dist = p.distanceTo(cam.position), pix = sz / (dist * pxs); if (a <= 0.01 || pix < 0.6) continue;
        smokeList.push([p, sh * (0.75 + 0.25 * (p.length() - 1) / Math.max(0.001, H)), Math.min(pix, 400 / this.pr * 2), q.rot + t * q.sp * 0.3, a, ht, dist]);
      }
    }
    smokeList.sort((x, y) => y[6] - x[6]);
    for (const s of smokeList) { const v = s[1]; c.setRGB(0.62 * v + 0.02, 0.58 * v + 0.02, 0.54 * v + 0.02); S.add(s[0], c, s[2], s[5], s[3], s[4]); }
    for (const r of this.fx.rings) r.t += dt; this.fx.rings = this.fx.rings.filter(r => r.t < 5); this.fx.dets = this.fx.dets.filter(d => d.t < d.life);
    while (this.ringPool.length < this.fx.rings.length) { const m = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({ uniforms: { r: { value: 0 }, w: { value: 0.05 }, a: { value: 0 }, c: { value: new THREE.Color(1.6, 1.4, 1.2) } }, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 2; this.gscene.add(m); this.ringPool.push(m); }
    this.ringPool.forEach((m, i) => { const r = this.fx.rings[i]; m.visible = !!r; if (!r) return; m.position.copy(r.n).multiplyScalar(1.0016); m.lookAt(r.n.clone().multiplyScalar(2)); m.scale.set(0.09, 0.09, 1); const k = r.t / 5; m.material.uniforms.r.value = Math.pow(k, 0.55) * 0.95; m.material.uniforms.w.value = 0.03 + k * 0.05; m.material.uniforms.a.value = 1.6 * (1 - k) * (1 - k); });
    I.end(); G.end(); S.end(); R.end();
  }
  globeLabels(V, ui) {
    const x = this.lx; if (!V || !ui.SIDES) return; const SD = ui.SIDES, me = V.side;
    x.font = '700 11px ui-monospace, "SF Mono", Menlo, monospace'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const lab = (lat, lon, s, col, dy = 0, alt = 0.008) => { const p = this.project(lat, lon, alt); if (!p.front || p.x < -50 || p.x > this.W + 50) return; x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.strokeText(s, p.x + 14, p.y + dy); x.fillStyle = col; x.fillText(s, p.x + 14, p.y + dy); };
    for (const w of V.me.wings) { if (w.state === 'home') continue; lab(w.pos[0], w.pos[1], w.name + (w.state === 'lost' ? ' ✕' : '') + (w.radio !== 'ok' ? ' · NO RADIO' : '') + (w.pend ? ' · ' + w.pend.toUpperCase() + '…' : ''), STATES_COL[w.state] || '#fff'); }
    for (const w of V.them.wings) lab(w.pos[0], w.pos[1], 'TRACK ' + (w.i + 1) + ' · ' + w.state.toUpperCase(), SD[1 - me].color);
    for (const g of V.them.ghosts || []) lab(g[0], g[1], '? UNCONFIRMED', '#ffb070');
    if (this.postLL) lab(this.postLL[0], this.postLL[1], SD[me].post + ' (YOU)', '#ffffff', 0, 0.012);
    if (this.sel !== null && this.sel !== undefined) { const d = SD[me].wings[this.sel]; if (d) { lab(d.fs[0], d.fs[1], 'FAIL-SAFE ' + d.name, '#ffd36b', 0, 0.004); lab(d.tp[0], d.tp[1], d.tgt.toUpperCase(), '#ff7a6a', 0, 0.002); } }
    x.font = '600 10px ui-monospace, Menlo, monospace'; for (const s of V.strikes) lab(s.pos[0], s.pos[1], '✕ ' + s.tgt, '#ff9a80', 14, 0.0);
  }
  /* ---------------- CABIN: the airborne command post ---------------- */
  buildCabin() {
    const sc = this.cscene = new THREE.Scene(); sc.background = new THREE.Color(0x05080f);
    const pc = document.createElement('canvas'); pc.width = 512; pc.height = 512; const px = pc.getContext('2d');
    px.fillStyle = '#3a4048'; px.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) { px.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; px.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 6); }
    px.strokeStyle = 'rgba(0,0,0,0.55)'; px.lineWidth = 3; for (let i = 0; i <= 4; i++) { px.beginPath(); px.moveTo(i * 128, 0); px.lineTo(i * 128, 512); px.stroke(); px.beginPath(); px.moveTo(0, i * 128); px.lineTo(512, i * 128); px.stroke(); }
    px.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 32; j++) { px.beginPath(); px.arc(i * 128 + 8, j * 16, 1.6, 0, 7); px.fill(); }
    const panel = new THREE.CanvasTexture(pc); panel.colorSpace = THREE.SRGBColorSpace; panel.wrapS = panel.wrapT = THREE.RepeatWrapping; panel.repeat.set(10, 3);
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 18, 48, 1, true), new THREE.MeshStandardMaterial({ map: panel, color: 0x9aa0a8, roughness: 0.75, metalness: 0.05, emissive: 0x0d0f13, side: THREE.BackSide }));
    fus.rotation.x = Math.PI / 2; sc.add(fus);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 18), mat(0x2a2c31, 0.9, 0.2)); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.25; sc.add(floor);
    for (const z of [-6.2, 7.5]) { const bh = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshStandardMaterial({ map: panel, color: 0x6e747c, roughness: 0.8, metalness: 0.05, emissive: 0x0b0c10 })); bh.position.z = z; if (z > 0) bh.rotation.y = Math.PI; sc.add(bh); }
    sc.add(new THREE.HemisphereLight(0x8494b0, 0x2a2018, 2.0)); sc.add(new THREE.AmbientLight(0x3a3440, 2.2));
    this.cabLights = [];
    for (const z of [-4.5, -1.5, 1.5, 4.5]) { const l = new THREE.PointLight(0xff3020, 3.2, 7, 1.6); l.position.set(0, 1.7, z); sc.add(l); this.cabLights.push(l);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.25, 0.15) })); strip.position.set(0, 2.05, z); sc.add(strip); }
    const green = new THREE.PointLight(0x50ff9a, 1.6, 4, 1.5); green.position.set(-0.9, 0.3, 0); sc.add(green); const amber = new THREE.PointLight(0xffa040, 1.8, 4, 1.5); amber.position.set(0, 0.3, -5); sc.add(amber);
    this.screens = {};
    const mkScreen = (key, w, h, pos, rotY, tilt, amberC) => {
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = Math.round(640 * h / w); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const desk = new THREE.Mesh(new THREE.BoxGeometry(w + 0.25, 0.9, 0.8), mat(0x2c3036, 0.7, 0.4)); desk.position.copy(pos).add(new THREE.Vector3(0, -0.8, 0)); desk.rotation.y = rotY; sc.add(desk);
      const bez = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.18), mat(0x23262b, 0.6, 0.5)); const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.5, 1.5) }));
      const g = new THREE.Group(); g.add(bez); scr.position.z = 0.095; g.add(scr); g.position.copy(pos); g.rotation.set(0, rotY, 0, 'YXZ'); g.rotateX(tilt); sc.add(g);
      this.screens[key] = { cv, x: cv.getContext('2d'), tex, amber: !!amberC, obj: scr, w: cv.width, h: cv.height };
      // switches and lamps
      for (let i = 0; i < 6; i++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(...(i % 3 === 0 ? [2, 0.3, 0.2] : i % 3 === 1 ? [0.4, 2, 0.6] : [2, 1.4, 0.3])) })); lamp.position.set(-w / 2 + 0.1 + i * 0.12, -0.33, 0.25); desk.add(lamp); }
    };
    mkScreen('sys', 1.0, 0.68, new THREE.Vector3(-1.62, 0.15, 1.7), Math.PI / 2, -0.12);
    mkScreen('wings', 1.0, 0.68, new THREE.Vector3(-1.62, 0.15, 0.4), Math.PI / 2, -0.12);
    mkScreen('auth', 1.0, 0.68, new THREE.Vector3(-1.62, 0.15, -0.9), Math.PI / 2, -0.12);
    mkScreen('ladder', 1.0, 0.68, new THREE.Vector3(1.62, 0.15, 1.0), -Math.PI / 2, -0.12);
    mkScreen('map', 1.0, 0.68, new THREE.Vector3(1.62, 0.15, -0.4), -Math.PI / 2, -0.12);
    mkScreen('hl', 1.3, 0.8, new THREE.Vector3(0, 0.2, -5.7), 0, -0.1, true);
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.18), mat(0x8a1410, 0.4, 0.2, 0x200000)); phone.position.set(0.82, -0.3, -5.4); sc.add(phone);
    // seats (low backs so they never hide the consoles)
    for (const [x, z, r] of [[-0.8, 1.7, -Math.PI / 2], [-0.8, 0.4, -Math.PI / 2], [-0.8, -0.9, -Math.PI / 2], [0.8, 1.0, Math.PI / 2], [0.8, -0.4, Math.PI / 2], [0, -4.8, 0]]) { const s = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.55), mat(0x15171a, 0.9, 0.1)); b.position.y = -0.7; const bk = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.1), mat(0x15171a, 0.9, 0.1)); bk.position.set(0, -0.48, 0.27); s.add(b, bk); s.position.set(x, 0, z); s.rotation.y = r; sc.add(s); }
    // portholes, moonlit cloud tops outside
    const wc = document.createElement('canvas'); wc.width = wc.height = 128; const wx = wc.getContext('2d'); const gr = wx.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#05070e'); gr.addColorStop(0.55, '#141c2e'); gr.addColorStop(0.62, '#3a4560'); gr.addColorStop(1, '#1c2232'); wx.fillStyle = gr; wx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { wx.fillStyle = '#fff'; wx.globalAlpha = Math.random() * 0.8; wx.fillRect(Math.random() * 128, Math.random() * 60, 1, 1); } wx.globalAlpha = 1;
    this.portTex = new THREE.CanvasTexture(wc); this.portTex.colorSpace = THREE.SRGBColorSpace; this.portMats = [];
    for (const z of [-3.4, -2.2, 2.8, 4.0]) for (const sd of [-1, 1]) { const m = new THREE.MeshBasicMaterial({ map: this.portTex, color: new THREE.Color(1.2, 1.2, 1.3) }); this.portMats.push(m); const p = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), m); p.position.set(sd * 2.33, 0.45, z); p.rotation.y = -sd * Math.PI / 2; sc.add(p);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 24), mat(0x50555c, 0.5, 0.6)); rim.position.copy(p.position); rim.rotation.y = p.rotation.y; sc.add(rim); }
    // dust motes
    this.motes = new Billboards(PHONE ? 60 : 160, BB_GLOW_FS, {}, 'add'); sc.add(this.motes.obj); this.moteP = Array.from({ length: this.motes.n }, () => new THREE.Vector3((Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 2.6, (Math.random() - 0.5) * 14));
    this.cab = { pos: new THREE.Vector3(0, 0.6, 5.5), look: new THREE.Vector3(0, 0, -4), tpos: new THREE.Vector3(0.4, 0.35, 2.4), tlook: new THREE.Vector3(-1.6, 0.05, 0.4) };
    this.CABV = { post: [[0.55, 0.35, 2.6], [-1.6, 0.05, 0.35]], hotline: [[0, 0.32, -3.6], [0, 0.1, -5.7]], map: [[0.25, 0.35, 1.2], [1.6, 0.1, 0.3]], wide: [[0, 0.75, 6.4], [0, 0, -4]] };
    this.screenT = 0;
  }
  cabView(name) { const v = this.CABV[name]; if (!v) return; this.cab.tpos.set(...v[0]); this.cab.tlook.set(...v[1]); }
  cabFrame(dt, V, ui) {
    const C = this.cab, k = 1 - Math.exp(-dt * 2.2); C.pos.lerp(C.tpos, k); C.look.lerp(C.tlook, k);
    const cam = this.ccam, sway = 0.012 + (V ? V.ladder : 2) * 0.002, t = this.time;
    cam.position.copy(C.pos).add(new THREE.Vector3(Math.sin(t * 0.7) * sway, Math.sin(t * 1.1) * sway * 0.8 + Math.sin(t * 0.23) * 0.02, 0));
    if (this.shake > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake * 0.05));
    cam.up.set(Math.sin(t * 0.31) * 0.012, 1, 0); cam.lookAt(C.look);
    // battle lights pulse when the ladder is high or an alert is up
    const alert = ui.alert ? 0.5 + 0.5 * Math.sin(t * 7) : 0; for (const l of this.cabLights) l.intensity = (2.4 + (V ? V.ladder : 2) * 0.25 + alert * 4) * (1 - (ui.cabDim || 0));
    const M = this.motes; M.begin(); for (const p of this.moteP) { p.y += dt * 0.02; p.x += Math.sin(t * 0.3 + p.z) * dt * 0.01; if (p.y > 1.3) p.y = -1.2; M.add(p, 0.012, 0, 0.5, 0, 0.7, 0.55, 0.5); } M.end();
    for (const m of this.portMats) m.color.setScalar(1.0 + this.dawn * 1.5 + this.flash * 8);
    this.screenT -= dt; if (this.screenT <= 0 && V) { this.screenT = 0.25; this.drawScreens(V, ui); }
  }
  drawScreens(V, ui) {
    const SD = ui.SIDES, me = V.me, t = this.time;
    const pre = (s) => { const x = s.x, W = s.w, H = s.h, fg = s.amber ? '#ffb347' : '#7dffb0'; x.fillStyle = s.amber ? '#140a02' : '#02120a'; x.fillRect(0, 0, W, H);
      x.fillStyle = fg; x.strokeStyle = fg; x.shadowColor = fg; x.shadowBlur = 8; x.font = '600 26px ui-monospace, Menlo, Consolas, monospace'; x.textBaseline = 'top'; return [x, W, H, fg]; };
    const post = (s) => { const x = s.x, W = s.w, H = s.h; x.shadowBlur = 0; x.fillStyle = 'rgba(0,0,0,0.28)'; for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 2);
      const g = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(0, (t * 120) % H, W, 30); s.tex.needsUpdate = true; };
    const bar = (x, X, Y, w, h, f, col) => { x.strokeRect(X, Y, w, h); x.fillStyle = col || x.strokeStyle; x.fillRect(X + 3, Y + 3, Math.max(0, (w - 6) * Math.max(0, Math.min(1, f))), h - 6); };
    let s = this.screens.sys, [x, W, H] = pre(s);
    x.fillText('POST ' + (SD ? SD[V.side].post : '') + '  ' + V.clock, 20, 16);
    x.fillText('COMMS ' + me.comms + '%  ' + me.relay + (me.satDown ? ' (SAT DOWN)' : ''), 20, 70); bar(x, 20, 104, W - 40, 26, me.comms / 100);
    x.fillText('JAMMING ' + me.jam + '%', 20, 146); bar(x, 20, 180, W - 40, 26, me.jam / 100, '#ff7a6a'); x.fillStyle = '#7dffb0';
    x.fillText('FUEL ' + me.fuel + ' MIN' + (me.refuel ? '  TANKER ' + me.refuel.phase.toUpperCase() + ' ' + me.refuel.eta + 'm' : ''), 20, 222); bar(x, 20, 256, W - 40, 26, me.fuel / 240, me.fuel < 40 ? '#ff7a6a' : null); x.fillStyle = '#7dffb0';
    x.fillText('ALT ' + me.alt.toUpperCase() + '   ESCORT ' + me.escort + '   LEGIT ' + me.legit, 20, 298); x.fillText('SUCCESSION: ' + String(me.succession).toUpperCase(), 20, 336); post(s);
    s = this.screens.wings; [x, W, H] = pre(s); x.fillText('WINGS', 20, 16); x.font = '600 24px ui-monospace, Menlo, monospace';
    me.wings.forEach((w, i) => { const y = 60 + i * 52; x.fillStyle = STATES_COL[w.state] || '#7dffb0'; x.fillText(w.name.padEnd(8) + w.state.toUpperCase().padEnd(10) + (w.radio !== 'ok' ? 'NO RADIO' : 'FUEL ' + w.fuel), 20, y); x.strokeStyle = x.fillStyle; bar(x, 20, y + 28, W - 40, 14, w.prog, x.fillStyle); x.fillStyle = '#ffd36b'; x.fillRect(20 + (W - 40) * 0.5 - 1, y + 24, 3, 22); });
    x.fillStyle = '#7dffb0'; x.fillText('SUBS ' + me.subs.map(b => b.name + ':' + b.order.toUpperCase()).join('  '), 20, 330); post(s);
    s = this.screens.auth; [x, W, H] = pre(s); x.fillText('AUTHENTICATOR  ' + me.cardHour, 20, 16); x.font = '700 44px ui-monospace, Menlo, monospace'; x.fillText(me.card || '----', 20, 64);
    x.font = '600 24px ui-monospace, Menlo, monospace'; const it = me.inbox.find(i => i.kind === 'auth');
    if (it) { x.fillStyle = (t * 2 | 0) % 2 ? '#ff7a6a' : '#7dffb0'; x.fillText('INCOMING: ' + (it.title || '').toUpperCase().slice(0, 30), 20, 140); x.fillStyle = '#7dffb0'; x.font = '700 40px ui-monospace, Menlo, monospace'; x.fillText('CODE ' + (it.code || '????'), 20, 182); }
    else { x.fillText('NO TRAFFIC PENDING', 20, 150); }
    x.font = '600 22px ui-monospace, Menlo, monospace'; x.fillText('INBOX ' + me.inbox.length, 20, 330); post(s);
    s = this.screens.ladder; [x, W, H] = pre(s); x.fillText('ESCALATION  ' + V.clock, 20, 16);
    const LAD = ui.LADDER || []; for (let i = 0; i < 8; i++) { const y = 330 - i * 36, on = i === V.ladder; x.fillStyle = on ? (i >= 5 ? '#ff5a4a' : i >= 3 ? '#ffd36b' : '#7dffb0') : 'rgba(125,255,176,0.35)'; x.fillRect(20, y, on ? 70 : 40, 26); x.font = (on ? '700 ' : '500 ') + '22px ui-monospace, Menlo, monospace'; x.fillText(String(LAD[i] || i), 110, y); }
    post(s);
    s = this.screens.map; [x, W, H] = pre(s); x.fillText('TRACKS', 20, 16); x.font = '600 22px ui-monospace, Menlo, monospace';
    V.them.wings.slice(0, 5).forEach((w, i) => { x.fillStyle = w.state === 'inbound' ? '#ff7a6a' : '#7dffb0'; x.fillText('TRACK ' + (w.i + 1) + '  ' + w.state.toUpperCase(), 20, 60 + i * 34); });
    x.fillStyle = '#ffb070'; (V.them.ghosts || []).slice(0, 2).forEach((g, i) => x.fillText('? RETURN ' + (i + 1) + ' UNCONFIRMED', 20, 240 + i * 34));
    x.strokeStyle = 'rgba(125,255,176,0.5)'; x.beginPath(); x.arc(W - 110, H / 2 + 20, 80, 0, 7); x.stroke(); const a = t * 2; x.beginPath(); x.moveTo(W - 110, H / 2 + 20); x.lineTo(W - 110 + Math.cos(a) * 80, H / 2 + 20 + Math.sin(a) * 80); x.stroke(); post(s);
    s = this.screens.hl; [x, W, H] = pre(s); x.font = '600 22px ui-monospace, Menlo, monospace'; x.fillText('DIRECT LINE · ENCRYPTED TELETYPE', 20, 14);
    const lines = []; for (const h of V.hl.slice(-8)) { const who = h.from === V.side ? 'US ' : 'THEM'; const words = (who + ': ' + h.text).toUpperCase(); for (let i = 0; i < words.length; i += 46) lines.push(words.slice(i, i + 46)); }
    lines.slice(-12).forEach((l, i) => x.fillText(l, 20, 50 + i * 30)); if ((t * 2 | 0) % 2) x.fillRect(20, 50 + Math.min(12, lines.length) * 30, 14, 24); post(s);
  }
  /* ---------------- SKY: aircraft, cloud deck, terrain, detonations ---------------- */
  buildSky() {
    const sc = this.sky = new THREE.Scene();
    const SU = this.SU = { moonDir: { value: new THREE.Vector3(-0.45, 0.42, -0.6).normalize() }, sunDir: { value: new THREE.Vector3(1, -0.1, -0.3).normalize() }, camPos: { value: this.scam.position }, dawn: { value: 0 }, time: { value: 0 }, flash: { value: 0 },
      nukes: { value: [new THREE.Vector4(), new THREE.Vector4()] }, nukeA: { value: [0, 0] }, shock: { value: [new THREE.Vector4(), new THREE.Vector4()] }, cover: { value: 0.55 } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(80000, 48, 24), new THREE.ShaderMaterial({ uniforms: SU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false })); this.dome.renderOrder = -10; sc.add(this.dome);
    this.cloudL = []; for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(70000, 70000), new THREE.ShaderMaterial({ uniforms: Object.assign({ layer: { value: i } }, SU), vertexShader: CLOUD_VS, fragmentShader: CLOUDL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor })); m.rotation.x = -Math.PI / 2; m.position.y = 2500 + i * 260; m.renderOrder = 1; sc.add(m); this.cloudL.push(m); }
    const N = PHONE ? 72 : 120; this.terrN = N; const tg = new THREE.PlaneGeometry(26000, 26000, N, N); tg.rotateX(-Math.PI / 2); this.terr = new THREE.Mesh(tg, new THREE.ShaderMaterial({ uniforms: SU, vertexShader: TERR_VS, fragmentShader: TERR_FS })); this.terr.frustumCulled = false; sc.add(this.terr); this.terrC = null; this.terrBase = tg.attributes.position.array.slice();
    sc.add(new THREE.HemisphereLight(0x30405a, 0x0a0a0c, 0.6)); this.moonL = new THREE.DirectionalLight(0xa0b4d8, 0.9); this.moonL.position.copy(SU.moonDir.value).multiplyScalar(100); sc.add(this.moonL);
    this.sunL = new THREE.DirectionalLight(0xffa070, 0); sc.add(this.sunL); this.fireL = new THREE.PointLight(0xffb070, 0, 0, 0); sc.add(this.fireL);
    this.planes = { post: makeAircraft('post'), b1: makeAircraft('bomber'), b2: makeAircraft('bomber'), f1: makeAircraft('bomber') }; this.planes.f1.scale.setScalar(0.45);
    for (const k in this.planes) { this.planes[k].visible = false; sc.add(this.planes[k]); }
    this.fireGeo = new THREE.SphereGeometry(1, PHONE ? 32 : 64, PHONE ? 16 : 32);
    this.nukeB = new Billboards(PHONE ? 500 : 1400, BB_SMOKE_FS, { smoke: { value: smokeTex() }, glob: { value: 1 } }); this.nukeB.obj.renderOrder = 7; sc.add(this.nukeB.obj);
    this.skyG = new Billboards(400, BB_GLOW_FS, {}, 'add'); this.skyG.obj.renderOrder = 10; sc.add(this.skyG.obj);
    this.moonShade = 0.3; this.skyCam = null;
  }
  place(name, pos, yaw = 0, pitch = 0, roll = 0) { const p = this.planes[name]; if (!p) return; if (!pos) { p.visible = false; return; } p.visible = true; p.position.copy(pos); p.rotation.set(pitch, yaw, roll, 'YXZ'); }
  hidePlanes() { for (const k in this.planes) this.planes[k].visible = false; }
  skyNuke(pos, opt = {}) { if (this.nukes.length >= 2) this.nukes.shift().dispose(); const d = new Detonation(this, pos, Object.assign({ lite: PHONE || this.tier <= 1 }, opt)); this.nukes.push(d); return d; }
  updateTerrain() {
    const cp = this.scam.position, step = 26000 / this.terrN, cx = Math.round(cp.x / step) * step, cz = Math.round(cp.z / step) * step;
    if (this.terrC && Math.abs(cx - this.terrC[0]) < 2600 && Math.abs(cz - this.terrC[1]) < 2600) return; this.terrC = [cx, cz];
    const g = this.terr.geometry, a = g.attributes.position.array, b = this.terrBase; for (let i = 0; i < a.length; i += 3) { const x = b[i] + cx, z = b[i + 2] + cz; a[i] = x; a[i + 2] = z; a[i + 1] = terrainH(x, z); }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
  }
  skyFrame(dt, V, ui) {
    const SU = this.SU, cam = this.scam, sc = this.skyCam;
    if (sc) { cam.position.copy(sc.pos); cam.up.set(Math.sin(sc.roll || 0), Math.cos(sc.roll || 0), 0); cam.lookAt(sc.look); if (sc.fov && sc.fov !== cam.fov) { cam.fov = sc.fov; cam.updateProjectionMatrix(); } }
    if (this.shake > 0) { cam.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake * 6)); }
    cam.updateMatrixWorld(); this.dome.position.copy(cam.position); for (const m of this.cloudL) { m.position.x = cam.position.x; m.position.z = cam.position.z; m.visible = this.tier >= 1 || m === this.cloudL[0]; }
    this.updateTerrain(); SU.time.value = this.time; SU.dawn.value = this.dawn;
    const el = -0.16 + 0.24 * this.dawn; SU.sunDir.value.set(Math.cos(el), Math.sin(el), -0.35).normalize(); this.sunL.position.copy(SU.sunDir.value).multiplyScalar(100); this.sunL.intensity = Math.max(0, this.dawn - 0.4) * 2.2; this.moonL.intensity = 0.9 * (1 - this.dawn * 0.7);
    this.moonShade = 0.22 + this.dawn * 0.6; SU.cover.value = ui.cover === undefined ? 0.55 : ui.cover;
    // detonations
    const list = [], BL = { add: (...a) => list.push(a) }, G = this.skyG; G.begin(); let fl = 0, best = null;
    this.nukes = this.nukes.filter(n => { const ok = n.update(dt, BL, G); if (!ok) n.dispose(); return ok; });
    this.nukes.forEach((n, i) => { const L = n.light; if (i < 2) { SU.nukes.value[i].set(L.pos.x, L.pos.y, L.pos.z, L.range); SU.nukeA.value[i] = L.k; const s = n.shock; SU.shock.value[i].set(s.x, s.r, s.z, s.k); } if (n.flash > fl) { fl = n.flash; best = n; } });
    for (let i = this.nukes.length; i < 2; i++) { SU.nukeA.value[i] = 0; SU.shock.value[i].w = 0; }
    if (this.nukes.length) { const n = this.nukes[this.nukes.length - 1]; this.fireL.position.copy(n.fire.position); this.fireL.intensity = Math.min(6, n.light.k * 2.5); } else this.fireL.intensity = 0;
    list.sort((a, b) => b[0].distanceToSquared(cam.position) - a[0].distanceToSquared(cam.position)); const B = this.nukeB; B.begin(); for (const a of list) B.add(...a); B.end();
    // nav lights, engine glow, decoys and missiles
    for (const k in this.planes) { const p = this.planes[k]; if (!p.visible) continue; const u = p.userData, blink = (this.time * 1.2 + k.length) % 1 < 0.08 ? 1 : 0, tmp = new THREE.Vector3();
      for (const l of u.lights) { tmp.set(l[0], l[1], l[2]).applyMatrix4(p.matrixWorld); G.add(tmp, 5 * p.scale.x, 0, 0.9, 0, l[3] * 1.3, l[4] * 1.3, l[5] * 1.3); }
      tmp.set(0, -2, 0).applyMatrix4(p.matrixWorld); if (blink) G.add(tmp, 9 * p.scale.x, 0, 1, 0, 1.6, 1.6, 1.6);
      for (const x of u.engines) { tmp.set(x, -3, Math.abs(x) * (u.sw / u.span) + 1.5).applyMatrix4(p.matrixWorld); G.add(tmp, 6 * p.scale.x, 0, 0.6, 0, 2.5, 1.1, 0.5); } }
    for (const f of ui.skyFx || []) G.add(f.p, f.s, 0, f.a, 0, f.c[0], f.c[1], f.c[2]);
    G.end(); SU.flash.value = fl * 0.6;
    // exposure blowout + lens flare from the brightest source on screen
    this.flash = Math.max(this.flash * Math.exp(-dt * 3), fl); this.cine.flareK = 0;
    if (best) { const v = best.fire.position.clone().project(cam); if (v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3) { this.cine.flarePos = [(v.x + 1) / 2, (v.y + 1) / 2]; this.cine.flareK = Math.min(1.2, fl * 1.5 + 0.12 * Math.exp(-best.t / 10)); } }
  }
  /* ---------------- frame ---------------- */
  frame(dt, V, ui = {}) {
    if (!this.ready) return; this.time += dt; if (!this._sized) this.resize();
    this.shake = Math.max(0, this.shake - dt * 1.4); this.flash = Math.max(0, this.flash - dt * 1.5);
    this.mode = ui.mode || this.mode; this.sunLon = ui.sunLon === undefined ? this.sunLon : ui.sunLon; if (ui.dawn !== undefined) this.dawn = ui.dawn;
    let scene, cam;
    if (this.mode === 'globe') { this.globeFrame(dt, V, ui); scene = this.gscene; cam = this.gcam; }
    else if (this.mode === 'sky') { this.skyFrame(dt, V, ui); scene = this.sky; cam = this.scam; }
    else { this.cabFrame(dt, V, ui); scene = this.cscene; cam = this.ccam; }
    if (this.mode !== 'sky') this.cine.flareK = 0;
    this.scene = scene; this.cam = cam;
    if (ui.shiftX || ui.shiftY) { const W = innerWidth, H = innerHeight; cam.setViewOffset(W, H, W * (ui.shiftX || 0), H * (ui.shiftY || 0), W, H); cam._vo = 1; } else if (cam._vo) { cam.clearViewOffset(); cam._vo = 0; }
    const C = this.cpass.uniforms, ci = this.cine; C.time.value = this.time; C.grain.value = ci.grain; C.vign.value = 0.3 + ci.letter * 0.25; C.dof.value = this.tier >= 2 ? ci.dof : 0; C.focusY.value = ci.focusY;
    C.blow.value = Math.min(1, this.flash * (this.mode === 'sky' ? 1.1 : 0.6) + (ui.whiteout || 0)); C.flare.value.set(ci.flarePos ? ci.flarePos[0] : 0.5, ci.flarePos ? ci.flarePos[1] : 0.5, ci.flareK);
    this.r.toneMappingExposure = 1 + this.flash * 2.5;
    this.rpass.scene = scene; this.rpass.camera = cam; this.bloom.enabled = this.tier >= 2;
    if (this.tier >= 2) this.composer.render(); else this.r.render(scene, cam);
    if (this.time - this.lastCheck > (this.selfChecks < 3 ? 1.5 : 8) && this.time > 1.2) { this.lastCheck = this.time; this.selfCheck(); }
    const x = this.lx; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.lab.width, this.lab.height); x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.mode === 'globe' && !ui.noLabels) this.globeLabels(V, ui); if (ui.labelFn) ui.labelFn(x, this);
    this.adapt(dt);
  }
  /** pixel readback right after rendering: exact-black patches mean a broken target/format; step quality down */
  selfCheck() {
    const gl = this.r.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = new Uint8Array(4); let n = 0, black = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) { const X = Math.round((i + 0.5) / 6 * W), Y = Math.round((0.2 + 0.6 * (j + 0.5) / 5) * H); gl.readPixels(X, Y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); n++; if (px[0] + px[1] + px[2] < 3) black++; }
    this.selfChecks++; this.lastSelf = { n, black, tier: this.tier, mode: this.mode };
    if (black >= Math.max(3, n * 0.15) && this.tier >= 2) { this.blackHoles++; console.warn('[by-dawns-early-light] black regions at quality tier ' + this.tier + ' (' + this.mode + '); stepping down'); this.maxTier = Math.max(1, this.tier - 1); this.setTier(Math.min(this.tier - 1, this.maxTier)); }
  }
  adapt(dt) {
    if (this.lockTier) return; this.ft.push(dt); if (this.ft.length < 90 && this.ft.reduce((a, b) => a + b, 0) < 2.5) return;
    const avg = this.ft.reduce((a, b) => a + b, 0) / this.ft.length; this.ft = []; if (document.hidden) return;
    if (avg > 1 / 38 && this.tier > 0) { this.setTier(this.tier - 1); this.goodRuns = 0; }
    else if (avg < 1 / 70 && this.tier < this.maxTier) { this.goodRuns = (this.goodRuns || 0) + 1; if (this.goodRuns > 3) { this.setTier(this.tier + 1); this.goodRuns = 0; } }
  }
}
export { Detonation };
