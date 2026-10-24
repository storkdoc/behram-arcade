// Jax's Adventures - buildings & props (procedural meshes, merged by material per area for speed)
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/utils/BufferGeometryUtils.js';
import * as T from './textures.js';
import { PROPS, DECKS, BRIDGES, DOCK, STASHES, SITES, DECOR_SPOTS, LOC, HIDES, ground, H } from './world.js';
import { mulberry32 } from './util.js';

const PI = Math.PI;
const MC = {};
const once = (k, f) => MC[k] || (MC[k] = f());
const std = (o) => new THREE.MeshStandardMaterial(o);
export const MAT = {
  wood: () => once('wood', () => std({ map: T.plankTex([150, 112, 74], 8), roughness: 0.86 })),
  dwood: () => once('dwood', () => std({ map: T.plankTex([92, 64, 44], 6), roughness: 0.88 })),
  deck: () => once('deck', () => std({ map: T.plankTex([150, 116, 80], 10), roughness: 0.9 })),
  grey: () => once('greyw', () => std({ map: T.plankTex([128, 120, 108], 10), roughness: 0.92 })),
  logs: () => once('logs', () => std({ map: T.logTex(), roughness: 0.9 })),
  logEnd: () => once('logEnd', () => std({ color: 0xc8a070, roughness: 0.9 })),
  stone: () => once('stone', () => std({ map: T.rockTex(), color: 0xc4bcb0, roughness: 0.95 })),
  roofBrown: () => once('rb', () => std({ map: T.shingleTex([96, 62, 46]), roughness: 0.9 })),
  roofGreen: () => once('rg', () => std({ map: T.shingleTex([62, 92, 66]), roughness: 0.9 })),
  roofRed: () => once('rr', () => std({ map: T.shingleTex([130, 52, 44]), roughness: 0.88 })),
  roofGrey: () => once('rgy', () => std({ map: T.shingleTex([78, 80, 88]), roughness: 0.88 })),
  red: () => once('sidr', () => std({ map: T.sidingTex([170, 62, 46]), roughness: 0.82 })),
  cream: () => once('sidc', () => std({ map: T.sidingTex([236, 226, 200]), roughness: 0.8 })),
  blue: () => once('sidb', () => std({ map: T.sidingTex([84, 132, 168]), roughness: 0.8 })),
  tan: () => once('sidt', () => std({ map: T.sidingTex([150, 118, 82]), roughness: 0.85 })),
  trim: () => once('trim', () => std({ color: 0xf1ece0, roughness: 0.6 })),
  metal: () => once('metal', () => std({ color: 0x8c9298, roughness: 0.38, metalness: 0.75 })),
  dmetal: () => once('dmetal', () => std({ color: 0x2c2f33, roughness: 0.5, metalness: 0.6 })),
  rubber: () => once('rubber', () => std({ color: 0x1b1b1d, roughness: 0.85 })),
  glass: () => once('glass', () => std({ color: 0x1a2630, roughness: 0.06, metalness: 0.5 })),
  win: () => once('win', () => std({ color: 0x23303b, roughness: 0.15, metalness: 0.3, emissive: 0xffc06a, emissiveIntensity: 0 })),
  bulb: () => once('bulb', () => std({ color: 0xfff0c8, emissive: 0xffd28a, emissiveIntensity: 0.3, roughness: 0.4 })),
  neon: () => once('neon', () => std({ color: 0xff4a5a, emissive: 0xff3048, emissiveIntensity: 0.2, roughness: 0.4 })),
  ash: () => once('ash', () => std({ color: 0x2a2624, roughness: 1 })),
  char: () => once('char', () => std({ color: 0x1c1410, roughness: 1 })),
};
export const paint = (c, r = 0.7, m = 0) => once('p' + c + r + m, () => std({ color: c, roughness: r, metalness: m }));
export const fabric = (c) => once('f' + c, () => std({ color: c, map: T.fabricTex(), roughness: 0.92, side: THREE.DoubleSide }));

// ---------------- geometry helpers ----------------
function scaleBoxUV(g, w, h, d, tile) {
  const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
export function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
export const bx = (w, h, d, mat, x = 0, y = 0, z = 0, tile = 2) => mesh(scaleBoxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), mat, x, y, z);
export const cy = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 12, tile = 1) => { const g = new THREE.CylinderGeometry(rt, rb, h, seg); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, (rt + rb) * PI / tile), uv.getY(i) * h / tile); return mesh(g, mat, x, y, z); };
export const sp = (r, mat, x = 0, y = 0, z = 0, ws = 12, hs = 8) => mesh(new THREE.SphereGeometry(r, ws, hs), mat, x, y, z);
const G = () => new THREE.Group();
function rotX(o, a) { o.rotation.x = a; return o; } function rotY(o, a) { o.rotation.y = a; return o; } function rotZ(o, a) { o.rotation.z = a; return o; }
function prism(w, h, len, mat, tile = 2) { // triangle cross-section (base w, height h) extruded along x, base at y=0, centered
  const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); g.rotateY(PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
  return mesh(g, mat);
}
// a beam between two points
export function beam(a, b, r, mat, seg = 6) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); const m = cy(r, r, L, mat, 0, 0, 0, seg); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m; }
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- building parts ----------------
function gable(g, hw, hd, top, rh, roofMat, wallMat, over = 0.55, side = 0.45) {
  g.add(at(prism(2 * hd, rh, 2 * hw, wallMat), 0, top, 0));
  const slope = rh / hd, a = Math.atan(slope), run = hd + over, L = run / Math.cos(a) + 0.12, t = 0.16;
  for (const s of [-1, 1]) { const m = bx(2 * hw + 2 * side, t, L, roofMat, 0, 0, 0, 2.2); m.rotation.x = s * a; m.position.set(0, top + rh - slope * run / 2 + Math.cos(a) * t / 2 + 0.02, s * (run / 2 - 0.03) + s * Math.sin(a) * t / 2); g.add(m); }
  const ridge = cy(0.11, 0.11, 2 * hw + 2 * side + 0.05, roofMat, 0, top + rh + 0.1, 0, 8); ridge.rotation.z = PI / 2; g.add(ridge);
  // fascia boards under eaves
  for (const s of [-1, 1]) g.add(bx(2 * hw + 2 * side, 0.18, 0.06, MAT.trim(), 0, top + rh - slope * run - 0.02, s * run));
}
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
// window on a wall; local -z faces outward when ry = 0
function windowAt(g, x, y, z, ry = 0, w = 1.2, h = 1.0, o = {}) {
  const k = G(); const tm = o.trim || MAT.trim();
  k.add(bx(w + 0.18, h + 0.18, 0.08, tm, 0, 0, 0.0));
  k.add(bx(w, h, 0.1, MAT.win(), 0, 0, -0.02));
  k.add(bx(0.05, h, 0.12, tm, 0, 0, -0.04)); k.add(bx(w, 0.05, 0.12, tm, 0, 0, -0.04));
  k.add(bx(w + 0.3, 0.07, 0.2, tm, 0, -h / 2 - 0.1, -0.08));
  if (o.shutters) for (const s of [-1, 1]) k.add(bx(w * 0.42, h + 0.1, 0.05, o.shutters, s * (w / 2 + w * 0.25), 0, -0.02));
  if (o.box) { k.add(bx(w + 0.1, 0.22, 0.26, MAT.wood(), 0, -h / 2 - 0.27, -0.16)); for (let i = 0; i < 5; i++) k.add(sp(0.08, paint([0xe0445a, 0xf4c430, 0xffffff][i % 3], 0.8), -w / 2 + 0.1 + i * w / 4.5, -h / 2 - 0.12, -0.16, 6, 4)); }
  k.position.set(x, y, z); k.rotation.y = ry; g.add(k); return k;
}
function doorAt(g, x, z, ry = 0, w = 1.15, h = 2.2, mat = MAT.dwood(), y0 = 0.15, o = {}) {
  const k = G(); k.add(bx(w + 0.24, h + 0.14, 0.1, o.trim || MAT.trim(), 0, h / 2 + 0.05, 0));
  k.add(bx(w, h, 0.12, mat, 0, h / 2, -0.03, 1));
  if (o.glass !== false) k.add(bx(w * 0.6, h * 0.28, 0.13, MAT.win(), 0, h * 0.72, -0.04));
  k.add(sp(0.045, MAT.metal(), w * 0.36, h * 0.47, -0.11, 8, 6));
  k.position.set(x, y0, z); k.rotation.y = ry; g.add(k); return k;
}
function porch(g, w, z0, depth, roofY, n, o = {}) {
  const dm = o.deck || MAT.deck(); const zc = z0 - depth / 2;
  const d = bx(depth, 0.16, w, dm, 0, 0.06, zc, 2); d.rotation.y = PI / 2; g.add(d);
  g.add(bx(w, 0.12, 0.1, MAT.dwood(), 0, 0.02, z0 - depth));
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.2 + i * (w - 0.4) / (n - 1); g.add(o.logPosts ? cy(0.12, 0.13, roofY, MAT.logs(), x, roofY / 2, z0 - depth + 0.25, 8) : bx(0.16, roofY, 0.16, o.post || MAT.trim(), x, roofY / 2, z0 - depth + 0.25)); }
  const r = bx(w + 0.4, 0.12, depth + 0.4, o.roof || MAT.roofBrown(), 0, roofY + 0.12, zc - 0.05, 2); r.rotation.x = -0.14; g.add(r);
  g.add(bx(w + 0.4, 0.2, 0.08, MAT.trim(), 0, roofY - 0.02, z0 - depth - 0.12));
  if (o.rail) for (const s of [-1, 1]) { const x0 = s > 0 ? 1.4 : -w / 2 + 0.2, x1 = s > 0 ? w / 2 - 0.2 : -1.4; g.add(bx(x1 - x0, 0.08, 0.08, o.post || MAT.trim(), (x0 + x1) / 2, 0.9, z0 - depth + 0.25)); for (let x = x0; x <= x1 + 0.01; x += 0.35) g.add(bx(0.05, 0.75, 0.05, o.post || MAT.trim(), x, 0.5, z0 - depth + 0.25)); }
}
function foundation(g, hw, hd, mat = MAT.stone()) { g.add(bx(2 * hw + 0.3, 1.4, 2 * hd + 0.3, mat, 0, -0.55, 0, 1.5)); }
function signBoard(lines, w, h, o = {}) { const t = T.signTex(lines, o); const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, emissive: o.glow ? 0xffffff : 0x000000, emissiveMap: o.glow ? t : null, emissiveIntensity: 0 }); if (o.glow) MAT_SIGNS.push(m); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.castShadow = false; p.receiveShadow = true; return p; }
export const MAT_SIGNS = [];
function barrel(g, x, z, s = 1) { g.add(cy(0.36 * s, 0.32 * s, 0.9 * s, MAT.dwood(), x, 0.45 * s, z, 12)); for (const y of [0.15, 0.45, 0.75]) g.add(cy(0.37 * s * (y === 0.45 ? 1.03 : 1), 0.37 * s, 0.05, MAT.dmetal(), x, y * s, z, 12)); }
function crate(g, x, z, s = 0.7, ry = 0, y = 0) { const c = bx(s, s, s, MAT.wood(), x, y + s / 2, z, 0.7); c.rotation.y = ry; g.add(c); }

