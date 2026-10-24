// Jax's Adventures - procedural 3D characters (Jax + NPCs) with a pose-based animation rig
import * as THREE from '../vendor/three/three.module.min.js';
import { mulberry32, lerp, clamp } from './util.js';

const matCache = new Map();
export function M(color, rough = 0.8, metal = 0, o = {}) {
  const k = color + '|' + rough + '|' + metal + '|' + JSON.stringify(o, (key, v) => v && v.isTexture ? v.uuid : v);
  if (matCache.has(k)) return matCache.get(k);
  const phys = o.sheen || o.clearcoat || o.transmission; const P = Object.assign({ color, roughness: rough, metalness: metal }, o);
  const m = phys ? new THREE.MeshPhysicalMaterial(P) : new THREE.MeshStandardMaterial(P); matCache.set(k, m); return m;
}
let denim = null;
function denimTex() {
  if (denim) return denim; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const im = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const tw = ((x + y) % 4 < 2) ? 1 : 0.86; const n = 0.9 + Math.random() * 0.14; const o = (y * 64 + x) * 4; im.data[o] = 200 * tw * n; im.data[o + 1] = 215 * tw * n; im.data[o + 2] = 235 * tw * n; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0); denim = new THREE.CanvasTexture(c); denim.wrapS = denim.wrapT = THREE.RepeatWrapping; denim.repeat.set(6, 6); denim.colorSpace = THREE.SRGBColorSpace; return denim;
}
const cap = (r, len, mat, seg = 10) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 5, seg), mat); m.castShadow = true; return m; };
const sph = (r, mat, ws = 20, hs = 14) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat); m.castShadow = true; return m; };
const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
const cyl = (rt, rb, h, mat, s = 12) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), mat); m.castShadow = true; return m; };
const G = () => new THREE.Group();
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// limb segment hanging from a pivot: capsule centered at -len/2
function limb(parent, r, len, mat, x = 0, y = 0, z = 0, r2) {
  const j = at(G(), x, y, z); parent.add(j);
  const m = r2 ? new THREE.Mesh(new THREE.CylinderGeometry(r, r2, len, 12), mat) : cap(r, len - r * 2, mat); m.castShadow = true; m.position.y = -len / 2; j.add(m); return j;
}
function lathe(pts, mat, sz = 0.72, seg = 24) { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); const m = new THREE.Mesh(g, mat); m.scale.z = sz; m.castShadow = true; return m; }

// one-piece head: rounded cranium tapering into cheeks and chin (no seams)
const headGeoCache = {};
function headGeo(kid) {
  if (headGeoCache[kid]) return headGeoCache[kid];
  const g = new THREE.SphereGeometry(1, 48, 36); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const lo = Math.max(0, -y);
    x *= 0.9 * (1 - (kid ? 0.16 : 0.26) * lo * lo); z *= 0.97 * (1 - 0.1 * lo * lo); if (z > 0) z += (kid ? 0.05 : 0.07) * lo * (1 - lo * 0.5);
    if (y < 0) y *= kid ? 1.05 : 1.18; if (z < 0 && y < 0.2) z *= 1 - 0.08 * Math.max(0, 0.2 - y);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals(); headGeoCache[kid] = g; return g;
}
let hairTexC = null;
function hairTex() {
  if (hairTexC) return hairTexC; const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 260; i++) { const x = Math.random() * 128, l = 90 + Math.random() * 120; g.strokeStyle = `rgb(${l},${l},${l})`; g.lineWidth = 0.5 + Math.random() * 1.2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, 64); g.stroke(); }
  hairTexC = new THREE.CanvasTexture(c); hairTexC.wrapS = THREE.RepeatWrapping; return hairTexC;
}
let strandGeo = null;
function hairStrandGeo() {
  if (strandGeo) return strandGeo; const g = new THREE.SphereGeometry(0.5, 12, 10); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = y + 0.5; const k = Math.max(0.08, 1 - Math.pow(t, 1.6) * 0.92); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (0.6 + 0.4 * k)); p.setY(i, y * 1.05); }
  g.computeVertexNormals(); strandGeo = g; return g;
}

