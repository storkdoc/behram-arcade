// Jax's Adventures - 3D renderer (three.js r169): terrain, water, sky, foliage, characters, effects, post
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import * as W from './world.js';
import * as T from './textures.js';
import * as S from './sim.js';
import { buildProps, animateProps, MAT, BULBS, MAT_SIGNS, makeCanoe, makeBike, makeFish, paint } from './props.js';
import { buildPerson, makeHat, makeRod, makePaddle } from './chars.js';
import { NPCS, FISH_BY_ID, ITEMS } from './data.js';
import { clamp, lerp, smooth, mulberry32, angLerp, wrapAng, dist } from './util.js';

const PI = Math.PI;
const WORLD = 232;               // terrain half extent (m)
const HSTEP = 1.5;               // height grid spacing
const MSTEP = 3;                 // splat/mask grid spacing
export const Q = { level: 3 };

// ------------------------------------------------------------------ data grids (built progressively)
export async function buildData(progress = () => { }) {
  const n = Math.round(WORLD * 2 / HSTEP) + 1; const h = new Float32Array(n * n);
  const tick = () => new Promise(r => setTimeout(r, 0));
  for (let j = 0; j < n; j++) { const z = -WORLD + j * HSTEP; for (let i = 0; i < n; i++) h[j * n + i] = W.H(-WORLD + i * HSTEP, z); if (j % 24 === 0) { progress(0.05 + 0.45 * j / n); await tick(); } }
  const m = Math.round(WORLD * 2 / MSTEP) + 1; const splat = new Uint8Array(m * m * 4), mask = new Uint8Array(m * m * 4);
  const solid = W.COLS.filter(c => c.k === 'b' && c.h >= 1.5);
  for (let j = 0; j < m; j++) { const z = -WORLD + j * MSTEP; for (let i = 0; i < m; i++) { const x = -WORLD + i * MSTEP; const o = (j * m + i) * 4;
      const s = W.splatAt(x, z); splat[o] = s[0] * 255; splat[o + 1] = s[1] * 255; splat[o + 2] = s[2] * 255; splat[o + 3] = s[3] * 255;
      const hh = h[Math.round((z + WORLD) / HSTEP) * n + Math.round((x + WORLD) / HSTEP)];
      let g = 1 - Math.max(s[0] * 1.15, s[1] * 1.3, s[2] * 1.2, s[3] * 1.5); if (hh < 0.15) g = 0; if (W.deckAt(x, z)) g = 0;
      for (const c of solid) { const dx = x - c.x, dz = z - c.z; const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c; if (Math.abs(lx) < c.hw + 0.5 && Math.abs(lz) < c.hd + 0.5) { g = 0; break; } }
      mask[o] = clamp(g, 0, 1) * 255;
      if (hh < 0.4) { const ri = W.riverInfo(x, z); if (ri && ri.sd > -3) { const tx = ri.p.tx, tz = ri.p.tz; const l = Math.hypot(tx, tz) || 1; mask[o + 1] = 255 * clamp(ri.sd / 3 + 0.3, 0, 1); mask[o + 2] = (tx / l * 0.5 + 0.5) * 255; mask[o + 3] = (tz / l * 0.5 + 0.5) * 255; } else { mask[o + 2] = mask[o + 3] = 128; } }
      else { mask[o + 2] = mask[o + 3] = 128; }
    } if (j % 10 === 0) { progress(0.5 + 0.45 * j / m); await tick(); } }
  progress(1);
  return { n, h, m, splat, mask };
}

// ------------------------------------------------------------------ shader snippets
const NOISE_GLSL = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f); return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm5(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }
`;

function dataTex(arr, w, h, fmt, type, lin = true) { const t = new THREE.DataTexture(arr, w, h, fmt, type); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = t.minFilter = lin ? THREE.LinearFilter : THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; }

// ------------------------------------------------------------------ terrain
function buildTerrain(D, U) {
  const n = D.n, h = D.h; const pos = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; pos[k * 3] = -WORLD + i * HSTEP; pos[k * 3 + 1] = h[k]; pos[k * 3 + 2] = -WORLD + j * HSTEP;
    const hl = h[j * n + Math.max(0, i - 1)], hr = h[j * n + Math.min(n - 1, i + 1)], hd = h[Math.max(0, j - 1) * n + i], hu = h[Math.min(n - 1, j + 1) * n + i];
    const nx = hl - hr, nz = hd - hu, ny = 2 * HSTEP; const l = Math.hypot(nx, ny, nz); nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l; }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let o = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; if ((i + j) % 2) { idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; } else { idx[o++] = a; idx[o++] = c; idx[o++] = d; idx[o++] = a; idx[o++] = d; idx[o++] = b; } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uGrass: { value: T.grassTex() }, uDirt: { value: T.dirtTex() }, uSand: { value: T.sandTex() }, uRock: { value: T.rockTex() }, uSnow: { value: T.snowTex() }, uSplat: U.splat, uWorld: U.world });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uGrass, uDirt, uSand, uRock, uSnow, uSplat; uniform vec2 uWorld;\n' + NOISE_GLSL)
      .replace('#include <map_fragment>', `
        vec2 suv = (vWP.xz - uWorld.x) / uWorld.y; vec4 sp = texture2D(uSplat, suv);
        float nz = vnoise(vWP.xz * 0.35) * 0.5 + vnoise(vWP.xz * 1.1) * 0.25;
        sp.r = clamp(sp.r + (nz - 0.37) * 0.5 * sp.r, 0.0, 1.0); sp.g = clamp(sp.g + (nz - 0.37) * 0.4, 0.0, 1.0) * step(0.02, sp.g);
        vec2 tuv = vWP.xz * 0.23; float macro = vnoise(vWP.xz * 0.02) * 0.6 + vnoise(vWP.xz * 0.07) * 0.4;
        vec3 cg = texture2D(uGrass, tuv).rgb; cg = mix(cg, texture2D(uGrass, vec2(tuv.y, -tuv.x) * 0.41 + 0.3).rgb, 0.4);
        cg *= mix(vec3(0.82, 0.9, 0.7), vec3(1.12, 1.06, 0.92), macro);
        vec3 cd = texture2D(uDirt, tuv * 0.8).rgb * mix(0.85, 1.1, macro); vec3 cs = texture2D(uSand, tuv * 0.7).rgb;
        vec3 wn = normalize(vWN); vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 cr = texture2D(uRock, vWP.zy * 0.12).rgb * bw.x + texture2D(uRock, vWP.xz * 0.12).rgb * bw.y + texture2D(uRock, vWP.xy * 0.12).rgb * bw.z;
        vec3 cn = texture2D(uSnow, tuv * 0.5).rgb;
        vec3 tcol = cg; tcol = mix(tcol, cd, smoothstep(0.25, 0.75, sp.r)); tcol = mix(tcol, cs, smoothstep(0.3, 0.7, sp.g)); tcol = mix(tcol, cr, smoothstep(0.3, 0.7, sp.b)); tcol = mix(tcol, cn, smoothstep(0.35, 0.65, sp.a));
        float wet = (1.0 - smoothstep(0.05, 0.55, vWP.y)) * (1.0 - sp.a);
        tcol *= mix(1.0, 0.6, wet);
        float uw = smoothstep(0.0, -2.0, vWP.y); tcol = mix(tcol, tcol * vec3(0.32, 0.5, 0.48), uw);
        diffuseColor.rgb *= tcol;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(1.0, 0.35, wet) * mix(1.0, 0.75, sp.a);');
  };
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; return m;
}

// ------------------------------------------------------------------ sky dome
function buildSky(U) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: U.sunDir, uMoon: U.moonDir, uZen: U.zen, uHor: U.hor, uSunCol: U.sunCol, uSunVis: U.sunVis, uNight: U.night, uCloud: U.cloud, uTime: U.time, uWind: U.wind },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uMoon, uZen, uHor, uSunCol; uniform float uSunVis, uNight, uCloud, uTime, uWind; varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uHor * 0.75, clamp(-h * 4.0, 0.0, 1.0));
        float sd = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.35) * uSunVis;
        col += uSunCol * smoothstep(0.99955, 0.99975, sd) * 14.0 * uSunVis;
        // stars
        if (uNight > 0.01 && h > 0.0) { vec3 p = d * 260.0; vec3 ip = floor(p); float r = hash13(ip); vec3 c = fract(p) - 0.5; float st = step(0.996, r) * smoothstep(0.32, 0.0, length(c)) * (0.6 + 0.4 * sin(uTime * 2.0 + r * 80.0));
          col += vec3(0.9, 0.95, 1.0) * st * uNight * 1.6 * smoothstep(0.0, 0.25, h) * (1.0 - uCloud * 0.8);
          float mw = fbm5(d.xz / (h + 0.3) * 3.0 + 4.0); col += vec3(0.12, 0.13, 0.2) * smoothstep(0.55, 0.85, mw) * uNight * 0.25 * smoothstep(0.0, 0.4, h); }
        // moon
        float md = dot(d, uMoon); col += vec3(0.95, 0.95, 0.85) * smoothstep(0.99935, 0.99955, md) * 2.4 * uNight + vec3(0.25, 0.3, 0.45) * pow(max(md, 0.0), 60.0) * 0.4 * uNight;
        // clouds
        if (h > 0.0) { vec2 cp = d.xz / (h + 0.12) * 1.15 + vec2(uTime * 0.006 * (0.5 + uWind), uTime * 0.002);
          float n = fbm5(cp * 1.4); float n2 = fbm5(cp * 1.4 + vec2(0.06, 0.04) + uSun.xz * 0.05);
          float cov = smoothstep(0.62 - uCloud * 0.42, 0.85 - uCloud * 0.3, n) * smoothstep(0.0, 0.15, h);
          float lit = clamp(0.55 + (n - n2) * 5.0, 0.2, 1.0);
          vec3 cc = mix(uZen * 0.6 + vec3(0.06), mix(vec3(1.0), uSunCol, 0.45) * (0.5 + 0.6 * uSunVis), lit);
          cc = mix(cc, vec3(0.42, 0.45, 0.5) * (0.25 + 0.75 * uSunVis), smoothstep(0.5, 1.0, uCloud) * 0.6);
          cc = mix(cc, vec3(0.05, 0.06, 0.1), uNight * 0.85);
          col = mix(col, cc, cov * 0.95); }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10; return m;
}