// ---------------- buildings ----------------
const B = {};
B.store = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 3.8;
  foundation(g, hw, hd); g.add(bx(2 * hw, wh, 2 * hd, MAT.red(), 0, 0.15 + wh / 2, 0, 2.5));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(bx(0.22, wh, 0.22, MAT.trim(), sx * hw, 0.15 + wh / 2, sz * hd));
  gable(g, hw, hd, wh + 0.15, 1.7, MAT.roofBrown(), MAT.red());
  // false front + sign
  g.add(bx(2 * hw + 0.3, 2.5, 0.3, MAT.red(), 0, wh + 1.2, -hd - 0.1)); g.add(bx(2 * hw + 0.6, 0.22, 0.5, MAT.trim(), 0, wh + 2.5, -hd - 0.12)); g.add(bx(2 * hw + 0.4, 0.12, 0.42, MAT.trim(), 0, wh + 0.05, -hd - 0.15));
  const sg = signBoard([p.name || 'GENERAL STORE'], 10, 1.6, { bg: '#22402c', fg: '#f6e7b0', border: '#e9c46a', w: 1600, h: 256 }); at(sg, 0, wh + 1.25, -hd - 0.27); sg.rotation.y = PI; g.add(sg);
  doorAt(g, -0.65, -hd - 0.02, 0, 1.2, 2.4, MAT.dwood()); doorAt(g, 0.65, -hd - 0.02, 0, 1.2, 2.4, MAT.dwood());
  for (const x of [-4.4, 4.4]) windowAt(g, x, 1.7, -hd - 0.04, 0, 2.6, 1.6, { box: true });
  for (const z of [-2.5, 2.5]) { windowAt(g, hw + 0.04, 2, z, -PI / 2, 1.3, 1.1, { shutters: paint(0x2f4f3a) }); windowAt(g, -hw - 0.04, 2, z, PI / 2, 1.3, 1.1, { shutters: paint(0x2f4f3a) }); }
  porch(g, 2 * hw, -hd, 2.6, 3.3, 5, { roof: MAT.roofBrown() });
  barrel(g, -hw + 0.6, -hd - 2.0); barrel(g, -hw + 1.4, -hd - 1.6, 0.9); crate(g, hw - 0.7, -hd - 0.6, 0.8, 0.2); crate(g, hw - 0.7, -hd - 0.6, 0.6, 0.6, 0.8); crate(g, hw - 1.6, -hd - 0.5, 0.7, -0.3);
  // bench + ice chest
  const ice = bx(1.3, 0.95, 0.75, paint(0xf2f4f6, 0.4), -3.0, 0.5, -hd - 0.5); g.add(ice); const it = signBoard(['ICE'], 0.9, 0.35, { bg: '#2a6fb8', fg: '#fff', border: '#fff' }); at(it, -3.0, 0.75, -hd - 0.88); it.rotation.y = PI; g.add(it);
  benchAt(g, 3.0, -hd - 0.45, 0);
  // chimney
  g.add(bx(0.8, 2.6, 0.8, MAT.stone(), hw - 1.5, wh + 1.6, 2.0, 1));
  return g;
};
function benchAt(g, x, z, ry) { const k = G(); for (let i = 0; i < 3; i++) k.add(bx(1.6, 0.05, 0.12, MAT.wood(), 0, 0.45, -0.14 + i * 0.14, 1)); for (let i = 0; i < 2; i++) k.add(bx(1.6, 0.1, 0.04, MAT.wood(), 0, 0.68 + i * 0.16, 0.24, 1)); for (const s of [-1, 1]) { k.add(bx(0.06, 0.45, 0.4, MAT.dmetal(), s * 0.7, 0.22, 0.02)); k.add(bx(0.06, 0.5, 0.06, MAT.dmetal(), s * 0.7, 0.72, 0.24)); } k.position.set(x, 0, z); k.rotation.y = ry; g.add(k); return k; }