// ---------------------------------------------------------------- body builder
export function buildPerson(def, opt = {}) {
  const kid = !!def.kid || !!opt.jax; const S = kid ? { thigh: 0.27, shin: 0.26, foot: 0.07, torso: 0.36, neck: 0.035, headR: 0.122, ua: 0.205, fa: 0.185, shW: 0.118, hipW: 0.068, limbR: 0.056, armR: 0.04 }
    : { thigh: 0.44, shin: 0.43, foot: 0.08, torso: 0.53, neck: 0.05, headR: 0.112, ua: 0.31, fa: 0.28, shW: 0.17, hipW: 0.095, limbR: 0.062, armR: 0.048 };
  if (def.big) { S.shW *= 1.12; S.limbR *= 1.1; }
  if (def.female && !kid) { S.shW *= 0.9; S.torso *= 0.96; }
  const hipY = S.thigh + S.shin + S.foot;
  const skin = M(def.skin, 0.55, 0, { sheen: 0.35, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6 });
  const shirtC = def.shirt, pantsC = def.pants;
  const shirt = opt.jax ? M(0x1e1e22, 0.92, 0, { sheen: 0.6, sheenColor: new THREE.Color(0x6a6a78), sheenRoughness: 0.5 }) : M(shirtC, 0.85, 0, { sheen: 0.3, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7 });
  const pants = opt.jax || def.jeans ? M(0x3d5a82, 0.9, 0, { map: denimTex() }) : M(pantsC, 0.88);
  const hairM = M(def.hair, 0.68, 0, { sheen: 0.4, sheenColor: new THREE.Color(0x7a5a40), sheenRoughness: 0.45, bumpMap: hairTex(), bumpScale: 1.5 });
  const shoeM = opt.jax ? M(0xe8e8ea, 0.7) : M(def.adult ? 0x3a2c22 : 0xdadada, 0.75), soleM = M(opt.jax ? 0x3a3a40 : 0x22201e, 0.9);
  const B = {}; const root = G(); B.root = root;
  const hips = at(G(), 0, hipY, 0); root.add(hips); B.hips = hips;
  // pelvis
  const pel = lathe([[0.001, -0.1], [0.05, -0.097], [0.088, -0.072], [0.106, -0.025], [0.11, 0.04], [0.108, 0.07], [0.001, 0.075]], pants, 0.66);
  pel.scale.multiplyScalar(kid ? 1 : 1.3); hips.add(pel);
  // legs
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const th = limb(hips, S.limbR * 1.12, S.thigh, pants, s * S.hipW, -0.02, 0, S.limbR * 0.92); B['hip' + k] = th;
    const kn = limb(th, S.limbR * 0.92, S.shin, pants, 0, -S.thigh, 0, S.limbR * 0.78); B['kn' + k] = kn;
    const ft = at(G(), 0, -S.shin, 0); kn.add(ft); B['ft' + k] = ft;
    const shoe = cap(S.limbR * 0.95, S.foot * 1.6, shoeM, 8); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.05, 1, 0.75); at(shoe, 0, -S.foot * 0.45, S.foot * 0.55); ft.add(shoe);
    const sole = cap(S.limbR * 0.98, S.foot * 1.6, soleM, 8); sole.rotation.x = Math.PI / 2; sole.scale.set(1.08, 1.02, 0.3); at(sole, 0, -S.foot * 0.85, S.foot * 0.55); ft.add(sole);
    if (opt.jax) { const st = box(0.004, 0.022, 0.07, M(0xd2462a, 0.6)); at(st, s * S.limbR * 0.98, -S.foot * 0.35, S.foot * 0.5); ft.add(st); }
  }
  // torso
  const spine = at(G(), 0, 0.03, 0); hips.add(spine); B.spine = spine;
  const T = S.torso; const tw = kid ? 1 : 1.32 * (def.big ? 1.1 : 1) * (def.female ? 0.92 : 1);
  const torso = lathe([[0.001, -0.02], [0.112 * tw, -0.02], [0.118 * tw, T * 0.18], [0.122 * tw, T * 0.42], [0.138 * tw, T * 0.68], [0.136 * tw, T * 0.84], [0.11 * tw, T * 0.95], [0.055 * tw, T * 1.0], [0.001, T * 1.0]], shirt, def.big ? 0.82 : 0.72);
  spine.add(torso); B.torso = torso;
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.114 * tw, 0.012, 6, 24), shirt); hem.rotation.x = Math.PI / 2; hem.scale.y = def.big ? 0.82 : 0.72; hem.position.y = -0.012; hem.castShadow = true; spine.add(hem);
  const chest = at(G(), 0, T * 0.5, 0); spine.add(chest); B.chest = chest;
  if (opt.jax) { const collar = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.011, 8, 20), shirt); collar.rotation.x = Math.PI / 2; collar.scale.y = 0.8; at(collar, 0, T * 0.5 - 0.005, 0.004); chest.add(collar); }
  if (def.apron) { const a = box(0.26 * tw, T * 0.85, 0.02, M(def.apron, 0.9)); at(a, 0, T * 0.05, 0.1 * tw * 0.72 + 0.012); chest.add(a); }
  if (def.badge) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.022, 6), M(0xd8b040, 0.3, 0.9)); at(b, -0.07 * tw, T * 0.25, 0.135 * tw * 0.82 + 0.004); chest.add(b); const pk = box(0.07, 0.06, 0.01, M(def.shirt, 0.9)); at(pk, 0.07 * tw, T * 0.22, 0.135 * tw * 0.82); chest.add(pk); }
  if (def.female && !kid) { for (const s of [-1, 1]) { const b = sph(0.05 * tw, shirt, 12, 10); b.scale.set(1, 0.85, 0.7); at(b, s * 0.055 * tw, T * 0.2, 0.08 * tw); chest.add(b); } }
  // arms
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    const sh = at(G(), s * S.shW * tw, T * 0.4, 0); chest.add(sh); B['sh' + k] = sh;
    const ball = sph(S.armR * 1.15, shirt, 14, 10); ball.scale.set(1, 0.95, 1.1); sh.add(ball);
    const ua = limb(sh, S.armR * 1.05, S.ua, opt.shortSleeve ? skin : shirt, 0, 0, 0, S.armR * 0.95); B['ua' + k] = ua; ua.rotation.z = s * 0.08;
    const el = limb(ua, S.armR * 0.92, S.fa, opt.jax || def.longSleeve !== false ? shirt : skin, 0, -S.ua, 0, S.armR * 0.78); B['el' + k] = el;
    if (opt.jax) { const cuff = cyl(S.armR * 0.84, S.armR * 0.84, 0.025, shirt); at(cuff, 0, -S.fa + 0.012, 0); el.add(cuff); }
    const hand = at(G(), 0, -S.fa, 0); el.add(hand); B['hand' + k] = hand;
    const palm = sph(S.armR * 0.95, skin, 12, 10); palm.scale.set(0.75, 1.15, 0.55); palm.position.y = -S.armR * 0.9; hand.add(palm);
    const th = sph(S.armR * 0.4, skin, 8, 6); th.scale.set(0.8, 1.4, 0.8); at(th, -s * S.armR * 0.5, -S.armR * 0.6, S.armR * 0.35); th.rotation.z = s * 0.6; hand.add(th);
  }
  // neck + head
  const neck = at(G(), 0, T * 0.5, 0); chest.add(neck); B.neck = neck;
  const nk = cyl(0.038 * (kid ? 1 : 1.18), 0.042 * (kid ? 1 : 1.2), S.neck + 0.03, skin); nk.position.y = S.neck / 2; neck.add(nk);
  const head = at(G(), 0, S.neck + S.headR * 0.86, 0.012); neck.add(head); B.head = head;
  buildHead(head, B, def, S.headR, skin, hairM, opt, kid);
  if (!kid) head.scale.setScalar(1.08);
  // accessories
  if (opt.jax) { const bp = G(); B.backpack = bp; at(bp, 0, T * 0.2, -0.1); chest.add(bp); }
  root.userData = { B, S, hipY, kid };
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  const rig = new Rig(root, B, S, hipY, def, opt); return rig;
}