// ------------------------------------------------------------------ water
function buildWater(U) {
  const nt = T.waterNormal(); nt.wrapS = nt.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: `uniform mat4 uTexMat; varying vec3 vWP; varying vec4 vRefl;
      #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; vRefl = uTexMat * wp; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uNormal, uHeight, uMask, uRefl; uniform vec2 uWorld, uWorldH; uniform float uTime, uReflOn, uRain, uNight, uWind; uniform vec3 uSunDir, uSunCol, uZen, uHor, uAmb;
      varying vec3 vWP; varying vec4 vRefl;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      vec3 nrm(vec2 uv){ return texture2D(uNormal, uv).xyz * 2.0 - 1.0; }
      void main(){
        vec2 wuv = (vWP.xz - uWorld.x) / uWorld.y; float gh = texture2D(uHeight, (vWP.xz - uWorldH.x) / uWorldH.y).r; float depth = max(0.0, -gh);
        vec4 mk = texture2D(uMask, wuv); vec2 flow = (mk.ba * 2.0 - 1.0) * mk.g;
        float ph0 = fract(uTime * 0.22), ph1 = fract(uTime * 0.22 + 0.5); float fw = abs(1.0 - 2.0 * ph0);
        vec2 buv = vWP.xz * 0.075; vec2 drift = uTime * vec2(0.011, 0.007) * (0.6 + uWind);
        vec3 nA = mix(nrm(buv - flow * ph0 * 1.4 + drift), nrm(buv - flow * ph1 * 1.4 + drift + 0.5), fw);
        vec3 nB = nrm(vWP.xz * 0.21 + uTime * vec2(-0.017, 0.026)); vec3 nC = nrm(vWP.xz * 0.6 + uTime * vec2(0.05, -0.03));
        float str = 0.15 + uRain * 0.3 + mk.g * 0.3 + uWind * 0.05;
        vec3 tn = nA + nB * 0.55 + nC * (0.15 + uRain * 0.6);
        vec3 N = normalize(vec3(tn.x * str, 1.0, tn.y * str));
        vec3 V = normalize(cameraPosition - vWP); float ndv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uHor, uZen, pow(clamp(R.y, 0.0, 1.0), 0.5));
        vec3 refl = sky;
        if (uReflOn > 0.5) { vec4 rc = vRefl; rc.xy += N.xz * 0.9 * rc.w * 0.04; vec3 rt = texture2DProj(uRefl, rc).rgb; refl = mix(sky, rt, 0.92); }
        float lightK = max(0.08, dot(uAmb, vec3(0.33)) * 1.4);
        vec3 shallow = vec3(0.09, 0.32, 0.30), deep = vec3(0.015, 0.075, 0.11);
        vec3 body = mix(shallow, deep, smoothstep(0.0, 4.5, depth)) * lightK + uSunCol * 0.04 * max(uSunDir.y, 0.0);
        vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));
        vec3 H = normalize(uSunDir + V); float spec = pow(max(dot(N, H), 0.0), 380.0) * 7.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.12;
        col += uSunCol * spec * max(uSunDir.y + 0.05, 0.0) * (1.0 - uRain * 0.7);
        // foam: shoreline lapping + river rapids
        float fn = vnoise(vWP.xz * 1.6 + uTime * 0.3) * 0.6 + vnoise(vWP.xz * 4.0 - uTime * 0.5) * 0.4;
        float shore = 1.0 - smoothstep(0.0, 0.5, depth);
        float lap = smoothstep(0.55, 0.75, fn + 0.35 * sin(depth * 18.0 - uTime * 2.2)) * shore + smoothstep(0.08, 0.0, depth) * 0.6;
        float rap = smoothstep(0.68, 0.85, fn) * smoothstep(0.35, 0.8, mk.g);
        float foam = clamp(lap + rap * 0.7, 0.0, 1.0);
        col = mix(col, vec3(0.92, 0.95, 0.95) * (lightK * 0.9 + 0.1), foam * 0.85);
        float alpha = clamp(0.2 + smoothstep(0.0, 0.7, depth) * 0.8 + fres * 0.3 + foam, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, fog: true, depthWrite: true,
  });
  Object.assign(mat.uniforms, { uNormal: { value: nt }, uHeight: U.height, uMask: U.mask, uRefl: U.refl, uWorld: U.world, uWorldH: U.worldH, uTime: U.time, uReflOn: U.reflOn, uRain: U.rain, uNight: U.night, uWind: U.wind, uSunDir: U.sunDir, uSunCol: U.sunCol, uZen: U.zen, uHor: U.hor, uAmb: U.amb, uTexMat: U.texMat });
  const g = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, 32, 32); g.rotateX(-PI / 2);
  const m = new THREE.Mesh(g, mat); m.position.y = 0; m.renderOrder = 1; m.receiveShadow = false; return m;
}

// ------------------------------------------------------------------ foliage
const WIND_HEAD = `uniform float uTime; uniform float uWind;`;
function windify(mat, U, amt = 1, leafy = true) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_HEAD)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
        #else
          vec2 ip = vec2(0.0);
        #endif
        float hk = max(position.y - 0.6, 0.0); float ph = dot(ip, vec2(0.13, 0.17));
        float sw = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * (0.25 + uWind) * ${(0.012 * amt).toFixed(4)} * hk * hk;
        transformed.x += sw; transformed.z += sw * 0.6;
        ${leafy ? `transformed += normal * sin(uTime * 6.0 + position.x * 4.0 + position.z * 3.0 + ph) * 0.02 * (0.3 + uWind) * min(hk, 1.0);` : ''}`);
  };
  return mat;
}
// merge helper: list of [geometry] -> single non-indexed geometry with position/normal/uv
function merge(list) {
  const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; for (const g of gs) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of gs) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.computeBoundingSphere(); return g;
}
// re-point normals outward from a center (soft, volumetric canopy shading)
function puffNormals(g, cx, cy, cz, k = 0.8) { const p = g.attributes.position, nr = g.attributes.normal; const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i) - cx, (p.getY(i) - cy) * 1.2, p.getZ(i) - cz).normalize(); w.set(nr.getX(i), nr.getY(i), nr.getZ(i)); w.lerp(v, k).normalize(); nr.setXYZ(i, w.x, w.y, w.z); } return g; }
function card(w, h, x, y, z, ry, tilt, uvFlip = false) { const g = new THREE.PlaneGeometry(w, h); g.translate(0, -h / 2, 0); g.rotateX(tilt); g.rotateY(ry); g.translate(x, y, z); return g; }

function pineGeo(rnd, tall) {
  const H0 = tall ? 11 : 8.5; const trunk = new THREE.CylinderGeometry(0.1, 0.32, H0 * 0.9, 9, 1, true); trunk.translate(0, H0 * 0.45, 0);
  const leaves = []; const tiers = tall ? 7 : 6;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1); const y = H0 * (0.3 + 0.72 * f); const R = (1 - f * 0.85) * (tall ? 2.6 : 2.4) + 0.35; const nC = Math.max(5, Math.round(9 - f * 4));
    for (let i = 0; i < nC; i++) { const a = (i / nC) * PI * 2 + rnd() * 0.5 + t; const L = R * (0.9 + rnd() * 0.25);
      const g = new THREE.PlaneGeometry(L * 0.85, L * 1.15); g.rotateY(PI / 2); g.translate(0, 0, 0);
      // card lies along +x outward, drooping downward
      const pg = new THREE.PlaneGeometry(L * 1.15, L * 0.8); pg.translate(L * 0.55, 0, 0); pg.rotateX(-PI / 2 + 0.25 + rnd() * 0.3); pg.rotateZ(-0.5 - f * 0.15 - rnd() * 0.15); pg.rotateY(a); pg.translate(0, y, 0);
      leaves.push(pg); }
    const cone = new THREE.ConeGeometry(R * 0.62, R * 0.9, 10, 1, true); cone.translate(0, y - R * 0.18, 0); leaves.push(cone);
  }
  const top = new THREE.ConeGeometry(0.45, 1.6, 8, 1, true); top.translate(0, H0 * 1.06, 0); leaves.push(top);
  const lg = merge(leaves); puffNormals(lg, 0, H0 * 0.55, 0, 0.55); return { trunk, leaves: lg };
}
function broadGeo(rnd) {
  const parts = [new THREE.CylinderGeometry(0.2, 0.38, 4.6, 9, 1, true).translate(0, 2.3, 0)];
  const leaves = []; const crown = [];
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + rnd(); const len = 2.0 + rnd(); const b = new THREE.CylinderGeometry(0.06, 0.14, len, 6, 1, true); b.translate(0, len / 2, 0); b.rotateZ(-0.7 - rnd() * 0.3); b.rotateY(a); b.translate(0, 3.2 + rnd() * 1.2, 0); parts.push(b);
    crown.push([Math.cos(a) * 1.9, 5.2 + rnd() * 1.4, -Math.sin(a) * 1.9]); }
  crown.push([0, 7.0, 0], [0.6, 6.2, 0.5], [-0.8, 5.0, -0.4]);
  for (const [cx, cy, cz] of crown) { const r = 1.5 + rnd() * 0.5;
    const blob = new THREE.IcosahedronGeometry(r * 0.72, 1); blob.translate(cx, cy, cz); leaves.push(blob);
    for (let k = 0; k < 4; k++) { const g = new THREE.PlaneGeometry(r * 2.3, r * 2.3); g.rotateX((rnd() - 0.5) * 1.2); g.rotateY(k * PI / 4 + rnd()); g.translate(cx + (rnd() - 0.5) * 0.5, cy + (rnd() - 0.5) * 0.5, cz + (rnd() - 0.5) * 0.5); leaves.push(g); } }
  const lg = merge(leaves); puffNormals(lg, 0, 6, 0, 0.75); return { trunk: merge(parts), leaves: lg };
}
function bushGeo(rnd) { const leaves = []; for (let i = 0; i < 4; i++) { const cx = (rnd() - 0.5) * 0.9, cz = (rnd() - 0.5) * 0.9, cy = 0.55 + rnd() * 0.25, r = 0.6 + rnd() * 0.25;
    const blob = new THREE.IcosahedronGeometry(r * 0.75, 1); blob.translate(cx, cy, cz); leaves.push(blob);
    for (let k = 0; k < 3; k++) { const g = new THREE.PlaneGeometry(r * 2.2, r * 2.2); g.rotateX((rnd() - 0.5) * 0.9); g.rotateY(k * PI / 3 + rnd()); g.translate(cx, cy, cz); leaves.push(g); } }
  const g = merge(leaves); puffNormals(g, 0, 0.4, 0, 0.8); return g; }