function logWalls(g, hw, hd, wh) {
  g.add(bx(2 * hw, wh, 2 * hd, MAT.logs(), 0, 0.15 + wh / 2, 0, 3));
  // crossed log ends at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let y = 0.35; y < wh; y += 0.3) {
    const a = cy(0.15, 0.15, 0.7, MAT.logs(), sx * hw, y, sz * (hd + 0.12), 7); a.rotation.x = PI / 2; g.add(a);
    const b = cy(0.15, 0.15, 0.7, MAT.logs(), sx * (hw + 0.12), y + 0.15, sz * hd, 7); b.rotation.z = PI / 2; g.add(b);
  }
}
B.tradepost = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 3.3;
  foundation(g, hw, hd); logWalls(g, hw, hd, wh); gable(g, hw, hd, wh + 0.15, 1.6, MAT.roofGreen(), MAT.logs());
  doorAt(g, 0, -hd - 0.03, 0, 1.3, 2.3, MAT.dwood(), 0.15, { trim: MAT.dwood() });
  for (const x of [-3.2, 3.2]) windowAt(g, x, 1.8, -hd - 0.05, 0, 1.5, 1.1, { trim: MAT.dwood(), shutters: paint(0x9a3a2a) });
  for (const z of [-1.5, 1.5]) { windowAt(g, hw + 0.05, 1.9, z, -PI / 2, 1.1, 0.9, { trim: MAT.dwood() }); windowAt(g, -hw - 0.05, 1.9, z, PI / 2, 1.1, 0.9, { trim: MAT.dwood() }); }
  porch(g, 2 * hw, -hd, 2.4, 3.0, 4, { logPosts: true, roof: MAT.roofGreen(), post: MAT.logs() });
  const sg = signBoard([p.name || 'TRADING POST'], 6.4, 0.95, { bg: '#6b4428', fg: '#fbe9c0', border: '#d9b26a', w: 1400, h: 208 }); sg.rotation.y = PI; at(sg, 0, 3.9, -hd - 0.12); g.add(sg);
  // goods on the porch
  barrel(g, hw - 0.6, -hd - 1.9); const ab = G(); for (let i = 0; i < 9; i++) ab.add(sp(0.09, paint(i % 3 ? 0xc8282a : 0x8bc34a, 0.5), (i % 3 - 1) * 0.17, 0.92 + Math.floor(i / 3) * 0.02, (Math.floor(i / 3) - 1) * 0.17, 8, 6)); ab.position.set(hw - 0.6, 0, -hd - 1.9); g.add(ab);
  const rack = G(); rack.add(bx(1.8, 0.06, 0.06, MAT.dwood(), 0, 1.7, 0)); for (const s of [-1, 1]) rack.add(bx(0.08, 1.75, 0.08, MAT.dwood(), s * 0.9, 0.87, 0));
  [0xb5452f, 0x2c6e8f, 0xd9a441].forEach((c, i) => { const r = bx(0.5, 1.1, 0.03, fabric(c), -0.55 + i * 0.55, 1.12, 0.02); rack.add(r); }); rack.position.set(-hw + 1.4, 0, -hd - 1.3); g.add(rack);
  for (const s of [-1, 1]) { const pd = G(); pd.add(cy(0.025, 0.025, 1.5, MAT.wood(), 0, 0, 0, 6)); pd.add(bx(0.18, 0.45, 0.03, MAT.wood(), 0, -0.85, 0)); pd.position.set(-1.8 + s * 0.08, 2.3, -hd - 0.1); pd.rotation.z = s * 0.5; g.add(pd); }
  crate(g, -hw + 0.6, -hd - 2.0, 0.6, 0.3); crate(g, 2.1, -hd - 0.5, 0.7, 0.1);
  g.add(bx(0.7, 2.2, 0.7, MAT.stone(), -hw + 1.2, wh + 1.5, 1.5, 1));
  return g;
};
B.diner = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 3.7;
  foundation(g, hw, hd); g.add(bx(2 * hw, wh, 2 * hd, MAT.cream(), 0, 0.15 + wh / 2, 0, 2.5));
  g.add(bx(2 * hw + 0.06, 0.35, 2 * hd + 0.06, paint(0xc23a3a, 0.5), 0, 0.85, 0)); // stripe
  g.add(bx(2 * hw + 0.5, 0.45, 2 * hd + 0.5, paint(0xc23a3a, 0.5), 0, wh + 0.3, 0)); g.add(bx(2 * hw + 0.3, 0.12, 2 * hd + 0.3, MAT.metal(), 0, wh + 0.58, 0));
  g.add(bx(2 * hw, 0.1, 2 * hd, MAT.roofGrey(), 0, wh + 0.12, 0));
  for (const x of [-3.6, 3.6]) windowAt(g, x, 2.0, -hd - 0.04, 0, 2.8, 1.5, { trim: MAT.metal() });
  doorAt(g, 0, -hd - 0.03, 0, 1.3, 2.3, paint(0xc23a3a, 0.5), 0.15, { trim: MAT.metal() });
  for (let i = 0; i < 6; i++) { const st = bx(0.42, 0.06, 2.2, fabric(i % 2 ? 0xffffff : 0xc23a3a), -1.05 + i * 0.42, 2.85, -hd - 0.9); st.rotation.x = -0.35; g.add(st); }
  for (const z of [-1.6, 1.6]) { windowAt(g, hw + 0.04, 2, z, -PI / 2, 1.6, 1.2, { trim: MAT.metal() }); windowAt(g, -hw - 0.04, 2, z, PI / 2, 1.6, 1.2, { trim: MAT.metal() }); }
  // rooftop sign
  for (const s of [-1, 1]) g.add(bx(0.12, 1.0, 0.12, MAT.dmetal(), s * 3.2, wh + 1.0, -hd + 0.6));
  const sg = signBoard([p.name || 'DINER'], 7.2, 1.3, { bg: '#16202c', fg: '#ff5a6a', border: '#ffd27a', w: 1400, h: 252, glow: true }); sg.rotation.y = PI; at(sg, 0, wh + 2.0, -hd + 0.52); g.add(sg);
  const back = bx(7.4, 1.5, 0.1, MAT.dmetal(), 0, wh + 2.0, -hd + 0.6); g.add(back);
  for (let i = 0; i < 2; i++) { const t = G(); t.add(cy(0.5, 0.5, 0.05, MAT.trim(), 0, 0.75, 0, 16)); t.add(cy(0.05, 0.06, 0.75, MAT.metal(), 0, 0.37, 0, 6)); t.add(cy(0.03, 0.03, 2.3, MAT.metal(), 0, 1.15, 0, 6)); t.add(mesh(new THREE.ConeGeometry(1.3, 0.5, 10, 1, true), fabric(i ? 0x2a7fd4 : 0xf2c230), 0, 2.4, 0)); t.position.set(i ? 3.6 : -3.6, 0, -hd - 2.6); g.add(t); }
  return g;
};
B.shed = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 2.6;
  foundation(g, hw, hd); g.add(bx(2 * hw, wh, 2 * hd, MAT.blue(), 0, 0.15 + wh / 2, 0, 2)); gable(g, hw, hd, wh + 0.15, 0.9, MAT.roofGrey(), MAT.blue(), 0.4, 0.3);
  doorAt(g, -0.9, -hd - 0.03, 0, 1.0, 2.1, MAT.dwood()); windowAt(g, 1.2, 1.6, -hd - 0.04, 0, 1.2, 0.9);
  const sg = signBoard([p.name || 'BAIT'], 3.6, 0.7, { bg: '#f4f0e0', fg: '#1f4f7a', border: '#1f4f7a', w: 1024, h: 200 }); sg.rotation.y = PI; at(sg, 0, wh + 0.45, -hd - 0.08); g.add(sg);
  g.add(bx(1.4, 1.0, 0.8, paint(0xf2f4f6, 0.4), 2.0, 0.5, -hd - 0.7));
  const ws = signBoard(['LIVE WORMS', 'NIGHTCRAWLERS'], 1.0, 0.7, { bg: '#fff3c4', fg: '#7a3a1a', border: '#7a3a1a', w: 512, h: 360 }); ws.rotation.y = PI; at(ws, -2.3, 1.3, -hd - 0.08); g.add(ws);
  return g;
};
B.ranger = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 3.6;
  foundation(g, hw, hd); g.add(bx(2 * hw + 0.1, 1.3, 2 * hd + 0.1, MAT.stone(), 0, 0.8, 0, 1.2)); g.add(bx(2 * hw, wh - 1.2, 2 * hd, MAT.tan(), 0, 1.45 + (wh - 1.2) / 2, 0, 2));
  gable(g, hw, hd, wh + 0.15, 1.7, MAT.roofGreen(), MAT.tan());
  doorAt(g, 0, -hd - 0.06, 0, 1.2, 2.3, paint(0x2f4f3a, 0.6));
  for (const x of [-3, 3]) windowAt(g, x, 2.2, -hd - 0.06, 0, 1.4, 1.1, { shutters: paint(0x2f4f3a) });
  for (const z of [-1.5, 1.5]) { windowAt(g, hw + 0.06, 2.3, z, -PI / 2, 1.2, 1.0); windowAt(g, -hw - 0.06, 2.3, z, PI / 2, 1.2, 1.0); }
  porch(g, 2 * hw, -hd, 2.2, 3.1, 4, { roof: MAT.roofGreen(), post: MAT.dwood(), rail: true });
  // front sign on posts
  const sgr = G(); for (const s of [-1, 1]) sgr.add(cy(0.12, 0.13, 2.2, MAT.logs(), s * 1.6, 1.1, 0, 8));
  const sg = signBoard([p.name || 'RANGER STATION', 'PINECREST LAKE PARK'], 3.1, 1.1, { bg: '#4a3220', fg: '#f4d68a', border: '#f4d68a', w: 1024, h: 360 }); sg.rotation.y = PI; at(sg, 0, 1.55, -0.08); sgr.add(sg);
  const sgb = signBoard([p.name || 'RANGER STATION', 'PINECREST LAKE PARK'], 3.1, 1.1, { bg: '#4a3220', fg: '#f4d68a', border: '#f4d68a', w: 1024, h: 360 }); at(sgb, 0, 1.55, 0.08); sgr.add(sgb);
  sgr.add(bx(3.4, 1.25, 0.12, MAT.dwood(), 0, 1.55, 0)); sgr.position.set(-3.6, 0, -hd - 5.0); sgr.rotation.y = 0.4; g.add(sgr);
  // antenna + bench
  g.add(cy(0.03, 0.04, 3.2, MAT.metal(), hw - 1, wh + 2.6, 1.6, 6)); benchAt(g, 2.6, -hd - 0.5, 0);
  return g;
};
B.cabin = (p) => {
  const g = G(), hw = p.hw, hd = p.hd, wh = 2.7;
  foundation(g, hw, hd); logWalls(g, hw, hd, wh); gable(g, hw, hd, wh + 0.15, 1.5, MAT.roofBrown(), MAT.logs(), 0.6, 0.4);
  doorAt(g, 0.8, -hd - 0.03, 0, 1.0, 2.05, MAT.wood(), 0.15, { trim: MAT.dwood() });
  windowAt(g, -1.5, 1.6, -hd - 0.05, 0, 1.1, 0.9, { trim: MAT.dwood(), shutters: paint(0x3d6b4a), box: true });
  windowAt(g, hw + 0.05, 1.6, 0, -PI / 2, 1.0, 0.85, { trim: MAT.dwood() }); windowAt(g, -hw - 0.05, 1.6, 0.6, PI / 2, 1.0, 0.85, { trim: MAT.dwood() });
  porch(g, 2 * hw, -hd, 1.6, 2.6, 3, { logPosts: true, roof: MAT.roofBrown() });
  const sg = signBoard([p.name || 'HIDEOUT'], 2.6, 0.6, { bg: '#7a4f2c', fg: '#fff6dc', border: '#3a2414', w: 1024, h: 236 }); sg.rotation.y = PI; sg.rotation.z = 0.05; at(sg, -0.2, 2.5, -hd - 0.12); g.add(sg);
  g.add(bx(1.0, 0.02, 0.6, fabric(0x8a3a2a), 0.8, 0.2, -hd - 0.6));
  const ch = bx(0.9, 4.8, 0.9, MAT.stone(), hw + 0.3, 2.3, 0.8, 1); g.add(ch); g.add(bx(1.05, 0.15, 1.05, MAT.stone(), hw + 0.3, 4.75, 0.8, 1));
  return g;
};

