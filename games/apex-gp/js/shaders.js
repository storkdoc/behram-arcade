/* APEX GRAND PRIX — shaders.js (GLSL ES 3.00 sources used by scene.js) */
const SH = {
mesh_vs: `
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in float aM;
uniform mat4 uVP, uModel;
out vec3 vWP, vN, vC, vLP; flat out int vM;
void main(){ vec4 w = uModel*vec4(aP,1.); vWP = w.xyz; vN = transpose(inverse(mat3(uModel)))*aN; vC = aC; vLP = aP; vM = int(aM+.5); gl_Position = uVP*w; }`,
mesh_fs: `
in vec3 vWP, vN, vC, vLP; flat in int vM;
uniform vec3 uPaint, uAccent, uTire; uniform float uBrake, uBlur, uAlpha, uLit, uSnow, uNoFog;
out vec4 o;
vec3 L(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 alb = L(vC); float spec=.3, shin=30., refl=.1; vec3 emis = vec3(0.);
  if(vM==0){ alb = L(uPaint); spec=1.; shin=110.; refl=.6; }
  else if(vM==1){ alb = L(uAccent); spec=1.; shin=110.; refl=.6; }
  else if(vM==2){ vec2 w = floor(vLP.xz*55.+vLP.y*55.); float ch = mod(w.x+w.y, 2.); alb = vec3(.018+.012*ch); spec=.8; shin=70.; refl=.35; }
  else if(vM==3){ alb = vec3(.5,.52,.55); spec=1.; shin=80.; refl=.7; }
  else if(vM==4){
    float rad = length(vLP.yz), side = abs(vLP.x);
    float a = atan(vLP.y, vLP.z);
    alb = vec3(.028); spec=.15; shin=10.; refl=.04;
    if(side > .49){
      if(rad < .66){ float sp = smoothstep(.55,.8, abs(cos(a*2.5))); sp = mix(sp, .45, uBlur); alb = mix(vec3(.02), vec3(.12,.12,.13), sp) * (rad<.18?2.5:1.); spec=.9; shin=60.; refl=.45; }
      else if(rad > .80 && rad < .87){ float gap = step(.18, fract(a/6.28318*2.)); alb = mix(alb, L(uTire), mix(gap, .82, uBlur)); }
    }
  }
  else if(vM==5){ alb = vec3(.05,.0,.0); emis = vec3(1.,.04,.02)*(.25 + uBrake*9.); spec=1.; shin=90.; }
  else if(vM==6){ spec=.3; shin=30.; refl=.1; }
  else if(vM==7){ spec=.04; shin=6.; refl=0.; alb *= .85 + .3*vnoise(vWP.xz*.7+vWP.y); }
  else if(vM==8){ float on = step(vC.r + .5, uLit); alb = vec3(.02); emis = vec3(1.,.03,.01)*on*12.; spec=1.; shin=120.; refl=.5; }
  else if(vM==9){
    float h = vC.x, ang = atan(vLP.z, vLP.x);
    float n = fbm(vec2(ang*38., h*6.), 5), n2 = fbm(vWP.xz*.0015, 3);
    float snow = smoothstep(uSnow-.03, uSnow+.03, h + (n-.5)*.32*(1.-h*.3));
    vec3 rock = mix(vec3(.11,.105,.12), vec3(.2,.17,.15), n2);
    vec3 forest = mix(vec3(.04,.09,.04), vec3(.08,.12,.06), n);
    vec3 base = mix(forest, rock, smoothstep(.12, .35, h + (n2-.5)*.2) * (1. - vC.z*.8));
    alb = mix(base, vec3(.86,.89,.95), snow); spec = snow*.4; shin = 20.; refl = 0.;
  }
  else if(vM==10){
    vec2 q = vec2((vWP.x+vWP.z)*1.9, vWP.y*1.15+.3); vec2 c = floor(q), f = fract(q);
    float r = hash(c), g = hash(c+7.1), b = hash(c+3.3);
    vec3 shirt = mix(vec3(.25,.25,.3), vec3(.35+.6*r, .3+.6*g, .3+.65*b), step(.2, r));
    float body = smoothstep(.12,.2,f.x)*smoothstep(.88,.8,f.x)*smoothstep(.05,.15,f.y)*smoothstep(.85,.7,f.y);
    float head = 1.-smoothstep(.12,.18, length((f-vec2(.5,.78))*vec2(1.,1.3)));
    vec3 cc = mix(vec3(.55,.56,.6)*.5, shirt, body); cc = mix(cc, vec3(.85,.65,.5), head*step(.15,g));
    float fw = fwidth(q.x)+fwidth(q.y); alb = L(mix(cc, vec3(.42,.4,.42), smoothstep(.4, 1.2, fw))); spec=.02; refl=0.; }
  else if(vM==11){ alb = vec3(.01); spec=1.; shin=200.; refl=.9; }
  else if(vM==12){ spec=1.; shin=140.; refl=.55; }
  else if(vM==13){ alb = L(vC)*.06; emis = L(vC)*1.4; }
  float sh = shadowAt(vWP, N);
  vec3 c = lit(alb, N, vWP, spec, shin, refl, sh) + emis;
  if(uNoFog < .5) c = applyFog(c, vWP);
  o = vec4(c, uAlpha);
}`,
ground_vs: `
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV; layout(location=3) in float aG;
uniform mat4 uVP;
out vec3 vWP, vN; out vec2 vUV; out float vG;
void main(){ vWP = aP; vN = aN; vUV = aUV; vG = aG; gl_Position = uVP*vec4(aP,1.); }`,
ground_fs: `
in vec3 vWP, vN; in vec2 vUV; in float vG;
uniform float uL, uHalf, uEdge, uSea, uTheme;
out vec4 o;
vec3 L(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  float d = vUV.x, s = vUV.y, ad = abs(d);
  vec3 N = normalize(vN), alb; float spec=.04, shin=6., refl=0.;
  float dist = length(vWP - uCam);
  float fw = max(fwidth(s), fwidth(d)) + 1e-4, det = clamp(1. - fw*1.5, 0., 1.);
  if(d > 1500.){ // ocean
    vec2 p = vWP.xz*.03; float t = uTime*.6;
    float hx = vnoise(p*4.+vec2(t,0.)) - vnoise(p*4.+vec2(t+.15,0.)), hz = vnoise(p*4.+vec2(0.,t*.8)) - vnoise(p*4.+vec2(.15,t*.8));
    float fall = clamp(1.-dist/5000., 0., 1.);
    N = normalize(vec3(hx*1.4*fall, 1., hz*1.4*fall));
    alb = L(vec3(.03,.12,.2)); spec = 2.; shin = 300.; refl = 1.;
  } else if(d > 900.){ // terrain
    float n = fbm(vWP.xz*.004, 4), n2 = vnoise(vWP.xz*.08);
    vec3 meadow = mix(L(vec3(.27,.45,.15)), L(vec3(.42,.5,.22)), n);
    vec3 forest = mix(L(vec3(.06,.18,.06)), L(vec3(.12,.24,.08)), n2);
    alb = mix(meadow, forest, smoothstep(.45,.6, n + vG*.4)) * (.85+.25*n2*det);
    if(uTheme > 1.5) alb = mix(alb, L(vec3(.5,.5,.48)), smoothstep(.55,.9, 1.-N.y + n*.3));
    if(uSea > -999. && vWP.y < uSea + 2.5){ alb = mix(L(vec3(.75,.68,.5)), alb, smoothstep(uSea+.5, uSea+2.5, vWP.y)); }
  } else if(ad < uHalf){
    vec2 wp = vWP.xz;
    float g = vnoise(wp*2.7)*.55 + vnoise(wp*13.)*.45*det;
    vec3 asph = vec3(.062,.064,.07) * (.82 + (g-.5)*.5);
    asph *= 1. - .3*exp(-d*d/5.) * (.6 + .4*vnoise(vec2(s*.03, d*.5)));          // rubbered-in racing line
    asph *= 1. - .12*smoothstep(.6,.9, vnoise(wp*.15));                            // patches / repairs
    float lanes = min(abs(d-2.5), abs(d+2.5));
    float dash = smoothstep(.0, .02+fw*.02, fract(s/12.)) * (1.-smoothstep(.5-fw*.02, .52, fract(s/12.)));
    float aa = .02 + fw*.6;
    float lm = (1.-smoothstep(.11-aa, .11+aa, lanes)) * dash;
    float em = 1.-smoothstep(.16-aa, .16+aa, abs(ad-(uHalf-.5)));
    float ss = mod(s, uL);
    float chk = 0.; if(ss < 2.4){ chk = mod(floor(d/.8) + floor(ss/.8), 2.); }
    float paint = max(max(lm, em), 0.);
    alb = mix(asph, L(vec3(.82,.82,.8)), paint*.95);
    if(ss < 2.4) alb = mix(L(vec3(.85)), vec3(.015), chk);
    // grid slots (behind the line)
    float gb = uL - ss; if(gb > 6. && gb < 80.){ float k = mod(gb-6., 9.); float side = (mod(floor((gb-6.)/9.),2.) < .5) ? -1. : 1.; float bx = 1.-smoothstep(.1-aa,.1+aa, abs(k-.0)); bx *= step(abs(d - side*3.2), 1.3); alb = mix(alb, L(vec3(.85)), bx*.9); }
    spec = .5 + paint*.3; shin = 22.; refl = .05;
  } else if(ad < uEdge){
    float st = step(.5, fract(s/3.));
    alb = st > .5 ? L(vec3(.86,.1,.07)) : L(vec3(.92,.92,.9));
    float t = (ad - uHalf)/(uEdge-uHalf); N = normalize(N + vec3(0.,0.,0.) ); spec=.6; shin=30.; refl=.06;
    alb *= .8 + .2*smoothstep(0.,.25,t)*smoothstep(1.,.75,t);
  } else {
    float side = sign(d);
    bool gravel = vG*side > .5 && ad < uEdge + 17.;
    if(gravel){ float n = vnoise(vWP.xz*6.)*.6 + vnoise(vWP.xz*31.)*.4*det; alb = L(vec3(.6,.55,.45)) * (.75 + .5*n); }
    else {
      float stripe = mod(floor(s/14.), 2.);
      vec3 g1 = L(vec3(.20,.42,.12)), g2 = L(vec3(.25,.48,.15));
      alb = mix(g1, g2, stripe*smoothstep(60., 30., ad));
      float n = fbm(vWP.xz*.05, 3); alb *= .8 + .4*n;
      alb *= .9 + .2*vnoise(vWP.xz*3.)*det;
      alb = mix(alb, L(vec3(.92)), (1.-smoothstep(.1, .1+fw*.6, abs(ad - uEdge - .4))) * .0);
    }
  }
  float sh = shadowAt(vWP, N);
  vec3 c = lit(alb, N, vWP, spec, shin, refl, sh);
  o = vec4(applyFog(c, vWP), 1.);
}`,
sky_vs: `
layout(location=0) in vec2 aP; out vec2 vP;
void main(){ vP = aP; gl_Position = vec4(aP, 1., 1.); }`,
sky_fs: `
in vec2 vP; uniform mat4 uInvVP; uniform float uCloud, uCloudOct; out vec4 o;
void main(){
  vec4 w = uInvVP*vec4(vP, 1., 1.); vec3 r = normalize(w.xyz/w.w - uCam);
  float y = r.y, sd = max(dot(r, uSun), 0.);
  vec3 c = mix(uHorizon, uZenith, pow(smoothstep(-.02, .6, y), .55));
  c = mix(c, uFog, smoothstep(.06, -.02, y));
  c += uSunCol*(pow(sd, 6.)*.18 + pow(sd, 60.)*.35);
  float disc = smoothstep(.99955, .9997, sd); c += uSunCol*disc*30.;
  if(y > 0.){
    vec2 cp = r.xz/(y+.08)*.9 + uTime*vec2(.006,.002);
    float n = fbm(cp*1.7, int(uCloudOct)), n2 = fbm(cp*5.3+3., 3);
    float cl = smoothstep(uCloud, uCloud+.28, n*.85 + n2*.22);
    float thick = smoothstep(uCloud+.05, uCloud+.5, n);
    vec3 cc = mix(vec3(1.), uHorizon*.75, thick*.6) * (uSunCol*.55 + uAmbTop*1.2);
    cc += uSunCol*pow(sd, 5.)*.9*(1.-thick);
    c = mix(c, cc, cl*smoothstep(0., .12, y)*.95);
  }
  o = vec4(c, 1.);
}`,
depth_vs: `
layout(location=0) in vec3 aP; uniform mat4 uLVPM;
void main(){ gl_Position = uLVPM*vec4(aP,1.); }`,
depth_fs: `out vec4 o; void main(){ o = vec4(1.); }`,
tex_vs: `
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV;
uniform mat4 uVP; out vec3 vWP, vN; out vec2 vUV;
void main(){ vWP = aP; vN = aN; vUV = aUV; gl_Position = uVP*vec4(aP,1.); }`,
tex_fs: `
in vec3 vWP, vN; in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main(){
  vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
  vec3 alb = pow(texture(uTex, vUV).rgb, vec3(2.2));
  vec3 c = lit(alb, N, vWP, .35, 30., .06, shadowAt(vWP, N));
  o = vec4(applyFog(c, vWP), 1.);
}`,
part_vs: `
layout(location=0) in vec3 aP; layout(location=1) in float aS; layout(location=2) in vec4 aC;
uniform mat4 uVP; uniform float uScale; out vec4 vC; out vec3 vWP;
void main(){ vC = aC; vWP = aP; gl_Position = uVP*vec4(aP,1.); gl_PointSize = clamp(aS*uScale/gl_Position.w, 1., 900.); }`,
part_fs: `
in vec4 vC; in vec3 vWP; uniform float uAdd; out vec4 o;
void main(){
  vec2 q = gl_PointCoord*2.-1.; float r = dot(q,q); if(r > 1.) discard;
  float a = uAdd > .5 ? pow(1.-r, 2.) : (1.-r)*(1.-r)*(.75+.25*vnoise(q*3.+vC.rg*9.));
  vec3 c = vC.rgb;
  if(uAdd < .5){ vec3 v = vWP - uCam; float d = length(v); c = mix(c, uFog, clamp(1.-exp(-pow(d*uFogD,1.35)),0.,1.)); o = vec4(c, vC.a*a); }
  else o = vec4(c*vC.a*a, 0.);
}`,
decal_vs: `
layout(location=0) in vec3 aP; layout(location=1) in vec3 aT;
uniform mat4 uVP; out vec3 vT;
void main(){ vT = aT; gl_Position = uVP*vec4(aP,1.); }`,
decal_fs: `
in vec3 vT; out vec4 o;
void main(){ float r = length(vT.xy); float a = vT.z*(1.-smoothstep(.35, 1., r)); o = vec4(vec3(.004), a); }`,
post_vs: `
layout(location=0) in vec2 aP; out vec2 vUV;
void main(){ vUV = aP*.5+.5; gl_Position = vec4(aP, 0., 1.); }`,
bright_fs: `
in vec2 vUV; uniform sampler2D uSrc; uniform vec2 uPx; out vec4 o;
void main(){
  vec3 c = (texture(uSrc, vUV+uPx*vec2(-1,-1)).rgb + texture(uSrc, vUV+uPx*vec2(1,-1)).rgb + texture(uSrc, vUV+uPx*vec2(-1,1)).rgb + texture(uSrc, vUV+uPx*vec2(1,1)).rgb)*.25;
  float l = max(c.r, max(c.g, c.b)); o = vec4(c*max(l-1.1, 0.)/max(l, 1e-3), 1.);
}`,
blur_fs: `
in vec2 vUV; uniform sampler2D uSrc; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 c = texture(uSrc, vUV).rgb*.227;
  c += (texture(uSrc, vUV+uDir*1.385).rgb + texture(uSrc, vUV-uDir*1.385).rgb)*.316;
  c += (texture(uSrc, vUV+uDir*3.23).rgb + texture(uSrc, vUV-uDir*3.23).rgb)*.07;
  o = vec4(c, 1.);
}`,
final_fs: `
in vec2 vUV; uniform sampler2D uSrc, uBloom; uniform float uBlurAmt, uBlurN, uBloomK, uVig, uAspect, uSunVis, uHDR, uRed;
uniform vec2 uCtr, uSunUV; uniform vec3 uSunC; out vec4 o;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
void main(){
  vec3 c = texture(uSrc, vUV).rgb;
  if(uBlurAmt > .001){
    vec2 dv = uCtr - vUV; float m = smoothstep(.12, .55, length(dv*vec2(uAspect,1.)));
    vec3 acc = c; float wsum = 1.;
    for(int i=1;i<12;i++){ if(float(i) >= uBlurN) break; float f = float(i)/uBlurN; acc += texture(uSrc, vUV + dv*f*uBlurAmt*m).rgb; wsum += 1.; }
    c = acc/wsum;
  }
  c += texture(uBloom, vUV).rgb*uBloomK;
  if(uSunVis > .001){
    vec2 d = (vUV - uSunUV)*vec2(uAspect,1.); float r = length(d);
    c += uSunC*uSunVis*(exp(-r*9.)*.6 + exp(-r*2.5)*.05);
    float ang = atan(d.y, d.x); c += uSunC*uSunVis*pow(abs(cos(ang*4.+.3)), 60.)*exp(-r*4.)*.35;
    c += uSunC*uSunVis*exp(-abs(d.y)*90.)*exp(-abs(d.x)*1.6)*.18;
    vec2 ax = vec2(.5) - uSunUV;
    for(int i=0;i<6;i++){
      float f = .35 + float(i)*.33; float sz = .015 + .03*fract(float(i)*.618);
      vec2 gp = uSunUV + ax*f*2.; float gr = length((vUV-gp)*vec2(uAspect,1.));
      vec3 tint = i==1 ? vec3(.3,.6,1.) : i==3 ? vec3(1.,.5,.2) : i==4 ? vec3(.4,1.,.5) : vec3(.8,.7,1.);
      c += tint*uSunVis*.05*smoothstep(sz, sz*.6, gr) + tint*uSunVis*.03*smoothstep(sz*.12, 0., abs(gr-sz*1.6));
    }
  }
  c *= 1. + uRed*vec3(.6,-.3,-.3);
  if(uHDR > .5) c = aces(c*1.05);
  else c = clamp(c, 0., 1.);
  vec2 q = vUV - .5; c *= 1. - uVig*dot(q*vec2(uAspect*.8,1.), q*vec2(uAspect*.8,1.))*1.4;
  c = pow(max(c, 0.), vec3(1./2.2));
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
  o = vec4(c, 1.);
}`,
};
