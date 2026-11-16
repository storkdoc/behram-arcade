/* CUBERTRON — three.js r169 view.
   PBR cubes, a generated environment map, soft shadows, bloom.
   Tier 2 is the full look. Tier 1 lightens it. Tier 0 drops post and shadows
   for weaker phones. Offscreen targets are never MSAA. */
import * as THREE from '../vendor/three/three.module.min.js';
import { EffectComposer } from '../vendor/three/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/postprocessing/OutputPass.js';

const SKIES = [
  { top: '#1a0c14', mid: '#6a2840', hor: '#ff8a3a', sun: '#ffd2a8', sunDir: [0.55, 0.42, 0.2], fog: '#241018', hemi: ['#ffb07a', '#140c14'], key: '#ffe2c8', accent: '#ff9a3c', alt: '#ff5ad0' },
  { top: '#041820', mid: '#0c4a58', hor: '#3ee0c8', sun: '#d8fff6', sunDir: [-0.4, 0.5, 0.3], fog: '#062028', hemi: ['#8ef0e0', '#061418'], key: '#d4fff4', accent: '#3ee0c8', alt: '#ffe56a' },
  { top: '#14040a', mid: '#6a1424', hor: '#ff4a3a', sun: '#ffb0a0', sunDir: [0.2, 0.35, -0.4], fog: '#1a080c', hemi: ['#ff8870', '#14060a'], key: '#ffd0c4', accent: '#ff5a45', alt: '#ffd25a' },
  { top: '#10081c', mid: '#3a2070', hor: '#c49bff', sun: '#f0e4ff', sunDir: [0.3, 0.55, 0.4], fog: '#120a1c', hemi: ['#d4c4ff', '#100818'], key: '#f2e8ff', accent: '#c49bff', alt: '#7ef0ff' },
  { top: '#12100a', mid: '#4a3818', hor: '#ffd27a', sun: '#fff2d0', sunDir: [-0.2, 0.6, 0.4], fog: '#161208', hemi: ['#ffe0a0', '#12100a'], key: '#fff4d8', accent: '#ffd27a', alt: '#ff7a4a' },
  { top: '#04140e', mid: '#0e4a32', hor: '#7dffb0', sun: '#e8fff2', sunDir: [0.5, 0.4, -0.2], fog: '#06140e', hemi: ['#b8ffd4', '#06140e'], key: '#e4fff0', accent: '#5dffb0', alt: '#d25cff' },
  { top: '#0c1018', mid: '#243044', hor: '#9eb4cc', sun: '#e8eef8', sunDir: [0.1, 0.3, 0.5], fog: '#10141c', hemi: ['#c8d4e4', '#0c1016'], key: '#eef3fb', accent: '#b7c8dc', alt: '#ff8a5a' },
  { top: '#06101e', mid: '#16345e', hor: '#8eb6ff', sun: '#fff0d8', sunDir: [0.7, 0.25, 0.2], fog: '#081018', hemi: ['#b8d0ff', '#081018'], key: '#e4eeff', accent: '#8eb6ff', alt: '#ffd27a' }
];

