/* ==========================================================================
   LIVING CHESS — chars.js : the piece characters.
   Stylized sculpted chess shapes (lathe bodies, crowns, mitre, turret,
   horse head) with a canvas-animated face on the head and two articulated
   arms (shoulder -> elbow -> wrist -> hand with a pointing index finger
   and thumb). A small procedural rig: every frame a pose is blended from
   the current gesture (point / cower / beckon / pray / salute / cheer /
   fists / cover eyes / head-shake / gaze / hands on hips / sword raise),
   with breathing, trembling, leaning away from threats and glancing.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { Face } from './faces.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler;
const DOWN = new V3(0, -1, 0);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- shapes (heights in board squares) ---------- */
function lathe(pts, seg = 40) { return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
const BASE = [[0, 0], [0.33, 0], [0.345, 0.03], [0.33, 0.07], [0.28, 0.09], [0.27, 0.12], [0.235, 0.14]];
const SPEC = {
  1: { body: BASE.concat([[0.17, 0.2], [0.13, 0.3], [0.115, 0.4], [0.17, 0.43], [0.18, 0.46], [0.12, 0.48], [0, 0.485]]), head: { y: 0.6, r: 0.155 }, sh: { y: 0.4, x: 0.13 }, arm: 0.2, scale: 0.92 },
  2: { body: BASE.concat([[0.2, 0.22], [0.17, 0.36], [0.2, 0.42], [0.22, 0.45], [0.15, 0.47], [0, 0.48]]), head: { y: 0.66, r: 0.16 }, sh: { y: 0.42, x: 0.17 }, arm: 0.24, scale: 1 },
  3: { body: BASE.concat([[0.2, 0.22], [0.14, 0.42], [0.12, 0.6], [0.19, 0.63], [0.2, 0.66], [0.12, 0.68], [0, 0.685]]), head: { y: 0.82, r: 0.15 }, sh: { y: 0.6, x: 0.14 }, arm: 0.25, scale: 1 },
  4: { body: BASE.concat([[0.24, 0.24], [0.2, 0.4], [0.2, 0.62], [0.25, 0.64], [0.25, 0.7], [0, 0.7]]), head: { y: 0.83, r: 0.16 }, sh: { y: 0.58, x: 0.21 }, arm: 0.25, scale: 1 },
  5: { body: BASE.concat([[0.22, 0.22], [0.15, 0.45], [0.12, 0.72], [0.2, 0.76], [0.21, 0.79], [0.13, 0.81], [0, 0.815]]), head: { y: 0.96, r: 0.155 }, sh: { y: 0.72, x: 0.14 }, arm: 0.28, scale: 1 },
  6: { body: BASE.concat([[0.23, 0.22], [0.16, 0.48], [0.13, 0.78], [0.21, 0.82], [0.22, 0.85], [0.14, 0.87], [0, 0.875]]), head: { y: 1.03, r: 0.16 }, sh: { y: 0.78, x: 0.15 }, arm: 0.29, scale: 1 },
};
export const PIECE_HEIGHT = { 1: 0.8, 2: 0.9, 3: 1.1, 4: 1.05, 5: 1.25, 6: 1.42 };

export function makeMaterials(side) {
  const ivory = side === 0;
  const body = new THREE.MeshPhysicalMaterial({ color: ivory ? 0xefe2c6 : 0x2a1b14, roughness: ivory ? 0.38 : 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color(ivory ? 0xfff3d8 : 0x8a5a3a) });
  const trim = new THREE.MeshPhysicalMaterial({ color: ivory ? 0xd9a441 : 0xb07a2a, roughness: 0.28, metalness: 0.85, clearcoat: 0.3 });
  const felt = new THREE.MeshStandardMaterial({ color: ivory ? 0x2e5d3a : 0x5d2e2e, roughness: 1 });
  return { body, trim, felt };
}

/* ---------- arm ---------- */
function buildArm(mat, len, side) {
  const r = 0.032, ua = len * 0.5, fa = len * 0.46;
  const shoulder = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 1.35, 14, 10), mat); shoulder.add(ball);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(r, ua, 4, 10), mat); upper.position.y = -ua / 2; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = -ua; shoulder.add(elbow);
  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.9, fa, 4, 10), mat); fore.position.y = -fa / 2; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = -fa - r * 0.6; elbow.add(wrist);
  const palm = new THREE.Mesh(new THREE.SphereGeometry(r * 1.45, 14, 10), mat); palm.scale.set(1, 1.15, 0.75); palm.position.y = -r * 0.9; wrist.add(palm);
  // index finger (2 segments) + curled fingers + thumb
  const fingerG = new THREE.CapsuleGeometry(r * 0.38, r * 1.3, 3, 8);
  const idx = new THREE.Group(); idx.position.set(0, -r * 2.0, r * 0.35); wrist.add(idx);
  const f1 = new THREE.Mesh(fingerG, mat); f1.position.y = -r * 0.8; idx.add(f1);
  const curl = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 10, 8), mat); curl.scale.set(1.05, 0.7, 0.9); curl.position.set(0, -r * 2.0, -r * 0.35); wrist.add(curl);
  const thumb = new THREE.Group(); thumb.position.set(side * r * 1.1, -r * 1.2, r * 0.3); wrist.add(thumb);
  const th = new THREE.Mesh(fingerG, mat); th.position.y = -r * 0.6; thumb.add(th); thumb.rotation.z = side * 0.8;
  for (const m of [ball, upper, fore, palm, f1, curl, th]) { m.castShadow = true; }
  return { shoulder, elbow, wrist, idx, thumb, curl, ua, fa, len: ua + fa + r * 3, q: new Q(), qt: new Q(), elb: 0, elbT: 0, wr: new E(), fingerOut: 0 };
}