function rockGeo(rnd) { const g = new THREE.IcosahedronGeometry(1, 3); const p = g.attributes.position; const sx = 0.9 + rnd() * 0.5, sy = 0.5 + rnd() * 0.3, sz = 0.8 + rnd() * 0.4; const o1 = rnd() * 9, o2 = rnd() * 9;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + 0.18 * Math.sin(x * 3.1 + o1) * Math.sin(z * 2.7 + o2) + 0.08 * Math.sin(y * 7 + x * 5) + 0.05 * Math.sin(z * 11 + y * 9); x *= sx * n; y *= sy * n; z *= sz * n; if (y < -0.15) y = -0.15 + (y + 0.15) * 0.3; p.setXYZ(i, x, y, z); }
  g.computeVertexNormals(); const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5 + p.getZ(i) * 0.3, p.getY(i) * 0.5 + p.getZ(i) * 0.2);
  return g; }

function leafMat(map, U, amt, color = 0xffffff) {
  const m = windify(new THREE.MeshStandardMaterial({ map, color, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 }), U, amt, true);
  return m;
}
function leafDepth(map) { return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide }); }

function buildFoliage(scene, U) {
  const rnd = mulberry32(77); const out = { meshes: [], berries: null, berryIdx: {}, bushMeshes: [] };
  const barkP = T.barkTex(true), barkB = T.barkTex(false);
  const mBarkP = windify(new THREE.MeshStandardMaterial({ map: barkP, roughness: 0.95 }), U, 0.6, false), mBarkB = windify(new THREE.MeshStandardMaterial({ map: barkB, roughness: 0.95 }), U, 0.6, false);
  const pc = T.pineCard(), lc = T.leafCard();
  const mPine = leafMat(pc, U, 0.8, 0xd8e6d0), mBroad = leafMat(lc, U, 1.1), mBush = leafMat(lc, U, 1.3, 0xe0ecd0);
  const variants = [{ ...pineGeo(rnd, true), pine: true, mb: mBarkP, ml: mPine, map: pc }, { ...pineGeo(rnd, false), pine: true, mb: mBarkP, ml: mPine, map: pc }, { ...broadGeo(rnd), pine: false, mb: mBarkB, ml: mBroad, map: lc }, { ...broadGeo(rnd), pine: false, mb: mBarkB, ml: mBroad, map: lc }];
  const lists = variants.map(() => []);
  W.TREES.forEach((t, i) => { const v = t.pine ? (t.seed < 0.5 ? 0 : 1) : (t.seed < 0.5 ? 2 : 3); lists[v].push(t); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), col = new THREE.Color();
  variants.forEach((v, vi) => { const L = lists[vi]; if (!L.length) return;
    const tr = new THREE.InstancedMesh(v.trunk, v.mb, L.length), lf = new THREE.InstancedMesh(v.leaves, v.ml, L.length);
    L.forEach((t, k) => { e.set(0, t.rot, 0); q.setFromEuler(e); const sy = t.s * (0.9 + t.seed * 0.25); s3.set(t.s, sy, t.s); p3.set(t.x, t.y - 0.15, t.z); m4.compose(p3, q, s3); tr.setMatrixAt(k, m4); lf.setMatrixAt(k, m4);
      const hsl = t.pine ? [0.30 + t.seed * 0.06, 0.35 + t.seed * 0.2, 0.75 + t.seed * 0.35] : [0.2 + t.seed * 0.1, 0.45 + t.seed * 0.2, 0.85 + t.seed * 0.3]; col.setHSL(hsl[0], hsl[1] * 0.4, 0.5); col.multiplyScalar(hsl[2] * 1.4); lf.setColorAt(k, col); });
    for (const m of [tr, lf]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); out.meshes.push(m); }
    lf.customDepthMaterial = leafDepth(v.map); });
  // bushes (+ berries)
  const bg = [bushGeo(rnd), bushGeo(rnd)]; const bl = [[], []]; W.BUSHES.forEach((b, i) => bl[b.seed < 0.5 ? 0 : 1].push([b, i]));
  bg.forEach((g, gi) => { const L = bl[gi]; const im = new THREE.InstancedMesh(g, mBush, L.length);
    L.forEach(([b, i], k) => { e.set(0, b.seed * 20, 0); q.setFromEuler(e); s3.set(b.s * 1.1, b.s, b.s * 1.1); p3.set(b.x, b.y - 0.1, b.z); m4.compose(p3, q, s3); im.setMatrixAt(k, m4); col.setHSL(0.24 + b.seed * 0.08, 0.3, 0.42 + b.seed * 0.12); col.multiplyScalar(1.7); im.setColorAt(k, col); });
    im.castShadow = true; im.receiveShadow = true; im.customDepthMaterial = leafDepth(lc); im.computeBoundingSphere(); scene.add(im); out.meshes.push(im); out.bushMeshes.push({ im, list: L }); });
  const PER = 9; const berryG = new THREE.SphereGeometry(0.055, 8, 6); const berryM = new THREE.MeshStandardMaterial({ color: 0x9a1838, roughness: 0.3, metalness: 0 });
  const bm = new THREE.InstancedMesh(berryG, berryM, Math.max(1, W.BERRIES.length * PER)); let bi = 0;
  W.BERRIES.forEach((br) => { const b = W.BUSHES[br.bush]; out.berryIdx[br.id] = []; const r2 = mulberry32(br.id.length * 31 + bi);
    for (let k = 0; k < PER; k++) { const a = r2() * PI * 2, rr = (0.55 + r2() * 0.25) * b.s, yy = (0.35 + r2() * 0.6) * b.s; p3.set(b.x + Math.cos(a) * rr, b.y + yy, b.z + Math.sin(a) * rr); m4.compose(p3, q.identity(), s3.set(1, 1, 1)); bm.setMatrixAt(bi, m4); out.berryIdx[br.id].push([bi, m4.clone()]); bi++; } });
  bm.castShadow = false; bm.computeBoundingSphere(); scene.add(bm); out.berries = bm;
  // rocks
  const rg = [rockGeo(rnd), rockGeo(rnd), rockGeo(rnd)]; const rl = [[], [], []]; W.ROCKS.forEach((r, i) => rl[i % 3].push(r));
  const rockT = T.rockTex(); const mRock = new THREE.MeshStandardMaterial({ map: rockT, roughness: 0.9, color: 0xc8c4bc });
  mRock.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vUp;').replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUp = objectNormal.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vUp;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.75, 0.38), smoothstep(0.55, 0.9, vUp) * 0.85);'); };
  rg.forEach((g, gi) => { const L = rl[gi]; if (!L.length) return; const im = new THREE.InstancedMesh(g, mRock, L.length);
    L.forEach((r, k) => { e.set((r.seed - 0.5) * 0.3, r.rot, (r.seed - 0.5) * 0.2); q.setFromEuler(e); s3.setScalar(r.s); p3.set(r.x, r.y - r.s * 0.12, r.z); m4.compose(p3, q, s3); im.setMatrixAt(k, m4); });
    im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); out.meshes.push(im); });
  return out;
}

