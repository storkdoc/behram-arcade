// VORTEX day 10: enemy shots telegraph with a charge-up before release.
const { chromium, devices } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8137';
(async()=>{const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let ok=true; const check=(c,m)=>{ok=ok&&c;console.log((c?'PASS ':'FAIL ')+m);};
for (const [name,opt] of [['desktop',{viewport:{width:1440,height:900}}],['iPhone 14',devices['iPhone 14']],['iPhone 14 landscape',devices['iPhone 14 landscape']]]){
 const ctx=await b.newContext(opt),p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 await p.goto(BASE+'/games/tube-shooter/?debug=1',{waitUntil:'load'});await p.waitForTimeout(500);
 await p.evaluate(()=>{window.__noWarp=true;window.__noTokens=true;VORTEX.freeze(true);VORTEX.setLives(9);VORTEX.gotoLevel(6);VORTEX.step(4,()=>VORTEX.state.state==='play');VORTEX.emptyField();VORTEX.step(1/60);});
 const r=await p.evaluate(()=>{
   const out={st:VORTEX.state.state,en:VORTEX.enemyList().length}; const pl=VORTEX.playerLane(); const c0=VORTEX.eshotCharges(); const n0=VORTEX.eshotList().length;
   const id=VORTEX.spawn('tanker',pl+3,0.6);
   // step until a charge starts (random fire), max 30 s
   let t=0; while(VORTEX.eshotCharges()===c0 && t<30){VORTEX.setEnemy(id,{z:0.6,dead:false});VORTEX.step(1/60);t+=1/60;}
   out.started=VORTEX.eshotCharges()>c0; out.shotsAtStart=VORTEX.eshotList().length-n0; out.charging=VORTEX.chargingList().length;
   let dt=0; while(VORTEX.eshotList().length===n0 && dt<1){VORTEX.setEnemy(id,{z:0.6,dead:false});VORTEX.step(1/120);dt+=1/120;}
   out.delay=+dt.toFixed(3); out.fired=VORTEX.eshotList().length>n0; return out;});
 check(r.started&&r.shotsAtStart===0&&r.charging===1,`${name}: charge starts with no shot yet ${JSON.stringify(r)}`);
 check(r.fired&&r.delay>=0.25&&r.delay<=0.36,`${name}: shot releases ~0.3 s after charge (${r.delay}s)`);
 await p.evaluate(()=>{VORTEX.freeze(false)}); await p.screenshot({path:require('os').tmpdir()+'/vortex-charge-'+name.replace(/ /g,'')+'.png'});
 check(!errs.length,`${name}: no console errors ${errs}`);
 await ctx.close();}
await b.close();console.log(ok?'ALL PASSED':'FAILED');process.exit(ok?0:1)})();