// ---------------- foliage clusters (for the big tree) ----------------
const leafMat = () => once('leafM', () => std({ map: T.leafCard(), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xb8d090, roughness: 0.85 }));
function leafCluster(centers, seed = 1) {
  const rnd = mulberry32(seed); const geos = [];
  for (const [cx, cy_, cz, R, n] of centers) for (let i = 0; i < n; i++) {
    const q = new THREE.PlaneGeometry(1.7, 1.7); const u = rnd() * 2 - 1, th = rnd() * PI * 2, rr = R * Math.cbrt(rnd());
    const d = V(Math.sqrt(1 - u * u) * Math.cos(th), u * 0.7, Math.sqrt(1 - u * u) * Math.sin(th));
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rnd() * PI, rnd() * PI, rnd() * PI)); m.setPosition(cx + d.x * rr, cy_ + d.y * rr, cz + d.z * rr); q.applyMatrix4(m);
    const pos = q.attributes.position, nor = q.attributes.normal; for (let k = 0; k < pos.count; k++) { const nx = pos.getX(k) - cx, ny = pos.getY(k) - cy_ + R * 0.3, nz = pos.getZ(k) - cz; const l = Math.hypot(nx, ny, nz) || 1; nor.setXYZ(k, nx / l, ny / l, nz / l); }
    geos.push(q);
  }
  const m = mesh(mergeGeometries(geos), leafMat()); return m;
}
function taper(a, b, r0, r1, mat) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); const m = cy(r1, r0, L, mat, 0, 0, 0, 10); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m; }
B.bigtree = (p) => {
  const g = G(); const bark = once('bigbark', () => std({ map: T.barkTex(false), color: 0xa89888, roughness: 0.95 }));
  g.add(cy(0.72, 1.2, 10, bark, 0, 4.6, 0, 18, 1.5));
  for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2 + 0.3; const r = taper(V(Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5), V(Math.cos(a) * 2.0, -0.15, Math.sin(a) * 2.0), 0.42, 0.12, bark); g.add(r); }
  const br = [[0.4, 6.2, 4.2, 2.2], [1.6, 6.6, 4.0, 2.6], [2.7, 5.8, 3.9, 0.6], [3.7, 7.0, 3.6, 2.4], [4.7, 6.4, 4.3, 2.0], [5.6, 7.4, 3.4, 2.6]];
  const cl = [[0, 11, 0, 3.6, 70]];
  for (const [a, y, L, up] of br) { const e = V(Math.cos(a) * L, y + up, Math.sin(a) * L); g.add(taper(V(0, y, 0), e, 0.38, 0.14, bark)); cl.push([e.x, e.y + 0.6, e.z, 2.4, 34]); }
  g.add(leafCluster(cl, 7));
  // tree fort platform + hut
  const py = 4.3; g.add(cy(3.2, 3.2, 0.22, MAT.deck(), 0, py, 0, 10, 2)); g.add(cy(3.25, 3.25, 0.14, MAT.dwood(), 0, py - 0.17, 0, 10));
  for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; if (Math.abs(Math.sin(a) - 1) < 0.2) continue; g.add(bx(0.1, 0.95, 0.1, MAT.dwood(), Math.cos(a) * 3.05, py + 0.55, Math.sin(a) * 3.05)); const a2 = (i + 1) / 10 * PI * 2; if (Math.abs(Math.sin(a2) - 1) < 0.2) continue; const m = beam(V(Math.cos(a) * 3.05, py + 1.0, Math.sin(a) * 3.05), V(Math.cos(a2) * 3.05, py + 1.0, Math.sin(a2) * 3.05), 0.05, MAT.wood()); g.add(m); }
  for (const a of [0.5, 2.0, 3.6, 5.0]) g.add(taper(V(Math.cos(a) * 2.6, py - 0.2, Math.sin(a) * 2.6), V(Math.cos(a) * 0.8, py - 2.4, Math.sin(a) * 0.8), 0.1, 0.1, MAT.logs()));
  const hut = G(); hut.add(bx(2.0, 1.8, 2.0, MAT.wood(), 0, 0.9, 0, 1.6)); hut.add(at(prism(2.3, 1.0, 2.3, MAT.wood()), 0, 1.8, 0));
  for (const s of [-1, 1]) { const r = bx(2.6, 0.1, 1.75, MAT.roofRed(), 0, 2.32, s * 0.6, 1.5); r.rotation.x = s * Math.atan(1.0 / 1.15); hut.add(r); }
  hut.add(bx(0.8, 1.3, 0.06, MAT.char(), 0.2, 0.75, 1.01)); windowAt(hut, 1.02, 1.1, 0, -PI / 2, 0.7, 0.55, { trim: MAT.dwood() });
  hut.position.set(1.9, py + 0.1, 0); hut.rotation.y = PI / 2 * 0; g.add(hut);
  // ladder
  for (const s of [-1, 1]) g.add(beam(V(s * 0.3, 0, 3.75), V(s * 0.3, py + 1.0, 3.15), 0.045, MAT.wood()));
  for (let i = 1; i < 9; i++) { const t = i / 9; g.add(bx(0.62, 0.05, 0.06, MAT.wood(), 0, t * (py + 1.0), 3.75 - t * 0.6)); }
  // swing branch
  g.add(taper(V(-0.6, 5.4, 0.3), V(-3.8, 6.0, 1.8), 0.32, 0.14, bark));
  return g;
};

// ---------------- reusable small models ----------------
export function makeFish(col = 0x8aa0a8, len = 0.4, belly = 0xe8e4d8) {
  const g = G(); const b = sp(len * 0.5, paint(col, 0.35, 0.25), 0, 0, 0, 14, 10); b.scale.set(1, 0.42, 0.22); g.add(b);
  const bl = sp(len * 0.46, paint(belly, 0.4, 0.1), 0, -len * 0.04, 0, 12, 8); bl.scale.set(0.9, 0.3, 0.18); g.add(bl);
  const t = mesh(new THREE.ConeGeometry(len * 0.2, len * 0.3, 4), paint(col, 0.4, 0.2), -len * 0.6, 0, 0); t.rotation.z = PI / 2; t.scale.z = 0.25; g.add(t);
  const f = mesh(new THREE.ConeGeometry(len * 0.1, len * 0.22, 4), paint(col, 0.4, 0.2), -len * 0.05, len * 0.22, 0); f.scale.z = 0.2; g.add(f);
  for (const s of [-1, 1]) { g.add(sp(len * 0.045, paint(0x111111, 0.2), len * 0.36, len * 0.04, s * len * 0.085, 8, 6)); }
  return g;
}
export function makeCanoe(col = 0xc0392b) {
  const g = G(); const hull = new THREE.SphereGeometry(1, 24, 10, 0, PI * 2, PI / 2, PI / 2); const m = mesh(hull, std({ color: col, roughness: 0.45, side: THREE.DoubleSide })); m.scale.set(2.3, 0.42, 0.44); g.add(m);
  const inner = mesh(new THREE.SphereGeometry(0.97, 24, 8, 0, PI * 2, PI / 2, PI / 2), std({ map: T.plankTex([170, 130, 90], 10), roughness: 0.7, side: THREE.BackSide })); inner.scale.set(2.25, 0.4, 0.42); g.add(inner);
  const gw = mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), MAT.wood()); gw.rotation.x = PI / 2; gw.scale.set(2.3, 0.44, 1); g.add(gw);
  for (const x of [-1.1, 0, 1.1]) g.add(bx(0.18, 0.04, 0.8 * Math.sqrt(1 - (x / 2.3) ** 2), MAT.wood(), x, -0.08, 0));
  return g;
}
export function makeBike(col = 0x2a8fd8) {
  const g = G(); const fm = paint(col, 0.35, 0.5); const R = 0.33;
  for (const x of [-0.52, 0.52]) { const w = mesh(new THREE.TorusGeometry(R, 0.03, 8, 28), MAT.rubber(), x, R, 0); g.add(w); g.add(cy(0.04, 0.04, 0.08, MAT.metal(), x, R, 0, 8).rotateX(PI / 2)); for (let i = 0; i < 6; i++) { const s = bx(0.008, R * 2, 0.008, MAT.metal(), x, R, 0); s.rotation.z = i / 6 * PI; g.add(s); } }
  const P = { bb: V(0, 0.3, 0), seat: V(-0.16, 0.78, 0), head: V(0.36, 0.8, 0), rear: V(-0.52, R, 0), front: V(0.52, R, 0) };
  for (const [a, b] of [['bb', 'seat'], ['bb', 'head'], ['seat', 'head'], ['bb', 'rear'], ['seat', 'rear'], ['head', 'front']]) g.add(beam(P[a], P[b], 0.025, fm));
  g.add(bx(0.24, 0.05, 0.12, MAT.rubber(), -0.18, 0.84, 0)); g.add(beam(V(0.36, 0.8, 0), V(0.32, 0.98, 0), 0.02, MAT.metal()));
  g.add(beam(V(0.32, 0.98, -0.28), V(0.32, 0.98, 0.28), 0.018, MAT.metal())); for (const s of [-1, 1]) g.add(cy(0.025, 0.025, 0.1, MAT.rubber(), 0.32, 0.98, s * 0.26, 6).rotateX(PI / 2));
  g.add(cy(0.1, 0.1, 0.03, MAT.dmetal(), 0, 0.3, 0.05, 10).rotateX(PI / 2));
  g.add(bx(0.3, 0.12, 0.22, fabric(0xc8a060), 0.5, 0.88, 0)); // basket
  return g;
}

// ---------------- small props ----------------
const marker = (kind, x, y, z, o = {}) => { const m = new THREE.Object3D(); m.position.set(x, y, z); m.userData.mark = kind; Object.assign(m.userData, o); return m; };
B.flagpole = () => { const g = G(); g.add(cy(0.05, 0.08, 8, MAT.metal(), 0, 4, 0, 10)); g.add(sp(0.12, paint(0xe0b040, 0.3, 0.8), 0, 8.1, 0)); g.add(cy(0.5, 0.6, 0.3, MAT.stone(), 0, 0.1, 0, 10));
  const fl = makeFlag(['#2f6b3f', '#f4e6b8'], 'pine'); fl.position.set(0.06, 7.4, 0); g.add(fl); return g; };
