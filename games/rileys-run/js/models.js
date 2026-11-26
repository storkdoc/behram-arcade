/* ==========================================================================
   RILEY'S RUN — models.js   stylised, articulated 3D kid runners
   Built from primitives so they stay light: capsule limbs on pivots, a big
   cartoon head with a painted face, per-kid hair (Riley's ponytail bounces),
   jersey textures (Riley: magenta star singlet, Jaxon: red/white/charcoal
   stripes) and track cleats.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';

export const LOOKS = {
  riley: { skin: '#e9a982', hair: '#5b321c', hairStyle: 'pony', scrunchie: '#ff3ca6', jersey: 'riley', shorts: '#1c2459', shortsTrim: '#ff7cc4', cleat: '#ff2d9b', cleatTrim: '#ffffff', sock: '#ffffff', iris: '#4a2a14', girl: true },
  jaxon: { skin: '#d99a72', hair: '#2b1a10', hairStyle: 'short', jersey: 'jaxon', shorts: '#26272d', shortsTrim: '#e8262e', cleat: '#e3202a', cleatTrim: '#151515', sock: '#ffffff', iris: '#3b210f', sleeves: true },
  maya:  { skin: '#f0c49e', hair: '#141016', hairStyle: 'bob', jersey: 'solid', c1: '#ffb000', c2: '#ffffff', shorts: '#222222', shortsTrim: '#ffb000', cleat: '#ffd400', cleatTrim: '#222', sock: '#fff', iris: '#2b1a10', girl: true },
  leo:   { skin: '#7a4a2e', hair: '#141010', hairStyle: 'puff', jersey: 'solid', c1: '#2fd27a', c2: '#0b5a32', shorts: '#0b5a32', shortsTrim: '#fff', cleat: '#ffffff', cleatTrim: '#2fd27a', sock: '#2fd27a', iris: '#24140a' },
  sofia: { skin: '#d8a07a', hair: '#3a1f12', hairStyle: 'buns', jersey: 'solid', c1: '#a35bff', c2: '#ffd1ff', shorts: '#3c1a6a', shortsTrim: '#ffd1ff', cleat: '#a35bff', cleatTrim: '#fff', sock: '#fff', iris: '#3a2210', girl: true },
  theo:  { skin: '#f2c8a8', hair: '#c98b3a', hairStyle: 'cap', cap: '#2f8bff', jersey: 'solid', c1: '#2f8bff', c2: '#ffffff', shorts: '#14316b', shortsTrim: '#fff', cleat: '#14316b', cleatTrim: '#ffd400', sock: '#fff', iris: '#3a6aa0' },
  ava:   { skin: '#b9784f', hair: '#120c0a', hairStyle: 'braid', jersey: 'solid', c1: '#00d2d2', c2: '#004d5a', shorts: '#004d5a', shortsTrim: '#00ffff', cleat: '#00e0c0', cleatTrim: '#fff', sock: '#fff', iris: '#24140a', girl: true },
  nico:  { skin: '#e2b08c', hair: '#6b3a1a', hairStyle: 'spiky', jersey: 'solid', c1: '#ff6a1f', c2: '#222', shorts: '#222', shortsTrim: '#ff6a1f', cleat: '#ff6a1f', cleatTrim: '#000', sock: '#222', iris: '#3a2210' },
};

const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache[key] = t; return t;
}
function star(g, cx, cy, r, ri, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? ri : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); }

function jerseyTex(L, kid) {
  const t = jerseyTex0(L, kid); t.wrapS = THREE.RepeatWrapping; t.offset.x = 0.25; t.needsUpdate = true; return t; // lathe/capsule UV: u=0 faces +z
}
function jerseyTex0(L, kid) {
  return canvasTex('jersey-' + kid, 256, 256, (g, w, h) => {
    if (L.jersey === 'riley') {
      g.fillStyle = '#e0247f'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.12)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, 14);               // collar trim
      g.fillRect(w * 0.42, 0, 10, h); g.fillRect(w * 0.92, 0, 10, h); // side panels
      g.fillStyle = '#fff'; star(g, w * 0.25 + 4, h * 0.42, 30, 13); g.fill();   // front star (u=0.25 faces +z)
      star(g, w * 0.13, h * 0.28, 9, 4); g.fill(); star(g, w * 0.37, h * 0.3, 8, 3.5); g.fill();
      g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.fillText('9', w * 0.75, h * 0.48);
    } else if (L.jersey === 'jaxon') {
      const cols = ['#f4f4f4', '#d71f2b', '#f4f4f4', '#2a2a2e'];
      const sh = h / 12; for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 4]; g.fillRect(0, i * sh, w, sh + 1); }
      g.fillStyle = '#2a2a2e'; g.fillRect(0, 0, w, 12);
      g.fillStyle = '#d71f2b'; g.fillRect(w * 0.43, 0, 8, h); g.fillRect(w * 0.93, 0, 8, h);
      g.fillStyle = '#2a2a2e'; g.beginPath(); g.moveTo(w * 0.25 - 26, 0); g.lineTo(w * 0.25, 30); g.lineTo(w * 0.25 + 26, 0); g.fill();
      g.font = 'bold 40px Arial'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#2a2a2e'; g.lineWidth = 6; g.strokeText('9', w * 0.75, h * 0.5); g.fillText('9', w * 0.75, h * 0.5);
    } else {
      g.fillStyle = L.c1; g.fillRect(0, 0, w, h);
      g.fillStyle = L.c2; g.fillRect(0, 0, w, 12); g.fillRect(0, h * 0.62, w, 18);
      g.fillRect(w * 0.43, 0, 8, h); g.fillRect(w * 0.93, 0, 8, h);
      g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.fillStyle = L.c2; g.fillText(String(1 + (kid.charCodeAt(0) % 8)), w * 0.25, h * 0.5);
    }
  });
}
function faceTex(L, kid) {
  return canvasTex('face-' + kid, 512, 256, (g, w, h) => {
    g.fillStyle = L.skin; g.fillRect(0, 0, w, h);
    const cx = w * 0.25, cy = h * 0.55; // u=0.25 = front (+z)
    // cheeks
    g.fillStyle = 'rgba(255,110,110,.28)'; g.beginPath(); g.ellipse(cx - 46, cy + 22, 16, 10, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + 46, cy + 22, 16, 10, 0, 0, 7); g.fill();
    for (const sx of [-1, 1]) {
      const ex = cx + sx * 30, ey = cy - 8;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 15, 18, 0, 0, 7); g.fill();
      g.fillStyle = L.iris; g.beginPath(); g.arc(ex + sx * 1, ey + 2, 11, 0, 7); g.fill();
      g.fillStyle = '#0a0503'; g.beginPath(); g.arc(ex + sx * 1, ey + 2, 6, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 3, ey - 3, 3.5, 0, 7); g.fill();
      g.strokeStyle = '#1a0e08'; g.lineWidth = 3; g.beginPath(); g.ellipse(ex, ey, 15, 18, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      // brows
      g.strokeStyle = L.hair; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(ex - 13, ey - 26 + (sx < 0 ? 2 : 0)); g.quadraticCurveTo(ex, ey - 32, ex + 13, ey - 26 + (sx > 0 ? 2 : 0)); g.stroke();
      if (L.girl) { g.strokeStyle = '#1a0e08'; g.lineWidth = 2; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(ex + sx * (8 + k * 3), ey - 15 + k * 2); g.lineTo(ex + sx * (13 + k * 4), ey - 21 + k * 2); g.stroke(); } }
    }
    // nose
    g.strokeStyle = 'rgba(120,60,40,.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 5, cy + 16); g.quadraticCurveTo(cx, cy + 21, cx + 5, cy + 16); g.stroke();
    // grin
    g.fillStyle = '#7a1c1c'; g.beginPath(); g.moveTo(cx - 24, cy + 30); g.quadraticCurveTo(cx, cy + 58, cx + 24, cy + 30); g.quadraticCurveTo(cx, cy + 38, cx - 24, cy + 30); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx - 20, cy + 32); g.quadraticCurveTo(cx, cy + 40, cx + 20, cy + 32); g.lineTo(cx + 17, cy + 38); g.quadraticCurveTo(cx, cy + 44, cx - 17, cy + 38); g.fill();
  });
}

const geo = {
  torso: new THREE.CapsuleGeometry(0.16, 0.26, 4, 12),
  shorts: new THREE.CylinderGeometry(0.165, 0.19, 0.2, 12),
  head: new THREE.SphereGeometry(0.19, 24, 18),
  upper: new THREE.CapsuleGeometry(0.05, 0.17, 3, 8),
  fore: new THREE.CapsuleGeometry(0.044, 0.16, 3, 8),
  hand: new THREE.SphereGeometry(0.052, 8, 6),
  thigh: new THREE.CapsuleGeometry(0.068, 0.22, 3, 8),
  shin: new THREE.CapsuleGeometry(0.056, 0.22, 3, 8),
  sock: new THREE.CylinderGeometry(0.058, 0.058, 0.1, 8),
  cleat: new THREE.BoxGeometry(0.12, 0.08, 0.25),
  sole: new THREE.BoxGeometry(0.125, 0.025, 0.26),
  sleeve: new THREE.CylinderGeometry(0.075, 0.07, 0.13, 10),
  ear: new THREE.SphereGeometry(0.045, 8, 6),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8),
};
const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.62, metalness: 0 }, o));
function mesh(g, m, cast = true) { const x = new THREE.Mesh(g, m); x.castShadow = cast; return x; }

function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '900 38px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(name, 128, 34); g.fillStyle = color; g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(0.8, 0.2, 1); s.renderOrder = 10; return s;
}

export class Runner3D {
  constructor(kid, color, label) {
    const L = LOOKS[kid]; this.kid = kid; this.L = L;
    const root = this.root = new THREE.Group();
    const skin = M(L.skin, { roughness: 0.55 });
    const jersey = M('#ffffff', { map: jerseyTex(L, kid), roughness: 0.7 });
    const shorts = M(L.shorts, { roughness: 0.7 }), sock = M(L.sock), cleat = M(L.cleat, { roughness: 0.4 }), sole = M('#141414');
    const hairM = M(L.hair, { roughness: 0.75 });
    this.sh = new THREE.Mesh(shadowGeo, shadowMat); this.sh.scale.set(0.9, 1, 1.2); this.sh.position.y = 0.02; this.sh.renderOrder = 1; root.add(this.sh);
    const body = this.body = new THREE.Group(); root.add(body);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.7; body.add(hips);
    const torso = this.torso = new THREE.Group(); hips.add(torso);
    const tm = mesh(geo.torso, jersey); tm.position.y = 0.28; tm.scale.set(1, 1, 0.78); torso.add(tm);
    const sm = mesh(geo.shorts, shorts); sm.position.y = 0.02; sm.scale.z = 0.82; hips.add(sm);
    const neck = mesh(geo.neck, skin); neck.position.y = 0.55; torso.add(neck);
    const head = this.head = new THREE.Group(); head.position.y = 0.74; torso.add(head);
    const hm = mesh(geo.head, M('#ffffff', { map: faceTex(L, kid), roughness: 0.5 })); hm.scale.set(1, 1.03, 1); head.add(hm);
    for (const sx of [-1, 1]) { const e = mesh(geo.ear, skin); e.position.set(sx * 0.185, 0, -0.01); head.add(e); }
    this.buildHair(head, L, hairM);
    // arms
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.215, 0.47, 0); torso.add(sh);
      const up = mesh(geo.upper, skin); up.position.y = -0.12; sh.add(up);
      if (L.sleeves) { const sl = mesh(geo.sleeve, jersey); sl.position.y = -0.05; sh.add(sl); }
      const el = new THREE.Group(); el.position.y = -0.26; sh.add(el);
      const fo = mesh(geo.fore, skin); fo.position.y = -0.1; el.add(fo);
      const ha = mesh(geo.hand, skin); ha.position.y = -0.22; el.add(ha);
      this.arms.push({ sh, el, sx });
    }
    // legs
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(sx * 0.092, 0, 0); hips.add(hp);
      const th = mesh(geo.thigh, skin); th.position.y = -0.17; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.34; hp.add(kn);
      const sn = mesh(geo.shin, skin); sn.position.y = -0.15; kn.add(sn);
      const so = mesh(geo.sock, sock); so.position.y = -0.27; kn.add(so);
      const ft = new THREE.Group(); ft.position.y = -0.33; kn.add(ft);
      const cl = mesh(geo.cleat, cleat); cl.position.set(0, 0, 0.05); ft.add(cl);
      const sl = mesh(geo.sole, sole); sl.position.set(0, -0.045, 0.05); ft.add(sl);
      const st = mesh(new THREE.BoxGeometry(0.004, 0.03, 0.15), M(L.cleatTrim)); st.position.set(sx * 0.062, 0.005, 0.04); ft.add(st);
      this.legs.push({ hp, kn, ft, sx });
    }
    // shield bubble & boost aura
    this.bubble = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), fresnelMat(0x6fe8ff)); this.bubble.position.y = 0.75; this.bubble.visible = false; root.add(this.bubble);
    this.aura = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), fresnelMat(0xffc830)); this.aura.position.y = 0.7; this.aura.scale.set(0.8, 1.15, 1.25); this.aura.visible = false; root.add(this.aura);
    if (label) { this.tag = nameTag(label, color); this.tag.position.y = 1.75; root.add(this.tag); }
    this.pt = 0; this.pose = 'run'; this.ponyV = [0, 0, 0, 0, 0]; this.ponyA = [0, 0, 0, 0, 0];
  }
  buildHair(head, L, hm) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hm); cap.castShadow = true;
    cap.rotation.x = -0.35; cap.position.set(0, 0.02, -0.012); head.add(cap);
    const s = L.hairStyle;
    if (s === 'pony') {
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.022, 6, 12), M(L.scrunchie)); sc.position.set(0, 0.13, -0.16); sc.rotation.x = 0.9; head.add(sc);
      // ponytail: chain of pivots
      this.pony = []; let parent = new THREE.Group(); parent.position.set(0, 0.13, -0.18); head.add(parent);
      const rads = [0.075, 0.08, 0.075, 0.065, 0.05, 0.035];
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group(); parent.add(seg); if (i) seg.position.y = -0.09;
        const b = new THREE.Mesh(new THREE.SphereGeometry(rads[i], 10, 8), hm); b.scale.set(1.15, 1.25, 1); b.position.y = -0.045; b.castShadow = true; seg.add(b);
        // a few curls
        if (i > 1) for (let k = 0; k < 2; k++) { const cu = new THREE.Mesh(new THREE.SphereGeometry(rads[i] * 0.55, 6, 5), hm); cu.position.set((k ? 1 : -1) * rads[i] * 0.9, -0.05, 0); seg.add(cu); }
        this.pony.push(seg); parent = seg;
      }
      this.pony[0].rotation.x = 0.9;
      for (let k = 0; k < 6; k++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), hm); const a = -0.9 + k * 0.36; w.position.set(Math.sin(a) * 0.19, -0.02 + Math.abs(Math.sin(a)) * 0.03, 0.06 + Math.cos(a) * 0.05); if (Math.abs(a) > 0.5) head.add(w); }
    } else if (s === 'short' || s === 'spiky') {
      cap.scale.set(1.04, 1.08, 1.05);
      const n = s === 'spiky' ? 9 : 7;
      for (let i = 0; i < n; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 6), hm); const a = (i / n) * Math.PI * 2; c.position.set(Math.cos(a) * 0.1, 0.17, Math.sin(a) * 0.09 + 0.02); c.rotation.set(Math.sin(a) * 0.6 + 0.3, 0, -Math.cos(a) * 0.6); head.add(c); }
      const fr = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hm); fr.position.set(0.03, 0.14, 0.11); fr.scale.set(1.4, 0.55, 0.8); head.add(fr);
    } else if (s === 'bob') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.215, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), hm); b.rotation.x = -0.6; b.position.z = -0.02; head.add(b);
    } else if (s === 'puff') {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), hm); p.position.set(0, 0.12, -0.03); p.scale.set(1.1, 0.8, 1.05); head.add(p);
    } else if (s === 'buns') {
      for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hm); b.position.set(sx * 0.12, 0.16, -0.05); head.add(b); }
    } else if (s === 'cap') {
      const cm = M(L.cap); const c = new THREE.Mesh(new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), cm); c.position.y = 0.02; head.add(c);
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 16, 1, false, -Math.PI / 2, Math.PI), cm); bill.position.set(0, 0.07, 0.13); bill.rotation.x = 0.15; head.add(bill);
    } else if (s === 'braid') {
      let parent = head; this.pony = [];
      const g0 = new THREE.Group(); g0.position.set(0, 0.05, -0.18); head.add(g0); parent = g0;
      for (let i = 0; i < 4; i++) { const seg = new THREE.Group(); if (i) seg.position.y = -0.08; parent.add(seg); const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), hm); b.position.y = -0.04; seg.add(b); this.pony.push(seg); parent = seg; }
      this.pony[0].rotation.x = 0.4;
    }
  }
  /* animate from a sim runner (or a pose name for menus/podium) */
  update(dt, r, extra = {}) {
    const v = r ? r.v : 0, top = r ? r.top : 13, sf = Math.min(1.3, v / top);
    const a = r ? r.phase * 2.1 : this.pt;
    this.pt += dt * 6;
    let pose = extra.pose || 'run';
    if (r && r.y > 0.05) pose = 'jump';
    if (r && r.stumble > 0.15 && r.shield <= 0) pose = 'stumble';
    const T = this.tmp || (this.tmp = {});
    const L0 = this.legs[0], L1 = this.legs[1], A0 = this.arms[0], A1 = this.arms[1];
    let hipY = 0.7, lean = 0.12 + sf * 0.16, headX = -0.08;
    const k = Math.min(1, dt * 14);
    const set = (o, x) => { o.rotation.x += (x - o.rotation.x) * k; };
    if (pose === 'run' && v > 0.5) {
      const amp = 0.45 + sf * 0.65;
      set(L0.hp, -Math.sin(a) * amp); set(L1.hp, Math.sin(a) * amp);
      set(L0.kn, 0.25 + Math.max(0, Math.cos(a)) * (0.6 + sf * 1.1)); set(L1.kn, 0.25 + Math.max(0, -Math.cos(a)) * (0.6 + sf * 1.1));
      set(L0.ft, -0.15 - L0.kn.rotation.x * 0.55 - L0.hp.rotation.x * 0.3); set(L1.ft, -0.15 - L1.kn.rotation.x * 0.55 - L1.hp.rotation.x * 0.3);
      set(A0.sh, Math.sin(a) * (0.5 + sf * 0.6)); set(A1.sh, -Math.sin(a) * (0.5 + sf * 0.6));
      set(A0.el, -1.5); set(A1.el, -1.5);
      hipY = 0.68 + Math.abs(Math.cos(a)) * 0.05 * sf;
    } else if (pose === 'run' || pose === 'idle') {
      const b = Math.sin(this.pt * 0.5) * 0.03;
      set(L0.hp, 0.02); set(L1.hp, -0.02); set(L0.kn, 0.05); set(L1.kn, 0.05); set(A0.sh, 0.1 + b); set(A1.sh, 0.1 - b); set(A0.el, -0.3); set(A1.el, -0.3); lean = 0.02; hipY = 0.7 + b * 0.2;
    } else if (pose === 'marks') { // crouched in the blocks, hands on the line
      set(L0.hp, -1.5); set(L0.kn, 2.3); set(L1.hp, -0.4); set(L1.kn, 2.1); set(A0.sh, -1.25); set(A1.sh, -1.25); set(A0.el, 0); set(A1.el, 0);
      lean = 1.25; hipY = 0.34; headX = -0.5;
    } else if (pose === 'set') {
      set(L0.hp, -1.25); set(L0.kn, 1.6); set(L1.hp, -0.2); set(L1.kn, 1.2); set(A0.sh, -1.45); set(A1.sh, -1.45); set(A0.el, 0); set(A1.el, 0);
      lean = 1.35; hipY = 0.5; headX = -0.55;
    } else if (pose === 'jump') {
      set(L0.hp, -1.25); set(L0.kn, 0.15); set(L1.hp, 0.5); set(L1.kn, 1.6); set(A0.sh, -1.2); set(A1.sh, 0.9); set(A0.el, -0.4); set(A1.el, -0.8); lean = 0.45;
    } else if (pose === 'stumble') {
      const w = Math.sin(this.pt * 3);
      set(L0.hp, -0.6); set(L1.hp, 0.5); set(L0.kn, 0.8); set(L1.kn, 0.6); set(A0.sh, -2 + w); set(A1.sh, -1.6 - w); set(A0.el, -0.3); set(A1.el, -0.3); lean = 0.7;
    } else if (pose === 'cheer') {
      const j = Math.abs(Math.sin(this.pt * 0.9));
      set(L0.hp, -0.2 * j); set(L1.hp, -0.2 * j); set(L0.kn, 0.3 * j); set(L1.kn, 0.3 * j);
      this.arms.forEach(A => { set(A.sh, -2.9); A.sh.rotation.z += (A.sx * 0.45 - A.sh.rotation.z) * k; set(A.el, -0.2); });
      lean = -0.12; hipY = 0.7 + j * 0.18; headX = 0.2;
    } else if (pose === 'pump') { // fist pump
      const j = Math.sin(this.pt * 1.2);
      set(A1.sh, -2.6 - j * 0.3); set(A1.el, -1.2 + j * 0.5); set(A0.sh, 0.2); set(A0.el, -1.2);
      set(L0.hp, 0.05); set(L1.hp, -0.05); set(L0.kn, 0.1); set(L1.kn, 0.1); lean = -0.05; headX = 0.15;
    } else if (pose === 'sad') {
      set(L0.hp, -0.3); set(L1.hp, -0.3); set(L0.kn, 0.6); set(L1.kn, 0.6); set(A0.sh, -0.7); set(A1.sh, -0.7); set(A0.el, -0.2); set(A1.el, -0.2); lean = 0.75; hipY = 0.62; headX = 0.3;
    }
    if (pose !== 'cheer') this.arms.forEach(A => { A.sh.rotation.z += (A.sx * 0.1 - A.sh.rotation.z) * k; });
    this.hips.position.y += (hipY + (r ? 0 : 0) - this.hips.position.y) * k;
    this.torso.rotation.x += (lean - this.torso.rotation.x) * k;
    this.head.rotation.x += (headX - this.head.rotation.x) * k;
    this.body.position.y = r ? r.y : 0;
    this.sh.scale.setScalar(Math.max(0.35, 1 - (r ? r.y : 0) * 0.4)); this.sh.position.y = 0.02 - (r ? 0 : 0);
    this.sh.position.y = 0.025 - (r ? r.y : 0) * 0; // body moves up, shadow stays (it is outside body)
    // ponytail physics-ish: lags behind, bounces with the stride, swings with steering
    if (this.pony) {
      const bob = r ? Math.cos(a * 2) * sf : Math.sin(this.pt) * 0.2, lat = r ? r.vx * 0.12 : 0;
      for (let i = 0; i < this.pony.length; i++) {
        const tx = (i === 0 ? 0.75 + sf * 0.75 : -0.22 + sf * 0.12) + bob * 0.22 * (i ? 1 : 0.5) + (r && r.y > 0.05 ? (r.vy > 0 ? -0.45 : 0.4) : 0);
        this.ponyV[i] += ((tx - this.pony[i].rotation.x) * 90 - this.ponyV[i] * 9) * dt;
        this.pony[i].rotation.x += this.ponyV[i] * dt;
        this.ponyA[i] += ((-lat * (i + 1) * 0.5 + Math.sin(a + i) * 0.08 * sf - this.pony[i].rotation.z) * 60 - this.ponyA[i] * 8) * dt;
        this.pony[i].rotation.z += this.ponyA[i] * dt;
      }
    }
    if (!r) { this.bubble.visible = false; this.aura.visible = false; }
    if (r) {
      this.bubble.visible = r.shield > 0; if (this.bubble.visible) { this.bubble.rotation.y += dt * 2; this.bubble.material.uniforms.t.value += dt; }
      this.aura.visible = r.cleats > 0 || r.sling > 0 || r.rocket > 0;
      if (this.aura.visible) this.aura.material.uniforms.c.value.set(r.cleats > 0 ? 0xffc830 : r.sling > 0 ? 0x7fd4ff : 0xff7a30), this.aura.material.uniforms.t.value += dt;
    }
  }
  // world foot positions (for dust)
  footStrike(a) { return Math.sin(a) > 0; }
}

export function fresnelMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, t: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 c; uniform float t; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.2); float h = 0.5+0.5*sin(vP.y*14.0 - t*6.0); gl_FragColor = vec4(c*(1.2+h*0.6), f*0.85 + h*0.05); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
export { canvasTex, star };
