/* NEURO STORM, dense mode renderer: the base three.js scene (brain surfaces, bloom) plus up to ~1M
   neuron points drawn straight from the GPU state textures (no per-neuron CPU work per frame). */
import * as THREE from '../vendor/three/three.module.min.js';
import { Render3D } from './render3d.js';
import { callosumMesh } from './brain.js';
import { CLASSES, CP } from './dense.js';
import { DT } from './sim.js';

const hex = c => new THREE.Color(c);
export class DenseRender3D extends Render3D {
  buildNeurons() {
    const net = this.net, N = net.N;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(net.pos, 3));
    g.setAttribute('aCls', new THREE.BufferAttribute(net.cls, 1));   // Uint8 class code, read as a float
    this.texA = new THREE.Texture(); this.texB = new THREE.Texture();
    const sc = 4000 / N;
    const rel = CP.map(c => c.tAbs + c.tauTh * Math.log(c.dTh));
    this.uni = { uSA: { value: this.texA }, uSB: { value: this.texB }, uW: { value: net.g.W }, uScale: { value: 500 }, uPR: { value: 1 },
      uSize: { value: 0.03 * Math.pow(sc, 0.3) }, uRest: { value: 0.6 * Math.pow(sc, 0.2) }, uHot: { value: 3.0 * Math.pow(sc, 0.3) }, uSel: { value: -1 }, uTime: { value: 0 },
      uFlashMs: { value: 3 }, uClip: this.clip, uCols: { value: CLASSES.map(c => hex(c.color)) }, uRel: { value: rel } };
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, uniforms: this.uni,
      vertexShader: /* glsl */`
        precision highp sampler2D;
        uniform sampler2D uSA, uSB; uniform int uW; uniform float uScale, uPR, uSize, uRest, uHot, uSel, uTime, uFlashMs, uClip;
        uniform vec3 uCols[7]; uniform float uRel[7];
        attribute float aCls;
        varying vec3 vCol; varying float vCore; varying float vHalo;
        void main(){
          if (position.z > uClip) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
          ivec2 p = ivec2(gl_VertexID % uW, gl_VertexID / uW);
          float V = texelFetch(uSA, p, 0).x, since = texelFetch(uSB, p, 0).z * ${DT.toFixed(2)};
          int cls = int(aCls + 0.5);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 hc = vec3(position.x < 0.0 ? -0.56 : 0.56, 0.08, 0.0);
          float facing = dot(normalize(position - hc), normalize(cameraPosition - position));
          float depthFade = clamp(1.25 - (-mv.z - 3.2) * 0.32, 0.35, 1.15) * mix(0.3, 1.0, smoothstep(-0.35, 0.25, facing));
          vec3 base = uCols[cls];
          float flash = exp(-since / uFlashMs);
          float dep = smoothstep(-70.0, -54.0, V), hyp = smoothstep(-70.5, -79.0, V);
          float relW = uRel[cls], refr = since < relW ? 1.0 - since / relW : 0.0;
          vec3 c = base * uRest * (1.0 + 2.0 * dep);
          c = mix(c, vec3(0.22, 0.26, 0.95) * uRest * 0.45, hyp * 0.85);
          c += vec3(1.0, 0.3, 0.1) * refr * uRest * 0.6 * (1.0 - flash);
          c = mix(c, mix(base, vec3(1.0), 0.55) * uHot, flash);
          bool sel = abs(float(gl_VertexID) - uSel) < 0.5;
          if (sel) c = vec3(1.0, 1.0, 1.0) * (1.6 + 0.8 * sin(uTime * 5.0));
          vCol = c * depthFade; vCore = 0.55 + 0.45 * flash; vHalo = 0.2 + 0.8 * flash;
          float sz = uSize * (cls == 2 ? 1.45 : cls == 1 ? 0.85 : 1.0) * (1.0 + 1.2 * flash) + (sel ? uSize * 5.0 : 0.0);
          gl_PointSize = max(1.5 * uPR, sz * uScale / -mv.z) + (sel ? 6.0 * uPR : 0.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vCore; varying float vHalo;
        void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p,p); if (r2 > 1.0) discard;
          float a = smoothstep(0.30, 0.0, r2) * vCore + exp(-r2 * 5.0) * vHalo * 0.6;
          gl_FragColor = vec4(vCol * a, 1.0); }` });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.scene.add(this.points);
  }
  buildLines() {
    // no per-synapse lines at this density; show the corpus callosum instead
    const d = callosumMesh(), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.verts, 3)); g.setIndex(d.idx); g.computeVertexNormals();
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uClip: this.clip },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vZ = position.z; vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uClip; varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ if (vZ > uClip) discard; float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(vec3(0.55,0.62,0.8) * (0.05 + 0.25*pow(f,2.0)), 1.0); }` });
    this.lines = new THREE.Mesh(g, m); this.scene.add(this.lines);
    this.drawn = null;
  }
  buildPulses() { this.pulsePts = null; this.pDirty = false; this.pUni = { uSim: { value: 0 } }; }
  addPulse() {}
  clearPulses() { this.ripples.forEach(r => (r.mesh.visible = false)); }
  setSelected(i) { this.uni.uSel.value = i == null ? -1 : i; }
  updateState() {}
  bindGpu(gpu, speed) {
    // hand the current ping-pong state textures to three without any upload
    const props = this.r.properties;
    props.get(this.texA).__webglTexture = gpu.stateA; props.get(this.texB).__webglTexture = gpu.stateB;
    this.uni.uFlashMs.value = Math.max(0.6, speed * 0.3);
  }
  render(view, simT, realT, dtReal) {
    const c = this.camera; this.cam.apply(c, this.w, this.h, view);
    this.uni.uScale.value = this.h * this.pr / (2 * Math.tan(c.fov * Math.PI / 360));
    this.uni.uTime.value = realT;
    for (const r of this.ripples) {
      if (!r.mesh.visible) continue; r.t += dtReal; const u = r.t / 0.9;
      if (u >= 1) { r.mesh.visible = false; continue; }
      const s = 0.05 + 0.5 * Math.pow(u, 0.6); r.mesh.scale.set(s, s, s); r.mesh.quaternion.copy(c.quaternion); r.mesh.material.uniforms.uA.value = (1 - u) * (1 - u);
    }
    if (this.noFx) this.r.render(this.scene, this.camera); else this.composer.render();
  }
}