function buildHead(head, B, def, r, skin, hairM, opt, kid) {
  const cran = new THREE.Mesh(headGeo(kid), skin); cran.scale.setScalar(r); cran.castShadow = true; head.add(cran);
  for (const s of [-1, 1]) { const e = sph(r * 0.24, skin, 14, 10); e.scale.set(0.42, 1, 0.72); at(e, s * r * 0.88, -r * 0.1, -r * 0.03); head.add(e); }
  const nose = sph(r * 0.1, skin, 14, 10); nose.scale.set(1.0, 0.9, 1.0); at(nose, 0, -r * 0.24, r * 0.95); head.add(nose);
  const nb = sph(r * 0.075, skin, 10, 8); nb.scale.set(0.85, 2.0, 1); at(nb, 0, -r * 0.1, r * 0.91); head.add(nb);
  for (const s of [-1, 1]) { const al = sph(r * 0.055, skin, 8, 6); at(al, s * r * 0.075, -r * 0.27, r * 0.9); head.add(al); }
  // eyes (set into sockets)
  const white = M(0xf2eee8, 0.35), iris = M(opt.jax ? 0x5a3519 : def.eye || 0x4a3320, 0.2), pupil = M(0x080604, 0.15), hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  B.lids = []; B.eyes = []; const er = r * 0.145;
  for (const s of [-1, 1]) {
    const eg = at(G(), s * r * 0.3, r * 0.0, r * 0.83); head.add(eg); B.eyes.push(eg);
    const eb = sph(er, white, 18, 14); eb.castShadow = false; eg.add(eb);
    const ir = new THREE.Mesh(new THREE.SphereGeometry(er * 1.01, 20, 8, 0, Math.PI * 2, 0, 0.62), iris); ir.rotation.x = Math.PI / 2; eg.add(ir);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(er * 1.02, 16, 6, 0, Math.PI * 2, 0, 0.27), pupil); pu.rotation.x = Math.PI / 2; eg.add(pu);
    const h = new THREE.Mesh(new THREE.SphereGeometry(er * 0.16, 8, 6), hi); at(h, er * 0.3, er * 0.32, er * 0.92); eg.add(h);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.12, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), skin); lid.rotation.x = -0.55; eg.add(lid); B.lids.push(lid);
    const low = new THREE.Mesh(new THREE.SphereGeometry(er * 1.1, 18, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), skin); low.rotation.x = -0.25; eg.add(low);
    const ry = opt.jax && s > 0 ? 0.04 : 0; const bc = new THREE.CatmullRomCurve3([[0.12, 0.2 + ry * 0.5, 0.955], [0.27, 0.245 + ry, 0.94], [0.44, 0.215 + ry * 1.2, 0.86]].map(([x, y, z]) => new THREE.Vector3(s * x * r, y * r, z * r)));
    const brow = new THREE.Mesh(new THREE.TubeGeometry(bc, 8, r * 0.028, 5), hairM); head.add(brow);
    if (def.glasses || opt.glasses) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.19, r * 0.022, 6, 20), M(0x2a2a2a, 0.4, 0.6)); at(ring, s * r * 0.3, r * 0.0, r * 0.97); head.add(ring); }
  }
  if (def.glasses || opt.glasses) { const br = box(r * 0.16, r * 0.03, r * 0.03, M(0x2a2a2a, 0.4, 0.6)); at(br, 0, r * 0.03, r * 0.99); head.add(br); }
  // mouth: Jax has a slight mischievous half-smile (right corner up)
  const mp = opt.jax ? [[-0.2, -0.5, 0.88], [-0.07, -0.53, 0.92], [0.07, -0.52, 0.915], [0.21, -0.45, 0.87]] : [[-0.22, -0.5, 0.87], [0, -0.52, 0.915], [0.22, -0.5, 0.87]];
  const curve = new THREE.CatmullRomCurve3(mp.map(([x, y, z]) => new THREE.Vector3(x * r, y * r, z * r)));
  const mouth = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, r * 0.02, 6), M(0x86504a, 0.55)); head.add(mouth); B.mouth = mouth;
  if (def.beard) { const bd = sph(r * 0.78, M(def.beard, 0.9), 16, 12); bd.scale.set(1, 0.85, 0.85); at(bd, 0, -r * 0.58, r * 0.3); head.add(bd); }
  if (def.mustache || def.beard) { const mu = cap(r * 0.07, r * 0.36, M(def.mustache || def.beard, 0.9), 6); mu.rotation.z = Math.PI / 2; at(mu, 0, -r * 0.4, r * 0.92); head.add(mu); }
  if (opt.jax) jaxHair(head, r, hairM);
  else if (!def.bald) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 28, 18, 0, Math.PI * 2, 0, 1.5), hairM); c.rotation.x = -0.55; c.position.set(0, r * 0.03, -r * 0.03); head.add(c);
    if (def.longHair) { const lh = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.85, r * 2.2, 18, 1, true, Math.PI * 0.62, Math.PI * 1.76), hairM); lh.material.side = THREE.DoubleSide; lh.rotation.y = Math.PI; at(lh, 0, -r * 0.7, -r * 0.1); head.add(lh); }
    else hairClumps(head, r, hairM, 28, 0.5, def.old ? 0.25 : 0.4, 7);
  }
  if (def.hat) head.add(makeHat(def.hat, def.hatCol, r));
}
// hair clumps: flattened ellipsoids lying along the scalp, flowing from a crown whorl
const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function clump(head, geo, mat, pos, flow, normal, w, len, th, lift, twist) {
  _z.copy(normal).normalize(); _y.copy(flow).addScaledVector(_z, -flow.dot(_z)).normalize();
  _y.applyAxisAngle(_z, twist); _y.addScaledVector(_z, lift).normalize(); _x.crossVectors(_y, _z).normalize(); _z.crossVectors(_x, _y);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; _m4.makeBasis(_x, _y, _z); m.quaternion.setFromRotationMatrix(_m4);
  m.position.copy(pos).addScaledVector(_y, len * 0.42); m.scale.set(w, len, th); head.add(m); return m;
}
function hairClumps(head, r, mat, n, maxTh, len, seed) {
  const rnd = mulberry32(seed); const geo = hairStrandGeo(); const crown = new THREE.Vector3(0, 0.82, -0.5).normalize();
  for (let i = 0; i < n; i++) {
    const th = Math.acos(1 - rnd() * 1.2), ph = rnd() * Math.PI * 2; const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
    if (d.z > 0.5 && d.y < 0.5) continue; const flow = d.clone().sub(crown); if (flow.lengthSq() < 0.01) flow.set(0, 0, 1);
    clump(head, geo, mat, d.clone().multiplyScalar(r * 1.0).setY(d.y * r * 1.0 + r * 0.03), flow, d, r * (0.3 + rnd() * 0.12), r * len * (0.8 + rnd() * 0.5), r * 0.12, 0.1, (rnd() - 0.5) * 0.5);
  }
}
function jaxHair(head, r, hairM) {
  // base cap (crown + nape), hairline high on the forehead
  const c = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 32, 20, 0, Math.PI * 2, 0, 1.58), hairM); c.rotation.x = -0.55; c.position.set(0, r * 0.03, -r * 0.03); head.add(c);
  const top = sph(r * 0.92, hairM, 24, 16); top.scale.set(1.04, 0.6, 1.06); at(top, 0, r * 0.6, -r * 0.03); head.add(top);
  const rnd = mulberry32(2024); const geo = hairStrandGeo(); const crown = new THREE.Vector3(0.12, 0.8, -0.52).normalize();
  // thick tousled volume, fuller on top
  for (let i = 0; i < 170; i++) {
    const th = Math.acos(1 - rnd() * 1.05), ph = rnd() * Math.PI * 2; const d = new THREE.Vector3(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
    if (d.z > 0.45 && d.y < 0.62) continue; if (Math.abs(d.x) > 0.75 && d.y < 0.15 && d.z > -0.3) continue;
    const flow = d.clone().sub(crown); if (flow.lengthSq() < 0.02) flow.set(rnd() - 0.5, 0, rnd() - 0.5);
    if (d.z > 0.0) flow.add(new THREE.Vector3(0, 0, 0.9)); // top hair sweeps forward
    const topness = Math.max(0, d.y); const R = r * (1.03 + topness * 0.1 + rnd() * 0.04);
    clump(head, geo, hairM, d.clone().multiplyScalar(R).add(new THREE.Vector3(0, r * 0.03, -r * 0.02)), flow, d, r * (0.22 + rnd() * 0.1), r * (0.5 + rnd() * 0.32), r * (0.1 + topness * 0.06), 0.1 + rnd() * 0.32 * topness, (rnd() - 0.5) * 1.0);
  }
  // messy forward fringe over the forehead
  for (let i = 0; i < 24; i++) {
    const x = (i / 23 - 0.5) * 1.3 + (rnd() - 0.5) * 0.12; const d = new THREE.Vector3(x * 0.72, 0.58 + rnd() * 0.12, 0.7).normalize();
    const flow = new THREE.Vector3(x * 0.6 + (rnd() - 0.5) * 0.8, -1, 0.25);
    clump(head, geo, hairM, d.clone().multiplyScalar(r * 1.04).add(new THREE.Vector3(0, r * 0.04, 0)), flow, d, r * (0.15 + rnd() * 0.08), r * (0.36 + rnd() * 0.24), r * 0.08, 0.12 + rnd() * 0.12, (rnd() - 0.5) * 0.5);
  }
  // sides above the ears
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const d = new THREE.Vector3(s * 0.88, 0.35 - i * 0.07 + rnd() * 0.05, -0.15 + i * 0.09).normalize(); clump(head, geo, hairM, d.clone().multiplyScalar(r * 1.0), new THREE.Vector3(0, -1, 0.3), d, r * 0.24, r * 0.32, r * 0.09, 0.05, (rnd() - 0.5) * 0.5); }
}
export function makeHat(kind, col, r = 0.112) {
  const g = G(); const m = M(col || 0x8a7348, 0.85);
  if (kind === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), m); c.position.y = r * 0.18; g.add(c); const b = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.05, 20, 1, false, -Math.PI / 2.6, Math.PI / 1.3), m); at(b, 0, r * 0.4, r * 0.55); b.scale.z = 1.1; g.add(b); }
  else if (kind === 'bucket') { const c = cyl(r * 0.95, r * 1.1, r * 0.75, m, 20); c.position.y = r * 0.68; g.add(c); const b = cyl(r * 1.55, r * 1.6, r * 0.05, m, 24); b.position.y = r * 0.36; b.rotation.x = 0.08; g.add(b); }
  else if (kind === 'ranger') { const c = cyl(r * 0.55, r * 1.0, r * 0.95, m, 20); c.position.y = r * 0.82; g.add(c); for (const s of [-1, 1]) { const d = box(r * 0.3, r * 0.3, r * 0.12, m); at(d, s * r * 0.18, r * 1.28, 0); d.rotation.z = s * 0.5; g.add(d); } const b = cyl(r * 1.9, r * 1.9, r * 0.06, m, 28); b.position.y = r * 0.4; g.add(b); const band = cyl(r * 1.0, r * 1.02, r * 0.14, M(0x3a2a18, 0.7), 20); band.position.y = r * 0.48; g.add(band); }
  else if (kind === 'cowboy') { const c = cyl(r * 0.8, r * 1.0, r * 0.85, m, 20); c.position.y = r * 0.8; c.scale.z = 0.85; g.add(c); const b = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, r * 0.32, 6, 24), m); b.rotation.x = Math.PI / 2; b.scale.z = 0.25; b.position.y = r * 0.42; g.add(b); const d = cyl(r * 1.45, r * 1.45, r * 0.04, m, 24); d.position.y = r * 0.38; g.add(d); }
  else if (kind === 'sun') { const c = cyl(r * 0.85, r * 1.05, r * 0.6, m, 20); c.position.y = r * 0.65; g.add(c); const b = cyl(r * 2.3, r * 2.3, r * 0.03, m, 28); b.position.y = r * 0.36; g.add(b); const rb = cyl(r * 1.06, r * 1.06, r * 0.15, M(0xe05a7a, 0.7), 20); rb.position.y = r * 0.45; g.add(rb); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeRod(tier = 1) {
  const g = G(); const cols = [0x6a4a2a, 0x6a4a2a, 0xc8b070, 0x3a6ab0, 0x222226, 0xe0b030];
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 1.5, 6), M(cols[tier] || 0x6a4a2a, 0.5, tier >= 4 ? 0.6 : 0)); rod.position.y = 0.6; g.add(rod);
  const grip = cyl(0.016, 0.016, 0.22, M(0x2a2018, 0.9), 8); grip.position.y = -0.05; g.add(grip);
  const reel = cyl(0.03, 0.03, 0.03, M(0xaaaaaa, 0.3, 0.8), 12); reel.rotation.z = Math.PI / 2; at(reel, 0.03, 0.08, 0); g.add(reel);
  const tip = new THREE.Object3D(); tip.position.y = 1.35; g.add(tip); g.userData.tip = tip;
  return g;
}
export function makePaddle() { const g = G(); const s = cyl(0.016, 0.016, 1.3, M(0x9a6a3a, 0.6), 8); g.add(s); const b = box(0.14, 0.34, 0.02, M(0xb07a40, 0.6)); b.position.y = -0.75; g.add(b); return g; }