function bevelGeo() {
  const shape = new THREE.Shape();
  const h = 0.46;
  shape.moveTo(-h, -h);
  shape.lineTo(h, -h);
  shape.lineTo(h, h);
  shape.lineTo(-h, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.56, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.1, bevelSegments: 3, curveSegments: 2
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox.max.y, 0);
  geo.computeVertexNormals();
  return geo;
}

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(12, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){
      vec3 n = normalize(vP);
      vec3 c = mix(vec3(0.03,0.035,0.05), vec3(0.45,0.5,0.58), smoothstep(-0.15, 0.65, n.y));
      c += vec3(2.4, 1.7, 1.1) * pow(max(dot(n, normalize(vec3(-0.4, 0.75, 0.35))), 0.0), 40.0);
      c += vec3(0.35, 0.7, 1.4) * pow(max(dot(n, normalize(vec3(0.65, 0.25, -0.55))), 0.0), 18.0);
      gl_FragColor = vec4(c, 1.0);
    }`
  })));
  const rt = pm.fromScene(sc, 0.04);
  pm.dispose();
  return rt.texture;
}

function robot(env) {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xe7eef8, metalness: 0.78, roughness: 0.22, clearcoat: 0.85, clearcoatRoughness: 0.18, envMap: env, envMapIntensity: 1.15 });
  const ink = new THREE.MeshPhysicalMaterial({ color: 0x1a2230, metalness: 0.62, roughness: 0.38, clearcoat: 0.4, envMap: env });
  const glow = new THREE.MeshStandardMaterial({ color: 0x062830, emissive: 0x5dfff2, emissiveIntensity: 2.4, roughness: 0.28 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.28, 0.26), shell);
  torso.position.y = 0.36; torso.castShadow = true; g.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.02), glow);
  chest.position.set(0, 0.36, 0.135); g.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 22, 16), shell);
  head.scale.set(1, 0.92, 1); head.position.y = 0.64; head.castShadow = true; g.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.04), glow);
  visor.position.set(0, 0.66, 0.125); g.add(visor);
  const eyeG = new THREE.SphereGeometry(0.022, 10, 8);
  const eyeM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8ffff, emissiveIntensity: 1.6 });
  const eyeL = new THREE.Mesh(eyeG, eyeM); eyeL.position.set(-0.048, 0.66, 0.15);
  const eyeR = new THREE.Mesh(eyeG, eyeM); eyeR.position.set(0.048, 0.66, 0.15);
  g.add(eyeL, eyeR);
  const antG = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6);
  const antL = new THREE.Mesh(antG, ink); antL.position.set(-0.07, 0.84, 0); antL.rotation.z = 0.45;
  const antR = new THREE.Mesh(antG, ink); antR.position.set(0.07, 0.84, 0); antR.rotation.z = -0.45;
  const tipM = glow.clone();
  const tipL = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), tipM); tipL.position.set(-0.1, 0.92, 0);
  const tipR = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), tipM); tipR.position.set(0.1, 0.92, 0);
  g.add(antL, antR, tipL, tipR);
  const legG = new THREE.CapsuleGeometry(0.045, 0.1, 4, 8);
  const legL = new THREE.Mesh(legG, ink); legL.position.set(-0.1, 0.14, 0); legL.castShadow = true;
  const legR = new THREE.Mesh(legG, ink); legR.position.set(0.1, 0.14, 0); legR.castShadow = true;
  const foot = new THREE.BoxGeometry(0.1, 0.035, 0.14);
  const footL = new THREE.Mesh(foot, shell); footL.position.set(-0.1, 0.04, 0.02);
  const footR = new THREE.Mesh(foot, shell); footR.position.set(0.1, 0.04, 0.02);
  g.add(legL, legR, footL, footR);
  const jet = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow.clone());
  jet.position.set(0, 0.22, -0.12); jet.scale.set(1, 0.6, 1.2); g.add(jet);
  return { group: g, eyes: [eyeL, eyeR], jet, glow, legs: [legL, legR] };
}

function foeMesh(kind, env) {
  const g = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x8d98a8, metalness: 0.8, roughness: 0.28, clearcoat: 0.6, envMap: env });
  const hot = new THREE.MeshStandardMaterial({ color: 0x2a0608, emissive: 0xff3a3a, emissiveIntensity: 2.1 });
  if (kind === 'hopper') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 4, 10), metal);
    body.position.y = 0.42; body.castShadow = true; g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), hot);
    eye.position.set(0, 0.58, 0.1); g.add(eye);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.22, 6), metal);
    const l1 = leg.clone(); l1.position.set(-0.06, 0.12, 0);
    const l2 = leg.clone(); l2.position.set(0.06, 0.12, 0);
    g.add(l1, l2);
  } else if (kind === 'roller') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 22, 16), metal);
    ball.position.y = 0.28; ball.castShadow = true; g.add(ball);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 22), hot);
    ring.position.y = 0.28; ring.rotation.x = Math.PI / 2; g.add(ring);
  } else if (kind === 'bomber') {
    const saucer = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12), metal);
    saucer.scale.set(1, 0.28, 1); saucer.position.y = 0.15; saucer.castShadow = true; g.add(saucer);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), hot);
    lamp.position.y = 0.28; g.add(lamp);
    const bomb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hot.clone());
    bomb.position.y = -0.05; g.add(bomb);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.26), metal);
    body.position.y = 0.32; body.castShadow = true; g.add(body);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), new THREE.MeshStandardMaterial({ color: 0x2a0838, emissive: 0xd45cff, emissiveIntensity: 1.8 }));
    arm.position.set(0.16, 0.32, 0.08); g.add(arm);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.03), hot);
    eye.position.set(0, 0.4, 0.13); g.add(eye);
  }
  g.userData.kind = kind;
  return g;
}

function bossMesh(env) {
  const g = new THREE.Group();
  const hull = new THREE.MeshPhysicalMaterial({ color: 0xb8c0cc, metalness: 0.82, roughness: 0.24, clearcoat: 0.8, envMap: env });
  const hot = new THREE.MeshStandardMaterial({ color: 0x2a0808, emissive: 0xff4a2a, emissiveIntensity: 2.2 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.55), hull);
  torso.position.y = 0.7; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.4), hull);
  head.position.y = 1.25; head.castShadow = true; g.add(head);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.06), hot); vis.position.set(0, 1.26, 0.2); g.add(vis);
  const gunG = new THREE.BoxGeometry(0.18, 0.18, 0.7);
  const gunL = new THREE.Mesh(gunG, hull); gunL.position.set(-0.62, 0.85, 0.2);
  const gunR = new THREE.Mesh(gunG, hull); gunR.position.set(0.62, 0.85, 0.2);
  g.add(gunL, gunR);
  const thr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.28, 10), hot);
  const t1 = thr.clone(); t1.position.set(-0.28, 0.2, 0);
  const t2 = thr.clone(); t2.position.set(0.28, 0.2, 0);
  g.add(t1, t2);
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
    const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
    this.geo = geo;
  }
  burst(x, y, z, hex, n, speed) {
    const c = new THREE.Color(hex);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= this.max) this.parts.shift();
      this.parts.push({
        x, y, z,
        vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.8, vz: (Math.random() - 0.5) * speed,
        life: 0.35 + Math.random() * 0.35, age: 0, r: c.r, g: c.g, b: c.b
      });
    }
  }
  update(dt) {
    let w = 0;
    const p = this.parts, pos = this.pos, col = this.col;
    for (let i = 0; i < p.length; i++) {
      const o = p[i];
      o.age += dt;
      if (o.age >= o.life) continue;
      o.vy -= 2.2 * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      const fade = 1 - o.age / o.life;
      pos[w * 3] = o.x; pos[w * 3 + 1] = o.y; pos[w * 3 + 2] = o.z;
      col[w * 3] = o.r * fade; col[w * 3 + 1] = o.g * fade; col[w * 3 + 2] = o.b * fade;
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
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x07060d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.08, 180);
  const env = makeEnv(renderer);
  scene.environment = env;

  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 28, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color('#100814') },
      mid: { value: new THREE.Color('#402040') },
      hor: { value: new THREE.Color('#ff8855') },
      sun: { value: new THREE.Color('#ffd2a8') },
      sunDir: { value: new THREE.Vector3(0.4, 0.5, 0.2) },
      camPos: { value: new THREE.Vector3() }
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec3 vW; uniform vec3 top, mid, hor, sun, sunDir, camPos;
      void main(){
        vec3 n = normalize(vW - camPos);
        float h = n.y;
        vec3 c = mix(top, mid, smoothstep(-0.35, 0.45, h));
        float band = exp(-abs(h + 0.02) * 7.0);
        c = mix(c, hor, band * 0.9);
        c += sun * pow(max(dot(n, normalize(sunDir)), 0.0), 48.0) * 2.2;
        c += sun * pow(max(dot(n, normalize(sunDir)), 0.0), 6.0) * 0.18;
        float stars = step(0.997, fract(sin(dot(floor(n * 240.0 + 4.0), vec3(12.9, 78.2, 37.1))) * 43758.5));
        c += stars * smoothstep(-0.05, 0.35, h) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`
  }));
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xffc8a0, 0x141018, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0e0, 2.4);
  key.position.set(-6, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.04;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 40;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x88c8ff, 1.15);
  rim.position.set(8, 6, -6);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x1a2030, 0.35));

  const abyss = new THREE.Mesh(new THREE.CircleGeometry(28, 48), new THREE.MeshStandardMaterial({ color: 0x12151e, metalness: 0.7, roughness: 0.45, envMap: env }));
  abyss.rotation.x = -Math.PI / 2; abyss.position.y = -2.4; abyss.receiveShadow = true;
  scene.add(abyss);

  const far = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), new THREE.MeshStandardMaterial({ color: 0x223044, metalness: 0.8, roughness: 0.3, emissive: 0x123044, emissiveIntensity: 0.4, envMap: env }), 40);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rad = 14 + (i % 5) * 1.6;
    dummy.position.set(Math.cos(a) * rad, -1 + (i % 7) * 0.7, Math.sin(a) * rad * 0.7);
    dummy.rotation.set(i, i * 0.4, 0);
    dummy.scale.setScalar(0.5 + (i % 4) * 0.25);
    dummy.updateMatrix();
    far.setMatrixAt(i, dummy.matrix);
  }
  scene.add(far);

  const cubeGeo = bevelGeo();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xd5deea, metalness: 0.92, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, envMap: env, envMapIntensity: 1.45 });
  const topGeo = new THREE.BoxGeometry(0.74, 0.05, 0.74);
  const cubes = new Map();
  const pickables = [];

  const hero = robot(env);
  scene.add(hero.group);
  const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadowBlob.rotation.x = -Math.PI / 2; scene.add(shadowBlob);
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 14), new THREE.MeshBasicMaterial({ color: 0x9aefff, transparent: true, opacity: 0.18, depthWrite: false }));
  scene.add(bubble);

  const foeTmpl = {
    hopper: foeMesh('hopper', env),
    roller: foeMesh('roller', env),
    bomber: foeMesh('bomber', env),
    flipper: foeMesh('flipper', env)
  };
  const foes = new Map();
  const boss = bossMesh(env);
  boss.visible = false;
  scene.add(boss);
  const warn = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 4), new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  warn.rotation.x = -Math.PI / 2; warn.visible = false; scene.add(warn);

  const discGeo = new THREE.TorusGeometry(0.72, 0.08, 10, 28);
  const discMat = new THREE.MeshStandardMaterial({ color: 0x062830, emissive: 0x49f0ff, emissiveIntensity: 1.8, metalness: 0.4, roughness: 0.25 });
  const discs = [];

  const shotGeo = new THREE.CapsuleGeometry(0.05, 0.22, 3, 6);
  const shotMat = new THREE.MeshStandardMaterial({ color: 0xd8ffff, emissive: 0x9af6ff, emissiveIntensity: 3.2, roughness: 0.2 });
  const shotPool = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(shotGeo, shotMat);
    m.visible = false; m.frustumCulled = false; scene.add(m); shotPool.push(m);
  }

  const puColors = { shield: 0x7ef0ff, rapid: 0xffb15a, slow: 0xd2b0ff, bomb: 0xffe56a };
  const puGeo = new THREE.OctahedronGeometry(0.16, 0);
  const pickups = new Map();

  const sparks = new Sparks(500);
  scene.add(sparks.mesh);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 6), new THREE.MeshBasicMaterial({ color: 0xbffbff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.visible = false; beam.frustumCulled = false; scene.add(beam);
  const reticle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 22), new THREE.MeshBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
  reticle.visible = false; scene.add(reticle);
  const ghost = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.52, 4), new THREE.MeshBasicMaterial({ color: 0xb6ff8a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ghost.rotation.x = -Math.PI / 2; ghost.rotation.z = Math.PI / 4; ghost.visible = false; scene.add(ghost);
  const pathDots = [];
  for (let i = 0; i < 12; i++) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshBasicMaterial({ color: 0xb6ff8a, transparent: true, opacity: 0.7, depthWrite: false }));
    d.rotation.x = -Math.PI / 2; d.visible = false; scene.add(d); pathDots.push(d);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.48, 0.62, 0.78);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const view = {
    renderer, scene, camera, tier: 2, spin: 0, buildId: -1, sky: -1,
    insets: { top: 78, bottom: 28, left: 12, right: 12 },
    pickables, canvas
  };
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  const colC = new THREE.Color();
  const v3 = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookD = new THREE.Vector3();
  let radius = 12;
  let portrait = false;

  function applySky(index) {
    const s = SKIES[index % SKIES.length];
    sky.material.uniforms.top.value.set(s.top);
    sky.material.uniforms.mid.value.set(s.mid);
    sky.material.uniforms.hor.value.set(s.hor);
    sky.material.uniforms.sun.value.set(s.sun);
    sky.material.uniforms.sunDir.value.set(s.sunDir[0], s.sunDir[1], s.sunDir[2]);
    hemi.color.set(s.hemi[0]); hemi.groundColor.set(s.hemi[1]);
    key.color.set(s.key);
    scene.fog = new THREE.Fog(s.fog, 16, 52);
    view.palette = s;
    view.sky = index;
  }

  function clearCubes() {
    for (const rec of cubes.values()) {
      scene.remove(rec.body, rec.top);
      rec.top.material.dispose();
    }
    cubes.clear();
    pickables.length = 0;
  }

  view.rebuild = (game) => {
    clearCubes();
    applySky(game.sky || 0);
    for (const c of game.cubes) {
      const body = new THREE.Mesh(cubeGeo, bodyMat);
      body.castShadow = true; body.receiveShadow = true;
      body.userData = { q: c.q, r: c.r, id: c.id };
      const top = new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: 0x22262e, emissive: 0x223040, emissiveIntensity: 0.2, roughness: 0.35, metalness: 0.4 }));
      top.castShadow = false;
      scene.add(body, top);
      cubes.set(c.id, { body, top, cube: c });
      pickables.push(body);
    }
    view.buildId = game.buildId;
    view.fit(game);
  };

  view.fit = (game) => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    portrait = h > w * 1.05;
    camera.fov = portrait ? 36 : 30;
    const cen = game.centroid();
    let reach = 1.6;
    for (const c of game.cubes) {
      const p = game.worldOf(c);
      reach = Math.max(reach, Math.hypot(p.x - cen.x, (p.z - cen.z) * 0.85) + 0.95);
    }
    const ext = reach * (portrait ? 1.22 : 1.02);
    const aspect = w / Math.max(1, h);
    const tan = Math.tan(camera.fov * Math.PI / 360);
    const I = view.insets;
    const uh = Math.max(80, h - I.top - I.bottom);
    const uw = Math.max(80, w - I.left - I.right);
    const distV = (ext * 0.72 / tan) * (h / uh);
    const distH = (ext / (tan * aspect)) * (w / uw);
    radius = Math.max(distV, distH) * (portrait ? 1.06 : 0.92);
  };

  view.setTier = (t) => {
    view.tier = Math.max(0, Math.min(2, t | 0));
    const on = view.tier > 0;
    if (renderer.shadowMap.enabled !== on) {
      renderer.shadowMap.enabled = on;
      scene.traverse(o => { if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { m.needsUpdate = true; }); } });
    }
    const sm = view.tier >= 2 ? 1024 : 512;
    if (key.shadow.mapSize.x !== sm) {
      key.shadow.mapSize.set(sm, sm);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    bloom.strength = view.tier >= 2 ? 0.5 : 0.32;
    view.resize();
  };

  view.resize = () => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    const cap = view.tier >= 2 ? 1.7 : view.tier === 1 ? 1.3 : 1;
    let pr = Math.min(window.devicePixelRatio || 1, cap);
    const maxPx = view.tier >= 2 ? 2800000 : 1700000;
    if (w * h * pr * pr > maxPx) pr = Math.sqrt(maxPx / (w * h));
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  function cellPos(game, q, r, yLift) {
    const w = game.cellWorld(q, r);
    return v3.set(w.x, w.y + (yLift || 0), w.z);
  }

  view.project = (x, y, z) => {
    v3.set(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      x: (v3.x * 0.5 + 0.5) * r.width + r.left,
      y: (-v3.y * 0.5 + 0.5) * r.height + r.top,
      behind: v3.z > 1
    };
  };

  view.raycast = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables, false);
  };

  function pointBeam(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.05) { beam.visible = false; return; }
    beam.visible = true;
    beam.position.copy(a).addScaledVector(dir, 0.5);
    beam.scale.set(1, len, 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  }

  view.sync = (game, dt, ui) => {
    if (game.buildId !== view.buildId) view.rebuild(game);
    const pal = view.palette;
    const cen = game.centroid();
    const targetCol = colA.set(pal.accent);
    const dimCol = colB.set('#2a303c');
    const altCol = colC.set(pal.alt);
    for (const c of game.cubes) {
      const rec = cubes.get(c.id);
      if (!rec) continue;
      const w = game.worldOf(c);
      const pop = 1 + (c.pop || 0);
      rec.body.visible = !c.gone;
      rec.top.visible = !c.gone;
      rec.body.position.set(w.x, w.y, w.z);
      rec.top.position.set(w.x, w.y + 0.03, w.z);
      rec.body.scale.setScalar(pop);
      rec.top.scale.set(pop, 1, pop);
      if (c.kind === 'crumble' && c.crumb > 4) rec.body.rotation.z = Math.sin(game.time * 28) * 0.04;
      else rec.body.rotation.z = 0;
      rec.body.userData.q = c.kind === 'mover' ? game.moverCell(c).q : c.q;
      rec.body.userData.r = c.kind === 'mover' ? game.moverCell(c).r : c.r;
      const u = c.need ? c.prog / c.need : 0;
      const mat = rec.top.material;
      if (c.kind === 'toggle' && c.prog < 1) {
        mat.color.copy(altCol);
        mat.emissive.copy(altCol);
        mat.emissiveIntensity = 0.55 + Math.sin(game.time * 5) * 0.35;
      } else {
        mat.color.copy(dimCol).lerp(targetCol, Math.pow(u, 0.85));
        mat.emissive.copy(targetCol);
        mat.emissiveIntensity = 0.04 + u * 2.6;
      }
    }

    const p = game.player;
    const hopStretch = p.mode === 'hop' ? Math.sin((p.hop ? p.hop.t / p.hop.dur : 0) * Math.PI) * 0.16 : 0;
    const sy = Math.max(0.62, 1 + (p.squash || 0) + hopStretch);
    const sx = 1 - (sy - 1) * 0.55;
    hero.group.position.set(p.x, p.y, p.z);
    hero.group.scale.set(sx, sy, sx);
    const face = Math.atan2(p.facing.x, p.facing.z);
    hero.group.rotation.y = face;
    const blink = p.blink < 0 ? 0.15 : 1;
    hero.eyes[0].scale.y = blink; hero.eyes[1].scale.y = blink;
    hero.legs[0].rotation.x = Math.sin(game.time * (p.mode === 'hop' ? 18 : 2)) * 0.3;
    hero.legs[1].rotation.x = -hero.legs[0].rotation.x;
    hero.jet.scale.y = p.mode === 'hop' ? 1.6 : 0.5;
    const flash = p.inv > 0 && ((game.time * 18) | 0) % 2 === 0;
    hero.group.visible = p.alive && !flash;
    shadowBlob.position.set(p.x, p.y + 0.02, p.z);
    bubble.visible = !!p.shield;
    bubble.position.set(p.x, p.y + 0.4, p.z);

    const live = new Set();
    for (const f of game.foes) {
      live.add(f.id);
      let mesh = foes.get(f.id);
      if (!mesh) {
        mesh = foeTmpl[f.kind].clone(true);
        mesh.traverse(o => { if (o.isMesh && o.material) o.material = o.material.clone(); });
        scene.add(mesh);
        foes.set(f.id, mesh);
      }
      mesh.position.set(f.x, f.y, f.z);
      mesh.rotation.y = game.time * (f.kind === 'roller' ? 3 : 1.2);
      if (f.kind === 'roller') mesh.rotation.z = game.time * 2;
    }
    for (const [id, mesh] of foes) {
      if (!live.has(id)) { scene.remove(mesh); foes.delete(id); }
    }

    if (game.boss && game.boss.hp > 0) {
      boss.visible = true;
      boss.position.set(game.boss.x, game.boss.y, game.boss.z);
      boss.lookAt(cen.x, game.boss.y, cen.z);
    } else boss.visible = false;
    if (game.boss && game.boss.mark) {
      const w = game.cellWorld(game.boss.mark.q, game.boss.mark.r);
      warn.visible = true;
      warn.position.set(w.x, w.y + 0.06, w.z);
      warn.material.opacity = 0.45 + Math.sin(game.time * 16) * 0.35;
    } else warn.visible = false;

    while (discs.length < game.discs.length) {
      const m = new THREE.Mesh(discGeo, discMat.clone());
      m.rotation.x = Math.PI / 2; scene.add(m); discs.push(m);
    }
    discs.forEach((m, i) => {
      const d = game.discs[i];
      if (!d) { m.visible = false; return; }
      m.visible = true;
      m.position.set(d.x, d.y, d.z);
      m.rotation.z = game.time * 1.5;
    });

    shotPool.forEach(m => { m.visible = false; });
    game.shots.forEach((s, i) => {
      const m = shotPool[i];
      if (!m) return;
      m.visible = true;
      m.position.set(s.x, s.y, s.z);
      const dir = v3.set(s.vx, s.vy, s.vz);
      const len = dir.length() || 1;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.multiplyScalar(1 / len));
      sparks.burst(s.x, s.y, s.z, '#bffbff', 1, 0.4);
    });

    const puLive = new Set();
    for (const pu of game.pickups) {
      puLive.add(pu.id);
      let m = pickups.get(pu.id);
      if (!m) {
        m = new THREE.Mesh(puGeo, new THREE.MeshStandardMaterial({ color: puColors[pu.kind] || 0xffffff, emissive: puColors[pu.kind] || 0xffffff, emissiveIntensity: 1.8 }));
        scene.add(m); pickups.set(pu.id, m);
      }
      const w = game.cellWorld(pu.q, pu.r);
      m.position.set(w.x, w.y + 0.55 + Math.sin(game.time * 3 + pu.id) * 0.08, w.z);
      m.rotation.y = game.time * 2;
    }
    for (const [id, m] of pickups) if (!puLive.has(id)) { scene.remove(m); m.material.dispose(); pickups.delete(id); }

    const aim = ui && ui.aim;
    if (aim && aim.on) {
      pointBeam(new THREE.Vector3(p.x, p.y + 0.45, p.z), new THREE.Vector3(aim.x, aim.y, aim.z));
      reticle.visible = true;
      reticle.position.set(aim.x, aim.y, aim.z);
      reticle.lookAt(camera.position);
    } else { beam.visible = false; reticle.visible = false; }
    const gh = ui && ui.ghost;
    if (gh) {
      const w = game.worldOf(game.cubeAt(gh.q, gh.r) || { q: gh.q, r: gh.r });
      ghost.visible = true;
      ghost.position.set(w.x, (w.y || 0) + 0.07, w.z);
    } else ghost.visible = false;
    const path = (ui && ui.path) || [];
    pathDots.forEach((d, i) => {
      const step = path[i];
      if (!step) { d.visible = false; return; }
      const w = game.cellWorld(step.q, step.r);
      d.visible = true;
      d.position.set(w.x, w.y + 0.08, w.z);
    });

    for (const ev of game.fx) {
      if (ev.k === 'paint') sparks.burst(ev.x, ev.y + 0.2, ev.z, pal.accent, 16, 2.4);
      else if (ev.k === 'land') sparks.burst(ev.x, ev.y + 0.05, ev.z, '#d0d8e4', 8, 1.2);
      else if (ev.k === 'boom' || ev.k === 'pulse' || ev.k === 'crumble') sparks.burst(ev.x, ev.y + 0.3, ev.z, ev.kind === 'boss' ? '#ffd27a' : '#ff8a5a', 28, 3.4);
      else if (ev.k === 'spark' || ev.k === 'shot') sparks.burst(ev.x, ev.y, ev.z, '#c8fbff', 6, 1.6);
      else if (ev.k === 'hurt') sparks.burst(ev.x, ev.y + 0.3, ev.z, '#ff5a6a', 18, 2.8);
      else if (ev.k === 'power' || ev.k === 'shield' || ev.k === 'catch') sparks.burst(ev.x, ev.y + 0.4, ev.z, '#9aefff', 14, 2);
    }
    game.fx.length = 0;
    sparks.update(dt);

    const yaw = view.spin + Math.sin(game.time * 0.17) * 0.09;
    const elev = portrait ? 1.02 : 0.78;
    desired.set(
      cen.x + Math.sin(yaw) * radius * 0.85,
      cen.y + Math.sin(elev) * radius * 0.62,
      cen.z + Math.cos(yaw) * radius
    );
    lookD.set(cen.x, cen.y + 0.2, cen.z);
    const k = 1 - Math.exp(-6 * Math.max(0.001, dt));
    camPos.lerp(desired, k);
    look.lerp(lookD, k);
    const shake = game.shake || 0;
    sky.material.uniforms.camPos.value.copy(camPos);
    camera.position.copy(camPos);
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.65;
    camera.lookAt(look);
    camera.updateProjectionMatrix();

    const span = game.rows * 1.5 + 2;
    key.position.set(cen.x - 5, cen.y + 11, cen.z + 6);
    key.target.position.set(cen.x, cen.y, cen.z);
    key.shadow.camera.left = -span; key.shadow.camera.right = span;
    key.shadow.camera.top = span; key.shadow.camera.bottom = -span;
    key.shadow.camera.updateProjectionMatrix();
    rim.position.set(cen.x + 7, cen.y + 5, cen.z - 5);
    abyss.position.set(cen.x, -2.6, cen.z);
    far.rotation.y = game.time * 0.04;
  };

  view.render = () => {
    if (view.tier === 0) renderer.render(scene, camera);
    else composer.render();
  };

  view.setTier(detectTier());
  view.resize();
  applySky(0);
  return view;
}
