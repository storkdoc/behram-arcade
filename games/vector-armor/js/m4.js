/* VECTOR ARMOR — m4.js : column-major 4x4 matrix helpers (shared by the WebGL and Canvas2D renderers). */
const M4 = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  tr(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  sc(x, y, z) { const o = M4.id(); o[0] = x; o[5] = y == null ? x : y; o[10] = z == null ? x : z; return o; },
  chain(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); },
  xf(m, p) { const x = p[0], y = p[1], z = p[2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]]; },
};
/** camera matrices shared by both renderers. cam: {x,y,z,h,pitch,roll}, fovY, aspect */
function camMats(cam, fovY, asp, far) {
  const rot = M4.chain(M4.rz(-(cam.roll || 0)), M4.rx(-(cam.pitch || 0)), M4.ry(cam.h));
  const V = M4.mul(rot, M4.tr(-cam.x, -cam.y, -cam.z));
  const P = M4.persp(fovY, asp, 0.25, far || 1400), Pfar = M4.persp(fovY, asp, 1, 5000);
  return { V, P, rot, Pfar, VP: M4.mul(P, V), VPsky: M4.mul(Pfar, rot) };
}