// ---------------------------------------------------------------- animation
const J = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'shR', 'uaL', 'uaR', 'elL', 'elR', 'hipL', 'hipR', 'knL', 'knR', 'ftL', 'ftR'];
export class Rig {
  constructor(root, B, S, hipY, def, opt) {
    this.root = root; this.B = B; this.S = S; this.hipY = hipY; this.def = def; this.opt = opt;
    this.cur = {}; for (const j of J) this.cur[j] = [0, 0, 0]; this.cur.hy = 0; this.cur.hz = 0; this.blinkT = 2; this.look = 0;
    this.extras = {};
  }
  setExtra(name, obj, parentJoint) { if (this.extras[name] === obj) return; if (this.extras[name]) this.extras[name].removeFromParent(); this.extras[name] = obj; if (obj) this.B[parentJoint].add(obj); }
  // anim: name, t: time in anim, o: {spd, look, power, aim}
  pose(anim, t, dt, o = {}) {
    const T = {}; for (const j of J) T[j] = [0, 0, 0]; let hy = 0, hz = 0; const kid = this.root.userData.kid;
    const sw = (a, f = 1, ph = 0) => Math.sin(t * f + ph) * a;
    const walk = (ph, A, kneeA, armA, bob, lean) => {
      const s = Math.sin(ph), c = Math.cos(ph);
      T.hipL[0] = -s * A; T.hipR[0] = s * A; T.knL[0] = Math.max(0, c) * kneeA + 0.08; T.knR[0] = Math.max(0, -c) * kneeA + 0.08;
      T.ftL[0] = -T.hipL[0] * 0.3 - 0.05; T.ftR[0] = -T.hipR[0] * 0.3 - 0.05;
      T.uaL[0] = s * armA; T.uaR[0] = -s * armA; T.elL[0] = -0.25 - Math.max(0, s) * armA * 0.6; T.elR[0] = -0.25 - Math.max(0, -s) * armA * 0.6;
      hy = -Math.abs(Math.cos(ph)) * bob + bob * 0.5; T.spine[0] = lean; T.spine[1] = s * 0.08; T.chest[1] = -s * 0.12; T.head[0] = -lean * 0.6; T.hips[1] = -s * 0.06;
    };
    const breathe = sw(0.025, 2.2);
    switch (anim) {
      case 'idle': default:
        T.spine[0] = breathe * 0.5; T.chest[0] = breathe; T.uaL[2] = -0.06 + sw(0.02, 2.2); T.uaR[2] = 0.06 - sw(0.02, 2.2); T.elL[0] = -0.12; T.elR[0] = -0.15;
        T.head[1] = (o.look || 0) + sw(0.25, 0.37) * (o.lookAround ? 1 : 0.3); T.head[0] = sw(0.04, 0.5);
        T.hipL[2] = -0.03; T.hipR[2] = 0.03; T.hipR[0] = -0.04; T.knR[0] = 0.08; hy = sw(0.004, 2.2); break;
      case 'walk': walk(t * 9.0 * (o.spdk || 1), 0.48, 0.75, 0.4, 0.035, 0.05); break;
      case 'run': walk(t * 13.0, 0.85, 1.35, 0.9, 0.07, 0.22); T.elL[0] = -1.3; T.elR[0] = -1.3; T.uaL[2] = -0.12; T.uaR[2] = 0.12; break;
      case 'sneak': { walk(t * 7.0, 0.32, 0.35, 0.15, 0.015, 0.45); hy -= this.hipY * 0.24; T.hipL[0] -= 0.75; T.hipR[0] -= 0.75; T.knL[0] += 1.15; T.knR[0] += 1.15; T.ftL[0] -= 0.35; T.ftR[0] -= 0.35; T.uaL[0] = -0.5; T.uaR[0] = -0.6; T.elL[0] = -1.1; T.elR[0] = -1.2; T.uaL[2] = -0.2; T.uaR[2] = 0.2; T.head[0] = -0.35; T.head[1] = sw(0.25, 1.3); break; }
      case 'crouch': hy = -this.hipY * 0.3; T.spine[0] = 0.5 + breathe; T.hipL[0] = -1.05; T.hipR[0] = -0.95; T.knL[0] = 1.65; T.knR[0] = 1.55; T.ftL[0] = -0.55; T.ftR[0] = -0.55; T.hipL[2] = -0.15; T.hipR[2] = 0.15; T.uaL[0] = -0.6; T.uaR[0] = -0.4; T.elL[0] = -1.2; T.elR[0] = -1.1; T.head[0] = -0.4; T.head[1] = sw(0.5, 0.8); break;
      case 'jump': T.hipL[0] = -0.9; T.hipR[0] = -0.4; T.knL[0] = 1.4; T.knR[0] = 0.9; T.uaL[0] = -2.4; T.uaR[0] = -2.2; T.uaL[2] = -0.3; T.uaR[2] = 0.3; T.elL[0] = -0.3; T.elR[0] = -0.3; T.spine[0] = 0.1; break;
      case 'swim': { const ph = t * 4.5; T.spine[0] = 1.05; T.head[0] = -0.85; T.neck[0] = -0.3; T.hipL[0] = sw(0.35, 9) - 0.1; T.hipR[0] = -sw(0.35, 9) - 0.1; T.knL[0] = 0.3; T.knR[0] = 0.3;
        T.uaL[0] = -2.0 + Math.sin(ph) * 1.1; T.uaR[0] = -2.0 - Math.sin(ph) * 1.1; T.uaL[2] = -0.5 - Math.cos(ph) * 0.4; T.uaR[2] = 0.5 + Math.cos(ph) * 0.4; T.elL[0] = -0.4; T.elR[0] = -0.4; hy = -0.15; hz = -0.1; break; }
      case 'fish': { const st = o.fishSt || 'wait'; T.hipL[0] = -0.15; T.hipR[0] = 0.12; T.knL[0] = 0.2; T.knR[0] = 0.1; T.spine[0] = 0.05;
        let a = -0.9; if (st === 'aim') a = -0.9 - (o.power || 0) * 1.7 + 0.0; if (st === 'cast') a = -0.9 - 1.6 * Math.max(0, 1 - t * 6) + Math.min(1, t * 6) * 0.5; if (st === 'reel') a = -1.15 + sw(0.08, 22); if (st === 'bite') a = -1.0 + sw(0.05, 30);
        T.uaR[0] = a; T.elR[0] = -0.9; T.uaR[2] = 0.15; T.uaL[0] = st === 'reel' ? -0.9 + sw(0.15, 18) : -0.7; T.elL[0] = -1.2; T.uaL[2] = -0.35; T.uaL[1] = 0.4;
        T.chest[1] = st === 'aim' ? 0.3 * (o.power || 0) : 0; T.head[0] = 0.15; if (st === 'caught') { T.uaL[0] = -2.6; T.uaR[0] = -2.2; T.elL[0] = -0.3; T.elR[0] = -0.4; } break; }
      case 'celebrate': { const k = Math.abs(Math.sin(t * 7)); hy = k * 0.12; T.uaL[0] = -2.7 + sw(0.25, 14); T.uaR[0] = -2.7 - sw(0.25, 14); T.uaL[2] = -0.35; T.uaR[2] = 0.35; T.elL[0] = -0.35; T.elR[0] = -0.35; T.hipL[0] = -k * 0.4; T.hipR[0] = -k * 0.3; T.knL[0] = k * 0.8; T.knR[0] = k * 0.6; T.head[0] = -0.2; break; }
      case 'cheer': T.uaL[0] = -2.6 + sw(0.3, 8); T.uaR[0] = -2.5 - sw(0.3, 8); T.uaL[2] = -0.4; T.uaR[2] = 0.4; T.elL[0] = -0.4; T.elR[0] = -0.4; hy = Math.abs(sw(0.05, 8)); break;
      case 'grab': T.spine[0] = 0.45; T.uaR[0] = -1.4; T.elR[0] = -0.2; T.uaL[0] = -0.3; T.elL[0] = -0.6; T.hipL[0] = -0.3; T.knL[0] = 0.5; T.knR[0] = 0.4; hy = -0.06; T.head[0] = 0.2; break;
      case 'throw': { const k = clamp(t * 3, 0, 1); T.uaR[0] = -1.2; T.uaR[2] = 1.4 - k * 1.2; T.uaR[1] = -1 + k * 2.2; T.elR[0] = -0.6; T.chest[1] = -0.6 + k * 1.1; T.spine[0] = 0.25; T.uaL[0] = -0.4; T.knL[0] = 0.4; T.knR[0] = 0.3; hy = -0.05; break; }
      case 'bike': { const ph = t * 6 * (o.spdk || 1); hy = 0.22; T.spine[0] = 0.55; T.head[0] = -0.45; T.hipL[0] = -1.2 + Math.sin(ph) * 0.45; T.hipR[0] = -1.2 - Math.sin(ph) * 0.45; T.knL[0] = 1.3 - Math.cos(ph) * 0.4; T.knR[0] = 1.3 + Math.cos(ph) * 0.4; T.uaL[0] = -1.15; T.uaR[0] = -1.15; T.elL[0] = -0.35; T.elR[0] = -0.35; T.uaL[2] = -0.2; T.uaR[2] = 0.2; break; }
      case 'canoe': { const ph = t * (o.spd > 0.4 ? 3.2 : 0.8); hy = -this.hipY + 0.12; T.hipL[0] = -1.45; T.hipR[0] = -1.45; T.knL[0] = 0.9; T.knR[0] = 0.9; T.hipL[2] = -0.15; T.hipR[2] = 0.15; T.chest[1] = Math.sin(ph) * 0.55; T.spine[0] = 0.15 + Math.max(0, Math.cos(ph)) * 0.2;
        T.uaL[0] = -1.0 + Math.sin(ph) * 0.5; T.uaR[0] = -1.0 - Math.sin(ph) * 0.5; T.elL[0] = -0.9; T.elR[0] = -0.9; T.uaL[2] = -0.3; T.uaR[2] = 0.3; break; }
      case 'sit': case 'nap': case 'fishsit': hy = -this.hipY + (o.seat !== undefined ? o.seat : this.hipY * 0.62); T.hipL[0] = -1.5; T.hipR[0] = -1.5; T.knL[0] = anim === 'fishsit' ? 1.1 + sw(0.15, 1.3) : 1.5; T.knR[0] = anim === 'fishsit' ? 1.1 - sw(0.15, 1.3) : 1.5; T.ftL[0] = 0; T.ftR[0] = 0; T.hipL[2] = -0.06; T.hipR[2] = 0.06;
        T.uaL[0] = -0.35; T.uaR[0] = -0.35; T.elL[0] = -0.9; T.elR[0] = -0.9; T.chest[0] = breathe; T.head[1] = o.look || 0;
        if (anim === 'nap') { T.spine[0] = -0.35; T.head[0] = -0.1; T.head[2] = 0.35; T.uaL[0] = -0.1; T.uaR[0] = -0.1; T.elL[0] = -1.6; T.elR[0] = -1.6; }
        if (anim === 'fishsit') { T.uaR[0] = -1.1; T.elR[0] = -0.6; T.uaL[0] = -0.9; T.elL[0] = -0.9; T.spine[0] = 0.15; } break;
      case 'look': T.head[1] = (o.look || 0); T.chest[1] = (o.look || 0) * 0.4; T.uaL[0] = -0.2; T.uaR[0] = -0.2; T.elL[0] = -1.4; T.elR[0] = -1.4; T.uaL[2] = -0.5; T.uaR[2] = 0.5; T.chest[0] = breathe; break;
      case 'point': T.uaR[0] = -1.55; T.uaR[2] = 0.1; T.elR[0] = -0.05; T.uaL[0] = -0.2; T.uaL[2] = -0.6; T.elL[0] = -1.6; T.spine[0] = -0.05; T.head[0] = -0.05; break;
      case 'caught': T.head[0] = 0.45; T.spine[0] = 0.15; T.uaL[0] = 0.1; T.uaR[0] = 0.1; T.elL[0] = -0.2; T.elR[0] = -0.2; T.uaL[2] = -0.05; T.uaR[2] = 0.05; break;
      case 'play': { walk(t * 11, 0.7, 1.1, 0.7, 0.06, 0.12); hy += Math.abs(Math.sin(t * 5.5)) * 0.08; break; }
    }
    // blend
    const k = clamp(dt * (anim === 'walk' || anim === 'run' || anim === 'play' || anim === 'bike' ? 18 : 10), 0, 1);
    for (const j of J) { const c = this.cur[j], tg = T[j]; for (let i = 0; i < 3; i++) c[i] += (tg[i] - c[i]) * k; const b = this.B[j]; if (b) b.rotation.set(c[0], c[1], c[2]); }
    if (this.B.uaL) { this.B.uaL.rotation.z += -0.07; this.B.uaR.rotation.z += 0.07; }
    this.cur.hy += (hy - this.cur.hy) * k; this.cur.hz += (hz - this.cur.hz) * k; this.B.hips.position.y = this.hipY + this.cur.hy; this.B.hips.position.z = this.cur.hz;
    // blink
    this.blinkT -= dt; let lid = -0.55; if (this.blinkT < 0.12) lid = 0.75; if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 3.5;
    if (anim === 'nap' || anim === 'sleep') lid = 0.8; if (anim === 'sneak' || anim === 'crouch') lid = Math.max(lid, -0.3);
    for (const l of this.B.lids) l.rotation.x = lid;
  }
}