function makeFlag(cols, kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d'); x.fillStyle = cols[0]; x.fillRect(0, 0, 256, 160);
  x.fillStyle = cols[1];
  if (kind === 'pine') { x.beginPath(); x.moveTo(128, 22); x.lineTo(176, 120); x.lineTo(80, 120); x.fill(); x.fillRect(120, 118, 16, 24); x.fillRect(0, 0, 256, 10); x.fillRect(0, 150, 256, 10); }
  else { x.font = '900 120px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('J', 128, 86); x.beginPath(); x.arc(70, 40, 14, 0, 7); x.fill(); x.fillRect(176, 112, 50, 12); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1.6, 1.0, 14, 6); geo.translate(0.8, -0.5, 0);
  const m = new THREE.Mesh(geo, std({ map: t, side: THREE.DoubleSide, roughness: 0.9 })); m.castShadow = true; m.userData.dyn = true; m.userData.flag = true; m.userData.base = Float32Array.from(geo.attributes.position.array); return m;
}
B.pumps = () => { const g = G(); g.add(bx(4.6, 0.25, 1.3, MAT.stone(), 0, 0.12, 0, 1));
  for (const x of [-1.2, 1.2]) { g.add(bx(0.7, 1.6, 0.5, paint(0xc8302a, 0.45), x, 1.05, 0)); g.add(bx(0.5, 0.35, 0.52, paint(0x1a1a1a, 0.2), x, 1.5, 0)); g.add(bx(0.4, 0.22, 0.53, MAT.bulb(), x, 1.5, 0)); g.add(cy(0.03, 0.03, 0.6, MAT.rubber(), x + 0.4, 1.0, 0.2, 6)); }
  for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(cy(0.1, 0.1, 4.4, MAT.trim(), s * 2.6, 2.2, t * 2.0, 8));
  g.add(bx(6.4, 0.5, 5.2, MAT.trim(), 0, 4.6, 0)); g.add(bx(6.5, 0.2, 5.3, paint(0xc8302a, 0.5), 0, 4.3, 0)); g.add(marker('lamp', 0, 4.25, 0)); return g; };
B.lamp = () => { const g = G(); g.add(cy(0.06, 0.09, 3.7, MAT.dmetal(), 0, 1.85, 0, 8)); g.add(cy(0.15, 0.2, 0.3, MAT.dmetal(), 0, 0.15, 0, 8)); g.add(bx(0.7, 0.05, 0.05, MAT.dmetal(), 0.3, 3.6, 0));
  const hd = mesh(new THREE.ConeGeometry(0.26, 0.22, 8, 1, true), MAT.dmetal(), 0.62, 3.52, 0); g.add(hd); g.add(sp(0.1, MAT.bulb(), 0.62, 3.42, 0, 10, 6)); g.add(marker('lamp', 0.62, 3.3, 0)); return g; };
B.car = (p) => { const g = G(); const body = paint(p.color || 0x2a5a9a, 0.3, 0.55);
  g.add(bx(4.2, 0.62, 1.8, body, 0, 0.66, 0)); g.add(bx(1.0, 0.18, 1.7, body, 1.55, 1.02, 0)); g.add(bx(2.3, 0.08, 1.56, body, -0.25, 1.62, 0));
  const cab = bx(2.2, 0.62, 1.6, MAT.glass(), -0.25, 1.3, 0); g.add(cab); for (const x of [-1.33, 0.83]) g.add(bx(0.12, 0.62, 1.62, body, x, 1.3, 0));
  for (const sx of [-1.35, 1.35]) for (const sz of [-0.82, 0.82]) { g.add(cy(0.34, 0.34, 0.26, MAT.rubber(), sx, 0.34, sz, 16).rotateX(PI / 2)); g.add(cy(0.2, 0.2, 0.28, MAT.metal(), sx, 0.34, sz, 10).rotateX(PI / 2)); }
  for (const s of [-0.6, 0.6]) { g.add(bx(0.06, 0.16, 0.36, MAT.bulb(), 2.1, 0.78, s)); g.add(bx(0.06, 0.14, 0.3, paint(0xd01818, 0.3), -2.1, 0.8, s)); }
  g.add(bx(0.12, 0.2, 1.84, MAT.metal(), 2.12, 0.42, 0)); g.add(bx(0.12, 0.2, 1.84, MAT.metal(), -2.12, 0.42, 0)); return g; };
B.truck = (p) => { const g = G(); const body = paint(p.color || 0x3d5a3a, 0.35, 0.5);
  g.add(bx(4.8, 0.8, 1.95, body, 0, 0.85, 0)); g.add(bx(1.7, 0.85, 1.85, body, 0.5, 1.65, 0)); g.add(bx(1.5, 0.6, 1.88, MAT.glass(), 0.55, 1.75, 0)); g.add(bx(1.75, 0.08, 1.9, body, 0.5, 2.1, 0));
  g.add(bx(2.0, 0.08, 1.9, MAT.trim(), -1.4, 1.27, 0)); for (const s of [-1, 1]) g.add(bx(2.0, 0.45, 0.06, body, -1.4, 1.5, s * 0.95)); g.add(bx(0.06, 0.45, 1.9, body, -2.4, 1.5, 0));
  g.add(bx(4.82, 0.12, 1.97, MAT.trim(), 0, 0.95, 0)); g.add(bx(0.5, 0.12, 0.25, paint(0x2050ff, 0.3), 0.5, 2.2, -0.35)); g.add(bx(0.5, 0.12, 0.25, paint(0xff2a2a, 0.3), 0.5, 2.2, 0.35));
  for (const sx of [-1.5, 1.5]) for (const sz of [-0.88, 0.88]) { g.add(cy(0.4, 0.4, 0.3, MAT.rubber(), sx, 0.4, sz, 16).rotateX(PI / 2)); g.add(cy(0.22, 0.22, 0.32, MAT.metal(), sx, 0.4, sz, 10).rotateX(PI / 2)); }
  for (const s of [-0.65, 0.65]) g.add(bx(0.06, 0.18, 0.36, MAT.bulb(), 2.42, 1.0, s)); return g; };
B.outhouse = () => { const g = G(); g.add(bx(1.6, 2.3, 1.6, MAT.grey(), 0, 1.15, 0, 1.2)); const r = bx(1.9, 0.1, 2.0, MAT.roofGrey(), 0, 2.42, 0); r.rotation.x = 0.15; g.add(r);
  doorAt(g, 0, -0.82, 0, 0.9, 2.0, MAT.wood(), 0.02, { glass: false, trim: MAT.grey() }); const moon = mesh(new THREE.RingGeometry(0.06, 0.12, 12, 1, 0.6, 4.2), MAT.char(), 0, 1.75, -0.9); moon.rotation.y = PI; g.add(moon); return g; };
B.sign = (p) => { const g = G(); for (const s of [-1, 1]) g.add(cy(0.07, 0.08, 2.3, MAT.logs(), s * 0.7, 1.15, 0, 7));
  const lines = (p.text || []).filter(Boolean); const f = signBoard(lines, 1.7, 1.0, { bg: '#5a3a22', fg: '#f4e8c4', w: 600, h: 360 }); f.rotation.y = PI; at(f, 0, 1.6, -0.07); g.add(f);
  const b = signBoard(lines, 1.7, 1.0, { bg: '#5a3a22', fg: '#f4e8c4', w: 600, h: 360 }); at(b, 0, 1.6, 0.07); g.add(b); g.add(bx(1.8, 1.08, 0.1, MAT.dwood(), 0, 1.6, 0)); return g; };
B.benches = () => { const g = G(); benchAt(g, 0, 0, 0); return g; };
B.fence = (p) => { const g = G(); const L = p.len || 10; for (let x = -L / 2; x <= L / 2 + 0.01; x += 2) g.add(cy(0.08, 0.09, 1.2, MAT.logs(), x, 0.6, 0, 7)); for (const y of [0.45, 0.95]) { const r = cy(0.06, 0.06, L, MAT.logs(), 0, y, 0, 6); r.rotation.z = PI / 2; g.add(r); } return g; };
B.watertower = () => { const g = G(); const m = paint(0x8a9aa8, 0.5, 0.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(beam(V(sx * 2.1, 0, sz * 2.1), V(sx * 1.5, 9, sz * 1.5), 0.12, m));
  for (const y of [3, 6]) for (let i = 0; i < 4; i++) { const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; const [x0, z0] = a[i], [x1, z1] = a[(i + 1) % 4]; const r = 2.1 - y / 9 * 0.6; g.add(beam(V(x0 * r, y, z0 * r), V(x1 * r, y, z1 * r), 0.06, m)); }
  g.add(cy(2.5, 2.5, 3.4, m, 0, 10.7, 0, 24)); g.add(mesh(new THREE.ConeGeometry(2.7, 1.2, 24), m, 0, 13.0, 0)); g.add(cy(2.6, 2.6, 0.2, MAT.dmetal(), 0, 9.0, 0, 24));
  const t = signBoard(['PINECREST'], 3.6, 0.8, { bg: '#8a9aa8', fg: '#1d3550', border: '#8a9aa8', w: 800, h: 180 }); t.position.set(0, 11, -2.52); t.rotation.y = PI; g.add(t); return g; };
B.lookout = () => { const g = G(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(beam(V(sx * 2.2, -0.5, sz * 2.2), V(sx * 1.7, 7, sz * 1.7), 0.14, MAT.logs()));
  for (const y of [2.5, 5]) for (let i = 0; i < 4; i++) { const a = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; const [x0, z0] = a[i], [x1, z1] = a[(i + 1) % 4]; const r = 2.2 - y / 7.5 * 0.5; g.add(beam(V(x0 * r, y, z0 * r), V(x1 * r, y - 2.2, z1 * r), 0.07, MAT.logs())); }
  g.add(bx(4.4, 0.25, 4.4, MAT.deck(), 0, 7.1, 0)); g.add(bx(3.2, 2.2, 3.2, MAT.wood(), 0, 8.3, 0)); for (let i = 0; i < 4; i++) windowAt(g, Math.sin(i * PI / 2) * 1.62, 8.5, -Math.cos(i * PI / 2) * 1.62, -i * PI / 2, 2.2, 1.0);
  const roof = mesh(new THREE.ConeGeometry(3.3, 1.5, 4), MAT.roofGreen(), 0, 10.15, 0); roof.rotation.y = PI / 4; g.add(roof);
  for (let i = 0; i < 9; i++) g.add(bx(1.0, 0.08, 0.35, MAT.wood(), 2.9, 0.3 + i * 0.75, -2.4 + i * 0.5)); return g; };
B.chest = () => { const g = G(); g.add(bx(1.0, 0.55, 0.65, MAT.wood(), 0, 0.28, 0, 0.8)); const lid = cy(0.33, 0.33, 1.0, MAT.wood(), 0, 0.55, 0, 12, 0.8); lid.rotation.z = PI / 2; lid.scale.set(1, 1, 0.98); g.add(lid);
  for (const x of [-0.35, 0.35]) { g.add(bx(0.07, 0.57, 0.67, MAT.dmetal(), x, 0.28, 0)); const b = cy(0.34, 0.34, 0.07, MAT.dmetal(), x, 0.55, 0, 12); b.rotation.z = PI / 2; g.add(b); } g.add(bx(0.14, 0.18, 0.05, paint(0xd8b040, 0.3, 0.8), 0, 0.5, -0.34)); return g; };
B.mailbox = () => { const g = G(); g.add(bx(0.1, 1.1, 0.1, MAT.wood(), 0, 0.55, 0)); const b = cy(0.16, 0.16, 0.5, paint(0x2f5f9a, 0.4, 0.3), 0, 1.2, 0, 12); b.rotation.x = PI / 2; g.add(b); g.add(bx(0.32, 0.16, 0.5, paint(0x2f5f9a, 0.4, 0.3), 0, 1.12, 0)); g.add(bx(0.03, 0.25, 0.06, paint(0xd02020), 0.18, 1.3, 0.05)); return g; };
B.woodpile = () => { const g = G(); for (let r = 0; r < 4; r++) for (let i = 0; i < 6 - r; i++) { const l = cy(0.13, 0.13, 0.85, MAT.logs(), -0.75 + i * 0.28 + r * 0.14, 0.13 + r * 0.23, 0, 8); l.rotation.x = PI / 2; g.add(l); } g.add(cy(0.3, 0.32, 0.5, MAT.logEnd(), 1.4, 0.25, 0.3, 10)); return g; };
B.table = () => { const g = G(); for (let i = 0; i < 5; i++) g.add(bx(2.0, 0.06, 0.15, MAT.wood(), 0, 0.76, -0.34 + i * 0.17, 1)); for (const s of [-1, 1]) for (let i = 0; i < 2; i++) g.add(bx(2.0, 0.05, 0.14, MAT.wood(), 0, 0.45, s * (0.6 + i * 0.14), 1));
  for (const x of [-0.75, 0.75]) { for (const s of [-1, 1]) { const l = bx(0.08, 0.95, 0.08, MAT.wood(), x, 0.38, s * 0.32); l.rotation.x = -s * 0.55; g.add(l); } g.add(bx(0.08, 0.06, 1.6, MAT.wood(), x, 0.42, 0)); }
  g.add(bx(1.2, 0.01, 0.62, fabric(0xd8463a), 0.2, 0.795, 0)); return g; };
B.cooler = (p) => { const g = G(); g.add(bx(0.72, 0.4, 0.44, paint(p.color || 0xd8352a, 0.45), 0, 0.22, 0)); g.add(bx(0.75, 0.08, 0.47, MAT.trim(), 0, 0.46, 0)); g.add(bx(0.4, 0.04, 0.04, MAT.trim(), 0, 0.52, 0)); return g; };
B.firering = () => { const g = G(); const rnd = mulberry32(5); for (let i = 0; i < 11; i++) { const a = i / 11 * PI * 2; const s = sp(0.17 + rnd() * 0.05, MAT.stone(), Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62, 8, 6); s.scale.set(1.2, 0.7, 1); g.add(s); }
  g.add(cy(0.55, 0.58, 0.04, MAT.ash(), 0, 0.02, 0, 14)); for (let i = 0; i < 3; i++) { const l = cy(0.07, 0.07, 0.75, MAT.char(), 0, 0.12, 0, 6); l.rotation.set(PI / 2, i * PI / 3, 0.3); g.add(l); } g.add(marker('fire', 0, 0.15, 0)); return g; };
B.tent = (p) => { const g = G(); const f = fabric(p.color || 0xe8742a); const d = mesh(new THREE.SphereGeometry(1, 20, 10, 0, PI * 2, 0, PI / 2), f); d.scale.set(1.45, 1.35, 1.25); g.add(d);
  const door = mesh(new THREE.CircleGeometry(0.62, 16, 0, PI), MAT.char(), 0, 0.02, 1.235); g.add(door); g.add(mesh(new THREE.CircleGeometry(0.66, 16, 0, PI), paint(0x222222, 0.8), 0, 0.01, 1.232));
  for (const a of [PI / 4, -PI / 4]) { const t = mesh(new THREE.TorusGeometry(1, 0.018, 4, 24, PI), MAT.dmetal()); t.rotation.y = a; t.scale.set(1.47, 1.37, 1.47); g.add(t); }
  const fly = mesh(new THREE.SphereGeometry(1, 16, 6, 0, PI * 2, 0, 0.7), fabric(0xe8e2d0)); fly.scale.set(1.5, 1.42, 1.3); g.add(fly); return g; };
B.lantern = () => { const g = G(); g.add(cy(0.03, 0.03, 1.5, MAT.dmetal(), 0, 0.75, 0, 6)); g.add(bx(0.3, 0.03, 0.03, MAT.dmetal(), 0.13, 1.5, 0)); g.add(cy(0.07, 0.08, 0.2, MAT.bulb(), 0.27, 1.33, 0, 8)); g.add(cy(0.09, 0.09, 0.03, MAT.dmetal(), 0.27, 1.45, 0, 8)); g.add(marker('lantern', 0.27, 1.33, 0)); return g; };
B.chair = (p) => { const g = G(); const f = fabric(p.color || 0x2f7fd0); for (const s of [-1, 1]) { g.add(beam(V(s * 0.28, 0, -0.25), V(s * 0.28, 0.5, 0.25), 0.015, MAT.metal())); g.add(beam(V(s * 0.28, 0, 0.25), V(s * 0.28, 0.5, -0.25), 0.015, MAT.metal())); }
  g.add(bx(0.56, 0.03, 0.5, f, 0, 0.45, 0)); const b = bx(0.56, 0.55, 0.03, f, 0, 0.75, 0.27); b.rotation.x = -0.2; g.add(b); return g; };
B.rv = (p) => { const g = G(); const c = paint(p.color || 0xe8e2d4, 0.5, 0.1);
  g.add(bx(8, 2.4, 2.6, c, 0, 1.75, 0)); g.add(bx(8.02, 0.35, 2.62, paint(0x2a6fa8, 0.4), 0, 1.4, 0)); g.add(bx(8.02, 0.12, 2.62, paint(0xd8862a, 0.4), 0, 1.15, 0));
  g.add(bx(0.3, 1.0, 2.2, MAT.glass(), 4.0, 2.2, 0)); for (const x of [-2.5, 0, 2]) { g.add(bx(1.2, 0.7, 2.62, MAT.win(), x, 2.3, 0)); }
  g.add(bx(0.9, 2.0, 0.06, paint(0xd8d0c0, 0.5), -1.2, 1.6, 1.31)); g.add(bx(0.8, 0.15, 0.5, MAT.metal(), -1.2, 0.45, 1.55));
  for (const x of [-2.6, 2.6]) for (const z of [-1.2, 1.2]) g.add(cy(0.42, 0.42, 0.3, MAT.rubber(), x, 0.45, z, 16).rotateX(PI / 2));
  const aw = bx(4.5, 0.05, 2.0, fabric(0x2a8a6a), 0.6, 3.0, 2.25); aw.rotation.x = 0.12; g.add(aw); for (const x of [-1.6, 2.8]) g.add(cy(0.03, 0.03, 2.8, MAT.metal(), x, 1.4, 3.15, 6));
  g.add(bx(1.2, 0.5, 1.4, MAT.trim(), 1.5, 3.2, 0)); g.add(marker('lantern', 0.6, 2.8, 2.6)); return g; };
B.blanket = (p) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128); x.fillStyle = '#' + (p.color || 0xd93b3b).toString(16).padStart(6, '0'); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) x.fillRect(i * 16, j * 16, 16, 16); x.globalAlpha = 0.5; for (let i = 0; i < 8; i++) { x.fillRect(i * 16, 0, 16, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const g = G(); g.add(bx(2.2, 0.02, 1.7, std({ map: t, roughness: 0.95 }), 0, 0.02, 0, 2.2)); return g; };
B.umbrella = (p) => { const g = G(); g.add(cy(0.03, 0.03, 2.4, MAT.trim(), 0, 1.2, 0, 6)); const top = mesh(new THREE.ConeGeometry(1.4, 0.5, 12, 1, true), fabric(p.color || 0xffd23f), 0, 2.3, 0); g.add(top); g.add(sp(0.06, MAT.trim(), 0, 2.58, 0)); g.rotation.z = 0.12; return g; };
B.basket = () => { const g = G(); const w = paint(0xb88a4a, 0.85); g.add(bx(0.55, 0.3, 0.38, w, 0, 0.16, 0, 0.3)); g.add(bx(0.58, 0.05, 0.4, paint(0x9a6e38, 0.85), 0, 0.33, 0)); const h = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16, PI), w, 0, 0.34, 0); g.add(h); return g; };
B.lifeguard = () => { const g = G(); const w = paint(0xf4f2ec, 0.6); for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(beam(V(sx * 0.8, 0, sz * 0.8), V(sx * 0.45, 2.2, sz * 0.45), 0.06, w));
  g.add(bx(1.1, 0.08, 0.9, w, 0, 2.2, 0)); g.add(bx(1.1, 0.9, 0.08, w, 0, 2.65, 0.45)); for (let i = 0; i < 4; i++) g.add(bx(0.9, 0.05, 0.12, w, 0, 0.4 + i * 0.5, -0.8 + i * 0.09));
  const s = signBoard(['LIFEGUARD'], 1.0, 0.3, { bg: '#d8352a', fg: '#ffffff', border: '#ffffff', w: 512, h: 150 }); s.position.set(0, 2.65, 0.5); g.add(s);
  const buoy = mesh(new THREE.TorusGeometry(0.25, 0.07, 8, 16), paint(0xf26a1a, 0.5), 0.6, 1.4, 0.55); g.add(buoy); return g; };
