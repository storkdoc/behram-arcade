/* APEX GRAND PRIX — gl.js
   Raw WebGL2 renderer (no libraries): MSAA HDR scene, directional shadow map, physically-flavoured
   lighting (clear-coat paint, fresnel sky reflections), procedural asphalt/kerbs/grass/gravel,
   sky with clouds and sun, Mt. Fuji / alpine ranges / ocean backdrops, particles (tyre smoke,
   sparks, explosions), skid marks, bloom, lens flare, speed blur and vignette.
   Adaptive quality only ever drops effects - the canvas always stays at native device pixels. */
const R3D = (() => {
  'use strict';
  /* ---------------- math ---------------- */
  const M = {
    id() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
    ortho(l, r, b, t, n, f) { const o = M.id(); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); return o; },
    look(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx, o = new Float32Array(16);
      o[0] = xx; o[1] = yx; o[2] = zx; o[4] = xy; o[5] = yy; o[6] = zy; o[8] = xz; o[9] = yz; o[10] = zz;
      o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1; return o;
    },
    inv(m) {
      const a = m, o = new Float32Array(16);
      const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4], b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
      const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12], b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
      let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return M.id(); d = 1 / d;
      o[0] = (a[5] * b11 - a[6] * b10 + a[7] * b09) * d; o[1] = (a[2] * b10 - a[1] * b11 - a[3] * b09) * d; o[2] = (a[13] * b05 - a[14] * b04 + a[15] * b03) * d; o[3] = (a[10] * b04 - a[9] * b05 - a[11] * b03) * d;
      o[4] = (a[6] * b08 - a[4] * b11 - a[7] * b07) * d; o[5] = (a[0] * b11 - a[2] * b08 + a[3] * b07) * d; o[6] = (a[14] * b02 - a[12] * b05 - a[15] * b01) * d; o[7] = (a[8] * b05 - a[10] * b02 + a[11] * b01) * d;
      o[8] = (a[4] * b10 - a[5] * b08 + a[7] * b06) * d; o[9] = (a[1] * b08 - a[0] * b10 - a[3] * b06) * d; o[10] = (a[12] * b04 - a[13] * b02 + a[15] * b00) * d; o[11] = (a[9] * b02 - a[8] * b04 - a[11] * b00) * d;
      o[12] = (a[5] * b07 - a[4] * b09 - a[6] * b06) * d; o[13] = (a[0] * b09 - a[1] * b07 + a[2] * b06) * d; o[14] = (a[13] * b01 - a[12] * b03 - a[14] * b00) * d; o[15] = (a[8] * b03 - a[9] * b01 + a[10] * b00) * d; return o;
    },
    basis(px, py, pz, rx, ry, rz, ux, uy, uz, bx, by, bz) { const o = new Float32Array(16); o[0] = rx; o[1] = ry; o[2] = rz; o[4] = ux; o[5] = uy; o[6] = uz; o[8] = bx; o[9] = by; o[10] = bz; o[12] = px; o[13] = py; o[14] = pz; o[15] = 1; return o; },
    trs(x, y, z, ry, rx, sx, sy, sz) { // translate * rotY * rotX * scale
      const cy = Math.cos(ry), sy_ = Math.sin(ry), cx = Math.cos(rx), sx_ = Math.sin(rx), o = new Float32Array(16);
      o[0] = cy * sx; o[1] = 0; o[2] = -sy_ * sx;
      o[4] = sy_ * sx_ * sy; o[5] = cx * sy; o[6] = cy * sx_ * sy;
      o[8] = sy_ * cx * sz; o[9] = -sx_ * sz; o[10] = cy * cx * sz;
      o[12] = x; o[13] = y; o[14] = z; o[15] = 1; return o;
    },
    xf(m, x, y, z) { const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; },
  };
  const hex = (h, k) => { h = h.replace('#', ''); const n = parseInt(h, 16); k = k == null ? 1 : k; return [((n >> 16) & 255) / 255 * k, ((n >> 8) & 255) / 255 * k, (n & 255) / 255 * k]; };
  const lin = c => c.map(v => Math.pow(v, 2.2));
  function hash2(x, z) { let h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }
  function vnoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, z, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (o || 4); i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }

  /* ---------------- geometry builder ----------------
     vertex: pos3 nrm3 col3 mat1 (mat selects the shading model in the mesh shader) */
  class Geo {
    constructor() { this.a = []; this.n = 0; }
    v(p, nn, c, m) { this.a.push(p[0], p[1], p[2], nn[0], nn[1], nn[2], c[0], c[1], c[2], m); this.n++; }
    tri(p0, p1, p2, c, m, ctr) {
      let ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2], vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      if (ctr) { const fx = (p0[0] + p1[0] + p2[0]) / 3 - ctr[0], fy = (p0[1] + p1[1] + p2[1]) / 3 - ctr[1], fz = (p0[2] + p1[2] + p2[2]) / 3 - ctr[2]; if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; const t = p1; p1 = p2; p2 = t; } }
      const nn = [nx, ny, nz]; this.v(p0, nn, c, m); this.v(p1, nn, c, m); this.v(p2, nn, c, m);
    }
    quad(a, b, c, d, col, m, ctr) { this.tri(a, b, c, col, m, ctr); this.tri(a, c, d, col, m, ctr); }
    hexa(P, col, m) { // P: 8 corners (0-3 bottom ring, 4-7 top ring)
      const ctr = [0, 0, 0]; P.forEach(p => { ctr[0] += p[0] / 8; ctr[1] += p[1] / 8; ctr[2] += p[2] / 8; });
      const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      for (const f of F) this.quad(P[f[0]], P[f[1]], P[f[2]], P[f[3]], col, m, ctr);
    }
    box(x0, y0, z0, x1, y1, z1, col, m) { this.hexa([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], col, m); }
    // tapered box along z: from (w0,h0) at z0 to (w1,h1) at z1, bottom at y0/y1, centred on cx
    taper(cx, z0, z1, w0, y0a, y0b, w1, y1a, y1b, col, m) { this.hexa([[cx - w0, y0a, z0], [cx + w0, y0a, z0], [cx + w1, y1a, z1], [cx - w1, y1a, z1], [cx - w0, y0b, z0], [cx + w0, y0b, z0], [cx + w1, y1b, z1], [cx - w1, y1b, z1]], col, m); }
    // smooth loft of superellipse sections along z: s = [{z, w, h, y, x}], with caps
    loft(S, seg, ex, col, m) {
      const ring = s => { const r = []; for (let i = 0; i < seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); r.push([(s.x || 0) + Math.sign(c) * Math.pow(Math.abs(c), 2 / ex) * s.w, s.y + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / ex) * s.h * (sn < 0 ? (s.lo || 1) : 1), s.z]); } return r; };
      const R = S.map(ring), Nn = R.map(r => r.map(() => [0, 0, 0]));
      const acc = (i, j, n) => { const t = Nn[i][j]; t[0] += n[0]; t[1] += n[1]; t[2] += n[2]; };
      const fn = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
      const faces = [];
      for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg, q = [[i, j], [i, j2], [i + 1, j2], [i + 1, j]];
        let n = fn(R[i][j], R[i + 1][j], R[i][j2]); const mx = (R[i][j][0] + R[i + 1][j2][0]) / 2 - (S[i].x || 0), my = (R[i][j][1] + R[i + 1][j2][1]) / 2 - S[i].y; if (n[0] * mx + n[1] * my < 0) n = n.map(v => -v);
        q.forEach(([a, b]) => acc(a, b, n)); faces.push(q);
      }
      Nn.forEach(r => r.forEach(n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; n[0] /= l; n[1] /= l; n[2] /= l; }));
      for (const q of faces) { const P = q.map(([a, b]) => R[a][b]), N = q.map(([a, b]) => Nn[a][b]); [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(k => this.v(P[k], N[k], col, m))); }
      [0, R.length - 1].forEach(i => { const r = R[i], c = [S[i].x || 0, S[i].y, S[i].z], nz = i === 0 ? -1 : 1; for (let j = 0; j < seg; j++) { const a = r[j], b = r[(j + 1) % seg]; this.v(c, [0, 0, nz], col, m); this.v(nz < 0 ? b : a, [0, 0, nz], col, m); this.v(nz < 0 ? a : b, [0, 0, nz], col, m); } });
    }
    cylX(cx, cy, cz, r, w, seg, col, m, rIn) { // axis along x, centred; optional inner radius (annulus caps)
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const p = (x, c, s, rr) => [cx + x, cy + s * rr, cz + c * rr];
        const A = p(-w, c0, s0, r), B = p(w, c0, s0, r), C = p(w, c1, s1, r), D = p(-w, c1, s1, r);
        const n0 = [0, s0, c0], n1 = [0, s1, c1];
        this.v(A, n0, col, m); this.v(B, n0, col, m); this.v(C, n1, col, m); this.v(A, n0, col, m); this.v(C, n1, col, m); this.v(D, n1, col, m);
        for (const sd of [-1, 1]) { const ri = rIn || 0, nn = [sd, 0, 0], E = p(sd * w, c0, s0, r), F = p(sd * w, c1, s1, r), E2 = p(sd * w, c0, s0, ri), F2 = p(sd * w, c1, s1, ri); if (sd > 0) { this.v(E, nn, col, m); this.v(E2, nn, col, m); this.v(F, nn, col, m); this.v(F, nn, col, m); this.v(E2, nn, col, m); this.v(F2, nn, col, m); } else { this.v(E, nn, col, m); this.v(F, nn, col, m); this.v(E2, nn, col, m); this.v(F, nn, col, m); this.v(F2, nn, col, m); this.v(E2, nn, col, m); } }
      }
    }
    sphere(cx, cy, cz, r, seg, col, m, sy) {
      sy = sy || 1;
      for (let i = 0; i < seg; i++) for (let j = 0; j < seg * 2; j++) {
        const P = (a, b) => { const th = a / seg * Math.PI, ph = b / (seg * 2) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)]; };
        const q = [P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
        const w = n => [cx + n[0] * r, cy + n[1] * r * sy, cz + n[2] * r];
        [[0, 1, 2], [0, 2, 3]].forEach(t => t.forEach(k => this.v(w(q[k]), q[k], col, m)));
      }
    }
    tube(pts, r, seg, col, m) { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; this.loftSeg(a, b, r, seg, col, m); } }
    loftSeg(a, b, r, seg, col, m) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz), t = [dx / l, dy / l, dz / l];
      let u = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; let s = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]]; const sl = Math.hypot(...s); s = s.map(v => v / sl); u = [s[1] * t[2] - s[2] * t[1], s[2] * t[0] - s[0] * t[2], s[0] * t[1] - s[1] * t[0]];
      for (let i = 0; i < seg; i++) {
        const n = k => { const a2 = k / seg * Math.PI * 2, c = Math.cos(a2), sn = Math.sin(a2); return [s[0] * c + u[0] * sn, s[1] * c + u[1] * sn, s[2] * c + u[2] * sn]; };
        const n0 = n(i), n1 = n(i + 1), P = (p, nn) => [p[0] + nn[0] * r, p[1] + nn[1] * r, p[2] + nn[2] * r];
        this.v(P(a, n0), n0, col, m); this.v(P(b, n0), n0, col, m); this.v(P(b, n1), n1, col, m); this.v(P(a, n0), n0, col, m); this.v(P(b, n1), n1, col, m); this.v(P(a, n1), n1, col, m);
      }
    }
  }

  /* ---------------- GL plumbing ---------------- */
  let gl = null, cv = null, ok = false, isHDR = false, maxS = 0, aniso = null;
  const P = {};       // programs
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); console.warn(src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); throw new Error('shader: ' + e); } return s; }
  function prog(vs, fs, attrs) {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, HDR + vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HDR + COMMON + fs));
    (attrs || []).forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name.replace('[0]', '')] = gl.getUniformLocation(p, inf.name); }
    return { p, u };
  }
  function vao(data, layout, stride) { // layout: [[loc, size, offset]]
    const v = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : new Float32Array(data), gl.STATIC_DRAW);
    for (const [loc, size, off] of layout) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); }
    gl.bindVertexArray(null); return { v, b, n: data.length / stride };
  }
  const meshVAO = g => vao(g.a, [[0, 3, 0], [1, 3, 3], [2, 3, 6], [3, 1, 9]], 10);
  const HDR = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n';
  const COMMON = `
uniform vec3 uSun, uSunCol, uAmbTop, uAmbBot, uFog, uCam, uHorizon, uZenith, uGround;
uniform float uFogD, uTime, uShadowOn, uShadowTaps, uShadowTex, uFlash;
uniform mat4 uLVP;
uniform sampler2DShadow uShadow;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f); return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p, int o){ float s=0., a=.5; for(int i=0;i<6;i++){ if(i>=o) break; s+=a*vnoise(p); p=p*2.03+vec2(1.7,9.2); a*=.5; } return s; }
float shadowAt(vec3 wp, vec3 n){
  if(uShadowOn < .5) return 1.;
  vec4 lp = uLVP*vec4(wp + n*0.06, 1.); vec3 p = lp.xyz/lp.w*.5+.5;
  if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.) return 1.;
  float ts = 1./uShadowTex, s = 0.;
  if(uShadowTaps > 2.){ for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s += texture(uShadow, vec3(p.xy+vec2(i,j)*ts*1.25, p.z-.0012)); s /= 9.; }
  else s = texture(uShadow, vec3(p.xy, p.z-.0012));
  vec2 e = smoothstep(vec2(0.), vec2(.08), p.xy)*smoothstep(vec2(0.), vec2(.08), 1.-p.xy);
  return mix(1., s, e.x*e.y);
}
vec3 skyEnv(vec3 r){
  float y = r.y;
  vec3 c = y > 0. ? mix(uHorizon, uZenith, pow(smoothstep(0., .7, y), .6)) : mix(uHorizon, uGround, smoothstep(0., -.12, y));
  c += uSunCol * pow(max(dot(r, uSun), 0.), 400.) * 6. + uSunCol*pow(max(dot(r,uSun),0.),12.)*.25;
  return c;
}
vec3 applyFog(vec3 c, vec3 wp){
  vec3 v = wp - uCam; float d = length(v); v /= d;
  float f = 1. - exp(-pow(d*uFogD, 1.35));
  float sa = pow(max(dot(v, uSun), 0.), 6.);
  vec3 fc = mix(uFog, uFog + uSunCol*.35, sa);
  return mix(c, fc, clamp(f, 0., 1.));
}
vec3 lit(vec3 alb, vec3 N, vec3 wp, float spec, float shin, float refl, float sh){
  vec3 V = normalize(uCam - wp), L = uSun;
  float ndl = max(dot(N, L), 0.);
  vec3 amb = mix(uAmbBot, uAmbTop, N.y*.5+.5);
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.), shin) * spec * (shin+8.)/25.;
  float fr = pow(1. - max(dot(N, V), 0.), 5.);
  vec3 env = skyEnv(reflect(-V, N));
  vec3 c = alb*(amb + uSunCol*ndl*sh) + uSunCol*sp*sh*ndl;
  c = mix(c, env, clamp(refl*(0.04 + 0.96*fr), 0., 1.));
  return c + alb*uFlash;
}
`;
  const X = { M, Geo, hex, lin, fbm, vnoise };
  return { X, M, Geo, hex, lin, fbm, vnoise, hash2, get gl() { return gl; }, set gl(v) { gl = v; }, P, prog, vao, meshVAO, COMMON, HDR };
})();
