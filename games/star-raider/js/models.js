/* STAR RAIDER — models.js : procedural ships, starbase, drone and cockpit (three r169).
   All models face +Z (Object3D.lookAt points +Z at the target). */
import * as THREE from '../vendor/three/three.module.min.js';
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true; return t;
}
/* hull panel textures: albedo with panel lines + grime, and an emissive map with window / light strips */
function hullTex(base, line, seed, lights) {
  const map = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const v = rnd(-22, 22); x.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},${rnd(0.03, 0.09)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(4, 60), rnd(4, 40)); }
    x.strokeStyle = line; x.lineWidth = 2;
    for (let i = 0; i < 60; i++) { const px = Math.floor(rnd(0, 16)) * 32, py = Math.floor(rnd(0, 16)) * 32; x.strokeRect(px + 0.5, py + 0.5, 32 * Math.ceil(rnd(1, 4)), 32 * Math.ceil(rnd(1, 3))); }
    x.globalAlpha = 0.5; for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(rnd(0, w), rnd(0, h), 2, 2); } x.globalAlpha = 1;
  });
  const em = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < lights; i++) { const px = rnd(0, w), py = Math.floor(rnd(0, 32)) * 16 + 6, n = Math.ceil(rnd(2, 9)); x.fillStyle = Math.random() < 0.8 ? '#ff4a6a' : '#ffb070'; for (let k = 0; k < n; k++) x.fillRect(px + k * 7, py, 4, 3); }
  });
  return { map, em };
}
let TEX = null;
function tex() {
  if (TEX) return TEX;
  TEX = { vrell: hullTex('#3a3036', 'rgba(10,6,10,0.65)', 1, 90), vrell2: hullTex('#2e3236', 'rgba(5,8,12,0.7)', 2, 140), base: hullTex('#9aa2ae', 'rgba(30,36,48,0.55)', 3, 0), mine: hullTex('#b8c2d0', 'rgba(30,40,60,0.5)', 4, 0) };
  TEX.baseEm = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (Math.random() < 0.22) { x.fillStyle = Math.random() < 0.85 ? '#ffe9b8' : '#9fd8ff'; x.fillRect(c * 8 + 2, r * 8 + 3, 4, 2); } });
  TEX.glow = canvasTex(128, 128, (x, w) => { const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, false);
  TEX.panel = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#1a1e26'; x.fillRect(0, 0, w, h); for (let i = 0; i < 600; i++) { const v = rnd(-14, 14); x.fillStyle = `rgba(${40 + v},${44 + v},${54 + v},0.35)`; x.fillRect(rnd(0, w), rnd(0, h), rnd(2, 40), rnd(2, 10)); } x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 2; for (let i = 0; i < 26; i++) x.strokeRect(rnd(0, w), rnd(0, h), rnd(20, 140), rnd(10, 60)); x.fillStyle = 'rgba(160,170,190,0.25)'; for (let i = 0; i < 160; i++) { x.beginPath(); x.arc(rnd(0, w), rnd(0, h), 1.6, 0, 7); x.fill(); } });
  return TEX;
}
/* fake environment reflection (no PMREM, so no float targets): sample the sector skybox cube */
export const ENV = { cube: { value: null }, k: { value: 0.55 } };
export function hullMat(o) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.5, metalness: 0.75 }, o));
  m.onBeforeCompile = sh => {
    sh.uniforms.uEnv = ENV.cube; sh.uniforms.uEnvK = ENV.k;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform samplerCube uEnv; uniform float uEnvK;')
      .replace('#include <opaque_fragment>', `{ vec3 vd = normalize(vViewPosition); vec3 rv = reflect(-vd, normal); vec3 wr = (vec4(rv, 0.0) * viewMatrix).xyz;
        float fr = pow(1.0 - clamp(dot(normal, vd), 0.0, 1.0), 3.0);
        vec3 env = textureCube(uEnv, wr).rgb; outgoingLight += env * uEnvK * (metalnessFactor * (1.0 - roughnessFactor * 0.7) * diffuseColor.rgb + fr * 0.6); }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'sr-hull';
  return m;
}
const glowSprite = (col, s, op = 1) => { const m = new THREE.SpriteMaterial({ map: tex().glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }); const sp = new THREE.Sprite(m); sp.scale.setScalar(s); return sp; };
function mesh(g, m, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; }
/* ---------------- Vrell DARTER: needle fuselage, forward-swept blades, twin burners ---------------- */
export function makeDarter() {
  const T = tex(), g = new THREE.Group();
  const hull = hullMat({ map: T.vrell.map, emissiveMap: T.vrell.em, emissive: 0xffffff, emissiveIntensity: 1.2, color: 0xb8a8b0 });
  const dark = hullMat({ color: 0x1a1418, roughness: 0.35, metalness: 0.9 });
  const body = new THREE.LatheGeometry([[0, -3.2], [0.55, -2.6], [0.9, -0.8], [1.0, 0.8], [0.75, 2.2], [0.35, 3.4], [0, 3.6]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  body.rotateX(Math.PI / 2); const b = mesh(body, hull); b.scale.set(1, 0.7, 1); g.add(b);
  const wingS = new THREE.Shape(); wingS.moveTo(0, -1.4); wingS.lineTo(3.8, 1.8); wingS.lineTo(4.1, 1.2); wingS.lineTo(1.0, -2.3); wingS.lineTo(0, -2.2);
  const wg = new THREE.ExtrudeGeometry(wingS, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 }); wg.rotateX(Math.PI / 2); wg.translate(0, 0.08, 0);
  for (const s of [-1, 1]) { const w = mesh(wg, hull); w.scale.x = s; w.rotation.z = s * 0.18; g.add(w);
    const tip = mesh(new THREE.BoxGeometry(0.18, 0.7, 1.6), dark, s * 4.0, 0.05, -1.6); g.add(tip);
    const burner = mesh(new THREE.CylinderGeometry(0.32, 0.42, 1.4, 10, 1, true).rotateX(Math.PI / 2), dark, s * 0.7, 0, -3.0); g.add(burner);
    const gl = glowSprite(0xff3a6a, 2.6); gl.position.set(s * 0.7, 0, -3.8); gl.userData.engine = 1; g.add(gl); }
  const eye = mesh(new THREE.SphereGeometry(0.42, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff2244 }), 0, 0.42, 1.6); eye.scale.set(1, 0.6, 1.6); g.add(eye);
  const eg = glowSprite(0xff2050, 2.0, 0.8); eg.position.copy(eye.position); g.add(eg);
  g.userData.r = 3.6; return g;
}
/* ---------------- Vrell LANCER: long keel, forward lance, side pods, light rows ---------------- */
export function makeLancer() {
  const T = tex(), g = new THREE.Group();
  const hull = hullMat({ map: T.vrell2.map, emissiveMap: T.vrell2.em, emissive: 0xffffff, emissiveIntensity: 1.4, color: 0xa8b0b8 });
  const dark = hullMat({ color: 0x15181c, roughness: 0.3, metalness: 0.9 });
  const keel = new THREE.BoxGeometry(2.2, 1.6, 10, 2, 2, 6); const kp = keel.attributes.position;
  for (let i = 0; i < kp.count; i++) { const z = kp.getZ(i), t = (z + 5) / 10; kp.setX(i, kp.getX(i) * (0.55 + 0.6 * Math.sin(t * Math.PI))); kp.setY(i, kp.getY(i) * (0.6 + 0.5 * Math.sin(t * Math.PI)) + (kp.getY(i) > 0 ? 0.2 : 0)); }
  keel.computeVertexNormals(); g.add(mesh(keel, hull));
  g.add(mesh(new THREE.ConeGeometry(0.35, 5, 8).rotateX(Math.PI / 2), dark, 0, -0.2, 7.2));
  const prong = new THREE.BoxGeometry(0.25, 0.25, 3.2);
  for (const s of [-1, 1]) { g.add(mesh(prong, dark, s * 0.8, 0.3, 5.6));
    const pod = mesh(new THREE.CapsuleGeometry(0.7, 4.2, 4, 10).rotateX(Math.PI / 2), hull, s * 2.6, -0.3, -1.2); g.add(pod);
    g.add(mesh(new THREE.BoxGeometry(2.0, 0.25, 1.6), dark, s * 1.5, -0.2, -0.6));
    const gl = glowSprite(0xff5a3a, 3.4); gl.position.set(s * 2.6, -0.3, -4.2); gl.userData.engine = 1; g.add(gl); }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(3.2, 0); fin.lineTo(1.6, 1.8); fin.lineTo(0.4, 1.8);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.14, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); g.add(mesh(fg, hull, 0.07, 0.8, -4.2));
  const gl = glowSprite(0xff7040, 4.2); gl.position.set(0, 0, -5.4); gl.userData.engine = 1; g.add(gl);
  g.userData.r = 5.5; return g;
}
/* ---------------- Vrell HIVE: a carrier sphere, spines, rotating claw ring, glowing core, shield bubble ---------------- */
export function makeHive() {
  const T = tex(), g = new THREE.Group();
  const hull = hullMat({ map: T.vrell.map, emissiveMap: T.vrell.em, emissive: 0xffffff, emissiveIntensity: 1.5, color: 0x8a7a80, roughness: 0.55 });
  const dark = hullMat({ color: 0x141012, roughness: 0.4, metalness: 0.85 });
  const core = new THREE.IcosahedronGeometry(6, 3); const cp = core.attributes.position;
  for (let i = 0; i < cp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(cp, i); const n = 1 + 0.06 * Math.sin(v.x * 1.7) * Math.cos(v.y * 2.1) + 0.05 * Math.sin(v.z * 2.6); v.multiplyScalar(n); v.y *= 0.72; cp.setXYZ(i, v.x, v.y, v.z); }
  core.computeVertexNormals(); g.add(mesh(core, hull));
  const glowM = new THREE.MeshBasicMaterial({ color: 0xff3060 });
  const band = mesh(new THREE.TorusGeometry(6.1, 0.35, 8, 48), glowM); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 0.6); g.add(band);
  const ring = new THREE.Group(); ring.name = 'ring';
  ring.add(mesh(new THREE.TorusGeometry(10, 0.7, 8, 64).rotateX(Math.PI / 2), dark));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const claw = mesh(new THREE.ConeGeometry(0.9, 4.5, 6), hull, Math.cos(a) * 10, 0, Math.sin(a) * 10); claw.rotation.z = -Math.PI / 2; claw.rotation.y = -a; claw.position.y = 0; ring.add(claw);
    const lt = glowSprite(0xff4070, 2.2); lt.position.set(Math.cos(a) * 10.8, 0.9, Math.sin(a) * 10.8); ring.add(lt); }
  g.add(ring);
  for (let i = 0; i < 14; i++) { const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).normalize(); const sp = mesh(new THREE.ConeGeometry(0.4, rnd(3, 6), 5), dark); sp.position.copy(d.clone().multiplyScalar(5.6)); sp.position.y *= 0.72; sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); g.add(sp); }
  const maw = glowSprite(0xff2a50, 9, 0.9); maw.position.set(0, 0, 5.5); g.add(maw);
  const eng = glowSprite(0xff6a3a, 8); eng.position.set(0, 0, -6.5); eng.userData.engine = 1; g.add(eng);
  // shield bubble
  const sm = new THREE.ShaderMaterial({ uniforms: { uA: { value: 0 }, uHit: { value: new THREE.Vector3(0, 0, 1) }, uHitT: { value: 9 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA, uHitT, uTime; uniform vec3 uHit; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 2.5); vec3 p = normalize(vP);
        vec2 h = vec2(atan(p.z, p.x) * 6.0, p.y * 9.0); vec2 g = abs(fract(h + vec2(0.0, floor(h.x) * 0.5)) - 0.5); float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
        float d = distance(p, normalize(uHit)); float ring = exp(-pow((d - uHitT * 1.6) * 6.0, 2.0)) * exp(-uHitT * 2.5) + exp(-d * 5.0) * exp(-uHitT * 5.0) * 1.5;
        float a = (f * 0.55 + hex * 0.25 * (0.4 + f)) * uA + ring * (0.6 + hex);
        gl_FragColor = vec4(vec3(0.95, 0.35, 0.6) * a, a);
#include <colorspace_fragment>
      }` });
  const sh = mesh(new THREE.SphereGeometry(13, 32, 20), sm); sh.name = 'shield'; g.add(sh);
  g.userData.r = 11; return g;
}
/* ---------------- your wingman (co-op buddy): sleek white interceptor ---------------- */
export function makeWingman() {
  const T = tex(), g = new THREE.Group();
  const hull = hullMat({ map: T.mine.map, color: 0xe8eef8, roughness: 0.35, metalness: 0.6 });
  const dark = hullMat({ color: 0x20242c, roughness: 0.3, metalness: 0.9 });
  const body = new THREE.LatheGeometry([[0, -3], [0.9, -2.6], [1.2, -0.5], [0.9, 1.5], [0.4, 3.5], [0, 4]].map(([r, y]) => new THREE.Vector2(r, y)), 12); body.rotateX(Math.PI / 2);
  const b = mesh(body, hull); b.scale.set(1.2, 0.6, 1); g.add(b);
  const ws = new THREE.Shape(); ws.moveTo(0, 1); ws.lineTo(4.6, -1.6); ws.lineTo(4.6, -2.4); ws.lineTo(0, -2.6);
  const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.14, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
  for (const s of [-1, 1]) { const w = mesh(wg, hull); w.scale.x = s; g.add(w); g.add(mesh(new THREE.BoxGeometry(0.25, 1.2, 2.2), dark, s * 4.6, 0.3, -2)); const gl = glowSprite(0x6ac8ff, 2.8); gl.position.set(s * 0.8, 0, -3.4); gl.userData.engine = 1; g.add(gl);
    const nav = glowSprite(s < 0 ? 0xff3030 : 0x30ff60, 1.2); nav.position.set(s * 4.7, 0.3, -2); g.add(nav); }
  const can = mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshStandardMaterial({ color: 0x0a2040, metalness: 1, roughness: 0.05, emissive: 0x103060 }), 0, 0.55, 1.2); can.scale.set(1, 0.7, 2); g.add(can);
  g.userData.r = 4; return g;
}
/* ---------------- starbase: hub, habitat ring, spokes, panels, docking bay, beacons ---------------- */
export function makeStarbase() {
  const T = tex(), g = new THREE.Group();
  const hull = hullMat({ map: T.base.map, emissiveMap: T.baseEm, emissive: 0xffffff, emissiveIntensity: 1.6, color: 0xc8d0dc, roughness: 0.45, metalness: 0.65 });
  const dark = hullMat({ color: 0x2a2e36, roughness: 0.4, metalness: 0.8 });
  const panelM = new THREE.MeshStandardMaterial({ color: 0x1a2a6a, roughness: 0.2, metalness: 0.9, emissive: 0x0a1030 });
  g.add(mesh(new THREE.SphereGeometry(16, 40, 24), hull));
  g.add(mesh(new THREE.CylinderGeometry(5, 5, 70, 20), dark));
  const rot = new THREE.Group(); rot.name = 'spin';
  const ring = mesh(new THREE.TorusGeometry(42, 4.5, 14, 96), hull); ring.rotation.x = Math.PI / 2; rot.add(ring);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const sp = mesh(new THREE.CylinderGeometry(1.4, 1.4, 26, 8), dark, Math.cos(a) * 29, 0, Math.sin(a) * 29); sp.rotation.z = Math.PI / 2; sp.rotation.y = -a; rot.add(sp); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const l = glowSprite(i % 2 ? 0xff4040 : 0xffffff, 4); l.position.set(Math.cos(a) * 46.8, 0, Math.sin(a) * 46.8); l.userData.blink = i; rot.add(l); }
  g.add(rot);
  for (const s of [-1, 1]) { const arm = new THREE.Group(); arm.position.y = s * 40;
    arm.add(mesh(new THREE.CylinderGeometry(7, 9, 8, 16), hull));
    for (const k of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(50, 0.6, 14), panelM, k * 34, 0, 0); arm.add(p); arm.add(mesh(new THREE.BoxGeometry(18, 1.2, 1.2), dark, k * 12, 0, 0)); }
    const bc = glowSprite(0xff2020, 6); bc.position.y = s * 6; bc.userData.blink = 99; arm.add(bc); g.add(arm); }
  // docking bay facing +Z (toward an approaching ship)
  const bay = mesh(new THREE.CylinderGeometry(6, 8, 10, 20, 1, true), dark, 0, 0, 18); bay.rotation.x = Math.PI / 2; g.add(bay);
  const bayGlow = glowSprite(0x9fe8ff, 22, 0.8); bayGlow.position.set(0, 0, 22); g.add(bayGlow);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const l = glowSprite(0x7fffd4, 2.4); l.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 23); l.userData.chase = i; g.add(l); }
  g.userData.r = 48; return g;
}
/* ---------------- repair drone ---------------- */
export function makeDrone() {
  const g = new THREE.Group(), hull = hullMat({ color: 0xffc050, roughness: 0.4, metalness: 0.6 }), dark = hullMat({ color: 0x30343c, metalness: 0.9, roughness: 0.3 });
  g.add(mesh(new THREE.BoxGeometry(2.2, 1.2, 2.6), hull));
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.8, 12).rotateX(Math.PI / 2), dark, 0, 0, 1.6));
  for (const s of [-1, 1]) { const a = mesh(new THREE.BoxGeometry(0.25, 0.25, 2.2), dark, s * 1.3, -0.4, 1.4); a.rotation.y = s * 0.3; g.add(a); g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), dark, s * 1.6, 0.5, -0.4)); const l = glowSprite(0xffd070, 1.6); l.position.set(s * 1.2, 0.7, -1.2); l.userData.blink = 3; g.add(l); }
  const eye = glowSprite(0x7fffd4, 2.4); eye.position.set(0, 0, 2.1); g.add(eye);
  const bm = new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uT, uA; varying vec2 vUv; void main(){ float e = 1.0 - abs(vUv.x - 0.5) * 2.0; float s = 0.6 + 0.4 * sin(vUv.y * 60.0 - uT * 18.0); float a = pow(e, 2.0) * s * uA; gl_FragColor = vec4(vec3(0.5, 1.0, 0.85) * a, a);\n#include <colorspace_fragment>\n}' });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.6, 1, 16, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), bm); beam.name = 'beam'; beam.position.z = 2; g.add(beam);
  return g;
}
/* ---------------- cockpit frame (camera space, rebuilt on resize to hug the screen edges) ---------------- */
export function makeCockpit(aspect, vfov) {
  const T = tex(), g = new THREE.Group(), D = 1, hh = Math.tan(vfov * Math.PI / 360) * D, hw = hh * aspect;
  const port = aspect < 1;
  const metal = new THREE.MeshStandardMaterial({ map: T.panel, color: 0x8a92a4, roughness: 0.55, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.8, metalness: 0.4 });
  const trim = new THREE.MeshBasicMaterial({ color: 0x3ad8ff });
  const trimW = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const ext = (shape, depth, mat) => { const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: hh * 0.012, bevelSegments: 2, curveSegments: 12 }); return new THREE.Mesh(geo, mat); };
  // lower console: a sill across the bottom with a raised center hump
  const ch = port ? 0.13 : 0.2, top = -hh + hh * 2 * ch;
  const s = new THREE.Shape(); s.moveTo(-hw * 1.1, -hh * 1.1); s.lineTo(-hw * 1.1, top - hh * 0.08);
  s.bezierCurveTo(-hw * 0.6, top - hh * 0.06, -hw * 0.38, top + hh * 0.02, -hw * 0.28, top + hh * 0.06);
  s.lineTo(hw * 0.28, top + hh * 0.06); s.bezierCurveTo(hw * 0.38, top + hh * 0.02, hw * 0.6, top - hh * 0.06, hw * 1.1, top - hh * 0.08); s.lineTo(hw * 1.1, -hh * 1.1); s.lineTo(-hw * 1.1, -hh * 1.1);
  const con = ext(s, 0.06, metal); con.position.z = -D; g.add(con);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.56, hh * 0.006, 0.01), trim); edge.position.set(0, top + hh * 0.065, -D + 0.075); g.add(edge);
  for (const k of [-1, 1]) { const e2 = new THREE.Mesh(new THREE.BoxGeometry(hw * 0.5, hh * 0.005, 0.01), trimW); e2.position.set(k * hw * 0.66, top - hh * 0.03, -D + 0.075); e2.rotation.z = k * 0.06; g.add(e2); }
  // canopy pillars from the console corners up to the top frame
  const pw = (port ? 0.05 : 0.07) * hw * (port ? 2.2 : 1);
  for (const k of [-1, 1]) {
    const p = new THREE.Shape(); const x0 = k * hw * 1.1, x1 = k * (hw * (port ? 0.92 : 0.86)), y0 = top - hh * 0.1, y1 = hh * 1.1;
    p.moveTo(x0, y0); p.lineTo(x0 - k * pw * 2.2, y0); p.quadraticCurveTo(x1 - k * pw * 0.2, hh * 0.2, x1 - k * pw, y1); p.lineTo(x1 + k * pw * 1.6, y1); p.lineTo(x0, y1);
    const m = ext(p, 0.05, metal); m.position.z = -D * 0.98; g.add(m);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(hh * 0.006, hh * 0.5, 0.01), trim); lt.position.set(x1 - k * pw * 0.5, hh * 0.25, -D * 0.98 + 0.065); lt.rotation.z = k * 0.08; g.add(lt);
  }
  // top frame
  const tp = new THREE.Shape(); const ty = hh * (port ? 0.95 : 0.9);
  tp.moveTo(-hw * 1.1, hh * 1.1); tp.lineTo(-hw * 1.1, ty - hh * 0.02); tp.quadraticCurveTo(0, ty + hh * 0.06, hw * 1.1, ty - hh * 0.02); tp.lineTo(hw * 1.1, hh * 1.1);
  const tm = ext(tp, 0.05, dark); tm.position.z = -D * 0.97; g.add(tm);
  g.userData = { top, hh, hw };
  return g;
}