// ------------------------------------------------------------------ grass (GPU wrap-around instanced clumps)
const GRASS_CFG = [null, { size: 48, n: 26000 }, { size: 64, n: 52000 }, { size: 80, n: 85000 }];
function grassClump() {
  const rnd = mulberry32(5); const pos = [], uv = [], idx = []; const SEG = 3;
  for (let b = 0; b < 3; b++) { const a = rnd() * PI * 2, ox = (rnd() - 0.5) * 0.35, oz = (rnd() - 0.5) * 0.35, w = 0.032 + rnd() * 0.018, h = 0.22 + rnd() * 0.16, lean = 0.06 + rnd() * 0.1; const ca = Math.cos(a), sa = Math.sin(a); const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) { const t = s / SEG; const ww = w * (1 - t * 0.92); const y = h * t; const fwd = lean * t * t;
      for (const side of [-1, 1]) { const lx = side * ww, lz = fwd; pos.push(ox + lx * ca - lz * sa, y, oz + lx * sa + lz * ca); uv.push(side * 0.5 + 0.5, t); } }
    for (let s = 0; s < SEG; s++) { const k = base + s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
  const g = new THREE.InstancedBufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => i % 3 === 1 ? 1 : 0), 3)); g.setIndex(idx); return g;
}
function buildGrass(U) {
  const base = grassClump(); const meshes = [];
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uHeight: U.height, uMask: U.mask, uSplat: U.splat, uWorld: U.world, uWorldH: U.worldH, uTime: U.time, uWind: U.wind, uCam: U.camXZ, uSize: U.grassSize, uPlayer: U.player, uGrass: { value: T.grassTex() } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 aOff; uniform sampler2D uHeight, uMask, uSplat; uniform vec2 uWorld, uWorldH, uCam; uniform float uTime, uWind, uSize; uniform vec3 uPlayer; varying vec2 vGuv; varying float vT; varying float vShade;
      ${NOISE_GLSL}`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
        vec2 rel = fract(aOff.xy - uCam / uSize) - 0.5; vec2 wxz = uCam + rel * uSize;
        vec2 suv = (wxz - uWorld.x) / uWorld.y; float gh = texture2D(uHeight, (wxz - uWorldH.x) / uWorldH.y).r; float dens = texture2D(uMask, suv).r;
        float dfade = 1.0 - smoothstep(0.32, 0.5, length(rel));
        float n = vnoise(wxz * 0.08) ; float keep = step(aOff.z, dens * (0.75 + n * 0.5));
        float hs = keep * dfade * (0.6 + aOff.z * 0.3 + n * 0.3) * smoothstep(0.1, 0.4, dens);
        float ang = aOff.z * 37.0; float c = cos(ang), s = sin(ang);
        vec3 lp = vec3(position.x * c - position.z * s, position.y * hs, position.x * s + position.z * c);
        float t = uv.y; vT = t;
        float gust = vnoise(wxz * 0.045 + vec2(uTime * 0.35, uTime * 0.12)) * (0.4 + uWind * 1.4);
        vec2 wd = vec2(0.8, 0.45) * (gust + sin(uTime * 2.4 + wxz.x * 0.7 + wxz.y * 0.5) * 0.12) * t * t * 0.55 * hs;
        vec2 pd = wxz + lp.xz - uPlayer.xz; float pl = length(pd); vec2 push = pl < 0.9 && abs(gh - uPlayer.y) < 1.5 ? normalize(pd + 0.0001) * (0.9 - pl) * 0.9 * t : vec2(0.0);
        lp.xz += wd + push; lp.y -= (dot(wd, wd) + dot(push, push)) * 0.4;
        vec3 transformed = vec3(wxz.x + lp.x, gh + lp.y - 0.02, wxz.y + lp.z);
        vGuv = wxz * 0.23; vShade = 0.8 + n * 0.35 + aOff.z * 0.15;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uGrass; varying vec2 vGuv; varying float vT; varying float vShade;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);').replace('#include <map_fragment>', `vec3 gc = texture2D(uGrass, vGuv).rgb * vShade; gc *= mix(0.74, 1.2, vT); gc = mix(gc, gc * vec3(1.1, 1.08, 0.8), vT * vT * 0.5); diffuseColor.rgb *= gc;`);
  };
  mat.customProgramCacheKey = () => 'grass';
  function make(level) {
    const cfg = GRASS_CFG[level]; if (!cfg) return null;
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k of ['position', 'uv', 'normal']) g.setAttribute(k, base.attributes[k]);
    const off = new Float32Array(cfg.n * 3); const rnd = mulberry32(9 + level); const side = Math.ceil(Math.sqrt(cfg.n));
    for (let i = 0; i < cfg.n; i++) { off[i * 3] = ((i % side) + rnd()) / side; off[i * 3 + 1] = (Math.floor(i / side) + rnd()) / side; off[i * 3 + 2] = rnd(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.instanceCount = cfg.n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; m.userData.size = cfg.size; return m;
  }
  return { make, mat };
}

// ------------------------------------------------------------------ sky keyframes (hour -> palette)
const KF = [
  // h,  zenith,   horizon,  sunCol,   sunI, hemiSky, hemiGnd, hemiI, fog
  [0, 0x060c22, 0x142038, 0x8aa0d0, 0.0, 0x3c5288, 0x141a26, 0.62, 0x142036],
  [4.6, 0x080e26, 0x1a2440, 0x8aa0d0, 0.0, 0x3e5488, 0x141a26, 0.62, 0x16203a],
  [5.6, 0x1f2c55, 0x9a6a68, 0xff8a50, 0.6, 0x5a6a9a, 0x2a2220, 0.5, 0x6a5a66],
  [6.6, 0x3a64a8, 0xf0a878, 0xffb070, 2.2, 0x9ab4dc, 0x4a3e30, 0.85, 0xc8a890],
  [8.5, 0x3d78c8, 0xb8d4ea, 0xfff0d8, 3.2, 0xbcd8f4, 0x5a5040, 1.05, 0xb8cce0],
  [12, 0x2e6cc4, 0xb0d0ee, 0xfff6e8, 3.6, 0xc4dcf8, 0x5c5444, 1.1, 0xb4cce4],
  [16, 0x3a72c4, 0xbcd4ea, 0xfff0d8, 3.3, 0xbcd6f2, 0x5a5040, 1.05, 0xb8cce0],
  [18, 0x4a6aa8, 0xf0b888, 0xffc080, 2.6, 0xb0b8d0, 0x5a4a38, 0.9, 0xd0b498],
  [19.2, 0x2c3a78, 0xf08a5a, 0xff7a40, 1.4, 0x8a7a9a, 0x3a2a24, 0.7, 0xb07860],
  [20.3, 0x141c40, 0x5a4058, 0xb06060, 0.2, 0x3a4470, 0x14121a, 0.45, 0x382c40],
  [21.5, 0x070d24, 0x162038, 0x8aa0d0, 0.0, 0x3c5288, 0x141a26, 0.6, 0x142036],
  [24, 0x060c22, 0x142038, 0x8aa0d0, 0.0, 0x3c5288, 0x141a26, 0.62, 0x142036],
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function kfAt(h) { let i = 0; while (i < KF.length - 2 && KF[i + 1][0] <= h) i++; const a = KF[i], b = KF[i + 1]; const t = clamp((h - a[0]) / (b[0] - a[0]), 0, 1); const s = t * t * (3 - 2 * t);
  const col = k => new THREE.Color().lerpColors(_ca.setHex(a[k]), _cb.setHex(b[k]), s); return { zen: col(1), hor: col(2), sun: col(3), sunI: lerp(a[4], b[4], s), hs: col(5), hg: col(6), hi: lerp(a[7], b[7], s), fog: col(8) }; }

// ------------------------------------------------------------------ particles
class Particles {
  constructor(scene, N = 900) {
    this.N = N; this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.c = new Float32Array(N * 4); this.s = new Float32Array(N); this.life = new Float32Array(N); this.max = new Float32Array(N); this.kind = new Uint8Array(N); this.i = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aCol', new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 }, uMap: { value: T.radialTex([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 64) } },
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec4 vC; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true, depthWrite: false });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; scene.add(this.pts); this.g = g;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, gg, b, a, kind = 0) { const i = this.i = (this.i + 1) % this.N; this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.life[i] = life; this.max[i] = life; this.s[i] = size; this.c.set([r, gg, b, a], i * 4); this.kind[i] = kind; this.base = this.base || new Float32Array(this.N * 2); this.base[i * 2] = size; this.base[i * 2 + 1] = a; }
  update(dt) {
    for (let i = 0; i < this.N; i++) { if (this.life[i] <= 0) { if (this.c[i * 4 + 3] !== 0) this.c[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt; const k = this.kind[i]; const f = clamp(this.life[i] / this.max[i], 0, 1);
      const o = i * 3; const grav = k === 0 ? -9 : k === 1 ? -1.5 : k === 2 ? 0.6 : k === 3 ? 0.25 : 0; this.v[o + 1] += grav * dt; const dr = k === 2 || k === 3 ? Math.exp(-dt * 0.6) : 1; this.v[o] *= dr; this.v[o + 2] *= dr;
      this.p[o] += this.v[o] * dt; this.p[o + 1] += this.v[o + 1] * dt; this.p[o + 2] += this.v[o + 2] * dt;
      if (k === 0 && this.p[o + 1] < 0 && this.v[o + 1] < 0) this.life[i] = 0;
      const bs = this.base[i * 2], ba = this.base[i * 2 + 1];
      if (k === 3) { this.s[i] = bs * (1 + (1 - f) * 2.5); this.c[i * 4 + 3] = ba * Math.min(1, (1 - f) * 5) * f; } else if (k === 2) { this.c[i * 4 + 3] = ba * f * (0.6 + 0.4 * Math.sin(this.life[i] * 30 + i)); } else this.c[i * 4 + 3] = ba * Math.min(1, f * 2.5);
      if (this.life[i] <= 0) this.c[i * 4 + 3] = 0; }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.aCol.needsUpdate = true; this.g.attributes.aSize.needsUpdate = true;
  }
}

// ring ripples (on water) and footprint decals (on ground)
class Decals {
  constructor(scene) {
    this.rip = []; const rm = new THREE.MeshBasicMaterial({ map: T.radialTex([[0, 'rgba(255,255,255,0)'], [0.72, 'rgba(255,255,255,0)'], [0.86, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']], 128), transparent: true, depthWrite: false, fog: true });
    for (let i = 0; i < 24; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), rm.clone()); m.rotation.x = -PI / 2; m.visible = false; m.renderOrder = 3; scene.add(m); this.rip.push({ m, t: 0, dur: 1, s: 1 }); } this.ri = 0;
    this.fp = []; const fm = new THREE.MeshBasicMaterial({ map: T.footTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
    for (let i = 0; i < 48; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.24), fm.clone()); m.visible = false; m.renderOrder = 2; scene.add(m); this.fp.push({ m, t: 0 }); } this.fi = 0;
  }
  ripple(x, z, s = 1, dur = 1.6) { const r = this.rip[this.ri = (this.ri + 1) % this.rip.length]; r.m.position.set(x, 0.03, z); r.t = 0; r.dur = dur; r.s = s; r.m.visible = true; }
  foot(x, z, rot, side, surf) { if (!(surf === 'dirt' || surf === 'sand' || surf === 'snow' || surf === 'mud')) return; const f = this.fp[this.fi = (this.fi + 1) % this.fp.length]; const ox = -Math.sin(rot) * 0.09 * side, oz = Math.cos(rot) * 0.09 * side;
    const x2 = x + ox, z2 = z + oz; f.m.position.set(x2, W.ground(x2, z2) + 0.02, z2); f.m.rotation.set(-PI / 2, 0, -rot - PI / 2); f.m.material.opacity = surf === 'snow' ? 0.5 : 0.35; f.t = 0; f.m.visible = true; }
  update(dt) {
    for (const r of this.rip) { if (!r.m.visible) continue; r.t += dt; const k = r.t / r.dur; if (k >= 1) { r.m.visible = false; continue; } const s = r.s * (0.3 + k * 2.6); r.m.scale.set(s, s, 1); r.m.material.opacity = (1 - k) * 0.8; }
    for (const f of this.fp) { if (!f.m.visible) continue; f.t += dt; if (f.t > 25) f.m.visible = false; else if (f.t > 18) f.m.material.opacity = 0.35 * (25 - f.t) / 7; }
  }
}

// rain streaks around the camera (GPU wrapped)
class Rain {
  constructor(scene, N = 2600) { const base = new Float32Array(N * 6), tip = new Float32Array(N * 2); const r = mulberry32(3);
    for (let i = 0; i < N; i++) { const x = r() * 40, y = r() * 24, z = r() * 40; base.set([x, y, z, x, y, z], i * 6); tip[i * 2] = 0; tip[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1)); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uA: { value: 0 }, uWind: { value: 0 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float aTip; uniform vec3 uCam; uniform float uT, uWind; varying float vA; void main(){ vec3 p = position; p.y = mod(p.y - uT * 17.0, 24.0) - 12.0 + uCam.y; p.xz = mod(p.xz - uCam.xz, 40.0) - 20.0 + uCam.xz;
        p += vec3(uWind * 0.12, 0.55, 0.05) * aTip; vA = 0.25 + 0.75 * aTip; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uA; varying float vA; void main(){ gl_FragColor = vec4(0.72, 0.78, 0.86, uA * vA); }` });
    this.m = new THREE.LineSegments(g, this.mat); this.m.frustumCulled = false; this.m.renderOrder = 6; scene.add(this.m); this.t = 0; }
  update(dt, cam, amt, wind) { this.m.visible = amt > 0.03; if (!this.m.visible) return; this.t += dt; const u = this.mat.uniforms; u.uCam.value.copy(cam); u.uT.value = this.t; u.uA.value = amt * 0.42; u.uWind.value = wind; }
}

