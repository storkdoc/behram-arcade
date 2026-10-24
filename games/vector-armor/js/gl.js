/* ==========================================================================
   VECTOR ARMOR — gl.js : the WebGL2 renderer
   HDR scene (RGBA16F when the GPU allows) into a 4x MSAA target, then a
   dual-filter bloom mip chain and an ACES composite (FXAA when MSAA is not
   available). Glowing wireframe = instanced screen-space thick lines over
   flat-shaded rim-lit solids; planar reflections in the dark glossy ground;
   procedural sky (stars, crescent moon, haze); a mountain ring with an
   erupting volcano; additive particles, smoke, shock rings, dynamic lights.
   Adaptive quality drops effects (never resolution) below 45 fps for 3 s.
   ========================================================================== */
const GLR = (() => {
  'use strict';
  const R = { ok: false, W: 1, H: 1, dpr: 1, samples: 0, hdr: false, tier: 3, lockTier: false, palette: 'modern', err: '', frames: 0, fpsLow: 0, fps: 60, lost: false };
  let gl = null, cv = null;
  const HDR = '#version 300 es\nprecision highp float;\n';
  const FOG = 'uniform float uFogD; uniform float uFogOn; float fogF(float d){ if(uFogOn<0.5) return 0.0; return max(1.0-exp(-pow(d/uFogD,2.0)), smoothstep(560.0,672.0,d)); }\n';
  const WRAP = 'uniform float uWrap; uniform float uWorld; uniform vec2 uCamXZ; vec2 wrapOff(vec2 c){ vec2 d=c-uCamXZ; d-=uWorld*floor(d/uWorld+0.5); return uCamXZ+d-c; }\n';

  const SH = {
    meshV: HDR + WRAP + `
in vec3 aP; in vec3 aN; in vec2 aC;
uniform mat4 uVP; uniform mat4 uM; uniform float uMirror;
out vec3 vW; out vec3 vN;
void main(){ vec4 w=uM*vec4(aP,1.0); if(uWrap>0.5) w.xz+=wrapOff(aC); vec3 n=mat3(uM)*aN; if(uMirror>0.5){ w.y=-w.y; n.y=-n.y; } vW=w.xyz; vN=n; gl_Position=uVP*w; }`,
    meshF: HDR + FOG + `
in vec3 vW; in vec3 vN; out vec4 o;
uniform vec3 uCam; uniform vec3 uBase; uniform vec3 uRim; uniform vec3 uEmis; uniform vec3 uFogC; uniform vec3 uLDir; uniform float uMirror;
uniform vec4 uLP[4]; uniform vec3 uLC[4];
void main(){ vec3 N=normalize(vN); vec3 V=normalize(uCam-vW); float ndv=clamp(dot(N,V),0.0,1.0);
  float ndl=max(dot(N,uLDir),0.0); float rim=pow(1.0-ndv,2.4);
  vec3 c=uBase*(0.3+0.9*ndl)+uRim*rim*1.7+uEmis+uRim*0.10*clamp(-N.y,0.0,1.0);
  c+=uRim*0.18*smoothstep(0.0,14.0,vW.y)*ndv;
  for(int i=0;i<4;i++){ vec3 L=uLP[i].xyz-vW; float d=length(L); float a=clamp(1.0-d/max(uLP[i].w,0.001),0.0,1.0); c+=uLC[i]*a*a*(0.25+0.75*max(dot(N,L/max(d,0.001)),0.0)); }
  float d=length(uCam-vW); c=mix(c,uFogC,fogF(d)); if(uMirror>0.5) c*=0.42; o=vec4(c,1.0); }`,
    lineV: HDR + FOG + WRAP + `
in vec2 aQ; in vec3 aA; in vec3 aB; in vec4 aCol; in vec2 aCC;
uniform mat4 uV; uniform mat4 uP; uniform mat4 uM; uniform vec2 uRes; uniform float uWidth; uniform float uMirror; uniform vec3 uTint; uniform vec3 uCam;
out vec3 vCol; out float vS; out float vHW; out float vFog;
void main(){ vec4 wa=uM*vec4(aA,1.0), wb=uM*vec4(aB,1.0);
  if(uWrap>0.5){ vec2 of=wrapOff(aCC); wa.xz+=of; wb.xz+=of; }
  if(uMirror>0.5){ wa.y=-wa.y; wb.y=-wb.y; }
  vec4 va=uV*wa, vb=uV*wb; float nz=-0.3;
  vCol=vec3(0.0); vS=0.0; vHW=1.0; vFog=1.0;
  if(va.z>nz && vb.z>nz){ gl_Position=vec4(2.0,2.0,2.0,1.0); return; }
  if(va.z>nz) va=mix(va,vb,(va.z-nz)/(va.z-vb.z)); else if(vb.z>nz) vb=mix(vb,va,(vb.z-nz)/(vb.z-va.z));
  vec4 ca=uP*va, cb=uP*vb; vec2 sa=ca.xy/ca.w*uRes*0.5, sb=cb.xy/cb.w*uRes*0.5;
  vec2 dir=sb-sa; float L=length(dir); dir=L>1e-5?dir/L:vec2(1.0,0.0); vec2 nr=vec2(-dir.y,dir.x);
  float dist=-(aQ.x<0.5?va.z:vb.z); float hw=uWidth*aCol.a*clamp(70.0/max(dist,1.0),0.55,1.0);
  vec4 c=aQ.x<0.5?ca:cb; vec2 off=nr*aQ.y*hw+dir*(aQ.x*2.0-1.0)*hw*0.5; c.xy+=off*2.0/uRes*c.w;
  gl_Position=c; vS=aQ.y; vHW=hw; vCol=aCol.rgb*uTint; vec3 wm=aQ.x<0.5?wa.xyz:wb.xyz; vFog=fogF(length(wm-uCam)); }`,
    lineF: HDR + `
in vec3 vCol; in float vS; in float vHW; in float vFog; out vec4 o; uniform float uCore; uniform float uAlpha;
void main(){ float dpx=abs(vS)*vHW; float core=1.0-smoothstep(uCore-0.6,uCore+0.6,dpx); float g=exp(-dpx*dpx/(vHW*vHW*0.16));
  o=vec4(vCol*(core+g*0.42)*(1.0-vFog)*uAlpha,1.0); }`,
    groundV: HDR + `in vec2 aP; uniform mat4 uVP; uniform vec3 uCam; out vec3 vW; void main(){ vW=vec3(uCam.x+aP.x*1700.0,0.0,uCam.z+aP.y*1700.0); gl_Position=uVP*vec4(vW,1.0); }`,
    groundF: HDR + FOG + `
in vec3 vW; out vec4 o; uniform vec3 uCam; uniform vec3 uGrid; uniform vec3 uGround; uniform vec3 uFogC; uniform float uRefl; uniform float uLw; uniform float uT;
uniform vec4 uLP[4]; uniform vec3 uLC[4];
float grid(vec2 p,float s){ vec2 g=abs(fract(p/s+0.5)-0.5)*s; vec2 fw=max(fwidth(p),vec2(1e-4)); vec2 l=1.0-clamp(g/(fw*uLw),0.0,1.0); float fade=1.0-smoothstep(0.08,0.4,max(fw.x,fw.y)*uLw/s); return max(l.x,l.y)*fade; }
void main(){ vec2 p=vW.xz; float d=length(vW-uCam); float f=fogF(d);
  float g0=grid(p,5.0), g1=grid(p,20.0), g2=grid(p,100.0);
  vec3 c=uGround+uGrid*(g0*0.12+g1*0.5+g2*0.95)*(1.0+0.15*sin(uT*0.7+p.x*0.01));
  for(int i=0;i<4;i++){ vec3 L=uLP[i].xyz-vW; float dl=length(L); float a=clamp(1.0-dl/max(uLP[i].w,0.001),0.0,1.0); c+=uLC[i]*a*a*(0.1+g0*0.3+g1*0.8+g2*0.8); }
  c=mix(c,uFogC,f); o=vec4(c,mix(uRefl,1.0,f)); }`,
    quadV: HDR + `out vec2 vUv; out vec2 vNdc; void main(){ vec2 p=vec2((gl_VertexID==1)?3.0:-1.0,(gl_VertexID==2)?3.0:-1.0); vNdc=p; vUv=p*0.5+0.5; gl_Position=vec4(p,0.0,1.0); }`,
    skyF: HDR + `
in vec2 vNdc; out vec4 o; uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform vec2 uTan;
uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uHaze; uniform vec3 uMoonDir; uniform vec3 uMoonCol; uniform vec3 uStar; uniform float uT;
float h13(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){ vec3 d=normalize(uF+vNdc.x*uTan.x*uR+vNdc.y*uTan.y*uU); float h=d.y;
  vec3 c=mix(uHor,uTop,smoothstep(0.0,0.5,h)); c+=uHaze*exp(-max(h,0.0)*16.0);
  if(h<0.0) c=mix(uHor+uHaze,uHor*0.5,smoothstep(0.0,-0.05,h));
  vec3 sp=d*230.0; vec3 cell=floor(sp); float r=h13(cell);
  if(r>0.962){ vec3 j=vec3(h13(cell+1.37),h13(cell+2.71),h13(cell+4.13)); vec3 sc=cell+0.15+0.7*j; float px=length(fwidth(sp));
    float dist=length(sp-sc); float b=(r-0.962)/0.038; float tw=0.7+0.3*sin(uT*(1.5+j.x*4.0)+j.y*30.0);
    vec3 sc2=mix(uStar,uStar*vec3(1.0,0.8,0.7),j.z); c+=sc2*smoothstep(px*1.25,px*0.15,dist)*(0.35+2.2*b*b*b)*tw*smoothstep(0.015,0.12,h); }
  vec3 m=uMoonDir; float md=dot(d,m);
  if(md>0.97){ vec3 mr=normalize(cross(vec3(0.0,1.0,0.0),m)), mu=cross(m,mr); vec2 uv=vec2(dot(d,mr),dot(d,mu))/0.034; float rr=length(uv); float pw=max(fwidth(rr),1e-4);
    float disc=1.0-smoothstep(1.0-pw,1.0+pw,rr); float s2=length(uv-vec2(0.48,0.20)); float sh=1.0-smoothstep(0.98-pw,0.98+pw,s2);
    float cr=0.82+0.18*sin(uv.x*7.0+1.0)*sin(uv.y*6.0+2.0); float lit=disc*(1.0-sh);
    c=mix(c,uHor*0.4+uMoonCol*0.015,disc); c+=uMoonCol*lit*cr*(0.9+0.5*smoothstep(0.0,0.4,s2-0.98));
    c+=uMoonCol*0.10*exp(-max(rr-1.0,0.0)*1.6)*(1.0-disc); }
  o=vec4(c,1.0); }`,
    mountV: HDR + `in vec3 aP; in vec3 aN; in vec2 aC; uniform mat4 uVP; out float vY; void main(){ vY=aP.y; gl_Position=uVP*vec4(aP,1.0); }`,
    mountF: HDR + `in float vY; out vec4 o; uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uHaze; void main(){ vec3 c=mix(uBot,uTop,smoothstep(-5.0,90.0,vY)); c=mix(c,uHaze,0.45*exp(-max(vY,0.0)*0.05)); o=vec4(c,1.0); }`,
    fxV: HDR + FOG + `
in vec2 aQ; in vec4 aPS; in vec4 aCol; in vec4 aX; uniform mat4 uV; uniform mat4 uP; uniform vec3 uCam;
out vec2 vQ; out vec4 vCol; out float vT; out float vFog;
void main(){ float ty=aX.x; vec3 p=aPS.xyz; float s=aPS.w; vQ=aQ; vCol=aCol; vT=ty;
  if(ty>0.5&&ty<1.5){ vec3 w=p+vec3(aQ.x*s,0.0,aQ.y*s); gl_Position=uP*uV*vec4(w,1.0); vFog=fogF(length(w-uCam)); return; }
  vec4 v=uV*vec4(p,1.0); vFog=fogF(length(p-uCam));
  if(ty>2.5){ vec4 v1=uV*vec4(p-aX.yzw*0.05,1.0); vec2 dir=v.xy-v1.xy; float L=length(dir); if(L<s){ dir=vec2(1.0,0.0); L=0.0; } else dir/=L;
    vec2 nr=vec2(-dir.y,dir.x); vec4 c=mix(v1,v,aQ.x*0.5+0.5); c.xy+=dir*aQ.x*s+nr*aQ.y*s; gl_Position=uP*c; return; }
  float cs=cos(aX.y), sn=sin(aX.y); v.xy+=vec2(cs*aQ.x-sn*aQ.y,sn*aQ.x+cs*aQ.y)*s; gl_Position=uP*v; }`,
    fxF: HDR + `
in vec2 vQ; in vec4 vCol; in float vT; in float vFog; out vec4 o;
void main(){ float r=length(vQ); float k=1.0-vFog;
  if(vT>0.5&&vT<1.5){ float b=exp(-pow((r-0.9)/0.07,2.0))+0.25*exp(-pow((r-0.75)/0.25,2.0)); b*=smoothstep(1.0,0.96,r); o=vec4(vCol.rgb*b*vCol.a*k,1.0); return; }
  if(vT>1.5&&vT<2.5){ float n=0.75+0.25*sin(vQ.x*5.0+vCol.a*9.0)*sin(vQ.y*4.0); float a=smoothstep(1.0,0.15,r)*vCol.a*n*(0.4+0.6*k); o=vec4(vCol.rgb*a,a); return; }
  float a=exp(-r*r*3.2)+0.6*exp(-r*r*18.0); a*=smoothstep(1.0,0.85,r); o=vec4(vCol.rgb*a*vCol.a*k,1.0); }`,
    downF: HDR + `in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uTx; uniform float uPre; uniform float uThr;
void main(){ vec2 h=uTx; vec3 s=texture(uT,vUv).rgb*4.0+texture(uT,vUv-h).rgb+texture(uT,vUv+h).rgb+texture(uT,vUv+vec2(h.x,-h.y)).rgb+texture(uT,vUv-vec2(h.x,-h.y)).rgb; s/=8.0;
  if(uPre>0.5){ s=min(s,vec3(24.0)); float br=max(s.r,max(s.g,s.b)); float kn=0.35; float sq=clamp(br-uThr+kn,0.0,2.0*kn); sq=sq*sq/(4.0*kn+1e-4); float w=max(sq,br-uThr)/max(br,1e-4); s*=w; }
  o=vec4(s,1.0); }`,
    upF: HDR + `in vec2 vUv; out vec4 o; uniform sampler2D uT; uniform vec2 uTx; uniform float uK;
void main(){ vec2 h=uTx; vec3 s=texture(uT,vUv+vec2(-2.0*h.x,0.0)).rgb+texture(uT,vUv+vec2(-h.x,h.y)).rgb*2.0+texture(uT,vUv+vec2(0.0,2.0*h.y)).rgb+texture(uT,vUv+vec2(h.x,h.y)).rgb*2.0
  +texture(uT,vUv+vec2(2.0*h.x,0.0)).rgb+texture(uT,vUv+vec2(h.x,-h.y)).rgb*2.0+texture(uT,vUv+vec2(0.0,-2.0*h.y)).rgb+texture(uT,vUv+vec2(-h.x,-h.y)).rgb*2.0; o=vec4(s/12.0*uK,1.0); }`,
    compF: HDR + `in vec2 vUv; out vec4 o; uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomK; uniform float uFxaa; uniform vec2 uTx; uniform float uDmg; uniform float uT; uniform float uVig; uniform float uExpo; uniform float uBloomOn;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
float lum(vec3 c){ return dot(c,vec3(0.299,0.587,0.114)); }
vec3 fxaa(vec2 uv){ vec3 rgbM=texture(uScene,uv).rgb; vec3 nw=texture(uScene,uv+vec2(-1.0,-1.0)*uTx).rgb, ne=texture(uScene,uv+vec2(1.0,-1.0)*uTx).rgb, sw=texture(uScene,uv+vec2(-1.0,1.0)*uTx).rgb, se=texture(uScene,uv+vec2(1.0,1.0)*uTx).rgb;
  float lNW=lum(min(nw,1.0)), lNE=lum(min(ne,1.0)), lSW=lum(min(sw,1.0)), lSE=lum(min(se,1.0)), lM=lum(min(rgbM,1.0));
  float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))), lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE)));
  vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE))); float red=max((lNW+lNE+lSW+lSE)*0.03125,0.0078125); float rcp=1.0/(min(abs(dir.x),abs(dir.y))+red);
  dir=clamp(dir*rcp,-8.0,8.0)*uTx; vec3 a=0.5*(texture(uScene,uv+dir*(1.0/3.0-0.5)).rgb+texture(uScene,uv+dir*(2.0/3.0-0.5)).rgb);
  vec3 b=a*0.5+0.25*(texture(uScene,uv+dir*-0.5).rgb+texture(uScene,uv+dir*0.5).rgb); float lb=lum(min(b,1.0)); return (lb<lMin||lb>lMax)?a:b; }
void main(){ vec3 c=uFxaa>0.5?fxaa(vUv):texture(uScene,vUv).rgb; if(uBloomOn>0.5) c+=texture(uBloom,vUv).rgb*uBloomK;
  c=aces(c*uExpo); vec2 q=vUv-0.5; float v=1.0-dot(q*vec2(1.0,1.15),q*vec2(1.0,1.15))*uVig; c*=clamp(v,0.0,1.0);
  c=mix(c,vec3(lum(c)*1.3,lum(c)*0.25,lum(c)*0.2)+vec3(0.12,0.0,0.0),uDmg);
  c=pow(c,vec3(1.0/2.2)); float n=fract(sin(dot(gl_FragCoord.xy+fract(uT)*61.0,vec2(12.9898,78.233)))*43758.5453); c+=(n-0.5)/255.0; o=vec4(c,1.0); }`,
  };

  /* ---------------- palettes (linear HDR) ---------------- */
  const PAL = {
    modern: {
      top: [0.002, 0.003, 0.012], hor: [0.018, 0.008, 0.04], haze: [0.11, 0.035, 0.17], fog: [0.04, 0.016, 0.07], grid: [0.42, 0.09, 0.85], ground: [0.003, 0.003, 0.008], refl: 0.66,
      moon: [1.0, 0.82, 0.55], star: [0.85, 0.92, 1.0], mTop: [0.035, 0.012, 0.05], mBot: [0.012, 0.004, 0.02], mLine: [1.6, 0.42, 0.7], mLine2: [0.5, 0.15, 0.5], lava: [3.2, 1.1, 0.25],
      obs: { line: [0.25, 1.05, 1.7], base: [0.012, 0.02, 0.04], rim: [0.05, 0.28, 0.45] },
      tank: { line: [0.35, 1.9, 0.6], base: [0.008, 0.035, 0.015], rim: [0.06, 0.5, 0.18] },
      super: { line: [2.1, 0.7, 0.14], base: [0.04, 0.012, 0.004], rim: [0.55, 0.16, 0.03] },
      missile: { line: [2.1, 1.7, 0.35], base: [0.04, 0.03, 0.006], rim: [0.5, 0.4, 0.08] },
      saucer: { line: [1.4, 0.55, 2.2], base: [0.03, 0.01, 0.05], rim: [0.4, 0.15, 0.6] },
      rival: { line: [0.45, 1.2, 2.3], base: [0.01, 0.025, 0.05], rim: [0.12, 0.35, 0.7] },
      logo: { line: [0.4, 1.6, 2.4], base: [0.01, 0.02, 0.05], rim: [0.2, 0.5, 0.9], emis: [0.0, 0.03, 0.08] },
      shellP: [2.6, 2.3, 1.5], shellE: [2.8, 0.7, 0.3], expo: 1.05, bloom: 0.95,
    },
    classic: {
      top: [0, 0, 0], hor: [0.0, 0.006, 0.0], haze: [0.0, 0.03, 0.006], fog: [0.0, 0.008, 0.002], grid: [0.06, 0.38, 0.1], ground: [0, 0.002, 0], refl: 0.78,
      moon: [0.45, 1.3, 0.5], star: [0.5, 1.0, 0.55], mTop: [0.0, 0.018, 0.004], mBot: [0, 0.004, 0], mLine: [0.3, 1.6, 0.4], mLine2: [0.1, 0.5, 0.15], lava: [0.7, 2.6, 0.6],
      obs: { line: [0.3, 1.7, 0.45], base: [0, 0.006, 0], rim: [0.02, 0.18, 0.04] },
      tank: { line: [0.3, 1.8, 0.45], base: [0, 0.006, 0], rim: [0.03, 0.25, 0.06] },
      super: { line: [0.45, 2.1, 0.5], base: [0, 0.008, 0], rim: [0.04, 0.3, 0.07] },
      missile: { line: [0.5, 2.2, 0.55], base: [0, 0.008, 0], rim: [0.04, 0.3, 0.07] },
      saucer: { line: [0.4, 2.0, 0.5], base: [0, 0.008, 0], rim: [0.04, 0.3, 0.07] },
      rival: { line: [0.6, 2.2, 0.7], base: [0, 0.01, 0], rim: [0.05, 0.35, 0.08] },
      logo: { line: [0.4, 2.0, 0.5], base: [0, 0.01, 0], rim: [0.03, 0.3, 0.06], emis: [0, 0.03, 0.005] },
      shellP: [1.2, 2.6, 1.2], shellE: [1.0, 2.6, 0.9], expo: 1.0, bloom: 0.85,
    },
  };
  const pal = () => PAL[R.palette] || PAL.modern;

  /* ---------------- GL helpers ---------------- */
  function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join(' ')); return s; }
  function program(vs, fs, attrs) {
    const p = gl.createProgram(); gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    (attrs || []).forEach((a, i) => gl.bindAttribLocation(p, i, a)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); const nm = inf.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, inf.name); }
    return { p, u };
  }
  let PR = {}, quadBuf = null, groundVao = null, emptyVao = null;
  const LINE_STRIDE = 12;
  function meshSet(tris, centers) { // tris: [px,py,pz,nx,ny,nz]*, optional centers per vertex (2)
    const n = tris.length / 6, data = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) { data.set(tris.subarray ? tris.subarray(i * 6, i * 6 + 6) : tris.slice(i * 6, i * 6 + 6), i * 8); if (centers) { data[i * 8 + 6] = centers[i * 2]; data[i * 8 + 7] = centers[i * 2 + 1]; } }
    const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindVertexArray(null); return { vao, b, n };
  }
  function lineSet(data, dynamic) {
    const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data || new Float32Array(LINE_STRIDE), dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const S = LINE_STRIDE * 4; [[1, 3, 0], [2, 3, 12], [3, 4, 24], [4, 2, 40]].forEach(([l, c, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, c, gl.FLOAT, false, S, o); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null); return { vao, b, n: data ? data.length / LINE_STRIDE : 0, cap: data ? data.length : LINE_STRIDE };
  }
  function linesFromModel(lines, k, cx, cz, ox, oz) {
    const out = new Float32Array(lines.length * LINE_STRIDE); let i = 0;
    for (const [a, b, w] of lines) { out.set([a[0] + (ox || 0), a[1], a[2] + (oz || 0), b[0] + (ox || 0), b[1], b[2] + (oz || 0), w * (k || 1), w * (k || 1), w * (k || 1), 1, cx || 0, cz || 0], i); i += LINE_STRIDE; }
    return out;
  }
  function fxSet() {
    const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf2); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, 48, gl.DYNAMIC_DRAW);
    [[1, 0], [2, 16], [3, 32]].forEach(([l, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 48, o); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null); return { vao, b, n: 0 };
  }
  let quadBuf2 = null;
  const MODELS = {}; let OBS = null, MOUNT = null, LOGO = null, DYN = null, FXG = null, FXS = null, LAVA = null;

  /* ---------------- render targets ---------------- */
  let FB = null;
  function tex(w, h, fmt) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (R.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t;
  }
  function fbo(t) { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }
  function freeTargets() {
    if (!FB) return; const f = FB;
    [f.msFb, f.resFb].concat(f.mips.map(m => m.fb)).forEach(x => x && gl.deleteFramebuffer(x));
    [f.msColor, f.msDepth, f.depthRb].forEach(x => x && gl.deleteRenderbuffer(x));
    [f.sceneTex].concat(f.mips.map(m => m.t)).forEach(x => x && gl.deleteTexture(x)); FB = null;
  }
  function makeTargets() {
    freeTargets(); const W = R.W, H = R.H, f = { mips: [] };
    const ifmt = R.hdr ? gl.RGBA16F : gl.RGBA8;
    f.sceneTex = tex(W, H); f.resFb = fbo(f.sceneTex);
    const samples = R.tier >= 1 ? R.samples : 0;
    if (samples > 0) {
      f.msFb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f.msFb);
      f.msColor = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, f.msColor); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, ifmt, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, f.msColor);
      f.msDepth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, f.msDepth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.msDepth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.deleteFramebuffer(f.msFb); f.msFb = null; }
    }
    if (!f.msFb) { gl.bindFramebuffer(gl.FRAMEBUFFER, f.resFb); f.depthRb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, f.depthRb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.depthRb); }
    f.samples = f.msFb ? samples : 0;
    const levels = R.tier >= 2 ? 6 : R.tier >= 1 ? 5 : 4;
    let w = W, h = H;
    for (let i = 0; i < levels; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); const t = tex(w, h); f.mips.push({ t, fb: fbo(t), w, h }); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); FB = f;
  }

  /* ---------------- static geometry ---------------- */
  function buildMountains() {
    const N = 240, RAD = 1000, pts = [];
    const VAZ = FX.VOLC.az;
    const noise = a => 22 + 16 * Math.sin(a * 3 + 1.3) + 11 * Math.sin(a * 7 + 0.4) + 7 * Math.sin(a * 13 + 2.2) + 4 * Math.sin(a * 29 + 0.9) + 2.5 * Math.sin(a * 61);
    for (let i = 0; i <= N; i++) {
      const a = i / N * Math.PI * 2; let h = Math.max(4, noise(a));
      const dv = Math.abs(Math.atan2(Math.sin(a - VAZ), Math.cos(a - VAZ)));
      if (dv < 0.16) { const k = 1 - dv / 0.16; h = Math.max(h, 30 + 78 * Math.min(1, k * 1.35)); if (dv < 0.018) h -= 9 * (1 - dv / 0.018); }
      pts.push([Math.sin(a) * RAD, h, -Math.cos(a) * RAD]);
    }
    const tris = [], lines = [];
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1], a0 = [a[0], -30, a[2]], b0 = [b[0], -30, b[2]];
      for (const p of [a0, b0, b, a0, b, a]) tris.push(p[0], p[1], p[2], 0, 0, 1);
      lines.push([a, b, 1]);
      if (i % 3 === 0 && a[1] > 30) { const m = [a[0] * 0.995, a[1] * 0.45, a[2] * 0.995]; lines.push([a, m, 0.35]); }
    }
    // tip of the volcano crater
    const tip = [Math.sin(VAZ) * RAD * 0.99, 98, -Math.cos(VAZ) * RAD * 0.99];
    return { tris: new Float32Array(tris), lines, tip };
  }
  function setObstacles(obs) {
    if (!gl) { R.pendingObs = obs; return; }
    const tris = [], cs = [], lines = [];
    for (const o of obs) {
      const m = Models.obstacle(o); const t = m.tris;
      for (let i = 0; i < t.length; i += 6) { tris.push(t[i] + o.x, t[i + 1], t[i + 2] + o.z, t[i + 3], t[i + 4], t[i + 5]); cs.push(o.x, o.z); }
      for (const [a, b, w] of m.lines) lines.push(a[0] + o.x, a[1], a[2] + o.z, b[0] + o.x, b[1], b[2] + o.z, w, w, w, 1, o.x, o.z);
      // a faint glowing base outline on the ground
      const g = 0.45; const c4 = [[-o.hx, 0.05, -o.hz], [o.hx, 0.05, -o.hz], [o.hx, 0.05, o.hz], [-o.hx, 0.05, o.hz]].map(p => [p[0] * 1.08 + o.x, p[1], p[2] * 1.08 + o.z]);
      for (let i = 0; i < 4; i++) { const a = c4[i], b = c4[(i + 1) & 3]; lines.push(a[0], a[1], a[2], b[0], b[1], b[2], g, g, g, 0.8, o.x, o.z); }
    }
    if (OBS) { gl.deleteBuffer(OBS.mesh.b); gl.deleteBuffer(OBS.lines.b); }
    OBS = { mesh: meshSet(new Float32Array(tris), cs), lines: lineSet(new Float32Array(lines)) };
  }
  function setup() {
    PR = {
      mesh: program(SH.meshV, SH.meshF, ['aP', 'aN', 'aC']),
      line: program(SH.lineV, SH.lineF, ['aQ', 'aA', 'aB', 'aCol', 'aCC']),
      ground: program(SH.groundV, SH.groundF, ['aP']),
      sky: program(SH.quadV, SH.skyF), mount: program(SH.mountV, SH.mountF, ['aP', 'aN', 'aC']),
      fx: program(SH.fxV, SH.fxF, ['aQ', 'aPS', 'aCol', 'aX']),
      down: program(SH.quadV, SH.downF), up: program(SH.quadV, SH.upF), comp: program(SH.quadV, SH.compF),
    };
    quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    quadBuf2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf2); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    groundVao = gl.createVertexArray(); gl.bindVertexArray(groundVao); const gb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
    emptyVao = gl.createVertexArray();
    for (const k of ['tank', 'radar', 'super', 'missile', 'saucer']) { const m = Models.M[k]; MODELS[k] = { mesh: meshSet(m.tris), lines: lineSet(linesFromModel(m.lines)) }; }
    MODELS.rival = MODELS.tank;
    const mt = buildMountains(); MOUNT = { mesh: meshSet(mt.tris), lines: lineSet(linesFromModel(mt.lines)), tip: mt.tip };
    const lg = Models.logo('VECTOR ARMOR'); LOGO = { mesh: meshSet(lg.tris), lines: lineSet(linesFromModel(lg.lines)) };
    DYN = lineSet(null, true); FXG = fxSet(); FXS = fxSet(); LAVA = fxSet();
    if (R.pendingObs) { setObstacles(R.pendingObs); R.pendingObs = null; }
  }

  function init(canvas, opts) {
    cv = canvas; opts = opts || {};
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance' });
      if (!gl) { R.err = 'WebGL2 unavailable'; return false; }
      R.hdr = !!gl.getExtension('EXT_color_buffer_float');
      let maxS = gl.getParameter(gl.MAX_SAMPLES) || 0;
      try { const s = gl.getInternalformatParameter(gl.RENDERBUFFER, R.hdr ? gl.RGBA16F : gl.RGBA8, gl.SAMPLES); if (s && s.length) maxS = Math.max(...s); } catch (e) { }
      R.samples = Math.min(4, maxS);
      setup();
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); R.ok = false; R.lost = true; FB = null; });
      canvas.addEventListener('webglcontextrestored', () => { try { R.lost = false; setup(); if (R.lastObs) setObstacles(R.lastObs); makeTargets(); R.ok = true; } catch (e) { R.err = String(e); } });
      R.ok = true; return true;
    } catch (e) { R.err = String(e && e.message || e); console.warn('[gl]', R.err); R.ok = false; return false; }
  }
  function resize(w, h, dpr) { R.W = Math.max(1, w | 0); R.H = Math.max(1, h | 0); R.dpr = dpr; if (R.ok) makeTargets(); }
  function setTier(t) { t = Math.max(0, Math.min(3, t)); if (t === R.tier) return; R.tier = t; FX.q.mul = [0.45, 0.65, 0.85, 1][t]; if (R.ok) makeTargets(); }

  /* ---------------- per-frame helpers ---------------- */
  const W_ = Sim.W, wd = Sim.wd;
  function lightsFor(cam) {
    const L = FX.LT.slice().sort((a, b) => b.int * b.life / b.max - a.int * a.life / a.max).slice(0, 4);
    const lp = new Float32Array(16), lc = new Float32Array(12);
    L.forEach((l, i) => { const k = l.life / l.max; lp.set([cam.x + wd(l.x - cam.x), l.y, cam.z + wd(l.z - cam.z), l.rad], i * 4); lc.set([l.col[0] * l.int * k, l.col[1] * l.int * k, l.col[2] * l.int * k], i * 3); });
    return { lp, lc };
  }
  const fxBufs = { g: new Float32Array(12 * 3000), s: new Float32Array(12 * 600), l: new Float32Array(12 * 700), d: new Float32Array(LINE_STRIDE * 2000) };
  function upload(set, arr, n) { gl.bindBuffer(gl.ARRAY_BUFFER, set.b); gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, Math.max(n, 1) * (set === DYN ? LINE_STRIDE : 12)), gl.DYNAMIC_DRAW); set.n = n; }

  function setCommon(pr, cam, V, P, fogOn) {
    const u = pr.u, p = pal();
    if (u.uFogD) gl.uniform1f(u.uFogD, 330); if (u.uFogOn) gl.uniform1f(u.uFogOn, fogOn === false ? 0 : 1);
    if (u.uWorld) gl.uniform1f(u.uWorld, W_); if (u.uCamXZ) gl.uniform2f(u.uCamXZ, cam.x, cam.z); if (u.uWrap) gl.uniform1f(u.uWrap, 0);
    if (u.uCam) gl.uniform3f(u.uCam, cam.x, cam.y, cam.z); if (u.uFogC) gl.uniform3fv(u.uFogC, p.fog);
    if (u.uV) gl.uniformMatrix4fv(u.uV, false, V); if (u.uP) gl.uniformMatrix4fv(u.uP, false, P);
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, M4.mul(P, V));
    if (u.uRes) gl.uniform2f(u.uRes, R.W, R.H);
    if (u.uMirror) gl.uniform1f(u.uMirror, 0); if (u.uM) gl.uniformMatrix4fv(u.uM, false, M4.id());
  }

  /* ---------------- frame ---------------- */
  /**
   * scene = { cam:{x,y,z,h,pitch,roll}, fovY, t, ents:[{type,x,y,z,h,spin}], shells:[{id,x,y,z,dx,dz,kind}], dmg, logo:{a,t} }
   */
  function frame(sc) {
    if (!R.ok || !FB) return;
    const p = pal(), cam = sc.cam, asp = R.W / R.H, t = sc.t || 0;
    const { V, P, rot, Pfar } = camMats(cam, sc.fovY, asp, 1500);
    const dpr = R.dpr, core = Math.max(0.8, 0.75 * dpr), lineW = core * 3.6;
    R.frames++;
    gl.bindFramebuffer(gl.FRAMEBUFFER, FB.msFb || FB.resFb); gl.viewport(0, 0, R.W, R.H);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.depthMask(false);

    // ---- sky
    const F = [Math.sin(cam.h) * Math.cos(cam.pitch || 0), Math.sin(cam.pitch || 0), -Math.cos(cam.h) * Math.cos(cam.pitch || 0)];
    const rl = cam.roll || 0, Rt0 = [Math.cos(cam.h), 0, Math.sin(cam.h)], Up0 = [-Math.sin(cam.pitch || 0) * Math.sin(cam.h), Math.cos(cam.pitch || 0), Math.sin(cam.pitch || 0) * Math.cos(cam.h)];
    const Rt = Rt0.map((v, i) => v * Math.cos(rl) + Up0[i] * Math.sin(rl)), Up = Up0.map((v, i) => v * Math.cos(rl) - Rt0[i] * Math.sin(rl));
    const ty = Math.tan(sc.fovY / 2);
    gl.useProgram(PR.sky.p); const su = PR.sky.u;
    gl.uniform3fv(su.uF, F); gl.uniform3fv(su.uR, Rt); gl.uniform3fv(su.uU, Up); gl.uniform2f(su.uTan, ty * asp, ty);
    gl.uniform3fv(su.uTop, p.top); gl.uniform3fv(su.uHor, p.hor); gl.uniform3fv(su.uHaze, p.haze); gl.uniform3fv(su.uMoonCol, p.moon); gl.uniform3fv(su.uStar, p.star); gl.uniform1f(su.uT, t);
    const ma = -0.78, me = 0.2; gl.uniform3f(su.uMoonDir, Math.sin(ma) * Math.cos(me), Math.sin(me), -Math.cos(ma) * Math.cos(me));
    gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- mountains (sky-box space, rotation only)
    const VPs = M4.mul(Pfar, rot);
    gl.useProgram(PR.mount.p); gl.uniformMatrix4fv(PR.mount.u.uVP, false, VPs); gl.uniform3fv(PR.mount.u.uTop, p.mTop); gl.uniform3fv(PR.mount.u.uBot, p.mBot); gl.uniform3fv(PR.mount.u.uHaze, p.haze);
    gl.bindVertexArray(MOUNT.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, MOUNT.mesh.n);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    drawLines(MOUNT.lines, { x: 0, y: 0, z: 0, h: 0 }, rot, Pfar, p.mLine, lineW * 0.85, core * 0.85, 1, false, null, false);
    // lava
    FX.volcanoTick(sc.dt || 0.016, MOUNT.tip);
    let n = 0; const L = fxBufs.l;
    for (const q of FX.LAVA) { if (n >= 700) break; const k = Math.max(0, q.life / q.max); L.set([q.x, q.y, q.z, q.size * (0.6 + 0.4 * k), p.lava[0] * k, p.lava[1] * k * k, p.lava[2] * k * k, 1, 3, q.vx * 0.6, q.vy * 0.6, q.vz * 0.6], n * 12); n++; }
    // the glow over the crater
    L.set([MOUNT.tip[0], MOUNT.tip[1] + 4, MOUNT.tip[2], 26 + 10 * Math.max(0, FX.VOLC.big), p.lava[0] * 0.25, p.lava[1] * 0.25, p.lava[2] * 0.25, 1, 0, 0, 0, 0], n * 12); n++;
    gl.useProgram(PR.fx.p); setCommon(PR.fx, { x: 0, y: 0, z: 0, h: 0 }, rot, Pfar, false);
    upload(LAVA, L, n); gl.bindVertexArray(LAVA.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.BLEND);

    // ---- world
    const lights = lightsFor(cam);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    const ents = sc.ents || [];
    const entM = e => { const x = cam.x + wd(e.x - cam.x), z = cam.z + wd(e.z - cam.z); return M4.mul(M4.tr(x, e.y || 0, z), M4.ry(-(e.h || 0))); };
    const drawWorldSolids = mirror => {
      gl.useProgram(PR.mesh.p); setCommon(PR.mesh, cam, V, P); const u = PR.mesh.u;
      gl.uniform1f(u.uMirror, mirror ? 1 : 0); gl.uniform3f(u.uLDir, 0.35, 0.8, -0.45); gl.uniform4fv(u.uLP, lights.lp); gl.uniform3fv(u.uLC, lights.lc);
      gl.uniform3fv(u.uBase, p.obs.base); gl.uniform3fv(u.uRim, p.obs.rim); gl.uniform3f(u.uEmis, 0, 0, 0); gl.uniform1f(u.uWrap, 1);
      gl.bindVertexArray(OBS.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, OBS.mesh.n); gl.uniform1f(u.uWrap, 0);
      for (const e of ents) {
        const md = MODELS[e.type]; if (!md) continue; const pc = p[e.type] || p.tank; const M = entM(e);
        gl.uniform3fv(u.uBase, pc.base); gl.uniform3fv(u.uRim, pc.rim); gl.uniform3f(u.uEmis, 0, 0, 0);
        const Mm = e.type === 'saucer' ? M4.mul(M, M4.ry(e.spin || 0)) : e.type === 'missile' ? M4.mul(M, M4.rz(e.spin || 0)) : M;
        gl.uniformMatrix4fv(u.uM, false, Mm); gl.bindVertexArray(md.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, md.mesh.n);
        if (e.type === 'tank') { gl.uniformMatrix4fv(u.uM, false, M4.chain(M, M4.tr(0, 3.35, 1.0), M4.ry(e.spin || 0))); gl.bindVertexArray(MODELS.radar.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, MODELS.radar.mesh.n); }
      }
      if (sc.logo && !mirror) {
        const lm = logoM(sc, cam); gl.uniform3fv(u.uBase, p.logo.base); gl.uniform3fv(u.uRim, p.logo.rim); gl.uniform3fv(u.uEmis, p.logo.emis);
        gl.uniformMatrix4fv(u.uM, false, lm); gl.bindVertexArray(LOGO.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, LOGO.mesh.n);
      }
    };
    const drawWorldLines = (mirror, alpha) => {
      drawLines(OBS.lines, cam, V, P, p.obs.line, lineW, core, alpha, mirror, null, true);
      for (const e of ents) {
        const md = MODELS[e.type]; if (!md) continue; const pc = p[e.type] || p.tank, M = entM(e);
        const Mm = e.type === 'saucer' ? M4.mul(M, M4.ry(e.spin || 0)) : e.type === 'missile' ? M4.mul(M, M4.rz(e.spin || 0)) : M;
        drawLines(md.lines, cam, V, P, pc.line, lineW, core, alpha, mirror, Mm, false);
        if (e.type === 'tank') drawLines(MODELS.radar.lines, cam, V, P, pc.line, lineW, core, alpha, mirror, M4.chain(M, M4.tr(0, 3.35, 1.0), M4.ry(e.spin || 0)), false);
      }
    };
    // reflections first (mirrored below the ground plane), then the glossy ground over them
    if (R.tier >= 2) {
      gl.depthMask(true); drawWorldSolids(true);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); drawWorldLines(true, 0.45); gl.depthMask(true);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(PR.ground.p); setCommon(PR.ground, cam, V, P); const gu = PR.ground.u;
    gl.uniform3fv(gu.uGrid, p.grid); gl.uniform3fv(gu.uGround, p.ground); gl.uniform1f(gu.uRefl, R.tier >= 2 ? p.refl : 1); gl.uniform1f(gu.uLw, Math.max(1.1, dpr * 0.85)); gl.uniform1f(gu.uT, t);
    gl.uniform4fv(gu.uLP, lights.lp); gl.uniform3fv(gu.uLC, lights.lc);
    gl.bindVertexArray(groundVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 2.0);
    drawWorldSolids(false);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
    drawWorldLines(false, 1);
    if (sc.logo) drawLines(LOGO.lines, cam, V, P, p.logo.line, lineW * 1.15, core * 1.15, sc.logo.a == null ? 1 : sc.logo.a, false, logoM(sc, cam), false);

    // ---- dynamic lines: tracer trails + tumbling debris
    const D = fxBufs.d; let dn = 0;
    const pushL = (a, b, c, w) => { if (dn >= 2000) return; D.set([cam.x + wd(a[0] - cam.x), a[1], cam.z + wd(a[2] - cam.z), cam.x + wd(b[0] - cam.x) + (wd(b[0] - a[0]) - (b[0] - a[0])) * 0, b[1], 0, c[0], c[1], c[2], w, 0, 0], dn * LINE_STRIDE);
      // keep b next to a across the wrap seam
      const ax = D[dn * LINE_STRIDE], az = D[dn * LINE_STRIDE + 2]; D[dn * LINE_STRIDE + 3] = ax + wd(b[0] - a[0]); D[dn * LINE_STRIDE + 5] = az + wd(b[2] - a[2]); dn++; };
    for (const [, tr] of FX.TR) {
      const pts = tr.pts, nP = pts.length; if (nP < 2) continue;
      for (let i = 1; i < nP; i++) { const k = i / nP * tr.fade; pushL(pts[i - 1], pts[i], [tr.col[0] * k * k, tr.col[1] * k * k, tr.col[2] * k * k], 0.5 + 0.7 * k); }
    }
    for (const d of FX.D) {
      const k = Math.min(1, d.life / 1.2); const c = [d.col[0] * k * 1.2, d.col[1] * k * 1.2, d.col[2] * k * 1.2];
      for (const sg of FX.debrisSegs(d)) pushL(sg[0], sg[1], c, 0.9);
    }
    if (dn) { upload(DYN, D, dn); drawLines(DYN, cam, V, P, [1, 1, 1], lineW, core, 1, false, null, false); }

    // ---- particles: smoke (premultiplied alpha), then additive glow (sparks, flashes, shells, rings)
    gl.useProgram(PR.fx.p); setCommon(PR.fx, cam, V, P);
    const S = fxBufs.s; let sn = 0;
    for (const s of FX.S) { if (sn >= 600) break; const k = s.life / s.max, a = s.a * Math.min(1, k * 2) * Math.min(1, (s.max - s.life) * 4);
      S.set([cam.x + wd(s.x - cam.x), s.y, cam.z + wd(s.z - cam.z), s.size, s.col[0], s.col[1], s.col[2], a, 2, s.rot, 0, 0], sn * 12); sn++; }
    if (sn) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); upload(FXS, S, sn); gl.bindVertexArray(FXS.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sn); }
    const G = fxBufs.g; let gn = 0;
    const pushG = (x, y, z, s, c, a, type, ex, ey, ez) => { if (gn >= 3000) return; G.set([cam.x + wd(x - cam.x), y, cam.z + wd(z - cam.z), s, c[0], c[1], c[2], a, type, ex || 0, ey || 0, ez || 0], gn * 12); gn++; };
    for (const q of FX.P) { const k = q.life / q.max; pushG(q.x, q.y, q.z, q.size, q.col, q.a * Math.min(1, k * 1.6), q.streak ? 3 : 0, q.vx, q.vy, q.vz); }
    for (const r of FX.RG) { const k = r.life / r.max; pushG(r.x, r.y, r.z, r.r, r.col, k * k, 1); }
    for (const s of sc.shells || []) { const c = s.kind === 'player' ? p.shellP : p.shellE; pushG(s.x, s.y, s.z, 1.6, c, 1, 0); pushG(s.x, s.y, s.z, 4.5, c, 0.35, 0); }
    if (gn) { gl.blendFunc(gl.ONE, gl.ONE); upload(FXG, G, gn); gl.bindVertexArray(FXG.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, gn); }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);

    post(sc, p, t);
    gl.bindVertexArray(null);
  }
  function logoM(sc, cam) {
    const lt = sc.logo.t || 0, f = [Math.sin(cam.h), -Math.cos(cam.h)], d = 62;
    const x = cam.x + f[0] * d, z = cam.z + f[1] * d;
    return M4.chain(M4.tr(x, cam.y + (sc.logo.y || 10.5) + Math.sin(lt * 0.9) * 0.4, z), M4.ry(-cam.h + Math.sin(lt * 0.5) * 0.10), M4.rx(0.10 + Math.sin(lt * 0.7) * 0.04), M4.sc(sc.logo.s || 1.05));
  }
  function drawLines(set, cam, V, P, tint, w, core, alpha, mirror, M, wrapOn) {
    if (!set || !set.n) return;
    gl.useProgram(PR.line.p); const u = PR.line.u; setCommon(PR.line, cam, V, P, cam.y !== 0 || cam.x !== 0);
    gl.uniform1f(u.uWrap, wrapOn ? 1 : 0); gl.uniform1f(u.uMirror, mirror ? 1 : 0); gl.uniform3fv(u.uTint, tint);
    gl.uniform1f(u.uWidth, w); gl.uniform1f(u.uCore, core); gl.uniform1f(u.uAlpha, alpha); gl.uniformMatrix4fv(u.uM, false, M || M4.id());
    gl.bindVertexArray(set.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, set.n);
  }
  function quad() { gl.bindVertexArray(emptyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); }
  function post(sc, p, t) {
    if (FB.msFb) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, FB.msFb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, FB.resFb); gl.blitFramebuffer(0, 0, R.W, R.H, 0, 0, R.W, R.H, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    const bloomOn = R.tier >= 0;
    if (bloomOn) {
      gl.useProgram(PR.down.p); let src = FB.sceneTex, sw = R.W, sh = R.H;
      FB.mips.forEach((m, i) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.viewport(0, 0, m.w, m.h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(PR.down.u.uT, 0);
        gl.uniform2f(PR.down.u.uTx, 1 / sw, 1 / sh); gl.uniform1f(PR.down.u.uPre, i === 0 ? 1 : 0); gl.uniform1f(PR.down.u.uThr, 0.75); quad();
        src = m.t; sw = m.w; sh = m.h;
      });
      gl.useProgram(PR.up.p); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = FB.mips.length - 1; i > 0; i--) {
        const s = FB.mips[i], d = FB.mips[i - 1]; gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.w, d.h);
        gl.bindTexture(gl.TEXTURE_2D, s.t); gl.uniform1i(PR.up.u.uT, 0); gl.uniform2f(PR.up.u.uTx, 1 / s.w, 1 / s.h); gl.uniform1f(PR.up.u.uK, 1.0); quad();
      }
      gl.disable(gl.BLEND);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, R.W, R.H);
    gl.useProgram(PR.comp.p); const u = PR.comp.u;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, FB.sceneTex); gl.uniform1i(u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, FB.mips[0].t); gl.uniform1i(u.uBloom, 1);
    gl.uniform1f(u.uBloomK, p.bloom * (sc.bloomK || 1)); gl.uniform1f(u.uBloomOn, bloomOn ? 1 : 0); gl.uniform1f(u.uFxaa, FB.samples ? 0 : 1); gl.uniform2f(u.uTx, 1 / R.W, 1 / R.H);
    gl.uniform1f(u.uDmg, sc.dmg || 0); gl.uniform1f(u.uT, t); gl.uniform1f(u.uVig, 0.55); gl.uniform1f(u.uExpo, p.expo * (sc.expo || 1));
    quad(); gl.activeTexture(gl.TEXTURE0);
  }
  /** adaptive quality: call once per displayed frame with the frame time */
  function perf(dt) {
    if (R.lockTier) return;
    const fps = 1 / Math.max(dt, 1e-3); R.fps = R.fps * 0.92 + fps * 0.08;
    if (R.fps < 45) { R.fpsLow += dt; if (R.fpsLow > 3 && R.tier > 0) { setTier(R.tier - 1); R.fpsLow = 0; R.fps = 50; } } else R.fpsLow = 0;
  }
  return { R, PAL, init, resize, frame, setObstacles: o => { R.lastObs = o; setObstacles(o); }, setTier, perf, get gl() { return gl; }, get FB() { return FB; } };
})();
