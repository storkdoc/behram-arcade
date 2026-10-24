/* APEX GRAND PRIX — scene.js : the WebGL2 world (uses R3D helpers from gl.js, shaders from shaders.js) */
const Scene = (() => {
  'use strict';
  const { M, Geo, hex, lin, fbm, vnoise, hash2 } = R3D;
  let gl, cv, P = {}, S = {}, T = null, theme = null, W = 1, H = 1, built = '', t0 = performance.now();
  const Q = { level: 0, msaa: 4, shadow: 2048, taps: 9, bloom: 1, blurN: 10, parts: 1, clouds: 5 };
  const LEVELS = [{ msaa: 4, shadow: 2048, taps: 9, bloom: 1, blurN: 10, parts: 1, clouds: 5 }, { msaa: 4, shadow: 1024, taps: 9, bloom: 1, blurN: 7, parts: 0.8, clouds: 4 },
    { msaa: 2, shadow: 1024, taps: 1, bloom: 0, blurN: 5, parts: 0.6, clouds: 4 }, { msaa: 0, shadow: 0, taps: 1, bloom: 0, blurN: 0, parts: 0.4, clouds: 3 }];
  const THEMES = {
    fuji: { sunAz: 0.8, sunEl: 0.5, sun: [1, .94, .84], sunI: 3.3, zen: '#2c68cc', hor: '#b5cfe6', fog: '#a7c0d8', ground: '#4a5a3c', ambT: [.32, .42, .6], ambB: [.16, .17, .12], cloud: .5, fogD: 1 / 2300, mount: 'fuji', hills: 1, snow: .62 },
    seaside: { sunAz: -0.25, sunEl: 0.085, sun: [1, .62, .34], sunI: 3.4, zen: '#273a74', hor: '#f2a86e', fog: '#d89c78', ground: '#3d3a30', ambT: [.36, .3, .42], ambB: [.2, .14, .1], cloud: .55, fogD: 1 / 2600, mount: 'coast', hills: 1, snow: 2, sea: true },
    alpine: { sunAz: 2.3, sunEl: 0.62, sun: [1, .97, .92], sunI: 3.0, zen: '#3a6cb4', hor: '#c9d8e6', fog: '#b8c8d8', ground: '#4c5848', ambT: [.36, .44, .58], ambB: [.15, .16, .14], cloud: .44, fogD: 1 / 2000, mount: 'alps', hills: 2.2, snow: .5 },
  };
  const ADS = [['SUMMIT COLA', '#d81e26', '#fff'], ['NOVA TYRES', '#111', '#ffd400'], ['BEHRAM ARCADE', '#1b1f6e', '#7df9ff'], ['TURBO FUEL', '#ff6a00', '#111'], ['ZEN WATCHES', '#f5f5f5', '#111'], ['HAYATE MOTORS', '#0a7f3f', '#fff'], ['KITE CAMERA', '#ffd400', '#d81e26'], ['RAMEN EXPRESS', '#7b1fa2', '#ffe082']];

  function init(canvas) {
    cv = canvas;
    try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return false;
    R3D.gl = gl;
    try {
      isHDR = !!gl.getExtension('EXT_color_buffer_float');
      S.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      S.maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;
      const p = (n, a) => (P[n] = R3D.prog(SH[n + '_vs'] || SH[a], SH[n + '_fs']));
      P.mesh = R3D.prog(SH.mesh_vs, SH.mesh_fs); P.ground = R3D.prog(SH.ground_vs, SH.ground_fs); P.sky = R3D.prog(SH.sky_vs, SH.sky_fs);
      P.depth = R3D.prog(SH.depth_vs, SH.depth_fs); P.tex = R3D.prog(SH.tex_vs, SH.tex_fs); P.part = R3D.prog(SH.part_vs, SH.part_fs);
      P.decal = R3D.prog(SH.decal_vs, SH.decal_fs); P.bright = R3D.prog(SH.post_vs, SH.bright_fs); P.blur = R3D.prog(SH.post_vs, SH.blur_fs); P.final = R3D.prog(SH.post_vs, SH.final_fs);
      S.tri = R3D.vao([-1, -1, 3, -1, -1, 3], [[0, 2, 0]], 2);
      buildCar(); buildWheel();
      S.partBuf = gl.createBuffer(); S.partVAO = gl.createVertexArray(); gl.bindVertexArray(S.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, S.partBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
      S.decBuf = gl.createBuffer(); S.decVAO = gl.createVertexArray(); gl.bindVertexArray(S.decVAO); gl.bindBuffer(gl.ARRAY_BUFFER, S.decBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.bindVertexArray(null);
      // 1x1 dummy depth texture so the shadow sampler is always valid
      S.dummyDepth = depthTex(1);
      if (gl.getError() !== gl.NO_ERROR) console.warn('gl init error');
    } catch (e) { console.warn('WebGL2 init failed, using 2D renderer:', e.message); gl = null; return false; }
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); S.lost = true; });
    return true;
  }
  let isHDR = false;
  function depthTex(n) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, n, n, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); return t; }
  function colorTex(w, h, hdr) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function fbo(tex, depth) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); if (tex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0); return f; }

  /* ---------------- render targets ---------------- */
  function targets() {
    const key = W + 'x' + H + ':' + Q.msaa + ':' + Q.shadow + ':' + Q.bloom;
    if (S.tkey === key) return; S.tkey = key;
    ['sceneF', 'resolveF', 'b0F', 'b1F', 'shadowF'].forEach(k => S[k] && gl.deleteFramebuffer(S[k]));
    ['sceneTex', 'b0', 'b1', 'shadowTex'].forEach(k => S[k] && gl.deleteTexture(S[k]));
    ['msC', 'msD'].forEach(k => S[k] && gl.deleteRenderbuffer(S[k]));
    const fmt = isHDR ? gl.RGBA16F : gl.RGBA8, samples = Math.min(Q.msaa, S.maxSamples);
    S.sceneTex = colorTex(W, H, isHDR); S.resolveF = fbo(S.sceneTex);
    S.sceneF = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, S.sceneF);
    S.msC = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, S.msC);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt, W, H); else gl.renderbufferStorage(gl.RENDERBUFFER, fmt, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, S.msC);
    S.msD = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, S.msD);
    if (samples > 0) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, S.msD);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { console.warn('scene fbo incomplete; dropping HDR'); if (isHDR) { isHDR = false; S.tkey = ''; return targets(); } }
    S.bw = Math.max(1, W >> 2); S.bh = Math.max(1, H >> 2);
    S.b0 = colorTex(S.bw, S.bh, isHDR); S.b1 = colorTex(S.bw, S.bh, isHDR); S.b0F = fbo(S.b0); S.b1F = fbo(S.b1);
    if (Q.shadow) { S.shadowTex = depthTex(Q.shadow); S.shadowF = fbo(null, S.shadowTex); gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---------------- car model (local: x right, y up, -z forward; ~5 m long) ---------------- */
  function buildCar() {
    const g = new Geo(), C = [1, 1, 1];
    // monocoque + engine cover (painted), one smooth loft nose -> tail
    g.loft([{ z: -2.62, w: .07, h: .05, y: .2 }, { z: -2.45, w: .17, h: .1, y: .23 }, { z: -2.0, w: .25, h: .16, y: .29 }, { z: -1.45, w: .33, h: .23, y: .34 }, { z: -0.95, w: .42, h: .3, y: .39, lo: .9 },
      { z: -0.55, w: .48, h: .3, y: .42, lo: .9 }, { z: 0.15, w: .5, h: .3, y: .43, lo: .9 }, { z: 0.45, w: .4, h: .44, y: .5 }, { z: 1.0, w: .33, h: .36, y: .46 }, { z: 1.7, w: .22, h: .24, y: .4 }, { z: 2.25, w: .13, h: .14, y: .36 }], 18, 2.6, C, 0);
    // cockpit opening (dark) and driver
    g.loft([{ z: -0.62, w: .2, h: .04, y: .73 }, { z: -0.4, w: .27, h: .05, y: .73 }, { z: 0.12, w: .27, h: .05, y: .735 }, { z: 0.22, w: .18, h: .04, y: .73 }], 14, 3, [.02, .02, .02], 6);
    g.sphere(0, .83, -0.12, .155, 9, hex('#ffcc00'), 12, 1.05);
    g.loft([{ z: -0.27, w: .11, h: .035, y: .86 }, { z: -0.15, w: .13, h: .04, y: .86 }], 10, 2.5, [0, 0, 0], 11); // visor
    // airbox intake
    g.loft([{ z: 0.32, w: .1, h: .1, y: .98 }, { z: 0.45, w: .15, h: .13, y: .96 }, { z: 0.8, w: .12, h: .14, y: .86 }], 12, 2.4, C, 0);
    g.loft([{ z: 0.31, w: .075, h: .06, y: .98 }, { z: 0.33, w: .075, h: .06, y: .98 }], 10, 2.4, [.01, .01, .01], 6);
    // halo
    g.tube([[-.27, .76, 0.12], [-.25, .9, -0.15], [-.12, .95, -0.42], [0, .95, -0.5], [.12, .95, -0.42], [.25, .9, -0.15], [.27, .76, 0.12]], .028, 7, [.03, .03, .03], 2);
    g.tube([[0, .95, -0.5], [0, .78, -0.7]], .03, 7, [.03, .03, .03], 2);
    // shark fin (accent)
    g.taper(0, 0.75, 2.05, .012, .8, 1.05, .012, .42, .62, C, 1);
    // sidepods
    for (const sx of [-1, 1]) {
      g.loft([{ z: -0.55, w: .17, h: .17, y: .33, x: sx * .62 }, { z: -0.35, w: .25, h: .2, y: .34, x: sx * .64 }, { z: 0.35, w: .25, h: .19, y: .33, x: sx * .62 }, { z: 1.05, w: .16, h: .14, y: .29, x: sx * .52 }, { z: 1.55, w: .08, h: .09, y: .25, x: sx * .4 }], 14, 2.8, C, 0);
      g.loft([{ z: -0.56, w: .14, h: .13, y: .34, x: sx * .62 }, { z: -0.545, w: .14, h: .13, y: .34, x: sx * .62 }], 10, 2.8, [.01, .01, .01], 6); // intake mouth
      // mirrors
      g.box(sx * .42, .72, -0.78, sx * .58, .78, -0.72, [1, 1, 1], 0); g.tube([[sx * .3, .66, -0.75], [sx * .46, .74, -0.75]], .012, 5, [.03, .03, .03], 2);
      // suspension arms
      g.tube([[sx * .28, .4, -1.75], [sx * .74, .34, -1.67]], .022, 6, [.03, .03, .03], 2); g.tube([[sx * .28, .3, -1.45], [sx * .74, .3, -1.65]], .022, 6, [.03, .03, .03], 2); g.tube([[sx * .24, .28, -2.0], [sx * .74, .28, -1.67]], .022, 6, [.03, .03, .03], 2);
      g.tube([[sx * .22, .42, 1.6], [sx * .72, .36, 1.75]], .022, 6, [.03, .03, .03], 2); g.tube([[sx * .22, .28, 1.95], [sx * .72, .3, 1.75]], .022, 6, [.03, .03, .03], 2);
      // front wing endplates + flaps
      g.box(sx * .9, .05, -2.82, sx * .94, .3, -2.25, C, 0);
      g.taper(sx * .52, -2.8, -2.42, .42, .06, .085, .42, .06, .085, C, 2);
      g.taper(sx * .55, -2.52, -2.3, .38, .1, .13, .38, .15, .2, C, 1);
      // rear wing endplates
      g.box(sx * .5, .4, 2.05, sx * .53, 1.02, 2.62, C, 0);
      // bargeboards
      g.box(sx * .55, .1, -1.15, sx * .57, .34, -0.75, [.03, .03, .03], 2);
    }
    // front wing centre, floor, diffuser, rear wing, rain light
    g.box(-.12, .06, -2.8, .12, .085, -2.42, [.03, .03, .03], 2);
    g.taper(0, -1.25, 2.1, .62, .03, .07, .52, .03, .07, [.03, .03, .03], 2);
    g.taper(0, 1.7, 2.45, .48, .06, .14, .5, .14, .36, [.03, .03, .03], 2);
    g.taper(0, 2.12, 2.42, .5, .78, .84, .5, .82, .86, C, 2);
    g.taper(0, 2.32, 2.6, .5, .88, .93, .5, .93, 1.0, C, 0);
    g.box(-.03, .36, 1.95, .03, .84, 2.3, [.03, .03, .03], 2);
    g.box(-.075, .38, 2.42, .075, .47, 2.5, [1, 1, 1], 5);
    g.box(-.49, .96, 2.6, .49, .99, 2.62, [1, 1, 1], 5);
    // engine/gearbox lower
    g.taper(0, 1.6, 2.3, .2, .16, .4, .1, .2, .34, [.05, .05, .055], 3);
    S.car = R3D.meshVAO(g);
    // ground contact blob + skid quad template handled by decals
  }
  function buildWheel() { // unit wheel: radius 1, half width .5, axis x
    const g = new Geo();
    g.cylX(0, 0, 0, 1, .5, 28, [1, 1, 1], 4, 0);
    // rounded shoulders
    g.cylX(0, 0, 0, .97, .52, 28, [1, 1, 1], 4, .62);
    S.wheel = R3D.meshVAO(g);
  }

  /* ---------------- static world for a circuit ---------------- */
  function setTrack(tr) {
    if (!gl || built === tr.id) return; built = tr.id; T = tr; theme = THEMES[tr.theme] || THEMES.fuji;
    ['road', 'terrain', 'sea', 'stat', 'lights', 'boards', 'back'].forEach(k => { if (S[k]) { gl.deleteVertexArray(S[k].v); gl.deleteBuffer(S[k].b); S[k] = null; } });
    const th0 = T.th[0], sAz = th0 + theme.sunAz;
    theme.sunDir = [Math.cos(sAz) * Math.cos(theme.sunEl), Math.sin(theme.sunEl), Math.sin(sAz) * Math.cos(theme.sunEl)];
    const ymin = Math.min(...T.y), ymax = Math.max(...T.y); theme.sea = theme.sea ? ymin - 3 : -1e4;
    buildRoad(); buildTerrain(); buildStatics(); buildBoards(); buildBackdrop();
    S.skid = []; S.parts = []; S.camInit = false;
  }
  function frameAt(s) { const p = Sim.at(T, s); return { x: p.x, y: p.y, z: p.z, th: p.th, fx: Math.cos(p.th), fz: Math.sin(p.th), rx: -Math.sin(p.th), rz: Math.cos(p.th) }; }
  function buildRoad() {
    const E = Sim.EDGE, offs = [-42, -26, -E - 6, -E, -Sim.HALF, -2.5, 0, 2.5, Sim.HALF, E, E + 6, 26, 42], drop = d => { const a = Math.abs(d); return a <= E ? 0 : a <= E + 6 ? -0.05 * (a - E) / 6 : -0.05 - 0.85 * (a - E - 6) / (42 - E - 6); };
    const n = T.n, row = [], data = [];
    for (let i = 0; i <= n; i++) {
      const s = i * Sim.DS, f = frameAt(s), r = [];
      // slight crown + camber toward the inside of bends
      const k = T.k[i % n], bank = Math.max(-0.035, Math.min(0.035, k * 4));
      for (const d of offs) { const y = f.y + drop(d) - Math.abs(d) * 0.0 + (Math.abs(d) <= E ? -0.004 * d * d / 10 + bank * d * 0.25 : bank * Math.sign(d) * E * 0.25); r.push([f.x + f.rx * d, y, f.z + f.rz * d, d, s, T.gravel[i % n] || 0]); }
      row.push(r);
    }
    const nrm = (i, j) => { const a = row[Math.min(i + 1, n)][j], b = row[Math.max(i - 1, 0)][j], c = row[i][Math.min(j + 1, offs.length - 1)], d = row[i][Math.max(j - 1, 0)];
      const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - d[0], vy = c[1] - d[1], vz = c[2] - d[2]; let nx = uz * vy - uy * vz, ny = ux * vz - uz * vx, nz = uy * vx - ux * vy; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; } const l = Math.hypot(nx, ny, nz); return [nx / l, ny / l, nz / l]; };
    const N = row.map((r, i) => r.map((_, j) => nrm(i, j)));
    const push = (i, j) => { const p = row[i][j], q = N[i][j]; data.push(p[0], p[1], p[2], q[0], q[1], q[2], p[3], p[4], p[5]); };
    for (let i = 0; i < n; i++) for (let j = 0; j < offs.length - 1; j++) { push(i, j); push(i + 1, j); push(i + 1, j + 1); push(i, j); push(i + 1, j + 1); push(i, j + 1); }
    S.road = R3D.vao(new Float32Array(data), [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 1, 8]], 9);
  }
  // distance from a point to the circuit (coarse) + elevation of the nearest piece
  function nearTrack(x, z) { let best = 1e12, y = 0; for (let i = 0; i < T.n; i += 4) { const dx = T.x[i] - x, dz = T.z[i] - z, d = dx * dx + dz * dz; if (d < best) { best = d; y = T.y[i]; } } return [Math.sqrt(best), y]; }
  function buildTerrain() {
    const b = T.box, pad = 2200, st = 40, x0 = b.mnx - pad, z0 = b.mnz - pad, nx = Math.ceil((b.mxx - b.mnx + 2 * pad) / st), nz = Math.ceil((b.mxz - b.mnz + 2 * pad) / st);
    const Hh = [], F = [], amp = 55 * theme.hills, cz = (b.mnz + b.mxz) / 2;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + i * st, z = z0 + j * st, [rho, yn] = nearTrack(x, z);
      let h = yn - 1.45 + amp * Math.pow(Math.min(1, Math.max(0, (rho - 50) / 900)), 1.6) * (0.35 + fbm(x * 0.0015, z * 0.0015, 4) * 1.3) + (rho > 60 ? (fbm(x * 0.01, z * 0.01, 3) - 0.5) * 4 * Math.min(1, (rho - 60) / 100) : 0);
      if (theme.sea > -1e3) { const out = z - (b.mxz + 120); if (out > 0) h = Math.min(h, yn - 1.1 - out * 0.06); }
      Hh.push(h); F.push(rho);
    }
    const id = (i, j) => j * (nx + 1) + i, data = [];
    const pos = (i, j) => [x0 + i * st, Hh[id(i, j)], z0 + j * st];
    const nrm = (i, j) => { const hl = Hh[id(Math.max(i - 1, 0), j)], hr = Hh[id(Math.min(i + 1, nx), j)], hd = Hh[id(i, Math.max(j - 1, 0))], hu = Hh[id(i, Math.min(j + 1, nz))]; const a = [-(hr - hl), 2 * st, -(hu - hd)], l = Math.hypot(...a); return a.map(v => v / l); };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], v = q.map(([a, c]) => ({ p: pos(a, c), n: nrm(a, c), f: Math.min(1, Math.max(0, (F[id(a, c)] - 80) / 300)) }));
      [0, 2, 1, 0, 3, 2].forEach(k => { const e = v[k]; data.push(e.p[0], e.p[1], e.p[2], e.n[0], e.n[1], e.n[2], 1000, 0, e.f); });
    }
    S.terrain = R3D.vao(new Float32Array(data), [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 1, 8]], 9);
    S.hAt = (x, z) => { const fi = (x - x0) / st, fj = (z - z0) / st, i = Math.max(0, Math.min(nx - 1, Math.floor(fi))), j = Math.max(0, Math.min(nz - 1, Math.floor(fj))), u = fi - i, w = fj - j; return Hh[id(i, j)] * (1 - u) * (1 - w) + Hh[id(i + 1, j)] * u * (1 - w) + Hh[id(i, j + 1)] * (1 - u) * w + Hh[id(i + 1, j + 1)] * u * w; };
    S.rhoAt = (x, z) => { const fi = Math.round((x - x0) / st), fj = Math.round((z - z0) / st); return F[id(Math.max(0, Math.min(nx, fi)), Math.max(0, Math.min(nz, fj)))]; };
    if (theme.sea > -1e3) { const y = theme.sea, R = 14000, cx = (b.mnx + b.mxx) / 2; const v = [[cx - R, y, cz - R], [cx + R, y, cz - R], [cx + R, y, cz + R], [cx - R, y, cz + R]], d = []; [0, 2, 1, 0, 3, 2].forEach(k => d.push(...v[k], 0, 1, 0, 2000, 0, 0)); S.sea = R3D.vao(new Float32Array(d), [[0, 3, 0], [1, 3, 3], [2, 2, 6], [3, 1, 8]], 9); }
  }
  function cone(g, x, y, z, r, h, seg, col, m) { for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2; const p0 = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], tp = [x, y + h, z]; const sl = r / h; const n0 = [Math.cos(a0), sl, Math.sin(a0)], n1 = [Math.cos(a1), sl, Math.sin(a1)], nt = [Math.cos((a0 + a1) / 2), sl, Math.sin((a0 + a1) / 2)]; const nl = v => { const l = Math.hypot(...v); return v.map(c => c / l); }; g.v(p0, nl(n0), col, m); g.v(tp, nl(nt), col, m); g.v(p1, nl(n1), col, m); } }
  function orientBox(g, f, s0, s1, d0, d1, y0, y1, col, m) { // box aligned with the track frame f between along-track s0..s1 and lateral d0..d1
    const P = (s, d, y) => [f.x + f.fx * s + f.rx * d, f.y + y, f.z + f.fz * s + f.rz * d];
    g.hexa([P(s0, d0, y0), P(s1, d0, y0), P(s1, d1, y0), P(s0, d1, y0), P(s0, d0, y1), P(s1, d0, y1), P(s1, d1, y1), P(s0, d1, y1)], col, m);
  }
  function buildStatics() {
    const g = new Geo(), E = Sim.EDGE, rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    // trees
    const b = T.box, pine = theme.mount !== 'coast';
    let placed = 0;
    for (let tries = 0; tries < 9000 && placed < 1100; tries++) {
      const x = b.mnx - 600 + rnd() * (b.mxx - b.mnx + 1200), z = b.mnz - 600 + rnd() * (b.mxz - b.mnz + 1200), rho = S.rhoAt(x, z);
      if (rho < 34 || rho > 700) continue; if (rnd() > (rho < 80 ? 0.5 : 0.95)) continue;
      const y = S.hAt(x, z); if (theme.sea > -1e3 && y < theme.sea + 3) continue;
      const hgt = 8 + rnd() * 9, shade = 0.75 + rnd() * 0.4;
      g.box(x - .25, y - 0.5, z - .25, x + .25, y + hgt * 0.3, z + .25, [.25 * shade, .17 * shade, .1 * shade], 7);
      if (pine) { for (let k = 0; k < 3; k++) cone(g, x, y + hgt * (0.22 + k * 0.24), z, hgt * (0.32 - k * 0.07), hgt * 0.42, 7, [.06 * shade, .2 * shade, .08 * shade], 7); }
      else { g.sphere(x, y + hgt * 0.62, z, hgt * 0.3, 4, [.12 * shade, .3 * shade, .1 * shade], 7, 0.8); }
      placed++;
    }
    // grandstand on the left of the main straight, pit building on the right
    const f = frameAt(220);
    for (let k = 0; k < 7; k++) { const d0 = -(Sim.SIGN_D + 9 + k * 1.6), d1 = d0 - 1.6; orientBox(g, f, -190, 190, d1, d0, 0, 1.2 + k * 1.15, [.7, .7, .72], 10); }
    orientBox(g, f, -190, 190, -(Sim.SIGN_D + 9 + 7 * 1.6) - 1.5, -(Sim.SIGN_D + 9 + 7 * 1.6), 0, 12, [.55, .56, .6], 6);
    orientBox(g, f, -195, 195, -(Sim.SIGN_D + 24), -(Sim.SIGN_D + 7.5), 12.4, 12.9, [.85, .86, .9], 6);
    for (let s = -190; s <= 190; s += 38) orientBox(g, f, s - .3, s + .3, -(Sim.SIGN_D + 8.2), -(Sim.SIGN_D + 7.6), 0, 12.4, [.4, .4, .45], 3);
    const fp = frameAt(T.L - 160);
    orientBox(g, fp, -140, 140, Sim.SIGN_D + 10, Sim.SIGN_D + 24, 0, 9, [.86, .87, .9], 6);
    orientBox(g, fp, -138, 138, Sim.SIGN_D + 9.9, Sim.SIGN_D + 10, 3.2, 7.6, [.55, .8, 1], 13);
    orientBox(g, fp, -142, 142, Sim.SIGN_D + 9, Sim.SIGN_D + 25, 9, 9.6, [.2, .22, .26], 6);
    orientBox(g, fp, -140, 140, Sim.SIGN_D + 2, Sim.SIGN_D + 10, -0.02, 0.02, [.32, .32, .34], 7); // pit lane apron
    // start gantry over the line
    const fg = frameAt(1.2);
    for (const sd of [-1, 1]) orientBox(g, fg, -.25, .25, sd * (E + .8), sd * (E + 1.4), 0, 7.2, [.15, .15, .17], 3);
    orientBox(g, fg, -.35, .35, -(E + 1.4), E + 1.4, 6.3, 7.2, [.12, .12, .14], 3);
    const lg = new Geo();
    for (let k = 0; k < 5; k++) { const d = (k - 2) * 1.5; orientBox(g, fg, -.42, -.36, d - .5, d + .5, 5.2, 6.3, [.05, .05, .05], 6); for (let r = 0; r < 2; r++) { const P = (s, dd, y) => [fg.x + fg.fx * s + fg.rx * dd, fg.y + y, fg.z + fg.fz * s + fg.rz * dd]; const c = [fg.x + fg.fx * -0.43 + fg.rx * d, fg.y + 5.95 - r * 0.5, fg.z + fg.fz * -0.43 + fg.rz * d]; lg.sphere(c[0], c[1], c[2], .17, 6, [k, 0, 0], 8); } }
    S.lights = R3D.meshVAO(lg);
    // bridge with banner across the straight
    const fb = frameAt(760); for (const sd of [-1, 1]) orientBox(g, fb, -1, 1, sd * (E + 3), sd * (E + 5), 0, 8.5, [.62, .62, .66], 6);
    orientBox(g, fb, -1.3, 1.3, -(E + 6), E + 6, 6.6, 8.6, [.7, .7, .74], 6);
    S.bridge = fb;
    // tyre walls in front of the billboards (stacked tyre look) + posts/frames for billboards
    for (const sg of T.signs) {
      const fr = frameAt(sg.s), side = sg.side, a = boardAxes(fr, side), c = [fr.x + fr.rx * side * Sim.SIGN_D, fr.y, fr.z + fr.rz * side * Sim.SIGN_D];
      for (const u of [-3.1, 3.1]) { const px = c[0] + a.ux * u, pz = c[2] + a.uz * u; g.box(px - .09, c[1], pz - .09, px + .09, c[1] + 3.3, pz + .09, [.55, .56, .6], 3); }
      const B = (u, y, w) => [c[0] + a.ux * u - a.nx * w, c[1] + y, c[2] + a.uz * u - a.nz * w];
      g.hexa([B(-3.7, .7, .02), B(3.7, .7, .02), B(3.7, .7, .22), B(-3.7, .7, .22), B(-3.7, 3.4, .02), B(3.7, 3.4, .02), B(3.7, 3.4, .22), B(-3.7, 3.4, .22)], [.16, .16, .18], 6);
      // tyre barrier
      for (let u = -3.6; u <= 3.6; u += 0.72) { const tx = c[0] + a.ux * u + a.nx * 1.2, tz = c[2] + a.uz * u + a.nz * 1.2; for (let l = 0; l < 3; l++) { const tg = l === 1 ? [.8, .8, .8] : [.04, .04, .045]; g.sphere(tx, c[1] + 0.18 + l * 0.32, tz, .34, 4, tg, 6, 0.48); } }
    }
    S.stat = R3D.meshVAO(g);
  }
  function boardAxes(fr, side) { // board faces oncoming traffic, angled 45 deg toward the road
    const ang = 0.78; let nx = -fr.fx * Math.cos(ang) - fr.rx * side * Math.sin(ang), nz = -fr.fz * Math.cos(ang) - fr.rz * side * Math.sin(ang);
    return { nx, nz, ux: -nz * side, uz: nx * side };
  }
  function adAtlas() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 1024; const x = c.getContext('2d');
    ADS.forEach(([name, bg, fg], i) => {
      const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 256;
      const gr = x.createLinearGradient(0, oy, 0, oy + 256); gr.addColorStop(0, bg); gr.addColorStop(1, shadeC(bg, -0.25)); x.fillStyle = gr; x.fillRect(ox, oy, 512, 256);
      x.fillStyle = fg; x.globalAlpha = 0.18; for (let k = 0; k < 6; k++) x.fillRect(ox + k * 96 - 40, oy, 30, 256); x.globalAlpha = 1;
      x.font = 'bold 76px "Arial Black", "Helvetica Neue", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      const words = name.split(' '); x.lineWidth = 8; x.strokeStyle = shadeC(bg, -0.5);
      const fit = (w) => { let s = 76; x.font = `900 ${s}px Arial Black, Arial, sans-serif`; while (x.measureText(w).width > 470 && s > 30) { s -= 2; x.font = `900 ${s}px Arial Black, Arial, sans-serif`; } };
      if (words.length > 1) { fit(words[0]); x.strokeText(words[0], ox + 256, oy + 92); x.fillText(words[0], ox + 256, oy + 92); fit(words.slice(1).join(' ')); x.strokeText(words.slice(1).join(' '), ox + 256, oy + 176); x.fillText(words.slice(1).join(' '), ox + 256, oy + 176); }
      else { fit(name); x.fillText(name, ox + 256, oy + 128); }
      x.strokeStyle = '#ffffff'; x.globalAlpha = 0.5; x.lineWidth = 6; x.strokeRect(ox + 6, oy + 6, 500, 244); x.globalAlpha = 1;
    });
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (S.aniso) gl.texParameterf(gl.TEXTURE_2D, S.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(S.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  function shadeC(h, k) { const c = hex(h); return 'rgb(' + c.map(v => Math.round(Math.max(0, Math.min(1, v + k)) * 255)).join(',') + ')'; }
  function buildBoards() {
    if (!S.atlas) S.atlas = adAtlas();
    const d = [], quad = (p, n, uv) => { [0, 1, 2, 0, 2, 3].forEach(k => d.push(...p[k], ...n, ...uv[k])); };
    for (const sg of T.signs) {
      const fr = frameAt(sg.s), side = sg.side, a = boardAxes(fr, side), c = [fr.x + fr.rx * side * Sim.SIGN_D, fr.y, fr.z + fr.rz * side * Sim.SIGN_D];
      const k = sg.kind, u0 = (k % 2) * .5, v0 = Math.floor(k / 2) * .25, B = (u, y) => [c[0] + a.ux * u + a.nx * .01, c[1] + y, c[2] + a.uz * u + a.nz * .01];
      const ua = side > 0 ? u0 + .496 : u0 + .004, ub = side > 0 ? u0 + .004 : u0 + .496;
      quad([B(-3.6, .78), B(3.6, .78), B(3.6, 3.32), B(-3.6, 3.32)], [a.nx, 0, a.nz], [[ua, v0 + .246], [ub, v0 + .246], [ub, v0 + .004], [ua, v0 + .004]]);
    }
    // bridge banners both faces
    const fb = S.bridge, E = Sim.EDGE;
    for (const sd of [-1, 1]) { const P = (s, dd, y) => [fb.x + fb.fx * s + fb.rx * dd, fb.y + y, fb.z + fb.fz * s + fb.rz * dd]; const s = sd * 1.32, u0 = 0, v0 = .25; const uv = [[u0 + .004, v0 + .246], [u0 + .496, v0 + .246], [u0 + .496, v0 + .004], [u0 + .004, v0 + .004]]; const L = sd < 0 ? [P(s, -E - 5, 6.7), P(s, E + 5, 6.7), P(s, E + 5, 8.5), P(s, -E - 5, 8.5)] : [P(s, E + 5, 6.7), P(s, -E - 5, 6.7), P(s, -E - 5, 8.5), P(s, E + 5, 8.5)]; quad(L, [fb.fx * sd, 0, fb.fz * sd], uv); }
    S.boards = R3D.vao(new Float32Array(d), [[0, 3, 0], [1, 3, 3], [2, 2, 6]], 8);
  }
  function buildBackdrop() {
    const g = new Geo(), b = T.box, cx = (b.mnx + b.mxx) / 2, cz = (b.mnz + b.mxz) / 2, th0 = T.th[0];
    const ridge = (R0, R1, hmin, hmax, segs, snowFlag, forest, arcFrom, arcTo, seed) => {
      for (let i = 0; i < segs; i++) {
        const a0 = arcFrom + (arcTo - arcFrom) * i / segs, a1 = arcFrom + (arcTo - arcFrom) * (i + 1) / segs;
        const hf = a => { const n = fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + seed, 5); return hmin + (hmax - hmin) * Math.pow(n, 1.4) * 1.4; };
        const h0 = hf(a0), h1 = hf(a1), Rm = (R0 + R1) / 2;
        const pt = (a, r, y) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
        const fr0 = pt(a0, R0, -60), fr1 = pt(a1, R0, -60), cr0 = pt(a0, Rm, h0), cr1 = pt(a1, Rm, h1), bk0 = pt(a0, R1, -60), bk1 = pt(a1, R1, -60);
        const hm = Math.max(h0, h1, 1), col0 = [0, 0, forest], colc = [h0 / hmax, 0, forest], colc1 = [h1 / hmax, 0, forest];
        const ctr = [cx, -1e4, cz];
        g.tri(fr0, cr0, cr1, [0, 0, forest], 9, [cx, -60, cz]); g.tri(fr0, cr1, fr1, [0, 0, forest], 9, [cx, -60, cz]);
        // fix colours for height on the crest vertices
        const n = g.a.length; // rewrite vC.x per vertex from y
        for (let k = n - 60; k < n; k += 10) { g.a[k + 6] = Math.max(0, g.a[k + 1]) / hmax * (snowFlag ? 1 : 0.35); }
      }
    };
    if (theme.mount === 'fuji') {
      // Mt. Fuji: concave volcanic cone with a flat crater top, far beyond the main straight
      const az = th0 - 0.22, D = 16500, fx = cx + Math.cos(az) * D, fz = cz + Math.sin(az) * D, Hm = 3600, R = 11000, rings = 22, segs = 96;
      const pr = u => R * (0.055 + 0.945 * Math.pow(1 - u, 2.1));
      const ptm = (u, a) => { const n = 1 + (fbm(Math.cos(a) * 4, Math.sin(a) * 4 + u * 3, 4) - 0.5) * 0.12 * (1 - u * 0.5); return [fx + Math.cos(a) * pr(u) * n, -80 + u * Hm * (u > 0.97 ? 0.995 : 1), fz + Math.sin(a) * pr(u) * n]; };
      for (let r = 0; r < rings; r++) for (let i = 0; i < segs; i++) {
        const u0 = r / rings, u1 = (r + 1) / rings, a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
        const A = ptm(u0, a0), B = ptm(u0, a1), C = ptm(u1, a1), Dd = ptm(u1, a0);
        const ctr = [fx, -2000, fz]; const st = g.a.length;
        g.quad(A, B, C, Dd, [0, 0, 0], 9, ctr);
        for (let k = st; k < g.a.length; k += 10) { g.a[k + 6] = (g.a[k + 1] + 80) / Hm; g.a[k + 8] = 0.6; }
      }
      // smooth the cone normals radially (it is big and soft)
      for (let k = 0; k < g.a.length; k += 10) { const dx = g.a[k] - fx, dz = g.a[k + 2] - fz, l = Math.hypot(dx, dz) || 1, u = (g.a[k + 1] + 80) / Hm, slope = 0.9 - u * 0.5; const nx = dx / l, nz = dz / l; const ll = Math.hypot(nx, slope, nz); g.a[k + 3] = nx / ll * 0.7 + g.a[k + 3] * 0.3; g.a[k + 4] = slope / ll * 0.7 + g.a[k + 4] * 0.3; g.a[k + 5] = nz / ll * 0.7 + g.a[k + 5] * 0.3; }
      ridge(5200, 8200, 60, 520, 160, 0, 1, 0, Math.PI * 2, 2.1);
    } else if (theme.mount === 'alps') {
      ridge(4200, 9000, 400, 2600, 200, 1, 0, 0, Math.PI * 2, 5.3);
      ridge(3000, 5200, 80, 600, 120, 0, 1, 0, Math.PI * 2, 9.1);
    } else {
      ridge(4200, 7600, 80, 700, 120, 0, 1, Math.PI * 1.05, Math.PI * 1.95, 3.7);
    }
    S.back = R3D.meshVAO(g);
  }

  /* ---------------- per-frame dynamic state ---------------- */
  const cam = { x: 0, y: 0, z: 0, h: 0, fov: 1, shake: 0, mode: 'chase', tvT: 0, tv: null };
  function addPart(p) { if (!S.parts) S.parts = []; if (S.parts.length < 2400 * Q.parts) S.parts.push(p); }
  function event(e, G) {
    if (!gl || !T) return;
    if (e.t === 'crash') {
      const n = Math.round(160 * Q.parts);
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 4 + Math.random() * 18, up = Math.random() * 12; addPart({ x: e.x, y: e.y + 1, z: e.z, vx: Math.cos(a) * sp, vy: up, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.9, age: 0, size: 1.6 + Math.random() * 3, kind: 'fire', g: -4 }); }
      for (let i = 0; i < n * 0.6; i++) { const a = Math.random() * 6.283, sp = 1 + Math.random() * 5; addPart({ x: e.x, y: e.y + 1, z: e.z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 5, vz: Math.sin(a) * sp, life: 2 + Math.random() * 2.5, age: 0, size: 3 + Math.random() * 4, kind: 'smoke', g: 0.6, dark: 1 }); }
      for (let i = 0; i < 60 * Q.parts; i++) { const a = Math.random() * 6.283, sp = 8 + Math.random() * 20; addPart({ x: e.x, y: e.y + .8, z: e.z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 12, vz: Math.sin(a) * sp, life: 1 + Math.random(), age: 0, size: 0.25, kind: 'spark', g: -18 }); }
      for (let i = 0; i < 40 * Q.parts; i++) { const a = Math.random() * 6.283, sp = 3 + Math.random() * 12; addPart({ x: e.x, y: e.y + .8, z: e.z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 9, vz: Math.sin(a) * sp, life: 2.2, age: 0, size: 0.45 + Math.random() * .4, kind: 'debris', g: -18, bounce: 1 }); }
      S.flash = 1; if (e.me) cam.shake = 1;
    }
  }
  function carPose(c, dt) {
    const p = Sim.world(T, c.dist, c.d), a = Sim.at(T, c.dist + 2), bb = Sim.at(T, c.dist - 2), slope = (a.y - bb.y) / 4;
    if (c._pd == null) { c._pd = c.d; c._pt = c.dist; }
    const ddt = dt > 0 ? (c.d - c._pd) / dt : 0; c._pd = c.d; c._dd = (c._dd || 0) + (ddt - (c._dd || 0)) * 0.2;
    const vv = Math.max(c.v, 4), slip = (c.skid || 0) * (c.steer || 0) * 0.16;
    const yaw = p.th + Math.atan2(c.ld != null ? c.ld : c._dd, vv) * 0.85 + slip;
    const cp = Math.cos(Math.atan(slope)), sp = Math.sin(Math.atan(slope));
    let f = [Math.cos(yaw) * cp, sp, Math.sin(yaw) * cp]; const r0 = [-Math.sin(yaw), 0, Math.cos(yaw)];
    let up = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
    // body roll / pitch from lateral + longitudinal load
    const latAcc = c.v * c.v * (p.k || 0) - (c.steer || 0) * 6, acc = c._pv != null && dt > 0 ? (c.v - c._pv) / dt : 0; c._pv = c.v; c._acc = (c._acc || 0) + (acc - (c._acc || 0)) * 0.15;
    const roll = Math.max(-0.05, Math.min(0.05, latAcc * 0.0018)), pitch = Math.max(-0.035, Math.min(0.035, -c._acc * 0.0022));
    const t = performance.now() / 1000, bump = (c.bob || 0) * (Math.sin(t * 37 + c.dist) * 0.018 + Math.sin(t * 23) * 0.012) + Math.sin(c.dist * 0.9) * 0.003 * Math.min(1, c.v / 30);
    return { p, f, r: r0, up, roll, pitch, bump, yaw };
  }
  function mat4From(o, ox, oy, oz, r, up, back) { return M.basis(o[0] + r[0] * ox + up[0] * oy + back[0] * oz, o[1] + r[1] * ox + up[1] * oy + back[1] * oz, o[2] + r[2] * ox + up[2] * oy + back[2] * oz, r[0], r[1], r[2], up[0], up[1], up[2], back[0], back[1], back[2]); }
  const rotX = a => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
  const rotY = a => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
  const rotZ = a => { const m = M.id(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
  const scl = (x, y, z) => { const m = M.id(); m[0] = x; m[5] = y; m[10] = z; return m; };
  const trn = (x, y, z) => { const m = M.id(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const WHEELS = [[-.8, .33, -1.67, .36, true], [.8, .33, -1.67, .36, true], [-.78, .355, 1.76, .43, false], [.78, .355, 1.76, .43, false]];
  function carDraws(c, dt) {
    const q = carPose(c, dt), o = [q.p.x, q.p.y, q.p.z], back = [-q.f[0], -q.f[1], -q.f[2]];
    const base = mat4From(o, 0, 0, 0, q.r, q.up, back);
    const body = M.mul(M.mul(base, trn(0, q.bump + 0.01, 0)), M.mul(rotZ(q.roll), rotX(q.pitch)));
    const wheels = WHEELS.map(([x, y, z, w, front]) => M.mul(base, M.mul(trn(x, y, z), M.mul(front ? rotY(-(c.steer || 0) * 0.3) : M.id(), M.mul(rotX(-(c.spin || 0)), scl(w, y, y))))));
    return { body, wheels, q, o };
  }
  function updateParts(G, dt) {
    const ps = S.parts || (S.parts = []);
    const cars = [G.car].concat(G.cpu).concat(G.remote ? [G.remote] : []);
    for (const c of cars) {
      if (c.crash > 0) { if (Math.random() < 0.5 * Q.parts) { const p = Sim.world(T, c.dist, c.d); addPart({ x: p.x + (Math.random() - .5) * 2, y: p.y + .5, z: p.z + (Math.random() - .5) * 2, vx: 0, vy: 2 + Math.random() * 2, vz: 0, life: 2.5, age: 0, size: 3 + Math.random() * 2, kind: 'smoke', g: 0.5, dark: 1 }); if (Math.random() < 0.5) addPart({ x: p.x, y: p.y + .6, z: p.z, vx: (Math.random() - .5) * 2, vy: 3 + Math.random() * 3, vz: (Math.random() - .5) * 2, life: .5, age: 0, size: 1.4, kind: 'fire', g: 1 }); } continue; }
      const p = Sim.world(T, c.dist, c.d), r = [-Math.sin(p.th), Math.cos(p.th)], f = [Math.cos(p.th), Math.sin(p.th)];
      const off = c.surf === 'grass' || c.surf === 'gravel';
      if ((c.skid > 0.2 || (off && c.v > 8)) && Math.random() < (off ? 0.7 : 1) * Q.parts) {
        for (const sx of [-0.8, 0.8]) {
          const x = p.x + r[0] * sx - f[0] * 1.8, z = p.z + r[1] * sx - f[1] * 1.8;
          addPart({ x, y: p.y + .3, z, vx: f[0] * c.v * 0.25 + (Math.random() - .5) * 2, vy: 0.6 + Math.random(), vz: f[1] * c.v * 0.25 + (Math.random() - .5) * 2, life: 1.4 + Math.random(), age: 0, size: 1.2 + Math.random(), kind: off ? (c.surf === 'gravel' ? 'dust' : 'dirt') : 'smoke', g: 0.3, grow: 2.2 });
        }
        if (!off && c.skid > 0.2 && c === G.car) { // skid marks
          for (const sx of [-0.78, 0.78]) { const k = 'l' + sx; const pt = [p.x + r[0] * sx - f[0] * 1.76, p.y + 0.02, p.z + r[1] * sx - f[1] * 1.76]; const last = c['_sk' + k]; if (last && Math.hypot(pt[0] - last[0], pt[2] - last[2]) < 4) { S.skid.push([last, pt, r, Math.min(1, c.skid)]); if (S.skid.length > 700) S.skid.shift(); } c['_sk' + k] = pt; }
        }
      } else { c['_skl-0.78'] = c['_skl0.78'] = null; }
      if (c.surf === 'kerb' && c.v > 30 && Math.random() < 0.15 * Q.parts) addPart({ x: p.x, y: p.y + .1, z: p.z, vx: 0, vy: .5, vz: 0, life: .8, age: 0, size: 1, kind: 'smoke', g: .2, grow: 1 });
      if (c.v > 70 && c === G.car && Math.random() < 0.25 * Q.parts) addPart({ x: p.x - f[0] * 2.4 + (Math.random() - .5) * .6, y: p.y + .05, z: p.z - f[1] * 2.4, vx: -f[0] * 3 + (Math.random() - .5) * 6, vy: Math.random() * 2, vz: -f[1] * 3 + (Math.random() - .5) * 6, life: .35, age: 0, size: .18, kind: 'spark', g: -10 });
    }
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.age += dt; if (p.age > p.life) { ps.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; const drag = p.kind === 'smoke' || p.kind === 'dust' || p.kind === 'dirt' ? 1.6 : 0.3; p.vx *= Math.exp(-drag * dt); p.vz *= Math.exp(-drag * dt);
      if (p.bounce && S.hAt) { const gy = groundY(p); if (p.y < gy) { p.y = gy; p.vy *= -0.35; p.vx *= .6; p.vz *= .6; } }
    }
  }
  function groundY(p) { return (S.lastCarY || 0) + 0.05; }

  /* ---------------- drawing ---------------- */
  function setCommon(pr, VP, camP, lvp, shadowOn) {
    gl.useProgram(pr.p); const u = pr.u, th = theme;
    const set3 = (n, v) => u[n] && gl.uniform3fv(u[n], v), set1 = (n, v) => u[n] && gl.uniform1f(u[n], v);
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, VP);
    set3('uSun', th.sunDir); set3('uSunCol', th.sunC); set3('uAmbTop', th.ambTL); set3('uAmbBot', th.ambBL); set3('uFog', th.fogL); set3('uCam', camP); set3('uHorizon', th.horL); set3('uZenith', th.zenL); set3('uGround', th.groundL);
    set1('uFogD', S.fogD != null ? S.fogD : th.fogD); set1('uTime', (performance.now() - t0) / 1000); set1('uShadowOn', shadowOn ? 1 : 0); set1('uShadowTaps', Q.taps); set1('uShadowTex', Q.shadow || 1); set1('uFlash', (S.flash || 0) * 0.6);
    if (u.uLVP) gl.uniformMatrix4fv(u.uLVP, false, lvp || M.id());
    if (u.uShadow) gl.uniform1i(u.uShadow, 1);
  }
  function prepTheme() {
    const th = theme; if (th._p) return; th._p = 1;
    th.sunC = th.sun.map(v => v * th.sunI); th.fogL = lin(hex(th.fog)); th.horL = lin(hex(th.hor)); th.zenL = lin(hex(th.zen)); th.groundL = lin(hex(th.ground));
    th.ambTL = th.ambT.map(v => v * 1.0); th.ambBL = th.ambB;
  }
  function updateCam(G, dt, view) {
    const c = view.follow || G.car, q = Sim.world(T, c.dist, c.d), a2 = Sim.at(T, c.dist + 14);
    let dA = Math.atan2(a2.z - q.z, a2.x - q.x) - q.th; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
    const targetH = q.th + dA * 0.25 + Math.atan2(c.ld || 0, Math.max(c.v, 6)) * 0.4;
    if (!S.camInit) { cam.h = targetH; cam.y = q.y; S.camInit = true; }
    let dh = targetH - cam.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
    cam.h += dh * Math.min(1, dt * 6); cam.y += (q.y - cam.y) * Math.min(1, dt * 5);
    const spd = Math.min(1, c.v / 84), fwd = [Math.cos(cam.h), Math.sin(cam.h)];
    let back = 6.6 + spd * 0.9, ht = 1.95 - spd * 0.15;
    if (view.mode === 'tv') {
      if (!cam.tv || cam.tvT <= 0) { const s = c.dist + 70 + Math.random() * 40, side = Math.random() < .5 ? -1 : 1, w = Sim.world(T, s, side * (Sim.EDGE + 5)); cam.tv = [w.x, w.y + 2.2 + Math.random() * 3, w.z]; cam.tvT = 4.5; }
      cam.tvT -= dt; const eye = cam.tv; return { eye, look: [q.x, q.y + 0.6, q.z], fov: 0.55 + 0.2 * Math.min(1, Math.hypot(eye[0] - q.x, eye[2] - q.z) / 80) * 0 };
    }
    const eye = [q.x - fwd[0] * back, cam.y + ht, q.z - fwd[1] * back], look = [q.x + fwd[0] * 9, cam.y + 0.95, q.z + fwd[1] * 9];
    if (cam.shake > 0) { cam.shake = Math.max(0, cam.shake - dt * 1.5); const k = cam.shake * 0.35; eye[0] += (Math.random() - .5) * k; eye[1] += (Math.random() - .5) * k; eye[2] += (Math.random() - .5) * k; }
    if (c.surf === 'kerb' || c.surf === 'grass' || c.surf === 'gravel') { const k = (c.surf === 'kerb' ? 0.02 : 0.05) * Math.min(1, c.v / 30); eye[1] += (Math.random() - .5) * k; }
    return { eye, look, fov: (56 + 12 * spd * spd) * Math.PI / 180 };
  }
  function draw(G, view) {
    if (!gl || !T) return;
    if (S.lost) return;
    prepTheme(); targets();
    const dt = Math.min(0.05, view.dt || 1 / 60);
    S.flash = Math.max(0, (S.flash || 0) - dt * 2.5);
    updateParts(G, dt);
    const cm = updateCam(G, dt, view), asp = W / H;
    let fovY = cm.fov; const minH = 50 * Math.PI / 180; if (2 * Math.atan(Math.tan(fovY / 2) * asp) < minH) fovY = 2 * Math.atan(Math.tan(minH / 2) / asp);
    const V = M.look(cm.eye, cm.look, [0, 1, 0]), Pn = M.persp(fovY, asp, 0.3, 7000), VP = M.mul(Pn, V), camP = cm.eye;
    S.lastCarY = Sim.world(T, G.car.dist, G.car.d).y;
    // ---- shadow pass
    const cars = [G.car].concat(G.cpu).concat(G.remote ? [G.remote] : []).filter(c => c.crash <= 0 || c.crash > 2.3);
    const near = cars.filter(c => { const w = Sim.world(T, c.dist, c.d); return Math.hypot(w.x - camP[0], w.z - camP[2]) < 900; });
    const draws = near.map(c => ({ c, d: carDraws(c, dt) }));
    let LVP = null; const shadowOn = !!Q.shadow;
    if (shadowOn) {
      const ctr = Sim.world(T, G.car.dist + 18, G.car.d), sd = theme.sunDir, ext = 42;
      const Lv = M.look([ctr.x + sd[0] * 400, ctr.y + sd[1] * 400, ctr.z + sd[2] * 400], [ctr.x, ctr.y, ctr.z], [0, 1, 0]);
      // texel snapping kills shimmer
      const cc = M.xf(Lv, ctr.x, ctr.y, ctr.z), tex = 2 * ext / Q.shadow; const sx = Math.round(cc[0] / tex) * tex - cc[0], sy = Math.round(cc[1] / tex) * tex - cc[1];
      LVP = M.mul(M.ortho(-ext + sx, ext + sx, -ext + sy, ext + sy, 200, 700), Lv);
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.shadowF); gl.viewport(0, 0, Q.shadow, Q.shadow); gl.clear(gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      gl.useProgram(P.depth.p);
      const dm = m => { gl.uniformMatrix4fv(P.depth.u.uLVPM, false, M.mul(LVP, m)); };
      dm(M.id()); gl.bindVertexArray(S.stat.v); gl.drawArrays(gl.TRIANGLES, 0, S.stat.n); gl.bindVertexArray(S.boards.v); gl.drawArrays(gl.TRIANGLES, 0, S.boards.n);
      for (const { d } of draws) { dm(d.body); gl.bindVertexArray(S.car.v); gl.drawArrays(gl.TRIANGLES, 0, S.car.n); gl.bindVertexArray(S.wheel.v); for (const w of d.wheels) { dm(w); gl.drawArrays(gl.TRIANGLES, 0, S.wheel.n); } }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadowOn ? S.shadowTex : S.dummyDepth); gl.activeTexture(gl.TEXTURE0);
    // ---- scene pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.sceneF); gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    const VPfar = M.mul(M.persp(fovY, asp, 50, 80000), V);
    setCommon(P.sky, VPfar, camP); gl.uniformMatrix4fv(P.sky.u.uInvVP, false, M.inv(VPfar)); gl.uniform1f(P.sky.u.uCloud, theme.cloud); gl.uniform1f(P.sky.u.uCloudOct, Q.clouds);
    gl.bindVertexArray(S.tri.v); gl.drawArrays(gl.TRIANGLES, 0, 3);
    // backdrop mountains with their own depth range
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.enable(gl.CULL_FACE); gl.disable(gl.CULL_FACE);
    S.fogD = 1 / 26000; setCommon(P.mesh, VPfar, camP, null, false); meshU(M.id(), null, 0); gl.uniform1f(P.mesh.u.uSnow, theme.snow);
    gl.bindVertexArray(S.back.v); gl.drawArrays(gl.TRIANGLES, 0, S.back.n); S.fogD = null;
    gl.clear(gl.DEPTH_BUFFER_BIT);
    // terrain, sea, road
    setCommon(P.ground, VP, camP, LVP, shadowOn); gl.uniform1f(P.ground.u.uL, T.L); gl.uniform1f(P.ground.u.uHalf, Sim.HALF); gl.uniform1f(P.ground.u.uEdge, Sim.EDGE); gl.uniform1f(P.ground.u.uSea, theme.sea); gl.uniform1f(P.ground.u.uTheme, theme.mount === 'alps' ? 2 : 1);
    gl.bindVertexArray(S.terrain.v); gl.drawArrays(gl.TRIANGLES, 0, S.terrain.n);
    if (S.sea) { gl.bindVertexArray(S.sea.v); gl.drawArrays(gl.TRIANGLES, 0, S.sea.n); }
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2); gl.bindVertexArray(S.road.v); gl.drawArrays(gl.TRIANGLES, 0, S.road.n); gl.disable(gl.POLYGON_OFFSET_FILL);
    // decals: skid marks + contact shadows
    drawDecals(VP, camP, draws);
    // statics, billboards
    setCommon(P.mesh, VP, camP, LVP, shadowOn); meshU(M.id(), null, 0);
    gl.bindVertexArray(S.stat.v); gl.drawArrays(gl.TRIANGLES, 0, S.stat.n);
    gl.uniform1f(P.mesh.u.uLit, view.lights || 0); gl.bindVertexArray(S.lights.v); gl.drawArrays(gl.TRIANGLES, 0, S.lights.n);
    setCommon(P.tex, VP, camP, LVP, shadowOn); gl.uniform1i(P.tex.u.uTex, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.atlas); gl.bindVertexArray(S.boards.v); gl.drawArrays(gl.TRIANGLES, 0, S.boards.n);
    // cars
    setCommon(P.mesh, VP, camP, LVP, shadowOn);
    for (const { c, d } of draws) {
      const ghost = c.ghost > 0 && Math.floor(c.ghost * 10) % 2 === 0;
      if (ghost) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); }
      const al = ghost ? 0.35 : 1, lv = c.livery || ['#ccc', '#e00'];
      meshU(d.body, lv, c.brake > 0.1 ? 1 : 0, al, 0);
      gl.bindVertexArray(S.car.v); gl.drawArrays(gl.TRIANGLES, 0, S.car.n);
      const blur = Math.min(1, (c.v || 0) / 25); gl.uniform1f(P.mesh.u.uBlur, blur); gl.uniform3fv(P.mesh.u.uTire, c === G.car ? [1, .1, .1] : c.remote ? [1, .85, 0] : [.95, .95, .95]);
      gl.bindVertexArray(S.wheel.v); for (const w of d.wheels) { gl.uniformMatrix4fv(P.mesh.u.uModel, false, w); gl.drawArrays(gl.TRIANGLES, 0, S.wheel.n); }
      if (ghost) gl.disable(gl.BLEND);
    }
    // particles
    drawParts(VP, camP);
    // ---- resolve + post
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, S.sceneF); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, S.resolveF); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.bindVertexArray(S.tri.v);
    if (Q.bloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.b0F); gl.viewport(0, 0, S.bw, S.bh); gl.useProgram(P.bright.p); gl.uniform1i(P.bright.u.uSrc, 0); gl.uniform2f(P.bright.u.uPx, 1.5 / W, 1.5 / H); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex); gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(P.blur.p); gl.uniform1i(P.blur.u.uSrc, 0);
      for (let k = 0; k < 2; k++) { gl.bindFramebuffer(gl.FRAMEBUFFER, S.b1F); gl.uniform2f(P.blur.u.uDir, (1 + k) / S.bw, 0); gl.bindTexture(gl.TEXTURE_2D, S.b0); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindFramebuffer(gl.FRAMEBUFFER, S.b0F); gl.uniform2f(P.blur.u.uDir, 0, (1 + k) / S.bh); gl.bindTexture(gl.TEXTURE_2D, S.b1); gl.drawArrays(gl.TRIANGLES, 0, 3); }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    const F = P.final, u = F.u; gl.useProgram(F.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.sceneTex); gl.uniform1i(u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S.b0); gl.uniform1i(u.uBloom, 2); gl.activeTexture(gl.TEXTURE0);
    const spd = (view.follow || G.car).v * 3.6, blurAmt = Q.blurN ? Math.max(0, (spd - 170) / 140) * 0.06 : 0;
    gl.uniform1f(u.uBlurAmt, blurAmt); gl.uniform1f(u.uBlurN, Q.blurN || 1); gl.uniform1f(u.uBloomK, Q.bloom ? 0.85 : 0); gl.uniform1f(u.uVig, 0.32 + Math.max(0, (spd - 200) / 100) * 0.3); gl.uniform1f(u.uAspect, asp); gl.uniform1f(u.uHDR, isHDR ? 1 : 0);
    gl.uniform1f(u.uRed, view.red || 0);
    // vanishing point = projected point far down the road
    const ahead = Sim.world(T, (view.follow || G.car).dist + 60, (view.follow || G.car).d * 0.5), vp = M.xf(VP, ahead.x, ahead.y + 1, ahead.z); gl.uniform2f(u.uCtr, vp[3] > 0 ? vp[0] * .5 + .5 : .5, vp[3] > 0 ? Math.min(.8, Math.max(.3, vp[1] * .5 + .5)) : .55);
    const sd = theme.sunDir, sp = M.xf(VPfar, camP[0] + sd[0] * 10000, camP[1] + sd[1] * 10000, camP[2] + sd[2] * 10000);
    let vis = 0; if (sp[3] > 0) { const sx = sp[0] * .5 + .5, sy = sp[1] * .5 + .5; vis = Math.max(0, 1 - Math.max(Math.abs(sx - .5), Math.abs(sy - .5)) * 1.6) * (theme.sunEl < 0.2 ? 1.2 : 0.9); gl.uniform2f(u.uSunUV, sx, sy); }
    gl.uniform1f(u.uSunVis, vis); gl.uniform3fv(u.uSunC, theme.sun.map(v => v * 0.8));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    S.drawn = (S.drawn || 0) + 1;
  }
  function meshU(model, lv, brake, alpha, blur) {
    const u = P.mesh.u; gl.uniformMatrix4fv(u.uModel, false, model);
    const L = lv || ['#888888', '#888888'];
    gl.uniform3fv(u.uPaint, hex(L[0])); gl.uniform3fv(u.uAccent, hex(L[1])); gl.uniform1f(u.uBrake, brake || 0); gl.uniform1f(u.uAlpha, alpha == null ? 1 : alpha); gl.uniform1f(u.uBlur, blur || 0); gl.uniform1f(u.uNoFog, 0); gl.uniform1f(u.uSnow, theme.snow); gl.uniform1f(u.uLit, 0); gl.uniform3fv(u.uTire, [1, 1, 1]);
  }
  function drawDecals(VP, camP, draws) {
    const d = [];
    for (const [a, b, r, al] of S.skid) { const w = 0.17; const P0 = [a[0] - r[0] * w, a[1], a[2] - r[1] * w], P1 = [a[0] + r[0] * w, a[1], a[2] + r[1] * w], P2 = [b[0] + r[0] * w, b[1], b[2] + r[1] * w], P3 = [b[0] - r[0] * w, b[1], b[2] - r[1] * w]; const A = al * 0.5; [[P0, -1], [P1, 1], [P2, 1], [P0, -1], [P2, 1], [P3, -1]].forEach(([p, u]) => d.push(p[0], p[1], p[2], u * 0.6, 0, A)); }
    for (const { c, d: dd } of draws) { const q = dd.q, o = dd.o, f = q.f, r = q.r, L = 2.9, Wd = 1.25; const P = (x, z) => [o[0] + r[0] * x + f[0] * z, o[1] + 0.03, o[2] + r[2] * x + f[2] * z]; const v = [[P(-Wd, -L), -1, -1], [P(Wd, -L), 1, -1], [P(Wd, L), 1, 1], [P(-Wd, L), -1, 1]]; [0, 1, 2, 0, 2, 3].forEach(k => d.push(...v[k][0], v[k][1], v[k][2], c.ghost > 0 ? .3 : .75)); }
    if (!d.length) return;
    gl.useProgram(P.decal.p); gl.uniformMatrix4fv(P.decal.u.uVP, false, VP);
    gl.bindBuffer(gl.ARRAY_BUFFER, S.decBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -6);
    gl.bindVertexArray(S.decVAO); gl.drawArrays(gl.TRIANGLES, 0, d.length / 6);
    gl.disable(gl.POLYGON_OFFSET_FILL); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  function drawParts(VP, camP) {
    const ps = S.parts; if (!ps || !ps.length) return;
    const th = theme, sm = [], ad = [];
    for (const p of ps) {
      const u = p.age / p.life;
      if (p.kind === 'fire') { const c = u < .3 ? [6, 4.2, 1.6] : [4 * (1 - u), 1.6 * (1 - u), .3 * (1 - u)]; ad.push(p.x, p.y, p.z, p.size * (1 + u * 1.5), c[0], c[1], c[2], 1 - u); }
      else if (p.kind === 'spark') ad.push(p.x, p.y, p.z, p.size, 8, 4.5, 1.2, 1 - u);
      else if (p.kind === 'debris') sm.push(p.x, p.y, p.z, p.size, .02, .02, .02, 1 - u * u);
      else { const amb = (th.ambTL[0] + th.sunC[0] * .25), base = p.dark ? [.06, .055, .05] : p.kind === 'dust' ? [.5, .44, .33] : p.kind === 'dirt' ? [.22, .2, .12] : [.75, .75, .76]; const k = p.dark ? 1 : amb; sm.push(p.x, p.y, p.z, p.size * (1 + u * (p.grow || 2.5)), base[0] * k, base[1] * k, base[2] * k, (p.dark ? .8 : .45) * (1 - u) * Math.min(1, u * 8)); }
    }
    gl.useProgram(P.part.p); setCommon(P.part, VP, camP); gl.uniform1f(P.part.u.uScale, H / (2 * Math.tan(0.5)));
    gl.enable(gl.BLEND); gl.depthMask(false); gl.bindVertexArray(S.partVAO); gl.bindBuffer(gl.ARRAY_BUFFER, S.partBuf);
    if (sm.length) { gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(P.part.u.uAdd, 0); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sm), gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, sm.length / 8); }
    if (ad.length) { gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1f(P.part.u.uAdd, 1); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ad), gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, ad.length / 8); }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }
  function resize(w, h) { W = Math.max(1, w | 0); H = Math.max(1, h | 0); if (cv) { cv.width = W; cv.height = H; } }
  function setLevel(l) { l = Math.max(0, Math.min(LEVELS.length - 1, l)); Object.assign(Q, LEVELS[l]); Q.level = l; }
  return { init, setTrack, draw, event, resize, setLevel, Q, LEVELS, cam, THEMES, get ok() { return !!gl; }, get S() { return S; }, get hdr() { return isHDR; }, reset() { S.parts = []; S.skid = []; S.camInit = false; }, get size() { return [W, H]; } };
})();