/* ---------- character ---------- */
export class Char {
  constructor(type, side, id, mats) {
    this.type = type; this.side = side; this.id = id; this.mats = mats;
    this.root = new THREE.Group(); this.root.userData.charId = id;
    this.body = new THREE.Group(); this.root.add(this.body);
    this.face = new Face(128, side, { aspect: 0.8 });
    this.faceTex = new THREE.CanvasTexture(this.face.c); this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 4;
    this.build(type);
    // state
    this.emo = 'calm'; this.inten = 0.3; this.gesture = 'idle'; this.pointW = null; this.lookW = null; this.react = null; this.reactT = 0;
    this.t = Math.random() * 10; this.callout = 0; this.alive = true; this.hover = 0; this.sel = 0; this.alarm = 0; this.hopY = 0; this.moving = false; this.override = null; this.overrideT = 0;
    this.lean = new V3(); this.yaw = 0; this.yawT = 0; this.headYaw = 0; this.headPitch = 0; this.tremble = 0; this.cheerHop = 0; this.dead = 0; this.talk = 0; this.sword = null;
    this.face.set('calm', 0.3);
  }
  build(type) {
    const S = SPEC[type], m = this.mats; this.spec = S;
    while (this.body.children.length) this.body.remove(this.body.children[0]);
    const g = this.body; g.scale.setScalar(S.scale);
    const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh; };
    add(new THREE.Mesh(lathe(S.body), m.body));
    const felt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.006, 32), m.felt); felt.position.y = 0.003; g.add(felt);
    const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.018, 8, 40), m.trim)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.105;
    // head
    this.head = new THREE.Group(); this.head.position.y = S.head.y; g.add(this.head);
    const hr = S.head.r;
    if (type === 2) { // knight: horse skull + snout in profile + ears + mane
      const skull = new THREE.Mesh(new THREE.SphereGeometry(hr, 32, 20), m.body); skull.scale.set(1, 1.08, 0.95); skull.castShadow = true; this.head.add(skull);
      const snout = new THREE.Mesh(new THREE.CapsuleGeometry(hr * 0.55, hr * 1.25, 6, 16), m.body); snout.rotation.z = Math.PI / 2 - 0.5; snout.position.set(-hr * 0.95, -hr * 0.45, -hr * 0.15); snout.castShadow = true; this.head.add(snout);
      const nost = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x120a08 })); nost.position.set(-hr * 1.75, -hr * 0.85, hr * 0.12); this.head.add(nost);
      for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.24, hr * 0.7, 10), m.body); ear.position.set(hr * 0.15, hr * 1.05, sx * hr * 0.42 - hr * 0.1); ear.rotation.z = -0.25; ear.castShadow = true; this.head.add(ear); }
      for (let i = 0; i < 7; i++) { const a = -0.3 + i * 0.32; const mane = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.42, hr * 0.32, hr * 0.28), m.trim); mane.position.set(Math.sin(a) * hr * 1.02 + hr * 0.15, Math.cos(a) * hr * 1.02 - hr * 0.25, -hr * 0.55); mane.rotation.z = -a; mane.castShadow = true; this.head.add(mane); }
      const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.75, 0.17, 0.2, 24), m.body)); neck.position.y = 0.53;
    } else {
      const sk = new THREE.Mesh(new THREE.SphereGeometry(hr, 32, 22), m.body); sk.castShadow = true; this.head.add(sk);
      if (type !== 1) { const nk = add(new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.55, hr * 0.7, S.head.y - (S.sh.y + 0.06), 20), m.body)); nk.position.y = (S.head.y + S.sh.y + 0.06) / 2 - 0.02; }
    }
    if (type === 3) { // mitre with slit
      const mitre = new THREE.Mesh(lathe([[0, -0.02], [hr * 0.98, 0], [hr * 1.02, hr * 0.5], [hr * 0.75, hr * 1.25], [hr * 0.3, hr * 1.7], [0, hr * 1.85]], 28), m.body); mitre.position.y = hr * 0.55; mitre.castShadow = true; this.head.add(mitre);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.12, hr * 0.9, hr * 2.2), new THREE.MeshStandardMaterial({ color: this.side ? 0x0b0604 : 0x6b5236, roughness: 0.8 })); slit.position.set(hr * 0.3, hr * 1.55, 0); slit.rotation.z = -0.55; this.head.add(slit);
      const band = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.98, hr * 0.08, 8, 32), m.trim); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.58; this.head.add(band);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.16, 12, 8), m.trim); knob.position.y = hr * 2.45; this.head.add(knob);
    }
    if (type === 4) { // turret helmet with crenellations
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(hr * 1.12, hr * 1.05, hr * 0.55, 28), m.body); cap.position.y = hr * 0.72; cap.castShadow = true; this.head.add(cap);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const cr = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.42, hr * 0.42, hr * 0.32), m.body); cr.position.set(Math.cos(a) * hr * 0.95, hr * 1.18, Math.sin(a) * hr * 0.95); cr.rotation.y = -a; cr.castShadow = true; this.head.add(cr); }
      const band = new THREE.Mesh(new THREE.TorusGeometry(hr * 1.1, hr * 0.07, 8, 32), m.trim); band.rotation.x = Math.PI / 2; band.position.y = hr * 0.46; this.head.add(band);
    }
    if (type === 5 || type === 6) { // crown
      const crown = new THREE.Group(); crown.position.y = hr * 0.62; this.head.add(crown);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.95, hr * 0.85, hr * 0.32, 28, 1, true), m.trim); base.material.side = THREE.DoubleSide; crown.add(base);
      const n = type === 5 ? 9 : 5;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const sp = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.13, hr * 0.55, 8), m.trim); sp.position.set(Math.cos(a) * hr * 0.9, hr * 0.38, Math.sin(a) * hr * 0.9); sp.castShadow = true; crown.add(sp);
        if (type === 5) { const b = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.09, 8, 6), new THREE.MeshPhysicalMaterial({ color: this.side ? 0xff3a5a : 0x58b8ff, roughness: 0.1, metalness: 0.1, emissive: this.side ? 0x401018 : 0x102840, transmission: 0 })); b.position.set(Math.cos(a) * hr * 0.9, hr * 0.68, Math.sin(a) * hr * 0.9); crown.add(b); } }
      if (type === 6) { const cv = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.16, hr * 0.85, hr * 0.16), m.trim); cv.position.y = hr * 0.9; const ch = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.55, hr * 0.16, hr * 0.16), m.trim); ch.position.y = hr * 1.0; cv.castShadow = ch.castShadow = true; crown.add(cv, ch); const dome = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.felt); dome.position.y = hr * 0.05; crown.add(dome); }
    }
    if (type === 1) { const col = new THREE.Mesh(new THREE.TorusGeometry(hr * 0.72, hr * 0.13, 8, 24), m.trim); col.rotation.x = Math.PI / 2; col.position.y = -hr * 0.82; this.head.add(col); }
    // face decal: a spherical patch hugging the head, facing +z
    const fr = hr * 1.02;
    const fg = new THREE.SphereGeometry(fr, 24, 18, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.72, 1.44);
    this.faceMat = new THREE.MeshStandardMaterial({ map: this.faceTex, transparent: true, roughness: 0.5, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const fm = new THREE.Mesh(fg, this.faceMat); fm.renderOrder = 2; this.faceMesh = fm;
    if (type === 2) fm.position.set(hr * 0.12, 0, 0);
    this.head.add(fm);
    // arms
    this.arms = [buildArm(m.body, S.arm, -1), buildArm(m.body, S.arm, 1)]; // 0 = left (-x), 1 = right (+x)
    this.arms.forEach((a, i) => { a.shoulder.position.set((i ? 1 : -1) * S.sh.x, S.sh.y, 0.02); g.add(a.shoulder); });
    // knight's sword (right hand)
    if (type === 2) {
      const sw = new THREE.Group(); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.3, 0.006), new THREE.MeshStandardMaterial({ color: 0xe8eef5, metalness: 1, roughness: 0.15, emissive: 0x223344 })); blade.position.y = -0.2;
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.02), m.trim); guard.position.y = -0.045; const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8), m.trim);
      sw.add(blade, guard, grip); sw.rotation.x = Math.PI; sw.position.set(0, -0.06, 0.02); sw.visible = false; this.arms[1].wrist.add(sw); this.sword = sw; this.swordBlade = blade;
    }
    this.height = PIECE_HEIGHT[type];
    // pick proxy (invisible cylinder)
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, this.height, 10), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.y = this.height / 2; proxy.userData.charId = this.id; this.root.add(proxy); this.proxy = proxy;
    this.root.traverse(o => { if (o.isMesh && o !== proxy) o.userData.charId = this.id; });
  }
  /** swap the body to a new type (promotion) keeping identity, face and arms state */
  retype(type) { this.type = type; const p = this.proxy; this.root.remove(p); this.build(type); }

  /* ---------- per-frame pose ---------- */
  setState(emo, inten, gesture, pointW) { this.emo = emo; this.inten = inten; this.gesture = gesture || 'idle'; this.pointW = pointW || null; }
  /** a short, high-priority gesture (preview reaction / alarm / cheer / mourn) */
  doReact(r, dur = 2.5, lookW = null) { this.react = r; this.reactT = dur; if (lookW) this.reactLook = lookW; }
  update(dt, ctx) {
    if (!this.alive && !this.dying) return;
    this.t += dt; const t = this.t;
    if (this.reactT > 0) { this.reactT -= dt; if (this.reactT <= 0) this.react = null; }
    this.callout = Math.max(0, this.callout - dt); this.alarm = Math.max(0, this.alarm - dt);
    let g = this.gesture, emo = this.emo, inten = this.inten;
    const R = this.react;
    if (R) { g = { horror: 'coverEyes', cheer: 'cheer', headshake: 'cross', doubt: 'cross', nod: 'thumbs', brave: 'salute', mourn: 'coverEyes', alarm: 'cower', joy: 'cheer', flinch: 'cower', duel: 'sword', defy: 'fists', watch: g }[R] || g;
      emo = { horror: 'horror', cheer: 'cheer', headshake: 'anxiety', doubt: 'anxiety', nod: 'pride', brave: 'resolve', mourn: 'grief', alarm: 'terror', joy: 'joy', flinch: 'pain', duel: 'resolve', defy: 'resolve', watch: emo }[R] || emo; inten = R === 'watch' ? inten : 0.9; }
    if (this.dying) { emo = 'dead'; g = 'limp'; }
    if (this.type === 3 && (g === 'glance' || (g === 'cower' && !this.pointW))) g = 'pray';
    if (this.type === 2 && g === 'point' && (emo === 'thrill' || emo === 'resolve')) g = 'sword';
    this.face.set(emo, inten);
    // world-space look target -> local directions
    const look = (R && this.reactLook) || this.pointW || this.lookW || ctx.camPos;
    const root = this.root, wp = root.getWorldPosition(_v1);
    _v2.copy(look).sub(wp); const dist = Math.hypot(_v2.x, _v2.z);
    // body faces the camera (theatre staging); turns partly toward what it points at
    const camYaw = Math.atan2(ctx.camPos.x - wp.x, ctx.camPos.z - wp.z);
    let tgtYaw = camYaw;
    if ((g === 'point' || g === 'sword' || g === 'glance' || g === 'gaze' || (g === 'cower' && this.pointW)) && dist > 0.01) { const ly = Math.atan2(_v2.x, _v2.z); tgtYaw = camYaw + clampAng(ly - camYaw, 0.75); }
    if (this.moving && this.moveYaw != null) tgtYaw = this.moveYaw;
    this.yaw = lerpAng(this.yaw, tgtYaw, Math.min(1, dt * 6)); root.rotation.y = this.yaw;
    // local look dir (for head + eyes)
    const ld = _v3.copy(look).sub(wp); ld.applyAxisAngle(_up, -this.yaw); // into root-local
    const headY = this.spec.head.y * this.spec.scale; ld.y -= headY;
    let hYaw = Math.atan2(ld.x, ld.z), hPitch = -Math.atan2(ld.y, Math.hypot(ld.x, ld.z));
    hYaw = clamp(hYaw, -0.9, 0.9); hPitch = clamp(hPitch, -0.5, 0.6);
    // emotion-driven body motion
    const fear = emo === 'terror' || emo === 'horror' ? 1 : emo === 'anxiety' ? 0.45 : 0;
    const trem = (fear * inten + (this.alarm > 0 ? 0.6 : 0)) * 0.012 + (this.callout > 0 && fear ? 0.01 : 0);
    const breathe = Math.sin(t * (2 + fear * 4)) * (0.012 + fear * 0.01);
    let sy = 1 + breathe, sxz = 1 - breathe * 0.5, by = 0, leanX = 0, leanZ = 0;
    if (g === 'cower') { sy -= 0.08; leanZ = -0.18; } // shrink and lean back (away from the threat, which it faces)
    if (g === 'pray') { sy -= 0.03; hPitch += 0.25; }
    if (g === 'limp') { hPitch = 0.5; }
    if (emo === 'grief' && g !== 'limp') { hPitch = 0.45; hYaw *= 0.3; sy -= 0.04; }
    if (emo === 'pride' || g === 'chest') { hPitch -= 0.15; sy += 0.02; }
    if (g === 'gaze') { hPitch = -0.35; }
    if (g === 'cheer') { by = Math.abs(Math.sin(t * 7)) * 0.08; }
    if (emo === 'joy' && g !== 'cheer') by = Math.abs(Math.sin(t * 4)) * 0.03;
    if (this.callout > 0) { by += Math.abs(Math.sin(t * 9)) * 0.05 * (fear ? 0.4 : 1); if (g === 'idle' || g === 'beckon') g = 'wave'; }
    if (g === 'cross') { hYaw = Math.sin(t * 11) * 0.5; }
    if (g === 'thumbs') { hPitch = Math.sin(t * 8) * 0.25; }
    if (this.hover > 0.01) { by += this.hover * (0.05 + Math.sin(t * 3) * 0.01); }
    if (this.sel > 0.01) { by += this.sel * 0.1; }
    this.body.position.set((Math.random() - 0.5) * trem, by + this.hopY, (Math.random() - 0.5) * trem);
    this.body.scale.set(sxz * this.spec.scale, sy * this.spec.scale, sxz * this.spec.scale);
    this.lean.x = lerp(this.lean.x, leanZ + (this.moving ? -0.15 * (this.moveLean || 0) : 0), Math.min(1, dt * 6)); this.lean.z = lerp(this.lean.z, leanX, Math.min(1, dt * 6));
    this.body.rotation.x = this.lean.x; this.body.rotation.z = this.lean.z + (this.dying ? this.dieTilt || 0 : 0) + (this.wobble || 0);
    this.headYaw = lerp(this.headYaw, hYaw, Math.min(1, dt * 8)); this.headPitch = lerp(this.headPitch, hPitch, Math.min(1, dt * 8));
    this.head.rotation.set(this.headPitch, this.headYaw, (emo === 'longing' ? Math.sin(t) * 0.12 : 0) + (g === 'cross' ? 0 : 0));
    // eyes follow too (beyond head limits)
    this.face.lookAt(Math.sin(hYaw - this.headYaw) * 2.2 + (Math.abs(hYaw) > 0.85 ? Math.sign(hYaw) * 0.6 : 0), (hPitch - this.headPitch) * 2 + (g === 'gaze' ? -0.7 : emo === 'grief' ? 0.7 : 0));
    // arms
    this.poseArms(g, dt, t, emo, inten);
    if (this.sword) this.sword.visible = g === 'sword';
    // face texture refresh (throttled unless active)
    this.face.update(dt); this._fAcc = (this._fAcc || 0) + dt;
    const rate = this.hover > 0.1 || this.talk > 0 || this.callout > 0 || this.react ? 1 / 30 : (ctx.lowFace ? 1 / 6 : 1 / 12);
    if (this._fAcc >= rate) { this._fAcc = 0; this.face.draw(); this.faceTex.needsUpdate = true; }
  }
  poseArms(g, dt, t, emo, inten) {
    const A = this.arms, k = Math.min(1, dt * 9);
    const set = (a, x, y, z, elb, finger = 0) => { a.qt.setFromEuler(_e.set(x, y, z, 'XYZ')); a.elbT = elb; a.fingerT = finger; };
    const sway = Math.sin(t * 2.1) * 0.06;
    const pointArm = (a, w, extra = 0) => { // aim the arm (rest direction -Y) at a world point
      const sh = a.shoulder; sh.parent.updateWorldMatrix(true, false);
      const from = sh.getWorldPosition(_v4); const d = _v5.copy(w).sub(from); d.y += 0.25; // aim a little above the square
      _m.copy(sh.parent.matrixWorld).invert(); d.transformDirection(_m); d.normalize();
      a.qt.setFromUnitVectors(DOWN, d); if (extra) a.qt.multiply(_q.setFromEuler(_e.set(0, 0, extra))); a.elbT = -0.12; a.fingerT = 1;
    };
    const L = A[0], Rr = A[1];
    switch (g) {
      case 'point': if (this.pointW) pointArm(Rr, this.pointW); else set(Rr, -1.4, 0, 0.3, -0.1, 1); set(L, -0.5 + Math.sin(t * 6) * 0.2, 0, -0.5, -2.1); break; // fist pump with the other
      case 'sword': set(Rr, -2.7 + Math.sin(t * 5) * 0.12, 0, 0.25, -0.35); if (this.pointW) pointArm(L, this.pointW); else set(L, -0.4, 0, -0.4, -1.8); break;
      case 'cower': set(L, -1.75, 0, 0.45 + Math.sin(t * 30) * 0.04, -1.9); if (this.pointW) pointArm(Rr, this.pointW); else set(Rr, -1.75, 0, -0.45, -1.9); break;
      case 'glance': set(L, -1.9, 0, 0.55, -2.5); if (this.pointW) pointArm(Rr, this.pointW); else set(Rr, 0.1, 0, 0.25, -0.3); break; // nail-biting + pointing at the future killer
      case 'pray': set(L, -1.05, 0, 0.62, -1.5); set(Rr, -1.05, 0, -0.62, -1.5); break;
      case 'coverEyes': set(L, -2.45, 0, 0.62, -2.35); set(Rr, -2.45, 0, -0.62, -2.35); break;
      case 'cheer': set(L, -0.2, 0, -2.6 + Math.sin(t * 8) * 0.25, -0.3); set(Rr, -0.2, 0, 2.6 - Math.sin(t * 8 + 1) * 0.25, -0.3); break;
      case 'salute': set(Rr, -1.85, 0, -1.05, -2.5); if (this.pointW && (t % 4) > 2) pointArm(L, this.pointW); else set(L, 0.05, 0, -0.18, -0.1); break;
      case 'fists': set(L, -0.7 + Math.sin(t * 5) * 0.15, 0, -0.55, -2.3); set(Rr, -0.7 + Math.sin(t * 5 + 2) * 0.15, 0, 0.55, -2.3); break;
      case 'beckon': set(Rr, -1.35, 0, 0.25, -0.4 - (Math.sin(t * 6) * 0.5 + 0.5) * 1.6, 1); set(L, 0.05 + sway, 0, -0.2, -0.3); break;
      case 'wave': set(Rr, -0.1, 0, 2.5, -0.5 - Math.sin(t * 10) * 0.5); set(L, 0.05, 0, -0.25, -0.3); break;
      case 'gaze': if (this.pointW) pointArm(Rr, this.pointW); else set(Rr, -2.2, 0, 0.3, -0.1, 1); set(L, -0.9, 0, -0.5, -1.9); break; // reaching toward the last rank, hand on heart
      case 'chest': set(L, 0.2, 0, -0.75, -1.4); set(Rr, 0.2, 0, 0.75, -1.4); break; // hands on hips
      case 'cross': set(L, -1.0, 0, 0.75, -2.0); set(Rr, -1.0, 0, -0.75, -2.0); break;  // arms crossed, head shaking
      case 'thumbs': set(Rr, -1.3, 0, 0.3, -1.6); set(L, 0.05, 0, -0.2, -0.3); break;
      case 'mourn': set(L, -2.3, 0, 0.6, -2.3); set(Rr, 0.1, 0, 0.12, -0.05); break;
      case 'limp': set(L, 0.2, 0, -0.1, 0); set(Rr, 0.2, 0, 0.1, 0); break;
      default: set(L, 0.08 + sway, 0, -0.22 - sway * 0.5, -0.35); set(Rr, 0.08 - sway, 0, 0.22 - sway * 0.5, -0.35);
    }
    for (const a of A) {
      a.q.slerp(a.qt, k); a.shoulder.quaternion.copy(a.q);
      a.elb = lerp(a.elb, a.elbT, k); a.elbow.rotation.x = a.elb;
      a.fingerOut = lerp(a.fingerOut, a.fingerT || 0, k);
      a.idx.rotation.x = (1 - a.fingerOut) * -2.2; // curled into a fist unless pointing
    }
  }
  dispose() { this.faceTex.dispose(); }
}
const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3(), _up = new V3(0, 1, 0), _e = new E(), _q = new Q(), _m = new THREE.Matrix4();
function clampAng(a, m) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return clamp(a, -m, m); }
function lerpAng(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