// vision cone fan on the ground (radial grid draped on terrain)
class Cone {
  constructor(scene, seg = 18, rings = 7) { this.seg = seg; this.rings = rings; const n = (seg + 1) * rings + 1; this.pos = new Float32Array(n * 3); const e = new Float32Array(n);
    for (let r = 1; r <= rings; r++) for (let i = 0; i <= seg; i++) e[1 + (r - 1) * (seg + 1) + i] = r / rings;
    const idx = []; for (let i = 0; i < seg; i++) idx.push(0, 1 + i + 1, 1 + i);
    for (let r = 1; r < rings; r++) for (let i = 0; i < seg; i++) { const a = 1 + (r - 1) * (seg + 1) + i, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aEdge', new THREE.BufferAttribute(e, 1)); g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(1, 0.9, 0.4) }, uA: { value: 0.3 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute float aEdge; varying float vE; void main(){ vE = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uA, uT; varying float vE; void main(){ float a = uA * (0.25 + 0.75 * vE) * (1.0 - smoothstep(0.86, 1.0, vE)); a *= 0.8 + 0.2 * sin(vE * 26.0 - uT * 5.0); gl_FragColor = vec4(uCol, a); }` });
    this.m = new THREE.Mesh(g, this.mat); this.m.frustumCulled = false; this.m.renderOrder = 4; scene.add(this.m); this.g = g; }
  set(x, z, rot, range, half, aware, t, alert) {
    const P = this.pos, S = this.seg; P[0] = x; P[1] = Math.max(W.ground(x, z), 0.02) + 0.15; P[2] = z;
    for (let i = 0; i <= S; i++) { const a = rot - half + 2 * half * i / S; const ca = Math.cos(a), sa = Math.sin(a); let lim = range;
      for (let k = 1; k <= 6; k++) { const d = range * k / 6; if (W.losBlocked(x, z, x + ca * d, z + sa * d)) { lim = range * (k - 0.5) / 6; break; } }
      for (let r = 1; r <= this.rings; r++) { const d = lim * r / this.rings; const ex = x + ca * d, ez = z + sa * d; const o = (1 + (r - 1) * (S + 1) + i) * 3; P[o] = ex; P[o + 2] = ez; P[o + 1] = Math.max(W.ground(ex, ez), 0.02) + 0.15; } }
    this.g.attributes.position.needsUpdate = true;
    const c = this.mat.uniforms.uCol.value; if (alert === '!') c.setRGB(1, 0.18, 0.12); else c.setRGB(1, lerp(0.92, 0.45, aware), lerp(0.45, 0.1, aware)); this.mat.uniforms.uA.value = 0.14 + aware * 0.3; this.mat.uniforms.uT.value = t; this.m.visible = true; }
}

// ------------------------------------------------------------------ the renderer
const JAX_DEF = { name: 'Jax', skin: 0xe2ae88, hair: 0x231912, kid: true };
const DISGUISE_HAT = { capshades: ['cap', 0x2a6a3a], tourist: ['sun', 0xf0e0b0], jrvest: ['ranger', 0x8a7348] };
const nightMulR = () => { const sh = S.sunHeight(); return sh > 0.05 ? 1 : lerp(0.62, 1, clamp((sh + 0.25) / 0.3, 0, 1)); };

export class Renderer3D {
  constructor(canvas, opt = {}) {
    this.canvas = canvas; this.mobile = !!opt.mobile; this.ok = false;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.localClippingEnabled = false;
    T.setAniso(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(55, 1, 0.1, 1200);
    this.fog = new THREE.FogExp2(0xb8cce0, 0.0045); this.scene.fog = this.fog;
    this.view = { yaw: -PI * 0.2, pitch: 0.38, dist: 7.2, tYaw: null, idle: 0, tx: 0, ty: 0, tz: 0, init: false };
    this.q = this.mobile ? 2 : 3; Q.level = this.q; this.fps = { acc: 0, n: 0, low: 0, t: 0, val: 60 };
    this.time = 0; this.lastEvT = 0;
  }
  async init(progress = () => { }) {
    const U = this.U = {
      time: { value: 0 }, wind: { value: 0.4 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) }, zen: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
      sunVis: { value: 1 }, night: { value: 0 }, cloud: { value: 0.25 }, rain: { value: 0 }, amb: { value: new THREE.Color(1, 1, 1) }, height: { value: null }, mask: { value: null }, splat: { value: null },
      world: { value: new THREE.Vector2(-WORLD - MSTEP / 2, WORLD * 2 + MSTEP) }, worldH: { value: new THREE.Vector2(-WORLD - HSTEP / 2, WORLD * 2 + HSTEP) },
      refl: { value: null }, reflOn: { value: 0 }, texMat: { value: new THREE.Matrix4() }, camXZ: { value: new THREE.Vector2() }, grassSize: { value: 80 }, player: { value: new THREE.Vector3() },
    };
    const D = await buildData(k => progress(k * 0.6)); this.D = D;
    const hh = new Uint16Array(D.n * D.n); for (let i = 0; i < hh.length; i++) hh[i] = THREE.DataUtils.toHalfFloat(D.h[i]);
    U.height.value = dataTex(hh, D.n, D.n, THREE.RedFormat, THREE.HalfFloatType); U.mask.value = dataTex(D.mask, D.m, D.m, THREE.RGBAFormat, THREE.UnsignedByteType); U.splat.value = dataTex(D.splat, D.m, D.m, THREE.RGBAFormat, THREE.UnsignedByteType);
    const tick = () => new Promise(r => setTimeout(r, 0));
    const sc = this.scene;
    this.terrain = buildTerrain(D, U); sc.add(this.terrain); progress(0.64); await tick();
    this.sky = buildSky(U); sc.add(this.sky);
    this.water = buildWater(U); sc.add(this.water); progress(0.68); await tick();
    this.fol = buildFoliage(sc, U); progress(0.78); await tick();
    this.G = buildGrass(U); this.setGrass(this.q); progress(0.82); await tick();
    this.P = buildProps(sc); progress(0.9); await tick();
    // lights
    this.hemi = new THREE.HemisphereLight(0xbcd8f4, 0x5a5040, 1); sc.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; const sc2 = sun.shadow.camera; sc2.left = -36; sc2.right = 36; sc2.top = 36; sc2.bottom = -36; sc2.near = 1; sc2.far = 260; sc.add(sun); sc.add(sun.target);
    this.setShadowRes(this.q >= 3 ? 4096 : this.q >= 2 ? 2048 : 1024);
    // characters
    this.jax = buildPerson(JAX_DEF, { jax: true }); sc.add(this.jax.root); this.rods = {}; this.paddle = makePaddle();
    this.npcs = {}; for (const n of S.G.npcs) { const rg = buildPerson(n.def, {}); sc.add(rg.root); this.npcs[n.id] = rg;
      if (n.kind === 'ranger') { const sl = new THREE.SpotLight(0xfff2d0, 0, 22, 0.42, 0.5, 1.2); sl.position.set(0.12, 1.2, 0.3); const tg = new THREE.Object3D(); tg.position.set(0, -0.2, 8); rg.root.add(sl); rg.root.add(tg); sl.target = tg; rg.flash = sl;
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0c0, emissiveIntensity: 0 })); fl.rotation.x = PI / 2; fl.position.set(0, -0.05, 0.08); rg.setExtra('torch', fl, 'handR'); rg.torch = fl; } }
    this.bike = makeBike(0x2a8fd8); this.bike.visible = false; sc.add(this.bike);
    this.canoe = makeCanoe(0xc0392b); this.canoe.visible = false; sc.add(this.canoe);
    // fishing line, bobber, held fish, stone
    this.line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xe8e8e8, transparent: true, opacity: 0.7 })); this.line.frustumCulled = false; this.line.visible = false; sc.add(this.line);
    const bob = this.bobber = new THREE.Group(); const bt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10, 0, PI * 2, 0, PI / 2), new THREE.MeshStandardMaterial({ color: 0xe03020, roughness: 0.4 })); const bb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10, 0, PI * 2, PI / 2, PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 })); bob.add(bt, bb); bob.visible = false; sc.add(bob);
    this.heldFish = null; this.heldSp = null;
    this.stone = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.6 })); this.stone.scale.set(1.3, 0.45, 1); this.stone.visible = false; sc.add(this.stone);
    // collectibles
    this.acorns = {}; const acM = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.9, roughness: 0.25, emissive: 0x6a4a00, emissiveIntensity: 0.6 }); const capM = new THREE.MeshStandardMaterial({ color: 0xb8902a, metalness: 0.8, roughness: 0.45 });
    for (const a of W.ACORNS) { const g = new THREE.Group(); const nut = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), acM); nut.scale.set(1, 1.25, 1); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.175, 18, 10, 0, PI * 2, 0, PI * 0.5), capM); cap.position.y = 0.08; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 6), capM); st.position.y = 0.26; g.add(nut, cap, st); g.position.set(a.x, W.ground(a.x, a.z) + 0.55, a.z); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); sc.add(g); this.acorns[a.id] = g; }
    const glowT = T.radialTex([[0, 'rgba(255,240,200,1)'], [0.25, 'rgba(255,210,140,0.55)'], [1, 'rgba(255,180,90,0)']], 128);
    this.glowT = glowT; this.sparkM = new THREE.SpriteMaterial({ map: T.radialTex([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,250,220,0.6)'], [1, 'rgba(255,240,200,0)']], 64), color: 0xffe6a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.finds = {}; for (const f of W.FINDS) { const s = new THREE.Sprite(this.sparkM.clone()); s.position.set(f.x, f.y + 0.35, f.z); s.scale.setScalar(0.6); sc.add(s); this.finds[f.id] = s; }
    this.skipHints = W.SKIP_SPOTS.map(s => { const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.5, depthWrite: false })); m.rotation.x = -PI / 2; m.position.set(s.x, W.ground(s.x, s.z) + 0.06, s.z); sc.add(m); return m; });
    // quest marker
    const qm = this.qMark = new THREE.Group(); const dm = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.3 })); dm.scale.set(0.8, 1.4, 0.8); qm.add(dm);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.25, 30, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })); beam.position.y = 15; qm.add(beam); qm.visible = false; sc.add(qm);
    // night lights: lamp/lantern glows + fires
    this.glows = []; this.fires = [];
    for (const mk of this.P.marks) {
      if (mk.kind === 'lamp' || mk.kind === 'lantern') { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: mk.kind === 'lamp' ? 0xffd9a0 : 0xffb860, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true })); s.position.copy(mk.pos); s.scale.setScalar(mk.kind === 'lamp' ? 2.6 : 1.3); s.visible = false; sc.add(s); this.glows.push({ s, mk }); }
      if (mk.kind === 'fire') { const g = new THREE.Group(); g.position.copy(mk.pos); const fm = new THREE.SpriteMaterial({ map: T.flameTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
        const fl = []; for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(fm.clone()); s.center.set(0.5, 0.05); s.position.set((i % 2 - 0.5) * 0.18, 0, (i > 1 ? 0.1 : -0.1)); g.add(s); fl.push(s); }
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, color: 0xff8a30, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 })); gl.scale.setScalar(4); gl.position.y = 0.4; g.add(gl);
        g.visible = false; sc.add(g); this.fires.push({ g, fl, gl, mk, emit: 0 }); }
    }
    this.fireLights = []; for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xff8a3a, 0, 14, 1.6); l.visible = false; sc.add(l); this.fireLights.push(l); }
    // fx
    this.parts = new Particles(sc); this.dec = new Decals(sc); this.rain = new Rain(sc);
    this.cones = [new Cone(sc), new Cone(sc), new Cone(sc), new Cone(sc)];
    // reflection
    this.reflCam = new THREE.PerspectiveCamera(); this.reflRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType }); U.refl.value = this.reflRT.texture; this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0.05);
    // post
    this.buildPost();
    progress(1); this.ok = true;
  }
  setShadowRes(n) { const s = this.sun.shadow; if (s.mapSize.x === n) return; s.mapSize.set(n, n); if (s.map) { s.map.dispose(); s.map = null; } }
  setGrass(level) { if (this.grass) { this.scene.remove(this.grass); this.grass.geometry.dispose(); this.grass = null; } const m = this.G.make(level); if (m) { this.grass = m; this.U.grassSize.value = m.userData.size; this.scene.add(m); } }
  buildPost() {
    const sz = this.r.getDrawingBufferSize(new THREE.Vector2()); const rt = new THREE.WebGLRenderTarget(Math.max(2, sz.x), Math.max(2, sz.y), { type: THREE.HalfFloatType, samples: 4 });
    this.comp = new EffectComposer(this.r, rt); this.rp = new RenderPass(this.scene, this.cam); this.comp.addPass(this.rp);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(2, sz.x / 2), Math.max(2, sz.y / 2)), 0.32, 0.45, 0.88); this.comp.addPass(this.bloom); this.comp.addPass(new OutputPass());
  }
  setQuality(q) { q = clamp(q, 0, 3); if (q === this.q && this.grassLevel === q) return; this.q = q; Q.level = q; this.grassLevel = q; this.setGrass(q); this.setShadowRes(q >= 3 ? 4096 : q >= 2 ? 2048 : 1024); this.r.shadowMap.enabled = q >= 1; this.sun.castShadow = q >= 1; this.scene.traverse(o => { if (o.material && o.material.needsUpdate !== undefined && o.isMesh && o.castShadow) { } }); }
  resize(w, h, dpr) { this.r.setPixelRatio(dpr); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); if (this.comp) { this.comp.setPixelRatio(dpr); this.comp.setSize(w, h); this.bloom.resolution.set(w * dpr / 2, h * dpr / 2); }
    const s = this.r.getDrawingBufferSize(new THREE.Vector2()); this.reflRT.setSize(Math.max(2, s.x >> 1), Math.max(2, s.y >> 1)); this.parts.mat.uniforms.uScale.value = s.y * 0.5 / Math.tan(this.cam.fov * PI / 360); this.W = w; this.H = h; }
  // orbit input from main: dx/dy in radians, dz zoom factor
  orbit(dyaw, dpitch, zoom) { const v = this.view; v.yaw += dyaw; v.pitch = clamp(v.pitch + dpitch, -0.15, 1.35); if (zoom) v.dist = clamp(v.dist * zoom, 3, 18); if (dyaw || dpitch) v.idle = 0; }
  camYaw() { return this.view.yaw; }
  // project a world point to CSS px (for HUD labels); returns null if behind
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam); if (v.z > 1 || v.z < -1) return null; return { x: (v.x * 0.5 + 0.5) * this.W, y: (-v.y * 0.5 + 0.5) * this.H }; }
  // visual reactions to sim events
  events(list) {
    const P = this.parts;
    for (const e of list) {
      if (e.t === 'splash') { const n = Math.round(10 + (e.big || 0.3) * 40); const y = 0.05; for (let i = 0; i < n; i++) { const a = Math.random() * PI * 2, s = (0.5 + Math.random()) * (1 + (e.big || 0.3) * 2); P.emit(e.x, y, e.z, Math.cos(a) * s * 0.6, 2 + Math.random() * 3 * (0.4 + (e.big || 0.3)), Math.sin(a) * s * 0.6, 0.9, 0.07 + Math.random() * 0.05, 0.85, 0.92, 0.98, 0.8, 0); }
        this.dec.ripple(e.x, e.z, 0.8 + (e.big || 0.3) * 1.5, 1.8); this.dec.ripple(e.x, e.z, 0.5 + (e.big || 0.3), 1.2); }
      else if (e.t === 'ripple') this.dec.ripple(e.x, e.z, 0.7, 1.5);
      else if (e.t === 'dust') { const n = e.n || 4; const s = W.surfaceAt(e.x, e.z); const c = s === 'sand' ? [0.85, 0.76, 0.6] : s === 'snow' ? [0.95, 0.97, 1] : [0.6, 0.5, 0.38]; const y = W.ground(e.x, e.z) + 0.1; for (let i = 0; i < n; i++) P.emit(e.x + (Math.random() - 0.5) * 0.3, y, e.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8, 1.1, 0.25, c[0], c[1], c[2], 0.35, 3); }
      else if (e.t === 'foot') this.dec.foot(e.x, e.z, e.rot, e.side || 1, e.surf);
      else if (e.t === 'teleport') this.view.init = false;
      else if (e.t === 'sfx' && e.name === 'grab') { const p = S.G.p; for (let i = 0; i < 8; i++) P.emit(p.x + Math.cos(p.rot) * 0.4, p.y + 0.8, p.z + Math.sin(p.rot) * 0.4, (Math.random() - 0.5) * 1.5, 1 + Math.random(), (Math.random() - 0.5) * 1.5, 0.6, 0.08, 1, 0.9, 0.5, 0.9, 1); }
      else if (e.t === 'sfx' && (e.name === 'coin' || e.name === 'fanfare' || e.name === 'quest')) { const p = S.G.p; for (let i = 0; i < 18; i++) { const a = Math.random() * PI * 2; P.emit(p.x, p.y + 1.6, p.z, Math.cos(a) * 1.6, 2 + Math.random() * 2, Math.sin(a) * 1.6, 1.1, 0.09, 1, 0.82, 0.3, 1, 1); } }
      else if (e.t === 'sfx' && e.name === 'rustle') { const p = S.G.p; for (let i = 0; i < 10; i++) P.emit(p.x, p.y + 0.8, p.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 1.2, 0.07, 0.3, 0.5, 0.2, 0.9, 1); }
    }
  }
  env(dt) {
    const G = S.G, U = this.U; const h = G.clock; const k = kfAt(h); const wthr = G.weather; const cloud = wthr.cloud, rain = wthr.rain;
    const sa = (h - 6) / 24 * PI * 2; const sunDir = U.sunDir.value.set(Math.cos(sa) * 0.82, Math.sin(sa), 0.45).normalize(); U.moonDir.value.set(-sunDir.x, -sunDir.y, -0.3).normalize();
    const grey = clamp((cloud - 0.3) * 1.2, 0, 0.85);
    const gz = k.zen.clone().lerp(new THREE.Color(0x6a7482).multiplyScalar(0.3 + 0.7 * clamp(sunDir.y + 0.3, 0, 1)), grey); const gh = k.hor.clone().lerp(new THREE.Color(0x8a929c).multiplyScalar(0.3 + 0.7 * clamp(sunDir.y + 0.3, 0, 1)), grey);
    U.zen.value.copy(gz); U.hor.value.copy(gh); U.sunCol.value.copy(k.sun); U.sunVis.value = clamp(sunDir.y * 6 + 0.4, 0, 1) * (1 - grey * 0.85); U.night.value = clamp(-sunDir.y * 4, 0, 1); U.cloud.value = cloud; U.rain.value = rain; U.wind.value = wthr.wind || 0.4;
    const night = U.night.value; const sunUp = sunDir.y > -0.05;
    const L = this.sun; const shade = 1 - grey * 0.7;
    if (sunUp) { L.color.copy(k.sun); L.intensity = k.sunI * shade * clamp(sunDir.y * 5, 0, 1); L.userData.dir = sunDir; } else { L.color.setHex(0x9ab4ff); L.intensity = 1.0 * night * (1 - grey * 0.6); L.userData.dir = U.moonDir.value; }
    this.hemi.color.copy(k.hs).lerp(new THREE.Color(0x9aa4b0), grey * 0.6); this.hemi.groundColor.copy(k.hg); this.hemi.intensity = k.hi * (1 - grey * 0.25);
    U.amb.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.6).add(new THREE.Color(L.color).multiplyScalar(L.intensity * 0.12 * Math.max(0, L.userData.dir.y)));
    const fc = k.fog.clone().lerp(new THREE.Color(0x8c96a2).multiplyScalar(0.25 + 0.75 * clamp(sunDir.y + 0.3, 0, 1)), grey); this.fog.color.copy(fc); this.fog.density = 0.0036 + rain * 0.009 + grey * 0.002;
    this.scene.environmentIntensity = 1; this.r.toneMappingExposure = lerp(1.0, 1.25, night);
    // emissives at night
    const lit = clamp(night * 1.4 + (h > 19.3 || h < 6.2 ? 0.4 : 0) + grey * 0.3 - 0.1, 0, 1);
    if (MAT.win && MAT.win()) MAT.win().emissiveIntensity = lit * 1.6; for (const b of BULBS) b.emissiveIntensity = lit * (2.4 + 0.3 * Math.sin(this.time * 3)); for (const m of MAT_SIGNS) m.emissiveIntensity = 0.3 + lit * 2.2;
    for (const g of this.glows) { const dv = g.mk.decor; g.s.visible = lit > 0.05 && (!dv || G.owned.decor[dv]); g.s.material.opacity = lit * 0.9; }
    this.lit = lit; this.dark = night;
  }
  chars(dt) {
    const G = S.G, p = G.p; const J = this.jax;
    // Jax
    const hid = p.anim === 'hidden'; J.root.visible = !hid; J.root.position.set(p.x, p.y, p.z); J.root.rotation.y = PI / 2 - p.rot;
    let anim = p.anim; const o = { spd: p.spd, spdk: clamp(p.spd / 3.2, 0.6, 1.6) };
    if (G.caught) anim = 'caught'; if (G.party) anim = p.celebrateT > 0 ? 'celebrate' : 'sit';
    const F = G.fish; if (F) { anim = 'fish'; o.fishSt = F.st; o.power = F.power; }
    if (anim === 'swim') J.root.position.y = -0.55 + Math.sin(this.time * 3) * 0.04;
    if (p.canoe) J.root.position.y = 0.18 + Math.sin(this.time * 1.4) * 0.03;
    if (anim === 'bike') J.root.position.y = p.y + 0.02;
    const st = (F ? F.t : p.animT) || 0; J.pose(anim, anim === 'fish' || anim === 'throw' ? st : p.animT, dt, o);
    // disguise hat
    const dg = G.equip.disguise; if (dg !== this.curDisg) { this.curDisg = dg; const d = DISGUISE_HAT[dg]; J.setExtra('hat', d ? makeHat(d[0], d[1], 0.112) : null, 'head'); }
    // rod
    const showRod = !!F && G.owned.rod > 0; const tier = G.owned.rod; if (showRod) { if (!this.rods[tier]) { const r = makeRod(tier); r.rotation.x = PI / 2 + 0.2; r.position.set(0, -0.04, 0); this.rods[tier] = r; } J.setExtra('rod', this.rods[tier], 'handR'); } else J.setExtra('rod', null, 'handR');
    J.setExtra('paddle', p.canoe ? this.paddle : null, 'handR'); if (p.canoe) { this.paddle.rotation.set(0.6 + Math.sin(this.time * (p.spd > 0.4 ? 3.2 : 0.8)) * 0.5, 0, 0.9); }
    // bike & canoe
    this.bike.visible = !!p.bike; if (p.bike) { this.bike.position.set(p.x, p.y, p.z); this.bike.rotation.set(0, -p.rot, 0); this.bike.rotation.z = clamp((this.lastRot !== undefined ? wrapAng(p.rot - this.lastRot) : 0) / Math.max(dt, 1e-3) * -0.05, -0.3, 0.3); }
    this.lastRot = p.rot;
    this.canoe.visible = !!G.owned.canoe; if (G.owned.canoe) { const C = G.canoe; this.canoe.position.set(C.x, 0.05 + Math.sin(this.time * 1.4 + C.x) * 0.03, C.z); this.canoe.rotation.set(Math.sin(this.time * 1.1) * 0.03, -C.rot, Math.sin(this.time * 0.9) * 0.02); }
    // fishing line + bobber
    this.updateLine(dt);
    // NPCs
    for (const n of G.npcs) { const rg = this.npcs[n.id]; if (!rg) continue; rg.root.visible = n.visible !== false; if (!rg.root.visible) continue;
      const d2 = (n.x - p.x) ** 2 + (n.z - p.z) ** 2; rg.root.position.set(n.x, n.y !== undefined ? n.y : W.ground(n.x, n.z), n.z); rg.root.rotation.y = PI / 2 - n.rot;
      let a = n.anim; if (a === 'sleep') a = 'nap'; const oo = { spd: n.spd, spdk: clamp((n.spd || 0) / 3, 0.6, 1.6), look: n.look || 0, lookAround: a === 'look' };
      if (n.kind === 'camper' && (a === 'sit' || a === 'nap')) oo.seat = n.seat !== undefined ? n.seat : undefined;
      if (d2 < 90 * 90 || !rg._posed) { rg.pose(a, n.animT || 0, dt, oo); rg._posed = true; }
      if (rg.flash) { const on = n.flash > 0 && rg.root.visible; rg.flash.intensity = on ? 40 : 0; rg.flash.visible = on; rg.torch.material.emissiveIntensity = on ? 3 : 0; }
      if (n.id === 'gus' && !rg.rod) { const r = makeRod(1); r.rotation.x = PI / 2 + 0.5; rg.setExtra('rod', r, 'handR'); rg.rod = r; } }
  }
  updateLine(dt) {
    const G = S.G, F = G.fish, p = G.p; const rod = this.rods[G.owned.rod];
    if (!F || !rod || !rod.parent || F.st === 'aim') { this.line.visible = false; this.bobber.visible = F && F.st === 'caught' ? false : false; this.showFish(F && F.st === 'caught' ? F : null); return; }
    this.showFish(F.st === 'caught' ? F : null);
    this.jax.root.updateMatrixWorld(true); const tip = rod.userData.tip.getWorldPosition(new THREE.Vector3());
    let bx = F.bx, bz = F.bz, by = 0.02; const t = this.time;
    if (F.st === 'cast') { const k = clamp(F.t / 0.75, 0, 1); bx = lerp(tip.x, F.bx, k); bz = lerp(tip.z, F.bz, k); by = lerp(tip.y, 0, k) + Math.sin(k * PI) * 2.2; }
    else if (F.st === 'wait') { by = 0.02 + Math.sin(t * 2.2) * 0.015; if (F.t > (F.nib || 99) && F.t < F.nib + 0.25) by -= 0.04; }
    else if (F.st === 'bite') { by = -0.07 + Math.sin(t * 22) * 0.03; if (Math.random() < dt * 8) this.dec.ripple(bx, bz, 0.4, 0.8); }
    else if (F.st === 'reel') { const k = clamp(F.prog, 0, 1); const ex = p.x + Math.cos(p.rot) * 1.2, ez = p.z + Math.sin(p.rot) * 1.2; bx = lerp(F.bx, ex, k * 0.85) + Math.sin(t * 3.1) * 0.4 * (1 - k); bz = lerp(F.bz, ez, k * 0.85) + Math.cos(t * 2.3) * 0.4 * (1 - k); by = -0.05; if (Math.random() < dt * 6) this.parts.emit(bx, 0.05, bz, (Math.random() - 0.5), 1.2, (Math.random() - 0.5), 0.5, 0.06, 0.9, 0.95, 1, 0.8, 0); if (Math.random() < dt * 4) this.dec.ripple(bx, bz, 0.5, 1); }
    else if (F.st === 'caught') { this.line.visible = false; this.bobber.visible = false; return; }
    this.bobber.visible = true; this.bobber.position.set(bx, by, bz);
    const a = this.line.geometry.attributes.position; const tension = F.st === 'reel' ? clamp(F.tension, 0, 1) : 0; const sag = F.st === 'cast' ? 0.1 : lerp(0.9, 0.05, tension);
    for (let i = 0; i < 16; i++) { const k = i / 15; a.setXYZ(i, lerp(tip.x, bx, k), lerp(tip.y, by + 0.04, k) - Math.sin(k * PI) * sag, lerp(tip.z, bz, k)); } a.needsUpdate = true; this.line.visible = true;
    this.line.material.color.setRGB(1, lerp(1, 0.35, tension > 0.8 ? 1 : 0), lerp(1, 0.3, tension > 0.8 ? 1 : 0));
  }
  showFish(F) {
    if (!F || F.junk && !FISH_BY_ID[F.sp]) { if (this.heldFish) this.heldFish.visible = false; return; }
    if (this.heldSp !== F.sp) { if (this.heldFish) this.heldFish.removeFromParent(); const f = FISH_BY_ID[F.sp]; const col = f && f.col ? new THREE.Color(f.col[0]).getHex() : 0x7a6a50; const belly = f && f.col ? new THREE.Color(f.col[1]).getHex() : 0x9a8a70;
      const len = f && f.size ? clamp((F.size || f.size[0]) / 100, 0.18, 0.9) : 0.3; this.heldFish = f && f.junk ? new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.9 })) : makeFish(col, len, belly); this.heldSp = F.sp; this.jax.setExtra('fish', this.heldFish, 'handL'); this.heldFish.rotation.set(0, PI / 2, PI / 2); this.heldFish.position.set(0, -0.1, 0.05); }
    this.heldFish.visible = true; this.heldFish.rotation.y = PI / 2 + Math.sin(this.time * 9) * 0.25;
  }
  world(dt) {
    const G = S.G, P = this.P, t = this.time, p = G.p;
    for (const id in P.food) P.food[id].visible = !!(G.stash[id] && G.stash[id].items.length);
    for (const id in P.bins) { const g = P.bins[id]; if (p.hidden === id) { g.rotation.z = Math.sin(t * 13) * 0.02; } else g.rotation.z = 0; }
    for (const k in P.decor) P.decor[k].visible = !!G.owned.decor[k];
    if (P.decor.swing && P.decor.swing.userData.pivot) P.decor.swing.userData.pivot.rotation.x = Math.sin(t * 1.3) * 0.15;
    animateProps(P, t, 0.6 + (G.weather.wind || 0.4));
    // bushes shake when hiding inside
    for (const bm of this.fol.bushMeshes) { if (!bm.shook && !(p.hidden && p.hidden.startsWith('bush'))) continue; }
    // berries
    const bm = this.fol.berries; let ch = false; const z0 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const id in this.fol.berryIdx) { const gone = !!G.berries[id]; const L = this.fol.berryIdx[id]; if (L.gone === gone) continue; L.gone = gone; ch = true; for (const [i, m] of L) bm.setMatrixAt(i, gone ? z0 : m); }
    if (ch) bm.instanceMatrix.needsUpdate = true;
    for (const id in this.acorns) { const a = this.acorns[id]; a.visible = !G.acorns[id]; if (a.visible) { a.rotation.y = t * 1.6; a.position.y = W.ground(a.position.x, a.position.z) + 0.55 + Math.sin(t * 2 + a.position.x) * 0.08; if (Math.random() < dt * 3) this.parts.emit(a.position.x + (Math.random() - 0.5) * 0.4, a.position.y, a.position.z + (Math.random() - 0.5) * 0.4, 0, 0.5, 0, 0.9, 0.06, 1, 0.85, 0.3, 1, 1); } }
    for (const id in this.finds) { const s = this.finds[id]; s.visible = !G.finds[id]; if (s.visible) { const k = 0.5 + 0.5 * Math.sin(t * 4 + s.position.x); s.scale.setScalar(0.16 + k * 0.24); s.material.opacity = 0.35 + k * 0.5; } }
    for (const [i, m] of this.skipHints.entries()) { const s = W.SKIP_SPOTS[i]; const d = Math.hypot(s.x - p.x, s.z - p.z); m.visible = d < 25 && !G.skip; const k = (t * 0.6 + i * 0.3) % 1; m.scale.setScalar(0.6 + k * 0.8); m.material.opacity = (1 - k) * 0.55; }
    // quest marker
    const qt = S.questTarget(); this.qMark.visible = !!qt && !G.caught; if (qt) { const d = Math.hypot(qt.x - p.x, qt.z - p.z); this.qMark.visible = d > 3; this.qMark.position.set(qt.x, W.ground(qt.x, qt.z) + 2.6 + Math.sin(t * 2.5) * 0.18, qt.z); this.qMark.children[0].rotation.y = t * 2; this.qMark.children[1].material.opacity = clamp((d - 8) / 40, 0, 1) * 0.16; }
    // fires
    const fl = S.fireLit(); const cand = [];
    for (const f of this.fires) { const pit = f.mk.decor === 'firepit' || f.mk.pit; let on = pit ? !!G.owned.decor.firepit && (fl || G.party) : fl; if (f.mk.decor && !G.owned.decor[f.mk.decor]) on = false; f.g.visible = on; if (!on) continue;
      const d = (f.mk.pos.x - this.cam.position.x) ** 2 + (f.mk.pos.z - this.cam.position.z) ** 2; cand.push([d, f]);
      f.fl.forEach((s, i) => { const k = 0.75 + 0.25 * Math.sin(t * (11 + i * 3) + i * 2) + 0.1 * Math.sin(t * 23 + i); s.scale.set(0.42 * k, 0.85 * k * (1 + i * 0.06), 1); s.material.rotation = Math.sin(t * 5 + i) * 0.08; });
      f.gl.material.opacity = 0.45 + 0.15 * Math.sin(t * 9);
      if (d < 70 * 70) { f.emit += dt; while (f.emit > 0.08) { f.emit -= 0.08; const x = f.mk.pos.x, y = f.mk.pos.y + 0.4, z = f.mk.pos.z; this.parts.emit(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.5, 1.5 + Math.random(), (Math.random() - 0.5) * 0.5, 1.4, 0.035, 1, 0.55, 0.15, 1, 2);
          if (Math.random() < 0.4) this.parts.emit(x, y + 0.6, z, (Math.random() - 0.5) * 0.2, 0.6, (Math.random() - 0.5) * 0.2, 3.5, 0.35, 0.35, 0.33, 0.32, 0.22, 3); } } }
    cand.sort((a, b) => a[0] - b[0]); this.fireLights.forEach((l, i) => { const c = cand[i]; l.visible = !!c && this.q >= 1; if (c) { l.position.copy(c[1].mk.pos).y += 0.8; l.intensity = (6 + Math.sin(t * 13 + i) * 1.2 + Math.sin(t * 7.3) * 0.8) * (0.5 + this.dark * 0.8); } });
    // vision cones: rangers + nearby awake campers
    let ci = 0; for (const c of this.cones) c.m.visible = false;
    if (!G.caught && !G.party) for (const n of G.npcs) { if (ci >= this.cones.length) break; if (n.visible === false) continue; let range, half;
      if (n.kind === 'ranger') { range = n.range || 14; half = 0.9; } else if (n.kind === 'camper' && n.anim !== 'nap' && n.anim !== 'sleep') { range = 9.5 * nightMulR(); half = 1.05; } else continue;
      if ((n.x - p.x) ** 2 + (n.z - p.z) ** 2 > (range + 22) ** 2) continue; this.cones[ci++].set(n.x, n.z, n.rot, range, half, clamp(n.aware || 0, 0, 1), t, n.alert); }
  }
  camera(dt) {
    const G = S.G, p = G.p, v = this.view; const ty = (p.canoe ? 0.4 : p.swim ? -0.2 : p.y) + (p.crouchNow ? 0.8 : 1.15);
    if (!v.init) { v.tx = p.x; v.ty = ty; v.tz = p.z; v.yaw = p.rot; v.init = true; }
    const k = 1 - Math.exp(-dt * 8); v.tx += (p.x - v.tx) * k; v.tz += (p.z - v.tz) * k; v.ty += (ty - v.ty) * (1 - Math.exp(-dt * 5));
    v.idle += dt; if (v.idle > 2.2 && p.spd > 1.5 && !G.fish) { const d = wrapAng(p.rot - v.yaw); if (Math.abs(d) < 2.4) v.yaw += d * clamp(dt * 0.9, 0, 1); }
    if (G.fish || G.skip) { const d = wrapAng(p.rot - v.yaw + 0.35); v.yaw += d * clamp(dt * 2, 0, 1); }
    let dist = v.dist * (G.fish ? 1.15 : 1) * (p.bike ? 1.15 : 1);
    const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    // pull the camera in front of buildings / big obstacles along the boom
    let free = dist; for (let i = 2; i <= 14; i++) { const d = dist * i / 14; const x = v.tx - Math.cos(v.yaw) * cp * d, z = v.tz - Math.sin(v.yaw) * cp * d, y = v.ty + sp * d + 0.3; let hit = false;
      for (const c of W.nearCols(x, z, 3.5)) { if (c.k !== 'b' || c.h < 1.8 || c.hw <= 0) continue; const dx = x - c.x, dz = z - c.z; const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c; if (Math.abs(lx) < c.hw + 0.35 && lz < c.hd + 0.35 && lz > -c.hd - 0.35 - (c.porch || 0) && y < W.ground(c.x, c.z) + c.h + 2.2) { hit = true; break; } }
      if (hit) { free = Math.max(1.4, dist * (i - 1) / 14); break; } }
    v.cd = v.cd == null ? free : (free < v.cd ? lerp(v.cd, free, 1 - Math.exp(-dt * 18)) : lerp(v.cd, free, 1 - Math.exp(-dt * 2.5))); dist = Math.min(dist, v.cd);
    let cx = v.tx - Math.cos(v.yaw) * cp * dist, cz = v.tz - Math.sin(v.yaw) * cp * dist, cy = v.ty + sp * dist + 0.3;
    // keep above terrain along the boom
    for (let i = 1; i <= 6; i++) { const f = i / 6; const x = lerp(v.tx, cx, f), z = lerp(v.tz, cz, f); const g = W.H(x, z); const yy = lerp(v.ty, cy, f); if (yy < g + 0.45) cy += (g + 0.45 - yy) / f; }
    cy = Math.max(cy, 0.35); const cam = this.cam; cam.position.set(cx, cy, cz); cam.lookAt(v.tx, v.ty + 0.25, v.tz);
  }
  render(dt) {
    if (!this.ok) return; this.time += dt; const G = S.G, U = this.U; U.time.value = this.time;
    this.env(dt); this.chars(dt); this.world(dt); this.camera(dt);
    const cam = this.cam; U.camXZ.value.set(cam.position.x, cam.position.z); U.player.value.set(G.p.x, G.p.y, G.p.z);
    this.parts.update(dt); this.dec.update(dt); this.rain.update(dt, cam.position, G.weather.rain || 0, G.weather.wind || 0.4);
    this.sky.position.copy(cam.position);
    // sun shadow follows the player (texel-snapped)
    const L = this.sun, d = L.userData.dir || U.sunDir.value; const ext = 36; const snap = ext * 2 / L.shadow.mapSize.x; const px = Math.round(G.p.x / snap) * snap, pz = Math.round(G.p.z / snap) * snap, py = G.p.y;
    L.target.position.set(px, py, pz); L.position.set(px + d.x * 120, py + Math.max(0.15, d.y) * 120, pz + d.z * 120); L.target.updateMatrixWorld();
    const sbox = this.q >= 3 ? 36 : 30; const sc = L.shadow.camera; if (sc.right !== sbox) { sc.left = -sbox; sc.right = sbox; sc.top = sbox; sc.bottom = -sbox; sc.updateProjectionMatrix(); }
    this.scene.traverseVisible; // noop
    // planar reflection (q3)
    U.reflOn.value = this.q >= 3 ? 1 : 0;
    if (this.q >= 3 && cam.position.y > 0.05) this.renderReflection();
    if (this.q >= 2) { this.bloom.enabled = true; this.bloom.strength = 0.22 + this.dark * 0.35; this.comp.render(dt); } else { this.r.render(this.scene, cam); }
    this.adapt(dt);
  }
  renderReflection() {
    const cam = this.cam, rc = this.reflCam; rc.copy(cam); rc.position.set(cam.position.x, -cam.position.y, cam.position.z);
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = -f.y; const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion); up.y = -up.y; rc.up.copy(up); rc.lookAt(rc.position.clone().add(f)); rc.updateMatrixWorld(); rc.projectionMatrix.copy(cam.projectionMatrix); rc.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    this.U.texMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    const hide = [this.water, this.grass, this.parts.pts, this.rain.m, ...this.cones.map(c => c.m), this.line, this.qMark].filter(Boolean); const vis = hide.map(o => o.visible); hide.forEach(o => o.visible = false);
    const r = this.r; const prevRT = r.getRenderTarget(); const sh = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false; r.clippingPlanes = [this.clipPlane];
    r.setRenderTarget(this.reflRT); r.clear(); r.render(this.scene, rc); r.setRenderTarget(prevRT); r.clippingPlanes = []; r.shadowMap.autoUpdate = sh; r.shadowMap.needsUpdate = true;
    hide.forEach((o, i) => o.visible = vis[i]);
  }
  adapt(dt) { const f = this.fps; f.t += dt; f.acc += dt; f.n++; if (f.acc >= 0.5) { f.val = f.n / f.acc; f.acc = 0; f.n = 0; if (this.noAdapt) return; if (f.val < 45) f.low += 0.5; else f.low = 0; if (f.low >= 3 && this.q > 0) { f.low = 0; this.setQuality(this.q - 1); } } }
  dispose() { this.r.dispose(); }
}
