/* ==========================================================================
   RILEY'S RUN — world.js   Three.js scene: stadiums, tracks, crowds,
   pickups, hurdles, particles, finish tape, podium, cameras.
   ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js';
import { LANES, LW, laneOff } from './tracks.js';
import { Runner3D, canvasTex, star, fresnelMat } from './models.js';
import { KIDS } from './sim.js';

const THEMES = {
  sunny: { skyTop: '#2f7fe0', skyHor: '#bfe4ff', sun: [0.5, 0.8, 0.3], sunCol: '#fff2d6', sunI: 2.6, amb: '#cfe6ff', ambI: 0.9, ground: '#4c9a3a', track: '#c8432f', fog: [160, 700], night: false, seats: ['#1f6fd1', '#e8e8e8', '#e23b3b', '#ffcc22'] },
  hurdle: { skyTop: '#3a69c9', skyHor: '#f3d9b0', sun: [-0.4, 0.6, 0.5], sunCol: '#ffe2b8', sunI: 2.4, amb: '#d8e4ff', ambI: 0.85, ground: '#3f8a3a', track: '#2a63c8', fog: [160, 700], night: false, seats: ['#7b2fd1', '#ffffff', '#20b38c', '#ffcc22'] },
  boardwalk: { skyTop: '#41307a', skyHor: '#ffad5c', sun: [0.75, 0.16, 0.6], sunCol: '#ffb36b', sunI: 2.8, amb: '#ffc9a0', ambI: 0.75, ground: '#e7c98c', track: '#a8774a', fog: [140, 900], night: false, sunset: true, seats: ['#ff6b6b', '#ffd93d', '#6bcbff', '#ffffff'] },
  night: { skyTop: '#03040d', skyHor: '#1a2350', sun: [0.2, 0.9, 0.25], sunCol: '#cfe0ff', sunI: 1.6, amb: '#6680cc', ambI: 0.65, ground: '#1f4a2a', track: '#a8322a', fog: [120, 600], night: true, seats: ['#2244aa', '#aa2244', '#ddd', '#ffcc22'] },
};

/* --------------------------- geometry helpers --------------------------- */
function ribbon(path, s0, s1, step, A, B, vScale = 8, colorFn) {
  const pos = [], uv = [], col = [], idx = [];
  const n = Math.max(1, Math.ceil((s1 - s0) / step)); const q = {};
  for (let i = 0; i <= n; i++) {
    const s = s0 + (s1 - s0) * i / n;
    for (const [P, u] of [[A, 0], [B, 1]]) {
      path.pos(s, 3.5 - P.o / LW, 0, q);
      pos.push(q.wx, q.wy + P.y, q.wz); uv.push(u, s / vScale);
      if (colorFn) { const c = colorFn(s, u); col.push(c.r, c.g, c.b); }
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function merge(geos) { // non-indexed concat of position/normal/(uv)/(color)
  const out = { position: [], normal: [], uv: [], color: [] }; let hasC = geos.every(g => g.getAttribute('color'));
  for (let g of geos) {
    g = g.index ? g.toNonIndexed() : g;
    for (const k of ['position', 'normal', 'uv']) { const a = g.getAttribute(k); if (a) out[k].push(...a.array); }
    if (hasC) out.color.push(...g.getAttribute('color').array);
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  m.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  if (out.uv.length) m.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  if (hasC) m.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
  return m;
}
function glowTex() {
  return canvasTex('glow', 128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
}
function trackTex(theme) {
  return canvasTex('track-' + theme, 512, 512, (g, w, h) => {
    const T = THEMES[theme];
    if (theme === 'boardwalk') {
      g.fillStyle = '#9b6c40'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) { // planks across the path
        const sh = 0.85 + Math.random() * 0.3; g.fillStyle = `rgb(${165 * sh | 0},${115 * sh | 0},${70 * sh | 0})`; g.fillRect(0, y + 2, w, 28);
        for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(60,30,10,.12)'; g.fillRect(Math.random() * w, y + 4 + Math.random() * 22, 30 + Math.random() * 80, 1.5); }
        g.fillStyle = '#3b2412'; for (let x = 8; x < w; x += 125) { g.fillRect(x + (y % 64 ? 60 : 0), y + 12, 4, 4); }
      }
    } else {
      g.fillStyle = T.track; g.fillRect(0, 0, w, h);
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 26; d[i] += n; d[i + 1] += n * 0.7; d[i + 2] += n * 0.7; }
      g.putImageData(img, 0, 0);
    }
    // lane lines: width = 0.4 margin + 8 lanes + 0.4
    const W = 10.8, px = w / W;
    g.fillStyle = theme === 'boardwalk' ? 'rgba(255,250,235,.75)' : '#f6f6f6';
    for (let i = 0; i <= LANES; i++) { const x = (0.4 + i * LW) * px; g.fillRect(x - 2.5, 0, 5, h); }
  });
}
function grassTex(col, night) {
  return canvasTex('grass-' + col, 256, 256, (g, w, h) => {
    g.fillStyle = col; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = (y / 32) % 2 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)'; g.fillRect(0, y, w, 32); }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,40,0' : '180,255,150'},${0.05 + Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 3); }
  });
}
function bannerTex() {
  return canvasTex('banner', 1024, 128, (g, w, h) => {
    const items = [['RILEY\'S RUN', '#ff2fa0', '#fff'], ['GO RILEY!', '#1d2a7a', '#ffd23a'], ['JAXON #9', '#d71f2b', '#fff'], ['TRACK & FIELD', '#ffd23a', '#1d2a7a']];
    const cw = w / items.length;
    items.forEach(([t, bg, fg], i) => { g.fillStyle = bg; g.fillRect(i * cw, 0, cw, h); g.fillStyle = fg; g.font = '900 54px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * cw + cw / 2, h / 2 + 2); });
  });
}
function chevronTex() {
  const t = canvasTex('chev', 128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 2; k++) { const y = k * h / 2; g.strokeStyle = '#ffffff'; g.lineWidth = 18; g.lineJoin = 'round'; g.beginPath(); g.moveTo(16, y + 90); g.lineTo(64, y + 30); g.lineTo(112, y + 90); g.stroke(); }
  });
  t.wrapT = THREE.RepeatWrapping; return t;
}
function itemTex() {
  return canvasTex('itembox', 128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff5fd2'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(1, '#41e0ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = '#fff'; g.font = '900 86px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#7a2a9a'; g.strokeText('?', 64, 70); g.fillText('?', 64, 70);
  });
}
function numberTex(n, col) {
  return canvasTex('num' + n + col, 128, 128, (g, w, h) => { g.fillStyle = col; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '900 90px Arial Black, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 70); });
}

/* ------------------------------- particles ------------------------------- */
class Particles {
  constructor(n = 2600) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 3); this.s = new Float32Array(n); this.a = new Float32Array(n);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.g = new Float32Array(n); this.drag = new Float32Array(n); this.s0 = new Float32Array(n);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.s, 1)); geo.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: glowTex() }, px: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float px;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = size*px/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D tex; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(tex, gl_PointCoord); gl_FragColor=vec4(vC*t.rgb, t.a*vA); if(gl_FragColor.a<0.01) discard; }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5;
    this.mat2 = this.mat.clone(); this.mat2.blending = THREE.NormalBlending; this.mat2.uniforms.tex.value = glowTex();
  }
  spawn(x, y, z, vx, vy, vz, col, size, life, grav = 0, drag = 0) {
    const i = this.i; this.i = (this.i + 1) % this.n; const j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    const c = col; this.c[j] = c.r; this.c[j + 1] = c.g; this.c[j + 2] = c.b; this.s0[i] = size; this.life[i] = life; this.max[i] = life; this.g[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.a[i] = 0; continue; }
      this.life[i] -= dt; const j = i * 3, f = Math.max(0, this.life[i] / this.max[i]);
      this.v[j + 1] -= this.g[i] * dt; const d = 1 - this.drag[i] * dt; this.v[j] *= d; this.v[j + 1] *= d; this.v[j + 2] *= d;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.02 && this.g[i] > 0) { this.p[j + 1] = 0.02; this.v[j + 1] *= -0.3; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; }
      this.a[i] = Math.min(1, f * 2.2); this.s[i] = this.s0[i] * (0.5 + 0.5 * f);
    }
    const g = this.pts.geometry; for (const k of ['position', 'color', 'size', 'alpha']) g.getAttribute(k).needsUpdate = true;
  }
}
const C = h => new THREE.Color(h);

