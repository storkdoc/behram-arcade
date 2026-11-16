/* CUBERTRON — three.js r169 view.
   A tilted top-down look at neon maze rooms: PBR sentries, bloom,
   soft shadows, bolt trails, debris. Tier 0 drops post and shadows. */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';
import { TIERS } from './game.js';

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function gridTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#10141c';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120, 190, 220, 0.18)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 256;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 256); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(256, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      vec3 n = normalize(vP);
      vec3 c = mix(vec3(0.02,0.03,0.05), vec3(0.18,0.28,0.36), smoothstep(-0.2, 0.7, n.y));
      c += vec3(0.4, 1.2, 1.6) * pow(max(dot(n, normalize(vec3(0.2, 0.8, 0.4))), 0.0), 30.0);
      gl_FragColor = vec4(c, 1.0);
    }`
  })));
  const rt = pm.fromScene(sc, 0.04);
  pm.dispose();
  return rt.texture;
}

function makeWalker(env) {
  const g = new THREE.Group();
  const suit = new THREE.MeshPhysicalMaterial({ color: 0xd5deea, metalness: 0.72, roughness: 0.28, clearcoat: 0.6, envMap: env });
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x1a2230, metalness: 0.5, roughness: 0.4, envMap: env });
  const glow = new THREE.MeshStandardMaterial({ color: 0x063038, emissive: 0x7ef6ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.16, 4, 8), suit);
  torso.position.y = 0.36; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), suit);
  head.position.y = 0.58; head.castShadow = true; g.add(head);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.04), glow);
  vis.position.set(0, 0.58, 0.08); g.add(vis);
  const legG = new THREE.CapsuleGeometry(0.035, 0.1, 3, 6);
  const l1 = new THREE.Mesh(legG, ink); l1.position.set(-0.06, 0.12, 0);
  const l2 = new THREE.Mesh(legG, ink); l2.position.set(0.06, 0.12, 0);
  g.add(l1, l2);
  return g;
}

function makeSentry(env) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.36), new THREE.MeshPhysicalMaterial({ color: 0x9aa4b4, metalness: 0.82, roughness: 0.24, clearcoat: 0.7, envMap: env }));
  body.position.y = 0.28; body.castShadow = true; g.add(body);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x041016, emissive: 0x3ee7ff, emissiveIntensity: 2.4 });
  const e1 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeM);
  e1.position.set(-0.08, 0.34, 0.16);
  const e2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeM.clone());
  e2.position.set(0.08, 0.34, 0.16);
  g.add(e1, e2);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd8e6ff, transparent: true, opacity: 0.18, depthWrite: false }));
  shell.position.y = 0.3; shell.visible = false; g.add(shell);
  g.userData = { body: body.material, eyes: [e1.material, e2.material], shell };
  return g;
}

class Sparks {
  constructor(max) {
    this.max = max;
    this.parts = [];
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.mesh.frustumCulled = false;
    this.geo = geo;
  }
  burst(x, y, z, hex, n, speed) {
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      this.parts.push({
        x, y, z,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed, vz: (Math.random() - 0.5) * speed,
        life: 0.28 + Math.random() * 0.35, age: 0, r: c.r, g: c.g, b: c.b
      });
    }
  }
  update(dt) {
    let w = 0;
    const p = this.parts;
    for (let i = 0; i < p.length; i++) {
      const o = p[i];
      o.age += dt;
      if (o.age >= o.life) continue;
      o.vy -= 3 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      const fade = 1 - o.age / o.life;
      this.pos[w * 3] = o.x; this.pos[w * 3 + 1] = o.y; this.pos[w * 3 + 2] = o.z;
      this.col[w * 3] = o.r * fade; this.col[w * 3 + 1] = o.g * fade; this.col[w * 3 + 2] = o.b * fade;
      p[w++] = o;
    }
    p.length = w;
    this.geo.setDrawRange(0, w);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export function detectTier() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(innerWidth, innerHeight) < 520;
  if (mem <= 2 || cores <= 2) return 0;
  if (coarse && (small || mem <= 4)) return 1;
  return 2;
}

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x070910, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x10141c, 18, 42);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  const env = makeEnv(renderer);
  scene.environment = env;

  const hemi = new THREE.HemisphereLight(0xc5f6ff, 0x12141c, 0.45);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xf4fbff, 1.8);
  key.position.set(4, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0008;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  scene.add(key, key.target);
  scene.add(new THREE.AmbientLight(0x223044, 0.35));

  const floorMat = new THREE.MeshStandardMaterial({ map: gridTex(), color: 0x8aa0b4, metalness: 0.55, roughness: 0.62, envMap: env });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const accent = new THREE.Color('#3ee7ff');
  const wallBodyMat = new THREE.MeshStandardMaterial({ color: 0x243041, metalness: 0.62, roughness: 0.42, emissive: accent, emissiveIntensity: 0.08, envMap: env });
  const wallLipMat = new THREE.MeshStandardMaterial({ color: 0x062028, emissive: accent, emissiveIntensity: 1.15, roughness: 0.3 });
  const wallGeo = new THREE.BoxGeometry(0.94, 1.05, 0.94);
  const lipGeo = new THREE.BoxGeometry(0.98, 0.07, 0.98);
  let bodies = null;
  let lips = null;

  const doorMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const doors = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.46, 4), doorMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.PI / 4;
    m.visible = false;
    scene.add(m);
    doors.push(m);
  }

  const arcMat = new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcs = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 5), arcMat.clone());
    m.visible = false;
    scene.add(m);
    arcs.push(m);
  }

  const walker = makeWalker(env);
  scene.add(walker);
  const sentries = new Map();
  const sentryTmpl = makeSentry(env);

  const gleam = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: 0xfff6ea, emissive: 0xffe7c2, emissiveIntensity: 2.8, roughness: 0.2, metalness: 0.1 }));
  const wire = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), new THREE.MeshBasicMaterial({ color: 0xfff2d2, wireframe: true, transparent: true, opacity: 0.7 }));
  gleam.add(core, wire);
  gleam.visible = false;
  scene.add(gleam);
  const gleamLight = new THREE.PointLight(0xffe2b0, 0, 6);
  scene.add(gleamLight);

  const boltGeo = new THREE.CapsuleGeometry(0.045, 0.2, 2, 6);
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xe8ffff, emissive: 0xbffbff, emissiveIntensity: 3, roughness: 0.2 });
  const foeBoltMat = new THREE.MeshStandardMaterial({ color: 0xffd0c8, emissive: 0xff6a5a, emissiveIntensity: 2.6, roughness: 0.25 });
  const bolts = [];
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(boltGeo, i < 24 ? boltMat : foeBoltMat);
    m.visible = false;
    scene.add(m);
    bolts.push(m);
  }

  const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 20), new THREE.MeshBasicMaterial({ color: 0xb6ff8a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const aimBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), new THREE.MeshBasicMaterial({ color: 0xd8fbff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  aimBeam.visible = false;
  scene.add(aimBeam);
  const reticle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 18), new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  reticle.visible = false;
  scene.add(reticle);

  const puGeo = new THREE.OctahedronGeometry(0.16, 0);
  const pickups = new Map();
  const sparks = new Sparks(400);
  scene.add(sparks.mesh);
  const debrisGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
  const debris = [];

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.22, 0.45, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const view = { renderer, scene, camera, tier: 2, roomSerial: -1, insets: { top: 64, bottom: 20 } };
  const dummy = new THREE.Object3D();
  const v3 = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let camDist = 14;
  let camLift = 11;

  function span(mesh, ax, ay, az, bx, by, bz) {
    const d = v3.set(bx - ax, by - ay, bz - az);
    const len = d.length();
    if (len < 0.05) { mesh.visible = false; return; }
    mesh.visible = true;
    mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / len));
  }

  view.rebuild = (game) => {
    if (bodies) scene.remove(bodies);
    if (lips) scene.remove(lips);
    const cells = [];
    for (let r = 0; r < game.ROWS; r++) {
      for (let c = 0; c < game.COLS; c++) if (game.grid[r][c] === 1) cells.push([c, r]);
    }
    const n = Math.max(1, cells.length);
    bodies = new THREE.InstancedMesh(wallGeo, wallBodyMat, n);
    lips = new THREE.InstancedMesh(lipGeo, wallLipMat, n);
    bodies.castShadow = true;
    bodies.receiveShadow = true;
    cells.forEach(([c, r], i) => {
      dummy.position.set(c + 0.5, 0.52, r + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 1.06;
      dummy.updateMatrix();
      lips.setMatrixAt(i, dummy.matrix);
    });
    bodies.count = cells.length;
    lips.count = cells.length;
    bodies.instanceMatrix.needsUpdate = true;
    lips.instanceMatrix.needsUpdate = true;
    scene.add(bodies, lips);
    floor.scale.set(game.COLS, game.ROWS, 1);
    floor.position.set(game.COLS / 2, 0, game.ROWS / 2);
    floorMat.map.repeat.set(game.COLS / 2, game.ROWS / 2);
    accent.set(game.accent || '#3ee7ff');
    wallBodyMat.emissive.copy(accent);
    wallLipMat.emissive.copy(accent);
    doorMat.color.copy(accent);
    const [dx0, dx1] = [Math.floor((game.COLS - 2) / 2), Math.floor((game.COLS - 2) / 2) + 2];
    const [dz0, dz1] = [Math.floor((game.ROWS - 2) / 2), Math.floor((game.ROWS - 2) / 2) + 2];
    const marks = [
      { on: game.doors.n, x: (dx0 + dx1) / 2, z: 0.15 },
      { on: game.doors.s, x: (dx0 + dx1) / 2, z: game.ROWS - 0.15 },
      { on: game.doors.w, x: 0.15, z: (dz0 + dz1) / 2 },
      { on: game.doors.e, x: game.COLS - 0.15, z: (dz0 + dz1) / 2 }
    ];
    marks.forEach((m, i) => {
      doors[i].visible = m.on;
      doors[i].position.set(m.x, 0.04, m.z);
      doors[i].material.color.copy(accent);
    });
    view.roomSerial = game.roomSerial;
    view.fit();
  };

  view.fit = () => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const portrait = h > w * 1.02;
    camera.fov = portrait ? 46 : 36;
    camera.aspect = w / h;
    camLift = portrait ? 10.5 : 7.4;
    camDist = portrait ? 6.4 : 5.6;
    camera.updateProjectionMatrix();
  };

  view.setTier = (t) => {
    view.tier = Math.max(0, Math.min(2, t | 0));
    const on = view.tier > 0;
    if (renderer.shadowMap.enabled !== on) {
      renderer.shadowMap.enabled = on;
      scene.traverse(o => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => { m.needsUpdate = true; });
        }
      });
    }
    const sm = view.tier >= 2 ? 1024 : 512;
    if (key.shadow.mapSize.x !== sm) {
      key.shadow.mapSize.set(sm, sm);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    bloom.strength = view.tier >= 2 ? 0.24 : 0.12;
    view.resize();
  };

  view.resize = () => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const cap = view.tier >= 2 ? 1.6 : view.tier === 1 ? 1.25 : 1;
    let pr = Math.min(window.devicePixelRatio || 1, cap);
    const maxPx = view.tier >= 2 ? 2600000 : 1600000;
    if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    view.fit();
  };

  view.project = (x, z) => {
    v3.set(x, 0.35, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      x: (v3.x * 0.5 + 0.5) * r.width + r.left,
      y: (-v3.y * 0.5 + 0.5) * r.height + r.top,
      behind: v3.z > 1
    };
  };

  view.floorPoint = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(floorPlane, hit)) return null;
    return { x: hit.x, z: hit.z };
  };

  view.sync = (game, dt, ui) => {
    if (game.roomSerial !== view.roomSerial) {
      view.rebuild(game);
      if (view.look) view.look.set(game.player.x, 0, game.player.z);
    }
    const p = game.player;
    if (!view.look) view.look = new THREE.Vector3(p.x, 0, p.z);
    view.look.lerp(new THREE.Vector3(p.x, 0, p.z), 1 - Math.exp(-7 * Math.max(0.001, dt)));
    camera.position.set(view.look.x, camLift, view.look.z + camDist);
    camera.position.x += (Math.random() - 0.5) * (game.shake || 0);
    camera.position.y += (Math.random() - 0.5) * (game.shake || 0) * 0.35;
    camera.lookAt(view.look.x, 0.15, view.look.z);
    key.position.set(view.look.x + 3, 12, view.look.z + 4);
    key.target.position.set(view.look.x, 0, view.look.z);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.camera.updateProjectionMatrix();

    walker.position.set(p.x, 0, p.z);
    walker.scale.setScalar(1.45);
    walker.rotation.y = Math.atan2(p.faceX, p.faceZ);
    walker.visible = p.alive && !(p.inv > 0 && ((game.time * 14) | 0) % 2 === 0);

    const live = new Set();
    for (const bot of game.robots) {
      live.add(bot.id);
      let mesh = sentries.get(bot.id);
      if (!mesh) {
        mesh = sentryTmpl.clone(true);
        const eyes = [];
        let shell = null;
        let bodyMat = null;
        mesh.traverse(o => {
          if (!o.isMesh) return;
          o.material = o.material.clone();
          if (o.geometry && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius < 0.1) eyes.push(o);
          else if (o.geometry && o.geometry.type === 'SphereGeometry') shell = o;
          else if (o.geometry && o.geometry.type === 'BoxGeometry') bodyMat = o.material;
        });
        mesh.userData = { eyes, shell, bodyMat };
        scene.add(mesh);
        sentries.set(bot.id, mesh);
      }
      mesh.position.set(bot.x, 0, bot.z);
      mesh.scale.setScalar(1.35);
      mesh.rotation.y = Math.atan2(bot.dx, bot.dz);
      const col = new THREE.Color(TIERS[bot.tier].color);
      mesh.userData.eyes.forEach(e => { e.material.emissive.copy(col); });
      if (mesh.userData.bodyMat) mesh.userData.bodyMat.color.copy(col).lerp(new THREE.Color('#c5ced8'), 0.55);
      if (mesh.userData.shell) mesh.userData.shell.visible = bot.shield > 0;
    }
    for (const [id, mesh] of sentries) {
      if (!live.has(id)) { scene.remove(mesh); sentries.delete(id); }
    }

    if (game.gleam) {
      gleam.visible = true;
      gleam.position.set(game.gleam.x, 0.45, game.gleam.z);
      gleam.rotation.y += dt * 2.2;
      gleam.rotation.x += dt;
      const s = 1 + Math.sin(game.time * 8) * 0.08;
      gleam.scale.setScalar(s);
      gleamLight.position.copy(gleam.position);
      gleamLight.intensity = 4;
    } else {
      gleam.visible = false;
      gleamLight.intensity = 0;
    }

    bolts.forEach(m => { m.visible = false; });
    game.bullets.forEach((b, i) => {
      const m = bolts[i];
      if (!m) return;
      m.visible = true;
      m.material = b.from === 'player' ? boltMat : foeBoltMat;
      m.position.set(b.x, 0.32, b.z);
      const dir = v3.set(b.vx, 0, b.vz);
      const len = dir.length() || 1;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
      sparks.burst(b.x, 0.32, b.z, b.from === 'player' ? '#c8fbff' : '#ff9a8a', 1, 0.2);
    });

    const have = new Set();
    for (const item of game.pickups) {
      have.add(item.id);
      let m = pickups.get(item.id);
      if (!m) {
        const col = item.kind === 'rapid' ? 0xffb15a : item.kind === 'slow' ? 0xd2b0ff : 0x7ef0ff;
        m = new THREE.Mesh(puGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6 }));
        scene.add(m);
        pickups.set(item.id, m);
      }
      m.position.set(item.x, 0.35 + Math.sin(game.time * 3 + item.id) * 0.06, item.z);
      m.rotation.y = game.time * 2;
    }
    for (const [id, m] of pickups) if (!have.has(id)) { scene.remove(m); m.material.dispose(); pickups.delete(id); }

    if (ui && ui.target) {
      marker.visible = true;
      marker.position.set(ui.target.x, 0.03, ui.target.z);
    } else marker.visible = false;
    if (ui && ui.aim) {
      span(aimBeam, p.x, 0.4, p.z, ui.aim.x, 0.4, ui.aim.z);
      reticle.visible = true;
      reticle.position.set(ui.aim.x, 0.4, ui.aim.z);
      reticle.lookAt(camera.position);
    } else { aimBeam.visible = false; reticle.visible = false; }

    const wallCells = [];
    for (let r = 1; r < game.ROWS - 1; r++) {
      for (let c = 1; c < game.COLS - 1; c++) if (game.grid[r][c] === 1) wallCells.push([c, r]);
    }
    arcs.forEach((m, i) => {
      if (!wallCells.length) { m.visible = false; return; }
      const a = wallCells[(i * 3) % wallCells.length];
      const flicker = Math.sin(game.time * (9 + i) + i) > 0.2;
      m.visible = flicker;
      if (!flicker) return;
      const jx = Math.sin(game.time * 20 + i) * 0.15;
      span(m, a[0] + 0.5, 1.05, a[1] + 0.5, a[0] + 0.5 + jx, 1.35, a[1] + 0.9);
      m.material.opacity = 0.45 + Math.random() * 0.5;
    });

    for (const ev of game.fx) {
      const col = ev.color || game.accent || '#7ef6ff';
      if (ev.k === 'boom') {
        sparks.burst(ev.x, 0.4, ev.z, col, 22, 3.2);
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(debrisGeo, new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 }));
          m.position.set(ev.x, 0.4, ev.z);
          m.userData = { vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 3, life: 0.6 };
          scene.add(m);
          debris.push(m);
        }
      } else if (ev.k === 'spark' || ev.k === 'shot') sparks.burst(ev.x, 0.35, ev.z, col, 6, 1.4);
      else if (ev.k === 'hurt') sparks.burst(ev.x, 0.4, ev.z, '#ff5a6a', 16, 2.4);
      else if (ev.k === 'gleam') sparks.burst(ev.x, 0.5, ev.z, '#ffe7c2', 18, 2);
      else if (ev.k === 'power' || ev.k === 'shield' || ev.k === 'clear') sparks.burst(ev.x, 0.4, ev.z, '#b6ff8a', 14, 2);
    }
    game.fx.length = 0;
    for (let i = debris.length - 1; i >= 0; i--) {
      const m = debris[i];
      m.userData.life -= dt;
      m.userData.vy -= 4 * dt;
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.rotation.x += dt * 4;
      if (m.userData.life <= 0 || m.position.y < 0) {
        scene.remove(m);
        m.material.dispose();
        debris.splice(i, 1);
      }
    }
    sparks.update(dt);
  };

  view.render = () => {
    if (view.tier === 0) renderer.render(scene, camera);
    else composer.render();
  };

  view.setTier(detectTier());
  view.resize();
  return view;
}
