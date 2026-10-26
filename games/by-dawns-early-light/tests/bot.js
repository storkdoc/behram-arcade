// A scripted "thoughtful commander" used by the balance and logic tests. skill 0..1 = chance of getting each judgment right.
function botAct(g, side, R, skill = 0.9, mem = {}) {
  const v = g.viewFor(side), me = v.me, two = v.two;
  const pick = (good, bad) => R() < skill ? good : bad;
  for (const it of me.inbox) {
    if (it.left !== null && it.left > it.ttl * 0.75 && R() < 0.85) continue; // think a little before answering
    let k;
    if (it.kind === 'auth') { const match = it.code.join(' ') === me.card.replace(/\s+/g, ' '); k = pick(match ? 'auth' : 'reject', match ? 'reject' : 'auth'); if (it.type === 'forge_land' && !match) k = 'reject'; }
    else if (it.kind === 'hotline') {
      const P = { spoiler: 'intercept', opening: 'shared', evidence: 'accept', proportional: v.rel.trust >= 40 ? 'airfield' : 'accept', verify: me.wings[it.w] && me.wings[it.w].radio === 'ok' ? 'turn' : 'cant', hardliners: 'recall', aftermath: v.rel.trust >= 40 ? 'ceasefire' : 'absorb', terms: 'agree', final: 'peace', accuse: 'no', p2p: 'accept' };
      k = P[it.type] || it.choices[0].k; if (R() > skill) k = it.choices[Math.floor(R() * it.choices.length)].k;
    } else {
      const P = { claim: 'contest', claimgo: 'countermand', retaliate: 'hold', radar: me.comms >= 40 ? 'verify' : 'ask', fighters: me.escort ? 'escort' : 'dive', patch: 'patch' };
      k = P[it.type] || it.choices[0].k; if (R() > skill) k = it.choices[Math.floor(R() * it.choices.length)].k;
    }
    g.cmd(side, { t: 'answer', id: it.id, k }); return;
  }
  for (const w of me.wings) {
    if (w.cockpit === 'active') { const r = R(); g.cmd(side, { t: 'cockpit', w: w.i, result: r < skill * 0.85 ? 'turned' : r < skill ? 'held' : r < 0.97 ? 'lost' : 'continued' }); return; }
    if (w.state === 'penetrate' && !w.pend) { g.cmd(side, { t: 'wing', w: w.i, cmd: 'recall' }); return; }
    if (v.cease.agreed && ['orbit', 'outbound', 'refuel'].includes(w.state) && !w.pend) { g.cmd(side, { t: 'wing', w: w.i, cmd: 'recall' }); return; }
  }
  if (me.fuel < 75 && !me.refuel && me.tankerOk) { g.cmd(side, { t: 'tanker' }); return; }
  const needSubs = me.subs.some(b => b.order !== 'holdfire' || b.contact > 110);
  if (me.alt === 'high' && needSubs && !(me.refuel && me.refuel.eta < 6) && me.fuel > 40) { g.cmd(side, { t: 'alt', v: 'low' }); mem.lowAt = v.t; return; }
  if (me.alt === 'low' && (!needSubs || v.t - (mem.lowAt || 0) > 8 || (me.refuel && me.refuel.eta < 6))) { g.cmd(side, { t: 'alt', v: 'high' }); return; }
  if (me.jam > 18 && me.cjReady) { g.cmd(side, { t: 'cjam' }); return; }
  if (me.relay === 'HF' && !me.satDown) { g.cmd(side, { t: 'relay', v: 'SATCOM' }); return; }
  if (me.escort === 0 && v.ladder >= 4) { g.cmd(side, { t: 'escort' }); return; }
  if (!v.cease.agreed && me.hlIn === 0 && v.rel.trust >= 55 && !two && R() < 0.3) { g.cmd(side, { t: 'hl', a: 'ceasefire' }); return; }
  if (two && !v.cease.agreed && v.t > 30 && R() < 0.02 && !(mem.cfT > v.t - 20)) { mem.cfT = v.t; g.cmd(side, { t: 'hl', a: 'ceasefire' }); return; }
  if (!v.cease.agreed && me.hlIn === 0 && !two && R() < 0.05 && v.t > 60) { g.cmd(side, { t: 'hl', a: 'intel' }); return; }
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function playOut(Sim, opt, skill, seedBot) {
  const g = new Sim(opt), R = rng(seedBot || opt.seed * 7 + 1), mem = [{}, {}];
  let n = 0; while (!g.over && n++ < 20000) { g.step(0.25); botAct(g, 0, R, skill, mem[0]); if (opt.two) botAct(g, 1, R, skill, mem[1]); }
  return g;
}
module.exports = { botAct, playOut, rng };