B.canoerack = () => { const g = G(); for (const x of [-1.2, 1.2]) { g.add(beam(V(x, 0, -0.5), V(x, 1.5, 0), 0.06, MAT.wood())); g.add(beam(V(x, 0, 0.5), V(x, 1.5, 0), 0.06, MAT.wood())); g.add(bx(0.08, 0.08, 1.2, MAT.wood(), x, 0.65, 0)); g.add(bx(0.08, 0.08, 1.0, MAT.wood(), x, 1.2, 0)); }
  for (const [y, c] of [[0.95, 0x2a7a5a], [1.48, 0xd8a030]]) { const k = makeCanoe(c); k.rotation.x = PI; k.scale.set(0.95, 1, 1); k.position.set(0, y, 0); g.add(k); } return g; };
B.bin = () => { const g = G(); const m = paint(0x3a5a3a, 0.5, 0.4); g.add(cy(0.42, 0.4, 1.0, m, 0, 0.5, 0, 14)); g.add(cy(0.45, 0.45, 0.1, MAT.dmetal(), 0, 1.04, 0, 14)); g.add(bx(0.4, 0.04, 0.05, MAT.metal(), 0, 1.11, 0)); for (const y of [0.25, 0.75]) g.add(cy(0.425, 0.425, 0.04, MAT.dmetal(), 0, y, 0, 14)); return g; };

