// Node harness: run AI-vs-AI games through the real sim code and report stats.
const fs = require('fs'), vm = require('vm');
const ctx = { console, Math, Object, Array, JSON, window: {}, SHOW: process.env.SHOW || '' }; vm.createContext(ctx);
for (const f of ['font', 'field', 'plays', 'ai', 'sim']) vm.runInContext(fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8').replace(/^const (\w+) =/mg, 'var $1 ='), ctx, { filename: f });
const N = +process.argv[2] || 5;
vm.runInContext(`
var agg = {}, results = [], gains={}, cur=null;
function bump(k){ agg[k]=(agg[k]||0)+1; }
for (let g=0; g<${N}; g++){
  Sim.newGame({ human:[false,false], qLen:180 });
  let last=null, steps=0, seenSeq=0;
  while(!Sim.G.over && steps < 120*60*40){
    Sim.update(1/120, [null,null]); steps++;
    for (const e of Sim.G.events) if (e.s>seenSeq){ seenSeq=e.s; if(['td','int','fgGood','groan','first','catch','incomplete','hit','kick'].includes(e.n)) bump(e.n); }
    if (Sim.G.phase==='live' && last!=='live' && Sim.G.play.o){ cur={id:Sim.G.play.o.id, d:Sim.G.play.d.id, los:Sim.G.los, dir:Sim.G.off===0?1:-1}; }
    if (Sim.G.phase==='result' && last!=='result'){ bump('R:'+Sim.G.resultInfo.txt.replace(/[0-9]+/g,'#')); if (SHOW && Sim.G.resultInfo.txt.includes(SHOW)) console.log('  ', Sim.G.resultInfo.txt, '|', Sim.G.resultInfo.sub);
      if (cur && Sim.G.play.o && ['run','pass'].includes(Sim.G.play.kind)){ const c=Sim.G.carrier>=0?Sim.G.players[Sim.G.carrier]:null; const x= c? c.x : cur.los; const gain = Sim.G.resultInfo.type==='inc'?0:(x-cur.los)*cur.dir; const k=cur.id; const tk=Sim.G.players.find(p=>p.st==='down'&&p.i!==Sim.G.carrier&&p.team!==Sim.G.off); if(['draw','sweep','runl','runr','screen'].includes(k)) bump('TK '+k+' '+(tk?tk.role:'-')+' '+(c?c.role:'')+' t='+Sim.G.play.t.toFixed(1)); (gains[k]=gains[k]||[]).push(Sim.G.play.intercepted?-99:Math.round(gain)); }
      cur=null; }
    last = Sim.G.phase;
  }
  results.push(Sim.G.score.join('-')+' (minutes '+(steps/120/60).toFixed(1)+')');
}
`, ctx);
console.log(ctx.results.join('\n'));
console.log(Object.entries(ctx.agg).sort((a,b)=>b[1]-a[1]).map(e=>e.join(': ')).join('\n'));
console.log(JSON.stringify(ctx.Sim.G.stats));
for (const [k,v] of Object.entries(ctx.gains)){ const ok=v.filter(x=>x>-99); console.log(k.padEnd(8), 'n',v.length,'avg',(ok.reduce((a,b)=>a+b,0)/ok.length).toFixed(1), v.join(',')); }
