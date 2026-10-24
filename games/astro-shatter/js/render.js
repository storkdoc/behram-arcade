/* ASTRO SHATTER — render.js
   WebGL2 renderer (no libraries):
     - HDR scene (RGBA16F when the GPU allows it) with 4x MSAA, or FXAA once adaptive quality drops it
     - lit, tumbling 3D rocks: noise-displaced icospheres with craters + per-pixel procedural normal mapping
       (derivative bump mapping), key light from the system's star, nebula-tinted ambient and up to 12
       point lights from bolts, engines and explosions
     - a faceted metal fighter with canopy and glowing nozzles, plasma plume, shield bubble, hyperspace warp
     - deep-space backdrop: domain-warped nebula (generated once per size), three parallax star layers,
       a ringed gas giant drawn per frame
     - additive sprite FX (bolts, sparks, flares, shockwaves, dust) and a 5-level bloom
     - "Classic vector" mode: anti-aliased glowing white outlines from a capsule-SDF line shader
   The HUD is a separate 2D canvas drawn in whole device pixels, so text is never resampled or blurred.
   If WebGL2 is missing (or ?nogl), Render2D (render2d.js) takes over the same canvas. */
const Render = (() => {
  'use strict';
  const qs = new URLSearchParams(location.search);
  let cv = document.getElementById('scene');
  const hud = document.getElementById('hud'), hx = hud.getContext('2d');
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform));
  const MP_CAP = 5.0e6;
  const R = {
    W: 2, H: 2, cw: 1, ch: 1, dpr: 1, nat: 1, capped: false, pf: { x: 0, y: 0, w: 2, h: 2 }, s: 1, mode: 'gl', classic: localStorage.getItem('ast.classic') === '1',
    quality: qs.has('q') ? Math.max(0, Math.min(2, +qs.get('q'))) : 2, fps: 60, time: 0, hdr: false, msaa: 0, IS_MOBILE, safe: { l: 0, r: 0, t: 0, b: 0 }, glErr: '', drawn: 0, field: null,
  };
  let gl = null;
  if (!qs.has('nogl')) {
    try { gl = cv.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: qs.has('pdb'), powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  }
  if (!gl) R.mode = '2d';

  /* ======================= sizing ======================= */
  function readSafe() { const el = document.getElementById('safe'); if (!el) return; const cs = getComputedStyle(el); R.safe = { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0, t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; }
  /** size both canvases at native device pixels (mobile capped at ~5 MP). layoutFn(cw, ch, safe) -> area for the field (css px) */
  function resize(layoutFn) {
    readSafe();
    const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight); R.cw = cw; R.ch = ch;
    const nat = Math.max(1, window.devicePixelRatio || 1); R.nat = nat;
    let dpr = nat; R.capped = false;
    if (IS_MOBILE && cw * ch * dpr * dpr > MP_CAP) { dpr = Math.sqrt(MP_CAP / (cw * ch)); R.capped = true; }
    R.dpr = dpr; R.W = Math.round(cw * dpr); R.H = Math.round(ch * dpr);
    for (const c of [cv, hud]) { c.width = R.W; c.height = R.H; c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    R.area = layoutFn(cw, ch, R.safe);
    fitField();
    if (R.mode === 'gl') glResize(); else Render2D.resize(R);
  }
  /** place the field (fixed W x H units for this game) inside the layout area, centred, in device px */
  function fitField(field) {
    if (field) R.field = field;
    const a = R.area || { x: 0, y: 0, w: R.cw, h: R.ch }, f = R.field || { W: a.w, H: a.h };
    const s = Math.min(a.w / f.W, a.h / f.H) * R.dpr;
    const w = Math.round(f.W * s), h = Math.round(f.H * s);
    R.s = s; R.pf = { x: Math.round(a.x * R.dpr + (a.w * R.dpr - w) / 2), y: Math.round(a.y * R.dpr + (a.h * R.dpr - h) / 2), w, h };
    R.letterbox = Math.abs(w - a.w * R.dpr) > 4 || Math.abs(h - a.h * R.dpr) > 4;
  }

  /* ======================= GL helpers ======================= */
  let P = {}, VAO = {}, FB = {}, TX = {}, EXT = {}, qBuf, spriteBuf, lineBuf, starBuf, starN = 0, built = false;
  const H = `#version 300 es
precision highp float; precision highp int;
`;
  const NOISE = `
float hash3(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float hash2(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vn2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(mix(hash2(i),hash2(i+vec2(1,0)),f.x), mix(hash2(i+vec2(0,1)),hash2(i+vec2(1,1)),f.x), f.y); }
float fbm2(vec2 p, int o){ float s=0., a=.5; for(int i=0;i<8;i++){ if(i>=o) break; s+=a*vn2(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=.5; } return s; }
`;
  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s; }
  function program(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, H + vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, H + fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, inf.name); }
    return { p, u };
  }
  function meshVAO(m) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, m.data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 24);
    if (m.index) { const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW); }
    gl.bindVertexArray(null);
    return { vao, count: m.count, indexed: !!m.index };
  }
  function instVAO(floats, attrs) { // quad corners + per-instance attributes (vec4 each)
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, qBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    for (let i = 0; i < attrs; i++) { gl.enableVertexAttribArray(1 + i); gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, attrs * 16, i * 16); gl.vertexAttribDivisor(1 + i, 1); }
    gl.bindVertexArray(null); return { vao, buf: b, cap: floats };
  }

  /* ======================= shaders ======================= */
  const VS_MESH = `
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol;
uniform mat4 uP, uM; uniform mat3 uN;
out vec3 vW; out vec3 vN; out vec3 vO; out vec4 vC;
void main(){ vec4 w = uM*vec4(aPos,1.); vW = w.xyz; vN = normalize(uN*aNrm); vO = aPos; vC = aCol; gl_Position = uP*w; }`;
  const FS_MESH = NOISE + `
in vec3 vW; in vec3 vN; in vec3 vO; in vec4 vC;
uniform int uKind; uniform float uSeed, uBump, uK, uTime, uEmis, uFade, uHue; uniform int uOct;
uniform vec3 uSun, uSunC, uAmbT, uAmbB, uTint;
uniform vec4 uLP[12]; uniform vec4 uLC[12]; uniform int uNL;
out vec4 o;
float relief(vec3 p){ // rock surface detail: ridged fbm + pits
  float s = 0., a = .5; vec3 q = p*3.2 + uSeed;
  for(int i=0;i<5;i++){ if(i>=uOct) break; float n = vn3(q); s += a*(1.-abs(n*2.-1.)); q = q*2.07 + vec3(1.7,9.2,4.1); a *= .5; }
  float pit = smoothstep(.62,.80, vn3(p*7.5+uSeed*1.3));
  return s - pit*.35; }
vec3 env(vec3 r){ // fake reflection: nebula tints + the star's highlight band
  float up = r.y*-.5+.5; vec3 c = mix(vec3(.05,.03,.09), vec3(.18,.08,.24), up);
  c += vec3(.05,.16,.2)*smoothstep(.2,.9, r.x); c += uSunC*.9*pow(max(dot(r,uSun),0.),40.); return c; }
void main(){
  vec3 N = normalize(vN), V = vec3(0,0,1);
  if(gl_FrontFacing) N = -N; // the y-down field flips winding: back-facing here == facing the viewer
  vec3 alb = vC.rgb; float spec = .1, gloss = 16., metal = 0.;
  if(uKind==0){ // rock: normal-mapped by the relief height, via screen-space derivatives
    float h = relief(vO);
    vec3 dpx = dFdx(vW), dpy = dFdy(vW); float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
    vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
    N = normalize(abs(det)*N - grad*uBump);
    float m = vn3(vO*2.1+uSeed*.7);
    alb = mix(vec3(.20,.18,.165), vec3(.36,.31,.26), m);
    alb = mix(alb, alb*vec3(1.15,.92,.78), smoothstep(.55,.9, vn3(vO*4.7-uSeed)));   // iron-rich patches
    alb = mix(alb, alb*vec3(.85,.95,1.1), uHue);
    alb *= mix(.55, 1.12, clamp(h*1.3,0.,1.));                                        // dark crevices
    float glint = smoothstep(.93,.99, vn3(vO*38.+uSeed)); spec = .06 + glint*.9; gloss = mix(12., 90., glint);
  } else if(uKind==1){ spec = .9; gloss = 70.; metal = .6; }
  else if(uKind==2){ spec = 1.; gloss = 90.; metal = .75; }
  alb *= uTint;
  // key light (star), soft wrap
  float nl = dot(N, uSun); vec3 col = alb*uSunC*max(nl*.85+.15*max(nl+.3,0.), 0.);
  vec3 Hh = normalize(uSun+V); col += uSunC*spec*pow(max(dot(N,Hh),0.), gloss)*step(0., nl);
  // ambient: nebula hemisphere
  col += alb*mix(uAmbB, uAmbT, N.y*-.5+.5);
  // rim light from the nebula behind
  float fr = pow(1.-max(N.z,0.), 3.); col += mix(vec3(.25,.12,.4), vec3(.1,.35,.45), N.x*.5+.5)*fr*(uKind==0 ? .16 : .7);
  if(metal > 0.){ vec3 rf = reflect(-V, N); col = mix(col, col*.4 + env(rf)*(alb+.2), metal*.55); }
  // point lights (explosions, bolts, engines)
  for(int i=0;i<12;i++){ if(i>=uNL) break;
    vec3 d = uLP[i].xyz - vW; float dist = length(d); float att = max(0., 1.-dist/uLP[i].w); att *= att;
    if(att <= 0.) continue; vec3 L = d/dist; float ndl = max(dot(N,L),0.);
    col += (alb*ndl + spec*pow(max(dot(N, normalize(L+V)),0.), gloss)*.6)*uLC[i].rgb*uLC[i].a*att; }
  col += vC.rgb*vC.a*uEmis*2.2;                                                       // emissive parts
  o = vec4(col*uFade*uK, 1.);
}`;
  const VS_SPRITE = `
layout(location=0) in vec2 aQ; layout(location=1) in vec4 iA; layout(location=2) in vec4 iB; layout(location=3) in vec4 iC;
uniform mat4 uP;
out vec2 vUV; out vec4 vC; flat out int vT; out vec4 vB;
void main(){ float c=cos(iA.z), s=sin(iA.z); vec2 l = aQ*iB.xy; vec2 w = iA.xy + vec2(l.x*c-l.y*s, l.x*s+l.y*c);
  vUV = aQ; vC = iC; vT = int(iA.w+.5); vB = iB; gl_Position = uP*vec4(w, 0., 1.); }`;
  const FS_SPRITE = NOISE + `
in vec2 vUV; in vec4 vC; flat in int vT; in vec4 vB;
uniform float uTime, uK; uniform float uPx;
out vec4 o;
void main(){
  vec2 uv = vUV; float d = length(uv); float a = 0.; vec3 col = vC.rgb;
  if(vT==0){ a = exp(-d*d*4.5)*(1.-smoothstep(.8,1.,d)); }
  else if(vT==1){ float w = vB.z; a = exp(-pow((d-.82)/w,2.))*(1.-smoothstep(.95,1.,d)); }
  else if(vT==2){ vec2 q = uv*vB.xy; float r = vB.y; float hx = max(vB.x-r, 0.); float dd = length(vec2(max(abs(q.x)-hx,0.), q.y))/r;
    float core = 1.-smoothstep(.22,.42, dd); float halo = exp(-dd*dd*3.5)*(1.-smoothstep(.8,1.,dd));
    col = mix(col, vec3(max(max(col.r,col.g),col.b))*1.2, core*.85); a = halo*.55 + core; }
  else if(vT==3){ if(d>1.) discard; float ang = atan(uv.y,uv.x);
    float hex = .5+.5*sin(ang*9.+uTime*3.+d*14.)*sin(d*22.-uTime*5.); float fres = pow(d, 5.);
    a = (fres*.85 + .05 + hex*.12*fres)*(1.-smoothstep(.94,1.,d)); }
  else if(vT==4){ float u = 1.-(uv.x*.5+.5); float wdt = mix(.85,.05,pow(u,.8)); float flick = .75+.25*vn2(vec2(u*6.-uTime*30., vB.z));
    a = (1.-smoothstep(wdt*.35, wdt, abs(uv.y)))*pow(1.-u, 1.4)*flick;
    col = mix(vec3(2.8,2.9,3.2), mix(vec3(.5,1.6,3.4), vec3(1.4,.4,2.6), smoothstep(.35,1.,u)), smoothstep(0.,.35,u)); }
  else if(vT==5){ float ang = atan(uv.y,uv.x); float t = vB.z; float sw = max(sin(ang*7.+d*16.-t*14.),0.)*(1.-d);
    a = (exp(-pow((d-t)/.1,2.)) + .45*sw*t)*(1.-smoothstep(.85,1.,d)); }
  else if(vT==6){ float n = vn2(uv*2.2+vB.z) * .6 + vn2(uv*5.+vB.z*2.)*.4; a = exp(-d*d*2.6)*smoothstep(.15,.7,n)*(1.-smoothstep(.75,1.,d)); }
  else if(vT==7){ a = exp(-d*d*14.) + (exp(-abs(uv.y)*70.)*exp(-abs(uv.x)*2.6) + exp(-abs(uv.x)*70.)*exp(-abs(uv.y)*2.6))*.7; a *= 1.-smoothstep(.85,1.,d); }
  o = vec4(col*a*vC.a*uK, 0.);
}`;
  const VS_LINE = `
layout(location=0) in vec2 aQ; layout(location=1) in vec4 iA; layout(location=2) in vec4 iB; layout(location=3) in vec4 iC;
uniform mat4 uP; uniform float uPx;
out vec2 vW; flat out vec4 vSeg; flat out float vHW; out vec4 vC;
void main(){ vec2 a = iA.xy, b = iA.zw; vec2 d = b-a; float l = length(d); vec2 t = l > 1e-4 ? d/l : vec2(1,0); vec2 n = vec2(-t.y, t.x);
  float e = iB.x + uPx*1.5; vec2 w = mix(a, b, aQ.x*.5+.5) + t*aQ.x*e + n*aQ.y*e;
  vW = w; vSeg = iA; vHW = iB.x; vC = iC; gl_Position = uP*vec4(w,0.,1.); }`;
  const FS_LINE = `
in vec2 vW; flat in vec4 vSeg; flat in float vHW; in vec4 vC; uniform float uPx, uK; out vec4 o;
void main(){ vec2 a = vSeg.xy, b = vSeg.zw, pa = vW-a, ba = b-a; float h = clamp(dot(pa,ba)/max(dot(ba,ba),1e-6), 0., 1.); float d = length(pa-ba*h);
  float cov = clamp((vHW-d)/uPx+.5, 0., 1.); o = vec4(vC.rgb*vC.a*cov*uK, 0.); }`;
  const VS_QUAD = `layout(location=0) in vec2 aQ; out vec2 vUV; void main(){ vUV = aQ*.5+.5; gl_Position = vec4(aQ,0.,1.); }`;
  const FS_NEBULA = NOISE + `
in vec2 vUV; uniform vec2 uRes; uniform float uSeed; out vec4 o;
void main(){
  vec2 p = (gl_FragCoord.xy - uRes*.5)/min(uRes.x,uRes.y)*2.4 + uSeed;
  vec2 w = vec2(fbm2(p*.9+1.3,5), fbm2(p*.9-4.2,5));
  float n1 = fbm2(p*1.05 + w*1.8, 7), n2 = fbm2(p*2.1 - w*1.2 + 7., 6), n3 = fbm2(p*1.6 + 11., 6);
  vec3 c = vec3(.003,.004,.010);
  c += vec3(.30,.07,.42)*pow(n1,3.2)*1.5;
  c += vec3(.03,.22,.30)*pow(n2,3.6)*1.7;
  c += vec3(.55,.20,.07)*pow(n3,6.)*1.6;
  c *= .45 + .55*smoothstep(.28,.62, fbm2(p*3.4+20.,5));                                // dark dust lanes
  float band = exp(-pow(dot(p-uSeed, normalize(vec2(1.,-.55))), 2.)*2.2); c += vec3(.05,.045,.07)*band*(.6+.4*n2);
  // faint, dense background stars baked in (single crisp pixels)
  float s = hash2(floor(gl_FragCoord.xy)); c += vec3(.55,.6,.75)*step(.9986, s)*(.25+.75*hash2(floor(gl_FragCoord.xy)+7.));
  o = vec4(pow(c, vec3(1./2.2)), 1.);
}`;
  const FS_BG = `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uOff; uniform float uK, uDim; out vec4 o;
void main(){ vec2 uv = (vUV-.5)/1.035+.5+uOff; vec3 c = pow(texture(uTex, uv).rgb, vec3(2.2)); o = vec4(c*uK*uDim*.6, 1.); }`;
  const VS_STAR = `
layout(location=0) in vec4 aS; // x, y (0..1), size px, layer
layout(location=1) in vec4 aT; // r g b phase
uniform vec2 uOff[3]; uniform float uDpr, uTime;
out vec4 vC; out float vSz;
void main(){ int L = int(aS.w); vec2 p = fract(aS.xy + uOff[L]); float tw = .72 + .28*sin(uTime*(1.3+aT.a*2.) + aT.a*40.);
  vSz = aS.z*uDpr; gl_PointSize = max(1., vSz+1.); vC = vec4(aT.rgb*tw, 1.); gl_Position = vec4(p*2.-1., 0., 1.); }`;
  const FS_STAR = `in vec4 vC; in float vSz; uniform float uK; out vec4 o;
void main(){ float d = length(gl_PointCoord-.5)*(vSz+1.); float a = clamp(vSz*.5 - d + .5, 0., 1.); o = vec4(vC.rgb*a*uK, 0.); }`;
  const FS_PLANET = NOISE + `
in vec2 vUV; uniform vec2 uC; uniform float uRad, uTime, uK; uniform vec3 uL; out vec4 o;
void main(){
  vec2 p = (gl_FragCoord.xy - uC)/uRad; float r2 = dot(p,p), r = sqrt(r2), px = 1.5/uRad;
  float ca = cos(-.42), sa = sin(-.42); vec2 q = vec2(p.x*ca - p.y*sa, (p.x*sa + p.y*ca)/.26); float rr = length(q);
  vec3 L = normalize(vec3(uL.x, -uL.y, uL.z));
  // ring
  float ringA = smoothstep(1.32,1.36,rr)*(1.-smoothstep(2.05,2.12,rr));
  float stripes = .55 + .45*sin(rr*58.)*sin(rr*23.+1.) ; ringA *= mix(.25,.85, stripes)*(1.-smoothstep(1.72,1.76,rr)*.55*(1.-smoothstep(1.8,1.84,rr)));
  float ringLit = .35 + .65*clamp(dot(normalize(vec3(p, .3)), L)*.5+.6, 0., 1.);
  vec3 ringC = vec3(.62,.52,.42)*ringLit;
  bool front = q.y < 0.;
  vec3 col = vec3(0.); float alpha = 0.;
  // ring behind the planet
  if(!front){ col = ringC*ringA; alpha = ringA; }
  // planet body
  float disc = clamp((1.-r)/px+.5, 0., 1.);
  if(r < 1.+px){
    vec3 N = vec3(p, sqrt(max(0., 1.-r2)));
    float tilt = .42; vec3 Nt = vec3(N.x*cos(tilt)-N.y*sin(tilt), N.x*sin(tilt)+N.y*cos(tilt), N.z);
    float lat = asin(clamp(Nt.y,-1.,1.)), lon = atan(Nt.x, Nt.z) + uTime*.012;
    float b = fbm2(vec2(lat*7.5 + .9*fbm2(vec2(lon*1.6, lat*14.),4), lon*.25), 5);
    vec3 pc = mix(vec3(.62,.42,.26), vec3(.93,.80,.60), smoothstep(.3,.7,b));
    pc = mix(pc, vec3(.45,.24,.15), smoothstep(.62,.8, fbm2(vec2(lat*22., lon*2.),3))*.5);
    float storm = 1.-smoothstep(.0,.16, length(vec2((lon-1.1)*.5, lat+.35)*vec2(1.,2.2))); pc = mix(pc, vec3(.85,.4,.25), storm*.8);
    float ndl = dot(N, L); float day = smoothstep(-.12, .55, ndl);
    vec3 pl = pc*day*1.1 + pc*vec3(.05,.03,.08);
    pl += vec3(.95,.7,.45)*pow(1.-N.z, 2.5)*day*.55;                                   // atmosphere limb
    col = mix(col, pl, disc); alpha = max(alpha, disc);
  }
  if(front){ col = mix(col, ringC, ringA); alpha = max(alpha, ringA); }
  // atmosphere halo outside the disc
  float halo = exp(-max(r-1.,0.)*9.)*(1.-disc)*clamp(dot(normalize(vec3(p,.2)), L)+.4, 0., 1.);
  col += vec3(.9,.55,.35)*halo*.35;
  o = vec4(col*uK, alpha);
}`;
  const FS_BRIGHT = `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTx; uniform float uThr; out vec4 o;
vec3 s(vec2 d){ return texture(uTex, vUV + d*uTx).rgb; }
void main(){ vec3 c = s(vec2(0))*.25 + (s(vec2(-1,-1))+s(vec2(1,-1))+s(vec2(-1,1))+s(vec2(1,1)))*.1875;
  float br = max(c.r, max(c.g, c.b)); float k = max(br-uThr, 0.); k = k*k/(k+.6)/max(br,1e-4); o = vec4(c*min(k, 4.), 1.); }`;
  const FS_DOWN = `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTx; out vec4 o;
vec3 s(vec2 d){ return texture(uTex, vUV + d*uTx).rgb; }
void main(){ vec3 c = s(vec2(0))*.125;
  c += (s(vec2(-1,-1))+s(vec2(1,-1))+s(vec2(-1,1))+s(vec2(1,1)))*.125;
  c += (s(vec2(-2,0))+s(vec2(2,0))+s(vec2(0,-2))+s(vec2(0,2)))*.0625;
  c += (s(vec2(-2,-2))+s(vec2(2,-2))+s(vec2(-2,2))+s(vec2(2,2)))*.03125; o = vec4(c, 1.); }`;
  const FS_UP = `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTx; uniform float uW; out vec4 o;
vec3 s(vec2 d){ return texture(uTex, vUV + d*uTx).rgb; }
void main(){ vec3 c = s(vec2(0))*4.; c += (s(vec2(-1,0))+s(vec2(1,0))+s(vec2(0,-1))+s(vec2(0,1)))*2.; c += s(vec2(-1,-1))+s(vec2(1,-1))+s(vec2(-1,1))+s(vec2(1,1)); o = vec4(c/16.*uW, 1.); }`;
  const FS_COMP = `
in vec2 vUV; uniform sampler2D uScene, uBloom; uniform float uBloomK, uInvK, uVig; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c = texture(uScene, vUV).rgb*uInvK + texture(uBloom, vUV).rgb*uInvK*uBloomK;
  vec2 v = vUV-.5; c *= 1.-uVig*dot(v,v)*1.1;
  c = pow(aces(c*1.05), vec3(1./2.2));
  c += (h(gl_FragCoord.xy)-.5)/255.;                                                       // dither (kills banding, invisible)
  o = vec4(c, 1.); }`;
  const FS_FXAA = `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTx; out vec4 o;
float lu(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
void main(){
  vec3 rgbNW = texture(uTex, vUV+vec2(-1,-1)*uTx).rgb, rgbNE = texture(uTex, vUV+vec2(1,-1)*uTx).rgb, rgbSW = texture(uTex, vUV+vec2(-1,1)*uTx).rgb, rgbSE = texture(uTex, vUV+vec2(1,1)*uTx).rgb, rgbM = texture(uTex, vUV).rgb;
  float lNW = lu(rgbNW), lNE = lu(rgbNE), lSW = lu(rgbSW), lSE = lu(rgbSE), lM = lu(rgbM);
  float lMin = min(lM, min(min(lNW,lNE), min(lSW,lSE))), lMax = max(lM, max(max(lNW,lNE), max(lSW,lSE)));
  vec2 dir = vec2(-((lNW+lNE)-(lSW+lSE)), ((lNW+lSW)-(lNE+lSE)));
  float red = max((lNW+lNE+lSW+lSE)*.03125, 1./128.); float rcp = 1./(min(abs(dir.x),abs(dir.y))+red);
  dir = clamp(dir*rcp, -8., 8.)*uTx;
  vec3 A = .5*(texture(uTex, vUV+dir*(1./3.-.5)).rgb + texture(uTex, vUV+dir*(2./3.-.5)).rgb);
  vec3 B = A*.5 + .25*(texture(uTex, vUV-dir*.5).rgb + texture(uTex, vUV+dir*.5).rgb);
  float lB = lu(B); o = vec4((lB < lMin || lB > lMax) ? A : B, 1.); }`;

  /* ======================= init ======================= */
  const M = {}; // mesh VAOs
  function glInit() {
    EXT.cbf = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    qBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    VAO.quad = gl.createVertexArray(); gl.bindVertexArray(VAO.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    P.mesh = program(VS_MESH, FS_MESH); P.sprite = program(VS_SPRITE, FS_SPRITE); P.line = program(VS_LINE, FS_LINE);
    P.nebula = program(VS_QUAD, FS_NEBULA); P.bg = program(VS_QUAD, FS_BG); P.star = program(VS_STAR, FS_STAR); P.planet = program(VS_QUAD, FS_PLANET);
    P.bright = program(VS_QUAD, FS_BRIGHT); P.down = program(VS_QUAD, FS_DOWN); P.up = program(VS_QUAD, FS_UP); P.comp = program(VS_QUAD, FS_COMP); P.fxaa = program(VS_QUAD, FS_FXAA);
    // meshes: 8 rock shapes x 2 detail levels, 4 debris chips, ship, saucer
    const big = IS_MOBILE ? 3 : 4;
    M.rockHi = []; M.rockLo = []; for (let i = 0; i < 8; i++) { M.rockHi.push(meshVAO(Meshes.rock(i + 1, big))); M.rockLo.push(meshVAO(Meshes.rock(i + 1, 2))); }
    M.chip = []; for (let i = 0; i < 4; i++) M.chip.push(meshVAO(Meshes.chip(i)));
    M.ship = meshVAO(Meshes.ship()); M.saucer = meshVAO(Meshes.saucer());
    spriteBuf = instVAO(4096 * 12, 3); lineBuf = instVAO(4096 * 12, 3);
    starBuf = { vao: gl.createVertexArray(), buf: gl.createBuffer() };
    built = true;
  }
  function texture(w, h, fmt) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    const f = fmt === 'f16' ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    gl.texImage2D(gl.TEXTURE_2D, 0, f[0], w, h, 0, f[1], f[2], null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function fbo(tex) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; }
  let fbList = [], texList = [], rbList = [];
  function freeTargets() { fbList.forEach(f => gl.deleteFramebuffer(f)); texList.forEach(t => gl.deleteTexture(t)); rbList.forEach(r => gl.deleteRenderbuffer(r)); fbList = []; texList = []; rbList = []; }
  function target(w, h, fmt, depth) {
    const t = texture(w, h, fmt), f = fbo(t); texList.push(t); fbList.push(f);
    if (depth) { const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d); rbList.push(d); }
    return { t, f, w, h, ok: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE };
  }
  function msTarget(w, h, fmt, samples) {
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); fbList.push(f);
    const c = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, c); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt === 'f16' ? gl.RGBA16F : gl.RGBA8, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c);
    const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
    rbList.push(c, d);
    return { f, w, h, ok: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE };
  }
  let nebDirty = true;
  function glResize() {
    if (!built) return;
    freeTargets();
    const W = R.W, Hh = R.H;
    // HDR if the GPU can render to half floats, else 8-bit with the scene scaled down by 2 (keeps highlights for bloom)
    let fmt = EXT.cbf && !qs.has('ldr') ? 'f16' : 'u8';
    FB.scene = target(W, Hh, fmt, true);
    if (!FB.scene.ok && fmt === 'f16') { freeTargets(); fmt = 'u8'; FB.scene = target(W, Hh, fmt, true); }
    R.hdr = fmt === 'f16'; R.fmt = fmt;
    const maxS = gl.getParameter(gl.MAX_SAMPLES) || 0;
    R.msaaMax = Math.min(4, maxS);
    FB.ms = R.msaaMax >= 2 ? msTarget(W, Hh, fmt, R.msaaMax) : null; if (FB.ms && !FB.ms.ok) FB.ms = null;
    FB.ldr = target(W, Hh, 'u8', false);
    FB.neb = target(W, Hh, 'u8', false); nebDirty = true;
    FB.bloom = []; let bw = W >> 1, bh = Hh >> 1;
    for (let i = 0; i < 6 && bw >= 8 && bh >= 8; i++) { FB.bloom.push(target(bw, bh, fmt, false)); bw >>= 1; bh >>= 1; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    buildStars();
  }
  function buildStars() {
    const rnd = Meshes.rng(4242), n = Math.min(1400, Math.round(R.cw * R.ch / 1700)), a = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const L = i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0, t = rnd();
      const tint = t < 0.15 ? [1, 0.75, 0.55] : t < 0.35 ? [0.7, 0.82, 1] : [1, 1, 1];
      const b = (L === 2 ? 1.6 : L === 1 ? 0.9 : 0.5) * (0.5 + rnd() * 0.7);
      a.set([rnd(), rnd(), L === 2 ? 1.6 + rnd() * 0.9 : L === 1 ? 1.1 + rnd() * 0.6 : 0.7 + rnd() * 0.5, L, tint[0] * b, tint[1] * b, tint[2] * b, rnd()], i * 8);
    }
    gl.bindVertexArray(starBuf.vao); gl.bindBuffer(gl.ARRAY_BUFFER, starBuf.buf); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null); starN = n;
  }

  /* ======================= math ======================= */
  const TAU = Math.PI * 2;
  const mProj = new Float32Array(16), mM = new Float32Array(16), mN = new Float32Array(9);
  function ortho(Wf, Hf, cx, cy) { mProj.fill(0); mProj[0] = 2 / Wf; mProj[5] = -2 / Hf; mProj[10] = -1 / 700; mProj[12] = -1 - 2 * cx / Wf; mProj[13] = 1 + 2 * cy / Hf; mProj[15] = 1; }
  /** model = T(x,y,z) * R(3x3) * S(sx,sy,sz) */
  function model(x, y, z, r, sx, sy, sz) {
    mM[0] = r[0] * sx; mM[1] = r[1] * sx; mM[2] = r[2] * sx; mM[3] = 0;
    mM[4] = r[3] * sy; mM[5] = r[4] * sy; mM[6] = r[5] * sy; mM[7] = 0;
    mM[8] = r[6] * sz; mM[9] = r[7] * sz; mM[10] = r[8] * sz; mM[11] = 0;
    mM[12] = x; mM[13] = y; mM[14] = z; mM[15] = 1;
    // normal matrix: rotation with inverse scale (columns / s)
    mN[0] = r[0] / sx; mN[1] = r[1] / sx; mN[2] = r[2] / sx; mN[3] = r[3] / sy; mN[4] = r[4] / sy; mN[5] = r[5] / sy; mN[6] = r[6] / sz; mN[7] = r[7] / sz; mN[8] = r[8] / sz;
  }
  function axisAngle(ax, ay, az, a, out) { const c = Math.cos(a), s = Math.sin(a), t = 1 - c; out[0] = t * ax * ax + c; out[1] = t * ax * ay + s * az; out[2] = t * ax * az - s * ay; out[3] = t * ax * ay - s * az; out[4] = t * ay * ay + c; out[5] = t * ay * az + s * ax; out[6] = t * ax * az + s * ay; out[7] = t * ay * az - s * ax; out[8] = t * az * az + c; return out; }
  function mul3(a, b, out) { // column-major 3x3: out = a*b
    for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) out[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return out;
  }
  const rA = new Float32Array(9), rB = new Float32Array(9), rC = new Float32Array(9);
  /** call fn(x,y) for each wrapped copy of an object of radius r that touches the field */
  function copies(G, x, y, r, fn) {
    const xs = [x], ys = [y];
    if (x < r) xs.push(x + G.W); else if (x > G.W - r) xs.push(x - G.W);
    if (y < r) ys.push(y + G.H); else if (y > G.H - r) ys.push(y - G.H);
    for (const X of xs) for (const Y of ys) fn(X, Y);
  }
  const SUN = (() => { const v = [-0.62, -0.55, 0.48], l = Math.hypot(...v); return v.map(c => c / l); })();

  /* ======================= frame ======================= */
  const sprites = new Float32Array(4096 * 12); let nS = 0;
  const lines = new Float32Array(4096 * 12); let nL = 0;
  function spr(x, y, ang, type, hl, hw, p1, p2, r, g, b, a) { if (nS >= 4096) return; sprites.set([x, y, ang, type, hl, hw, p1, p2, r, g, b, a], nS * 12); nS++; }
  function seg(x1, y1, x2, y2, hw, r, g, b, a) { if (nL >= 4096) return; lines.set([x1, y1, x2, y2, hw, 0, 0, 0, r, g, b, a], nL * 12); nL++; }
  const lightP = new Float32Array(48), lightC = new Float32Array(48);
  let nLights = 0;
  function gatherLights(G, view) {
    const cand = [];
    for (const l of FX.L) { const f = 1 - l.t / l.life; cand.push([l.x, l.y, l.z, l.r * (0.6 + 0.4 * f), l.col[0], l.col[1], l.col[2], l.i * f * f]); }
    if (G) {
      for (const s of G.shots) cand.push([s.x, s.y, 18, 85, 0.35, 0.8, 1.2, 1.3]);
      for (const s of G.sshots) cand.push([s.x, s.y, 18, 80, 1.3, 0.3, 0.9, 1.2]);
      const p = G.ship; if (view.ship && p.thrust && !p.hyper) cand.push([p.x - Math.cos(p.a) * 22, p.y - Math.sin(p.a) * 22, 10, 140, 0.5, 0.75, 1.4, 1.3 + Math.random() * 0.3]);
      if (G.saucer) cand.push([G.saucer.x, G.saucer.y, 30, 150, G.saucer.kind === 'small' ? 1.2 : 0.4, G.saucer.kind === 'small' ? 0.3 : 1.1, G.saucer.kind === 'small' ? 0.9 : 0.6, 0.9]);
    }
    cand.sort((a, b) => b[7] * b[3] - a[7] * a[3]);
    nLights = Math.min(12, cand.length);
    for (let i = 0; i < nLights; i++) { const c = cand[i]; lightP.set([c[0], c[1], c[2], c[3]], i * 4); lightC.set([c[4], c[5], c[6], c[7]], i * 4); }
  }
  function useMesh() {
    const u = P.mesh.u; gl.useProgram(P.mesh.p);
    gl.uniformMatrix4fv(u.uP, false, mProj); gl.uniform1f(u.uK, K); gl.uniform1f(u.uTime, R.time);
    gl.uniform3fv(u.uSun, SUN); gl.uniform3f(u.uSunC, 1.32, 1.2, 1.06); gl.uniform3f(u.uAmbT, 0.06, 0.045, 0.09); gl.uniform3f(u.uAmbB, 0.02, 0.03, 0.045);
    gl.uniform4fv(u.uLP, lightP); gl.uniform4fv(u.uLC, lightC); gl.uniform1i(u.uNL, nLights);
    octMax = R.quality >= 2 ? 5 : R.quality === 1 ? 3 : 2;
  }
  let octMax = 5;
  /** relief octaves for a rock of radius r: only as much detail as its size on screen can show (no shimmer) */
  const octFor = r => Math.max(1, Math.min(octMax, Math.round(Math.log2(Math.max(1, r * R.s / 6)))));
  function drawMesh(m, kind, opts) {
    const u = P.mesh.u;
    gl.uniformMatrix4fv(u.uM, false, mM); gl.uniformMatrix3fv(u.uN, false, mN);
    gl.uniform1i(u.uKind, kind); gl.uniform1i(u.uOct, opts.oct || 2); gl.uniform1f(u.uSeed, opts.seed || 0); gl.uniform1f(u.uBump, opts.bump || 0); gl.uniform1f(u.uHue, opts.hue || 0);
    gl.uniform3fv(u.uTint, opts.tint || [1, 1, 1]); gl.uniform1f(u.uEmis, opts.emis == null ? 1 : opts.emis); gl.uniform1f(u.uFade, opts.fade == null ? 1 : opts.fade);
    gl.bindVertexArray(m.vao);
    if (m.indexed) gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0); else gl.drawArrays(gl.TRIANGLES, 0, m.count);
    R.drawn++;
  }
  let K = 1; // output scale (0.5 on 8-bit targets so HDR highlights survive for the bloom)
  const ID3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  function rockSet(r) { return r.r > 15 ? M.rockHi : M.rockLo; }

  function drawField(G, view) {
    const classic = R.classic;
    // ---------- opaque 3D ----------
    if (!classic) {
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
      useMesh();
      for (const r of G.rocks) {
        axisAngle(r.ax, r.ay, r.az, r.rot, rA);
        const set = rockSet(r), m = set[r.shape % 8];
        copies(G, r.x, r.y, r.r * 1.25, (x, y) => { model(x, y, 0, rA, r.r, r.r, r.r); drawMesh(m, 0, { oct: octFor(r.r), seed: r.shape * 7.3 + 1, bump: r.r * 0.08, hue: r.hue * 0.6, tint: r.raid ? [1.25, 0.85, 0.8] : undefined }); });
      }
      for (const d of FX.D) {
        const f = 1 - d.t / d.life, sc = d.s * Math.min(1, f * 3);
        if (sc <= 0.05) continue;
        axisAngle(d.ax, d.ay, d.az, d.rot, rA);
        model(d.x, d.y, d.z, rA, sc, sc, sc);
        const tint = d.kind === 'ship' ? [2.6, 2.6, 2.8] : d.kind === 'saucer' ? [2.2, 2.3, 2.6] : [1, 1, 1];
        drawMesh(M.chip[d.shape], d.kind === 'rock' ? 0 : 1, { oct: 1, seed: d.shape * 3.1, bump: sc * 0.3, tint: d.kind === 'rock' ? undefined : tint.map(v => v * 0.35), fade: Math.min(1, f * 2.5) });
      }
      const s = G.saucer;
      if (s) {
        const sc = s.kind === 'small' ? 0.55 : 1;
        axisAngle(0, 0, 1, s.spin, rA); axisAngle(1, 0, 0, 0.95 + Math.sin(R.time * 2) * 0.05, rB); mul3(rB, rA, rC);
        copies(G, s.x, s.y, 24, (x, y) => { model(x, y, 0, rC, sc, sc, sc); drawMesh(M.saucer, 2, { emis: 0.8 + 0.6 * Math.sin(R.time * 9), tint: s.kind === 'small' ? [1.05, 0.9, 1.05] : [1, 1, 1] }); });
      }
      const p = G.ship;
      if (view.ship && p.alive && !p.hyper) {
        let k = 1; const wIn = FX.WARP.find(w => w.dir > 0); if (wIn) k = Math.min(1, wIn.t / wIn.life * 1.6);
        drawShip(G, p.x, p.y, p.a, p.bank, k, p.thrust);
      } else if (view.ship && p.alive && p.hyper) {
        const w = FX.WARP.find(w => w.dir < 0); if (w) { const k = 1 - w.t / w.life; if (k > 0.05) drawShip(G, w.x, w.y, w.a, 0, k, false, true); }
      }
      if (view.ghostShip) drawShip(G, view.ghostShip.x, view.ghostShip.y, view.ghostShip.a, Math.sin(R.time) * 0.3, 1, true);
      gl.bindVertexArray(null);
    }
    // ---------- additive FX ----------
    nS = 0; nL = 0;
    if (classic) classicGeometry(G, view);
    else modernSprites(G, view);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    if (nS) {
      gl.useProgram(P.sprite.p); gl.uniformMatrix4fv(P.sprite.u.uP, false, mProj); gl.uniform1f(P.sprite.u.uTime, R.time); gl.uniform1f(P.sprite.u.uK, K);
      gl.bindVertexArray(spriteBuf.vao); gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, sprites, 0, nS * 12);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nS); R.drawn++;
    }
    if (nL) {
      gl.useProgram(P.line.p); gl.uniformMatrix4fv(P.line.u.uP, false, mProj); gl.uniform1f(P.line.u.uPx, 1 / R.s); gl.uniform1f(P.line.u.uK, K);
      gl.bindVertexArray(lineBuf.vao); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lines, 0, nL * 12);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nL); R.drawn++;
    }
    gl.bindVertexArray(null);
  }
  function drawShip(G, x, y, a, bank, k, thrust, warping) {
    axisAngle(0, 0, 1, a, rA); axisAngle(1, 0, 0, bank, rB); mul3(rA, rB, rC);
    const sx = warping ? 1 + (1 - k) * 3 : k, syz = k;
    copies(G, x, y, 22, (X, Y) => { model(X, Y, 6, rC, 1.2 * sx, 1.2 * syz, 1.2 * syz); drawMesh(M.ship, 1, { emis: thrust ? 1.6 : 0.7, tint: warping ? [1.3, 1.0, 1.8] : undefined }); });
  }
  function modernSprites(G, view) {
    const p = G.ship;
    // the ship's plume, shield bubble
    if (view.ship && p.alive && !p.hyper) {
      const ca = Math.cos(p.a), sa = Math.sin(p.a);
      if (p.thrust) for (const sg of [-1, 1]) {
        const L = 15 + Math.random() * 6, bx = p.x - ca * 14.5 - sa * 6 * sg, by = p.y - sa * 14.5 + ca * 6 * sg;
        copies(G, bx, by, 30, (X, Y) => spr(X - ca * L, Y - sa * L, p.a, 4, L, 3.4, Math.random() * 10, 0, 1, 1, 1, 1));
      }
      else for (const sg of [-1, 1]) { const bx = p.x - ca * 12 - sa * 4.8 * sg, by = p.y - sa * 12 + ca * 4.8 * sg; spr(bx, by, 0, 0, 3, 3, 0, 0, 1.2, 0.5, 0.2, 0.6); }
      if (p.shield > 0) { const f = p.shield < 40 ? (((p.shield / 4) | 0) % 2 ? 0.35 : 1) : 1; copies(G, p.x, p.y, 26, (X, Y) => spr(X, Y, 0, 3, 23, 23, 0, 0, 0.45 * f, 1.3 * f, 2.2 * f, 1)); }
    }
    for (const w of FX.WARP) { const t = w.t / w.life, rad = w.dir > 0 ? 18 + 46 * t : 64 - 40 * t; spr(w.x, w.y, 0, 5, rad, rad, w.dir > 0 ? t : 1 - t, 0, 1.4 * (1 - t * 0.6), 0.6, 2.6, 1); }
    // bolts
    for (const s of G.shots) { const ang = Math.atan2(s.vy, s.vx); copies(G, s.x, s.y, 12, (X, Y) => { spr(X, Y, ang, 2, 9, 2.1, 0, 0, 0.7, 2.6, 3.6, 1); spr(X, Y, 0, 0, 9, 9, 0, 0, 0.2, 0.6, 1.0, 0.6); }); }
    for (const s of G.sshots) { const ang = Math.atan2(s.vy, s.vx); copies(G, s.x, s.y, 12, (X, Y) => { spr(X, Y, ang, 2, 6.5, 2.4, 0, 0, 3.6, 0.6, 2.4, 1); spr(X, Y, 0, 0, 10, 10, 0, 0, 1.0, 0.2, 0.6, 0.6); }); }
    if (G.saucer) { const s = G.saucer, sc = s.kind === 'small' ? 0.55 : 1; spr(s.x, s.y + 2, 0, 0, 30 * sc, 30 * sc, 0, 0, s.kind === 'small' ? 0.5 : 0.15, s.kind === 'small' ? 0.12 : 0.45, 0.35, 0.8); }
    // particles
    for (const q of FX.P) {
      const t = q.t / q.life, f = 1 - t;
      switch (q.k) {
        case 0: { const sz = q.size + (q.size2 - q.size) * t; spr(q.x, q.y, 0, 0, sz, sz, 0, 0, q.col[0], q.col[1], q.col[2], f * q.a); break; }
        case 1: { const sz = q.size + (q.size2 - q.size) * Math.sqrt(t); copies(G, q.x, q.y, sz, (X, Y) => spr(X, Y, 0, 1, sz, sz, q.w, 0, q.col[0], q.col[1], q.col[2], f * f)); break; }
        case 2: { const v = Math.hypot(q.vx, q.vy), ang = Math.atan2(q.vy, q.vx), L = Math.max(q.size, Math.min(q.len * 3, v * 0.022 + q.size)); const heat = q.hot ? f : 1;
          spr(q.x, q.y, ang, 2, L, q.size, 0, 0, q.col[0] * (0.5 + heat * 0.5), q.col[1] * heat * heat, q.col[2] * heat * heat * heat, f); break; }
        case 6: { const sz = q.size + (q.size2 - q.size) * Math.sqrt(t); spr(q.x, q.y, q.ang, 6, sz, sz, q.seed, 0, q.col[0], q.col[1], q.col[2], q.a * f * Math.min(1, t * 8)); break; }
        case 7: { const sz = q.size + (q.size2 - q.size) * t; spr(q.x, q.y, 0, 7, sz, sz, 0, 0, q.col[0], q.col[1], q.col[2], f * f); break; }
      }
    }
  }
  /* classic vector mode: everything is glowing white line work */
  function classicGeometry(G, view) {
    const LW = Math.max(1.15, 1.25 * R.dpr) / R.s / 1.0, I = 1.6;
    const poly = (pts, x, y, a, sc, closed) => { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; seg(x + (p[0] * c - p[1] * s) * sc, y + (p[0] * s + p[1] * c) * sc, x + (q[0] * c - q[1] * s) * sc, y + (q[0] * s + q[1] * c) * sc, LW, I, I, I, 1); } };
    for (const r of G.rocks) copies(G, r.x, r.y, r.r * 1.1, (x, y) => poly(Meshes.CLASSIC_ROCKS[r.shape % 4], x, y, 0, r.r * 1.08, true));
    const p = G.ship;
    if (view.ship && p.alive && !p.hyper) copies(G, p.x, p.y, 20, (x, y) => {
      poly(Meshes.CLASSIC_SHIP, x, y, p.a, 1, true);
      if (p.thrust && ((R.time * 30) | 0) % 2) poly([[-7, -4], [-15, 0], [-7, 4]], x, y, p.a, 1, false);
    });
    if (view.ghostShip) poly(Meshes.CLASSIC_SHIP, view.ghostShip.x, view.ghostShip.y, view.ghostShip.a, 1, true);
    if (G.saucer) { const s = G.saucer, sc = s.kind === 'small' ? 0.55 : 1; copies(G, s.x, s.y, 22, (x, y) => { for (const [a, b] of Meshes.CLASSIC_SAUCER) seg(x + a[0] * sc, y + a[1] * sc + 3 * sc, x + b[0] * sc, y + b[1] * sc + 3 * sc, LW, I, I, I, 1); }); }
    const dot = Math.max(1.6, 1.8 * R.dpr) / R.s;
    for (const s of G.shots) seg(s.x, s.y, s.x, s.y, dot, 2.4, 2.4, 2.4, 1);
    for (const s of G.sshots) seg(s.x, s.y, s.x, s.y, dot, 2.4, 2.4, 2.4, 1);
    for (const q of FX.P) if (q.k === 9) { const f = 1 - q.t / q.life; if (q.len) { const c = Math.cos(q.ang) * q.len / 2, s = Math.sin(q.ang) * q.len / 2; seg(q.x - c, q.y - s, q.x + c, q.y + s, LW, I * f, I * f, I * f, 1); } else seg(q.x, q.y, q.x, q.y, LW * 1.1, 1.8 * f, 1.8 * f, 1.8 * f, 1); }
  }

  let starOff = [0, 0, 0, 0, 0, 0], parX = 0, parY = 0;
  /** draw one frame. G may be null (menus over the backdrop). view: { ship, ghostShip, dim } */
  function frame(G, view, dt) {
    view = view || {};
    if (R.mode !== 'gl') { Render2D.frame(G, view, dt, R); return; }
    if (gl.isContextLost()) return;
    R.drawn = 0;
    K = R.hdr ? 1 : 0.5;
    const W = R.W, Hh = R.H, useMS = FB.ms && R.quality >= 2 && !qs.has('nomsaa');
    R.msaa = useMS ? R.msaaMax : 0;
    if (nebDirty) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, FB.neb.f); gl.viewport(0, 0, W, Hh); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(P.nebula.p); gl.uniform2f(P.nebula.u.uRes, W, Hh); gl.uniform1f(P.nebula.u.uSeed, 3.7);
      gl.bindVertexArray(VAO.quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); nebDirty = false;
    }
    // parallax follows the ship gently
    if (G && G.ship && G.ship.alive) { parX += ((G.ship.x / G.W - 0.5) - parX) * Math.min(1, dt * 1.5); parY += ((G.ship.y / G.H - 0.5) - parY) * Math.min(1, dt * 1.5); }
    const drift = R.time * 0.0016;
    starOff = [-parX * 0.004 + drift * 0.3, parY * 0.004, -parX * 0.010 + drift * 0.6, parY * 0.010, -parX * 0.022 + drift, parY * 0.022];
    const target = useMS ? FB.ms : FB.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.f); gl.viewport(0, 0, W, Hh);
    gl.disable(gl.SCISSOR_TEST); gl.depthMask(true); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const dim = view.dim == null ? 1 : view.dim;
    if (!R.classic) {
      gl.useProgram(P.bg.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FB.neb.t); gl.uniform1i(P.bg.u.uTex, 0);
      gl.uniform2f(P.bg.u.uOff, -parX * 0.006, parY * 0.006); gl.uniform1f(P.bg.u.uK, K); gl.uniform1f(P.bg.u.uDim, dim);
      gl.bindVertexArray(VAO.quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.star.p); gl.uniform2fv(P.star.u.uOff, starOff); gl.uniform1f(P.star.u.uDpr, R.dpr); gl.uniform1f(P.star.u.uTime, R.time); gl.uniform1f(P.star.u.uK, K * (R.classic ? 0.35 : 1) * dim);
    gl.bindVertexArray(starBuf.vao); gl.drawArrays(gl.POINTS, 0, starN);
    if (!R.classic) {
      const m = Math.min(W, Hh), portrait = Hh > W, rad = Math.round(m * (portrait ? 0.15 : 0.12));
      const cx = W * (portrait ? 0.74 : 0.8) - parX * W * 0.012, cy = Hh * (portrait ? 0.84 : 0.76) + parY * Hh * 0.012;
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.planet.p); gl.uniform2f(P.planet.u.uC, cx, cy); gl.uniform1f(P.planet.u.uRad, rad); gl.uniform1f(P.planet.u.uTime, R.time); gl.uniform1f(P.planet.u.uK, K * dim);
      gl.uniform3fv(P.planet.u.uL, SUN);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.max(0, cx - rad * 2.3) | 0, Math.max(0, cy - rad * 1.4) | 0, rad * 4.6 | 0, rad * 2.8 | 0);
      gl.bindVertexArray(VAO.quad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.disable(gl.SCISSOR_TEST);
    }
    // field
    if (G) {
      const pf = R.pf, sh = FX.st.shake, shx = sh ? (Math.random() * 2 - 1) * sh : 0, shy = sh ? (Math.random() * 2 - 1) * sh : 0;
      ortho(G.W, G.H, shx, shy);
      gl.viewport(pf.x, Hh - pf.y - pf.h, pf.w, pf.h); gl.enable(gl.SCISSOR_TEST); gl.scissor(pf.x, Hh - pf.y - pf.h, pf.w, pf.h);
      gatherLights(G, view);
      drawField(G, view);
      gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, W, Hh);
    }
    // resolve MSAA
    if (useMS) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, FB.ms.f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, FB.scene.f); gl.blitFramebuffer(0, 0, W, Hh, 0, 0, W, Hh, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    // bloom
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(VAO.quad); gl.activeTexture(gl.TEXTURE0);
    const levels = Math.min(FB.bloom.length, R.quality >= 2 ? 6 : R.quality === 1 ? 5 : 4);
    let src = FB.scene;
    for (let i = 0; i < levels; i++) {
      const d = FB.bloom[i]; gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h);
      const pr = i === 0 ? P.bright : P.down; gl.useProgram(pr.p); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(pr.u.uTex, 0); gl.uniform2f(pr.u.uTx, 1 / src.w, 1 / src.h);
      if (i === 0) gl.uniform1f(pr.u.uThr, 0.9 * K);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); src = d;
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.useProgram(P.up.p);
    for (let i = levels - 1; i > 0; i--) {
      const s = FB.bloom[i], d = FB.bloom[i - 1]; gl.bindFramebuffer(gl.FRAMEBUFFER, d.f); gl.viewport(0, 0, d.w, d.h);
      gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(P.up.u.uTex, 0); gl.uniform2f(P.up.u.uTx, 1 / s.w, 1 / s.h); gl.uniform1f(P.up.u.uW, 0.85);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);
    // composite (+ FXAA when MSAA is off)
    const fx = !useMS;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fx ? FB.ldr.f : null); gl.viewport(0, 0, W, Hh);
    gl.useProgram(P.comp.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FB.scene.t); gl.uniform1i(P.comp.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, FB.bloom[0].t); gl.uniform1i(P.comp.u.uBloom, 1);
    gl.uniform1f(P.comp.u.uBloomK, R.classic ? 0.9 : 0.55); gl.uniform1f(P.comp.u.uInvK, 1 / K); gl.uniform1f(P.comp.u.uVig, R.classic ? 0.15 : 0.45);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (fx) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(P.fxaa.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FB.ldr.t); gl.uniform1i(P.fxaa.u.uTex, 0); gl.uniform2f(P.fxaa.u.uTx, 1 / W, 1 / Hh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(null);
  }
  function setQuality(q) { R.quality = Math.max(0, Math.min(2, q)); FX.st.pmul = [0.4, 0.65, 1][R.quality]; }

  /* ======================= startup ======================= */
  function switchTo2D(err) {
    R.glErr = String(err && err.message || err); console.warn('[render] WebGL2 unavailable, using Canvas2D:', R.glErr);
    const c2 = document.createElement('canvas'); c2.id = 'scene'; c2.className = cv.className; cv.replaceWith(c2); cv = c2; gl = null; R.mode = '2d';
  }
  if (R.mode === 'gl') { try { glInit(); } catch (e) { switchTo2D(e); } }
  if (R.mode === 'gl') {
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); built = false; }, false);
    cv.addEventListener('webglcontextrestored', () => { try { P = {}; glInit(); glResize(); } catch (e) { console.warn(e); } }, false);
  }
  if (R.mode === '2d') Render2D.init(cv);
  setQuality(R.quality);
  return { R, hud, hx, get cv() { return cv; }, resize, fitField, frame, setQuality, get gl() { return gl; }, copies };
})();