/* ================================= World ================================= */
export class World {
  constructor(canvas, quality) {
    this.quality = quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = quality === 'high'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1600);
    this.clock = 0; this.shake = 0; this.camMode = 'chase'; this.camT = 0;
    this.parts = new Particles(quality === 'low' ? 1400 : 2800); this.scene.add(this.parts.pts);
    this.tmpV = new THREE.Vector3(); this.q = {};
    this.resize();
  }
  setQuality(q) { this.quality = q; this.renderer.shadowMap.enabled = q === 'high'; this.resize(); }
  resize() {
    const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, this.quality === 'high' ? 2 : this.quality === 'low' ? 1 : 1.5);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.parts.mat.uniforms.px.value = h * pr * 0.9;
    this.baseFov = w / h < 0.8 ? 74 : 60;
  }

  /* --------------------------------- build --------------------------------- */
  build(course, theme, field) {
    this.jumboC = null; this.jumboT = null; this.ocean = null; this.ferris = null; this.socks = null; this.wind = null; this.windLines = null; this.hBar = null;
    if (this.root) { this.scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const root = this.root = new THREE.Group(); this.scene.add(root);
    this.course = course; this.theme = theme; const T = this.T = THEMES[theme]; const path = course.path;
    // ---- lights & sky
    this.scene.fog = new THREE.Fog(T.skyHor, T.fog[0], T.fog[1]);
    this.scene.background = C(T.skyHor);
    const hemi = new THREE.HemisphereLight(T.amb, T.ground, T.ambI); root.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(T.sunCol, T.sunI); this.sunDir = new THREE.Vector3(...T.sun).normalize();
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 120; sun.shadow.bias = -0.0005;
    root.add(sun); root.add(sun.target);
    root.add(this.sky(T));
    // ---- ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: T.night ? '#14301c' : theme === 'boardwalk' ? '#e2c48a' : '#5c9c48' }));
    ground.position.y = -0.06; ground.receiveShadow = true; root.add(ground);
    // ---- track surface
    const tex = trackTex(theme); tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
    const L = path.len, s0 = path.loop ? 0 : 0, s1 = path.loop ? L : L;
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: theme === 'boardwalk' ? 0.8 : 0.92, metalness: 0 });
    const trackMesh = new THREE.Mesh(ribbon(path, s0, s1, 1, { o: laneOff(-0.5) + 0.4, y: 0 }, { o: laneOff(7.5) - 0.4, y: 0 }, 6), tm);
    trackMesh.receiveShadow = true; root.add(trackMesh);
    // kerbs & aprons
    const kerbM = new THREE.MeshStandardMaterial({ color: theme === 'boardwalk' ? '#5a3a1c' : '#f0f0f0', roughness: 0.6 });
    root.add(new THREE.Mesh(ribbon(path, s0, s1, 2, { o: laneOff(-0.5) + 0.65, y: 0.08 }, { o: laneOff(-0.5) + 0.4, y: 0.08 }), kerbM));
    root.add(new THREE.Mesh(ribbon(path, s0, s1, 2, { o: laneOff(7.5) - 0.4, y: 0.08 }, { o: laneOff(7.5) - 0.65, y: 0.08 }), kerbM));
    const apronM = new THREE.MeshLambertMaterial({ color: theme === 'boardwalk' ? '#7b5232' : T.track, map: null });
    root.add(new THREE.Mesh(ribbon(path, s0, s1, 2, { o: laneOff(7.5) - 0.65, y: 0.005 }, { o: laneOff(7.5) - 3.5, y: 0.005 }), apronM));
    // ---- start & finish lines
    const fin = course.start + course.dist, ck = canvasTex('checker', 256, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
    root.add(new THREE.Mesh(ribbon(path, fin - 0.5, fin + 0.5, 1, { o: laneOff(-0.5), y: 0.012 }, { o: laneOff(7.5), y: 0.012 }, 1), new THREE.MeshBasicMaterial({ map: ck })));
    if (Math.abs(((course.start - fin) % L + L) % L) > 2) root.add(new THREE.Mesh(ribbon(path, course.start - 0.08, course.start + 0.08, 1, { o: laneOff(-0.5), y: 0.012 }, { o: laneOff(7.5), y: 0.012 }), new THREE.MeshBasicMaterial({ color: '#fff' })));
    this.finishGantry(path, fin);
    this.startBlocks(path, course.start);
    // ---- surroundings
    if (theme === 'boardwalk') this.boardwalkScenery(path, T); else this.stadium(path, T, theme);
    // ---- objects
    this.buildHurdles(course); this.buildBoxes(course); this.buildStars(course); this.buildPads(course); this.buildHazards(course);
    this.traps = new Map();
    this.buildPodium(path, fin, theme);
    // ---- runners
    this.runners = field.map((f, i) => {
      const kid = f.kid, isMe = f.local, label = isMe ? null : (kid === 'riley' || kid === 'jaxon') ? KIDS[kid].name : null;
      const m = new Runner3D(kid, isMe ? '#ffe14a' : KIDS[kid].color, label);
      root.add(m.root); m.root.traverse(o => { if (o.isMesh && o !== m.sh && o !== m.bubble && o !== m.aura) o.castShadow = true; });
      return m;
    });
    this.rings = [];
    this.camPos = null;
  }
  sky(T) {
    const g = new THREE.SphereGeometry(1200, 32, 16);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: C(T.skyTop) }, hor: { value: C(T.skyHor) }, sunD: { value: new THREE.Vector3(...T.sun).normalize() }, sunC: { value: C(T.sunCol) }, night: { value: T.night ? 1 : 0 }, sunset: { value: T.sunset ? 1 : 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 top, hor, sunD, sunC; uniform float night, sunset; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
        void main(){ float y = max(vD.y, 0.0); vec3 c = mix(hor, top, pow(y, 0.55));
          float s = max(dot(vD, sunD), 0.0);
          c += sunC * (pow(s, 600.0)*3.0 + pow(s, 18.0)*0.35*(1.0-night) + sunset*pow(s,4.0)*0.35);
          if (night > 0.5) { vec3 q = floor(vD*420.0); float st = step(0.9975, h(q)); c += vec3(st)*smoothstep(0.05,0.3,y); }
          if (vD.y < 0.0) c = mix(hor, hor*0.6, min(1.0,-vD.y*4.0));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const s = new THREE.Mesh(g, m); s.frustumCulled = false; s.renderOrder = -10; this.skyMesh = s; return s;
  }
  stadium(path, T, theme) {
    const root = this.root, L = path.len, loop = path.loop;
    const sA = loop ? 0 : -10, sB = loop ? L : L + 10;
    // infield grass (ovals)
    if (loop) {
      const sh = new THREE.Shape(), q = {};
      for (let s = 0; s < L; s += 2) { path.pos(s, -0.5 - 0.6 / LW, 0, q); s === 0 ? sh.moveTo(q.wx, -q.wz) : sh.lineTo(q.wx, -q.wz); }
      const gt = grassTex(T.night ? '#2a6b34' : '#4fa842'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(0.04, 0.04);
      const inf = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: gt }));
      inf.position.y = 0.0; inf.receiveShadow = true; root.add(inf);
      // a few infield props: long jump pit, javelin flags
      const flagM = new THREE.MeshBasicMaterial({ color: '#ffd23a' });
      for (let i = 0; i < 10; i++) { const q2 = path.pos(L * 0.25 + i * 4, -6, 0); const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 4), flagM); f.position.set(q2.wx, 0.3, q2.wz); root.add(f); }
    } else {
      const gt = grassTex('#4fa842'); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(1, 30);
      for (const side of [1, -1]) root.add(new THREE.Mesh(ribbon(path, sA, sB, 4, { o: side * 5.4, y: 0.003 }, { o: side * 14, y: 0.003 }, 8), new THREE.MeshLambertMaterial({ map: gt })));
    }
    // grandstands: stepped rows with crowd
    const rows = this.quality === 'low' ? 9 : 13, sideList = loop ? [-1] : [-1, 1];
    const standGeos = [], crowdPos = [];
    const seat = T.seats.map(C);
    for (const side of sideList) {
      const base = side < 0 ? laneOff(7.5) - 4.2 : laneOff(-0.5) + 9.2;
      for (let r = 0; r < rows; r++) {
        const o0 = base + side * r * 0.95, o1 = o0 + side * 0.95, y0 = 0.9 + r * 0.6, y1 = y0 + 0.6;
        const cf = (s) => seat[(((Math.floor(s / 14) + (r > 6 ? 1 : 0)) % seat.length) + seat.length) % seat.length];
        standGeos.push(ribbon(path, sA, sB, 3, { o: o0, y: y0 - 0.6 }, { o: o0, y: y0 }, 8, (s) => C('#6c7280')));
        standGeos.push(ribbon(path, sA, sB, 3, side < 0 ? { o: o0, y: y0 } : { o: o1, y: y0 }, side < 0 ? { o: o1, y: y0 } : { o: o0, y: y0 }, 8, cf));
        crowdPos.push({ o: o0 + side * 0.45, y: y0, r });
      }
      // front wall with banners
      const bt = bannerTex(); bt.wrapS = THREE.ClampToEdgeWrapping; bt.wrapT = THREE.RepeatWrapping;
      const bw = new THREE.Mesh(ribbon(path, sA, sB, 2, { o: base, y: 0 }, { o: base, y: 1.0 }, 40), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide }));
      // rotate UVs so the banner runs along s: swap u/v
      const uv = bw.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v, u); } bt.wrapS = THREE.RepeatWrapping; bt.wrapT = THREE.ClampToEdgeWrapping;
      root.add(bw);
      // back wall + roof
      const top = base + side * rows * 0.95, ytop = 0.9 + rows * 0.6;
      standGeos.push(ribbon(path, sA, sB, 4, { o: top, y: 0 }, { o: top, y: ytop + 4 }, 8, () => C('#4a4f5c')));
    }
    const standM = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    root.add(new THREE.Mesh(merge(standGeos), standM));
    this.crowd(path, sA, sB, crowdPos);
    // light towers
    const towers = loop ? [0.18, 0.32, 0.68, 0.82].map(f => f * L) : [0.1, 0.4, 0.7, 1.0].map(f => f * L);
    for (const side of loop ? [-1] : [-1, 1]) for (const s of towers) this.lightTower(path, s, side < 0 ? laneOff(7.5) - 4.2 - side * -1 * (rows * 0.95 + 3) : laneOff(-0.5) + 9.2 + rows * 0.95 + 3, T.night);
    // jumbotron at the finish
    this.jumbo(path, theme);
    // distant skyline / hills
    const hillM = new THREE.MeshLambertMaterial({ color: T.night ? '#0a1020' : '#7aa0c8', fog: true });
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, d = 420 + (i % 3) * 60; const hgt = 30 + (i * 37 % 60); const m = new THREE.Mesh(new THREE.BoxGeometry(40 + (i * 13 % 50), hgt, 30), hillM); m.position.set(Math.cos(a) * d + this.center(path).x, hgt / 2 - 1, Math.sin(a) * d + this.center(path).z); root.add(m); }
    if (T.night) this.flashes(path, sA, sB, crowdPos);
  }
  center(path) { if (this._c) return this._c; let x = 0, z = 0; for (const p of path.p) { x += p.x; z += p.z; } this._c = { x: x / path.p.length, z: z / path.p.length }; return this._c; }
  crowd(path, sA, sB, rowsInfo) {
    const step = this.quality === 'low' ? 1.25 : 0.8, mats = [];
    const body = new THREE.CapsuleGeometry(0.2, 0.35, 2, 6); body.translate(0, 0.38, 0);
    const head = new THREE.SphereGeometry(0.14, 6, 5); head.translate(0, 0.85, 0);
    // arms up
    const arm = new THREE.CapsuleGeometry(0.05, 0.3, 1, 4); const a1 = arm.clone().rotateZ(0.5).translate(-0.24, 0.85, 0), a2 = arm.clone().rotateZ(-0.5).translate(0.24, 0.85, 0);
    const geo = merge([body, head, a1, a2]);
    const pos = []; const q = {};
    for (const R of rowsInfo) for (let s = sA; s < sB; s += step) if (Math.random() < 0.88) pos.push([s + Math.random() * 0.3, R.o, R.y]);
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.crowdU.uTime; sh.uniforms.uCheer = this.crowdU.uCheer;
      sh.vertexShader = 'uniform float uTime; uniform float uCheer;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float id = float(gl_InstanceID); float ph = fract(sin(id*12.9898)*43758.5453);
        float jump = max(0.0, sin(uTime*(5.0+ph*4.0) + ph*40.0));
        transformed.y += jump*(0.04 + uCheer*0.3*step(0.35, ph));
        if (position.y > 0.7) transformed.y += (position.y-0.7)*uCheer*0.6*ph;`);
    };
    this.crowdU = { uTime: { value: 0 }, uCheer: { value: 0.2 } };
    const im = new THREE.InstancedMesh(geo, mat, pos.length); const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const pal = ['#ff2fa0', '#ffffff', '#2f8bff', '#ffd23a', '#ff3030', '#2fd27a', '#a35bff', '#ff8a2a', '#222'];
    pos.forEach(([s, o, y], i) => {
      path.pos(s, 3.5 - o / LW, 0, q); const yaw = Math.atan2(q.tx, q.tz) + (o > 0 ? -Math.PI / 2 : Math.PI / 2);
      m4.makeRotationY(yaw); m4.setPosition(q.wx, y, q.wz); const sc = 0.9 + Math.random() * 0.25; m4.scale(new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(i, m4);
      im.setColorAt(i, col.set(pal[(Math.random() * pal.length) | 0]));
    });
    im.frustumCulled = false; this.root.add(im);
  }
  flashes(path, sA, sB, rowsInfo) { // camera flashes twinkling in the night crowd
    const n = 500, p = new Float32Array(n * 3), q = {};
    for (let i = 0; i < n; i++) { const R = rowsInfo[(Math.random() * rowsInfo.length) | 0]; path.pos(sA + Math.random() * (sB - sA), 3.5 - R.o / LW, 0, q); p.set([q.wx, R.y + 1, q.wz], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.ShaderMaterial({ uniforms: { t: this.crowdU.uTime, tex: { value: glowTex() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float t; varying float a; void main(){ float id=float(gl_VertexID); float ph=fract(sin(id*91.7)*4375.85); a = step(0.985, fract(t*0.7+ph*13.0)); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = a*900.0/max(1.0,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D tex; varying float a; void main(){ vec4 c=texture2D(tex,gl_PointCoord); gl_FragColor=vec4(1.0,1.0,1.0,c.a*a); }` });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; this.root.add(pts);
  }
  lightTower(path, s, o, night) {
    const q = path.pos(s, 3.5 - o / LW, 0), g = new THREE.Group(); g.position.set(q.wx, 0, q.wz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 28, 8), new THREE.MeshLambertMaterial({ color: '#9aa3b3' })); pole.position.y = 14; g.add(pole);
    const pt = canvasTex('lamps', 128, 64, (c, w, h) => { c.fillStyle = '#222'; c.fillRect(0, 0, w, h); for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) { c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(12 + x * 21, 11 + y * 21, 8, 0, 7); c.fill(); } });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.5), [0, 0, 0, 0, 1, 1].map(i => i ? new THREE.MeshBasicMaterial({ map: pt, color: night ? '#ffffff' : '#bbbbbb' }) : new THREE.MeshLambertMaterial({ color: '#555' })));
    panel.position.y = 29; g.add(panel);
    const c = this.center(path); panel.lookAt(c.x - q.wx, 20, c.z - q.wz);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: night ? '#fff6dd' : '#fffaf0', transparent: true, opacity: night ? 0.95 : 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.scale.set(night ? 26 : 12, night ? 18 : 8, 1); glow.position.y = 29; g.add(glow);
    if (night) { const sp = new THREE.PointLight('#fff1d0', 400, 140, 1.6); sp.position.y = 27; g.add(sp); }
    this.root.add(g);
  }
  jumbo(path, theme) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; this.jumboC = c;
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.jumboT = t;
    const fin = this.course.start + this.course.dist;
    const o = path.loop ? laneOff(-0.5) + 22 : laneOff(-0.5) + 10;
    const q = path.pos(fin - (path.loop ? 40 : -30), 3.5 - o / LW, 0);
    const g = new THREE.Group(); g.position.set(q.wx, 0, q.wz);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: t, toneMapped: false })); scr.position.y = 10; g.add(scr);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 0.6), new THREE.MeshLambertMaterial({ color: '#222' })); frame.position.set(0, 10, -0.35); g.add(frame);
    for (const sx of [-5, 5]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 0.6), frame.material); l.position.set(sx, 3, -0.4); g.add(l); }
    const p2 = path.pos(fin - (path.loop ? 40 : -30), 3.5, 0); g.lookAt(p2.wx, 0, p2.wz);
    if (!path.loop) { const qq = path.pos(fin - 60, 3.5, 0); g.lookAt(qq.wx, 0, qq.wz); }
    this.root.add(g); this.drawJumbo(['RILEY\'S RUN'], 0);
  }
  drawJumbo(lines, t) {
    if (!this.jumboC) return;
    const g = this.jumboC.getContext('2d'), w = 512, h = 256;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#16194a'); gr.addColorStop(1, '#3a0f4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff2fa0'; g.fillRect(0, 0, w, 44); g.fillStyle = '#fff'; g.font = '900 30px Arial Black, Arial'; g.textAlign = 'center'; g.fillText("RILEY'S RUN", w / 2, 33);
    g.textAlign = 'left'; g.font = '800 30px Arial';
    lines.slice(1).forEach((l, i) => { g.fillStyle = i === 0 ? '#ffd23a' : '#fff'; g.fillText(l, 22, 86 + i * 38); });
    if (lines.length === 1) { g.textAlign = 'center'; g.fillStyle = '#ffd23a'; g.font = '900 40px Arial Black, Arial'; g.fillText('GO RILEY!', w / 2, 150); }
    g.textAlign = 'right'; g.fillStyle = '#7fe8ff'; g.font = '800 30px monospace'; if (t) g.fillText(t.toFixed(2), w - 18, h - 20);
    this.jumboT.needsUpdate = true;
  }
  boardwalkScenery(path, T) {
    const root = this.root, L = path.len, q = {};
    // ocean on the right (negative offsets), sand strip, railing
    const oceanM = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, sunD: { value: new THREE.Vector3(...T.sun).normalize() }, fogC: { value: C(T.skyHor) } },
      vertexShader: `uniform float t; varying vec3 vW; void main(){ vec3 p = position; vec4 w = modelMatrix*vec4(p,1.0); w.y += sin(w.x*0.08+t*1.3)*0.25 + sin(w.z*0.11-t*1.1)*0.2; vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float t; uniform vec3 sunD, fogC; varying vec3 vW; void main(){ vec3 V = normalize(cameraPosition - vW);
        float r = sin(vW.x*0.6+t*2.0)*sin(vW.z*0.5-t*1.7)*0.5+0.5;
        vec3 N = normalize(vec3(sin(vW.x*0.35+t)*0.06, 1.0, cos(vW.z*0.3-t*1.2)*0.06));
        vec3 R = reflect(-V, N); float s = pow(max(dot(R, sunD),0.0), 90.0);
        float fr = pow(1.0-max(dot(N,V),0.0), 3.0);
        vec3 c = mix(vec3(0.05,0.22,0.38), vec3(0.95,0.55,0.35), fr*0.9) + vec3(1.0,0.75,0.45)*s*3.0 + r*0.03;
        float d = length(cameraPosition - vW); c = mix(c, fogC, smoothstep(150.0, 900.0, d)); gl_FragColor = vec4(c,1.0); }`,
    });
    this.ocean = oceanM;
    const c = this.center(path);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 80, 80).rotateX(-Math.PI / 2), oceanM); ocean.position.set(c.x, -1.2, c.z); root.add(ocean);
    // sand under & beside the boardwalk
    const sandM = new THREE.MeshLambertMaterial({ color: '#e9cc90' });
    root.add(new THREE.Mesh(ribbon(path, -40, L + 40, 4, { o: 40, y: -0.15 }, { o: -22, y: -0.15 }), sandM));
    // beach slopes into the water
    root.add(new THREE.Mesh(ribbon(path, -40, L + 40, 4, { o: -22, y: -0.15 }, { o: -40, y: -1.6 }), sandM));
    // town side: grass + shops
    const shopCols = ['#ff6b6b', '#ffd93d', '#6bcbff', '#ff9ff3', '#7dff8a', '#ffffff'];
    const awn = canvasTex('awning', 64, 64, (g) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff' : '#ff4f6d'; g.fillRect(i * 8, 0, 8, 64); } });
    for (let s = 10; s < L; s += 16) {
      path.pos(s, 3.5 - 14 / LW, 0, q); const yaw = Math.atan2(q.tx, q.tz);
      const hgt = 4 + (s * 7 % 5), wdt = 9 + (s * 3 % 4);
      const b = new THREE.Mesh(new THREE.BoxGeometry(wdt, hgt, 7), new THREE.MeshLambertMaterial({ color: shopCols[(s / 16 | 0) % shopCols.length] }));
      b.position.set(q.wx, hgt / 2, q.wz); b.rotation.y = yaw; root.add(b);
      const a = new THREE.Mesh(new THREE.BoxGeometry(wdt, 0.2, 2.2), new THREE.MeshLambertMaterial({ map: awn })); a.position.set(0, -hgt / 2 + 2.6, -4.2); a.rotation.x = -0.35; b.add(a);
      a.position.z = -4.2; // faces track side (-z local is toward lane 0? handled by flip)
      b.rotateY(Math.PI / 2 * 0); 
    }
    // railing + lamp posts on both sides
    const railM = new THREE.MeshLambertMaterial({ color: '#f4efe6' });
    for (const o of [laneOff(-0.5) + 1.2, laneOff(7.5) - 1.2]) root.add(new THREE.Mesh(ribbon(path, 0, L, 2, { o, y: 1.0 }, { o, y: 1.12 }), railM));
    const postG = new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), lampG = new THREE.CylinderGeometry(0.08, 0.12, 5, 6);
    const posts = [], lamps = [];
    for (let s = 0; s < L; s += 2.5) for (const o of [laneOff(-0.5) + 1.2, laneOff(7.5) - 1.2]) { path.pos(s, 3.5 - o / LW, 0, q); posts.push([q.wx, 0.55, q.wz]); }
    const pim = new THREE.InstancedMesh(postG, railM, posts.length), m4 = new THREE.Matrix4();
    posts.forEach((p, i) => { m4.makeTranslation(...p); pim.setMatrixAt(i, m4); }); root.add(pim);
    const glowM = new THREE.SpriteMaterial({ map: glowTex(), color: '#ffd9a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    for (let s = 5; s < L; s += 25) for (const o of [laneOff(-0.5) + 1.6, laneOff(7.5) - 1.6]) {
      path.pos(s, 3.5 - o / LW, 0, q); const l = new THREE.Mesh(lampG, new THREE.MeshLambertMaterial({ color: '#2d3a4a' })); l.position.set(q.wx, 2.5, q.wz); root.add(l);
      const gl = new THREE.Sprite(glowM); gl.scale.set(2.2, 2.2, 1); gl.position.set(q.wx, 5.1, q.wz); root.add(gl);
    }
    // palm trees on the beach
    const trunkM = new THREE.MeshLambertMaterial({ color: '#8a5a33' }), leafM = new THREE.MeshLambertMaterial({ color: '#2f8a3a', side: THREE.DoubleSide });
    const leafG = new THREE.ConeGeometry(0.9, 4.2, 3, 1, true); leafG.translate(0, 2.1, 0);
    for (let s = 8; s < L; s += 22) {
      const o = -(9 + (s * 13 % 7)); path.pos(s, 3.5 - o / LW, 0, q);
      const p = new THREE.Group(); p.position.set(q.wx, 0, q.wz);
      let y = 0, x = 0; for (let k = 0; k < 7; k++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - k * 0.015, 0.26 - k * 0.015, 1.1, 6), trunkM); x += 0.08 * k * 0.3; seg.position.set(x, y + 0.55, 0); seg.rotation.z = -0.06 * k; p.add(seg); y += 1.05; }
      for (let k = 0; k < 7; k++) { const lf = new THREE.Mesh(leafG, leafM); lf.position.set(x, y, 0); lf.rotation.set(Math.cos(k / 7 * 6.28) * 1.6, k, Math.sin(k / 7 * 6.28) * 1.6); lf.scale.set(0.5, 1, 0.15); p.add(lf); }
      root.add(p);
    }
    // ferris wheel in the distance (spins)
    const fw = this.ferris = new THREE.Group(); const fq = path.pos(L * 0.55, 3.5 - 45 / LW, 0); fw.position.set(fq.wx, 26, fq.wz);
    const rimM = new THREE.MeshBasicMaterial({ color: '#ffe0a8', fog: true });
    fw.add(new THREE.Mesh(new THREE.TorusGeometry(22, 0.35, 6, 48), rimM));
    for (let i = 0; i < 16; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 44, 0.2), rimM); sp.rotation.z = i / 16 * Math.PI; fw.add(sp); const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshLambertMaterial({ color: shopCols[i % 6] })); cab.position.set(Math.cos(i / 16 * 6.283) * 22, Math.sin(i / 16 * 6.283) * 22, 0); fw.add(cab); }
    fw.lookAt(fq.wx + fq.lx, 26, fq.wz + fq.lz); fw.rotateY(Math.PI / 2);
    const legM = new THREE.MeshLambertMaterial({ color: '#c9b9a0' });
    for (const sx of [-1, 1]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 30, 0.6), legM); lg.position.set(fq.wx + sx * 6 * fq.tx, 12, fq.wz + sx * 6 * fq.tz); lg.rotation.z = sx * 0.2; root.add(lg); }
    root.add(fw);
    // spectators along the town side railing
    const rowsInfo = [{ o: laneOff(-0.5) + 2.2, y: 0, r: 0 }, { o: laneOff(-0.5) + 3.1, y: 0, r: 1 }];
    this.crowd(path, 0, L, rowsInfo);
    // gust zone markers: windsocks
    const sockM = new THREE.MeshLambertMaterial({ color: '#ff7a30' });
    this.socks = [];
    for (const g of this.course.gusts) for (const s of [g.s0, (g.s0 + g.s1) / 2, g.s1]) {
      path.pos(s, 3.5 - (laneOff(-0.5) + 1.5) / LW, 0, q);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 5), railM); pole.position.set(q.wx, 1.6, q.wz); root.add(pole);
      const sk = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.4, 8, 1, true), sockM); sk.position.set(q.wx, 3.0, q.wz); sk.rotation.z = Math.PI / 2 * g.side; root.add(sk); this.socks.push({ m: sk, side: g.side, yaw: Math.atan2(q.tx, q.tz) });
    }
  }
  finishGantry(path, fin) {
    const q = {}, g = new THREE.Group(), M = new THREE.MeshLambertMaterial({ color: '#e8e8e8' });
    const pA = path.pos(fin, -0.9, 0, {}), pB = path.pos(fin, 7.9, 0, {});
    for (const p of [pA, pB]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 0.35), M); post.position.set(p.wx, p.wy + 2.6, p.wz); this.root.add(post); }
    const mid = path.pos(fin, 3.5, 0, {});
    const ft = canvasTex('finishBanner', 512, 64, (c, w, h) => { c.fillStyle = '#ff2fa0'; c.fillRect(0, 0, w, h); for (let x = 0; x < 32; x++) { c.fillStyle = x % 2 ? '#111' : '#fff'; c.fillRect(x * 16, 0, 16, 8); c.fillRect(((x + 1) % 32) * 16, h - 8, 16, 8); } c.fillStyle = '#fff'; c.font = '900 36px Arial Black, Arial'; c.textAlign = 'center'; c.fillText('FINISH', w / 2, 46); });
    const ban = new THREE.Mesh(new THREE.BoxGeometry(LW * 8 + 2.2, 1.0, 0.2), new THREE.MeshBasicMaterial({ map: ft }));
    ban.position.set(mid.wx, mid.wy + 5.0, mid.wz); ban.rotation.y = Math.atan2(mid.tx, mid.tz) + Math.PI / 2; ban.rotateY(-Math.PI / 2); ban.lookAt(mid.wx - mid.tx, mid.wy + 5, mid.wz - mid.tz);
    this.root.add(ban);
    // the tape
    this.tape = { segs: [], broken: false, fin };
    const tapeM = new THREE.MeshBasicMaterial({ color: '#fff4b0' }), segG = new THREE.BoxGeometry(0.62, 0.05, 0.02);
    for (let i = 0; i < 17; i++) {
      const x = -0.5 + i * 0.5 + 0.25, p = path.pos(fin, x, 1.05, {});
      const m = new THREE.Mesh(segG, tapeM); m.position.set(p.wx, p.wy, p.wz); m.rotation.y = Math.atan2(p.tx, p.tz) + Math.PI / 2; this.root.add(m);
      this.tape.segs.push({ m, v: new THREE.Vector3(), w: 0, x, home: m.position.clone(), rot: m.rotation.y });
    }
  }
  breakTape(r) {
    if (this.tape.broken) return; this.tape.broken = true; const q = this.course.path.at(this.tape.fin);
    for (const s of this.tape.segs) { const side = Math.sign(s.x - r.x) || 1; s.v.set(q.tx * (3 + Math.random() * 3) + q.lx * -side * 2.5, 1.5 + Math.random() * 2, q.tz * (3 + Math.random() * 3) + q.lz * -side * 2.5); s.w = (Math.random() - 0.5) * 12; }
  }
  startBlocks(path, s) {
    const M = new THREE.MeshStandardMaterial({ color: '#2b2f3a', metalness: 0.6, roughness: 0.4 }), pad = new THREE.MeshStandardMaterial({ color: '#3a3f4c', roughness: 0.5 });
    this.blocks = new THREE.Group();
    for (let l = 0; l < LANES; l++) {
      const p = path.pos(s - 0.6, l, 0, {}), g = new THREE.Group(); g.position.set(p.wx, p.wy, p.wz); g.rotation.y = Math.atan2(p.tx, p.tz);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.8), M); rail.position.y = 0.03; g.add(rail);
      for (const [x, z] of [[-0.1, 0.1], [0.1, -0.15]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.04), pad); b.position.set(x, 0.05, z); b.rotation.x = -0.7; g.add(b); }
      // lane number
      const nt = numberTex(l + 1, 'rgba(0,0,0,0)');
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: canvasTex('lane' + l, 64, 64, (c) => { c.fillStyle = '#fff'; c.font = '900 50px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(l + 1), 32, 34); }), transparent: true }));
      n.position.set(0, 0.015, -1.6); n.rotation.y = Math.PI; g.add(n);
      this.blocks.add(g);
    }
    this.root.add(this.blocks);
  }
  buildHurdles(course) {
    this.hurdleIM = null; if (!course.hurdles.length) return;
    const n = course.hurdles.length * LANES;
    const barT = canvasTex('hbar', 128, 16, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#111' : '#fff'; c.fillRect(i * 16, 0, 16, h); } });
    const bar = new THREE.BoxGeometry(1.05, 0.12, 0.04); bar.translate(0, 0.5, 0);
    const posts = merge([new THREE.BoxGeometry(0.05, 0.5, 0.05).translate(-0.5, 0.25, 0), new THREE.BoxGeometry(0.05, 0.5, 0.05).translate(0.5, 0.25, 0), new THREE.BoxGeometry(0.05, 0.04, 0.5).translate(-0.5, 0.02, -0.15), new THREE.BoxGeometry(0.05, 0.04, 0.5).translate(0.5, 0.02, -0.15)]);
    this.hBar = new THREE.InstancedMesh(bar, new THREE.MeshStandardMaterial({ map: barT, roughness: 0.4 }), n);
    this.hPost = new THREE.InstancedMesh(posts, new THREE.MeshStandardMaterial({ color: '#c8ccd6', metalness: 0.5, roughness: 0.4 }), n);
    this.hBar.castShadow = this.hPost.castShadow = true;
    this.hState = []; const q = {};
    course.hurdles.forEach((s, hi) => { for (let l = 0; l < LANES; l++) { this.course.path.pos(s, l, 0, q); this.hState.push({ x: q.wx, y: q.wy, z: q.wz, yaw: Math.atan2(q.tx, q.tz), tip: 0, tipT: 0 }); } });
    this.hBar.frustumCulled = this.hPost.frustumCulled = false;
    this.root.add(this.hBar, this.hPost); this.updateHurdles(0, true);
  }
  updateHurdles(dt, force) {
    if (!this.hBar) return; const m = new THREE.Matrix4(), r = new THREE.Matrix4(); let dirty = force;
    this.hState.forEach((h, i) => {
      if (h.tipT > 0 && h.tip < 1.45) { h.tip = Math.min(1.45, h.tip + dt * 7); dirty = true; } else if (!force && h.tip === 0) return;
      m.makeRotationY(h.yaw); r.makeRotationX(h.tip); m.multiply(r); m.setPosition(h.x, h.y, h.z);
      this.hBar.setMatrixAt(i, m); this.hPost.setMatrixAt(i, m);
    });
    if (dirty) { this.hBar.instanceMatrix.needsUpdate = true; this.hPost.instanceMatrix.needsUpdate = true; }
  }
  knockHurdle(h, l) { const st = this.hState && this.hState[h * LANES + l]; if (st && !st.tipT) { st.tipT = 1; this.burst(st.x, 0.5, st.z, '#ffffff', 14, 3, 0.5); } }
  buildBoxes(course) {
    const n = this.racePtr ? 0 : 0; const geo = new THREE.BoxGeometry(0.62, 0.62, 0.62);
    this.boxIM = null; this.boxes = [];
  }
  setBoxes(boxes) {
    if (this.boxIM) { this.root.remove(this.boxIM); }
    const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    this.boxIM = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: itemTex(), emissive: '#ffffff', emissiveMap: itemTex(), emissiveIntensity: 0.55, roughness: 0.3, transparent: true, opacity: 0.95 }), boxes.length);
    this.boxIM.frustumCulled = false; this.root.add(this.boxIM);
    const q = {}; this.boxPos = boxes.map(b => { this.course.path.pos(b.s, b.l, 0, q); return { x: q.wx, y: q.wy, z: q.wz }; });
  }
  buildStars(course) { this.starIM = null; }
  setStars(stars) {
    if (this.starIM) this.root.remove(this.starIM);
    const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.11 : 0.26; i ? sh.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 }); g.center();
    this.starIM = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ff9a00', emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.25 }), stars.length);
    this.starIM.frustumCulled = false; this.root.add(this.starIM);
    const q = {}; this.starPos = stars.map(s => { this.course.path.pos(s.s, s.l, 0, q); return { x: q.wx, y: q.wy, z: q.wz }; });
  }
  buildPads(course) {
    const t = chevronTex(); this.padTex = t; t.repeat.set(1, 1);
    const m = new THREE.MeshBasicMaterial({ map: t, color: '#3cf0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 });
    const base = new THREE.MeshBasicMaterial({ color: '#0b5f8a', transparent: true, opacity: 0.6, depthWrite: false });
    for (const b of course.boost) for (const l of b.l) {
      const pad = new THREE.Mesh(ribbon(course.path, b.s - 2.6, b.s + 0.4, 1, { o: laneOff(l) + 0.48, y: 0.02 }, { o: laneOff(l) - 0.48, y: 0.02 }, 1.5), base); this.root.add(pad);
      const chev = new THREE.Mesh(ribbon(course.path, b.s - 2.6, b.s + 0.4, 1, { o: laneOff(l) + 0.48, y: 0.03 }, { o: laneOff(l) - 0.48, y: 0.03 }, 1.5), m); chev.renderOrder = 2; this.root.add(chev);
    }
  }
  buildHazards(course) {
    const path = course.path, q = {};
    const pm = new THREE.MeshStandardMaterial({ color: '#7fd0ff', roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.72, envMapIntensity: 1 });
    this.puddles = [];
    for (const p of course.puddles) { path.pos(p.s, p.l, 0.02, q); const m = new THREE.Mesh(new THREE.CircleGeometry(0.72, 20).rotateX(-Math.PI / 2), pm); m.scale.set(1, 1, 1.9); m.position.set(q.wx, q.wy, q.wz); m.rotation.y = Math.atan2(q.tx, q.tz); this.root.add(m); this.puddles.push(m); }
    const rampT = canvasTex('ramp', 128, 128, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff6a1f'; c.fillRect(0, i * 16, w, 16); } c.fillStyle = '#ffd23a'; c.font = '900 50px Arial'; c.textAlign = 'center'; c.fillText('▲', 64, 80); });
    const rm = new THREE.MeshStandardMaterial({ map: rampT, roughness: 0.6 });
    for (const r of course.ramps) {
      const w = (r.l1 - r.l0 + 1) * LW, len = 3.2, hgt = 0.65;
      const g = new THREE.BufferGeometry();
      const v = [-w / 2, 0, -len, w / 2, 0, -len, -w / 2, hgt, 0, w / 2, hgt, 0, -w / 2, 0, 0, w / 2, 0, 0];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1], 2));
      g.setIndex([0, 2, 1, 1, 2, 3, 2, 4, 3, 3, 4, 5, 0, 4, 2, 1, 3, 5]); g.computeVertexNormals();
      const m = new THREE.Mesh(g, rm); path.pos(r.s, (r.l0 + r.l1) / 2, 0, q); m.position.set(q.wx, q.wy, q.wz); m.rotation.y = Math.atan2(q.tx, q.tz); m.castShadow = true; this.root.add(m);
    }
    // wind streak lines (updated each frame in gust zones)
    if (course.gusts.length) {
      const n = 160; this.wind = { n, p: new Float32Array(n * 6), seed: [] };
      for (let i = 0; i < n; i++) this.wind.seed.push({ s: Math.random(), o: Math.random(), y: 0.3 + Math.random() * 2.2, sp: 0.5 + Math.random() });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.wind.p, 3));
      this.windLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 })); this.windLines.frustumCulled = false; this.root.add(this.windLines);
    }
  }
  addTrap(t) {
    const q = this.course.path.pos(t.s, t.x, 0.025, {});
    const mt = canvasTex('mud', 128, 128, (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, w, h); c.fillStyle = '#5a3a1e'; c.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * 6.283, r = 44 + Math.sin(i * 2.7) * 12; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } c.fill(); c.fillStyle = '#7a5230'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(30 + Math.random() * 68, 30 + Math.random() * 68, 5 + Math.random() * 8, 0, 7); c.fill(); } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: mt, transparent: true, roughness: 0.3, depthWrite: false }));
    m.position.set(q.wx, q.wy, q.wz); m.rotation.y = Math.atan2(q.tx, q.tz); m.scale.setScalar(0.2); this.root.add(m); this.traps.set(t.id, m);
    this.burst(q.wx, 0.5, q.wz, '#7a5230', 20, 3, 0.6, 9, 0, true);
  }
  removeTrap(id) { const m = this.traps.get(id); if (m) { this.root.remove(m); this.traps.delete(id); } }
  buildPodium(path, fin, theme) {
    const g = this.podium = new THREE.Group(), q = path.loop ? path.pos(fin + 8, -9.5, 0, {}) : path.pos(fin + 22, 3.5, 0, {});
    g.position.set(q.wx, q.wy, q.wz); g.rotation.y = Math.atan2(q.tx, q.tz) + (path.loop ? -Math.PI / 2 : Math.PI);
    const cols = { 1: '#ffd23a', 2: '#d8dde6', 3: '#d9894a' }, H = { 1: 1.3, 2: 0.9, 3: 0.6 }, X = { 1: 0, 2: -1.6, 3: 1.6 };
    for (const k of [1, 2, 3]) {
      const mats = [0, 0, 0, 0, 1, 0].map(f => f ? new THREE.MeshStandardMaterial({ map: numberTex(k, cols[k]), roughness: 0.4 }) : new THREE.MeshStandardMaterial({ color: '#f4f4f8', roughness: 0.4 }));
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, H[k], 1.4), mats); b.position.set(X[k], H[k] / 2, 0); b.castShadow = b.receiveShadow = true; g.add(b);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.42), new THREE.MeshStandardMaterial({ color: cols[k], metalness: 0.8, roughness: 0.25, emissive: cols[k], emissiveIntensity: 0.2 })); trim.position.set(X[k], H[k], 0); g.add(trim);
    }
    this.podiumSpots = { 1: [0, 1.3], 2: [-1.6, 0.9], 3: [1.6, 0.6] };
    this.root.add(g);
  }

  /* ------------------------------- effects ------------------------------- */
  burst(x, y, z, col, n, sp, life, grav = 6, size = 0, normal) {
    const c = C(col);
    for (let i = 0; i < n; i++) this.parts.spawn(x, y, z, (Math.random() - 0.5) * sp * 2, Math.random() * sp * 1.4, (Math.random() - 0.5) * sp * 2, c, size || 0.22 + Math.random() * 0.18, life * (0.6 + Math.random() * 0.6), grav, 1.5);
  }
  ring(x, y, z, col) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.12, 8, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); this.root.add(m); this.rings.push({ m, t: 0 });
  }
  confetti(x, y, z, n = 160) {
    const cols = ['#ff2fa0', '#ffd23a', '#3cf0ff', '#7dff8a', '#ffffff', '#ff6a1f'];
    for (let i = 0; i < n; i++) { const c = C(cols[i % cols.length]); this.parts.spawn(x + (Math.random() - 0.5) * 4, y + Math.random() * 2, z + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6, 4 + Math.random() * 6, (Math.random() - 0.5) * 6, c, 0.16 + Math.random() * 0.1, 2.5 + Math.random() * 1.5, 4, 1.2); }
  }

  /* ------------------------------ per frame ------------------------------ */
  sync(race, dt, me, view) {
    this.clock += dt; const t = this.clock, path = this.course.path, q = this.q;
    this.crowdU.uTime.value = t;
    if (this.ocean) this.ocean.uniforms.t.value = t;
    if (this.ferris) this.ferris.rotateZ(dt * 0.08);
    if (this.padTex) this.padTex.offset.y = (this.padTex.offset.y - dt * 1.6) % 1;
    // runners
    if (!(view && view.skipRunners)) race.runners.forEach((r, i) => {
      const m = this.runners[i]; path.pos(r.s, r.x, 0, q);
      m.root.position.set(q.wx, q.wy, q.wz);
      const yaw = Math.atan2(q.tx, q.tz) + r.vx * 0.06;
      m.root.rotation.set(0, yaw, 0); m.root.rotateZ(-q.bank * 0.9 * Math.sign(q.k || 1) * 0 + (-r.vx * 0.04)); if (q.bank) m.root.rotateZ(-q.bank * 0.7);
      let pose = 'run';
      if (race.phase === 'marks') pose = 'marks'; else if (race.phase === 'set') pose = 'set'; else if (!r.launched) pose = 'set';
      if (view && view.poses && view.poses[i]) pose = view.poses[i];
      m.update(dt, r.launched || r.finished ? r : (pose === 'marks' || pose === 'set' ? null : r), { pose });
      // dust & sparks
      if (r.launched && r.v > 6 && r.y < 0.05 && !r.finished) {
        const prev = m.lastA || 0, a = r.phase * 2.1; m.lastA = a;
        if (Math.floor(prev / Math.PI) !== Math.floor(a / Math.PI)) {
          const dist = Math.hypot(q.wx - this.camera.position.x, q.wz - this.camera.position.z);
          if (dist < 45) {
            const n = r.v > r.top ? 5 : 2, col = this.theme === 'boardwalk' ? '#e8d0a0' : this.T.track;
            for (let k = 0; k < n; k++) this.parts.spawn(q.wx + (Math.random() - 0.5) * 0.3, 0.05, q.wz + (Math.random() - 0.5) * 0.3, -q.tx * r.v * 0.15 + (Math.random() - 0.5), 0.6 + Math.random(), -q.tz * r.v * 0.15 + (Math.random() - 0.5), C(col).multiplyScalar(this.T.night ? 1.2 : 1.6), 0.18, 0.45, 3, 2);
            if (r.cleats > 0 || r.rocket > 0 || r.boost > 0) for (let k = 0; k < 6; k++) this.parts.spawn(q.wx, 0.08, q.wz, -q.tx * 3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, -q.tz * 3 + (Math.random() - 0.5) * 3, C(r.cleats > 0 ? '#ffd23a' : '#7fe8ff'), 0.16, 0.5, 8, 1);
          }
        }
        if (r.cleats > 0 || r.sling > 0) { const c = C(r.cleats > 0 ? '#ffc830' : '#7fd4ff'); this.parts.spawn(q.wx + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.9 + r.y, q.wz + (Math.random() - 0.5) * 0.4, -q.tx * 2, 0.2, -q.tz * 2, c, 0.3, 0.35, 0, 1); }
      }
    });
    // boxes / stars
    if (this.boxIM) {
      const m4 = new THREE.Matrix4(), rq = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      race.boxes.forEach((b, i) => { const P = this.boxPos[i]; const s = b.t > 0 ? Math.max(0, 1 - b.t * 3) * (b.t < 0.33 ? 1 : 0) : 1; e.set(t * 0.9 + i, t * 1.3 + i, 0); rq.setFromEuler(e); sc.setScalar(s * (1 + Math.sin(t * 4 + i) * 0.05)); p.set(P.x, P.y + 0.75 + Math.sin(t * 2.5 + i) * 0.1, P.z); m4.compose(p, rq, sc); this.boxIM.setMatrixAt(i, m4); });
      this.boxIM.instanceMatrix.needsUpdate = true;
    }
    if (this.starIM) {
      const m4 = new THREE.Matrix4(), rq = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      race.stars.forEach((s, i) => { const P = this.starPos[i]; e.set(0, t * 3 + i * 0.4, 0); rq.setFromEuler(e); sc.setScalar(s.got ? 0 : 1); p.set(P.x, P.y + 0.55 + Math.sin(t * 3 + i) * 0.08, P.z); m4.compose(p, rq, sc); this.starIM.setMatrixAt(i, m4); });
      this.starIM.instanceMatrix.needsUpdate = true;
    }
    for (const [id, m] of this.traps) if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 5));
    this.updateHurdles(dt);
    // tape
    if (this.tape.broken) for (const s of this.tape.segs) { if (s.m.position.y > 0.03) { s.v.y -= 6 * dt; s.v.multiplyScalar(1 - 1.5 * dt); s.m.position.addScaledVector(s.v, dt); s.m.rotation.z += s.w * dt; s.m.rotation.x += s.w * 0.5 * dt; } }
    // rings
    for (let i = this.rings.length - 1; i >= 0; i--) { const R = this.rings[i]; R.t += dt; const s = 1 + R.t * 14; R.m.scale.set(s, 1, s); R.m.material.opacity = Math.max(0, 1 - R.t * 1.6); if (R.t > 0.7) { this.root.remove(R.m); this.rings.splice(i, 1); } }
    // wind
    if (this.wind && me) {
      const W = this.wind, cg = this.course.gusts; let k = 0; const qq = {};
      for (const sd of W.seed) {
        const g = cg.find(g => me.s > g.s0 - 40 && me.s < g.s1 + 10) || null;
        if (!g) { W.p.fill(0, k * 6, k * 6 + 6); k++; continue; }
        sd.o = (sd.o + dt * sd.sp * 0.9) % 1; const s = me.s - 5 + sd.s * 40; const inZone = s > g.s0 && s < g.s1;
        const x = g.side > 0 ? -1 + sd.o * 9 : 8 - sd.o * 9;
        path.pos(s, x, sd.y, qq); W.p[k * 6] = qq.wx; W.p[k * 6 + 1] = inZone ? qq.wy : -50; W.p[k * 6 + 2] = qq.wz;
        path.pos(s, x + g.side * 0.9, sd.y, qq); W.p[k * 6 + 3] = qq.wx; W.p[k * 6 + 4] = inZone ? qq.wy : -50; W.p[k * 6 + 5] = qq.wz; k++;
      }
      this.windLines.geometry.getAttribute('position').needsUpdate = true;
    }
    if (this.socks) for (const s of this.socks) s.m.rotation.x = Math.sin(t * 7 + s.yaw) * 0.15;
    this.parts.update(dt);
  }

  /* camera: chase / intro / finish / podium / attract */
  updateCamera(dt, race, me, opts = {}) {
    const path = this.course.path, cam = this.camera, q = {}; this.camT += dt;
    let pos = new THREE.Vector3(), look = new THREE.Vector3(), fov = this.baseFov, roll = 0;
    const mode = opts.mode || 'chase';
    if (mode === 'chase' && me) {
      const sf = Math.min(1.5, me.v / me.top), boost = (me.cleats > 0 || me.rocket > 0 || me.sling > 0 || me.boost > 0) ? 1 : 0;
      const back = 3.9 + sf * 0.9 - boost * 0.35, h = 1.8 + (opts.portrait ? 0.7 : 0);
      path.pos(me.s - back, me.x * 0.75 + 3.5 * 0.25, h + me.y * 0.5, q); pos.set(q.wx, q.wy, q.wz);
      path.pos(me.s + 7, me.x * 0.85 + 3.5 * 0.15, 1.0 + me.y * 0.3, q); look.set(q.wx, q.wy, q.wz);
      fov = this.baseFov + sf * 10 + boost * 9 + (race.photo ? -6 : 0);
      roll = -me.vx * 0.025 - (path.at(me.s).bank || 0) * 0.5;
    } else if (mode === 'intro') { // sweeping crane across the blocks
      const k = Math.min(1, this.camT / 5), ang = -1.2 + k * 1.1;
      const c = path.pos(race.c.start + 0.5, 3.5, 0, {});
      pos.set(c.wx + Math.sin(ang + Math.atan2(c.tx, c.tz)) * 10, 2.2 + (1 - k) * 4, c.wz + Math.cos(ang + Math.atan2(c.tx, c.tz)) * 10);
      look.set(c.wx, 0.6, c.wz);
      if (me) { const p = path.pos(me.s, me.x, 0.6, {}); look.lerp(new THREE.Vector3(p.wx, p.wy, p.wz), k); const b = path.pos(me.s - 3.2, me.x, 1.4, {}); pos.lerp(new THREE.Vector3(b.wx, b.wy, b.wz), Math.max(0, (k - 0.6) / 0.4) ** 2); }
    } else if (mode === 'finish' && me) { // side tracking shot
      path.pos(me.s + 1.5, -2.2, 1.2, q); pos.set(q.wx, q.wy, q.wz);
      path.pos(me.s, me.x, 0.9, q); look.set(q.wx, q.wy, q.wz); fov = this.baseFov - 6;
    } else if (mode === 'podium') {
      const g = this.podium; const a = this.camT * 0.25 + 0.4, R = opts.portrait ? 9 : 7.5;
      const c = new THREE.Vector3(); g.getWorldPosition(c);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
      const ang = Math.atan2(fwd.x, fwd.z) + Math.sin(a) * 0.6;
      pos.set(c.x + Math.sin(ang) * R, c.y + 2.6, c.z + Math.cos(ang) * R); look.set(c.x, c.y + 1.7, c.z);
      // frame the podium beside the results panel (left on wide screens, upper half on phones)
      const fwd2 = look.clone().sub(pos).normalize(), right = new THREE.Vector3().crossVectors(fwd2, new THREE.Vector3(0, 1, 0)).normalize();
      if (!opts.portrait) { pos.addScaledVector(right, 2.4); look.addScaledVector(right, 2.4); } else { look.y -= 1.6; pos.y -= 0.6; }
    } else { // attract orbit: follow the leader from cinematic angles
      const lead = race.runners.reduce((a, b) => b.s > a.s ? b : a, race.runners[0]);
      const shot = Math.floor(this.camT / 6) % 3;
      if (shot === 0) { path.pos(lead.s + 6, -2.5, 1.0, q); pos.set(q.wx, q.wy, q.wz); path.pos(lead.s - 1, 3.5, 0.8, q); look.set(q.wx, q.wy, q.wz); }
      else if (shot === 1) { path.pos(lead.s - 7, 3.5, 4.5, q); pos.set(q.wx, q.wy, q.wz); path.pos(lead.s + 4, 3.5, 0.5, q); look.set(q.wx, q.wy, q.wz); }
      else { path.pos(lead.s + 10, 9.5, 2.2, q); pos.set(q.wx, q.wy, q.wz); path.pos(lead.s, 3.5, 0.8, q); look.set(q.wx, q.wy, q.wz); }
    }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); pos.x += (Math.random() - 0.5) * this.shake * 0.4; pos.y += (Math.random() - 0.5) * this.shake * 0.4; }
    const snap = !this.camPos || opts.snap || (this.lastMode !== mode && (mode === 'podium' || mode === 'finish' || mode === 'attract' && Math.floor(this.camT / 6) !== this.lastShot));
    this.lastShot = Math.floor(this.camT / 6); this.lastMode = mode;
    if (snap) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    else { const k = 1 - Math.exp(-dt * (mode === 'chase' ? 9 : 4)); this.camPos.lerp(pos, k); this.camLook.lerp(look, 1 - Math.exp(-dt * 12)); }
    cam.position.copy(this.camPos); cam.lookAt(this.camLook); cam.rotateZ(roll);
    cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix();
    // shadow light follows the camera target
    if (this.sun) { const tgt = this.camLook; this.sun.position.set(tgt.x + this.sunDir.x * 60, tgt.y + this.sunDir.y * 60, tgt.z + this.sunDir.z * 60); this.sun.target.position.copy(tgt); }
    if (this.skyMesh) this.skyMesh.position.copy(cam.position);
  }
  render() { this.renderer.render(this.scene, this.camera); }
}