// ---------------- dock & bridges ----------------
function buildDock() {
  const g = G(); const y = DOCK.y;
  for (const d of DECKS) { if (d.kind !== 'dock') continue; const k = G(); const top = bx(2 * d.hd, 0.14, 2 * d.hw, MAT.deck(), 0, y - 0.07, 0, 2.6); top.rotation.y = PI / 2; k.add(top);
    for (const s of [-1, 1]) k.add(bx(2 * d.hw, 0.22, 0.1, MAT.dwood(), 0, y - 0.2, s * (d.hd - 0.05), 2));
    for (let x = -d.hw + 0.2; x <= d.hw; x += 2.4) for (const s of [-1, 1]) k.add(cy(0.13, 0.13, 3.2, MAT.logs(), x, y - 1.4, s * (d.hd + 0.05), 8));
    k.position.set(d.x, 0, d.z); k.rotation.y = -d.rot; g.add(k); }
  // ladder at the end + cleats + bench + lamp
  for (const s of [-1, 1]) g.add(bx(0.06, 1.6, 0.06, MAT.metal(), DOCK.endX - 0.65, y - 0.6, -20 + s * 0.35));
  for (let i = 0; i < 4; i++) g.add(bx(0.06, 0.04, 0.7, MAT.metal(), DOCK.endX - 0.65, y - 1.2 + i * 0.35, -20));
  for (const x of [10, 16, 22]) g.add(bx(0.3, 0.08, 0.1, MAT.metal(), x, y + 0.04, -21.2));
  benchAt(g, 20, -18.95, PI);
  return g;
}
function buildBridges() {
  const g = G();
  for (const br of BRIDGES) { const d = DECKS.find(k => k.kind === 'bridge' && Math.abs(k.x - br.x) < 0.01 && Math.abs(k.z - br.z) < 0.01); if (!d) continue;
    const k = G(); const N = 14; const yAt = (lx) => d.y + 0.35 * Math.cos(Math.min(1, Math.abs(lx) / d.hw) * PI / 2);
    for (let i = 0; i < N; i++) { const x0 = -d.hw + i * 2 * d.hw / N, x1 = x0 + 2 * d.hw / N; const y0 = yAt(x0), y1 = yAt(x1); const L = Math.hypot(x1 - x0, y1 - y0);
      const s = bx(2 * d.hd, 0.14, L + 0.02, MAT.deck(), 0, 0, 0, 2.6); s.rotation.y = PI / 2; const m = G(); m.add(s); m.rotation.z = Math.atan2(y1 - y0, x1 - x0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2 - 0.07, 0); k.add(m);
      for (const zs of [-1, 1]) { if (i % 2 === 0) k.add(bx(0.12, 1.0, 0.12, MAT.wood(), x0 + 0.06, y0 + 0.45, zs * (d.hd - 0.06))); const r = beam(V(x0, y0 + 0.92, zs * (d.hd - 0.06)), V(x1, y1 + 0.92, zs * (d.hd - 0.06)), 0.05, MAT.wood()); k.add(r); } }
    for (const zs of [-1, 1]) { k.add(bx(0.12, 1.0, 0.12, MAT.wood(), d.hw - 0.06, yAt(d.hw) + 0.45, zs * (d.hd - 0.06))); const b = beam(V(-d.hw - 0.5, H(d.x - d.c * (d.hw + 0.5), d.z - d.s * (d.hw + 0.5)) - 0.3, zs * (d.hd - 0.3)), V(d.hw + 0.5, H(d.x + d.c * (d.hw + 0.5), d.z + d.s * (d.hw + 0.5)) - 0.3, zs * (d.hd - 0.3)), 0.22, MAT.logs()); k.add(b); }
    k.position.set(d.x, 0, d.z); k.rotation.y = -d.rot; g.add(k); }
  return g;
}

// ---------------- hideout decorations (built in world space, toggled on purchase) ----------------
const W3 = (p, lx, ly, lz) => V(p.x + lx * Math.cos(p.rot) - lz * Math.sin(p.rot), p.y + ly, p.z + lx * Math.sin(p.rot) + lz * Math.cos(p.rot));
export const BULBS = [];
function buildDecor() {
  const D = {}; const S = DECOR_SPOTS; const gy = (x, z) => ground(x, z);
  { const g = G(); const s = S.firepit; const rnd = mulberry32(9); for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; const r = sp(0.2 + rnd() * 0.06, MAT.stone(), Math.cos(a) * 0.8, 0.1, Math.sin(a) * 0.8, 8, 6); r.scale.set(1.2, 0.75, 1); g.add(r); }
    g.add(cy(0.7, 0.72, 0.04, MAT.ash(), 0, 0.02, 0, 14)); for (let i = 0; i < 3; i++) { const l = cy(0.08, 0.08, 0.8, MAT.char(), 0, 0.12, 0, 6); l.rotation.set(PI / 2, i * PI / 3, 0.3); g.add(l); }
    for (const a of [0.6, 2.4, 4.3]) { const l = cy(0.2, 0.2, 1.3, MAT.logs(), Math.cos(a) * 2.0, 0.22, Math.sin(a) * 2.0, 10); l.rotation.order = 'YXZ'; l.rotation.set(PI / 2, -a, 0); g.add(l); }
    g.add(marker('fire', 0, 0.15, 0, { pit: true })); g.position.set(s.x, gy(s.x, s.z), s.z); D.firepit = g; }
  { const g = G(); const cab = LOC.hideout; const tree = PROPS.find(p => p.type === 'bigtree'); const cols = [0xffd27a, 0xff7a7a, 0x7ad0ff, 0x9aff8a, 0xffa8f0];
    const mats = cols.map(c => { const m = std({ color: c, emissive: c, emissiveIntensity: 0.4, roughness: 0.4 }); BULBS.push(m); return m; });
    const strands = [[W3(cab, -3.6, 2.55, -4.5), W3(cab, 3.6, 2.55, -4.5)], [W3(cab, -3.6, 2.55, -4.5), V(tree.x + 0.4, tree.y + 5.6, tree.z + 3.1)], [W3(cab, 3.6, 2.55, -4.5), V(LOC.firePit.x + 2.2, gy(LOC.firePit.x, LOC.firePit.z) + 2.6, LOC.firePit.z + 0.4)]];
    const post = W3(cab, 0, 0, 0); const pp = V(LOC.firePit.x + 2.2, gy(LOC.firePit.x, LOC.firePit.z), LOC.firePit.z + 0.4); g.add(cy(0.06, 0.07, 2.7, MAT.logs(), pp.x, pp.y + 1.35, pp.z, 6)); void post;
    let k = 0; for (const [a, b] of strands) { const n = Math.ceil(a.distanceTo(b) / 0.55); let prev = null; for (let i = 0; i <= n; i++) { const t = i / n; const q = V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * PI) * 0.6, a.z + (b.z - a.z) * t); if (prev) g.add(beam(prev, q, 0.008, MAT.dmetal(), 3)); if (i % 1 === 0 && i > 0 && i < n) { const m = sp(0.045, mats[k++ % mats.length], q.x, q.y - 0.05, q.z, 6, 5); m.castShadow = false; g.add(m); } prev = q; } }
    D.lights = g; }
  { const g = G(); const s = S.hammock; for (const sx of [-1.8, 1.8]) g.add(cy(0.09, 0.1, 2.0, MAT.logs(), sx, 1.0, 0, 8));
    const geo = new THREE.PlaneGeometry(3.0, 0.9, 16, 2); geo.rotateX(-PI / 2); const pa = geo.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i); pa.setY(i, 1.55 - 0.55 * (1 - (x / 1.5) ** 2) + Math.abs(z) * 0.25); } geo.computeVertexNormals();
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d'); ['#e94f37', '#f6c85f', '#2e86ab', '#f2f2f2'].forEach((cl, i) => { x.fillStyle = cl; x.fillRect(i * 16, 0, 16, 8); }); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    const h = new THREE.Mesh(geo, std({ map: t, side: THREE.DoubleSide, roughness: 0.9 })); h.castShadow = true; h.receiveShadow = true; g.add(h);
    for (const sx of [-1, 1]) g.add(beam(V(sx * 1.5, 1.6, 0), V(sx * 1.78, 1.85, 0), 0.015, paint(0xd8c8a0, 0.9)));
    g.position.set(s.x, gy(s.x, s.z), s.z); g.rotation.y = -s.rot; D.hammock = g; }
  { const tree = PROPS.find(p => p.type === 'bigtree'); const g = G(); g.add(cy(0.035, 0.04, 3.0, MAT.wood(), 0, 1.5, 0, 6)); const f = makeFlag(['#151515', '#f4f4f4'], 'jax'); f.position.set(0.04, 2.9, 0); g.add(f); g.position.set(tree.x + 1.9, tree.y + 4.4 + 2.8, tree.z); D.flag = g; }
  { const s = S.swing; const tree = PROPS.find(p => p.type === 'bigtree'); const top = V(tree.x - 3.0, tree.y + 5.75, tree.z + 1.5); const g = G(); g.userData.dynSwing = true;
    const pivot = G(); pivot.position.copy(top); g.add(pivot); const by = gy(top.x, top.z) + 0.55; const L = top.y - by;
    pivot.add(beam(V(-0.18, 0, 0), V(-0.18, -L + 0.25, 0), 0.015, paint(0xc8b080, 0.9))); pivot.add(beam(V(0.18, 0, 0), V(0.18, -L + 0.25, 0), 0.015, paint(0xc8b080, 0.9)));
    const tire = mesh(new THREE.TorusGeometry(0.32, 0.11, 10, 20), MAT.rubber(), 0, -L, 0); tire.rotation.x = PI / 2; pivot.add(tire); g.userData.pivot = pivot; void s; D.swing = g; }
  { const s = S.gnome; const g = G(); g.add(mesh(new THREE.ConeGeometry(0.16, 0.35, 10), paint(0x2a5aa8, 0.7), 0, 0.18, 0)); g.add(sp(0.08, paint(0xf0c0a0, 0.6), 0, 0.4, 0)); g.add(mesh(new THREE.ConeGeometry(0.09, 0.2, 8), paint(0xf4f4f4, 0.9), 0, 0.33, -0.05)); g.add(mesh(new THREE.ConeGeometry(0.09, 0.3, 10), paint(0xd02a2a, 0.6), 0, 0.6, 0)); g.add(sp(0.025, paint(0xe08a7a, 0.5), 0, 0.4, -0.08, 6, 4));
    g.position.set(s.x, gy(s.x, s.z), s.z); g.rotation.y = -s.rot; D.gnome = g; }
  { const s = S.telescope; const g = G(); for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2; g.add(beam(V(0, 1.1, 0), V(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), 0.02, MAT.dmetal())); }
    const tb = cy(0.07, 0.1, 1.1, paint(0xc89a3a, 0.3, 0.8), 0, 1.25, 0, 12); tb.rotation.z = 1.0; g.add(tb); g.position.set(s.x, gy(s.x, s.z), s.z); g.rotation.y = -s.rot; D.telescope = g; }
  return D;
}

// ---------------- food spread shown on stocked baskets ----------------
function foodSpread() {
  const g = G(); g.add(sp(0.06, paint(0xc8282a, 0.4), 0.18, 0.06, 0.1, 10, 8)); g.add(sp(0.06, paint(0x8bc34a, 0.4), 0.3, 0.06, -0.02, 10, 8));
  const sw = G(); sw.add(bx(0.2, 0.03, 0.14, paint(0xe8c890, 0.8), 0, 0.02, 0)); sw.add(bx(0.21, 0.015, 0.15, paint(0x6ab04c, 0.7), 0, 0.045, 0)); sw.add(bx(0.2, 0.03, 0.14, paint(0xe8c890, 0.8), 0, 0.07, 0)); sw.position.set(-0.2, 0, 0.12); sw.rotation.y = 0.4; g.add(sw);
  const wm = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12, 1, false, 0, PI), paint(0xe8414a, 0.5), -0.05, 0.08, -0.12); wm.rotation.x = PI / 2; g.add(wm); const rind = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.051, 12, 1, true, 0, PI), paint(0x2f7a2f, 0.5), -0.05, 0.08, -0.12); rind.rotation.x = PI / 2; g.add(rind);
  g.add(cy(0.035, 0.035, 0.12, paint(0x2a6fd8, 0.3, 0.6), -0.32, 0.06, -0.05, 10));
  return g;
}

// ---------------- bake: merge static meshes by material + area ----------------
function bake(root, out, cell = 70) {
  root.updateMatrixWorld(true);
  const dyn = []; root.traverse(o => { if (o !== root && o.userData.dyn) dyn.push(o); });
  for (const o of dyn) { o.updateMatrixWorld(true); out.dynamic.push({ obj: o, m: o.matrixWorld.clone() }); o.removeFromParent(); }
  root.traverse(o => {
    if (o.userData.mark) { const p = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); out.marks.push({ kind: o.userData.mark, pos: p, ...o.userData }); return; }
    if (!o.isMesh) return;
    const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.index) { const n = g.attributes.position.count; const idx = []; for (let i = 0; i < n; i++) idx.push(i); g.setIndex(idx); }
    g.clearGroups(); g.morphAttributes = {};
    g.computeBoundingSphere(); const c = g.boundingSphere.center; const key = o.material.uuid + '|' + Math.floor(c.x / cell) + ',' + Math.floor(c.z / cell) + '|' + (o.castShadow ? 1 : 0);
    let b = out.batches.get(key); if (!b) out.batches.set(key, b = { mat: o.material, geos: [], cast: o.castShadow }); b.geos.push(g);
  });
}

export function buildProps(scene) {
  const out = { batches: new Map(), dynamic: [], marks: [], flags: [], decor: {}, food: {}, bins: {}, group: new THREE.Group() };
  const root = new THREE.Group();
  for (const p of PROPS) {
    const f = B[p.type]; if (!f) continue; const g = f(p);
    g.position.set(p.x, p.y, p.z); g.rotation.y = -p.rot;
    if (p.type === 'firering') { const si = SITES.findIndex(s => s.fire === p); g.traverse(o => { if (o.userData.mark === 'fire') o.userData.site = si; }); }
    if (p.type === 'bin') { const h = HIDES.find(h => h.prop === p.i); g.userData.dyn = true; g.userData.yaw = -p.rot; if (h) out.bins[h.id] = g; root.add(g); continue; }
    root.add(g);
  }
  // baskets on campsite tables
  for (const s of STASHES) if (s.kind === 'basket' && !s.beach) { const b = B.basket(); b.position.set(s.x, ground(s.x, s.z) + 0.8, s.z); b.rotation.y = 0.3; root.add(b); }
  root.add(buildDock()); root.add(buildBridges());
  bake(root, out);
  for (const [, b] of out.batches) { const geo = mergeGeometries(b.geos, false); if (!geo) continue; const m = new THREE.Mesh(geo, b.mat); m.castShadow = b.cast; m.receiveShadow = true; m.matrixAutoUpdate = false; out.group.add(m); }
  out.batches.clear();
  for (const d of out.dynamic) { const o = d.obj; d.m.decompose(o.position, o.quaternion, o.scale); out.group.add(o); if (o.userData.flag) out.flags.push(o); }
  // food spreads for stocked stashes
  for (const s of STASHES) { if (s.kind !== 'basket') continue; const f = foodSpread(); const y = s.beach ? ground(s.x, s.z) + 0.02 : ground(s.x, s.z) + 0.8; f.position.set(s.x + (s.beach ? 0.5 : 0.35), y, s.z + (s.beach ? -0.3 : 0.1)); f.visible = false; out.group.add(f); out.food[s.id] = f; }
  out.decor = buildDecor(); for (const k in out.decor) { const g = out.decor[k]; g.visible = false; g.updateMatrixWorld(true); g.traverse(o => { if (o.userData.flag) out.flags.push(o); }); out.group.add(g);
    g.traverse(o => { if (o.userData.mark) { o.updateMatrixWorld(true); out.marks.push({ kind: o.userData.mark, pos: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld), decor: k, ...o.userData }); } }); }
  scene.add(out.group);
  return out;
}
// per-frame: wave flags
export function animateProps(P, t, wind = 1) {
  for (const f of P.flags) { if (!f.visible || (f.parent && !f.parent.visible)) continue; const a = f.geometry.attributes.position, b = f.userData.base;
    for (let i = 0; i < a.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; const k = x / 1.6; a.setZ(i, Math.sin(x * 3.2 - t * 6 * wind + y * 1.3) * 0.13 * k * (0.6 + wind * 0.5)); a.setX(i, x - k * 0.05); }
    a.needsUpdate = true; f.geometry.computeVertexNormals(); }
}
